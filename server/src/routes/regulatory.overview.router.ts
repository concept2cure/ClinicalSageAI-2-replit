import { Router } from 'express';
import { getPool } from '../../db/pool';
import { aiRiskSummary, aiNextActions } from '../services/ai/regulatory';

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
  const prog = (await q(`select * from reg_programs where program_id=$1`, [pid])).rows[0];
  const submissions = (
    await q(`select * from reg_submissions where product_id=$1 order by created_at desc`, [pid])
  ).rows;

  // Get tasks linked to submissions for this program
  const subIds = submissions.map(s => s.sub_id);
  let tasks = [];
  if (subIds.length > 0) {
    const placeholders = subIds.map((_, i) => `$${i + 1}`).join(', ');
    tasks = (
      await q(
        `select * from reg_tasks where entity_id IN (${placeholders}) and status!='DONE' order by due_date nulls last`,
        subIds
      )
    ).rows;
  }

  const ai = await aiRiskSummary({ program: prog, submissions, tasks });
  res.json({ program: prog, submissions, tasks, ai });
});

r.get('/:programId/forecast', async (req, res) => {
  const pid = req.params.programId;
  const subs = (
    await q(`select * from reg_submissions where product_id=$1 order by created_at`, [pid])
  ).rows;

  // Get task count for forecast calculation
  const subIds = subs.map(s => s.sub_id);
  let openTasks = 0;
  if (subIds.length > 0) {
    const placeholders = subIds.map((_, i) => `$${i + 1}`).join(', ');
    const tasks = (await q(`select * from reg_tasks where entity_id IN (${placeholders})`, subIds))
      .rows;
    openTasks = tasks.filter((t: any) => t.status !== 'DONE').length;
  }

  const days = openTasks > 5 ? 90 : 45;
  const eta = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  res.json({ eta, basis: { openTasks, subs: subs.length } });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const pid = req.params.programId;

  // Get submissions for this program, then tasks
  const submissions = (await q(`select * from reg_submissions where product_id=$1`, [pid])).rows;
  const subIds = submissions.map(s => s.sub_id);
  let tasks = [];
  if (subIds.length > 0) {
    const placeholders = subIds.map((_, i) => `$${i + 1}`).join(', ');
    tasks = (
      await q(
        `select * from reg_tasks where entity_id IN (${placeholders}) and status!='DONE'`,
        subIds
      )
    ).rows;
  }

  const out = await aiNextActions({ programId: pid, open_tasks: tasks.length });
  res.json(out);
});

export default r;
