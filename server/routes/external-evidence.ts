import { Router } from 'express';
import { routeEvidenceRequest } from '../services/research-intelligence';
import { firecrawlError } from '../integrations/firecrawl/errors';
import { authMiddleware } from '../auth';
import { getFirecrawlQuotaStatus } from '../integrations/firecrawl/usage';
import { getPool } from '../db';
import { evaluateFirecrawlPolicy } from '../integrations/firecrawl/policy';
import { sourceSelectionDecision } from '../services/research-intelligence/sourceSelectionPolicy';
import { buildRegulatoryEvidenceBriefPackage } from '../services/research-intelligence/buildRegulatoryEvidenceBrief';

const router = Router();
router.use(authMiddleware);

router.get('/uat-scenarios', async (_req, res) => {
  return res.json({
    success: true,
    data: [
      {
        id: 'literature-first-biomarker',
        prompt: 'Find recent biomarker clinical evidence for NSCLC',
        expectedRoute: 'literature_first',
      },
      {
        id: 'device-diagnostics',
        prompt: 'Collect predicate-adjacent public evidence for a 510(k) glucose monitor',
        expectedRoute: 'device_diagnostics',
      },
      {
        id: 'commercial-claims',
        prompt: 'Substantiate competitor brochure claims for diagnostic sensitivity',
        expectedRoute: 'commercial_claims',
      },
      {
        id: 'no-external-needed',
        prompt: 'Summarize our previous answer in 5 bullets',
        expectedRoute: 'no_external_needed',
      },
    ],
  });
});

router.post('/route', async (req, res) => {
  const { message, useFirecrawl } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MESSAGE' } });
  }

  try {
    const result = await routeEvidenceRequest(message, Boolean(useFirecrawl));
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(502).json(firecrawlError('provider_error', error?.message));
  }
});

router.post('/validate', async (req, res) => {
  const { message, useFirecrawl, sampleUrl } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MESSAGE' } });
  }

  const tenantId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId || 0);
  if (!tenantId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TENANT' } });
  }

  const validation: any = {
    tenantId,
    useFirecrawlRequested: Boolean(useFirecrawl),
    routeDecision: sourceSelectionDecision(message),
    blockers: [] as string[],
    warnings: [] as string[],
  };

  if (useFirecrawl) {
    const quota = await getFirecrawlQuotaStatus(tenantId);
    validation.quota = quota;
    if (!quota.allowed) validation.blockers.push('quota_exhausted');

    const pool = getPool();
    const settingsRes = await pool.query(
      `SELECT firecrawl_enabled, firecrawl_domain_allowlist_json, firecrawl_category_policy_json
         FROM external_tool_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    const settings = settingsRes.rows[0] || {};
    if (settings.firecrawl_enabled === false) validation.blockers.push('admin_disabled');
    if (sampleUrl) {
      const policy = evaluateFirecrawlPolicy({
        enabled: settings.firecrawl_enabled !== false,
        requestedUrl: sampleUrl,
        domainAllowlist: settings.firecrawl_domain_allowlist_json || [],
        categoryPolicy: settings.firecrawl_category_policy_json || {},
      });
      validation.sampleUrlPolicy = policy;
      if (!policy.allowed) validation.blockers.push('policy_blocked');
    } else {
      validation.warnings.push('No sampleUrl provided; domain policy was not evaluated.');
    }
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
       VALUES ($1,$2,'external_evidence_validate',$3,NOW())`,
      [
        tenantId,
        Number((req as any).userId || 0) || null,
        JSON.stringify({ useFirecrawl: Boolean(useFirecrawl), sampleUrl: sampleUrl || null, validation }),
      ]
    );
  } catch {
    // non-blocking
  }

  return res.json({ success: true, data: validation });
});

router.post('/draft-brief', async (req, res) => {
  const { evidenceDocumentIds } = req.body || {};
  if (!Array.isArray(evidenceDocumentIds) || evidenceDocumentIds.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_EVIDENCE_IDS' } });
  }

  const tenantId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId || 0);
  if (!tenantId) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TENANT' } });
  }
  const pool = getPool();
  const docsRes = await pool.query(
    `SELECT id, title, url, metadata_json, raw_markdown
       FROM external_evidence_documents
      WHERE tenant_id = $1
        AND id = ANY($2::bigint[])
      ORDER BY created_at DESC`,
    [tenantId, evidenceDocumentIds]
  );

  if (!docsRes.rows.length) {
    return res.status(404).json({ success: false, error: { code: 'EVIDENCE_NOT_FOUND' } });
  }
  const briefPackage = buildRegulatoryEvidenceBriefPackage(docsRes.rows as any);
  await pool.query(
    `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
     VALUES ($1,$2,'external_evidence_draft_brief',$3,NOW())`,
    [
      tenantId,
      Number((req as any).userId || 0) || null,
      JSON.stringify({ evidenceDocumentIds, generatedCount: docsRes.rows.length }),
    ]
  );

  return res.json({
    success: true,
    data: {
      brief: briefPackage.markdown,
      summary: briefPackage.summary,
      sources: briefPackage.sources,
      documentCount: briefPackage.summary.documentCount,
      evidenceDocumentIds: briefPackage.sources.map(r => r.id),
    },
  });
});

export default router;
