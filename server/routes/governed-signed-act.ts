/**
 * A domain route's signed act, through the platform's one signing ceremony.
 *
 * ── Why this exists (security audit 2026-09-24, DP-02; plan item P0-10a) ─────
 * Eleven research-administration routes (biosketch finalize, committee
 * determination, coverage-analysis finalize, DMS plan finalize, effort
 * certification, export-control determination, grant closeout, subaward
 * execution, no-cost-extension approval, Other Support certification, research
 * agreement execution) each ran their own copy of a `governed()` helper with
 * `command = 'sign'`. That wrote the ledger pair (audit_logs + c2c_ana_actions)
 * an inspector reads as a signature, from a session alone: no password, no
 * second factor, no declared meaning, no electronic_signatures row. Reproduced
 * against the deploy-shaped database on 2026-10-01
 * (tests/db/research-admin-sign-ceremony.dbtest.ts; evidence in
 * docs/evidence/D6/2026-10-01-tranche-4/P0-10a/).
 *
 * ── The ceremony ─────────────────────────────────────────────────────────────
 * The pieces are the canonical ones; only their composition lives here, once,
 * so the eleven routes cannot drift apart again. The order is the QMS approval's
 * (routes/mdx-qms.ts), and it is why a refusal writes nothing:
 *
 *   1. the caller is identified                        401 AUTH_REQUIRED
 *   2. every component is present: reason, meaning,
 *      password (§11.200(a)(1))                        400 ESIGNATURE_COMPONENT_MISSING
 *   3. the meaning is from the closed vocabulary
 *      (§11.50(a)(3)) and one this act can carry (the
 *      route's `meanings`; plan P1-51, DP-64), checked
 *      before the password so a refused meaning spends
 *      no guess                                         400 SIGNATURE_MEANING_* / MEANING_NOT_ALLOWED
 *   3p. the act's own precheck, when it has one (RR4,
 *      docs/design/REVIEW_ROUTING_2026-10-23.md §2.8,
 *      B7), before 3a: a read that refuses a signer
 *      the act will refuse anyway (not named on the
 *      review route, not their turn), so the refusal
 *      costs no credential check. It decides nothing:
 *      `run` re-checks under its row lock            the act's own codes
 *   3a. the signer's role carries signing authority
 *      (§11.10(g): identity is not authority), read
 *      from the membership row, before the password     403 ESIGNATURE_NO_AUTHORITY
 *   4. reverifySigner: the password, the second factor
 *      whenever one is enrolled, the account's lockout
 *      and standing (services/part11/reverify-signer)    its own status and code
 *   5. BEGIN, the tenant context, a lock on the act's target held to COMMIT
 *      (DP-65: a second sign of the same record waits, then reads it as the
 *      first left it, and its domain write refuses), the domain write (a coded
 *      domain error refuses)
 *   6. the `sign` ledger pair and the electronic_signatures row, on the same client
 *   6a. the act's afterSign, when it has one (RR4, B7), on the same
 *      transaction: work that cites the signature row's id (a review route's
 *      task closes on `esig:<id>`). A throw rolls the whole act back
 *   7. COMMIT: the act, its ledger pair and its signature land together or not at all
 *
 * In front of it, `signedActAttempts`: the per-signer limit on credential checks
 * (§11.300(d)) the protocol signing routes mount, one budget across every route
 * that signs through here. A wrong password also counts toward the account's
 * lockout inside reverifySigner.
 *
 * The signature row records only the factors step 4 verified. It binds what
 * deriveGovernedTargetBinding derives for the target: the content digest when
 * the target's prefix has a content binder (services/part11/
 * governed-target-binders.ts), otherwise the ledger's chain hash with its
 * basis named (it never invents a content hash). An act whose target has a
 * binder declares that basis (`contentBasis`), and a binding that falls back
 * then refuses the act, 409 SIGNATURE_CONTENT_UNBOUND, with nothing signed:
 * the labeling approvals and the residual-risk acceptance, since 2026-10-29
 * (docs/evidence/D5-CONTENT-DIGEST-BINDERS/2026-10-29/). The manifest keeps
 * the ledger's chain hash beside the content digest either way.
 *
 * Not here: separation of duties. Authorship is not modelled for these record
 * types (resolveTargetAuthors returns "not modelled"), so an independence check
 * would refuse every signature. protocol-signature.ts is the pattern for a
 * domain that models it.
 *
 * @module server/routes/governed-signed-act
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { requestPgClient } from '../db/requestDb';
import { serverError } from '../lib/api-response';
import type { RequestDbClient } from '../middleware/lazyRequestDbClient';
import { signingAttemptLimiter } from '../middleware/signing-attempt-limiter';
import { checkSigningAuthority } from '../services/part11/signing-authority-gate';
import { signerOrganizationStatusesFor } from '../services/part11/custody-signature';
import { reverifySigner, type SignerReverification } from '../services/part11/reverify-signer';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps';
import { signMeaningRefusal, type GovernedSignMeaning } from '../services/part11/signature-meanings';
import { persistGovernedSignSignature, type BindingBasis } from '../services/part11/signature-persistence';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { resolveOrgId, resolveUserId } from '../types/auth-request';
import { clientIpOf } from '../utils/client-ip';
import { createScopedLogger } from '../utils/logger';
import { recordGovernedAction } from './c2c/actions';
import { governedReason } from './governed-reason';

const log = createScopedLogger('governed-signed-act');

/** Mount before every route that calls signGovernedAct: 10 credential checks per signer per 5 minutes. */
export const signedActAttempts = signingAttemptLimiter('governed-signed-act', {
  error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many signing attempts. Wait a few minutes and try again. Nothing was signed.' },
});

