// @vitest-environment jsdom
/**
 * Where a review route's people find it (RR1b of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.11):
 *
 *   - the route's notice opens the version: the server's target is the
 *     version in the Vault of its project, and opening it publishes the
 *     Vault's one deep-link target and the project, then navigates there;
 *   - the shared target contract admits that surface (with a project only)
 *     and a route member's task id;
 *   - the Review board's Vault queue: a named member whose turn it is reads
 *     "Your turn", with their due date; the sender's "Requested by me" row
 *     carries every member's outcome and Remind; "Open the version" opens that
 *     version; a route that could not be read says so;
 *   - Tasks (the tray and Home): a route member's row says what it waits on
 *     and opens the Review board, not the task board that refuses it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { isNotificationRecordTarget } from '@shared/types/notification-navigation';
import { openNotificationRecord } from '../notificationNavigation';
import { clearShellProject, readShellProject } from '../shellProject';
import { takeVaultTarget } from '../vaultTarget';
import { ReviewVaultQueue, type VaultReviewItem } from '../surfaces/ReviewVaultQueue';
import { OpenWorkGroups, type MyWorkItem } from '../OpenWork';
import { __resetCeremonies } from '../ceremony';

const PROGRAM = '10000000-0000-4000-8000-000000000001';
const VERSION = '20000000-0000-4000-8000-000000000002';

afterEach(() => { cleanup(); clearShellProject(); __resetCeremonies(); });

describe("the route's notice opens the version (§2.11)", () => {
  const target = { surface: 'vault' as const, label: 'Open the version in the Vault', params: { documentId: VERSION }, programId: PROGRAM };

  it('the shared contract admits the Vault version, only with its project, and a route task id', async () => {
    expect(isNotificationRecordTarget(target)).toBe(true);
    expect(isNotificationRecordTarget({ ...target, programId: null })).toBe(false);
    expect(isNotificationRecordTarget({ ...target, params: { documentId: VERSION, redirect: '/x' } })).toBe(false);
    expect(isNotificationRecordTarget({ ...target, params: { documentId: 'not-a-uuid' } })).toBe(false);
    const { noticeTaskId } = await import('@shared/types/notification-navigation');
    expect(noticeTaskId('ROUTE-abcd1234-17')).toBe(true);
    expect(noticeTaskId('TASK-1')).toBe(true);
    expect(noticeTaskId('ROUTE-../x')).toBe(false);
  });

  it('opening it publishes the project and the Vault target, then navigates to the Vault', () => {
    const navigate = vi.fn();
    openNotificationRecord(target, navigate);
    expect(navigate).toHaveBeenCalledWith(`vault?documentId=${VERSION}&program=${PROGRAM}`);
    expect(readShellProject()?.id).toBe(PROGRAM);
    expect(takeVaultTarget(PROGRAM)).toEqual({ kind: 'here', documentId: VERSION });
  });
});

const item = (over: Partial<VaultReviewItem>): VaultReviewItem => ({
  canonicalId: 'C-1', vaultId: VERSION, programId: PROGRAM, program: 'BX-301', title: 'Clinical overview', version: '2.0',
  step: 'review', sentBy: 'Uma Uploader', sentAt: '2026-10-29T09:00:00.000Z', eligibleSigners: ['Rae Reviewer'],
  mine: false, sentByMe: false, routeState: 'live', round: null, routeUnread: false, myDueAt: null, ...over,
});
const ROUND = {
  route: { id: 'r-1', round: 1, senderId: 3, senderName: 'Uma Uploader', status: 'open' as const, statusReason: null, statusBy: null, statusAt: null,
    reviewDueAt: '2026-11-03T03:59:59.999Z', approvalDueAt: '2026-11-05T04:59:59.999Z', createdAt: '2026-10-29T09:00:00.000Z' },
  members: [
    { taskId: 'ROUTE-r1-5', userId: 5, role: 'reviewer' as const, step: 1, printedName: 'Rae Reviewer', outcome: 'pending' as const, stepOpen: true,
      dueDate: '2026-11-03T03:59:59.999Z', signature: null, actId: null },
    { taskId: 'ROUTE-r1-8', userId: 8, role: 'approver' as const, step: 2, printedName: 'Ann Approver', outcome: 'pending' as const, stepOpen: false,
      dueDate: '2026-11-05T04:59:59.999Z', signature: null, actId: null },
  ],
  reviewComplete: false, approvalComplete: false,
};

describe("the Review board's Vault queue (§2.11)", () => {
  it('a named member whose turn it is reads "Your turn", with their due date', () => {
    render(<ReviewVaultQueue items={[item({ mine: true, myDueAt: '2026-11-03T03:59:59.999Z' })]} onOpenVault={vi.fn()} meId={5} />);
    expect(screen.getByTestId('review-vault-item-C-1').textContent).toContain('Your turn: sign the review, due 2026-11-03 03:59 UTC.');
    expect(screen.getByTestId('review-vault-item-C-1').textContent).not.toContain('Not assigned to one person');
  });

  it("the sender's row carries every member's outcome and Remind; Open the version opens that version", () => {
    const open = vi.fn();
    render(<ReviewVaultQueue items={[item({ sentByMe: true, round: ROUND })]} onOpenVault={open} meId={3} />);
    expect(screen.getByTestId('vault-route-member-5').textContent).toContain('Rae Reviewer · reviewer · Waiting for their review');
    expect(screen.getByTestId('vault-route-member-8').textContent).toContain('Ann Approver · approver · Waits for the review');
    expect(screen.getByRole('button', { name: 'Remind Rae Reviewer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remind Ann Approver' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the version' }));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ vaultId: VERSION, programId: PROGRAM }));
  });

  it('a route that could not be read says so, and names nobody', () => {
    render(<ReviewVaultQueue items={[item({ routeUnread: true, routeState: 'legacy', eligibleSigners: null })]} onOpenVault={vi.fn()} />);
    expect(screen.getByTestId('review-vault-item-C-1').textContent).toContain('Reviewers could not be read.');
  });

  it('a withdrawn route says nothing is signed until a new one is sent', () => {
    render(<ReviewVaultQueue items={[item({ routeState: 'withdrawn', eligibleSigners: [] })]} onOpenVault={vi.fn()} />);
    expect(screen.getByTestId('review-vault-item-C-1').textContent).toContain('nothing is signed on it until a new route is sent');
  });
});

describe('Tasks: a route member opens where the route is acted on (§2.11)', () => {
  const work = (over: Partial<MyWorkItem>): MyWorkItem => ({
    taskId: 'ROUTE-r1-8', title: 'Approve: Clinical overview', projectId: 25, projectName: 'BX-301', moduleType: 'Vault', status: 'blocked',
    priority: 'medium', dueDate: '2026-11-05T04:59:59.999Z', overdue: false, dueSoon: false, blocked: true, approvalRequired: false,
    approvalStatus: 'not_started', criticalPath: false, waitingOn: 'review', reviewRole: 'approver', ...over,
  });

  it('says what an approver waits on, and opens the Review board', () => {
    const go = vi.fn(); const openTask = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[work({})]} queue={null} approvalRows={[]} go={go} openTask={openTask} />);
    const row = screen.getByRole('button', { name: /Approve: Clinical overview/ });
    expect(row.textContent).toContain('waiting on the review');
    expect(row.textContent).not.toContain('blocked');
    fireEvent.click(row);
    expect(go).toHaveBeenCalledWith('review');
    expect(openTask).not.toHaveBeenCalled();
  });

  it('an ordinary task still opens on the task board', () => {
    const go = vi.fn(); const openTask = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[work({ taskId: 'TASK-9', title: 'Draft CSR', moduleType: 'IND', waitingOn: null, reviewRole: null, blocked: false, status: 'pending' })]}
      queue={null} approvalRows={[]} go={go} openTask={openTask} />);
    fireEvent.click(screen.getByRole('button', { name: /Draft CSR/ }));
    expect(openTask).toHaveBeenCalledWith('TASK-9');
  });
});
