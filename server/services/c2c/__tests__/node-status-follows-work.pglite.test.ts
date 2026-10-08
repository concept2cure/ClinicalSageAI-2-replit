/**
 * Spine F1 — section status follows the governed work
 * (docs/design/FILING_SPINE.md §6 rows 1-2, §7.2 F1).
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * 1. A save in the document editor committed its text into the filing
 *    (commitSectionToFiling) and left the section's status at the scaffold's
 *    'todo'. Module completion, Recent drafts and c2c_documents.readiness all
 *    count status, so every one of them read zero for work done in the editor.
 * 2. The approval signature (POST /api/authoring/docs/:docId/e-sign as
 *    APPROVER, or the /sign that clears the last workflow step) approved and
 *    froze the working copy and moved no filing section, so a signed filing
 *    read 0% ready.
 * 3. PATCH /api/c2c/documents/:id/sections/:key accepted status 'approved'
 *    with only a reason — an approval with no signature (Part 11 §11.50/§11.70).
 *
 * ── How it is shown ───────────────────────────────────────────────────────────
 * The REAL authoring router and the REAL c2c documents router over HTTP, on
 * the REAL migrations in PGlite: the readiness trigger, the snapshot trigger,
 * the signature tables and the governed-action ledger are database objects,
 * so a mock could not show any of this.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';

const JWT_SECRET = 'node-status-follows-work';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;
process.env.AUDIT_HMAC_KEY = 'node-status-test-audit-hmac-key-not-a-real-secret';

const AUTHOR = {
  id: '42',
  organizationId: 1,
  email: 'approver@filing.example',
  name: 'Avery Approver',
};
const PROJECT = '9a111111-2222-3333-4444-666666666666';

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  CREATE TABLE regulatory_programs (
    id uuid PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    program_type text,
    primary_agency text,
    deleted_at timestamptz
  );
  CREATE TABLE audit_logs (
    id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
    table_name text, record_id text, actor_id text, target text,
    target_type text, target_id text, reason text, payload_hash text,
    ana_action_id text, sha256_chain text,
    occurred_at timestamptz DEFAULT now(), hmac_seal text,
    old_values json, new_values json, ip_address text, user_agent text
  );
  INSERT INTO organizations (id, name) VALUES (1, 'f1-org');
  INSERT INTO users (id, name, email) VALUES (42, '${AUTHOR.name}', '${AUTHOR.email}');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 42, 'member');
  INSERT INTO regulatory_programs (id, organization_id) VALUES ('${PROJECT}', 1);
`;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
// Signing authority and the §11.200 re-verification have their own suites
// (authoring-signing-authority, the sign-ceremony gates). Here they pass for the
// right password, so this file proves what it is about.
vi.mock('../../part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: async () => 'approver',
}));
vi.mock('../../part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string) => plain === 'signer-password',
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));
const PASSWORD = 'signer-password';

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let token = '';
let approverToken = '';
let reviewerToken = '';
const as = (r: request.Test, t = token) => r.set('Authorization', `Bearer ${t}`);

async function q<R = any>(sql: string, params?: unknown[]): Promise<R[]> {
  const r = await (h.pool as any).query(sql, params);
  return r.rows as R[];
}

async function sign(claims: Record<string, unknown>) {
  return new SignJWT({
    userId: AUTHOR.id, email: AUTHOR.email, name: AUTHOR.name,
    organizationId: AUTHOR.organizationId, tenant_id: AUTHOR.organizationId, ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'migrations/20260527_mutation_primitives.sql',
      // recordGovernedAction's 'approve' verb: the open command vocabulary the
      // deployed set carries (scripts/db/migration-set.mjs).
      'db/migrations/20260730_c2c_ana_actions_command_vocab.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260728_c2c_document_sections_timestamps.sql',
      'migrations/20260728_c2c_section_version_author_kind.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  token = await sign({});
  approverToken = await sign({ roles: ['APPROVER'] });
  reviewerToken = await sign({ roles: ['REVIEWER'] });

  const { default: authoringRouter } = await import('../../../routes/authoring.router');
  const { default: documentsRouter } = await import('../../../routes/c2c/documents');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);
  // The documents router reads the principal the app's auth middleware sets.
  app.use('/api/c2c/documents', (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: Number(AUTHOR.id), organizationId: AUTHOR.organizationId };
    next();
  }, documentsRouter);
}, T);

afterAll(async () => { await jdb?.close(); });

let filingSeq = 0;
/**
 * One governed filing (its sections all 'todo', as the scaffold writes them)
 * and one authored document bound to it, with a section per key. Each case
 * gets its own, so no case depends on another's order.
 */
