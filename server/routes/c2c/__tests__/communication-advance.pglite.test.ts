/**
 * Advancing an agency communication writes only columns its table has.
 *
 * PATCH /projects/:projectId/agency-communications/:eventId/advance set
 * `updated_at = NOW()` on concept2cure_agency_communications, and the deploy
 * path's table (db/migrations/20260331_communication_center_scaffold.sql) has
 * no updated_at column. Every triage and every close failed with a database
 * error. The mocked-pool suite (communication-center.test.ts) cannot see a
 * missing column, so this runs the real route on the real DDL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const h = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite,
  db:null as unknown as ReturnType<typeof import('drizzle-orm/pglite').drizzle>,
}));
vi.mock('../../../db', () => ({
  pool: { query: async (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]) },
  get db() { return h.db; },
}));
vi.mock('../../../services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: async () => null,
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireOrganizationContext: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../notifications', () => ({ createNotification: async () => undefined }));
vi.mock('../../../services/governed-ana-execution.js', () => ({
  buildCanonicalGovernedState: async () => ({ decision: 'allow' }),
}));

import router from '../communication-center';

const ROOT = path.resolve(__dirname, '../../../../');
const DEPLOY_DDL = [
  'db/migrations/20260331_communication_center_scaffold.sql',
  'db/migrations/20260401_submission_center_items.sql',
  // The letter's class, which the create writes and the response clock reads (P-39 step 3, S4).
  'migrations/20261029j_agency_letter_class.sql',
];

beforeAll(async () => {
  h.pg = new PGlite();
  h.db = drizzle(h.pg);
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer);
    CREATE TABLE projects (id integer PRIMARY KEY, client_workspace_id integer,
      name text, description text, metadata jsonb, status text DEFAULT 'active',
      created_by_id integer, owner_id integer, settings jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text,
      status text, invited_by_id integer, accepted_at timestamp);
    INSERT INTO organizations(id) VALUES (7);
    INSERT INTO users(id) VALUES (5);
    INSERT INTO organization_users VALUES (7,5,'admin');
    INSERT INTO client_workspaces VALUES (1,7);
    INSERT INTO projects(id,client_workspace_id,name,created_by_id,owner_id,settings) VALUES (42,1,'Agency inbox',5,5,'{}');
  `);
  for (const f of DEPLOY_DDL) await h.pg.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  /* The columns the linked-letter check reads (migrations
     20260814_projects_regulatory_program_anchor.sql, 20260726_cre_source_program_scope.sql). */
  await h.pg.exec(`
    ALTER TABLE projects ADD COLUMN organization_id integer, ADD COLUMN regulatory_program_id uuid;
    UPDATE projects SET organization_id = 7, regulatory_program_id = '11111111-1111-4111-8111-111111111111' WHERE id = 42;
    INSERT INTO organizations(id) VALUES (8);
    INSERT INTO projects(id,organization_id,regulatory_program_id) VALUES (43, 7, '33333333-3333-4333-8333-333333333333');
    CREATE TABLE cre_evidence_sources (
      id integer PRIMARY KEY, organization_id integer, client_program_id uuid, deleted_at timestamptz
    );
    INSERT INTO cre_evidence_sources VALUES
      (501, 7, '11111111-1111-4111-8111-111111111111', NULL),   -- this org, this project
      (502, 8, '11111111-1111-4111-8111-111111111111', NULL),   -- another tenant, same program id
      (503, 7, '33333333-3333-4333-8333-333333333333', NULL),   -- this org, another project
      (504, 7, '11111111-1111-4111-8111-111111111111', now());  -- this project, deleted
  `);
  // Preserve the real project policy and audit writer in this deployed-DDL
  // regression; a missing current actor must not be worked around by its fixture.
  const core = fs.readFileSync(path.join(ROOT, 'migrations/0000_sweet_joseph.sql'), 'utf8');
  const auditDdl = core.match(/CREATE TABLE "regulatory_audit_logs" \([\s\S]*?\n\);/)?.[0];
  if (!auditDdl) throw new Error('Actual regulatory audit DDL missing');
  await h.pg.exec(auditDdl);
  /* The questions on a letter (2026-10-18) on their own deploy DDL. Closing a
     letter reads them, the commitments recorded against them and the
     signatures that approve them. The commitments register runs on its own
     deploy DDL too; its one other parent and the signature store are stubbed
     with the columns they touch. */
  await h.pg.exec(`
    ALTER TABLE users ADD COLUMN name text;
    CREATE TABLE submissions (id serial PRIMARY KEY);
  `);
  await h.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260610_ha_interactions_commitments.sql'), 'utf8'));
  await h.pg.exec(`
    CREATE TABLE electronic_signatures (id serial PRIMARY KEY, organization_id integer, signed_target text,
      bound_payload_digest text, signer_id integer, signer_name text, signed_at timestamp, signature_meaning text,
      superseded_by integer, is_valid boolean DEFAULT true);
  `);
  await h.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20261018b_agency_response_questions.sql'), 'utf8'));
  await h.pg.exec(`
    INSERT INTO concept2cure_agency_communications
      (event_id, organization_id, project_id, source_type, communication_type, source_channel,
       urgency, human_review_status, closure_status, audit_metadata)
    VALUES ('evt-1', 7, 42, 'agency', 'information_request', 'esg', 'high',
            'pending_review', 'open', '{"visibilityTier":"shared_client_c2c"}'::jsonb),
           ('evt-2', 7, 42, 'agency', 'information_request', 'esg', 'high',
            'pending_review', 'open', '{"visibilityTier":"shared_client_c2c"}'::jsonb);
    INSERT INTO agency_communication_questions
      (organization_id, project_id, communication_event_id, question_ref, question_text, response_text,
       response_revision, response_updated_by, created_by)
    VALUES (7, 42, 'evt-2', 'Q1', 'Provide the batch analyses.', 'Provided in 3.2.P.5.4.', 1, 5, 5);
  `);
});
afterAll(async () => {
  await h.pg.close();
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    req.userId = 5;
    req.userEmail = 'a@b.c';
    req.tenantContext = { organizationId:7 };
    // The tenant-pinned request client, as tenantContextMiddleware attaches it:
    // closing a letter checks its questions and closes it in one transaction on it.
    (req as unknown as { dbClient: unknown }).dbClient = { query: (sql: string, params?: unknown[]) => h.pg.query(sql, params) };
    next();
  });
  a.use('/api/concept2cure', router);
  return a;
}

