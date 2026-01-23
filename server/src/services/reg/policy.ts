import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

// Simple validation function
const validatePolicyStructure = (json: any) => {
  if (!json || typeof json !== 'object') return false;
  if (!json.meta || !json.module3 || !json.ir || !json.q12 || !json.sequences || !json.weights)
    return false;
  return true;
};

function fallback(region: string) {
  const p = path.join(process.cwd(), 'policy', 'reg', `${region.toLowerCase()}.json`);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  return null;
}

export async function loadPolicy(region: string) {
  const r = (region || 'FDA').toUpperCase();
  const db = (
    await q<any>(
      `select * from reg_rulesets where region=$1 and is_active=true order by created_at desc limit 1`,
      [r]
    )
  ).rows[0];
  const json = db?.rules_json || fallback(r) || fallback('fda');
  const ok = validatePolicyStructure(json);
  if (!ok) {
    // If DB is bad, fall back to file; if file is bad, throw
    const fb = fallback(r) || fallback('fda');
    if (!fb || !validatePolicyStructure(fb))
      throw new Error('Invalid policy JSON and no valid fallback');
    return fb;
  }
  return json;
}

export async function validatePolicy(json: any) {
  const ok = validatePolicyStructure(json);
  return { ok, errors: ok ? [] : ['Invalid policy structure'] };
}
