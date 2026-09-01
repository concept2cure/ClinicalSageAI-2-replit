// @vitest-environment jsdom
/**
 * The precedent board may not report a sub-analysis that FAILED as one that ran
 * and found nothing.
 *
 * ── The mechanism these tests pin ────────────────────────────────────────────
 * GET /api/precedent-engine-board fans out to seven service calls under
 * Promise.allSettled and returns HTTP 200 `{success:true}` regardless of how
 * many of them rejected. A rejected call is substituted with an EMPTY section
 * (server/routes/precedent-engine-board.ts) and its reason is only logged
 * server-side. dataConnect's `useLiveData` sets `error` from the top-level HTTP
 * status or a thrown fetch, never from payload contents — so `board.error`
 * stays undefined and the surface renders a failure as an empty result, which
 * is the one thing CLAUDE.md says must never happen.
 *
 * Two of the substitutions are recoverable from the payload, and the fix hangs
 * on those two values and on nothing else:
 *
 *   risk.overall === 'unknown'
 *       The service type is 'low'|'medium'|'high'|'critical', so 'unknown' is
 *       written only by the route's empty-risk substitution.
 *   strategy.recommendation === 'Insufficient precedent data'
 *       The service falls back to 'Standard submission approach'; this literal
 *       is written only by the route's empty-strategy substitution.
 *
 * The SEARCH sub-call has no sentinel at all — a rejected search and a genuinely
 * empty one are both `results: []` — so the empty-result copy must decline to
 * diagnose either, rather than blaming the user's criteria.
 *
 * ── Why every assertion below is behavioural ─────────────────────────────────
 * Nothing here inspects the source. Each case drives the real component through
 * its real fetch path (the search form is submitted the way a user submits it)
 * with a payload shaped exactly like the server DTO, and asserts on rendered
 * text. The over-correction guards matter as much as the failure cases: copy
 * that can never read clear, name a predicate or make a recommendation would be
 * the same defect inverted, so each failure case is paired with one proving the
 * reassuring branch is still reachable when it is genuinely earned.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  serverMessage: () => null,
  extractApiError: () => null,
  errorCodeOf: () => null,
}));

import { PrecedentEngine } from '../surfaces/PrecedentEngine';

/* ── Payloads, mirroring the server DTO in precedent-engine-board.ts ──────── */

const PATTERN = (title: string) => ({ title, rate: '—', items: [] as string[] });

/** A section-by-section board. Defaults are all-healthy; each test overrides
 *  exactly the one section it is about, so no assertion can be satisfied by an
 *  unrelated part of the fixture. */
function boardBody(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      results: [],
      risk: { overall: 'medium', score: 0.42, factors: [] },
      strategy: {
        recommendation: 'Standard submission approach',
        predicate: '',
        rationale: [],
        altPathways: [],
      },
      patterns: {
        crl: PATTERN('CRL trigger patterns'),
        rtf: PATTERN('RTF (Refuse-to-File) triggers'),
        ema: PATTERN('EMA Day-120/180 question patterns'),
        adcomm: PATTERN('Advisory Committee risk'),
      },
      ...over,
    },
  };
}

/** What the route emits when precedentEngine.analyzeRisk() REJECTS. */
const REJECTED_RISK = { overall: 'unknown', score: 0, factors: [] };
/** What the route emits when precedentEngine.recommendStrategy() REJECTS. */
const REJECTED_STRATEGY = {
  recommendation: 'Insufficient precedent data',
  predicate: '',
  rationale: [] as string[],
  altPathways: [] as { p: string; when: string }[],
};

const PRECEDENT = {
  clearanceNumber: 'K192345',
  deviceName: 'Continuous analyte monitor',
  applicant: 'Acme Diagnostics',
  decisionDate: '2019-11-04',
  clearanceType: 'Traditional 510(k)',
  decisionOutcome: 'SESE',
  productCode: 'QBJ',
  therapeuticArea: 'Endocrinology',
  cycle: 118,
  match: 0.91,
  riskFactors: [] as string[],
  predicateKNumber: 'K180001',
};

