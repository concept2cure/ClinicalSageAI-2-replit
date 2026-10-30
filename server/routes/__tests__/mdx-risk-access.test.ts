/**
 * The risk routes use the current actor and canonical durable project sharing,
 * on the request's SQL executor. The risk DDL is the shipped migration; the
 * policy helpers, filtering, joins and mutations run on PGlite, not SQL stubs.
 *
 * This is project-admission evidence, not native RLS/concurrency or electronic-
 * signature qualification. The initial editor middleware, signature transport
 * and signed-content read are isolated here; the existing signature/content-
 * lock suites exercise those ceremonies and bindings without these stubs.
 */
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignedAct } from '../governed-signed-act';

const ORG = 7;
const USER = 20;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '44444444-4444-4444-8444-444444444444';
const DELETED = '55555555-5555-4555-8555-555555555555';
const MISSING = '99999999-9999-4999-8999-999999999999';

const h = vi.hoisted(() => ({
  pg: null as unknown as PGlite,
  calls: [] as Array<{ sql: string; params: unknown[] }>,
  failAccessRead: false,
  poolEscapes: 0,
  beforeSigningRun: null as null | (() => Promise<void>),
  afterRiskRead: null as null | ((sql: string) => Promise<void>),
  signingCalls: 0,
}));

