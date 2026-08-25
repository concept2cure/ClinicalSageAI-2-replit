// @vitest-environment jsdom
/**
 * BP-W0-3 — a zero state may not speak the vocabulary of clearance.
 *
 * The finding this pins: over a program with no content, the NDA/BLA filing
 * cockpit rendered
 *
 *   "You're 0% ready to file — no Refuse-to-File blockers left, 0 items to tidy
 *    before you submit. The remaining items are administrative, not structural
 *    — close them out and the package is fileable. You're close."
 *
 * and the CMC module rendered "You're building steadily" over zero submissions.
 *
 * These assertions are deliberately written against the RENDERED TEXT rather
 * than against `assessmentState()` in isolation. The unit is not where the
 * defect was: `assessmentState` is new, and a test of it alone would have
 * passed on day one against a surface that never called it. What has to hold is
 * that these two screens do not say these things, so that is what is asserted.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { assessmentState, mayReassure } from '../assessmentState';

/* PARTIAL mock, not a replacement.
   This was a hand-written stand-in listing four exports. It worked only because
   every test here drove the success path: the moment a read fails, `ErrorState`
   renders and reaches for `redactInternals`, which the stand-in did not export
   — so the component threw, React unmounted the whole tree, and the assertion
   saw an empty document rather than the surface. A stand-in that has to be kept
   in step by hand with the module it replaces will drift, and it drifts
   silently on exactly the paths that are hardest to test. */
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })),
}));

import { NdaCockpit } from '../surfaces/NdaCockpit';

const EMPTY_PROPS = { surface: { id: 'nda-cockpit', label: 'NDA cockpit' } } as any;

/** Every phrase that asserts, implies or reassures about readiness. */
const CLEARANCE_LANGUAGE = [
  /no Refuse-to-File blockers left/i,
  /you'?re close/i,
  /the package is fileable/i,
  /remaining items are administrative, not structural/i,
  /building steadily/i,
];

describe('assessmentState — an empty findings set is not a finding of "none"', () => {
  it('no scope is not-assessed, however many findings are absent', () => {
    expect(
      assessmentState({ scopeExists: false, findingCount: 0, assessmentRan: false })
    ).toBe('not-assessed');
  });

  it('scope with zero findings and no evidence of a run is STILL not-assessed', () => {
    // This is the whole defect in one assertion. The old code reached its
    // "no blockers left" branch from exactly this input.
    expect(
      assessmentState({ scopeExists: true, findingCount: 0, assessmentRan: false })
    ).toBe('not-assessed');
  });

  it('clearance requires positive evidence that an assessment ran', () => {
    expect(
      assessmentState({ scopeExists: true, findingCount: 0, assessmentRan: true })
    ).toBe('assessed-clear');
  });

  it('a failed read is never an empty result', () => {
    expect(
      assessmentState({ unreadable: true, scopeExists: true, findingCount: 0, assessmentRan: true })
    ).toBe('unreadable');
  });

  it('0% complete never co-occurs with reassuring copy, even when clear', () => {
    expect(mayReassure('assessed-clear', 0)).toBe(false);
    expect(mayReassure('assessed-clear', 12)).toBe(true);
    expect(mayReassure('not-assessed', 100)).toBe(false);
  });
});

describe('NDA cockpit over an empty program', () => {
  beforeEach(() => vi.clearAllMocks());

  it('states that nothing has been assessed, and asserts no clearance', async () => {
    render(<NdaCockpit {...EMPTY_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/nothing has been assessed/i)).toBeTruthy();
    });

    const body = document.body.textContent ?? '';
    for (const phrase of CLEARANCE_LANGUAGE) {
      expect(phrase.test(body), `zero state must not say: ${phrase}`).toBe(false);
    }
  });

  it('does not assert a review clock it has no store for', async () => {
    render(<NdaCockpit {...EMPTY_PROPS} />);
    await waitFor(() => expect(screen.getByText(/nothing has been assessed/i)).toBeTruthy());
    // "not started" says a clock exists and has not begun. There is no
    // review-clock store at all, and the clock tab says "No review clock
    // recorded" — the KPI label said something stronger and unevidenced.
    expect(document.body.textContent).not.toContain('not started');
  });
});

/**
 * The narrative was rebuilt to speak honestly about an unresolved read. The
 * numbers beside it were not, and a number is the more confident assertion.
 *
 * `overall`, `m1open` and `highs.length` are all 0 while their reads are in
 * flight and when those reads have FAILED — the same zero for four different
 * realities. So the strip said "0% Application readiness" directly beneath
 * "Nothing is being asserted … until the read settles", and, worse, beneath
 * "This is a failed read, not a clean program."
 */
