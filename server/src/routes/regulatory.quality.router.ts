import { Router } from 'express';
import { getPool } from '../../db';
import { aiNextActions } from '../services/ai/regulatory';

// Helper function for database queries
const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};
const r = Router();

r.get('/:programId/summary', async (req, res) => {
  const pid = req.params.programId;
  // If QC tables exist, join them; fallback to zeros
  let oos = 0,
    oot = 0,
    capa_open = 0,
    ppq = 'UNKNOWN';
  try {
    const x = await q(`select count(*) from quality_oos`);
    oos = Number(x.rows[0]?.count || 0);
  } catch {}
  try {
    const y = await q(`select count(*) from stab_results where status='OOT'`);
    oot = Number(y.rows[0]?.count || 0);
  } catch {}
  try {
    const z = await q(`select count(*) from capa where status!='CLOSED'`);
    capa_open = Number(z.rows[0]?.count || 0);
  } catch {}
  res.json({ program_id: pid, oos, oot, capa_open, ppq });
});

r.post('/:programId/commitment', async (req, res) => {
  const pid = req.params.programId;
  const text = req.body?.text || 'Regulatory commitment';
  await q(
    `insert into reg_tasks (program_id,title,kind,status) values ($1,$2,'COMMITMENT','OPEN')`,
    [pid, text]
  );
  res.json({ ok: true });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'quality', programId: req.params.programId });
  res.json(out);
});

export default r;