/**
 * The signature's components, as the QMS approval takes them and the shared
 * EsignModal collects them (its `totp` is sent as `mfaToken`). A route's own
 * fields, if any, sit beside these in the same body.
 */
export const signedActBody = z.object({
  reason: governedReason,
  meaning: z.string().min(1, 'Declare what this signature means (21 CFR Part 11 §11.50).'),
  password: z.string().min(1, 'Re-enter your password to sign (21 CFR Part 11 §11.200).'),
  mfaToken: z.string().optional(),
});

/** What the domain write returns: the ledger target, what was decided, and the response body. */
export interface SignedActResult {
  target: string;
  /** What was decided. It goes into the ledger payload and onto the signature manifest. */
  payload?: Record<string, unknown>;
  body: Record<string, unknown>;
}

export interface SignedAct {
  /** c2c_ana_actions.domain, as the route's other governed writes record it. */
  domain: string;
  /**
   * The record being signed, as the ledger names it (`biosketch:12`). Locked
   * before the domain write and held to COMMIT, so two signs of one record run
   * one after the other (DP-65); `run` must return the same target.
   */
  target: string;
  /**
   * The meanings this act can carry (§11.50(a)(3); DP-64): one of the act sets
   * in services/part11/signature-meanings.ts. Any other meaning is refused
   * before the password is asked for.
   */
  meanings: readonly GovernedSignMeaning[];
  /** The route's domain refusal codes and their statuses. Any other error is a 500 with no error text. */
  codeStatus: Readonly<Record<string, number>>;
  /**
   * The content basis (BINDING_BASIS) the target's binder records, when it has
   * one (21 CFR 11.70). Declared, the signature binds that content or the act
   * is refused, 409 SIGNATURE_CONTENT_UNBOUND, and nothing is signed: it never
   * falls back to the ledger chain hash. Left out, the signature binds what
   * deriveGovernedTargetBinding derives, the ledger basis named when there is
   * no binder.
   */
  contentBasis?: BindingBasis;
  /** Set as app.current_user_role on the signing transaction, where the route's other writes set it. */
  tenantRole?: string;
  /**
   * The organisation statuses a signer may sign from; active when absent. Only
   * the custody act of a departing tenant's export (P-58,
   * services/part11/custody-signature.ts isCustodyAct: its target, domain and
   * meanings together) may name pending_deletion; any other act that does is
   * held to active organisations, so its signer is refused as before.
   */
  signerOrganizationStatuses?: readonly ('active' | 'pending_deletion')[];
  /**
   * Asked before the signing authority check and the credential (RR4, B7): a
   * read on the request's client, outside the transaction, that refuses a
   * signer the domain write would refuse anyway, so the refusal spends no
   * password guess. Throw an error with a `code` in `codeStatus` to refuse.
   * It never authorizes: `run` re-checks what it read under its own lock.
   */
  precheck?: (client: RequestDbClient, orgId: number, userId: number) => Promise<void>;
  /** The domain write, on the signing transaction. Throw an error with a `code` to refuse. */
  run: (client: RequestDbClient, orgId: number, userId: number) => Promise<SignedActResult>;
  /**
   * Work on the signing transaction after the electronic_signatures row is
   * written and before COMMIT (RR4, B7), so it can cite the row's id. A throw
   * rolls back the act, its ledger pair and the signature together.
   */
  afterSign?: (client: RequestDbClient, signature: { id: number; signedAt: Date }, result: SignedActResult, orgId: number, userId: number) => Promise<void>;
  /**
   * Work that follows the committed act (a reminder, a task), run after COMMIT
   * and before the response. Best effort: a failure is logged and never
   * changes the signature or the answer, which have already committed.
   */
  afterCommit?: (result: SignedActResult, orgId: number, userId: number) => Promise<void>;
}

