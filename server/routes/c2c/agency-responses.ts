/**
 * Answers to an agency letter: its questions, a response to each, the Part 11
 * signature that approves a response, the response history, the commitments
 * made in it, and the response package. Registered on the Communication Center
 * router (communication-center.ts), so every path here runs behind the same
 * chain as the inbox it extends: rate limit → auth → tenant context →
 * organization → project admission (a write needs a governed write role and
 * project edit).
 *
 *   GET  /projects/:projectId/agency-communications/:eventId/questions
 *   POST /projects/:projectId/agency-communications/:eventId/questions
 *   PUT  /projects/:projectId/agency-communications/:eventId/questions/:questionId/response
 *   POST /projects/:projectId/agency-communications/:eventId/questions/:questionId/approve
 *   POST /projects/:projectId/agency-communications/:eventId/questions/:questionId/withdraw
 *   POST /projects/:projectId/agency-communications/:eventId/questions/:questionId/commitments
 *   POST /projects/:projectId/agency-communications/:eventId/no-response-required
 *   POST /projects/:projectId/agency-communications/:eventId/response-package
 *   GET  /projects/:projectId/commitments
 *   GET  /projects/:projectId/commitments/:commitmentId/fulfilment-options
 *   POST /projects/:projectId/commitments/:commitmentId/fulfill
 *
 * The two commitment fulfilment routes are commitment-fulfil-route.ts, shared
 * with the organisation's door (2026-10-19, P-41): a PMR, PMC or REMS is
 * fulfilled by a Part 11 signature naming the sequence or Vault version that
 * met it, here constrained to this project's program.
 *
 * ── Why (rows D2 and D5, 2026-10-18) ────────────────────────────────────────
 * The inbox kept a letter's questions as strings and closed a letter nobody
 * had answered; the agency-questions screen "approved" a response by setting
 * a status. P-32 kept that screen locked until approval was a signed act.
 * Here approval IS the signed act: the platform's one ceremony
 * (governed-signed-act.ts: reason, meaning, password, second factor when
 * enrolled, signing authority, ledger and signature row on one transaction),
 * and the signature binds the exact text approved
 * (BINDING_BASIS.AGENCY_RESPONSE_CONTENT). Whether a response is approved is
 * read from the signature table every time; there is no flag to disagree with
 * it. Every text a response has had is kept, so what a signature approved can
 * be read back after an edit. The package is assembled only from responses
 * approved as they stand, and leaves the system through the audited export
 * path, which records the sha256 of the bytes delivered.
 *
 * No model is called here. AnA drafts in the conversation ("Draft response
 * with AnA" on the inbox card); a person saves the words and another person
 * signs them. No AnA tool can sign.
 *
 * @module server/routes/c2c/agency-responses
 */

import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requestPgClient } from '../../db/requestDb';
import { serverError } from '../../lib/api-response';
import { governedActorId } from '../../middleware/orgMembership';
import { createCommitmentTx, HaError, listCommitments } from '../../services/ha-interactions/ha-service';
import { recordHaCommitmentCreated } from '../../services/ha-metrics';
import { checkSigningAuthority } from '../../services/part11/signing-authority-gate';
import { DECISION_ACT_MEANINGS } from '../../services/part11/signature-meanings';
import { setTenantContextTx } from '../../services/tenant/governed-tenant-context';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../../services/export/governedExportConsequence';
import { assembleResponsePackage, closeRefusal, outstandingResponses } from '../../services/agency-responses/response-logic';
import { renderResponsePackageDocx } from '../../services/agency-responses/response-package-docx';
import {
  AGENCY_RESPONSE_CODE_STATUS,
  AgencyResponseError,
  closeLetterTx,
  insertQuestionTx,
  markNoResponseRequiredTx,
  prepareApprovalTx,
  questionForCommitment,
  questionForViewer,
  readLetter,
  readQuestions,
  saveResponseTx,
  withdrawQuestionTx,
  type LetterRow,
  type Queryable,
} from '../../services/agency-responses/response-service';
import { createScopedLogger } from '../../utils/logger';
import { governedReason } from '../governed-reason';
import { signGovernedAct, signedActAttempts } from '../governed-signed-act';
import {
  answerFulfilmentFailure,
  commitmentsForRequest,
  fulfilCommitmentRoute,
  fulfilmentOptionsRoute,
  governedRequestWrite,
  type CommitmentDoor,
} from '../commitment-fulfil-route';
import { requireProjectAdmission, ProjectAdmissionRefusal } from './project-access';
import { getOrganizationId, sendError, sendSuccess } from './shared';

