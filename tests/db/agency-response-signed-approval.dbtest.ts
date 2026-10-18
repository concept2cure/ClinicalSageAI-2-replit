/**
 * Correspondence & commitments (rows D2, D5): an answer to an agency is
 * approved by a Part 11 signature, and nothing goes back to the agency, or
 * closes the letter, on an answer nobody signed.
 *
 * ── The gap this pins (trunk at c1a6916c, 2026-10-18) ────────────────────────
 * The project's agency inbox (concept2cure_agency_communications, Communication
 * Center and Project home's Respond tab) recorded a letter's questions as a
 * JSON array of strings: no response, no owner, no approval. Its Advance closed
 * a letter whether or not anybody had answered it. The one screen that did
 * hold responses (haq-manager, over a project_memory_entries JSON store)
 * "approved" one by setting status = 'approved': no signature, no reason, no
 * role check (P-32 kept it locked for exactly that), and its package was built
 * from those flags. Commitments made in an answer could not name it.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * Everything but the per-signer attempt limiter (its own suite; a pass-through
 * here): the Communication Center router with its own chain (auth with a
 * signed access token, tenant context, project admission), the runtime role
 * through APP_DATABASE_URL with RLS enforcing, reverifySigner with bcrypt, the
 * ledger pair, the electronic_signatures writer and its content binder, and the
 * audited export.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Each run creates its own organizations, users and project (`dbagr-<uuid>`).
 * Signatures and ledger rows are permanent by design and are left in place.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { agencyResponseDigest } from '../../server/services/agency-responses/response-logic';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const PASSWORD = 'Dbagr-Agency-Response-2026!';
const PREFIX = `dbagr-${randomUUID()}`;

let owner: Pool;
let app: express.Express;
let orgId: number;
let foreignOrgId: number;
let projectId: number;
let foreignProjectId: number;
const users: Record<'author' | 'approver' | 'viewer' | 'foreign', { id: number; token: string }> = {} as never;

async function mintToken(userId: number, org: number): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(org) }, activeJwtSecret(), { expiresIn: '10m' });
}

async function user(key: keyof typeof users, org: number, role: string): Promise<void> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [`${PREFIX}-${key}@example.invalid`, `Agency ${key[0].toUpperCase()}${key.slice(1)}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
    [org, id, role],
  );
  users[key] = { id, token: await mintToken(id, org) };
}

async function organizationWithProject(label: string): Promise<{ org: number; project: (actor: number) => Promise<number> }> {
  const { rows } = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id`,
    [`${PREFIX}-${label}`],
  );
  const org = Number(rows[0].id);
  return {
    org,
    project: async (actor: number) => {
      const ws = await owner.query(
        `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`,
        [org, `${PREFIX}-${label}-ws`],
      );
      const p = await owner.query(
        `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, settings)
         VALUES ($1, $2, $3, 'regulatory', 'active', $4, $4, '{}'::jsonb) RETURNING id`,
        [org, Number(ws.rows[0].id), `${PREFIX}-${label}-project`, actor],
      );
      return Number(p.rows[0].id);
    },
  };
}

const base = () => `/api/concept2cure/projects/${projectId}/agency-communications`;
const as = (who: keyof typeof users) => ({ Authorization: `Bearer ${users[who].token}` });

async function logLetter(): Promise<string> {
  const res = await request(app)
    .post(base())
    .set(as('author'))
    .send({
      sourceType: 'uploaded_official_correspondence',
      communicationType: 'Information request',
      sourceChannel: 'esg',
      urgency: 'high',
      responseRequired: true,
      dueDate: '2026-11-15T00:00:00.000Z',
      visibilityTier: 'client_internal',
    });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return String(res.body.data.id);
}

async function addQuestion(letter: string, ref: string, text: string) {
  return request(app)
    .post(`${base()}/${letter}/questions`)
    .set(as('author'))
    .send({ questionRef: ref, questionText: text, discipline: 'CMC', severity: 'major', reason: 'Recording the question as the agency asked it.' });
}

async function saveResponse(letter: string, qid: number, who: keyof typeof users, text: string, expectedRevision: number) {
  return request(app)
    .put(`${base()}/${letter}/questions/${qid}/response`)
    .set(as(who))
    .send({ responseText: text, expectedRevision, reason: 'Drafting the response for review.' });
}

async function approve(letter: string, qid: number, who: keyof typeof users, expectedRevision: number, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`${base()}/${letter}/questions/${qid}/approve`)
    .set(as(who))
    .send({ reason: 'I reviewed this response against the source data.', meaning: 'approval', password: PASSWORD, expectedRevision, ...extra });
}

async function read(letter: string, who: keyof typeof users = 'author') {
  return request(app).get(`${base()}/${letter}/questions`).set(as(who));
}

async function signaturesOn(qid: number) {
  const { rows } = await owner.query(
    `SELECT id, signer_id, signature_meaning, binding_basis, bound_payload_digest
       FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`,
    [orgId, `agency-question:${qid}`],
  );
  return rows;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbagr] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const own = await organizationWithProject('own');
  orgId = own.org;
  await user('author', orgId, 'admin');
  await user('approver', orgId, 'admin');
  await user('viewer', orgId, 'viewer');
  projectId = await own.project(users.author.id);

  const foreign = await organizationWithProject('foreign');
  foreignOrgId = foreign.org;
  await user('foreign', foreignOrgId, 'admin');
  foreignProjectId = await foreign.project(users.foreign.id);

  app = express();
  app.use(express.json());
  app.use('/api/concept2cure', (await import('../../server/routes/c2c/communication-center')).default);
  // As production mounts it (register-inline-routes.ts): Communication's
  // commitments tab reads and fulfils commitments here.
  const { authMiddleware } = await import('../../server/auth');
  app.use('/api/ha-interactions', authMiddleware, (await import('../../server/routes/ha-interactions')).default);
}, 120_000);

afterAll(async () => {
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner?.end();
});

describe('the record an agency answer is approved on', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('agency-response-signed-approval.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('records a question on a letter, with its ledger row, as unanswered', async () => {
    const letter = await logLetter();
    const res = await addQuestion(letter, 'Q1', 'Provide the dissolution method validation report.');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const qid = Number(res.body.data.id);
    const ledger = await owner.query(`SELECT command, decision_reason AS reason FROM c2c_ana_actions WHERE org_id = $1 AND target = $2`, [orgId, `agency-question:${qid}`]);
    expect(ledger.rows).toEqual([{ command: 'create', reason: 'Recording the question as the agency asked it.' }]);

    const view = await read(letter);
    expect(view.status, JSON.stringify(view.body)).toBe(200);
    expect(view.body.data.questions).toHaveLength(1);
    expect(view.body.data.questions[0]).toMatchObject({ id: qid, questionRef: 'Q1', state: 'unanswered', approval: null });
    expect(view.body.data.packageReady).toBe(false);
  });

  it('refuses a second question with the same agency number on one letter', async () => {
    const letter = await logLetter();
    expect((await addQuestion(letter, 'Q1', 'First.')).status).toBe(201);
    const dup = await addQuestion(letter, 'Q1', 'Second.');
    expect(dup.status, JSON.stringify(dup.body)).toBe(409);
  });

  it('a viewer can read the questions and write none', async () => {
    const letter = await logLetter();
    expect((await addQuestion(letter, 'Q1', 'Text.')).status).toBe(201);
    expect((await read(letter, 'viewer')).status).toBe(200);
    const res = await request(app)
      .post(`${base()}/${letter}/questions`)
      .set(as('viewer'))
      .send({ questionRef: 'Q2', questionText: 'Text.', severity: 'minor', reason: 'A viewer should not record this.' });
    expect(res.status).toBe(403);
  });
});

describe('approval is a signature, by someone other than the author, over the text they saw', () => {
  let letter: string;
  let qid: number;
  const TEXT = 'The validation report is provided in Module 3.2.P.5.3, Attachment 4.';

  beforeAll(async () => {
    letter = await logLetter();
    qid = Number((await addQuestion(letter, 'Q1', 'Provide the dissolution method validation report.')).body.data.id);
    const saved = await saveResponse(letter, qid, 'author', TEXT, 0);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data).toMatchObject({ responseRevision: 1, state: 'drafted' });
  });

  it('tells the author, before they try, that they cannot approve their own answer', async () => {
    const view = await read(letter, 'author');
    expect(view.body.data.questions[0].signRefusal).toMatchObject({ code: 'SIGNER_WROTE_RESPONSE' });
    const other = await read(letter, 'approver');
    expect(other.body.data.questions[0].signRefusal).toBeNull();
  });

  it('refuses an approval with no password, and writes nothing', async () => {
    const res = await request(app)
      .post(`${base()}/${letter}/questions/${qid}/approve`)
      .set(as('approver'))
      .send({ reason: 'I reviewed this response.', meaning: 'approval', expectedRevision: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error?.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect(await signaturesOn(qid)).toEqual([]);
  });

  it('refuses a meaning an approval cannot carry', async () => {
    const res = await approve(letter, qid, 'approver', 1, { meaning: 'authorship' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('MEANING_NOT_ALLOWED');
    expect(await signaturesOn(qid)).toEqual([]);
  });

  it('refuses the author, with the right password, and writes nothing', async () => {
    const res = await approve(letter, qid, 'author', 1);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error?.code).toBe('SIGNER_WROTE_RESPONSE');
    expect(await signaturesOn(qid)).toEqual([]);
  });

  it('refuses a viewer: identity is not authority', async () => {
    const res = await approve(letter, qid, 'viewer', 1);
    expect(res.status).toBe(403);
    expect(await signaturesOn(qid)).toEqual([]);
  });

  it('refuses a signature over a revision the signer did not see', async () => {
    const res = await approve(letter, qid, 'approver', 0);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error?.code).toBe('RESPONSE_CHANGED');
    expect(await signaturesOn(qid)).toEqual([]);
  });

  it('signs: one electronic_signatures row binding the exact response text', async () => {
    const res = await approve(letter, qid, 'approver', 1);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.signatureId).toEqual(expect.any(Number));

    const sigs = await signaturesOn(qid);
    expect(sigs).toHaveLength(1);
    const row = (await owner.query(`SELECT communication_event_id, question_ref, question_text, response_text FROM agency_communication_questions WHERE id = $1`, [qid])).rows[0];
    expect(sigs[0]).toMatchObject({
      signer_id: users.approver.id,
      signature_meaning: 'approval',
      binding_basis: 'agency-response-content-sha256',
      bound_payload_digest: agencyResponseDigest({
        communicationEventId: row.communication_event_id,
        questionRef: row.question_ref,
        questionText: row.question_text,
        responseText: row.response_text,
      }),
    });

    const view = await read(letter, 'approver');
    expect(view.body.data.questions[0]).toMatchObject({
      state: 'approved',
      approval: { signatureId: sigs[0].id, signerName: 'Agency Approver', meaning: 'approval' },
    });
    expect(view.body.data.packageReady).toBe(true);
  });

  it('refuses a second approval of the same text', async () => {
    const res = await approve(letter, qid, 'approver', 1);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('ALREADY_APPROVED');
    expect(await signaturesOn(qid)).toHaveLength(1);
  });
});

describe('the package and the close follow the signatures, not a flag', () => {
  let letter: string;
  let q1: number;
  let q2: number;

  beforeAll(async () => {
    letter = await logLetter();
    q1 = Number((await addQuestion(letter, 'Q1', 'Justify the proposed specification for impurity B.')).body.data.id);
    q2 = Number((await addQuestion(letter, 'Q2', 'Provide 12-month stability data for the registration batches.')).body.data.id);
    expect((await saveResponse(letter, q1, 'author', 'Impurity B is qualified at 0.3% by the 13-week toxicology study.', 0)).status).toBe(200);
    expect((await saveResponse(letter, q2, 'author', '12-month data are provided in 3.2.P.8.3.', 0)).status).toBe(200);
    expect((await approve(letter, q1, 'approver', 1)).status).toBe(201);
  });

  it('refuses the package while one response is unsigned, naming it', async () => {
    const res = await request(app).post(`${base()}/${letter}/response-package`).set(as('author')).send({ format: 'md' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error?.code ?? res.body.code).toBe('RESPONSES_NOT_APPROVED');
    expect(JSON.stringify(res.body)).toContain('Q2 (not approved)');
  });

  it('refuses to close the letter while a response is unsigned', async () => {
    expect((await request(app).patch(`${base()}/${letter}/advance`).set(as('author'))).status).toBe(200); // triage
    const close = await request(app).patch(`${base()}/${letter}/advance`).set(as('author'));
    expect(close.status, JSON.stringify(close.body)).toBe(409);
    expect(JSON.stringify(close.body)).toContain('Q2 (not approved)');
    const st = await owner.query(`SELECT closure_status FROM concept2cure_agency_communications WHERE event_id = $1`, [letter]);
    expect(st.rows[0].closure_status).toBe('in_progress');
  });

  it('records a commitment made in a response, naming the project, letter and question', async () => {
    const res = await request(app)
      .post(`${base()}/${letter}/questions/${q2}/commitments`)
      .set(as('author'))
      .send({ commitmentType: 'pmc', description: 'Submit 24-month stability data', dueDate: '2027-06-30', regulatoryBasis: '21 CFR 314.81(b)(2)(vii)', reason: 'Commitment made in the Q2 response.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = (await owner.query(`SELECT project_id, source_communication_event_id, source_question_id, status FROM regulatory_commitments WHERE id = $1`, [res.body.data.id])).rows[0];
    expect(row).toEqual({ project_id: projectId, source_communication_event_id: letter, source_question_id: q2, status: 'open' });
    const view = await read(letter);
    const q = view.body.data.questions.find((x: { id: number }) => x.id === q2);
    expect(q.commitments).toEqual([expect.objectContaining({ commitmentType: 'pmc', description: 'Submit 24-month stability data' })]);
  });

  it('once every response is signed: the package assembles, recorded with the bytes delivered', async () => {
    expect((await approve(letter, q2, 'approver', 1)).status).toBe(201);
    const res = await request(app).post(`${base()}/${letter}/response-package`).set(as('author')).send({ format: 'md' });
    expect(res.status, res.text).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    const sha = res.headers['x-export-sha256'];
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const body = res.text;
    expect(body.indexOf('## Q1')).toBeLessThan(body.indexOf('## Q2'));
    expect(body).toContain('_Approved by Agency Approver on ');
    expect(body).toContain('- Postmarketing commitment: Submit 24-month stability data; due 2027-06-30');
    const audit = await owner.query(
      `SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND action = 'EXPORT_GENERATED' AND new_values::text LIKE $2`,
      [orgId, `%${sha}%`],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('editing after approval voids it: the package and the close are refused again', async () => {
    const edited = await saveResponse(letter, q1, 'author', 'Impurity B is qualified at 0.3% (13-week study, report TX-114).', 1);
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body.data.state).toBe('changed-after-approval');
    expect(await signaturesOn(q1), 'the earlier signature stands').toHaveLength(1);

    const pkg = await request(app).post(`${base()}/${letter}/response-package`).set(as('author')).send({ format: 'md' });
    expect(pkg.status).toBe(409);
    expect(JSON.stringify(pkg.body)).toContain('Q1 (changed after approval)');
    const close = await request(app).patch(`${base()}/${letter}/advance`).set(as('author'));
    expect(close.status).toBe(409);
  });

  it('a new signature over the edited text approves it, and the letter closes', async () => {
    expect((await approve(letter, q1, 'approver', 2)).status).toBe(201);
    const close = await request(app).patch(`${base()}/${letter}/advance`).set(as('author'));
    expect(close.status, JSON.stringify(close.body)).toBe(200);
    expect(close.body.data.closureStatus).toBe('closed');
  });

  it('a closed letter takes no new question and no edited response', async () => {
    const add = await addQuestion(letter, 'Q3', 'Late question.');
    expect(add.status).toBe(409);
    expect(add.body.error?.code ?? add.body.code).toBe('LETTER_CLOSED');
    const edit = await saveResponse(letter, q2, 'author', 'Changed after close.', 1);
    expect(edit.status).toBe(409);
  });
});

describe('the commitments register (Communication, Commitments tab)', () => {
  let commitmentId: number;

  beforeAll(async () => {
    const letter = await logLetter();
    const qid = Number((await addQuestion(letter, 'Q1', 'Commit to a pediatric study plan.')).body.data.id);
    const res = await request(app)
      .post(`${base()}/${letter}/questions/${qid}/commitments`)
      .set(as('author'))
      .send({ commitmentType: 'pmr', description: 'Pediatric study under PREA', dueDate: '2028-03-31', reason: 'Commitment made in the Q1 response.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    commitmentId = Number(res.body.data.id);
  });

  it('lists the commitment with the letter and question it was made in', async () => {
    const res = await request(app).get('/api/ha-interactions/commitments').set(as('viewer'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = res.body.commitments.find((c: { id: number }) => c.id === commitmentId);
    expect(row).toMatchObject({ commitment_type: 'pmr', project_id: projectId, source_question_id: expect.any(Number), effectiveStatus: 'open' });
  });

  it('a viewer cannot fulfil it', async () => {
    const res = await request(app)
      .post(`/api/ha-interactions/commitments/${commitmentId}/fulfill`)
      .set(as('viewer'))
      .send({ reason: 'A viewer should not be able to do this.' });
    expect(res.status).toBe(403);
    const st = await owner.query('SELECT status FROM regulatory_commitments WHERE id = $1', [commitmentId]);
    expect(st.rows[0].status).toBe('open');
  });

  it('refuses a fulfilment dated in the future', async () => {
    const res = await request(app)
      .post(`/api/ha-interactions/commitments/${commitmentId}/fulfill`)
      .set(as('author'))
      .send({ fulfilledDate: '2999-01-01', reason: 'Recording the fulfilment date.' });
    expect(res.status).toBe(400);
    const st = await owner.query('SELECT status FROM regulatory_commitments WHERE id = $1', [commitmentId]);
    expect(st.rows[0].status).toBe('open');
  });

  it('an editor fulfils it under RLS, with its ledger row', async () => {
    const res = await request(app)
      .post(`/api/ha-interactions/commitments/${commitmentId}/fulfill`)
      .set(as('author'))
      .send({ fulfilledDate: '2026-10-01', reason: 'Final study report submitted in sequence 0042.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const st = await owner.query(`SELECT status, to_char(fulfilled_date, 'YYYY-MM-DD') AS d FROM regulatory_commitments WHERE id = $1`, [commitmentId]);
    expect(st.rows[0]).toEqual({ status: 'fulfilled', d: '2026-10-01' });
    const ledger = await owner.query(`SELECT command FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 ORDER BY proposed_at`, [orgId, `regulatory-commitment:${commitmentId}`]);
    expect(ledger.rows.map((r) => r.command)).toEqual(['create', 'resolve']);
  });
});

describe('tenant isolation', () => {
  it("another organization's member cannot reach this project's questions", async () => {
    const letter = await logLetter();
    expect((await addQuestion(letter, 'Q1', 'Isolation probe.')).status).toBe(201);
    const res = await request(app).get(`/api/concept2cure/projects/${projectId}/agency-communications/${letter}/questions`).set(as('foreign'));
    expect([403, 404]).toContain(res.status);
    const own = await request(app).get(`/api/concept2cure/projects/${foreignProjectId}/agency-communications/${letter}/questions`).set(as('foreign'));
    expect(own.status).toBe(404);
  });

  it('under RLS, the runtime role in another tenant scope reads none of these rows', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const seen = await runWithTenantScope(
      { tenantId: String(foreignOrgId), role: 'admin', source: 'request', caller: 'agency-response-signed-approval.dbtest' },
      () => getPool().query(`SELECT count(*)::int AS n FROM agency_communication_questions WHERE organization_id = $1`, [orgId]),
    );
    expect(seen.rows[0].n).toBe(0);
    const mine = await owner.query(`SELECT count(*)::int AS n FROM agency_communication_questions WHERE organization_id = $1`, [orgId]);
    expect(mine.rows[0].n).toBeGreaterThan(0);
  });
});
