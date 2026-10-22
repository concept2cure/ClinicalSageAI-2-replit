/**
 * Governed transmit — the refusal vocabulary, and the checks on the FILING a
 * package bundle makes: which sequence and application number the agency is
 * told it carries, and whether that sequence is already on its way.
 *
 * Split out of ./governed-transmit (2026-10-01, W5/D7, sweep F15/F18) when
 * these checks took that module past its length limit. The error classes moved
 * verbatim and are re-exported from ./governed-transmit, which every caller
 * imports them from.
 *
 * @module server/services/submission-gateways/governed-transmit-checks
 */

import { findActiveTransmittal } from './fda-esg';
import { filedEntryHolding } from '../ectd/package-sequence-lifecycle';
import { usableIdentifier } from '../ectd/regulatory-identifiers';
import type { GovernedTransmitInput, ResolvedBundle } from './governed-transmit';
import { RELEASE_ACT_MEANINGS } from '../part11/signature-meanings';

/* ─── Refusal vocabulary ─────────────────────────────────────────── */

/**
 * Why a governed transmit was refused BEFORE any bytes left the platform.
 *
 * Every one of these is an honest "no", not a failure: the caller asked for a
 * transmission the platform is not willing to make, and no transmittal row,
 * acknowledgement or agency identifier is produced.
 */
export type GovernedTransmitRefusalCode =
  | 'CLIENT_DESCRIPTOR_REFUSED'
  | 'BUNDLE_NOT_ASSEMBLED'
  | 'BUNDLE_PATH_UNSAFE'
  | 'BUNDLE_VALIDATION_UNKNOWN'
  | 'BUNDLE_OUTSIDE_NAMESPACE'
  | 'BUNDLE_STORAGE_KEY_OUTSIDE_NAMESPACE'
  | 'BUNDLE_VALIDATION_ERRORS'
  | 'BUNDLE_CONTENT_DRIFT'
  | 'BUNDLE_CONTENT_UNPROVEN'
  | 'METADATA_DESCRIPTOR_MISMATCH'
  | 'SEQUENCE_ALREADY_FILED'
  | 'ACTIVE_TRANSMITTAL'
  | 'SIGNER_IS_AUTHOR'
  | 'AUTHORSHIP_NOT_A_RELEASE'
  | 'MEANING_NOT_A_RELEASE'
  | 'SIGNER_INDEPENDENCE_UNRESOLVED'
  | 'ESIGNATURE_NO_AUTHORITY';

