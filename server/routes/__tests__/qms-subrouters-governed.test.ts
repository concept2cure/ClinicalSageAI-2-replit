/**
 * The QMS sub-routers — CTQ factors, section gating, quality validation —
 * mounted at /api/tenant-ctq-factors, /api/tenant-section-gating and
 * /api/tenant-quality-validation (server/bootstrap/register-tenant-routes.ts)
 * AND again under /api/quality/{ctq-factors,section-gating,validation}
 * (server/routes/quality-management-api.ts).
 *
 * What is pinned here, each case written against the code before the change and
 * seen to fail there first:
 *
 *   Q1  The CTQ-factor create / update / batch routes passed their values as a
 *       second argument Drizzle's insert(table) / update(table) ignore, so the
 *       builder never ran: 201 / 200 / `success: true` with nothing saved (and
 *       apply-to-sections threw → 500). Nothing calls them and they have never
 *       persisted a row, so they now answer 501 NOT_AVAILABLE before any read or
 *       write — not built out (RULE 2).
 *   Q2  DELETE /:tenantId/ctq-factors/:factorId is the ONE governed CTQ-factor
 *       delete: viewer / non-admin refused, reason required, and ONE transaction
 *       on the request client — lock the row (id AND organization_id) → refuse
 *       if the traceability matrix (the FK) or any section-gating rule's JSON id
 *       list (no FK) still uses it → DELETE … WHERE id AND organization_id →
 *       ledger (snapshot of the locked row) → COMMIT. A ledger failure rolls
 *       back; a failed COMMIT is OUTCOME_UNKNOWN. Before, its in-use check always
 *       threw (500), and the delete below it carried an ignored where clause.
 *       The DELETE statement and the gating in-use check are each read off the
 *       SQL as bound to the caller's organization: another organization's rule
 *       listing the same id neither blocks the delete nor has its section named
 *       in a refusal. (Both were seen to fail with that predicate removed.)
 *   Q3  tenant-section-gating.ts declared its own CTQ-factor writers. The DELETE
 *       hard-deleted a row for ANY member — a viewer included — with no reason
 *       and no ledger; the POST wrote a column that does not exist and always
 *       500'd. Both are gone (404) and the governed delete is reachable through
 *       both of its own mounts. Its gating-rule update never saved anything
 *       either and now refuses 501.
 *   Q4  POST /request-waiver invented a waiver {id: Date.now(), status: 'pending'}
 *       and answered 201 with nothing written. It now refuses 501.
 *
 * The store is in-process PGlite with the four tables' DDL read out of
 * migrations/0000_sweet_joseph.sql (and the foreign keys among them), reached
 * through REAL Drizzle over a recording pg-style client installed as
 * `req.dbClient` — the shape the request-scope middleware installs — so "one
 * transaction" is proven against real SQL transactions. The shared pool that
 * tenant-section-gating.ts uses is routed to the same PGlite and logged apart
 * (POOL:…). `recordGovernedAction` is a spy (its own contract is proven in its
 * own suite) that issues a probe statement on the client it was handed.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/tenantContext', () => ({
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
  tenantContext: (_q: unknown, _s: unknown, n: () => void) => n(),
  getTenantContext: (req: any) => ({ organizationId: String(req.tenantContext.organizationId) }),
}));

const recordGovernedAction = vi.hoisted(() => vi.fn());
vi.mock('../c2c/actions', () => ({ recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...a) }));

/** The shared pool (server/db.ts), routed to the same PGlite. Set in beforeAll. */
const sharedPool = vi.hoisted(() => ({ query: null as null | ((cfg: unknown, values?: unknown[]) => Promise<unknown>) }));
vi.mock('../../db', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pool: { query: (cfg: unknown, values?: unknown[]) => sharedPool.query!(cfg, values) },
}));

import ctqFactorsRouter from '../tenant-ctq-factors';
import sectionGatingRouter from '../tenant-section-gating';
import qualityValidationRouter from '../tenant-quality-validation';
import qualityRouter from '../quality-management-api';
import * as governedQmsWriteModule from '../../services/qms/governed-qms-write';
import * as part11GovernedActorModule from '../../services/part11/governed-actor';

