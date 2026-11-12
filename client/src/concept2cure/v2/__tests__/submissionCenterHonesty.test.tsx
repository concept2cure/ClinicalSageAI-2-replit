// @vitest-environment jsdom
/**
 * Submission Center — a read that never answered is not an answer of "none".
 *
 * ── The two findings ─────────────────────────────────────────────────────────
 * 1. The per-sequence gate (Builder / Validation / Shadow review
 *    / Dispatch) rendered
 *
 *      PER_SEQ_WS.has(ws) && !sub && !subs.loading
 *        → "No submission selected"
 *
 *    `sub` is `list.find(...) ?? list[0]` over `subs.rows`, and `useLiveRows`
 *    hands back the same frozen empty array whether GET /api/submissions
 *    returned zero rows or failed outright. The guard never read `subs.error`,
 *    so once a failed fetch settled, a regulatory director was told that no
 *    submission was SELECTED — which implies the list was read and they simply
 *    had not picked from it — over a list that had not been read at all.
 *
 * 2. The AnswerLead's action was
 *
 *      label:   seqs.rows.length ? 'Open the sequences' : 'Plan the submission'
 *      onClick: setWs(seqs.rows.length ? 'sequences' : 'planner')
 *
 *    branching on `rows.length` alone, which is 0 in flight, 0 on failure and 0
 *    on a genuinely unplanned submission. The body prop two lines above it got
 *    this right, so the surface could say "Loading this submission's
 *    sequences…" or "couldn't be loaded" in the paragraph while the button
 *    beneath it offered to plan a submission from zero and routed to the
 *    Planner — treating an unknown count as a known zero.
 *
 * ── Why these assertions are behavioural ─────────────────────────────────────
 * Every state below is driven through the real hooks by controlling what
 * `apiRequest` returns: a failing response, a pending promise that never
 * settles, and a genuine empty 200. Nothing asserts on the source text, and no
 * fixture is richer than the columns the surface actually renders — the reads
 * ARE the subject of both findings, so faking them is the point of the test.
 *
 * The last test in each pair is the over-correction guard. A fix that simply
 * never said "No submission selected", or never offered the Planner, would pass
 * the first test of each pair and destroy the surface: the honest empty state
 * and the plan-from-zero route both have to stay reachable when they are true.
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

/** The columns GET /api/submissions actually returns, all of them rendered. */
const SUBMISSION = {
  id: 7,
  title: 'C2C-101 original NDA',
  productName: 'Concitinib',
  applicationType: 'nda',
  clientType: 'biotech',
  primaryRegion: 'fda',
  status: 'active',
  lifecycleStage: 'original',
};

/** A codified region profile, shaped as GET /api/region-profiles/:region returns.
 *  `requiredFor` is the load-bearing field: 1.3.1 is an NDA obligation and
 *  1.6 an IND one, so the same profile must produce different required lists. */
const FDA_PROFILE = {
  region: 'fda',
  agency: 'FDA',
  language: 'en',
  currency: 'USD',
  pathways: ['ectd_v322', 'estar'],
  module1Sections: [
    { number: '1.1', title: 'Forms', required: true, description: 'FDA forms' },
    {
      number: '1.3.1', title: 'Debarment certification', required: true,
      requiredFor: ['nda', 'bla'], description: 'Marketing applications only',
    },
    {
      number: '1.6', title: 'General investigational plan', required: true,
      requiredFor: ['ind'], description: 'IND only',
    },
    { number: '1.9', title: 'Optional annex', required: false, description: 'Not required' },
  ],
  forms: [
    { name: 'Form 356h', formId: 'FDA-356h', required: true, requiredFor: ['nda', 'bla', 'anda'], description: 'Application to market' },
    { name: 'Form 1571', formId: 'FDA-1571', required: true, requiredFor: ['ind'], description: 'IND application' },
  ],
  specificRequirements: ['Submit via ESG with a WebTrader or AS2 account.'],
  validationRules: [
    { id: 'FDA-ESG-001', severity: 'error', citation: 'ESG TCG §3.2', description: 'Sequence must be 4-digit' },
  ],
  validationRuleCount: 1,
};

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };

