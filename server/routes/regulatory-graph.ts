/**
 * Regulatory Graph Routes
 *
 * Read-only traversal + coverage endpoints over the regulatory knowledge graph.
 * All routes require JWT auth and verify the caller has access to the program.
 *
 *   GET /api/regulatory-graph/programs/:programId/coverage
 *   GET /api/regulatory-graph/programs/:programId/orphan-claims
 *   GET /api/regulatory-graph/programs/:programId/contradicted-claims
 *   GET /api/regulatory-graph/programs/:programId/section-coverage
 *   GET /api/regulatory-graph/claims/:claimId/evidence
 *   GET /api/regulatory-graph/evidence/:evidenceId/claims
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { deviceClaims } from '../../shared/schema/regulatory-graph';
import { authenticateToken } from '../middleware/auth';
import {
  computeSectionCoverage,
  findContradictedClaims,
  findOrphanClaims,
  programCoverageReport,
  traceClaimEvidence,
  tracingClaimsForEvidence,
} from '../services/regulatory-graph/regulatory-graph.service';

const router = Router();

router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction) {
  const programId = req.params.programId;
  if (!programId) {
    return res.status(422).json({ error: 'programId is required' });
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  try {
    const [program] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId))
      )
      .limit(1);
    if (!program) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Access check failed', detail: err?.message });
  }
}

async function requireClaimAccess(req: Request, res: Response, next: NextFunction) {
  const claimId = req.params.claimId;
  if (!claimId) return res.status(422).json({ error: 'claimId is required' });
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const [claim] = await db
      .select({ id: deviceClaims.id })
      .from(deviceClaims)
      .where(and(eq(deviceClaims.id, claimId), eq(deviceClaims.organizationId, orgId)))
      .limit(1);
    if (!claim) return res.status(403).json({ error: 'Access denied' });
    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Access check failed', detail: err?.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/programs/:programId/coverage',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const report = await programCoverageReport(req.params.programId);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: 'Coverage report failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/orphan-claims',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const orphans = await findOrphanClaims(req.params.programId);
      res.json({ programId: req.params.programId, orphans, count: orphans.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Orphan-claim query failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/contradicted-claims',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const contradicted = await findContradictedClaims(req.params.programId);
      res.json({
        programId: req.params.programId,
        contradicted,
        count: contradicted.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Contradicted-claim query failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/section-coverage',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const coverage = await computeSectionCoverage(req.params.programId);
      res.json({ programId: req.params.programId, sections: coverage });
    } catch (err: any) {
      res.status(500).json({ error: 'Section coverage failed', detail: err?.message });
    }
  }
);

router.get(
  '/claims/:claimId/evidence',
  requireClaimAccess,
  async (req: Request, res: Response) => {
    try {
      const trace = await traceClaimEvidence(req.params.claimId);
      if (!trace) return res.status(404).json({ error: 'Claim not found' });
      res.json(trace);
    } catch (err: any) {
      res.status(500).json({ error: 'Trace failed', detail: err?.message });
    }
  }
);

router.get('/evidence/:evidenceId/claims', async (req: Request, res: Response) => {
  // Org access on the evidence side is enforced at the evidence-management layer;
  // here we only need a valid auth context.
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const traces = await tracingClaimsForEvidence(req.params.evidenceId);
    // Filter out claims from other orgs in case of cross-tenant leakage.
    const safe = traces.filter(t => t.claim.organizationId === orgId);
    res.json({ evidenceId: req.params.evidenceId, claims: safe, count: safe.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Reverse trace failed', detail: err?.message });
  }
});

export default router;
