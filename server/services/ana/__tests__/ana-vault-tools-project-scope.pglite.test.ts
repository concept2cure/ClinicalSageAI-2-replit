/**
 * AnA's governed-artifact and governed-document reads hold to the projects the person can open, and inside a project
 * to that project's sponsor's (F1, 2026-11-05).
 *
 * `list_vault_documents`, `read_vault_document`, `get_document_versions`, `compare_vault_versions`,
 * `list_governed_documents`, `read_governed_document` and `global_search` read with the organization as their only
 * filter. A member therefore read a private project's governed artifacts, and inside sponsor A's project a CRO's
 * other sponsors' too. The founder's rule: a CRO works across authorized sponsor projects "without mixing sponsor
 * data or permissions".
 *
 * The access policy is the real one (getAccessibleReportProjectIds, admitAnaProjectScope,
 * getCurrentAccessibleProgramScope), on PostgreSQL. Only the document-disposition projection is held open (it has its
 * own suite, artifact-disposition-tools.pglite.integration.test.ts), and the evidence-source resolver answers none.
 *
 * Evidence: docs/evidence/F1/2026-11-05-ana-vault-tools-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { RequestSqlClient } from '../../../db/requestDb';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
}));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, params?: unknown[]) => {
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  // update_vault_document writes in a transaction on a lent connection: the same single database.
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
// Current mandatory rules use the canonical runtime accessor, on the same real
// database and its deliberately empty policy table, rather than a policy mock.
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({
  query: (sql: string, params?: unknown[]) => h.pg.query<Record<string, unknown>>(sql, params),
}) }));
/* The write's own audit, lineage and provenance rows have their suites (qms-vault-audit-atomicity.contract.test.ts);
   here they are recorded calls, so this suite sees only who may write. The module builder is the assembly's. */
vi.mock('../../../routes/c2c/actions.js', () => ({ recordGovernedAction: vi.fn(async () => undefined) }));
// The direct-write role gate reads the role over drizzle, which this harness does not carry; the fixture's role.
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../clinical-regulatory-evidence/lineage-gate.js', () => ({ enforceAuthorLineage: vi.fn(async () => undefined) }));
vi.mock('../../provenance/artifact-provenance', () => ({ recordArtifactProvenance: vi.fn(async () => undefined) }));
vi.mock('../../docx/masterDocumentBuilder.js', () => ({
  getMasterDocumentBuilder: () => ({
    generateFromScratch: async (args: { sections: unknown[] }) => ({
      outputPath: '/tmp/module.docx', format: 'docx', sizeBytes: args.sections.length, buildDurationMs: 0,
    }),
  }),
}));
vi.mock('../../document-data-disposition/eligibility.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document-data-disposition/eligibility')>()),
  artifactDataEligibleSql: () => 'TRUE',
  artifactOriginalFileAvailableSql: () => 'TRUE',
}));
vi.mock('../drafting-source-lineage.js', () => ({ evidenceSourceIdsForRetrieval: async () => new Map() }));

