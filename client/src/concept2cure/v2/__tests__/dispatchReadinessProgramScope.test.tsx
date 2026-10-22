// @vitest-environment jsdom
/**
 * DispatchReadiness — gates the OPEN PROJECT's markets, never the
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
 * The first fix walked the organisation's unscoped list on the client and kept
 * the submission of the program's type that RECORDS the program (LX-22,
 * P-20 follow-up: never by name). F18 (2026-10-22) moved that rule to where
 * it belongs: the screen reads the server's project scope,
 * GET /api/submissions?programId=<uuid>, and lists every market in it — an
 * MAA beside the IND is gated too. The organisation's unscoped list is never
 * read, so a same-named submission of another project, or one with no
 * project recorded, cannot reach the screen. These tests serve those on the
 * unscoped list as traps.
 *
 * Every state that is not "this project's markets" is rendered as itself: no
 * project open, the project unreadable, no market, no sequence on a market,
 * the list unreadable.
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
const ok = (payload: unknown, meta?: Record<string, unknown>) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data: payload, ...(meta ? { meta } : {}) }) } as Response);
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

const row = (over: Record<string, unknown>) => ({
  title: 'OQ-005 Readiness program', productName: null, applicationType: 'ind', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', ...over,
});
/* The open program's submission: the server's scope returns it. */
const MINE = row({ id: 5, programId: PROGRAM_UUID });
/* Traps, served only on the organisation's unscoped list: another program's
   newer submission, a same-named one of another project, and a same-named one
   with no project recorded. */
const OTHER = row({ id: 3, title: 'Other program NDA', applicationType: 'nda', programId: '7c1d5e0a-3b2f-4e61-9a8c-5d4f3e2b1a09' });
const MINE_UNANCHORED = row({ id: 8, programId: null });

function serve(opts: { scoped?: unknown[]; mySequences?: unknown[]; failList?: boolean; failProgram?: boolean } = {}) {
  apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url === `/api/c2c/projects/${PROGRAM_UUID}`) {
      if (opts.failProgram) throw Object.assign(new Error('Server error'), { status: 500 });
      return bare(PROGRAM);
    }
    if (url === `/api/submissions?programId=${PROGRAM_UUID}`) {
      if (opts.failList) throw Object.assign(new Error('Server error'), { status: 500 });
      return ok(opts.scoped ?? [MINE]);
    }
    if (url === '/api/submissions') return ok([OTHER, MINE_UNANCHORED, MINE]);
    if (url === '/api/submissions/3/sequences') return ok([{ id: 7, sequenceNumber: '0000' }]);
    if (url === '/api/submissions/8/sequences') return ok([{ id: 11, sequenceNumber: '0000' }]);
    if (url === '/api/submissions/5/sequences') return ok(opts.mySequences ?? [{ id: 9, sequenceNumber: '0000' }]);
    const m = /\/api\/submissions\/sequences\/(\d+)\/dispatch-readiness$/.exec(url);
    if (m) return ok(assessment(Number(m[1])));
    return ok([]);
  });
}

const props = () =>
  ({ surface: { id: 'dispatch-readiness', label: 'Dispatch' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });
const text = () => document.body.textContent ?? '';
const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('DispatchReadiness — the project’s markets are the server’s project scope (F-8, LX-22, F18)', () => {
  it('gates the open project’s sequence, not the organisation’s first submission', async () => {
    serve();
    render(<DispatchReadiness {...props()} />);
    // The sequence NUMBER (what OQ-SRDY-07 and a regulatory user look for), on
    // the project's market, with the project named.
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked · 1 blocker/));
    expect(text()).toMatch(/Sequence 0000/);
    expect(text()).toMatch(/OQ-005 Readiness program/);
    expect(urls()).toContain('/api/submissions/sequences/9/dispatch-readiness');
    // Pre-fix: subs[0] → submission 3 → sequence 7, another program's filing.
    expect(urls()).not.toContain('/api/submissions/sequences/7/dispatch-readiness');
    expect(text()).not.toContain('Other program NDA');
  });

  it('never reads the organisation’s unscoped list, so a same-named submission with no project recorded never reaches it', async () => {
    serve();
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    expect(urls()).not.toContain('/api/submissions');
    expect(urls()).not.toContain('/api/submissions/8/sequences');
    expect(urls()).not.toContain('/api/submissions/sequences/11/dispatch-readiness');
    expect(document.querySelectorAll('[data-market]')).toHaveLength(1);
  });

  it('a project with no market says so and gates nothing, even when the organisation has same-named submissions', async () => {
    serve({ scoped: [] });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/No market for this project yet/));
    expect(text()).toContain("Add one from the project's Submit tab.");
    // The unscoped list holds a same-named submission with no project; it is
    // never offered, and the screen names none.
    expect(text()).not.toContain('Other program NDA');
    expect(urls().some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });

  it('a market with no sequence yet says so, and its gate is not read', async () => {
    serve({ mySequences: [] });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/No sequence yet/));
    expect(text()).toMatch(/OQ-005 Readiness program/);
    expect(urls().some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });

  it('with no project open nothing is read and nothing is gated', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    serve();
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Open a project to see its markets/));
    expect(urls().some((u) => u.startsWith('/api/submissions'))).toBe(false);
  });

  it('a failed list read is an error, not an empty state', async () => {
    serve({ failList: true });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn't load this project's markets/));
    // Pre-fix: a failed /api/submissions read silently rendered "No submission
    // sequence to gate yet" — an error shown as an empty result.
    expect(text()).not.toMatch(/No market for this project yet/);
    expect(text()).not.toMatch(/Cleared to dispatch(?!\?)/);
  });

  it('a project that cannot be read is an error, and no market or verdict is shown', async () => {
    serve({ failProgram: true });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn't read this project/));
    expect(text()).toMatch(/whether it has markets is not stated/);
    expect(document.querySelectorAll('[data-market]')).toHaveLength(0);
    expect(text()).not.toMatch(/Dispatch blocked|Cleared to dispatch(?!\?)/);
  });

  it('the list is never "no market" before it has been read', async () => {
    let answer: (r: Response) => void = () => {};
    apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
      const url = String(rawUrl ?? '');
      if (url === `/api/c2c/projects/${PROGRAM_UUID}`) return bare(PROGRAM);
      if (url === `/api/submissions?programId=${PROGRAM_UUID}`) return new Promise<Response>((r) => { answer = r; });
      return ok([]);
    });
    render(<DispatchReadiness {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Loading this project's markets/));
    expect(text()).not.toMatch(/No market for this project yet/);
    answer(ok([], { notOffered: 0 }));
    await waitFor(() => expect(text()).toMatch(/No market for this project yet/));
  });
});
