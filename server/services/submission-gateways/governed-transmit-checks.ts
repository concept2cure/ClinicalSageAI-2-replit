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
  | 'ACTIVE_TRANSMITTAL';

/** A refusal the caller should surface verbatim to the operator. */
export class GovernedTransmitRefusal extends Error {
  readonly name = 'GovernedTransmitRefusal';
  constructor(
    readonly code: GovernedTransmitRefusalCode,
    message: string,
    /** HTTP status the pre-existing route used for this refusal. */
    readonly httpStatus: 409 | 422,
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
    });
  } catch (err) {
    throw new GovernedTransmitInternalError('transmit-active-lock-check', err);
  }
  if (!active) return;
  if (active.sequence) {
    throw new GovernedTransmitRefusal(
      'ACTIVE_TRANSMITTAL',
      `Sequence ${active.sequence} of this package already has an active ${input.environment} transmittal ` +
        `(id=${active.id}, status=${active.status}), sent as a different bundle, and the agency may already hold it. ` +
        `Confirm receipt at the agency, and roll that transmittal back via POST /api/mdx/gateways/transmittals/${active.id}/rollback ` +
        `before sending sequence ${active.sequence} again.`,
      409,
      { transmittalId: active.id, status: active.status, sequence: active.sequence, environment: input.environment },
    );
  }
  throw new GovernedTransmitRefusal(
    'ACTIVE_TRANSMITTAL',
    `An active transmittal already exists for this package (id=${active.id}, status=${active.status}). ` +
      `Roll it back via POST /api/mdx/gateways/transmittals/${active.id}/rollback before re-transmitting.`,
    409,
    { transmittalId: active.id, status: active.status },
  );
}
