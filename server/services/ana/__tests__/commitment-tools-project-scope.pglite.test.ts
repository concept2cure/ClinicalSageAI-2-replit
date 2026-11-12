/**
 * AnA's commitment tools, reached under launch scope (P-122, 2026-11-12), answer only for what the person may open
 * or change.
 *
 * `create_regulatory_commitment` and `review_commitment_portfolio` work the organisation's door onto the one
 * commitments register (regulatory_commitments, project_id IS NULL: ha-service.ts ORG_LEVEL), the door Communication's
 * "Meetings & commitments" reads. Until this change production withheld both, and nothing had asked whose project a
 * named submission belongs to:
 *   - the create took `submission_id` as the model gave it. The foreign key admits any submission, another
 *     organisation's included (referential checks run past row-level security), and any editor could record a
 *     commitment against a submission of a project they cannot open;
 *   - the review counted every commitment of the organisation, those on a private project's submission included, and
 *     answered a submission that is not the organisation's with "No overdue commitments".
 *
 * Real PostgreSQL (PGlite) with the register as its migration creates it, the real sharing policy
 * (canAccessReportProject, getCurrentAccessibleProgramScope) and the real registry wrapper with launch scope ON, so
 * each case is also "offered and run under launch scope". The governed-action ledger is a recorded call (its own
 * suites test it), and public.actor_name is a plain read of users.
 *
 * Evidence: docs/evidence/DESIGN/P-122/ana-reach/.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { RequestSqlClient } from '../../../db/requestDb';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
  recordGovernedAction: vi.fn(async () => ({ actionId: 'a', auditId: 'b', sha256Chain: 'c' })),
}));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, params?: unknown[]) => {
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  // The create writes in a transaction on a lent connection: the same single database.
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({
  query: (sql: string, params?: unknown[]) => h.pg.query<Record<string, unknown>>(sql, params),
}) }));
vi.mock('../../../routes/c2c/actions.js', () => ({ recordGovernedAction: h.recordGovernedAction }));
// The wrapper's write-role gate reads the role over drizzle, which this harness does not carry: the fixture's own row.
vi.mock('../../part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: vi.fn(async (userId: number, organizationId: number) => (await h.pg.query<{ role: string }>(
    'SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2', [userId, organizationId])).rows[0]?.role ?? null),
}));

import { getToolHandler } from '../AnaToolExecutor';
import { asRequestOwner, ownerScopedClient } from './support/request-owner';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const P_OPEN = '11111111-1111-4111-8111-111111111111';
const P_PRIVATE = '44444444-4444-4444-8444-444444444444';
const P_THEIRS = '55555555-5555-4555-8555-555555555555';
/** Organisation 1: 7 edits project 10; 8 can open it and not change it; 9 owns both projects; 6 is a viewer. */
const EDITOR = 7, READER = 8, OWNER = 9, VIEWER = 6;
/** Organisation 2. */
const OUTSIDER = 21;
/** Submissions: 100 on the open project, 120 on the private one, 130 in no program, 200 another organisation's. */
const SUB_OPEN = 100, SUB_PRIVATE = 120, SUB_UNFILED = 130, SUB_THEIRS = 200;
/** Meetings: 1 on the open project's submission, 2 on the private one's, 3 naming no submission, 4 organisation 2's. */
const MEETING_OPEN = 1, MEETING_PRIVATE = 2, MEETING_ORG = 3, MEETING_THEIRS = 4;

