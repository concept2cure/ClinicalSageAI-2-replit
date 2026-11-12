/**
 * eTMF REST surface — Trial Master File completeness / inspection-readiness.
 *
 * Deterministic assessment of a study's filed artifacts against the DIA TMF
 * Reference Model (ICH E6(R3) Appendix C essential records). Mounted at /api/etmf
 * with authenticateToken applied at mount time.
 *
 * A TMF belongs to a study of a project (P-75; eTMF convergence E2). In every
 * `/trials/:trialId/…` route the trial is the study's own id string, the
 * `studyId` that GET /api/study-design?program_id= lists. A name that is not a
 * study of the caller's organization in a project the caller can open answers
 * 404 STUDY_NOT_FOUND, and nothing is read or written.
 *
 * Filing and removing are governed (E3): each needs the person's reason of at
 * least 8 characters (400 REASON_REQUIRED), and is recorded in the audit trail
 * by the transaction that makes the change. So is declaring a record not
 * applicable to the study (P-124 item 5), which is withdrawn as a filing is
 * removed. The inspection package is a recorded download.
 *
 * Refusals answer `{ success: false, error: <CODE>, message }`.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { requireGovernedReason } from './governed-reason';
import { assessTmfCompleteness, getTmfReferenceModel } from '../services/etmf/tmf-completeness';
import {
  recordTmfArtifactFiling,
  declareTmfArtifactNotApplicable,
  listTmfArtifacts,
  removeTmfArtifactFiling,
  getTrialTmfCompleteness,
  getTmfStudy,
  TmfArtifactError,
} from '../services/etmf/tmf-artifact-persistence';
import { buildTmfInspectionPackage, type InspectionPackageResult } from '../services/etmf/tmf-inspection-package';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { createScopedLogger } from '../utils/logger.js';
import { combineAuditRowOutcomes, setAuditRowHeaders, type AuditRowOutcome } from '../services/audit/audit-write-outcome';

const logger = createScopedLogger('etmf-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';
/**
 * Who reads a study's trial master file: everyone who may read the project's Vault (P-124 item 7, 2026-11-12). The
 * Vault's own reads admit an organization's viewer (routes/c2c/project-vault.ts), and ICH E6(R3) and the EMA's TMF
 * guideline expect monitors, auditors and inspectors to read the TMF without writing it. Each read still admits the
 * person to the study's project by the Vault's rule (tmf-study-access.ts). Every write keeps AUTHOR and the Vault's
 * write role. Until 2026-11-12 the reads required AUTHOR too, and a viewer met a failed read under the section's
 * view-only notice.
 */
const READERS = [AUTHOR, 'viewer'] as const;

function refuse(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ success: false, error: code, message });
}

/** A coded refusal goes to the caller as written; anything else is logged and answered without its text. */
function fail(res: Response, err: unknown): void {
  if (err instanceof TmfArtifactError) {
    if (err.status >= 500) logger.error('etmf route refused', { code: err.code });
    refuse(res, err.status, err.code, err.message);
    return;
  }
  logger.error('etmf route error', { err: err instanceof Error ? err.message : String(err) });
  refuse(res, 500, 'INTERNAL', 'eTMF request failed.');
}

interface Ctx { userId: number; organizationId: number; ipAddress?: string; userAgent?: string }
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) return null;
  const agent = req.headers['user-agent'];
  // Where the request came from, for the audit row of a write.
  return { userId, organizationId, ipAddress: req.ip, userAgent: typeof agent === 'string' ? agent : undefined };
}
function noAuth(res: Response) {
  return refuse(res, 401, 'AUTH_REQUIRED', 'Authentication required.');
}
const trialIdOf = (req: Request): string => String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
const bodyOf = (req: Request): any => (req.body && typeof req.body === 'object' ? req.body : {});

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
router.get('/reference-model', limiter, requireRole(...READERS), (_req: Request, res: Response) => {
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
  const b = bodyOf(req);
  if (!Array.isArray(b.providedArtifacts)) {
    return refuse(res, 400, 'VALIDATION', 'providedArtifacts[] is required.');
  }
  try {
    res.json(assessTmfCompleteness({ providedArtifacts: b.providedArtifacts, scope: b.scope }));
  } catch (err) {
    fail(res, err);
  }
});

// ── A study's persisted TMF ───────────────────────────────────────────────────

/**
 * File (or re-file) a TMF artifact for a study. Body: { artifactCode, documentRef?, reason }.
 * With `notApplicable: true` and no documentRef, declare the record not applicable to the study instead: the reason is
 * why it does not apply (P-124 item 5). A record with a live filing answers 409 RECORD_FILED.
 */
