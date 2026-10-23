/**
 * CMC / Module 3's agency questions converge onto the letter's record
 * (2026-10-19, rows D2 and D5; decisions P-38 and P-39 item 1).
 *
 * ── The gap this pins (trunk at 99acc88d) ────────────────────────────────────
 * CMC kept its own agency-question file, reg_questions, behind
 * /api/cmc/agency-questions: a question was logged, assigned, sent for review
 * and CLOSED there by status update, with no signature, no reason and no
 * ledger row, and its own overdue rule fed CMC's Overview. The same questions
 * have a home on the letter they came in (agency_communication_questions,
 * worked in Communication and Respond), where a response is approved by a
 * Part 11 signature. Two homes, two overdue rules, and the runtime role held
 * INSERT, UPDATE and DELETE on the second.
 *
 * ── What is real ─────────────────────────────────────────────────────────────
 * The Communication Center router with its own chain (auth with a signed
 * access token, tenant context, project admission), the CMC router behind
 * authenticateToken and the CMC write-role gate as production mounts it, the
 * runtime role through APP_DATABASE_URL with RLS enforcing, the signing
 * ceremony (bcrypt), the ledger pair, and the migrations as deploy-migrate
 * applied them. Only the per-signer attempt limiter is a pass-through.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Each run creates its own organizations, users and project (`dbcmq-<uuid>`).
 * The earlier-file rows it seeds are deleted at the end the way they were
 * written: as the owner, with triggers out of the way for that one
 * transaction (the file refuses DELETE to every role, 20261019b). Signatures
 * and ledger rows are permanent by design and are left in place.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const PASSWORD = 'Dbcmq-Cmc-Questions-2026!';
const PREFIX = `dbcmq-${randomUUID()}`;
const INSUFFICIENT_PRIVILEGE = '42501';

let owner: Pool;
let appPool: Pool;
let app: express.Express;
let orgId: number;
let foreignOrgId: number;
let projectId: number;
const users: Record<'author' | 'approver' | 'viewer' | 'foreign', { id: number; token: string }> = {} as never;
const legacyIds: number[] = [];

async function mintToken(userId: number, org: number): Promise<string> {
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return jwt.sign({ type: 'access', userId, organizationId: String(org) }, activeJwtSecret(), { expiresIn: '10m' });
}

async function user(key: keyof typeof users, org: number, role: string): Promise<void> {
  const { rows } = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [`${PREFIX}-${key}@example.invalid`, `Cmc ${key}`, await bcrypt.hash(PASSWORD, 4)],
  );
  const id = Number(rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
    [org, id, role],
  );
  users[key] = { id, token: await mintToken(id, org) };
}

async function organization(label: string): Promise<number> {
  const { rows } = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id`, [`${PREFIX}-${label}`]);
  return Number(rows[0].id);
}

async function project(org: number, actor: number, label: string): Promise<number> {
  const ws = await owner.query(`INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`, [org, `${PREFIX}-${label}-ws`]);
  const p = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, settings)
     VALUES ($1, $2, $3, 'regulatory', 'active', $4, $4, '{}'::jsonb) RETURNING id`,
    [org, Number(ws.rows[0].id), `${PREFIX}-${label}-project`, actor],
  );
  return Number(p.rows[0].id);
}

const as = (who: keyof typeof users) => ({ Authorization: `Bearer ${users[who].token}` });
const letters = () => `/api/concept2cure/projects/${projectId}/agency-communications`;
const module3 = (who: keyof typeof users = 'author', pid = projectId) =>
  request(app).get(`/api/concept2cure/projects/${pid}/agency-questions?ctdModule=3`).set(as(who));

async function logLetter(over: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post(letters())
    .set(as('author'))
    .send({
      sourceType: 'uploaded_official_correspondence',
      communicationType: 'Information request',
      sourceChannel: 'esg',
      urgency: 'high',
      responseRequired: true,
      dueDate: '2026-01-15T00:00:00.000Z',
      visibilityTier: 'client_internal',
      ...over,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return String(res.body.data.id);
}

function addQuestion(letter: string, ref: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`${letters()}/${letter}/questions`)
    .set(as('author'))
    .send({ questionRef: ref, questionText: `Question ${ref} as the agency worded it.`, severity: 'major', reason: 'Recording the question as the agency asked it.', ...extra });
}

async function answerAndApprove(letter: string, qid: number): Promise<void> {
  const saved = await request(app)
    .put(`${letters()}/${letter}/questions/${qid}/response`)
    .set(as('author'))
    .send({ responseText: 'The method validation report is provided in 3.2.P.5.3.', expectedRevision: 0, reason: 'Drafting the response for review.' });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const signed = await request(app)
    .post(`${letters()}/${letter}/questions/${qid}/approve`)
    .set(as('approver'))
    .send({ reason: 'I reviewed this response against the source data.', meaning: 'approval', password: PASSWORD, expectedRevision: 1 });
  expect(signed.status, JSON.stringify(signed.body)).toBe(201);
}

type Attempt = { ok: true; rowCount: number } | { ok: false; code: string; message: string };

/** One statement in a savepoint, so a refusal leaves the transaction usable. */
async function attempt(c: PoolClient, sql: string, params: unknown[] = []): Promise<Attempt> {
  await c.query('SAVEPOINT cmq');
  try {
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT cmq');
    return { ok: true, rowCount: r.rowCount ?? 0 };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT cmq');
    const err = e as { code?: string; message?: string };
    return { ok: false, code: String(err.code ?? ''), message: String(err.message ?? e) };
  }
}

