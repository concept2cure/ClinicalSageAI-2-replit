/**
 * Integration self-knowledge — unit tests (env + connector catalog injected).
 * Verifies env-gated configuration detection, org-connector resolution (live /
 * none / catalog failure / no org), and the summary counts.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  getIntegrationStatuses,
  summarizeStatuses,
  type IntegrationStatusDeps,
} from '../integration-status';

function makeDeps(env: Record<string, string | undefined> = {}, over: Partial<IntegrationStatusDeps> = {}): IntegrationStatusDeps {
  return {
    env,
    getConnectorCatalog: vi.fn().mockResolvedValue([
      { id: 'google-drive', configured: true, healthy: true },
      { id: 'box', configured: false, healthy: true },
    ]),
    ...over,
  };
}

const byId = (statuses: Awaited<ReturnType<typeof getIntegrationStatuses>>, id: string) =>
  statuses.find(s => s.id === id)!;

describe('getIntegrationStatuses', () => {
  it('public APIs are always live; env-gated integrations reflect the env', async () => {
    const statuses = await getIntegrationStatuses(null, makeDeps({}));

    expect(byId(statuses, 'clinicaltrials').configured).toBe(true);
    expect(byId(statuses, 'openfda').configured).toBe(true);
    expect(byId(statuses, 'gmail').configured).toBe(false);
    expect(byId(statuses, 'gmail').requires).toBe('GMAIL_OAUTH_JSON');
    expect(byId(statuses, 'google_calendar').configured).toBe(false);
    expect(byId(statuses, 'hubspot').configured).toBe(false);
  });

  it('reports env-gated integrations as live when their env is set', async () => {
    const statuses = await getIntegrationStatuses(
      null,
      makeDeps({
        GMAIL_OAUTH_JSON: '{}',
        GOOGLE_CALENDAR_ID: 'cal',
        GOOGLE_SERVICE_ACCOUNT: '{}',
        HUBSPOT_ACCESS_TOKEN: 'pat',
      })
    );
    expect(byId(statuses, 'gmail').configured).toBe(true);
    expect(byId(statuses, 'gmail').requires).toBeUndefined();
    expect(byId(statuses, 'google_calendar').configured).toBe(true);
    expect(byId(statuses, 'hubspot').configured).toBe(true);
  });

  it('resolves org connectors when an organizationId is given (live names listed)', async () => {
    const deps = makeDeps({});
    const statuses = await getIntegrationStatuses(42, deps);
    const conn = byId(statuses, 'document_connectors');
    expect(deps.getConnectorCatalog).toHaveBeenCalledWith(42);
    expect(conn.configured).toBe(true);
    expect(conn.label).toContain('google-drive');
    expect(conn.label).not.toContain('box'); // not configured → not listed as live
  });

  it('reports connectors as unknown without org context, and on catalog failure', async () => {
    const noOrg = await getIntegrationStatuses(null, makeDeps({}));
    expect(byId(noOrg, 'document_connectors').configured).toBeNull();

    const failing = await getIntegrationStatuses(
      7,
      makeDeps({}, { getConnectorCatalog: vi.fn().mockRejectedValue(new Error('db down')) })
    );
    expect(byId(failing, 'document_connectors').configured).toBeNull();
    expect(byId(failing, 'document_connectors').requires).toMatch(/unavailable/i);
  });

  it('summarizeStatuses counts live / notConfigured / unknown', async () => {
    const statuses = await getIntegrationStatuses(null, makeDeps({ HUBSPOT_ACCESS_TOKEN: 'pat' }));
    const summary = summarizeStatuses(statuses);
    // 4 public + hubspot live; gmail + calendar not configured; connectors unknown.
    expect(summary).toEqual({ live: 5, notConfigured: 2, unknown: 1 });
  });
});
