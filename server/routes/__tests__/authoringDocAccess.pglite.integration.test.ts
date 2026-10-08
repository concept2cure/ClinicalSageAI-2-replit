/**
 * GET /api/authoring/docs/:docId reports what the caller may do to the
 * document — Freeze, E-sign, File to vault, Assign review — as the write
 * routes will decide it (2026-09-28, coverage-gap sweep GE-P-3).
 *
 * Before this, the read returned no permission at all, so the client offered
 * every governed act to every member who could open the document; a member
 * with only a Reviewer grant filled in the freeze reason or the signing
 * password and then met AUTHORING_OBJECT_FORBIDDEN.
 *
 * The REAL router over HTTP with REAL signed JWTs, against the canonical
 * authoring DDL on PGlite: the creator's OWNER + AUTHOR grants come from the
 * live `authoring_document_seed_permissions` trigger, the org roles from
 * `organization_users`, and the checks are the ones the write routes run
 * (decideAuthoringPermission, the §11.10(g) signing authority, the vault's
 * write role, requireEditorAccess). A lookup that fails is reported as
 * unknown (null), never as a denial or an allowance.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import express from 'express';
import { PREREQ, AUTHOR, PROGRAM, ORG, mint, asToken, M25_SECTIONS } from './_authoring-canvas-fixture';
import { runWithTenantScope } from '../../db/tenantStore';
import { verifyJwtWithRotation } from '../../utils/jwtVerify';
import { authoringObjectAuthorization } from '../../middleware/authoringObjectAuthorization';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;

/**
 * The fixture's makeApp models the global /api gate's tenant scope but not the
 * `req.userRole` the same gate attaches (server/auth.ts, from
 * organization_users). Assign review's check — requireEditorAccess on
 * POST /api/tasks/tasks — reads that field, so this app models it too, from
 * the same role (2026-09-28, GE-P-3). The router's own jose middleware still
 * verifies the token.
 */
function makeAccessApp(router: express.Router, role: string): express.Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as express.Request & { userRole?: string }).userRole = role;
    runWithTenantScope({ tenantId: String(ORG), role, source: 'request', caller: 'authoring-doc-access-test' }, next);
  });
  a.use('/api/authoring', router);
  return a;
}
/**
 * The same app with the object gate in front of the router, as production
 * mounts it (register-inline-routes.ts: app.use('/api',
 * authoringObjectAuthorization) ahead of /api/authoring). The global /api gate
 * attaches the verified principal before the object gate runs; this models it
 * with the same verification the router uses.
 */
function makeGatedApp(router: express.Router, role: string): express.Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const claims = verifyJwtWithRotation(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')) as Record<string, unknown>;
    (req as unknown as { user: unknown }).user = {
      id: claims.userId, userId: claims.userId, email: claims.email, organizationId: claims.organizationId, roles: [],
    };
    (req as express.Request & { userRole?: string }).userRole = role;
    runWithTenantScope({ tenantId: String(ORG), role, source: 'request', caller: 'authoring-doc-access-test' }, next);
  });
  a.use('/api', authoringObjectAuthorization);
  a.use('/api/authoring', router);
  return a;
}
/** A second member of the same organization, with an org role of 'viewer'. */
const REVIEWER = { id: '6', organizationId: ORG, email: 'reviewer@canvas.example', name: 'Rae Reviewer' };
/** A third member, with an editing org role ('member') and no grant on the document. */
const COLLEAGUE = { id: '7', organizationId: ORG, email: 'colleague@canvas.example', name: 'Cal Colleague' };