async function makeFiling(keys: string[]) {
  const doc = `doc_f1_${++filingSeq}`;
  const pack = await q<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, 1, $2, 'ind', 'fda', $3, 'IND', 'draft', 0)`,
    [doc, PROJECT, pack[0].version],
  );
  for (const [i, key] of keys.entries()) {
    await q(
      `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, status)
       VALUES ($1, $2, $2, $3, 'todo')`,
      [doc, key, i + 1],
    );
  }
  const created = await as(request(app).post('/api/authoring/docs')).send({
    title: `IND working copy ${filingSeq}`, module: 'M2', client_program_id: PROJECT,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const authoringDocId: string = created.body.document.id;
  await q(`UPDATE authoring_documents SET c2c_document_id = $1 WHERE id = $2`, [doc, authoringDocId]);
  const sectionIds: Record<string, string> = {};
  for (const key of keys) {
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: authoringDocId, code: key, title: key, content: '', order_index: 1,
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    sectionIds[key] = s.body.section.id;
  }
  return { doc, authoringDocId, sectionIds };
}

const save = (sectionId: string, content: string) =>
  as(request(app).patch(`/api/authoring/sections/${sectionId}`)).send({
    content, changeReason: 'drafting the section',
  });

async function statuses(doc: string): Promise<Record<string, string>> {
  const rows = await q<{ section_key: string; status: string }>(
    `SELECT section_key, status FROM c2c_document_sections WHERE document_id = $1`, [doc],
  );
  return Object.fromEntries(rows.map((r) => [r.section_key, r.status]));
}
async function readiness(doc: string): Promise<number> {
  const [row] = await q<{ readiness: number }>(`SELECT readiness FROM c2c_documents WHERE id = $1`, [doc]);
  return Number(row.readiness);
}

describe('1. a save in the editor moves the section to drafted', () => {
  it('a save with text leaves the bound section drafted, not todo', async () => {
    const f = await makeFiling(['2.5', '2.6']);
    const res = await save(f.sectionIds['2.5'], 'The product was well tolerated.');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: true, sectionKey: '2.5' });

    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted', '2.6': 'todo' });
  }, T);

  it('a save of only whitespace is not work: the section stays todo', async () => {
    const f = await makeFiling(['2.5']);
    const res = await save(f.sectionIds['2.5'], '   \n\t ');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'todo' });
  }, T);

  it('a later save keeps review; it never moves work backwards', async () => {
    const f = await makeFiling(['2.5', '2.6']);
    for (const k of ['2.5', '2.6']) {
      expect((await save(f.sectionIds[k], `First text for ${k}.`)).status).toBe(200);
    }
    await q(`UPDATE c2c_document_sections SET status = 'review' WHERE document_id = $1 AND section_key = '2.5'`, [f.doc]);
    for (const k of ['2.5', '2.6']) {
      const res = await save(f.sectionIds[k], `Second text for ${k}.`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.filing).toMatchObject({ committed: true, sectionKey: k });
    }
    expect(await statuses(f.doc)).toEqual({ '2.5': 'review', '2.6': 'drafted' });
  }, T);

  it('new text on an approved section is not the signed text: the section is withdrawn to drafted, and that is recorded', async () => {
    const f = await makeFiling(['2.5', '2.6']);
    expect((await save(f.sectionIds['2.5'], 'Signed text.')).status).toBe(200);
    expect((await save(f.sectionIds['2.6'], 'Other text.')).status).toBe(200);
    await q(`UPDATE c2c_document_sections SET status = 'approved' WHERE document_id = $1`, [f.doc]);
    expect(await readiness(f.doc)).toBe(100);

    const res = await save(f.sectionIds['2.5'], 'Text nobody signed.');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // The save reply's filing block is built by the save handler, which names
    // only committed/documentId/sectionKey; the withdrawal is read from the
    // database and the governed-action record below.
    expect(res.body.filing).toMatchObject({ committed: true, sectionKey: '2.5' });
    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted', '2.6': 'approved' });
    expect(await readiness(f.doc)).toBe(50);

    const [withdrawal] = await q<{ command: string; payload: any }>(
      `SELECT a.command, a.payload FROM c2c_ana_actions a
         JOIN audit_logs l ON l.ana_action_id = a.id
        WHERE l.target = $1 AND l.action = 'c2c.work.transition'`,
      [`section:${f.doc}:2.5`],
    );
    expect(withdrawal).toBeDefined();
    expect(withdrawal.payload).toMatchObject({ from: 'approved', to: 'drafted', approvalWithdrawn: true });
  }, T);

  it('a locked section is not written by a save; the filing result says why', async () => {
    const f = await makeFiling(['2.7']);
    expect((await save(f.sectionIds['2.7'], 'Locked text.')).status).toBe(200);
    await q(`UPDATE c2c_document_sections SET status = 'locked' WHERE document_id = $1`, [f.doc]);

    const res = await save(f.sectionIds['2.7'], 'Text that must not reach a locked section.');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: false });
    expect(res.body.filing.reason).toMatch(/locked/);
    const [row] = await q<{ status: string; text: string }>(
      `SELECT status, content->>'text' AS text FROM c2c_document_sections WHERE document_id = $1`, [f.doc],
    );
    expect(row).toEqual({ status: 'locked', text: 'Locked text.' });
  }, T);
});

describe('2. the approval signature approves the sections it covers', () => {
  it('e-sign as APPROVER: written sections are approved, readiness rises above 0, one governed-action row', async () => {
    const f = await makeFiling(['2.5', '2.6', '2.7']);
    expect((await save(f.sectionIds['2.5'], 'Clinical overview text.')).status).toBe(200);
    expect((await save(f.sectionIds['2.6'], 'Nonclinical summary text.')).status).toBe(200);
    // 2.7 is never written: approving it would approve nothing.
    expect(await readiness(f.doc)).toBe(0);

    const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'I approve this filing for submission.', password: PASSWORD,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved', '2.6': 'approved', '2.7': 'todo' });
    // c2c_recompute_document_readiness: approved/locked over all sections.
    expect(await readiness(f.doc)).toBe(67);
    expect(res.body.filingApproval).toEqual({ approved: ['2.5', '2.6'], notApproved: ['2.7'], documentId: f.doc });

    // Recorded through recordGovernedAction, on the signature's transaction:
    // one chained audit row and its c2c_ana_actions pair, naming the signature.
    const audit = await q<{ action: string; reason: string; sha256_chain: string; ana_action_id: string; target: string }>(
      `SELECT action, reason, sha256_chain, ana_action_id, target FROM audit_logs
        WHERE action = 'c2c.work.approve' AND target = $1`,
      [`c2c_document:${f.doc}`],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toBe('I approve this filing for submission.');
    expect(audit[0].sha256_chain).toBeTruthy();
    const [action] = await q<{ command: string; payload: any; state: string }>(
      `SELECT command, payload, state FROM c2c_ana_actions WHERE id = $1`, [audit[0].ana_action_id],
    );
    expect(action.command).toBe('approve');
    expect(action.state).toBe('executed');
    expect(action.payload).toMatchObject({
      sections: ['2.5', '2.6'], signatureId: res.body.signatureId, meaning: 'APPROVER', via: 'e-sign',
    });
  }, T);

  it('a signature that does not mean approval approves nothing (e-sign as REVIEWER, AUTHOR)', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Text a reviewer reads.')).status).toBe(200);
    const replies: unknown[] = [];
    for (const meaning of ['REVIEWER', 'AUTHOR']) {
      const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
        meaning, intent: `Signed as ${meaning}.`, password: PASSWORD,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      replies.push(res.body.filingApproval);
    }
    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted' });
    expect(replies).toEqual([null, null]);
    expect(await readiness(f.doc)).toBe(0);
    const audit = await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.work.approve' AND target = $1`, [`c2c_document:${f.doc}`]);
    expect(audit).toHaveLength(0);
  }, T);

  it('a section whose filing text is not the text signed is not approved', async () => {
    const f = await makeFiling(['2.5', '2.6']);
    expect((await save(f.sectionIds['2.5'], 'Signed text.')).status).toBe(200);
    expect((await save(f.sectionIds['2.6'], 'Text the signer saw.')).status).toBe(200);
    // The filing's 2.6 changed after the last save in this editor.
    await q(`SELECT set_config('app.actor_id', '42', false), set_config('app.reason', 'elsewhere', false)`);
    await q(
      `UPDATE c2c_document_sections SET content = '{"text":"Text written elsewhere."}'::jsonb
        WHERE document_id = $1 AND section_key = '2.6'`,
      [f.doc],
    );
    await q(`SELECT set_config('app.actor_id', '', false), set_config('app.reason', '', false)`);

    const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved', '2.6': 'drafted' });
    expect(res.body.filingApproval).toEqual({ approved: ['2.5'], notApproved: ['2.6'], documentId: f.doc });
  }, T);

  it('an approval on a document with no filing says so, not "nothing left to approve"', async () => {
    const f = await makeFiling(['2.5']);
    await q(`UPDATE authoring_documents SET c2c_document_id = NULL WHERE id = $1`, [f.authoringDocId]);
    const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filingApproval).toMatchObject({ approved: [], notApproved: [], documentId: null });
    expect(res.body.filingApproval.reason).toMatch(/not bound to a filing/);
  }, T);

  it('a second authoring document bound to the same filing cannot leave unsigned text approved', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Signed text.')).status).toBe(200);
    const signed = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD,
    });
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved' });

    const other = await as(request(app).post('/api/authoring/docs')).send({
      title: 'A second working copy', module: 'M2', client_program_id: PROJECT,
    });
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    await q(`UPDATE authoring_documents SET c2c_document_id = $1 WHERE id = $2`, [f.doc, other.body.document.id]);
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: other.body.document.id, code: '2.5', title: '2.5', content: '', order_index: 1,
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    const res = await save(s.body.section.id, 'Different text, unsigned.');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: true, sectionKey: '2.5' });

    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted' });
    expect(await readiness(f.doc)).toBe(0);
  }, T);

});

