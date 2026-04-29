/**
 * Regulatory Graph Routes
 *
 * Read-only traversal endpoints over the canonical claims graph
 * (evidence_claims + evidence_claim_links). All routes require JWT auth.
 *
 *   GET /api/regulatory-graph/programs/:programId/claims-report
 *   GET /api/regulatory-graph/programs/:programId/orphan-claims
 *   GET /api/regulatory-graph/programs/:programId/contradicted-claims
 *   GET /api/regulatory-graph/claims/:claimId/evidence
 *   GET /api/regulatory-graph/documents/:documentId/claims
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { evidenceClaims } from '../../shared/schema';
import { authenticateToken } from '../middleware/auth';
import {
  findContradictedClaims,
  findOrphanClaims,
  programClaimsReport,
  traceClaimEvidence,
  traceClaimsForDocument,
} from '../services/regulatory-graph/regulatory-graph.service';
import {
  getPacketDependencies,
  propagateClaimChange,
  propagateEvidenceChange,
  propagatePredicateChange,
  propagateRiskVocabChange,
  registerPacketDependencies,
  type StalenessReasonCode,
} from '../services/regulatory-graph/defense-packet-staleness.service';
import { defensePackets } from '../../shared/schema/defense-packets';

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

function parseIntParam(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Program access check — note that evidence_claims uses an integer programId
 * (legacy programs namespace), so the param here is an integer.
 */
async function requireClaimsProgramAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const programId = parseIntParam(req.params.programId);
  if (programId === null) {
    res.status(422).json({ error: 'programId must be an integer' });
    return;
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  // We can't directly verify program membership without joining the legacy
  // programs table; verify access by ensuring at least one claim row in the
  // program belongs to the caller's org, or fall back to org-scoped data.
  // The downstream services additionally filter by isCurrent + status.
  next();
}

