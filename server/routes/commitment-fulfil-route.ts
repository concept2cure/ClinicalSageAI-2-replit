/**
 * Recording a regulatory commitment as fulfilled, on both of its doors (rows
 * D2 and D5, 2026-10-19; decision P-40).
 *
 * The commitments register has two doors (ha-service.ts CommitmentScope): the
 * organisation's own commitments at /api/ha-interactions, and a project's at
 * /api/concept2cure/projects/:projectId, behind project admission and the
 * letter's visibility tier. Both fulfil through fulfilCommitmentRoute, read
 * their options through fulfilmentOptionsRoute, and answer one body:
 *
 *   201 { success: true, data, actionId, auditId, sha256Chain
 *         [, signatureId, signedAt, meaning] }      the last three when signed
 *   4xx/503 { error: { code, message } }             FULFILMENT_CODE_STATUS
 *
 * ── The order a fulfilment is refused in ─────────────────────────────────────
 *   1. who is asking                                     401 AUTH_REQUIRED
 *   2. the body, as a sentence naming the field          400 VALIDATION
 *   3. a date that has not happened                      400 BAD_INPUT
 *   4. the commitment, in this door's scope and visible  404 NOT_FOUND
 *      to this person; not already terminal              409 INVALID_STATE
 *   5. the type's rule (ha-logic.ts fulfilmentRule): a password for a type
 *      that takes none; a PMR/PMC/REMS that names nothing, or no date   400
 *   6. what it names, read-only (commitment-fulfilment.ts)   404/409/503
 *   7. a PMR, PMC or REMS: the one ceremony (governed-signed-act.ts) —
 *      components, meaning, signing authority, password and second factor,
 *      then, in its transaction, 4–6 again under lock and the write
 *   7'. any other type: one governed transaction (governedRequestWrite) with
 *      the person's reason and a `resolve` ledger row
 * Steps 1–6 spend nothing of the signer's: no password attempt (the account
 * lockout counted inside reverifySigner) and none of the per-signer signing
 * budget (signedActAttempts, 10 per 5 minutes, shared by every route that
 * signs through governed-signed-act.ts). The budget is spent only by a request
 * that has passed 1–6 and carries a password into the ceremony
 * (spendSigningAttempt, step 7), so a fulfilment refused for what it names,
 * or a password sent for a meeting commitment, costs the signer nothing on
 * any other signed act. (Reviewed 2026-10-19: the limiter used to sit in front
 * of the route and counted those refusals too.)
 *
 * ── Why a signature (P-40) ───────────────────────────────────────────────────
 * Recording a PMR, PMC or REMS as fulfilled takes an obligation off the
 * overdue register and out of the annual status report (21 CFR
 * 314.81(b)(2)(vii), 601.70; FD&C 505(o)(3), 505-1): an attestation, so it is
 * signed and names what met it, as label approval, QMS effective, the Shadow
 * dispositions and an agency response approval are signed. The database
 * refuses the commit otherwise (migrations/20261019_commitment_fulfilment_
 * evidence.sql). No separation of duties: it attests to the record, it does
 * not approve another person's work. AnA cannot sign, so its tool refuses
 * these three types and points here.
 *
 * @module server/routes/commitment-fulfil-route
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requestPgClient } from '../db/requestDb';
import { serverError } from '../lib/api-response';
import { isVerificationUnavailable } from '../lib/verification-outcome';
import { GOVERNED_WRITE_ROLES } from '../middleware/orgMembership';
import { ProgramReadAccessError } from '../services/c2c/current-program-access';
import {
  FULFILMENT_CODE_STATUS,
  commitmentsForViewer,
  listFulfilmentSequenceOptions,
  resolveFulfilmentEvidenceTx,
  type ResolvedEvidence,
} from '../services/ha-interactions/commitment-fulfilment';
import { fulfilmentEvidenceRefusal, fulfilmentRule } from '../services/ha-interactions/ha-logic';
import {
  HaError,
  TERMINAL_COMMITMENT_STATUSES,
  fulfillCommitmentTx,
  fulfilmentDateRefusal,
  readCommitmentForFulfilment,
  type CommitmentForFulfilment,
  type CommitmentScope,
} from '../services/ha-interactions/ha-service';
import { recordHaCommitmentFulfilled } from '../services/ha-metrics';
import { checkSigningAuthority } from '../services/part11/signing-authority-gate';
import { DECISION_ACT_MEANINGS } from '../services/part11/signature-meanings';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { resolveOrgId, resolveUserId, resolveUserRole } from '../types/auth-request';
import { createScopedLogger } from '../utils/logger';
import { recordGovernedAction } from './c2c/actions';
import { governedReason } from './governed-reason';
import { signGovernedAct, signedActAttempts } from './governed-signed-act';

const log = createScopedLogger('commitment-fulfil-route');

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

const MAX_INT = 2147483647;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today as the server's calendar day (UTC); the date rule allows one day east of it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The per-signer credential limit (§11.300(d)), spent by a request that will
 * reach the password: called after every refusal that needs none. True when
 * the request may go on; false when the limiter has answered it (429).
 */
