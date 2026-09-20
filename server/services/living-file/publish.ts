/**
 * Living-File Publish Helper
 *
 * Wrapper around `propagateRegulatoryChange` for mutation paths that don't want
 * to import the full router or handle its return type.
 *
 * Hook this from any service that mutates a regulatory source of truth so the
 * downstream artifact graph (defense packets, GSPR mappings, standards
 * applicability, reactive dependencies) stays in sync.
 *
 * ── What changed here, and why (WO-16C #133, 19 September 2026) ──────────────
 *
 * This file used to describe itself as "fire-and-await", with a result that is
 * "informational only", and all five callers took it at its word — five bare
 * `await publishRegulatoryChange({ … })` with no assignment, in gspr.service,
 * post-market.service (twice) and pccp.service (twice).
 *
 * The chain underneath reports in detail. `propagateRegulatoryChange` runs four
 * handlers, catches each one's error into `outcomes[].detail.error` rather than
 * letting it escape, and returns `totalAffected`. Discarding all of that left one
 * observable result for two very different events: a document approval whose
 * propagation failed on EVERY channel — defense packets never marked stale, GSPR
 * mappings never updated, dependent artifacts never flagged for review — was
 * indistinguishable from one where propagation ran and nothing needed changing.
 * `totalAffected: 0` is both, and a per-channel error buried in an `unknown`
 * `detail` field nobody read is not a report.
 *
 * The docstring also claimed "errors are caught and logged". The catch did not
 * log. It returned `{ error: … }` and nothing else, which is very likely why the
 * callers were written the way they were: the file said the failure was already
 * being handled somewhere, and it was not.
 *
 * So: the outcome is now a discriminated `PublishOutcome` that cannot express
 * "clean" and "everything failed" as the same value, failures are logged here for
 * real, and the router's own error text stays in that log rather than travelling
 * to a caller that may put it on the wire.
 *
 * Unchanged, deliberately: this never throws, and a publish failure never rolls
 * back the caller's mutation. The regulatory change really did happen; refusing
 * it because the downstream graph could not be notified would be the worse
 * answer. What changes is that the caller is told.
 */

import {
  propagateRegulatoryChange,
  type PropagateRegulatoryChangeResult,
  type RegulatoryChangeEvent,
} from './change-router.service';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('living-file-publish');

export interface PublishArgs {
  organizationId: number;
  programId: string;
  legacyProgramId?: number;
  event: RegulatoryChangeEvent;
  sourceId: string;
  sourceLabel?: string;
  reason?: string;
  userId?: string;
}

/**
 * What the propagation did.
 *
 * `published` is true only when EVERY channel that ran came back without an
 * error. `totalAffected: 0` with `published: true` is a real, meaningful answer —
 * the graph was notified and nothing needed to change. `totalAffected: 0` with
 * `published: false` is the opposite, and the two were the same value before.
 *
 * `failedChannels` names which handlers failed, so a caller can say something
 * specific; their error text is in this module's log line, never here, because
 * some callers forward their result to a tenant client.
 */
export interface PublishOutcome {
  published: boolean;
  /** Rows/artifacts the propagation actually touched. */
  totalAffected: number;
  /** Channels that ran cleanly. */
  channels: string[];
  /** Channels whose handler reported an error. Empty when `published`. */
  failedChannels: string[];
  /** Set only when the propagation could not run at all. */
  code?: 'PROPAGATION_FAILED';
  /** A caller-safe sentence. Set with `code`. */
  message?: string;
}

/** A handler's `detail` is `unknown`; the handlers put `{ error }` in it. */
function channelFailed(detail: unknown): boolean {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    'error' in (detail as Record<string, unknown>) &&
    (detail as Record<string, unknown>).error != null
  );
}

export async function publishRegulatoryChange(args: PublishArgs): Promise<PublishOutcome> {
  let result: PropagateRegulatoryChangeResult;
  try {
    result = await propagateRegulatoryChange(args);
  } catch (err: unknown) {
    // Never throws out of a publish call — see the module note. The router's own
    // text is logged here and deliberately not returned.
    logger.error('Regulatory-change propagation could not run', {
      organizationId: args.organizationId,
      programId: args.programId,
      event: args.event,
      sourceId: args.sourceId,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      published: false,
      totalAffected: 0,
      channels: [],
      failedChannels: [],
      code: 'PROPAGATION_FAILED',
      message:
        'The change was saved, but the downstream artifact graph could not be notified, so defense packets and mappings that depend on it may still show the previous state. This has been logged for follow-up.',
    };
  }

  const failedChannels = result.outcomes.filter(o => channelFailed(o.detail)).map(o => o.channel);
  const channels = result.outcomes.filter(o => !channelFailed(o.detail)).map(o => o.channel);

  if (failedChannels.length > 0) {
    // Per-channel errors used to sit unread inside `outcomes[].detail`. They are
    // logged with their own text here; the caller gets the channel names only.
    logger.error('Regulatory-change propagation failed on one or more channels', {
      organizationId: args.organizationId,
      programId: args.programId,
      event: args.event,
      sourceId: args.sourceId,
      failedChannels,
      details: result.outcomes.filter(o => channelFailed(o.detail)),
    });
  }

  return {
    published: failedChannels.length === 0,
    totalAffected: result.totalAffected,
    channels,
    failedChannels,
  };
}