const ORG = 7;
const OTHER = 9;
const USER = 11;
const REASON = 'Duplicate of the endpoint-definition factor; retiring it.';

const MOUNTS = ['/api/tenant-ctq-factors', '/api/quality/ctq-factors'] as const;
const GATING_MOUNTS = ['/api/tenant-section-gating', '/api/quality/section-gating'] as const;
const VALIDATION_MOUNTS = ['/api/tenant-quality-validation', '/api/quality/validation'] as const;

/* ── The real DDL ─────────────────────────────────────────────────────────── */
const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'migrations', '0000_sweet_joseph.sql'),
  'utf8',
);
function createTable(name: string): string {
  const m = MIGRATION.match(new RegExp(`CREATE TABLE "${name}" \\([\\s\\S]*?\\n\\);`));
  if (!m) throw new Error(`CREATE TABLE "${name}" not found in 0000_sweet_joseph.sql`);
  return m[0];
}
/** The foreign keys among these four tables (organizations / users are not built here). */
const FKS = MIGRATION.split('\n')
  .filter((l) =>
    /^ALTER TABLE "(ctq_factors|qmp_section_gating|qmp_traceability_matrix)" ADD CONSTRAINT \S+ FOREIGN KEY .* REFERENCES "public"\."(quality_management_plans|ctq_factors)"/.test(l),
  )
  .map((l) => l.replace('--> statement-breakpoint', ''));
const DDL = [
  ...['quality_management_plans', 'ctq_factors', 'qmp_section_gating', 'qmp_traceability_matrix'].map(createTable),
  ...FKS,
].join('\n');

/* ── The recording clients ────────────────────────────────────────────────── */
let pg: PGlite;
let log: string[] = [];
/** Every statement as sent — tag, SQL text and bound values — in the order they ran. */
let stmts: Array<{ tag: string; text: string; params: unknown[] }> = [];
/** When set, the next COMMIT fails the way a dropped connection does. */
let failCommit = false;

const RAW = (v: string) => v;
const PARSERS = { 1114: RAW, 1184: RAW, 1082: RAW };

function tag(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (/^begin/i.test(t)) return 'BEGIN';
  if (/^commit/i.test(t)) return 'COMMIT';
  if (/^rollback/i.test(t)) return 'ROLLBACK';
  if (/set_config\('app\.current_tenant_id'/i.test(t)) return 'TENANT';
  if (/ledger_probe/.test(t)) return 'LEDGER';
  if (/^insert into "?ctq_factors"?/i.test(t)) return 'INSERT_FACTOR';
  if (/^update "?ctq_factors"?/i.test(t)) return 'UPDATE_FACTOR';
  if (/^delete from "?ctq_factors"?/i.test(t)) return 'DELETE_FACTOR';
  if (/^select .* from "?ctq_factors"? .* for update$/i.test(t)) return 'LOCK_FACTOR';
  if (/^select .* from "?ctq_factors"?/i.test(t)) return 'SELECT_FACTOR';
  if (/from "?qmp_traceability_matrix"?/i.test(t)) return 'SELECT_TRACE';
  if (/^(insert into|update) "?qmp_section_gating"?/i.test(t)) return 'WRITE_GATING';
  if (/from "?qmp_section_gating"?/i.test(t)) return 'SELECT_GATING';
  if (/from "?quality_management_plans"?/i.test(t)) return 'SELECT_PLAN';
  return t.slice(0, 40);
}

async function run(prefix: string, textOrConfig: unknown, values?: unknown[]) {
  const text = typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text: string }).text;
  const params = values ?? (typeof textOrConfig === 'string' ? undefined : (textOrConfig as { values?: unknown[] }).values);
  const rowMode = typeof textOrConfig === 'string' ? undefined : (textOrConfig as { rowMode?: string }).rowMode;
  log.push(prefix + tag(text));
  stmts.push({ tag: prefix + tag(text), text, params: params ?? [] });
  if (failCommit && /^\s*commit/i.test(text)) {
    failCommit = false;
    throw Object.assign(new Error('Connection terminated unexpectedly'), { code: undefined });
  }
  const r = await pg.query(text, (params ?? []) as unknown[], {
    ...(rowMode === 'array' ? { rowMode: 'array' as const } : {}),
    parsers: PARSERS,
  });
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length, fields: r.fields ?? [] };
}

