// @vitest-environment jsdom
/**
 * P-122 §3.5 (2026-11-10): an archived project can be restored from Projects.
 *
 * WHY THIS EXISTS
 * Archive got a governed control in Project settings (465bc23a8): a reason and a
 * typed word, then POST /api/c2c/projects/:id/archive. Its counterpart, POST
 * /api/c2c/projects/:id/unarchive (server/routes/c2c/projects.ts), had no caller:
 * an archived project left the list and nothing brought it back (P-122
 * inventory, section 3).
 *
 * WHAT IS PINNED
 *   - "Archived projects" on Projects lists the archived projects the server
 *     returns (the same read with includeArchived=true), and only those;
 *   - Restore takes the archive's governed confirmation (a reason and the typed
 *     word), sends the reason to the close-out route, says "restored" only when
 *     the route names this project, and reads the portfolio again;
 *   - a refusal is the server's words; an answer that may have completed says so;
 *   - a failed read of the archived projects is said, never shown as none.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (original) => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser(), useAuth: () => ({ user: actual.authService.getUser() }) };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: 7 }, setCurrentClientWorkspace: vi.fn() }) }));

import { authService } from '@/services/portal/authService';
import { ApiRequestError } from '@/lib/queryClient';
import { Projects } from '../surfaces/Projects';

const ARCHIVED = '9a7f0b10-0000-4000-8000-0000000000cc';
const ACTOR = { id: '12', organizationId: '7', permissions: ['governed:write'], displayName: 'Current actor' };
const jwt = () => `e30.${btoa(JSON.stringify({ userId: 12, organizationId: 7 }))}.original`;
const ok = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const row = (id: string, title: string, status: string) => ({
  id, title, ws: 'Biotech', code: title.slice(-3).toUpperCase(), stage: 'Planning', readiness: null, readinessState: 'no_sections',
  status, lead: 'Rae Okafor', due: '—', due_date: null, activity: 'Updated Nov 9', client_workspace_id: 21,
});
const ACTIVE = row('9a7f0b10-0000-4000-8000-0000000000aa', 'Program alpha', 'active');
const GAMMA = row(ARCHIVED, 'Program gamma', 'archived');
const COUNTS = { total: 1, filingWithin60Days: 0, byWorkstream: { Biotech: 1 }, byPathway: { other: 1 } };

let archivedRead: () => Promise<Response>;
let restoreAnswer: () => Promise<Response>;
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
const portfolioReads = () => apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === '/api/c2c/projects');

beforeEach(() => {
  try { window.localStorage.removeItem('c2c-v2-projects-view'); } catch { /* none */ }
  authService.setToken(jwt(), ACTOR, 'fixture-refresh', 3600);
  archivedRead = async () => ok({ data: [ACTIVE, GAMMA], meta: { counts: { ...COUNTS, total: 2 } } });
  restoreAnswer = async () => ok({ ok: true, projectId: ARCHIVED });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === `/api/c2c/projects/${ARCHIVED}/unarchive`) return restoreAnswer();
    if (method === 'GET' && url === '/api/c2c/projects?includeArchived=true&limit=200') return archivedRead();
    if (method === 'GET' && url === '/api/c2c/projects') return ok({ data: [ACTIVE], meta: { counts: COUNTS } });
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); authService.endSession(null); });

async function openArchived() {
  render(<Projects {...props()} />);
  await screen.findByText('Program alpha');
  fireEvent.click(screen.getByRole('button', { name: 'Archived projects' }));
}
async function restore(reason = 'The sponsor resumed the programme after the hold') {
  fireEvent.click(await screen.findByRole('button', { name: 'Restore Program gamma' }));
  const dialog = await screen.findByRole('dialog', { name: 'Restore project' });
  expect(posts()).toHaveLength(0);
  fireEvent.change(within(dialog).getByPlaceholderText('Captured verbatim in the audit log. Be specific.'), { target: { value: reason } });
  fireEvent.change(within(dialog).getByPlaceholderText('restore'), { target: { value: 'restore' } });
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' })); });
  return dialog;
}

describe('Projects: archived projects, and restoring one (P-122 §3.5)', () => {
  it('lists the archived projects the server returns, and only those', async () => {
    await openArchived();
    expect(await screen.findByText('Program gamma')).toBeTruthy();
    const list = screen.getByRole('region', { name: 'Archived projects' });
    expect(within(list).queryByText('Program alpha')).toBeNull();
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === '/api/c2c/projects?includeArchived=true&limit=200')).toBe(true);
    fireEvent.click(within(list).getByRole('button', { name: 'Back to projects' }));
    expect(screen.queryByRole('region', { name: 'Archived projects' })).toBeNull();
    expect(screen.getByText('Program alpha')).toBeTruthy();
  });

  it('restores only after a reason and the typed word, through the close-out route, and reads the portfolio again', async () => {
    await openArchived();
    const before = portfolioReads().length;
    await restore();
    expect(posts()).toEqual([['POST', `/api/c2c/projects/${ARCHIVED}/unarchive`, { reason: 'The sponsor resumed the programme after the hold' }, expect.any(Object)]]);
    expect(posts()[0][3]).toMatchObject({ Authorization: `Bearer ${jwt()}`, 'x-organization-id': '7', 'x-client-id': '21' });
    expect((await screen.findByText(/^Program gamma was restored\./)).textContent).toMatch(/active again.*audit trail/);
    await waitFor(() => expect(portfolioReads().length).toBeGreaterThan(before));
  });

  it('a refusal is the server’s words, and nothing is said to be restored', async () => {
    restoreAnswer = async () => { throw new ApiRequestError('This program is not archived.', 400, { error: 'This program is not archived.' }); };
    await openArchived();
    await restore();
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(/not archived/);
    expect(screen.queryByText(/was restored/)).toBeNull();
  });

  it('an answer that may have completed is said so, never as done or refused', async () => {
    restoreAnswer = async () => { throw new ApiRequestError('Server error', 502, null); };
    await openArchived();
    await restore();
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(/could not be confirmed.*may have been restored/);
  });

  it('a failed read of the archived projects is said, with a retry, never as none', async () => {
    archivedRead = async () => ok({ error: 'down' }, 503);
    await openArchived();
    expect(await screen.findByText(/archived projects could not be read/i)).toBeTruthy();
    expect(screen.queryByText(/No archived projects/)).toBeNull();
    archivedRead = async () => ok({ data: [ACTIVE, GAMMA], meta: { counts: COUNTS } });
    fireEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(await screen.findByText('Program gamma')).toBeTruthy();
  });

  it('with none archived, says so', async () => {
    archivedRead = async () => ok({ data: [ACTIVE], meta: { counts: COUNTS } });
    await openArchived();
    expect(await screen.findByText('No archived projects.')).toBeTruthy();
  });
});
