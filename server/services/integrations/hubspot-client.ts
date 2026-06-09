/**
 * HubSpot CRM client (read-only search).
 *
 * Lets AnA tie regulatory work to the commercial side — find the client
 * contacts, companies, and deals associated with a project/account. Uses the
 * stable HubSpot CRM v3 search API with a private-app token (Bearer auth); raw
 * fetch, no SDK dependency, matching the other integration clients.
 *
 * Auth: HUBSPOT_ACCESS_TOKEN (private-app token). Base URL overridable via
 * HUBSPOT_API_BASE_URL (proxy/tests). Record links are built when
 * HUBSPOT_PORTAL_ID is set. Network/HTTP failures throw so callers degrade.
 *
 * @module server/services/integrations/hubspot-client
 */

const DEFAULT_BASE_URL = 'https://api.hubapi.com';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;

export type HubSpotObject = 'contacts' | 'companies' | 'deals' | 'tickets';

export interface HubSpotSearchParams {
  query: string;
  object?: HubSpotObject;
  limit?: number;
}

export interface HubSpotRecord {
  id: string;
  object: HubSpotObject;
  title: string;
  properties: Record<string, string>;
  url?: string;
}

export interface HubSpotSearchResult {
  source: 'HubSpot CRM';
  configured: boolean;
  object: HubSpotObject;
  total: number;
  resultCount: number;
  records: HubSpotRecord[];
  note?: string;
}

// CRM object → default properties to request, and the object-type id used in
// record URLs.
const OBJECT_CONFIG: Record<HubSpotObject, { properties: string[]; typeId: string }> = {
  contacts: { properties: ['firstname', 'lastname', 'email', 'company', 'jobtitle'], typeId: '0-1' },
  companies: { properties: ['name', 'domain', 'industry', 'city', 'state'], typeId: '0-2' },
  deals: { properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate'], typeId: '0-3' },
  tickets: { properties: ['subject', 'content', 'hs_pipeline_stage'], typeId: '0-5' },
};

function baseUrl(): string {
  return (process.env.HUBSPOT_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function isHubSpotConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

/** Human-facing title for a record from its properties. */
export function recordTitle(object: HubSpotObject, props: Record<string, any>): string {
  const p = props || {};
  switch (object) {
    case 'contacts':
      return [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || p.email || '(unnamed contact)';
    case 'companies':
      return p.name || p.domain || '(unnamed company)';
    case 'deals':
      return p.dealname || '(unnamed deal)';
    case 'tickets':
      return p.subject || '(untitled ticket)';
    default:
      return '(record)';
  }
}

/** Build an app.hubspot.com record URL when the portal id is known. */
export function buildRecordUrl(object: HubSpotObject, id: string): string | undefined {
  const portal = process.env.HUBSPOT_PORTAL_ID;
  if (!portal || !id) return undefined;
  return `https://app.hubspot.com/contacts/${portal}/record/${OBJECT_CONFIG[object].typeId}/${id}`;
}

function normalizeRecord(object: HubSpotObject, raw: any): HubSpotRecord {
  const props: Record<string, string> = {};
  const rawProps = raw?.properties ?? {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (v !== null && v !== undefined) props[k] = String(v);
  }
  const id = String(raw?.id ?? '');
  return { id, object, title: recordTitle(object, rawProps), properties: props, url: buildRecordUrl(object, id) };
}

/**
 * Search a HubSpot CRM object. Throws on network/HTTP error; an unconfigured
 * portal returns configured:false so the caller can guide the user.
 */
export async function searchHubSpotCrm(params: HubSpotSearchParams): Promise<HubSpotSearchResult> {
  const object: HubSpotObject = OBJECT_CONFIG[params.object as HubSpotObject] ? (params.object as HubSpotObject) : 'contacts';
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

  if (!isHubSpotConfigured()) {
    return {
      source: 'HubSpot CRM',
      configured: false,
      object,
      total: 0,
      resultCount: 0,
      records: [],
      note: 'HubSpot is not connected (HUBSPOT_ACCESS_TOKEN unset). Ask an admin to connect it in Settings → Integrations.',
    };
  }

  const res = await fetch(`${baseUrl()}/crm/v3/objects/${object}/search`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: params.query,
      limit,
      properties: OBJECT_CONFIG[object].properties,
    }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot CRM API returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return {
    source: 'HubSpot CRM',
    configured: true,
    object,
    total: typeof data?.total === 'number' ? data.total : results.length,
    resultCount: results.length,
    records: results.map((r: any) => normalizeRecord(object, r)),
  };
}
