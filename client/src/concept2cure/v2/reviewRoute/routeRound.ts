/**
 * A review route's round as the server reads it (RouteRound,
 * server/services/review/review-route-standing.ts), and how it is said: one
 * line per named member, and the round in one sentence for the person reading
 * it. Shared by the Vault (v2/surfaces/VaultReviewRoute.tsx) and the Quality
 * register (quality/QmsReviewRoute.tsx, SopRegister.tsx), so a route reads the
 * same wherever it is shown. Moved out of VaultReviewRoute.tsx unchanged in
 * RR2 (docs/design/REVIEW_ROUTING_2026-10-23.md; RR4's design issue 1), then
 * extended for RR2's routes: an approver reads which of the required approvals
 * theirs was ("Approved (1 of 2 required)"), a reviewer waiting one after
 * another reads whom they wait for, and approvalShare tells a signing dialog
 * which approval the reader's would be.
 */
import { list, nameOf, utc, utcClock } from './routeText';

// ── The round, as the server reads it (RouteRound, review-route-standing.ts) ──

export interface RouteSignatureView { id: number; printedName: string | null; meaning: string; signedAt: string }
export interface RouteMemberView {
  taskId: string;
  userId: number;
  role: 'reviewer' | 'approver';
  step: number;
  printedName: string | null;
  outcome: 'pending' | 'signed' | 'returned' | 'handed back';
  stepOpen: boolean;
  dueDate: string | null;
  signature: RouteSignatureView | null;
  actId: string | null;
}
export interface RouteHeaderView {
  id: string;
  round: number;
  senderId: number;
  senderName: string;
  /** At the same time, or one after another (RR2); absent on a round read before RR2 sent it. */
  order?: 'parallel' | 'sequential';
  status: 'open' | 'withdrawn' | 'returned' | 'complete';
  statusReason: string | null;
  statusBy: number | null;
  statusAt: string | null;
  reviewDueAt: string | null;
  approvalDueAt: string;
  createdAt: string;
}
export interface RouteHistoryEntryView {
  action: 'send' | 'reassign' | 'hand-back' | 'withdraw' | 'return' | 'add';
  at: string;
  actorId: number;
  actorName: string | null;
  reason: string | null;
  role?: 'reviewer' | 'approver';
  fromName?: string | null;
  toName?: string | null;
  members?: Array<{ userId: number; role: 'reviewer' | 'approver'; printedName: string | null }>;
}
export interface RouteRoundView {
  route: RouteHeaderView;
  members: RouteMemberView[];
  reviewComplete: boolean;
  approvalComplete: boolean;
  /** The naming history (RR3): every send, reassignment, hand-back, added reviewer (RR2), withdrawal and return, oldest first. */
  history?: RouteHistoryEntryView[];
}

// ── What the round says ──────────────────────────────────────────────────────

/** Who closed a route, by the names the route holds; an administrator otherwise. */
function closedBy(round: RouteRoundView): string {
  const by = round.route.statusBy;
  if (by === round.route.senderId) return round.route.senderName;
  const member = round.members.find((m) => m.userId === by);
  return member ? nameOf(member) : 'an administrator';
}

/** The members whose turn it is and who have not signed. */
export const holders = (round: RouteRoundView) => round.members.filter((m) => m.stepOpen && m.outcome === 'pending');

/** The approvers who have signed, in the order they signed. */
const signedApprovers = (round: RouteRoundView) => round.members
  .filter((x) => x.role === 'approver' && x.outcome === 'signed' && x.signature)
  .sort((a, b) => a.signature!.signedAt.localeCompare(b.signature!.signedAt));

/** Who a waiting member waits for: the reviewers of the steps before theirs who have not signed (RR2, one after another). */
function waitsFor(m: RouteMemberView, round: RouteRoundView): string {
  if (m.role === 'approver') return 'the review';
  const before = round.members.filter((x) => x.step < m.step && x.outcome !== 'signed').map(nameOf);
  return before.length ? list(before) : 'the step before';
}

/**
 * The reader's share of the approval, for the signing dialog (RR2, NEW-4):
 * which approval theirs would be (k) of how many the route needs (n). Null
 * when the reader is not an approver who has still to sign.
 */
export function approvalShare(round: RouteRoundView, meId: number | null): { k: number; n: number } | null {
  const mine = round.members.find((x) => x.userId === meId && x.role === 'approver' && x.outcome === 'pending');
  if (!mine) return null;
  const approvers = round.members.filter((x) => x.role === 'approver');
  return { k: signedApprovers(round).length + 1, n: approvers.length };
}

