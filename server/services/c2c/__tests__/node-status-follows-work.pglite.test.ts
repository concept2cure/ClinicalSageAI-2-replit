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
import express from 'express';
import request from 'supertest';
import type { JourneyDb } from '../../../../tests/golden-journeys/harness';
import {
  AUTHOR, FILING_JWT_SECRET, PASSWORD, PROJECT, T, makeFiling as makeFilingIn, signToken as sign, startFilingApp, type FilingApp,
} from './_filing-write-harness';

process.env.JWT_SECRET = FILING_JWT_SECRET;
process.env.JWT_SECRET_DEV = FILING_JWT_SECRET;
process.env.AUDIT_HMAC_KEY = 'node-status-test-audit-hmac-key-not-a-real-secret';

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
let jdb: JourneyDb;
let app: express.Express;
let filing: FilingApp;
let token = '';
let approverToken = '';
let reviewerToken = '';
const as = (r: request.Test, t = token) => r.set('Authorization', `Bearer ${t}`);
const q = <R = any>(sql: string, params?: unknown[]) => filing.q<R>(sql, params);

beforeAll(async () => {
  filing = await startFilingApp((built) => { h.db = built.db; h.pool = built.pool; });
  ({ jdb, app } = filing);
  token = await sign({});
  approverToken = await sign({ roles: ['APPROVER'] });
  reviewerToken = await sign({ roles: ['REVIEWER'] });
}, T);

afterAll(async () => { await jdb?.close(); });

const makeFiling = (keys: string[]) => makeFilingIn(filing, (r) => as(r), keys);

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

