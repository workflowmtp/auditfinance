import { NextRequest, NextResponse } from 'next/server';
import { analyzeRecord } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const results = rows.map((row: Record<string, unknown>) => analyzeRecord(row));
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur audit' }, { status: 500 });
  }
}