describe('PATCH agency-communications/:eventId/advance on the deploy path’s table', () => {
  it('triages a pending communication, then closes it', async () => {
    const url = '/api/concept2cure/projects/42/agency-communications/evt-1/advance';
    const first = await request(app()).patch(url).send({});
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toMatchObject({ humanReviewStatus: 'triaged', closureStatus: 'in_progress' });

    const second = await request(app()).patch(url).send({});
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.data).toMatchObject({ humanReviewStatus: 'actioned', closureStatus: 'closed' });

    const stored = await h.pg.query<{ human_review_status: string; closure_status: string }>(
      `SELECT human_review_status, closure_status FROM concept2cure_agency_communications WHERE event_id = 'evt-1'`,
    );
    expect(stored.rows[0]).toEqual({ human_review_status: 'actioned', closure_status: 'closed' });
  });
});

describe('closing a letter with a recorded question (2026-10-18)', () => {
  it('is refused while the response is not approved by signature, and the letter stays open', async () => {
    const url = '/api/concept2cure/projects/42/agency-communications/evt-2/advance';
    expect((await request(app()).patch(url).send({})).status).toBe(200); // triage
    const close = await request(app()).patch(url).send({});
    expect(close.status, JSON.stringify(close.body)).toBe(409);
    expect(close.body.error).toMatchObject({ code: 'RESPONSES_NOT_APPROVED' });
    expect(close.body.error.message).toContain('Q1 (not approved)');
    const stored = await h.pg.query<{ closure_status: string }>(
      `SELECT closure_status FROM concept2cure_agency_communications WHERE event_id = 'evt-2'`,
    );
    expect(stored.rows[0].closure_status).toBe('in_progress');
  });
});