describe('NDA cockpit over a FAILED read', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiRequest } = await import('@/lib/queryClient');
    (apiRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'AUTH_REQUIRED' } }),
    }));
  });

  it('says the read failed rather than narrating a clean program', async () => {
    render(<NdaCockpit {...EMPTY_PROPS} />);
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
  });

  it('renders no number for a quantity it could not read', async () => {
    render(<NdaCockpit {...EMPTY_PROPS} />);
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    // 0% readiness beneath "filing readiness could not be read" is the whole
    // finding. On a failed read this is terminal, not transient: nothing
    // re-resolves it, so it is the last thing the user is left looking at.
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('never renders a failed Refuse-to-File read in the language of clearance', async () => {
    render(<NdaCockpit {...EMPTY_PROPS} />);
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    const rtfTile = Array.from(document.querySelectorAll('.reg-kpi'))
      .find((el) => el.textContent?.includes('High RTF risk'));
    expect(rtfTile).toBeTruthy();
    // A neutral-toned "0" beside the words "High RTF risk" is an empty findings
    // set presented as a finding of none — in the one form that reads faster
    // than prose.
    expect(rtfTile!.querySelector('.reg-kpi-v')?.textContent).toBe('—');
  });

  it('offers no next step that would carry the failure into AnA', async () => {
    const ask = vi.fn();
    render(<NdaCockpit {...EMPTY_PROPS} onAsk={ask} />);
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    // The button used to read "Draft the final readiness plan" and prompt AnA
    // about "the open administrative items on this NDA program" — asserting to
    // the model that such items exist, off a read that returned nothing.
    expect(screen.queryByText(/Draft the final readiness plan/i)).toBeNull();
    expect(document.querySelector('.al-lead .al-btn')).toBeNull();
  });
});

/**
 * The IND Lifecycle surface — the lane's DEFAULT surface — held the same defect
 * in latent form: `indlReadiness` derived `ready: blockers.length === 0` and
 * `overallPercentage: totalItems === 0 ? 100 : …`, which is literally
 * "empty set ⇒ 100% READY TO FILE". Reachable the moment the checklist
 * assembler returns empty forms/sections arrays (which it documents it does
 * when nothing is authored yet). Pinned here at both altitudes: the derivation
 * and the rendered surface.
 */
describe('indlReadiness — an empty checklist is not a fileable one', () => {
  it('derives not-assessed, not clearance, from zero items', async () => {
    const { indlReadiness } = await import('../fixtures/ind-lifecycle-data');
    const r = indlReadiness([], []);
    expect(r.assessed).toBe(false);
    expect(r.ready).toBe(false);
    // The old branch returned 100 here.
    expect(r.overallPercentage).toBe(0);
  });

  it('is still clearance-capable when items exist and all pass', async () => {
    const { indlReadiness } = await import('../fixtures/ind-lifecycle-data');
    const r = indlReadiness(
      [{ code: '1.1', title: 'Forms', status: 'approved', required: true } as never],
      [{ id: '1571', name: 'FDA 1571', done: true } as never],
    );
    expect(r.assessed).toBe(true);
    expect(r.blockers.length).toBe(0);
    expect(r.ready).toBe(true);
  });
});

describe('IND Lifecycle over an empty checklist', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiRequest } = await import('@/lib/queryClient');
    (apiRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            code: 'IND-000000',
            drugName: 'TST-1',
            productName: null,
            indication: null,
            sponsorName: null,
            submissionType: null,
            targetReceiptDate: null,
            forms: [],
            sections: [],
          },
        ],
      }),
    }));
  });

  it('says nothing has been assessed, never READY TO FILE', async () => {
    const { IndLifecycle } = await import('../surfaces/IndLifecycle');
    render(<IndLifecycle {...({ surface: { id: 'ind-lifecycle', label: 'IND Lifecycle' } } as any)} />);
    await waitFor(() => {
      expect(screen.getAllByText(/nothing has been assessed/i).length).toBeGreaterThan(0);
    });

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('READY TO FILE');
    expect(/no blockers\./i.test(body)).toBe(false);
    for (const phrase of CLEARANCE_LANGUAGE) {
      expect(phrase.test(body), `zero state must not say: ${phrase}`).toBe(false);
    }
    // The verdict chip states the truth of the empty set.
    expect(body).toContain('NOT ASSESSED');
    // And 100% appears nowhere — the old derivation put it in the headline.
    expect(body).not.toContain('100%');
  });
});
