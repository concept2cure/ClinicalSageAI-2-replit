/**
 * Living-File Publish Helper
 *
 * Thin wrapper around `propagateRegulatoryChange` for use by mutation paths
 * that don't want to import the full router or handle its return type.
 *
 * - Best-effort: errors are caught and logged; the caller's mutation is
 *   never rolled back because of a publish failure.
 * - Fire-and-await pattern: callers `await` so audit ordering is preserved,
 *   but the result is informational only.
 *
 * Hook this from any service that mutates a regulatory source of truth so
 * the downstream artifact graph (defense packets, GSPR mappings, etc.)
 * stays in sync.
 */

import {
  propagateRegulatoryChange,
  type PropagateRegulatoryChangeResult,
  type RegulatoryChangeEvent,
} from './change-router.service';

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

export async function publishRegulatoryChange(
  args: PublishArgs
): Promise<PropagateRegulatoryChangeResult | { error: string }> {
  try {
    return await propagateRegulatoryChange(args);
  } catch (err: any) {
    // Best-effort: never throw out of a publish call.
    return { error: err?.message ?? 'unknown publish error' };
  }
}
