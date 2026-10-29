/**
 * How a review route's round is said, and what a route form sends, for any
 * subject, Vault or QMS (RR2 of docs/design/REVIEW_ROUTING_2026-10-23.md §2.6,
 * §2.10, §2.12, §3; the neutral module v2/reviewRoute/):
 *
 *   - the naming history says who added a reviewer to an open route, when and why;
 *   - an approver who signed while others are outstanding reads
 *     "Approved (k of n required)", k being the order they signed in;
 *   - a reviewer waiting one after another reads who they wait for;
 *   - the reader's share of an approval, for the signing dialog;
 *   - the route form's shape: reviewers in order, each step with its date,
 *     the approvers; what Send waits for; moving a reviewer up or down.
 */
import { describe, expect, it } from 'vitest';
import { historyLine } from '../reviewRoute/RouteHistory';
import { approvalShare, memberLine, routeHeadline, type RouteHistoryEntryView, type RouteMemberView, type RouteRoundView } from '../reviewRoute/routeRound';
import { moveReviewer, routeShapeBody, routeShapeMissing, withSteps, type RouteShapeInput } from '../reviewRoute/routeShape';

const sig = (name: string, meaning: string, at: string) => ({ id: 1, printedName: name, meaning, signedAt: at });
const m = (over: Partial<RouteMemberView> & { userId: number }): RouteMemberView => ({
  taskId: `ROUTE-abcd1234-${over.userId}`, role: 'reviewer', step: 1, printedName: null, outcome: 'pending', stepOpen: true,
  dueDate: '2026-11-03T23:59:59.999Z', signature: null, actId: null, ...over,
});
const round = (members: RouteMemberView[], status: 'open' | 'complete' = 'open'): RouteRoundView => ({
  route: { id: 'r', round: 1, senderId: 3, senderName: 'Sam Sender', status, statusReason: null, statusBy: status === 'open' ? null : 9,
    statusAt: null, reviewDueAt: null, approvalDueAt: '2026-11-05T23:59:59.999Z', createdAt: '2026-10-29T09:00:00.000Z' },
  members, reviewComplete: members.filter((x) => x.role === 'reviewer').every((x) => x.outcome === 'signed'),
  approvalComplete: members.filter((x) => x.role === 'approver').every((x) => x.outcome === 'signed'),
});

describe('the naming history (RR2, §2.10, §2.12)', () => {
  it('says who added a reviewer to the open route, when and why', () => {
    const added: RouteHistoryEntryView = {
      action: 'add', at: '2026-10-29T14:02:00.000Z', actorId: 3, actorName: 'Sam Sender', reason: 'Biostatistics must see the PK tables',
      role: 'reviewer', toName: 'Rob Reviewer',
    };
    expect(historyLine(added)).toBe('Sam Sender added Rob Reviewer as a reviewer · 2026-10-29 14:02:00 UTC · Biostatistics must see the PK tables');
  });
});

describe('more than one approver (RR2, §2.12: "Approved (1 of 2 required)")', () => {
  const ann = m({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, outcome: 'signed', signature: sig('Ann Approver', 'APPROVED', '2026-10-30T09:15:00.000Z') });
  const ava = m({ userId: 10, printedName: 'Ava Approver', role: 'approver', step: 2 });
  const rae = m({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: sig('Rae Reviewer', 'REVIEWED', '2026-10-29T14:02:00.000Z') });

  it('an earlier approver reads 1 of 2; the other waits for their approval', () => {
    const r = round([rae, ann, ava]);
    expect(memberLine(ann, r)).toBe('Ann Approver · approver · Approved (1 of 2 required) · meaning: approved · 2026-10-30 09:15:00 UTC');
    expect(memberLine(ava, r)).toContain('Ava Approver · approver · Waiting for their approval');
    expect(routeHeadline(r, 8)).toBe('You signed at 09:15 UTC; waiting for Ava Approver.');
    expect(routeHeadline(r, 10)).toBe('Your turn: approve.');
  });

  it('once both have signed, each reads the order they signed in, and the route says every approver signed', () => {
    const avaSigned = { ...ava, outcome: 'signed' as const, signature: sig('Ava Approver', 'APPROVED', '2026-10-30T11:00:00.000Z') };
    const r = round([rae, avaSigned, ann], 'complete');
    expect(memberLine(ann, r)).toContain('Approved (1 of 2 required)');
    expect(memberLine(avaSigned, r)).toContain('Approved (2 of 2 required)');
    expect(routeHeadline(r, null)).toBe('Approved: every named reviewer and every named approver signed.');
    expect(routeHeadline(round([rae, ann], 'complete'), null)).toBe('Approved: every named reviewer and the approver signed.');
  });

  it("the reader's share of the approval: which signature theirs would be, of how many", () => {
    expect(approvalShare(round([rae, ann, ava]), 10)).toEqual({ k: 2, n: 2 });
    expect(approvalShare(round([rae, { ...ann, outcome: 'pending', signature: null }, ava]), 10)).toEqual({ k: 1, n: 2 });
    expect(approvalShare(round([rae, ann, ava]), 5)).toBeNull();
  });
});