let jdb: JourneyDb;
let app: express.Express;
let viewerScopedApp: express.Express;
let gatedApp: express.Express;
let author: (r: request.Test) => request.Test;
let reviewer: (r: request.Test) => request.Test;
let colleague: (r: request.Test) => request.Test;
let docId: string;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      // authoring_reviews, which Send for review writes (the gated case below).
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
      'migrations/20260814d_document_alias_map.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260921_authoring_document_provenance.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  await jdb.pool.query(`INSERT INTO users (id, name, email) VALUES (${REVIEWER.id}, '${REVIEWER.name}', '${REVIEWER.email}')`);
  await jdb.pool.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${REVIEWER.id}, 'viewer')`);
  await jdb.pool.query(`INSERT INTO users (id, name, email) VALUES (${COLLEAGUE.id}, '${COLLEAGUE.name}', '${COLLEAGUE.email}')`);
  await jdb.pool.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${COLLEAGUE.id}, 'member')`);
  author = asToken(await mint(AUTHOR));
  reviewer = asToken(await mint(REVIEWER));
  colleague = asToken(await mint(COLLEAGUE));
  const { default: router } = await import('../authoring.router');
  app = makeAccessApp(router, 'member');
  viewerScopedApp = makeAccessApp(router, 'viewer');
  gatedApp = makeGatedApp(router, 'member');

  const created = await author(request(app).post('/api/authoring/docs/from-draft')).send({
    programId: PROGRAM,
    title: 'Module 2.5 Clinical Overview — access',
    module: 'M2',
    documentType: 'clinical_overview',
    sections: M25_SECTIONS,
    provenance: { source: 'ana', conversationId: 'thread_access' },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  docId = created.body.data.doc.id;
  await jdb.pool.query(
    `INSERT INTO doc_permissions (doc_id, tenant_id, principal_id, email, role, granted_by, grant_reason)
     VALUES ($1, $2, $3, $4, 'REVIEWER', $5, 'Review of the clinical overview')`,
    [docId, ORG, REVIEWER.id, REVIEWER.email, AUTHOR.id],
  );
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('GET /docs/:docId — the caller’s access', () => {
  it('the creator (OWNER + AUTHOR grants, org role member) may file and assign, and may neither freeze nor sign', async () => {
    const res = await author(request(app).get(`/api/authoring/docs/${docId}`));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { access } = res.body;
    /* DP-35 (2026-10-01): a freeze is a signature, so it meets the same
       §11.10(g) org-role step as E-sign — the freeze route answers
       ESIGNATURE_NO_AUTHORITY for a member, and the bar is told so first. */
    expect(access.freeze.allowed).toBe(false);
    expect(access.freeze.reason).toMatch(/signing role/i);
    expect(access.freeze.reason).toMatch(/Your role: member/);
    expect(access.fileToVault).toEqual({ allowed: true, reason: null });
    expect(access.assignReview).toEqual({ allowed: true, reason: null });
    /* §11.10(g): 'member' is not a signing role by default (admin, approver,
       reviewer) — the e-sign route answers ESIGNATURE_NO_AUTHORITY. */
    expect(access.esign.allowed).toBe(false);
    expect(access.esign.reason).toMatch(/signing role/i);
    expect(access.esign.reason).toMatch(/Your role: member/);
  });

  it('a member with only a Reviewer grant and a viewer org role is told, per act, why not', async () => {
    const res = await reviewer(request(viewerScopedApp).get(`/api/authoring/docs/${docId}`));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { access } = res.body;
    expect(access.freeze.allowed).toBe(false);
    expect(access.freeze.reason).toMatch(/Owner or Approver grant/);
    expect(access.freeze.reason).toMatch(/Your grants on it: Reviewer/);
    expect(access.esign.allowed).toBe(false);
    expect(access.esign.reason).toMatch(/Owner or Approver grant/);
    expect(access.fileToVault.allowed).toBe(false);
    expect(access.fileToVault.reason).toMatch(/Owner, Author or Approver grant/);
    expect(access.assignReview.allowed).toBe(false);
    expect(access.assignReview.reason).toMatch(/Your role: viewer/);
    // The control it describes is "Send for review" (wave 2C): the sentence
    // beside it names that act, not the task-only "Assigning a review".
    expect(access.assignReview.reason).toBe('Sending for review needs an editing role in this organization. Your role: viewer.');
  });

  it('a FROZEN document can still be filed to the vault — the sealed record is what filing is for', async () => {
    // 2026-09-28: /file-to-vault was an 'edit', refused on an immutable status,
    // so the service's sealed-record path could never run.
    const before = ((await jdb.pool.query(`SELECT status FROM authoring_documents WHERE id = $1`, [docId])).rows[0] as { status: string }).status;
    await jdb.pool.query(`UPDATE authoring_documents SET status = 'FROZEN' WHERE id = $1`, [docId]);
    try {
      const res = await author(request(app).get(`/api/authoring/docs/${docId}`));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.access.fileToVault).toEqual({ allowed: true, reason: null });
    } finally {
      await jdb.pool.query(`UPDATE authoring_documents SET status = $2 WHERE id = $1`, [docId, before]);
    }
  });

  it('a failed permission lookup is reported as unknown, not as a denial', async () => {
    await jdb.pool.query('ALTER TABLE doc_permissions RENAME TO doc_permissions_unavailable');
    try {
      const res = await author(request(app).get(`/api/authoring/docs/${docId}`));
      expect(res.status, 'the document read itself must not fail').toBe(200);
      const { access } = res.body;
      expect(access.fileToVault).toBeNull();
      /* E-sign's grant is unknown, but its org-role step is a certain refusal
         for a member — the route refuses on that step alone. Freeze too: it is
         a signature (DP-35) and meets the same step. */
      expect(access.esign.allowed).toBe(false);
      expect(access.freeze.allowed).toBe(false);
      /* Send for review's role step allows a member, but its grant step (the
         request's 'edit' decision, wave 2D) could not be read: unknown. */
      expect(access.assignReview).toBeNull();
    } finally {
      await jdb.pool.query('ALTER TABLE doc_permissions_unavailable RENAME TO doc_permissions');
    }
  });
});

/**
 * Send for review (POST /documents/:id/request-review) is classified 'edit' by
 * the object gate since wave 2D: an Owner or Author grant, on a document that
 * is not sealed. The control's report followed only the organization role, so
 * a member without the grant, or the owner of a FROZEN document, was offered
 * the control and refused after choosing reviewers and writing a reason. Each
 * case below reads the report, then sends the request through the gate: the
 * two must agree.
 */
describe('Send for review: the report is the decision the request meets', () => {
  const send = (as: (r: request.Test) => request.Test) =>
    as(request(gatedApp).post(`/api/authoring/documents/${docId}/request-review`)).send({
      reviewers: [{ id: REVIEWER.id, name: REVIEWER.name }],
      reason: 'Ready for medical review.',
    });

  it('a member with an editing role but no grant on the document is told it needs an Owner or Author grant', async () => {
    const res = await colleague(request(app).get(`/api/authoring/docs/${docId}`));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.access.assignReview).toEqual({
      allowed: false,
      reason: 'Sending for review needs an Owner or Author grant on this document. Your grants on it: none.',
    });

    const sent = await send(colleague);
    expect(sent.status, JSON.stringify(sent.body)).toBe(403);
    expect(sent.body.error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
  });

  it('on a FROZEN document even its owner is told why not', async () => {
    const before = ((await jdb.pool.query(`SELECT status FROM authoring_documents WHERE id = $1`, [docId])).rows[0] as { status: string }).status;
    await jdb.pool.query(`UPDATE authoring_documents SET status = 'FROZEN' WHERE id = $1`, [docId]);
    try {
      const res = await author(request(app).get(`/api/authoring/docs/${docId}`));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.access.assignReview).toEqual({
        allowed: false,
        reason: "Sending for review is refused while the document's status is FROZEN.",
      });

      const sent = await send(author);
      expect(sent.status, JSON.stringify(sent.body)).toBe(409);
      expect(sent.body.error.code).toBe('AUTHORING_DOCUMENT_IMMUTABLE');
    } finally {
      await jdb.pool.query(`UPDATE authoring_documents SET status = $2 WHERE id = $1`, [docId, before]);
    }
  });

  it('the creator, who holds Owner and Author, is offered it, and the request goes through', async () => {
    const res = await author(request(app).get(`/api/authoring/docs/${docId}`));
    expect(res.body.access.assignReview).toEqual({ allowed: true, reason: null });

    const sent = await send(author);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.reviews).toEqual([expect.objectContaining({ reviewer_id: REVIEWER.id, review_status: 'pending' })]);
  });
});