const ok = (payload: unknown): Res => ({ ok: true, status: 200, json: async () => payload });
const rows = (r: unknown[]): Res => ok({ success: true, data: r });
/** A failed read. `useLiveRows` reports `error`, and `rows` stays empty. */
const failed = (): Res => ({ ok: false, status: 500, json: async () => ({}) });
/** The 404 an unprofiled region returns — seven of the twelve the selector
 *  offers have no codified profile. */
const notFound = (): Res => ({
  ok: false, status: 404,
  json: async () => ({ error: { code: 'NOT_FOUND', message: 'Unknown region' } }),
});
/** A read that has not settled — the in-flight state, held open for the test. */
const pending = (): Promise<Res> => new Promise<Res>(() => {});

/**
 * Route the two reads under test; answer the device-tracker calls with their
 * own honest empty so nothing else on the Portfolio view throws.
 */
function serve(opts: {
  submissions: () => Res | Promise<Res>;
  sequences?: () => Res | Promise<Res>;
  /** The Planner's region profile. Defaults to a codified FDA profile. */
  regionProfile?: () => Res | Promise<Res>;
}) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const u = String(url);
    if (u === '/api/submissions') return opts.submissions();
    if (/^\/api\/region-profiles\//.test(u)) {
      return (opts.regionProfile ?? (() => ok(FDA_PROFILE)))();
    }
    if (/^\/api\/submissions\/\d+\/sequences$/.test(u)) return (opts.sequences ?? (() => rows([])))();
    if (u === '/api/510k/estar/submissions') return ok({ success: true, data: { submissions: [] } });
    if (u === '/api/510k/estar/assemble')
      return ok({ success: true, data: { artifactKind: 'none', blockers: [] } });
    return failed();
  });
}

function mount() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
}

const body = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('SubmissionCenter — the per-sequence gate over an unread submission list', () => {
  it('does not say "No submission selected" when the submission list failed to load', async () => {
    serve({ submissions: failed });
    mount();

    // Wait on the PORTFOLIO table's own failure copy first. It is not the branch
    // under test — it is the branch the per-sequence gate should have copied —
    // and it settles the read in both the fixed and the unfixed build, so the
    // negative assertion below cannot pass merely because nothing has rendered.
    await screen.findByText(/Couldn't load the submissions/i);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    // The sentence the finding named, asserted first so a regression names it.
    // Nothing established that a list exists to select from, so nothing may say
    // the reader has not selected from it.
    expect(/No submission selected/i.test(body()), 'a failed read is not an unselected one').toBe(
      false,
    );
    // And the failure is stated AS a failure (role=alert), not as an empty set.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Couldn't load the submissions/i);
    // And no internals leak into the copy (work-order constraint).
    expect(/\/api\//.test(body()), 'no API routes in the UI').toBe(false);
    expect(/HTTP 500/.test(body()), 'no exception text in the UI').toBe(false);
  });

  /** Over-correction guard: the honest empty state must still be reachable. */
  it('still says "No submission selected" when the list genuinely came back empty', async () => {
    serve({ submissions: () => rows([]) });
    mount();

    // Same settle point, the Portfolio table's honest-empty copy this time.
    await screen.findByText(/No submissions yet/i);
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));

    expect(screen.getByText(/No submission selected/i)).toBeTruthy();
    expect(/Couldn't load the submissions/i.test(body()), 'an empty read is not a failure').toBe(
      false,
    );
  });
});

/* D7-A1 (2026-11-09) deleted the AnswerLead (D7.md §A.4 step 4): its action is the Planner and Sequences tabs, always
 * present, and its headline is the page header's one sentence. Finding 2 now lives in that sentence: it must never
 * count an unread list, nor call an unread list empty. The last case of the pair is the over-correction guard. */
