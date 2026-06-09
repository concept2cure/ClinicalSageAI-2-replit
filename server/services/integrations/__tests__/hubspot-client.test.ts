/**
 * HubSpot CRM client — unit tests (fetch mocked).
 * Verifies the configured gate, search request shape, defensive normalization,
 * title derivation, record-URL construction, and HTTP error propagation.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isHubSpotConfigured,
  recordTitle,
  buildRecordUrl,
  searchHubSpotCrm,
} from '../hubspot-client';

describe('hubspot-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    delete process.env.HUBSPOT_PORTAL_ID;
    delete process.env.HUBSPOT_API_BASE_URL;
    vi.restoreAllMocks();
  });

  describe('recordTitle', () => {
    it('derives a sensible title per object', () => {
      expect(recordTitle('contacts', { firstname: 'Jane', lastname: 'Doe' })).toBe('Jane Doe');
      expect(recordTitle('contacts', { email: 'x@co.com' })).toBe('x@co.com');
      expect(recordTitle('companies', { name: 'Acme' })).toBe('Acme');
      expect(recordTitle('deals', { dealname: 'Phase 3 services' })).toBe('Phase 3 services');
      expect(recordTitle('contacts', {})).toBe('(unnamed contact)');
    });
  });

  describe('buildRecordUrl', () => {
    it('builds a record URL only when the portal id is set', () => {
      expect(buildRecordUrl('contacts', '123')).toBeUndefined();
      process.env.HUBSPOT_PORTAL_ID = '999';
      expect(buildRecordUrl('contacts', '123')).toBe(
        'https://app.hubspot.com/contacts/999/record/0-1/123'
      );
      expect(buildRecordUrl('deals', '5')).toBe('https://app.hubspot.com/contacts/999/record/0-3/5');
    });
  });

  describe('isHubSpotConfigured', () => {
    it('reflects the access token presence', () => {
      expect(isHubSpotConfigured()).toBe(false);
      process.env.HUBSPOT_ACCESS_TOKEN = 'pat-xxx';
      expect(isHubSpotConfigured()).toBe(true);
    });
  });

  describe('searchHubSpotCrm', () => {
    it('returns a not-configured note (no fetch) when the token is missing', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock as any;
      const res = await searchHubSpotCrm({ query: 'acme' });
      expect(res.configured).toBe(false);
      expect(res.note).toMatch(/not connected/i);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs the search and normalizes results', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'pat-xxx';
      process.env.HUBSPOT_PORTAL_ID = '999';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          total: 2,
          results: [
            { id: '1', properties: { firstname: 'Jane', lastname: 'Doe', email: 'jane@acme.com', company: 'Acme' } },
          ],
        }),
      });
      global.fetch = fetchMock as any;

      const res = await searchHubSpotCrm({ query: 'jane', object: 'contacts', limit: 5 });
      expect(res.configured).toBe(true);
      expect(res.total).toBe(2);
      expect(res.records[0].title).toBe('Jane Doe');
      expect(res.records[0].url).toBe('https://app.hubspot.com/contacts/999/record/0-1/1');
      expect(res.records[0].properties.email).toBe('jane@acme.com');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/search');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer pat-xxx');
      const body = JSON.parse(init.body);
      expect(body.query).toBe('jane');
      expect(body.limit).toBe(5);
      expect(body.properties).toContain('email');
    });

    it('defaults to contacts, honors base-URL override, and throws on HTTP error', async () => {
      process.env.HUBSPOT_ACCESS_TOKEN = 'pat-xxx';
      process.env.HUBSPOT_API_BASE_URL = 'https://hs-proxy.internal/';
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      global.fetch = fetchMock as any;

      await expect(searchHubSpotCrm({ query: 'x', object: 'bogus' as any })).rejects.toThrow(/HTTP 401/);
      expect(fetchMock.mock.calls[0][0]).toBe('https://hs-proxy.internal/crm/v3/objects/contacts/search');
    });
  });
});
