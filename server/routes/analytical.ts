import { Router } from 'express';
import { db } from '../../lib/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/analytical-methods', async (req, res) => {
  const tenantId = req.user?.organizationId || Number(req.headers['x-organization-id'] || req.headers['x-tenant-id']);
  if (!tenantId || Number.isNaN(tenantId)) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }

  try {
    const result = await db.query(
      `
      SELECT
        am.method_code,
        am.title,
        am.matrix,
        am.technique,
        am.status,
        am.validation_date,
        am.updated_at,
        u.name as owner_name
      FROM analytical_methods am
      LEFT JOIN users u ON u.id = am.developed_by
      WHERE am.organization_id = $1
      ORDER BY am.updated_at DESC NULLS LAST
      `,
      [tenantId]
    );

    const data = result.rows.map((row) => ({
      id: row.method_code,
      name: row.title,
      category: row.matrix,
      technique: row.technique,
      status: row.status,
      version: row.validation_date ? new Date(row.validation_date).getFullYear() : null,
      lastUpdated: row.updated_at ? new Date(row.updated_at).toISOString().split('T')[0] : null,
      owner: row.owner_name || null,
    }));

    return res.json({ data });
  } catch (error) {
    console.error('[Analytical] Failed to fetch methods:', error);
    return res.status(500).json({ error: 'Failed to load analytical methods' });
  }
});

router.get('/comparability-studies', async (req, res) => {
  const tenantId = req.user?.organizationId || Number(req.headers['x-organization-id'] || req.headers['x-tenant-id']);
  if (!tenantId || Number.isNaN(tenantId)) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }

  try {
    const result = await db.query(
      `
      SELECT
        cs.id,
        cs.title,
        cs.product,
        cs.change_type,
        cs.status,
        cs.start_date,
        cs.end_date,
        cs.methods,
        cs.outcome,
        u.name as owner_name
      FROM comparability_studies cs
      LEFT JOIN users u ON u.id = cs.owner_id
      WHERE cs.organization_id = $1
      ORDER BY cs.updated_at DESC NULLS LAST
      `,
      [tenantId]
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      product: row.product,
      type: row.change_type,
      status: row.status,
      startDate: row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : null,
      endDate: row.end_date ? new Date(row.end_date).toISOString().split('T')[0] : null,
      methods: row.methods || [],
      outcome: row.outcome,
      owner: row.owner_name || null,
    }));

    return res.json({ data });
  } catch (error) {
    console.error('[Comparability] Failed to fetch studies:', error);
    return res.status(500).json({ error: 'Failed to load comparability studies' });
  }
});

export default router;
