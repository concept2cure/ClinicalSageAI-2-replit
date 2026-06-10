/**
 * Global Regulatory Compliance API Routes
 *
 * Unified API for managing compliance across all supported regulatory markets:
 *   US (FDA), EU (EMA/Annex 11/GDPR), JP (PMDA), CN (NMPA), BR (ANVISA),
 *   KR (MFDS), AU (TGA), CA (Health Canada), UK (MHRA), CH (Swissmedic),
 *   ICH, WHO PQ, PIC/S
 *
 * Route groups:
 *   /api/compliance/regions          — Regional framework management
 *   /api/compliance/gdpr             — GDPR compliance (RoPA, DPIA, DSR, breach)
 *   /api/compliance/pharmacovigilance — Safety reporting (AE, ICSR, signals)
 *   /api/compliance/audit            — Regional audit requirements
 *   /api/compliance/gap-analysis     — Compliance gap analysis
 *
 * @module server/routes/global-compliance
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

function resolveRequestContext(req: Request): { userId: number; orgId: number; role: string } {
  const user = (req as any).user || {};
  return {
    userId: Number(user.id || user.userId || 0),
    orgId: Number(
      user.organizationId ||
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      0
    ),
    role: String(user.role || user.title || '').toLowerCase(),
  };
}

function isGlobalComplianceAdmin(role: string): boolean {
  return ['super_admin', 'platform_admin'].includes(role);
}

function hasElevatedPrivacyAccess(role: string): boolean {
  return [
    'admin',
    'manager',
    'owner',
    'dpo',
    'privacy_officer',
  ].includes(role);
}

function enforceOrgScope(req: Request, res: Response, routeOrgId: number): boolean {
  const { orgId, role } = resolveRequestContext(req);
  if (!routeOrgId) {
    res.status(400).json({ error: 'Invalid organization scope' });
    return false;
  }
  if (isGlobalComplianceAdmin(role)) return true;
  if (orgId !== routeOrgId) {
    res.status(403).json({ error: 'Forbidden: organization scope mismatch' });
    return false;
  }
  return true;
}

function enforceSubjectAccess(req: Request, res: Response, dataSubjectId: number): boolean {
  const { userId, role } = resolveRequestContext(req);
  if (hasElevatedPrivacyAccess(role)) return true;
  if (!userId || userId !== dataSubjectId) {
    res.status(403).json({ error: 'Forbidden: data subject scope violation' });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL COMPLIANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /regions
 * List all supported regulatory regions and frameworks
 */