function mountWithBoard(over: Record<string, unknown> = {}) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (String(url).includes('/api/precedent-engine-board')) {
      return { ok: true, status: 200, json: async () => boardBody(over) };
    }
    // Saved-query list: an empty, successful list. Not under test.
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  render(
    <PrecedentEngine
      {...({ surface: { id: 'precedent-engine' }, onAsk: vi.fn(), onNav: vi.fn() } as any)}
    />,
  );
  // The board is not fetched until the user runs a search — the surface refuses
  // to invent a question. So run one, the way a user does.
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  // Settle on an anchor that exists in EVERY version of this surface — the
  // panel header, which is rendered once the board has loaded regardless of
  // what any section says. Waiting on the NEW copy instead would make every
  // case fail at the wait, and the assertions that name the untrue sentences
  // would never be reached: the test would prove the new strings exist rather
  // than that the false ones are gone.
  return waitFor(() => expect(screen.getByText('Closest precedents')).toBeTruthy());
}

const text = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('PrecedentEngine — a search that did not run is not a search that found nothing', () => {
  /* The two sentences the audit found are asserted in SEPARATE cases on
     purpose. Held in one case, the first failure hides the second, and only
     one of the two would ever be seen to go red. */
  it('the lead does not claim a search ran and matched nothing', async () => {
    await mountWithBoard({ results: [] });

    const body = text();
    // `results: []` is exactly what a REJECTED precedentEngine.search() is
    // mapped to, under the same HTTP 200 — so this headline asserted a finding
    // about the corpus that the payload cannot support.
    expect(/No cleared precedents matched this search/i.test(body), 'headline must not claim a search matched nothing').toBe(false);
    // And it must still say something true rather than going silent.
    expect(body).toMatch(/did not complete/i);
    expect(body).toMatch(/nothing here establishes/i);
  });

  it('the precedents panel does not claim the corpus was searched', async () => {
    await mountWithBoard({ results: [] });

    const body = text();
    expect(/in the corpus matched this submission type/i.test(body), 'panel must not claim the corpus was searched').toBe(false);
    expect(/No matching precedents/i.test(body), 'a title asserting no match is the same claim in miniature').toBe(false);
    expect(body).toMatch(/No precedents returned/i);
    expect(body).toMatch(/not the same as none existing/i);
  });

  /* Over-correction guard #1: the surface's whole purpose is naming a predicate.
     Copy that could never do that would be the same defect inverted. */
  it('still names the closest precedent when the search genuinely returned one', async () => {
    await mountWithBoard({ results: [PRECEDENT] });

    const body = text();
    expect(body).toMatch(/K192345/);
    expect(body).toMatch(/cleanest path/i);
    expect(/No precedents came back/i.test(body), 'a populated search must not read as empty').toBe(false);
    expect(/No precedents returned/i.test(body)).toBe(false);
  });
});

