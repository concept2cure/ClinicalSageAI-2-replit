/**
 * Sequences filed outside the platform, declared on a US submission (D7, W5,
 * 2026-10-29; services/submission-service/filed-sequence-baseline.ts):
 *
 *   GET  /api/submissions/:id/filed-baseline   the declaration in force, or null
 *   POST /api/submissions/:id/filed-baseline   declare it, as a signed act
 *
 * Mounted beside the submission core router, behind the same authentication
 * (register-governance-routes.ts). Both read the submission as every
 * submission read does (getSubmissionForRequest: the caller's current project
 * access) before anything else. The declaration is signed through the
 * platform's one ceremony (governed-signed-act.ts): reason, meaning, password,
 * signing authority, and the ledger pair and signature in the transaction
 * that writes it. The signature binds the declaration's content and evidence
 * (BINDING_BASIS.FILED_SEQUENCE_BASELINE_CONTENT), and the database refuses a
 * declaration without it.
 */
import { randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requestPgClient } from '../db/requestDb';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { serverError } from '../lib/api-response';
import { ProgramReadAccessError } from '../services/c2c/current-program-access';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { BINDING_BASIS } from '../services/part11/signature-persistence';
import {
  FILED_BASELINE_CODE_STATUS,
  assertMayDeclare,
  declareFiledBaseline,
  nextAfter,
} from '../services/submission-service/filed-sequence-baseline';
import {
  FILED_BASELINE_TARGET_PREFIX,
  readCurrentFiledBaseline,
  type BaselineQueryable,
} from '../services/submission-service/filed-sequence-baseline-content';
import { getSubmissionForRequest, SubmissionReadError } from '../services/submission-service/submission-request-read';
import { createScopedLogger } from '../utils/logger';
import { signGovernedAct, signedActAttempts, signedActBody } from './governed-signed-act';

const log = createScopedLogger('submission-filed-baseline');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

const declarationBody = signedActBody.extend({
  lastFiledSequence: z.string().regex(/^\d{4}$/, 'The last sequence filed is four digits, for example 0041.'),
  originalSequence: z.string().regex(/^\d{4}$/, "The Original Application's sequence is four digits, usually 0000."),
  evidenceDocumentId: z.string().min(1, "Name the Vault document that holds the agency's acknowledgment."),
});

function actorOf(req: Request): { organizationId: number; userId: number } | null {
  const r = req as { user?: { id?: unknown; organizationId?: unknown }; tenantContext?: { organizationId?: unknown }; tenantId?: unknown };
  const userId = Number(r.user?.id);
  const organizationId = Number(r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) return null;
  return { organizationId, userId };
}

function submissionIdOf(req: Request): number | null {
  const n = Number(req.params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The submission, under the caller's current project access; answers a refusal and returns false. */
async function readable(req: Request, res: Response, actor: { organizationId: number; userId: number }, id: number): Promise<boolean> {
  try {
    await getSubmissionForRequest(requestPgClient(req), actor, id);
    return true;
  } catch (err) {
    if ((err instanceof SubmissionReadError || err instanceof ProgramReadAccessError) && err.status !== 503) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
    } else if (err instanceof SubmissionReadError || err instanceof ProgramReadAccessError) {
      log.error('Submission read verification unavailable', { error: err });
      res.status(503).json({ error: { code: err.code, message: 'The submission records could not be verified. Refresh and try again.' } });
    } else {
      serverError(res, log, 'reading the submission', err);
    }
    return false;
  }
}

/** Who signed the declaration, by name, and the signature it carries. */
async function signatureOf(q: BaselineQueryable, orgId: number, baselineId: string, declaredBy: number) {
  const [name, signature] = await Promise.all([
    q.query('SELECT name FROM public.actor_name($1)', [declaredBy]),
    q.query(
      `SELECT id, signature_meaning FROM public.electronic_signatures
        WHERE organization_id = $1 AND signed_target = $2 AND signature_type = 'governed-action'
        ORDER BY id DESC LIMIT 1`,
      [orgId, `${FILED_BASELINE_TARGET_PREFIX}:${baselineId}`],
    ),
  ]);
  const row = signature.rows[0];
  return {
    declaredByName: typeof name.rows[0]?.name === 'string' ? name.rows[0].name : null,
    signatureId: row ? Number(row.id) : null,
    meaning: row ? String(row.signature_meaning) : null,
  };
}

router.get('/:id/filed-baseline', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = submissionIdOf(req);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  if (!(await readable(req, res, actor, id))) return;
  try {
    const q = requestPgClient(req) as unknown as BaselineQueryable;
    const baseline = await readCurrentFiledBaseline(q, actor.organizationId, id);
    if (!baseline) return res.json({ baseline: null });
    const signed = await signatureOf(q, actor.organizationId, baseline.id, baseline.declaredBy);
    return res.json({ baseline: { ...baseline, ...signed, nextSequence: nextAfter(baseline.lastFiledSequence) } });
  } catch (err) {
    return serverError(res, log, 'reading the filed-elsewhere declaration', err);
  }
});

router.post('/:id/filed-baseline', limiter, requireRole(AUTHOR), signedActAttempts, async (req: Request, res: Response) => {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = submissionIdOf(req);
  if (submissionId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = declarationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'The declaration is incomplete. Nothing was signed.', details: parsed.error.flatten() } });
  }
  if (!(await readable(req, res, actor, submissionId))) return;
  const declaration = {
    id: randomUUID(),
    submissionId,
    lastFiledSequence: parsed.data.lastFiledSequence,
    originalSequence: parsed.data.originalSequence,
    evidenceDocumentId: parsed.data.evidenceDocumentId.trim(),
    reason: parsed.data.reason,
  };
  await signGovernedAct(req, res, {
    domain: 'submissions',
    target: `${FILED_BASELINE_TARGET_PREFIX}:${declaration.id}`,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: FILED_BASELINE_CODE_STATUS,
    contentBasis: BINDING_BASIS.FILED_SEQUENCE_BASELINE_CONTENT,
    precheck: (client, orgId, userId) => assertMayDeclare(client as unknown as BaselineQueryable, orgId, userId, submissionId),
    run: (client, orgId, userId) => declareFiledBaseline(client as unknown as BaselineQueryable, orgId, userId, declaration),
  });
});

export default router;
