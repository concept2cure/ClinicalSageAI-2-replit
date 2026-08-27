// @vitest-environment jsdom
/**
 * Labeling — an unread translation set is not an empty one.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * The surface's opening sentence, its body, and the coverage caption above the
 * translations table were all computed from `cov`, and `cov` is a `useMemo` over
 * `trans`, which is seeded from
 *
 *     liveTransRows = !loading && !error ? mapLabelTranslations(data) : null
 *     seedTrans     = liveTransRows ?? EMPTY_TRANS
 *
 * So `cov.total === 0` is true in four unrelated situations: the per-document
 * translations request is IN FLIGHT, it FAILED, it returned rows the mapper
 * could not interpret (it fails closed to null), or it succeeded and the label
 * genuinely has no translations. Only the last may say so, and the surface said
 * so in all four:
 *
 *     "No translations are recorded for this label yet."
 *     "Add the target-language IFU/label translations to start tracking…"
 *     "0/0 approved / 0 back-translation verified"
 *
 * That window is not a frame. The translations fetch keys off `docId`, which
 * only exists once the SEPARATE document read has returned, so it is a full
 * round trip during which the most prominent sentence on the screen asserted a
 * fact about a label's regulatory record that nothing had established — while
 * the table eight lines below it, reading the same request's `loading`/`error`
 * flags, correctly said "Loading translations…" or "Couldn't load translations".
 * A regulatory director could read the honest state and the false one at once.
 *
 * ── Why `assessmentRan` is the non-zero denominator ──────────────────────────
 * The only reassuring claim this lead makes is "All N translations are
 * approved", and its evidence is the denominator: every recorded translation
 * carries a status somebody moved through pending → in_progress → review →
 * approved, so one or more recorded translations is positive evidence that
 * approval coverage has something real to measure. With none recorded, 0/0 is
 * not "all approved" — nothing has been assessed, and the copy says that.
 *
 * ── Why these are behavioural ────────────────────────────────────────────────
 * Every state below is driven through the real `useLiveData` path by mocking
 * `apiRequest` alone; no assertion inspects the source. The translation rows are
 * the backend's own `labeling_translations` column shape, because the surface's
 * mapper fails closed against anything else — a partial fixture would be testing
 * the fixture rather than the gate.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Labeling } from '../surfaces/Labeling';

/** The canonical success envelope these routes return: `ok(res, rows)`. */
function ok(data: unknown, status = 200) {
  return { ok: true, status, json: async () => ({ data }) } as Response;
}
function fail(status = 503) {
  return { ok: false, status, json: async () => ({ error: { code: 'INTERNAL' } }) } as Response;
}

/** One labeling_documents row — the parent of the symbol and translation reads. */
const DOC = {
  id: 41,
  device_name: 'Aurexa CGM',
  doc_kind: 'ifu',
  version: '3.1',
  status: 'draft',
  udi_di: null,
};

/** labeling_translations rows, in the columns the route actually selects. */
const TRANS = (over: Record<string, unknown>[]) =>
  over.map((o, i) => ({
    id: 900 + i,
    labeling_document_id: DOC.id,
    language: 'de',
    translation_method: 'mt_postedited',
    back_translation_verified: false,
    status: 'pending',
    ...o,
  }));

const DOCS_URL = '/api/mdx/labeling';
const TRANS_URL = `/api/mdx/labeling/${DOC.id}/translations`;
const SYMBOLS_URL = `/api/mdx/labeling/${DOC.id}/symbols`;

/**
 * Route the three reads independently. `translations` may be a Response, a
 * rejection, or `'pending'` — a promise that never settles, which is the only
 * honest way to hold the surface in the in-flight state a real round trip
 * occupies.
 */
function routes(translations: Response | 'pending') {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const u = String(url);
    if (u === DOCS_URL) return ok([DOC]);
    if (u === SYMBOLS_URL) return ok([]);
    if (u === TRANS_URL) {
      if (translations === 'pending') return new Promise<Response>(() => {});
      return translations;
    }
    throw new Error('unexpected request: ' + u);
  });
}

