// @vitest-environment jsdom
/**
 * The predicate of record — a claim, made by a person, on the record.
 *
 * `regulatory_programs.predicate_devices[0]` is what the official FDA eSTAR's
 * predicate submission number and trade name are filled from
 * (server/services/pathway-engines/estar/estar-administrative-data.ts). Until
 * this change nothing a user could click wrote that column: the predicate
 * table's checkboxes drove a local SE-comparison selection that was never
 * persisted, so on a filed form those two fields traced back to a seed script
 * and to no human action at all
 * (docs/reports/device-market-readiness-2026-09-07.md).
 *
 * Three properties are load-bearing here:
 *
 *   1. claiming a predicate PUTs it to the governed profile route, which is
 *      role-gated and audited;
 *   2. an EXAMPLE row can never be claimed — sample mode exists so a demo can
 *      populate a screen, not so a fixture K-number can be written into a
 *      submission;
 *   3. what is on file is stated where the candidates are, so an operator can
 *      see which device the form will carry before it is built.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { K510Surface, reseedSelection } from '../surfaces/K510Surface';
import { setSampleMode } from '../lib/sampleMode';
import type { Program } from '../data/programs';

const PROGRAM: Program = {
  id: 'a2b4c6d8-0000-0000-0000-000000000001',
  title: 'Acme Pulse Oximeter',
  code: 'AP-1',
  pathway: 'k510',
  stage: 'Testing',
  stageIdx: 2,
  readiness: 30,
  status: 'active',
  lead: 'R. Lee',
  owners: ['RL'],
  nextBlocker: null,
  dueLabel: 'FDA filing · 120 days',
  dueTone: 'ok',
  lastActivity: '1d ago',
  meta: '',
  productType: 'device',
};

/** One live candidate from the predicate-intelligence shadow service. */
const CANDIDATE = {
  k_number: 'K221847',
  device_name: 'Dexcom G7 CGM System',
  applicant: 'Dexcom, Inc.',
  decision_date: '2022-12-08',
  product_code: 'MDS',
  match_score: 94,
  difference_count: 3,
  status: 'candidate',
};

interface StubOptions {
  /** What GET /profile reports as already claimed. */
  onFile?: unknown;
  /** 503 the shadow predicate service, so the openFDA fallback takes over. */
  shadowDown?: boolean;
}

/** Records every PUT body so a test can assert what was actually claimed. */
function stubApi(options: StubOptions = {}) {
  const puts: Array<{ url: string; body: unknown }> = [];
  const profile = {
    id: PROGRAM.id,
    name: PROGRAM.title,
    code: PROGRAM.code,
    productName: 'Acme Pulse Oximeter',
    productType: 'device',
    deviceClass: 'II',
    regulatoryPath: '510k',
    productCode: 'DQA',
    intendedUse: null,
    indication: null,
    predicateDevices: options.onFile ?? [],
    commonName: null,
    classificationName: null,
    regulationNumber: null,
    associatedProductCodes: null,
    indicationsForUseCitation: null,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PUT') {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return json({ profile });
      }
      if (url.includes('/api/510k/device/profile')) return json({ profile });
      if (url.includes('/api/510k/device/predicates')) {
        return json({
          available: true,
          reduced: true,
          source: 'openfda',
          results: [
            {
              kNumber: 'K193536',
              deviceName: 'Senseonics Eversense E3',
              applicant: 'Senseonics, Inc.',
              productCode: 'MDS',
              decisionDate: '2022-02-11T00:00:00',
              decisionCode: 'SESE',
              clearanceType: 'Traditional',
            },
          ],
        });
      }
      if (url.includes('/api/predicate-intelligence/candidates')) {
        return options.shadowDown ? json({}, 503) : json({ candidates: [CANDIDATE] });
      }
      if (url.includes('/api/predicate-intelligence/se-matrix')) return json({}, 503);
      return json({ data: [] });
    }),
  );
  return puts;
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  setSampleMode(false);
  vi.unstubAllGlobals();
});

