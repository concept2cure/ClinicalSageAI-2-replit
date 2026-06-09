/**
 * Integration self-knowledge for AnA.
 *
 * Deterministically reports which of AnA's integrations are live in THIS
 * deployment — public evidence APIs (always available, subject to egress),
 * env-gated workflow integrations (Gmail / Calendar / HubSpot), and the org's
 * configured document connectors. This is platform-side intelligence, not
 * model knowledge: it lets AnA answer "what can you do here?" truthfully,
 * steer users to Settings → Integrations for gaps, and avoid burning turns
 * calling tools that cannot succeed.
 *
 * Env and the connector catalog are injectable so this is unit-testable with
 * no database or network.
 *
 * @module server/services/integrations/integration-status
 */

export type IntegrationKind = 'public_api' | 'env_gated' | 'org_connector';

export interface IntegrationStatus {
  id: string;
  label: string;
  kind: IntegrationKind;
  /** Whether the integration can be used right now (null = unknown without org context). */
  configured: boolean | null;
  /** AnA tools this integration backs. */
  tools: string[];
  /** What unlocks it when not configured. */
  requires?: string;
}

export interface IntegrationStatusDeps {
  env: Record<string, string | undefined>;
  /** Resolves the org's document-connector catalog; injected for tests. */
  getConnectorCatalog?: (
    orgId: number
  ) => Promise<Array<{ id: string; configured: boolean; healthy: boolean }>>;
}

const defaultDeps: IntegrationStatusDeps = {
  env: process.env,
  getConnectorCatalog: async (orgId: number) => {
    const { getConnectorCatalog } = await import('../connectors/connector-registry.js');
    return getConnectorCatalog(orgId) as unknown as Promise<
      Array<{ id: string; configured: boolean; healthy: boolean }>
    >;
  },
};

/**
 * Compute the live integration statuses for this deployment (and org, when an
 * organizationId is provided for the connector catalog). Never throws — a
 * failing catalog lookup reports the connectors entry as unknown.
 */
export async function getIntegrationStatuses(
  organizationId?: number | null,
  deps: IntegrationStatusDeps = defaultDeps
): Promise<IntegrationStatus[]> {
  const env = deps.env;

  const statuses: IntegrationStatus[] = [
    {
      id: 'clinicaltrials',
      label: 'ClinicalTrials.gov (live trials)',
      kind: 'public_api',
      configured: true,
      tools: ['search_clinical_evidence', 'assess_regulatory_landscape'],
    },
    {
      id: 'pubmed',
      label: 'PubMed literature',
      kind: 'public_api',
      configured: true,
      tools: ['search_literature', 'assess_regulatory_landscape'],
      requires: env.NCBI_API_KEY ? undefined : 'Optional NCBI_API_KEY raises rate limits',
    },
    {
      id: 'cms_coverage',
      label: 'CMS Medicare coverage (NCD/LCD)',
      kind: 'public_api',
      configured: true,
      tools: ['search_medicare_coverage', 'assess_regulatory_landscape'],
    },
    {
      id: 'openfda',
      label: 'FDA openFDA (recalls, labels, approvals, MAUDE, FAERS)',
      kind: 'public_api',
      configured: true,
      tools: [
        'search_device_recalls',
        'search_drug_labels',
        'search_drug_approvals',
        'search_device_adverse_events',
        'search_drug_adverse_events',
        'assess_regulatory_landscape',
      ],
      requires: env.OPENFDA_API_KEY ? undefined : 'Optional OPENFDA_API_KEY raises rate limits',
    },
    {
      id: 'gmail',
      label: 'Regulatory mailbox (Gmail, read-only)',
      kind: 'env_gated',
      configured: !!env.GMAIL_OAUTH_JSON,
      tools: ['search_regulatory_correspondence'],
      requires: env.GMAIL_OAUTH_JSON ? undefined : 'GMAIL_OAUTH_JSON',
    },
    {
      id: 'google_calendar',
      label: 'Team calendar (Google Calendar)',
      kind: 'env_gated',
      configured: !!(env.GOOGLE_CALENDAR_ID && env.GOOGLE_SERVICE_ACCOUNT),
      tools: ['create_calendar_event'],
      requires:
        env.GOOGLE_CALENDAR_ID && env.GOOGLE_SERVICE_ACCOUNT
          ? undefined
          : 'GOOGLE_CALENDAR_ID + GOOGLE_SERVICE_ACCOUNT',
    },
    {
      id: 'hubspot',
      label: 'HubSpot CRM (read-only)',
      kind: 'env_gated',
      configured: !!env.HUBSPOT_ACCESS_TOKEN,
      tools: ['search_crm'],
      requires: env.HUBSPOT_ACCESS_TOKEN ? undefined : 'HUBSPOT_ACCESS_TOKEN',
    },
  ];

  // Org-scoped document connectors (Drive/Box/OneDrive/SharePoint/Veeva, …).
  if (organizationId && deps.getConnectorCatalog) {
    try {
      const catalog = await deps.getConnectorCatalog(Number(organizationId));
      const live = catalog.filter(c => c.configured && c.healthy).map(c => c.id);
      statuses.push({
        id: 'document_connectors',
        label: `Connected document repositories (${live.length ? live.join(', ') : 'none connected'})`,
        kind: 'org_connector',
        configured: live.length > 0,
        tools: ['search_connected_repositories'],
        requires: live.length > 0 ? undefined : 'Connect a repository in Settings → Connectors',
      });
    } catch {
      statuses.push({
        id: 'document_connectors',
        label: 'Connected document repositories',
        kind: 'org_connector',
        configured: null,
        tools: ['search_connected_repositories'],
        requires: 'Connector catalog unavailable — check again from an active project',
      });
    }
  } else {
    statuses.push({
      id: 'document_connectors',
      label: 'Connected document repositories',
      kind: 'org_connector',
      configured: null,
      tools: ['search_connected_repositories'],
      requires: 'Open a project (organization context) to resolve connector status',
    });
  }

  return statuses;
}

/** Compact summary counts for the introspection payload. */
export function summarizeStatuses(statuses: IntegrationStatus[]): {
  live: number;
  notConfigured: number;
  unknown: number;
} {
  let live = 0;
  let notConfigured = 0;
  let unknown = 0;
  for (const s of statuses) {
    if (s.configured === true) live++;
    else if (s.configured === false) notConfigured++;
    else unknown++;
  }
  return { live, notConfigured, unknown };
}
