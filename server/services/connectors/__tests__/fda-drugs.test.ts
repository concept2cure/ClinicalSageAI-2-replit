/**
 * FDA Drugs@FDA connector — openFDA search builder.
 *
 * The search param is interpolated into the request URL. These tests lock the
 * encoding contract (user values percent-encoded so spaces/&/#/quotes can't
 * break the URL or inject params) while the field/quote/`+AND+` grammar stays
 * literal.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildOpenFdaDrugSearch, FDADrugsConnector } from '../fda-drugs';

describe('buildOpenFdaDrugSearch', () => {
  it('percent-encodes spaces in a value (no raw space in the URL)', () => {
    const s = buildOpenFdaDrugSearch({ indication: 'non small cell lung cancer' });
    expect(s).toBe('products.active_ingredients.name:"non%20small%20cell%20lung%20cancer"');
    expect(s).not.toContain(' ');
  });

  it('encodes an ampersand so it cannot inject a new query parameter', () => {
    const s = buildOpenFdaDrugSearch({ sponsor: 'A&B Pharma' });
    expect(s).toContain('sponsor_name:"A%26B%20Pharma"');
    expect(s).not.toContain('&'); // a raw & would split the URL query string
  });

  it('strips embedded double quotes that would break the phrase', () => {
    const s = buildOpenFdaDrugSearch({ indication: 'a"b' });
    // the inner quote is removed (→ space → encoded), phrase quotes remain literal
    expect(s).toBe('products.active_ingredients.name:"a%20b"');
  });

  it('joins indication and sponsor with +AND+', () => {
    const s = buildOpenFdaDrugSearch({ indication: 'nsclc', sponsor: 'Acme' });
    expect(s).toBe(
      'products.active_ingredients.name:"nsclc"+AND+sponsor_name:"Acme"',
    );
  });

  it('builds an AND-joined keyword group and drops blanks', () => {
    const s = buildOpenFdaDrugSearch({ keywords: ['pembrolizumab', '  ', 'label'] });
    expect(s).toBe('"pembrolizumab"+AND+"label"');
  });

  it('returns match-all when no terms are supplied', () => {
    expect(buildOpenFdaDrugSearch({})).toBe('*');
    expect(buildOpenFdaDrugSearch({ indication: '   ' })).toBe('*');
  });
});

describe('FDADrugsConnector.fetch — application_number encoding', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function captureUrl(): { url: () => string } {
    let captured = '';
    globalThis.fetch = vi.fn(async (u: any) => {
      captured = String(u);
      return { ok: true, json: async () => ({ results: [{}] }) } as any;
    }) as any;
    return { url: () => captured };
  }

  it('percent-encodes a space/&/# in the resource id (no raw chars that break or inject the query)', async () => {
    const cap = captureUrl();
    await new FDADrugsConnector().fetch('fda:NDA 021368&x#y');
    const url = cap.url();
    expect(url).toContain('application_number:"NDA%20021368%26x%23y"');
    // The raw value must not appear unencoded in the search clause.
    expect(url).not.toContain('application_number:"NDA 021368');
    // A raw & would split the query string and inject params.
    expect(url.split('&limit=1')[0]).not.toContain('&x');
  });

  it('strips an embedded double quote so the phrase cannot be broken out of', async () => {
    const cap = captureUrl();
    await new FDADrugsConnector().fetch('fda:A"B');
    // encodeOpenFdaValue replaces the inner quote with a space → encoded.
    expect(cap.url()).toContain('application_number:"A%20B"');
  });
});