async function spendSigningAttempt(req: Request, res: Response): Promise<boolean> {
  if (typeof (req.body as { password?: unknown } | undefined)?.password !== 'string') return true;
  let admitted = false;
  let failure: unknown = null;
  // express-rate-limit's middleware resolves once it has called next or answered.
  await Promise.resolve(signedActAttempts(req, res, (err?: unknown) => {
    if (err) failure = err;
    else admitted = true;
  }));
  if (failure) throw failure;
  return admitted && !res.headersSent;
}

/** What this person may do, from the server's own checks, so the screen offers nothing it would refuse. */
export interface ViewerCapabilities {
  canWrite: boolean;
  writeRefusal: string | null;
  canSign: boolean;
  signAuthorityRefusal: string | null;
}

/** One door onto the register. */
export interface CommitmentDoor {
  scope: CommitmentScope;
  /** The path parameter that holds the commitment id. */
  idParam: string;
  /** Whether this person may see the commitment (the project door applies the letter's visibility tier). */
  visible: (row: CommitmentForFulfilment) => boolean;
  viewer: (req: Request, client: Queryable, orgId: number, userId: number) => Promise<ViewerCapabilities>;
}

/** The organisation door's capabilities: the governed write roles and the one signing-authority policy. */
export async function organisationViewerCapabilities(req: Request, client: Queryable, orgId: number, userId: number): Promise<ViewerCapabilities> {
  const canWrite = GOVERNED_WRITE_ROLES.has(resolveUserRole(req));
  const authority = await checkSigningAuthority(userId, orgId, client as never);
  return {
    canWrite,
    writeRefusal: canWrite ? null : 'Your role can read commitments but cannot record a fulfilment.',
    canSign: canWrite && authority === null,
    signAuthorityRefusal: authority ? authority.message : null,
  };
}

/**
 * A governed write that is not a signature, on the request's tenant-pinned
 * connection: the change and its ledger pair (audit_logs + c2c_ana_actions,
 * with the person's reason) on one transaction, or neither. The one
 * transaction core for the project door's writes (agency-responses.ts answers
 * in its own envelope around it) and for an unsigned fulfilment here. Throws
 * whatever `run` throws, after ROLLBACK.
 */
export async function governedRequestWrite<T>(
  req: Request,
  write: { orgId: number; userId: number; command: 'create' | 'update' | 'resolve'; reason: string; domain: string; surface: string },
  run: (client: Queryable) => Promise<{ target: string; payload: Record<string, unknown>; body: T }>,
): Promise<{ body: T; governance: { actionId: string; auditId: string; sha256Chain: string } }> {
  const client = requestPgClient(req) as unknown as Queryable;
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, write.orgId);
    const { target, payload, body } = await run(client);
    const gov = await recordGovernedAction(client, {
      orgId: write.orgId,
      userId: write.userId,
      command: write.command,
      target,
      reason: write.reason,
      payload,
      domain: write.domain,
      surface: write.surface,
    });
    await client.query('COMMIT');
    return { body, governance: { actionId: gov.actionId, auditId: gov.auditId, sha256Chain: gov.sha256Chain } };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

function refuse(res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  res.status(status).json({ error: { code, message, ...extra } });
}

/**
 * A fulfilment or commitments-read failure: a coded refusal keeps its status
 * and sentence; current project access that failed keeps its own status; a
 * check that could not run is a 503; anything else a 500 with no error text.
 */
