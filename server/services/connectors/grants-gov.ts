/**
 * @fileoverview Grants.gov Connector (Sponsored Programs / pre-award pipeline)
 * Uses the public Grants.gov Search2 + fetchOpportunity REST API. No credentials.
 *
 * Search2:          POST {base}/search2          { keyword, oppStatuses, rows }
 * fetchOpportunity: POST {base}/fetchOpportunity  { opportunityId }
 *
 * @module server/services/connectors/grants-gov
 */

import {
  DataConnector,
  ConnectorHealth,
  ConnectorQuery,
  ConnectorResult,
  ConnectorDocument,
  ConnectorCredentials,
} from './connector-interface.js';

export class GrantsGovConnector implements DataConnector {
  id = 'grants_gov';
  name = 'Grants.gov';
  type = 'api' as const;
  requiresCredentials = false;
  requiredTier = 'free';

  private baseUrl = 'https://api.grants.gov/v1/api';

  async status(): Promise<ConnectorHealth> {
    try {
      const start = Date.now();
      const res = await fetch(`${this.baseUrl}/search2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: 'health', oppStatuses: 'posted', rows: 1 }),
      });
      return { status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start, lastChecked: new Date() };
    } catch (err) {
      return { status: 'unavailable', lastChecked: new Date(), message: String(err) };
    }
  }

  async search(query: ConnectorQuery): Promise<ConnectorResult[]> {
    const keyword = [query.keywords?.join(' '), query.therapeuticArea, query.indication]
      .filter(Boolean).join(' ').trim() || 'research';
    const res = await fetch(`${this.baseUrl}/search2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, oppStatuses: 'forecasted|posted', rows: query.limit || 25 }),
    });
    if (!res.ok) throw new Error(`Grants.gov API error: ${res.status}`);

    const json = await res.json();
    const hits = json?.data?.oppHits || [];
    return hits.map((h: any, i: number) => ({
      id: String(h.id ?? h.number ?? `GG-${i}`),
      sourceConnector: this.id,
      title: h.title || 'Untitled opportunity',
      summary: `Agency: ${h.agency || h.agencyCode || 'n/a'} | Opp #: ${h.number || 'n/a'} | Status: ${h.oppStatus || 'n/a'} | Close: ${h.closeDate || 'n/a'}`,
      relevanceScore: 1 - i * 0.03,
      metadata: {
        opportunityNumber: h.number, agency: h.agency, agencyCode: h.agencyCode,
        oppStatus: h.oppStatus, openDate: h.openDate, closeDate: h.closeDate, docType: h.docType,
      },
      url: h.id ? `https://www.grants.gov/search-results-detail/${h.id}` : undefined,
    }));
  }

  async fetch(resourceId: string): Promise<ConnectorDocument> {
    const res = await fetch(`${this.baseUrl}/fetchOpportunity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: resourceId }),
    });
    if (!res.ok) throw new Error(`Grants.gov opportunity ${resourceId} not found`);

    const json = await res.json();
    const d = json?.data || {};
    return {
      id: resourceId,
      sourceConnector: this.id,
      title: d.opportunityTitle || d.synopsis?.opportunityTitle || resourceId,
      type: 'funding_opportunity',
      content: JSON.stringify(json, null, 2),
      metadata: d,
      url: `https://www.grants.gov/search-results-detail/${resourceId}`,
      retrievedAt: new Date(),
    };
  }

  /**
   * Full opportunity detail, hydrated into the normalized shape the intelligent
   * matcher consumes: synopsis, agency, award ceiling, eligibility (applicant
   * types), CFDA numbers, funding instrument, and close date. Throws on network/
   * HTTP error so callers can degrade gracefully.
   */
  async fetchOpportunityDetail(resourceId: string): Promise<HydratedOpportunity> {
    const res = await fetch(`${this.baseUrl}/fetchOpportunity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: resourceId }),
    });
    if (!res.ok) throw new Error(`Grants.gov opportunity ${resourceId} not found`);
    const json = await res.json();
    return parseOpportunityDetail(resourceId, json?.data ?? {});
  }

  async authenticate(_credentials: ConnectorCredentials): Promise<void> {
    // Public API — no auth required.
  }
}

/** Normalized opportunity detail (matches MatchableOpportunity in opportunity-matching.ts). */
export interface HydratedOpportunity {
  externalId: string;
  title: string;
  opportunityNumber: string | null;
  agency: string | null;
  agencyCode: string | null;
  closeDate: string | null;
  synopsis: string | null;
  awardCeiling: number | null;
  awardFloor: number | null;
  eligibilities: string[];
  cfdaNumbers: string[];
  fundingInstrument: string | null;
}

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}
function pickText(...vals: any[]): string | null {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}
function pickNumber(...vals: any[]): number | null {
  for (const v of vals) {
    const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Defensively parse a Grants.gov fetchOpportunity `data` envelope into the
 * normalized shape. The API's field names vary across synopsis/forecast records,
 * so each field is resolved from several candidate paths. Pure.
 */
export function parseOpportunityDetail(resourceId: string, d: any): HydratedOpportunity {
  const syn = d?.synopsis ?? d?.forecast ?? {};
  const eligibilities = asArray(d?.applicantTypes ?? syn?.applicantTypes)
    .map((a: any) => (typeof a === 'string' ? a : a?.description ?? a?.applicantType ?? ''))
    .filter((s: string) => s && s.trim());
  const cfdaNumbers = asArray(d?.cfdas ?? d?.opportunityCategoryCfdas ?? syn?.cfdas)
    .map((c: any) => (typeof c === 'string' ? c : c?.cfdaNumber ?? c?.number ?? ''))
    .filter((s: string) => s && s.trim());
  return {
    externalId: resourceId,
    title: pickText(d?.opportunityTitle, syn?.opportunityTitle, d?.title),
    opportunityNumber: pickText(d?.opportunityNumber, syn?.opportunityNumber, d?.number),
    agency: pickText(d?.agencyName, syn?.agencyName, d?.agency),
    agencyCode: pickText(d?.agencyCode, syn?.agencyCode),
    closeDate: pickText(syn?.responseDate, syn?.applicationsDueDate, d?.closeDate, syn?.closeDate),
    synopsis: pickText(syn?.synopsisDesc, syn?.description, d?.description),
    awardCeiling: pickNumber(syn?.awardCeiling, d?.awardCeiling),
    awardFloor: pickNumber(syn?.awardFloor, d?.awardFloor),
    eligibilities,
    cfdaNumbers,
    fundingInstrument: pickText(asArray(syn?.fundingInstruments)[0]?.description, asArray(d?.fundingInstruments)[0]?.description),
  } as HydratedOpportunity;
}