const log = createScopedLogger('agency-responses');

const BASE = '/projects/:projectId/agency-communications/:eventId';
const DOMAIN = 'correspondence';
const MAX_INT = 2147483647;

/** A calendar date that exists: 2026-02-31 is refused here, not by PostgreSQL as a 500. */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd.')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, 'That date does not exist.');

const questionBody = z.object({
  questionRef: z.string().trim().min(1, 'Give the number the agency used for this question.').max(40),
  questionText: z.string().trim().min(1, 'Paste the question as the agency worded it.').max(20000),
  discipline: z.string().trim().max(80).optional(),
  severity: z.enum(['minor', 'major', 'critical']).default('major'),
  reason: governedReason,
});

const responseBody = z.object({
  responseText: z.string().max(100000),
  expectedRevision: z.number().int().min(0).max(MAX_INT),
  reason: governedReason,
});

const approveBody = z.object({ expectedRevision: z.number().int().min(0).max(MAX_INT) });
const reasonBody = z.object({ reason: governedReason });

const commitmentBody = z.object({
  commitmentType: z.enum(['pmr', 'pmc', 'rems', 'meeting_commitment', 'other']),
  description: z.string().trim().min(1).max(4000),
  dueDate: dateStr.optional(),
  regulatoryBasis: z.string().trim().max(500).optional(),
  reason: governedReason,
});

const packageBody = z.object({ format: z.enum(['md', 'docx']).default('md') });

/** Who may see a letter of a visibility tier (communication-center.ts canViewVisibilityTier). */
export type VisibilityCheck = (tier: any, role?: string) => boolean;

interface Scope {
  orgId: number;
  userId: number;
  projectId: number;
  eventId: string;
}

/** Today as the server's calendar day (UTC); the overdue rule reads it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function scopeOf(req: Request, res: Response): Scope | null {
  const userId = governedActorId(req);
  let orgId: number;
  try {
    orgId = getOrganizationId(req);
  } catch {
    sendError(res, 401, 'Organization context required.', undefined, 'AUTH_REQUIRED');
    return null;
  }
  if (userId === null) {
    sendError(res, 401, 'A signed-in user is required.', undefined, 'AUTH_REQUIRED');
    return null;
  }
  // router.param('projectId') has already admitted the project and replaced a
  // program uuid with its integer anchor.
  const projectId = Number(req.params.projectId);
  const eventId = String(req.params.eventId ?? '').trim();
  if (!Number.isInteger(projectId) || projectId <= 0 || !eventId) {
    sendError(res, 404, 'That communication was not found in this project.', undefined, 'LETTER_NOT_FOUND');
    return null;
  }
  return { orgId, userId, projectId, eventId };
}

/** A question id from the path, or null (refused 404): out-of-range ids never reach PostgreSQL. */
function questionIdOf(req: Request, res: Response): number | null {
  const raw = String(req.params.questionId ?? '');
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > MAX_INT) {
    sendError(res, 404, 'That question was not found on this letter.', undefined, 'QUESTION_NOT_FOUND');
    return null;
  }
  return id;
}

/** The first field problem, as a sentence, so the person reads what to fix rather than "try again". */
function validation(res: Response, err: z.ZodError): void {
  const first = err.issues[0];
  const field = first?.path?.join('.') || 'request';
  sendError(res, 400, `${first?.message ?? 'Invalid input.'} (${field}) Nothing was changed.`, err.flatten(), 'VALIDATION');
}

function refusal(res: Response, err: unknown, where: string): void {
  if (err instanceof AgencyResponseError) {
    sendError(res, AGENCY_RESPONSE_CODE_STATUS[err.code] ?? 409, err.message, undefined, err.code);
    return;
  }
  if (err instanceof HaError) {
    sendError(res, err.code === 'NOT_FOUND' ? 404 : err.code === 'BAD_INPUT' ? 400 : 409, err.message, undefined, err.code);
    return;
  }
  if ((err as { code?: unknown } | null)?.code === '23505') {
    sendError(res, 409, 'That record already exists on this letter. Nothing was changed.', undefined, 'DUPLICATE_QUESTION');
    return;
  }
  serverError(res, log, where, err);
}

