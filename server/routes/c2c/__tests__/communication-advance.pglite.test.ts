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

const h = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));
vi.mock('../../../db', () => ({
  pool: { query: async (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]) },
  // logAuditEntry awaits db.insert(...).values(...).
  db: { insert: () => ({ values: async () => undefined }) },
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
];

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE projects (id integer PRIMARY KEY);
    INSERT INTO organizations VALUES (7);
    INSERT INTO projects VALUES (42);
  `);
  for (const f of DEPLOY_DDL) await h.pg.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  /* The columns the linked-letter check reads (migrations
     20260814_projects_regulatory_program_anchor.sql, 20260726_cre_source_program_scope.sql). */
  await h.pg.exec(`
    ALTER TABLE projects ADD COLUMN organization_id integer, ADD COLUMN regulatory_program_id uuid;
    UPDATE projects SET organization_id = 7, regulatory_program_id = '11111111-1111-4111-8111-111111111111' WHERE id = 42;
    INSERT INTO organizations VALUES (8);
    INSERT INTO projects VALUES (43, 7, '33333333-3333-4333-8333-333333333333');
    CREATE TABLE cre_evidence_sources (
      id integer PRIMARY KEY, organization_id integer, client_program_id uuid, deleted_at timestamptz
    );
    INSERT INTO cre_evidence_sources VALUES
      (501, 7, '11111111-1111-4111-8111-111111111111', NULL),   -- this org, this project
      (502, 8, '11111111-1111-4111-8111-111111111111', NULL),   -- another tenant, same program id
      (503, 7, '33333333-3333-4333-8333-333333333333', NULL),   -- this org, another project
      (504, 7, '11111111-1111-4111-8111-111111111111', now());  -- this project, deleted
  `);
  await h.pg.exec(`
    INSERT INTO concept2cure_agency_communications
      (event_id, organization_id, project_id, source_type, communication_type, source_channel,
       urgency, human_review_status, closure_status, audit_metadata)
    VALUES ('evt-1', 7, 42, 'agency', 'information_request', 'esg', 'high',
            'pending_review', 'open', '{}'::jsonb);
  `);
});
afterAll(async () => {
  await h.pg.close();
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { userId: 5, userEmail: 'a@b.c', tenantContext: { organizationId: 7 } });
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
