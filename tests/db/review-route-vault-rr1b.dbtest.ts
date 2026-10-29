/**
 * The first visible slice of the Vault review route (RR1b,
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §2.11–§2.13, §5 RR1b). On
 * PostgreSQL as the runtime role with RLS on, through the real ingest, Vault,
 * lifecycle, notification and review-board routes; the signing ceremony is the
 * one stand-in (its own suites pin it).
 *
 *   - REVIEW_ROUTE_REQUIRED: a Vault version is sent for review with named
 *     reviewers and an approver, never without (the way out, withdraw and
 *     return, shipped in RR1a);
 *   - the picker's read: every active member of this organization, each with
 *     what validateRouteMember answers for them as reviewer and as approver,
 *     before the version's record exists and after; nothing is written, and
 *     another organization's version is not found;
 *   - the reviewer's notice opens the version in the Vault
 *     (notification-record-target.ts), and only for its recipient;
 *   - the Review board: "mine" is a named member whose step is open, with
 *     their due date; "Requested by me" is the routes the reader sent, with
 *     every member's outcome.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { nativeCatalogRunId } from './catalog-native-fixture';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';
import { databaseUrl } from '../setup.db';

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-rr1b ${RUN} `;
const CODE = `DBTEST-RR1B-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
const WHO = ['uploader', 'r1', 'r2', 'approver', 'member', 'unshared', 'viewer', 'outsider'] as const;
type Who = (typeof WHO)[number];
let owner: Pool;
const users = {} as Record<Who, number>;
let mine: Tenant;
let theirs: Tenant;

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const reverify = async () => ({ ok: true as const, authenticationMethod: 'password+totp', secondFactorVerified: true });

async function appFor(t: Tenant, who: Who): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { createDocumentLifecycleRouter } = await import('../../server/routes/document-lifecycle');
  const mdxNotifications = (await import('../../server/routes/mdx-notifications')).default;
  const createReviewBoardRoutes = (await import('../../server/routes/review-board-routes')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const { db } = await import('../../server/db');
  const role = who === 'viewer' ? 'viewer' : 'admin';
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = users[who]; r.tenantId = t.orgId; r.userRole = role;
    r.user = { id: users[who], organizationId: t.orgId, organizationUuid: t.orgUuid, role };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  a.use('/api/regulatory/documents', createDocumentLifecycleRouter({ db: db as never, reverify }));
  a.use('/api/mdx', mdxNotifications);
  a.use('/api/review', createReviewBoardRoutes());
  return a;
}

async function ingest(code: string): Promise<string> {
  const res = await request(await appFor(mine, 'uploader')).post('/api/vault/ingest').field('programId', mine.programId)
    .field('documentTitle', `Clinical overview ${code}`).field('documentType', 'OTHER')
    .field('documentCode', `${CODE}-${code}`).attach('file', pdf(code), 'overview.pdf');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}
const post = async (who: Who, path: string, body: object, t: Tenant = mine) =>
  request(await appFor(t, who)).post(`/api/regulatory/documents${path}`).send(body);
const get = async (who: Who, path: string, t: Tenant = mine) => request(await appFor(t, who)).get(path);
const route = (reviewers: Who[], approvers: Who[]) => ({
  reviewers: reviewers.map((w) => users[w]), approvers: approvers.map((w) => users[w]),
  order: 'parallel', reviewDueDate: day(3), approvalDueDate: day(5),
});
async function started(code: string): Promise<{ vaultId: string; id: string }> {
  const vaultId = await ingest(code);
  const s = await post('uploader', '', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  return { vaultId, id: s.body.canonicalId };
}
const send = (id: string, r: object | undefined) =>
  post('uploader', `/${id}/advance`, { to: 'in_review', reason: 'Ready for named review', ...(r ? { route: r } : {}) });
const sign = (who: Who, id: string, meaning: 'reviewed' | 'approved') =>
  post(who, `/${id}/sign`, { meaning, password: 'x', mfaToken: '000000', reason: `Signed as ${meaning}` });
const candidates = (who: Who, vaultId: string, t: Tenant = mine) => get(who, `/api/regulatory/documents/route-candidates/${vaultId}`, t);
const stageOf = async (id: string) => (await owner.query('SELECT stage FROM canonical_documents WHERE canonical_id = $1', [id])).rows[0]?.stage;
const counts = async () => (await owner.query(
  `SELECT (SELECT count(*)::int FROM review_routes WHERE organization_id = $1) AS routes,
          (SELECT count(*)::int FROM canonical_documents WHERE organization_id = $1) AS records`, [mine.orgId])).rows[0];

/** The notices are sent after COMMIT, fire-and-forget: wait for the recipient's. */
async function noticeFor(who: Who, title: string): Promise<{ id: number; category: string; resource_type: string; resource_id: string }> {
  for (let i = 0; i < 50; i++) {
    const { rows } = await owner.query(
      `SELECT id, category, resource_type, resource_id FROM mdx_notifications
        WHERE organization_id = $1 AND recipient_user_id = $2 AND title = $3 ORDER BY id DESC LIMIT 1`,
      [mine.orgId, users[who], title]);
    if (rows[0]) return { ...rows[0], id: Number(rows[0].id) };
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No notice "${title}" reached ${who}`);
}

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-rr1b-${RUN}-${slug}`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Routin 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id]);
  const scoped = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, scoped, { userId: users.uploader, namespace: `${CODE}-${slug}` });
  return scoped;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  for (const who of WHO) {
    const u = await owner.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [`dbtest-rr1b-${RUN}-${who}@example.test`, `Rhea ${who[0].toUpperCase()}${who.slice(1)}`]);
    users[who] = Number(u.rows[0].id);
  }
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  const roles: Array<[Who, string, Tenant]> = [
    ['r1', 'admin', mine], ['r2', 'admin', mine], ['approver', 'admin', mine],
    ['member', 'member', mine], ['unshared', 'reviewer', mine], ['outsider', 'admin', theirs],
  ];
  for (const [who, role, t] of roles) {
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2)`,
      [t.orgId, users[who], role]);
  }
  await seedVaultFixtureViewer(owner, mine, { userId: users.viewer, invitedBy: users.uploader });
  await assertVaultFixtureRuntime(mine);
}, 60_000);

afterAll(async () => {
  await owner.end().catch(() => {});
  await closeVaultFixtureRuntime();
});

describe('REVIEW_ROUTE_REQUIRED: a Vault version is sent with named people (RR1b, §2.6)', () => {
  it('an advance into review without a route is refused, and the record stays in authoring', async () => {
    const { id } = await started('NOROUTE');
    const r = await send(id, undefined);
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toBe('REVIEW_ROUTE_REQUIRED');
    expect(r.body.message).toMatch(/Name the reviewers and the approver/);
    expect(await stageOf(id)).toBe('authoring');
  });

  it('with a route it is sent, as RR1a sends it', async () => {
    const { id } = await started('WITHROUTE');
    const r = await send(id, route(['r1'], ['approver']));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await stageOf(id)).toBe('in_review');
  });
});

describe("the picker's read: who may be named, by validateRouteMember's rules (RR1b, §2.5)", () => {
  type Candidate = { id: number; name: string; reviewer: { code: string } | null; approver: { code: string } | null };
  const byWho = (list: Candidate[], who: Who) => list.find((c) => c.id === users[who]);

  it('before the record exists: each member with what the validator answers, nothing written', async () => {
    const vaultId = await ingest('PICKER');
    const before = await counts();
    const r = await candidates('uploader', vaultId);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.timeZone).toBe('UTC');
    const list = r.body.candidates as Candidate[];
    expect(byWho(list, 'r1')).toMatchObject({ name: 'Rhea R1', reviewer: null, approver: null });
    expect(byWho(list, 'uploader')?.reviewer?.code).toBe('MEMBER_IS_AUTHOR');
    expect(byWho(list, 'member')?.reviewer?.code).toBe('MEMBER_CANNOT_SIGN');
    expect(byWho(list, 'viewer')?.approver?.code).toBe('MEMBER_CANNOT_SIGN');
    expect(byWho(list, 'unshared')?.reviewer?.code).toBe('MEMBER_NO_PROJECT_ACCESS');
    expect(byWho(list, 'outsider'), 'another organization’s member is not listed').toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it('once started by someone else: the sender is refused as the sender, and the uploader as an author', async () => {
    const { vaultId } = await started('PICKER-STARTED');
    const r = await candidates('r2', vaultId);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = r.body.candidates as Candidate[];
    expect(byWho(list, 'uploader')?.approver?.code).toBe('MEMBER_IS_AUTHOR');
    expect(byWho(list, 'r2')?.reviewer?.code).toBe('MEMBER_IS_SENDER');
    expect(byWho(list, 'r1')).toMatchObject({ reviewer: null, approver: null });
  });

  it('a reviewer of this content is offered to review again, never to approve', async () => {
    const { id, vaultId } = await started('PICKER-REVIEWED');
    expect((await send(id, route(['r1', 'r2'], ['approver']))).status).toBe(200);
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await post('uploader', `/${id}/review-route/withdraw`, { reason: 'Re-route with a different approver' })).status).toBe(200);
    const list = (await candidates('uploader', vaultId)).body.candidates as Candidate[];
    expect(byWho(list, 'r1')).toMatchObject({ reviewer: null, approver: { code: 'MEMBER_REVIEWED_THIS_CONTENT' } });
  });

  it("another organization's version is not found, and a malformed id is refused", async () => {
    const vaultId = await ingest('PICKER-CROSS');
    expect((await candidates('outsider', vaultId, theirs)).status).toBe(404);
    expect((await candidates('uploader', 'not-a-uuid')).status).toBe(404);
  });
});

describe("the reviewer's notice opens the version (RR1b, §2.11)", () => {
  it('task_assigned names the route task, and its target is the version in the Vault of its project', async () => {
    const { id, vaultId } = await started('NOTICE');
    expect((await send(id, route(['r1'], ['approver']))).status).toBe(200);
    const notice = await noticeFor('r1', `Review requested: Clinical overview NOTICE`);
    expect(notice.category).toBe('task_assigned');
    expect(notice.resource_type).toBe('unified_task');
    expect(notice.resource_id).toMatch(/^ROUTE-/);
    const target = await get('r1', `/api/mdx/notifications/${notice.id}/target`);
    expect(target.status, JSON.stringify(target.body)).toBe(200);
    expect(target.body.data).toEqual({
      surface: 'vault', label: 'Open the version in the Vault', params: { documentId: vaultId }, programId: mine.programId,
    });
    // Only its recipient resolves it.
    expect((await get('r2', `/api/mdx/notifications/${notice.id}/target`)).status).toBe(404);
  });
});

describe('the Review board: mine, and Requested by me (RR1b, §2.11)', () => {
  type Member = { userId: number; role: string; outcome: string; stepOpen: boolean; dueDate: string | null };
  type Item = { canonicalId: string; mine: boolean; sentByMe: boolean; myDueAt: string | null; step: string; round: { members: Member[] } | null; routeUnread: boolean };
  const board = async (who: Who, scope: string) => {
    const r = await get(who, `/api/review/board?scope=${scope}&limit=100`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return (r.body.data.vaultReviews ?? []) as Item[];
  };

  it("a named reviewer's open step is theirs, with its due date; the approver waits; the sender sees every outcome", async () => {
    const { id } = await started('BOARD');
    expect((await send(id, route(['r1', 'r2'], ['approver']))).status).toBe(200);

    const r1 = (await board('r1', 'mine')).find((i) => i.canonicalId === id);
    expect(r1).toMatchObject({ mine: true, step: 'review', routeUnread: false });
    expect(r1!.myDueAt).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/);
    expect((await board('approver', 'mine')).some((i) => i.canonicalId === id), 'the approver’s step is not open').toBe(false);
    expect((await board('member', 'mine')).some((i) => i.canonicalId === id), 'an unnamed signer is not given it').toBe(false);

    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    const sent = (await board('uploader', 'requested')).find((i) => i.canonicalId === id);
    expect(sent).toMatchObject({ sentByMe: true, mine: false });
    expect(sent!.round!.members.map((m) => [m.userId, m.role, m.outcome]).sort()).toEqual([
      [users.r1, 'reviewer', 'signed'], [users.r2, 'reviewer', 'pending'], [users.approver, 'approver', 'pending'],
    ].sort());
    expect((await board('r1', 'mine')).some((i) => i.canonicalId === id), 'a member who signed has nothing left to do').toBe(false);

    expect((await sign('r2', id, 'reviewed')).status).toBe(200);
    const approver = (await board('approver', 'mine')).find((i) => i.canonicalId === id);
    expect(approver).toMatchObject({ mine: true, step: 'approve' });
  });
});