export function answerFulfilmentFailure(res: Response, err: unknown): void {
  const code = (err as { code?: unknown } | null)?.code;
  if (err instanceof HaError && typeof code === 'string' && FULFILMENT_CODE_STATUS[code]) {
    refuse(res, FULFILMENT_CODE_STATUS[code], code, err.message);
    return;
  }
  if (err instanceof ProgramReadAccessError) {
    refuse(res, err.status, err.code, err.message);
    return;
  }
  if (isVerificationUnavailable(err)) {
    refuse(res, 503, 'EVIDENCE_ACCESS_UNAVAILABLE', 'Your access to this record could not be verified. Nothing was changed.');
    return;
  }
  serverError(res, log, 'recording or reading a commitment fulfilment', err);
}

function commitmentIdOf(raw: unknown): number | null {
  const s = String(raw ?? '');
  const id = /^\d{1,10}$/.test(s) ? Number(s) : NaN;
  return Number.isInteger(id) && id > 0 && id <= MAX_INT ? id : null;
}

const fulfilBody = z.object({
  fulfilledDate: z.string().optional(),
  reason: governedReason,
  evidence: z
    .object({
      sequenceId: z.number().int().positive().max(MAX_INT).optional(),
      vaultDocumentId: z.string().regex(UUID_RE, 'Name the Vault version by its id.').optional(),
    })
    .strict()
    .optional(),
  // The signature components; signGovernedAct reads and checks them.
  meaning: z.string().optional(),
  password: z.string().optional(),
  mfaToken: z.string().optional(),
});
type FulfilInput = z.infer<typeof fulfilBody>;

const TYPE_WORDS: Record<string, string> = {
  pmr: 'A PMR', pmc: 'A PMC', rems: 'A REMS', meeting_commitment: 'A meeting commitment', other: 'This commitment',
};

/**
 * The fulfilment itself, on the transaction's client: the commitment re-read
 * under lock and re-checked, what it names resolved under lock, then the one
 * write (ha-service.ts fulfillCommitmentTx). The payload is what the ledger
 * records and, when signed, the signature manifest's `act`, which the database
 * compares to the row at COMMIT: fulfilledDate, sequenceId, vaultDocumentId and
 * vaultSha256 must be exactly the row's.
 */
async function fulfilUnderLock(
  db: Queryable,
  p: { orgId: number; userId: number; id: number; door: CommitmentDoor; input: FulfilInput; evidence: { sequenceId: number | null; vaultDocumentId: string | null }; signed: boolean; today: string },
): Promise<{ payload: Record<string, unknown>; data: Record<string, unknown> }> {
  const row = await readCommitmentForFulfilment(db, p.orgId, p.id, p.door.scope, { lock: true });
  if (!row || !p.door.visible(row)) throw new HaError('NOT_FOUND', 'Commitment not found here.');
  if (TERMINAL_COMMITMENT_STATUSES.includes(row.status)) {
    throw new HaError('INVALID_STATE', 'That commitment is already fulfilled, waived or released; there is nothing to fulfil.');
  }
  if (fulfilmentRule(row.commitmentType).signatureRequired !== p.signed) {
    throw new HaError('INVALID_STATE', 'The commitment changed while this was open. Nothing was recorded. Reload it and try again.');
  }
  const resolved: ResolvedEvidence = await resolveFulfilmentEvidenceTx(db as never, {
    orgId: p.orgId, userId: p.userId, scope: p.door.scope, commitment: row, evidence: p.evidence, lock: true,
  });
  const ids = {
    sequenceId: resolved.sequence?.id ?? null,
    vaultDocumentId: resolved.vaultVersion?.id ?? null,
    vaultSha256: resolved.vaultVersion?.sha256 ?? null,
  };
  const { fulfilledDate } = await fulfillCommitmentTx(db, p.orgId, p.id, { fulfilledDate: p.input.fulfilledDate ?? null, evidence: ids, userId: p.userId }, p.door.scope, p.today);
  return {
    payload: {
      status: 'fulfilled',
      fulfilledDate,
      sequenceId: ids.sequenceId,
      sequenceNumber: resolved.sequence?.sequenceNumber ?? null,
      vaultDocumentId: ids.vaultDocumentId,
      vaultSha256: ids.vaultSha256,
      projectId: p.door.scope.projectId,
    },
    data: { id: p.id, status: 'fulfilled', fulfilledDate, signed: p.signed, evidence: resolved },
  };
}