function mount() {
  render(<Labeling {...({ surface: { id: 'labeling' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);
}

const body = () => document.body.textContent ?? '';

/* The three sentences the finding named, verbatim enough to catch them coming
   back in any of the states where they are untrue. */
const RECORDED_NONE = /No translations are recorded for this label yet/i;
const START_TRACKING = /start tracking back-translation QC/i;
const ZERO_COVERAGE = /0\/0 approved/i;

beforeEach(() => {
  // Braces matter: `mockReset()` returns the mock, and Vitest calls a value
  // returned from a hook as that hook's teardown — which would invoke
  // `apiRequest` itself with no arguments.
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('Labeling — the translations read has to answer before the lead speaks', () => {
  it('says nothing about the translation record while the read is in flight', async () => {
    routes('pending');
    mount();

    // Anchor on the TABLE's loading note — the one part of this section that was
    // already honest — so the assertions below run at the exact moment the
    // surface used to contradict itself. The document read has returned and the
    // translations read is in flight: this is the whole round trip, not a frame.
    await screen.findByText(/Loading translations/i);

    expect(RECORDED_NONE.test(body()), 'must not report an empty record mid-read').toBe(false);
    expect(START_TRACKING.test(body()), 'must not instruct on a record it has not read').toBe(false);
    expect(ZERO_COVERAGE.test(body()), 'must not report 0/0 coverage mid-read').toBe(false);
    // The coverage bar is the same figure drawn: an empty track reads as 0%.
    expect(document.querySelector('.lbl-cov-fill'), 'no coverage bar over an unread set').toBe(null);

    // And what IS true, in all three places that used to disagree.
    expect(/Reading the label translations/i.test(body()), 'the lead').toBe(true);
    expect(/Nothing is claimed about them until the record answers/i.test(body())).toBe(true);
    expect(/reading the translation set/i.test(body()), 'the coverage caption too').toBe(true);
  });

  it('reports a failed translations read as a failure, not as an empty label', async () => {
    routes(fail(503));
    mount();

    // Anchor on the table's error panel, already honest before this change.
    await screen.findByText(/Couldn't load translations/i);

    expect(RECORDED_NONE.test(body()), 'a failed read is not an empty record').toBe(false);
    expect(START_TRACKING.test(body())).toBe(false);
    expect(ZERO_COVERAGE.test(body()), 'a failed read is not zero approvals').toBe(false);
    expect(document.querySelector('.lbl-cov-fill')).toBe(null);

    expect(/The label translations could not be read/i.test(body()), 'the lead').toBe(true);
    expect(/This is a failed read, not an empty one/i.test(body())).toBe(true);
    expect(/coverage unknown/i.test(body()), 'the caption states the coverage is unknown').toBe(true);
    // And no internals reach the reader — the read failed with an HTTP status
    // and a path, neither of which is user copy.
    expect(/503|\/api\//.test(body()), 'no status codes or routes in the UI').toBe(false);
  });

  it('still says the record is empty when the read confirms it is empty', async () => {
    routes(ok([]));
    mount();

    await screen.findByText(/No translations yet/i);

    // Even here — the one state where "nothing is recorded" IS true — 0/0 is
    // not a coverage measurement, and the caption said it was.
    expect(ZERO_COVERAGE.test(body()), '0/0 is not a coverage figure').toBe(false);
    expect(/no translations recorded yet/i.test(body()), 'the caption says what it means').toBe(true);

    // And the empty-record claim stays reachable, now naming itself as the
    // result of a completed read rather than as the default.
    expect(RECORDED_NONE.test(body()), 'a confirmed empty record still says so').toBe(true);
    expect(/was read and is empty/i.test(body())).toBe(true);
    expect(/Loading translations/i.test(body())).toBe(false);
    expect(/could not be read/i.test(body())).toBe(false);
  });

  /**
   * ── The over-correction guard ──────────────────────────────────────────────
   * A gate that can never read clear is the same defect wearing a different
   * face. With translations recorded and every one approved, the surface must
   * still make its reassuring claim — headline, coverage caption, coverage bar
   * and the 'good' tone AnswerLead provides.
   */
  it('still reaches "all approved" when the read genuinely earns it', async () => {
    routes(ok(TRANS([
      { language: 'de', status: 'approved', back_translation_verified: true },
      { language: 'fr', status: 'approved', back_translation_verified: true },
    ])));
    mount();

    await waitFor(() => expect(/All 2 translations are approved/i.test(body())).toBe(true));

    expect(/2\/2 approved \/ 2 back-translation verified/i.test(body()), 'the real caption').toBe(true);
    expect(RECORDED_NONE.test(body())).toBe(false);
    expect(/could not be read|reading the translation set/i.test(body())).toBe(false);
    // The bar is drawn, and the lead carries the reassuring tone.
    expect((document.querySelector('.lbl-cov-fill') as HTMLElement | null)?.style.width).toBe('100%');
    expect(document.querySelector('.al-lead.al-good'), 'the good-tone lead is reachable').toBeTruthy();
  });

  it('reports partial coverage from the real rows', async () => {
    routes(ok(TRANS([
      { language: 'de', status: 'approved', back_translation_verified: true },
      { language: 'fr', status: 'review' },
    ])));
    mount();

    await waitFor(() => expect(/still short of approved/i.test(body())).toBe(true));

    expect(/1\/2 approved \/ 1 back-translation verified/i.test(body())).toBe(true);
    expect(document.querySelector('.al-lead.al-good'), 'not clear while one is short').toBe(null);
  });

  /**
   * The mapper fails closed to null for rows that do not carry the
   * labeling_translations signature, and the old code fed that null straight
   * into EMPTY_TRANS — so a 200 carrying rows the surface cannot interpret was
   * reported as a label with no translations. It is a read that produced no
   * answer, and it is now stated as one.
   */
  it('does not report an uninterpretable payload as an empty record', async () => {
    routes(ok([{ id: 1, note: 'not a translation row' }]));
    mount();

    // Wait for the read to settle before judging what it says about it.
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', TRANS_URL));
    await waitFor(() =>
      expect(/could not be read|No translations yet/i.test(body()), 'the read settled').toBe(true),
    );

    expect(RECORDED_NONE.test(body()), 'an unreadable payload is not an empty record').toBe(false);
    expect(ZERO_COVERAGE.test(body())).toBe(false);
    expect(/The label translations could not be read/i.test(body())).toBe(true);
  });
});
