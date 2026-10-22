/**
 * A connector result carries its position in the source's own response
 * (`sourceRank`, 1-based) — never a relevance score.
 *
 * Every connector set `relevanceScore: 1 - i * k`, with k anywhere from 0.01 to
 * 0.05 by connector: the result's list position dressed as a relevance score,
 * on a slope that differed per source. Deep research and the connected-
 * repository search then ordered results from DIFFERENT sources by it, and AnA
 * was handed the number as a "relevanceScore". No connector computes relevance.
 * The connectors and governed clients here are real; only `fetch` is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { ClinicalTrialsGovConnector } from '../clinical-trials-gov.js';
import { EudamedConnector } from '../eudamed.js';
import { EuCtisConnector } from '../eu-ctis.js';
import { EMAEPARConnector } from '../ema-epar.js';
import type { DataConnector } from '../connector-interface.js';

const realFetch = globalThis.fetch;
let body: unknown;

beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  ) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const CASES: Array<{ id: string; make: () => DataConnector; answer: unknown }> = [
  {
    id: 'clinical_trials_gov',
    make: () => new ClinicalTrialsGovConnector(),
    answer: {
      studies: ['NCT00000001', 'NCT00000002', 'NCT00000003'].map((nctId) => ({
        protocolSection: { identificationModule: { nctId, briefTitle: nctId } },
      })),
    },
  },
  {
    id: 'eudamed',
    make: () => new EudamedConnector(),
    answer: {
      content: ['B-1', 'B-2', 'B-3'].map((code) => ({ basicUdiDiData: { code }, tradeName: code })),
      totalElements: 3,
    },
  },
  {
    id: 'eu_ctis',
    make: () => new EuCtisConnector(),
    answer: {
      content: ['2022-500001-30-00', '2022-500002-30-00', '2022-500003-30-00'].map((ctNumber) => ({
        ctNumber,
        ctTitle: ctNumber,
      })),
      totalElements: 3,
    },
  },
  {
    id: 'ema_epar',
    make: () => new EMAEPARConnector(),
    answer: {
      content: ['EMEA/H/C/1', 'EMEA/H/C/2', 'EMEA/H/C/3'].map((productNumber) => ({
        productNumber,
        medicineName: productNumber,
      })),
      totalElements: 3,
    },
  },
];

describe.each(CASES)('$id connector: a result states its position, not a relevance', ({ make, answer }) => {
  it('numbers results 1..n in the order the source returned them', async () => {
    body = answer;
    const results = await make().search({ keywords: ['pembrolizumab'] });
    expect(results).toHaveLength(3);
    expect(results.map((r) => (r as unknown as { sourceRank?: number }).sourceRank)).toEqual([1, 2, 3]);
  });

  it('carries no relevance score', async () => {
    body = answer;
    const results = await make().search({ keywords: ['pembrolizumab'] });
    for (const r of results) expect(r).not.toHaveProperty('relevanceScore');
  });
});
