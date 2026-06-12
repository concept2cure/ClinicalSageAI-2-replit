/**
 * Tests for the sponsored-programs connectors (Grants.gov, SAM.gov exclusions,
 * Ellucian Banner/Ethos). Validates request shaping, response parsing, the
 * foreign/exclusion screening semantics, auth requirements, and the error
 * paths — all against a mocked `fetch`. No real network calls are made (these
 * hosts are also egress-blocked in CI/sandbox).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrantsGovConnector } from '../grants-gov';
import { SamExclusionsConnector } from '../sam-exclusions';
import { EllucianBannerConnector } from '../ellucian-banner';

function jsonResponse(body: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) } as Response;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('GrantsGovConnector', () => {
  it('shapes a Search2 POST and maps oppHits to results', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: any) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(jsonResponse({ data: { oppHits: [
        { id: '350001', number: 'PA-26-001', title: 'Cancer Moonshot', agency: 'NIH', oppStatus: 'posted', closeDate: '12/01/2026' },
      ] } }));
    }));
    const c = new GrantsGovConnector();
    const res = await c.search({ keywords: ['cancer'], limit: 10 });
    expect(calls[0].url).toContain('/search2');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ rows: 10 });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ id: '350001', sourceConnector: 'grants_gov' });
    expect(res[0].metadata.opportunityNumber).toBe('PA-26-001');
    expect(res[0].url).toContain('350001');
  });

  it('throws on a non-ok Search2 response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({}, 500))));
    await expect(new GrantsGovConnector().search({ keywords: ['x'] })).rejects.toThrow(/Grants.gov API error: 500/);
  });

  it('requires no credentials (authenticate is a no-op)', async () => {
    await expect(new GrantsGovConnector().authenticate({})).resolves.toBeUndefined();
  });
});

describe('SamExclusionsConnector', () => {
  it('refuses to authenticate without an API key', async () => {
    await expect(new SamExclusionsConnector().authenticate({})).rejects.toThrow(/API key/);
  });

  it('refuses to screen before authentication', async () => {
    await expect(new SamExclusionsConnector().search({ sponsor: 'Acme' })).rejects.toThrow(/not authenticated/);
  });

  it('requires a party name to screen', async () => {
    const c = new SamExclusionsConnector();
    await c.authenticate({ apiKey: 'k' });
    await expect(c.search({})).rejects.toThrow(/party name/);
  });

  it('a clean screen returns no matches (empty exclusion list)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ excludedEntity: [] }))));
    const c = new SamExclusionsConnector();
    await c.authenticate({ apiKey: 'k' });
    expect(await c.search({ sponsor: 'Clean Corp' })).toEqual([]);
  });

  it('maps an exclusion hit to an EXCLUSION MATCH result and passes the key', async () => {
    let seenUrl = '';
    vi.stubGlobal('fetch', vi.fn((url: string) => { seenUrl = String(url); return Promise.resolve(jsonResponse({ excludedEntity: [
      { ueiSAM: 'ABC123', exclusionDetails: { exclusionName: 'Bad Actor LLC', exclusionType: 'Ineligible', classificationType: 'Firm', excludingAgencyName: 'HHS' } },
    ] })); }));
    const c = new SamExclusionsConnector();
    await c.authenticate({ apiKey: 'secret-key' });
    const res = await c.search({ sponsor: 'Bad Actor LLC' });
    expect(seenUrl).toContain('api_key=secret-key');
    expect(seenUrl).toContain('exclusionName=Bad+Actor+LLC');
    expect(res[0].title).toMatch(/EXCLUSION MATCH: Bad Actor LLC/);
    expect(res[0].metadata.excludingAgency).toBe('HHS');
  });
});

describe('EllucianBannerConnector', () => {
  it('requires baseUrl and apiKey', async () => {
    await expect(new EllucianBannerConnector().authenticate({ apiKey: 'k' })).rejects.toThrow(/baseUrl and apiKey/);
  });

  it('exchanges the API key for a token then reads the resource (persons by default)', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: any) => {
      const u = String(url); calls.push({ u, init });
      if (u.endsWith('/auth')) return Promise.resolve(jsonResponse('session-token-xyz'));
      return Promise.resolve(jsonResponse([{ id: 'g1', names: [{ fullName: 'Ada Lovelace' }] }]));
    }));
    const c = new EllucianBannerConnector();
    await c.authenticate({ baseUrl: 'https://integrate.example.com/', apiKey: 'api-key' });
    const res = await c.search({ keywords: ['person'], limit: 5 });
    // First call authenticates with the API key, second carries the bearer token.
    expect(calls[0].u).toBe('https://integrate.example.com/auth');
    expect(calls[0].init.headers.Authorization).toBe('Bearer api-key');
    expect(calls[1].u).toContain('/api/persons');
    expect(calls[1].init.headers.Authorization).toBe('Bearer session-token-xyz');
    expect(res[0]).toMatchObject({ id: 'g1', sourceConnector: 'ellucian_banner' });
    expect(res[0].title).toMatch(/person: Ada Lovelace/);
  });

  it('routes grant/award keywords to the grants resource', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = String(url); seen.push(u);
      if (u.endsWith('/auth')) return Promise.resolve(jsonResponse('t'));
      return Promise.resolve(jsonResponse([]));
    }));
    const c = new EllucianBannerConnector();
    await c.authenticate({ baseUrl: 'https://x', apiKey: 'k' });
    await c.search({ keywords: ['grant', 'award'] });
    expect(seen.some((u) => u.includes('/api/grants'))).toBe(true);
  });

  it('surfaces an auth failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse('nope', 401))));
    const c = new EllucianBannerConnector();
    await c.authenticate({ baseUrl: 'https://x', apiKey: 'bad' });
    await expect(c.search({ keywords: ['person'] })).rejects.toThrow(/auth failed: 401/);
  });
});
