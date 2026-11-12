// @vitest-environment jsdom
/**
 * GA-UI-04 (docs/evidence/GA-READINESS/2026-11-10): a review-route task opened
 * from the bell or Home opens its version, in one click.
 *
 * The defect, seen in the running app on 2026-11-10 (ava, "Approve: [Demo · Lumen]
 * TD02 etiology study ..."): the row called go('review') with no project. The
 * Review board opened filtered to whatever project the shell last had, said
 * "Nothing is in review", and the version the task is about was nowhere on it.
 *
 * Now a Vault route member's row reads the board's Vault queue, finds the route
 * that names this task, and opens that version in the Vault of its project
 * (the one record-opening path a notice uses). A board that cannot be read is
 * said in the list, and nothing is opened; a route the board does not list
 * opens the Review board, as before. An approval at your sign-off opens its
 * document in the editor, in its project.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { OpenWorkGroups, type MyWorkItem } from '../OpenWork';
import { clearShellProject, readShellProject } from '../shellProject';
import { takeVaultTarget } from '../vaultTarget';
import { __resetCeremonies } from '../ceremony';

const PROGRAM = '10000000-0000-4000-8000-000000000001';
const VERSION = '20000000-0000-4000-8000-000000000002';
const OTHER_VERSION = '20000000-0000-4000-8000-000000000003';
const DOC = '30000000-0000-4000-8000-000000000004';
const BOARD = '/api/review/board?scope=all&limit=100';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const fail = (status: number) => ({ ok: false, status, json: async () => ({ success: false, error: 'boom' }), text: async () => '' });

const member = (taskId: string, userId: number, role: 'reviewer' | 'approver', step: number) => ({
  taskId, userId, role, step, printedName: 'Someone', outcome: 'pending', stepOpen: step === 1,
  dueDate: null, signature: null, actId: null,
});
const vaultItem = (vaultId: string, members: unknown[]) => ({
  canonicalId: 'C-' + vaultId.slice(-1), vaultId, programId: PROGRAM, program: 'BX-301', title: 'Clinical overview', version: '2.0',
  step: 'review', sentBy: 'Uma', sentAt: null, eligibleSigners: [], mine: false, sentByMe: false, routeState: 'live',
  round: { route: { id: 'r', round: 1, status: 'open' }, members },
});
let boardReply: () => unknown;

const work = (over: Partial<MyWorkItem> = {}): MyWorkItem => ({
  taskId: 'ROUTE-r1-8', title: 'Approve: Clinical overview', projectId: 25, projectName: 'BX-301', moduleType: 'Vault', status: 'pending',
  priority: 'medium', dueDate: null, overdue: false, dueSoon: false, blocked: false, approvalRequired: false,
  approvalStatus: 'not_started', criticalPath: false, waitingOn: null, reviewRole: 'approver', ...over,
});

beforeEach(() => {
  apiRequest.mockReset();
  boardReply = () => ok({ success: true, data: { queue: [], workflows: {}, thread: [], vaultReviews: [
    vaultItem(OTHER_VERSION, [member('ROUTE-zz-8', 8, 'approver', 2)]),
    vaultItem(VERSION, [member('ROUTE-r1-5', 5, 'reviewer', 1), member('ROUTE-r1-8', 8, 'approver', 2)]),
  ] } });
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === BOARD) return boardReply();
    if (url === '/api/concept2cure/reviews/pending') return ok({ success: true, data: { totalPending: 0, assignments: [] } });
    return fail(404);
  });
});
afterEach(() => { cleanup(); clearShellProject(); __resetCeremonies(); });

describe('a review route task opens its version (GA-UI-04)', () => {
  it('one click opens the version the route names, in the Vault of its project', async () => {
    const go = vi.fn(); const openTask = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[work()]} queue={null} approvalRows={[]} go={go} openTask={openTask} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve: Clinical overview/ }));
    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    expect(go).toHaveBeenCalledWith(`vault?documentId=${VERSION}&program=${PROGRAM}`);
    expect(readShellProject()?.id).toBe(PROGRAM);
    expect(takeVaultTarget(PROGRAM)).toEqual({ kind: 'here', documentId: VERSION });
    expect(openTask).not.toHaveBeenCalled();
  });

  it('a board that cannot be read is said, and nothing is opened', async () => {
    boardReply = () => fail(500);
    const go = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[work()]} queue={null} approvalRows={[]} go={go} openTask={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve: Clinical overview/ }));
    const alert = await screen.findByText(/could not be opened/);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(go).not.toHaveBeenCalled();
  });

  it('a route the board does not list opens the Review board', async () => {
    const go = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[work({ taskId: 'ROUTE-gone-8' })]} queue={null} approvalRows={[]} go={go} openTask={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve: Clinical overview/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('review'));
  });
});

describe('an approval at your sign-off opens its document (GA-UI-04)', () => {
  it('opens the document in the editor, in its project', async () => {
    const go = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[]} queue={null}
      approvalRows={[{ id: DOC, doc: 'Clinical Overview 2.5', prog: 'BX-301', programId: PROGRAM, role: 'APPROVER sign-off', atMySignOff: true }]}
      go={go} openTask={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Clinical Overview 2.5/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('document-authoring'));
    expect(readShellProject()?.id).toBe(PROGRAM);
  });
});
