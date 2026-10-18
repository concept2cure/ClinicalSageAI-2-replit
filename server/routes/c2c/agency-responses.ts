/**
 * Answers to an agency letter: its questions, a response to each, the Part 11
 * signature that approves a response, the commitments made in it, and the
 * response package. Registered on the Communication Center router
 * (communication-center.ts), so every path here runs behind the same chain as
 * the inbox it extends: rate limit → auth → tenant context → organization →
 * project admission (a write needs a governed write role and project edit).
 *
 *   GET  /projects/:projectId/agency-communications/:eventId/questions
 *   POST /projects/:projectId/agency-communications/:eventId/questions
 *   PUT  /projects/:projectId/agency-communications/:eventId/questions/:questionId/response
 *   POST /projects/:projectId/agency-communications/:eventId/questions/:questionId/approve
 *   POST /projects/:projectId/agency-communications/:eventId/questions/:questionId/commitments
 *   POST /projects/:projectId/agency-communications/:eventId/response-package
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
 * it. The package is assembled only from responses approved as they stand,
 * and leaves the system through the audited export path, which records the
 * sha256 of the bytes delivered.
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
import { createCommitmentTx, HaError } from '../../services/ha-interactions/ha-service';
import { recordHaCommitmentCreated } from '../../services/ha-metrics';
import { DECISION_ACT_MEANINGS } from '../../services/part11/signature-meanings';
import { setTenantContextTx } from '../../services/tenant/governed-tenant-context';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../../services/export/governedExportConsequence';
import {
  assembleResponsePackage,
  closeRefusal,
  outstandingResponses,
} from '../../services/agency-responses/response-logic';
import {
  AGENCY_RESPONSE_CODE_STATUS,
  AgencyResponseError,
  insertQuestionTx,
  prepareApprovalTx,
  questionForCommitment,
  questionForViewer,
  readLetter,
  readQuestions,
  saveResponseTx,
  type LetterRow,
  type Queryable,
} from '../../services/agency-responses/response-service';
import { createScopedLogger } from '../../utils/logger';
import { governedReason } from '../governed-reason';
import { recordGovernedAction } from './actions';
import { signGovernedAct, signedActAttempts } from '../governed-signed-act';
import { getOrganizationId, sendError, sendSuccess } from './shared';

const log = createScopedLogger('agency-responses');

const BASE = '/projects/:projectId/agency-communications/:eventId';
const DOMAIN = 'correspondence';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd.');

const questionBody = z.object({
  questionRef: z.string().trim().min(1, 'Give the number the agency used for this question.').max(40),
  questionText: z.string().trim().min(1, 'Paste the question as the agency worded it.').max(20000),
  discipline: z.string().trim().max(80).optional(),
  severity: z.enum(['minor', 'major', 'critical']).default('major'),
  reason: governedReason,
});

const responseBody = z.object({
  responseText: z.string().max(100000),
  expectedRevision: z.number().int().min(0),
  reason: governedReason,
});

const approveBody = z.object({ expectedRevision: z.number().int().min(0) });

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

function validation(res: Response, err: z.ZodError): void {
  sendError(res, 400, 'Some fields are missing or invalid. Nothing was changed.', err.flatten(), 'VALIDATION');
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
async function visibleLetter(
  client: Queryable,
  scope: Scope,
  req: Request,
  canView: VisibilityCheck,
  lock = false,
): Promise<LetterRow> {
  const letter = await readLetter(client, scope.orgId, scope.projectId, scope.eventId, lock);
  if (!letter || !canView(letter.visibilityTier, req.userRole)) {
    throw new AgencyResponseError('LETTER_NOT_FOUND', 'That communication was not found in this project.');
  }
  return letter;
}

/**
 * A governed write that is not a signature: the change and its ledger pair
 * (audit_logs + c2c_ana_actions, with the person's reason) on one transaction
 * on the request's tenant-pinned connection, or neither.
 */
async function governedWrite(
  req: Request,
  res: Response,
  scope: Scope,
  command: 'create' | 'update',
  reason: string,
  domain: string,
  run: (client: Queryable) => Promise<{ target: string; payload: Record<string, unknown>; body: unknown }>,
): Promise<void> {
  const client = requestPgClient(req) as unknown as Queryable;
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, scope.orgId);
    const { target, payload, body } = await run(client);
    const gov = await recordGovernedAction(client, {
      orgId: scope.orgId,
      userId: scope.userId,
      command,
      target,
      reason,
      payload,
      domain,
      surface: 'communication-center',
    });
    await client.query('COMMIT');
    res.status(command === 'create' ? 201 : 200).json({
      success: true,
      data: body,
      governance: { actionId: gov.actionId, auditId: gov.auditId, sha256Chain: gov.sha256Chain },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    refusal(res, err, `${command} on an agency question`);
  }
}

