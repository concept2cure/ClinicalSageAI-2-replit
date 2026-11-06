// @vitest-environment jsdom
/**
 * A review-route task opened from Tasks opens where it is signed (J5 human
 * test, J2's D4, 2026-11-06). The drawer offered only Advance and Archive, and
 * the server refuses Advance on a route task (409, ROUTE_TASK_OWNED_BY_ROUTE),
 * so a reviewer who started from Tasks was stuck. The drawer now opens the
 * version (or the controlled document) through the one record-opening path a
 * notice uses, and offers no board move the server would refuse.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
const opened = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '2', organizationId: '7', name: 'Rhea Reviewer', permissions: ['governed:write'] } }),
}));
vi.mock('../notificationNavigation', () => ({ openNotificationRecord: opened }));

import { TaskBoard } from '../surfaces/TaskBoard';

const VAULT = '0b7e1a52-3c55-4a0e-9a8e-111111111111';
const PROGRAM = '46e5c864-08bf-4860-aa6f-36e015485015';
const BASE = {
  project: '', moduleType: 'regulatory', taskType: 'review', status: 'pending', priority: 'medium', assignee: '2',
  assignedBy: '4', progress: 0, impactScore: null, due: '—', dueDateIso: null, phase: null, criticalPath: false,
  regulatoryImpact: false, blocked: false, approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [],
  dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified', createdAt: '2026-11-06T00:00:00Z',
};
const VAULT_TASK = { ...BASE, taskId: 'ROUTE-aaaa-2', title: 'Review: ADSL', reviewRoute: { kind: 'vault', documentId: VAULT, programId: PROGRAM } };
const QMS_TASK = { ...BASE, taskId: 'ROUTE-bbbb-2', title: 'Approve: SOP-001', reviewRoute: { kind: 'quality', qmsDocumentId: '12' } };
const PLAIN = { ...BASE, taskId: 'PLAIN-1', title: 'Book the kickoff room' };

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
beforeEach(() => {
  // The drawer opens a record only for the signed-in actor its bearer names.
  sessionStorage.setItem('trialsage_access_token', `test.${btoa(JSON.stringify({ userId: 2, organizationId: 7 }))}.synthetic`);
  opened.mockReset(); apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (path === '/api/task-management/board') return ok({ data: [VAULT_TASK, QMS_TASK, PLAIN] });
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); sessionStorage.clear(); });

const onNav = vi.fn();
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TaskBoard {...({ onAsk: () => {}, onNav } as unknown as React.ComponentProps<typeof TaskBoard>)} />
  </QueryClientProvider>,
);
const open = async (title: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `Open ${title}` }));
  return screen.findByRole('dialog', { name: 'Task detail' });
};

describe('a review-route task in the Tasks drawer', () => {
  it('opens its Vault version, and offers no Advance or Move back', async () => {
    mount();
    const d = await open(VAULT_TASK.title);
    expect(within(d).queryByRole('button', { name: /Advance/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Move back' })).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: /Open the version in the Vault/ }));
    expect(opened).toHaveBeenCalledWith(
      { surface: 'vault', label: 'Open the version in the Vault', params: { documentId: VAULT }, programId: PROGRAM }, expect.any(Function));
  });

  it('opens a QMS route task on its controlled document', async () => {
    mount();
    const d = await open(QMS_TASK.title);
    fireEvent.click(within(d).getByRole('button', { name: /Open the controlled document/ }));
    expect(opened).toHaveBeenCalledWith(
      { surface: 'quality', label: 'Open the controlled document', params: { qmsDocumentId: '12' }, programId: null }, expect.any(Function));
  });

  it('leaves an ordinary task its board moves and no route link', async () => {
    mount();
    const d = await open(PLAIN.title);
    expect(within(d).getByRole('button', { name: /Advance/ })).toBeTruthy();
    expect(within(d).queryByRole('button', { name: /Open the version/ })).toBeNull();
  });
});
