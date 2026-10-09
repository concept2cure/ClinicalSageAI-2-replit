/**
 * POST /api/quality/plans, PATCH /api/quality/plans/:id, DELETE /api/quality/plans/:id
 *
 * A Quality Management Plan sets the hard / soft / info gates every governed
 * document is validated against, so creating, changing (activating) or deleting
 * one is a governed change to the document-control regime. These routes did
 * bare Drizzle writes with no reason and no ledger row: a plan could be
 * activated with one click and nothing recorded who did it or why.
 *
 * What is pinned here:
 *   - no reason (or one under 8 characters after trimming) is a 400 and nothing
 *     is written — no plan row, no ledger call, no transaction opened;
 *   - the happy path runs BEGIN → tenant vars → plan write → ledger → COMMIT on
 *     ONE client, the request-scoped connection the Drizzle write also uses;
 *   - a ledger failure rolls the plan write back and answers 5xx — the plan is
 *     exactly as it was before the request;
 *   - tenant scoping is unchanged: another organization's plan is a 404 and
 *     nothing is written;
 *   - a `viewer` (the one org role that exists to not write) is refused 403 by
 *     requireEditorAccess before anything is read or written (§11.10(g));
 *   - the ledger keeps what the change overwrote (§11.10(e)): every changed
 *     field's before and after value on an update, the whole row on create and
 *     on delete, so the plan's history is reconstructable from the ledger alone;
 *   - the plan whose gates are in force (status 'active') cannot be deleted —
 *     it is archived through the governed PATCH, which keeps the record.
 *
 * The store is in-process PGlite reached through REAL Drizzle over a recording
 * pg-style client installed as `req.dbClient` — the same shape the request
 * scope middleware installs — so "same transaction" is proven against real SQL
 * transactions, not asserted about a mock. `recordGovernedAction` is a spy (its
 * own contract is proven in its own suite) that issues a probe statement on the
 * client it was handed, so its position in the statement log is observable.
 */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../middleware/tenantContext', () => ({
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../tenant-ctq-factors', async () => ({ default: (await import('express')).Router() }));
vi.mock('../tenant-section-gating', async () => ({ default: (await import('express')).Router() }));
vi.mock('../tenant-quality-validation', async () => ({ default: (await import('express')).Router() }));

const recordGovernedAction = vi.hoisted(() => vi.fn());
vi.mock('../c2c/actions', () => ({ recordGovernedAction: (...a: unknown[]) => recordGovernedAction(...a) }));

import qualityRouter from '../quality-management-api';

const ORG = 7;
const OTHER = 9;
const USER = 11;
const REASON = 'Activating the 2026 CER plan for the Q4 filings.';

let pg: PGlite;
let log: string[] = [];
/** When set, the next COMMIT fails the way a dropped connection does. */
let failCommit = false;

/* Timestamps come back as the raw text Postgres sends, as they do from
   node-postgres with Drizzle's type overrides, so Drizzle's own mapping runs. */
const RAW = (v: string) => v;
const PARSERS = { 1114: RAW, 1184: RAW, 1082: RAW };

function tag(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (/^begin/i.test(t)) return 'BEGIN';
  if (/^commit/i.test(t)) return 'COMMIT';
  if (/^rollback/i.test(t)) return 'ROLLBACK';
  if (/set_config\('app\.current_tenant_id'/i.test(t)) return 'TENANT';
  if (/ledger_probe/.test(t)) return 'LEDGER';
  if (/^insert into "quality_management_plans"/i.test(t)) return 'INSERT_PLAN';
  if (/^update "quality_management_plans"/i.test(t)) return 'UPDATE_PLAN';
  if (/^delete from "quality_management_plans"/i.test(t)) return 'DELETE_PLAN';
  if (/^select .* from "quality_management_plans"/i.test(t)) return 'SELECT_PLAN';
  if (/^select .* from "qmp_section_gating"/i.test(t)) return 'SELECT_GATING';
  return t.slice(0, 40);
}

/** The request-scoped `req.dbClient`: one connection, every statement logged. */
const dbClient = {
  query: async (textOrConfig: unknown, values?: unknown[]) => {
    const text = typeof textOrConfig === 'string' ? textOrConfig : (textOrConfig as { text: string }).text;
    const rowMode = typeof textOrConfig === 'string' ? undefined : (textOrConfig as { rowMode?: string }).rowMode;
    log.push(tag(text));
    if (failCommit && /^\s*commit/i.test(text)) {
      failCommit = false;
      throw Object.assign(new Error('Connection terminated unexpectedly'), { code: undefined });
    }
    const r = await pg.query(text, (values ?? []) as unknown[], {
      ...(rowMode === 'array' ? { rowMode: 'array' as const } : {}),
      parsers: PARSERS,
    });
    return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length, fields: r.fields ?? [] };
  },
};

