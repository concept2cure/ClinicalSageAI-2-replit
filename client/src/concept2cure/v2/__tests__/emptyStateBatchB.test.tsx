// @vitest-environment jsdom
/**
 * "Run #N recorded no findings." is a claim about what a shadow-review RUN
 * produced, and it may only be made about a run that finished.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The shadow-review panel chose that sentence on one condition: the findings
 * read settled with zero rows.
 *
 *   ) : findings.empty ? (
 *     <div className="scaf-note">Run #{run.id} recorded no findings.</div>
 *   ) : (
 *
 * `findings.empty` is honest about the READ — `useLiveRows` sets it only when
 * the request neither errored nor is in flight — so loading and failure were
 * already handled above it. What it says nothing about is the RUN.
 *
 * `runShadowReview` (server/services/shadow-review/shadow-review-service.ts)
 * INSERTS the run row with status 'running' before the reviewer is called, and
 * updates it to 'failed' — having written no finding rows at all — when that
 * call does not return a usable answer. Findings are inserted only on the way
 * to status 'complete'. So a run that is still executing and a run that aborted
 * both hold exactly zero findings, and both reached this branch.
 *
 * The runs list is newest-first and the panel selects `runs.rows[0]` by
 * default, so the run auto-shown is precisely the one most likely to be in
 * flight or to have just failed. A regulatory director opening the sequence
 * after a failed shadow review read "Run #12 recorded no findings" — a clean
 * validation over a review that never happened.
 *
 * ── The evidence clearance is now gated on ───────────────────────────────────
 * The run's own recorded completion (`run.status === 'complete'`), passed as
 * `assessmentRan` to assessmentState.ts. It is deliberately not derived from
 * the emptiness that produced the bug: a complete run can hold findings or hold
 * none, and those remain different states — which case four asserts, because a
 * fix that simply never reassures would destroy the panel's purpose.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  serverMessage: () => null,
  extractApiError: () => null,
  errorCodeOf: () => null,
}));

import { ShadowReviewWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = {
  id: 7,
  sequenceNumber: '0001',
  type: 'original',
  status: 'assembling',
  region: 'fda',
  validationStatus: null,
};

/** A run row as `listShadowReviewRuns` returns it, at whichever status. */
const runRow = (status: string) => ({
  id: 12,
  sequenceId: 7,
  region: 'fda',
  lens: 'fda_filing',
  status,
  rtfRiskScore: null,
  crlRiskScore: null,
  summary: null,
  createdAt: '2026-08-20T10:00:00.000Z',
});

/**
 * A finding row, complete rather than minimal: the panel renders the row
 * itself, so a partial fixture would make the component throw and the test
 * would be measuring the fixture rather than the gate.
 */
const FINDING = {
  id: 501,
  runId: 12,
  dimension: 'rtf',
  severity: 'major',
  title: 'Module 1.3 cover letter is absent from the sequence',
  detail: 'No leaf is mapped to 1.3 in this sequence.',
  basis: 'eCTD regional requirement',
  recommendation: 'Map the cover letter leaf before dispatch.',
  leafRef: 'm1-1.3',
  status: 'open',
};

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data: payload }),
});

/** Answer the two GETs this panel makes: the run list, then that run's findings. */
function serve(runs: unknown[], findings: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    String(url).includes('/findings') ? ok(findings) : ok(runs),
  );
}

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

const renderPanel = () =>
  render(<ShadowReviewWorkspace {...({ seq: SEQ } as any)} />);

const body = () => document.body.textContent ?? '';

/**
 * Wait for BOTH reads to settle before asserting.
 *
 * The run row appears when the runs read resolves; the findings panel below it
 * is still showing its loading line for another tick. Asserting on the absence
 * of a sentence is only meaningful once the panel has actually chosen a branch,
 * so the assertions that name the defect run after this — not inside a
 * `waitFor`, which would let a timeout stand in for the real failure.
 */
async function settled() {
  await waitFor(() => expect(screen.getByText('#12')).toBeTruthy());
  await waitFor(() => expect(/Loading run/i.test(body())).toBe(false));
}

describe('Shadow review — an empty findings list is not a clean review', () => {
  it('does not report a clean run when the run FAILED', async () => {
    serve([runRow('failed')], []);
    renderPanel();
    await settled();

    expect(
      /recorded no findings/i.test(body()),
      'a FAILED run holds zero findings because the review never got as far as recording any; it must not be reported as a run that recorded none',
    ).toBe(false);
    expect(screen.getByText(/did not complete, so no findings were recorded/i)).toBeTruthy();
    expect(/the absence of a review, not a clear one/i.test(body())).toBe(true);
  });

  it('does not report a clean run while the run is STILL RUNNING', async () => {
    serve([runRow('running')], []);
    renderPanel();
    await settled();

    expect(
      /recorded no findings/i.test(body()),
      'a RUNNING run has not written its findings yet; it must not be reported as a run that recorded none',
    ).toBe(false);
    expect(screen.getByText(/still running, so it holds no findings yet/i)).toBeTruthy();
    expect(/the absence of a result, not a clear one/i.test(body())).toBe(true);
  });

  /* The over-correction guard. Cases one and two would also pass if the panel
     had simply stopped reassuring, which would remove the only answer a clean
     shadow review is entitled to give. A COMPLETE run with zero findings is
     that answer, and it must still be reachable. */
  it('still reports a clean run when a COMPLETE run recorded nothing', async () => {
    serve([runRow('complete')], []);
    renderPanel();
    await settled();

    expect(screen.getByText(/Run #12 recorded no findings\./i)).toBeTruthy();
    expect(/did not complete/i.test(body())).toBe(false);
    expect(/still running/i.test(body())).toBe(false);
  });

  /* And a complete run WITH findings still lists them — the clean sentence is
     gated on completion, not substituted for the findings list. */
  it('lists the findings of a complete run and claims no clearance', async () => {
    serve([runRow('complete')], [FINDING]);
    renderPanel();
    await settled();

    expect(screen.getByText(/cover letter is absent from the sequence/i)).toBeTruthy();
    expect(/recorded no findings/i.test(body())).toBe(false);
  });
});
