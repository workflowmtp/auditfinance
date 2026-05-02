import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const res = await query<{ now: string }>('select now() as now');
    return NextResponse.json({ ok: true, database: 'connected', now: res.rows[0]?.now });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 500 });
  }
}