function appAs(org: number, user: number | null = USER, role = 'member') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // `userRole` is what establishRequestTenantScope sets from organization_users.role.
    (req as any).userRole = role;
    // authMiddleware sets req.userId (server/auth.ts); governedActorId reads it.
    (req as any).userId = user;
    (req as any).tenantContext = { organizationId: org, userId: user, role };
    (req as any).dbClient = dbClient;
    next();
  });
  app.use('/api/quality', qualityRouter);
  return app;
}

const DDL = `
CREATE TABLE quality_management_plans (
  id serial PRIMARY KEY, organization_id integer NOT NULL, client_workspace_id integer,
  name text NOT NULL, description text, version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'draft', approved_by_id integer, approved_at timestamp,
  effective_date timestamp, expiry_date timestamp, review_frequency_days integer DEFAULT 365,
  last_review_date timestamp, next_review_date timestamp, review_reminder_days integer DEFAULT 30,
  created_by_id integer, settings json, metadata json,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE qmp_section_gating (
  id serial PRIMARY KEY, organization_id integer NOT NULL, qmp_id integer NOT NULL,
  section_key text NOT NULL, section_name text NOT NULL, required_ctq_factor_ids json NOT NULL,
  minimum_mandatory_completion integer DEFAULT 100, minimum_recommended_completion integer DEFAULT 80,
  allow_override boolean DEFAULT false, override_requires_approval boolean DEFAULT true,
  override_requires_reason boolean DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
-- ctq_factors.qmp_id references the plan with NO ACTION (shared/schema.ts).
CREATE TABLE ctq_factors (
  id serial PRIMARY KEY, organization_id integer NOT NULL,
  qmp_id integer REFERENCES quality_management_plans(id), name text NOT NULL
);
`;

let planId = 0;

