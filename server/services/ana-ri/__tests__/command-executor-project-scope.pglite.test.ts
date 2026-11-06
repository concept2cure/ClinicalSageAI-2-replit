/**
 * AnA's platform-command artifact reads hold to the projects the person can open, and inside an open project to that
 * project's sponsor's (F1-C, 2026-11-05).
 *
 * list_artifacts, check_dossier_readiness, search_artifacts, list_artifact_versions, run_compliance_scan,
 * export_artifact, compare_versions and review_version_impact read concept2cure_artifacts or
 * concept2cure_artifact_versions by organization and a project or artifact id from params, with only role RBAC
 * (authorizeCommand) before them. So a member read a private project's artifacts, and inside sponsor A's project a
 * CRO's other sponsors' too. The founder's rule: a CRO works across authorized sponsor projects "without mixing
 * sponsor data or permissions".
 *
 * Through executeCommands, the one dispatch every caller uses (the AnA tool execute_platform_command, POST
 * /api/ana-ri/execute, chat action blocks, POST /api/ana-ri/governed-action). The access policy is the real one
 * (getAccessibleReportProjectIds, admitAnaProjectScope, narrowToSponsorOf), on PostgreSQL, with no access stub.
 *
 * Evidence: docs/evidence/F1/2026-11-05-ana-command-executor-scope/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
  seen: [] as string[],
}));
vi.mock('../../../db', () => {
  const query = async (sql: string, params?: unknown[]) => {
    h.seen.push(sql);
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
// review_version_impact's model call: none in this suite, so it answers with the structural diff.
vi.mock('../../ai-gateway/index.js', () => ({ getGateway: () => { throw new Error('No model gateway in this suite.'); } }));

import { executeCommands, reviewVersionImpact, type CommandContext } from '../command-executor';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ORG = 1;
const MEMBER = 7;
const P_A1 = '11111111-1111-4111-8111-111111111111';
const P_A2 = '22222222-2222-4222-8222-222222222222';
const P_B = '33333333-3333-4333-8333-333333333333';
const P_PRIV = '44444444-4444-4444-8444-444444444444';
const P_THEIRS = '55555555-5555-4555-8555-555555555555';
/* Projects: 310 and 311 are Northwind's (sponsor 100), 312 is Northwind's and private to its owner, 313 is Contoso's
   (sponsor 101), 320 is another organization's. Artifacts 501..505, one per project. 399 and 599 exist nowhere. */