/** A refusal the caller should surface verbatim to the operator. */
export class GovernedTransmitRefusal extends Error {
  readonly name = 'GovernedTransmitRefusal';
  constructor(
    readonly code: GovernedTransmitRefusalCode,
    message: string,
    /** HTTP status the pre-existing route used for this refusal. */
    readonly httpStatus: 403 | 409 | 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * An internal failure (DB read, durable-storage fetch) rather than a refusal.
 * Carries the log label the HTTP route used so its 500 telemetry is unchanged.
 */
export class GovernedTransmitInternalError extends Error {
  readonly name = 'GovernedTransmitInternalError';
  constructor(readonly stage: string, readonly cause: unknown) {
    super(`governed transmit failed at stage '${stage}'`);
  }
}

/* ─── The filing a package bundle makes ─────────────────────────── */

/** A sequence as the gateways read it (requiredAgencyMetadata in ./types). */
function sequenceOf(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim();
  return typeof raw === 'number' ? String(raw).padStart(4, '0') : null;
}

const DESCRIPTOR_DECIDES = 'Agency metadata for a package bundle is taken from the package and its assembled bundle';

/**
 * The metadata the gateway sends and writes on the transmittal row. For a
 * package bundle that files an eCTD sequence, the sequence and application
 * number are the stored descriptor's and the package record's, not the
 * caller's: the caller's free-form metadata could name others, so the SFTP
 * deposit path and the transmittal row said one filing while the filed
 * history recorded another (2026-10-01, W5/D7, sweep F18), and the
 * duplicate-send lock reads the sequence from this row (sweep F15). A caller
 * value that disagrees is refused, never silently replaced. A dev/test client
 * descriptor, or a bundle that files no sequence, sends the caller's metadata
 * as before. The environment is always the request's.
 */
export function agencyMetadata(input: GovernedTransmitInput, bundle: ResolvedBundle): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (!input.clientBundle && bundle.sequence) {
    if (metadata.sequence != null && sequenceOf(metadata.sequence) !== bundle.sequence) {
      throw new GovernedTransmitRefusal(
        'METADATA_DESCRIPTOR_MISMATCH',
        `metadata.sequence does not match the sequence the assembled bundle files (${bundle.sequence}). ` +
          `${DESCRIPTOR_DECIDES}; omit metadata.sequence, or assemble the sequence you mean to send.`,
        422,
        { sequence: bundle.sequence },
      );
    }
    const recorded = bundle.applicationNumber ?? null;
    if (metadata.applicationId != null && (!recorded || usableIdentifier('applicationNumber', metadata.applicationId) !== recorded)) {
      throw new GovernedTransmitRefusal(
        'METADATA_DESCRIPTOR_MISMATCH',
        recorded
          ? `metadata.applicationId does not match the application number the package records (${recorded}). ` +
              `${DESCRIPTOR_DECIDES}; omit metadata.applicationId, or correct the package's application number and re-assemble.`
          : `metadata.applicationId names an application number, but the package records none. ` +
              `${DESCRIPTOR_DECIDES}; record the application number on the package and re-assemble, or omit metadata.applicationId.`,
        422,
        { applicationNumber: recorded },
      );
    }
    metadata.sequence = bundle.sequence;
    if (recorded) metadata.applicationId = recorded;
  }
  return { ...metadata, environment: input.environment };
}

/**
 * One bundle per filed sequence. A production send of a package bundle whose
 * sequence the package's filed history already holds ON FILE as a DIFFERENT
 * bundle is refused before the bytes leave: the agency loads at most one of
 * two filings under one number, and the history can describe only one
 * (2026-10-01, W5/D7, sweep F19 — the second was sent, and reported recorded
 * while the history kept the first). Asked with the writer's own question
 * (filedEntryHolding), of the history on the row loadStoredBundle read. The
 * same bundle again is not refused (a re-send of the bytes already on file
 * files nothing new). Only a production send
 * files anything, so only one is held back.
 */
export function assertSequenceNotFiledAsAnotherBundle(input: GovernedTransmitInput, bundle: ResolvedBundle): void {
  if (input.clientBundle || !bundle.sequence || input.environment !== 'production') return;
  const filed = filedEntryHolding(bundle.filedSequences, bundle.sequence);
  if (!filed || filed.sha256 === bundle.sha256.toLowerCase()) return;
  const holding = filed.transmittalId == null ? 'an earlier transmittal' : `transmittal ${filed.transmittalId}`;
  throw new GovernedTransmitRefusal(
    'SEQUENCE_ALREADY_FILED',
    `Sequence ${bundle.sequence} of this package is already on file, sent by ${holding} as a different bundle. ` +
      'Sending this one would put two filings under one sequence number, and the agency loads at most one of them. ' +
      "If the agency did not load that filing (a technical rejection), record the rejection with the agency's notice " +
      `as evidence before sending sequence ${bundle.sequence} again; otherwise assemble the next sequence.`,
    409,
    { sequence: bundle.sequence, filedSha256: filed.sha256, filedTransmittalId: filed.transmittalId },
  );
}

/**
 * Per-package transmit lock. Refuse a second transmit against the same
 * (org, package_id, bundle_sha256) while a prior attempt is still active
 * (pending|in_transit|received). Terminal states (rejected, rolled_back,
 * completed) are excluded by findActiveTransmittal so a rolled-back package
 * CAN be intentionally re-transmitted. The DB-level partial unique index
 * (sub_trans_active_lock_idx) is the backstop for races between this check
 * and the gateway's INSERT. Cross-tenant double-transmit is allowed by design
 * (CMO scenario).
 *
 * The bytes are not the whole key: re-assembling a sequence produces a new
 * zip sha256 for the same sequence, so a package bundle's SEQUENCE in this
 * environment is held too (2026-10-01, W5/D7, sweep F15) — while the first
 * send is in flight, or was delivered but is unconfirmed, the agency may hold
 * it. That match is this check only; no index backs it.
 */
export async function assertNoActiveTransmittal(input: GovernedTransmitInput, bundle: ResolvedBundle): Promise<void> {
  let active: Awaited<ReturnType<typeof findActiveTransmittal>>;
  try {
    active = await findActiveTransmittal({
      organizationId: input.organizationId,
      packageId: input.packageId ?? null,
      bundleSha256: bundle.sha256,
      filing: !input.clientBundle && bundle.sequence ? { sequence: bundle.sequence, environment: input.environment } : null,
      environment: input.environment,
    });
  } catch (err) {
    throw new GovernedTransmitInternalError('transmit-active-lock-check', err);
  }
  if (!active) return;
  throw new GovernedTransmitRefusal(
    'ACTIVE_TRANSMITTAL',
    activeTransmittalMessage(active, input.environment),
    409,
    {
      transmittalId: active.id,
      status: active.status,
      ...(active.sequence ? { sequence: active.sequence, environment: input.environment } : {}),
      ...(active.holderEnvironment ? { holderEnvironment: active.holderEnvironment } : {}),
    },
  );
}

type ActiveHolder = NonNullable<Awaited<ReturnType<typeof findActiveTransmittal>>>;

/** The agency environment a send went to, as an operator reads it. */
const ENVIRONMENT_WORDS: Record<string, string> = {
  staging: "the agency's test environment",
  production: "the agency's production environment",
};

/** An active transmittal's status in an operator's words, never the stored token. */
const ACTIVE_STATUS_WORDS: Record<string, string> = {
  pending: 'it is still being sent',
  in_transit: 'its receipt is not yet confirmed',
};

/** Where a resend goes, now that a transmittal cannot be rolled back (6ef0ef121). */
const RESEND_REMEDY = 'If a resend is needed, send it as a new sequence from Submission Center.';

/**
 * Why a transmit is held by an active transmittal, and what to do — said so the
 * operator can read it as sent: no route path (a client hides text that looks
 * internal and substitutes its own), no status or environment token. Whatever
 * the variant, the agency may already hold the bundle, so receipt is confirmed
 * with the agency before anything is sent again, and a resend is a new
 * sequence from Submission Center. 2026-10-08 (W5/D7, sweep HS-6): the sentence
 * named the rollback route, so the surface replaced it with "Roll it back
 * first" and the caveat was lost. Since 2026-10-17 (6ef0ef121) there is no
 * rollback route to offer: it marked a transmittal the agency still held as
 * rolled back, and taking a filing back is a withdrawal sequence.
 *
 * The bytes lock has no environment in its key, so the holder may be a send to
 * the OTHER environment; that refusal says where it went instead (sweep HS-6
 * review: a received test send was reported to a first production send as "with
 * the agency").
 */
function activeTransmittalMessage(active: ActiveHolder, environment: GovernedTransmitInput['environment']): string {
  const ref = `transmittal #${active.id}`;
  const elsewhere = active.holderEnvironment ? ENVIRONMENT_WORDS[active.holderEnvironment] : undefined;
  if (elsewhere) return otherEnvironmentMessage(ref, active, elsewhere);
  const it = active.sequence ? `sequence ${active.sequence}` : 'it';
  const sentAs = active.sequence ? `, sent to ${ENVIRONMENT_WORDS[environment] ?? environment} as a different bundle` : '';
  if (active.status === 'received') {
    const held = active.sequence ? `sequence ${active.sequence} of this package` : 'this bundle';
    return (
      `The agency's gateway acknowledged receipt of ${ref}${sentAs}, so ${held} is with the agency. ` +
      `Confirm with the agency what it received. ${RESEND_REMEDY}`
    );
  }
  const where = active.sequence ? `Sequence ${active.sequence} of this package is already in ${ref}${sentAs}` : `This bundle is already in ${ref}`;
  const state = ACTIVE_STATUS_WORDS[active.status] ?? `its status is ${active.status.replace(/_/g, ' ')}`;
  const remedy = active.status === 'pending'
    ? 'That send has not finished; its row in the transmittal log shows the outcome once it does.'
    : RESEND_REMEDY;
  return `${where}, and ${state}. The agency may already hold it. Confirm receipt with the agency before sending ${it} again. ${remedy}`;
}

/** A send to the other environment's status, in an operator's words. */
const OTHER_ENVIRONMENT_STATE: Record<string, string> = {
  pending: '; that send has not finished',
  received: ', whose gateway acknowledged receipt',
};

/** The bundle is held by a send to the other environment: where it went, and what to do. */
function otherEnvironmentMessage(ref: string, active: ActiveHolder, elsewhere: string): string {
  const state = OTHER_ENVIRONMENT_STATE[active.status] ?? '; its receipt is not yet confirmed';
  const toProduction = active.holderEnvironment !== 'production';
  const scope = toProduction
    ? 'A send to the test environment does not file it in production.'
    : 'A production send does not deliver it to the test environment.';
  // A first send to this environment, not a resend: these bytes are held while
  // that transmittal is active, and there is no rollback to free them (6ef0ef121).
  const target = toProduction ? 'production' : 'the test environment';
  return `This bundle is held by ${ref}, sent to ${elsewhere}${state}. ${scope} ` +
    `These bytes cannot be sent to ${target} while that transmittal is active; to file there, send it as a new sequence from Submission Center.`;
}

/**
 * Signing authority (21 CFR 11.10(g)): a transmission to an agency is signed,
 * so only a role the signing policy authorizes may make it. Before 2026-10-08
 * (weekly review, SEC-1008-1) the gateway route admitted any role that may
 * write (member and manager included) and the AnA transmit path the same, so
 * an irreversible send to FDA or EMA went out under a signature the policy says
 * that person may not give, and an electronic_signatures row then recorded it.
 *
 * The question is the platform's one signing-authority check
 * (checkSigningAuthority, part11/signing-authority-gate.ts; P-27): the role is
 * the server's reading of this organization's membership, never the request's,
 * judged by the one policy every signing route uses. Asked first, before
 * credentials and before any byte is read, so an unauthorized caller spends no
 * password attempt and learns nothing about the package. A role that could not
 * be read is not authority: it surfaces as an internal error and nothing is
 * transmitted.
 */
export async function assertTransmitterHasSigningAuthority(organizationId: number, userId: number): Promise<void> {
  const { checkSigningAuthority } = await import('../part11/signing-authority-gate');
  const refusal = await checkSigningAuthority(userId, organizationId);
  if (!refusal) return;
  if (refusal.status === 503) {
    throw new GovernedTransmitInternalError('transmit-signing-authority', new Error(refusal.message));
  }
  throw new GovernedTransmitRefusal(
    'ESIGNATURE_NO_AUTHORITY',
    'Your role does not permit signing a transmission to the agency (21 CFR Part 11 §11.10(g)). ' +
      'A colleague with signing rights must transmit it. Nothing was transmitted.',
    403,
  );
}

/**
 * Separation of duties for a transmission to an agency: whoever created the
 * package does not send it, and a transmission is never signed "as author".
 *
 * Transmit re-authenticated the human and recorded the meaning they declared,
 * but never asked whether they were independent of the package — so the person
 * who assembled a package could send it to FDA themselves, under any meaning,
 * the "Authorship" one included. The submissions spine refuses exactly this at
 * freeze, dispatch and transmit (Gate 1); this is the same rule on the gateway
 * path, through the same canonical check (assertSignerIsNotAuthor), so the two
 * paths to an agency cannot disagree about who may release.
 *
 * Runs before any byte is read or sent. A failed authorship lookup is not
 * independence: it surfaces as an internal error and nothing is transmitted.
 */
export async function assertTransmitterIndependent(
  packageId: number,
  organizationId: number,
  userId: number,
  meaning: string,
): Promise<void> {
  const { requiresIndependence, assertSignerIsNotAuthor, SeparationOfDutiesError, SeparationOfDutiesAuthorUnresolvedError } =
    await import('../governance/separation-of-duties');
  if (!requiresIndependence('sign', meaning)) {
    throw new GovernedTransmitRefusal(
      'AUTHORSHIP_NOT_A_RELEASE',
      `A transmission to the agency is a release, not an authorship attestation; it cannot be signed with the meaning '${meaning}'. ` +
        'Sign it as release, approval or responsibility. Nothing was transmitted.',
      422,
    );
  }
  // 2026-10-19 (D5): authorship was the only meaning refused, so a package
  // went to the agency on a signature that said "I reviewed". Shared by the
  // HTTP transmit and AnA's k510 transmit (executeGovernedTransmit).
  if (!(RELEASE_ACT_MEANINGS as readonly string[]).includes(meaning)) {
    throw new GovernedTransmitRefusal(
      'MEANING_NOT_A_RELEASE',
      `A transmission to the agency is a release; it cannot be signed with the meaning '${meaning || 'none'}'. ` +
        'Sign it as release, approval or responsibility. Nothing was transmitted.',
      422,
    );
  }
  try {
    await assertSignerIsNotAuthor(`submission-package:${packageId}`, organizationId, userId, { meaning });
  } catch (err) {
    if (err instanceof SeparationOfDutiesError) {
      throw new GovernedTransmitRefusal(
        'SIGNER_IS_AUTHOR',
        'You created this package, so you cannot transmit it. Separation of duties requires a different colleague with ' +
          'signing rights to transmit it. Nothing was transmitted.',
        403,
      );
    }
    if (err instanceof SeparationOfDutiesAuthorUnresolvedError) {
      throw new GovernedTransmitRefusal(
        'SIGNER_INDEPENDENCE_UNRESOLVED',
        'No creator is recorded for this package, so nobody can be shown to be independent of it and it cannot be ' +
          'transmitted. Nothing was transmitted.',
        409,
      );
    }
    throw new GovernedTransmitInternalError('transmit-separation-of-duties', err);
  }
}

/** What a transmission by this user of this package would meet at the
 *  separation-of-duties check, asked in advance. */
export type TransmitIndependence = 'independent' | 'author' | 'no-creator' | 'unverified';

/**
 * Would assertTransmitterIndependent let this user transmit this package?
 *
 * Asked of the enforcing check itself, with a release meaning, so the advance
 * answer cannot drift from what transmit will do — the client never re-derives
 * who counts as the author. The check runs after re-authentication, so without
 * this the package's creator learned the rule only by typing a password and
 * being refused; the Transmit form now says so when the package is chosen.
 *
 * A lookup failure is 'unverified', never 'independent': unknown is not
 * permission, and the transmit itself still decides.
 */
export async function transmitIndependenceOf(
  packageId: number,
  organizationId: number,
  userId: number,
): Promise<TransmitIndependence> {
  try {
    await assertTransmitterIndependent(packageId, organizationId, userId, 'release');
    return 'independent';
  } catch (err) {
    if (err instanceof GovernedTransmitRefusal) {
      if (err.code === 'SIGNER_IS_AUTHOR') return 'author';
      if (err.code === 'SIGNER_INDEPENDENCE_UNRESOLVED') return 'no-creator';
    }
    return 'unverified';
  }
}