interface FulfilRequest {
  orgId: number;
  userId: number;
  id: number;
  input: FulfilInput;
  evidence: { sequenceId: number | null; vaultDocumentId: string | null };
  today: string;
}

/** The first field problem, as a sentence naming the field. */
function validationSentence(error: z.ZodError): string {
  const first = error.issues[0];
  return `${first?.message ?? 'Invalid input.'} (${first?.path?.join('.') || 'request'}) Nothing was recorded.`;
}

/** What the body names, normalised: a Vault id is compared lower-case everywhere. */
function evidenceOf(input: FulfilInput): FulfilRequest['evidence'] {
  return { sequenceId: input.evidence?.sequenceId ?? null, vaultDocumentId: input.evidence?.vaultDocumentId?.toLowerCase() ?? null };
}

/** Steps 1–3: who, which commitment, a well-formed body and a date that has happened. Answers and returns null otherwise. */
function parseFulfilRequest(req: Request, res: Response, door: CommitmentDoor): FulfilRequest | null {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    refuse(res, 401, 'AUTH_REQUIRED', 'Authentication required.');
    return null;
  }
  const id = commitmentIdOf(req.params[door.idParam]);
  if (id === null) {
    refuse(res, 404, 'NOT_FOUND', 'Commitment not found here.');
    return null;
  }
  const parsed = fulfilBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    refuse(res, 400, 'VALIDATION', validationSentence(parsed.error), { details: parsed.error.flatten() });
    return null;
  }
  const t = today();
  const dateRefused = fulfilmentDateRefusal(parsed.data.fulfilledDate ?? null, t);
  if (dateRefused) {
    refuse(res, 400, 'BAD_INPUT', dateRefused);
    return null;
  }
  return { orgId, userId, id, input: parsed.data, evidence: evidenceOf(parsed.data), today: t };
}

/**
 * Steps 4–6, read-only, before any password: the commitment in this door and
 * visible, not terminal; the type's rule; what it names. Throws the coded
 * refusal. Returns whether the fulfilment is a signed act.
 */
async function precheckFulfilment(req: Request, door: CommitmentDoor, f: FulfilRequest): Promise<boolean> {
  const client = requestPgClient(req) as unknown as Queryable;
  const row = await readCommitmentForFulfilment(client, f.orgId, f.id, door.scope, { lock: false });
  if (!row || !door.visible(row)) throw new HaError('NOT_FOUND', 'Commitment not found here.');
  if (TERMINAL_COMMITMENT_STATUSES.includes(row.status)) {
    throw new HaError('INVALID_STATE', 'That commitment is already fulfilled, waived or released; there is nothing to fulfil.');
  }
  const rule = fulfilmentRule(row.commitmentType);
  if (!rule.signatureRequired && f.input.password !== undefined) {
    throw new HaError('SIGNATURE_NOT_TAKEN', `${TYPE_WORDS[row.commitmentType] ?? 'This commitment'} is fulfilled with a reason, not a signature. Nothing was recorded.`);
  }
  const evidenceRefused = fulfilmentEvidenceRefusal(row.commitmentType, f.evidence);
  if (evidenceRefused) throw new HaError('EVIDENCE_REQUIRED', evidenceRefused);
  if (rule.dateRequired && !f.input.fulfilledDate) {
    throw new HaError('FULFILMENT_DATE_REQUIRED', 'A signed fulfilment names the date the commitment was met, and your signature binds that date. Nothing was recorded.');
  }
  // Read-only, before any password: every evidence refusal is given here.
  await resolveFulfilmentEvidenceTx(client as never, { orgId: f.orgId, userId: f.userId, scope: door.scope, commitment: row, evidence: f.evidence, lock: false });
  return rule.signatureRequired;
}