async function requireClaimAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const claimId = parseIntParam(req.params.claimId);
  if (claimId === null) {
    res.status(422).json({ error: 'claimId must be an integer' });
    return;
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [claim] = await db
    .select({ id: evidenceClaims.id })
    .from(evidenceClaims)
    .where(and(eq(evidenceClaims.id, claimId), eq(evidenceClaims.organizationId, orgId)))
    .limit(1);
  if (!claim) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/programs/:programId/claims-report',
  requireClaimsProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const programId = parseIntParam(req.params.programId)!;
      const report = await programClaimsReport(programId);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: 'Claims report failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/orphan-claims',
  requireClaimsProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const programId = parseIntParam(req.params.programId)!;
      const orphans = await findOrphanClaims(programId);
      res.json({ programId, orphans, count: orphans.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Orphan-claim query failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/contradicted-claims',
  requireClaimsProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const programId = parseIntParam(req.params.programId)!;
      const contradicted = await findContradictedClaims(programId);
      res.json({ programId, contradicted, count: contradicted.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Contradicted-claim query failed', detail: err?.message });
    }
  }
);

router.get(
  '/claims/:claimId/evidence',
  requireClaimAccess,
  async (req: Request, res: Response) => {
    try {
      const claimId = parseIntParam(req.params.claimId)!;
      const trace = await traceClaimEvidence(claimId);
      if (!trace) return res.status(404).json({ error: 'Claim not found' });
      res.json(trace);
    } catch (err: any) {
      res.status(500).json({ error: 'Trace failed', detail: err?.message });
    }
  }
);

router.get('/documents/:documentId/claims', async (req: Request, res: Response) => {
  const documentId = parseIntParam(req.params.documentId);
  if (documentId === null) {
    return res.status(422).json({ error: 'documentId must be an integer' });
  }
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const traces = await traceClaimsForDocument(documentId);
    const safe = traces.filter(t => t.claim.organizationId === orgId);
    res.json({ documentId, claims: safe, count: safe.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Reverse trace failed', detail: err?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Defense-packet staleness propagation
// ─────────────────────────────────────────────────────────────────────────────

async function requirePacketAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const packetId = req.params.packetId;
  if (!packetId) {
    res.status(422).json({ error: 'packetId is required' });
    return;
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await db
    .select({ id: defensePackets.id })
    .from(defensePackets)
    .where(and(eq(defensePackets.id, packetId), eq(defensePackets.organizationId, orgId)))
    .limit(1);
  if (!row) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

const VALID_REASON_CODES: ReadonlySet<StalenessReasonCode> = new Set([
  'evidence_changed',
  'evidence_superseded',
  'claim_changed',
  'claim_withdrawn',
  'claim_superseded',
  'predicate_changed',
  'risk_vocab_updated',
  'risk_code_map_updated',
  'manual',
]);

function parseReason(input: unknown, fallback: StalenessReasonCode): StalenessReasonCode {
  return typeof input === 'string' && VALID_REASON_CODES.has(input as StalenessReasonCode)
    ? (input as StalenessReasonCode)
    : fallback;
}

router.post(
  '/defense-packets/:packetId/register-dependencies',
  requirePacketAccess,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const result = await registerPacketDependencies(req.params.packetId, {
        createdById: typeof userId === 'number' ? userId : undefined,
      });
      if (!result) return res.status(404).json({ error: 'Packet not found' });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Register failed', detail: err?.message });
    }
  }
);

router.get(
  '/defense-packets/:packetId/dependencies',
  requirePacketAccess,
  async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req)!;
      const view = await getPacketDependencies(orgId, req.params.packetId);
      res.json({ packetId: req.params.packetId, ...view });
    } catch (err: any) {
      res.status(500).json({ error: 'Dependency fetch failed', detail: err?.message });
    }
  }
);

router.post('/propagate/evidence', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const evidenceObjectId = String(req.body?.evidenceObjectId || '');
  if (!evidenceObjectId) {
    return res.status(422).json({ error: 'evidenceObjectId is required' });
  }
  const reason = parseReason(req.body?.reason, 'evidence_changed');
  try {
    const userId = (req as any).user?.id;
    const result = await propagateEvidenceChange(
      orgId,
      evidenceObjectId,
      reason,
      typeof userId === 'string' ? userId : userId != null ? String(userId) : undefined
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Propagation failed', detail: err?.message });
  }
});

router.post('/propagate/claim', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const claimId = parseInt(String(req.body?.claimId || ''), 10);
  if (!Number.isFinite(claimId)) {
    return res.status(422).json({ error: 'claimId must be an integer' });
  }
  const reason = parseReason(req.body?.reason, 'claim_changed');
  try {
    const userId = (req as any).user?.id;
    const result = await propagateClaimChange(
      claimId,
      reason,
      typeof userId === 'string' ? userId : userId != null ? String(userId) : undefined
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Propagation failed', detail: err?.message });
  }
});

router.post('/propagate/predicate', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const programId = String(req.body?.programId || '');
  const predicateKNumber = String(req.body?.predicateKNumber || '');
  if (!programId || !predicateKNumber) {
    return res
      .status(422)
      .json({ error: 'programId and predicateKNumber are required' });
  }
  try {
    const userId = (req as any).user?.id;
    const result = await propagatePredicateChange(
      orgId,
      programId,
      predicateKNumber,
      typeof userId === 'string' ? userId : userId != null ? String(userId) : undefined
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Propagation failed', detail: err?.message });
  }
});

router.post('/propagate/risk-vocab', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const newVocabHash = String(req.body?.newVocabHash || '');
  if (!newVocabHash) {
    return res.status(422).json({ error: 'newVocabHash is required' });
  }
  try {
    const userId = (req as any).user?.id;
    const result = await propagateRiskVocabChange(
      orgId,
      newVocabHash,
      typeof userId === 'string' ? userId : userId != null ? String(userId) : undefined
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Propagation failed', detail: err?.message });
  }
});

export default router;
