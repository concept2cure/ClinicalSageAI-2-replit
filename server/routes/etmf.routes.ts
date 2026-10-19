/**
 * eTMF REST surface — Trial Master File completeness / inspection-readiness.
 *
 * Deterministic assessment of a trial's filed artifacts against the DIA TMF
 * Reference Model (ICH E6(R3) Appendix C essential records). Mounted at /api/etmf
 * with authenticateToken applied at mount time.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { assessTmfCompleteness, getTmfReferenceModel } from '../services/etmf/tmf-completeness';
import {
  recordTmfArtifactFiling,
  listTmfArtifacts,
  removeTmfArtifactFiling,
  getTrialTmfCompleteness,
  TmfArtifactError,
} from '../services/etmf/tmf-artifact-persistence';
import { buildTmfInspectionPackage } from '../services/etmf/tmf-inspection-package';
import { createScopedLogger } from '../utils/logger.js';
import { combineAuditRowOutcomes, setAuditRowHeaders, type AuditRowOutcome } from '../services/audit/audit-write-outcome';

const logger = createScopedLogger('etmf-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function fail(res: Response, err: unknown): void {
  logger.error('etmf route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'eTMF request failed.' } });
}

interface Ctx { userId: number; organizationId: number }
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) return null;
  return { userId, organizationId };
}
function noAuth(res: Response) {
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
}

/** A server-side statement refusal proves that INSERT did not complete. A
 * network/driver completion loss does not prove absence and is read back. */
function confirmedStatementRefusal(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const coded = current as { code?: unknown; cause?: unknown };
    if (typeof coded.code === 'string' && (/^(22|23)[A-Z0-9]{3}$/.test(coded.code) || coded.code === '42501')) return true;
    current = coded.cause;
  }
  return false;
}

/** The DIA TMF Reference Model (zones + artifacts) for a checklist. */
router.get('/reference-model', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ zones: getTmfReferenceModel() });
});

/**
 * Assess a caller-supplied list of artifact codes against the TMF Reference
 * Model. Body: { providedArtifacts: string[], scope?: 'essential'|'all' }. The
 * codes are taken as given — nothing is checked against documents — and the
 * result says so (basis 'asserted_codes'); stored filings are assessed by
 * GET /trials/:trialId/completeness.
 */
router.post('/completeness', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.providedArtifacts)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'providedArtifacts[] is required.' } });
  }
  try {
    res.json(assessTmfCompleteness({ providedArtifacts: b.providedArtifacts, scope: b.scope }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Persisted per-trial TMF artifacts ─────────────────────────────────────────

/** File (or re-file) a TMF artifact for a trial. Body: { artifactCode, documentRef? }. */
router.post('/trials/:trialId/artifacts', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.artifactCode) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'artifactCode is required.' } });
  }
  try {
    const { auditTrail, ...row } = await recordTmfArtifactFiling({ trialId, artifactCode: String(b.artifactCode), documentRef: b.documentRef }, ctx);
    res.status(201).json({ ...row, meta: { auditTrail } });
  } catch (err) {
    if (err instanceof TmfArtifactError) return res.status(400).json({ error: { code: err.code, message: err.message } });
    fail(res, err);
  }
});

