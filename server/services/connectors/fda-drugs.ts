/**
 * @fileoverview FDA Drugs@FDA Connector
 * Scrapes/queries openFDA and Drugs@FDA for approval histories and labeling.
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

/**
 * URL-encode a user value for safe interpolation inside an openFDA search
 * phrase (`field:"<value>"`). Embedded double quotes are stripped (they would
 * break the phrase), then the value is percent-encoded so spaces, `&`, `#`,
 * `+`, etc. can't break the request URL or inject extra query parameters.
 */
function encodeOpenFdaValue(value: string): string {
  return encodeURIComponent(value.replace(/"/g, ' ').trim());
}

/**
 * Build the openFDA `search` parameter for a connector query. Pure and exported
 * so the encoding/grammar contract is unit-testable. Field names, quotes and
 * the `+AND+` joiner are literal grammar; only the user values are encoded.
 * Returns `*` (match-all) when no terms are supplied.
 */
export function buildOpenFdaDrugSearch(query: ConnectorQuery): string {
  const terms: string[] = [];
  if (query.indication?.trim()) {
    terms.push(`products.active_ingredients.name:"${encodeOpenFdaValue(query.indication)}"`);
  }
  if (query.sponsor?.trim()) {
    terms.push(`sponsor_name:"${encodeOpenFdaValue(query.sponsor)}"`);
  }
  const keywords = (query.keywords ?? []).map(k => k.trim()).filter(Boolean);
  if (keywords.length) {
    terms.push(keywords.map(k => `"${encodeOpenFdaValue(k)}"`).join('+AND+'));
  }
  return terms.join('+AND+') || '*';
}

export class FDADrugsConnector implements DataConnector {
  id = 'fda_drugs';
  name = 'FDA Drugs@FDA';
  type = 'scraper' as const;
  requiresCredentials = false;
  requiredTier = 'standard';

  private baseUrl = 'https://api.fda.gov';

  async status(): Promise<ConnectorHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/drug/drugsfda.json?limit=1`);
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch {
      return { status: 'unavailable', lastChecked: new Date() };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    // Build the openFDA search via buildOpenFdaDrugSearch so every user value
    // is percent-encoded — a raw space/&/#/quote would break the URL or inject
    // query params.
    const searchStr = buildOpenFdaDrugSearch(query);
    const limit =
      Number.isFinite(query.limit) && (query.limit as number) > 0 ? Math.floor(query.limit as number) : 20;

    const res = await fetch(`${this.baseUrl}/drug/drugsfda.json?search=${searchStr}&limit=${limit}`);
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`FDA API error: ${res.status}`);
    }

    const data = await res.json();
    const results = data.results || [];

    return results.map((drug: any, i: number) => {
      const appNo = drug.application_number || '';
      const sponsor = drug.sponsor_name || '';
      const products = (drug.products || []).map((p: any) => p.brand_name).filter(Boolean).join(', ');
      const submissions = drug.submissions || [];
      const latestAction = submissions[0]?.submission_status || '';

      return {
        id: `fda:${appNo}`,
        sourceConnector: this.id,
        title: `${products || appNo} (${sponsor})`,
        summary: `Application: ${appNo} | Sponsor: ${sponsor} | Products: ${products} | Latest: ${latestAction}`,
        relevanceScore: Math.max(0, 1 - i * 0.04),
        metadata: { applicationNumber: appNo, sponsor, products: drug.products, submissions },
        url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appNo.replace(/\D/g, '')}`,
      };
    });
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const appNo = resourceId.replace('fda:', '');
    const res = await fetch(`${this.baseUrl}/drug/drugsfda.json?search=application_number:"${appNo}"&limit=1`);
    if (!res.ok) throw new Error(`FDA drug ${appNo} not found`);

    const data = await res.json();
    const drug = data.results?.[0] || {};

    return {
      id: resourceId,
      sourceConnector: this.id,
      title: `FDA Application ${appNo}`,
      type: 'fda_approval',
      content: JSON.stringify(drug, null, 2),
      metadata: drug,
      url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appNo.replace(/\D/g, '')}`,
      retrievedAt: new Date(),
    };
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {}
}