/** The letter, if this person may see it; a letter they may not see does not exist for them. */
async function visibleLetter(client: Queryable, scope: Scope, req: Request, canView: VisibilityCheck, lock = false): Promise<LetterRow> {
  const letter = await readLetter(client, scope.orgId, scope.projectId, scope.eventId, lock);
  if (!letter || !canView(letter.visibilityTier, req.userRole)) {
    throw new AgencyResponseError('LETTER_NOT_FOUND', 'That communication was not found in this project.');
  }
  return letter;
}

/**
 * A governed write that is not a signature: the change and its ledger pair
 * (audit_logs + c2c_ana_actions, with the person's reason) on one transaction
 * on the request's tenant-pinned connection, or neither. The transaction is
 * governedRequestWrite (commitment-fulfil-route.ts, shared with a commitment's
 * unsigned fulfilment since 2026-10-19); this answers in this router's
 * envelope and refusals.
 */
async function governedWrite(
  req: Request,
  res: Response,
  write: { scope: Scope; command: 'create' | 'update' | 'resolve'; reason: string; domain: string },
  run: (client: Queryable) => Promise<{ target: string; payload: Record<string, unknown>; body: unknown }>,
): Promise<void> {
  const { scope, command, reason, domain } = write;
  try {
    const { body, governance } = await governedRequestWrite(
      req,
      { orgId: scope.orgId, userId: scope.userId, command, reason, domain, surface: 'communication-center' },
      (client) => run(client as unknown as Queryable),
    );
    res.status(command === 'update' ? 200 : 201).json({ success: true, data: body, governance });
  } catch (err) {
    refusal(res, err, `${command} on an agency question`);
  }
}

/**
 * The inbox's close, as one transaction: lock the letter, check the close rule
 * against the questions as they stand under the lock, then close. Used by the
 * Advance route (communication-center.ts) for the step that closes a letter.
 * Returns the stored row, or the refusal sentence.
 */
export async function closeLetter(
  req: Request,
  scope: { orgId: number; projectId: number },
  eventId: string,
  next: { humanReviewStatus: string; closureStatus: string },
): Promise<{ ok: true; row: { event_id: string; human_review_status: string; closure_status: string } } | { ok: false; message: string }> {
  const client = requestPgClient(req) as unknown as Queryable;
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, scope.orgId);
    const row = await closeLetterTx(client, scope, eventId, next, today());
    await client.query('COMMIT');
    return { ok: true, row };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof AgencyResponseError) return { ok: false, message: err.message };
    throw err;
  }
}

/** What this person may do on the letter, from the server's own checks, so the screen offers nothing it would refuse. */
async function viewerCapabilities(req: Request, scope: Scope, client: Queryable) {
  let writeRefusal: string | null = null;
  try {
    await requireProjectAdmission(req, String(scope.projectId), true);
  } catch (err) {
    writeRefusal = err instanceof ProjectAdmissionRefusal ? err.message : 'Your permission to change this project could not be verified.';
  }
  const authority = await checkSigningAuthority(scope.userId, scope.orgId, client as never);
  return {
    canWrite: writeRefusal === null,
    writeRefusal,
    canSign: writeRefusal === null && authority === null,
    signAuthorityRefusal: authority ? authority.message : null,
  };
}

