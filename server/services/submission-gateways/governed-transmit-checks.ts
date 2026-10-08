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
  | 'SIGNER_INDEPENDENCE_UNRESOLVED';

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
 * same bundle again is not refused: re-sending it after a rollback is the
 * documented recovery, and a rollback does not un-file. Only a production send
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

/**
 * Why a transmit is held by an active transmittal, and what to do — said so the
 * operator can read it as sent: no route path (a client hides text that looks
 * internal and substitutes its own), no status or environment token. Whatever
 * the variant, the agency may already hold the bundle, so receipt is confirmed
 * with the agency before anything is sent again. Once the agency's gateway
 * acknowledged receipt ('received'), a rollback is not offered as the way to
 * re-send: it retracts nothing at the agency, and the re-send it would free is a
 * duplicate filing. A pending send cannot be rolled back, so none is offered.
 * 2026-10-08 (W5/D7, sweep HS-6): the sentence named the rollback route, so the
 * surface replaced it with "Roll it back first" and the caveat was lost.
 *
 * The bytes lock has no environment in its key, so the holder may be a send to
 * the OTHER environment; that refusal says where it went instead (sweep HS-6
 * review: a received test send was reported to a first production send as "with
 * the agency", and rolling it back — the only way to free the lock — was not
 * offered).
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
      `A rollback does not retract it. Send ${it} again only if the agency confirms it did not receive or load it.`
    );
  }
  const where = active.sequence ? `Sequence ${active.sequence} of this package is already in ${ref}${sentAs}` : `This bundle is already in ${ref}`;
  const state = ACTIVE_STATUS_WORDS[active.status] ?? `its status is ${active.status.replace(/_/g, ' ')}`;
  const remedy = active.status === 'pending'
    ? 'That send has not finished; its row in the transmittal log shows the outcome once it does.'
    : `If the agency confirms it did not receive it, roll ${ref} back from its row in the transmittal log, then send.`;
  return `${where}, and ${state}. The agency may already hold it. Confirm receipt with the agency before sending ${it} again. ${remedy}`;
}

/** A send to the other environment's status, in an operator's words. */
const OTHER_ENVIRONMENT_STATE: Record<string, string> = {
  pending: '; that send has not finished',
  received: ', whose gateway acknowledged receipt',
};

/** The bundle is held by a send to the other environment: where it went, and how to free it. */
function otherEnvironmentMessage(ref: string, active: ActiveHolder, elsewhere: string): string {
  const state = OTHER_ENVIRONMENT_STATE[active.status] ?? '; its receipt is not yet confirmed';
  const scope = active.holderEnvironment === 'production'
    ? 'A production send does not deliver it to the test environment, and a rollback does not retract the production send from the agency.'
    : 'A send to the test environment does not file it in production.';
  const remedy = active.status === 'pending'
    ? `Once that send finishes, roll ${ref} back from its row in the transmittal log, then send.`
    : `Roll ${ref} back from its row in the transmittal log, then send.`;
  return `This bundle is held by ${ref}, sent to ${elsewhere}${state}. ${scope} ${remedy}`;
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
