// @vitest-environment jsdom
/**
 * DispatchWorkspace — nothing on the Dispatch tab says "permitted" under a
 * blocked gate.
 *
 * `shadowReviewMissing` is a hard blocker merged into the gate, so the note it
 * drives only ever rendered beneath "Dispatch blocked" — while saying the gate
 * was clear and dispatch permitted. And the AI advisory's "cleared to dispatch"
 * is floored on the structural gate only, so it could sit green under the same
 * blocked gate with no qualifier. Revert-proven: both cases fail with the
 * fixes removed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = { id: 7, sequenceNumber: '0001', type: 'original', status: 'validated', region: 'fda', validationStatus: null };
const SUB = { id: 3, title: 'NDA 2026', primaryRegion: 'fda' };

const BLOCKED = {
  sequenceId: 7, region: 'fda', sequenceStatus: 'validated', validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 0, shadowReviewMissing: true,
  gate: { cleared: false, blockers: ['No completed Shadow Review has run for this sequence'] },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 4,
};

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) } as Response);

function serve(qc: unknown) {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url.endsWith('/dispatch-readiness')) return ok(BLOCKED);
    if (url.endsWith('/leaves')) return ok([{ id: 1, sectionCode: 'm1-1.3', title: 'Cover', granularity: null, lifecycleOp: 'new', documentTable: null, documentId: null, documentType: null }]);
    // mutateVerbatim passes the body through raw — no envelope.
    if (method === 'POST' && url.endsWith('/dispatch-qc')) return { ok: true, status: 200, json: async () => qc } as Response;
    return ok([]);
  });
}

const text = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('DispatchWorkspace — nothing says "permitted" under a blocked gate', () => {
  it('the missing-shadow-review note is the reason the gate blocks, not a permission', async () => {
    serve({ clearedToDispatch: false, blockers: [], warnings: [], checklist: [] });
    render(<DispatchWorkspace {...({ sub: SUB, seq: SEQ, onGoverned: vi.fn() } as any)} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    expect(text()).toMatch(/one of the reasons the gate blocks/);
    expect(text()).not.toMatch(/dispatch is permitted/);
    expect(text()).not.toMatch(/The gate is clear/);
  });

  it('a "cleared" AI advisory under a blocked gate is not green and says the gate decides', async () => {
    serve({ clearedToDispatch: true, blockers: [], warnings: [], checklist: [{ item: 'Forms present', pass: true }] });
    render(<DispatchWorkspace {...({ sub: SUB, seq: SEQ, onGoverned: vi.fn() } as any)} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(screen.getByRole('button', { name: /Run dispatch QC/ }));
    await waitFor(() => expect(text()).toMatch(/QC advisory: cleared to dispatch/));
    expect(text()).toMatch(/deterministic gate above still blocks dispatch/);
    const verdict = Array.from(document.querySelectorAll('.sc-verdict')).find((el) => /QC advisory/.test(el.textContent ?? ''))!;
    expect(verdict.className).not.toMatch(/tone-ok/);
    // The advisory was posted with the sequence's REAL leaves, not [].
    const post = apiRequest.mock.calls.find((c) => c[0] === 'POST' && String(c[1]).endsWith('/dispatch-qc'));
    expect((post![2] as any).leaves).toEqual([{ sectionCode: 'm1-1.3', operation: 'new' }]);
  });
});