interface SignatureComponents {
  orgId: number;
  userId: number;
  reason: string;
  meaning: GovernedSignMeaning;
  password: string;
  mfaToken?: string;
}

/** The act's follow-up work, never able to touch what committed (SignedAct.afterCommit). */
async function runAfterCommit(act: SignedAct, result: SignedActResult, orgId: number, userId: number): Promise<void> {
  if (!act.afterCommit) return;
  try {
    await act.afterCommit(result, orgId, userId);
  } catch (err) {
    log.warn('Work after a signed act failed; the act stands', { domain: act.domain, target: act.target, err: err instanceof Error ? err.message : String(err) });
  }
}

function refusal(res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}): null {
  res.status(status).json({ error: { code, message, ...extra } });
  return null;
}

/** Steps 1-3: who is signing, and whether every component arrived. Writes the refusal and returns null otherwise. */
function signatureComponents(req: Request, res: Response, meanings: readonly GovernedSignMeaning[]): SignatureComponents | null {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return refusal(res, 401, 'AUTH_REQUIRED', 'Authentication required.');

  const parsed = signedActBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return refusal(
      res,
      400,
      'ESIGNATURE_COMPONENT_MISSING',
      `This act is an electronic signature: it needs your password, what the signature means and a reason. Missing or invalid: ${Object.keys(fieldErrors).join(', ')}. Nothing was signed.`,
      { fieldErrors },
    );
  }
  const meaningRefused = signMeaningRefusal(parsed.data.meaning);
  if (meaningRefused) {
    return refusal(res, 400, meaningRefused.error, `The signature meaning is not one the platform records. ${meaningRefused.detail} Nothing was signed.`);
  }
  const meaning = parsed.data.meaning as GovernedSignMeaning;
  // The refusal the other ceremony gives (services/part11/governed-signature-ceremony.ts).
  if (!meanings.includes(meaning)) {
    return refusal(res, 400, 'MEANING_NOT_ALLOWED', `This signature can mean ${meanings.join(', ')}; "${meaning}" is not one of them. Nothing was signed.`);
  }
  return { orgId, userId, ...parsed.data, meaning };
}

/**
 * The ceremony's own refusals inside the transaction, beside each route's. A
 * declared content basis that cannot be bound (SignatureContentUnboundError)
 * signed nothing, so it is a refusal the signer can read, not a 5xx whose
 * outcome is unconfirmed.
 */
const CEREMONY_CODE_STATUS: Readonly<Record<string, number>> = { SIGNATURE_CONTENT_UNBOUND: 409 };