import { executeAgenticLoop, getToolHandler, type ToolContext } from '../AnaToolExecutor';
import * as gatewayModule from '../../ai-gateway/gateway';
import type { AnaGatewayResponse } from '../../ai-gateway/types';
import { approvedToolHandler as approvedHandler } from './support/approved-tool-handler';
import { asRequestOwner, ownerScopedClient } from './support/request-owner';
import { captureCurrentRunSourceGate, createRunSourceAuthority, runWithSourceAuthority } from '../../ai-gateway/model-call-scope';
import { loadToolSkillGates } from '../governed-tool-gate';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORG = 1;
const MEMBER = 7;
const P_A1 = '11111111-1111-4111-8111-111111111111';
const P_A2 = '22222222-2222-4222-8222-222222222222';
const P_B = '33333333-3333-4333-8333-333333333333';
const P_PRIV = '44444444-4444-4444-8444-444444444444';
const P_THEIRS = '55555555-5555-4555-8555-555555555555';
// PGlite is one session: the request client sets each caller's own verified owner
// per statement, one at a time, so concurrent checks never see each other's (support/request-owner.ts).
const fixtureSql: RequestSqlClient = ownerScopedClient((sql, params) => h.pg.query<Record<string, unknown>>(sql, params));
const asFixtureOwner = asRequestOwner;
function approvedToolHandler(name: string) {
  const handler = approvedHandler(name); if (!handler) return undefined;
  return (input: Record<string, unknown>, ctx?: ToolContext) => asFixtureOwner(ctx, () => handler(input, ctx));
}

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, name text, code text,
      description text, status text DEFAULT 'active', deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text,
      regulatory_program_id uuid, client_workspace_id integer, status text DEFAULT 'active',
      owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}');
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE account_skill_bundles (id integer PRIMARY KEY, bundle_id text, organization_id integer,
      project_id integer, status text, metadata jsonb DEFAULT '{}');
    CREATE TABLE connector_credentials (organization_id integer, connector_id text, credentials text, is_valid boolean);
    CREATE TABLE user_intelligence_profiles (id serial PRIMARY KEY,user_id integer,organization_id integer,
      workflow_preferences jsonb DEFAULT '{}',UNIQUE(user_id,organization_id));
    CREATE TABLE audit_logs (id uuid PRIMARY KEY,tenant_id integer,user_id integer,record_id text,table_name text,
      action text,new_values jsonb,occurred_at timestamptz DEFAULT now(),actor_id integer,target text,payload_hash text,
      sha256_chain text,hmac_seal text,old_values json,ip_address text,user_agent text,reason text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id integer, project_id integer,
      title text, type text DEFAULT 'document', category text DEFAULT 'document', ctd_section text,
      status text DEFAULT 'draft', version integer DEFAULT 2, content text DEFAULT 'body', content_hash text,
      metadata json DEFAULT '{}', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
      locked_at timestamptz, created_by_id integer);
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, artifact_id integer, organization_id integer,
      version integer, content text, content_hash text, change_description text,
      created_at timestamptz DEFAULT now(), created_by_id integer);
    CREATE TABLE c2c_documents (id text PRIMARY KEY, org_id integer, project_id uuid, doc_type text, agency text,
      title text, status text DEFAULT 'draft', readiness integer DEFAULT 0, updated_at timestamptz DEFAULT now());
    CREATE TABLE c2c_document_sections (document_id text, section_key text, parent_key text, label text,
      status text, mandatory boolean, version integer, path_order integer, content jsonb);

    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (7, 'C. Consultant', 'c@cro', 'active'), (9, 'P. Owner', 'p@cro', 'active');
    INSERT INTO organization_users VALUES (1, 7, 'member'), (1, 9, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (101, 1, 'Contoso Pharma'), (200, 2, 'Their client');
    INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
      ('${P_A1}', 1, 'Northwind oncology IND', 'NW-1'),
      ('${P_A2}', 1, 'Northwind second IND', 'NW-2'),
      ('${P_B}', 1, 'Contoso device study', 'CT-1'),
      ('${P_PRIV}', 1, 'Northwind private program', 'NW-PRIV'),
      ('${P_THEIRS}', 2, 'Their program', 'THEIRS-1');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'NW-1', 'Northwind oncology IND', '${P_A1}', 100, 9, 9),
      (11, 1, 'NW-2', 'Northwind second IND', '${P_A2}', 100, 9, 9),
      (12, 1, 'NW-PRIV', 'Northwind private program', '${P_PRIV}', 100, 9, 9),
      (13, 1, 'CT-1', 'Contoso device study', '${P_B}', 101, 9, 9),
      (20, 2, 'THEIRS-1', 'Their program', '${P_THEIRS}', 200, 9, 9);
    INSERT INTO project_visibility_settings VALUES
      (1, 10, 'org_public'), (1, 11, 'org_public'), (1, 12, 'private'), (1, 13, 'org_public'), (2, 20, 'org_public');
    INSERT INTO project_members VALUES (1, 12, 9, 'owner', 'active');

    INSERT INTO concept2cure_artifacts (artifact_id, organization_id, project_id, title, updated_at) VALUES
      ('a-a1',     1, 10, 'Northwind clinical overview memo', now() - interval '1 hour'),
      ('a-a2',     1, 11, 'Northwind protocol memo',          now() - interval '2 hours'),
      ('a-b',      1, 13, 'Contoso device memo',              now() - interval '3 hours'),
      ('a-priv',   1, 12, 'Private memo',                     now() - interval '4 hours'),
      ('a-theirs', 2, 20, 'Their memo',                       now() - interval '5 hours');
    UPDATE concept2cure_artifacts SET ctd_section = '3.2.S.1' WHERE artifact_id IN ('a-a1', 'a-b', 'a-priv');
    INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash)
      SELECT a.id, a.organization_id, v, 'line ' || v, 'h' || v FROM concept2cure_artifacts a, generate_series(1, 2) v;

    INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, title, updated_at) VALUES
      ('doc_a1',   1, '${P_A1}',   'ind', 'fda', 'Northwind IND',      now() - interval '1 hour'),
      ('doc_b',    1, '${P_B}',    'k510', 'fda', 'Contoso 510(k)',    now() - interval '2 hours'),
      ('doc_priv', 1, '${P_PRIV}', 'ind', 'fda', 'Private IND',        now() - interval '3 hours'),
      ('doc_them', 2, '${P_THEIRS}', 'ind', 'fda', 'Their IND',        now() - interval '4 hours');
    INSERT INTO c2c_document_sections VALUES
      ('doc_a1', '2.5', NULL, 'Clinical overview', 'drafted', true, 1, 1, '{"text":"A"}'),
      ('doc_b', '2.5', NULL, 'Clinical overview', 'drafted', true, 1, 1, '{"text":"B"}'),
      ('doc_priv', '2.5', NULL, 'Clinical overview', 'drafted', true, 1, 1, '{"text":"P"}');
  `);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => { h.failWhen = null; });

type Ctx = { organizationId: number; userId?: number; projectId?: number | null; projectRef?: string | null; sqlClient?: RequestSqlClient };
const MEMBER_CTX: Ctx = { organizationId: ORG, userId: MEMBER, sqlClient: fixtureSql };
const INSIDE_A: Ctx = { organizationId: ORG, userId: MEMBER, projectId: null, projectRef: P_A1, sqlClient: fixtureSql };
const INSIDE_A_LEGACY: Ctx = { organizationId: ORG, userId: MEMBER, projectId: 10, projectRef: '10', sqlClient: fixtureSql };

async function run(name: string, input: Record<string, unknown>, ctx: Ctx) {
  return asFixtureOwner(ctx, async () => JSON.parse(String(await getToolHandler(name)!(input, ctx as never))));
}
const artifactIds = (out: { documents?: Array<{ artifact_id: string }> }) =>
  (out.documents ?? []).map((d) => d.artifact_id).sort();
const documentIds = (out: { documents?: Array<{ id: string }> }) => (out.documents ?? []).map((d) => d.id).sort();
/** The answer with the asked-for id taken out, so two answers can be compared word for word. */
const without = (text: unknown, id: string) => String(text).split(id).join('<id>');

describe('actual artifact reads issue private current-source routing checkpoints', () => {
  const actor = { organizationId: ORG, userId: MEMBER, projectId: 10, programId: P_A1 };
  function gateway(provider: 'openai' | 'local') {
    return new gatewayModule.AIGateway({ deterministicMode: false, auditEnabled: false,
      providers: [{ name: provider, enabled: true, apiKey: 'fixture-no-outbound', defaultModel: provider === 'local' ? 'local-default' : 'gpt-4o',
        ...(provider === 'local' ? { baseUrl: 'http://127.0.0.1:11434/v1' } : {}), models: [] }],
      policy: { maxTokensPerRequest: 128000, maxRequestsPerMinutePerOrg: 10000, maxRequestsPerMinutePerUser: 10000,
        blockedPatterns: [], contentFilters: false, piiDetection: false } });
  }
  it('a real parent tool result cannot enter the next frontier SDK through forged public tiers or provenance', async () => {
    const gw = gateway('openai'), sdk = vi.fn();
    (gw as unknown as { openaiClient: object }).openaiClient = { chat: { completions: { create: sdk } } };
    const initial: AnaGatewayResponse = { content: '', provider: 'openai', model: 'gpt-4o', requestId: 'fixture-first-local-decision',
      latencyMs: 1, cached: false, deterministic: false, toolUses: [{ id: 'read-source', name: 'read_vault_document', input: { artifact_id: 'a-a1' } }],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 } };
    // The decision to call the tool is scripted; the actual protected read and
    // following gateway/placement/SDK boundary are real. No model PQ is claimed.
    const route = vi.spyOn(gw, 'route').mockResolvedValueOnce(initial);
    const accessor = vi.spyOn(gatewayModule, 'getGateway').mockReturnValue(gw);
    try {
      await expect(asFixtureOwner(INSIDE_A, () => executeAgenticLoop({ taskType: 'chat', ...actor, provider: 'openai', inputSensitivityTiers: [0], payloadProvenance: 'public',
        messages: [{ role: 'user', content: 'Read the saved source.' }] }, { toolContext: INSIDE_A, maxRounds: 2 })))
        .rejects.toThrow('DENY_INPUT_TIER');
      expect(route).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(route.mock.calls[1][0].messages)).toContain('Northwind clinical overview memo');
      expect(sdk).not.toHaveBeenCalled();
    } finally { accessor.mockRestore(); route.mockRestore(); }
  });
  it('rechecks actual source SQL after the credential-client await directly before a permitted local SDK', async () => {
    const gw = gateway('local'), sdk = vi.fn();
    const probe = gw as unknown as { localClient: object; tenantProviderClient(): Promise<null> };
    probe.localClient = { chat: { completions: { create: sdk } } };
    const original = await h.pg.query<{ content: string }>("SELECT content FROM concept2cure_artifacts WHERE artifact_id='a-a1'");
    const credential = vi.spyOn(probe, 'tenantProviderClient').mockImplementation(async () => {
      await h.pg.query("UPDATE concept2cure_artifacts SET content=content || ' changed during credentials' WHERE artifact_id='a-a1'"); return null;
    });
    try {
      await runWithSourceAuthority(createRunSourceAuthority(actor), async () => {
        expect(await run('read_vault_document', { artifact_id: 'a-a1' }, INSIDE_A)).toMatchObject({ ok: true });
        await expect(gw.route({ taskType: 'chat', ...actor, provider: 'local', messages: [{ role: 'user', content: 'Use the current source.' }] }))
          .rejects.toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
      });
      expect(credential).toHaveBeenCalledOnce(); expect(sdk).not.toHaveBeenCalled();
    } finally { credential.mockRestore(); await h.pg.query("UPDATE concept2cure_artifacts SET content=$1 WHERE artifact_id='a-a1'", [original.rows[0].content]); }
  });
  it('rechecks exact full bytes and live permission, including another authorized project of the same sponsor', async () => {
    const original = await h.pg.query<{ content: string }>("SELECT content FROM concept2cure_artifacts WHERE artifact_id='a-a2'");
    await runWithSourceAuthority(createRunSourceAuthority(actor), async () => {
      expect(await run('read_vault_document', { artifact_id: 'a-a2', max_chars: 1 }, INSIDE_A)).toMatchObject({ ok: true });
      const checkpoint = captureCurrentRunSourceGate(actor)!;
      // The conversation's tier (model-call-scope.ts) and the artifact's own, unknown and so Tier 3.
      expect(checkpoint.tiers).toEqual([1, 3]); await checkpoint.recheck();
      try {
        // The legacy stored content_hash/version are deliberately unchanged.
        await h.pg.query("UPDATE concept2cure_artifacts SET content=$1 WHERE artifact_id='a-a2'", [original.rows[0].content + ' changed outside the excerpt']);
        await expect(checkpoint.recheck()).rejects.toThrow('SOURCE_ROUTING_CHANGED');
      } finally { await h.pg.query("UPDATE concept2cure_artifacts SET content=$1 WHERE artifact_id='a-a2'", [original.rows[0].content]); }
      await checkpoint.recheck();
      try {
        await h.pg.query('DELETE FROM organization_users WHERE organization_id=1 AND user_id=7');
        await expect(checkpoint.recheck()).rejects.toThrow('SOURCE_ROUTING_CHANGED');
      } finally { await h.pg.query("INSERT INTO organization_users VALUES(1,7,'member')"); }
    });
  });
  it('keeps two real tenant sources isolated while one source changes', async () => {
    await h.pg.query("INSERT INTO organization_users VALUES(2,7,'member')");
    const other = { organizationId: 2, userId: MEMBER, projectId: 20, programId: P_THEIRS };
    expect((await h.pg.query('SELECT id FROM regulatory_programs WHERE id=$1 AND organization_id=$2', [P_THEIRS,2])).rows).toHaveLength(1);
    const original = await h.pg.query<{ content: string }>("SELECT content FROM concept2cure_artifacts WHERE artifact_id='a-a1'");
    try {
      const gates = await Promise.all([actor, other].map(current => runWithSourceAuthority(createRunSourceAuthority(current), async () => {
        const id = current.organizationId === ORG ? 'a-a1' : 'a-theirs';
        const context = { ...current, projectRef: current.programId, sqlClient: fixtureSql };
        const rules = await asFixtureOwner(context, () => loadToolSkillGates(context));
        expect(rules).toMatchObject({ rules: [] });
        expect(await run('read_vault_document', { artifact_id: id }, context)).toMatchObject({ ok: true });
        return captureCurrentRunSourceGate(current)!;
      })));
      await Promise.all(gates.map(gate => gate.recheck()));
      await h.pg.query("UPDATE concept2cure_artifacts SET content=content || ' changed' WHERE artifact_id='a-a1'");
      await expect(gates[0].recheck()).rejects.toThrow('SOURCE_ROUTING_CHANGED');
      await expect(gates[1].recheck()).resolves.toBeUndefined();
    } finally {
      await h.pg.query("UPDATE concept2cure_artifacts SET content=$1 WHERE artifact_id='a-a1'", [original.rows[0].content]);
      await h.pg.query('DELETE FROM organization_users WHERE organization_id=2 AND user_id=7');
    }
  });
});

/** An id outside the scope is answered exactly as an id of no artifact: the same words, nothing more. */
async function expectAnsweredAsMissing(name: string, input: Record<string, unknown>, key: string, ctx: Ctx) {
  const hidden = await run(name, input, ctx);
  const missing = await run(name, { ...input, [key]: 'no-such-id' }, ctx);
  expect(missing.error, `${name}: a missing id is an error`).toBeTruthy();
  expect(hidden.ok, `${name}: ${JSON.stringify(hidden)}`).toBeUndefined();
  expect(Object.keys(hidden), name).toEqual(Object.keys(missing));
  expect(without(hidden.error, String(input[key])), name).toBe(without(missing.error, 'no-such-id'));
}

describe('no project open: every project the person can open, and only those', () => {
  it('list_vault_documents lists each open project of every sponsor, never a private project', async () => {
    const out = await run('list_vault_documents', {}, MEMBER_CTX);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(artifactIds(out)).toEqual(['a-a1', 'a-a2', 'a-b']);
    expect(JSON.stringify(out)).not.toMatch(/a-priv|Private memo|a-theirs|Their memo/);
  });

  it('each listed artifact names its project and its sponsor', async () => {
    const out = await run('list_vault_documents', {}, MEMBER_CTX);
    const byId = new Map((out.documents as Array<Record<string, unknown>>).map((d) => [d.artifact_id, d]));
    expect(byId.get('a-a1')).toMatchObject({ project_id: 10, project: 'NW-1', client: { id: 100, name: 'Northwind Bio' } });
    expect(byId.get('a-b')).toMatchObject({ project_id: 13, project: 'CT-1', client: { id: 101, name: 'Contoso Pharma' } });
  });

  it('read_vault_document, get_document_versions and compare_vault_versions answer a private artifact as a missing one', async () => {
    await expectAnsweredAsMissing('read_vault_document', { artifact_id: 'a-priv' }, 'artifact_id', MEMBER_CTX);
    await expectAnsweredAsMissing('get_document_versions', { artifact_id: 'a-priv' }, 'artifact_id', MEMBER_CTX);
    await expectAnsweredAsMissing('compare_vault_versions', { artifact_id: 'a-priv', version_a: 1, version_b: 2 }, 'artifact_id', MEMBER_CTX);
  });

  it('an artifact of an open project still reads, with its versions', async () => {
    const read = await run('read_vault_document', { artifact_id: 'a-b' }, MEMBER_CTX);
    expect(read.ok, JSON.stringify(read)).toBe(true);
    expect(read.document).toMatchObject({ artifact_id: 'a-b', project: 'CT-1' });
    expect((await run('get_document_versions', { artifact_id: 'a-b' }, MEMBER_CTX)).count).toBe(2);
    expect((await run('compare_vault_versions', { artifact_id: 'a-b', version_a: 1, version_b: 2 }, MEMBER_CTX)).ok).toBe(true);
  });

  it('list_governed_documents lists each open project of every sponsor, naming its project, never a private one', async () => {
    const out = await run('list_governed_documents', {}, MEMBER_CTX);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(documentIds(out)).toEqual(['doc_a1', 'doc_b']);
    const byId = new Map((out.documents as Array<Record<string, unknown>>).map((d) => [d.id, d]));
    expect(byId.get('doc_b')).toMatchObject({ project_id: P_B, project: 'CT-1', client: { id: 101, name: 'Contoso Pharma' } });
    expect(JSON.stringify(out)).not.toMatch(/doc_priv|Private IND|doc_them/);
  });

  it('read_governed_document answers a private project\'s document as a missing one', async () => {
    await expectAnsweredAsMissing('read_governed_document', { document_id: 'doc_priv' }, 'document_id', MEMBER_CTX);
    await expectAnsweredAsMissing('read_governed_document', { document_id: 'doc_priv', section_key: '2.5' }, 'document_id', MEMBER_CTX);
    expect((await run('read_governed_document', { document_id: 'doc_b' }, MEMBER_CTX)).ok).toBe(true);
  });

  it('global_search finds programs and artifact titles of open projects only', async () => {
    const out = await run('global_search', { q: 'memo' }, MEMBER_CTX);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const titles = (out.hits as Array<{ title?: string }>).map((x) => x.title).filter(Boolean).sort();
    expect(titles).toEqual(['Contoso device memo', 'Northwind clinical overview memo', 'Northwind protocol memo']);
    const programs = await run('global_search', { q: 'Northwind' }, MEMBER_CTX);
    const names = (programs.hits as Array<{ type: string; name?: string }>).filter((x) => x.type === 'program').map((x) => x.name).sort();
    expect(names).toEqual(['Northwind oncology IND', 'Northwind second IND']);
    expect(JSON.stringify(programs)).not.toMatch(/private program|Private memo/);
  });
});

describe("inside a project: only that project's sponsor's projects", () => {
  for (const [label, ctx] of [['a program uuid', INSIDE_A], ['a project id', INSIDE_A_LEGACY]] as const) {
    it(`list_vault_documents lists only the open project's sponsor (open project as ${label})`, async () => {
      const out = await run('list_vault_documents', {}, ctx);
      expect(out.ok, JSON.stringify(out)).toBe(true);
      expect(artifactIds(out)).toEqual(['a-a1', 'a-a2']);
      expect(JSON.stringify(out)).not.toContain('Contoso');
    });
  }

  it("the three artifact reads answer another sponsor's artifact as a missing one", async () => {
    await expectAnsweredAsMissing('read_vault_document', { artifact_id: 'a-b' }, 'artifact_id', INSIDE_A);
    await expectAnsweredAsMissing('get_document_versions', { artifact_id: 'a-b' }, 'artifact_id', INSIDE_A);
    await expectAnsweredAsMissing('compare_vault_versions', { artifact_id: 'a-b', version_a: 1, version_b: 2 }, 'artifact_id', INSIDE_A);
    expect((await run('read_vault_document', { artifact_id: 'a-a2' }, INSIDE_A)).ok).toBe(true);
  });

  it("governed documents: only the open project's sponsor's are listed or read", async () => {
    const out = await run('list_governed_documents', {}, INSIDE_A);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(documentIds(out)).toEqual(['doc_a1']);
    await expectAnsweredAsMissing('read_governed_document', { document_id: 'doc_b' }, 'document_id', INSIDE_A);
  });

  it("global_search finds only the open project's sponsor's programs and artifacts", async () => {
    const out = await run('global_search', { q: 'memo' }, INSIDE_A);
    const titles = (out.hits as Array<{ title?: string }>).map((x) => x.title).filter(Boolean).sort();
    expect(titles).toEqual(['Northwind clinical overview memo', 'Northwind protocol memo']);
    const programs = await run('global_search', { q: 'Contoso' }, INSIDE_A);
    expect(programs.ok).toBe(true);
    expect(programs.hits).toEqual([]);
  });

  it('an open project the person cannot open is refused, and nothing is listed', async () => {
    const out = await run('list_vault_documents', {}, { organizationId: ORG, userId: MEMBER, projectRef: P_PRIV });
    expect(out.error, JSON.stringify(out)).toBeTruthy();
    expect(out.documents).toBeUndefined();
  });
});

