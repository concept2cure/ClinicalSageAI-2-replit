// @vitest-environment jsdom
/** Real Tasks drawer → existing guarded Quality handoff, with no duplicate record UI. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ api: vi.fn(), rows: [] as Record<string, unknown>[],
  user: { id: '2', organizationId: '7', name: 'Rhea Reviewer', permissions: ['governed:write'] } }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: h.api }));
vi.mock('@/services/portal/authService', async original => {
  const real = await original<typeof import('@/services/portal/authService')>();
  return { ...real, useAuth: () => ({ user: h.user }), authService: { ...real.authService, getUser: () => h.user } };
});

import { TaskBoard } from '../surfaces/TaskBoard';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams, registerSurfaceLeaveGuard } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';

const PROGRAM = '46e5c864-08bf-4860-aa6f-36e015485015';
const BASE = { taskId: 'TASK-quality', title: 'Native Quality work', project: '31', moduleType: 'Quality', taskType: 'action',
  status: 'pending', priority: 'medium', assignee: '2', assignedBy: '4', progress: 0, impactScore: null, due: '—', dueDateIso: null,
  phase: null, criticalPath: false, regulatoryImpact: false, blocked: false, approvalRequired: false, approvalStatus: 'not_started',
  approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'quality',
  sourceEntityType: 'capa_record', sourceEntityId: 'capa:aabbccdd-0000-4000-8000-000000000001' };
const release: Array<() => void> = [];
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value }) as Response;

beforeEach(() => {
  sessionStorage.setItem('trialsage_access_token', `test.${btoa(JSON.stringify({ userId: 2, organizationId: 7 }))}.synthetic`);
  h.api.mockReset();
  h.rows = [{ ...BASE, qualitySource: { kind: 'quality', qmsTab: 'capa', programId: PROGRAM } }];
  h.api.mockImplementation(async (_method: string, url: string) => ok({ data: url === '/api/task-management/board' ? h.rows : [] }));
  publishShellProject({ id: PROGRAM, title: 'Native source project' });
});
afterEach(() => {
  cleanup(); release.splice(0).forEach(unregister => unregister()); clearShellProject(); clearNavParams(); __resetSurfaceActionBus(); sessionStorage.clear();
});
function mount() {
  const onNav = vi.fn(() => expect(screen.queryByRole('dialog', { name: 'Task detail' })).toBeNull());
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TaskBoard {...({ onAsk: () => {}, onNav } as unknown as React.ComponentProps<typeof TaskBoard>)} />
  </QueryClientProvider>);
  return onNav;
}
async function drawer() {
  fireEvent.click(await screen.findByRole('button', { name: `Open ${BASE.title}` }));
  return screen.findByRole('dialog', { name: 'Task detail' });
}

describe('Tasks retains native Quality destinations', () => {
  it('names Quality as the source and opens the CAPA register after closing its drawer', async () => {
    const nav = mount(), detail = await drawer();
    expect(within(detail).getByText('Quality records and controlled documents')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Open CAPA register' }));
    await waitFor(() => expect(nav).toHaveBeenCalledOnce());
    expect(window.C2C_NAV_PARAMS).toMatchObject({ surfaceId: 'quality', params: { qmsTab: 'capa' } });
    expect(readShellProject()?.id).toBe(PROGRAM);
  });

  it.each([
    ['sop', 'Open the controlled document', { qmsDocumentId: '12' }, PROGRAM],
    ['sop', 'Read and acknowledge', { qmsDocumentId: '12', qmsIntent: 'read' }, null],
    ['deviations', 'Open deviation register', {}, null],
    ['suppliers', 'Open supplier register', {}, null],
    ['audits', 'Open internal audit register', {}, null],
  ])('opens %s through the existing Quality destination', async (tab, label, params, programId) => {
    h.rows = [{ ...BASE, qualitySource: { kind: 'quality', qmsTab: tab, ...params, programId } }];
    const nav = mount(), detail = await drawer();
    fireEvent.click(within(detail).getByRole('button', { name: String(label) }));
    await waitFor(() => expect(nav).toHaveBeenCalledOnce());
    expect(window.C2C_NAV_PARAMS).toMatchObject({ surfaceId: 'quality', params: { qmsTab: tab, ...params } });
    expect(readShellProject()?.id ?? null).toBe(programId);
  });

  it('says a missing source is unavailable and offers no guessed Quality door', async () => {
    h.rows = [{ ...BASE, qualitySource: { kind: 'unresolved' } }];
    const nav = mount(), detail = await drawer();
    expect(within(detail).getByText('The Quality record could not be read. Reopen the task after checking access in Quality.')).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: /Open.*register|controlled document|Read and acknowledge/ })).toBeNull();
    expect(nav).not.toHaveBeenCalled();
  });

  it('keeps the existing leave guard ahead of project publication and parameter handoff', async () => {
    const nav = mount(), detail = await drawer();
    const previous = { project: readShellProject(), params: { surfaceId: 'vault', params: { retained: 'yes' }, setAt: Date.now() } };
    window.C2C_NAV_PARAMS = previous.params;
    release.push(registerSurfaceLeaveGuard(() => 'Finish the pending governed form.'));
    fireEvent.click(within(detail).getByRole('button', { name: 'Open CAPA register' }));
    await screen.findByText('Finish the pending governed form.');
    expect(nav).not.toHaveBeenCalled(); expect(readShellProject()).toBe(previous.project); expect(window.C2C_NAV_PARAMS).toBe(previous.params);
  });
});
