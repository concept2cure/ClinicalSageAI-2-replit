/**
 * An integration is "live" only when a real call proved it.
 *
 * What the code used to do: getIntegrationStatuses marked ClinicalTrials.gov,
 * PubMed, CMS, openFDA, ChEMBL and the preprint server `configured: true` with
 * nothing else, and summarizeStatuses counted every `configured === true` entry
 * as `live` — six public APIs, plus Gmail / Calendar / HubSpot whenever their env
 * vars were set, plus the organisation's document repositories under the label
 * "Connected document repositories (…)". Nothing in the module calls any of them:
 * "configured" meant an env var exists, a credential row was stored (stored with
 * is_valid=true and no validation call), or nothing is needed. AnA's
 * describe_capabilities relayed `integrationSummary.live` as what is working.
 *
 * Each entry now carries `reachability: 'unchecked'`, the summary counts `live`
 * only for an entry a call has proved reachable (none today) and reports the
 * configured-but-unchecked ones separately, and the repositories label says
 * credentials are stored rather than that the repository is connected.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  getIntegrationStatuses,
  summarizeStatuses,
  type IntegrationStatusDeps,
} from '../integration-status';

const deps = (env: Record<string, string | undefined> = {}): IntegrationStatusDeps => ({
  env,
  getConnectorCatalog: vi.fn().mockResolvedValue([{ id: 'google-drive', configured: true, healthy: true }]),
});

const PUBLIC_APIS = ['clinicaltrials', 'pubmed', 'cms_coverage', 'openfda', 'chembl', 'preprints'];

describe('integration status: live only when a call proved it', () => {
  it('the public APIs are configured, and their reachability is unchecked', async () => {
    const statuses = await getIntegrationStatuses(null, deps());
    for (const id of PUBLIC_APIS) {
      const s = statuses.find(x => x.id === id)!;
      expect(s.configured).toBe(true);
      expect(s.reachability, `${id} was presented as reachable without a call`).toBe('unchecked');
    }
  });

  it('nothing probed means nothing counted live; configured entries are counted as unchecked', async () => {
    const summary = summarizeStatuses(await getIntegrationStatuses(null, deps()));
    expect(summary.live, 'unprobed public APIs were counted live').toBe(0);
    expect(summary.configuredUnchecked).toBe(6);
    expect(summary.notConfigured).toBe(3);
    expect(summary.unknown).toBe(1);
  });

  it('an env-gated account with its env set is configured but not live', async () => {
    const statuses = await getIntegrationStatuses(
      42,
      deps({ HUBSPOT_ACCESS_TOKEN: 'pat', PLATFORM_INTEGRATIONS_ORGANIZATION_ID: '42' }),
    );
    const hubspot = statuses.find(s => s.id === 'hubspot')!;
    expect(hubspot.configured).toBe(true);
    expect(hubspot.reachability).toBe('unchecked');
    expect(summarizeStatuses(statuses).live).toBe(0);
  });

  it('a repository with stored credentials is not described as connected', async () => {
    const statuses = await getIntegrationStatuses(42, deps());
    const repos = statuses.find(s => s.id === 'document_connectors')!;
    expect(repos.configured).toBe(true);
    expect(repos.reachability).toBe('unchecked');
    expect(repos.label).toContain('google-drive');
    expect(repos.label, 'stored credentials were labelled a connected repository').not.toMatch(/^Connected/);
  });

  it('a reachability a call proved is counted live', () => {
    const summary = summarizeStatuses([
      { id: 'a', label: 'A', kind: 'public_api', configured: true, reachability: 'reachable', tools: [] },
      { id: 'b', label: 'B', kind: 'public_api', configured: true, reachability: 'unchecked', tools: [] },
    ]);
    expect(summary).toEqual({ live: 1, configuredUnchecked: 1, notConfigured: 0, unknown: 0 });
  });
});
