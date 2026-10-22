/**
 * Document store consolidation, step 6 (D2, 2026-10-17): submitting an
 * authoring document for review no longer projects it into
 * concept2cure_artifacts.
 *
 * Before this step, POST /api/authoring/docs/:id/submit committed the
 * assembled text through the AnA document spine (commitCanonicalRevision):
 * an artifact row set to 'review', an artifact version labelled as an AnA
 * Document Studio generation, a c2c_ana_actions/audit_logs pair and a
 * readiness recompute. Nothing ever moved that row again: an approval or a
 * rejection on the authoring chain left it in 'review' for good.
 *
 * The review state has one home. A draft's review is the authoring document's
 * own workflow (authoring_documents.status, authoring_workflow_steps), which
 * the Review board reads; a filed Vault version's lifecycle is
 * canonical_documents. This file pins that the submit writes the first and
 * calls nothing that writes an artifact.
 *
 * Fail-first: written while the projection was live, when the program-linked
 * submit below called commitCanonicalRevision once and returned a `canonical`
 * receipt, and retry_canonical re-ran it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { createJourneyDb, extractTableDdl, makeRequestDbClient, type JourneyDb } from '../../../tests/golden-journeys/harness';
import type { RequestDbClient } from '../../middleware/lazyRequestDbClient';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
import { runWithTenantScope } from '../../db/tenantStore';

const JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;

const AUTHOR = { id: '11', organizationId: 1, email: 'author@s6.example', name: 'Avery Author' };
const REVIEWER = { id: '21', organizationId: 1, email: 'reviewer@s6.example', name: 'Robin Reviewer' };
type U = typeof AUTHOR;
const PROGRAM = 'a0000000-0000-4000-8000-00000000006a';

const PREREQ = `
  ${AUDIT_LOGS_PGLITE_DDL}
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT, uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'active', payment_status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE organization_users (organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    role TEXT NOT NULL, PRIMARY KEY (organization_id,user_id));
  INSERT INTO organizations (id, name) VALUES (1, 's6-org');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}'), ('${REVIEWER.id}', '${REVIEWER.name}', '${REVIEWER.email}');
  INSERT INTO organization_users VALUES (1,${AUTHOR.id},'member'),(1,${REVIEWER.id},'member');
  CREATE TABLE regulatory_programs (
    id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT,
    program_type TEXT, primary_agency TEXT, product_type TEXT, deleted_at TIMESTAMPTZ
  );
  INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, primary_agency, product_type)
    VALUES ('${PROGRAM}', 1, 'IND 66666 — Step 6', 'S6', 'ind', 'FDA', 'drug');
  CREATE TABLE projects (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT,
    regulatory_program_id UUID, client_workspace_id INTEGER, status TEXT NOT NULL DEFAULT 'planning',
    owner_id INTEGER, created_by_id INTEGER, settings JSONB NOT NULL DEFAULT '{}');
  CREATE TABLE project_visibility_settings (project_id INTEGER, organization_id INTEGER, visibility TEXT);
  CREATE TABLE project_members (project_id INTEGER, organization_id INTEGER, user_id INTEGER, role TEXT, status TEXT);
  CREATE TABLE concept2cure_artifacts (id INTEGER PRIMARY KEY, organization_id INTEGER, project_id INTEGER);
  CREATE TABLE concept2cure_review_assignments (artifact_id INTEGER, organization_id INTEGER, reviewer_id INTEGER, status TEXT);
  -- The program's one legacy anchor: the relationship the projection resolved.
  INSERT INTO projects (id, organization_id, name, regulatory_program_id, owner_id, created_by_id)
    VALUES (61, 1, 'Step 6 anchor', '${PROGRAM}', ${AUTHOR.id}, ${AUTHOR.id});
  INSERT INTO project_visibility_settings VALUES (61, 1, 'org_public');
  ${extractTableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks', 'task_dependencies', 'cross_module_task_links'])}
`;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, commit: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
/* The spine's commit is what wrote the artifact. A spy stands in for it, so a
   call is visible here without the artifact schema it would write to. */
vi.mock('../../services/ana/document-spine.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../services/ana/document-spine.js')>();
  return { ...orig, commitCanonicalRevision: (...a: unknown[]) => (h.commit as (...x: unknown[]) => unknown)(...a) };
});
const commit = vi.fn(async () => ({
  artifactId: 'artifact_s6', artifactPk: 1, version: 1, created: true, contentHash: 'h', status: 'review',
  ctdSection: null, actionId: 'a', auditId: 'b', provenanceLinks: 0, readiness: null, steps: [],
}));
h.commit = commit;

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
const tokens = new Map<string, string>();
const as = (u: U) => (r: request.Test) => r.set('Authorization', `Bearer ${tokens.get(u.id)!}`);