/** One member's line: name, role, and what they have done, with the signature's meaning and UTC time. */
export function memberLine(m: RouteMemberView, round: RouteRoundView): string {
  const role = m.role === 'reviewer' ? 'reviewer' : 'approver';
  if (m.outcome === 'signed' && m.signature) {
    // RR2: an approver reads which of the required approvals theirs was, by when they signed.
    const what = m.role === 'approver'
      ? `Approved (${signedApprovers(round).findIndex((x) => x.taskId === m.taskId) + 1} of ${round.members.filter((x) => x.role === 'approver').length} required)`
      : 'Reviewed';
    return `${m.signature.printedName ?? nameOf(m)} · ${role} · ${what} · meaning: ${m.signature.meaning.toLowerCase()} · ${utc(m.signature.signedAt)}`;
  }
  if (m.outcome === 'returned') return `${nameOf(m)} · ${role} · Returned it for revision`;
  if (m.outcome === 'handed back') return `${nameOf(m)} · ${role} · Handed it back to the sender, who reassigns it`;
  if (round.route.status !== 'open') return `${nameOf(m)} · ${role} · Did not sign`;
  const due = m.dueDate ? ` · due ${utc(m.dueDate)}` : '';
  if (!m.stepOpen) return `${nameOf(m)} · ${role} · Waits for ${waitsFor(m, round)}${due}`;
  return `${nameOf(m)} · ${role} · Waiting for their ${m.role === 'reviewer' ? 'review' : 'approval'}${due}`;
}

/** A closed route in one sentence: who returned or withdrew it and why, or that it is approved. */
function closedHeadline(round: RouteRoundView): string {
  const r = round.route;
  if (r.status === 'returned') return `Returned by ${closedBy(round)}: ${r.statusReason ?? 'no reason recorded'}`;
  if (r.status === 'withdrawn') return `Withdrawn by ${closedBy(round)} on ${utc(r.statusAt)}: ${r.statusReason ?? 'no reason recorded'}`;
  return round.members.filter((m) => m.role === 'approver').length > 1
    ? 'Approved: every named reviewer and every named approver signed.'
    : 'Approved: every named reviewer and the approver signed.';
}

/** A hand-back, said to the member who handed back and to the sender who reassigns it (RR3); null for anyone else. */
function handedBackHeadline(round: RouteRoundView, meId: number | null): string | null {
  const handed = round.members.filter((m) => m.outcome === 'handed back');
  if (handed.some((m) => m.userId === meId)) return `You handed this back; waiting for ${round.route.senderName} to reassign it.`;
  if (handed.length === 0 || meId !== round.route.senderId) return null;
  const one = handed.length === 1;
  return `${list(handed.map(nameOf))} handed ${one ? 'their assignment' : 'their assignments'} back: reassign ${one ? 'it' : 'them'}.`;
}

/** The round in one sentence, for the person reading it. */
export function routeHeadline(round: RouteRoundView, meId: number | null): string {
  if (round.route.status !== 'open') return closedHeadline(round);
  const handedBack = handedBackHeadline(round, meId);
  if (handedBack) return handedBack;
  const waiting = holders(round);
  const mine = round.members.find((m) => m.userId === meId);
  if (mine && waiting.includes(mine)) return mine.role === 'reviewer' ? 'Your turn: sign the review.' : 'Your turn: approve.';
  const others = list(waiting.filter((m) => m.userId !== meId).map(nameOf));
  if (mine?.outcome === 'signed' && mine.signature) return `You signed at ${utcClock(mine.signature.signedAt)}; waiting for ${others || 'the next step'}.`;
  return others ? `Waiting for ${others}.` : 'Waiting for the next step.';
}

/** A reviewer can be added to an open route until an approver has signed (RR2, ROUTE_APPROVAL_STARTED). */
export const mayAddReviewer = (round: RouteRoundView) =>
  round.route.status === 'open' && !round.members.some((m) => m.role === 'approver' && m.outcome === 'signed');

/** The approvers whose turn had come, who wait again when a reviewer is added (RR2). */
export const waitingApprovers = (round: RouteRoundView) =>
  round.members.filter((m) => m.role === 'approver' && m.stepOpen && m.outcome === 'pending').map(nameOf);