/** List a trial's filed TMF artifacts. */
router.get('/trials/:trialId/artifacts', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  try {
    res.json(await listTmfArtifacts(trialId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Inspection-readiness for a trial computed from its stored artifacts. ?scope=essential|all. */
router.get('/trials/:trialId/completeness', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  const scope = req.query.scope === 'all' ? 'all' : 'essential';
  try {
    res.json(await getTrialTmfCompleteness(trialId, ctx, scope));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Bulk-file TMF artifacts for a trial in one call (E3). Body:
 * { artifacts: [{ artifactCode, documentRef? }, ...] }. Previously artifacts
 * could only be filed one HTTP round-trip at a time. Each is recorded through
 * the same audited, idempotent path; the response reports per-item outcome so a
 * partial batch (one unknown code) is honest, not silently dropped.
 */
async function fileArtifactBatch(trialId: string, artifacts: any[], ctx: Ctx) {
    const results: Array<{ artifactCode: string; ok: boolean; error?: string; completion?: 'unconfirmed' | 'not-attempted'; auditTrail?: AuditRowOutcome }> = [];
    const outcomes: AuditRowOutcome[] = [];
    let stopped = false;
    for (const item of artifacts) {
      const artifactCode = String((item && item.artifactCode) ?? '');
      if (stopped) {
        results.push({ artifactCode, ok: false, error: 'NOT_ATTEMPTED', completion: 'not-attempted' });
        continue;
      }
      if (!artifactCode) {
        results.push({ artifactCode: '', ok: false, error: 'artifactCode required' });
        continue;
      }
      try {
        const { auditTrail } = await recordTmfArtifactFiling({ trialId, artifactCode, documentRef: item.documentRef }, ctx);
        outcomes.push(auditTrail);
        results.push({ artifactCode, ok: true, auditTrail });
      } catch (err) {
        if (err instanceof TmfArtifactError) {
          results.push({ artifactCode, ok: false, error: err.code });
        } else {
          // Earlier filings are committed independently. Preserve them and
          // their actual audit outcomes; never call a lost completion a
          // rollback or silently retry a potentially committed write.
          logger.error('TMF bulk filing stopped; read back before retry', { organizationId: ctx.organizationId });
          stopped = true;
          results.push({ artifactCode, ok: false, ...(confirmedStatementRefusal(err)
            ? { error: 'TMF_ARTIFACT_WRITE_REJECTED' }
            : { error: 'TMF_ARTIFACT_WRITE_UNCONFIRMED', completion: 'unconfirmed' as const }) });
        }
      }
    }
    return { results, outcomes, stopped };
}

router.post('/trials/:trialId/artifacts/bulk', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.artifacts) || b.artifacts.length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'artifacts[] is required and must be non-empty.' } });
  }
  if (b.artifacts.length > 500) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Batch limited to 500 artifacts.' } });
  }
  try {
    const { results, outcomes, stopped } = await fileArtifactBatch(trialId, b.artifacts, ctx);
    const filed = results.filter((r) => r.ok).length;
    const [first, ...rest] = outcomes;
    res.status(stopped ? 207 : 200).json({ filed, total: results.length, results,
      ...(stopped ? { partial: true, recovery: { method: 'GET', url: `/api/etmf/trials/${encodeURIComponent(trialId)}/artifacts`,
        message: 'Read back this trial’s filings before retrying the uncertain item or the remaining artifacts.' } } : {}),
      ...(first ? { meta: { auditTrail: combineAuditRowOutcomes(first, ...rest) } } : {}) });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Produce an inspection-readiness package (E3) — the missing eTMF deliverable.
 * Streams a ZIP (manifest + completeness + artifact index + README). Honest by
 * construction: metadata/readiness index only, never fabricated document bytes.
 * ?scope=essential|all.
 */
router.get('/trials/:trialId/inspection-package', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  const scope = req.query.scope === 'all' ? 'all' : 'essential';
  try {
    const pkg = await buildTmfInspectionPackage({
      trialId,
      organizationId: ctx.organizationId,
      scope,
      generatedAt: new Date().toISOString(),
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${pkg.fileName}"`);
    res.setHeader('X-TMF-SHA256', pkg.sha256);
    // 'undetermined' when the only gaps are references the service cannot check (ready === null).
    res.setHeader('X-TMF-Ready', pkg.ready === null ? 'undetermined' : String(pkg.ready));
    res.status(200).send(pkg.zip);
  } catch (err) {
    fail(res, err);
  }
});

/** Remove a filed TMF artifact. */
router.delete('/artifacts/:id', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    const { auditTrail } = await removeTmfArtifactFiling(id, ctx);
    setAuditRowHeaders(res, auditTrail);
    res.status(204).end();
  } catch (err) {
    if (err instanceof TmfArtifactError) return res.status(404).json({ error: { code: err.code, message: err.message } });
    fail(res, err);
  }
});

export default router;
