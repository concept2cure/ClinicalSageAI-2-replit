/**
 * Change Propagation Routes — governed value change, end to end.
 *
 * The fact-centric write path over the Living Record Spine: declare a governed
 * value, preview the blast radius of changing it, apply the change under
 * governance (drift flags + cascade + resolution plan + audit), and read the
 * version history. Thin BFF over fact-change-orchestrator.ts; read surfaces for
 * facts/bindings/drift live in /api/regulatory-graph.
 *
 *   POST /api/change-propagation/programs/:programId/facts          declare a governed value
 *   POST /api/change-propagation/facts/:factId/impact-preview       classify every citation vs a proposed value
 *   POST /api/change-propagation/facts/:factId/change               apply the governed change + propagate
 *   POST /api/change-propagation/facts/:factId/propagate            write the agreed value into divergent claim citations
 *   POST /api/change-propagation/facts/:factId/bind-section         cite a fact from a CTD/IND document section
 *   POST /api/change-propagation/programs/:programId/artifacts/:artifactId/scan-citations
 *                                                                   auto-detect + optionally bind the facts a CTD artifact's prose cites
 *   POST /api/change-propagation/programs/:programId/post-market/:documentId/scan-citations
 *                                                                   device/IVD: same, over a post-market document (PMS/PSUR/PMCF/SSCP)
 *   GET  /api/change-propagation/facts/:factId/history              supersession chain, newest first
 *   GET  /api/change-propagation/facts/:factId/trace                fact → establishing claim → source artifact + citations
 *   GET  /api/change-propagation/bindings/:bindingId/trace          citation → fact → claim → source artifact
 *
 * All routes require JWT auth and are org-scoped.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { authenticateToken } from '../middleware/auth';
import {
  applyFactChange,
  establishGovernedFact,
  factHistory,
  previewFactChange,
} from '../services/living-record/fact-change-orchestrator';
import { propagateFactToCitations } from '../services/living-record/fact-propagation';
import {
  bindSectionToFact,
  scanArtifactCitations,
  scanPostMarketCitations,
} from '../services/living-record/document-binder';
import type { FactChangeFailure } from '../services/living-record/fact-change';
import {
  traceBindingToSource,
  traceFactToSource,
} from '../services/living-record/source-tracer';
import type { ProposedFactValue } from '../services/living-record/fact-change';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('change-propagation');
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (same conventions as regulatory-graph.ts)
// ─────────────────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function actorId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

const FAILURE_STATUS: Record<FactChangeFailure['code'], number> = {
  not_found: 404,
  conflict: 409,
  invalid: 422,
};

function sendFailure(res: Response, failure: FactChangeFailure): void {
  res.status(FAILURE_STATUS[failure.code]).json({ error: failure.message, code: failure.code });
}

/** Parse the value fields shared by declare/preview/change bodies. */
function parseProposedValue(body: any): ProposedFactValue {
  const proposed: ProposedFactValue = {};
  if (body?.valueNum !== undefined && body?.valueNum !== null) {
    const n = typeof body.valueNum === 'number' ? body.valueNum : parseFloat(String(body.valueNum));
    if (Number.isFinite(n)) proposed.valueNum = n;
  }
  if (typeof body?.valueText === 'string') proposed.valueText = body.valueText;
  if (typeof body?.unit === 'string') proposed.unit = body.unit;
  if (typeof body?.valueType === 'string') proposed.valueType = body.valueType;
  return proposed;
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function parseBindingKind(v: unknown): 'mirror' | 'derived' | 'manual_override' | undefined {
  return v === 'mirror' || v === 'derived' || v === 'manual_override' ? v : undefined;
}

function parseTolerance(body: any): number | undefined {
  const t = body?.tolerance;
  const n = typeof t === 'number' ? t : t !== undefined ? parseFloat(String(t)) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function requireUuidProgramAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const programId = String(req.params.programId ?? '');
  if (!programId) {
    res.status(422).json({ error: 'programId is required' });
    return;
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await requestDb(req)
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

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// Declare a governed value directly (no claim required). 409 when an active
// fact already exists — changing an agreed value must go through /change.
router.post(
  '/programs/:programId/facts',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    try {
      const result = await establishGovernedFact({
        organizationId: orgId,
        programId: String(req.params.programId),
        entity: String(req.body?.entity ?? ''),
        field: String(req.body?.field ?? ''),
        value: parseProposedValue(req.body),
        comparator: typeof req.body?.comparator === 'string' ? req.body.comparator : undefined,
        confidence:
          typeof req.body?.confidence === 'number' ? req.body.confidence : undefined,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        actor: actorId(req),
      });
      if (!result.ok) return sendFailure(res, result);
      res.status(201).json(result);
    } catch (err: any) {
      return serverError(res, logger, 'saving facts', err);
    }
  }
);

// Impact preview: every citation of the value, classified against the proposed
// change. Read-only; with no proposed value it reports the current state.
router.post('/facts/:factId/impact-preview', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const proposed = parseProposedValue(req.body);
    const result = await previewFactChange({
      factId: String(req.params.factId),
      organizationId: orgId,
      proposed: Object.keys(proposed).length > 0 ? proposed : undefined,
      tolerance: parseTolerance(req.body),
    });
    if (!result.ok) return sendFailure(res, result);
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'saving impact preview', err);
  }
});

