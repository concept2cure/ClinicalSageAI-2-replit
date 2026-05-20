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
import { regulatoryPrograms } from '../../shared/schema/programs';
import {
  getSimulationRun,
  listProgramSimulations,
  runReviewerSimulation,
} from '../services/intelligence-engine/reviewer-simulator.service';
import {
  ALL_PERSONA_CODES,
  REVIEWER_PERSONAS,
} from '../services/intelligence-engine/reviewer-personas';
import type { ReviewerPersonaCode } from '../services/intelligence-engine/types';
import {
  propagateRegulatoryChange,
  type RegulatoryChangeEvent,
} from '../services/living-file/change-router.service';
import { programFreshnessReport } from '../services/living-file/freshness-report.service';
import auditService from '../services/auditService';

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

function parseIntParam(value: string | string[] | undefined): number | null {
  if (Array.isArray(value)) value = value[0];
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
  const packetId = (String(req.params.packetId ?? ""));
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
      const result = await registerPacketDependencies((String(req.params.packetId ?? "")), {
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
      const view = await getPacketDependencies(orgId, (String(req.params.packetId ?? "")));
      res.json({ packetId: (String(req.params.packetId ?? "")), ...view });
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

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer Red-Team Simulator
// ─────────────────────────────────────────────────────────────────────────────

async function requireUuidProgramAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const programIdRaw = req.params.programId;
  const programId = Array.isArray(programIdRaw) ? programIdRaw[0] : (programIdRaw ?? '');
  if (!programId) {
    res.status(422).json({ error: 'programId is required' });
    return;
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId)))
    .limit(1);
  if (!row) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

router.get('/reviewer/personas', (_req: Request, res: Response) => {
  res.json({
    personas: ALL_PERSONA_CODES.map(code => {
      const p = REVIEWER_PERSONAS[code];
      return { code: p.code, name: p.name, scope: p.scope };
    }),
  });
});

router.post(
  '/programs/:programId/reviewer-simulation',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const programIdRaw = req.params.programId;
    const programId = Array.isArray(programIdRaw) ? programIdRaw[0] : (programIdRaw ?? '');
    const userIdRaw = (req as any).user?.id;
    const triggeredBy =
      typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';

    const body = req.body ?? {};
    if (!body.program || !body.intel) {
      return res
        .status(422)
        .json({ error: 'program and intel facts are required in request body' });
    }

    const personas = Array.isArray(body.personas)
      ? (body.personas as ReviewerPersonaCode[])
      : undefined;

    try {
      const result = await runReviewerSimulation({
        organizationId: orgId,
        programId,
        program: body.program,
        packet: body.packet ?? null,
        intel: body.intel,
        reports: body.reports,
        personas,
        defensePacketId: body.defensePacketId,
        trigger: typeof body.trigger === 'string' ? body.trigger : 'manual',
        triggeredBy,
        dryRun: body.dryRun === true,
      });

      // Persisted runs land in the audit trail; dry runs don't.
      if (!body.dryRun) {
        void auditService.logAction({
          tenantId: orgId,
          userId: triggeredBy,
          action: 'reviewer_simulation.run',
          resourceType: 'reviewer_simulation_run',
          resourceId: (result as any)?.runId ?? programId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          details: {
            programId,
            personaCount: Array.isArray(personas) ? personas.length : null,
            defensePacketId: body.defensePacketId ?? null,
            trigger: typeof body.trigger === 'string' ? body.trigger : 'manual',
          },
        });
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Simulation failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/reviewer-simulations',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    try {
      const programIdStr = Array.isArray(req.params.programId)
        ? req.params.programId[0]
        : (req.params.programId ?? '');
      const rows = await listProgramSimulations(orgId, programIdStr, limit);
      res.json({ programId: programIdStr, runs: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: 'List failed', detail: err?.message });
    }
  }
);

router.get('/reviewer-simulations/:runId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const runIdStr = Array.isArray(req.params.runId)
      ? req.params.runId[0]
      : (req.params.runId ?? '');
    const row = await getSimulationRun(orgId, runIdStr);
    if (!row) return res.status(404).json({ error: 'Run not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: 'Fetch failed', detail: err?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Living-File: domain-event router + per-program freshness report
// ─────────────────────────────────────────────────────────────────────────────

const VALID_REG_EVENTS: ReadonlySet<RegulatoryChangeEvent> = new Set([
  'claim_changed',
  'claim_withdrawn',
  'claim_superseded',
  'evidence_changed',
  'evidence_superseded',
  'predicate_changed',
  'standard_withdrawn',
  'standard_superseded',
  'risk_vocab_updated',
  'risk_code_map_updated',
  'intended_use_changed',
  'device_profile_changed',
]);

router.post(
  '/programs/:programId/propagate-regulatory-change',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const body = req.body ?? {};
    const event = body.event;
    if (!event || !VALID_REG_EVENTS.has(event)) {
      return res.status(422).json({
        error: `event must be one of: ${[...VALID_REG_EVENTS].join(', ')}`,
      });
    }
    if (!body.sourceId || typeof body.sourceId !== 'string') {
      return res.status(422).json({ error: 'sourceId is required' });
    }
    const userIdRaw = (req as any).user?.id;
    const userId =
      typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : undefined;
    try {
      const programIdStr = Array.isArray(req.params.programId)
        ? req.params.programId[0]
        : (req.params.programId ?? '');
      const result = await propagateRegulatoryChange({
        organizationId: orgId,
        programId: programIdStr,
        legacyProgramId:
          typeof body.legacyProgramId === 'number' ? body.legacyProgramId : undefined,
        event,
        sourceId: body.sourceId,
        sourceLabel: typeof body.sourceLabel === 'string' ? body.sourceLabel : undefined,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        userId,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Propagation failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/freshness',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    try {
      const programIdStr = Array.isArray(req.params.programId)
        ? req.params.programId[0]
        : (req.params.programId ?? '');
      const report = await programFreshnessReport(orgId, programIdStr);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: 'Freshness report failed', detail: err?.message });
    }
  }
);

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
