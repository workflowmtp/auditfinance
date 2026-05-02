import { NextResponse } from 'next/server';
import { DB_SCHEMA } from '@/lib/modules';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const sql = `
      select table_name, column_name, ordinal_position as pos, data_type as type, is_nullable as nullable
      from information_schema.columns
      where table_schema = $1
      order by table_name, ordinal_position
    `;
    const res = await query(sql, [DB_SCHEMA]);
    return NextResponse.json({ schema: DB_SCHEMA, columns: res.rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur schéma' }, { status: 500 });
  }
}
