// @vitest-environment jsdom
/**
 * The test package asks for an answer at once and follows the job (MR-03 Stage 6 step 6, OPS-17).
 *
 * Assembling a 200-leaf IND took about a minute
 * (docs/evidence/D1/2026-11-12-edge-timeouts/), and CloudFront cuts a request
 * at 60 s. The Dispatch tab's "Assemble a test package" now sends
 * `Prefer: respond-async`, and on 202 polls the job every 2 s, showing how long
 * it has run. The job holds the route's answer, its status and body, and each
 * renders as the synchronous answer did: the result, a refusal with its audit
 * outcome, or "could not be confirmed" for a failed job or an unreadable poll.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = { id: 7, sequenceNumber: '0001', type: 'amendment', status: 'validated', region: 'fda', validationStatus: 'passed' };
const SUB = { id: 5, title: 'ZX-9 First-in-Human', applicationType: 'ind', primaryRegion: 'fda', programId: null };
const READINESS = {
  sequenceId: 7, region: 'fda', sequenceStatus: 'validated', validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
  gate: { cleared: false, blockers: ['A 21 CFR Part 11 release signature is required.'] },
  freezeGate: { cleared: false, blockers: ['A 21 CFR Part 11 release signature is required.'] },
  dispatchGateOnSigning: { cleared: false, blockers: ['A 21 CFR Part 11 release signature is required.'] },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 3,
  signer: { state: 'independent', sources: [] },
};
const ASSEMBLED = {
  ok: true, dryRun: true, packageProduced: false, format: 'ectd-3.2.2', sizeBytes: 48213, materialized: 200,
  skipped: [], unresolvedLeaves: [], unfinalized: 200,
  transmitBlockers: ['200 leaf document(s) are not approved'], auditTrail: { persisted: true, chained: true },
};
const JOB = 'rjob_1762900000000_0123456789abcdef';
const POLL = `/api/submissions/sequences/7/assemble/jobs/${JOB}`;

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) }) as Response;
const raw = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
let polls: Array<() => Response> = [];

function serve() {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url.endsWith('/dispatch-readiness')) return ok(READINESS);
    if (method === 'POST' && url === '/api/submissions/sequences/7/assemble') return raw({ jobId: JOB, status: 'running', poll: POLL }, 202);
    if (method === 'GET' && url === POLL) return (polls.shift() ?? (() => raw({ jobId: JOB, status: 'running' })))();
    return ok([]);
  });
}
const text = () => document.body.textContent ?? '';

async function startAssembly() {
  render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
  await waitFor(() => expect(text()).toMatch(/Not yet\. /));
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  fireEvent.click(screen.getByRole('button', { name: /Assemble a test package/ }));
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
});

describe('Dispatch tab: the test package follows its job', () => {
  it('asks to be answered at once', async () => {
    await startAssembly();
    const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && String(c[1]).endsWith('/assemble'));
    expect(call?.[3]).toEqual({ Prefer: 'respond-async' });
  });

  it('polls every 2 s, shows how long it has run, and renders the answer when the job completes', async () => {
    polls = [() => raw({ jobId: JOB, status: 'running' }), () => raw({ jobId: JOB, status: 'completed', result: { status: 200, body: ASSEMBLED } })];
    await startAssembly();
    await tick(2000);
    expect((screen.getByRole('button', { name: /Assembling the test package… 2 s/ }) as HTMLButtonElement).disabled).toBe(true);
    await tick(2000);
    vi.useRealTimers();
    await waitFor(() => expect(text()).toMatch(/Test package for sequence 0001 assembled and discarded/));
    expect(text()).toContain('200 leaf document(s) are not approved');
    expect(text()).toMatch(/200 leaves materialized/);
    expect(apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === POLL)).toHaveLength(2);
  });

  it('a refusal the job holds is shown as the refusal, in the server words, with its audit outcome', async () => {
    polls = [() => raw({ jobId: JOB, status: 'completed', result: { status: 422, body: {
      error: { code: 'ECTD_ASSEMBLE_BLOCKED', message: 'A nonclinical study report is tagged "pre-clinical-study-report". Correct it in Submission Center, Builder, Edit study tagging.' },
      auditTrail: { persisted: false, message: 'The refusal audit entry could not be written.' },
    } } })];
    await startAssembly();
    await tick(2000);
    vi.useRealTimers();
    await waitFor(() => expect(text()).toMatch(/No test package was assembled/));
    expect(text()).toContain('Correct it in Submission Center, Builder, Edit study tagging');
    expect(text()).toContain('The refusal audit entry could not be written.');
    expect(text()).not.toMatch(/assembled and discarded/);
  });

  it('a failed job is "could not be confirmed", in the job words', async () => {
    polls = [() => raw({ jobId: JOB, status: 'failed', error: `The test package could not be assembled on the server. Reference ${JOB}.` })];
    await startAssembly();
    await tick(2000);
    vi.useRealTimers();
    await waitFor(() => expect(text()).toMatch(/Whether the test package was assembled could not be confirmed/));
    expect(text()).toContain(`Reference ${JOB}`);
    expect(text()).not.toMatch(/No test package was assembled/);
  });

  it('a poll that cannot be read is "could not be confirmed", never "not assembled"', async () => {
    polls = [() => raw({ error: { code: 'INTERNAL', message: 'Request failed.' } }, 500)];
    await startAssembly();
    await tick(2000);
    vi.useRealTimers();
    await waitFor(() => expect(text()).toMatch(/Whether the test package was assembled could not be confirmed/));
    expect(text()).toMatch(/its progress could not be read \(HTTP 500\)/);
    expect(text()).not.toMatch(/No test package was assembled/);
  });
});
