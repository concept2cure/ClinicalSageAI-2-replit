// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { CsrNarrativeReadiness } from '../surfaces/CsrNarrativeReadiness';
const PROGRAM = '9a7f0b10-0000-4000-8000-0000000000aa';
const OTHER = '9a7f0b10-0000-4000-8000-0000000000bb';
const readiness = (programId = PROGRAM, completedSummaryCount: number | null = 2) => ({
  programId, projectLinked: true, completedSummaryCount,
  rawTabulation: { status: 'not-linked', studyCount: null },
  narrative: { available: false, code: 'CSR_NARRATIVE_INPUTS_REQUIRED', message: 'Clinical observations and study details are required.' },
  requiredInputs: { studyData: { required: ['demographics', 'efficacy'], optional: ['labs'] }, studyInfo: { required: ['studyId', 'title', 'sponsor'], optional: [] } },
  recovery: [{ appId: 'vault', label: 'Open Vault', message: 'Retain original source material.' }, { appId: 'authoring', label: 'Open Authoring', message: 'Prepare the governed narrative.' }],
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
afterEach(() => { cleanup(); apiRequest.mockReset(); });
it('shows real summary reuse separately from unavailable first-study narrative generation and connects recovery', async () => {
  apiRequest.mockResolvedValue(ok(readiness()));
  const onNav = vi.fn();
  render(<CsrNarrativeReadiness programId={PROGRAM} onNav={onNav} interactionBusy={false} />);
  await screen.findByText(/2 completed CSR summaries/);
  expect(screen.getByText(/Raw clinical observations are not linked/)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open Vault' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open Authoring' }));
  expect(onNav.mock.calls).toEqual([['vault'], ['document-authoring']]);
  expect(screen.getByText('demographics, efficacy')).toBeTruthy();
  expect(apiRequest).toHaveBeenCalledWith('GET', `/api/submission-orchestrator/csr/readiness?programId=${PROGRAM}`, undefined);
});
it('reports a failed or malformed response without claiming zero studies and offers read-only retry', async () => {
  apiRequest.mockResolvedValueOnce(ok({ ...readiness(), completedSummaryCount: -1 })).mockResolvedValueOnce(ok(readiness(PROGRAM, null)));
  render(<CsrNarrativeReadiness programId={PROGRAM} interactionBusy={false} />);
  await screen.findByRole('alert');
  expect(screen.queryByText(/0 completed CSR summaries/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry CSR readiness' }));
  await screen.findByText(/Completed CSR summary count is unavailable/);
  expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
});
it('discards a former program response and fences recovery during a governed operation', async () => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  apiRequest.mockImplementation(async (_method, path) => {
    if (path.endsWith(PROGRAM)) { await delayed; return ok(readiness(PROGRAM, 99)); }
    return ok(readiness(OTHER, 1));
  });
  const onNav = vi.fn();
  const view = render(<CsrNarrativeReadiness programId={PROGRAM} onNav={onNav} interactionBusy={false} />);
  view.rerender(<CsrNarrativeReadiness programId={OTHER} onNav={onNav} interactionBusy />);
  await screen.findByText(/1 completed CSR summary/);
  await act(async () => { release(); await delayed; });
  expect(screen.queryByText(/99 completed CSR summaries/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open Vault' }));
  expect(onNav).not.toHaveBeenCalled();
});
