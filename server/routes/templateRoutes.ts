import express from 'express';
import { getPool } from '../db';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// List all templates
// GET /api/cer/templates
router.get('/templates', async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT id, name, updated_at FROM templates ORDER BY name`);
    res.json({ templates: rows });
  } catch (err) {
    console.error('Failed to list templates', err);
    res.status(500).json({ error: 'Could not fetch templates' });
  }
});

// Get a single template JSON
// GET /api/cer/templates/:id
router.get('/templates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT id, name, sections FROM templates WHERE id = $1`, [
      id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    const tpl = rows[0];
    res.json({ template: tpl });
  } catch (err) {
    console.error('Failed to get template', err);
    res.status(500).json({ error: 'Could not fetch template' });
  }
});

// Update a template JSON
// PUT /api/cer/templates/:id
router.put('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const { template } = req.body;
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE templates SET name = $1, sections = $2, updated_at = NOW() WHERE id = $3`,
      [template.name, template.sections, id]
    );
    res.json({ message: 'Template updated' });
  } catch (err) {
    console.error('Failed to update template', err);
    res.status(500).json({ error: 'Could not update template' });
  }
});

export default router;
