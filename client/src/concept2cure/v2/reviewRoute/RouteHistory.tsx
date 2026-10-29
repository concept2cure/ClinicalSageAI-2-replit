/**
 * A review route's naming history, by printed name (§2.12, M3; RR3 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md): who sent it naming whom, who
 * handed back, who reassigned what from whom to whom, who withdrew or returned
 * it, who added a reviewer (RR2), each with its UTC time and reason. Shared by the Vault and the Quality
 * register. Moved out of v2/surfaces/VaultRouteReassign.tsx unchanged in RR2.
 */
import React from 'react';
import { list, utc, work } from './routeText';
import type { RouteHistoryEntryView } from './routeRound';

// ── The naming history (§2.12, M3) ───────────────────────────────────────────

/** One naming act in words: who did what to whom, when (UTC) and why. */
export function historyLine(h: RouteHistoryEntryView): string {
  const who = h.actorName ?? `Account #${h.actorId}`;
  const what = {
    send: () => `${who} sent it for review naming ${list((h.members ?? []).map((m) => `${m.printedName ?? `Account #${m.userId}`} (${m.role})`)) || 'no one'}`,
    'hand-back': () => `${who} handed back their ${work(h.role)}`,
    reassign: () => `${who} reassigned the ${work(h.role)} from ${h.fromName ?? 'a member'} to ${h.toName ?? 'another member'}`,
    add: () => `${who} added ${h.toName ?? 'a member'} as a reviewer`,
    withdraw: () => `${who} withdrew the route`,
    return: () => `${who} returned it for revision`,
  }[h.action]();
  return `${what} · ${utc(h.at)}${h.reason ? ` · ${h.reason}` : ''}`;
}

/** The naming history of the route, oldest first, by printed name (§2.12, M3). */
export function RouteHistory({ history }: { history: RouteHistoryEntryView[] | undefined }) {
  if (!history || history.length === 0) return null;
  return (
    <>
      <span className="vr-round-m vr-history">Naming history</span>
      <ol className="vr-members" data-testid="vault-route-history" aria-label="Naming history of this review route">
        {history.map((h, i) => <li key={`${h.action}-${h.at}-${i}`} className="vr-member">{historyLine(h)}</li>)}
      </ol>
    </>
  );
}