/**
 * The surface has to SETTLE when predicate intelligence is up.
 *
 * `useK510Predicates` re-derives its rows array from the payload on every
 * render, so the effect that re-seeds the SE-comparison selection re-runs on
 * every render too. Handing it back a fresh Set each time re-rendered the
 * 510(k) screen forever — for exactly as long as the shadow service stayed
 * healthy. Every test that existed before this one either had no program or a
 * 503 from the shadow service, so the live path was never rendered and the
 * loop was never seen. Returning the SAME set for an unchanged selection is
 * what stops it, so that identity is asserted, not assumed.
 */
describe('reseedSelection — an unchanged selection is the same object', () => {
  const rows = [{ k: 'K221847' }, { k: 'K213163' }];

  it('returns the identical set when every selected row survives', () => {
    const prev = new Set(['K221847']);
    expect(reseedSelection(prev, rows)).toBe(prev);
  });

  it('returns the identical set when the whole selection survives', () => {
    const prev = new Set(['K221847', 'K213163']);
    expect(reseedSelection(prev, rows)).toBe(prev);
  });

  it('drops a K-number the new list no longer offers', () => {
    const next = reseedSelection(new Set(['K221847', 'K999999']), rows);
    expect([...next]).toEqual(['K221847']);
  });

  it('falls back to the top candidate when nothing survives', () => {
    expect([...reseedSelection(new Set(['K999999']), rows)]).toEqual(['K221847']);
  });

  it('leaves an empty candidate list alone rather than clearing the selection', () => {
    const prev = new Set(['K221847']);
    expect(reseedSelection(prev, [])).toBe(prev);
  });
});

describe('claiming a predicate of record', () => {
  it('PUTs the claimed candidate to the governed device profile', async () => {
    const puts = stubApi();
    wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);

    const claim = await screen.findByTitle(/Claim K221847 .* as the predicate of record/);
    fireEvent.click(claim);

    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].url).toContain('/api/510k/device/profile?ident=');
    expect(puts[0].body).toEqual({
      predicateDevices: [
        {
          id: 'K221847',
          name: 'Dexcom G7 CGM System',
          kNumber: 'K221847',
          manufacturer: 'Dexcom, Inc.',
          clearanceDate: '2022-12-08',
          productCode: 'MDS',
        },
      ],
    });
  });

  it('claims a reduced openFDA clearance too — it is a real FDA record', async () => {
    const puts = stubApi({ shadowDown: true });
    wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);

    const claim = await screen.findByTitle(/Claim K193536 .* as the predicate of record/);
    fireEvent.click(claim);

    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].body).toEqual({
      predicateDevices: [
        {
          id: 'K193536',
          name: 'Senseonics Eversense E3',
          kNumber: 'K193536',
          manufacturer: 'Senseonics, Inc.',
          clearanceDate: '2022-02-11',
          productCode: 'MDS',
        },
      ],
    });
  });

  it('states what is already on file, and withdraws it on request', async () => {
    const puts = stubApi({
      onFile: [{ id: 'K182764', name: 'Dexcom G6 CGM System', kNumber: 'K182764' }],
    });
    const { container } = wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);

    await waitFor(() =>
      expect(container.textContent).toContain('Predicate of record: K182764 — Dexcom G6 CGM System'),
    );

    fireEvent.click(screen.getByTitle('Withdraw the predicate of record'));
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].body).toEqual({ predicateDevices: null });
  });

  it('says so when nothing is claimed, rather than leaving the form silent', async () => {
    stubApi();
    const { container } = wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() =>
      expect(container.textContent).toContain(
        'No predicate of record — the eSTAR predicate fields stay blank',
      ),
    );
  });

  it('reports stored entries it cannot read instead of naming the first it can', async () => {
    stubApi({ onFile: ['K182234', { id: 'K191435', name: 'Readable One' }] });
    const { container } = wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);
    await waitFor(() => expect(container.textContent).toMatch(/cannot read/i));
    expect(container.textContent).not.toContain('Predicate of record: K191435');
  });
});

describe('example rows are never claimable', () => {
  it('refuses to claim a fixture K-number, and says why', async () => {
    setSampleMode(true);
    const puts = stubApi({ shadowDown: true });
    wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);

    /* Every fixture row carries the same refusal — none of them is claimable. */
    const refused = await screen.findAllByTitle(
      'Example rows cannot be claimed as the predicate of record',
    );
    expect(refused.length).toBeGreaterThan(0);
    for (const button of refused) expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(refused[0]);
    await waitFor(() => expect(puts.length).toBe(0));
  });
});