describe('POST agency-communications links only a data-room source of this tenant and project', () => {
  const url = '/api/concept2cure/projects/42/agency-communications';
  const body = (ref: string) => ({
    sourceType: 'uploaded_official_correspondence', communicationType: 'Advice letter', sourceChannel: 'Manually logged',
    linkedArtifactIds: [ref], urgency: 'medium', visibilityTier: 'shared_client_c2c',
  });
  const stored = async (ref: string) =>
    (await h.pg.query(`SELECT 1 FROM concept2cure_agency_communications WHERE linked_artifact_ids @> $1::jsonb`, [JSON.stringify([ref])])).rows.length;

  it.each([
    ['cre_source:502', 'another tenant'],
    ['cre_source:503', 'another project'],
    ['cre_source:504', 'deleted'],
    ['cre_source:999', 'missing'],
  ])('refuses %s (%s) and stores nothing', async (ref) => {
    const res = await request(app()).post(url).send(body(ref));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(await stored(ref)).toBe(0);
  });

  it('links this project\'s source', async () => {
    const res = await request(app()).post(url).send(body('cre_source:501'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await stored('cre_source:501')).toBe(1);
  });
});

/* P-39 step 3, S4 (2026-10-29): a letter records its class, and the inbox reads
   its response clock from it: the agency's date wins, then the class's codified
   window from receipt; a letter with no class is on no clock. */
describe('the response clock on an inbox letter', () => {
  beforeAll(async () => {
    await h.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20261029j_agency_letter_class.sql'), 'utf8')); // replayed (RULE 1)
    // The columns the list's linked-submission join reads.
    await h.pg.exec(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS organization_id integer, ADD COLUMN IF NOT EXISTS program_id uuid,
      ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS application_type text, ADD COLUMN IF NOT EXISTS primary_region text,
      ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
    const received = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await h.pg.query(`
      INSERT INTO concept2cure_agency_communications
        (event_id, organization_id, project_id, source_type, communication_type, source_channel, urgency,
         response_required, human_review_status, closure_status, audit_metadata, received_date, due_date, letter_class)
      VALUES ('rtf-1', 7, 42, 'uploaded_official_correspondence', 'Refuse to file', 'esg', 'critical', true,
              'pending_review', 'open', '{"visibilityTier":"shared_client_c2c"}'::jsonb, $1, NULL, 'refuse_to_file_letter'),
             ('ir-1', 7, 42, 'uploaded_official_correspondence', 'IR', 'esg', 'high', true,
              'pending_review', 'open', '{"visibilityTier":"shared_client_c2c"}'::jsonb, $1, '2099-01-15', 'information_request'),
             ('nocls-1', 7, 42, 'uploaded_official_correspondence', 'Letter', 'esg', 'medium', true,
              'pending_review', 'open', '{"visibilityTier":"shared_client_c2c"}'::jsonb, $1, NULL, NULL)`, [received]);
  });

  it("derives a refuse-to-file letter's due date from its codified window, and keeps the agency's stated date", async () => {
    const res = await request(app()).get('/api/concept2cure/projects/42/agency-communications');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const byId = new Map((res.body.data as Array<{ id: string; responseClock: Record<string, unknown> }>).map((r) => [r.id, r]));
    expect(byId.get('rtf-1')!.responseClock).toMatchObject({
      // Received ten days (and some milliseconds) ago: 19 whole days remain, by the clock's floor rule.
      state: 'dated', dueDateSource: 'derived_from_window', windowDays: 30, citation: '21 CFR 314.101(a)(3)', daysUntilDue: 19,
    });
    expect(byId.get('ir-1')!.responseClock).toMatchObject({ state: 'dated', dueDateSource: 'agency_stated' });
    expect(String(byId.get('ir-1')!.responseClock.dueDate)).toMatch(/^2099-01-15/);
    expect(byId.get('nocls-1')!.responseClock).toEqual({ state: 'untracked', reason: 'class_asks_nothing' });
  });

  it('refuses a letter class outside the vocabulary', async () => {
    const res = await request(app()).post('/api/concept2cure/projects/42/agency-communications').send({
      sourceType: 'manual_logged_event', communicationType: 'IR', sourceChannel: 'esg', urgency: 'high',
      responseRequired: true, visibilityTier: 'shared_client_c2c', letterClass: 'informal_chat',
    });
    expect(res.status).toBe(400);
  });
});
