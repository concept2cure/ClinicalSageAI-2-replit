/**
 * AnA's study-design capabilities, reached under launch scope (P-122, 2026-11-12): `simulate_study_design` and the
 * platform commands `recommend_endpoints` and `evaluate_endpoint`, filed until now under the locked CSR workflow
 * screen and so withheld in production. The job is the protocol workspace's (`protocol-dev`), which already serves
 * the same engine to the same organisation at POST /api/study-design/simulate.
 *
 * What is held here, with launch scope ON, the real registry wrapper and the real command dispatch:
 *   - a member of the project is answered; a user of another organisation who opens that project is refused before
 *     anything runs, and so is a member who cannot open a private project (the wrapper's project admission);
 *   - what each reads is the caller's organisation's CSR corpus and no other. That corpus (csr_reports) has no
 *     project key: it is the organisation's library, so the organisation is the boundary;
 *   - RULE 2: the figures come from engines. The simulation calls no model and gives the same answer twice; an
 *     endpoint evaluation carries no score even when the model's commentary contains one; a model-proposed endpoint
 *     carries no rate and is labelled as that.
 *
 * Real PostgreSQL (PGlite): the corpus tables from the Drizzle schema, two organisations' reports. The model and the
 * literature search are doubles.
 *
 * Evidence: docs/evidence/DESIGN/P-122/ana-reach/.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { csrDetails, csrReports } from '../../../../shared/schema';
import type { RequestSqlClient } from '../../../db/requestDb';

const { holder, hf, academic } = vi.hoisted(() => ({
  holder: { pg: null as unknown as import('@electric-sql/pglite').PGlite, db: null as unknown },
  hf: { queryHuggingFace: vi.fn(async (_prompt: string) => '[]') },
  academic: { searchAcademicKnowledge: async () => [], getRecentlyProcessedDocuments: () => [] },
}));
const dbDouble = vi.hoisted(() => {
  const query = (sql: string, params?: unknown[]) => holder.pg.query(sql, params as unknown[]);
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { get db() { return holder.db; }, pool, getPool: () => pool, getDb: () => holder.db };
});
vi.mock('../../../db', () => dbDouble);
vi.mock('../../../db.js', () => dbDouble);
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({
  query: (sql: string, params?: unknown[]) => holder.pg.query<Record<string, unknown>>(sql, params),
}) }));
vi.mock('../../../huggingface-service', () => ({ huggingFaceService: hf }));
vi.mock('../../academic-document-processor', () => ({ academicDocumentProcessor: academic }));

import { getToolHandler } from '../AnaToolExecutor';
import { STUDY_TWIN_DISCLAIMER, HISTORY_UPLOAD_REQUEST } from '../../study-design/study-twin-service';
import { asRequestOwner, ownerScopedClient } from './support/request-owner';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const P_OPEN = '11111111-1111-4111-8111-111111111111';
const P_PRIVATE = '44444444-4444-4444-8444-444444444444';
/** Organisation 1: 7 can open project 10; 9 owns the private project 12. Organisation 2: 21. Organisation 3: 31, no corpus. */
const MEMBER = 7, OWNER = 9, OUTSIDER = 21, NO_CORPUS = 31;
const T2D = 'Type 2 diabetes';
const OURS = 'Change from baseline in HbA1c at week 26';
const THEIRS = 'Organisation two glycaemic endpoint at week 12';

