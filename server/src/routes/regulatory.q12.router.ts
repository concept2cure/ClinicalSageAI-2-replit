import { Router } from 'express';
import { getPool } from '../../db';
import { aiChangeClassify, aiNextActions } from '../services/ai/regulatory';

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

r.get('/:programId/changes', async (req, res) => {
  const pid = req.params.programId;
  const changes = (
    await q(`select * from reg_changes where program_id=$1 order by created_at desc`, [pid])
  ).rows;
  res.json({ changes });
});

r.post('/:programId/changes', async (req, res) => {
  const pid = req.params.programId;
  const { title, description, impact } = req.body;
  const ai = await aiChangeClassify({ title, description, impact });
  const result = await q(
    `insert into reg_changes (program_id, title, description, impact, category, pathway, rationale, status) 
     values ($1, $2, $3, $4, $5, $6, $7, 'DRAFT') returning *`,
    [pid, title, description, impact, ai.category, ai.pathway, ai.rationale]
  );
  res.json({ change: result.rows[0], ai });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'q12', programId: req.params.programId });
  res.json(out);
});

export default r;
