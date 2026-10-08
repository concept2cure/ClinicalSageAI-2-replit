/**
 * search_connected_repositories searches the client's own repositories, and
 * nothing else (AnA Summary S2, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md).
 *
 * ── The defects ─────────────────────────────────────────────────────────────
 *  - The schema's own example id, `google-drive`, was refused as "unknown
 *    connector": the registry's id is `google_drive`. A model that followed the
 *    example never reached Drive.
 *  - With `connectors` omitted the tool searched every catalog entry, and the
 *    credential-free public sources (PubMed, ClinicalTrials.gov, Drugs@FDA,
 *    EMA, EUDAMED, CTIS, Grants.gov) count as configured. So a client's query
 *    — a product code, a protocol title — went to those public APIs whatever
 *    the tenant's `publicSourceEgress` said.
 *  - The `connectors` list was free text, so nothing told the model which ids
 *    exist; and a per-tenant list would change the tool schema per tenant and
 *    break prompt caching. It is now a static enum of the five repositories.
 *
 * The handler, the orchestration, the registry, the Drive connector and the
 * credential encryption are real. The credential store and every outbound HTTP
 * request are stubbed, and every request is recorded, so "PubMed is not
 * called" is checked on the wire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'crypto';

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  query: vi.fn(),
  requests: [] as URL[],
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled: async () => true }));

import { getToolHandler } from '../AnaToolExecutor.js';
import { governedToolsetFor } from '../governed-toolset.js';
import { getConnectorCatalog, storeCredentials } from '../../connectors/connector-registry.js';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../../ai-gateway/providers/org-placement.js';

const REPOSITORIES = ['google_drive', 'box', 'onedrive', 'sharepoint', 'veeva_vault'];
const DRIVE_ORG = 7;
const BOX_ORG = 9;
const NOTHING_ORG = 8;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const realFetch = globalThis.fetch;

beforeEach(() => {
  h.store.clear();
  h.requests.length = 0;
  h.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO connector_credentials/.test(sql)) {
      h.store.set(`${params[0]}:${params[1]}`, params[2] as string);
      return { rows: [] };
    }
    if (/SELECT connector_id, is_valid FROM connector_credentials/.test(sql)) {
      const prefix = `${params[0]}:`;
      return {
        rows: [...h.store.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => ({ connector_id: k.slice(prefix.length), is_valid: true })),
      };
    }
    if (/SELECT credentials FROM connector_credentials/.test(sql)) {
      const v = h.store.get(`${params[0]}:${params[1]}`);
      return { rows: v ? [{ credentials: v }] : [] };
    }
    return { rows: [] };
  });
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    h.requests.push(url);
    if (url.href === 'https://oauth2.googleapis.com/token') return json({ access_token: 'drive-token', expires_in: 3600 });
    if (url.href === 'https://api.box.com/oauth2/token') return json({ access_token: 'box-token', expires_in: 3600 });
    if (url.hostname === 'api.box.com') return json({ entries: [] });
    if (url.hostname === 'www.googleapis.com') {
      return json({ files: [{ id: 'f1', name: '2025 stability protocol.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/f1' }] });
    }
    // A public source: answer as if it worked, so a call is never hidden by an error.
    return json({});
  }) as typeof fetch;
  // The tenant allows public-source egress: the tool must keep queries in anyway.
  setOrgPlacementResolver({ resolve: async () => ({ publicSourceEgress: true, publicSourceFrontier: true }) });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetOrgPlacementResolver();
});

const privateKey = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const connectDrive = (org: number) => storeCredentials(org, 'google_drive', { clientId: `svc-${org}@test.iam`, clientSecret: privateKey() });

async function run(org: number, input: Record<string, unknown>) {
  return JSON.parse(await getToolHandler('search_connected_repositories')!(input, { organizationId: org } as never));
}

const hosts = () => [...new Set(h.requests.map((u) => u.hostname))].sort();
const driveSearches = () => h.requests.filter((u) => u.href.startsWith('https://www.googleapis.com/drive/v3/files'));

describe('search_connected_repositories — the Drive id', () => {
  it("a search with ['google-drive'] reaches Drive", async () => {
    await connectDrive(DRIVE_ORG);
    const out = await run(DRIVE_ORG, { query: 'stability protocol', connectors: ['google-drive'] });

    expect(out.skipped).toEqual([]);
    expect(out.searched).toEqual(['google_drive']);
    expect(driveSearches()).toHaveLength(1);
    expect(out.documents.map((d: { connector: string; title: string }) => [d.connector, d.title])).toEqual([
      ['google_drive', '2025 stability protocol.pdf'],
    ]);
  });
});

describe('search_connected_repositories — repository-only', () => {
  it.each([true, false])('with connectors omitted and PubMed configured, PubMed is not called (publicSourceEgress %s)', async (egress) => {
    setOrgPlacementResolver({ resolve: async () => ({ publicSourceEgress: egress, publicSourceFrontier: egress }) });
    await connectDrive(DRIVE_ORG);
    // The premise: PubMed needs no credential, so it counts as configured.
    const pubmed = (await getConnectorCatalog(DRIVE_ORG)).find((c) => c.id === 'pubmed');
    expect(pubmed).toMatchObject({ configured: true, healthy: true });

    const out = await run(DRIVE_ORG, { query: 'pembrolizumab NSCLC protocol' });

    expect(hosts()).toEqual(['oauth2.googleapis.com', 'www.googleapis.com']);
    expect(h.requests.some((u) => u.hostname.endsWith('ncbi.nlm.nih.gov'))).toBe(false);
    expect(h.requests.some((u) => u.hostname === 'api.fda.gov')).toBe(false);
    expect(out.searched).toEqual(['google_drive']);
    // The repositories that are not connected are named; public sources are not candidates.
    expect(out.skipped.map((s: { connector: string }) => s.connector).sort()).toEqual(
      ['box', 'onedrive', 'sharepoint', 'veeva_vault'],
    );
  });

  it('an organisation with no repository connected sends nothing anywhere', async () => {
    const out = await run(NOTHING_ORG, { query: 'pembrolizumab' });
    expect(h.requests).toEqual([]);
    expect(out.searched).toEqual([]);
    expect(out.documents).toEqual([]);
  });

  it('a public source asked for by name is refused and never called', async () => {
    const out = await run(NOTHING_ORG, { query: 'pembrolizumab', connectors: ['pubmed', 'fda_drugs', 'clinical_trials_gov'] });
    expect(h.requests).toEqual([]);
    expect(out.searched).toEqual([]);
    expect(out.skipped).toHaveLength(3);
    for (const s of out.skipped) expect(s.reason).toMatch(/search_literature or the agency lookups/);
    expect(out.note).toMatch(/search_literature or the agency lookups/);
  });
});

describe('search_connected_repositories — an organisation without Drive', () => {
  it('is told "Google Drive is not connected for your organisation."', async () => {
    const out = await run(NOTHING_ORG, { query: '2025 stability protocol', connectors: ['google_drive'] });
    expect(out.note).toContain('Google Drive is not connected for your organisation.');
    expect(out.searched).toEqual([]);
    expect(out.documents).toEqual([]);
    expect(h.requests).toEqual([]);
  });

  it('is told the same when Drive is asked for beside a repository that is connected', async () => {
    await storeCredentials(BOX_ORG, 'box', { clientId: 'box-id', clientSecret: 'box-secret', baseUrl: '123' });
    const out = await run(BOX_ORG, { query: 'protocol', connectors: ['google-drive', 'box'] });
    expect(out.note).toContain('Google Drive is not connected for your organisation.');
    expect(out.skipped).toContainEqual({ connector: 'google_drive', reason: 'not connected for this organization' });
    expect(h.requests.some((u) => u.hostname.endsWith('googleapis.com'))).toBe(false);
  });
});

describe('search_connected_repositories — the schema', () => {
  const policyPool = { query: async () => ({ rows: [] }) };
  const schemaFor = async (org: number) => {
    const tools = await governedToolsetFor(policyPool, org);
    const tool = tools.find((t) => t.name === 'search_connected_repositories');
    expect(tool).toBeDefined();
    return { tool: JSON.stringify(tool), all: JSON.stringify(tools), parsed: tool as { input_schema: { properties: Record<string, { items?: { enum?: string[] } }> } } };
  };

  it('is byte-identical for two tenants with different connectors configured, and lists the five repositories', async () => {
    await connectDrive(DRIVE_ORG);
    await storeCredentials(BOX_ORG, 'box', { clientId: 'box-id', clientSecret: 'box-secret', baseUrl: '123' });
    const drive = await schemaFor(DRIVE_ORG);
    const box = await schemaFor(BOX_ORG);

    expect(box.tool).toBe(drive.tool);
    expect(box.all).toBe(drive.all);
    expect(drive.parsed.input_schema.properties.connectors.items?.enum).toEqual(REPOSITORIES);
  });

  it('tells the model where public sources are searched instead', async () => {
    const { tool } = await schemaFor(DRIVE_ORG);
    expect(tool).toMatch(/search_literature/);
    expect(tool).not.toMatch(/google-drive/);
  });
});
