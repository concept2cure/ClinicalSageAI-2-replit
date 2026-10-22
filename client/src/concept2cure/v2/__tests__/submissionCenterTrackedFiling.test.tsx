// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskFilingHome } from '@shared/types/task-filing-home';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { clearNavParams, stashNavParamsForTarget } from '../navParams';
import { __resetCeremonies, registerCeremonyOpen } from '../ceremony';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const PROGRAM = '33333333-3333-4333-8333-333333333333';
const detail = (id: string): TaskFilingHome => ({
  filing: { id, catalogKey: 'k510_traditional', programType: '510k', variant: 'device', title: `Exact filing ${id === FIRST ? 'one' : 'two'}`,
    status: 'under_review', decision: null, fdaTrackingNumber: null, filedAt: null, reviewGoalDays: 90, decisionDueAt: null,
    filedArtifactDocumentId: null, filedArtifactSha256: null, notes: 'Saved tracker note',
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' },
  home: { source: 'filing', nativeId: id, projectId: 12, programId: PROGRAM, programTitle: 'Actual programme' },
});
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
beforeEach(() => {
  apiRequest.mockReset(); clearNavParams(); __resetCeremonies();
  window.history.replaceState(null, '', '/concept2cure/submissions');
  apiRequest.mockImplementation(async (method: string, path: string) => {
    const id = path.startsWith('/api/task-management/filings/') ? path.split('/').at(-1)! : null;
    if (id) return ok({ success: true, data: detail(id) });
    if (path === '/api/510k/estar/submissions') return ok({ submissions: [{ ...detail(FIRST).filing, projectId: 12 }] });
    if (path === '/api/c2c/projects') return ok({ data: [{ id: PROGRAM, title: 'Actual programme', code: 'ACTUAL' }] });
    if (method === 'POST' && path === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    return ok([]);
  });
});
afterEach(() => { cleanup(); clearNavParams(); __resetCeremonies(); window.history.replaceState(null, '', '/'); });
const mount = (strict = false) => {
  const component = <SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />;
  return render(strict ? <React.StrictMode>{component}</React.StrictMode> : component);
};
const heading = (number: string) => screen.findByRole('heading', { name: `Exact filing ${number}` });

describe('Submission Center exact native filing entry', () => {
  it('opens a copied filing UUID under StrictMode without needing canonical submissions or a programme switch', async () => {
    window.history.replaceState(null, '', `/concept2cure/submissions?filingId=${FIRST}`);
    mount(true);
    expect(await heading('one')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/task-management/filings/${FIRST}`);
    expect(apiRequest.mock.calls.some(([method, path]) => method !== 'GET' && path !== '/api/510k/estar/assemble')).toBe(false);
  });
  it('prefers one-shot handoff over an old copied URL', async () => {
    window.history.replaceState(null, '', `/concept2cure/submissions?filingId=${FIRST}`);
    stashNavParamsForTarget('submission-center', { filingId: SECOND });
    mount(true);
    expect(await heading('two')).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalledWith('GET', `/api/task-management/filings/${FIRST}`);
  });
  it.each([`${FIRST}&filingId=${SECOND}`, '12', 'not-a-uuid'])('refuses malformed or ambiguous copied filing identifiers: %s', async value => {
    window.history.replaceState(null, '', `/concept2cure/submissions?filingId=${value}`);
    mount();
    expect(await screen.findByText(/linked tracked filing identifier is invalid or ambiguous/i)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([, path]) => String(path).startsWith('/api/task-management/filings/'))).toBe(false);
  });
  it('opens and replaces an exact native target while already mounted', async () => {
    mount(); await screen.findByRole('button', { name: 'Open tracked filing Exact filing one' });
    act(() => { stashNavParamsForTarget('submission-center', { filingId: FIRST }); });
    await heading('one');
    act(() => { stashNavParamsForTarget('submission-center', { filingId: SECOND }); });
    await heading('two');
    expect(screen.queryByRole('heading', { name: 'Exact filing one' })).toBeNull();
  });
  it('opens the exact record from the existing portfolio row', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Open tracked filing Exact filing one' }));
    expect(await heading('one')).toBeTruthy();
  });
  it('does not replay the original copied URL after detail closes and unrelated navigation arrives', async () => {
    window.history.replaceState(null, '', `/concept2cure/submissions?filingId=${FIRST}`);
    mount(); await heading('one');
    fireEvent.click(screen.getByRole('button', { name: 'Close tracked filing' }));
    act(() => { stashNavParamsForTarget('project-home', { stage: 'review' }); });
    expect(screen.queryByRole('heading', { name: 'Exact filing one' })).toBeNull();
  });
  it('preserves an actual new-submission form and entered title when a same-surface filing handoff arrives', async () => {
    mount();
    const create = await screen.findByRole('button', { name: '+ New submission' });
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(create);
    const title = await screen.findByLabelText(/^Title/);
    fireEvent.change(title, { target: { value: 'Keep this unsaved submission title' } });
    act(() => { stashNavParamsForTarget('submission-center', { filingId: FIRST }); });
    expect((title as HTMLInputElement).value).toBe('Keep this unsaved submission title');
    expect(await screen.findByText(/Finish or cancel the open governed form/)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalledWith('GET', `/api/task-management/filings/${FIRST}`);
  });
  it('preserves a registered signature ceremony and current exact filing when another target arrives', async () => {
    window.history.replaceState(null, '', `/concept2cure/submissions?filingId=${FIRST}`);
    mount(); await heading('one');
    const endCeremony = registerCeremonyOpen();
    act(() => { stashNavParamsForTarget('submission-center', { filingId: SECOND }); });
    expect(await screen.findByText(/Finish or cancel the open governed form/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Exact filing one' })).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalledWith('GET', `/api/task-management/filings/${SECOND}`);
    endCeremony();
    act(() => { stashNavParamsForTarget('submission-center', { filingId: SECOND }); });
    expect(await heading('two')).toBeTruthy();
  });
});
