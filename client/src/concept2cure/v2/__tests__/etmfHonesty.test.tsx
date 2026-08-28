// @vitest-environment jsdom
/**
 * The eTMF readiness verdict may not be spoken over another trial's assessment.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * `Etmf` names the trial from an input the user edits, and every sentence in the
 * lead is attributed to that name:
 *
 *   "{tid}'s TMF holds every required essential document across all
 *    {R.summary.zoneCount} DIA Reference-Model zones -- complete on a
 *    completeness basis."
 *   reassure: "Every required document is filed — this is the clean
 *    completeness picture an inspector would see."
 *   secondary: "Live from the trial's filed TMF artifacts."   (no gate at all)
 *
 * `tid` flips SYNCHRONOUSLY on the keystroke; `R` did not. `useLiveData` merges
 * `{ ...s, loading: true }` when its deps change (dataConnect.tsx), which keeps
 * the previous payload — so `R` still held trial A's zone counts, `!R` was the
 * only guard and it was false, and the surface had no `loading` branch at all
 * (the token does not appear in the file at HEAD). The assessed block therefore
 * rendered trial A's numbers under trial B's name for the whole round trip of
 * B's fetch, and this file's first test reproduces exactly that: run against
 * HEAD it fails with
 *
 *   AssertionError: must not call TRIAL-002 complete: expected true to be false
 *
 * over the rendered sentence "TRIAL-002's TMF holds every required essential
 * document across all 8 DIA Reference-Model zones -- complete on a completeness
 * basis", where the 8 zones are TRIAL-001's assessment.
 *
 * For a regulatory director this is the worst available failure on this screen:
 * INSPECTION-READY, over a trial whose TMF has not been read.
 *
 * ── What the tests below pin ─────────────────────────────────────────────────
 *   1. the carry-over window says READING, not complete                (findings 1,2,3)
 *   2. a previous trial's FAILED read is not attributed to the new one (same mechanism)
 *   3. a payload with a zero reference-model denominator is NOT-ASSESSED,
 *      not "complete across all 0 zones"                              (assessmentRan)
 *   4. OVER-CORRECTION GUARD: a genuinely complete trial still reads
 *      complete, still reassures, still shows INSPECTION-READY
 *   5. the gap verdict still names the real counts                    (finding 4)
 *   6. the source contract for the one window a rendered test cannot see —
 *      see the comment on that test for why it is the exception here
 *
 * One through five are behavioural: they drive the real input and read the real
 * DOM. The only fixture is the completeness payload the endpoint would return,
 * which is the thing under test rather than a stand-in for it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Etmf } from '../surfaces/Etmf';

/* ---- The payloads GET /api/etmf/trials/:id/completeness returns ---- */

function completeZone(n: number) {
  const codes = ['z' + n + '_a', 'z' + n + '_b'];
  return { number: n, name: 'Zone ' + n, required: codes, present: codes, missing: [], complete: true };
}

/** Eight zones, every required artifact filed — the genuinely clean trial. */
const READY = {
  ready: true,
  scope: 'essential',
  zones: [1, 2, 3, 4, 5, 6, 7, 8].map(completeZone),
  summary: { zoneCount: 8, zonesComplete: 8, totalRequired: 16, totalMissing: 0 },
};

/** Same file with two essentials open in zone 2. */
const GAPPY = {
  ready: false,
  scope: 'essential',
  zones: [
    completeZone(1),
    { number: 2, name: 'Central Trial Documents', required: ['protocol', 'sample_icf'], present: [], missing: ['protocol', 'sample_icf'], complete: false },
    ...[3, 4, 5, 6, 7, 8].map(completeZone),
  ],
  summary: { zoneCount: 8, zonesComplete: 7, totalRequired: 16, totalMissing: 2 },
};

/**
 * A settled 200 that evaluated nothing: no zones, no required artifacts — and
 * `ready: true`, because zero missing out of zero required is vacuously
 * complete. This is the payload that used to produce "holds every required
 * essential document across all 0 DIA Reference-Model zones -- complete".
 */
