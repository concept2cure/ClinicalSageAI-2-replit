/**
 * Which signature a governed `revoke-signature` withdraws: the rule, kept pure.
 *
 * `persistGovernedSignatureRevocation` (signature-persistence.ts) reads the live
 * signatures on the target, each with the intent its sign action declared, and
 * asks `chooseSignatureToRevoke` for the one the person named. It used to take
 * the newest live row on the target, whatever it was given for. Since P-34
 * (docs/LAUNCH_DEFINITION_OF_DONE.md "### P-34") a sequence target,
 * `ectd-sequence:<id>`, carries live signatures for several acts at once — a
 * freeze, a dispatch (the release), a transmit, a Shadow Review waiver and, per
 * P-35, one disposition per critical finding — so revoking the release could
 * withdraw the waiver instead, or the reverse, and the revocation row named the
 * wrong signature as revoked (21 CFR Part 11 §11.10(e), §11.70). Row D5,
 * 2026-10-15; evidence docs/evidence/D5/2026-10-15-revocation-by-intent/.
 *
 * The payload names the signature (RevocationSelector): `signatureId`,
 * `signatureActionId` or `intent`. Exactly one live signature must answer, or
 * the revocation is refused and nothing is written. Unnamed, a target with one
 * live signature revokes that one; with several, whatever they were given for,
 * nothing is revoked and the caller is told which to name. (A first version
 * kept "the newest" for targets whose signatures declare no intent; two signers
 * on one document is the same hazard, so it was made strict the same day.)
 *
 * No database access here, so the route can apply the selector rule before
 * re-authentication and the writer can apply it again as the floor.
 *
 * @module server/services/part11/revocation-selection
 */

/**
 * A governed revocation could not identify the signature it revokes. Fail
 * closed: a revocation that cannot name what it revokes revokes nothing, and
 * recording it would leave the supersession chain claiming an act that never
 * landed.
 */
export class SignatureRevocationUnresolvedError extends Error {
  readonly code = 'REVOCATION_TARGET_UNRESOLVED';
  constructor(message: string) {
    super(message);
    this.name = 'SignatureRevocationUnresolvedError';
  }
}

/**
 * A live signature on the target, as a revocation sees it: which row, which
 * governed sign action it was given under, and the intent that action declared
 * (null when it declared none, or no action row names it).
 */
export interface RevocationCandidate {
  signatureId: number;
  signatureActionId: string | null;
  intent: string | null;
  signedAt: string | null;
}

/**
 * More than one live signature answers to what the revocation named (or, on a
 * target whose signatures declare intents, it named nothing and there is more
 * than one). Fail closed: picking one would record the withdrawal of a
 * signature nobody chose. `candidates` lists them, newest first, so the caller
 * can name one by its signatureId.
 */
export class SignatureRevocationAmbiguousError extends Error {
  readonly code = 'REVOCATION_TARGET_AMBIGUOUS';
  readonly candidates: RevocationCandidate[];
  constructor(message: string, candidates: RevocationCandidate[]) {
    super(message);
    this.name = 'SignatureRevocationAmbiguousError';
    this.candidates = candidates;
  }
}

/**
 * The revocation's selector is malformed: a signatureId that is not a positive
 * integer, or a signatureActionId or intent that is not a non-empty string. It
 * names nothing that could be resolved, so it is refused before any query.
 */
export class SignatureRevocationSelectorError extends Error {
  readonly code = 'REVOCATION_SELECTOR_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'SignatureRevocationSelectorError';
  }
}

/**
 * What a governed `revoke-signature` names as the signature it withdraws, read
 * from the action payload. Each member narrows the live signatures on the
 * target, and they combine: `{ signatureId, intent }` means "signature N, which
 * must have been given for this intent".
 */
export interface RevocationSelector {
  /** electronic_signatures.id of the signature to revoke. */
  signatureId?: number;
  /** The governed `sign` action it was given under (its manifest `actionId`). */
  signatureActionId?: string;
  /** The intent its sign action declared (c2c_ana_actions.payload.intent): 'freeze', 'dispatch', 'shadow-waiver', … */
  intent?: string;
}

/**
 * The HTTP answer to a revocation refusal, or null for any other error. Nothing
 * was written in any of these cases (the writer throws before its INSERT, or
 * the transaction rolled back). An ambiguous refusal carries the candidates so
 * the caller can name one by signatureId.
 */
export function revocationRefusal(
  err: unknown,
): { status: 400 | 409; body: { error: string; detail: string; candidates?: RevocationCandidate[] } } | null {
  if (err instanceof SignatureRevocationUnresolvedError) return { status: 409, body: { error: err.code, detail: err.message } };
  if (err instanceof SignatureRevocationAmbiguousError) {
    return { status: 409, body: { error: err.code, detail: err.message, candidates: err.candidates } };
  }
  if (err instanceof SignatureRevocationSelectorError) return { status: 400, body: { error: err.code, detail: err.message } };
  return null;
}

type RevokePayload = Record<string, unknown> | null | undefined;

const POSITIVE_INTEGER_TEXT = /^[1-9]\d*$/;