/** The request-scoped `req.dbClient`: one connection, every statement logged. */
const dbClient = { query: (t: unknown, v?: unknown[]) => run('', t, v) };

function appAs(org: number, role = 'admin', user: number | null = USER) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // What authMiddleware + establishRequestTenantScope set (server/auth.ts).
    Object.assign(req as any, {
      userRole: role,
      userId: user,
      tenantId: org,
      tenantContext: { organizationId: org, userId: user, role },
      dbClient,
    });
    next();
  });
  // Both mount families, exactly as the two bootstrap files mount them.
  app.use('/api/tenant-section-gating', sectionGatingRouter);
  app.use('/api/tenant-quality-validation', qualityValidationRouter);
  app.use('/api/tenant-ctq-factors', ctqFactorsRouter);
  app.use('/api/quality', qualityRouter);
  return app;
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */
let planId = 0;
let otherPlanId = 0;
let factorA = 0;
let factorB = 0;
let otherFactor = 0;

async function insertFactor(org: number, qmp: number, name: string): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO ctq_factors (organization_id, qmp_id, name, description, category, risk_level, applicable_section, validation_criteria)
     VALUES ($1, $2, $3, 'Primary and secondary endpoints are defined', 'clinical', 'high', 'benefit-risk', 'endpoint')
     RETURNING id`,
    [org, qmp, name],
  );
  return r.rows[0].id;
}
async function factor(id: number) {
  const r = await pg.query<{ id: number; name: string; status: string; organization_id: number }>(
    `SELECT id, name, status, organization_id FROM ctq_factors WHERE id = $1`, [id],
  );
  return r.rows[0] ?? null;
}
async function factorCount() {
  const r = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ctq_factors`);
  return r.rows[0].n;
}
async function gatingRule(ids: unknown[], allowOverride = false) {
  await pg.query(
    `INSERT INTO qmp_section_gating (organization_id, qmp_id, section_key, section_name, required_ctq_factor_ids, allow_override)
     VALUES ($1, $2, 'benefit-risk', 'Benefit-Risk', $3, $4)`,
    [ORG, planId, JSON.stringify(ids), allowOverride],
  );
}
/**
 * The value a statement binds to `"<table>"."<column>" = $n` in its WHERE
 * clause, or undefined when the statement has no such predicate — how "this
 * statement is scoped to the caller's organization" is read off the SQL itself.
 */
function boundTo(stmt: { text: string; params: unknown[] }, table: string, column: string): unknown {
  const m = stmt.text.match(new RegExp(`"${table}"\\."${column}" = \\$(\\d+)`));
  return m ? stmt.params[Number(m[1]) - 1] : undefined;
}
const writes = () => log.filter((t) => /INSERT|UPDATE|DELETE|WRITE_GATING/.test(t));
/** The statements that matter for the ceremony, in the order they ran. */
const ceremony = () => log.filter((t) => ['BEGIN', 'TENANT', 'DELETE_FACTOR', 'LEDGER', 'COMMIT', 'ROLLBACK'].includes(t));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  sharedPool.query = (cfg, values) => run('POOL:', cfg, values);
}, 60_000);
afterAll(async () => { await pg.close(); });