/** `fn` on `pool`, in this run's tenant with RLS on, in a transaction that is always rolled back. */
async function inTenant<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL lock_timeout = '10s'`);
    await c.query(`SELECT set_config('app.rls_enforce', 'on', true), set_config('app.current_tenant_id', $1, true)`, [String(orgId)]);
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release();
  }
}

/**
 * Rows of the earlier file, as they stood before it became read-only. The
 * file now refuses every INSERT, so the fixture is written the way a restore
 * would: as the owner, with triggers out of the way for this one transaction.
 */
async function seedEarlierFile(): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL session_replication_role = replica');
    const rows: Array<[number, string, string | null, string | null, string | null]> = [
      [orgId, 'Provide the ICH Q1E extrapolation analysis.', '3.2.P.8.1', 'OPEN', '2026-01-01'],
      [orgId, 'Justify the clinical endpoint.', '2.7.1', 'CLOSED', null],
      [orgId, 'Confirm the reference standard lot.', '3.2.S.5', 'closed', null],
      [orgId, 'Clarify the container closure.', null, null, '2026-02-01'],
      [foreignOrgId, 'Another organisation\'s question.', '3.2.P.1', 'OPEN', null],
    ];
    for (const [org, text, section, status, due] of rows) {
      const r = await c.query(
        `INSERT INTO reg_questions (organization_id, question_text, section_reference, status, due_date)
         VALUES ($1, $2, $3, $4, $5::date) RETURNING id`,
        [org, text, section, status, due],
      );
      legacyIds.push(Number(r.rows[0].id));
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('[dbcmq] APP_DATABASE_URL is required: owner execution proves nothing about RLS.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  appPool = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 2 });

  orgId = await organization('own');
  await user('author', orgId, 'admin');
  await user('approver', orgId, 'admin');
  await user('viewer', orgId, 'viewer');
  projectId = await project(orgId, users.author.id, 'own');
  foreignOrgId = await organization('foreign');
  await user('foreign', foreignOrgId, 'admin');
  await seedEarlierFile();

  app = express();
  app.use(express.json());
  app.use('/api/concept2cure', (await import('../../server/routes/c2c/communication-center')).default);
  // As production mounts it (server/bootstrap/register-core-routes.ts).
  const { authenticateToken } = await import('../../server/middleware/auth');
  const { cmcWriteRoleGate } = await import('../../server/api/cmc/cmc-write-role-gate');
  app.use('/api/cmc', authenticateToken, cmcWriteRoleGate);
  app.use('/api/cmc/agency-questions', (await import('../../server/routes/cmc-agency-questions.routes')).default());
}, 120_000);

afterAll(async () => {
  // The file refuses DELETE for every role (20261019b): the fixture is removed
  // the way it was written, as the owner with triggers out of the way.
  if (legacyIds.length && owner) {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL session_replication_role = replica');
      await c.query('DELETE FROM reg_questions WHERE id = ANY($1::int[])', [legacyIds]);
      await c.query('COMMIT');
    } catch {
      await c.query('ROLLBACK').catch(() => {});
    } finally {
      c.release();
    }
  }
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await appPool?.end().catch(() => undefined);
  await owner?.end();
});

describe('the setting', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('cmc-agency-questions-converged.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });
});

describe('a question is classified by CTD section on the letter, through the governed write', () => {
  it('records a question with its section in the repository\'s one spelling, with the section in its ledger row', async () => {
    const letter = await logLetter();
    const res = await addQuestion(letter, 'Q1', { ctdSection: 'm3.2.p.7', discipline: 'CMC' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const qid = Number(res.body.data.id);
    const stored = await owner.query(`SELECT ctd_section FROM agency_communication_questions WHERE id = $1`, [qid]);
    expect(stored.rows[0].ctd_section).toBe('3.2.P.7');
    const ledger = await owner.query(
      `SELECT command, decision_reason AS reason FROM c2c_ana_actions WHERE org_id = $1 AND target = $2`,
      [orgId, `agency-question:${qid}`],
    );
    expect(ledger.rows).toEqual([{ command: 'create', reason: 'Recording the question as the agency asked it.' }]);
    const view = await request(app).get(`${letters()}/${letter}/questions`).set(as('author'));
    expect(view.body.data.questions[0].ctdSection).toBe('3.2.P.7');
  });

  it('refuses a section that is not a CTD code, and records nothing', async () => {
    const letter = await logLetter();
    const res = await addQuestion(letter, 'Q1', { ctdSection: '3.2.S.4.1 (impurities)' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_SECTION');
    const n = await owner.query(`SELECT count(*)::int AS n FROM agency_communication_questions WHERE communication_event_id = $1`, [letter]);
    expect(n.rows[0].n).toBe(0);
  });

  it('corrects a section with a reason, records from and to, and refuses what it should', async () => {
    const letter = await logLetter();
    const qid = Number((await addQuestion(letter, 'Q1', { ctdSection: '3.2.P.7' })).body.data.id);
    const patch = (who: keyof typeof users, body: Record<string, unknown>, qId = qid, ev = letter) =>
      request(app).patch(`${letters()}/${ev}/questions/${qId}`).set(as(who)).send(body);
    const reason = 'The agency cites the impurity specification, not the container closure.';

    const ok = await patch('author', { ctdSection: '3.2.S.4.1', reason });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.ctdSection).toBe('3.2.S.4.1');
    const ledger = await owner.query(
      `SELECT command, decision_reason AS reason, payload FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 ORDER BY proposed_at`,
      [orgId, `agency-question:${qid}`],
    );
    expect(ledger.rows.map((r) => [r.command, r.reason])).toEqual([
      ['create', 'Recording the question as the agency asked it.'],
      ['update', reason],
    ]);
    const payload = typeof ledger.rows[1].payload === 'string' ? JSON.parse(ledger.rows[1].payload) : ledger.rows[1].payload;
    expect(payload).toMatchObject({ communicationEventId: letter, questionRef: 'Q1', ctdSection: { from: '3.2.P.7', to: '3.2.S.4.1' } });

    expect((await patch('author', { ctdSection: '3.2.S.4.1', reason })).body.error?.code).toBe('NO_CHANGE');
    expect((await patch('author', { ctdSection: 'impurities', reason })).status).toBe(400);
    expect((await patch('author', { ctdSection: '3.2.S.4' })).status).toBe(400);
    expect((await patch('viewer', { ctdSection: '3.2.S.4', reason })).status).toBe(403);

    // The approval digest does not cover the section: classification is not what was signed.
    await answerAndApprove(letter, qid);
    const reclassed = await patch('author', { ctdSection: '3.2.S.4', reason });
    expect(reclassed.status, JSON.stringify(reclassed.body)).toBe(200);
    expect(reclassed.body.data.state).toBe('approved');

    await owner.query(`UPDATE concept2cure_agency_communications SET closure_status = 'closed' WHERE event_id = $1`, [letter]);
    expect((await patch('author', { ctdSection: '3.2.S.4.1', reason })).body.error?.code).toBe('LETTER_CLOSED');
  });
});

/* Review of 2026-10-19: CMC's free-text "assigned to" went read-only with its
   file, and the letter's record had an owner column with no way to set it.
   The owner is set on the letter, with a reason, and must be someone who may
   open the letter at its visibility. */
describe('who owns a question\'s response is set on the letter, through the governed write', () => {
  it('sets, refuses and clears an owner with a reason, records from and to, and Module 3 shows it', async () => {
    const letter = await logLetter({ visibilityTier: 'restricted_legal_sensitive', communicationType: 'IR 7 (legal)' });
    const qid = Number((await addQuestion(letter, 'Q1', { ctdSection: '3.2.P.5.1', discipline: 'CMC' })).body.data.id);
    const assign = (who: keyof typeof users, body: Record<string, unknown>) =>
      request(app).patch(`${letters()}/${letter}/questions/${qid}/owner`).set(as(who)).send(body);
    const reason = 'The approver leads the dissolution work.';

    const set = await assign('author', { ownerUserId: users.approver.id, reason });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.data).toMatchObject({ ownerUserId: users.approver.id, ownerName: 'Cmc approver' });
    const stored = await owner.query(`SELECT owner_user_id FROM agency_communication_questions WHERE id = $1`, [qid]);
    expect(Number(stored.rows[0].owner_user_id)).toBe(users.approver.id);
    const ledger = await owner.query(
      `SELECT command, decision_reason AS reason, payload FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 ORDER BY proposed_at`,
      [orgId, `agency-question:${qid}`],
    );
    expect(ledger.rows.map((r) => [r.command, r.reason])).toEqual([
      ['create', 'Recording the question as the agency asked it.'],
      ['update', reason],
    ]);
    const payload = typeof ledger.rows[1].payload === 'string' ? JSON.parse(ledger.rows[1].payload) : ledger.rows[1].payload;
    expect(payload).toMatchObject({ communicationEventId: letter, questionRef: 'Q1', ownerUserId: { from: null, to: users.approver.id } });

    // Someone who cannot open this letter at its visibility cannot own its response.
    const blind = await assign('author', { ownerUserId: users.viewer.id, reason });
    expect(blind.status).toBe(400);
    expect(blind.body.error.code).toBe('OWNER_CANNOT_SEE_LETTER');
    // Nor can someone outside the organisation.
    const outsider = await assign('author', { ownerUserId: users.foreign.id, reason });
    expect(outsider.status).toBe(400);
    expect(outsider.body.error.code).toBe('OWNER_NOT_MEMBER');
    expect((await assign('author', { ownerUserId: users.approver.id, reason })).body.error?.code).toBe('NO_CHANGE');
    expect((await assign('author', { ownerUserId: users.approver.id })).status).toBe(400);
    const after = await owner.query(`SELECT owner_user_id FROM agency_communication_questions WHERE id = $1`, [qid]);
    expect(Number(after.rows[0].owner_user_id)).toBe(users.approver.id);

    // Module 3's view carries it, read from the letter.
    const view = await module3();
    const listed = view.body.data.questions.find((q: { id: number }) => q.id === qid);
    expect(listed.owner).toEqual({ userId: users.approver.id, name: 'Cmc approver' });

    const cleared = await assign('author', { ownerUserId: null, reason: 'The work moved to the CMC lead; owner to be named.' });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect(cleared.body.data.ownerUserId).toBeNull();

    await owner.query(`UPDATE concept2cure_agency_communications SET closure_status = 'closed' WHERE event_id = $1`, [letter]);
    expect((await assign('author', { ownerUserId: users.approver.id, reason })).body.error?.code).toBe('LETTER_CLOSED');
  });

  it('a person who may not change the project is refused', async () => {
    const letter = await logLetter();
    const qid = Number((await addQuestion(letter, 'Q1', { ctdSection: '3.2.P.5.1' })).body.data.id);
    const res = await request(app)
      .patch(`${letters()}/${letter}/questions/${qid}/owner`)
      .set(as('viewer'))
      .send({ ownerUserId: users.author.id, reason: 'Taking the response on myself.' });
    expect(res.status).toBe(403);
  });
});

describe('Module 3\'s view of the program (GET …/projects/:projectId/agency-questions)', () => {
  it('lists the Module 3 questions with the server\'s state and overdue, and an approved answer is never overdue', async () => {
    const letter = await logLetter({ communicationType: 'IR 4 (overdue)' });
    const q1 = Number((await addQuestion(letter, 'Q1', { ctdSection: '3.2.P.7' })).body.data.id);
    const q2 = Number((await addQuestion(letter, 'Q2', { ctdSection: '3.2.S.4.1' })).body.data.id);
    const q3 = Number((await addQuestion(letter, 'Q3', { ctdSection: '5.3.5.1', discipline: 'Clinical' })).body.data.id);
    await answerAndApprove(letter, q1);

    const res = await module3();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mine = res.body.data.questions.filter((q: { letter: { id: string } }) => q.letter.id === letter);
    expect(mine.map((q: { id: number; state: string; overdue: boolean; section: string; sectionSource: string }) => [q.id, q.state, q.overdue, q.section, q.sectionSource]))
      .toEqual([[q2, 'unanswered', true, '3.2.S.4.1', 'question'], [q1, 'approved', false, '3.2.P.7', 'question']]);
    expect(mine.some((q: { id: number }) => q.id === q3)).toBe(false);
    expect(mine[0].letter).toMatchObject({ id: letter, overdue: true, responseRequired: true });

    // The letter the link opens shows the same verdict.
    const onLetter = await request(app).get(`${letters()}/${letter}/questions`).set(as('author'));
    expect(onLetter.body.data.letter.overdue).toBe(true);
  });

  it('counts from every row it read, and keeps the earlier CMC file out of the count', async () => {
    const res = await module3();
    const d = res.body.data;
    const listed = d.questions as Array<{ state: string; overdue: boolean; letter: { closureStatus: string } }>;
    expect(d.summary.questionsOverdue).toBe(listed.filter((q) => q.overdue).length);
    expect(d.summary.outstanding).toBe(listed.filter((q) => ['unanswered', 'drafted', 'changed-after-approval'].includes(q.state) && q.letter.closureStatus !== 'closed').length);
    expect(d.truncated).toBe(false);
    expect(JSON.stringify(d)).not.toMatch(/ICH Q1E extrapolation analysis/);
  });

  it('a Module 3 question on a letter the person may not see is neither listed nor counted; the letter is counted as withheld', async () => {
    const before = (await module3('viewer')).body.data;
    const restricted = await logLetter({ communicationType: 'Restricted IR', visibilityTier: 'restricted_legal_sensitive' });
    expect((await addQuestion(restricted, 'L1', { ctdSection: '3.2.P.5' })).status).toBe(201);

    const asViewer = (await module3('viewer')).body.data;
    expect(asViewer.questions.some((q: { letter: { id: string } }) => q.letter.id === restricted)).toBe(false);
    expect(asViewer.withheld).toBe(before.withheld + 1);
    expect(asViewer.summary).toEqual(before.summary);
    expect(JSON.stringify(asViewer)).not.toMatch(/Restricted IR|L1 as the agency/);

    const asAdmin = (await module3('author')).body.data;
    expect(asAdmin.questions.some((q: { letter: { id: string } }) => q.letter.id === restricted)).toBe(true);
    expect(asAdmin.withheld).toBe(0);
  });

  it('refuses a module that is not one of the five', async () => {
    const res = await request(app).get(`/api/concept2cure/projects/${projectId}/agency-questions?ctdModule=6`).set(as('author'));
    expect(res.status).toBe(400);
  });

  it('another organisation\'s member is refused by project admission; the runtime role in their scope reads none of these rows', async () => {
    const res = await module3('foreign');
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/as the agency worded it/);
    const { getPool } = await import('../../server/db/runtime');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const seen = await runWithTenantScope(
      { tenantId: String(foreignOrgId), role: 'admin', source: 'request', caller: 'cmc-agency-questions-converged.dbtest' },
      () => getPool().query(
        `SELECT (SELECT count(*)::int FROM agency_communication_questions WHERE organization_id = $1) AS q,
                (SELECT count(*)::int FROM reg_questions WHERE organization_id = $1) AS r`,
        [orgId],
      ),
    );
    expect(seen.rows[0]).toEqual({ q: 0, r: 0 });
  });
});

describe('the earlier CMC question file is read-only, in the route and in the database', () => {
  it('GET lists the organisation\'s rows as they are stored, with counts from the store', async () => {
    const res = await request(app).get('/api/cmc/agency-questions').set(as('author'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 4, notClosed: 2, truncated: false });
    expect(res.body.data.map((r: { status: string | null }) => r.status).sort()).toEqual(['CLOSED', 'OPEN', 'closed', null].sort());
    expect(JSON.stringify(res.body)).not.toMatch(/Another organisation/);
    const open = res.body.data.find((r: { status: string }) => r.status === 'OPEN');
    expect(open).toMatchObject({ sectionRef: '3.2.P.8.1', dueDate: '2026-01-01' });
    expect(open.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('POST and PATCH answer 410 and change nothing', async () => {
    const before = await owner.query(`SELECT id, status, assigned_to, updated_at FROM reg_questions WHERE organization_id = $1 ORDER BY id`, [orgId]);
    const post = await request(app).post('/api/cmc/agency-questions').set(as('author')).send({ questionText: 'A new question.' });
    expect(post.status).toBe(410);
    const patch = await request(app).patch(`/api/cmc/agency-questions/${legacyIds[0]}`).set(as('author')).send({ status: 'CLOSED' });
    expect(patch.status).toBe(410);
    const after = await owner.query(`SELECT id, status, assigned_to, updated_at FROM reg_questions WHERE organization_id = $1 ORDER BY id`, [orgId]);
    expect(after.rows).toEqual(before.rows);
  });

  it('the runtime role is refused INSERT, UPDATE, DELETE and TRUNCATE by the privilege, before any trigger, even WHERE false', async () => {
    const outcomes = await inTenant(appPool, async (c) => ({
      insert: await attempt(c, `INSERT INTO reg_questions (organization_id, question_text, status) VALUES ($1, 'Probe.', 'OPEN')`, [orgId]),
      update: await attempt(c, `UPDATE reg_questions SET status = status WHERE false`),
      delete: await attempt(c, `DELETE FROM reg_questions WHERE false`),
      truncate: await attempt(c, `TRUNCATE reg_questions`),
      read: await attempt(c, `SELECT 1 FROM reg_questions WHERE organization_id = $1`, [orgId]),
    }));
    // All four at once, so a failure shows each statement's fate.
    const fate = Object.fromEntries(Object.entries(outcomes).map(([k, a]) => [k, a.ok ? `ran (${a.rowCount} row(s))` : a.code]));
    expect(fate).toEqual({
      insert: INSUFFICIENT_PRIVILEGE,
      update: INSUFFICIENT_PRIVILEGE,
      delete: INSUFFICIENT_PRIVILEGE,
      truncate: INSUFFICIENT_PRIVILEGE,
      read: 'ran (4 row(s))',
    });
  });

  /* Review of 2026-10-19: URS-CMC-030 says the file refuses every write; the
     guard first left DELETE to the owner, and an owner DELETE ran. */
  it('the owner too is refused an INSERT, an UPDATE, a DELETE and a TRUNCATE by the guard', async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      const ins = await attempt(c, `INSERT INTO reg_questions (organization_id, question_text, status) VALUES ($1, 'Owner probe.', 'OPEN')`, [orgId]);
      const upd = await attempt(c, `UPDATE reg_questions SET status = 'CLOSED' WHERE id = $1`, [legacyIds[0]]);
      const del = await attempt(c, `DELETE FROM reg_questions WHERE id = $1`, [legacyIds[1]]);
      // A plain TRUNCATE stops at the foreign keys of reg_responses and
      // reg_messages (0A000) before any trigger; CASCADE is the one that
      // would empty the file, and it is the guard that refuses it.
      const trunc = await attempt(c, `TRUNCATE reg_questions CASCADE`);
      expect(ins).toMatchObject({ ok: false, code: 'P0001' });
      expect((ins as { message: string }).message).toMatch(/read-only/);
      expect(upd).toMatchObject({ ok: false, code: 'P0001' });
      expect(del).toMatchObject({ ok: false, code: 'P0001' });
      expect(trunc).toMatchObject({ ok: false, code: 'P0001' });
      const left = await c.query('SELECT count(*)::int AS n FROM reg_questions WHERE id = ANY($1::int[])', [legacyIds]);
      expect(left.rows[0].n).toBe(legacyIds.length);
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });
});
