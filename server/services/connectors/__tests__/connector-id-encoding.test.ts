/**
 * Connector fetch-by-id encoding contract.
 *
 * Each connector's fetch(resourceId) interpolates a caller-supplied id into the
 * request URL. These tests lock that the id is percent-encoded so a raw
 * '/', '?', '#', '&' or space cannot escape a path segment or inject query
 * params (the same hazard fixed for the openFDA search() builder).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClinicalTrialsGovConnector } from '../clinical-trials-gov';
import { PubMedConnector } from '../pubmed';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function captureUrl(body: { json?: any; text?: string } = {}): { url: () => string } {
  let captured = '';
  globalThis.fetch = vi.fn(async (u: any) => {
    captured = String(u);
    return {
      ok: true,
      json: async () => body.json ?? {},
      text: async () => body.text ?? '<xml/>',
    } as any;
  }) as any;
  return { url: () => captured };
}

describe('ClinicalTrialsGovConnector.fetch — path id encoding', () => {
  it('encodes a resource id so it cannot escape the /studies/ path segment', async () => {
    const cap = captureUrl({ json: { protocolSection: {} } });
    await new ClinicalTrialsGovConnector().fetch('NCT01/../admin?x=1');
    const url = cap.url();
    expect(url).toContain('/studies/NCT01%2F..%2Fadmin%3Fx%3D1');
    expect(url).not.toContain('/studies/NCT01/../admin'); // raw path traversal must not survive
  });

  it('leaves a clean NCT id unchanged', async () => {
    const cap = captureUrl({ json: { protocolSection: {} } });
    await new ClinicalTrialsGovConnector().fetch('NCT01234567');
    expect(cap.url()).toContain('/studies/NCT01234567');
  });
});

describe('PubMedConnector.fetch — query id encoding', () => {
  it('encodes the pmid so a raw & cannot inject query params', async () => {
    const cap = captureUrl({ text: '<xml/>' });
    await new PubMedConnector().fetch('PMID:123&db=evil');
    const url = cap.url();
    expect(url).toContain('id=123%26db%3Devil');
    // the injected token must not appear as its own raw query parameter
    expect(url.split('&retmode=xml')[0]).not.toContain('&db=evil');
  });

  it('leaves a clean pmid unchanged', async () => {
    const cap = captureUrl({ text: '<xml/>' });
    await new PubMedConnector().fetch('PMID:38000000');
    expect(cap.url()).toContain('id=38000000&retmode=xml');
  });
});