describe('an access check that cannot run is an error, never an empty result', () => {
  const READS: Array<[string, Record<string, unknown>]> = [
    ['list_vault_documents', {}],
    ['read_vault_document', { artifact_id: 'a-a1' }],
    ['get_document_versions', { artifact_id: 'a-a1' }],
    ['compare_vault_versions', { artifact_id: 'a-a1', version_a: 1, version_b: 2 }],
    ['list_governed_documents', {}],
    ['read_governed_document', { document_id: 'doc_a1' }],
    ['global_search', { q: 'memo' }],
  ];

  it('the sharing policy cannot be read: every tool says so', async () => {
    h.failWhen = /project_members/;
    for (const [name, input] of READS) {
      const out = await run(name, input, MEMBER_CTX);
      expect(out.error, `${name}: ${JSON.stringify(out)}`).toBeTruthy();
      expect(out.ok, name).toBeUndefined();
      expect(out.documents ?? out.hits ?? out.content ?? out.versions, name).toBeUndefined();
    }
  });

  it("the projects' program anchors cannot be read: the governed-document reads and global_search say so", async () => {
    h.failWhen = /regulatory_program_id::text AS program_id,id,client_workspace_id/;
    for (const [name, input] of READS.filter(([n]) => ['list_governed_documents', 'read_governed_document', 'global_search'].includes(n))) {
      const out = await run(name, input, MEMBER_CTX);
      expect(out.error, `${name}: ${JSON.stringify(out)}`).toBeTruthy();
      expect(out.documents ?? out.hits ?? out.outline, name).toBeUndefined();
    }
  });

  it('a caller who is not a current member, or no identified caller, is refused', async () => {
    for (const ctx of [{ organizationId: ORG, userId: 55 }, { organizationId: ORG }]) {
      for (const [name, input] of READS) {
        const out = await run(name, input, ctx);
        expect(out.error, `${name}: ${JSON.stringify(out)}`).toBeTruthy();
        expect(out.documents ?? out.hits ?? out.content ?? out.versions, name).toBeUndefined();
      }
    }
  });
});

