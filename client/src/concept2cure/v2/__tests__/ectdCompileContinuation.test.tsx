// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SurfaceViewProps } from '../surfaceViews';
const { apiRequest, sign } = vi.hoisted(() => ({ apiRequest: vi.fn(), sign: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: vi.fn() }));
vi.mock('../../_shared/components/EsignModal', () => ({ EsignModal: (props: any) => props.open ? <><button onClick={() => void props.onSign({ meaning: 'approval', reason: 'Reviewed exact package', password: 'test-credential', totp: '123456' }).then(sign)}>Confirm package signature</button><button onClick={props.onClose}>Close package signature</button></> : null }));
import { EctdCompile } from '../surfaces/EctdCompile';
const PROGRAM = '9a7f0b10-0000-4000-8000-0000000000aa';
const run = { runId: 'run-1', submissionId: 'submission-1', applicationNumber: 'IND123456', region: 'US', submissionType: 'IND', status: 'awaiting-signature', startedAt: '2026-10-14T00:00:00Z', steps: [{ key: 'package.sign', status: 'awaiting-signature', outputRef: JSON.stringify({ payloadDigest: 'abc123' }) }] };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PROGRAM, title: 'Governed program' };
  apiRequest.mockImplementation(async (_method, path) => {
    if (path.includes('?programId=')) return ok({ runs: [{ runId: run.runId, status: run.status, startedAt: run.startedAt }] });
    if (path.endsWith('/for-program')) return ok({ ...run, inputGaps: ['No nonclinical study corpus is linked to this canonical program.'], m3Refusal: null });
    if (path.endsWith('/sign-release')) return ok({ signatureId: 42, signedAt: '2026-10-14T01:00:00Z', continuation: 'retry-required' });
    if (path.endsWith('/resume')) return ok({ continuation: 'waiting', run });
    if (path.endsWith('/audit')) return ok({ events: [] });
    if (path.includes('/signed')) return ok({});
    if (path.includes('/runs/')) return ok(run);
    if (path.endsWith('/history')) return ok({ compilations: [] });
    return ok({ modules: [] });
  });
});
afterEach(() => { cleanup(); apiRequest.mockReset(); sign.mockReset(); delete (window as any).C2C_PROJECT; });
const mount = () => render(<EctdCompile {...({ onAsk: vi.fn() } as unknown as SurfaceViewProps)} />);
async function chooseRun(id: string) {
  await screen.findByRole('option', { name: name => name.includes(id) });
  fireEvent.change(screen.getByLabelText('Saved package runs'), { target: { value: id } });
}
it('discovers saved runs for the open UUID program without requiring a pasted id', async () => {
  mount();
  await screen.findByRole('option', { name: /run-1/ });
  fireEvent.change(screen.getByLabelText('Saved package runs'), { target: { value: 'run-1' } });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submission-orchestrator/runs/run-1', undefined));
});
it('starts from the selected program and exposes missing source inputs', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Build package run' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/runs/for-program', { programId: PROGRAM }));
  await screen.findByText('No nonclinical study corpus is linked to this canonical program.');
});
it('forwards the real signature ceremony then offers continuation retry without a second signature', async () => {
  mount();
  await chooseRun('run-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Sign package release' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm package signature' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submissions/submission-1/sign-release', { runId: 'run-1', password: 'test-credential', mfaToken: '123456', signatureMeaning: 'approval', reason: 'Reviewed exact package' }));
  await screen.findByText(/Signature #42 is recorded.*continuation needs retry/i);
  await waitFor(() => expect(sign).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Close package signature' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry continuation' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submission-orchestrator/runs/run-1/resume', {}));
  expect(apiRequest.mock.calls.filter(([, path]) => path.endsWith('/sign-release'))).toHaveLength(1);
});
it('reports discovery failure instead of an empty run history', async () => {
  apiRequest.mockImplementation(async () => { throw new Error('Offline'); });
  mount();
  await screen.findByText(/Couldn’t load saved package runs/);
  expect(screen.queryByText('No saved package runs')).toBeNull();
});
it('keeps the latest selected run and excludes late audit and signature results from a previous run', async () => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.includes('?programId=')) return ok({ runs: [run, { ...run, runId: 'run-2' }] });
    if (path === '/api/submission-orchestrator/runs/run-1') { await delayed; return ok({ ...run, applicationNumber: 'IND111111' }); }
    if (path === '/api/submission-orchestrator/runs/run-1/audit') { await delayed; return ok({ events: [{ stepKey: 'previous-run-only', eventType: 'completed', status: 'complete', occurredAt: run.startedAt }] }); }
    if (path === '/api/ectd/export/by-run/run-1/signed') { await delayed; return ok({ signature: { signatureId: 11, payloadDigest: 'previous-digest', sealVerdict: 'verified' }, leaves: [] }); }
    if (path === '/api/submission-orchestrator/runs/run-2') return ok({ ...run, runId: 'run-2', applicationNumber: 'IND222222' });
    return original(method, path, body);
  });
  mount();
  const selector = await screen.findByLabelText('Saved package runs');
  await screen.findByRole('option', { name: /run-2/ });
  fireEvent.change(selector, { target: { value: 'run-1' } });
  fireEvent.change(selector, { target: { value: 'run-2' } });
  await screen.findByText(/IND222222/);
  await act(async () => { release(); await delayed; });
  expect(screen.queryByText(/IND111111/)).toBeNull();
  expect(screen.queryByText('previous-run-only')).toBeNull();
  expect(screen.queryByText('#11')).toBeNull();
});
it('clears the former program run before a delayed response can become a signing target', async () => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path === '/api/submission-orchestrator/runs/run-1') { await delayed; return ok(run); }
    return original(method, path, body);
  });
  const view = mount();
  await chooseRun('run-1');
  (window as any).C2C_PROJECT = { id: '9a7f0b10-0000-4000-8000-0000000000bb', title: 'Other program' };
  view.rerender(<EctdCompile {...({ onAsk: vi.fn() } as unknown as SurfaceViewProps)} />);
  await act(async () => { release(); await delayed; });
  expect(screen.queryByRole('button', { name: 'Sign package release' })).toBeNull();
});
it('retains the recorded signature notice while the refreshed run is still loading', async () => {
  let signed = false;
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.endsWith('/sign-release')) { signed = true; return original(method, path, body); }
    if (signed && path === '/api/submission-orchestrator/runs/run-1') { await delayed; return ok(run); }
    return original(method, path, body);
  });
  mount();
  await chooseRun('run-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Sign package release' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm package signature' }));
  try {
    await screen.findByText(/Signature #42 is recorded.*continuation needs retry/i);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Signature #42 is recorded.*continuation needs retry/i)).toBeTruthy();
  } finally {
    await act(async () => { release(); await delayed; });
  }
});
it('fences run changes throughout the signature ceremony and a delayed signing write', async () => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.endsWith('/sign-release')) { await delayed; return original(method, path, body); }
    return original(method, path, body);
  });
  mount();
  await chooseRun('run-1');
  fireEvent.click(await screen.findByRole('button', { name: 'Sign package release' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm package signature' }));
  try {
    expect((screen.getByLabelText('Saved package runs') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText('Orchestrator run id') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Load run/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Build package run|Working/ }) as HTMLButtonElement).disabled).toBe(true);
  } finally {
    await act(async () => { release(); await delayed; });
  }
});