const VACUOUS = {
  ready: true,
  scope: 'essential',
  zones: [],
  summary: { zoneCount: 0, zonesComplete: 0, totalRequired: 0, totalMissing: 0 },
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const fail = () => ({ ok: false, status: 503, json: async () => ({}) });
/** A completeness read that never lands — the fetch window, held open. */
const pending = () => new Promise<never>(() => {});

function mount() {
  render(<Etmf {...({ surface: { id: 'etmf' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);
}

function nameTrial(id: string) {
  fireEvent.change(screen.getByLabelText('Trial identifier'), { target: { value: id } });
}

const text = () => document.body.textContent ?? '';

/** The three sentences the finding is about, as the reader sees them. */
const COMPLETE_CLAIM = /TMF holds every required essential document across all \d+ DIA Reference-Model zones/i;
const REASSURE = /Every required document is filed/i;
const LIVENESS = /live from .*filed TMF artifacts/i;

// Braces, not a concise body: a concise arrow RETURNS the mock function, and
// vitest treats a function returned from a hook as a teardown callback — it
// would then be invoked at teardown and, in the tests that hold a fetch open,
// awaited forever.
beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => { cleanup(); });

describe('eTMF — a readiness verdict belongs to the trial it was computed for', () => {
  it('does not carry the previous trial\'s complete verdict onto a newly named trial', async () => {
    apiRequest.mockImplementation((_m: string, url: string) =>
      String(url).includes('TRIAL-001') ? Promise.resolve(ok(READY)) : pending(),
    );

    mount();
    nameTrial('TRIAL-001');
    await waitFor(() => expect(screen.getByText(/TRIAL-001's TMF holds every required/i)).toBeTruthy());

    // The keystroke that moves the surface to a trial nothing has read yet.
    nameTrial('TRIAL-002');

    const seen = text();
    expect(/TRIAL-002/.test(seen), 'the surface is now speaking about TRIAL-002').toBe(true);
    expect(COMPLETE_CLAIM.test(seen), 'must not call TRIAL-002 complete').toBe(false);
    expect(REASSURE.test(seen), 'must not reassure over an unread trial').toBe(false);
    expect(LIVENESS.test(seen), 'must not claim these counts are live for TRIAL-002').toBe(false);
    expect(/INSPECTION-READY/.test(seen), 'must not badge TRIAL-002 inspection-ready').toBe(false);
    // TRIAL-001's numbers must not be on screen under TRIAL-002's name either.
    expect(/8\/8 zones/.test(seen), "must not show the previous trial's zone counts").toBe(false);
    expect(/Reading TRIAL-002's TMF completeness/i.test(seen)).toBe(true);

    // And it holds for the WHOLE fetch, not just the first frame — the window
    // the file's old comment mis-described as "the frame right after the trial
    // id changes". TRIAL-002's read is still in flight here.
    await act(async () => { await Promise.resolve(); });
    const later = text();
    expect(COMPLETE_CLAIM.test(later), 'still must not call TRIAL-002 complete').toBe(false);
    expect(REASSURE.test(later)).toBe(false);
    expect(LIVENESS.test(later)).toBe(false);
  });

  it('does not carry the previous trial\'s failed read onto a newly named trial', async () => {
    apiRequest.mockImplementation((_m: string, url: string) =>
      String(url).includes('TRIAL-001') ? Promise.resolve(fail()) : pending(),
    );

    mount();
    nameTrial('TRIAL-001');
    await waitFor(() => expect(screen.getByText(/Couldn't load inspection readiness/i)).toBeTruthy());

    nameTrial('TRIAL-002');
    await act(async () => { await Promise.resolve(); });

    const seen = text();
    // A read that has not been attempted for this trial is not a failed one.
    expect(/Couldn't load inspection readiness/i.test(seen), 'must not report TRIAL-002 as failed').toBe(false);
    expect(/Reading TRIAL-002's TMF completeness/i.test(seen)).toBe(true);
  });

  it('will not call a trial complete when the assessment evaluated no zones at all', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok(VACUOUS)));

    mount();
    nameTrial('TRIAL-003');
    await waitFor(() => expect(screen.getByText(/No TMF assessment for TRIAL-003 yet/i)).toBeTruthy());

    const seen = text();
    expect(COMPLETE_CLAIM.test(seen), 'zero required artifacts is not "every required artifact"').toBe(false);
    expect(REASSURE.test(seen)).toBe(false);
    expect(/INSPECTION-READY/.test(seen)).toBe(false);
    expect(/across all 0 DIA Reference-Model zones/i.test(seen)).toBe(false);
  });

  /**
   * OVER-CORRECTION GUARD.
   *
   * Every assertion above would also pass if the surface had simply lost the
   * ability to say a file is complete, which would be the same defect wearing a
   * different face — the eTMF surface exists to certify inspection readiness.
   * This is the state that has genuinely earned the claim: a settled read for
   * the trial named on screen, sixteen required artifacts evaluated across
   * eight zones, none open.
   */
  it('still reads complete — headline, reassurance and badge — when the trial has genuinely earned it', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok(READY)));

    mount();
    nameTrial('TRIAL-001');

    await waitFor(() => expect(screen.getByText(/TRIAL-001's TMF holds every required/i)).toBeTruthy());
    const seen = text();
    expect(COMPLETE_CLAIM.test(seen)).toBe(true);
    expect(/across all 8 DIA Reference-Model zones/i.test(seen)).toBe(true);
    expect(REASSURE.test(seen), 'the reassuring state must remain reachable').toBe(true);
    expect(LIVENESS.test(seen), 'the liveness caption is true here and must be shown').toBe(true);
    expect(/INSPECTION-READY/.test(seen)).toBe(true);
    expect(/8\/8 zones/.test(seen)).toBe(true);
  });

  /**
   * The one assertion here that is NOT behavioural, and why.
   *
   * A weaker fix — leaving `R = completeness.data` and merely consulting
   * `completeness.loading` — passes every test above. I verified that by making
   * exactly that edit and re-running: tests one and two stayed green. It passes
   * because @testing-library flushes passive effects inside `act` before any
   * assertion can run, so the commit that React paints BEFORE `useLiveData`'s
   * effect flips `loading` is not reachable from the rendered DOM. In a browser
   * that commit is a frame the user can see, carrying the new trial's name over
   * the previous trial's counts, and `loading` is false in it.
   *
   * The rendered DOM therefore cannot distinguish the two fixes, so this one
   * case asserts the contract in the source instead: the payload the surface
   * speaks from must be correlated with the read it belongs to, not merely
   * timed against a flag that never clears `data`.
   */
  it('speaks only from a payload correlated with the current read', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'client/src/concept2cure/v2/surfaces/Etmf.tsx'),
      'utf8',
    );

    // The correlation itself.
    expect(src).toContain('const R = inSync ? completeness.data : null;');
    // The line that made a previous trial's assessment speak for this one.
    expect(src).not.toMatch(/const\s+R\s*=\s*completeness\.data\s*;/);
    // Clearance still comes from the discriminator over positive evidence, and
    // that evidence is the reference-model denominator — never `missing.length`.
    expect(src).toContain("const clear = tmfState === 'assessed-clear'");
    expect(src).toContain('R.summary.zoneCount > 0 && R.summary.totalRequired > 0');
    expect(src).not.toMatch(/assessmentRan:\s*true/);
  });

  it('states the real gap counts for the trial named, and does not reassure over them', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok(GAPPY)));

    mount();
    nameTrial('TRIAL-004');

    await waitFor(() => expect(screen.getByText(/TRIAL-004's TMF is missing/i)).toBeTruthy());
    const seen = text();
    expect(/2 required essential documents/i.test(seen)).toBe(true);
    expect(/across 1 zone\b/i.test(seen)).toBe(true);
    expect(REASSURE.test(seen), 'an open punch-list is not a clean file').toBe(false);
    expect(/NOT INSPECTION-READY/.test(seen)).toBe(true);
  });
});
