/**
 * AnA agentic onboarding — server-side proposal store (P3 prerequisite).
 *
 * WHY THIS EXISTS
 * A commit endpoint that accepts a client-supplied payload of
 * `{value, provenance, confidence, status:'approved'}` cannot be trusted: any
 * caller with a session token could post a hand-written body and have it
 * recorded in the 21 CFR Part 11 audit as a verified AnA extraction that a
 * human approved. No amount of request validation fixes that — the shape itself
 * is the defect (it is why the first commit endpoint was removed rather than
 * patched).
 *
 * The fix is that the server must commit only what IT proposed. Ingest records
 * its own extraction here under a run id; commit re-reads that record and takes
 * value/provenance/confidence from the SERVER's copy. The client may only:
 *   - reference proposal ids the server actually produced,
 *   - supply a human-edited replacement value (recorded as humanEdited, with
 *     AnA's original extraction preserved), and
 *   - name which ids the human approved.
 * Everything a Part 11 record asserts about AnA's extraction therefore comes
 * from the server, never from the request body.
 *
 * DURABILITY (documented limitation, not a hidden one)
 * Runs live in memory with a short TTL, because a proposal set is a working
 * artifact of one review session, not a regulated record — the durable record
 * is the audit entry written at commit time. Consequences, stated plainly:
 *   - a server restart or a different node ends an in-flight review; the client
 *     is told to re-upload rather than being silently given a stale set;
 *   - nothing is retained after commit or expiry, so an abandoned onboarding
 *     upload leaves no tenant data behind.
 * A durable, RLS-scoped table is the follow-up if proposals ever need to
 * outlive a session or be inspected after the fact.
 *
 * @module server/services/onboarding/proposal-store
 */

import { randomUUID } from 'crypto';
import type { OnboardingIngestResult, OnboardingProposalField } from '@shared/types/onboarding-ingest';

/** A review session is short; abandoned runs must not accumulate. */
const TTL_MS = 30 * 60 * 1000;
/** Hard cap so a burst of uploads cannot grow memory without bound. */
const MAX_RUNS = 500;

interface StoredRun {
  runId: string;
  /** Owner — a run is readable only by the user+org that created it. */
  userId: number;
  organizationId: number;
  /** The server's own extraction, keyed by proposal id. */
  fields: Map<string, OnboardingProposalField>;
  sources: OnboardingIngestResult['sources'];
  createdAt: number;
}

const runs = new Map<string, StoredRun>();

function sweep(now: number): void {
  for (const [id, run] of runs) {
    if (now - run.createdAt > TTL_MS) runs.delete(id);
  }
  // If still over cap, drop the oldest runs first.
  if (runs.size > MAX_RUNS) {
    const oldest = [...runs.values()].sort((a, b) => a.createdAt - b.createdAt);
    for (const run of oldest.slice(0, runs.size - MAX_RUNS)) runs.delete(run.runId);
  }
}

/** Record an ingest run and return its id. Called only by the ingest route. */
export function saveRun(
  owner: { userId: number; organizationId: number },
  result: OnboardingIngestResult,
  now: number = Date.now(),
): string {
  sweep(now);
  const runId = randomUUID();
  const fields = new Map<string, OnboardingProposalField>();
  for (const g of result.groups) for (const f of g.fields) fields.set(f.id, f);
  runs.set(runId, {
    runId,
    userId: owner.userId,
    organizationId: owner.organizationId,
    fields,
    sources: result.sources,
    createdAt: now,
  });
  return runId;
}

export interface ResolvedApproval {
  /** The SERVER's proposal, authoritative for provenance/confidence/extraction. */
  proposal: OnboardingProposalField;
  /** The value to write: the human's edit if they made one, else AnA's. */
  value: string;
  /** True when the human replaced AnA's value — recorded in the audit. */
  humanEdited: boolean;
}

export interface ResolveOutcome {
  ok: boolean;
  /** Set when the run is missing/expired or belongs to someone else. */
  error?: string;
  approvals: ResolvedApproval[];
  /** Ids the caller sent that the server never proposed — reported, not written. */
  unknownIds: string[];
}

/**
 * Resolve a caller's approval list against the server's own record.
 * A run is visible only to the user+org that created it, so one tenant can
 * never commit another's extraction.
 */
export function resolveApprovals(
  owner: { userId: number; organizationId: number },
  runId: string,
  approvals: Array<{ id: string; value?: string | null }>,
  now: number = Date.now(),
): ResolveOutcome {
  const run = runs.get(runId);
  if (!run || now - run.createdAt > TTL_MS) {
    return { ok: false, error: 'That review session has expired. Please upload the document again.', approvals: [], unknownIds: [] };
  }
  if (run.userId !== owner.userId || run.organizationId !== owner.organizationId) {
    // Non-leaky: same message as a missing run — never confirm someone else's run exists.
    return { ok: false, error: 'That review session has expired. Please upload the document again.', approvals: [], unknownIds: [] };
  }

  const resolved: ResolvedApproval[] = [];
  const unknownIds: string[] = [];
  const seen = new Set<string>();

  for (const a of approvals) {
    const id = typeof a?.id === 'string' ? a.id : '';
    const proposal = id ? run.fields.get(id) : undefined;
    if (!proposal) {
      if (id) unknownIds.push(id);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    const edited = typeof a.value === 'string' ? a.value.trim() : '';
    const original = (proposal.extractedValue ?? '').trim();
    const value = edited || original;
    if (!value) continue; // never write a blank

    resolved.push({ proposal, value, humanEdited: edited.length > 0 && edited !== original });
  }

  return { ok: true, approvals: resolved, unknownIds };
}

/** Drop a run once it has been committed — nothing lingers after use. */
export function discardRun(runId: string): void {
  runs.delete(runId);
}

/** Test seam. */
export function __resetRuns(): void {
  runs.clear();
}
