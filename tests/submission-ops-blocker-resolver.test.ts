/**
 * A blocker's closer is the session's user, never a request field, and is
 * recorded once, on the transition (ledger L195).
 *
 * `PATCH /api/submission-ops/blockers/:blockerId` stored `resolvedById ||
 * getUserId(req)`, so any editor could record a submission blocker as resolved
 * by somebody else. Its status was free text, so 'closed' or 'Resolved' cleared
 * the blocker (every gate reads `status = 'open'` as live) with no closer at
 * all. A repeat 'resolved' overwrote the original closer, and a reopen left the
 * last one in place. Row security sees none of this: the row is the caller's
 * own, and only the person is wrong.
 *
 * Real SQL on PGlite, against the table as its migration creates it (foreign
 * keys stripped), because the repeat and reopen rules are decided in the UPDATE
 * itself. The session carries a STRING subject, as the token does. In the
 * deployed app the global /api gate (server/auth.ts) normalises it to an integer
 * before this router runs; the handler reads it through authedUserId and must
 * hold either shape.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { extractTableDdl } from './golden-journeys/harness';

const pg = new PGlite();
const drizzleDb = drizzle(pg);
vi.mock('../server/db', () => ({
  get db() { return drizzleDb; },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock('../server/routes/c2c/actions', () => ({ recordGovernedAction: vi.fn() }));
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));
vi.mock('../server/services/ectd/package-leaf-bytes', () => ({ packageLeafBytes: vi.fn() }));

import submissionOpsRouter from '../server/routes/submission-ops';

const ORG = 99;
const ALICE = 11;
const BOB = 22;

/** The session as admitLiveSession attaches it, before the global gate
 *  normalises the subject to an integer: the stricter of the two shapes. */
function app(userId: number) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: String(userId), userId: String(userId), organizationId: String(ORG), role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  a.use('/api/submission-ops', submissionOpsRouter);
  return a;
}
const patch = (userId: number, body: Record<string, unknown>) =>
  request(app(userId)).patch('/api/submission-ops/blockers/blk_1').send(body);
const row = async () =>
  (await pg.query<{ status: string; resolved_by_id: number | null; resolved_at: Date | null }>(
    `SELECT status, resolved_by_id, resolved_at FROM c2c_blockers WHERE blocker_id = 'blk_1'`,
  )).rows[0];

beforeAll(async () => {
  const ddl = extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_blockers'])
    .replace(/REFERENCES\s+\w+\s*\(\s*\w+\s*\)(\s+ON\s+DELETE\s+(SET\s+NULL|CASCADE|RESTRICT))?/gi, '');
  await pg.exec(ddl);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec(`
    DELETE FROM c2c_blockers;
    INSERT INTO c2c_blockers (blocker_id, org_id, project_id, blocker_type, title)
    VALUES ('blk_1', ${ORG}, 1, 'missing_document', 'Module 3 stability data');
  `);
});

describe('a blocker is closed by the session user (L195)', () => {
  it('a body naming another resolver is refused, and nothing is written', async () => {
    const res = await patch(ALICE, { status: 'resolved', resolvedById: BOB });
    // Leak assertion first: what was recorded.
    expect((await row()).resolved_by_id, 'the record must never name a resolver the session is not').not.toBe(BOB);
    expect(res.status).toBe(422);
    expect(await row()).toMatchObject({ status: 'open', resolved_by_id: null });
  });

  it('resolving records the caller, whose session subject is a string', async () => {
    const res = await patch(ALICE, { status: 'resolved' });
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ status: 'resolved', resolved_by_id: ALICE });
    expect((await row()).resolved_at).not.toBeNull();
  });

  it.each([
    ['as a number', ALICE],
    ['as a string', String(ALICE)],
  ])('a body naming the caller themself (%s) is accepted', async (_label, own) => {
    const res = await patch(ALICE, { status: 'resolved', resolvedById: own });
    expect(res.status).toBe(200);
    expect((await row()).resolved_by_id).toBe(ALICE);
  });

  it('a repeat resolution keeps the original closer and time', async () => {
    await patch(ALICE, { status: 'resolved' });
    const first = await row();
    const res = await patch(BOB, { status: 'resolved' });
    expect(res.status).toBe(200);
    expect(await row()).toEqual(first);
  });

  it('dismissing clears the gate, so it records its closer too', async () => {
    const res = await patch(BOB, { status: 'dismissed' });
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ status: 'dismissed', resolved_by_id: BOB });
  });

  it('reopening clears the last closer, who did not set the new state', async () => {
    await patch(ALICE, { status: 'resolved' });
    const res = await patch(BOB, { status: 'open' });
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ status: 'open', resolved_by_id: null, resolved_at: null });
  });

  it.each(['closed', 'Resolved', 'resolved ', 'done', ''])('status %j is refused, and nothing changes', async (status) => {
    const res = await patch(ALICE, { status });
    expect(await row()).toMatchObject({ status: 'open', resolved_by_id: null });
    expect(res.status).toBe(422);
  });

  it('a next-action edit alone records no closer', async () => {
    const res = await patch(ALICE, { nextAction: 'Chase the CRO for the report' });
    expect(res.status).toBe(200);
    expect(await row()).toMatchObject({ status: 'open', resolved_by_id: null });
  });

  it("another organisation's blocker is 404, and untouched", async () => {
    await pg.exec(`UPDATE c2c_blockers SET org_id = 7`);
    const res = await patch(ALICE, { status: 'resolved' });
    expect(res.status).toBe(404);
    expect(await row()).toMatchObject({ status: 'open', resolved_by_id: null });
  });
});