it('does not let failed-discovery retry close a signature ceremony or release its delayed-write fence', async () => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const original = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method, path, body) => {
    if (path.startsWith('/api/submission-orchestrator/runs?programId=')) throw new Error('Saved-run discovery unavailable');
    if (path.endsWith('/sign-release')) { await delayed; return original(method, path, body); }
    return original(method, path, body);
  });
  mount();
  await screen.findByText(/Couldn’t load saved package runs/);
  fireEvent.change(screen.getByLabelText('Orchestrator run id'), { target: { value: run.runId } });
  fireEvent.click(screen.getByRole('button', { name: /Load run/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign package release' }));
  const retry = screen.getByRole('button', { name: 'Retry saved runs' }) as HTMLButtonElement;
  expect(retry.disabled).toBe(true);
  fireEvent.click(retry);
  expect(screen.getByRole('button', { name: 'Confirm package signature' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm package signature' }));
  try {
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submissions/submission-1/sign-release', expect.objectContaining({ runId: run.runId })));
    expect(retry.disabled).toBe(true);
    fireEvent.click(retry);
    expect(screen.getByRole('button', { name: 'Close package signature' })).toBeTruthy();
    expect((screen.getByLabelText('Orchestrator run id') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Load run/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Build package run|Working/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.filter(([, path]) => path.startsWith('/api/submission-orchestrator/runs?programId='))).toHaveLength(1);
  } finally {
    await act(async () => { release(); await delayed; });
  }
});
