/**
 * A failed EUDAMED, EU CTIS or EMA EPAR search is an error, not "no matches".
 *
 * What the connectors used to do: EudamedConnector and EuCtisConnector mapped
 * the governed client's result list whatever its status, so an `unavailable`
 * result (HTTP error, unexpected body, network failure) became `[]`; and
 * EMAEPARConnector fetched the API itself, answering a 404 or a body without a
 * results array with `[]`. searchConnectors reported such a connector as a
 * search that ran and found nothing, and a deep-research job recorded it as
 * 0 results. Now each connector searches through its governed client and throws
 * the client's message when the result is unavailable. The connectors, the
 * clients and the registry are real; only `fetch` is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { EudamedConnector } from '../eudamed.js';
import { EuCtisConnector } from '../eu-ctis.js';
import { EMAEPARConnector } from '../ema-epar.js';
import { searchConnectors } from '../connector-registry.js';
import type { DataConnector } from '../connector-interface.js';

const realFetch = globalThis.fetch;
let answer: () => Response | Promise<Response>;
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => answer()) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const CONNECTORS: Array<{ id: string; make: () => DataConnector; match: unknown; expectId: string }> = [
  {
    id: 'eudamed',
    make: () => new EudamedConnector(),
    match: { basicUdiDiData: { code: 'B-UDI-1' }, tradeName: 'Acme Stent' },
    expectId: 'eudamed:B-UDI-1',
  },
  {
    id: 'eu_ctis',
    make: () => new EuCtisConnector(),
    match: { ctNumber: '2022-500001-30-00', ctTitle: 'A phase 3 trial' },
    expectId: 'eu_ctis:2022-500001-30-00',
  },
  {
    id: 'ema_epar',
    make: () => new EMAEPARConnector(),
    match: { productNumber: 'EMEA/H/C/003820', medicineName: 'Keytruda' },
    expectId: 'ema:EMEA/H/C/003820',
  },
];

describe.each(CONNECTORS)('$id connector: a failed search is an error', ({ make, match, expectId }) => {
  const search = () => make().search({ keywords: ['pembrolizumab'] });

  it('an HTTP error is thrown, not returned as zero matches', async () => {
    answer = () => new Response('not found', { status: 404 });
    await expect(search(), 'a failed search was returned as zero matches').rejects.toThrow(/HTTP 404/);
  });

  it('a body without a results array is thrown, not returned as zero matches', async () => {
    answer = () => json({ error: 'maintenance' });
    await expect(search(), 'an unreadable body was returned as zero matches').rejects.toThrow(/unexpected shape/);
  });

  it('a network failure is thrown', async () => {
    answer = () => {
      throw new TypeError('fetch failed');
    };
    await expect(search()).rejects.toThrow(/fetch failed/);
  });

  it('control: a search that ran and matched nothing is an empty result', async () => {
    answer = () => json({ content: [], totalElements: 0 });
    await expect(search()).resolves.toEqual([]);
  });

  it('control: a match is mapped', async () => {
    answer = () => json({ content: [match], totalElements: 1 });
    const results = await search();
    expect(results.map(r => r.id)).toEqual([expectId]);
  });
});

describe('searchConnectors: the caller is told the search failed', () => {
  it.each(CONNECTORS.map(c => c.id))('%s: an HTTP error is reported as an error, with no results', async id => {
    answer = () => new Response('unavailable', { status: 404 });
    const [r] = await searchConnectors(1, [id], { keywords: ['pembrolizumab'] });
    expect(r.error, 'the failed search was reported as a search that found nothing').toMatch(/HTTP 404/);
    expect(r.results).toEqual([]);
  });
});
