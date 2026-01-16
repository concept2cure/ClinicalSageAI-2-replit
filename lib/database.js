import pg from 'pg';

const { Pool } = pg;

const HAS_DATABASE_URL = Boolean(process.env.DATABASE_URL);

let pool = null;
let poolHealthy = false;

const createPool = () => {
  if (!HAS_DATABASE_URL) return null;
  const nextPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
  });

  nextPool.on('error', err => {
    poolHealthy = false;
    console.error('Database pool error:', err);
    // Attempt to recreate the pool on next query
    try {
      nextPool.end().catch(() => {});
    } catch (_) {}
  });

  return nextPool;
};

pool = createPool();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isTransientError = err => {
  const transientCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    '53300', // too_many_connections
  ]);
  return transientCodes.has(err?.code) || transientCodes.has(err?.cause?.code);
};

const ensurePool = async () => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

export const db = {
  async query(text, params) {
    if (!HAS_DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const activePool = await ensurePool();
        if (!activePool) {
          throw new Error('DATABASE_URL not configured');
        }
        const result = await activePool.query(text, params);
        poolHealthy = true;
        return result;
      } catch (err) {
        lastError = err;
        poolHealthy = false;
        if (!isTransientError(err) || attempt === maxAttempts) {
          throw err;
        }
        const delay = 200 * Math.pow(2, attempt - 1);
        await sleep(delay);
        pool = createPool();
      }
    }

    throw lastError;
  },
  get healthy() {
    return poolHealthy;
  },
};

export default db;
