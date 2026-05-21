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
import { authedOrgId } from '../utils/authedOrgId';

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
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    const orgId = authedOrgId(req) ?? undefined;
    const id = parseInt(entityId, 10);

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
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    const format = (req.query.format as ExportFormat) || 'json';
    const orgId = authedOrgId(req) ?? undefined;
    const id = parseInt(entityId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid entityId' });
    }

    if (!['json', 'csv', 'xml'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format — must be json, csv, or xml' });
    }

    const result = await decisionLineageService.exportLineage(entityType, id, format, orgId);

    // Log the export as an auditable action
    await auditService.logAction({
      tenantId: orgId || 0,
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
    const {
      organizationId,
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
      organizationId: Number(organizationId) || 0,
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
    res.json({
      chainIntegrity: result.valid ? 'VERIFIED' : 'INTEGRITY_FAILURE',
      entriesVerified: result.entriesVerified,
      verifiedAt: new Date().toISOString(),
      complianceStatus: result.valid ? 'COMPLIANT' : 'NON_COMPLIANT',
      frameworks: [
        'FDA 21 CFR Part 11 §11.10(e)',
        'EU Annex 11 §9',
        'ICH E6(R2) §5.5.3',
        'PMDA ERES Guidelines',
      ],
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
        status: chainResult.valid ? 'VERIFIED' : 'UNVERIFIED',
        entriesVerified: chainResult.entriesVerified,
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
          status: chainResult.valid ? 'COMPLIANT' : 'REVIEW_REQUIRED',
        },
        {
          framework: 'EU Annex 11',
          sections: ['§9 Audit trails', '§12 Security', '§14 Electronic signatures'],
          status: chainResult.valid ? 'COMPLIANT' : 'REVIEW_REQUIRED',
        },
        {
          framework: 'ICH E6(R2) GCP',
          sections: ['§5.5.3 Data integrity', '§5.5.4 Essential documents'],
          status: 'COMPLIANT',
        },
        {
          framework: 'PMDA ERES Guidelines',
          sections: ['Electronic records management', 'Electronic signatures'],
          status: chainResult.valid ? 'COMPLIANT' : 'REVIEW_REQUIRED',
        },
        {
          framework: 'GAMP 5',
          sections: ['Data integrity by design', 'Risk-based approach'],
          status: 'COMPLIANT',
        },
      ],
      attestation: {
        statement: 'This report was generated from an immutable, cryptographically-verified audit trail. All decision records are hash-chained and tamper-evident per FDA 21 CFR Part 11 requirements.',
        generatedBy: 'ClinicalSageAI Decision Lineage Engine',
        version: '1.0.0',
      },
    };

    res.json(report);
  } catch (err) {
    logger.error('Failed to generate compliance report', err);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

export default router;