// Apply the governed change: re-version the fact, carry bindings forward, flag
// divergent citations, cascade downstream, open a resolution plan, audit.
router.post('/facts/:factId/change', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
  try {
    const result = await applyFactChange({
      factId: String(req.params.factId),
      organizationId: orgId,
      newValue: parseProposedValue(req.body),
      reason,
      actor: actorId(req),
      tolerance: parseTolerance(req.body),
    });
    if (!result.ok) return sendFailure(res, result);
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'saving change', err);
  }
});

// Propagate the agreed value into divergent claim citations (heals bindings,
// re-verifies claims, resolves drift). Prose targets and overrides are skipped
// with the reason reported; body may restrict to specific bindingIds.
router.post('/facts/:factId/propagate', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const bindingIds = Array.isArray(req.body?.bindingIds)
    ? req.body.bindingIds.map(String)
    : undefined;
  try {
    const result = await propagateFactToCitations({
      factId: String(req.params.factId),
      organizationId: orgId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      actor: actorId(req),
      bindingIds,
      tolerance: parseTolerance(req.body),
    });
    if (!result.ok) return sendFailure(res, result);
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'saving propagate', err);
  }
});

// Cite a governed fact from a CTD/IND document section. A mirror citation that
// already disagrees with the value is flagged on the spot.
router.post('/facts/:factId/bind-section', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const body = req.body ?? {};
  try {
    const result = await bindSectionToFact({
      factId: String(req.params.factId),
      organizationId: orgId,
      docRef: String(body.docRef ?? ''),
      sectionKey: optionalString(body.sectionKey),
      observedValue: String(body.observedValue ?? ''),
      observedUnit: optionalString(body.observedUnit),
      bindingKind: parseBindingKind(body.bindingKind),
      overrideReason: optionalString(body.overrideReason),
      actor: actorId(req),
    });
    if (!result.ok) return sendFailure(res, result);
    res.status(201).json(result);
  } catch (err: any) {
    return serverError(res, logger, 'saving bind section', err);
  }
});

// Scan a CTD artifact's prose for citations of the program's governed values.
// Preview by default; ?persist=true (or body.persist) binds the matches and
// flags any that already diverge.
router.post(
  '/programs/:programId/artifacts/:artifactId/scan-citations',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const persist = req.body?.persist === true || String(req.query.persist) === 'true';
    try {
      const result = await scanArtifactCitations({
        programId: String(req.params.programId),
        organizationId: orgId,
        artifactId: String(req.params.artifactId),
        persist,
        tolerance: parseTolerance(req.body),
        actor: actorId(req),
      });
      if (!result.ok) return sendFailure(res, result);
      res.json(result);
    } catch (err: any) {
      return serverError(res, logger, 'saving scan citations', err);
    }
  }
);

// Device/IVD: reconcile the numeric governed quantities across ALL of a
// program's post-market documents — cross-document divergence (a sensitivity /
// LoD / RPN restated differently in different documents) in one pass.
router.post(
  '/programs/:programId/reconcile-device-documents',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    try {
      const { reconcileDeviceDocuments } = await import(
        '../services/reconciliation/device-document-reconciler'
      );
      const tolerance =
        req.body && typeof req.body === 'object' && req.body.tolerance
          ? {
              absolute:
                typeof req.body.tolerance.absolute === 'number' ? req.body.tolerance.absolute : undefined,
              relative:
                typeof req.body.tolerance.relative === 'number' ? req.body.tolerance.relative : undefined,
            }
          : undefined;
      const result = await reconcileDeviceDocuments({
        programId: String(req.params.programId),
        organizationId: orgId,
        tolerance,
      });
      if (!result.ok) return res.status(404).json({ error: result.message, code: result.code });
      res.json(result);
    } catch (err: any) {
      return serverError(res, logger, 'saving reconcile device documents', err);
    }
  }
);

// Device/IVD: scan a post-market document (PMS/PSUR/PMCF/SSCP) for citations of
// the program's governed values. Same contract as the artifact scan.
router.post(
  '/programs/:programId/post-market/:documentId/scan-citations',
  requireUuidProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const persist = req.body?.persist === true || String(req.query.persist) === 'true';
    try {
      const result = await scanPostMarketCitations({
        programId: String(req.params.programId),
        organizationId: orgId,
        documentId: String(req.params.documentId),
        persist,
        tolerance: parseTolerance(req.body),
        actor: actorId(req),
      });
      if (!result.ok) return sendFailure(res, result);
      res.json(result);
    } catch (err: any) {
      return serverError(res, logger, 'saving scan citations', err);
    }
  }
);

// Source Tracer: fact → establishing claim → source artifact, plus every
// citation resolved back to its own source.
router.get('/facts/:factId/trace', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const result = await traceFactToSource(String(req.params.factId), orgId);
    if (!result.ok) return sendFailure(res, result);
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'loading trace', err);
  }
});

// Source Tracer, reverse walk: cited location → fact → claim → source artifact.
router.get('/bindings/:bindingId/trace', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const result = await traceBindingToSource(String(req.params.bindingId), orgId);
    if (!result.ok) return sendFailure(res, result);
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'loading trace', err);
  }
});

// Supersession chain for a fact, newest first.
router.get('/facts/:factId/history', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const result = await factHistory(String(req.params.factId), orgId);
    if (!result.ok) return sendFailure(res, result);
    res.json({ factId: String(req.params.factId), ...result, count: result.history.length });
  } catch (err: any) {
    return serverError(res, logger, 'loading history', err);
  }
});

export default router;