describe('PrecedentEngine — a rejected risk analysis is not a clean risk profile', () => {
  it('does not present a failed analyzeRisk() as no scored risk factors', async () => {
    await mountWithBoard({ results: [PRECEDENT], risk: REJECTED_RISK });

    const body = text();
    // The exact sentence from the finding. "nothing is inferred without a real
    // signal" describes restraint; in this state no signal was ever OBTAINED,
    // and the sentence reads as a clean profile.
    expect(/No scored risk factors for this submission context yet/i.test(body), 'must not read as a clean risk profile').toBe(false);
    expect(/nothing is inferred without a real signal/i.test(body), 'the clear-state clause belongs only to an analysis that ran').toBe(false);
    // The failure sentinel itself was rendered raw as the overall risk value,
    // beside a 0% chip — a failed read shown as the lowest possible score.
    expect(screen.queryByText('unknown'), 'the raw sentinel must not be shown as a risk level').toBeNull();
    expect(screen.queryByText('0%'), 'a failed analysis must not score 0%').toBeNull();
    expect(body).toMatch(/Not assessed/i);
    expect(body).toMatch(/risk analysis did not complete/i);
  });

  /* Over-correction guard #2: a genuinely clean risk profile must still read
     clean, and must still show its score. */
  it('still reads clear when the risk analysis ran and scored nothing', async () => {
    await mountWithBoard({ results: [PRECEDENT], risk: { overall: 'low', score: 0.12, factors: [] } });

    const body = text();
    expect(body).toMatch(/The risk analysis ran/i);
    expect(body).toMatch(/nothing is inferred without a real signal/i);
    expect(/risk analysis did not complete/i.test(body), 'a completed analysis must not read as a failure').toBe(false);
    expect(screen.getByText('low')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
  });

  /* Over-correction guard #3: scored factors still render. */
  it('still lists scored factors when the analysis produced them', async () => {
    await mountWithBoard({
      results: [PRECEDENT],
      risk: {
        overall: 'high',
        score: 0.77,
        factors: [{ label: 'Human factors validation', severity: 'high', note: 'Reviewers query use-error analysis.' }],
      },
    });
    expect(text()).toMatch(/Human factors validation/);
    expect(/risk analysis did not complete/i.test(text())).toBe(false);
  });
});

describe('PrecedentEngine — a rejected strategy analysis is not a thin precedent set', () => {
  it('does not blame the user’s search for a failed recommendStrategy()', async () => {
    await mountWithBoard({ results: [PRECEDENT], strategy: REJECTED_STRATEGY });
    fireEvent.click(screen.getByRole('button', { name: 'Strategy' }));

    const body = text();
    // The finding's sentence: it puts the cause on the user's search at the one
    // moment the cause is a server-side rejection unrelated to what the search
    // returned.
    expect(/Not enough supporting precedent data to assemble a rationale/i.test(body), 'must not blame the precedent set').toBe(false);
    expect(/run a search that returns precedents first/i.test(body), 'must not prescribe a remedy that cannot help').toBe(false);
    // And the sentinel must not be dressed up as a recommendation.
    expect(/Recommended:/i.test(body), 'there is no recommendation in this state').toBe(false);
    expect(/Insufficient precedent data/i.test(body), 'the raw sentinel must not be shown as advice').toBe(false);
    // And it must name what actually happened.
    expect(body).toMatch(/strategy analysis did not complete/i);
  });

  /* Over-correction guard #4: a strategy that ran must still recommend, and an
     empty rationale from a run that happened must still say so plainly. */
  it('still recommends when the strategy analysis ran', async () => {
    await mountWithBoard({
      results: [PRECEDENT],
      strategy: {
        recommendation: 'Standard submission approach',
        predicate: 'K180001',
        rationale: [],
        altPathways: [],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Strategy' }));

    const body = text();
    expect(body).toMatch(/Standard submission approach/);
    expect(body).toMatch(/Recommended:/i);
    expect(body).toMatch(/citing K180001/);
    expect(body).toMatch(/The strategy analysis ran/i);
    expect(/strategy analysis did not complete/i.test(body), 'a completed analysis must not read as a failure').toBe(false);
  });

  it('still lists the rationale when the analysis produced one', async () => {
    await mountWithBoard({
      results: [PRECEDENT],
      strategy: {
        recommendation: 'Traditional 510(k)',
        predicate: 'K192345',
        rationale: ['Closest supporting precedent: K192345 — Continuous analyte monitor (SESE).'],
        altPathways: [],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Strategy' }));
    expect(text()).toMatch(/Closest supporting precedent/);
    expect(/strategy analysis did not complete/i.test(text())).toBe(false);
  });
});

/* ── The search sub-call's missing sentinel, now supplied ────────────────────
 *
 * The block above records that a rejected search and a genuinely empty one are
 * both `results: []`, so the copy could only decline to diagnose either. For
 * the DEVICE lane that is no longer true: the engine's Strategy 2 used to
 * SELECT from `predicate.fda_510k_clearances` — a relation no migration
 * creates and nothing writes — so it raised on every call and its catch
 * returned [], and a search for a heavily cleared product code reported zero
 * precedents structurally. Strategy 2 now reads the FDA 510(k) registry and
 * the route reports whether it answered, as `sources.registry`.
 *
 * Three states that used to render identically must now read differently, and
 * only one of them may say that nothing matched.
 */
describe('an unreachable FDA registry is not an empty registry', () => {
  it('says the registry answered when it did — the one case that may assert a clean result', async () => {
    await mountWithBoard({
      results: [],
      sources: { registry: { consulted: true, available: true, resultCount: 0 } },
    });
    expect(text()).toContain('The FDA 510(k) registry answered');
    // The old shrug must be GONE here: this state is now knowable.
    expect(text()).not.toContain('cannot tell an empty result');
  });

  it('says the registry did not answer, and carries the reason', async () => {
    await mountWithBoard({
      results: [],
      sources: {
        registry: {
          consulted: true,
          available: false,
          reason: 'openFDA device/510k timed out after 10000ms',
        },
      },
    });
    expect(text()).toContain('did not answer');
    expect(text()).toContain('timed out');
    // It must not be reported as the registry having nothing.
    expect(text()).not.toContain('The FDA 510(k) registry answered');
  });

  it('keeps naming the ambiguity where the registry was never consulted', async () => {
    await mountWithBoard({
      results: [],
      sources: {
        registry: { consulted: false, available: false, reason: 'not a device submission type' },
      },
    });
    // A drug pathway, or a device pathway with nothing to search the registry
    // by. Nothing new is knowable, so nothing new may be claimed.
    expect(text()).toContain('cannot tell an empty result');
    expect(text()).not.toContain('The FDA 510(k) registry answered');
  });

  it('falls back to the ambiguity when the board carries no sources at all', async () => {
    // A board served before this field existed. Absent evidence is not evidence.
    await mountWithBoard({ results: [] });
    expect(text()).toContain('cannot tell an empty result');
    expect(text()).not.toContain('The FDA 510(k) registry answered');
  });
});

/* ── The analysis lenses a device submitter is shown ─────────────────────────
 *
 * The board offered CRL triggers, RTF triggers, EMA Day-120/180 and AdComm risk
 * on every search including a 510(k). The work order recorded RTF as the one
 * device-correct lens; it is not — that checklist is Form FDA 356h, Orange Book
 * patent certification, CTD modules and CDISC datasets. All four were drug
 * analyses, and a device submitter was reading them as findings about their
 * device. The board now names which lenses apply (`lenses`) and the surface
 * renders that, rather than a hardcoded drug four.
 */
describe('the analysis tabs follow the pathway the board reports', () => {
  it('shows the device lenses and none of the drug ones for a 510(k) board', async () => {
    await mountWithBoard({
      lenses: ['rta', 'ai', 'nse', 'predicate', 'panel'],
      patterns: {
        rta: { title: 'Refuse-to-Accept (510(k))', rate: '16 acceptance-review items', items: ['x'] },
        ai: { title: 'Additional Information request drivers', rate: 'clock-stopping', items: ['x'] },
        nse: { title: 'Not-substantially-equivalent routes', rate: 'FDA 510(k) SE flowchart', items: ['x'] },
        predicate: { title: 'Predicate adequacy', rate: 'partial — see below', items: ['x'] },
        panel: { title: 'Pathway escalation', rate: 'no panel in 510(k)', items: ['x'] },
      },
    });
    const tabs = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(tabs).toContain('NSE routes');
    expect(tabs).toContain('Predicate adequacy');
    // The four that had no business being on a device screen.
    expect(tabs).not.toContain('CRL triggers');
    expect(tabs).not.toContain('EMA D120/180');
    expect(tabs).not.toContain('AdComm risk');
  });

  it('still shows the drug lenses for a drug board', async () => {
    await mountWithBoard({ lenses: ['crl', 'rtf', 'ema', 'adcomm'] });
    const tabs = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(tabs).toContain('CRL triggers');
    expect(tabs).toContain('EMA D120/180');
    expect(tabs).not.toContain('NSE routes');
  });

  it('offers device and drug submission types as separate, named groups', () => {
    // One screen serves both lanes and nothing reaching it reliably says which,
    // so the families are labelled rather than half of them hidden on a guess.
    apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
    render(
      <PrecedentEngine
        {...({ surface: { id: 'precedent-engine' }, onAsk: vi.fn(), onNav: vi.fn() } as any)}
      />,
    );
    const groups = Array.from(document.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toContain('Device pathways');
    expect(groups).toContain('Drug and biologic pathways');
  });
});
