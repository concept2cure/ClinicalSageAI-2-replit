/**
 * @fileoverview SAM.gov Restricted-Party / Exclusions Connector
 * Screens parties against the US SAM.gov Exclusions (debarment/suspension) list
 * for research-security and 2 CFR 200.214 suspension-and-debarment checks.
 * Requires a personal SAM.gov API key.
 *
 * Exclusions API: GET {base}/entity-information/v4/exclusions?api_key=KEY&exclusionName=...
 *
 * @module server/services/connectors/sam-exclusions
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class SamExclusionsConnector implements DataConnector {
  id = 'sam_exclusions';
  name = 'SAM.gov Restricted-Party Screening';
  type = 'api' as const;
  requiresCredentials = true;
  requiredTier = 'professional';

  private baseUrl = 'https://api.sam.gov/entity-information/v4';
  private apiKey: string | null = null;

  async authenticate(credentials: ConnectorCredentials): Promise<void> {
    if (!credentials.apiKey) throw new Error('SAM.gov connector requires an API key.');
    this.apiKey = credentials.apiKey;
  }

  async status(): Promise<ConnectorHealth> {
    if (!this.apiKey) return { status: 'unavailable', lastChecked: new Date(), message: 'No API key configured.' };
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/exclusions?api_key=${encodeURIComponent(this.apiKey)}&page=0&size=1`);
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date(), message: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  /** A "search" here is a screen: the party name is the query; results are exclusion matches (ideally zero). */
  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    if (!this.apiKey) throw new Error('SAM.gov connector is not authenticated.');
    const name = (query.sponsor || query.keywords?.join(' ') || '').trim();
    if (!name) throw new Error('A party name (sponsor or keywords) is required to screen against SAM.gov exclusions.');

    const params = new URLSearchParams({ api_key: this.apiKey, exclusionName: name, page: '0', size: String(query.limit || 25) });
    const res = await fetch(`${this.baseUrl}/exclusions?${params}`);
    if (!res.ok) throw new Error(`SAM.gov exclusions API error: ${res.status}`);

    const json = await res.json();
    const records = json?.excludedEntity || json?.results || [];
    return records.map((r: any, i: number) => {
      const det = r.exclusionDetails || r;
      const partyName = det.exclusionName || r.exclusionName || `${det.firstName ?? ''} ${det.lastName ?? ''}`.trim() || 'Excluded party';
      return {
        id: String(r.ueiSAM || r.samNumber || det.classificationType || `SAM-${i}`),
        sourceConnector: this.id,
        title: `EXCLUSION MATCH: ${partyName}`,
        summary: `Type: ${det.exclusionType || 'n/a'} | Classification: ${det.classificationType || 'n/a'} | Agency: ${det.excludingAgencyName || 'n/a'} | Active`,
        relevanceScore: 1 - i * 0.02,
        metadata: {
          screenedName: name, exclusionType: det.exclusionType, classificationType: det.classificationType,
          excludingAgency: det.excludingAgencyName, ueiSAM: r.ueiSAM, activeDate: det.activeDate, ctCode: det.ctCode,
        },
        url: 'https://sam.gov/search/?index=ex',
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    if (!this.apiKey) throw new Error('SAM.gov connector is not authenticated.');
    const params = new URLSearchParams({ api_key: this.apiKey, ueiSAM: resourceId });
    const res = await fetch(`${this.baseUrl}/exclusions?${params}`);
    if (!res.ok) throw new Error(`SAM.gov exclusion ${resourceId} not found`);
    const json = await res.json();
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `SAM.gov exclusion record ${resourceId}`,
      type: 'exclusion_record',
      content: JSON.stringify(json, null, 2),
      metadata: json?.excludedEntity?.[0] || {},
      url: 'https://sam.gov/search/?index=ex',
      retrievedAt: new Date(),
    };
  }
}
