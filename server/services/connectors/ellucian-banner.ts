/**
 * @fileoverview Ellucian Banner (Ethos Integration) Connector — institutional SoR
 * Treats Banner as the authoritative system of record. Reads persons,
 * organizations, and grant/fund records through the Ethos Integration API so the
 * platform stays downstream of Banner (no double-entry). Read-only by design.
 *
 * Auth:  GET  {base}/auth  (Authorization: Bearer {apiKey})           -> session token
 * Read:  GET  {base}/api/{resource}  (Authorization: Bearer {token}, Accept: ethos vnd)
 *
 * @module server/services/connectors/ellucian-banner
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';
import { assertSafePublicUrl } from '../../utils/ssrfGuard.js';

export class EllucianBannerConnector implements DataConnector {
  id = 'ellucian_banner';
  name = 'Ellucian Banner (Ethos)';
  type = 'api' as const;
  requiresCredentials = true;
  requiredTier = 'enterprise';

  private baseUrl: string | null = null;
  private apiKey: string | null = null;
  private token: string | null = null;
  private tokenAt = 0;

  /**
   * SSRF guard at the outbound sink. baseUrl is tenant-supplied and reused for
   * every request — re-validate the effective URL before each fetch so a
   * private/loopback/metadata host (incl. one reached via DNS rebinding after
   * storage) can never be hit. Throws if unsafe.
   */
  private safeFetch(url: string, init?: RequestInit): Promise<Response> {
    assertSafePublicUrl(url, 'Ellucian Banner request');
    // Bound every outbound Ethos call so a hung Banner instance can't pin the
    // worker indefinitely (override via BANNER_TIMEOUT_MS, default 15s).
    // Respect a caller-supplied signal if one is provided.
    const timeoutMs = Number(process.env.BANNER_TIMEOUT_MS || 15000);
    const signal = init?.signal ?? AbortSignal.timeout(timeoutMs);
    return fetch(url, { ...init, signal });
  }

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    if (!credentials.baseUrl || !credentials.apiKey) throw new Error('Ellucian Banner connector requires baseUrl and apiKey.');
    // SSRF guard: reject a private/metadata base URL before any outbound call.
    assertSafePublicUrl(credentials.baseUrl, 'Ellucian Banner base URL');
    this.baseUrl = credentials.baseUrl.replace(/\/+$/, '');
    this.apiKey = credentials.apiKey;
    this.token = null;
    this.tokenAt = 0;
  }

  /** Exchange the API key for a short-lived Ethos session token (cached ~4 min). */
  private async getToken(): Promise<string> {
    if (!this.baseUrl || !this.apiKey) throw new Error('Ellucian Banner connector is not authenticated.');
    if (this.token && Date.now() - this.tokenAt < 4 * 60 * 1000) return this.token;
    const res = await this.safeFetch(`${this.baseUrl}/auth`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` } });
    if (!res.ok) throw new Error(`Ethos /auth failed: ${res.status}`);
    this.token = (await res.text()).trim();
    this.tokenAt = Date.now();
    return this.token;
  }

  async status(): Promise<ConnectorHealth> {
    if (!this.baseUrl || !this.apiKey) return { status: 'unavailable', lastChecked: new Date(), message: 'Not configured.' };
    try {
      const start = Date.now();
      await this.getToken();
      return { status: 'healthy', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  /** Map a connector query to an Ethos resource read. Defaults to persons; "grant"/"fund" keywords switch resource. */
  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const token = await this.getToken();
    const kw = (query.keywords?.join(' ') || query.sponsor || '').toLowerCase();
    const resource = /grant|award|fund|sponsor/.test(kw) ? 'grants' : /org|department|institution/.test(kw) ? 'organizations' : 'persons';
    const params = new URLSearchParams({ offset: '0', limit: String(query.limit || 25) });
    if (query.sponsor) params.set('criteria', JSON.stringify({ names: [{ fullName: query.sponsor }] }));

    const res = await this.safeFetch(`${this.baseUrl}/api/${resource}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.hedtech.integration.v12+json' },
    });
    if (!res.ok) throw new Error(`Ethos ${resource} read error: ${res.status}`);

    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : rows?.results || [];
    return list.map((r: any, i: number) => {
      const name = r.names?.[0]?.fullName || r.title || r.code || r.id;
      return {
        id: String(r.id),
        sourceConnector: this.id,
        title: `${resource.slice(0, -1)}: ${name}`,
        summary: `Banner (Ethos) ${resource} record · id ${r.id}`,
        relevanceScore: 1 - i * 0.02,
        metadata: { resource, banner: r },
        url: undefined,
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const token = await this.getToken();
    // resourceId may be "persons/{guid}" or just a guid (defaults to persons).
    const path = resourceId.includes('/') ? resourceId : `persons/${resourceId}`;
    const res = await this.safeFetch(`${this.baseUrl}/api/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.hedtech.integration.v12+json' },
    });
    if (!res.ok) throw new Error(`Ethos record ${resourceId} not found`);
    const json = await res.json();
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `Banner (Ethos) record ${resourceId}`,
      type: 'sor_record',
      content: JSON.stringify(json, null, 2),
      metadata: json,
      retrievedAt: new Date(),
    };
  }
}
