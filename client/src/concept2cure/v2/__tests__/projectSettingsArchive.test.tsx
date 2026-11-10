// @vitest-environment jsdom
/**
 * Project settings reach the project's existing close-out (2026-10-31 client demo).
 *
 * POST /api/c2c/projects/:id/archive (server/routes/c2c/projects.ts) had no caller:
 * a project could be created and worked, never archived from its own page. It is
 * reached from Project settings, by someone who may change the project, after the
 * governed confirmation every project change takes (a reason and a typed word).
 * "Archived" is said only when the route names this project; a refusal is the
 * server's words; an answer that may have completed is said so.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettingsData } from '@shared/project-settings';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: 7 }, currentClientWorkspace: { id: '21', organizationId: '7' } }) }));
import { authService } from '@/services/portal/authService';
import { ApiRequestError } from '@/lib/queryClient';
import { ProjectSettings } from '../surfaces/ProjectSettings';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM = '9a7f0b10-0000-4000-8000-0000000000aa';
const ACTOR = { id: '12', organizationId: '7', permissions: ['governed:write'], displayName: 'Current actor' };
const jwt = () => `e30.${btoa(JSON.stringify({ userId: 12, organizationId: 7 }))}.original`;
const data = (over: Partial<ProjectSettingsData> = {}): ProjectSettingsData => ({ programId: PROGRAM, projectId: 31, organizationId: 7, actorUserId: 12,
  clientWorkspaceId: 21, canChange: true, revision: `v1:${'a'.repeat(64)}`, description: 'Description', priority: 'medium', targetSubmissionDate: null, ...over });
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
let archiveAnswer: () => Promise<Response>;
const posts = () => request.mock.calls.filter(([method]) => method === 'POST');

beforeEach(() => {
  authService.setToken(jwt(), ACTOR, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM, title: 'Current project' });
  archiveAnswer = async () => response({ ok: true, projectId: PROGRAM });
  request.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET') return response({ success: true, data: data() });
    if (method === 'POST' && path === `/api/c2c/projects/${PROGRAM}/archive`) return archiveAnswer();
    throw new Error(`unexpected ${method} ${path}`);
  });
});
afterEach(() => { cleanup(); authService.endSession(null); clearShellProject(); request.mockReset(); });

async function openArchive(onSaved = vi.fn()) {
  render(<ProjectSettings programId={PROGRAM} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
  await screen.findByRole('textbox', { name: 'Project description' });
  fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));
  return { onSaved, dialog: await screen.findByRole('dialog', { name: 'Archive project' }) };
}
async function confirm(dialog: HTMLElement, reason = 'The IND was withdrawn by the sponsor') {
  fireEvent.change(within(dialog).getByPlaceholderText('Captured verbatim in the audit log. Be specific.'), { target: { value: reason } });
  fireEvent.change(within(dialog).getByPlaceholderText('archive'), { target: { value: 'archive' } });
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' })); });
}

describe('archive from Project settings', () => {
  it('says what archiving does, and archives only after a reason and the typed word', async () => {
    const { onSaved, dialog } = await openArchive();
    expect(screen.getByText(/leaves the project list and takes no new market\. Its documents and records are kept\./)).toBeTruthy();
    expect(posts()).toHaveLength(0);
    await confirm(dialog);
    expect(posts()).toEqual([['POST', `/api/c2c/projects/${PROGRAM}/archive`, { reason: 'The IND was withdrawn by the sponsor' }, expect.any(Object)]]);
    expect(await screen.findByText(/^Project archived\./)).toBeTruthy();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Archive project' })).toBeNull();
  });

  it('a refusal is the server’s words, and nothing is said to be archived', async () => {
    archiveAnswer = async () => { throw new ApiRequestError('This program is already archived.', 400, { error: 'This program is already archived.' }); };
    const { onSaved, dialog } = await openArchive();
    await confirm(dialog);
    expect((await screen.findByRole('alert')).textContent).toMatch(/already archived/);
    expect(screen.queryByText(/^Project archived\./)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('an answer that may have completed is said so, never as done or refused', async () => {
    archiveAnswer = async () => { throw new ApiRequestError('Server error', 502, null); };
    const { onSaved, dialog } = await openArchive();
    await confirm(dialog);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be confirmed.*may have been archived/);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a person who may only read the settings is not offered it', async () => {
    request.mockImplementation(async () => response({ success: true, data: data({ canChange: false }) }));
    render(<ProjectSettings programId={PROGRAM} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
    await screen.findByRole('textbox', { name: 'Project description' });
    expect(screen.queryByRole('button', { name: 'Archive project' })).toBeNull();
  });
});