async function mint(u: U) {
  return new SignJWT({ userId: u.id, email: u.email, name: u.name, role: 'member', roles: ['member'], organizationId: u.organizationId, tenant_id: u.organizationId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function context(req: Request, res: Response, next: NextFunction) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  jwtVerify(token, new TextEncoder().encode(JWT_SECRET))
    .then(({ payload }) => {
      const claims = payload as { userId?: string | number; email?: string; organizationId?: number };
      (req as Request & { user?: unknown }).user = {
        id: claims.userId, userId: claims.userId, email: claims.email, organizationId: claims.organizationId,
      };
      (req as Request & { dbClient?: unknown }).dbClient = makeRequestDbClient(jdb.pglite) as unknown as RequestDbClient;
      runWithTenantScope({ tenantId: String(claims.organizationId), role: 'member', source: 'request', caller: 'step6-fixture' }, next);
    })
    .catch(() => res.status(401).json({ success: false, error: 'unauthenticated' }));
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_reviews.sql',
      'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
      'db/migrations/20260807_task_graph_org_columns.sql',
      'db/migrations/20260807_unified_tasks_soft_delete.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  for (const u of [AUTHOR, REVIEWER]) tokens.set(u.id, await mint(u));
  const { default: authoringRouter } = await import('../authoring.router');
  const { default: createReviewBoardRoutes } = await import('../review-board-routes');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', context, authoringRouter);
  app.use('/api/review', context, createReviewBoardRoutes());
}, T);

afterAll(async () => { await jdb?.close(); });

async function programDocumentWithText(): Promise<string> {
  const doc = await as(AUTHOR)(request(app).post('/api/authoring/docs'))
    .send({ title: 'IND 66666 — Module 2.5 Clinical Overview', module: '2.5', client_program_id: PROGRAM });
  expect(doc.status).toBe(201);
  const id = doc.body.document.id as string;
  const sec = await as(AUTHOR)(request(app).post('/api/authoring/sections'))
    .send({ doc_id: id, code: '2.5.1', title: 'Rationale', content: '<p>The pivotal study met its endpoint.</p>', order_index: 1 });
  expect(sec.status).toBe(201);
  // Read access for the approver, as the review-board fixture grants it.
  await jdb.pool.query(`INSERT INTO doc_permissions (doc_id,tenant_id,principal_id,email,role,granted_by,grant_reason)
    VALUES ($1,1,$2,$3,'VIEWER',$4,'Step 6 fixture access')`, [id, REVIEWER.id, REVIEWER.email, AUTHOR.id]);
  return id;
}

const SUBMIT = { reason: 'Ready for QA review of the clinical overview.', workflow_steps: [{ role: 'QA', approver_email: REVIEWER.email }] };

describe('submit for review records the review in the authoring workflow only', () => {
  it('a program-linked submit with a stated reason writes no artifact and names where its review lives', async () => {
    commit.mockClear();
    const id = await programDocumentWithText();
    const r = await as(AUTHOR)(request(app).post(`/api/authoring/docs/${id}/submit`)).send(SUBMIT);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(commit, 'the submit still projects the document into concept2cure_artifacts').not.toHaveBeenCalled();
    expect(r.body.canonical).toBeUndefined();
    expect(r.body.reviewRecord).toEqual({
      store: 'authoring_workflow_steps', documentStatus: 'IN_REVIEW', workflowId: r.body.workflowId, steps: 1,
    });
    const doc = await jdb.pool.query(`SELECT status, current_workflow_id FROM authoring_documents WHERE id=$1`, [id]);
    expect(doc.rows[0]).toMatchObject({ status: 'IN_REVIEW', current_workflow_id: r.body.workflowId });
    // The Review board reads that record: the approver sees it at their sign-off.
    const board = await as(REVIEWER)(request(app).get('/api/review/board?scope=mine'));
    expect(board.status).toBe(200);
    const row = (board.body.data.queue as Array<Record<string, unknown>>).find((q) => q.id === id);
    expect(row, 'the submitted review is not on the approver’s board').toBeTruthy();
    expect(row!.atMySignOff).toBe(true);
  }, T);

  it('retry_canonical is refused by name: there is no projection left to retry', async () => {
    commit.mockClear();
    const id = await programDocumentWithText();
    expect((await as(AUTHOR)(request(app).post(`/api/authoring/docs/${id}/submit`)).send(SUBMIT)).status).toBe(200);
    const retry = await as(AUTHOR)(request(app).post(`/api/authoring/docs/${id}/submit`))
      .send({ retry_canonical: true, reason: 'Retry the projection.' });
    expect(retry.status).toBe(410);
    expect(retry.body.error?.code).toBe('CANONICAL_PROJECTION_RETIRED');
    expect(commit).not.toHaveBeenCalled();
    const steps = await jdb.pool.query(`SELECT id FROM authoring_workflow_steps WHERE doc_id=$1`, [id]);
    expect(steps.rows).toHaveLength(1);
  }, T);
});
