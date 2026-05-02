import { NextRequest, NextResponse } from 'next/server';
import { DB_SCHEMA, MODULE_BY_ID } from '@/lib/modules';
import { query, quoteIdent } from '@/lib/db';
import { analyzeRecord } from '@/lib/audit';

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
    
    console.log(`[Records API] Module: ${moduleId}, Table: ${config.table}, Schema: ${schema}`);

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

    const params: unknown[] = [];
    const where: string[] = [];

    if (q && searchCols.length) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      where.push(`(${searchCols.map((c) => `${quoteIdent(c)}::text ilike ${p}`).join(' or ')})`);
    }

    if (startDate && dateCol) {
      params.push(startDate);
      where.push(`${quoteIdent(dateCol)}::date >= $${params.length}::date`);
    }

    if (endDate && dateCol) {
      params.push(endDate);
      where.push(`${quoteIdent(dateCol)}::date <= $${params.length}::date`);
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
        where.push(`${quoteIdent(col)}::text ${op} $${params.length}`);
      }
    }

    // Count total
    const countSql = `select count(*)::text as total from ${quoteIdent(schema)}.${quoteIdent(config.table as string)} ${where.length ? `where ${where.join(' and ')}` : ''}`;
    const countRes = await query(countSql, params);
    const total = Number((countRes.rows[0] as {total: string})?.total || 0);

    // Main query with pagination
    const orderCol = sortBy && cols.has(sortBy) ? sortBy : (dateCol || finalCols[0]);
    params.push(limit);
    params.push(offset);
    const sql = `select ${finalCols.map((c: string) => quoteIdent(c)).join(', ')} from ${quoteIdent(schema)}.${quoteIdent(config.table as string)} ${where.length ? `where ${where.join(' and ')}` : ''} ${orderCol ? `order by ${quoteIdent(orderCol)} ${sortDir} nulls last` : ''} limit $${params.length - 1} offset $${params.length}`;

    console.log('SQL Query:', sql);
    console.log('Params:', params);

    const res = await query(sql, params);
    const rows = (res.rows as Record<string, unknown>[]).map((row) => ({ ...row, _audit: analyzeRecord(row) }));
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
