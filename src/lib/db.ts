import pg from 'pg';

let pool: pg.Pool | null = null;
let auditPool: pg.Pool | null = null;
let connectionFailed = false;
let auditConnectionFailed = false;

function createPool(urlEnv: string, label: string): pg.Pool {
  const url = process.env[urlEnv];
  if (!url) {
    throw new Error(`${urlEnv} manquant. Renseignez la variable dans .env.local ou Vercel > Project Settings > Environment Variables.`);
  }

  console.log(`[DB:${label}] Creating new pool...`);
  console.log(`[DB:${label}] URL present:`, !!url);
  console.log(`[DB:${label}] PGSSL:`, process.env.PGSSL || 'not set');

  const newPool = new pg.Pool({
    connectionString: url,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return newPool;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = createPool('POSTGRES_URL', 'main');
    pool.on('error', (err) => {
      console.error('[DB:main] Pool error:', err.message);
      connectionFailed = true;
    });
  }
  return pool;
}

export function getAuditPool(): pg.Pool {
  if (!auditPool) {
    // Si AUDIT_POSTGRES_URL est défini, on l'utilise ; sinon on utilise POSTGRES_URL
    const auditUrl = process.env.AUDIT_POSTGRES_URL || process.env.POSTGRES_URL;
    if (!auditUrl) {
      throw new Error('Ni AUDIT_POSTGRES_URL ni POSTGRES_URL ne sont définis. Renseignez au moins POSTGRES_URL.');
    }

    auditPool = new pg.Pool({
      connectionString: auditUrl,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    auditPool.on('error', (err) => {
      console.error('[DB:audit] Pool error:', err.message);
      auditConnectionFailed = true;
    });

    console.log('[DB:audit] Pool created (same server:', !process.env.AUDIT_POSTGRES_URL, ')');
  }
  return auditPool;
}

export async function query(text: string, params: unknown[] = []) {
  if (connectionFailed) {
    throw new Error('Database connection previously failed');
  }
  return execQuery(getPool(), 'main', text, params);
}

export async function queryAudit(text: string, params: unknown[] = []) {
  if (auditConnectionFailed) {
    throw new Error('Audit database connection previously failed');
  }
  return execQuery(getAuditPool(), 'audit', text, params);
}

async function execQuery(poolInstance: pg.Pool, label: string, text: string, params: unknown[]) {
  let client;
  try {
    console.log(`[DB:${label}] Connecting...`);
    client = await poolInstance.connect();
    console.log(`[DB:${label}] Connected, executing query:`, text.substring(0, 50) + '...');
    const result = await client.query(text, params);
    console.log(`[DB:${label}] Query executed, rows:`, result.rowCount);
    return result;
  } catch (err) {
    console.error(`[DB:${label}] Query error:`, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (client) {
      client.release();
      console.log(`[DB:${label}] Client released`);
    }
  }
}

export function isConnectionFailed() {
  return connectionFailed;
}

export function isAuditConnectionFailed() {
  return auditConnectionFailed;
}

export function resetConnection() {
  connectionFailed = false;
  pool = null;
}

export function resetAuditConnection() {
  auditConnectionFailed = false;
  auditPool = null;
}

export function quoteIdent(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Identifiant SQL invalide: ${identifier}`);
  }
  return `"${identifier}"`;
}
