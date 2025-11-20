import { Router } from 'express';
import { getPool } from '../../db/pool';
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

r.get('/list', async (_req, res) => {
  const progs = (
    await q(`
    select p.*, (select count(*) from reg_submissions s where s.product_id=p.program_id) as sub_count
    from reg_programs p order by created_at desc
  `)
  ).rows;
  res.json({ programs: progs });
});

r.post('/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'portfolio' });
  res.json(out);
});

export default r;
