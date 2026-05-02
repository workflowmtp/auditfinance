import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL manquant. Renseignez la variable dans Vercel > Project Settings > Environment Variables.');
  }

  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

export async function query(text: string, params: unknown[] = []) {
  const poolInstance = getPool();
  const client = await poolInstance.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export function quoteIdent(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Identifiant SQL invalide: ${identifier}`);
  }
  return `"${identifier}"`;
}
