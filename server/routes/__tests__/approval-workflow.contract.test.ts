/**
 * Approval-workflow HTTP route contract — integration tests against the mounted
 * router (supertest), with `db` pointed at an in-process PGlite database and a
 * faked JWT verifier so auth state can be flipped per request. This is a
 * 21 CFR Part 11 governed-action path (start / approve / reject / delegate),
 * so the suite validates the HTTP layer itself: auth gating (401), input
 * validation (400), the happy-path start → approve → status flow, reject and
 * delegate behaviour, and tenant/org scoping on the templates + pending routes.
 *
 * The unified_workflow tables are not in the shared PGlite harness, so the
 * minimal DDL the routes + ApprovalOrchestrator touch is created locally below
 * (deliberately NOT broadening the shared harness).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

// ── Mocks ────────────────────────────────────────────────────────────────────
// `db` is hoisted so the same instance is shared with the route module and the
// ApprovalOrchestrator service (both import from `../../db`).
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));

// Faked JWT verifier — `verifyJwtWithRotation` is the only auth dependency of
// the router. A mutable identity lets each test set/clear the "current user".
const auth = vi.hoisted(() => ({
  current: null as null | { userId: string; organizationId?: string },
}));
vi.mock('../../utils/jwtVerify.js', () => ({
  verifyJwtWithRotation: vi.fn(() => {
    if (!auth.current) throw new Error('invalid token');
    return auth.current;
  }),
}));

import approvalWorkflowRouter from '../approval-workflow';

// ── In-process PGlite schema (mirrors shared/schema/unified_workflow.ts) ──────
const WORKFLOW_DDL = `
DO $$ BEGIN CREATE TYPE document_status AS ENUM ('draft','in_review','approved','published','archived','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE workflow_status AS ENUM ('active','completed','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE approval_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE approval_type AS ENUM ('user','role','group'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE module_type AS ENUM ('cmc','cer','study','ectd','510k','vault'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS users (
  id    SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unified_documents (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  document_type   TEXT NOT NULL,
  status          document_status NOT NULL DEFAULT 'draft',
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  organization_id INTEGER NOT NULL,
  latest_version  INTEGER NOT NULL DEFAULT 1,
  metadata        JSON DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  module_type       module_type NOT NULL,
  organization_id   INTEGER NOT NULL,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now(),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  document_types    TEXT[] NOT NULL DEFAULT '{}',
  default_for_types TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id               SERIAL PRIMARY KEY,
  template_id      INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  "order"          INTEGER NOT NULL,
  approver_type    approval_type NOT NULL,
  approver_ids     TEXT[] NOT NULL,
  required_actions TEXT[] NOT NULL DEFAULT '{review,comment}'
);

CREATE TABLE IF NOT EXISTS document_workflows (
  id              SERIAL PRIMARY KEY,
  document_id     INTEGER NOT NULL,
  template_id     INTEGER NOT NULL,
  status          workflow_status NOT NULL DEFAULT 'active',
  current_step    INTEGER NOT NULL DEFAULT 1,
  started_by      TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by    TEXT,
  completed_at    TIMESTAMPTZ,
  rejected_by     TEXT,
  rejected_at     TIMESTAMPTZ,
  organization_id INTEGER NOT NULL,
  metadata        JSON DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id               SERIAL PRIMARY KEY,
  workflow_id      INTEGER NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
  step_id          INTEGER NOT NULL,
  step_order       INTEGER NOT NULL,
  status           approval_status NOT NULL DEFAULT 'pending',
  assigned_to      TEXT[] NOT NULL,
  assignment_type  approval_type NOT NULL,
  required_actions TEXT[] NOT NULL DEFAULT '{review}',
  completed_by     TEXT,
  completed_at     TIMESTAMPTZ,
  comments         TEXT
);

CREATE TABLE IF NOT EXISTS workflow_history (
  id          SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  details     JSON DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS document_audit_logs (
  id           SERIAL PRIMARY KEY,
  document_id  INTEGER NOT NULL,
  action       TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details      JSON DEFAULT '{}'
);
`;

// Org 2 is the authenticated user's org (mirrors the token identity below).
const ORG = 2;
const USER = '1';

let pglite: PGlite;
let app: express.Express;

function makeApp() {
  const a = express();
  a.use(express.json({ limit: '5mb' }));
  a.use('/api/approval-workflows', approvalWorkflowRouter);
  return a;
}

/** Seed a document + an active workflow with two serial steps assigned to USER. */
async function seedTwoStepWorkflow(): Promise<{ workflowId: number; approvalIds: number[]; documentId: number }> {
  const doc = await pglite.query<{ id: number }>(
    `INSERT INTO unified_documents (title, document_type, created_by, organization_id) VALUES ('Protocol v1','protocol',$1,$2) RETURNING id`,
    [USER, ORG],
  );
  const documentId = doc.rows[0].id;

  const tpl = await pglite.query<{ id: number }>(
    `INSERT INTO workflow_templates (name, module_type, organization_id, created_by) VALUES ('Two-step review','study',$1,$2) RETURNING id`,
    [ORG, USER],
  );
  const templateId = tpl.rows[0].id;

  const step1 = await pglite.query<{ id: number; order: number }>(
    `INSERT INTO workflow_steps (template_id, name, "order", approver_type, approver_ids, required_actions) VALUES ($1,'Author review',1,'user',ARRAY[$2]::text[],ARRAY['review']::text[]) RETURNING id, "order"`,
    [templateId, USER],
  );
  const step2 = await pglite.query<{ id: number; order: number }>(
    `INSERT INTO workflow_steps (template_id, name, "order", approver_type, approver_ids, required_actions) VALUES ($1,'QA approval',2,'user',ARRAY[$2]::text[],ARRAY['review']::text[]) RETURNING id, "order"`,
    [templateId, USER],
  );

  const wf = await pglite.query<{ id: number }>(
    `INSERT INTO document_workflows (document_id, template_id, started_by, organization_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    [documentId, templateId, USER, ORG],
  );
  const workflowId = wf.rows[0].id;

  const approvalIds: number[] = [];
  for (const step of [step1.rows[0], step2.rows[0]]) {
    const ap = await pglite.query<{ id: number }>(
      `INSERT INTO workflow_approvals (workflow_id, step_id, step_order, assigned_to, assignment_type, required_actions) VALUES ($1,$2,$3,ARRAY[$4]::text[],'user',ARRAY['review']::text[]) RETURNING id`,
      [workflowId, step.id, step.order, USER],
    );
    approvalIds.push(ap.rows[0].id);
  }

  return { workflowId, approvalIds, documentId };
}

// Authenticated request helpers — attach a Bearer token so the router invokes
// the (mocked) JWT verifier. The verifier's return value is controlled per-test
// via `auth.current`.
const TOKEN = 'Bearer fake-token';
const authed = () => ({
  get: (url: string) => request(app).get(url).set('Authorization', TOKEN),
  post: (url: string) => request(app).post(url).set('Authorization', TOKEN),
});

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(WORKFLOW_DDL);
  await pglite.query(`INSERT INTO users (id, email, name) VALUES ($1,'u1@example.com','User One')`, [Number(USER)]);
  holder.db = drizzle(pglite);
  app = makeApp();
});

afterAll(async () => {
  await pglite.close();
});

beforeEach(() => {
  // Default: authenticated as USER in ORG. Individual tests override as needed.
  auth.current = { userId: USER, organizationId: String(ORG) };
});

// ─────────────────────────────────────────────────────────────────────────────
describe('auth gating', () => {
  it('401 when no Authorization header is present', async () => {
    const res = await request(app).get('/api/approval-workflows/pending');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('401 when the token fails verification', async () => {
    auth.current = null; // verifier throws
    const res = await authed().get('/api/approval-workflows/pending');
    expect(res.status).toBe(401);
  });

  it('401 when the token carries no organizationId', async () => {
    auth.current = { userId: USER }; // organizationId undefined → rejected
    const res = await authed().get('/api/approval-workflows/pending');
    expect(res.status).toBe(401);
  });

  it('start route is also auth-gated (401 unauthenticated)', async () => {
    const res = await request(app)
      .post('/api/approval-workflows/start')
      .send({ documentId: 1, templateId: 1 });
    expect(res.status).toBe(401);
  });
});

describe('input validation (400)', () => {
  it('POST /start → 400 without documentId/templateId', async () => {
    const res = await authed().post('/api/approval-workflows/start').send({ documentId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('POST /:id/reject → 400 without a rejection reason', async () => {
    const { approvalIds } = await seedTwoStepWorkflow();
    const res = await authed().post(`/api/approval-workflows/${approvalIds[0]}/reject`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason is required/i);
  });

  it('POST /:id/delegate → 400 without delegateTo', async () => {
    const { approvalIds } = await seedTwoStepWorkflow();
    const res = await authed().post(`/api/approval-workflows/${approvalIds[0]}/delegate`).send({ reason: 'OOO' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/delegateTo/i);
  });

  it('POST /templates → 400 without name/moduleType/steps', async () => {
    const res = await authed().post('/api/approval-workflows/templates').send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('POST /start → 400 (error surfaced) for a template with no steps', async () => {
    const tpl = await pglite.query<{ id: number }>(
      `INSERT INTO workflow_templates (name, module_type, organization_id, created_by) VALUES ('Empty','study',$1,$2) RETURNING id`,
      [ORG, USER],
    );
    const doc = await pglite.query<{ id: number }>(
      `INSERT INTO unified_documents (title, document_type, created_by, organization_id) VALUES ('D','protocol',$1,$2) RETURNING id`,
      [USER, ORG],
    );
    const res = await authed().post('/api/approval-workflows/start').send({
      documentId: doc.rows[0].id,
      templateId: tpl.rows[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no steps/i);
  });
});

describe('happy path: start → approve → status', () => {
  it('starts a workflow, advances on first approval, completes on the last, and reports status', async () => {
    // Build a template with two steps via the create-template route (real path).
    const create = await authed().post('/api/approval-workflows/templates').send({
      name: 'Release flow',
      moduleType: 'study',
      steps: [
        { name: 'Author review', approverType: 'user', approverIds: [USER] },
        { name: 'QA approval', approverType: 'user', approverIds: [USER] },
      ],
    });
    expect(create.status).toBe(201);
    const templateId = create.body.template.id;

    const doc = await pglite.query<{ id: number }>(
      `INSERT INTO unified_documents (title, document_type, created_by, organization_id) VALUES ('Release doc','protocol',$1,$2) RETURNING id`,
      [USER, ORG],
    );
    const documentId = doc.rows[0].id;

    // start
    const start = await authed().post('/api/approval-workflows/start').send({ documentId, templateId });
    expect(start.status).toBe(201);
    expect(start.body.success).toBe(true);
    expect(typeof start.body.workflowId).toBe('number');
    expect(start.body.approvalIds).toHaveLength(2);
    const { workflowId, approvalIds } = start.body;

    // document moved to in_review
    const afterStart = await pglite.query<{ status: string }>(
      `SELECT status FROM unified_documents WHERE id = $1`,
      [documentId],
    );
    expect(afterStart.rows[0].status).toBe('in_review');

    // approve step 1 → workflow advances
    const approve1 = await authed().post(`/api/approval-workflows/${approvalIds[0]}/approve`).send({ comments: 'looks good' });
    expect(approve1.status).toBe(200);
    expect(approve1.body.workflowAdvanced).toBe(true);
    expect(approve1.body.workflowCompleted).toBe(false);
    expect(approve1.body.nextStep).toBe(2);

    // approve step 2 → workflow completes
    const approve2 = await authed().post(`/api/approval-workflows/${approvalIds[1]}/approve`).send({});
    expect(approve2.status).toBe(200);
    expect(approve2.body.workflowCompleted).toBe(true);
    expect(approve2.body.message).toMatch(/completed/i);

    // document is now approved
    const afterDone = await pglite.query<{ status: string }>(
      `SELECT status FROM unified_documents WHERE id = $1`,
      [documentId],
    );
    expect(afterDone.rows[0].status).toBe('approved');

    // status route reflects the completed workflow + ordered approvals + history
    const status = await authed().get(`/api/approval-workflows/${workflowId}/status`);
    expect(status.status).toBe(200);
    expect(status.body.workflow.status).toBe('completed');
    expect(status.body.workflow.totalSteps).toBe(2);
    expect(status.body.workflow.approvals.every((a: any) => a.status === 'approved')).toBe(true);
    expect(status.body.workflow.history.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /:workflowId/status → 404 for an unknown workflow', async () => {
    const res = await authed().get('/api/approval-workflows/999999/status');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('POST /:id/approve → 400 when the performer is not an assigned approver', async () => {
    const { approvalIds } = await seedTwoStepWorkflow();
    auth.current = { userId: 'someone-else', organizationId: String(ORG) };
    const res = await authed().post(`/api/approval-workflows/${approvalIds[0]}/approve`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not assigned/i);
  });
});

describe('reject behaviour', () => {
  it('rejects the workflow at the current step and marks the document rejected', async () => {
    const { workflowId, approvalIds, documentId } = await seedTwoStepWorkflow();

    const res = await authed().post(`/api/approval-workflows/${approvalIds[0]}/reject`).send({ comments: 'Missing safety data' });
    expect(res.status).toBe(200);
    expect(res.body.workflowRejected).toBe(true);
    expect(res.body.message).toMatch(/rejected/i);

    const status = await authed().get(`/api/approval-workflows/${workflowId}/status`);
    expect(status.body.workflow.status).toBe('rejected');

    const docRow = await pglite.query<{ status: string }>(
      `SELECT status FROM unified_documents WHERE id = $1`,
      [documentId],
    );
    expect(docRow.rows[0].status).toBe('rejected');
  });
});

describe('delegate behaviour', () => {
  it('reassigns a pending approval to the delegate', async () => {
    const { approvalIds } = await seedTwoStepWorkflow();

    const res = await authed().post(`/api/approval-workflows/${approvalIds[0]}/delegate`).send({ delegateTo: 'user-77', reason: 'on leave' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/user-77/);

    const row = await pglite.query<{ assigned_to: string[] }>(
      `SELECT assigned_to FROM workflow_approvals WHERE id = $1`,
      [approvalIds[0]],
    );
    expect(row.rows[0].assigned_to).toContain('user-77');
    expect(row.rows[0].assigned_to).not.toContain(USER);
  });
});

describe('pending approvals', () => {
  it('GET /pending → 200 returns approvals assigned to the current user in their org', async () => {
    const { workflowId } = await seedTwoStepWorkflow();
    const res = await authed().get('/api/approval-workflows/pending');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.approvals)).toBe(true);
    expect(res.body.total).toBe(res.body.approvals.length);
    // The freshly-seeded workflow's first pending step should be listed.
    expect(res.body.approvals.some((a: any) => a.workflowId === workflowId)).toBe(true);
  });
});

describe('templates listing + org scoping', () => {
  it('GET /templates → 200 lists active templates for the org with step counts', async () => {
    // Seed a template owned by ORG with one step.
    const tpl = await pglite.query<{ id: number }>(
      `INSERT INTO workflow_templates (name, module_type, organization_id, created_by) VALUES ('Org-2 tpl','cer',$1,$2) RETURNING id`,
      [ORG, USER],
    );
    await pglite.query(
      `INSERT INTO workflow_steps (template_id, name, "order", approver_type, approver_ids) VALUES ($1,'Sign-off',1,'user',ARRAY[$2]::text[])`,
      [tpl.rows[0].id, USER],
    );

    const res = await authed().get('/api/approval-workflows/templates');
    expect(res.status).toBe(200);
    const found = res.body.templates.find((t: any) => t.id === tpl.rows[0].id);
    expect(found).toBeTruthy();
    expect(found.stepCount).toBe(1);
    expect(found.steps[0].name).toBe('Sign-off');
  });

  it('GET /templates does NOT leak another org\'s templates', async () => {
    // A template owned by a different org (99) must not appear for ORG's user.
    const other = await pglite.query<{ id: number }>(
      `INSERT INTO workflow_templates (name, module_type, organization_id, created_by) VALUES ('Other-org tpl','cmc',99,$1) RETURNING id`,
      [USER],
    );
    const res = await authed().get('/api/approval-workflows/templates');
    expect(res.status).toBe(200);
    expect(res.body.templates.map((t: any) => t.id)).not.toContain(other.rows[0].id);
  });

  it('GET /templates?moduleType=cer filters by module type', async () => {
    const res = await authed().get('/api/approval-workflows/templates?moduleType=cer');
    expect(res.status).toBe(200);
    expect(res.body.templates.every((t: any) => t.moduleType === 'cer')).toBe(true);
  });
});
