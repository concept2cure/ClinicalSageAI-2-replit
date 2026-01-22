import { Router } from 'express';
import pool from '../lib/db.js';
import { checkAuth } from '../controllers/auth.js';

const router = Router();

router.get('/live', checkAuth, async (req, res) => {
  try {
    const tokenTenantId = req.user?.organizationId;
    if (!tokenTenantId) {
      return res.status(403).json({ error: 'Tenant context missing from token' });
    }

    const tenantIdHeader = req.headers['x-organization-id'];
    if (tenantIdHeader && Number(tenantIdHeader) !== Number(tokenTenantId)) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    const tenantId = String(tokenTenantId);

    console.log('[ANALYTICS] 📊 Querying Deep Genome Vault...');

    const safetyQuery = `
      SELECT 
        COALESCE(deep_data->>'protocol_id', 'Unknown') as name,
        COALESCE((deep_data->>'adverse_events')::int, 0) as adverse_events,
        COALESCE((deep_data->>'serious_ae')::int, 0) as serious_ae
      FROM csr_deep_vault
      WHERE deep_data IS NOT NULL
        AND deep_data->>'tenant_id' = $1
      ORDER BY ingest_date DESC
      LIMIT 10;
    `;

    const kpiQuery = `
      SELECT 
        COUNT(*) as total_docs,
        COALESCE(SUM((deep_data->>'enrollment_current')::int), 0) as total_enrollment,
        COALESCE(SUM((deep_data->>'adverse_events')::int), 0) as total_adverse_events,
        COALESCE(SUM((deep_data->>'serious_ae')::int), 0) as total_serious_events,
        COUNT(*) FILTER (WHERE ingest_date >= NOW() - INTERVAL '7 days') as docs_last_7d
      FROM csr_deep_vault
      WHERE deep_data->>'tenant_id' = $1;
    `;

    const safetyResult = await pool.query(safetyQuery, [tenantId]);
    const kpiResult = await pool.query(kpiQuery, [tenantId]);

    const totalDocs = Number(kpiResult.rows[0]?.total_docs || 0);
    const totalEnrollment = Number(kpiResult.rows[0]?.total_enrollment || 0);
    const totalAdverseEvents = Number(kpiResult.rows[0]?.total_adverse_events || 0);
    const totalSeriousEvents = Number(kpiResult.rows[0]?.total_serious_events || 0);
    const docsLast7d = Number(kpiResult.rows[0]?.docs_last_7d || 0);
    const ingestVelocity = Number((docsLast7d / 7).toFixed(2));

    res.json({
      safetyData: safetyResult.rows,
      kpi: {
        totalDocs,
        totalEnrollment,
        safetySignals: totalAdverseEvents,
        seriousSignals: totalSeriousEvents,
        ingestVelocity,
      },
      enrollmentTrend: [],
    });
  } catch (error) {
    console.error('[ANALYTICS ERROR]', error);
    res.status(500).json({ error: 'Failed to retrieve live analytics' });
  }
});

export default router;
