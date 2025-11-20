import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper function for database queries
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

export async function gatherEvidence(productId: string, sectionCode?: string) {
  const ev: any[] = [];
  // Stability P.8 tokens
  const p8 = await q<any>(
    `select tokens_json from stab_exports where product_id=$1 order by created_at desc limit 1`,
    [productId]
  ).catch(() => ({ rows: [] }));
  if (p8.rows[0])
    ev.push({
      type: 'STABILITY',
      id: 'P8_TOKENS',
      href: null,
      summary: 'Latest P.8 tokens',
      payload: p8.rows[0].tokens_json,
    });

  // Quality specs/methods
  const specs = await q<any>(
    `select attribute, unit, limit_low, limit_high, method_id, method_ref from qc_specs where product_id=$1`,
    [productId]
  ).catch(() => ({ rows: [] }));
  if (specs.rows?.length)
    ev.push({
      type: 'QUALITY',
      id: 'SPECS',
      href: null,
      summary: `${specs.rows.length} specs`,
      payload: specs.rows,
    });

  // Process control strategy mapping
  const cs = await q<any>(
    `select control_id, version, mapping_json from proc_control_strategy where product_id=$1 order by updated_at desc limit 1`,
    [productId]
  ).catch(() => ({ rows: [] }));
  if (cs.rows[0])
    ev.push({
      type: 'PROCESS',
      id: cs.rows[0].control_id,
      href: null,
      summary: 'Control strategy mapping',
      payload: cs.rows[0],
    });

  return ev;
}