const fixtureSql: RequestSqlClient = ownerScopedClient((sql, params) => holder.pg.query<Record<string, unknown>>(sql, params));

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(`
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
    CREATE TABLE user_intelligence_profiles (id serial PRIMARY KEY, user_id integer, organization_id integer,
      workflow_preferences jsonb DEFAULT '{}', UNIQUE(user_id, organization_id));
    CREATE TABLE audit_logs (id uuid PRIMARY KEY, tenant_id integer, user_id integer, record_id text, table_name text,
      action text, new_values jsonb, occurred_at timestamptz DEFAULT now(), actor_id integer, target text, payload_hash text,
      sha256_chain text, hmac_seal text, old_values json, ip_address text, user_agent text, reason text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id integer, project_id integer);

    INSERT INTO organizations VALUES (1), (2), (3);
    INSERT INTO users VALUES (${MEMBER}, 'M. Member', 'm@sponsor', 'active'), (${OWNER}, 'P. Owner', 'p@sponsor', 'active'),
      (${OUTSIDER}, 'O. Outsider', 'o@elsewhere', 'active'), (${NO_CORPUS}, 'N. Newcomer', 'n@new', 'active');
    INSERT INTO organization_users VALUES (1, ${MEMBER}, 'member'), (1, ${OWNER}, 'member'), (2, ${OUTSIDER}, 'member'),
      (3, ${NO_CORPUS}, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio');
    INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
      ('${P_OPEN}', 1, 'Northwind diabetes programme', 'NW-1'), ('${P_PRIVATE}', 1, 'Northwind private programme', 'NW-PRIV');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'NW-1', 'Northwind diabetes programme', '${P_OPEN}', 100, ${OWNER}, ${OWNER}),
      (12, 1, 'NW-PRIV', 'Northwind private programme', '${P_PRIVATE}', 100, ${OWNER}, ${OWNER});
    INSERT INTO project_visibility_settings VALUES (1, 10, 'org_public'), (1, 12, 'private');
    INSERT INTO project_members VALUES (1, 12, ${OWNER}, 'owner', 'active');
  `);
  await holder.pg.exec(ddlOf(csrReports as PgTable));
  await holder.pg.exec(ddlOf(csrDetails as PgTable));
  // One report with a machine-readable primary effect for organisation 1, two for organisation 2.
  const reports: Array<[number, number, string, number]> = [[1, 1, OURS, 0.35], [2, 2, THEIRS, 0.9], [3, 2, THEIRS, 0.9]];
  for (const [id, org, endpoint, effect] of reports) {
    await holder.pg.query(
      `INSERT INTO csr_reports (id, organization_id, report_id, report_title, title, sponsor, indication, phase, content)
       VALUES ($1, $2, $3, $3, $3, 'Sponsor', $4, 'Phase 3', $5::json)`,
      [id, org, `CSR-${id}`, T2D, JSON.stringify({ primaryEffect: { value: effect, standardError: 0.08 } })],
    );
    await holder.pg.query('INSERT INTO csr_details (report_id, endpoints) VALUES ($1, $2::json)',
      [id, JSON.stringify({ primary: [endpoint], secondary: [] })]);
  }
  holder.db = drizzle(holder.pg);
});
afterAll(async () => { await holder.pg.close(); });
beforeEach(() => {
  hf.queryHuggingFace.mockReset();
  hf.queryHuggingFace.mockResolvedValue('[]');
  vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

type Ctx = { organizationId: number; userId: number; projectRef?: string | null; sqlClient?: RequestSqlClient };
const as = (organizationId: number, userId: number, projectRef?: string): Ctx => ({ organizationId, userId, projectRef, sqlClient: fixtureSql });
const INSIDE_PROJECT = as(1, MEMBER, P_OPEN);

/** The registered handler as the loop reaches it. A simulation answers in sentences; a refusal answers JSON. */
async function reach(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<string> {
  return asRequestOwner(ctx, async () => String(await getToolHandler(name)!(input, ctx as never)));
}
const DESIGN = {
  phase: '3', indication: T2D, primary_endpoint: OURS, primary_endpoint_type: 'continuous',
  planned_sample_size: 400, power: 0.9, alpha: 0.05, effect_size: 0.3,
};
const simulate = (ctx: Ctx) => reach('simulate_study_design', DESIGN, ctx);
const command = async (name: string, params: Record<string, unknown>, ctx: Ctx) =>
  JSON.parse(await reach('execute_platform_command', { command: name, params }, ctx));

describe('simulate_study_design, reached under launch scope', () => {
  it('a member of the project is answered from the engine and their organisation’s history', async () => {
    const out = await simulate(INSIDE_PROJECT);
    expect(out).toMatch(/Probability of success on the primary endpoint: \d+%/);
    expect(out).toContain('Effect prior grounded in 1 historical source(s).');
    expect(out).toContain(`Scanned 1 prior CSR(s) for "${T2D}"; 1 carried a machine-readable primary effect`);
    expect(out).toContain(STUDY_TWIN_DISCLAIMER);
    expect(out).not.toContain(HISTORY_UPLOAD_REQUEST);
  });

  it('RULE 2: no model is asked for anything, and the same design gives the same answer', async () => {
    const first = await simulate(INSIDE_PROJECT);
    expect(await simulate(INSIDE_PROJECT)).toBe(first);
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });

  it('a user of another organisation who opens this project is refused, and nothing is simulated', async () => {
    const out = JSON.parse(await simulate(as(2, OUTSIDER, P_OPEN)));
    expect(out.code).toBe('ANA_PROJECT_NOT_FOUND');
    expect(JSON.stringify(out)).not.toMatch(/Probability of success/);
  });

  it('a member who cannot open a private project is refused there', async () => {
    const out = JSON.parse(await simulate(as(1, MEMBER, P_PRIVATE)));
    expect(out.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    expect(await simulate(as(1, OWNER, P_PRIVATE))).toMatch(/Probability of success/);
  });

  it('each organisation’s prior rests on its own reports, never another’s', async () => {
    const theirs = await simulate(as(2, OUTSIDER));
    expect(theirs).toContain('Effect prior grounded in 2 historical source(s).');
    expect(theirs).toContain('Scanned 2 prior CSR(s)');
    // An organisation with no corpus is told its prior is an assumption and asked for history: nobody else's is used.
    const none = await simulate(as(3, NO_CORPUS));
    expect(none).not.toMatch(/grounded in \d+ historical/);
    expect(none).toContain(HISTORY_UPLOAD_REQUEST);
  });
});

describe('recommend_endpoints and evaluate_endpoint, reached under launch scope', () => {
  type Rec = { endpoint: string; occurrence_count: number; success_rate: number | null; evidence_basis: string; evidence_strength: number };
  const recsOf = (out: { result?: { data?: { recommendations?: Rec[] } } }) => out.result?.data?.recommendations ?? [];

  it('a member of the project is recommended the endpoints their organisation’s reports record', async () => {
    const out = await command('recommend_endpoints', { indication: T2D, phase: '3', count: 1 }, INSIDE_PROJECT);
    expect(out.status, JSON.stringify(out)).toBe('executed');
    expect(recsOf(out).map((r) => [r.endpoint, r.occurrence_count, r.evidence_basis])).toEqual([[OURS, 1, 'corpus_frequency']]);
    expect(JSON.stringify(out)).not.toContain(THEIRS);
    // The corpus supplied what was asked for, so no model was called.
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });

  it('RULE 2: an endpoint a model proposes carries no rate and no count, and is labelled as a model’s', async () => {
    hf.queryHuggingFace.mockResolvedValue('["Proportion reaching HbA1c below 7% at week 52, expected 62%"]');
    const out = await command('recommend_endpoints', { indication: T2D, phase: '3', count: 2 }, INSIDE_PROJECT);
    const proposed = recsOf(out).find((r) => r.endpoint.startsWith('Proportion reaching'));
    expect(proposed).toMatchObject({ occurrence_count: 0, success_rate: null, evidence_basis: 'ai_suggested', evidence_strength: 10 });
    expect(String(out.result.message)).toMatch(/1 proposed by a language model with no corpus evidence/);
  });

  it('RULE 2: an evaluation carries no score, even when the model’s commentary contains one', async () => {
    hf.queryHuggingFace.mockResolvedValue('I rate this endpoint 87 out of 100.');
    const out = await command('evaluate_endpoint', { endpoint: 'HbA1c change at week 26', indication: T2D }, INSIDE_PROJECT);
    expect(out.status, JSON.stringify(out)).toBe('executed');
    expect(out.result.data.evaluation.score).toBeNull();
    expect(out.result.data.evaluation.similarEndpoints).toEqual([OURS]);
    expect(String(out.result.message)).toMatch(/Not scored: no deterministic endpoint-quality rubric exists/);
    expect(String(out.result.message)).toMatch(/Language-model commentary: I rate this endpoint 87 out of 100\./);
  });

  it('a user of another organisation who opens this project is refused, and no command runs', async () => {
    for (const [name, params] of [['recommend_endpoints', { indication: T2D }], ['evaluate_endpoint', { endpoint: OURS, indication: T2D }]] as const) {
      const out = await command(name, params, as(2, OUTSIDER, P_OPEN));
      expect(out.code, `${name}: ${JSON.stringify(out)}`).toBe('ANA_PROJECT_NOT_FOUND');
      expect(out.result).toBeUndefined();
    }
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });

  it('a user of another organisation reads their own organisation’s corpus, never this one’s', async () => {
    const out = await command('recommend_endpoints', { indication: T2D, phase: '3', count: 1 }, as(2, OUTSIDER));
    expect(recsOf(out).map((r) => [r.endpoint, r.occurrence_count])).toEqual([[THEIRS, 2]]);
    const evaluated = await command('evaluate_endpoint', { endpoint: 'glycaemic endpoint at week 26', indication: T2D }, as(2, OUTSIDER));
    expect(evaluated.result.data.evaluation.similarEndpoints).toEqual([THEIRS]);
  });
});