describe('2. the approval signature approves the sections it covers: /sign, and rollback', () => {
  it('/sign that clears the last workflow step approves the sections; /sign with no workflow does not', async () => {
    // No workflow: the document is signed and not approved (authoringApprovalNoWorkflow),
    // so no section is approved either.
    const plain = await makeFiling(['2.5']);
    expect((await save(plain.sectionIds['2.5'], 'Text.')).status).toBe(200);
    const noWf = await as(request(app).post(`/api/authoring/docs/${plain.authoringDocId}/sign`), approverToken)
      .send({ meaning: 'APPROVER', reason: 'Approving.', password: PASSWORD });
    expect(noWf.status, JSON.stringify(noWf.body)).toBe(200);
    expect(await statuses(plain.doc)).toEqual({ '2.5': 'drafted' });
    expect(noWf.body.filingApproval).toBeNull();

    // A workflow whose one pending step is this approver's.
    const f = await makeFiling(['2.5', '2.6']);
    expect((await save(f.sectionIds['2.5'], 'Clinical overview.')).status).toBe(200);
    await q(
      `INSERT INTO authoring_workflow_steps (workflow_id, doc_id, step_no, role, approver_email, status, tenant_id)
       VALUES (gen_random_uuid(), $1, 1, 'APPROVER', $2, 'PENDING', 1)`,
      [f.authoringDocId, AUTHOR.email],
    );
    const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/sign`), approverToken)
      .send({ meaning: 'APPROVER', reason: 'Final approval.', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved', '2.6': 'todo' });
    expect(await readiness(f.doc)).toBe(50);
    expect(res.body.filingApproval).toEqual({ approved: ['2.5'], notApproved: ['2.6'], documentId: f.doc });
  }, T);

  it('a /sign after the workflow is complete decides no step and approves nothing, whatever its meaning', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Clinical overview.')).status).toBe(200);
    await q(
      `INSERT INTO authoring_workflow_steps (workflow_id, doc_id, step_no, role, approver_email, status, tenant_id)
       VALUES (gen_random_uuid(), $1, 1, 'APPROVER', $2, 'PENDING', 1)`,
      [f.authoringDocId, AUTHOR.email],
    );
    const first = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/sign`), approverToken)
      .send({ meaning: 'APPROVER', reason: 'Final approval.', password: PASSWORD });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.filingApproval).toMatchObject({ approved: ['2.5'] });

    // The section is sent back to review (allowed: a move away from approved).
    const back = await request(app)
      .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
      .send({ status: 'review', reason: 'Another look.' });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'review' });

    const later = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/sign`), reviewerToken)
      .send({ meaning: 'REVIEWER', reason: 'Reviewed.', password: PASSWORD });
    expect(later.status, JSON.stringify(later.body)).toBe(200);
    expect(later.body.filingApproval).toBeNull();
    expect(await statuses(f.doc)).toEqual({ '2.5': 'review' });
    const approvals = await q(
      `SELECT 1 FROM audit_logs WHERE action = 'c2c.work.approve' AND target = $1`, [`c2c_document:${f.doc}`],
    );
    expect(approvals).toHaveLength(1);
  }, T);

  it('a signature that rolls back leaves the sections exactly as they were', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Text to approve.')).status).toBe(200);
    // The e-sign handler's own chained row is written AFTER the sections move,
    // so refusing it makes the database roll the whole signing act back.
    await q(`ALTER TABLE audit_logs ADD CONSTRAINT tmp_no_esign
               CHECK (action <> 'authoring.document.e-sign') NOT VALID`);
    try {
      const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
        meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD,
      });
      expect(res.status).toBe(500);
    } finally {
      await q(`ALTER TABLE audit_logs DROP CONSTRAINT tmp_no_esign`);
    }
    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted' });
    expect(await readiness(f.doc)).toBe(0);
    expect(await q(`SELECT 1 FROM authoring_signatures WHERE doc_id = $1`, [f.authoringDocId])).toHaveLength(0);
    expect(await q(`SELECT 1 FROM audit_logs WHERE action = 'c2c.work.approve' AND target = $1`, [`c2c_document:${f.doc}`]))
      .toHaveLength(0);
  }, T);
});

describe('3. the old-store PATCH cannot approve or lock without a signature', () => {
  it.each(['approved', 'locked'])('PATCH status %s returns 409 APPROVAL_REQUIRES_SIGNATURE and changes nothing', async (status) => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Drafted text.')).status).toBe(200);
    const before = await q(`SELECT count(*)::int AS n FROM audit_logs`);

    const res = await request(app)
      .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
      .send({ status, reason: 'Approving by field edit.' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('APPROVAL_REQUIRES_SIGNATURE');
    expect(res.body.message).toMatch(status === 'approved' ? /electronic signature/ : /Lock the document/);
    expect(res.body.message).toMatch(/Nothing was changed\.$/);

    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted' });
    expect(await readiness(f.doc)).toBe(0);
    expect(await q(`SELECT count(*)::int AS n FROM audit_logs`)).toEqual(before);
  }, T);

  it('a content PATCH on an approved section withdraws it to drafted and records that', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Signed text.')).status).toBe(200);
    const signed = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD,
    });
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved' });
    expect(await readiness(f.doc)).toBe(100);

    const res = await request(app)
      .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
      .send({ content: { text: 'Text nobody signed.' }, reason: 'Edited in the dossier editor.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe('drafted');
    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted' });
    expect(await readiness(f.doc)).toBe(0);
    const [rec] = await q<{ payload: any }>(
      `SELECT a.payload FROM c2c_ana_actions a JOIN audit_logs l ON l.ana_action_id = a.id
        WHERE l.target = $1 AND l.action = 'c2c.work.transition'`,
      [`section:${f.doc}:2.5`],
    );
    expect(rec.payload).toMatchObject({ from: 'approved', to: 'drafted', approvalWithdrawn: true });
  }, T);

  it('a PATCH on a locked section is refused with 409 SECTION_LOCKED and changes nothing', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Locked text.')).status).toBe(200);
    await q(`UPDATE c2c_document_sections SET status = 'locked' WHERE document_id = $1`, [f.doc]);
    for (const body of [{ content: { text: 'New text.' } }, { status: 'todo' }]) {
      const res = await request(app)
        .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
        .send({ ...body, reason: 'Trying to edit.' });
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe('SECTION_LOCKED');
      expect(res.body.message).toMatch(/Nothing was changed\.$/);
    }
    const [row] = await q<{ status: string; text: string }>(
      `SELECT status, content->>'text' AS text FROM c2c_document_sections WHERE document_id = $1`, [f.doc],
    );
    expect(row).toEqual({ status: 'locked', text: 'Locked text.' });
  }, T);

  it('the same PATCH still moves a section between the unsigned states', async () => {
    const f = await makeFiling(['2.5']);
    const res = await request(app)
      .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
      .send({ status: 'review', reason: 'Ready for review.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'review' });
  }, T);
});