/** The selector in a revoke payload, or why it names nothing. */
function parseRevocationSelector(payload: RevokePayload): { selector: RevocationSelector } | { refusal: string } {
  const p = payload ?? {};
  const selector: RevocationSelector = {};
  const rawId = p.signatureId;
  if (rawId != null) {
    const id =
      typeof rawId === 'number' ? rawId : typeof rawId === 'string' && POSITIVE_INTEGER_TEXT.test(rawId) ? Number(rawId) : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { refusal: 'signatureId must be the positive integer id of an electronic signature. Nothing was revoked.' };
    }
    selector.signatureId = id;
  }
  for (const key of ['signatureActionId', 'intent'] as const) {
    const raw = p[key];
    if (raw == null) continue;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { refusal: `${key} must be a non-empty string. Nothing was revoked.` };
    }
    selector[key] = raw.trim();
  }
  return { selector };
}

/**
 * Why a revoke payload's selector is refused, or null. The route asks this
 * before re-authentication, so a signer is not asked for a password for a
 * request the writer would refuse anyway; the writer applies the same rule.
 */
export function revocationSelectorRefusal(
  payload: RevokePayload,
): { error: 'REVOCATION_SELECTOR_INVALID'; detail: string } | null {
  const parsed = parseRevocationSelector(payload);
  return 'refusal' in parsed ? { error: 'REVOCATION_SELECTOR_INVALID', detail: parsed.refusal } : null;
}

/** The selector a revoke payload names; throws SignatureRevocationSelectorError when it is malformed. */
export function revocationSelectorOf(payload: RevokePayload): RevocationSelector {
  const parsed = parseRevocationSelector(payload);
  if ('refusal' in parsed) throw new SignatureRevocationSelectorError(`revoke-signature: ${parsed.refusal}`);
  return parsed.selector;
}

const isoOrNull = (v: unknown): string | null => {
  if (v == null) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** A candidate from a row carrying `id`, `action_id`, `intent` and `signed_at`. */
export function revocationCandidateOf(row: Record<string, unknown>): RevocationCandidate {
  return {
    signatureId: Number(row.id),
    signatureActionId: typeof row.action_id === 'string' ? row.action_id : null,
    intent: typeof row.intent === 'string' ? row.intent : null,
    signedAt: isoOrNull(row.signed_at),
  };
}

const describeIntent = (intent: string | null): string => (intent === null ? 'no declared intent' : intent);

const describeCandidate = (c: RevocationCandidate): string =>
  `${c.signatureId} (${describeIntent(c.intent)}${c.signedAt ? `, signed ${c.signedAt}` : ''})`;

function describeSelector(s: RevocationSelector): string {
  const parts: string[] = [];
  if (s.signatureId !== undefined) parts.push(`signature ${s.signatureId}`);
  if (s.signatureActionId !== undefined) parts.push(`sign action '${s.signatureActionId}'`);
  if (s.intent !== undefined) parts.push(`intent '${s.intent}'`);
  return parts.join(' with ');
}

/**
 * The one live signature a revocation withdraws, chosen from `candidates` (the
 * live signatures on the target, newest first). Pure; throws the refusal.
 *
 *   - Named (id, sign action, intent, or a combination): exactly one candidate
 *     must answer. None → REVOCATION_TARGET_UNRESOLVED; more → AMBIGUOUS.
 *   - Not named, and some candidate declares an intent (a sequence since P-34):
 *     exactly one may be live, otherwise AMBIGUOUS. Taking the newest is how a
 *     release revocation withdrew a waiver instead.
 *   - Not named, and no candidate declares an intent: the newest, as before
 *     intents existed. Such a target's signatures are of one kind.
 */
export function chooseSignatureToRevoke(
  candidates: readonly RevocationCandidate[],
  selector: RevocationSelector,
  where: { target: string; orgId: number },
): RevocationCandidate {
  const named =
    selector.signatureId !== undefined || selector.signatureActionId !== undefined || selector.intent !== undefined;
  const matches = candidates.filter(
    (c) =>
      (selector.signatureId === undefined || c.signatureId === selector.signatureId) &&
      (selector.signatureActionId === undefined || c.signatureActionId === selector.signatureActionId) &&
      (selector.intent === undefined || c.intent === selector.intent),
  );

  if (matches.length === 0) {
    if (!named) {
      throw new SignatureRevocationUnresolvedError(
        `revoke-signature: no active electronic signature is anchored to target '${where.target}' in organization ${where.orgId} — refusing to record a revocation of nothing (§11.70).`,
      );
    }
    const byId = selector.signatureId === undefined ? undefined : candidates.find((c) => c.signatureId === selector.signatureId);
    const why =
      byId && selector.intent !== undefined && byId.intent !== selector.intent
        ? ` Signature ${byId.signatureId} was given for '${describeIntent(byId.intent)}', not '${selector.intent}'.`
        : '';
    const live = candidates.length > 0 ? ` Live signatures on this target: ${candidates.map(describeCandidate).join('; ')}.` : '';
    throw new SignatureRevocationUnresolvedError(
      `revoke-signature: no live electronic signature on target '${where.target}' answers to ${describeSelector(selector)} ` +
        `(it may not exist on this target, or it is already out of force).${why}${live} Nothing was revoked (§11.70).`,
    );
  }
  if (matches.length === 1) return matches[0];

  throw new SignatureRevocationAmbiguousError(
    `revoke-signature: ${matches.length} live electronic signatures on target '${where.target}' answer to ` +
      `${named ? describeSelector(selector) : 'a revocation that names none of them'}: ` +
      `${matches.map(describeCandidate).join('; ')}. Name the one to revoke by its signatureId. Nothing was revoked (§11.70).`,
    matches,
  );
}
