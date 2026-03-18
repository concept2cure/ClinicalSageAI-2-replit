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

r.get('/:programId/packages', async (req, res) => {
  const pid = req.params.programId;
  const packages = (
    await q(`select * from reg_ectd_packages where program_id=$1 order by created_at desc`, [pid])
  ).rows;
  res.json({ packages });
});

r.post('/:programId/packages', async (req, res) => {
  const pid = req.params.programId;
  const { name, version, sequence } = req.body;
  const result = await q(
    `insert into reg_ectd_packages (program_id, name, version, sequence, status) 
     values ($1, $2, $3, $4, 'DRAFT') returning *`,
    [pid, name, version, sequence]
  );
  res.json({ package: result.rows[0] });
});

r.post('/:programId/packages/:pkgId/validate', async (req, res) => {
  const pid = req.params.programId;
  const pkgId = req.params.pkgId;

  // Simulated validation - would integrate with real eCTD validator
  const validationResults = {
    status: 'PASSED',
    errors: [],
    warnings: ['Minor formatting issue in Module 2.3'],
    fileCount: 143,
    totalSize: '2.4 GB',
  };

  await q(
    `update reg_ectd_packages set validation_status=$1, validation_results=$2 where id=$3 and program_id=$4`,
    [validationResults.status, JSON.stringify(validationResults), pkgId, pid]
  );

  res.json({ validation: validationResults });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'ectd', programId: req.params.programId });
  res.json(out);
});

export default r;