const query = async (sql: string, params: unknown[] = []) => {
  h.calls.push({ sql, params });
  if (h.failAccessRead && sql.includes('SELECT ou.role')) throw new Error('fixture access lookup unavailable');
  const result = await h.pg.query<Record<string, unknown>>(sql, params);
  await h.afterRiskRead?.(sql);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
};
const conn = { query, release: () => undefined };
const escapePool = async () => {
  h.poolEscapes += 1;
  throw new Error('Risk request escaped its pinned SQL executor');
};
vi.mock('../../db', () => ({ pool: { query: () => escapePool(), connect: () => escapePool() }, getPool: () => ({ query: () => escapePool() }), db: {} }));
vi.mock('../../middleware/orgMembership', async orig => ({
  ...(await orig<Record<string, unknown>>()),
  // Canonical current actor/edit policy is exercised downstream. The separate
  // middleware suites keep the initial session/editor boundary authoritative.
  requireEditorAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/part11/signed-content-state', () => ({ readSignedContentStates: async () => new Map() }));
vi.mock('../governed-signed-act', () => ({
  signedActAttempts: (_req: Request, _res: Response, next: NextFunction) => next(),
  signGovernedAct: async (req: Request, res: Response, act: SignedAct) => {
    h.signingCalls += 1;
    let opened = false;
    try {
      await act.precheck?.(conn as never, ORG, USER);
      await h.beforeSigningRun?.();
      await query('BEGIN');
      opened = true;
      const result = await act.run(conn as never, ORG, USER);
      await query('COMMIT');
      opened = false;
      res.status(201).json(result.body);
    } catch (error) {
      if (opened) await query('ROLLBACK');
      const e = error as { code?: string; status?: number; statusCode?: number; message?: string };
      res.status(e.status ?? e.statusCode ?? act.codeStatus[e.code ?? ''] ?? 500)
        .json({ error: e.code ?? 'SIGNING_ADMISSION_REFUSED', message: e.message });
    }
  },
}));

import riskRouter from '../mdx-risk-management';
import engineeringRouter from '../mdx-engineering';
import { getCurrentAccessibleProgramScope } from '../../services/c2c/current-program-access';
import { canAccessReportProject } from '../../services/report-os/project-access';

function app(options: { userId?: number; requestUserId?: number; staleRole?: string; noRequestDb?: boolean } = {}) {
  const application = express();
  application.use(express.json());
  application.use((req, _res, next) => {
    Object.assign(req, { organizationId: ORG, userRole: options.staleRole ?? 'member',
      user: { id: options.userId ?? USER, organizationId: ORG, role: options.staleRole ?? 'member' },
      ...(options.requestUserId === undefined ? {} : { userId: options.requestUserId }),
      ...(!options.noRequestDb ? { dbClient: conn } : {}),
    });
    next();
  });
  application.use('/api/mdx', riskRouter, engineeringRouter);
  return application;
}

const item = { hazard: 'Sensor drift', harm: 'Mis-dosing', severity: 3, probability: 2 };
const control = { description: 'Independent cross-check', controlType: 'protective_measure' };
const scope = (program = A) => `?program_id=${program}`;
function expectNoPayload(res: { status: number; body: { data?: unknown } }, status: number) {
  expect(res.status).toBe(status);
  expect(res.body.data).toBeUndefined();
}
const inserted = () => h.calls.filter(c => /^\s*(INSERT|UPDATE|DELETE)\s+(INTO\s+)?(risk_items|risk_controls)\b/i.test(c.sql));
const hazard = async (id = 1) => (await query('SELECT * FROM risk_items WHERE id=$1', [id])).rows[0];
const controlRow = async (id = 1) => (await query('SELECT * FROM risk_controls WHERE id=$1', [id])).rows[0];
const share = async (projectId: number, role = 'edit') => {
  await query("INSERT INTO project_members VALUES ($1,$2,$3,$4,'active')", [projectId, ORG, USER, role]);
};

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE users (id integer PRIMARY KEY, status text, name text, email text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    CREATE TABLE client_workspaces (id integer PRIMARY KEY, organization_id integer, status text);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      owner_id integer, created_by_id integer, settings jsonb, status text, client_workspace_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE TABLE electronic_signatures (id serial PRIMARY KEY, organization_id integer, signed_target text,
      signed_at timestamptz DEFAULT now(), is_valid boolean, superseded_by integer, verification_status text, signature_manifest text);
    INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO users (id,status) VALUES (5,'active'),(20,'active'),(80,'active');
    INSERT INTO client_workspaces VALUES (71,7,'active'),(81,8,'active');
    INSERT INTO regulatory_programs VALUES ('${A}',7,NULL),('${B}',7,NULL),('${FOREIGN}',8,NULL),('${DELETED}',7,now());
    INSERT INTO projects VALUES (11,7,'${A}',5,5,'{}','active',71),(12,7,'${B}',5,5,'{}','active',71),
      (14,8,'${FOREIGN}',80,80,'{}','active',81),(15,7,'${DELETED}',5,5,'{}','active',71);
  `);
  const migration = fs.readFileSync('migrations/20260507_mdx_beta_surfaces.sql', 'utf8');
  const riskDdl = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS risk_items ('), migration.indexOf('-- ─── Software lifecycle'));
  expect(riskDdl).toContain('CREATE TABLE IF NOT EXISTS risk_controls');
  await h.pg.exec(riskDdl);
}, 60_000);

afterAll(async () => { await h.pg?.close(); });
beforeEach(async () => {
  Object.assign(h, { failAccessRead: false, poolEscapes: 0, beforeSigningRun: null, afterRiskRead: null, signingCalls: 0 });
  await h.pg.exec(`
    TRUNCATE risk_controls,risk_items RESTART IDENTITY CASCADE;
    TRUNCATE organization_users,project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments,electronic_signatures;
    UPDATE organizations SET status='active'; UPDATE users SET status='active';
    UPDATE regulatory_programs SET deleted_at=NULL; UPDATE regulatory_programs SET deleted_at=now() WHERE id='${DELETED}';
    UPDATE projects SET status='active';
    INSERT INTO organization_users VALUES (7,5,'member'),(7,20,'member'),(8,80,'member');
    INSERT INTO project_visibility_settings VALUES (11,7,'private'),(12,7,'private'),(13,7,'private'),(14,8,'private'),(15,7,'private');
    INSERT INTO project_members VALUES (11,7,20,'edit','active');
    INSERT INTO risk_items (organization_id,program_id,hazard,harm,severity,probability,initial_risk,status) VALUES
      (7,'${A}','Project A hazard','A harm',3,3,9,'open'),
      (7,'${B}','Private B hazard','B harm',5,5,25,'open'),
      (7,NULL,'Organization hazard','Org harm',2,2,4,'open'),
      (8,'${FOREIGN}','Foreign hazard','Foreign harm',5,5,25,'open');
    INSERT INTO risk_controls (risk_item_id,organization_id,description,control_type) VALUES
      (1,7,'A control','protective_measure'),(2,7,'B control','protective_measure'),(4,8,'Foreign control','protective_measure');
  `);
  h.calls.length = 0;
});

describe('fixture exercises the canonical current-sharing policy', () => {
  it('admits the durable editor and excludes the private unassigned projects', async () => {
    const admitted = await getCurrentAccessibleProgramScope(conn, { organizationId: ORG, userId: USER });
    expect(admitted.programIds).toEqual([A]);
    expect(await canAccessReportProject(ORG, admitted.actor, 11, conn, { forWrite: true })).toBe(true);
    expect(await canAccessReportProject(ORG, admitted.actor, 12, conn)).toBe(false);
  });
});

describe('risk read admission and scope', () => {
  it('filters inaccessible projects before the limit and retains organization records', async () => {
    const res = await request(app()).get('/api/mdx/risk-items?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([1, 3]);
    expect(h.poolEscapes).toBe(0);
  });

  it('keeps the global null-program rows even when no project is accessible', async () => {
    await query('DELETE FROM project_members');
    const res = await request(app()).get('/api/mdx/risk-items');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([3]);
  });

  it('reads only the selected project, including its details and controls', async () => {
    const list = await request(app()).get('/api/mdx/risk-items' + scope());
    expect(list.status).toBe(200);
    expect(list.body.data.map((r: { id: number }) => r.id)).toEqual([1]);
    expect(list.body.meta).toMatchObject({ scope: 'program', programId: A });
    const detail = await request(app()).get('/api/mdx/risk-items/1' + scope());
    expect(detail.status).toBe(200);
    expect(detail.body.data.controls.map((r: { id: number }) => r.id)).toEqual([1]);
    expect((await request(app()).get('/api/mdx/risk-summary/' + A)).body.data.total).toBe(1);
  });

  it('cannot read B by ID through A even when both projects are accessible', async () => {
    await share(12);
    const res = await request(app()).get('/api/mdx/risk-items/2' + scope());
    expectNoPayload(res, 404);
  });

  it.each([B, FOREIGN, DELETED, MISSING])('refuses an unreadable or non-live project %s', async program => {
    const res = await request(app()).get('/api/mdx/risk-items' + scope(program));
    expect([403, 404]).toContain(res.status);
    expect(res.body.data).toBeUndefined();
  });

  it('does not permit a private detail or summary by omitting the query selector', async () => {
    expect([403, 404]).toContain((await request(app()).get('/api/mdx/risk-items/2')).status);
    expect([403, 404]).toContain((await request(app()).get('/api/mdx/risk-summary/' + B)).status);
  });

  it('refuses a revoked durable member and a stale active session', async () => {
    await query("UPDATE project_members SET status='revoked'");
    expect([403, 404]).toContain((await request(app()).get('/api/mdx/risk-items' + scope())).status);
    await query('DELETE FROM organization_users WHERE user_id=$1', [USER]);
    expect((await request(app()).get('/api/mdx/risk-items')).status).toBe(403);
  });

  it('reports unavailable admission rather than a false empty register', async () => {
    h.failAccessRead = true;
    for (const path of ['/api/mdx/risk-items', '/api/mdx/risk-items' + scope(), '/api/mdx/risk-items/1' + scope(), '/api/mdx/risk-summary/' + A]) {
      const res = await request(app()).get(path);
      expect(res.status, path).toBe(503);
      expect(res.body.data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('fixture access lookup');
    }
  });

  it('rejects malformed explicit scope and never falls back to a global read', async () => {
    const res = await request(app()).get('/api/mdx/risk-items/1?program_id=not-a-uuid');
    expectNoPayload(res, 422);
  });

  it('does not fall back to a pool without request context', async () => {
    const res = await request(app({ noRequestDb: true })).get('/api/mdx/risk-items' + scope());
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.data).toBeUndefined();
    expect(h.poolEscapes).toBe(0);
  });
});

describe('risk read currentness before response', () => {
  it('withholds an already-read global list when its project share is revoked before response', async () => {
    let changed = false;
    h.afterRiskRead = async sql => {
      if (!/SELECT \* FROM risk_items WHERE organization_id/.test(sql)) return;
      h.afterRiskRead = null;
      changed = true;
      await h.pg.query("UPDATE project_members SET status='revoked' WHERE project_id=11 AND organization_id=7");
    };
    const res = await request(app()).get('/api/mdx/risk-items');
    expect(changed).toBe(true);
    expectNoPayload(res, 503);
    expect(JSON.stringify(res.body)).not.toMatch(/Project A hazard|Organization hazard/);
  });

  it('withholds an already-read hazard and controls if the final actor check becomes unavailable', async () => {
    let changed = false;
    h.afterRiskRead = async sql => {
      if (!/SELECT \* FROM risk_items WHERE id/.test(sql)) return;
      h.afterRiskRead = null;
      changed = true;
      h.failAccessRead = true;
    };
    const res = await request(app()).get('/api/mdx/risk-items/1' + scope());
    expect(changed).toBe(true);
    expectNoPayload(res, 503);
    expect(JSON.stringify(res.body)).not.toMatch(/Project A hazard|A control|fixture access lookup/);
  });

  it('withholds an already-computed summary when public visibility becomes private before response', async () => {
    await h.pg.exec("DELETE FROM project_members; UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=11;");
    let changed = false;
    h.afterRiskRead = async sql => {
      if (!/COUNT\(\*\)/.test(sql) || !/FROM risk_items/.test(sql)) return;
      h.afterRiskRead = null;
      changed = true;
      await h.pg.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=11 AND organization_id=7");
    };
    const res = await request(app()).get('/api/mdx/risk-summary/' + A);
    expect(changed).toBe(true);
    expectNoPayload(res, 403);
    expect(res.body.total).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Project A hazard');
  });

});

describe('engineering cannot expose the same risk evidence through an aggregate bypass', () => {
  it.each([
    { label: 'private', program: B, revoke: false },
    { label: 'revoked', program: A, revoke: true },
  ])('refuses a $label project before reading any engineering panel', async ({ program, revoke }) => {
    if (revoke) await query("UPDATE project_members SET status='revoked' WHERE project_id=11");
    h.calls.length = 0;
    const res = await request(app()).get('/api/mdx/engineering/' + program);
    expect([403, 404]).toContain(res.status);
    expect(res.body.data).toBeUndefined();
    expect(h.calls.some(c => /FROM risk_items r/.test(c.sql))).toBe(false);
    expect(h.poolEscapes).toBe(0);
  });

  it('allows the current shared-use reader and returns only that project’s risk evidence', async () => {
    await query('DELETE FROM project_members');
    await share(11, 'use');
    const res = await request(app()).get('/api/mdx/engineering/' + A);
    expect(res.status).toBe(200);
    expect(res.body.data.risks.map((r: { hazard: string }) => r.hazard)).toEqual(['Project A hazard']);
    expect(res.body.data.risks[0].control).toBe('A control');
    expect(res.body.meta.scopes.risks).toBe('program');
    expect(h.poolEscapes).toBe(0);
  });

  it('refuses missing request database context without a pool fallback', async () => {
    const res = await request(app({ noRequestDb: true })).get('/api/mdx/engineering/' + A);
    expectNoPayload(res, 503);
    expect(h.poolEscapes).toBe(0);
  });

  it('withholds already-read risk prose when access changes during engineering panels', async () => {
    let changed = false;
    h.afterRiskRead = async sql => {
      if (!/FROM risk_items r/.test(sql)) return;
      h.afterRiskRead = null;
      changed = true;
      await h.pg.query("UPDATE project_members SET status='revoked' WHERE project_id=11 AND organization_id=7");
    };
    const res = await request(app()).get('/api/mdx/engineering/' + A);
    expect(changed).toBe(true);
    expect([403, 503]).toContain(res.status);
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/Project A hazard|A control/);
    expect(h.poolEscapes).toBe(0);
  });
});

describe('risk writes retain current shared-edit admission and exact scope', () => {
  it('creates for the admitted project and preserves null-program global creation', async () => {
    const project = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId: A });
    expect(project.status).toBe(201);
    expect(project.body.data.program_id).toBe(A);
    const global = await request(app()).post('/api/mdx/risk-items').send(item);
    expect(global.status).toBe(201);
    expect(global.body.data.program_id).toBeNull();
    expect(h.poolEscapes).toBe(0);
  });

  it('rejects a selector/body mismatch without storing a risk', async () => {
    await share(12);
    const res = await request(app()).post('/api/mdx/risk-items' + scope()).send({ ...item, programId: B });
    expect(res.status).toBe(422);
    expect(inserted()).toEqual([]);
  });

  it.each(['use', 'review'])('a %s grant is read access, never edit permission', async role => {
    await query('DELETE FROM project_members');
    if (role === 'use') await share(11, 'use');
    else await h.pg.exec("INSERT INTO concept2cure_artifacts VALUES (101,7,11); INSERT INTO concept2cure_review_assignments VALUES (101,20,7,'pending');");
    expect((await request(app()).get('/api/mdx/risk-items' + scope())).status).toBe(200);
    const res = await request(app()).patch('/api/mdx/risk-items/1' + scope()).send({ hazard: 'Unauthorized rewrite' });
    expect(res.status).toBe(403);
    expect((await hazard()).hazard).toBe('Project A hazard');
  });

  it('reads the current organization role rather than a stale editing session', async () => {
    await query("UPDATE organization_users SET role='viewer' WHERE user_id=$1", [USER]);
    const res = await request(app({ staleRole: 'admin' })).post('/api/mdx/risk-items').send({ ...item, programId: A });
    expect(res.status).toBe(403);
    expect(inserted()).toEqual([]);
  });

  it('a revoked member cannot change a hazard or add a control', async () => {
    await query("UPDATE project_members SET status='revoked'");
    expect([403, 404]).toContain((await request(app()).patch('/api/mdx/risk-items/1').send({ status: 'mitigating' })).status);
    expect([403, 404]).toContain((await request(app()).post('/api/mdx/risk-items/1/controls').send(control)).status);
    expect(inserted()).toEqual([]);
  });

  it.each(['patch-item', 'add-control', 'patch-control'])('A-scoped %s refuses a B record even for an editor of both', async action => {
    await share(12);
    const res = action === 'patch-item'
      ? await request(app()).patch('/api/mdx/risk-items/2' + scope()).send({ status: 'mitigating' })
      : action === 'add-control'
        ? await request(app()).post('/api/mdx/risk-items/2/controls' + scope()).send(control)
        : await request(app()).patch('/api/mdx/risk-controls/2' + scope()).send({ status: 'implemented' });
    expect(res.status).toBe(404);
    expect((await hazard(2)).status).toBe('open');
    expect((await controlRow(2)).status).toBe('proposed');
    expect(inserted()).toEqual([]);
  });

  it('can edit both a risk and its control as a durable shared editor', async () => {
    expect((await request(app()).patch('/api/mdx/risk-items/1' + scope()).send({ severity: 5 })).status).toBe(200);
    expect((await hazard()).initial_risk).toBe(15);
    expect((await request(app()).patch('/api/mdx/risk-controls/1' + scope()).send({ status: 'implemented' })).status).toBe(200);
    expect((await controlRow()).status).toBe('implemented');
    expect((await request(app()).post('/api/mdx/risk-items/1/controls' + scope()).send(control)).status).toBe(201);
  });

  it.each([B, FOREIGN, DELETED, MISSING])('cannot create under an inadmissible destination %s', async programId => {
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId });
    expect([403, 404]).toContain(res.status);
    expect(inserted()).toEqual([]);
  });

  it('fails closed when current write membership cannot be checked', async () => {
    h.failAccessRead = true;
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ severity: 5 });
    expect(res.status).toBe(503);
    expect(inserted()).toEqual([]);
  });
});

describe('risk references and reparenting remain in their admitted scope', () => {
  it.each(['create', 'update'])('signed content refuses a control %s before validating an introduced-risk reference', async action => {
    await query("UPDATE risk_items SET status='accepted',acceptable=TRUE WHERE id=1");
    h.calls.length = 0;
    const res = action === 'create'
      ? await request(app()).post('/api/mdx/risk-items/1/controls' + scope()).send({ ...control, newRiskItemId: 2 })
      : await request(app()).patch('/api/mdx/risk-controls/1' + scope()).send({ newRiskItemId: 2 });
    expect(res.status).toBe(409);
    expect((await controlRow()).new_risk_item_id).toBeNull();
    expect(inserted()).toEqual([]);
  });

  it.each([2, 3, 4, 999])('cannot introduce risk %s outside the parent project', async newRiskItemId => {
    await share(12);
    const res = await request(app()).post('/api/mdx/risk-items/1/controls' + scope()).send({ ...control, newRiskItemId, introducesNewRisk: true });
    expect(res.status).toBe(422);
    expect(inserted()).toEqual([]);
  });

  it('validates introduced-risk references on control updates as well', async () => {
    await share(12);
    const res = await request(app()).patch('/api/mdx/risk-controls/1' + scope()).send({ newRiskItemId: 2 });
    expect(res.status).toBe(422);
    expect((await controlRow()).new_risk_item_id).toBeNull();
  });

  it('does not preserve a historical cross-project reference through an unrelated control edit', async () => {
    await query('UPDATE risk_controls SET new_risk_item_id=2 WHERE id=1');
    const res = await request(app()).patch('/api/mdx/risk-controls/1' + scope()).send({ status: 'implemented' });
    expect(res.status).toBe(422);
    expect(await controlRow()).toMatchObject({ status: 'proposed', new_risk_item_id: 2 });
  });

  it('accepts a reference in the same project, including unscoped organization records', async () => {
    const other = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId: A });
    expect(other.status).toBe(201);
    expect((await request(app()).post('/api/mdx/risk-items/1/controls' + scope()).send({ ...control, newRiskItemId: other.body.data.id })).status).toBe(201);
    const global = await request(app()).post('/api/mdx/risk-items').send(item);
    expect((await request(app()).post('/api/mdx/risk-items/3/controls').send({ ...control, newRiskItemId: global.body.data.id })).status).toBe(201);
  });

  it.each([B, null])('explicit A-scoped edits cannot move the hazard to %s', async programId => {
    await share(12);
    const res = await request(app()).patch('/api/mdx/risk-items/1' + scope()).send({ programId });
    expect(res.status).toBe(422);
    expect((await hazard()).program_id).toBe(A);
  });

  it('unscoped reparenting requires current edit on both old and new projects', async () => {
    const noDestination = await request(app()).patch('/api/mdx/risk-items/1').send({ programId: B });
    expect([403, 404]).toContain(noDestination.status);
    await share(12);
    expect((await request(app()).patch('/api/mdx/risk-items/1').send({ programId: B })).status).toBe(200);
    expect((await hazard()).program_id).toBe(B);
    await query("UPDATE project_members SET status='revoked' WHERE project_id=12");
    const noSource = await request(app()).patch('/api/mdx/risk-items/1').send({ programId: A });
    expect([403, 404]).toContain(noSource.status);
    expect((await hazard()).program_id).toBe(B);
  });

  it.each(['outgoing', 'incoming'])('a reparent cannot strand an %s introduced-risk link', async direction => {
    await share(12);
    const other = await request(app()).post('/api/mdx/risk-items').send({ ...item, programId: A });
    const otherId = other.body.data.id as number;
    await query(`INSERT INTO risk_controls (risk_item_id,organization_id,description,control_type,new_risk_item_id)
      VALUES ($1,7,'Linked risk','protective_measure',$2)`, direction === 'outgoing' ? [1, otherId] : [otherId, 1]);
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ programId: B });
    expect(res.status).toBe(422);
    expect((await hazard()).program_id).toBe(A);
    const reserved = h.calls.find(c => /SELECT r\.id FROM risk_items r/.test(c.sql) && /FOR SHARE/.test(c.sql));
    expect(reserved?.sql).toMatch(/r\.organization_id\s*=\s*\$2/);
    expect(reserved?.params).toEqual([1, ORG]);
  });
});

describe('signed acts recheck project edit permission on the signing client', () => {
  it.each(['acceptance', 'reopen'])('refuses a %s when the request actor differs from the ceremony signer', async action => {
    if (action === 'reopen') await query("UPDATE risk_items SET status='accepted',acceptable=TRUE WHERE id=1");
    const application = app({ requestUserId: 5 });
    const res = action === 'acceptance'
      ? await request(application).patch('/api/mdx/risk-items/1' + scope()).send({ status: 'accepted' })
      : await request(application).post('/api/mdx/risk-items/1/reopen' + scope()).send({ status: 'open' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PROJECT_ACTOR_ACCESS_DENIED');
    expect(await hazard()).toMatchObject(action === 'reopen' ? { status: 'accepted', acceptable: true } : { status: 'open', acceptable: null });
  });

  it('acceptance cannot sign a B hazard from an explicit A scope', async () => {
    await share(12);
    const res = await request(app()).patch('/api/mdx/risk-items/2' + scope()).send({ status: 'accepted' });
    expect(res.status).toBe(404);
    expect((await hazard(2)).acceptable).not.toBe(true);
  });

  it('an authorized shared editor reaches the existing acceptance callback', async () => {
    const res = await request(app()).patch('/api/mdx/risk-items/1' + scope()).send({ status: 'accepted' });
    expect(res.status).toBe(201);
    expect(await hazard()).toMatchObject({ status: 'accepted', acceptable: true });
    expect(h.signingCalls).toBe(1);
  });

  it('a share revoked after signing preflight cannot authorize the signed write', async () => {
    h.beforeSigningRun = async () => { await query("UPDATE project_members SET status='revoked' WHERE project_id=11"); };
    const res = await request(app()).patch('/api/mdx/risk-items/1' + scope()).send({ status: 'accepted' });
    expect([403, 404]).toContain(res.status);
    expect(await hazard()).toMatchObject({ status: 'open', acceptable: null });
  });

  it('a signed reopen rechecks the same current project edit admission', async () => {
    await query("UPDATE risk_items SET status='accepted',acceptable=TRUE WHERE id=1");
    h.beforeSigningRun = async () => { await query("UPDATE project_members SET status='revoked' WHERE project_id=11"); };
    const res = await request(app()).post('/api/mdx/risk-items/1/reopen' + scope()).send({ status: 'open' });
    expect([403, 404]).toContain(res.status);
    expect(await hazard()).toMatchObject({ status: 'accepted', acceptable: true });
  });

  it('reopen cannot sign a B hazard from an explicit A scope', async () => {
    await share(12);
    await query("UPDATE risk_items SET status='accepted',acceptable=TRUE WHERE id=2");
    const res = await request(app()).post('/api/mdx/risk-items/2/reopen' + scope()).send({ status: 'open' });
    expect(res.status).toBe(404);
    expect(await hazard(2)).toMatchObject({ status: 'accepted', acceptable: true });
  });

  it('a role downgraded after preflight cannot authorize an acceptance', async () => {
    h.beforeSigningRun = async () => { await query("UPDATE organization_users SET role='viewer' WHERE user_id=$1", [USER]); };
    const res = await request(app({ staleRole: 'admin' })).patch('/api/mdx/risk-items/1' + scope()).send({ status: 'accepted' });
    expect(res.status).toBe(403);
    expect(await hazard()).toMatchObject({ status: 'open', acceptable: null });
  });

  it('unavailable admission on the signing client rolls back the acceptance', async () => {
    h.beforeSigningRun = async () => { h.failAccessRead = true; };
    const res = await request(app()).patch('/api/mdx/risk-items/1' + scope()).send({ status: 'accepted' });
    expect(res.status).toBe(503);
    expect(await hazard()).toMatchObject({ status: 'open', acceptable: null });
    expect(JSON.stringify(res.body)).not.toContain('fixture access lookup');
  });

  it('an authorized shared editor reaches the existing reopen callback', async () => {
    await query("UPDATE risk_items SET status='accepted',acceptable=TRUE WHERE id=1");
    const res = await request(app()).post('/api/mdx/risk-items/1/reopen' + scope()).send({ status: 'open' });
    expect(res.status).toBe(201);
    expect(await hazard()).toMatchObject({ status: 'open', acceptable: null });
    expect(h.signingCalls).toBe(1);
  });
});