/** Step 7: a PMR, PMC or REMS, through the one ceremony. */
async function signFulfilment(req: Request, res: Response, door: CommitmentDoor, f: FulfilRequest): Promise<void> {
  try {
    if (!(await spendSigningAttempt(req, res))) return;
  } catch (err) {
    return answerFulfilmentFailure(res, err);
  }
  const target = `regulatory-commitment:${f.id}`;
  await signGovernedAct(req, res, {
    domain: 'ha',
    target,
    meanings: DECISION_ACT_MEANINGS,
    codeStatus: FULFILMENT_CODE_STATUS,
    run: async (signing, signingOrg, signer) => {
      const { payload, data } = await fulfilUnderLock(signing as unknown as Queryable, {
        orgId: signingOrg, userId: signer, id: f.id, door, input: f.input, evidence: f.evidence, signed: true, today: f.today,
      });
      return { target, payload, body: { success: true, data } };
    },
  });
  if (res.statusCode === 201) recordHaCommitmentFulfilled();
}

/** Step 7': any other type, one governed transaction with the person's reason. */
async function recordUnsignedFulfilment(req: Request, res: Response, door: CommitmentDoor, f: FulfilRequest): Promise<void> {
  try {
    const { body, governance } = await governedRequestWrite(
      req,
      { orgId: f.orgId, userId: f.userId, command: 'resolve', reason: f.input.reason, domain: 'ha', surface: 'communication-center' },
      async (db) => {
        const { payload, data } = await fulfilUnderLock(db, { orgId: f.orgId, userId: f.userId, id: f.id, door, input: f.input, evidence: f.evidence, signed: false, today: f.today });
        return { target: `regulatory-commitment:${f.id}`, payload, body: data };
      },
    );
    recordHaCommitmentFulfilled();
    res.status(201).json({ success: true, data: body, ...governance });
  } catch (err) {
    answerFulfilmentFailure(res, err);
  }
}

/** POST …/fulfill on either door. Answers the request itself. */
export async function fulfilCommitmentRoute(req: Request, res: Response, door: CommitmentDoor): Promise<void> {
  const f = parseFulfilRequest(req, res, door);
  if (!f) return;
  let signed: boolean;
  try {
    signed = await precheckFulfilment(req, door, f);
  } catch (err) {
    return answerFulfilmentFailure(res, err);
  }
  return signed ? signFulfilment(req, res, door, f) : recordUnsignedFulfilment(req, res, door, f);
}

/** GET …/fulfilment-options on either door: what this commitment can name, and what this person may do. */
export async function fulfilmentOptionsRoute(req: Request, res: Response, door: CommitmentDoor): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return refuse(res, 401, 'AUTH_REQUIRED', 'Authentication required.');
  const id = commitmentIdOf(req.params[door.idParam]);
  if (id === null) return refuse(res, 404, 'NOT_FOUND', 'Commitment not found here.');
  try {
    const client = requestPgClient(req) as unknown as Queryable;
    const row = await readCommitmentForFulfilment(client, orgId, id, door.scope, { lock: false });
    if (!row || !door.visible(row)) throw new HaError('NOT_FOUND', 'Commitment not found here.');
    if (TERMINAL_COMMITMENT_STATUSES.includes(row.status)) {
      throw new HaError('INVALID_STATE', 'That commitment is already fulfilled, waived or released; there is nothing to fulfil.');
    }
    const rule = fulfilmentRule(row.commitmentType);
    const options = await listFulfilmentSequenceOptions(client as never, { orgId, userId, scope: door.scope, commitment: row });
    const viewer = await door.viewer(req, client, orgId, userId);
    res.json({
      success: true,
      data: {
        commitment: { id: row.id, commitmentType: row.commitmentType, status: row.status, submission: options.submission },
        rule: { ...rule, meanings: rule.signatureRequired ? [...DECISION_ACT_MEANINGS] : [] },
        projectLinked: options.projectLinked,
        sequences: options.sequences,
        sequencesTruncated: options.truncated,
        vault: { programId: options.programId },
        viewer,
      },
    });
  } catch (err) {
    answerFulfilmentFailure(res, err);
  }
}

/**
 * A door's commitments, projected for this reader (commitment-fulfilment.ts
 * commitmentsForViewer). The caller reads the rows in its own scope and
 * answers in its own envelope.
 */
export async function commitmentsForRequest(req: Request, orgId: number, rows: any[]) {
  const client = requestPgClient(req) as unknown as Queryable;
  return commitmentsForViewer(client as never, { orgId, userId: resolveUserId(req), rows, today: today() });
}
