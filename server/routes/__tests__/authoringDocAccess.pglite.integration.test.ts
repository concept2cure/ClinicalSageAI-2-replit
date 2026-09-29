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
/** A second member of the same organization, with an org role of 'viewer'. */
const REVIEWER = { id: '6', organizationId: ORG, email: 'reviewer@canvas.example', name: 'Rae Reviewer' };

let jdb: JourneyDb;
let app: express.Express;
let viewerScopedApp: express.Express;
let author: (r: request.Test) => request.Test;
let reviewer: (r: request.Test) => request.Test;
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
  author = asToken(await mint(AUTHOR));
  reviewer = asToken(await mint(REVIEWER));
  const { default: router } = await import('../authoring.router');
  app = makeAccessApp(router, 'member');
  viewerScopedApp = makeAccessApp(router, 'viewer');

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
  it('the creator (OWNER + AUTHOR grants, org role member) may freeze, file and assign, and may not sign', async () => {
    const res = await author(request(app).get(`/api/authoring/docs/${docId}`));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { access } = res.body;
    expect(access.freeze).toEqual({ allowed: true, reason: null });
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
      expect(access.freeze).toBeNull();
      expect(access.fileToVault).toBeNull();
      /* E-sign's grant is unknown, but its org-role step is a certain refusal
         for a member — the route refuses on that step alone. */
      expect(access.esign.allowed).toBe(false);
      expect(access.assignReview).toEqual({ allowed: true, reason: null });
    } finally {
      await jdb.pool.query('ALTER TABLE doc_permissions_unavailable RENAME TO doc_permissions');
    }
  });
});