beforeEach(async () => {
  recordGovernedAction.mockReset();
  recordGovernedAction.mockImplementation(async (client: { query: (s: string) => Promise<unknown> }) => {
    await client.query('SELECT 1 AS ledger_probe');
    return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'abc' };
  });
  failCommit = false;
  await pg.exec(`DELETE FROM qmp_traceability_matrix; DELETE FROM qmp_section_gating; DELETE FROM ctq_factors; DELETE FROM quality_management_plans;`);
  const p = await pg.query<{ id: number }>(
    `INSERT INTO quality_management_plans (organization_id, name, version, status) VALUES ($1, 'CER Quality Plan', '1.0', 'draft'), ($2, 'Other org plan', '1.0', 'draft') RETURNING id`,
    [ORG, OTHER],
  );
  [planId, otherPlanId] = p.rows.map((r) => r.id);
  factorA = await insertFactor(ORG, planId, 'Endpoint definitions');
  factorB = await insertFactor(ORG, planId, 'Adverse event coding');
  otherFactor = await insertFactor(OTHER, otherPlanId, 'Other org factor');
  log = [];
  stmts = [];
});

it('builds the four tables from the real migration, with the traceability -> ctq_factors foreign key', () => {
  expect(FKS).toHaveLength(4);
  expect(FKS.some((l) => /"qmp_traceability_matrix".*REFERENCES "public"\."ctq_factors"/.test(l))).toBe(true);
  expect(createTable('ctq_factors')).toMatch(/"qmp_id" integer NOT NULL/);
  expect(createTable('ctq_factors')).not.toMatch(/mitigation_strategy/);
});

it('the QMS ceremony exports no helper under a name the part-11 actor resolver already uses', () => {
  // part11/governed-actor.ts `governedActor(userId, component)` returns an
  // actor; the QMS helper answers 401 as a side effect. One name for two
  // contracts lets an auto-import pick the wrong one.
  const qms = Object.keys(governedQmsWriteModule);
  const part11 = Object.keys(part11GovernedActorModule);
  expect(qms.filter((name) => part11.includes(name))).toEqual([]);
  expect(qms).toEqual(expect.arrayContaining(['governedQmsActor', 'governedQmsReason', 'governedQmsWrite']));
});

/* ── Q1 ───────────────────────────────────────────────────────────────────── */
describe('Q1 — CTQ-factor writers that never saved anything refuse instead of claiming success', () => {
  const NEVER_SAVED = { error: 'NOT_AVAILABLE' };

  it.each(MOUNTS)('POST %s/:tenantId/ctq-factors: 501, not a 201 with nothing saved', async (mount) => {
    const res = await request(appAs(ORG))
      .post(`${mount}/${ORG}/ctq-factors`)
      .send({ name: 'Endpoint definitions v2', category: 'clinical', sectionCode: 'benefit-risk', riskLevel: 'high' });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject(NEVER_SAVED);
    expect(res.body.message).toMatch(/Nothing was saved\.$/);
    expect(await factorCount()).toBe(3);
    expect(writes()).toEqual([]);
  });

  it.each(MOUNTS)('PATCH %s/:tenantId/ctq-factors/:factorId: 501, not a 200 with the row unchanged', async (mount) => {
    const res = await request(appAs(ORG)).patch(`${mount}/${ORG}/ctq-factors/${factorA}`).send({ name: 'Renamed factor' });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject(NEVER_SAVED);
    expect(res.body.message).toMatch(/Nothing was saved\.$/);
    expect((await factor(factorA))?.name).toBe('Endpoint definitions');
    expect(writes()).toEqual([]);
  });

  it('batch update-status: 501, not `success: true` with every status unchanged', async () => {
    const res = await request(appAs(ORG))
      .post(`/api/tenant-ctq-factors/${ORG}/ctq-factors/batch`)
      .send({ operation: 'update-status', factorIds: [factorA, factorB], data: { active: false } });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject(NEVER_SAVED);
    expect(res.body.success).toBeUndefined();
    expect((await factor(factorA))?.status).toBe('active');
    expect((await factor(factorB))?.status).toBe('active');
    expect(writes()).toEqual([]);
  });

  it('batch clone-template: 501, not `success: true` with nothing cloned (and no org id read from the body)', async () => {
    const res = await request(appAs(ORG))
      .post(`/api/tenant-ctq-factors/${ORG}/ctq-factors/batch`)
      .send({ operation: 'clone-template', factorIds: [factorA], data: { templateId: OTHER } });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject(NEVER_SAVED);
    expect(await factorCount()).toBe(3);
    // It used to read the template organization's factors straight from the body's id.
    expect(log).toEqual([]);
  });

  it('batch apply-to-sections: 501, not a 500', async () => {
    const res = await request(appAs(ORG))
      .post(`/api/quality/ctq-factors/${ORG}/ctq-factors/batch`)
      .send({ operation: 'apply-to-sections', factorIds: [factorA], data: { sections: ['safety', 'equivalence'] } });
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject(NEVER_SAVED);
    expect(await factorCount()).toBe(3);
    expect(writes()).toEqual([]);
  });
});

