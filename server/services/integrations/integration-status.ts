/**
 * Integration self-knowledge for AnA.
 *
 * Deterministically reports which of AnA's integrations are CONFIGURED in THIS
 * deployment — public evidence APIs (nothing to configure; subject to egress),
 * env-gated workflow integrations (Gmail / Calendar / HubSpot), and the org's
 * document repositories with stored credentials. This is platform-side
 * intelligence, not model knowledge: it lets AnA answer "what can you do here?"
 * truthfully, steer users to Settings → Integrations for gaps, and avoid burning
 * turns calling tools that cannot succeed.
 *
 * Configured is not live. Nothing in this module calls an integration, so every
 * entry's reachability is 'unchecked' and none is counted live
 * (2026-10-15: all configured entries were counted `live`, unprobed).
 *
 * Env and the connector catalog are injectable so this is unit-testable with
 * no database or network.
 *
 * @module server/services/integrations/integration-status
 */
import { isPlatformIntegrationsOwner, PLATFORM_INTEGRATIONS_ORG_ENV } from './platform-integration-owner.js';
import { isRepositoryConnector } from '../connectors/connector-interface.js';

export type IntegrationKind = 'public_api' | 'env_gated' | 'org_connector';

/**
 * Whether a real call has proved the integration reachable. 'unchecked': no
 * call was made — the state of every entry this module builds, since it calls
 * nothing. 'reachable': a call succeeded; only such an entry counts as live.
 */
export type IntegrationReachability = 'unchecked' | 'reachable';

