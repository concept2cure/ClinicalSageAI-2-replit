import { pool } from '../../../db';

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

/** Gather upstream artifacts for a product to feed M3 sections. */
export async function gatherUpstream(productId: string) {
  const [cs, specs, p8] = await Promise.all([
    q<any>(
      `select control_id, product_id, version, mapping_json from proc_control_strategy where product_id=$1 order by updated_at desc limit 1`,
      [productId]
    ).then(r => r.rows[0] || null),
    q<any>(
      `select attribute, method_id, unit, limit_low, limit_high, justification, method_status from qc_specs where product_id=$1`,
      [productId]
    ).then(r => r.rows),
    q<any>(
      `select tokens_json from stab_exports where product_id=$1 order by created_at desc limit 1`,
      [productId]
    ).then(r => r.rows[0]?.tokens_json || null),
  ]);
  return { controlStrategy: cs, specs, p8Tokens: p8 };
}

/** Compute "links" that should be attached to a given section code. */
export function computeLinks(sectionCode: string, upstream: any) {
  const links: any[] = [];
  if (sectionCode.startsWith('3.2.P.3') && upstream.controlStrategy) {
    links.push({
      kind: 'PROCESS',
      ref_id: upstream.controlStrategy.control_id,
      meta: { version: upstream.controlStrategy.version },
    });
  }
  if (sectionCode.startsWith('3.2.P.5') && Array.isArray(upstream.specs)) {
    for (const s of upstream.specs) {
      links.push({
        kind: 'QUALITY',
        ref_id: `${s.attribute}`,
        meta: { method_id: s.method_id, status: s.method_status },
      });
    }
  }
  if (sectionCode.startsWith('3.2.P.8') && upstream.p8Tokens) {
    links.push({
      kind: 'STABILITY',
      ref_id: 'P8_TOKENS',
      meta: { keys: Object.keys(upstream.p8Tokens).slice(0, 25) },
    });
  }
  return links;
}
