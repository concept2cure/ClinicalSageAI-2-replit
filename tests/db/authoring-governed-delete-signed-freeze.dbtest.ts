/**
 * DP-33 and DP-35 against real PostgreSQL with RLS on (plan P1-30, P1-32).
 *
 * The unit suite (server/routes/__tests__/authoring-governed-delete-signed-freeze.test.ts)
 * pins the handlers' SQL and order on a mocked pool. This file proves what only
 * the database can: that the DELETE the handler issues reaches only the
 * caller's organisation under the app role's row-level security, that the
 * chained audit row it writes on the same transaction lands in audit_logs with
 * the actor, that the append-only revision ledger is answered as a 409 rather
 * than a 500, and that a freeze without the ceremony seals nothing.
 *
 * The authoring object gate that fronts the router in production is NOT
 * mounted here on purpose: DP-33 was that the handler itself proved nothing.
 *
 * Fixture rows live under two dbtest-p130 organisations; every title carries a
 * per-run prefix. Documents with revisions cannot be removed (the ledger is
 * append-only, for the owner too), so teardown retires them by title, as
 * authoring-stability-table.dbtest.ts does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { databaseUrl } from '../setup.db';

const TAG = `dbtest-p130 ${process.pid}-${Date.now().toString(36)}`;
const PASSWORD = 'dbtest-p130-signer-password';
const REASON = 'dbtest-p130: removing an empty document created by mistake.';

let owner: Pool;
let orgA: number;
let orgB: number;
const users: Record<'admin' | 'member' | 'outsider', number> = { admin: 0, member: 0, outsider: 0 };
let programA = '';
let programB = '';

async function upsertUser(email: string): Promise<number> {
  const r = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, `${email} actor`, bcrypt.hashSync(PASSWORD, 4)],
  );
  return Number(r.rows[0].id);
}

async function upsertOrg(slug: string): Promise<number> {
  const r = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [slug, slug],
  );
  return Number(r.rows[0].id);
}

async function upsertProgram(orgId: number, code: string): Promise<string> {
  const r = await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'C2C-101')
     ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL
     RETURNING id`,
    [orgId, `${code} program`, code],
  );
  return String(r.rows[0].id);
}

async function bearer(userId: number, orgId: number, role: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET_DEV || process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: String(userId), id: String(userId), sub: String(userId), email,
    organizationId: String(orgId), role, roles: [role], type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret);
  return `Bearer ${token}`;
}

/** The router behind the identity the real auth middleware would publish; the router re-verifies the token itself. */
async function appFor(userId: number, orgId: number, role: string, email: string): Promise<express.Express> {
  const router = (await import('../../server/routes/authoring.router')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = role;
    r.user = { id: userId, organizationId: orgId, role, email };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/authoring', router);
  return a;
}

type Actor = { app: express.Express; auth: string };
const actors = {} as Record<'admin' | 'member' | 'outsider', Actor>;

async function createDoc(actor: Actor, programId: string, suffix: string): Promise<string> {
  const res = await request(actor.app)
    .post('/api/authoring/docs')
    .set('Authorization', actor.auth)
    .send({ title: `${TAG} ${suffix}`, module: 'M2', client_program_id: programId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body?.document?.id ?? res.body?.id);
}

async function docRow(id: string): Promise<{ status: string } | undefined> {
  return (await owner.query('SELECT status FROM authoring_documents WHERE id = $1', [id])).rows[0];
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  orgA = await upsertOrg('dbtest-p130-org-a');
  orgB = await upsertOrg('dbtest-p130-org-b');
  users.admin = await upsertUser('dbtest-p130-admin@c2c.test');
  users.member = await upsertUser('dbtest-p130-member@c2c.test');
  users.outsider = await upsertUser('dbtest-p130-outsider@c2c.test');
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member'), ($4, $5, 'admin')
     ON CONFLICT DO NOTHING`,
    [orgA, users.admin, users.member, orgB, users.outsider],
  );
  programA = await upsertProgram(orgA, 'DBTEST-P130-A');
  programB = await upsertProgram(orgB, 'DBTEST-P130-B');
  const make = async (k: 'admin' | 'member' | 'outsider', org: number, role: string) => {
    const email = `dbtest-p130-${k}@c2c.test`;
    actors[k] = { app: await appFor(users[k], org, role, email), auth: await bearer(users[k], org, role, email) };
  };
  await make('admin', orgA, 'admin');
  await make('member', orgA, 'member');
  await make('outsider', orgB, 'admin');
}, 60_000);

afterAll(async () => {
  /* This run's documents that carry no revision history and no signature are
     removed; the rest are kept by the append-only ledgers (doc_revisions,
     authoring_signatures, audit_logs — for the owner too) and are retired by
     title, as authoring-stability-table.dbtest.ts does. */
  await owner
    ?.query(
      `DELETE FROM authoring_documents d
        WHERE d.title LIKE $1
          AND NOT EXISTS (SELECT 1 FROM authoring_sections s WHERE s.doc_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM authoring_signatures g WHERE g.doc_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM frozen_documents f WHERE f.document_id = d.id)`,
      [`${TAG}%`],
    )
    .catch(() => undefined);
  await owner
    ?.query(`UPDATE authoring_documents SET title = title || ' (retired)' WHERE title LIKE $1`, [`${TAG}%`])
    .catch(() => undefined);
  await owner?.end().catch(() => undefined);
});

describe('DP-33 — the governed delete, on the real database', () => {
  it('an organisation member (not owner/admin/manager) is refused and the document stays', async () => {
    const id = await createDoc(actors.admin, programA, 'member-refused');
    const res = await request(actors.member.app)
      .delete(`/api/authoring/docs/${id}`)
      .set('Authorization', actors.member.auth)
      .send({ reason: REASON });
    expect(res.status).toBe(403);
    expect(await docRow(id)).toBeTruthy();
  });

  it('an admin deletes an empty document of their organisation; the chained row names the actor and the reason', async () => {
    const id = await createDoc(actors.admin, programA, 'deleted');
    const res = await request(actors.admin.app)
      .delete(`/api/authoring/docs/${id}`)
      .set('Authorization', actors.admin.auth)
      .send({ reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await docRow(id)).toBeUndefined();

    const audit = await owner.query(
      `SELECT tenant_id, user_id, actor_id, action, new_values::text AS details, sha256_chain
         FROM audit_logs WHERE record_id = $1 AND action = 'authoring.document.delete'`,
      [id],
    );
    expect(audit.rows).toHaveLength(1);
    const row = audit.rows[0];
    expect(Number(row.tenant_id)).toBe(orgA);
    expect(Number(row.user_id)).toBe(users.admin);
    expect(row.details).toContain(REASON);
    expect(String(row.sha256_chain)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a document with a section (so a revision) answers 409 and stays — the ledger is append-only', async () => {
    const id = await createDoc(actors.admin, programA, 'has-history');
    const sec = await request(actors.admin.app)
      .post('/api/authoring/sections')
      .set('Authorization', actors.admin.auth)
      .send({ doc_id: id, code: '2.5', title: '2.5', content: '<p>Body.</p>', order_index: 1 });
    expect(sec.status, JSON.stringify(sec.body)).toBe(201);
    const res = await request(actors.admin.app)
      .delete(`/api/authoring/docs/${id}`)
      .set('Authorization', actors.admin.auth)
      .send({ reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('AUTHORING_DOCUMENT_HAS_HISTORY');
    expect(await docRow(id)).toBeTruthy();
  });

  it('a draft that carries a signature answers 409 and stays — the signature keeps its record', async () => {
    const id = await createDoc(actors.admin, programA, 'signed-draft');
    const sig = await request(actors.admin.app)
      .post(`/api/authoring/docs/${id}/e-sign`)
      .set('Authorization', actors.admin.auth)
      .send({ meaning: 'AUTHOR', intent: 'dbtest-p130: authorship attested on a draft', password: PASSWORD });
    expect(sig.status, JSON.stringify(sig.body)).toBe(200);
    const res = await request(actors.admin.app)
      .delete(`/api/authoring/docs/${id}`)
      .set('Authorization', actors.admin.auth)
      .send({ reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('AUTHORING_DOCUMENT_SIGNED');
    expect(await docRow(id)).toBeTruthy();
  });

  it("another organisation's admin gets 404 for this organisation's document, and it stays", async () => {
    const id = await createDoc(actors.admin, programA, 'foreign');
    const res = await request(actors.outsider.app)
      .delete(`/api/authoring/docs/${id}`)
      .set('Authorization', actors.outsider.auth)
      .send({ reason: REASON });
    expect(res.status).toBe(404);
    expect(await docRow(id)).toBeTruthy();
    // And the outsider's own organisation is untouched by the attempt.
    expect(programB).toBeTruthy();
  });
});

describe('DP-35 — a freeze without the ceremony seals nothing, on the real database', () => {
  it('an admin freezing without the password is refused by the ceremony; the document stays a draft', async () => {
    const id = await createDoc(actors.admin, programA, 'freeze-no-password');
    const res = await request(actors.admin.app)
      .post(`/api/authoring/docs/${id}/freeze`)
      .set('Authorization', actors.admin.auth)
      .send({ reason: 'dbtest-p130: seal attempted without credentials', meaning: 'AUTHOR' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_REQUIRED');
    expect(String((await docRow(id))?.status).toUpperCase()).not.toBe('FROZEN');
  });

  it('a member without a signing role is refused before any credential is read', async () => {
    const id = await createDoc(actors.admin, programA, 'freeze-member');
    const res = await request(actors.member.app)
      .post(`/api/authoring/docs/${id}/freeze`)
      .set('Authorization', actors.member.auth)
      .send({ reason: 'dbtest-p130: member seal attempt', meaning: 'AUTHOR', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(String((await docRow(id))?.status).toUpperCase()).not.toBe('FROZEN');
  });

  it('an admin with the ceremony seals it, and the signature row names the snapshot it sealed', async () => {
    const id = await createDoc(actors.admin, programA, 'freeze-signed');
    const res = await request(actors.admin.app)
      .post(`/api/authoring/docs/${id}/freeze`)
      .set('Authorization', actors.admin.auth)
      .send({ reason: 'dbtest-p130: sealed under the ceremony', meaning: 'AUTHOR', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(String((await docRow(id))?.status).toUpperCase()).toBe('FROZEN');
    const sig = await owner.query(
      `SELECT signer_email, meaning, method, covered_freeze_version, covered_content_hash
         FROM authoring_signatures WHERE id = $1 AND tenant_id = $2`,
      [res.body.signatureId, orgA],
    );
    expect(sig.rows).toHaveLength(1);
    expect(sig.rows[0]).toMatchObject({
      signer_email: 'dbtest-p130-admin@c2c.test',
      meaning: 'AUTHOR',
      method: 'password',
      covered_freeze_version: res.body.version,
      covered_content_hash: res.body.contentHash,
    });
  });
});

/* ── The repository's own callers of the freeze (fix round, 2026-10-01) ──
 *
 * `npm run demo:seed` freezes one document in each pack. Both packs posted
 * {reason, version} as the author's session, which the signed freeze answers
 * with 400 (no meaning), and `must` turned that into an aborted pack. These
 * cases run the packs' own freeze and e-sign steps, through their own API
 * client, against the real router on the real database. The author is the
 * organisation admin (the founder holds that role in the demo tenant, so the
 * author has signing authority and the old body met the meaning check); the
 * second signer is another admin of the same organisation. */
type PackApi = (method: string, path: string, body?: unknown) => Promise<{ status: number; json: any; text: string }>;
type PackSigner = { email: string; password: string; api: PackApi; session: { user: { id: number; displayName: string } } };

const packServers: Array<import('node:http').Server> = [];
let author: PackApi;
let signer: PackSigner;
let biotech: typeof import('../../scripts/demo/launch-demo/packs/biotech-authoring.mjs');
let mdx: typeof import('../../scripts/demo/launch-demo/packs/mdx.mjs');

async function listen(app: express.Express): Promise<string> {
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  packServers.push(server);
  return `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
}

/** The packs' own API client for the author, and a second signer (another org admin). */
async function connectPackIdentities(): Promise<void> {
  process.env.VALIDATION_PACE_MS = '0';
  const { createApiClient } = await import('../validation/lib/harness.mjs');
  biotech = await import('../../scripts/demo/launch-demo/packs/biotech-authoring.mjs');
  mdx = await import('../../scripts/demo/launch-demo/packs/mdx.mjs');
  const signerEmail = 'dbtest-p130-signer@c2c.test';
  const signerId = await upsertUser(signerEmail);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
    [orgA, signerId],
  );
  const token = (a: Actor) => a.auth.replace(/^Bearer /, '');
  author = createApiClient({ baseUrl: await listen(actors.admin.app), accessToken: token(actors.admin) });
  const signerActor = { app: await appFor(signerId, orgA, 'admin', signerEmail), auth: await bearer(signerId, orgA, 'admin', signerEmail) };
  signer = {
    email: signerEmail,
    password: PASSWORD,
    api: createApiClient({ baseUrl: await listen(signerActor.app), accessToken: token(signerActor), identity: signerEmail }),
    session: { user: { id: signerId, displayName: `${signerEmail} actor` } },
  };
}

/** A settled document: one section, no open comment, no tracked change. */
async function settledDoc(suffix: string): Promise<string> {
  const id = await createDoc(actors.admin, programA, suffix);
  const sec = await request(actors.admin.app)
    .post('/api/authoring/sections')
    .set('Authorization', actors.admin.auth)
    .send({ doc_id: id, code: 'S.1', title: 'Objectives', content: '<p>Settled body.</p>', order_index: 0 });
  expect(sec.status, JSON.stringify(sec.body)).toBe(201);
  return id;
}

/** The pack's run and tally, recording what the step noted and counted. */
function packRun() {
  const notes: string[] = [];
  const records: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  return {
    notes, records, counts,
    run: { note: (t: string) => notes.push(t), record: (k: string, v: unknown) => { records[k] = v; }, step: async (_t: string, fn: () => unknown) => fn() },
    tally: { found: (k: string) => bump(`found:${k}`), created: (k: string) => bump(`created:${k}`) },
  };
}

async function signaturesOf(id: string) {
  return (await owner.query(
    'SELECT signer_email, meaning, reason, covered_freeze_version FROM authoring_signatures WHERE doc_id = $1 ORDER BY signed_at',
    [id],
  )).rows;
}

describe('DP-35 — the demo seed packs freeze through the ceremony, on the real database', () => {
  beforeAll(connectPackIdentities, 60_000);

  afterAll(async () => {
    await Promise.all(packServers.map((s) => new Promise((r) => s.close(r))));
  });

  it('biotech pack: the second signer seals the synopsis as REVIEWER, then e-signs; a re-run adds nothing', async () => {
    const id = await settledDoc('demo-biotech-signed');
    const spec = { key: 'synopsis', name: 'Protocol Synopsis (dbtest)' };
    const docRec: Record<string, unknown> = { id };
    const p = packRun();
    const ctx = { api: author, run: p.run, tally: p.tally, signer };

    await biotech.ensureFreeze(ctx, spec, docRec);
    expect(String((await docRow(id))?.status).toUpperCase()).toBe('FROZEN');
    await biotech.ensureSignature(ctx, spec, docRec);
    let sigs = await signaturesOf(id);
    expect(sigs.map((s) => [s.signer_email, s.meaning])).toEqual([
      ['dbtest-p130-signer@c2c.test', 'REVIEWER'],
      ['dbtest-p130-signer@c2c.test', 'REVIEWER'],
    ]);
    expect(sigs[0].covered_freeze_version).toBe('1.0');
    expect(p.counts).toMatchObject({ 'created:authoring-freeze': 1, 'created:authoring-signature': 1 });

    // Idempotent by the pack's own lookups: the freeze is found, and the
    // freeze's signature is not mistaken for the e-signature (nor the reverse).
    await biotech.ensureFreeze(ctx, spec, docRec);
    await biotech.ensureSignature(ctx, spec, docRec);
    sigs = await signaturesOf(id);
    expect(sigs).toHaveLength(2);
    expect(p.counts).toMatchObject({ 'found:authoring-freeze': 1, 'found:authoring-signature': 1 });
  });

  it('biotech pack: without a signer credential the freeze is recorded as not executed and the pack goes on', async () => {
    const id = await settledDoc('demo-biotech-no-signer');
    const docRec: Record<string, unknown> = { id };
    const p = packRun();
    const out = await biotech.ensureFreeze({ api: author, run: p.run, tally: p.tally, signer: null }, { key: 'synopsis', name: 'Protocol Synopsis (dbtest)' }, docRec);
    expect(String(out)).toMatch(/^not executed — signer credential not supplied/);
    expect(p.notes.join('\n')).toMatch(/not executed — signer credential not supplied/);
    expect(String((await docRow(id))?.status).toUpperCase()).not.toBe('FROZEN');
    expect(await signaturesOf(id)).toHaveLength(0);
  });

  it('mdx pack: the second signer seals the summary as REVIEWER, then approves; the approval is its own signature', async () => {
    const id = await settledDoc('demo-mdx-signed');
    const p = packRun();
    const ctx = { api: author, run: p.run };

    await mdx.freezeSummary(ctx, { id }, signer);
    expect(String((await docRow(id))?.status).toUpperCase()).toBe('FROZEN');
    await mdx.signSummary(ctx, id, signer);
    expect(String((await docRow(id))?.status).toUpperCase()).toBe('APPROVED');
    const sigs = await signaturesOf(id);
    expect(sigs.map((s) => [s.signer_email, s.meaning])).toEqual([
      ['dbtest-p130-signer@c2c.test', 'REVIEWER'],
      ['dbtest-p130-signer@c2c.test', 'APPROVER'],
    ]);
    expect(p.records['authoring.summarySignature']).toMatchObject({ executed: true, existing: false, meaning: 'APPROVER' });

    // A re-run finds the approval and signs nothing more.
    await mdx.signSummary(ctx, id, signer);
    expect(await signaturesOf(id)).toHaveLength(2);
    expect(p.records['authoring.summarySignature']).toMatchObject({ executed: true, existing: true, meaning: 'APPROVER' });
  });

  it('mdx pack: without a signer credential the freeze is recorded as not executed and the pack goes on', async () => {
    const id = await settledDoc('demo-mdx-no-signer');
    const p = packRun();
    const out = await mdx.freezeSummary({ api: author, run: p.run }, { id }, null);
    expect(String(out)).toMatch(/not executed — signer credential not supplied/);
    expect(p.records['authoring.summaryFrozen']).toMatchObject({ executed: false });
    expect(String((await docRow(id))?.status).toUpperCase()).not.toBe('FROZEN');
    expect(await signaturesOf(id)).toHaveLength(0);
  });
});