export interface IntegrationStatus {
  id: string;
  label: string;
  kind: IntegrationKind;
  /**
   * Whether the deployment holds what the integration needs to be tried (its env
   * vars, the org's stored credentials; a public API needs nothing). Not a claim
   * that a call succeeds. null = unknown without org context.
   */
  configured: boolean | null;
  /** Whether a call has proved it reachable; see IntegrationReachability. */
  reachability: IntegrationReachability;
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

/** Why a deployment account that is configured is not live for this organisation. */
const NOT_THE_OWNER =
  `This deployment's own account, for the organisation ${PLATFORM_INTEGRATIONS_ORG_ENV} names only`;

/** A deployment account is live only when it is configured and this organisation is its owner. */
function deploymentAccount(set: boolean, owns: boolean, missing: string): Pick<IntegrationStatus, 'configured' | 'requires'> {
  if (!set) return { configured: false, requires: missing };
  return owns ? { configured: true, requires: undefined } : { configured: false, requires: NOT_THE_OWNER };
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
 * Compute the integration statuses for this deployment (and org, when an
 * organizationId is provided for the connector catalog). Never throws — a
 * failing catalog lookup reports the connectors entry as unknown.
 */
export async function getIntegrationStatuses(
  organizationId?: number | null,
  deps: IntegrationStatusDeps = defaultDeps
): Promise<IntegrationStatus[]> {
  const env = deps.env;
  /* 2026-10-01 (D6, decision P-8): the mailbox, calendar and CRM are the
     deployment's own accounts and serve only the organisation they belong to
     (platform-integration-owner.ts), so they are live only for it. */
  const ownsDeploymentAccounts = isPlatformIntegrationsOwner(organizationId, env);

  const statuses: Array<Omit<IntegrationStatus, 'reachability'>> = [
    {
      id: 'clinicaltrials',
      label: 'ClinicalTrials.gov (trial registry)',
      kind: 'public_api',
      configured: true,
      tools: ['search_clinical_evidence', 'assess_regulatory_landscape', 'assess_trial_feasibility'],
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
      id: 'chembl',
      label: 'ChEMBL (EMBL-EBI) — curated compounds, descriptors, mechanisms',
      kind: 'public_api',
      configured: true,
      tools: ['search_chembl_compound', 'screen_compound_liabilities'],
    },
    {
      id: 'preprints',
      label: 'bioRxiv / medRxiv preprints (via Europe PMC) — emerging, pre-peer-review evidence',
      kind: 'public_api',
      configured: true,
      tools: ['search_preprints'],
    },
    {
      id: 'gmail',
      label: 'Regulatory mailbox (Gmail, read-only)',
      kind: 'env_gated',
      ...deploymentAccount(!!env.GMAIL_OAUTH_JSON, ownsDeploymentAccounts, 'GMAIL_OAUTH_JSON'),
      tools: ['search_regulatory_correspondence'],
    },
    {
      id: 'google_calendar',
      label: 'Team calendar (Google Calendar)',
      kind: 'env_gated',
      ...deploymentAccount(
        !!(env.GOOGLE_CALENDAR_ID && env.GOOGLE_SERVICE_ACCOUNT),
        ownsDeploymentAccounts,
        'GOOGLE_CALENDAR_ID + GOOGLE_SERVICE_ACCOUNT',
      ),
      tools: ['create_calendar_event'],
    },
    {
      id: 'hubspot',
      label: 'HubSpot CRM (read-only)',
      kind: 'env_gated',
      ...deploymentAccount(!!env.HUBSPOT_ACCESS_TOKEN, ownsDeploymentAccounts, 'HUBSPOT_ACCESS_TOKEN'),
      tools: ['search_crm'],
    },
  ];

  // Org-scoped document repositories (Drive/Box/OneDrive/SharePoint/Veeva) —
  // exactly what search_connected_repositories searches. The credential-free
  // public sources in the catalog count as configured, and are not among them.
  // The catalog's `healthy` means no stored credential is marked invalid —
  // credentials are stored valid without a call — so this is "credentials
  // stored", not "connected" (2026-10-15: the label read "Connected …").
  if (organizationId && deps.getConnectorCatalog) {
    try {
      const catalog = await deps.getConnectorCatalog(Number(organizationId));
      const withCredentials = catalog
        .filter(c => isRepositoryConnector(c.id) && c.configured && c.healthy)
        .map(c => c.id);
      statuses.push({
        id: 'document_connectors',
        label: withCredentials.length
          ? `Document repositories with stored credentials (${withCredentials.join(', ')})`
          : 'Document repositories (none connected)',
        kind: 'org_connector',
        configured: withCredentials.length > 0,
        tools: ['search_connected_repositories'],
        requires: withCredentials.length > 0 ? undefined : 'Connect a repository in Settings → Connectors',
      });
    } catch {
      statuses.push({
        id: 'document_connectors',
        label: 'Document repositories',
        kind: 'org_connector',
        configured: null,
        tools: ['search_connected_repositories'],
        requires: 'Connector catalog unavailable — check again from an active project',
      });
    }
  } else {
    statuses.push({
      id: 'document_connectors',
      label: 'Document repositories',
      kind: 'org_connector',
      configured: null,
      tools: ['search_connected_repositories'],
      requires: 'Open a project (organization context) to resolve connector status',
    });
  }

  // Nothing here calls an integration, so none has been proved reachable.
  return statuses.map(s => ({ ...s, reachability: 'unchecked' as const }));
}

/**
 * Compact summary counts for the introspection payload. `live` counts only an
 * entry a call has proved reachable; a configured entry nothing has called is
 * `configuredUnchecked`. 2026-10-15: every configured entry was counted live.
 */
export function summarizeStatuses(statuses: IntegrationStatus[]): {
  live: number;
  configuredUnchecked: number;
  notConfigured: number;
  unknown: number;
} {
  let live = 0;
  let configuredUnchecked = 0;
  let notConfigured = 0;
  let unknown = 0;
  for (const s of statuses) {
    if (s.configured === true) {
      if (s.reachability === 'reachable') live++;
      else configuredUnchecked++;
    } else if (s.configured === false) notConfigured++;
    else unknown++;
  }
  return { live, configuredUnchecked, notConfigured, unknown };
}
