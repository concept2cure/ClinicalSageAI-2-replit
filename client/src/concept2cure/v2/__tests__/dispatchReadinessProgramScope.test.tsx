// @vitest-environment jsdom
/**
 * DispatchReadiness — gates the OPEN PROGRAM's sequence, never the
 * organisation's first submission.
 *
 * ── The defect (VSR-001 F-8, OQ-SRDY-07) ────────────────────────────────────
 * `useLatestSequenceId` read GET /api/submissions and took `subs[0]` — the
 * organisation's most recently updated submission, whichever program it
 * belongs to. With two submissions the surface gated a sequence the user was
 * not looking at, and showed "No submission sequence to gate yet" for a
 * program whose sequence existed. For a transmit gate that is the wrong
 * verdict on the wrong filing.
 *
 * The shell's open program (`readShellProject`, the one reader of
 * window.C2C_PROJECT — the OQ harness seeds it with the id alone) is resolved
 * to its program record, and the program's submission is chosen by the SAME
 * identity convention the server uses to link the two (application type +
 * product_name / name / code vs the submission's product_name / title —
 * server/services/cmc/submission-spine.ts, project-intake.ts). Every state
 * that is not "this program's sequence" is rendered as itself: no program
 * open, no submission for the program, no sequence on it, discovery failed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchReadiness } from '../surfaces/DispatchReadiness';

const PROGRAM_UUID = '1d967acc-d6c5-4b0a-a978-7531b0838215';
const ok = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) } as Response);
const bare = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);

const assessment = (sequenceId: number) => ({
  sequenceId,
  region: 'fda',
  sequenceStatus: 'draft',
  validationErrors: 1,
  unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 0,
  shadowReviewMissing: true,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 1, warnings: 0, infos: 0, findings: [] },
  leafCount: 1,
  gate: { cleared: false, blockers: ['1 open error-severity validation finding.'] },
});

/* The program record as GET /api/c2c/projects/:id returns it (a bare row). */
const PROGRAM = { id: PROGRAM_UUID, name: 'OQ-005 Readiness program', code: 'ORP2-D1BP', product_name: null, program_type: 'ind' };

/* Two submissions in the organisation. `subs[0]` (the newest) belongs to
   ANOTHER program; the open program's spine submission is second, and its
   title is the program name — exactly how intake creates it. */
const OTHER = { id: 3, title: 'Other program NDA', productName: 'Other product', applicationType: 'NDA' };
const MINE = { id: 5, title: 'OQ-005 Readiness program', productName: 'OQ-005 Readiness program', applicationType: 'IND' };

function serve(opts: { mySequences?: unknown[]; subs?: unknown[]; failSubmissions?: boolean } = {}) {
  apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) return bare(PROGRAM);
    if (url === '/api/submissions') {
      if (opts.failSubmissions) throw Object.assign(new Error('Server error'), { status: 500 });
      return ok(opts.subs ?? [OTHER, MINE]);
    }
    if (url === '/api/submissions/3/sequences') return ok([{ id: 7, sequenceNumber: '0000' }]);
    if (url === '/api/submissions/5/sequences') return ok(opts.mySequences ?? [{ id: 9, sequenceNumber: '0000' }]);
    const m = /\/api\/submissions\/sequences\/(\d+)\/dispatch-readiness$/.exec(url);
    if (m) return ok(assessment(Number(m[1])));
    return ok([]);
  });
}

const props = () =>
  ({ surface: { id: 'dispatch-readiness', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('DispatchReadiness — scoped to the open program (F-8)', () => {
  it('gates the open program\'s sequence, not the organisation\'s first submission', async () => {
    serve();
    render(<DispatchReadiness {...props()} />);
    // The sequence NUMBER (what OQ-SRDY-07 and a regulatory user look for),
    // with the row id beside it, and the program it belongs to.
    await waitFor(() => expect(text()).toMatch(/Sequence 0000 \(id 9\)/));
    expect(text()).toMatch(/OQ-005 Readiness program/);
    // Pre-fix: subs[0] → submission 3 → sequence 7, another program's filing.
    expect(text()).not.toMatch(/id 7\b/);
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls).not.toContain('/api/submissions/sequences/7/dispatch-readiness');
    expect(urls).toContain('/api/submissions/sequences/9/dispatch-readiness');
  });

  it('a program whose submission has no sequence yet is an honest empty state — never another program\'s gate', async () => {
    serve({ mySequences: [] });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/no .*sequence/i));
    // Pre-fix: this rendered sequence 7 — the other program's sequence.
    expect(text()).not.toMatch(/id 7\b/);
    expect(text()).toMatch(/OQ-005 Readiness program/);
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls.some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });

  it('a program with no submission at all says so, naming the program', async () => {
    serve({ subs: [OTHER] });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/no submission/i));
    expect(text()).toMatch(/OQ-005 Readiness program/);
    expect(text()).not.toMatch(/id 7\b/);
  });

  it('with no program open the gate is not run against anything', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    serve();
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Open a program/i));
    expect(text()).not.toMatch(/id 7\b/);
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls.some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });

  it('a failed discovery is an error, not an empty state', async () => {
    serve({ failSubmissions: true });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn't compute the dispatch gate/i));
    // Pre-fix: a failed /api/submissions read silently rendered "No submission
    // sequence to gate yet" — an error shown as an empty result.
    expect(text()).not.toMatch(/No submission sequence to gate yet/);
  });
});
