import pg from 'pg';

let pool: pg.Pool | null = null;
let connectionFailed = false;

export function getPool(): pg.Pool {
  if (!process.env.POSTGRES_URL) {
    console.error('[DB] POSTGRES_URL manquant');
    throw new Error('POSTGRES_URL manquant. Renseignez la variable dans Vercel > Project Settings > Environment Variables.');
  }

  if (!pool) {
    console.log('[DB] Creating new pool...');
    console.log('[DB] POSTGRES_URL present:', !!process.env.POSTGRES_URL);
    console.log('[DB] PGSSL:', process.env.PGSSL || 'not set');
    
    pool = new pg.Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    pool.on('error', (err) => {
      console.error('[DB] Pool error:', err.message);
      connectionFailed = true;
    });
  }

  return pool;
}

export async function query(text: string, params: unknown[] = []) {
  if (connectionFailed) {
    console.error('[DB] Connection previously failed, rejecting query');
    throw new Error('Database connection previously failed');
  }
  
  const poolInstance = getPool();
  let client;
  try {
    console.log('[DB] Connecting...');
    client = await poolInstance.connect();
    console.log('[DB] Connected, executing query:', text.substring(0, 50) + '...');
    const result = await client.query(text, params);
    console.log('[DB] Query executed, rows:', result.rowCount);
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err instanceof Error ? err.message : String(err));
    connectionFailed = true;
    throw err;
  } finally {
    if (client) {
      client.release();
      console.log('[DB] Client released');
    }
  }
}

export function isConnectionFailed() {
  return connectionFailed;
}

export function resetConnection() {
  connectionFailed = false;
  pool = null;
}

export function quoteIdent(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Identifiant SQL invalide: ${identifier}`);
  }
  return `"${identifier}"`;
}
