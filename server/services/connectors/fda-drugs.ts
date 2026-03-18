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
    const searchTerms: string[] = [];
    if (query.indication) searchTerms.push(`products.active_ingredients.name:"${query.indication}"`);
    if (query.sponsor) searchTerms.push(`sponsor_name:"${query.sponsor}"`);
    if (query.keywords?.length) searchTerms.push(query.keywords.map(k => `"${k}"`).join('+AND+'));

    const searchStr = searchTerms.join('+AND+') || '*';
    const limit = query.limit || 20;

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
        relevanceScore: 1 - i * 0.04,
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