describe("SubmissionCenter — the page's state sentence over an unread sequence list", () => {
  const state = () => screen.getByTestId('sc-state').textContent ?? '';

  it('says the sequences are loading while they are, and counts nothing', async () => {
    serve({ submissions: () => rows([SUBMISSION]), sequences: pending });
    mount();

    await waitFor(() => expect(state()).toMatch(/Loading its sequences…$/));
    expect(state(), 'an unknown count is not a known zero').not.toMatch(/No sequence yet|\d+ sequences?:/);
    // A way forward stays: the workspace that reports the read itself.
    expect(screen.getByRole('tab', { name: 'Sequences' })).toBeTruthy();
  });

  it('says the sequences could not be read when the read failed, never that there are none', async () => {
    serve({ submissions: () => rows([SUBMISSION]), sequences: failed });
    mount();

    await waitFor(() => expect(state()).toMatch(/Its sequences could not be read\.$/));
    expect(state(), 'a failed read is not a zero-sequence submission').not.toMatch(/No sequence yet/);
    fireEvent.click(screen.getByRole('tab', { name: 'Sequences' }));
    expect(await screen.findByText(/Couldn't load the sequences/i)).toBeTruthy();
  });

  /** Over-correction guard: on a settled zero-sequence read, zero is the truth and is said; the Planner is a tab. */
  it('says there is no sequence yet on a settled zero-sequence read, and the Planner opens', async () => {
    serve({ submissions: () => rows([SUBMISSION]), sequences: () => rows([]) });
    mount();

    await waitFor(() => expect(state()).toMatch(/, original\. No sequence yet\.$/));
    fireEvent.click(screen.getByRole('tab', { name: 'Planner' }));
    expect(await screen.findByText(/planning · region profiles/i)).toBeTruthy();
  });

  it('counts the sequences and names the latest when this submission has them', async () => {
    serve({
      submissions: () => rows([SUBMISSION]),
      sequences: () =>
        rows([
          { id: 31, submissionId: 7, sequenceNumber: '0000', type: 'original', region: 'fda', status: 'draft', validationStatus: null },
          { id: 32, submissionId: 7, sequenceNumber: '0001', type: 'amendment', region: 'fda', status: 'assembling', validationStatus: null },
        ]),
    });
    mount();

    await waitFor(() => expect(state()).toMatch(/, original\. 2 sequences: 0001, assembling\.$/));
  });
});

/* ── The Planner's region profile ─────────────────────────────────────────────
 *
 * The Planner NAMED this profile's contents in prose — "required modules,
 * granularity, regional Module 1, and the validation profile" — over a screen
 * that never read it. It reads it now, and the read has three outcomes that
 * must stay apart.
 *
 * The one that carries the risk is the 404. The region selector offers twelve
 * regions and profiles exist for five, so Health Canada, MHRA, Swissmedic, TGA,
 * ANVISA, CDSCO and HSA all resolve to "no profile". On a submission screen an
 * empty required-section list is a statement that nothing is required, and for
 * those seven nobody has codified what is — the same fail-visible rule the
 * dispatch assessor already applies to an unregistered region.
 *
 * The last test is the over-correction guard: a fix that simply never showed
 * requirements would pass the first three and make the panel useless.
 */
describe('SubmissionCenter — the Planner over a region profile', () => {
  async function openPlanner() {
    mount();
    // The title renders in the portfolio row AND the header, so match all.
    expect((await screen.findAllByText(/C2C-101 original NDA/)).length).toBeGreaterThan(0);
    const tabs = screen.getAllByText('Planner');
    fireEvent.click(tabs[0]);
  }

  it('reports an unprofiled region as not codified, never as no requirements', async () => {
    serve({ submissions: () => rows([SUBMISSION]), regionProfile: () => notFound() });
    await openPlanner();

    expect(await screen.findByText(/No region profile is registered/i)).toBeTruthy();
    expect(body()).toMatch(/not a statement that nothing is required/i);
    // The forbidden reading: a codified profile with an empty requirement set.
    expect(body()).not.toMatch(/Required Module 1 for .* · 0\b/);
  });

  it('reports a failed profile read as unreadable, never as not codified', async () => {
    serve({ submissions: () => rows([SUBMISSION]), regionProfile: () => failed() });
    await openPlanner();

    expect(await screen.findByText(/Couldn’t load the .* region profile/i)).toBeTruthy();
    expect(body()).toMatch(/failed read, not an empty requirement set/i);
    expect(body()).not.toMatch(/No region profile is registered/i);
  });

  it('does not answer from an unsettled read', async () => {
    serve({ submissions: () => rows([SUBMISSION]), regionProfile: () => pending() });
    await openPlanner();

    expect(await screen.findByText(/Loading the region profile/i)).toBeTruthy();
    expect(body()).not.toMatch(/No region profile is registered/i);
    expect(body()).not.toMatch(/Couldn’t load/i);
  });

  /* Showcase walk, 2026-11-10: the Planner printed the stored pathway codes, "ectd_v322 · ectd_v40 · estar". The
     product already names each pathway (shared/types/submission-constants.ts PATHWAYS). */
  it('names the profile\'s pathways in words, not by their stored codes', async () => {
    serve({ submissions: () => rows([SUBMISSION]) });
    await openPlanner();
    const row = (await screen.findByText('Pathways')).closest('.tl-spec-row') as HTMLElement;
    expect(row.textContent).toBe('PathwayseCTD v3.2.2 · eSTAR');
    expect(body()).not.toMatch(/ectd_v322|\bestar\b/);
  });

  it('shows a pathway the product has no name for as it is recorded, never as blank', async () => {
    serve({ submissions: () => rows([SUBMISSION]), regionProfile: () => ok({ ...FDA_PROFILE, pathways: ['ectd_v322', 'future_format'] }) });
    await openPlanner();
    const row = (await screen.findByText('Pathways')).closest('.tl-spec-row') as HTMLElement;
    expect(row.textContent).toBe('PathwayseCTD v3.2.2 · future_format');
  });

  it('shows the codified profile, scoped to THIS application type', async () => {
    // The over-correction guard, and the requiredFor check in one: SUBMISSION
    // is an `nda`, so the debarment certification is owed and the IND-only
    // general investigational plan is NOT.
    serve({ submissions: () => rows([SUBMISSION]) });
    await openPlanner();

    expect(await screen.findByText(/Required Module 1 for/i)).toBeTruthy();
    expect(body()).toMatch(/Debarment certification/);
    expect(body()).toMatch(/FDA-356h/);
    expect(body()).toMatch(/FDA-ESG-001/);

    // An NDA does not owe the IND-only section. Listing it would tell a filer
    // they owe paperwork they do not.
    expect(body()).not.toMatch(/General investigational plan/);
    // Nor is a non-required section presented as required.
    expect(body()).not.toMatch(/Optional annex/);
  });

  /* J4 human test, 2026-11-06 (docs/evidence/HUMAN-TEST/J4/): an IND's Planner
     listed "356h · FDA Form 356h (required)", the marketing-application form.
     Forms are scoped by `requiredFor` exactly as Module 1 headings are. */
  it('lists only the agency forms THIS application type files', async () => {
    serve({ submissions: () => rows([SUBMISSION]) });
    await openPlanner();
    expect(await screen.findByText(/Required Module 1 for/i)).toBeTruthy();
    expect(body()).toMatch(/FDA-356h/);
    expect(body()).not.toMatch(/FDA-1571/);
  });
});

/* J4 human test, 2026-11-06 (docs/evidence/HUMAN-TEST/J4/): at 390 px a sequence
   row ("0000 · Original sequence · FDA (US) · Assembling · Validated · Draft") is
   one no-wrap flex line, so its label column was squeezed to one character per line. */
describe('SubmissionCenter — a sequence row wraps at a phone’s width', () => {
  it('the row wraps and its label keeps a readable minimum width', async () => {
    const css = (await import('node:fs')).readFileSync('client/src/concept2cure/v2/styles/submission-v2.css', 'utf8');
    expect(css).toMatch(/\.sc-subrow\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.sc-subrow\s+\.sp-row-b\s*\{[^}]*min-width:\s*\d+px/);
  });
  it('a table wider than its card scrolls inside the card, not the whole page', async () => {
    const css = (await import('node:fs')).readFileSync('client/src/concept2cure/v2/styles/submission-v2.css', 'utf8');
    expect(css).toMatch(/\.sc-page\s+\.pj-card-b-flush\s*\{[^}]*overflow-x:\s*auto/);
    // The submission picker sized itself to its longest title (599 px at 390).
    expect(css).toMatch(/\.sc-subpick\s*\{[^}]*max-width:\s*100%/);
  });
});