async function planRow(id: number) {
  const r = await pg.query<{ status: string; name: string; organization_id: number }>(
    `SELECT status, name, organization_id FROM quality_management_plans WHERE id = $1`, [id],
  );
  return r.rows[0] ?? null;
}
async function planCount() {
  const r = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM quality_management_plans`);
  return r.rows[0].n;
}
/** The statements that matter for the ceremony, in the order they ran. */
const ceremony = () => log.filter((t) => ['BEGIN', 'TENANT', 'INSERT_PLAN', 'UPDATE_PLAN', 'DELETE_PLAN', 'LEDGER', 'COMMIT', 'ROLLBACK'].includes(t));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
}, 60_000);
afterAll(async () => { await pg.close(); });

beforeEach(async () => {
  recordGovernedAction.mockReset();
  recordGovernedAction.mockImplementation(async (client: { query: (s: string) => Promise<unknown> }) => {
    await client.query('SELECT 1 AS ledger_probe');
    return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'abc' };
  });
  await pg.exec(`DELETE FROM qmp_section_gating; DELETE FROM ctq_factors; DELETE FROM quality_management_plans;`);
  failCommit = false;
  const r = await pg.query<{ id: number }>(
    `INSERT INTO quality_management_plans (organization_id, name, version, status) VALUES ($1, 'CER Quality Plan', '1.0', 'draft') RETURNING id`,
    [ORG],
  );
  planId = r.rows[0].id;
  log = [];
});

describe('POST /api/quality/plans — governed create', () => {
  it('refuses a create with no reason: 400, nothing written, no transaction opened', async () => {
    const res = await request(appAs(ORG)).post('/api/quality/plans').send({ name: 'New Plan', version: '1.0' });
    expect(res.status).toBe(400);
    expect(await planCount()).toBe(1);
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).not.toContain('BEGIN');
  });

  it('refuses a reason that is under 8 characters once trimmed', async () => {
    const res = await request(appAs(ORG)).post('/api/quality/plans').send({ name: 'New Plan', reason: '   short    ' });
    expect(res.status).toBe(400);
    expect(await planCount()).toBe(1);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('writes the plan and the ledger pair in ONE transaction on the request client', async () => {
    const res = await request(appAs(ORG)).post('/api/quality/plans').send({ name: 'New Plan', version: '2.0', reason: `  ${REASON}  ` });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Plan');
    const id = res.body.id as number;
    expect(await planRow(id)).toMatchObject({ name: 'New Plan', organization_id: ORG });

    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'INSERT_PLAN', 'LEDGER', 'COMMIT']);
    expect(recordGovernedAction).toHaveBeenCalledTimes(1);
    const [client, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    expect(client).toBe(dbClient);
    expect(arg).toMatchObject({ orgId: ORG, userId: USER, command: 'create', target: `qmp-plan:${id}`, domain: 'qms', reason: REASON });
    // The whole row as created, so later updates' "from" values have a start.
    expect(arg.payload).toMatchObject({ activated: false, snapshot: { id, name: 'New Plan', version: '2.0', status: 'draft', organizationId: ORG, createdById: USER } });
  });

  it('rolls the create back and answers 5xx when the ledger write fails', async () => {
    recordGovernedAction.mockImplementation(async (client: { query: (s: string) => Promise<unknown> }) => {
      await client.query('SELECT 1 AS ledger_probe');
      throw new Error('audit chain unavailable');
    });
    const res = await request(appAs(ORG)).post('/api/quality/plans').send({ name: 'New Plan', reason: REASON });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await planCount()).toBe(1);
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'INSERT_PLAN', 'LEDGER', 'ROLLBACK']);
  });

  it('refuses a create with no acting user rather than ledgering an unattributed change', async () => {
    const res = await request(appAs(ORG, null)).post('/api/quality/plans').send({ name: 'New Plan', reason: REASON });
    expect(res.status).toBe(401);
    expect(await planCount()).toBe(1);
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/quality/plans/:id — governed update / activation', () => {
  it('refuses an activation with no reason: 400, plan unchanged, no ledger', async () => {
    const res = await request(appAs(ORG)).patch(`/api/quality/plans/${planId}`).send({ status: 'active' });
    expect(res.status).toBe(400);
    expect((await planRow(planId))?.status).toBe('draft');
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).not.toContain('UPDATE_PLAN');
  });

  it('activates in ONE transaction and the ledger payload says it was an activation', async () => {
    const res = await request(appAs(ORG)).patch(`/api/quality/plans/${planId}`).send({ status: 'active', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect((await planRow(planId))?.status).toBe('active');

    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'UPDATE_PLAN', 'LEDGER', 'COMMIT']);
    const [client, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    expect(client).toBe(dbClient);
    expect(arg).toMatchObject({ orgId: ORG, userId: USER, command: 'update', target: `qmp-plan:${planId}`, domain: 'qms', reason: REASON });
    expect(arg.payload).toEqual({ fields: ['status'], changes: { status: { from: 'draft', to: 'active' } }, activated: true });
  });

  it('ledgers the before and after value of EVERY changed field, metadata included', async () => {
    await pg.query(
      `UPDATE quality_management_plans SET description = 'Original scope', metadata = '{"allowWaivers":false,"owner":"QA"}' WHERE id = $1`,
      [planId],
    );
    const res = await request(appAs(ORG))
      .patch(`/api/quality/plans/${planId}`)
      .send({ name: 'Renamed plan', description: 'Narrowed scope', allowWaivers: true, reason: REASON });
    expect(res.status).toBe(200);

    const [, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    // Without these the overwritten values would exist nowhere (§11.10(e)).
    expect(arg.payload.changes).toEqual({
      name: { from: 'CER Quality Plan', to: 'Renamed plan' },
      description: { from: 'Original scope', to: 'Narrowed scope' },
      metadata: { from: { allowWaivers: false, owner: 'QA' }, to: { allowWaivers: true, owner: 'QA' } },
    });
    expect(arg.payload.activated).toBe(false);
  });

  it('rolls the activation back and answers 5xx when the ledger write fails', async () => {
    recordGovernedAction.mockRejectedValue(new Error('audit chain unavailable'));
    const res = await request(appAs(ORG)).patch(`/api/quality/plans/${planId}`).send({ status: 'active', reason: REASON });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect((await planRow(planId))?.status).toBe('draft');
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'UPDATE_PLAN', 'ROLLBACK']);
  });

  it('refuses an update that changes nothing rather than ledgering a change that did not happen', async () => {
    const res = await request(appAs(ORG)).patch(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBe(400);
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).not.toContain('UPDATE_PLAN');
  });

  it('refuses an update to the values the plan already holds: a double click is not a second change', async () => {
    // The plan is 'draft'. Re-sending 'draft' (a stale board, a second click)
    // would otherwise ledger draft -> draft.
    const res = await request(appAs(ORG)).patch(`/api/quality/plans/${planId}`).send({ status: 'draft', reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_CHANGES');
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'ROLLBACK']);
  });

  it('ledgers only the fields that actually changed', async () => {
    const res = await request(appAs(ORG))
      .patch(`/api/quality/plans/${planId}`)
      .send({ name: 'CER Quality Plan', version: '2.0', reason: REASON });
    expect(res.status).toBe(200);
    const [, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    expect(arg.payload.fields).toEqual(['version']);
    expect(arg.payload.changes).toEqual({ version: { from: '1.0', to: '2.0' } });
  });

  it('a COMMIT that fails is reported as unknown, never as "nothing was changed"', async () => {
    failCommit = true;
    const res = await request(appAs(ORG)).patch(`/api/quality/plans/${planId}`).send({ status: 'active', reason: REASON });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('OUTCOME_UNKNOWN');
    expect(res.body.message).toMatch(/could not be confirmed/);
    expect(res.body.message).not.toMatch(/Nothing was changed/);
  });

  it("404s on another organization's plan and writes nothing", async () => {
    const res = await request(appAs(OTHER)).patch(`/api/quality/plans/${planId}`).send({ status: 'active', reason: REASON });
    expect(res.status).toBe(404);
    expect((await planRow(planId))?.status).toBe('draft');
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).not.toContain('UPDATE_PLAN');
  });
});

describe('DELETE /api/quality/plans/:id — governed delete', () => {
  it('refuses a delete with no reason: 400, plan still there, no ledger', async () => {
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({});
    expect(res.status).toBe(400);
    expect(await planRow(planId)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('deletes in ONE transaction and ledgers what was deleted', async () => {
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({ reason: 'Superseded by the 2027 plan; retiring this one.' });
    expect(res.status).toBe(200);
    expect(await planRow(planId)).toBeNull();

    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'DELETE_PLAN', 'LEDGER', 'COMMIT']);
    const [client, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    expect(client).toBe(dbClient);
    expect(arg).toMatchObject({ orgId: ORG, userId: USER, command: 'delete', target: `qmp-plan:${planId}`, domain: 'qms' });
    expect(arg.payload).toMatchObject({ snapshot: { id: planId, name: 'CER Quality Plan', version: '1.0', status: 'draft' } });
  });

  it('ledgers the WHOLE deleted row, so nothing the delete destroys is lost', async () => {
    await pg.query(
      `UPDATE quality_management_plans
          SET description = 'Scope of the CER plan', settings = '{"gate":"hard"}',
              metadata = '{"allowWaivers":true}', effective_date = '2026-01-15 00:00:00',
              review_frequency_days = 180
        WHERE id = $1`,
      [planId],
    );
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBe(200);
    expect(await planRow(planId)).toBeNull();

    const [, arg] = recordGovernedAction.mock.calls[0] as [unknown, Record<string, any>];
    const snap = JSON.parse(JSON.stringify(arg.payload.snapshot)); // as the ledger stores it
    expect(snap).toMatchObject({
      id: planId, organizationId: ORG, name: 'CER Quality Plan', version: '1.0', status: 'draft',
      description: 'Scope of the CER plan', settings: { gate: 'hard' }, metadata: { allowWaivers: true },
      reviewFrequencyDays: 180,
    });
    expect(String(snap.effectiveDate)).toMatch(/^2026-01-15/);
  });

  it('refuses to delete the ACTIVE plan: 409, kept, nothing ledgered — archive it instead', async () => {
    await pg.query(`UPDATE quality_management_plans SET status = 'active' WHERE id = $1`, [planId]);
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PLAN_ACTIVE');
    expect(res.body.message).toMatch(/Archive/);
    expect((await planRow(planId))?.status).toBe('active');
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'ROLLBACK']);
  });

  it('keeps the plan and answers 5xx when the ledger write fails', async () => {
    recordGovernedAction.mockRejectedValue(new Error('audit chain unavailable'));
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await planRow(planId)).not.toBeNull();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'DELETE_PLAN', 'ROLLBACK']);
  });

  it('refuses to delete a plan section gating still uses: rolled back, nothing ledgered', async () => {
    await pg.query(
      `INSERT INTO qmp_section_gating (organization_id, qmp_id, section_key, section_name, required_ctq_factor_ids) VALUES ($1, $2, 'safety', 'Safety', '[]')`,
      [ORG, planId],
    );
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/section gating rules/);
    expect(await planRow(planId)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(ceremony()).toEqual(['BEGIN', 'TENANT', 'ROLLBACK']);
  });

  it('a plan other quality records still refer to is refused 409, not an unexplained 500', async () => {
    await pg.query(`INSERT INTO ctq_factors (organization_id, qmp_id, name) VALUES ($1, $2, 'Endpoint definitions')`, [ORG, planId]);
    const res = await request(appAs(ORG)).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PLAN_IN_USE');
    expect(res.body.message).toMatch(/still refer to it\. Nothing was changed\./);
    expect(await planRow(planId)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it("404s on another organization's plan and deletes nothing", async () => {
    const res = await request(appAs(OTHER)).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });
    expect(res.status).toBe(404);
    expect(await planRow(planId)).not.toBeNull();
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });
});

describe('QMP writes — authority check (§11.10(g))', () => {
  it('refuses a viewer on create, activate and delete: 403, nothing read or written', async () => {
    const viewer = appAs(ORG, USER, 'viewer');
    const created = await request(viewer).post('/api/quality/plans').send({ name: 'New Plan', reason: REASON });
    const activated = await request(viewer).patch(`/api/quality/plans/${planId}`).send({ status: 'active', reason: REASON });
    const deleted = await request(viewer).delete(`/api/quality/plans/${planId}`).send({ reason: REASON });

    expect([created.status, activated.status, deleted.status]).toEqual([403, 403, 403]);
    expect(await planCount()).toBe(1);
    expect((await planRow(planId))?.status).toBe('draft');
    expect(recordGovernedAction).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it('admits a manager and an admin (the gate is viewer-only, not admin-only)', async () => {
    const byManager = await request(appAs(ORG, USER, 'manager')).post('/api/quality/plans').send({ name: 'Manager Plan', reason: REASON });
    const byAdmin = await request(appAs(ORG, USER, 'admin')).patch(`/api/quality/plans/${planId}`).send({ status: 'active', reason: REASON });
    expect(byManager.status).toBe(201);
    expect(byAdmin.status).toBe(200);
  });
});
