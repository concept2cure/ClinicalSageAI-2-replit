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

r.get('/:programId/workflows', async (req, res) => {
  const pid = req.params.programId;

  // CMC workflow templates
  const workflows = [
    {
      id: 'ind-cmc',
      name: 'IND CMC Package',
      description: 'Complete Chemistry, Manufacturing, and Controls package for IND submission',
      estimatedTime: '4-6 weeks',
      priority: 'high',
      tasks: 6,
      category: 'submission',
      steps: [
        'Drug Substance Characterization',
        'Manufacturing Process',
        'Container Closure',
        'Stability Protocol',
        'Analytical Methods',
        'Quality Specifications',
      ],
    },
    {
      id: 'nda-cmc',
      name: 'NDA/BLA CMC Module 3',
      description: 'Comprehensive Module 3 Quality section for NDA/BLA submission',
      estimatedTime: '12-16 weeks',
      priority: 'critical',
      tasks: 24,
      category: 'submission',
      steps: [
        '3.2.S Drug Substance',
        '3.2.P Drug Product',
        '3.2.A Appendices',
        'Regional Requirements',
      ],
    },
    {
      id: 'annual-product-review',
      name: 'Annual Product Review (APR)',
      description: 'EU Annual Product Review for marketing authorization maintenance',
      estimatedTime: '6-8 weeks',
      priority: 'medium',
      tasks: 12,
      category: 'maintenance',
      steps: ['Data Collection', 'Analysis', 'Report Generation', 'Review & Approval'],
    },
  ];

  res.json({ workflows });
});

r.post('/:programId/workflows/:workflowId/start', async (req, res) => {
  const pid = req.params.programId;
  const workflowId = req.params.workflowId;

  // Start workflow and create tasks
  const result = await q(
    `insert into reg_workflow_instances (program_id, workflow_id, status, started_at) 
     values ($1, $2, 'ACTIVE', now()) returning *`,
    [pid, workflowId]
  );

  res.json({ workflow: result.rows[0] });
});

r.get('/:programId/checklists', async (req, res) => {
  const pid = req.params.programId;
  const checklists = (
    await q(`select * from reg_checklists where program_id=$1 order by created_at desc`, [pid])
  ).rows;
  res.json({ checklists });
});

r.post('/:programId/checklists', async (req, res) => {
  const pid = req.params.programId;
  const { name, category, items } = req.body;
  const result = await q(
    `insert into reg_checklists (program_id, name, category, items, status) 
     values ($1, $2, $3, $4, 'ACTIVE') returning *`,
    [pid, name, category, JSON.stringify(items)]
  );
  res.json({ checklist: result.rows[0] });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'playbook', programId: req.params.programId });
  res.json(out);
});

export default r;
