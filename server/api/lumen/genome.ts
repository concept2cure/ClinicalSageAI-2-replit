import { Router } from 'express';
import { db } from '../../../lib/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const limitParam = Number(req.query.limit) || 20;
    const limit = Math.min(Math.max(limitParam, 1), 100);

    const result = await db.query(
      `
      SELECT
        csr_id,
        drug_name,
        study_id,
        regulatory_agency,
        extraction_confidence_score,
        created_at
      FROM csr_deep_vault
      ORDER BY created_at DESC
      LIMIT $1
    `,
      [limit]
    );

    res.json(result.rows || []);
  } catch (e: any) {
    console.error('Genome list retrieval failed:', e);
    res.status(500).json({ error: 'Genome Retrieval Failed' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT
        csr_id,
        drug_name,
        study_id,
        regulatory_agency,
        deep_data,
        extraction_confidence_score,
        created_at
      FROM csr_deep_vault
      WHERE csr_id = $1
    `,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'CSR Not Found' });
    res.json(result.rows[0]);
  } catch (e: any) {
    console.error('Genome retrieval failed:', e);
    res.status(500).json({ error: 'Genome Retrieval Failed' });
  }
});

export default router;
