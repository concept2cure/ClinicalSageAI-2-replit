/**
 * AnA agentic onboarding — server-side proposal store (P3 trust boundary).
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
 * So the server commits only what IT proposed. Ingest records its own
 * extraction here; commit re-reads that record and takes
 * value/provenance/confidence from the SERVER's copy. The client may only:
 *   - reference proposal ids the server actually produced,
 *   - supply a human-edited replacement value (recorded as humanEdited, with
 *     AnA's original extraction preserved), and
 *   - name which ids the human approved.
 * Everything a Part 11 record asserts about AnA's extraction therefore comes
 * from the server, never from the request body.
 *
 * DURABILITY
 * Runs are persisted (`onboarding_proposal_runs`), so a review survives a
 * restart or a different node, and the suggestions a human REJECTED stay
 * inspectable — committed values are already in the sha256-chained audit trail,
 * but declined ones would otherwise leave no trace. Rows are removed on commit
 * or expiry, and the uploaded document and its text are never stored: only the
 * extracted field proposals.
 *
 * Reads/writes go through `requestDb(req)` so the request's RLS session vars
 * apply and Postgres enforces the tenant boundary beneath the app-layer checks.
 *
 * @module server/services/onboarding/proposal-store
 */

import { randomUUID } from 'crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { Request } from 'express';
import { requestDb } from '../../db/requestDb';
import { onboardingProposalRuns } from '@shared/schema';
import type { OnboardingIngestResult, OnboardingProposalField } from '@shared/types/onboarding-ingest';

/** A review session is short; abandoned runs must not linger. */
export const RUN_TTL_MS = 30 * 60 * 1000;

export interface RunOwner {
  userId: number;
  organizationId: number;
}

/** Record an ingest run and return its opaque id. Called only by ingest. */
export async function saveRun(
  req: Request,
  owner: RunOwner,
  result: OnboardingIngestResult,
): Promise<string> {
  const rdb = requestDb(req);
  const runId = randomUUID();
  const fields = result.groups.flatMap((g) => g.fields);

  // Opportunistic sweep: drop this org's expired runs so abandoned uploads do
  // not accumulate. Cheap (indexed) and keeps retention honest without a cron.
  try {
    await rdb
      .delete(onboardingProposalRuns)
      .where(
        and(
          eq(onboardingProposalRuns.organizationId, owner.organizationId),
          lt(onboardingProposalRuns.expiresAt, new Date()),
        ),
      );
  } catch {
    /* sweeping is best-effort — never fail an ingest over housekeeping */
  }

  await rdb.insert(onboardingProposalRuns).values({
    runId,
    organizationId: owner.organizationId,
    userId: owner.userId,
    proposals: fields,
    sources: result.sources ?? [],
    expiresAt: new Date(Date.now() + RUN_TTL_MS),
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

/** Identical message for "not yours" and "not found" — never confirm that
 *  someone else's run exists. */
const GONE = 'That review session has expired. Please upload the document again.';

/**
 * Resolve a caller's approval list against the server's own record. The lookup
 * is constrained to the caller's own org AND user, so one tenant can never
 * commit another's extraction.
 */
export async function resolveApprovals(
  req: Request,
  owner: RunOwner,
  runId: string,
  approvals: Array<{ id: string; value?: string | null }>,
): Promise<ResolveOutcome> {
  if (!runId) return { ok: false, error: GONE, approvals: [], unknownIds: [] };

  const rdb = requestDb(req);
  const [run] = await rdb
    .select({
      proposals: onboardingProposalRuns.proposals,
      expiresAt: onboardingProposalRuns.expiresAt,
      committedAt: onboardingProposalRuns.committedAt,
    })
    .from(onboardingProposalRuns)
    .where(
      and(
        eq(onboardingProposalRuns.runId, runId),
        eq(onboardingProposalRuns.organizationId, owner.organizationId),
        eq(onboardingProposalRuns.userId, owner.userId),
      ),
    );

  // Expired, already committed, or belonging to someone else all look the same.
  if (!run || run.committedAt || new Date(run.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: GONE, approvals: [], unknownIds: [] };
  }

  const stored = Array.isArray(run.proposals) ? (run.proposals as OnboardingProposalField[]) : [];
  const byId = new Map(stored.map((f) => [f.id, f]));

  const resolved: ResolvedApproval[] = [];
  const unknownIds: string[] = [];
  const seen = new Set<string>();

  for (const a of approvals) {
    const id = typeof a?.id === 'string' ? a.id : '';
    const proposal = id ? byId.get(id) : undefined;
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

/**
 * Mark a run committed. Retained briefly (until the expiry sweep) so the
 * proposals a human declined remain inspectable alongside the audit entry for
 * the ones they approved; a committed run can never be resolved again.
 */
export async function markRunCommitted(req: Request, owner: RunOwner, runId: string): Promise<void> {
  try {
    await requestDb(req)
      .update(onboardingProposalRuns)
      .set({ committedAt: new Date() })
      .where(
        and(
          eq(onboardingProposalRuns.runId, runId),
          eq(onboardingProposalRuns.organizationId, owner.organizationId),
        ),
      );
  } catch {
    /* the governed write already succeeded and is audited — never fail on this */
  }
}