router.post('/trials/:trialId/artifacts', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = bodyOf(req);
  if (!b.artifactCode) {
    return refuse(res, 400, 'VALIDATION', 'artifactCode is required.');
  }
  const declaring = b.notApplicable === true;
  if (declaring && typeof b.documentRef === 'string' && b.documentRef.trim()) {
    return refuse(res, 400, 'NOT_APPLICABLE_WITH_DOCUMENT',
      'A record declared not applicable names no document. Send either a document or the declaration. Nothing was changed.');
  }
  try {
    const input = { trialId: trialIdOf(req), artifactCode: String(b.artifactCode), reason: b.reason };
    const { auditTrail, ...row } = declaring
      ? await declareTmfArtifactNotApplicable(input, ctx)
      : await recordTmfArtifactFiling({ ...input, documentRef: b.documentRef }, ctx);
    res.status(201).json({ ...row, meta: { auditTrail } });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * List a study's live filings. Each carries `document`: `{ id, title, version, current }` when its reference is a
 * live Vault document of the study's project, else null.
 */
router.get('/trials/:trialId/artifacts', limiter, requireRole(...READERS), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  try {
    res.json(await listTmfArtifacts(trialIdOf(req), ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Inspection-readiness for a study computed from its stored filings, with the study. ?scope=essential|all. */
router.get('/trials/:trialId/completeness', limiter, requireRole(...READERS), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const scope = req.query.scope === 'all' ? 'all' : 'essential';
  try {
    res.json(await getTrialTmfCompleteness(trialIdOf(req), ctx, scope));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Bulk-file TMF artifacts for a study in one call. Body:
 * { artifacts: [{ artifactCode, documentRef? }, ...], reason }. Previously
 * artifacts could only be filed one HTTP round-trip at a time. Each is recorded
 * through the same governed, idempotent path, in its own transaction and under
 * the one stated reason; the response reports per-item outcome so a partial
 * batch (one unknown code) is honest, not silently dropped.
 */
async function fileArtifactBatch(trialId: string, artifacts: any[], reason: string, ctx: Ctx) {
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
        const { auditTrail } = await recordTmfArtifactFiling({ trialId, artifactCode, documentRef: item.documentRef, reason }, ctx);
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
  const trialId = trialIdOf(req);
  const b = bodyOf(req);
  if (!Array.isArray(b.artifacts) || b.artifacts.length === 0) {
    return refuse(res, 400, 'VALIDATION', 'artifacts[] is required and must be non-empty.');
  }
  if (b.artifacts.length > 500) {
    return refuse(res, 400, 'VALIDATION', 'Batch limited to 500 artifacts.');
  }
  // One stated reason for the batch, checked before anything is read.
  const reason = requireGovernedReason(b.reason);
  if (!reason.ok) return refuse(res, 400, 'REASON_REQUIRED', reason.error);
  try {
    // The study is the whole request's: a name that is no study answers 404 once, not once per item.
    await getTmfStudy(trialId, ctx);
    const { results, outcomes, stopped } = await fileArtifactBatch(trialId, b.artifacts, reason.reason, ctx);
    const filed = results.filter((r) => r.ok).length;
    const [first, ...rest] = outcomes;
    res.status(stopped ? 207 : 200).json({ filed, total: results.length, results,
      ...(stopped ? { partial: true, recovery: { method: 'GET', url: `/api/etmf/trials/${encodeURIComponent(trialId)}/artifacts`,
        message: 'Read back this study’s filings before retrying the uncertain item or the remaining artifacts.' } } : {}),
      ...(first ? { meta: { auditTrail: combineAuditRowOutcomes(first, ...rest) } } : {}) });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * The response a recorded download writes to: the recorder's own headers, and
 * the package's readiness and hash added only when the bytes are sent, so a
 * refused delivery carries none of them.
 */
function packageResponse(res: Response, pkg: InspectionPackageResult) {
  return {
    setHeader: (name: string, value: string | number) => res.setHeader(name, value),
    send: (body: Buffer) => {
      res.setHeader('X-TMF-SHA256', pkg.sha256);
      // 'undetermined' when the only gaps are references the service cannot check (ready === null).
      res.setHeader('X-TMF-Ready', pkg.ready === null ? 'undetermined' : String(pkg.ready));
      return res.status(200).send(body);
    },
  };
}

/**
 * Produce a study's inspection-readiness package — the eTMF deliverable.
 * Streams a ZIP (manifest + completeness + artifact index + README). Honest by
 * construction: metadata/readiness index only, never fabricated document bytes.
 * ?scope=essential|all.
 *
 * A recorded download (E3): EXPORT_GENERATED is written with the SHA-256 of
 * these bytes before one is sent, and nothing is sent when that row does not
 * persist (503 UNAUDITED_EXPORT_REFUSED). Until 2026-11-10 the package left
 * with nothing recorded.
 */
router.get('/trials/:trialId/inspection-package', limiter, requireRole(...READERS), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const scope = req.query.scope === 'all' ? 'all' : 'essential';
  try {
    const pkg = await buildTmfInspectionPackage({
      trialId: trialIdOf(req),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      scope,
      generatedAt: new Date().toISOString(),
    });
    await sendAuditedDownload(packageResponse(res, pkg), {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      sourceType: 'export_zip',
      backendRoute: '/api/etmf/trials/:trialId/inspection-package',
      resourceType: 'tmf_inspection_package',
      resourceId: String(pkg.study.id),
      programUuid: pkg.study.programId,
      filename: pkg.fileName,
      mimeType: 'application/zip',
      buffer: pkg.zip,
      metadata: { studyRef: pkg.study.id, studyId: pkg.study.studyId, programId: pkg.study.programId, scope,
        ready: pkg.ready, artifactCount: pkg.artifactCount },
    });
  } catch (err) {
    if (isUnauditedExportRefusal(err)) {
      logger.error('TMF inspection package not delivered: its record did not persist', { organizationId: ctx.organizationId });
      refuse(res, 503, 'UNAUDITED_EXPORT_REFUSED',
        'The inspection package was not delivered because its record could not be written. Nothing was sent. Try again.');
      return;
    }
    fail(res, err);
  }
});

/** Remove a filed TMF artifact, or withdraw a declaration. Body: { reason }. The row stays on record as removed. */
router.delete('/artifacts/:id', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    const { auditTrail } = await removeTmfArtifactFiling({ id, reason: bodyOf(req).reason }, ctx);
    setAuditRowHeaders(res, auditTrail);
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

export default router;