/**
 * The close rule for the inbox's Advance: the reason a letter may not be
 * closed, or null. A letter with recorded questions closes only when every
 * response is approved as it stands (response-logic closeRefusal).
 */
export async function letterCloseRefusal(client: Queryable, orgId: number, projectId: number, eventId: string): Promise<string | null> {
  return closeRefusal(await readQuestions(client, orgId, projectId, eventId));
}

export function registerAgencyResponseRoutes(router: Router, canView: VisibilityCheck): void {
  router.get(`${BASE}/questions`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    try {
      const client = requestPgClient(req) as unknown as Queryable;
      const letter = await visibleLetter(client, scope, req, canView);
      const questions = await readQuestions(client, scope.orgId, scope.projectId, scope.eventId);
      const outstanding = outstandingResponses(questions);
      return sendSuccess(res, {
        letter: {
          id: letter.eventId,
          communicationType: letter.communicationType,
          sourceType: letter.sourceType,
          receivedDate: letter.receivedDate,
          dueDate: letter.dueDate,
          closureStatus: letter.closureStatus,
        },
        questions: [...questions]
          .sort((a, b) => a.questionRef.localeCompare(b.questionRef, 'en', { numeric: true, sensitivity: 'base' }) || a.id - b.id)
          .map((q) => questionForViewer(q, scope.userId)),
        outstanding,
        packageReady: questions.length > 0 && outstanding.length === 0,
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
    await governedWrite(req, res, scope, 'create', input.reason, DOMAIN, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView, true);
      const { id } = await insertQuestionTx(client, scope.orgId, scope.projectId, scope.userId, letter, {
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
    const questionId = Number(req.params.questionId);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return sendError(res, 404, 'That question was not found on this letter.', undefined, 'QUESTION_NOT_FOUND');
    }
    const parsed = responseBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    const input = parsed.data;
    await governedWrite(req, res, scope, 'update', input.reason, DOMAIN, async (client) => {
      const letter = await visibleLetter(client, scope, req, canView, true);
      const saved = await saveResponseTx(client, scope.orgId, scope.projectId, scope.userId, letter, questionId, input.responseText, input.expectedRevision);
      // Read back with the signatures, so the caller learns at once whether an
      // earlier approval no longer covers what was just written.
      const view = (await readQuestions(client, scope.orgId, scope.projectId, scope.eventId)).find((q) => q.id === questionId)!;
      return {
        target: `agency-question:${questionId}`,
        payload: { communicationEventId: letter.eventId, questionRef: saved.question.questionRef, responseRevision: saved.revision, responseDigest: saved.digest },
        body: questionForViewer(view, scope.userId),
      };
    });
  });

  router.post(`${BASE}/questions/:questionId/approve`, signedActAttempts, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const questionId = Number(req.params.questionId);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return sendError(res, 404, 'That question was not found on this letter.', undefined, 'QUESTION_NOT_FOUND');
    }
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
        const { question, digest } = await prepareApprovalTx(db, orgId, scope.projectId, userId, letter, questionId, extra.data.expectedRevision);
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
    const questionId = Number(req.params.questionId);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return sendError(res, 404, 'That question was not found on this letter.', undefined, 'QUESTION_NOT_FOUND');
    }
    const parsed = commitmentBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    const input = parsed.data;
    await governedWrite(req, res, scope, 'create', input.reason, 'ha', async (client) => {
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

  router.post(`${BASE}/response-package`, async (req, res) => {
    const scope = scopeOf(req, res);
    if (!scope) return;
    const parsed = packageBody.safeParse(req.body ?? {});
    if (!parsed.success) return validation(res, parsed.error);
    try {
      const client = requestPgClient(req) as unknown as Queryable;
      const letter = await visibleLetter(client, scope, req, canView);
      const questions = await readQuestions(client, scope.orgId, scope.projectId, scope.eventId);
      const built = assembleResponsePackage(letter, questions);
      if (!built.ok) {
        return sendError(res, 409, built.message, { outstanding: built.outstanding }, built.code);
      }
      const base = `response-${letter.eventId}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const docx = parsed.data.format === 'docx';
      let buffer: Buffer;
      if (docx) {
        const { generateDocxBuffer } = await import('../../services/docxGenerator');
        buffer = await generateDocxBuffer(built.title, built.markdown);
      } else {
        buffer = Buffer.from(built.markdown, 'utf8');
      }
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
