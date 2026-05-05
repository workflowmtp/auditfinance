import { NextRequest, NextResponse } from 'next/server';
import { DB_SCHEMA, MODULE_BY_ID } from '@/lib/modules';
import { query } from '@/lib/db';
import { getRecordsWithAnomalies, buildAuditFromDbAnomalies } from '@/lib/records-with-anomalies';

async function existingColumns(table: string, schema: string = DB_SCHEMA) {
  const res = await query(
    `select column_name from information_schema.columns where table_schema=$1 and table_name=$2`,
    [schema, table]
  );
  return new Set((res.rows as {column_name: string}[]).map((r) => r.column_name));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const moduleId = url.searchParams.get('module') || 'entries';
  const config = MODULE_BY_ID[moduleId];
  const schema = config?.schema || DB_SCHEMA;

  if (!config?.table) return NextResponse.json({ error: 'Module non connecté à une table.' }, { status: 400 });

  // Pagination parameters
  const limit = Math.min(Number(url.searchParams.get('limit') || process.env.DEFAULT_LIMIT || 50), 1000);
  const page = Math.max(Number(url.searchParams.get('page') || 1), 1);
  const offset = (page - 1) * limit;

  try {
    const q = url.searchParams.get('q')?.trim();
    const startDate = url.searchParams.get('startDate')?.trim();
    const endDate = url.searchParams.get('endDate')?.trim();
    const sortBy = url.searchParams.get('sortBy')?.trim();
    const sortDir = url.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
    const statusFilter = url.searchParams.get('statusFilter')?.trim() || 'all';
    const riskFilter = url.searchParams.get('riskFilter')?.trim() || 'all';

    console.log(`[Records API] Module: ${moduleId}, Table: ${config.table}, Schema: ${schema}`);
    console.log(`[Records API] Query params: q=${q}, startDate=${startDate}, endDate=${endDate}, sortBy=${sortBy}, sortDir=${sortDir}, statusFilter=${statusFilter}, riskFilter=${riskFilter}`);

    const cols = await existingColumns(config.table, schema);

    // Si aucune colonne n'est trouvée, la table n'existe probablement pas
    if (cols.size === 0) {
      console.warn(`[Records API] Table ${schema}.${config.table} non trouvée ou vide`);
      return NextResponse.json({
        module: moduleId,
        table: config.table,
        schema,
        columns: [],
        rows: [],
        pagination: { page, limit, total: 0, totalPages: 1, offset },
        warning: `Table ${schema}.${config.table} non trouvée dans la base de données`
      });
    }
    const selected = config.displayColumns.filter((c) => cols.has(c));
    const fallbackCols = Array.from(cols).slice(0, 12);
    const finalCols = selected.length ? selected : fallbackCols;
    const dateCol = config.dateColumns.find((c) => cols.has(c));
    const searchCols = config.searchColumns.filter((c) => cols.has(c));

    const where: string[] = [];
    const params: unknown[] = [];

    if (q && searchCols.length) {
      params.push(`%${q}%`);
      where.push(`(${searchCols.map((c) => `s."${c}"::text ilike $${params.length}`).join(' or ')})`);
    }

    if (startDate && dateCol) {
      params.push(startDate);
      where.push(`s."${dateCol}"::date >= $${params.length}::date`);
    }

    if (endDate && dateCol) {
      params.push(endDate);
      where.push(`s."${dateCol}"::date <= $${params.length}::date`);
    }

    // Column filters
    const colFilters: Record<string, string> = {};
    for (const [key, val] of url.searchParams.entries()) {
      if (key.startsWith('filter_') && val) {
        const col = key.replace('filter_', '');
        colFilters[col] = val.trim();
      }
    }
    for (const [col, val] of Object.entries(colFilters)) {
      if (cols.has(col)) {
        params.push(val.includes('%') || val.includes('*') ? val.replace(/\*/g, '%') : val);
        const op = val.includes('%') || val.includes('*') ? 'ilike' : '=';
        where.push(`s."${col}"::text ${op} $${params.length}`);
      }
    }

    const orderCol = sortBy && cols.has(sortBy) ? sortBy : (dateCol || finalCols[0]);

    console.log(`[Records API] where clauses:`, where);
    console.log(`[Records API] params values:`, params);

    // Récupération via LEFT JOIN LATERAL sur audit_management.anomalies
    const { rows: rawRows, total } = await getRecordsWithAnomalies({
      schema,
      table: config.table,
      moduleId,
      columns: finalCols,
      where: where.length ? where : undefined,
      params: params.length ? params : undefined,
      orderCol,
      sortDir,
      limit,
      offset,
      statusFilter,
      riskFilter
    });

    // Mapper les anomalies DB vers le format _audit attendu par l'UI
    const rows = rawRows.map((row) => ({
      ...row,
      _audit: buildAuditFromDbAnomalies(row)
    }));

    return NextResponse.json({
      module: moduleId,
      table: config.table,
      schema,
      columns: finalCols,
      rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), offset }
    });
  } catch (error) {
    console.error('Records API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur records';

    return NextResponse.json({
      error: errorMessage,
      module: moduleId,
      table: config.table,
      schema: config.schema || DB_SCHEMA,
      columns: [],
      rows: [],
      pagination: { page, limit, total: 0, totalPages: 1, offset },
      connectionFailed: true,
      message: 'Connexion à la base de données impossible. Vérifiez que le serveur PostgreSQL est accessible.'
    }, { status: 200 });
  }
}
