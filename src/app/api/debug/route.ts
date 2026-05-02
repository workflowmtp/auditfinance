import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      POSTGRES_URL_defined: !!process.env.POSTGRES_URL,
      POSTGRES_URL_preview: process.env.POSTGRES_URL 
        ? process.env.POSTGRES_URL.replace(/:([^:@]+)@/, ':****@').substring(0, 50) + '...'
        : 'NOT SET',
      DB_SCHEMA: process.env.DB_SCHEMA,
      PGSSL: process.env.PGSSL,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
    }
  };

  try {
    const start = Date.now();
    const result = await query('SELECT version() as version, current_database() as db, now() as time');
    const duration = Date.now() - start;
    
    diagnostics.connection = {
      success: true,
      duration_ms: duration,
      version: (result.rows[0] as {version: string})?.version?.substring(0, 50) + '...',
      database: (result.rows[0] as {db: string})?.db,
      time: (result.rows[0] as {time: string})?.time,
    };
  } catch (error) {
    diagnostics.connection = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof Error && 'code' in error ? (error as {code: string}).code : undefined,
    };
  }

  return NextResponse.json(diagnostics);
}
