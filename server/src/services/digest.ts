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
import { notifySlack, notifyEmail } from './notify';

export async function dailyQCDigest() {
  const [{ rows: oos }, { rows: pend }, { rows: rel }] = await Promise.all([
    q<any>(`select batch_id, count(*)::int c from qc_alerts where status='OPEN' group by batch_id`),
    q<any>(
      `select batch_id, count(*)::int c from qc_results where status='PENDING' group by batch_id`
    ),
    q<any>(
      `select batch_id, lot_no, release_decision, release_risk from qc_batches where status='RELEASED' and released_at >= now() - interval '1 day'`
    ),
  ]);

  const oosMap: any = Object.fromEntries(oos.map((r: any) => [r.batch_id, r.c]));
  const pendMap: any = Object.fromEntries(pend.map((r: any) => [r.batch_id, r.c]));

  const { rows: batches } = await q<any>(
    `select batch_id, lot_no from qc_batches order by created_at desc`
  );
  const lines = batches
    .slice(0, 50)
    .map(
      (b: any) =>
        `• ${b.lot_no} — OOS:${oosMap[b.batch_id] || 0} PENDING:${pendMap[b.batch_id] || 0}`
    )
    .join('\n');

  const msg = `QC Daily Digest\n\n${lines}\n\nReleased last 24h: ${(rel || []).length}`;
  await notifySlack(msg);
  await notifyEmail('QC Daily Digest', msg);
  return { ok: true, lines: batches.length };
}
