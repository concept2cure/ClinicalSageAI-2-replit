/**
 * Intelligent Report Engine — API Routes
 *
 * RESTful endpoints for the unified report generation system with:
 * - Immutable record creation and sealing
 * - Atom-level provenance queries
 * - Integrity verification
 * - Indemnification attestation management
 * - Global regulatory body catalog
 *
 * 21 CFR Part 11 compliant — all actions audit-logged
 */

import { Router, Request, Response } from 'express';
import { intelligentReportEngine } from '../services/intelligent-report-engine';

const router = Router();

// ── Domain & Regulatory Catalog ─────────────────────────────

/**
 * GET /api/intelligent-reports/catalog/domains
 * Returns all report domains with subtypes, sections, and compliance frameworks
 */
router.get('/catalog/domains', (_req: Request, res: Response) => {
  try {
    const catalog = intelligentReportEngine.getDomainCatalog();
    res.json({ success: true, data: catalog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/catalog/regulatory-bodies
 * Returns all supported global regulatory bodies
 */
router.get('/catalog/regulatory-bodies', (_req: Request, res: Response) => {
  try {
    const bodies = intelligentReportEngine.getRegulatoryBodies();
    res.json({ success: true, data: bodies });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/catalog/regulations/:domain
 * Returns applicable regulations for a domain, optionally filtered by body
 */
router.get('/catalog/regulations/:domain', (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const { body } = req.query;
    const regulations = intelligentReportEngine.getApplicableRegulations(
      domain as any,
      body as any,
    );
    res.json({ success: true, data: regulations });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Report Generation ───────────────────────────────────────

/**
 * POST /api/intelligent-reports/generate
 * Generate a new immutable report record
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      organizationId,
      clientWorkspaceId,
      projectId,
      domain,
      subtype,
      title,
      targetRegulatory,
      complianceFrameworks,
      parameters,
      persona,
    } = req.body;

    if (!organizationId || !domain || !title) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: organizationId, domain, title',
      });
    }

    const userId = (req as any).user?.id || req.body.userId;
    const userName = (req as any).user?.name || req.body.userName || 'System';

    const result = await intelligentReportEngine.generateReport({
      organizationId,
      clientWorkspaceId,
      projectId,
      domain,
      subtype,
      title,
      targetRegulatory,
      complianceFrameworks,
      parameters,
      persona,
      userId,
      userName,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        reportId: result.record.id,
        reportUuid: result.record.reportUuid,
        reportCode: result.record.reportCode,
        verificationCode: result.verificationCode,
        contentHash: result.record.contentHash,
        merkleRoot: result.record.merkleRoot,
        sealStatus: result.record.sealStatus,
        complianceScore: result.record.complianceScore,
        indemnificationTier: result.record.indemnificationTier,
        provenanceAtomCount: result.provenanceEntries.length,
        attestationCount: result.attestations.length,
        generationDurationMs: result.record.generationDurationMs,
        record: result.record,
      },
    });
  } catch (error: any) {
    console.error('Report generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Report Queries ──────────────────────────────────────────

/**
 * GET /api/intelligent-reports/list/:organizationId
 * List reports for an organization with optional filters
 */
router.get('/list/:organizationId', async (req: Request, res: Response) => {
  try {
    const organizationId = parseInt(String(req.params.organizationId));
    const { domain, sealStatus, targetRegulatory, projectId, limit, offset } = req.query;

    const reports = await intelligentReportEngine.listReports(organizationId, {
      domain: domain as any,
      sealStatus: sealStatus as any,
      targetRegulatory: targetRegulatory as any,
      projectId: projectId ? parseInt(projectId as string) : undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({
      success: true,
      data: reports,
      count: reports.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/:reportId
 * Get full report record
 */
router.get('/:reportId', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const report = await intelligentReportEngine.getReport(reportId);

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/:reportId/provenance
 * Get atom-level provenance for a report
 */
router.get('/:reportId/provenance', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const provenance = await intelligentReportEngine.getReportProvenance(reportId);
    res.json({ success: true, data: provenance, count: provenance.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/:reportId/seal-events
 * Get seal event chain for a report
 */
router.get('/:reportId/seal-events', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const events = await intelligentReportEngine.getReportSealEvents(reportId);
    res.json({ success: true, data: events, count: events.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/:reportId/attestations
 * Get indemnification attestations for a report
 */
router.get('/:reportId/attestations', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const attestations = await intelligentReportEngine.getReportAttestations(reportId);
    res.json({ success: true, data: attestations, count: attestations.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Seal & Verify ───────────────────────────────────────────

/**
 * POST /api/intelligent-reports/:reportId/seal
 * Cryptographically seal a report (makes it immutable)
 */
router.post('/:reportId/seal', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const { justification } = req.body;

    if (!justification) {
      return res.status(400).json({ success: false, error: 'Justification required for sealing' });
    }

    const userId = (req as any).user?.id || req.body.userId;
    const userName = (req as any).user?.name || req.body.userName || 'System';

    const result = await intelligentReportEngine.sealReport(
      reportId,
      userId,
      userName,
      justification,
      req.ip || req.socket.remoteAddress,
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/:reportId/verify
 * Verify cryptographic integrity of a sealed report
 */
router.get('/:reportId/verify', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const result = await intelligentReportEngine.verifyReportIntegrity(reportId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Supersede & Revoke ──────────────────────────────────────

/**
 * POST /api/intelligent-reports/:reportId/supersede
 * Create a new version of a sealed report, marking the original as superseded
 */
router.post('/:reportId/supersede', async (req: Request, res: Response) => {
  try {
    const originalReportId = parseInt(String(req.params.reportId));
    const {
      organizationId, clientWorkspaceId, projectId,
      domain, subtype, title, targetRegulatory,
      complianceFrameworks, parameters, persona,
    } = req.body;

    if (!organizationId || !domain || !title) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: organizationId, domain, title',
      });
    }

    const userId = (req as any).user?.id || req.body.userId;
    const userName = (req as any).user?.name || req.body.userName || 'System';

    const result = await intelligentReportEngine.supersedeReport(originalReportId, {
      organizationId,
      clientWorkspaceId,
      projectId,
      domain,
      subtype,
      title,
      targetRegulatory,
      complianceFrameworks,
      parameters,
      persona,
      userId,
      userName,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        originalReportId,
        newReportId: result.record.id,
        newReportCode: result.record.reportCode,
        newVersion: result.record.version,
        verificationCode: result.verificationCode,
        contentHash: result.record.contentHash,
      },
    });
  } catch (error: any) {
    console.error('Supersede error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/intelligent-reports/:reportId/revoke
 * Revoke a report with justification (irrecoverable — recorded in seal chain)
 */
router.post('/:reportId/revoke', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const { justification } = req.body;

    if (!justification) {
      return res.status(400).json({ success: false, error: 'Justification required for revocation' });
    }

    const userId = (req as any).user?.id || req.body.userId;
    const userName = (req as any).user?.name || req.body.userName || 'System';

    await intelligentReportEngine.revokeReport(
      reportId,
      userId,
      userName,
      justification,
      req.ip || req.socket.remoteAddress,
    );

    res.json({ success: true, data: { reportId, status: 'revoked', justification } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Export ───────────────────────────────────────────────────

/**
 * GET /api/intelligent-reports/:reportId/export/:format
 * Export report with integrity manifest (json | csv | manifest)
 */
router.get('/:reportId/export/:format', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const format = req.params.format as 'json' | 'csv' | 'manifest';

    if (!['json', 'csv', 'manifest'].includes(format)) {
      return res.status(400).json({ success: false, error: 'Format must be json, csv, or manifest' });
    }

    const result = await intelligentReportEngine.exportReport(reportId, format);

    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('X-Integrity-Hash', result.integrityManifest.exportHash);
    res.setHeader('X-Verification-Code', result.integrityManifest.verificationCode);

    if (format === 'csv') {
      res.send(result.data);
    } else {
      res.json(result.data);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Drift Detection & Compliance Validation ─────────────────

/**
 * GET /api/intelligent-reports/:reportId/drift-check
 * Detect provenance drift — checks if source data changed since report generation
 */
router.get('/:reportId/drift-check', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const result = await intelligentReportEngine.detectProvenanceDrift(reportId);
    res.json({
      success: true,
      data: result,
      driftDetected: result.drifted > 0,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/intelligent-reports/:reportId/compliance-validation
 * Run full compliance validation against target regulatory body
 */
router.get('/:reportId/compliance-validation', async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(String(req.params.reportId));
    const { body } = req.query;

    const result = await intelligentReportEngine.runComplianceValidation(
      reportId,
      body as any,
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
