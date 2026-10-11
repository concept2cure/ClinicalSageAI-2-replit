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
 *   7. COMMIT: the act, its ledger pair and its signature land together or not at all
 *
 * In front of it, `signedActAttempts`: the per-signer limit on credential checks
 * (§11.300(d)) the protocol signing routes mount, one budget across every route
 * that signs through here. A wrong password also counts toward the account's
 * lockout inside reverifySigner.
 *
 * The signature row records only the factors step 4 verified, and binds the
 * ledger's chain hash with its basis named (deriveGovernedTargetBinding has no
 * content digest for these record types and says so; it never invents one).
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
import { reverifySigner, type SignerReverification } from '../services/part11/reverify-signer';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps';
import { signMeaningRefusal, type GovernedSignMeaning } from '../services/part11/signature-meanings';
import { persistGovernedSignSignature } from '../services/part11/signature-persistence';
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
  /** Set as app.current_user_role on the signing transaction, where the route's other writes set it. */
  tenantRole?: string;
  /** The domain write, on the signing transaction. Throw an error with a `code` to refuse. */
  run: (client: RequestDbClient, orgId: number, userId: number) => Promise<SignedActResult>;
}

interface SignatureComponents {
  orgId: number;
  userId: number;
  reason: string;
  meaning: GovernedSignMeaning;
  password: string;
  mfaToken?: string;
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

/** A coded domain refusal keeps its status and sentence; anything else is a 500 that carries no error text. */
function answerFailure(res: Response, codeStatus: Readonly<Record<string, number>>, err: unknown): void {
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

  // Step 3a (§11.10(g)): the platform's one signing-authority policy
  // (checkSigningAuthority), from the persisted membership, never the token or
  // the body. Until 2026-10-01 these routes had none, so a viewer who knew their
  // own password signed an IRB approval. Until 2026-10-08 (P-27) they asked a
  // copy of it, whose failed role lookup answered 500 rather than 503.
  const authority = await checkSigningAuthority(userId, orgId);
  if (authority) {
    refusal(res, authority.status, authority.code, authority.message);
    return;
  }

  // Step 4, before any connection is taken: a refused signer writes nothing.
  let verified: SignerReverification;
  try {
    verified = await reverifySigner(userId, { password: parts.password, mfaToken: parts.mfaToken }, signerReverificationDeps());
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
  // the response ends. A request with no tenant connection refuses here rather
  // than signing on a shared-pool connection.
  let client: RequestDbClient;
  try {
    client = requestPgClient(req) as unknown as RequestDbClient;
  } catch (err) {
    serverError(res, log, 'opening the signing transaction', err);
    return;
  }
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId, act.tenantRole);
    // DP-65: the domain writes read the record's state unlocked, so two signs
    // that both read a draft both signed it. A second sign of this target now
    // waits here until the first commits or rolls back, then reads what it left.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`governed-signed-act:${orgId}:${act.target}`]);
    const { target, payload = {}, body } = await act.run(client, orgId, userId);
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
    });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov, signatureId: signature.id, signedAt: signature.signedAt.toISOString(), meaning });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    answerFailure(res, act.codeStatus, err);
  }
}
