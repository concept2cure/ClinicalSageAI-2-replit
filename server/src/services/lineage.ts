import crypto from 'crypto';
import { getPool } from '../../db';

const pool = getPool();

// Helper function for database queries
const q = async (text: string, params: any[] = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

export async function lineageLog(opts: {
  batch_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  source: 'UI' | 'AI' | 'INSTRUMENT' | 'ERP' | 'API';
  payload: any;
  parent?: { entity_type: string; entity_id: string };
  actor?: string;
}) {
  const prev = await q(
    `select hash, rev from qc_lineage where batch_id=$1 and entity_type=$2 and entity_id=$3 order by created_at desc limit 1`,
    [opts.batch_id, opts.entity_type, opts.entity_id]
  );
  const prev_hash = prev.rows[0]?.hash || null;
  const rev = (prev.rows[0]?.rev || 0) + 1;
  const body = { ...opts, rev, prev_hash };
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  await q(
    `insert into qc_lineage (batch_id, entity_type, entity_id, action, source, payload_json, parent_entity_type, parent_entity_id, prev_hash, hash, rev, actor)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      opts.batch_id,
      opts.entity_type,
      opts.entity_id,
      opts.action,
      opts.source,
      opts.payload || {},
      opts.parent?.entity_type || null,
      opts.parent?.entity_id || null,
      prev_hash,
      hash,
      rev,
      opts.actor || null,
    ]
  );
  return { hash, rev };
}
