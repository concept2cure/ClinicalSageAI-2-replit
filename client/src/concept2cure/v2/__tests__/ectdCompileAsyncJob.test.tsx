// @vitest-environment jsdom
/**
 * The compile screen asks for an answer at once and follows the job (MR-03 Stage 6 step 6, OPS-17).
 *
 * Behind CloudFront a compile that takes a minute is cut at 60 s; a 200-leaf
 * IND compiled in about that (docs/evidence/D1/2026-11-12-edge-timeouts/). The
 * screen now sends `Prefer: respond-async`, and on 202 polls the job every 2 s,
 * showing how long it has run, until it ends. The result renders as a
 * synchronous one did; a failed job or an unreadable poll is an error toast,
 * never an empty result.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { ok, STATUS, COMPILE, props } from './ectdCompile.fixtures';

const JOB = 'rjob_1762900000000_0123456789abcdef';
const JOB_URL = `/api/ectd-compile/42/jobs/${JOB}`;
let polls: Array<() => Response> = [];

function serve() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok({ jobId: JOB, status: 'running' }, 202);
    if (method === 'GET' && url === JOB_URL) return (polls.shift() ?? (() => ok({ jobId: JOB, status: 'running' })))();
    return ok({});
  });
}

async function startCompile() {
  (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123' };
  render(<EctdCompile {...props()} />);
  await screen.findByText('Module 3 — Quality');
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
  await act(async () => { await Promise.resolve(); });
}
const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  apiRequest.mockReset();
  polls = [];
  serve();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('EctdCompile follows a compile job', () => {
  it('asks to be answered at once', async () => {
    await startCompile();
    const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/ectd-compile/42/compile');
    expect(call?.[3]).toEqual({ Prefer: 'respond-async' });
  });

  it('polls every 2 s, shows how long it has run, and renders the result when the job completes', async () => {
    polls = [() => ok({ jobId: JOB, status: 'running' }), () => ok({ jobId: JOB, status: 'running' }), () => ok({ jobId: JOB, status: 'completed', result: COMPILE })];
    await startCompile();
    await tick(2000);
    expect(screen.getByRole('button', { name: /Compiling… 2 s/ })).toBeTruthy();
    await tick(2000);
    expect(screen.getByRole('button', { name: /Compiling… 4 s/ })).toBeTruthy();
    await tick(2000);
    vi.useRealTimers();
    expect(await screen.findByText(/Compilation complete/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download eCTD backbone/ })).toBeTruthy();
    expect(apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === JOB_URL)).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Compile eCTD/ })).toBeTruthy();
  });

  it("a failed job is said in the job's words, and nothing renders as a result", async () => {
    polls = [() => ok({ jobId: JOB, status: 'failed', error: `The compile failed on the server and was not recorded. Reference ${JOB}.` })];
    await startCompile();
    await tick(2000);
    vi.useRealTimers();
    expect(await screen.findByText(`The compile failed on the server and was not recorded. Reference ${JOB}.`)).toBeTruthy();
    expect(screen.queryByText(/Compilation complete/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Download eCTD backbone/ })).toBeNull();
  });

  it('a poll that cannot be read is an error that says the compile may still finish, not an empty result', async () => {
    polls = [() => ok({ error: { code: 'INTERNAL', message: 'Request failed.' } }, 500)];
    await startCompile();
    await tick(2000);
    vi.useRealTimers();
    expect(await screen.findByText(/The compile's progress could not be read \(HTTP 500\)\. It may still finish/)).toBeTruthy();
    expect(screen.queryByText(/Compilation complete/)).toBeNull();
  });

  it('a server that answers at once is rendered as before', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(STATUS);
      if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(COMPILE);
      return ok({});
    });
    (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123' };
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');
    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
    expect(await screen.findByText(/Compilation complete/)).toBeTruthy();
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => String(c[1]).includes('/jobs/'))).toBe(false));
  });
});
