/**
 * P-122 (2026-11-10): the reads Quality and the device Post-market screen now show, through the real routes, as the
 * runtime role with RLS on.
 *
 *   1. GET /api/mdx/qms/readiness (Quality's figure line; served in production since this change): a member reads
 *      their organisation's counts, and never another organisation's.
 *   2. GET /api/mdx/postmarket?program_id= (the Post-market panels, hidden since 10bbeeeea because the read had no
 *      project): a member reads that project's signals and CAPAs only, with meta.scope 'program'; another
 *      organisation's project is "not found" (404), a private project the member is not shared on is refused (403),
 *      a malformed id is refused (422), never an empty feed that would read as "this project has none". Without
 *      program_id the read is the organisation's, as before, and never another organisation's.
 *   3. GET /api/capa-mdr/complaints, /mdr-events and /vigilance (Quality's Complaints and MDR tab): a member reads
 *      their organisation's complaints and MDR events, never another's; another organisation's project and its
 *      vigilance timeline are refused.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';

const TAG = `p122-quality-${randomUUID().slice(0, 8)}`;
const previousHmacKey = process.env.AUDIT_HMAC_KEY;
let owner: Pool;
let app: express.Express;
const org = { a: 0, b: 0 };
const token = { a: '', aOther: '', b: '' };
const program = { a1: randomUUID(), a2: randomUUID(), aPrivate: randomUUID(), b1: randomUUID() };
const reason = { a1: `${TAG} signal a1`, a2: `${TAG} signal a2`, aPrivate: `${TAG} signal private`, b1: `${TAG} signal b1` };
let complaint = { a1: '', b1: '' };

const get = (path: string, as: string) => request(app).get(path).set('Authorization', `Bearer ${as}`);
const post = (path: string, body: unknown, as: string) => request(app).post(path).send(body as object).set('Authorization', `Bearer ${as}`);

async function seed() {
  const orgs = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active'), ($2, $2, 'active') RETURNING id, slug`,
    [`${TAG}-a`, `${TAG}-b`]);
  org.a = Number(orgs.rows.find((r) => r.slug === `${TAG}-a`).id);
  org.b = Number(orgs.rows.find((r) => r.slug === `${TAG}-b`).id);
  const hash = await bcrypt.hash('p122-quality-invented-password', 4);
  const users = await owner.query(`INSERT INTO users (email, name, status, password_hash) VALUES
      ($1, 'Invented member A', 'active', $4), ($2, 'Invented other A', 'active', $4), ($3, 'Invented member B', 'active', $4)
    RETURNING id, email`, [`${TAG}-a@example.invalid`, `${TAG}-a-other@example.invalid`, `${TAG}-b@example.invalid`, hash]);
  const id = (suffix: string) => Number(users.rows.find((r) => r.email === `${TAG}-${suffix}@example.invalid`).id);
  const member = { a: id('a'), aOther: id('a-other'), b: id('b') };
  for (const [o, u] of [[org.a, member.a], [org.a, member.aOther], [org.b, member.b]]) {
    await owner.query(`INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, 'member', now() - interval '1 day')`, [o, u]);
  }
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const sign = (u: number, o: number) => jwt.sign({ type: 'access', userId: u, organizationId: String(o), role: 'member', jti: randomUUID() },
    activeJwtSecret(), { expiresIn: '1h' });
  token.a = sign(member.a, org.a); token.aOther = sign(member.aOther, org.a); token.b = sign(member.b, org.b);

  const workspace = async (o: number) => Number((await owner.query(`INSERT INTO client_workspaces (organization_id, name, slug)
    VALUES ($1, 'Invented workspace', $2) RETURNING id`, [o, `${TAG}-${o}`])).rows[0].id);
  const ws = { a: await workspace(org.a), b: await workspace(org.b) };
  const programs: Array<[string, number, number, number, 'organization' | 'private']> = [
    [program.a1, org.a, ws.a, member.a, 'organization'], [program.a2, org.a, ws.a, member.a, 'organization'],
    [program.aPrivate, org.a, ws.a, member.aOther, 'private'], [program.b1, org.b, ws.b, member.b, 'organization'],
  ];
  for (const [pid, o, w, lead, visibility] of programs) {
    await owner.query(`INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, lead_user_id)
      VALUES ($1, $2, $3, $4, '510K', 'device', 'FDA', 'Invented device', $5)`, [pid, o, `${TAG} ${pid.slice(0, 4)}`, `P122-${pid.slice(0, 8)}`, lead]);
    const project = Number((await owner.query(`INSERT INTO projects (organization_id, client_workspace_id, regulatory_program_id, name, type, status, owner_id, created_by_id, settings)
      VALUES ($1, $2, $3, $4, 'regulatory', 'active', $5, $5, $6) RETURNING id`,
    [o, w, pid, `${TAG} project`, lead, JSON.stringify({ projectSharing: { visibility, members: [] } })])).rows[0].id);
    if (visibility === 'private') {
      await owner.query(`INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, 'private')`, [o, project]);
    }
  }
  for (const [key, pid] of Object.entries(program) as Array<[keyof typeof program, string]>) {
    await owner.query(`INSERT INTO vigilance_events (program_id, kind, entity_type, entity_id, occurred_at, reason, payload)
      VALUES ($1, 'complaint_received', 'complaint', $2, now(), $3, '{"severity":"review"}')`, [pid, randomUUID(), reason[key]]);
    await owner.query(`INSERT INTO capa_records (program_id, capa_code, title, type, source)
      VALUES ($1, $2, $3, 'corrective', 'complaint')`, [pid, `${TAG}-${key}`.toUpperCase(), `${TAG} CAPA ${key}`]);
  }
  // Readiness: two undispositioned nonconformances in A, one in B.
  for (const [o, n] of [[org.a, 1], [org.a, 2], [org.b, 1]]) {
    await owner.query(`INSERT INTO qms_nonconforming_products (organization_id, nc_number, description) VALUES ($1, $2, 'Invented finding')`,
      [o, `${TAG}-NC-${o}-${n}`]);
  }
}

const complaintBody = (programId: string) => ({ programId, source: 'customer', channel: 'email', receivedAt: '2026-11-09T09:00:00Z',
  eventNarrative: `${TAG} invented complaint`, patientHarm: 'none', severityAssessment: 'minor', isMalfunction: true,
  anticipatesCorrection: false, trendThresholdCrossed: false, eventLocationCountry: 'US' });

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.AUDIT_HMAC_KEY ||= 'p122-quality-invented-hmac-key-never-for-production';
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await seed();
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-postmarket')).default);
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
  app.use('/api/capa-mdr', authMiddleware, (await import('../../server/routes/capa-mdr')).default);
  const made = { a1: await post('/api/capa-mdr/complaints', complaintBody(program.a1), token.a), b1: await post('/api/capa-mdr/complaints', complaintBody(program.b1), token.b) };
  for (const r of Object.values(made)) expect(r.status, JSON.stringify(r.body)).toBe(201);
  complaint = { a1: String(made.a1.body.id), b1: String(made.b1.body.id) };
  const mdr = await post('/api/capa-mdr/mdr-events', { programId: program.a1, sourceComplaintId: complaint.a1, jurisdiction: 'us_fda',
    usFdaReportType: 'initial_30day', decisionDate: '2026-11-09T12:00:00Z', eventNarrative: `${TAG} invented MDR` }, token.a);
  expect(mdr.status, JSON.stringify(mdr.body)).toBe(201);
}, 180_000);

afterAll(async () => {
  if (previousHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY; else process.env.AUDIT_HMAC_KEY = previousHmacKey;
  const runtime = (await import('../../server/db/runtime')).getPool();
  await runtime?.end().catch(() => undefined);
  await owner?.end();
});

describe('runtime role with RLS on', () => {
  it('is not a superuser and does not bypass RLS', async () => {
    const runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
    try {
      const role = (await runtime.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    } finally { await runtime.end(); }
    expect(process.env.RLS_ENFORCE).toBe('on');
  });
});

describe("Quality's figure line: GET /api/mdx/qms/readiness", () => {
  it("answers a member with their organisation's counts, and never another's", async () => {
    const a = await get('/api/mdx/qms/readiness', token.a);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.meta).toEqual({ scope: 'organization' });
    expect(a.body.data.nonconforming).toEqual({ available: true, undispositioned: 2 });
    const b = await get('/api/mdx/qms/readiness', token.b);
    expect(b.status).toBe(200);
    expect(b.body.data.nonconforming).toEqual({ available: true, undispositioned: 1 });
  });

  it('refuses a request with no session', async () => {
    expect((await request(app).get('/api/mdx/qms/readiness')).status).toBe(401);
  });
});

describe('Post-market surveillance: GET /api/mdx/postmarket?program_id=', () => {
  const ids = (body: { data: { signals: Array<{ summary: string }>; capas: Array<{ title: string }> } }) => ({
    signals: body.data.signals.map((s) => s.summary).filter((s) => s.startsWith(TAG)).sort(),
    capas: body.data.capas.map((c) => c.title).filter((t) => t.startsWith(TAG)).sort(),
  });

  it("reads one project's signals and CAPAs, and says so", async () => {
    const res = await get(`/api/mdx/postmarket?program_id=${program.a1}`, token.a);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.scope).toBe('program');
    expect(ids(res.body)).toEqual({ signals: [reason.a1], capas: [`${TAG} CAPA a1`] });
  });

  it("without a project, reads the organisation's, and never another organisation's", async () => {
    const res = await get('/api/mdx/postmarket', token.a);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.scope).toBe('organization');
    const seen = ids(res.body);
    expect(seen.signals).toEqual(expect.arrayContaining([reason.a1, reason.a2]));
    expect(seen.signals).not.toContain(reason.b1);
    expect(seen.capas).not.toContain(`${TAG} CAPA b1`);
    // Nor a private project's the member is not shared on (its owner reads it below).
    expect(seen.signals).not.toContain(reason.aPrivate);
    expect(seen.capas).not.toContain(`${TAG} CAPA aPrivate`);
  });

  it("answers another organisation's project as not found, never an empty feed", async () => {
    const res = await get(`/api/mdx/postmarket?program_id=${program.b1}`, token.a);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.data).toBeUndefined();
    const reverse = await get(`/api/mdx/postmarket?program_id=${program.a1}`, token.b);
    expect(reverse.status).toBe(404);
    expect(reverse.body.data).toBeUndefined();
  });

  it('refuses a private project the member is not shared on, and answers its owner', async () => {
    const refused = await get(`/api/mdx/postmarket?program_id=${program.aPrivate}`, token.a);
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.data).toBeUndefined();
    const own = await get(`/api/mdx/postmarket?program_id=${program.aPrivate}`, token.aOther);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(ids(own.body).signals).toEqual([reason.aPrivate]);
  });

  it('refuses a malformed project id', async () => {
    const res = await get('/api/mdx/postmarket?program_id=not-a-project', token.a);
    expect(res.status).toBe(422);
    expect(res.body.data).toBeUndefined();
  });
});

describe("Quality's Complaints and MDR tab: GET /api/capa-mdr/complaints, /mdr-events, /vigilance", () => {
  it("answers a member with their organisation's complaints and MDR events, and never another's", async () => {
    const complaints = await get('/api/capa-mdr/complaints', token.a);
    expect(complaints.status, JSON.stringify(complaints.body)).toBe(200);
    const listed = (complaints.body.rows as Array<{ id: string }>).map((r) => r.id);
    expect(listed).toContain(complaint.a1);
    expect(listed).not.toContain(complaint.b1);
    const mdr = await get('/api/capa-mdr/mdr-events', token.a);
    expect(mdr.status).toBe(200);
    expect((mdr.body.rows as Array<{ programId: string }>).map((r) => r.programId)).toEqual([program.a1]);
    const other = await get('/api/capa-mdr/mdr-events', token.b);
    expect(other.status).toBe(200);
    expect(other.body.rows).toEqual([]);
    expect(((await get('/api/capa-mdr/complaints', token.b)).body.rows as Array<{ id: string }>).map((r) => r.id)).toEqual([complaint.b1]);
  });

  it("reads a complaint's vigilance timeline for its member, and refuses another organisation's", async () => {
    const path = `/api/capa-mdr/vigilance?program_id=${program.a1}&entity_type=complaint&entity_id=${complaint.a1}`;
    const own = await get(path, token.a);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect((own.body.rows as Array<{ kind: string }>).map((r) => r.kind)).toContain('complaint_received');
    const foreign = await get(path, token.b);
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(404);
    expect(foreign.body.rows).toBeUndefined();
  });

  it("refuses another organisation's project on the complaint list", async () => {
    const res = await get(`/api/capa-mdr/complaints?program_id=${program.b1}`, token.a);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.rows).toBeUndefined();
  });
});