/** A coded domain refusal keeps its status and sentence; anything else is a 500 that carries no error text. */
function answerFailure(res: Response, routeCodeStatus: Readonly<Record<string, number>>, err: unknown): void {
  const codeStatus = { ...CEREMONY_CODE_STATUS, ...routeCodeStatus };
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && codeStatus[code]) {
    res.status(codeStatus[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  serverError(res, log, 'signing the governed act', err);
}

/**
 * Run `act` as an electronic signature. Answers the request itself: 201 with
 * the act's body, the ledger ids and the signature id, or the refusal.
 */
export async function signGovernedAct(req: Request, res: Response, act: SignedAct): Promise<void> {
  const parts = signatureComponents(req, res, act.meanings);
  if (!parts) return;
  const { orgId, userId, reason, meaning } = parts;

  // Authority and credential reads use the same tenant-pinned client as the
  // signed act. Resolving the lazy client opens no domain transaction; absent
  // request context refuses before checking credentials on any shared pool.
  let client: RequestDbClient;
  try {
    client = requestPgClient(req) as unknown as RequestDbClient;
  } catch (err) {
    serverError(res, log, 'opening the signing transaction', err);
    return;
  }

  // Step 3p (RR4, B7): the act's own refusal, before authority or any credential is asked.
  if (act.precheck) {
    try {
      await act.precheck(client, orgId, userId);
    } catch (err) {
      answerFailure(res, act.codeStatus, err);
      return;
    }
  }

  // Step 3a (§11.10(g)): the platform's one signing-authority policy
  // (checkSigningAuthority), from the persisted membership, never the token or
  // the body. Until 2026-10-01 these routes had none, so a viewer who knew their
  // own password signed an IRB approval. Until 2026-10-08 (P-27) they asked a
  // copy of it, whose failed role lookup answered 500 rather than 503.
  const authority = await checkSigningAuthority(userId, orgId, client, { organizationStatuses: signerOrganizationStatusesFor(act) });
  if (authority) {
    refusal(res, authority.status, authority.code, authority.message);
    return;
  }

  // Step 4, before the domain transaction: a refusal signs nothing. Failed
  // credential accounting remains durable on this tenant-pinned connection.
  let verified: SignerReverification;
  try {
    verified = await reverifySigner(userId, { password: parts.password, mfaToken: parts.mfaToken }, signerReverificationDeps(client));
  } catch (err) {
    serverError(res, log, 'verifying the signer', err);
    return;
  }
  if (!verified.ok) {
    // Some refusals already say it (AUTHENTICATOR_REQUIRED); it is said once.
    const message = verified.error.endsWith('Nothing was signed.') ? verified.error : `${verified.error} Nothing was signed.`;
    res.status(verified.status).json({ error: { code: verified.code, message } });
    return;
  }

  // Steps 5-7 run on the request's own connection, which the auth boundary
  // pinned with this tenant's session variables; the request releases it when
  // the response ends.
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId, act.tenantRole);
    // DP-65: the domain writes read the record's state unlocked, so two signs
    // that both read a draft both signed it. A second sign of this target now
    // waits here until the first commits or rolls back, then reads what it left.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`governed-signed-act:${orgId}:${act.target}`]);
    const result = await act.run(client, orgId, userId);
    const { target, payload = {}, body } = result;
    if (target !== act.target) throw new Error(`signed act wrote ${target}, declared ${act.target}`);
    const signedPayload = { ...payload, meaning };
    const gov = await recordGovernedAction(client, { orgId, userId, command: 'sign', target, reason, payload: signedPayload, domain: act.domain });
    const signature = await persistGovernedSignSignature(client, {
      orgId,
      userId,
      target,
      reason,
      payload: signedPayload,
      actionId: gov.actionId,
      auditId: gov.auditId,
      sha256Chain: gov.sha256Chain,
      // Only the factors reverifySigner checked above.
      authenticationMethod: verified.authenticationMethod,
      secondFactorVerified: verified.secondFactorVerified,
      ipAddress: clientIpOf(req),
      occurredAt: new Date(),
      ...(Object.keys(payload).length > 0 ? { extraManifest: { act: payload } } : {}),
      ...(act.contentBasis ? { requiredBasis: act.contentBasis } : {}),
    });
    if (act.afterSign) await act.afterSign(client, { id: signature.id, signedAt: signature.signedAt }, result, orgId, userId);
    await client.query('COMMIT');
    await runAfterCommit(act, result, orgId, userId);
    res.status(201).json({ ...body, ...gov, signatureId: signature.id, signedAt: signature.signedAt.toISOString(), meaning });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    answerFailure(res, act.codeStatus, err);
  }
}
