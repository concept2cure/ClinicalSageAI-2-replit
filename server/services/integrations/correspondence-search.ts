/**
 * Regulatory-correspondence search for AnA (read-only Gmail).
 *
 * Wraps the existing env-configured Gmail integration
 * (server/src/services/integrations/gmail.ts, gmail.readonly scope) so AnA can
 * surface recent agency/regulatory correspondence — e.g. "what did the FDA ask
 * for recently?", deadline awareness, IR/deficiency context.
 *
 * Gmail is imported lazily (and the dependency is injectable) so this module is
 * unit-testable without the Gmail client or a database connection, and a
 * deployment without GMAIL_OAUTH_JSON degrades gracefully instead of throwing.
 *
 * @module server/services/integrations/correspondence-search
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export interface CorrespondenceSearchParams {
  /** Optional keyword to filter subject/from/snippet/body (case-insensitive). */
  query?: string;
  limit?: number;
}

export interface CorrespondenceMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
}

export interface CorrespondenceSearchResponse {
  source: 'Regulatory Mailbox (Gmail)';
  configured: boolean;
  resultCount: number;
  messages: CorrespondenceMessage[];
  note?: string;
}

export interface CorrespondenceDeps {
  isConfigured: () => boolean;
  fetchRecent: (limit: number) => Promise<any[]>;
}

const defaultDeps: CorrespondenceDeps = {
  isConfigured: () => !!process.env.GMAIL_OAUTH_JSON,
  fetchRecent: async (limit: number) => {
    const { gmailFetchRecent } = await import('../../src/services/integrations/gmail.js');
    return gmailFetchRecent(limit);
  },
};

function toIso(d: unknown): string {
  if (d instanceof Date) return isNaN(d.getTime()) ? '' : d.toISOString();
  if (typeof d === 'string') {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? d : parsed.toISOString();
  }
  return '';
}

function normalize(m: any): CorrespondenceMessage {
  return {
    id: String(m?.id ?? ''),
    threadId: String(m?.threadId ?? ''),
    subject: m?.subject ?? '',
    from: m?.from ?? '',
    to: m?.to ?? '',
    date: toIso(m?.date),
    snippet: m?.snippet ?? '',
  };
}

/**
 * Search recent regulatory correspondence. Throws only on an underlying Gmail
 * error (the caller catches); an unconfigured mailbox returns configured:false.
 */
export async function searchRegulatoryCorrespondence(
  params: CorrespondenceSearchParams,
  deps: CorrespondenceDeps = defaultDeps
): Promise<CorrespondenceSearchResponse> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

  if (!deps.isConfigured()) {
    return {
      source: 'Regulatory Mailbox (Gmail)',
      configured: false,
      resultCount: 0,
      messages: [],
      note: 'The regulatory mailbox is not connected (GMAIL_OAUTH_JSON unset). Ask an admin to connect it in Settings → Integrations.',
    };
  }

  const kw = params.query?.trim().toLowerCase();
  // Fetch a wider window when filtering so the keyword has material to match.
  const window = kw ? Math.min(MAX_LIMIT, Math.max(limit * 2, 12)) : limit;
  const raw = await deps.fetchRecent(window);

  const filtered = kw
    ? raw.filter(m =>
        `${m?.subject ?? ''} ${m?.from ?? ''} ${m?.snippet ?? ''} ${m?.body ?? ''}`
          .toLowerCase()
          .includes(kw)
      )
    : raw;

  return {
    source: 'Regulatory Mailbox (Gmail)',
    configured: true,
    resultCount: Math.min(filtered.length, limit),
    messages: filtered.slice(0, limit).map(normalize),
  };
}
