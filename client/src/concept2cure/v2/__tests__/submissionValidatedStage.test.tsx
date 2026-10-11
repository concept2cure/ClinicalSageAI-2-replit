// @vitest-environment jsdom
/**
 * A stored Validated stage says when the validation no longer supports it
 * (QA 2026-10-08, j7 finding 20).
 *
 * Vorelinib sequence 0000 read "0000 original — VALIDATED" in the Sequences
 * list and the working-sequence picker while the Validation tab counted its
 * findings and the Dispatch tab showed the gate blocked. The stage was stored
 * before 0e50993c5 made Validated a claim the validation must support (a
 * recorded 'passed' verdict, reverted by any leaf change), so it carried no
 * verdict, and its validation now finds errors. The server answers whether the
 * stored stage still holds (assess-dispatch-readiness validatedStageOf); every
 * surface that shows the stage shows that answer.
 *
 * Same idiom as submissionCenterLifecycleQa: apiRequest mocked at the module
 * boundary.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { DispatchReadiness } from '../surfaces/DispatchReadiness';

const SUBS = [{ id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' }];
const seqRow = (over: Record<string, unknown> = {}) => ({ id: 21, sequenceNumber: '0000', type: 'original', status: 'validated', region: 'fda', validationStatus: 'passed', ...over });
const CLEAR = { cleared: true, blockers: [] };
const STALE_REASON =
  'Sequence 0000 is recorded as Validated, but its validation now finds 8 errors, and no validation verdict was recorded when it was marked. ' +
  'Validated means the validation found no error: return it to Assembling, resolve the errors and validate again. Freeze refuses it until then.';
const readiness = (over: Record<string, unknown> = {}) => ({
  sequenceId: 21, region: 'fda', sequenceStatus: 'validated', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 6, signer: { state: 'independent', sources: [] },
  validatedStage: { holds: true, verdictRecorded: true }, ...over,
});
const STALE = readiness({
  validationErrors: 8,
  gate: { cleared: false, blockers: ['8 open error-severity validation finding(s) must be resolved before dispatch.'] },
  freezeGate: { cleared: false, blockers: ['8 open error-severity validation finding(s) must be resolved before dispatch.'] },
  readiness: { errors: 8, warnings: 3, infos: 0, findings: [] },
  validatedStage: { holds: false, verdictRecorded: false, errors: 8, reason: STALE_REASON },
});
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body, headers: new Headers() }) as unknown as Response;

let seqs = [seqRow()];
let assessment: unknown = readiness();
function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return ok(seqs);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') return ok(assessment);
    return ok([]);
  });
}
const openWorkspace = (label: string) => fireEvent.click(screen.getByRole('tab', { name: label }));
async function ready() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
}

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  seqs = [seqRow()];
  assessment = readiness();
  mockApi();
});

describe('Submission Center: the stored Validated stage and the current validation agree', () => {
  it('a Validated stage stored with no verdict says so in the Sequences list and the working-sequence picker', async () => {
    seqs = [seqRow({ validationStatus: null })];
    assessment = STALE;
    await ready();
    openWorkspace('Sequences');
    await waitFor(() => expect(document.querySelector('[data-validated-stage="unrecorded"]')?.textContent).toBe('no validation recorded'));
    openWorkspace('Validation');
    const picker = (await screen.findByLabelText('Working sequence')) as HTMLSelectElement;
    expect(picker.options[0].textContent).toBe('0000 · original · Validated (no validation recorded)');
  });

  it('the Validation and Dispatch tabs carry the server\'s reason when the stage no longer holds', async () => {
    seqs = [seqRow({ validationStatus: null })];
    assessment = STALE;
    await ready();
    openWorkspace('Validation');
    await waitFor(() => expect(document.querySelector('[data-validated-stage="stale"]')?.textContent).toBe(STALE_REASON));
    openWorkspace('Dispatch');
    await waitFor(() => expect(document.querySelector('[data-validated-stage="stale"]')?.textContent).toBe(STALE_REASON));
    expect(document.body.textContent).toContain('status Validated (no validation recorded)');
  });

  it('a stage the validation supports reads plainly, with no note', async () => {
    await ready();
    openWorkspace('Validation');
    const picker = (await screen.findByLabelText('Working sequence')) as HTMLSelectElement;
    expect(picker.options[0].textContent).toBe('0000 · original · Validated');
    await waitFor(() => expect(document.body.textContent).toContain('computed server-side from the canonical leaves'));
    expect(document.querySelector('[data-validated-stage]')).toBeNull();
  });
});

describe('Dispatch readiness surface: the same answer', () => {
  const PROGRAM_UUID = '5b1c2d3e-0000-4000-8000-000000000001';
  beforeEach(() => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
    apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
      const url = String(rawUrl ?? '');
      const wrap = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) }) as Response;
      if (url === `/api/c2c/projects/${PROGRAM_UUID}`) {
        return { ok: true, status: 200, json: async () => ({ id: PROGRAM_UUID, name: 'Zexanib IND', code: 'ZX-9', product_name: null, program_type: 'ind' }) } as Response;
      }
      if (url === '/api/submissions') return wrap([{ id: 3, title: 'Zexanib IND', productName: 'Zexanib IND', applicationType: 'IND', programId: PROGRAM_UUID }]);
      if (url === '/api/submissions/3/sequences') return wrap([{ id: 21, sequenceNumber: '0000' }]);
      if (url.endsWith('/dispatch-readiness')) return wrap(assessment);
      return wrap([]);
    });
  });
  afterEach(() => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  });

  it('names a stored Validated stage the validation no longer supports', async () => {
    assessment = STALE;
    render(<DispatchReadiness {...({ surface: { id: 'dispatch-readiness', label: 'Dispatch' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' } as any)} />);
    await waitFor(() => expect(document.querySelector('[data-validated-stage="stale"]')?.textContent).toBe(` — ${STALE_REASON}`));
    expect(document.body.textContent).toContain(`status validated — ${STALE_REASON}`);
  });
});