/* ── Q2 ───────────────────────────────────────────────────────────────────── */
// One describe per concern; `del` is shared by all four, so it lives here.
const Q2 = 'Q2 — DELETE /:tenantId/ctq-factors/:factorId, the one governed CTQ-factor delete';
const del = (app: express.Express, id: number, body: Record<string, unknown> = { reason: REASON }, mount: string = MOUNTS[0], tenant = ORG) =>
  request(app).delete(`${mount}/${tenant}/ctq-factors/${id}`).send(body);

describe(`${Q2}: authority and input refusals`, () => {
  it('refuses a viewer 403 the way every governed write does, before anything is read', async () => {
    const res = await del(appAs(ORG, 'viewer'), factorA);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Insufficient permissions' });
    expect(await factor(factorA)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it.each(['member', 'manager'])('refuses a %s 403: deleting a CTQ factor is admin-only', async (role) => {
    const res = await del(appAs(ORG, role), factorA);
    expect(res.status).toBe(403);
    expect(await factor(factorA)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it("refuses 403 when the path names another organization than the caller's", async () => {
    const res = await del(appAs(ORG), otherFactor, { reason: REASON }, MOUNTS[0], OTHER);
    expect(res.status).toBe(403);
    expect(await factor(otherFactor)).not.toBeNull();
    expect(log).toEqual([]);
  });

  it.each([[{}], [{ reason: '   short    ' }]])('refuses %j 400 REASON_REQUIRED: nothing read, nothing written', async (body) => {
    const res = await del(appAs(ORG), factorA, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(res.body.message).toMatch(/Nothing was changed\.$/);
    expect(await factor(factorA)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it('refuses 401 with no acting user rather than ledgering an unattributed delete', async () => {
    const res = await del(appAs(ORG, 'admin', null), factorA);
    expect(res.status).toBe(401);
    expect(await factor(factorA)).not.toBeNull();
    expect(log).toEqual([]);
  });

  it("404s on another organization's factor: nothing deleted, nothing ledgered", async () => {
    const res = await del(appAs(ORG), otherFactor);
    expect(res.status).toBe(404);
    expect(await factor(otherFactor)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'ROLLBACK']);
  });
});

describe(`${Q2}: in-use refusals`, () => {
  it('refuses 409 FACTOR_IN_USE while the traceability matrix references the factor', async () => {
    await pg.query(
      `INSERT INTO qmp_traceability_matrix (organization_id, qmp_id, ctq_factor_id, requirement_id, requirement_text)
       VALUES ($1, $2, $3, 'REQ-7', 'Endpoints are pre-specified')`,
      [ORG, planId, factorA],
    );
    const res = await del(appAs(ORG), factorA);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('FACTOR_IN_USE');
    expect(res.body.message).toMatch(/traceability/);
    expect(res.body.message).toMatch(/Nothing was deleted\.$/);
    expect(await factor(factorA)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'ROLLBACK']);
  });

  it('a reference the org-scoped check cannot see still stops the delete: the foreign key answers 409, not a 500', async () => {
    // Another organization's traceability row pointing at this factor: invisible
    // to the org-scoped check, but the FK (0000_sweet_joseph.sql:6782) is global.
    await pg.query(
      `INSERT INTO qmp_traceability_matrix (organization_id, qmp_id, ctq_factor_id, requirement_id, requirement_text)
       VALUES ($1, $2, $3, 'REQ-X', 'Cross-organization reference')`,
      [OTHER, otherPlanId, factorA],
    );
    const res = await del(appAs(ORG), factorA);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('FACTOR_IN_USE');
    expect(res.body.message).toMatch(/^The CTQ factor was not deleted: .* still refer to it\. Nothing was changed\.$/);
    expect(await factor(factorA)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'DELETE_FACTOR', 'ROLLBACK']);
  });

  // required_ctq_factor_ids is a plain json array with no foreign key: a delete
  // the database would allow leaves the gate requiring a factor that is gone.
  it.each([
    ['a number', (id: number) => [factorB, id]],
    ['a string', (id: number) => [String(id)]],
  ])('refuses 409 FACTOR_IN_USE while a section-gating rule requires it (id stored as %s)', async (_label, ids) => {
    await gatingRule(ids(factorA));
    const res = await del(appAs(ORG), factorA);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('FACTOR_IN_USE');
    expect(res.body.message).toMatch(/section gating rule \(benefit-risk\)/);
    expect(await factor(factorA)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'ROLLBACK']);
  });
});

describe(`${Q2}: the happy path and ledger`, () => {
  it("another organization's gating rule listing the same id neither blocks the delete nor leaks that rule's section", async () => {
    // Ids are one global sequence, so another organization's rule can carry
    // this factor's id in its JSON list. Its rule is not this organization's
    // gate: counting it would refuse a legitimate delete, and the refusal would
    // name the other organization's section.
    await pg.query(
      `INSERT INTO qmp_section_gating (organization_id, qmp_id, section_key, section_name, required_ctq_factor_ids, allow_override)
       VALUES ($1, $2, 'other-org-confidential-section', 'Other org section', $3, false)`,
      [OTHER, otherPlanId, JSON.stringify([factorA])],
    );
    const res = await del(appAs(ORG), factorA);
    expect(JSON.stringify(res.body)).not.toMatch(/other-org-confidential-section/);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, id: factorA });
    expect(await factor(factorA)).toBeNull();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'DELETE_FACTOR', 'LEDGER', 'COMMIT']);
    // The gating check itself is bound to the caller's organization.
    const gatingCheck = stmts.find((s) => s.tag === 'SELECT_GATING')!;
    expect(boundTo(gatingCheck, 'qmp_section_gating', 'organization_id')).toBe(ORG);
  });

  it.each(MOUNTS)('through %s: deletes exactly one row in ONE transaction, the ledger carrying the locked row', async (mount) => {
    await gatingRule([factorB]); // another factor's gate does not block this one
    const res = await del(appAs(ORG), factorA, { reason: `  ${REASON}  ` }, mount);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: true, id: factorA });

    expect(await factor(factorA)).toBeNull();
    expect(await factor(factorB)).not.toBeNull();
    expect(await factor(otherFactor)).not.toBeNull();
    expect(await factorCount()).toBe(2);

    // The row is locked before the checks, and the delete runs after them.
    expect(log.indexOf('LOCK_FACTOR')).toBeGreaterThan(log.indexOf('TENANT'));
    expect(log.indexOf('LOCK_FACTOR')).toBeLessThan(log.indexOf('DELETE_FACTOR'));
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'DELETE_FACTOR', 'LEDGER', 'COMMIT']);
    expect(log.filter((t) => t.startsWith('POOL:'))).toEqual([]);

    // The DELETE itself names the row by id AND organization — not only the
    // locked SELECT before it — so it can never remove another tenant's row
    // wherever row-level security is not enforced.
    const deleteStmt = stmts.find((s) => s.tag === 'DELETE_FACTOR')!;
    expect(boundTo(deleteStmt, 'ctq_factors', 'id')).toBe(factorA);
    expect(boundTo(deleteStmt, 'ctq_factors', 'organization_id')).toBe(ORG);

    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const [client, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    expect(client).toBe(dbClient);
    expect(arg).toMatchObject({ orgId: ORG, userId: USER, command: 'delete', target: `ctq-factor:${factorA}`, domain: 'qms', reason: REASON });
    const snap = JSON.parse(JSON.stringify(arg.payload.snapshot)); // as the ledger stores it
    expect(snap).toMatchObject({
      id: factorA, organizationId: ORG, qmpId: planId, name: 'Endpoint definitions',
      description: 'Primary and secondary endpoints are defined', category: 'clinical', riskLevel: 'high',
      applicableSection: 'benefit-risk', validationCriteria: 'endpoint', status: 'active',
      requirementType: 'mandatory', failureAction: 'block',
    });
  });
});

