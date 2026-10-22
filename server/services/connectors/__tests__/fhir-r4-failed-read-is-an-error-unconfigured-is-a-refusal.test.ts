/**
 * A failed FHIR read is an error, and an unconfigured connector refuses.
 *
 * What the connector used to do (until 2026-10-22): search() returned [] when
 * no base URL was configured, and turned each resource type whose read failed
 * (an HTTP error, a network failure, a body that is not a Bundle) into [],
 * returning the other types' results as the whole answer. A caller could not
 * tell "the server has no matching ResearchStudy" from "the ResearchStudy read
 * failed", which is what the EU connectors stopped doing
 * (eu-connectors-failed-search-is-an-error-not-no-matches.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../../utils/ssrfGuard.js', () => ({ assertSafePublicUrl: () => undefined }));
vi.mock('../../../utils/safeFetch.js', () => ({ safeFetch: (url: string, init: unknown) => h.fetch(url, init) }));

import { FHIRR4Connector } from '../fhir-r4.js';

const bundle = (entries: unknown[]) =>
  new Response(JSON.stringify({ resourceType: 'Bundle', entry: entries.map(resource => ({ resource })) }), { status: 200 });

async function configured() {
  const c = new FHIRR4Connector();
  await c.authenticate({ baseUrl: 'https://fhir.example.org/r4', apiKey: 'token' });
  return c;
}

/** ResearchStudy and DocumentReference are searched for a generic query. */
const answer = (byType: Record<string, () => Response>) => {
  h.fetch.mockImplementation(async (url: string) => {
    const type = new URL(url).pathname.split('/').pop() ?? '';
    const make = byType[type];
    if (!make) throw new Error(`unexpected ${url}`);
    return make();
  });
};

beforeEach(() => {
  h.fetch.mockReset();
});

describe('FHIR R4 search', () => {
  it('refuses when not configured, rather than answering no matches', async () => {
    await expect(new FHIRR4Connector().search({}), 'an unconfigured connector answered []').rejects.toThrow(/not configured/);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('throws when one resource type answers an HTTP error, naming it', async () => {
    const c = await configured();
    answer({
      ResearchStudy: () => new Response('down', { status: 503 }),
      DocumentReference: () => bundle([{ resourceType: 'DocumentReference', id: 'd1', description: 'Protocol' }]),
    });
    await expect(c.search({}), 'a failed ResearchStudy read was dropped from the answer').rejects.toThrow(/ResearchStudy.*503/);
  });

  it('throws on a network failure and on a body that is not a Bundle', async () => {
    const c = await configured();
    answer({ ResearchStudy: () => { throw new TypeError('fetch failed'); }, DocumentReference: () => bundle([]) });
    await expect(c.search({})).rejects.toThrow(/ResearchStudy/);
    answer({ ResearchStudy: () => new Response('{"resourceType":"OperationOutcome"}', { status: 200 }), DocumentReference: () => bundle([]) });
    await expect(c.search({})).rejects.toThrow(/ResearchStudy/);
  });

  it('control: every read succeeded and matched nothing is an empty result', async () => {
    const c = await configured();
    answer({ ResearchStudy: () => bundle([]), DocumentReference: () => bundle([]) });
    await expect(c.search({})).resolves.toEqual([]);
  });

  it('control: matches are mapped', async () => {
    const c = await configured();
    answer({
      ResearchStudy: () => bundle([{ resourceType: 'ResearchStudy', id: 's1', title: 'A phase 3 trial' }]),
      DocumentReference: () => bundle([]),
    });
    expect((await c.search({})).map(r => r.id)).toEqual(['fhir:ResearchStudy/s1']);
  });
});