describe('reviewers one after another (RR2, §3)', () => {
  it('a waiting reviewer reads who they wait for, with their own due date', () => {
    const rae = m({ userId: 5, printedName: 'Rae Reviewer' });
    const rob = m({ userId: 6, printedName: 'Rob Reviewer', step: 2, stepOpen: false, dueDate: '2026-11-04T23:59:59.999Z' });
    const ann = m({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 3, stepOpen: false });
    const r = round([rae, rob, ann]);
    expect(memberLine(rob, r)).toBe('Rob Reviewer · reviewer · Waits for Rae Reviewer · due 2026-11-04 23:59:59 UTC');
    expect(memberLine(ann, r)).toContain('Ann Approver · approver · Waits for the review');
    expect(routeHeadline(r, 6)).toBe('Waiting for Rae Reviewer.');
  });
});

describe("the route form's shape (RR2, §2.6, §3)", () => {
  const base: RouteShapeInput = { reviewers: ['6', '5'], approvers: ['8', '10'], order: 'parallel', reviewDue: '2099-11-02', stepDue: [], approvalDue: '2099-11-06' };

  it('parallel: one review date; sequential: each step its date, in the reviewers’ order', () => {
    expect(routeShapeBody(base)).toEqual({ reviewers: [6, 5], approvers: [8, 10], order: 'parallel', reviewDueDate: '2099-11-02', approvalDueDate: '2099-11-06' });
    expect(routeShapeBody({ ...base, order: 'sequential', stepDue: ['2099-11-02', '2099-11-04'] })).toEqual({
      reviewers: [6, 5], approvers: [8, 10], order: 'sequential', reviewStepDueDates: ['2099-11-02', '2099-11-04'], approvalDueDate: '2099-11-06',
    });
    expect(routeShapeBody({ ...base, reviewers: [], reviewDue: '' })).toEqual({ reviewers: [], approvers: [8, 10], order: 'parallel', approvalDueDate: '2099-11-06' });
  });

  it('says what Send waits for: each step’s date, the steps in order, and the approval after the last', () => {
    const rules = { reviewersOptional: false, approverMissing: 'Choose the approver.' };
    expect(routeShapeMissing(base, rules)).toEqual([]);
    expect(routeShapeMissing({ ...base, approvers: [] }, rules)).toContain('Choose the approver.');
    const seq = { ...base, order: 'sequential' as const, stepDue: ['2099-11-02', ''] };
    expect(routeShapeMissing(seq, rules)).toContain('Give each step’s due date.');
    expect(routeShapeMissing({ ...seq, stepDue: ['2099-11-04', '2099-11-02'] }, rules)).toContain('Each step is due on or after the step before it.');
    expect(routeShapeMissing({ ...seq, stepDue: ['2099-11-02', '2099-11-08'] }, rules)).toContain('The approval is due on or after the reviews.');
  });

  it('moves a reviewer up or down, keeping each step’s date with its step; a new reviewer gets an empty step date', () => {
    expect(moveReviewer(['6', '5', '9'], 2, -1)).toEqual(['6', '9', '5']);
    expect(moveReviewer(['6', '5'], 0, -1)).toEqual(['6', '5']);
    expect(moveReviewer(['6', '5'], 1, 1)).toEqual(['6', '5']);
    expect(withSteps(['6', '5', '9'], ['2099-11-02', '2099-11-03'])).toEqual(['2099-11-02', '2099-11-03', '']);
    expect(withSteps(['6'], ['2099-11-02', '2099-11-03'])).toEqual(['2099-11-02']);
  });
});
