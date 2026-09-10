/**
 * Decision Lineage API — Immutable audit-ready decision & data lineage
 *
 * Exposes the decision lineage graph for regulatory review and submission.
 * All data is sourced from tamper-proof audit logs and workflow history.
 *
 * Endpoints:
 *   GET  /api/decision-lineage/:entityType/:entityId       — Full lineage graph
 *   GET  /api/decision-lineage/:entityType/:entityId/export — Export (JSON/CSV/XML)
 *   GET  /api/decision-lineage/query                        — Cross-entity query
 *   POST /api/decision-lineage/record                       — Record a new decision
 *   GET  /api/decision-lineage/verify-chain                 — Verify hash chain integrity
 *   GET  /api/decision-lineage/compliance-report            — Compliance summary
 *
 * @module server/routes/decision-lineage
 * @compliance FDA 21 CFR Part 11, EU Annex 11, ICH E6(R2), PMDA ERES
 */

import { Router, Request, Response } from 'express';
import { decisionLineageService, type ExportFormat } from '../services/workflow/DecisionLineageService';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';
import { authedOrgId, requireAuthedOrgId } from '../utils/authedOrgId';

// SECURITY: decision lineage exposes the regulatory decision graph
// (who decided what, when, with what evidence). Pre-fix the
// orgId filter was sourced from req.query.organizationId — a
// query-param IDOR. The JWT-bound org now overrides whatever the
// query says.

const logger = createScopedLogger('decision-lineage-api');
const router = Router();

// ── GET /api/decision-lineage/:entityType/:entityId ─────────────────────────
// Returns the full lineage graph for a document, workflow, or program.
router.get('/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const entityType = String(req.params.entityType);
    const orgId = authedOrgId(req) ?? undefined;
    const id = parseInt(String(req.params.entityId), 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid entityId — must be a positive integer' });
    }

    const graph = await decisionLineageService.getLineageGraph(entityType, id, orgId);
    res.json(graph);
  } catch (err) {
    logger.error('Failed to get lineage graph', err);
    res.status(500).json({ error: 'Failed to retrieve lineage graph' });
  }
});

