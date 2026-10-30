/**
 * An EU registry answering 404, or a body with no results array, is
 * 'unavailable' — not "ok, zero matches".
 *
 * What the code used to do: searchEmaEpar, searchEuCtis and searchEudamed
 * mapped HTTP 404 to `{ status: 'ok', totalCount: 0, [] }`. That 404 means
 * "no match" is documented for openFDA only; for these three endpoints the sole
 * support was a code comment (EUDAMED) and mocked tests. If a path is wrong or
 * retired, every search answered "none found", AnA reported zero EU medicines,
 * trials or devices, and the EUDAMED / CTIS connector health checks (which call
 * these clients) reported healthy. A 200 whose body carried none of the
 * expected result arrays was read as zero results the same way.
 *
 * No live contract test covers a zero-match 404 on any of the three, so a 404
 * is now 'unavailable' with the status in the message, and so is a body the
 * client cannot find its results in.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchEmaEpar, clearEmaEparCache } from '../ema-epar-client';
import { searchEuCtis } from '../eu-ctis-client';
import { searchEudamed } from '../eudamed-client';

const notFound = () => ({ ok: false, status: 404, json: async () => ({}) }) as any;
const okBody = (json: unknown) => new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json' } });

const clients = [
  ['EMA EPAR', () => searchEmaEpar({ query: 'examplemab' })],
  ['EU CTIS', () => searchEuCtis({ query: 'NSCLC' })],
  ['EUDAMED', () => searchEudamed({ query: 'stent' })],
] as const;

describe('EU registry clients: a failed read is unavailable, not zero matches', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    clearEmaEparCache();
    vi.restoreAllMocks();
  });

  it.each(clients)('%s: HTTP 404 is unavailable, with the status named', async (_name, search) => {
    global.fetch = vi.fn().mockResolvedValue(notFound()) as any;
    const r = await search();
    expect(r.status, 'a 404 was reported as a successful zero-match search').toBe('unavailable');
    expect(r.message).toMatch(/HTTP 404/);
  });

  it.each(clients)('%s: a 200 body with no results array is unavailable', async (_name, search) => {
    global.fetch = vi.fn(async () => okBody({ error: 'unexpected envelope' })) as any;
    const r = await search();
    expect(r.status, 'an unrecognised body was reported as a successful zero-match search').toBe('unavailable');
    expect(r.message).toMatch(/no results array|unexpected/i);
  });

  it.each(clients)('%s: an explicit empty results array is still ok with zero matches', async (_name, search) => {
    global.fetch = vi.fn(async () => okBody({ content: [], data: [], totalElements: 0 })) as any;
    const r = await search();
    expect(r.status).toBe('ok');
    expect(r.totalCount).toBe(0);
  });
});