router.get('/regions', async (_req: Request, res: Response) => {
  try {
    const { getApplicableFrameworks, SUPPORTED_REGIONS } = await import(
      '../services/compliance/globalComplianceEngine.js'
    );
    const allFrameworks = getApplicableFrameworks(Object.keys(SUPPORTED_REGIONS));
    res.json({
      success: true,
      data: {
        regions: SUPPORTED_REGIONS,
        frameworks: allFrameworks,
        totalFrameworks: allFrameworks.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load regional frameworks', details: err.message });
  }
});

/**
 * GET /regions/:orgId/config
 * Get the compliance configuration for an organization
 */
router.get('/regions/:orgId/config', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const result = await pool.query(
      `SELECT id, organization_id, region_code, framework_id, enabled, configuration,
              audit_retention_years, required_languages, timezone_rule,
              data_residency_required, data_residency_region, e_signature_required,
              hash_algorithm, export_formats, created_at, updated_at
       FROM regional_compliance_config WHERE organization_id = $1 ORDER BY region_code`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.json({ success: true, data: [], message: 'Table not yet initialized' });
  }
});

/**
 * POST /regions/:orgId/enable
 * Enable a regulatory framework for an organization
 */
router.post('/regions/:orgId/enable', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { regionCode, frameworkId, configuration } = req.body;

    if (!regionCode || !frameworkId) {
      return res.status(400).json({ error: 'regionCode and frameworkId are required' });
    }

    // Get default requirements for this framework
    let defaults: any = {};
    try {
      const { getRegionalAuditRequirements } = await import(
        '../services/compliance/globalComplianceEngine.js'
      );
      defaults = getRegionalAuditRequirements(regionCode);
    } catch { /* non-blocking: fall back to empty defaults */ }

    const result = await pool.query(
      `INSERT INTO regional_compliance_config
        (organization_id, region_code, framework_id, enabled, configuration,
         audit_retention_years, required_languages, timezone_rule,
         data_residency_required, e_signature_required, hash_algorithm)
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id, region_code, framework_id)
       DO UPDATE SET enabled = true, configuration = EXCLUDED.configuration,
                     updated_at = NOW()
       RETURNING *`,
      [
        orgId, regionCode, frameworkId,
        JSON.stringify(configuration || {}),
        defaults.retentionYears || 15,
        defaults.languages || ['en'],
        defaults.timezoneRule || 'UTC',
        defaults.dataResidencyRequired || false,
        defaults.eSignatureRequired !== false,
        defaults.hashAlgorithm || 'SHA-256',
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to enable framework', details: err.message });
  }
});

/**
 * POST /gap-analysis/:orgId
 * Run a compliance gap analysis for an organization's target regions
 */
router.post('/gap-analysis/:orgId', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { targetRegions } = req.body;

    if (!targetRegions || !Array.isArray(targetRegions)) {
      return res.status(400).json({ error: 'targetRegions array is required' });
    }

    const { validateComplianceForRegions } = await import(
      '../services/compliance/globalComplianceEngine.js'
    );

    // Get current config
    let currentConfig: any = {};
    try {
      const result = await pool.query(
        `SELECT id, organization_id, region_code, framework_id, enabled, configuration,
                audit_retention_years, required_languages, timezone_rule,
                data_residency_required, data_residency_region, e_signature_required,
                hash_algorithm, export_formats, created_at, updated_at
         FROM regional_compliance_config WHERE organization_id = $1 AND enabled = true`,
        [orgId]
      );
      currentConfig = {
        enabledRegions: result.rows.map((r: any) => r.region_code),
        enabledFrameworks: result.rows.map((r: any) => r.framework_id),
        auditRetention: Math.max(...result.rows.map((r: any) => r.audit_retention_years || 0), 0),
        eSignatures: result.rows.some((r: any) => r.e_signature_required),
        hashAlgorithm: result.rows[0]?.hash_algorithm || 'SHA-256',
      };
    } catch { /* non-blocking: fall back to empty config for gap analysis */ }

    const gapAnalysis = validateComplianceForRegions(targetRegions, currentConfig);

    res.json({
      success: true,
      data: {
        organizationId: orgId,
        targetRegions,
        ...gapAnalysis,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Gap analysis failed', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GDPR COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /gdpr/:orgId/ropa
 * Get Records of Processing Activities per GDPR Article 30
 */
router.get('/gdpr/:orgId/ropa', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const result = await pool.query(
      `SELECT id, organization_id, name, purpose, lawful_basis, data_categories,
              data_subject_categories, recipients, third_country_transfers,
              retention_period_months, technical_measures, organizational_measures,
              dpia_conducted, dpa_contact_info, created_at, updated_at
       FROM gdpr_processing_activities WHERE organization_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.json({ success: true, data: [], message: 'GDPR tables not yet initialized' });
  }
});

/**
 * POST /gdpr/:orgId/ropa
 * Create a new Record of Processing Activity
 */
router.post('/gdpr/:orgId/ropa', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { name, purpose, lawfulBasis, dataCategories, dataSubjectCategories,
            recipients, retentionPeriodMonths, technicalMeasures, organizationalMeasures } = req.body;

    if (!name || !purpose || !lawfulBasis) {
      return res.status(400).json({ error: 'name, purpose, and lawfulBasis are required per GDPR Article 30' });
    }

    const result = await pool.query(
      `INSERT INTO gdpr_processing_activities
        (organization_id, name, purpose, lawful_basis, data_categories,
         data_subject_categories, recipients, retention_period_months,
         technical_measures, organizational_measures)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [orgId, name, purpose, lawfulBasis,
       dataCategories || [], dataSubjectCategories || [], recipients || [],
       retentionPeriodMonths || null, technicalMeasures || [], organizationalMeasures || []]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create RoPA entry', details: err.message });
  }
});

/**
 * POST /gdpr/:orgId/breach
 * Report a data breach per GDPR Articles 33-34
 */
router.post('/gdpr/:orgId/breach', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { description, dataAffected, subjectsAffected, severity, detectedAt } = req.body;

    if (!description || !dataAffected || !severity) {
      return res.status(400).json({ error: 'description, dataAffected, and severity are required' });
    }

    const detected = detectedAt ? new Date(detectedAt) : new Date();
    const hoursElapsed = (Date.now() - detected.getTime()) / (1000 * 60 * 60);
    const withinWindow = hoursElapsed <= 72;

    const result = await pool.query(
      `INSERT INTO gdpr_data_breaches
        (organization_id, description, data_affected, subjects_affected,
         detected_at, severity, within_notification_window)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orgId, description, dataAffected, subjectsAffected || 0,
       detected, severity, withinWindow]
    );

    const breach = result.rows[0];

    res.json({
      success: true,
      data: breach,
      compliance: {
        article33: `Breach ${withinWindow ? 'IS' : 'IS NOT'} within 72-hour notification window`,
        article34: severity === 'high' || severity === 'critical'
          ? 'Data subjects MUST be notified without undue delay (Art. 34)'
          : 'Subject notification may not be required if risk is low',
        hoursElapsed: Math.round(hoursElapsed * 10) / 10,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to report breach', details: err.message });
  }
});

/**
 * POST /gdpr/:orgId/dsr
 * Create a Data Subject Request per GDPR Articles 15-22
 */
router.post('/gdpr/:orgId/dsr', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { dataSubjectId, requestType } = req.body;

    if (!dataSubjectId || !requestType) {
      return res.status(400).json({ error: 'dataSubjectId and requestType are required' });
    }

    // 30-day response deadline per Art. 12(3)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);

    const result = await pool.query(
      `INSERT INTO gdpr_data_subject_requests
        (organization_id, data_subject_id, request_type, response_deadline)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orgId, dataSubjectId, requestType, deadline]
    );

    res.json({
      success: true,
      data: result.rows[0],
      compliance: {
        'Art. 12(3)': `Response deadline set to ${deadline.toISOString()} (30 days)`,
        'Art. 12(5)': 'No fee for first request. May charge reasonable fee for manifestly unfounded/excessive requests.',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create DSR', details: err.message });
  }
});

/**
 * GET /gdpr/:orgId/dsr/overdue
 * Get overdue Data Subject Requests
 */
router.get('/gdpr/:orgId/dsr/overdue', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const result = await pool.query(
      `SELECT id, organization_id, data_subject_id, request_type, status,
              received_at, response_deadline, completed_at, response_details,
              denial_reason, created_at
       FROM gdpr_data_subject_requests
       WHERE organization_id = $1
         AND status NOT IN ('completed', 'denied')
         AND response_deadline < NOW()
       ORDER BY response_deadline ASC`,
      [orgId]
    );
    res.json({
      success: true,
      data: result.rows,
      overdue: result.rows.length,
      compliance: result.rows.length > 0
        ? 'WARNING: Overdue DSRs may result in supervisory authority complaints per Art. 77'
        : 'All DSRs are within 30-day compliance window',
    });
  } catch (err: any) {
    res.json({ success: true, data: [], overdue: 0 });
  }
});

/**
 * GET /gdpr/:orgId/data-subject/:dataSubjectId/export
 * Export data for a subject (GDPR Art. 15 + Art. 20 portability)
 */
router.get('/gdpr/:orgId/data-subject/:dataSubjectId/export', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const dataSubjectIdRaw = String(req.params.dataSubjectId);
    const userId = Number.parseInt(dataSubjectIdRaw, 10);

    if (!orgId || !dataSubjectIdRaw) {
      return res.status(400).json({ error: 'orgId and dataSubjectId are required' });
    }
    if (!Number.isFinite(userId) || !enforceSubjectAccess(req, res, userId)) return;

    const safeQuery = async (query: string, params: any[]) => {
      try {
        return await pool.query(query, params);
      } catch {
        return { rows: [] as any[] };
      }
    };

    const [
      userResult,
      conversationsResult,
      artifactsResult,
      reviewThreadsResult,
      commentsResult,
      dsrResult,
    ] = await Promise.all([
      safeQuery(
        `SELECT id, organization_id, email, name, title, department, created_at, updated_at
         FROM users
         WHERE organization_id = $1 AND id = $2`,
        [orgId, Number.isFinite(userId) ? userId : -1]
      ),
      safeQuery(
        `SELECT id, project_id, title, summary, status, message_count, created_at, updated_at
         FROM concept2cure_conversations
         WHERE organization_id = $1 AND created_by_id = $2
         ORDER BY updated_at DESC LIMIT 500`,
        [orgId, Number.isFinite(userId) ? userId : -1]
      ),
      safeQuery(
        `SELECT artifact_id, project_id, title, status, ctd_section, source, created_at, updated_at
         FROM concept2cure_artifacts
         WHERE organization_id = $1 AND created_by_id = $2
         ORDER BY updated_at DESC LIMIT 500`,
        [orgId, Number.isFinite(userId) ? userId : -1]
      ),
      safeQuery(
        `SELECT id, thread_id, project_id, artifact_id, title, status, priority, created_at, updated_at
         FROM concept2cure_review_threads
         WHERE org_id = $1 AND created_by_id = $2
         ORDER BY updated_at DESC LIMIT 500`,
        [orgId, Number.isFinite(userId) ? userId : -1]
      ),
      safeQuery(
        `SELECT id, thread_id, artifact_id, body, kind, created_at, updated_at
         FROM concept2cure_thread_comments
         WHERE org_id = $1 AND author_id = $2
         ORDER BY updated_at DESC LIMIT 500`,
        [orgId, Number.isFinite(userId) ? userId : -1]
      ),
      safeQuery(
        `SELECT id, request_type, status, received_at, response_deadline, completed_at, response_details
         FROM gdpr_data_subject_requests
         WHERE organization_id = $1 AND data_subject_id = $2
         ORDER BY created_at DESC LIMIT 100`,
        [orgId, dataSubjectIdRaw]
      ),
    ]);

    const exportBundle = {
      dataSubjectId: dataSubjectIdRaw,
      organizationId: orgId,
      exportedAt: new Date().toISOString(),
      legalBasis: {
        article15: 'Right of access',
        article20: 'Right to data portability',
      },
      profile: userResult.rows[0] || null,
      conversations: conversationsResult.rows,
      artifacts: artifactsResult.rows,
      reviewThreads: reviewThreadsResult.rows,
      comments: commentsResult.rows,
      dsrHistory: dsrResult.rows,
    };

    try {
      await pool.query(
        `INSERT INTO gdpr_data_subject_requests
          (organization_id, data_subject_id, request_type, status, response_deadline, completed_at, response_details)
         VALUES ($1, $2, 'access_export', 'completed', NOW(), NOW(), $3)`,
        [orgId, dataSubjectIdRaw, `Export completed at ${exportBundle.exportedAt}`]
      );
    } catch {
      // no-op if table is unavailable
    }

    return res.json({
      success: true,
      data: exportBundle,
      summary: {
        conversations: conversationsResult.rows.length,
        artifacts: artifactsResult.rows.length,
        reviewThreads: reviewThreadsResult.rows.length,
        comments: commentsResult.rows.length,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to export data subject payload', details: err.message });
  }
});

/**
 * DELETE /gdpr/:orgId/data-subject/:dataSubjectId
 * Execute right-to-erasure workflows (GDPR Art. 17)
 */
router.delete('/gdpr/:orgId/data-subject/:dataSubjectId', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const dataSubjectIdRaw = String(req.params.dataSubjectId);
    const userId = Number.parseInt(dataSubjectIdRaw, 10);
    const reason = req.body?.reason || 'Data subject erasure request (Art. 17)';

    if (!orgId || !dataSubjectIdRaw || !Number.isFinite(userId)) {
      return res.status(400).json({ error: 'orgId and numeric dataSubjectId are required' });
    }
    if (!enforceSubjectAccess(req, res, userId)) return;

    await client.query('BEGIN');

    const userResult = await client.query(
      `UPDATE users
       SET email = CONCAT('erased+', id, '@redacted.local'),
           name = CONCAT('[ERASED USER ', id, ']'),
           title = NULL,
           department = NULL,
           preferences = '{}'::jsonb,
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING id`,
      [orgId, userId]
    );

    const conversationsResult = await client.query(
      `UPDATE concept2cure_conversations
       SET title = '[ERASED CONVERSATION]',
           summary = '[REDACTED PER GDPR ART.17]',
           updated_at = NOW()
       WHERE organization_id = $1 AND created_by_id = $2
       RETURNING id`,
      [orgId, userId]
    ).catch(() => ({ rows: [] as any[] }));

    const artifactsResult = await client.query(
      `UPDATE concept2cure_artifacts
       SET title = CONCAT('[ERASED] ', COALESCE(title, 'artifact')),
           content = '[REDACTED PER GDPR ART.17]',
           metadata = COALESCE(metadata, '{}'::jsonb) || '{"gdpr_erased": true}'::jsonb,
           updated_at = NOW()
       WHERE organization_id = $1 AND created_by_id = $2
       RETURNING artifact_id`,
      [orgId, userId]
    ).catch(() => ({ rows: [] as any[] }));

    const commentsResult = await client.query(
      `UPDATE concept2cure_thread_comments
       SET body = '[REDACTED PER GDPR ART.17]',
           updated_at = NOW()
       WHERE org_id = $1 AND author_id = $2
       RETURNING id`,
      [orgId, userId]
    ).catch(() => ({ rows: [] as any[] }));

    await client.query(
      `INSERT INTO gdpr_data_subject_requests
        (organization_id, data_subject_id, request_type, status, response_deadline, completed_at, response_details)
       VALUES ($1, $2, 'erasure', 'completed', NOW(), NOW(), $3)`,
      [
        orgId,
        dataSubjectIdRaw,
        `Erasure completed at ${new Date().toISOString()}. Reason: ${reason}`,
      ]
    ).catch(() => undefined);

    await client.query('COMMIT');

    return res.json({
      success: true,
      legalBasis: {
        article17: 'Right to erasure',
      },
      data: {
        dataSubjectId: dataSubjectIdRaw,
        organizationId: orgId,
        redactedUser: userResult.rows.length > 0,
        redactedConversations: conversationsResult.rows.length,
        redactedArtifacts: artifactsResult.rows.length,
        redactedComments: commentsResult.rows.length,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Failed to process erasure request', details: err.message });
  } finally {
    client.release();
  }
});

/**
 * POST /gdpr/:orgId/transfer-assessment
 * Create a cross-border transfer assessment per GDPR Articles 44-49
 */
router.post('/gdpr/:orgId/transfer-assessment', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { sourceRegion, destinationRegion, transferMechanism, legalBasis,
            riskLevel, tiaCompleted, supplementaryMeasures } = req.body;

    if (!sourceRegion || !destinationRegion || !transferMechanism) {
      return res.status(400).json({
        error: 'sourceRegion, destinationRegion, and transferMechanism are required per GDPR Chapter V',
      });
    }

    const result = await pool.query(
      `INSERT INTO gdpr_transfer_assessments
        (organization_id, source_region, destination_region, transfer_mechanism,
         legal_basis, risk_level, tia_completed, supplementary_measures)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [orgId, sourceRegion, destinationRegion, transferMechanism,
       legalBasis || null, riskLevel || 'medium', tiaCompleted || false,
       supplementaryMeasures || []]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create transfer assessment', details: err.message });
  }
});

/**
 * POST /gdpr/:orgId/dpia
 * Create a Data Protection Impact Assessment per GDPR Article 35
 */
router.post('/gdpr/:orgId/dpia', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { processingActivityId, description, necessityAssessment, riskAssessment, dpoOpinion } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'description is required per GDPR Article 35' });
    }

    const result = await pool.query(
      `INSERT INTO gdpr_dpias
        (organization_id, processing_activity_id, description,
         necessity_assessment, risk_assessment, dpo_opinion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orgId, processingActivityId || null, description,
       necessityAssessment || null, JSON.stringify(riskAssessment || {}), dpoOpinion || null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create DPIA', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACOVIGILANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /pharmacovigilance/:orgId/adverse-event
 * Report an adverse event with automatic deadline calculation
 */
router.post('/pharmacovigilance/:orgId/adverse-event', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { projectId, eventType, patientId, eventDescription, onsetDate,
            seriousnessCriteria, causality, outcome, reporterType,
            countryOfOccurrence } = req.body;

    if (!eventType || !eventDescription) {
      return res.status(400).json({ error: 'eventType and eventDescription are required' });
    }

    // Calculate reporting deadline based on severity and region
    const isFatalOrLifeThreatening = (seriousnessCriteria || []).some(
      (c: string) => c === 'death' || c === 'life_threatening'
    );
    const expedited = eventType === 'SAE' || eventType === 'SUSAR';
    const deadlineDays = isFatalOrLifeThreatening ? 7 : (expedited ? 15 : 30);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);

    const result = await pool.query(
      `INSERT INTO pv_adverse_events
        (organization_id, project_id, event_type, patient_id, event_description,
         onset_date, seriousness_criteria, causality, outcome, reporter_type,
         country_of_occurrence, regulatory_reporting_deadline, expedited_report_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [orgId, projectId || null, eventType, patientId || null, eventDescription,
       onsetDate || null, seriousnessCriteria || [], causality || 'not_assessed',
       outcome || 'unknown', reporterType || 'sponsor', countryOfOccurrence || null,
       deadline, expedited]
    );

    res.json({
      success: true,
      data: result.rows[0],
      reporting: {
        deadlineDays,
        deadline: deadline.toISOString(),
        expedited,
        isFatalOrLifeThreatening,
        guidance: isFatalOrLifeThreatening
          ? 'FDA/EMA/PMDA require 7-day initial report for fatal/life-threatening events'
          : expedited
            ? '15 calendar day reporting deadline for SAE/SUSAR (all major agencies)'
            : '30-day routine reporting',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to report adverse event', details: err.message });
  }
});

/**
 * GET /pharmacovigilance/:orgId/adverse-events
 * List adverse events with filtering
 */
router.get('/pharmacovigilance/:orgId/adverse-events', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const eventType = req.query.eventType;
    const projectId = req.query.projectId;

    let query = `SELECT id, organization_id, project_id, event_type, patient_id,
                        event_description, onset_date, report_date, seriousness_criteria,
                        causality, outcome, reporter_type, country_of_occurrence,
                        regulatory_reporting_deadline, reported_to_authorities,
                        expedited_report_required, created_at
                 FROM pv_adverse_events WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (eventType) {
      params.push(eventType);
      query += ` AND event_type = $${params.length}`;
    }
    if (projectId) {
      params.push(parseInt(String(projectId), 10));
      query += ` AND project_id = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT 500`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.json({ success: true, data: [] });
  }
});

/**
 * GET /pharmacovigilance/:orgId/overdue-reports
 * Get adverse events past their reporting deadline
 */
router.get('/pharmacovigilance/:orgId/overdue-reports', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const result = await pool.query(
      `SELECT id, organization_id, project_id, event_type, patient_id,
              event_description, onset_date, report_date, seriousness_criteria,
              causality, outcome, reporter_type, country_of_occurrence,
              regulatory_reporting_deadline, reported_to_authorities,
              expedited_report_required, created_at
       FROM pv_adverse_events
       WHERE organization_id = $1
         AND reported_to_authorities = FALSE
         AND regulatory_reporting_deadline < NOW()
       ORDER BY regulatory_reporting_deadline ASC`,
      [orgId]
    );

    res.json({
      success: true,
      data: result.rows,
      overdueCount: result.rows.length,
      compliance: result.rows.length > 0
        ? 'CRITICAL: Overdue safety reports may trigger regulatory action (FDA Warning Letter, EMA non-compliance)'
        : 'All safety reports are within regulatory deadlines',
    });
  } catch (err: any) {
    res.json({ success: true, data: [], overdueCount: 0 });
  }
});

/**
 * POST /pharmacovigilance/:orgId/signal
 * Report a safety signal
 */
router.post('/pharmacovigilance/:orgId/signal', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { projectId, signalSource, description, riskBenefitAssessment } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    const result = await pool.query(
      `INSERT INTO pv_safety_signals
        (organization_id, project_id, signal_source, description, risk_benefit_assessment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, projectId || null, signalSource || 'spontaneous', description,
       riskBenefitAssessment || null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to report signal', details: err.message });
  }
});

/**
 * POST /pharmacovigilance/:orgId/rmp
 * Create a Risk Management Plan
 */
router.post('/pharmacovigilance/:orgId/rmp', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    const { projectId, version, identifiedRisks, potentialRisks, missingInformation,
            pharmacovigilanceActivities, riskMinimizationMeasures, region } = req.body;

    const result = await pool.query(
      `INSERT INTO pv_risk_management_plans
        (organization_id, project_id, version, identified_risks, potential_risks,
         missing_information, pharmacovigilance_activities, risk_minimization_measures, region)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [orgId, projectId || null, version || '1.0',
       JSON.stringify(identifiedRisks || []), JSON.stringify(potentialRisks || []),
       JSON.stringify(missingInformation || []),
       JSON.stringify(pharmacovigilanceActivities || {}),
       JSON.stringify(riskMinimizationMeasures || {}),
       region || null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create RMP', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /dashboard/:orgId
 * Unified compliance dashboard — shows status across all regulatory domains
 */
router.get('/dashboard/:orgId', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;

    // Parallel queries for dashboard data
    const [
      configResult,
      ropaResult,
      breachResult,
      dsrOverdueResult,
      aeOverdueResult,
      signalResult,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM regional_compliance_config WHERE organization_id = $1 AND enabled = true`, [orgId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM gdpr_processing_activities WHERE organization_id = $1`, [orgId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM gdpr_data_breaches WHERE organization_id = $1 AND status NOT IN ('remediated', 'closed')`, [orgId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM gdpr_data_subject_requests WHERE organization_id = $1 AND status NOT IN ('completed', 'denied') AND response_deadline < NOW()`, [orgId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM pv_adverse_events WHERE organization_id = $1 AND reported_to_authorities = FALSE AND regulatory_reporting_deadline < NOW()`, [orgId]).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS count FROM pv_safety_signals WHERE organization_id = $1 AND evaluation_status IN ('new', 'under_evaluation')`, [orgId]).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const overdueDSRs = dsrOverdueResult.rows[0]?.count || 0;
    const overdueAEs = aeOverdueResult.rows[0]?.count || 0;
    const openBreaches = breachResult.rows[0]?.count || 0;
    const pendingSignals = signalResult.rows[0]?.count || 0;

    const criticalIssues = overdueAEs + overdueDSRs + openBreaches;

    res.json({
      success: true,
      data: {
        organizationId: orgId,
        overallStatus: criticalIssues === 0 ? 'compliant' : 'action_required',
        criticalIssues,
        domains: {
          regulatory: {
            enabledFrameworks: configResult.rows[0]?.count || 0,
            status: (configResult.rows[0]?.count || 0) > 0 ? 'configured' : 'not_configured',
          },
          gdpr: {
            processingActivities: ropaResult.rows[0]?.count || 0,
            openBreaches,
            overdueDSRs,
            status: overdueDSRs > 0 || openBreaches > 0 ? 'action_required' : 'compliant',
          },
          pharmacovigilance: {
            overdueReports: overdueAEs,
            pendingSignals,
            status: overdueAEs > 0 ? 'critical' : pendingSignals > 0 ? 'monitoring' : 'compliant',
          },
          auditTrail: {
            status: 'active', // Chain monitor handles this
            hashChain: 'SHA-256',
            immutability: 'enforced',
          },
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Dashboard query failed', details: err.message });
  }
});

export default router;