// ── GET /api/decision-lineage/:entityType/:entityId/export ──────────────────
// Exports the lineage data in JSON, CSV, or eCTD-compatible XML.
router.get('/:entityType/:entityId/export', async (req: Request, res: Response) => {
  try {
    const entityType = String(req.params.entityType);
    const format = (req.query.format as ExportFormat) || 'json';
    // Export must be tenant-scoped — never export lineage with an undefined
    // org (which let exportLineage run unscoped across tenants).
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const orgId = guard.orgId;
    const id = parseInt(String(req.params.entityId), 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid entityId' });
    }

    if (!['json', 'csv', 'xml'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format — must be json, csv, or xml' });
    }

    const result = await decisionLineageService.exportLineage(entityType, id, format, orgId);

    // Log the export as an auditable action
    await auditService.logAction({
      tenantId: orgId,
      action: 'lineage_export',
      resourceType: entityType,
      resourceId: id,
      details: { format, exportedAt: new Date().toISOString() },
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (err) {
    logger.error('Failed to export lineage', err);
    res.status(500).json({ error: 'Failed to export lineage data' });
  }
});

// ── GET /api/decision-lineage/query ─────────────────────────────────────────
// Cross-entity decision query with flexible filters.
router.get('/query', async (req: Request, res: Response) => {
  try {
    const filters = {
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId ? Number(req.query.entityId) : undefined,
      organizationId: authedOrgId(req) ?? undefined,
      userId: req.query.userId as string | undefined,
      fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
      toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    };

    const decisions = await decisionLineageService.queryDecisions(filters);
    res.json({
      decisions,
      count: decisions.length,
      filters,
    });
  } catch (err) {
    logger.error('Failed to query decisions', err);
    res.status(500).json({ error: 'Failed to query decisions' });
  }
});

// ── POST /api/decision-lineage/record ───────────────────────────────────────
// Record a new decision event into the lineage chain.
router.post('/record', async (req: Request, res: Response) => {
  try {
    // GxP decision lineage is tamper-evident regulated data — the tenant that
    // owns the record is the authenticated caller's org, never a body field.
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const {
      entityType,
      entityId,
      action,
      performedBy,
      performedByRole,
      details,
      parentDecisionIds,
      gxpRelevant,
      requiresSignature,
    } = req.body;

    if (!entityType || !entityId || !action || !performedBy) {
      return res.status(400).json({
        error: 'Missing required fields: entityType, entityId, action, performedBy',
      });
    }

    const decisionId = await decisionLineageService.recordDecision({
      organizationId: guard.orgId,
      entityType,
      entityId: Number(entityId),
      action,
      performedBy,
      performedByRole,
      details,
      parentDecisionIds,
      gxpRelevant,
      requiresSignature,
    });

    res.status(201).json({ decisionId, recorded: true });
  } catch (err) {
    logger.error('Failed to record decision', err);
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

// ── GET /api/decision-lineage/verify-chain ──────────────────────────────────
// Verify the integrity of the tamper-proof audit hash chain.
router.get('/verify-chain', async (_req: Request, res: Response) => {
  try {
    const result = await auditService.verifyChain();
    const frameworks = [
      'FDA 21 CFR Part 11 §11.10(e)',
      'EU Annex 11 §9',
      'ICH E6(R2) §5.5.3',
      'PMDA ERES Guidelines',
    ];
    if (!result.ran) {
      // WO-16B finding 12. The verifier did not run — the store failed to
      // initialise, or the query threw. That is not an integrity failure and
      // it is not compliance; it is an answer nobody has yet. 503, the same
      // status innovation-routes gives an ownership check that could not run.
      // The reason goes to the log, not the body (ci:server-error-leaks).
      logger.error('chain verification could not run', { reason: result.reason });
      return res.status(503).json({
        chainIntegrity: 'UNVERIFIABLE',
        entriesVerified: 0,
        verifiedAt: new Date().toISOString(),
        complianceStatus: 'UNVERIFIABLE',
        message: 'The audit chain verifier could not run. Nothing was verified and nothing failed verification; the reason has been logged.',
        frameworks,
      });
    }
    res.json({
      chainIntegrity: result.valid ? 'VERIFIED' : 'INTEGRITY_FAILURE',
      entriesVerified: result.entriesVerified,
      firstInvalidEntry: result.firstInvalidEntry,
      invalidReason: result.invalidReason,
      verifiedAt: result.verifiedAt,
      complianceStatus: result.valid ? 'COMPLIANT' : 'NON_COMPLIANT',
      frameworks,
    });
  } catch (err) {
    logger.error('Chain verification failed', err);
    res.status(500).json({ error: 'Chain verification failed' });
  }
});

// ── GET /api/decision-lineage/compliance-report ─────────────────────────────
// Generate a compliance summary across all decision lineage data.
router.get('/compliance-report', async (req: Request, res: Response) => {
  try {
    const orgId = authedOrgId(req) ?? undefined;
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
    const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

    // Gather overall statistics
    const allDecisions = await decisionLineageService.queryDecisions({
      organizationId: orgId,
      fromDate,
      toDate,
      limit: 1000,
    });

    const chainResult = await auditService.verifyChain();
    if (!chainResult.ran) {
      logger.error('compliance report: chain verification could not run', { reason: chainResult.reason });
    }
    // WO-16B finding 13. Every verdict below that depends on the chain takes
    // one of THREE values. The two frameworks this report never evaluates
    // (ICH E6(R2), GAMP 5) were hardcoded COMPLIANT; a verdict nothing computed
    // is invented, so they say NOT_ASSESSED. The attestation asserts a
    // "cryptographically-verified audit trail" and is emitted only when one was.
    const chainStatus: 'VERIFIED' | 'INTEGRITY_FAILURE' | 'UNVERIFIABLE' = !chainResult.ran
      ? 'UNVERIFIABLE'
      : chainResult.valid
        ? 'VERIFIED'
        : 'INTEGRITY_FAILURE';
    const chainDependent = (): 'COMPLIANT' | 'REVIEW_REQUIRED' | 'UNVERIFIABLE' =>
      chainStatus === 'VERIFIED' ? 'COMPLIANT' : chainStatus === 'INTEGRITY_FAILURE' ? 'REVIEW_REQUIRED' : 'UNVERIFIABLE';

    const gxpRelevant = allDecisions.filter(d => d.regulatory.gxpRelevant);
    const signatureRequired = allDecisions.filter(d => d.regulatory.requiresSignature);
    const signaturesPending = signatureRequired.filter(d => d.regulatory.signatureStatus === 'pending');
    const signaturesSigned = signatureRequired.filter(d => d.regulatory.signatureStatus === 'signed');

    const report = {
      reportTitle: 'Decision Lineage Compliance Report',
      generatedAt: new Date().toISOString(),
      organizationId: orgId || 'all',
      period: {
        from: fromDate?.toISOString() || 'inception',
        to: toDate?.toISOString() || 'present',
      },
      chainIntegrity: {
        status: chainStatus,
        entriesVerified: chainResult.ran ? chainResult.entriesVerified : 0,
        note: !chainResult.ran
          ? 'The verifier could not run; the reason has been logged. This is not a verdict.'
          : chainResult.valid
            ? undefined
            : chainResult.invalidReason,
      },
      statistics: {
        totalDecisionRecords: allDecisions.length,
        gxpRelevantRecords: gxpRelevant.length,
        signaturesRequired: signatureRequired.length,
        signaturesPending: signaturesPending.length,
        signaturesSigned: signaturesSigned.length,
        signaturesRejected: signatureRequired.filter(d => d.regulatory.signatureStatus === 'rejected').length,
      },
      complianceFrameworks: [
        {
          framework: 'FDA 21 CFR Part 11',
          sections: ['§11.10(e) Audit trails', '§11.10(k.2) Electronic signatures', '§11.50 Signature manifestation'],
          status: chainDependent(),
        },
        {
          framework: 'EU Annex 11',
          sections: ['§9 Audit trails', '§12 Security', '§14 Electronic signatures'],
          status: chainDependent(),
        },
        {
          framework: 'ICH E6(R2) GCP',
          sections: ['§5.5.3 Data integrity', '§5.5.4 Essential documents'],
          status: 'NOT_ASSESSED',
          note: 'No check in this report evaluates this framework.',
        },
        {
          framework: 'PMDA ERES Guidelines',
          sections: ['Electronic records management', 'Electronic signatures'],
          status: chainDependent(),
        },
        {
          framework: 'GAMP 5',
          sections: ['Data integrity by design', 'Risk-based approach'],
          status: 'NOT_ASSESSED',
          note: 'No check in this report evaluates this framework.',
        },
      ],
      attestation:
        chainStatus === 'VERIFIED'
          ? {
              statement:
                'This report was generated from an immutable, cryptographically-verified audit trail. All decision records are hash-chained and tamper-evident per FDA 21 CFR Part 11 requirements.',
              generatedBy: 'ClinicalSageAI Decision Lineage Engine',
              version: '1.0.0',
            }
          : null,
      attestationWithheld:
        chainStatus === 'VERIFIED'
          ? undefined
          : chainStatus === 'INTEGRITY_FAILURE'
            ? 'The audit chain failed verification; this report cannot attest to a tamper-evident trail.'
            : 'The audit chain verifier could not run; nothing was verified and nothing failed verification. The reason has been logged.',
    };

    res.json(report);
  } catch (err) {
    logger.error('Failed to generate compliance report', err);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

export default router;
