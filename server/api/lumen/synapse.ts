import { Router } from 'express';
import { db } from '../../../lib/database.js';

const router = Router();

router.post('/compare', async (req, res) => {
  const { ids } = req.body || {};

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  try {
    const result = await db.query(
      `
      SELECT
        csr_id,
        drug_name,
        study_id,
        deep_data->'protocol'->'design' as design,
        deep_data->'population'->'enrollment' as enrollment,
        deep_data->'safety'->'adverse_events'->'overall_incidence' as safety_summary,
        extraction_confidence_score
      FROM csr_deep_vault
      WHERE csr_id = ANY($1::int[])
    `,
      [ids]
    );

    res.json({
      cohort_size: result.rows.length,
      studies: result.rows,
    });
  } catch (e) {
    console.error('Synapse comparison failed:', e);
    res.status(500).json({ error: 'Comparison Generation Failed' });
  }
});

export default router;