const fixtureSql: RequestSqlClient = ownerScopedClient((sql, params) => h.pg.query<Record<string, unknown>>(sql, params));

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
    CREATE TABLE user_intelligence_profiles (id serial PRIMARY KEY, user_id integer, organization_id integer,
      workflow_preferences jsonb DEFAULT '{}', UNIQUE(user_id, organization_id));
    CREATE TABLE audit_logs (id uuid PRIMARY KEY, tenant_id integer, user_id integer, record_id text, table_name text,
      action text, new_values jsonb, occurred_at timestamptz DEFAULT now(), actor_id integer, target text, payload_hash text,
      sha256_chain text, hmac_seal text, old_values json, ip_address text, user_agent text, reason text);
    CREATE TABLE concept2cure_review_assignments (organization_id integer, artifact_id integer, reviewer_id integer, status text);
    CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, artifact_id text, organization_id integer, project_id integer);
    CREATE TABLE submissions (id integer PRIMARY KEY, organization_id integer NOT NULL, program_id uuid, title text,
      deleted_at timestamptz);
    CREATE TABLE concept2cure_agency_communications (event_id text PRIMARY KEY, organization_id integer,
      project_id integer, communication_type text, audit_metadata jsonb);
    CREATE TABLE agency_communication_questions (id serial PRIMARY KEY, organization_id integer, question_ref text);
    CREATE TABLE provenance_links (id serial PRIMARY KEY, organization_id integer, source_type text, source_id integer,
      target_type text, target_id integer, link_role text, created_by integer, deleted_at timestamptz);
    CREATE FUNCTION public.actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
      LANGUAGE sql STABLE AS $fn$ SELECT u.name, u.email FROM users u WHERE u.id = p_user_id $fn$;
  `);
  // The register and the meetings as their migration creates them: the plain foreign key to submissions included.
  await h.pg.exec(extractTableDdl('migrations/20260610_ha_interactions_commitments.sql', ['ha_interactions', 'regulatory_commitments']));
  await h.pg.exec(`
    ALTER TABLE regulatory_commitments
      ADD COLUMN project_id integer, ADD COLUMN source_communication_event_id text, ADD COLUMN source_question_id integer,
      ADD COLUMN fulfilment_sequence_id integer, ADD COLUMN fulfilment_vault_document_id uuid,
      ADD COLUMN fulfilment_vault_sha256 text, ADD COLUMN fulfilment_recorded_by integer,
      ADD COLUMN fulfilment_recorded_at timestamptz;

    INSERT INTO organizations VALUES (1), (2);
    INSERT INTO users VALUES (${VIEWER}, 'V. Viewer', 'v@sponsor', 'active'), (${EDITOR}, 'E. Editor', 'e@sponsor', 'active'),
      (${READER}, 'R. Reader', 'r@sponsor', 'active'), (${OWNER}, 'P. Owner', 'p@sponsor', 'active'),
      (${OUTSIDER}, 'O. Outsider', 'o@elsewhere', 'active');
    INSERT INTO organization_users VALUES (1, ${VIEWER}, 'viewer'), (1, ${EDITOR}, 'member'), (1, ${READER}, 'member'),
      (1, ${OWNER}, 'member'), (2, ${OUTSIDER}, 'member');
    INSERT INTO client_workspaces VALUES (100, 1, 'Northwind Bio'), (200, 2, 'Their client');
    INSERT INTO regulatory_programs (id, organization_id, name, code) VALUES
      ('${P_OPEN}', 1, 'Northwind oncology IND', 'NW-1'),
      ('${P_PRIVATE}', 1, 'Northwind private program', 'NW-PRIV'),
      ('${P_THEIRS}', 2, 'Their program', 'THEIRS-1');
    INSERT INTO projects (id, organization_id, code, name, regulatory_program_id, client_workspace_id, owner_id, created_by_id) VALUES
      (10, 1, 'NW-1', 'Northwind oncology IND', '${P_OPEN}', 100, ${OWNER}, ${OWNER}),
      (12, 1, 'NW-PRIV', 'Northwind private program', '${P_PRIVATE}', 100, ${OWNER}, ${OWNER}),
      (20, 2, 'THEIRS-1', 'Their program', '${P_THEIRS}', 200, ${OUTSIDER}, ${OUTSIDER});
    INSERT INTO project_visibility_settings VALUES (1, 10, 'org_public'), (1, 12, 'private'), (2, 20, 'org_public');
    INSERT INTO project_members VALUES (1, 10, ${EDITOR}, 'edit', 'active'), (1, 12, ${OWNER}, 'owner', 'active');

    INSERT INTO submissions (id, organization_id, program_id, title) VALUES
      (${SUB_OPEN}, 1, '${P_OPEN}', 'Northwind IND'), (${SUB_PRIVATE}, 1, '${P_PRIVATE}', 'Northwind private IND'),
      (${SUB_UNFILED}, 1, NULL, 'A submission in no program'), (${SUB_THEIRS}, 2, '${P_THEIRS}', 'Their IND');
    INSERT INTO ha_interactions (id, organization_id, submission_id, interaction_type, agency, title, created_by) VALUES
      (${MEETING_OPEN}, 1, ${SUB_OPEN}, 'pre_ind', 'fda', 'Pre-IND meeting', ${OWNER}),
      (${MEETING_PRIVATE}, 1, ${SUB_PRIVATE}, 'type_c', 'fda', 'Private Type C', ${OWNER}),
      (${MEETING_ORG}, 1, NULL, 'other', 'fda', 'A meeting naming no submission', ${OWNER}),
      (${MEETING_THEIRS}, 2, ${SUB_THEIRS}, 'pre_ind', 'fda', 'Their meeting', ${OUTSIDER});
  `);
});
afterAll(async () => { await h.pg.close(); });

/** The register as each case starts: five commitments, one of them a project's own (the project door's, never AnA's). */
beforeEach(async () => {
  h.failWhen = null;
  h.recordGovernedAction.mockClear();
  vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'on');
  await h.pg.exec(`
    TRUNCATE regulatory_commitments RESTART IDENTITY; TRUNCATE provenance_links RESTART IDENTITY;
    INSERT INTO regulatory_commitments (organization_id, submission_id, commitment_type, description, due_date, created_by, project_id) VALUES
      (1, NULL,           'meeting_commitment', 'Send the meeting minutes',          CURRENT_DATE - 10, ${OWNER}, NULL),
      (1, ${SUB_OPEN},    'pmr',                'Hepatic safety study',              CURRENT_DATE + 20, ${OWNER}, NULL),
      (1, ${SUB_PRIVATE}, 'pmc',                'Private dissolution commitment',    CURRENT_DATE - 30, ${OWNER}, NULL),
      (2, ${SUB_THEIRS},  'pmr',                'Their overdue requirement',         CURRENT_DATE - 30, ${OUTSIDER}, NULL),
      (1, ${SUB_OPEN},    'other',              'Made in an answer to a letter',     CURRENT_DATE - 5,  ${OWNER}, 10);
  `);
});
afterEach(() => vi.unstubAllEnvs());

type Ctx = { organizationId: number; userId?: number; projectRef?: string | null; sqlClient?: RequestSqlClient };
const as = (organizationId: number, userId?: number, projectRef?: string): Ctx => ({ organizationId, userId, projectRef, sqlClient: fixtureSql });

async function run(name: string, input: Record<string, unknown>, ctx: Ctx, confirmed = false) {
  return asRequestOwner(ctx, async () => JSON.parse(String(
    await getToolHandler(name)!(input, { ...ctx, ...(confirmed ? { humanConfirmed: true } : {}) } as never))));
}
const review = (ctx: Ctx, input: Record<string, unknown> = {}) => run('review_commitment_portfolio', input, ctx);
const record = (ctx: Ctx, input: Record<string, unknown>) => run('create_regulatory_commitment',
  { commitment_type: 'meeting_commitment', description: 'Provide the stability update', reason: 'Agreed at the meeting.', ...input }, ctx, true);
const commitments = async () => (await h.pg.query<{ organization_id: number; submission_id: number | null; project_id: number | null; description: string }>(
  'SELECT organization_id, submission_id, project_id, description FROM regulatory_commitments ORDER BY id')).rows;
const count = async () => (await commitments()).length;

describe('review_commitment_portfolio, reached under launch scope', () => {
  it('a member of the project is answered: the organisation’s own commitments they may open, counted by urgency', async () => {
    const out = await review(as(1, EDITOR));
    expect(out.ok, JSON.stringify(out)).toBe(true);
    // The minutes commitment (overdue) and the open project's PMR (due in 20 days). Not the private project's, not
    // organisation 2's, and not the one made in a letter's answer, which is the project door's.
    expect(out.summary).toMatchObject({ total: 2, overdue: 1, due_30: 1, closed: 0 });
    expect(String(out.message)).toMatch(/1 commitment\(s\) overdue; 1 due within 30 days/);
  });

  it('with the project open in the conversation, the same member is answered for that project’s sponsor', async () => {
    const out = await review(as(1, EDITOR, P_OPEN), { submission_id: SUB_OPEN });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(out.summary).toMatchObject({ total: 1, overdue: 0, due_30: 1 });
  });

  it('a private project’s commitment is counted only for someone who can open that project', async () => {
    expect((await review(as(1, READER))).summary).toMatchObject({ total: 2, overdue: 1 });
    expect((await review(as(1, OWNER))).summary).toMatchObject({ total: 3, overdue: 2 });
  });

  it('a submission of a project the person cannot open is refused, in the words a missing one is', async () => {
    const hidden = await review(as(1, EDITOR), { submission_id: SUB_PRIVATE });
    const missing = await review(as(1, EDITOR), { submission_id: 999_999 });
    expect(hidden.ok).toBeUndefined();
    expect(hidden.summary).toBeUndefined();
    expect(String(hidden.error)).toMatch(/Nothing was read/);
    expect(hidden).toEqual(missing);
  });

  it('a user of another organisation is refused that submission, and never counts this organisation’s commitments', async () => {
    const named = await review(as(2, OUTSIDER), { submission_id: SUB_OPEN });
    expect(named.ok).toBeUndefined();
    expect(named.summary).toBeUndefined();
    expect(String(named.error)).toMatch(/Nothing was read/);
    // Asked with no submission, they are answered for their own organisation: its one commitment.
    expect((await review(as(2, OUTSIDER))).summary).toMatchObject({ total: 1, overdue: 1 });
  });

  it('a user of another organisation who opens this organisation’s project is refused before anything is read', async () => {
    const out = await review(as(2, OUTSIDER, P_OPEN));
    expect(out.ok).toBeUndefined();
    expect(out.summary).toBeUndefined();
    expect(out.code).toBe('ANA_PROJECT_NOT_FOUND');
  });

  it('nobody identified, or someone who is not a current member, is refused', async () => {
    for (const ctx of [as(1), as(1, 55)]) {
      const out = await review(ctx);
      expect(out.error, JSON.stringify(out)).toBeTruthy();
      expect(out.summary).toBeUndefined();
    }
  });

  it('a sharing policy that cannot be read is an error, never an empty portfolio', async () => {
    h.failWhen = /project_members/;
    const out = await review(as(1, EDITOR));
    expect(out.error, JSON.stringify(out)).toBeTruthy();
    expect(out.summary).toBeUndefined();
  });
});

describe('create_regulatory_commitment, reached under launch scope', () => {
  it('a member who may change the project records a commitment on its submission, in the organisation’s register', async () => {
    const before = await count();
    const out = await record(as(1, EDITOR), { submission_id: SUB_OPEN, source_interaction_id: MEETING_OPEN, due_date: '2027-01-15' });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const rows = await commitments();
    expect(rows).toHaveLength(before + 1);
    // Organisation 1's, on the named submission, and the organisation's own: the door Communication reads.
    expect(rows.at(-1)).toMatchObject({ organization_id: 1, submission_id: SUB_OPEN, project_id: null, description: 'Provide the stability update' });
    expect(h.recordGovernedAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orgId: 1, userId: EDITOR, command: 'create', target: `regulatory-commitment:${out.id}`, reason: 'Agreed at the meeting.',
    }));
    // And it is counted for them straight away.
    expect((await review(as(1, EDITOR))).summary.total).toBe(3);
  });

  it('a commitment that names no submission and no meeting is the organisation’s own: an editor records it', async () => {
    const out = await record(as(1, READER), {});
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect((await commitments()).at(-1)).toMatchObject({ organization_id: 1, submission_id: null, project_id: null });
    // So is one from a meeting that names no submission.
    expect((await record(as(1, READER), { source_interaction_id: MEETING_ORG })).ok).toBe(true);
  });

  it('a user of another organisation cannot record a commitment against this organisation’s submission', async () => {
    const before = await count();
    const out = await record(as(2, OUTSIDER), { submission_id: SUB_OPEN });
    expect(out.ok).toBeUndefined();
    expect(String(out.error)).toMatch(/Nothing was recorded/);
    expect(await count()).toBe(before);
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
    // Answered exactly as a submission that does not exist.
    expect(out).toEqual(await record(as(2, OUTSIDER), { submission_id: 999_999 }));
  });

  it('nor from this organisation’s meeting', async () => {
    const before = await count();
    const out = await record(as(2, OUTSIDER), { source_interaction_id: MEETING_OPEN });
    expect(out.ok).toBeUndefined();
    expect(String(out.error)).toMatch(/Nothing was recorded/);
    expect(await count()).toBe(before);
    expect(out).toEqual(await record(as(2, OUTSIDER), { source_interaction_id: 999_999 }));
  });

  it('a member who can open the project but not change it is refused, and nothing is recorded', async () => {
    const before = await count();
    const out = await record(as(1, READER), { submission_id: SUB_OPEN });
    expect(out.ok).toBeUndefined();
    expect(String(out.error)).toMatch(/Nothing was recorded/);
    expect(await count()).toBe(before);
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
  });

  it('a private project’s submission, or its meeting, is refused in the words a missing one is', async () => {
    const before = await count();
    expect(await record(as(1, EDITOR), { submission_id: SUB_PRIVATE })).toEqual(await record(as(1, EDITOR), { submission_id: 999_999 }));
    expect(await record(as(1, EDITOR), { source_interaction_id: MEETING_PRIVATE }))
      .toEqual(await record(as(1, EDITOR), { source_interaction_id: 999_999 }));
    expect(await count()).toBe(before);
  });

  it('a submission in no project is refused: there is no project whose edit right could admit it', async () => {
    const before = await count();
    const out = await record(as(1, OWNER), { submission_id: SUB_UNFILED });
    expect(out.ok).toBeUndefined();
    expect(await count()).toBe(before);
  });

  it('the project’s owner records a commitment on the private project’s submission', async () => {
    const out = await record(as(1, OWNER), { submission_id: SUB_PRIVATE, source_interaction_id: MEETING_PRIVATE });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect((await commitments()).at(-1)).toMatchObject({ organization_id: 1, submission_id: SUB_PRIVATE });
  });

  it('a viewer is refused before any of it: the write needs an editor role', async () => {
    const before = await count();
    const out = await record(as(1, VIEWER), {});
    expect(String(out.error)).toMatch(/needs an editor role/);
    expect(await count()).toBe(before);
  });

  it('a sharing policy that cannot be read records nothing, and says so', async () => {
    const before = await count();
    h.failWhen = /FROM project_members/;
    const out = await record(as(1, EDITOR), { submission_id: SUB_OPEN });
    h.failWhen = null;
    expect(out.ok).toBeUndefined();
    expect(out.error, JSON.stringify(out)).toBeTruthy();
    expect(await count()).toBe(before);
  });
});
