/**
 * Vault send, sign, withdraw and return on a named review route (RR1a,
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.4–§2.12). On PostgreSQL as the
 * runtime role with RLS on, through the real ingest, Vault and lifecycle
 * routes; the signing ceremony is the one stand-in (its own suites pin it).
 *
 *   - sending refuses, with nothing written: no reason, no approver, and each
 *     validateRouteMember refusal (another organization's user, no signing
 *     authority, no project access, an author, the sender, and a reviewer of
 *     this content — from a withdrawn route — named as approver);
 *   - two reviewers and one approver: the first review leaves review_signature
 *     null, the second writes it and opens the approver, and the approver's
 *     signature approves the version and completes the route; each signature
 *     closes its member's task and the task.transition row cites it;
 *   - /advance → approved on a routed record is refused; an unnamed person, and
 *     the approver before the review is complete, are refused;
 *   - a signature that is not on this route does not count;
 *   - withdraw after the review is complete clears review_signature; the new
 *     route's reviewers sign; the old review does not satisfy
 *     REVIEW_SIGNOFF_REQUIRED;
 *   - ROUTE_WITHDRAWN refuses every signature while the route is withdrawn;
 *   - every Vault exit closes the route: last approval (complete), Return
 *     (returned), /advance to authoring and to withdrawn (withdrawn), and a
 *     check-in of a newer version (withdrawn, "Superseded by version 2.0");
 *   - routeStanding throws on a failed read;
 *   - the round read lists every member with printed name, UTC time, meaning
 *     and outcome, from this organization's signatures only;
 *   - two concurrent reviewer sign-offs both complete;
 *   - another organization cannot sign, withdraw or return.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { nativeCatalogRunId } from './catalog-native-fixture';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';
import { databaseUrl } from '../setup.db';

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-rr1a ${RUN} `;
const CODE = `DBTEST-RR1A-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
const WHO = ['uploader', 'r1', 'r2', 'r3', 'approver', 'member', 'unshared', 'viewer', 'outsider'] as const;
type Who = (typeof WHO)[number];
let owner: Pool;
const users = {} as Record<Who, number>;
let mine: Tenant;
let theirs: Tenant;

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const reverify = async () => ({ ok: true as const, authenticationMethod: 'password+totp', secondFactorVerified: true });

async function appFor(t: Tenant, who: Who): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { createDocumentLifecycleRouter } = await import('../../server/routes/document-lifecycle');
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
  return a;
}

async function ingest(code: string, bytes: Buffer, supersedes?: string) {
  let r = request(await appFor(mine, 'uploader')).post('/api/vault/ingest').field('programId', mine.programId)
    .field('documentTitle', `Clinical overview ${code}`).field('documentType', 'OTHER');
  r = supersedes ? r.field('supersedesDocumentId', supersedes) : r.field('documentCode', `${CODE}-${code}`);
  const res = await r.attach('file', bytes, 'overview.pdf');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}
const post = async (who: Who, path: string, body: object, t: Tenant = mine) =>
  request(await appFor(t, who)).post(`/api/regulatory/documents${path}`).send(body);
const route = (reviewers: Who[], approvers: Who[]) => ({
  reviewers: reviewers.map((w) => users[w]), approvers: approvers.map((w) => users[w]),
  order: 'parallel', reviewDueDate: day(3), approvalDueDate: day(5),
});
async function started(code: string, bytes = pdf(code)): Promise<{ vaultId: string; id: string }> {
  const vaultId = await ingest(code, bytes);
  const s = await post('uploader', '', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  return { vaultId, id: s.body.canonicalId };
}
const send = (who: Who, id: string, r: object | undefined, reason: string | undefined = 'Ready for named review') =>
  post(who, `/${id}/advance`, { to: 'in_review', ...(r ? { route: r } : {}), ...(reason ? { reason } : {}) });
const sign = (who: Who, id: string, meaning: 'reviewed' | 'approved', t: Tenant = mine) =>
  post(who, `/${id}/sign`, { meaning, password: 'x', mfaToken: '000000', reason: `Signed as ${meaning}` }, t);
const act = (who: Who, id: string, what: 'withdraw' | 'return', reason = `Route ${what} by the actor`, t: Tenant = mine) =>
  post(who, `/${id}/review-route/${what}`, { reason }, t);

const stage = async (id: string) => (await owner.query('SELECT stage, review_signature FROM canonical_documents WHERE canonical_id = $1', [id])).rows[0];
const routes = async (id: string) =>
  (await owner.query(`SELECT id, status, status_reason, round FROM review_routes WHERE subject_id = $1 ORDER BY created_at`, [id])).rows;
const tasks = async (id: string) =>
  (await owner.query(
    `SELECT task_id, assignee_id, review_role, status, route_signature_id, route_act_id, review_route_id::text AS route_id
       FROM unified_tasks WHERE source_entity_type = 'canonical_document' AND source_entity_id = $1 ORDER BY id`, [id])).rows;
const taskOf = async (id: string, who: Who) => (await tasks(id)).filter((t) => Number(t.assignee_id) === users[who]).at(-1);
const nothingSent = async (id: string) => {
  expect(await routes(id)).toEqual([]);
  expect(await tasks(id)).toEqual([]);
  expect((await stage(id)).stage).toBe('authoring');
};

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-rr1a-${RUN}-${slug}`]);
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
      [`dbtest-rr1a-${RUN}-${who}@example.test`, `Rita ${who[0].toUpperCase()}${who.slice(1)}`]);
    users[who] = Number(u.rows[0].id);
  }
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  const roles: Array<[Who, string, Tenant]> = [
    ['r1', 'admin', mine], ['r2', 'admin', mine], ['r3', 'admin', mine], ['approver', 'admin', mine],
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

describe('sending a route refuses, with nothing written', () => {
  it('without a reason (REASON_REQUIRED)', async () => {
    const { id } = await started('NOREASON');
    const r = await send('uploader', id, route(['r1'], ['approver']), '');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('REASON_REQUIRED');
    await nothingSent(id);
  });

  it('without an approver (ROUTE_APPROVER_REQUIRED)', async () => {
    const { id } = await started('NOAPPROVER');
    const r = await send('uploader', id, route(['r1'], []));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('ROUTE_APPROVER_REQUIRED');
    await nothingSent(id);
  });

  it.each([
    ['another organization’s user', ['outsider'], ['approver'], 'MEMBER_NOT_IN_ORGANIZATION', 'uploader'],
    ['a member without signing authority', ['member'], ['approver'], 'MEMBER_CANNOT_SIGN', 'uploader'],
    ['a signer who cannot open the project', ['unshared'], ['approver'], 'MEMBER_NO_PROJECT_ACCESS', 'uploader'],
    ['the uploader (an author)', ['uploader'], ['approver'], 'MEMBER_IS_AUTHOR', 'uploader'],
    ['the sender', ['r1'], ['approver'], 'MEMBER_IS_SENDER', 'approver'],
    ['the same person twice', ['r1'], ['r1'], 'MEMBER_ALREADY_NAMED', 'uploader'],
  ] as Array<[string, Who[], Who[], string, Who]>)('naming %s', async (_n, reviewers, approvers, code, sender) => {
    const { id } = await started(`REFUSE-${code}`);
    const r = await send(sender, id, route(reviewers, approvers));
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toBe(code);
    await nothingSent(id);
  });

  it('naming, as approver, a reviewer who signed this content on a withdrawn route (MEMBER_REVIEWED_THIS_CONTENT)', async () => {
    const { id } = await started('STAGEROUND');
    expect((await send('uploader', id, route(['r1', 'r2'], ['approver']))).status).toBe(200);
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await act('uploader', id, 'withdraw')).status).toBe(200);
    expect((await stage(id)).stage).toBe('in_review');
    const before = await routes(id);
    const r = await post('uploader', `/${id}/review-route`, { route: route(['r2'], ['r1']), reason: 'Re-send with new names' });
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toBe('MEMBER_REVIEWED_THIS_CONTENT');
    expect(await routes(id)).toEqual(before);
  });
});

describe('two reviewers and one approver', () => {
  it('first review: no sign-off yet; second: the sign-off and the approver’s turn; approval: approved and complete', async () => {
    const bytes = pdf('flow');
    const { vaultId, id } = await started('FLOW', bytes);
    const sent = await send('uploader', id, route(['r1', 'r2'], ['approver']));
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.routeId).toBeTruthy();
    expect((await tasks(id)).map((t) => [Number(t.assignee_id), t.review_role, t.status]).sort()).toEqual(
      [[users.r1, 'reviewer', 'pending'], [users.r2, 'reviewer', 'pending'], [users.approver, 'approver', 'blocked']].sort());
    const sendRow = (await owner.query(`SELECT decision_reason, payload FROM c2c_ana_actions WHERE command = 'review-route.send' AND target = $1`, [`canonical_document:${id}`])).rows[0];
    expect(sendRow.decision_reason).toBe('Ready for named review');
    expect(sendRow.payload.members.map((m: { printedName: string }) => m.printedName).sort()).toEqual(['Rita Approver', 'Rita R1', 'Rita R2']);

    // Refused: the approver before the review, an unnamed person, and an advance.
    expect((await sign('approver', id, 'approved')).body.error).toBe('REVIEW_INCOMPLETE');
    expect((await sign('r3', id, 'reviewed')).body.error).toBe('ROUTE_NOT_NAMED');
    const adv = await post('approver', `/${id}/advance`, { to: 'approved', password: 'x', reason: 'Approve by advancing' });
    expect(adv.status).toBe(409);
    expect(adv.body.error).toBe('ROUTE_APPROVAL_BY_SIGN');

    const first = await sign('r1', id, 'reviewed');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect((await stage(id)).review_signature).toBeNull();
    expect((await taskOf(id, 'approver')).status).toBe('blocked');
    const r1 = await taskOf(id, 'r1');
    expect(r1).toMatchObject({ status: 'completed' });
    expect(`esig:${r1.route_signature_id}`).toBe(first.body.signature.signatureRef);
    const cites = (await owner.query(`SELECT payload FROM c2c_ana_actions WHERE command = 'task.transition' AND target = $1`, [`task:${r1.task_id}`])).rows;
    expect(cites.map((c) => c.payload.signatureRef)).toContain(first.body.signature.signatureRef);
    expect((await sign('r1', id, 'reviewed')).body.error).toBe('SIGNATURE_ALREADY_RECORDED');

    const second = await sign('r2', id, 'reviewed');
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect((await stage(id)).review_signature).toMatchObject({ signatureRef: second.body.signature.signatureRef, boundContentHash: sha(bytes) });
    expect((await taskOf(id, 'approver')).status).toBe('pending');

    const approval = await sign('approver', id, 'approved');
    expect(approval.status, JSON.stringify(approval.body)).toBe(200);
    expect(approval.body).toMatchObject({ approvalComplete: true, stage: 'approved' });
    expect((await stage(id)).stage).toBe('approved');
    expect((await routes(id)).map((r) => r.status)).toEqual(['complete']);
    expect((await taskOf(id, 'approver')).status).toBe('completed');
    const sigs = (await owner.query(
      `SELECT organization_id, signer_id, signature_meaning, bound_payload_digest FROM electronic_signatures WHERE signed_target = $1 ORDER BY id`,
      [`canonical_document:${id}`])).rows;
    expect(sigs.map((s) => [Number(s.organization_id), Number(s.signer_id), s.signature_meaning, s.bound_payload_digest])).toEqual([
      [mine.orgId, users.r1, 'REVIEWED', sha(bytes)], [mine.orgId, users.r2, 'REVIEWED', sha(bytes)], [mine.orgId, users.approver, 'APPROVED', sha(bytes)]]);

    // The round as the Vault reads it: every member, printed names, meanings, UTC times, outcomes.
    const list = await request(await appFor(mine, 'viewer')).get(`/api/c2c/project-vault/${mine.programId}/documents/${vaultId}/versions`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const round = list.body.data.versions[0].lifecycle.round;
    expect(round.route).toMatchObject({ status: 'complete', senderName: 'Rita Uploader', round: 1 });
    expect(round.members.map((m: any) => [m.role, m.printedName, m.outcome, m.signature?.meaning, m.signature?.printedName]).sort()).toEqual([
      ['approver', 'Rita Approver', 'signed', 'APPROVED', 'Rita Approver'],
      ['reviewer', 'Rita R1', 'signed', 'REVIEWED', 'Rita R1'],
      ['reviewer', 'Rita R2', 'signed', 'REVIEWED', 'Rita R2']].sort());
    for (const m of round.members) expect(m.signature.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('a signature counts only on its own route', () => {
  it('a reviewer who signed a withdrawn route signs again on the new one', async () => {
    const { id } = await started('BOUND');
    await send('uploader', id, route(['r1', 'r2'], ['approver']));
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await act('uploader', id, 'withdraw')).status).toBe(200);
    const resent = await post('uploader', `/${id}/review-route`, { route: route(['r1', 'r3'], ['approver']), reason: 'Re-send to a new pair' });
    expect(resent.status, JSON.stringify(resent.body)).toBe(201);
    expect((await sign('r3', id, 'reviewed')).status).toBe(200);
    // r1's earlier signature is on the withdrawn route's member row, not this one's.
    expect((await stage(id)).review_signature).toBeNull();
    expect((await sign('approver', id, 'approved')).body.error).toBe('REVIEW_INCOMPLETE');
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await stage(id)).review_signature).not.toBeNull();
  });
});

describe('withdraw', () => {
  it('after the review is complete clears review_signature; the old review does not satisfy REVIEW_SIGNOFF_REQUIRED', async () => {
    const { id } = await started('WITHDRAWDONE');
    await send('uploader', id, route(['r1', 'r2'], ['approver']));
    await sign('r1', id, 'reviewed');
    await sign('r2', id, 'reviewed');
    expect((await stage(id)).review_signature).not.toBeNull();
    const w = await act('uploader', id, 'withdraw', 'Wrong approver named');
    expect(w.status, JSON.stringify(w.body)).toBe(200);
    expect(await stage(id)).toMatchObject({ stage: 'authoring', review_signature: null });
    expect((await routes(id)).map((r) => [r.status, r.status_reason])).toEqual([['withdrawn', 'Wrong approver named']]);
    expect((await taskOf(id, 'approver')).status).toBe('cancelled');

    expect((await send('uploader', id, route(['r3'], ['approver']))).status).toBe(200);
    const { loadProjectionInput } = await import('../../server/services/regulatory/canonicalDocumentStore');
    const { projectCanonicalDocument } = await import('../../server/services/regulatory/documentLifecycleOrchestrator');
    const { canAdvanceDocument } = await import('../../shared/regulatory/document-lifecycle');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const doc = await loadProjectionInput(drizzle(owner) as never, id, mine.orgId);
    expect(canAdvanceDocument(projectCanonicalDocument(doc!).state, 'approved').blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');
    expect((await sign('r3', id, 'reviewed')).status).toBe(200);
    expect((await sign('approver', id, 'approved')).status).toBe(200);
    expect((await stage(id)).stage).toBe('approved');
  });

  it('while withdrawn, every signature is refused (ROUTE_WITHDRAWN)', async () => {
    const { id } = await started('WITHDRAWN');
    await send('uploader', id, route(['r1', 'r2'], ['approver']));
    // Not the sender, and not an administrator of the organization.
    expect((await act('member', id, 'withdraw')).body.error).toBe('ROUTE_WITHDRAW_NOT_PERMITTED');
    expect((await act('uploader', id, 'withdraw')).status).toBe(200);
    for (const [who, meaning] of [['r1', 'reviewed'], ['r3', 'reviewed'], ['approver', 'approved']] as const) {
      const r = await sign(who, id, meaning);
      expect(r.status, who).toBe(409);
      expect(r.body.error, who).toBe('ROUTE_WITHDRAWN');
    }
    expect((await tasks(id)).every((t) => t.status === 'cancelled')).toBe(true);
  });
});

describe('every Vault exit closes the route', () => {
  it('Return for revision: authoring, route returned, the returner’s act stamped, the others cancelled', async () => {
    const { id } = await started('RETURN');
    await send('uploader', id, route(['r1', 'r2'], ['approver']));
    expect((await act('r3', id, 'return')).body.error).toBe('ROUTE_RETURN_NOT_PERMITTED');
    const r = await act('r1', id, 'return', 'Section 2 cites the wrong study');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await stage(id)).stage).toBe('authoring');
    expect((await routes(id)).map((x) => [x.status, x.status_reason])).toEqual([['returned', 'Section 2 cites the wrong study']]);
    const r1 = await taskOf(id, 'r1');
    expect(r1.route_act_id).toBe(r.body.actId);
    expect((await tasks(id)).every((t) => t.status === 'cancelled')).toBe(true);
  });

  it.each(['authoring', 'withdrawn'])('an /advance to %s withdraws the route with the advance’s reason (and needs one)', async (to) => {
    const { id } = await started(`EXIT-${to}`);
    await send('uploader', id, route(['r1'], ['approver']));
    const bare = await post('uploader', `/${id}/advance`, { to });
    expect(bare.status).toBe(400);
    expect(bare.body.error).toBe('REASON_REQUIRED');
    const r = await post('uploader', `/${id}/advance`, { to, reason: `Leaving review: ${to}` });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await routes(id)).map((x) => [x.status, x.status_reason])).toEqual([['withdrawn', `Leaving review: ${to}`]]);
  });

  it('a check-in of a newer version withdraws the route, "Superseded by version 2.0"', async () => {
    const { vaultId, id } = await started('CHECKIN');
    await send('uploader', id, route(['r1'], ['approver']));
    await ingest('CHECKIN', pdf('checkin-v2'), vaultId);
    expect((await routes(id)).map((x) => [x.status, x.status_reason])).toEqual([['withdrawn', 'Superseded by version 2.0']]);
    expect((await sign('r1', id, 'reviewed')).body.error).toBe('ROUTE_WITHDRAWN');
  });
});

describe('honest reads and concurrency', () => {
  it('routeStanding throws on a failed read, never "none"', async () => {
    const { routeStanding } = await import('../../server/services/review/review-route-standing');
    const failing = { query: async () => { throw new Error('connection reset'); } };
    await expect(routeStanding(failing, { organizationId: mine.orgId, subjectType: 'canonical_document', subjectId: 'x', inReview: false })).rejects.toThrow('connection reset');
  });

  it('two concurrent reviewer sign-offs both complete; the review is complete once', async () => {
    const { id } = await started('CONCURRENT');
    await send('uploader', id, route(['r1', 'r2'], ['approver']));
    const [a, b] = await Promise.all([sign('r1', id, 'reviewed'), sign('r2', id, 'reviewed')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await stage(id)).review_signature).not.toBeNull();
    expect((await taskOf(id, 'approver')).status).toBe('pending');
  });

  it('another organization cannot sign, withdraw or return (404, nothing changed)', async () => {
    const { id } = await started('CROSS');
    await send('uploader', id, route(['r1'], ['approver']));
    expect((await sign('outsider', id, 'reviewed', theirs)).status).toBe(404);
    expect((await act('outsider', id, 'withdraw', 'Cross-tenant attempt', theirs)).status).toBe(404);
    expect((await act('outsider', id, 'return', 'Cross-tenant attempt', theirs)).status).toBe(404);
    expect((await routes(id)).map((r) => r.status)).toEqual(['open']);
  });
});