/* F1 (2026-11-05): AnA's one write of a governed artifact, and its module assembly, which reads artifact content for
   a project the model names. Both used the organization as their only filter. */
describe('update_vault_document writes only where the person may change the project', () => {
  const versions = async (artifactId: string) => Number((await h.pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM concept2cure_artifact_versions v JOIN concept2cure_artifacts a ON a.id = v.artifact_id
      WHERE a.artifact_id = $1`, [artifactId])).rows[0].n);
  /* As an approved model's call that a person confirmed: neither gate is what this suite tests
     (governed-write-gate.test.ts and direct-mutator-confirm-gate.test.ts are), and either would refuse every id alike,
     a private one included. */
  const write = async (artifactId: string, ctx: Ctx) => JSON.parse(String(await approvedToolHandler('update_vault_document')!(
    { artifact_id: artifactId, content: 'A new body.', reason: 'Reviewer comments incorporated.' },
    { ...ctx, humanConfirmed: true } as never)));

  it("a private project's artifact is answered as a missing one, and nothing is written", async () => {
    const before = await versions('a-priv');
    const hidden = await write('a-priv', MEMBER_CTX);
    const missing = await write('no-such-id', MEMBER_CTX);
    expect(without(hidden.error, 'a-priv')).toBe(without(missing.error, 'no-such-id'));
    expect(await versions('a-priv')).toBe(before);
  });

  it("inside a project, another sponsor's artifact is answered as a missing one, and nothing is written", async () => {
    const before = await versions('a-b');
    const hidden = await write('a-b', INSIDE_A);
    expect(hidden.ok).toBeUndefined();
    expect(String(hidden.error)).toMatch(/No Artifacts Center document 'a-b'/);
    expect(await versions('a-b')).toBe(before);
  });

  it('a project the person can open but not change is refused, and nothing is written', async () => {
    const before = await versions('a-a1');
    const out = await write('a-a1', MEMBER_CTX);
    expect(out).toMatchObject({ code: 'PROJECT_WRITE_ACCESS_DENIED' });
    expect(String(out.error)).toMatch(/Nothing was changed/);
    expect(await versions('a-a1')).toBe(before);
  });

  it("with the project's edit right, the new version is written", async () => {
    await h.pg.query(`INSERT INTO project_members VALUES (1, 10, 7, 'edit', 'active')`);
    try {
      const before = await versions('a-a1');
      const out = await write('a-a1', INSIDE_A);
      expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
      expect(await versions('a-a1')).toBe(before + 1);
    } finally {
      await h.pg.query(`DELETE FROM project_members WHERE project_id = 10 AND user_id = 7`);
    }
  });

  it('a check that cannot run writes nothing, and says so', async () => {
    const before = await versions('a-a1');
    h.failWhen = /FROM project_members/;
    const out = await write('a-a1', MEMBER_CTX);
    h.failWhen = null;
    expect(out.ok).toBeUndefined();
    expect(out.code).toMatch(/UNAVAILABLE|DENIED/);
    expect(await versions('a-a1')).toBe(before);
  });
});

describe('assemble_ectd_module_from_artifacts assembles only a project the person can open', () => {
  const assemble = (projectId: number, ctx: Ctx) =>
    run('assemble_ectd_module_from_artifacts', { project_id: projectId, module_number: '3.2.S' }, ctx);

  it('an open project of the open sponsor assembles', async () => {
    const out = await assemble(10, INSIDE_A);
    expect(out, JSON.stringify(out)).toMatchObject({ module_number: '3.2.S', sections_assembled: 1 });
  });

  it("a private project, or another sponsor's from inside a project, reads as a project with no such artifacts", async () => {
    const privateOne = await assemble(12, MEMBER_CTX);
    expect(String(privateOne.error)).toMatch(/No artifacts found for module 3\.2\.S in project 12/);
    const otherSponsor = await assemble(13, INSIDE_A);
    expect(String(otherSponsor.error)).toMatch(/No artifacts found for module 3\.2\.S in project 13/);
    // Asked with no project open, the same other-sponsor project is one the person can open.
    expect(await assemble(13, MEMBER_CTX)).toMatchObject({ sections_assembled: 1 });
  });

  it("another organization's project reads as a project with no such artifacts", async () => {
    const out = await assemble(20, MEMBER_CTX);
    expect(String(out.error)).toMatch(/No artifacts found/);
  });
});

/* F1-C (2026-11-05): search_all_documents and validate_cross_references read c2c_documents (and, the search,
   concept2cure_artifacts) by organization only; and execute_platform_command opened AnA's platform commands, whose
   artifact reads had no access check, without the open v2 project. */
describe('search_all_documents searches only the projects the person can open', () => {
  beforeAll(async () => {
    await h.pg.exec(`CREATE TABLE IF NOT EXISTS tmf_artifacts (id serial PRIMARY KEY, organization_id integer, tmf_file_id integer,
      zone integer, artifact_name text, status text, deleted_at timestamptz, updated_at timestamptz DEFAULT now())`);
  });
  const hitsOf = (out: { hits?: Array<{ store: string; artifact_id?: string; id?: string }> }, store: string) =>
    (out.hits ?? []).filter((x) => x.store === store).map((x) => x.artifact_id ?? x.id).sort();

  it('no project open: the vault and governed stores of open projects of every sponsor, never a private project', async () => {
    const memos = await run('search_all_documents', { query: 'memo' }, MEMBER_CTX);
    expect(memos.ok, JSON.stringify(memos)).toBe(true);
    expect(hitsOf(memos, 'vault')).toEqual(['a-a1', 'a-a2', 'a-b']);
    const inds = await run('search_all_documents', { query: 'IND' }, MEMBER_CTX);
    expect(hitsOf(inds, 'governed')).toEqual(['doc_a1']);
    expect(JSON.stringify([memos, inds])).not.toMatch(/a-priv|Private memo|Private IND|doc_priv|doc_them|Their/);
  });

  it("inside a project: only the open project's sponsor's", async () => {
    const memos = await run('search_all_documents', { query: 'memo' }, INSIDE_A);
    expect(hitsOf(memos, 'vault')).toEqual(['a-a1', 'a-a2']);
    const contoso = await run('search_all_documents', { query: '510' }, INSIDE_A);
    expect(contoso.ok, JSON.stringify(contoso)).toBe(true);
    expect(contoso.hits).toEqual([]);
  });

  it('a check that cannot run is an error, and nothing is searched', async () => {
    h.failWhen = /project_members/;
    const out = await run('search_all_documents', { query: 'memo' }, MEMBER_CTX);
    expect(out.error, JSON.stringify(out)).toBeTruthy();
    expect(out.hits).toBeUndefined();
  });
});

describe('validate_cross_references reads only a document of a project the person can open', () => {
  const input = (documentId: string) => ({ document_id: documentId, section_references: ['Section 2.5'] });

  it("a private project's document, or another sponsor's from inside a project, is answered as a missing one", async () => {
    await expectAnsweredAsMissing('validate_cross_references', input('doc_priv'), 'document_id', MEMBER_CTX);
    await expectAnsweredAsMissing('validate_cross_references', input('doc_them'), 'document_id', MEMBER_CTX);
    await expectAnsweredAsMissing('validate_cross_references', input('doc_b'), 'document_id', INSIDE_A);
  });

  it('a document of a project the person can open is checked', async () => {
    const out = await run('validate_cross_references', input('doc_b'), MEMBER_CTX);
    expect(out, JSON.stringify(out)).toMatchObject({ documentId: 'doc_b', referencesChecked: 1 });
    expect((await run('validate_cross_references', input('doc_a1'), INSIDE_A)).documentId).toBe('doc_a1');
  });

  it('a check that cannot run is an error, and nothing is checked', async () => {
    h.failWhen = /project_members/;
    const out = await run('validate_cross_references', input('doc_b'), MEMBER_CTX);
    expect(out.error, JSON.stringify(out)).toBeTruthy();
    expect(out.results).toBeUndefined();
  });
});

describe("execute_platform_command reads inside the open project's sponsor", () => {
  const search = (ctx: Ctx) => run('execute_platform_command', { command: 'search_artifacts', params: { query: 'memo' } }, ctx);
  const titlesOf = (out: { result?: { data?: { results?: Array<{ title: string }> } } }) =>
    (out.result?.data?.results ?? []).map((r) => r.title).sort();

  it('inside a v2 project (a program uuid), only that sponsor\'s artifacts are found', async () => {
    const out = await search(INSIDE_A);
    expect(out.status, JSON.stringify(out)).toBe('executed');
    expect(titlesOf(out)).toEqual(['Northwind clinical overview memo', 'Northwind protocol memo']);
  });

  it('no project open: every open project of every sponsor, never a private project', async () => {
    const out = await search(MEMBER_CTX);
    expect(titlesOf(out)).toEqual(['Contoso device memo', 'Northwind clinical overview memo', 'Northwind protocol memo']);
  });
});
