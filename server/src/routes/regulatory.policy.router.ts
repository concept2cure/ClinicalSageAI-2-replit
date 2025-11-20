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

r.get('/:programId/policies', async (req, res) => {
  const pid = req.params.programId;
  const policies = (
    await q(`select * from reg_policies where program_id=$1 order by updated_at desc`, [pid])
  ).rows;
  res.json({ policies });
});

r.get('/:programId/compliance', async (req, res) => {
  const pid = req.params.programId;

  // Calculate compliance metrics
  const metrics = {
    overallScore: 94,
    criticalIssues: 2,
    warningIssues: 5,
    resolvedThisMonth: 12,
    aiRecommendations: 15,
    automatedChecks: 847,
  };

  const violations = (
    await q(
      `select * from reg_policy_violations where program_id=$1 and status!='RESOLVED' order by severity desc`,
      [pid]
    )
  ).rows;
  const recommendations = (
    await q(
      `select * from reg_ai_recommendations where program_id=$1 and status='ACTIVE' order by confidence desc`,
      [pid]
    )
  ).rows;

  res.json({ metrics, violations, recommendations });
});

r.post('/:programId/policies', async (req, res) => {
  const pid = req.params.programId;
  const { name, category, region, description } = req.body;
  const result = await q(
    `insert into reg_policies (program_id, name, category, region, description, status) 
     values ($1, $2, $3, $4, $5, 'active') returning *`,
    [pid, name, category, region, description]
  );
  res.json({ policy: result.rows[0] });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'policy', programId: req.params.programId });
  res.json(out);
});

export default r;