describe(`${Q2}: failure outcomes`, () => {
  it('keeps the factor and answers 500 AUDIT_WRITE_FAILED when the ledger write fails', async () => {
    recordGovernedAction.mockImplementation(async (client: { query: (s: string) => Promise<unknown> }) => {
      await client.query('SELECT 1 AS ledger_probe');
      throw new Error('audit chain unavailable');
    });
    const res = await del(appAs(ORG), factorA);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(res.body.message).toMatch(/Nothing was changed\.$/);
    expect(await factor(factorA)).not.toBeNull();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'DELETE_FACTOR', 'LEDGER', 'ROLLBACK']);
  });

  it('a COMMIT that fails is reported as unknown, never as "nothing was changed"', async () => {
    failCommit = true;
    const res = await del(appAs(ORG), factorA);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('OUTCOME_UNKNOWN');
    expect(res.body.message).toMatch(/could not be confirmed/);
    expect(res.body.message).not.toMatch(/Nothing was changed/);
  });
});

/* ── Q3 ───────────────────────────────────────────────────────────────────── */
describe('Q3 — the duplicate CTQ-factor writers in tenant-section-gating.ts are gone', () => {
  it.each(GATING_MOUNTS)('DELETE %s/api/tenant-ctq-factors/:id no longer deletes anything, not even for a viewer: 404', async (mount) => {
    const res = await request(appAs(ORG, 'viewer')).delete(`${mount}/api/tenant-ctq-factors/${factorA}`).send({});
    // The row first: before the change this viewer's request destroyed it.
    expect(await factor(factorA)).not.toBeNull();
    expect(writes()).toEqual([]);
    expect(res.status).toBe(404);
  });

  it.each(GATING_MOUNTS)('POST %s/api/tenant-ctq-factors is gone: 404, nothing written', async (mount) => {
    const res = await request(appAs(ORG))
      .post(`${mount}/api/tenant-ctq-factors`)
      .send({ name: 'Endpoint definitions v2', riskLevel: 'high', category: 'clinical', applicableSection: 'benefit-risk', mitigationStrategy: 'n/a' });
    expect(res.status).toBe(404);
    expect(await factorCount()).toBe(3);
    expect(writes()).toEqual([]);
  });

  it.each(GATING_MOUNTS)('POST %s/api/tenant-section-gating/:qmpId/update refuses 501 before touching the pool', async (mount) => {
    const res = await request(appAs(ORG))
      .post(`${mount}/api/tenant-section-gating/${planId}/update`)
      .send({ sectionKey: 'benefit-risk', requiredLevel: 'hard', active: true });
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('NOT_AVAILABLE');
    expect(res.body.message).toMatch(/Nothing was saved\.$/);
    expect(log).toEqual([]);
  });
});

/* ── Q4 ───────────────────────────────────────────────────────────────────── */
describe('Q4 — POST /request-waiver no longer invents a pending waiver', () => {
  it.each(VALIDATION_MOUNTS)('%s/request-waiver: 501, no fabricated waiver in the body', async (mount) => {
    await gatingRule([factorA], true);
    const res = await request(appAs(ORG, 'member'))
      .post(`${mount}/request-waiver`)
      .send({ qmpId: planId, sectionCode: 'benefit-risk', justification: 'Post-market data covers the missing endpoint.' });
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('NOT_AVAILABLE');
    expect(res.body.message).toMatch(/Nothing was submitted\.$/);
    expect(res.body.waiver).toBeUndefined();
    expect(res.body.success).toBeUndefined();
    expect(writes()).toEqual([]);
  });
});
