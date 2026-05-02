import { NextRequest, NextResponse } from 'next/server';
import { DB_SCHEMA, MODULES } from '@/lib/modules';
import { query, quoteIdent } from '@/lib/db';

async function hasTable(table: string, schema: string = DB_SCHEMA) {
  const res = await query(
    `select exists(select 1 from information_schema.tables where table_schema=$1 and table_name=$2) as exists`,
    [schema, table]
  );
  return Boolean((res.rows[0] as {exists: boolean})?.exists);
}

async function firstExistingColumn(table: string, candidates: string[], schema: string = DB_SCHEMA) {
  const res = await query(
    `select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and column_name = any($3::text[]) order by ordinal_position limit 1`,
    [schema, table, candidates]
  );
  return (res.rows[0] as {column_name: string})?.column_name;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate')?.trim();
    const endDate = url.searchParams.get('endDate')?.trim();

    console.log(`[Dashboard API] Fetching stats for schemas: analytics, raw`);

    // Stats pour les deux schémas
    const schemaStats = await query(
      `select count(distinct table_name)::text as tables, count(*)::text as columns 
       from information_schema.columns 
       where table_schema IN ('analytics', 'raw')`,
      []
    );

    const moduleStats = [];
    for (const m of MODULES.filter((x) => x.table)) {
      const schema = m.schema || DB_SCHEMA;
      console.log(`[Dashboard API] Checking ${schema}.${m.table}`);
      
      if (!m.table || !(await hasTable(m.table, schema))) {
        console.warn(`[Dashboard API] Table ${schema}.${m.table} not found`);
        continue;
      }
      
      const dateCol = await firstExistingColumn(m.table, m.dateColumns, schema);
      const params: unknown[] = [];
      const where: string[] = [];
      if (startDate && dateCol) {
        params.push(startDate);
        where.push(`${quoteIdent(dateCol)}::date >= $${params.length}::date`);
      }
      if (endDate && dateCol) {
        params.push(endDate);
        where.push(`${quoteIdent(dateCol)}::date <= $${params.length}::date`);
      }
      const res = await query(
        `select count(*)::text as total from ${quoteIdent(schema)}.${quoteIdent(m.table)} ${where.length ? `where ${where.join(' and ')}` : ''}`,
        params
      );
      moduleStats.push({ id: m.id, title: m.title, table: m.table, schema, total: Number((res.rows[0] as {total: string})?.total || 0) });
    }

    const totalRows = moduleStats.reduce((sum, m) => sum + m.total, 0);
    const schemasUsed = [...new Set(moduleStats.map(m => m.schema))];
    
    return NextResponse.json({
      schemas: schemasUsed,
      schema: DB_SCHEMA,
      tables: Number((schemaStats.rows[0] as {tables: string})?.tables || 0),
      columns: Number((schemaStats.rows[0] as {columns: string})?.columns || 0),
      totalRows,
      moduleStats,
      period: { startDate, endDate }
    });
  } catch (error) {
    console.error('Dashboard API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur dashboard';
    
    // Return a graceful fallback response
    return NextResponse.json({ 
      error: errorMessage,
      schemas: [],
      tables: 0,
      columns: 0,
      totalRows: 0,
      moduleStats: [],
      connectionFailed: true,
      message: 'Connexion à la base de données impossible. Vérifiez que le serveur PostgreSQL est accessible.'
    }, { status: 200 }); // Return 200 with error info for graceful UI handling
  }
}