const A = { a1: 501, a2: 502, b: 503, priv: 504, theirs: 505 } as const;
const NO_PROJECT = 399;
const NO_ARTIFACT = 599;

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active', settings jsonb DEFAULT '{}');
    CREATE TABLE users (id integer PRIMARY KEY, name text, email text, status text DEFAULT 'active', title text, department text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer NOT NULL, name text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, name text, code text,
      description text, status text DEFAULT 'active', deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, code text, name text,
      regulatory_program_id uuid, client_workspace_id integer, status text DEFAULT 'active',
      owner_id integer, created_by_id integer, settings jsonb DEFAULT '{}');
    CREATE TABLE project_visibility_settings (organization_id integer, project_id integer, visibility text);
    CREATE TABLE project_members (organization_id integer, project_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id integer PRIMARY KEY, artifact_id text, organization_id integer, project_id integer,
      title text, type text DEFAULT 'document', ctd_section text, status text DEFAULT 'draft', version integer DEFAULT 2,
      content text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE concept2cure_artifact_versions (id serial PRIMARY KEY, artifact_id integer, organization_id integer,
      version integer, content text, change_description text, created_at timestamptz DEFAULT now(), created_by_id integer);
    CREATE FUNCTION public.actor_name(integer) RETURNS TABLE(name text, email text)
      LANGUAGE sql AS $$ SELECT 'Fixture editor'::text, NULL::text $$;

    INSERT INTO organizations (id) VALUES (1), (2);
    INSERT INTO users VALUES (7, 'C. Consultant', 'c@cro', 'active'), (9, 'P. Owner', 'p@cro', 'active');
    INSERT INTO organization_users VALUES (1, 7, 'member'), (1, 9, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (101, 1, 'Contoso Pharma'), (200, 2, 'Their client');
    INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
      ('${P_A1}', 1, 'Northwind oncology IND', 'NW-1'), ('${P_A2}', 1, 'Northwind second IND', 'NW-2'),
      ('${P_B}', 1, 'Contoso device study', 'CT-1'), ('${P_PRIV}', 1, 'Northwind private program', 'NW-PRIV'),
      ('${P_THEIRS}', 2, 'Their program', 'THEIRS-1');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (310, 1, 'NW-1', 'Northwind oncology IND', '${P_A1}', 100, 9, 9),
      (311, 1, 'NW-2', 'Northwind second IND', '${P_A2}', 100, 9, 9),
      (312, 1, 'NW-PRIV', 'Northwind private program', '${P_PRIV}', 100, 9, 9),
      (313, 1, 'CT-1', 'Contoso device study', '${P_B}', 101, 9, 9),
      (320, 2, 'THEIRS-1', 'Their program', '${P_THEIRS}', 200, 9, 9);
    INSERT INTO project_visibility_settings VALUES
      (1, 310, 'org_public'), (1, 311, 'org_public'), (1, 312, 'private'), (1, 313, 'org_public'), (2, 320, 'org_public');
    INSERT INTO project_members VALUES (1, 312, 9, 'owner', 'active');

    INSERT INTO concept2cure_artifacts (id, artifact_id, organization_id, project_id, title, ctd_section, content, updated_at) VALUES
      (501, 'a-a1',     1, 310, 'Northwind clinical overview memo', '2.5', 'Northwind efficacy memo body', now() - interval '1 hour'),
      (502, 'a-a2',     1, 311, 'Northwind protocol memo',          '2.7', 'Northwind protocol memo body', now() - interval '2 hours'),
      (503, 'a-b',      1, 313, 'Contoso device memo',              '2.5', 'Contoso device memo body',     now() - interval '3 hours'),
      (504, 'a-priv',   1, 312, 'Private memo',                     '2.5', 'Private memo body',            now() - interval '4 hours'),
      (505, 'a-theirs', 2, 320, 'Their memo',                       '2.5', 'Their memo body',              now() - interval '5 hours');
    INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, change_description)
      SELECT a.id, a.organization_id, v, 'line ' || v || E'\n' || a.content, 'revision ' || v
        FROM concept2cure_artifacts a, generate_series(1, 2) v;
  `);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => { h.failWhen = null; h.seen = []; });

const NO_PROJECT_OPEN: CommandContext = { organizationId: ORG, userId: MEMBER };
const INSIDE_A: CommandContext = { organizationId: ORG, userId: MEMBER, activeProjectId: 310 };
const INSIDE_A_V2: CommandContext = { organizationId: ORG, userId: MEMBER, activeProjectRef: P_A1 };

async function run(command: string, params: Record<string, unknown>, ctx: CommandContext) {
  const [result] = await executeCommands([{ command, params } as never], { ...ctx });
  return result as { success: boolean; error?: string; message: string; data?: Record<string, unknown> };
}
/** The answer with the asked-for id taken out, so two answers can be compared word for word. */
const without = (value: unknown, id: number | string) => JSON.stringify(value).split(String(id)).join('<id>');

/** An id outside the scope is answered exactly as an id of nothing: the same fields, the same words. */
async function expectAnsweredAsMissing(command: string, params: Record<string, unknown>, key: string, missingId: number, ctx: CommandContext) {
  const hidden = await run(command, params, ctx);
  const missing = await run(command, { ...params, [key]: missingId }, ctx);
  expect(without(hidden, String(params[key])), command).toBe(without(missing, missingId));
  expect(JSON.stringify(hidden), command).not.toMatch(/Private memo|Contoso device memo|Their memo|Northwind[^"]* memo body/);
}

const titles = (result: { data?: Record<string, unknown> }, key: 'results' | 'artifacts') =>
  ((result.data?.[key] ?? []) as Array<{ title: string }>).map((r) => r.title).sort();

describe('no project open: every project the person can open, and only those', () => {
  it('list_artifacts and check_dossier_readiness answer a private project as one that does not exist', async () => {
    await expectAnsweredAsMissing('list_artifacts', { projectId: 312 }, 'projectId', NO_PROJECT, NO_PROJECT_OPEN);
    await expectAnsweredAsMissing('check_dossier_readiness', { projectId: 312 }, 'projectId', NO_PROJECT, NO_PROJECT_OPEN);
    await expectAnsweredAsMissing('list_artifacts', { projectId: 320 }, 'projectId', NO_PROJECT, NO_PROJECT_OPEN);
    // An answer, not two failures that happen to match: a project with nothing the person can read.
    expect(await run('list_artifacts', { projectId: 312 }, NO_PROJECT_OPEN)).toMatchObject({ success: true, data: { count: 0 } });
    expect(await run('check_dossier_readiness', { projectId: 312 }, NO_PROJECT_OPEN)).toMatchObject({ success: true, data: { total: 0 } });
  });

  it('a project the person can open lists and reports its artifacts', async () => {
    const listed = await run('list_artifacts', { projectId: 313 }, NO_PROJECT_OPEN);
    expect(listed.success, JSON.stringify(listed)).toBe(true);
    expect(titles(listed, 'artifacts')).toEqual(['Contoso device memo']);
    const readiness = await run('check_dossier_readiness', { projectId: 313 }, NO_PROJECT_OPEN);
    expect(readiness.data).toMatchObject({ total: 1 });
  });

  it('search_artifacts finds the artifacts of open projects of every sponsor, never a private project', async () => {
    const out = await run('search_artifacts', { query: 'memo' }, NO_PROJECT_OPEN);
    expect(out.success, JSON.stringify(out)).toBe(true);
    expect(titles(out, 'results')).toEqual(['Contoso device memo', 'Northwind clinical overview memo', 'Northwind protocol memo']);
    expect(JSON.stringify(out)).not.toMatch(/Private memo|Their memo/);
  });

  it('search_artifacts with a private project named finds nothing, as with a missing project', async () => {
    await expectAnsweredAsMissing('search_artifacts', { query: 'memo', projectId: 312 }, 'projectId', NO_PROJECT, NO_PROJECT_OPEN);
  });

  it('the artifact reads answer a private artifact as a missing one', async () => {
    await expectAnsweredAsMissing('list_artifact_versions', { artifactId: A.priv }, 'artifactId', NO_ARTIFACT, NO_PROJECT_OPEN);
    await expectAnsweredAsMissing('compare_versions', { artifactId: A.priv, versionA: 1, versionB: 2 }, 'artifactId', NO_ARTIFACT, NO_PROJECT_OPEN);
    await expectAnsweredAsMissing('run_compliance_scan', { projectId: 312, artifactId: 'a-priv' }, 'artifactId', NO_ARTIFACT, NO_PROJECT_OPEN);
    await expectAnsweredAsMissing('export_artifact', { projectId: 312, artifactId: 'a-priv', format: 'pdf' }, 'artifactId', NO_ARTIFACT, NO_PROJECT_OPEN);
  });

  it("another organization's artifact is answered as a missing one", async () => {
    await expectAnsweredAsMissing('compare_versions', { artifactId: A.theirs, versionA: 1, versionB: 2 }, 'artifactId', NO_ARTIFACT, NO_PROJECT_OPEN);
  });

  it('an artifact of a project the person can open still reads', async () => {
    expect((await run('list_artifact_versions', { artifactId: A.b }, NO_PROJECT_OPEN)).data).toMatchObject({ count: 2 });
    expect((await run('compare_versions', { artifactId: A.b, versionA: 1, versionB: 2 }, NO_PROJECT_OPEN)).success).toBe(true);
    expect((await run('run_compliance_scan', { projectId: 313, artifactId: 'a-b' }, NO_PROJECT_OPEN)).success).toBe(true);
    const exported = await run('export_artifact', { projectId: 313, artifactId: 'a-b', format: 'pdf' }, NO_PROJECT_OPEN);
    expect(exported.data).toMatchObject({ title: 'Contoso device memo', content: 'Contoso device memo body' });
  });

  it('review_version_impact reads only an artifact the person can open', async () => {
    const params = { projectId: 312, artifactId: A.priv, versionA: 1, versionB: 2 };
    const hidden = await reviewVersionImpact({ ...NO_PROJECT_OPEN }, params);
    const missing = await reviewVersionImpact({ ...NO_PROJECT_OPEN }, { ...params, artifactId: NO_ARTIFACT });
    expect(without(hidden, A.priv)).toBe(without(missing, NO_ARTIFACT));
    expect(hidden.success).toBe(false);
    const open = await reviewVersionImpact({ ...NO_PROJECT_OPEN }, { ...params, projectId: 313, artifactId: A.b });
    expect(open, JSON.stringify(open)).toMatchObject({ success: true, data: { aiReasoningAvailable: false } });
  });
});

describe("inside a project: only that project's sponsor's projects", () => {
  for (const [label, ctx] of [['a project id', INSIDE_A], ['a program uuid (the v2 shell)', INSIDE_A_V2]] as const) {
    it(`search_artifacts finds only the open project's sponsor's artifacts (open project as ${label})`, async () => {
      const out = await run('search_artifacts', { query: 'memo' }, ctx);
      expect(out.success, JSON.stringify(out)).toBe(true);
      expect(titles(out, 'results')).toEqual(['Northwind clinical overview memo', 'Northwind protocol memo']);
      expect(JSON.stringify(out)).not.toContain('Contoso');
    });
  }

  it("another sponsor's project and artifacts are answered as missing ones", async () => {
    await expectAnsweredAsMissing('list_artifacts', { projectId: 313 }, 'projectId', NO_PROJECT, INSIDE_A);
    await expectAnsweredAsMissing('check_dossier_readiness', { projectId: 313 }, 'projectId', NO_PROJECT, INSIDE_A);
    await expectAnsweredAsMissing('list_artifact_versions', { artifactId: A.b }, 'artifactId', NO_ARTIFACT, INSIDE_A_V2);
    await expectAnsweredAsMissing('compare_versions', { artifactId: A.b, versionA: 1, versionB: 2 }, 'artifactId', NO_ARTIFACT, INSIDE_A);
    await expectAnsweredAsMissing('run_compliance_scan', { projectId: 313, artifactId: 'a-b' }, 'artifactId', NO_ARTIFACT, INSIDE_A);
    await expectAnsweredAsMissing('export_artifact', { projectId: 313, artifactId: 'a-b', format: 'pdf' }, 'artifactId', NO_ARTIFACT, INSIDE_A);
  });

  it("the open sponsor's other project still reads, and an omitted projectId means the open project", async () => {
    expect((await run('compare_versions', { artifactId: A.a2, versionA: 1, versionB: 2 }, INSIDE_A)).success).toBe(true);
    expect(titles(await run('list_artifacts', { projectId: 311 }, INSIDE_A), 'artifacts')).toEqual(['Northwind protocol memo']);
    expect(titles(await run('list_artifacts', {}, INSIDE_A), 'artifacts')).toEqual(['Northwind clinical overview memo']);
  });

  it('an open project the person cannot open is refused exactly as one that does not exist, and nothing is read', async () => {
    const hidden = await run('search_artifacts', { query: 'memo' }, { ...NO_PROJECT_OPEN, activeProjectId: 312 });
    const missing = await run('search_artifacts', { query: 'memo' }, { ...NO_PROJECT_OPEN, activeProjectId: NO_PROJECT });
    expect(hidden, JSON.stringify(hidden)).toMatchObject({ success: false, error: 'ANA_PROJECT_NOT_FOUND' });
    expect(hidden).toEqual(missing);
    expect(hidden.data).toBeUndefined();
  });
});

describe('an access check that cannot run is an error, never an empty result', () => {
  const READS: Array<[string, Record<string, unknown>]> = [
    ['list_artifacts', { projectId: 310 }],
    ['check_dossier_readiness', { projectId: 310 }],
    ['search_artifacts', { query: 'memo' }],
    ['list_artifact_versions', { artifactId: A.a1 }],
    ['compare_versions', { artifactId: A.a1, versionA: 1, versionB: 2 }],
    ['run_compliance_scan', { projectId: 310, artifactId: 'a-a1' }],
    ['export_artifact', { projectId: 310, artifactId: 'a-a1', format: 'pdf' }],
  ];

  it('the sharing policy cannot be read: every read is refused with a code', async () => {
    h.failWhen = /project_members/;
    for (const [command, params] of READS) {
      const out = await run(command, params, NO_PROJECT_OPEN);
      expect(out, `${command}: ${JSON.stringify(out)}`).toMatchObject({ success: false, error: 'PROJECT_ACCESS_UNAVAILABLE' });
      expect(out.data, command).toBeUndefined();
    }
    h.failWhen = null;
    const review = await reviewVersionImpact({ ...NO_PROJECT_OPEN }, { projectId: 310, artifactId: A.a1, versionA: 1, versionB: 2 });
    expect(review.success).toBe(true);
    h.failWhen = /project_members/;
    const refused = await reviewVersionImpact({ ...NO_PROJECT_OPEN }, { projectId: 310, artifactId: A.a1, versionA: 1, versionB: 2 });
    expect(refused).toMatchObject({ success: false, error: 'PROJECT_ACCESS_UNAVAILABLE' });
  });

  it('a caller who is not a current member is refused, and nothing is read', async () => {
    for (const [command, params] of READS) {
      const out = await run(command, params, { organizationId: ORG, userId: 55 });
      expect(out.success, `${command}: ${JSON.stringify(out)}`).toBe(false);
      expect(out.error, command).toBe('PROJECT_ACTOR_ACCESS_DENIED');
      expect(out.data, command).toBeUndefined();
    }
  });

  it('the scope is resolved once per dispatch, before the reads run', async () => {
    const policyReads = () => h.seen.filter((sql) => /FROM project_members m/.test(sql)).length;
    await executeCommands(READS.map(([command, params]) => ({ command, params })) as never, { ...NO_PROJECT_OPEN });
    expect(policyReads()).toBe(1);
  });

  it('a command that reads no artifact is not held to the scope', async () => {
    h.failWhen = /project_members/;
    const out = await run('list_team_members', {}, NO_PROJECT_OPEN);
    expect(out, JSON.stringify(out)).toMatchObject({ success: true, data: { count: 2 } });
  });
});
