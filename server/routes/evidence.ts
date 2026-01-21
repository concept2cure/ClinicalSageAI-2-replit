import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { toSql } from 'pgvector';
import { pool } from '../lib/db.js';
import { checkAuth } from '../controllers/auth.js';
import auditService from '../services/auditService.js';
import { generateEmbedding } from '../utils/ai_engine.js';

const router = Router();

const evidenceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many evidence searches. Please slow down.' },
});

router.get('/search', checkAuth, evidenceLimiter, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res.json({ results: [] });
    }

    const tokenTenantId = req.user?.organizationId;
    if (!tokenTenantId) {
      return res.status(403).json({ error: 'Tenant context missing from token' });
    }

    const tenantHeader = req.headers['x-organization-id'];
    if (tenantHeader && Number(tenantHeader) !== Number(tokenTenantId)) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    const term = query.trim();
    if (term.length < 3 || term.length > 120) {
      return res.json({ results: [] });
    }

    console.log(`[EVIDENCE] 🧠 Semantic Search for: "${term}"`);

    const vector = await generateEmbedding(term);

    const sql = `
      SELECT filename, ingest_date, deep_data,
             (embedding <=> $1) as distance
      FROM csr_deep_vault
      WHERE deep_data->>'tenant_id' = $2
        AND embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT 3;
    `;

    const searchResult = await pool.query(sql, [toSql(vector), String(tokenTenantId)]);

    const actorId = Number.isFinite(Number(req.user?.appUserId))
      ? Number(req.user?.appUserId)
      : null;

    await auditService.logAction({
      tenantId: Number(tokenTenantId),
      userId: actorId,
      action: auditService.ACTIONS.REGULATORY_ANALYSIS,
      resourceType: auditService.RESOURCE_TYPES.ANALYSIS,
      resourceId: 'evidence-search',
      details: {
        query: term.slice(0, 120),
        result_count: searchResult.rows.length,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null,
      sessionId: req.headers['x-session-id'] || null,
      severity: auditService.SEVERITY.INFO,
    });

    const findings = searchResult.rows.map(row => {
      const distance = Number(row.distance);
      const matchScore = Number.isFinite(distance) ? (1 - distance).toFixed(2) : '0.00';
      return {
        source: row.filename,
        date: new Date(row.ingest_date).toLocaleDateString(),
        match_score: matchScore,
        insight: `Semantic Match found in ${row.deep_data.protocol_id}.`,
      };
    });

    res.json({ results: findings });
  } catch (error) {
    console.error('[EVIDENCE ERROR]', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