export function registerAgencyResponseRoutes(router: Router, canView: VisibilityCheck): void {
  router.get(`${BASE}/questions`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    try {
      const client = requestPgClient(req) as unknown as Queryable;
      const letter = await visibleLetter(client, scope, req, canView);
      const questions = await readQuestions(client, scope.orgId, scope.projectId, scope.eventId, today());
      const asked = questions.filter((q) => q.approval.state !== 'withdrawn');
      const outstanding = outstandingResponses(asked);
      return sendSuccess(res, {
        letter: {
          id: letter.eventId,
          communicationType: letter.communicationType,
          sourceType: letter.sourceType,
          receivedDate: letter.receivedDate,
          dueDate: letter.dueDate,
          closureStatus: letter.closureStatus,
          responseRequired: letter.responseRequired,
          /** Why the letter may not be closed now, or null: the server's rule, shown as said. */
          closeRefusal: letter.closureStatus === 'closed' ? null : closeRefusal(questions, letter.responseRequired),
        },
        viewer: await viewerCapabilities(req, scope, client),
        questions: [...questions]
          .sort((a, b) => a.questionRef.localeCompare(b.questionRef, 'en', { numeric: true, sensitivity: 'base' }) || a.id - b.id)
          .map((q) => questionForViewer(q, scope.userId)),
        outstanding,
        packageReady: asked.length > 0 && outstanding.length === 0,
      });
    } catch (err) {
      return refusal(res, err, 'reading the questions on an agency letter');
    }
  });

  router.post(`${BASE}/questions`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const parsed = questionBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    const input = parsed.data;
    await governedWrite(req, res, { scope, command: 'create', reason: input.reason, domain: DOMAIN }, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView, true);
      const { id } = await insertQuestionTx(client, scope, letter, {
        questionRef: input.questionRef,
        questionText: input.questionText,
        discipline: input.discipline ?? null,
        severity: input.severity,
      });
      return {
        target: `agency-question:${id}`,
        payload: { communicationEventId: letter.eventId, questionRef: input.questionRef, severity: input.severity },
        body: { id, questionRef: input.questionRef, state: 'unanswered' },
      };
    });
  });

  router.put(`${BASE}/questions/:questionId/response`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const questionId = questionIdOf(req, res);
    if (questionId === null) return;
    const parsed = responseBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    const input = parsed.data;
    await governedWrite(req, res, { scope, command: 'update', reason: input.reason, domain: DOMAIN }, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView, true);
      const saved = await saveResponseTx(client, scope, letter, { questionId, ...input });
      // Read back with the signatures, so the caller learns at once whether an
      // earlier approval no longer covers what was just written.
      const view = (await readQuestions(client, scope.orgId, scope.projectId, scope.eventId, today())).find((q) => q.id === questionId)!;
      return {
        target: `agency-question:${questionId}`,
        payload: { communicationEventId: letter.eventId, questionRef: saved.question.questionRef, responseRevision: saved.revision, responseDigest: saved.digest },
        body: questionForViewer(view, scope.userId),
      };
    });
  });

  router.post(`${BASE}/questions/:questionId/withdraw`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const questionId = questionIdOf(req, res);
    if (questionId === null) return;
    const parsed = reasonBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    await governedWrite(req, res, { scope, command: 'update', reason: parsed.data.reason, domain: DOMAIN }, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView, true);
      const q = await withdrawQuestionTx(client, scope, letter, questionId, parsed.data.reason);
      return {
        target: `agency-question:${questionId}`,
        payload: { communicationEventId: letter.eventId, questionRef: q.questionRef, withdrawn: true },
        body: { id: questionId, questionRef: q.questionRef, state: 'withdrawn' },
      };
    });
  });

  router.post(`${BASE}/no-response-required`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const parsed = reasonBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    await governedWrite(req, res, { scope, command: 'update', reason: parsed.data.reason, domain: DOMAIN }, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView, true);
      await markNoResponseRequiredTx(client, scope, letter);
      return {
        target: `agency-communication:${letter.eventId}`,
        payload: { responseRequired: false },
        body: { id: letter.eventId, responseRequired: false },
      };
    });
  });

  router.post(`${BASE}/questions/:questionId/approve`, signedActAttempts, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const questionId = questionIdOf(req, res);
    if (questionId === null) return;
    const extra = approveBody.safeParse(req.body ?? {});
    if (!extra.success) {
      return sendError(res, 400, 'Say which revision of the response you read (expectedRevision). Nothing was signed.', extra.error.flatten(), 'VALIDATION');
    }
    const target = `agency-question:${questionId}`;
    await signGovernedAct(req, res, {
      domain: DOMAIN,
      target,
      meanings: DECISION_ACT_MEANINGS,
      codeStatus: AGENCY_RESPONSE_CODE_STATUS,
      run: async (client, orgId, userId) => {
        const db = client as unknown as Queryable;
        const letter = await visibleLetter(db, { ...scope, orgId }, req, canView, true);
        const { question, digest } = await prepareApprovalTx(db, { orgId, projectId: scope.projectId, userId }, letter, questionId, extra.data.expectedRevision);
        return {
          target,
          payload: {
            communicationEventId: letter.eventId,
            questionRef: question.questionRef,
            responseRevision: question.responseRevision,
            responseDigest: digest,
          },
          body: {
            success: true,
            data: { questionId, questionRef: question.questionRef, responseRevision: question.responseRevision, state: 'approved' },
          },
        };
      },
    });
  });

  router.post(`${BASE}/questions/:questionId/commitments`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const questionId = questionIdOf(req, res);
    if (questionId === null) return;
    const parsed = commitmentBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    const input = parsed.data;
    await governedWrite(req, res, { scope, command: 'create', reason: input.reason, domain: 'ha' }, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView);
      const q = await questionForCommitment(client, scope.orgId, scope.projectId, letter.eventId, questionId);
      // The canonical commitments register (C2C-03); the source is the
      // question row read above, never the request body.
      const { id, provenanceLinkIds } = await createCommitmentTx(client, scope.orgId, scope.userId, {
        commitmentType: input.commitmentType,
        description: input.description,
        dueDate: input.dueDate ?? null,
        regulatoryBasis: input.regulatoryBasis ?? null,
        projectId: scope.projectId,
        sourceCommunicationEventId: letter.eventId,
        sourceQuestionId: q.id,
      });
      recordHaCommitmentCreated(input.commitmentType);
      return {
        target: `regulatory-commitment:${id}`,
        payload: { type: input.commitmentType, sourceQuestionId: q.id, communicationEventId: letter.eventId, provenanceLinkIds },
        body: { id, commitmentType: input.commitmentType, sourceQuestionId: q.id, status: 'open' },
      };
    });
  });

  /* ── A project's commitments (2026-10-18) ──────────────────────────────
     A commitment made in an answer to this project's agency letter belongs to
     the project. It is listed and fulfilled here, behind this router's project
     admission, and only when the letter it came from is one this person may
     see; /api/ha-interactions reaches only the organisation's own (project_id
     IS NULL). One implementation (ha-service, commitment-fulfil-route), scoped
     per door. Since 2026-10-19 (P-41) what met a commitment is named, and may
     only be of this project's program. */
  const projectDoor = (req: Request): CommitmentDoor => ({
    scope: { projectId: Number(req.params.projectId) },
    idParam: 'commitmentId',
    visible: (row) => row.sourceCommunicationEventId == null || canView(row.visibilityTier, req.userRole),
    viewer: async (r, client, orgId, userId) =>
      viewerCapabilities(r, { orgId, userId, projectId: Number(r.params.projectId), eventId: '' }, client as unknown as Queryable),
  });

  router.get('/projects/:projectId/commitments', async (req, res) => {
    const projectId = Number(req.params.projectId);
    let orgId: number;
    try {
      orgId = getOrganizationId(req);
    } catch {
      return sendError(res, 401, 'Organization context required.', undefined, 'AUTH_REQUIRED');
    }
    try {
      const client = requestPgClient(req) as unknown as Queryable;
      const rows = (await listCommitments(orgId, undefined, { projectId }, client)).filter(
        (r) => r.source_communication_event_id == null || canView(r.source_visibility_tier, req.userRole),
      );
      return sendSuccess(res, await commitmentsForRequest(req, orgId, rows));
    } catch (err) {
      return answerFulfilmentFailure(res, err);
    }
  });

  router.get('/projects/:projectId/commitments/:commitmentId/fulfilment-options', (req, res) =>
    fulfilmentOptionsRoute(req, res, projectDoor(req)));

  router.post('/projects/:projectId/commitments/:commitmentId/fulfill', (req, res) =>
    fulfilCommitmentRoute(req, res, projectDoor(req)));

  router.post(`${BASE}/response-package`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const parsed = packageBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    try {
      const client = requestPgClient(req) as unknown as Queryable;
      const letter = await visibleLetter(client, scope, req, canView);
      const questions = await readQuestions(client, scope.orgId, scope.projectId, scope.eventId, today());
      const built = assembleResponsePackage(letter, questions);
      if (!built.ok) {
        return sendError(res, 409, built.message, { outstanding: built.outstanding }, built.code);
      }
      const base = `response-${letter.eventId}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const docx = parsed.data.format === 'docx';
      const buffer = docx ? await renderResponsePackageDocx(built.model) : Buffer.from(built.markdown, 'utf8');
      await sendAuditedDownload(res, {
        organizationId: scope.orgId,
        userId: scope.userId,
        sourceType: docx ? 'export_docx' : 'export_txt',
        backendRoute: '/api/concept2cure/projects/:projectId/agency-communications/:eventId/response-package',
        resourceType: 'agency_response_package',
        resourceId: letter.eventId,
        programUuid: null,
        filename: `${base}.${docx ? 'docx' : 'md'}`,
        mimeType: docx
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'text/markdown; charset=utf-8',
        buffer,
        metadata: { projectId: scope.projectId, questionCount: built.questionCount, signatureIds: built.signatureIds },
      });
    } catch (err) {
      if (isUnauditedExportRefusal(err)) {
        return sendError(res, 503, 'The package was not delivered because its export record could not be written. Try again.', undefined, 'EXPORT_NOT_RECORDED');
      }
      return refusal(res, err, 'assembling an agency response package');
    }
  });
}