async function sealedState(f: { doc: string; authoringDocId: string }) {
  return {
    document: await q('SELECT status FROM authoring_documents WHERE id=$1',[f.authoringDocId]),
    filing: await q('SELECT section_key,status,content FROM c2c_document_sections WHERE document_id=$1 ORDER BY section_key',[f.doc]),
    signatures: await q('SELECT * FROM authoring_signatures WHERE doc_id=$1 ORDER BY id',[f.authoringDocId]),
    freezes: await q('SELECT * FROM frozen_documents WHERE document_id=$1 ORDER BY id',[f.authoringDocId]),
    workflow: await q('SELECT * FROM authoring_workflow_steps WHERE doc_id=$1 ORDER BY id',[f.authoringDocId]),
    trail: await q('SELECT * FROM authoring_audit_trail WHERE doc_id=$1 ORDER BY id',[f.authoringDocId]),
    approvals: await q("SELECT * FROM audit_logs WHERE action='c2c.work.approve' AND target=$1 ORDER BY id",[`c2c_document:${f.doc}`]),
  };
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
    // c2c_document_counted_readiness: approved/locked over the counted sections.
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

/**
 * A signature over a diverged filing is REFUSED whole, not applied in part
 * (contract corrected 2026-10-18; it asserted 200 with 2.6 silently left
 * drafted). A signature is bound to content: the signer believes they approved
 * what is in front of them, while the submission would carry text for 2.6 they
 * never saw, and a partial approval the signer thinks is whole is the ambiguity
 * §11.70 exists to prevent. The second half keeps the refusal from being a dead
 * end — the recovery the message names has to work, or the signer is stuck.
 */
describe('the signature a diverged filing refuses, and the way back', () => {
  it('a signature over a diverged filing is refused whole, and the recovery it names works', async () => {
    const f = await makeFiling(['2.5', '2.6']);
    expect((await save(f.sectionIds['2.5'], 'Signed text.')).status).toBe(200);
    expect((await save(f.sectionIds['2.6'], 'Text the signer saw.')).status).toBe(200);
    const sign = () => as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({ meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD });
    // The filing's 2.6 changed after the last save in this editor.
    await q(`SELECT set_config('app.actor_id', '42', false), set_config('app.reason', 'elsewhere', false)`);
    await q(`UPDATE c2c_document_sections SET content = '{"text":"x"}'::jsonb WHERE document_id = $1 AND section_key = '2.6'`, [f.doc]);

    const refused = await sign();
    expect([refused.status, refused.body.error.code], JSON.stringify(refused.body)).toEqual([409, 'FILING_DIVERGED']);
    /* It names what diverged and how to reconcile it: an error that says only
       "no" leaves the signer nowhere. */
    expect(refused.body.error.message).toMatch(/section 2\.6[\s\S]*Re-file saved text/);
    /* NOTHING was signed — not even the section that matched. One act, one document. */
    expect(await statuses(f.doc)).toEqual({ '2.5': 'drafted', '2.6': 'drafted' });
    expect(await q(`SELECT 1 FROM authoring_signatures WHERE doc_id = $1`, [f.authoringDocId])).toHaveLength(0);

    /* A governed ordinary content save also restores agreement. The unchanged
       saved-text action is covered by the native Authoring contract suite. */
    expect((await save(f.sectionIds['2.6'], 'Text the signer saw, re-filed.')).status).toBe(200);
    const signed = await sign();
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved', '2.6': 'approved' });
    expect(signed.body.filingApproval).toEqual({ approved: ['2.5', '2.6'], notApproved: [], documentId: f.doc });
  }, T);
});

describe('2. the approval signature approves the sections it covers: /sign, and rollback', () => {
  it('/sign that clears the last workflow step approves the sections; /sign with no workflow does not', async () => {
    // No workflow: the document is signed and not approved (authoringApprovalNoWorkflow),
    // so no section is approved either.
    const plain = await makeFiling(['2.5']);
    expect((await save(plain.sectionIds['2.5'], 'Text.')).status).toBe(200);
    const noWf = await as(request(app).post(`/api/authoring/docs/${plain.authoringDocId}/sign`), approverToken).send({ meaning: 'APPROVER', reason: 'Approving.', password: PASSWORD });
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
    const res = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/sign`), approverToken).send({ meaning: 'APPROVER', reason: 'Final approval.', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved', '2.6': 'todo' });
    expect(await readiness(f.doc)).toBe(50);
    expect(res.body.filingApproval).toEqual({ approved: ['2.5'], notApproved: ['2.6'], documentId: f.doc });
  }, T);

  it('a completed signed workflow refuses status changes and permits only a new review signature over unchanged content', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Clinical overview.')).status).toBe(200);
    await q(
      `INSERT INTO authoring_workflow_steps (workflow_id, doc_id, step_no, role, approver_email, status, tenant_id)
       VALUES (gen_random_uuid(), $1, 1, 'APPROVER', $2, 'PENDING', 1)`,
      [f.authoringDocId, AUTHOR.email],
    );
    const first = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/sign`), approverToken).send({ meaning: 'APPROVER', reason: 'Final approval.', password: PASSWORD });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.filingApproval).toMatchObject({ approved: ['2.5'] });
    const before = await sealedState(f);
    expect(before.document).toEqual([{status:'APPROVED'}]);
    expect(before.signatures).toHaveLength(1);
    expect(before.freezes).toHaveLength(1);

    // A signed filing is immutable. Reopening it requires a governed new
    // version; a later review may append a signature over this unchanged seal.
    const back = await request(app).patch(`/api/c2c/documents/${f.doc}/sections/2.5`).send({ status: 'review', reason: 'Another look.' });
    expect(back.status, JSON.stringify(back.body)).toBe(403);
    expect(back.body.code).toBe('DOCUMENT_FROZEN');
    expect(await sealedState(f)).toEqual(before);

    const later = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/sign`), reviewerToken).send({ meaning: 'REVIEWER', reason: 'Reviewed.', password: PASSWORD });
    expect(later.status, JSON.stringify(later.body)).toBe(200);
    expect(later.body.filingApproval).toBeNull();
    const after = await sealedState(f);
    for (const key of ['document','filing','freezes','workflow','approvals'] as const) expect(after[key]).toEqual(before[key]);
    expect(after.signatures).toEqual(expect.arrayContaining(before.signatures));
    expect(after.signatures).toHaveLength(before.signatures.length+1);
    const review = after.signatures.find(signature => signature.id===later.body.signatureId);
    expect(review).toMatchObject({meaning:'REVIEWER',signer_email:AUTHOR.email,
      content_hash:before.signatures[0].content_hash,covered_content_hash:before.freezes[0].content_hash});
    expect(after.trail).toEqual(expect.arrayContaining(before.trail));
    expect(after.trail).toHaveLength(before.trail.length+1);
    expect(after.trail.find(row => row.metadata?.signatureId===later.body.signatureId)).toMatchObject({
      operation_type:'SIGN',actor_id:AUTHOR.id,metadata:{meaning:'REVIEWER'} });
    const chained = await q("SELECT * FROM audit_logs WHERE action='authoring.document.sign' AND new_values->>'signatureId'=$1",[later.body.signatureId]);
    expect(chained).toHaveLength(1);
    expect(chained[0].sha256_chain).toBeTruthy();
    expect(chained[0].hmac_seal).toBeTruthy();
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved' });
    expect(await readiness(f.doc)).toBe(100);
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

  it('a content PATCH cannot rewrite a signed filing section (text is authored only, step 5)', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Signed text.')).status).toBe(200);
    const signed = await as(request(app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'Approved.', password: PASSWORD,
    });
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved' });
    expect(await readiness(f.doc)).toBe(100);
    const before = await sealedState(f);

    const res = await request(app)
      .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
      .send({ content: { text: 'Text nobody signed.' }, reason: 'Edited in the dossier editor.' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('SECTION_TEXT_IS_AUTHORED');
    expect(await sealedState(f)).toEqual(before);
    expect(await statuses(f.doc)).toEqual({ '2.5': 'approved' });
    expect(await readiness(f.doc)).toBe(100);
    const withdrawals = await q(
      `SELECT a.payload FROM c2c_ana_actions a JOIN audit_logs l ON l.ana_action_id = a.id
        WHERE l.target = $1 AND l.action = 'c2c.work.transition' AND a.payload->>'approvalWithdrawn'='true'`,
      [`section:${f.doc}:2.5`],
    );
    expect(withdrawals).toHaveLength(0);
  }, T);

  it('a PATCH on a locked section is refused with 409 SECTION_LOCKED and changes nothing', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Locked text.')).status).toBe(200);
    await q(`UPDATE c2c_document_sections SET status = 'locked' WHERE document_id = $1`, [f.doc]);
    for (const [body, code] of [[{ content: { text: 'New text.' } }, 'SECTION_TEXT_IS_AUTHORED'], [{ status: 'todo' }, 'SECTION_LOCKED']] as const) {
      const res = await request(app)
        .patch(`/api/c2c/documents/${f.doc}/sections/2.5`)
        .send({ ...body, reason: 'Trying to edit.' });
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.code).toBe(code);
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
