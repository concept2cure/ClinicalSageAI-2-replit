// @vitest-environment jsdom
/** Confirmed notification reads must pass the current native screen's leave
 * decision before changing any of the existing navigation channels. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NotificationRecordTarget } from '@shared/types/notification-navigation';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), user: { id: 42, organizationId: 7 } as { id: number; organizationId: number } | null }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: mocks.apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: mocks.user }), authService: { getUser: () => mocks.user } }));

import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { NotificationOpenButton } from '../NotificationOpenButton';
import { TaskTray } from '../TaskTray';
import { openNotificationRecord } from '../notificationNavigation';
import { clearEditorTarget, setEditorTarget } from '../editorTarget';
import { clearNavParams, registerSurfaceLeaveGuard, stashNavParamsForTarget } from '../navParams';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { readTaskTarget } from '../taskTarget';
import { __resetCeremonies } from '../ceremony';

const OLD = '10000000-0000-4000-8000-000000000001';
const NEXT = '20000000-0000-4000-8000-000000000002';
const DOC = '30000000-0000-4000-8000-000000000003';
const notice = { id: 5, resource_type: 'report_run', resource_id: '41' };
const report: NotificationRecordTarget = { surface: 'insights', label: 'Open saved report', params: { reportRunId: '41' }, programId: NEXT };
const response = (target: NotificationRecordTarget = report) => ({ ok: true, status: 200, json: async () => ({ data: target }) }) as Response;
const channels = () => ({ project: readShellProject(), editor: window.C2C_EDITOR_TARGET, params: window.C2C_NAV_PARAMS });
let release: (() => void) | undefined;

beforeEach(() => {
  mocks.apiRequest.mockReset(); mocks.apiRequest.mockResolvedValue(response());
  mocks.user = { id: 42, organizationId: 7 };
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 42, organizationId: 7 }))}.synthetic`);
  __resetCeremonies();
  publishShellProject({ id: OLD, title: 'Current program' });
  setEditorTarget({ docType: null, docId: DOC, code: '3.2.S.1', programId: OLD });
  stashNavParamsForTarget('document-authoring', { documentId: DOC, sectionCode: '3.2.S.1' });
});
afterEach(() => {
  cleanup(); release?.(); release = undefined; clearAuthToken(); __resetCeremonies();
  clearEditorTarget(); clearNavParams(); clearShellProject();
});

describe('notification guard precedes channel mutation', () => {
  it.each([NEXT, null])('preserves the project, editor and record params when native work refuses a %s target', programId => {
    release = registerSurfaceLeaveGuard(() => 'Check working documents before leaving.');
    const before = channels(); const navigate = vi.fn();
    expect(() => openNotificationRecord({ ...report, programId }, navigate)).toThrow('Check working documents before leaving.');
    expect(navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(before);
  });

  it('checks the tray owner before changing any channel', () => {
    const before = channels(); const navigate = vi.fn();
    expect(() => openNotificationRecord(report, navigate, () => { throw new Error('The old tray was retired.'); })).toThrow('old tray was retired');
    expect(navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(before);
  });

  it('builds a confirmed task destination with the current actor and organization', () => {
    const navigate = vi.fn();
    openNotificationRecord({ surface: 'tasks', label: 'Open task', params: { taskId: 'TASK-exact-42' }, programId: null }, navigate);
    expect(navigate).toHaveBeenCalledWith('tasks?taskId=TASK-exact-42&taskActor=42&taskOrg=7');
    const location = navigate.mock.calls[0][0] as string;
    expect(readTaskTarget(location.slice(location.indexOf('?')), { userId: '42', organizationId: '7' })).toEqual({ taskId: 'TASK-exact-42' });
    expect(window.C2C_NAV_PARAMS?.params).toEqual({ taskId: 'TASK-exact-42', taskActor: '42', taskOrg: '7' });
  });

  it('refuses a task when the current actor cannot be established before clearing existing targets', () => {
    mocks.user = null;
    const before = channels(); const navigate = vi.fn();
    expect(() => openNotificationRecord({ surface: 'tasks', label: 'Open task', params: { taskId: 'TASK-exact-42' }, programId: null }, navigate)).toThrow(/account or organization changed/);
    expect(navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(before);
  });
});

describe('confirmed async notification response repeats admission', () => {
  async function pending(beforeOpen?: () => void) {
    let resolve!: (value: Response) => void;
    mocks.apiRequest.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    const navigate = vi.fn(); render(<NotificationOpenButton notice={notice} navigate={navigate} beforeOpen={beforeOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved report' }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledOnce());
    return { resolve, navigate, before: channels() };
  }

  it('retains all channels when native creation becomes uncertain during the target read', async () => {
    const current = await pending();
    release = registerSurfaceLeaveGuard(() => 'Check working documents before leaving.');
    await act(async () => current.resolve(response()));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Check working documents/);
    expect(current.navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(current.before);
  });

  it('rechecks the retained tray owner after the linked record is confirmed', async () => {
    let owned = true;
    const beforeOpen = vi.fn(() => { if (!owned) throw new Error('The old tray was retired.'); });
    const current = await pending(beforeOpen); owned = false;
    await act(async () => current.resolve(response()));
    expect((await screen.findByRole('alert')).textContent).toMatch(/old tray was retired/);
    expect(beforeOpen).toHaveBeenCalledTimes(2);
    expect(current.navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(current.before);
  });

  it('rejects a changed live actor even if the bearer has not yet been replaced', async () => {
    const current = await pending(); mocks.user = { id: 43, organizationId: 7 };
    await act(async () => current.resolve(response()));
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(current.navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(current.before);
  });

  it('does not resolve a linked record under a bearer for another actor', async () => {
    setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 43, organizationId: 7 }))}.synthetic`);
    const before = channels(); const navigate = vi.fn();
    render(<NotificationOpenButton notice={notice} navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved report' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(mocks.apiRequest).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(before);
  });
});

describe('actual tray owns a pending notification target', () => {
  async function pendingTray() {
    let resolve!: (value: Response) => void;
    const target = new Promise<Response>(done => { resolve = done; });
    mocks.apiRequest.mockImplementation(async (_method: string, path: string) => {
      if (path === '/api/mdx/notifications/5/target') return target;
      const data = path.includes('/my-work') ? { items: [], total: 0 }
        : path.includes('/my-queue') ? { threads: [], tasks: [] }
        : path.includes('/review/board') ? { queue: [] }
        : path.includes('/unread-count') ? { unread: 1 }
        : [{ ...notice, title: 'Saved report awaits review', category: 'reporting', severity: 'info', body: null }];
      return { ok: true, status: 200, json: async () => ({ data }) } as Response;
    });
    const navigate = vi.fn(); const view = render(<TaskTray onNav={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Your work/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open saved report' }));
    await waitFor(() => expect(mocks.apiRequest.mock.calls.some(([, path]) => path === '/api/mdx/notifications/5/target')).toBe(true));
    return { resolve, navigate, view, before: channels() };
  }

  it('refuses the confirmed target when the old tray actor changes before React retires it', async () => {
    const current = await pendingTray(); mocks.user = { id: 43, organizationId: 7 };
    await act(async () => current.resolve(response()));
    expect((await screen.findByRole('alert')).textContent).toMatch(/account or organization changed/);
    expect(current.navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(current.before);
  });

  it('does not revive an old notification callback after an account round trip', async () => {
    const current = await pendingTray();
    mocks.user = { id: 43, organizationId: 8 };
    setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 43, organizationId: 8 }))}.synthetic`);
    current.view.rerender(<TaskTray onNav={current.navigate} />);
    mocks.user = { id: 42, organizationId: 7 };
    setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 42, organizationId: 7 }))}.synthetic`);
    current.view.rerender(<TaskTray onNav={current.navigate} />);
    await act(async () => current.resolve(response()));
    expect(current.navigate).not.toHaveBeenCalled(); expect(channels()).toEqual(current.before);
    expect(screen.queryByRole('dialog', { name: 'Your work' })).toBeNull();
  });
});
