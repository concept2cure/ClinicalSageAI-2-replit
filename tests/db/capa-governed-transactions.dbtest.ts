/** Canonical schema, genuine HTTP authentication and verified TLS runtime.
 * These synthetic fault controls exercise actual PostgreSQL refusal/commit;
 * they install no test schema, policy, grant or immutability bypass. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { getTenantScope } from '../../server/db/tenantStore';
import { requestPgClient } from '../../server/db/requestDb';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';

let ORG: number;
let FOREIGN: number;
const TAG = `synthetic-native-capa-${randomUUID()}`;
const BASE = '/api/capa-mdr';
const program = randomUUID();
const privateProgram = randomUUID();
const foreignProgram = randomUUID();
const unanchoredProgram = randomUUID();
const uniqueAnchorProgram = randomUUID();
let owner: Pool;
let runtime: Pool;
let shared: Pool;
let originalConnect: Pool['connect'];
let app: express.Express;
let userId: number;
let otherUser: number;
let viewerId: number;
let token: string;
let viewerToken: string;
let otherToken: string;
let foreignToken: string;
let complaintId: string;
let mdrId: string;
let capaId: string;
let actionId: string;
let control: 'none' | 'timeline-refusal' | 'audit-refusal' | 'commit-loss' | 'pause-audit' = 'none';
let pause: { entered: () => void; wait: Promise<void> } | undefined;
const faults: Array<{ code: string | undefined; stage: string }> = [];
const releases: boolean[] = [];
let rollbackAfterCommit = 0;
const previousHmacKey = process.env.AUDIT_HMAC_KEY;

const call = (path: string, body?: unknown, identity = token) => {
  const operation = body === undefined ? request(app).get(BASE + path) : request(app).post(BASE + path).send(body);
  return operation.set('Authorization', `Bearer ${identity}`);
};
const complaintBody = (programId = program) => ({ programId, source: 'internal', channel: 'web_form', receivedAt: '2026-10-14T12:00:00Z', eventNarrative: TAG, patientHarm: 'none', severityAssessment: 'minor', createdBy: String(otherUser) });
const capaBody = (programId = program) => ({ programId, title: TAG, type: 'corrective', source: 'nonconformance', createdBy: String(otherUser) });
const mdrBody = () => ({ programId: program, sourceComplaintId: complaintId, jurisdiction: 'us_fda', usFdaReportType: 'initial_30day', decisionDate: '2026-10-14T12:00:00Z', eventNarrative: TAG });

function parts(args: unknown[]) {
  const first = args[0];
  const config = first && typeof first === 'object' && 'text' in first ? first as { text: string; values?: unknown[] } : undefined;
  return { text: typeof first === 'string' ? first : config?.text ?? '', values: Array.isArray(args[1]) ? args[1] : config?.values, config };
}

/** Retarget the actual tenant/program placeholder; SQL still reaches native
 * PostgreSQL and its deployed RLS policy decides the refusal. */
function retarget(args: unknown[], column: string, value: unknown): unknown[] {
  const parsed = parts(args);
  const insertion = /insert\s+into\s+(?:"?public"?\.)?"?\w+"?\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(parsed.text);
  if (!insertion || !parsed.values) throw new Error('The native fault control did not recognize its INSERT.');
  const index = insertion[1].split(',').map(name => name.replaceAll('"', '').trim()).indexOf(column);
  const placeholder = insertion[2].split(',')[index]?.trim();
  if (!placeholder || !/^\$\d+$/.test(placeholder)) throw new Error('The native fault control did not find its bound tenant value.');
  const values = [...parsed.values]; values[Number(placeholder.slice(1)) - 1] = value;
  return parsed.config
    ? [{ ...parsed.config, values }, ...(Array.isArray(args[1]) ? [values, ...args.slice(2)] : args.slice(1))]
    : [parsed.text, values, ...args.slice(2)];
}

async function applyQueryFaults(args: unknown[], parsed: ReturnType<typeof parts>, ownedWrite: boolean) {
    let actual = args;
    let stage = '';
    if (control === 'timeline-refusal' && /insert\s+into\s+"?vigilance_events"?/i.test(parsed.text) && parsed.values?.includes(program)) {
      actual = retarget(args, 'program_id', foreignProgram); stage = 'timeline';
    }
    if (control === 'audit-refusal' && ownedWrite && /insert\s+into\s+"?audit_logs"?/i.test(parsed.text)) {
      actual = retarget(args, 'tenant_id', FOREIGN); stage = 'audit';
    }
    if (control === 'pause-audit' && ownedWrite && /insert\s+into\s+"?audit_logs"?/i.test(parsed.text)) {
      pause?.entered(); await pause?.wait;
    }
  return { actual, stage };
}

function instrumentClient(q: PoolClient) {
  const query = q.query;
  const release = q.release;
  let ownedWrite = false;
  let committed = false;
  q.query = (async (...args: unknown[]) => {
    const parsed = parts(args);
    if (/insert\s+into\s+"?(complaints|mdr_events|capa_records|vigilance_events)"?/i.test(parsed.text)
      && parsed.values?.includes(program)) ownedWrite = true;
    if (committed && /^\s*rollback\b/i.test(parsed.text)) rollbackAfterCommit++;
    const { actual, stage } = await applyQueryFaults(args, parsed, ownedWrite);
    try {
      const result = await Reflect.apply(query, q, actual);
      if (control === 'commit-loss' && ownedWrite && /^\s*commit\b/i.test(parsed.text)) {
        committed = true;
        throw Object.assign(new Error('Synthetic completion loss after actual native COMMIT.'), { code: '08006' });
      }
      return result;
    } catch (error) {
      if (stage) faults.push({ stage, code: (error as { code?: string }).code });
      throw error;
    }
  }) as typeof q.query;
  q.release = ((destroy?: boolean | Error) => {
    if (committed) releases.push(Boolean(destroy));
    q.query = query; q.release = release;
    Reflect.apply(release, q, [destroy]);
  }) as typeof q.release;
  return q;
}

async function seedActors() {
  // Each invocation owns a new tenant chain. Reusing an old tenant would mix
  // immutable fixture rows sealed under different test-run HMAC keys.
  const organizations = await owner.query(`INSERT INTO organizations (name,slug,status) VALUES
    ('Synthetic native CAPA audit',$1,'active'),('Synthetic foreign CAPA audit',$2,'active') RETURNING id,slug`, [TAG, `${TAG}-foreign`]);
  ORG = Number(organizations.rows.find(row => row.slug === TAG).id);
  FOREIGN = Number(organizations.rows.find(row => row.slug === `${TAG}-foreign`).id);
  const password = await bcrypt.hash('Synthetic-CAPA-native-only-password!', 4);
  const memberEmail = `${TAG}@example.invalid`;
  const otherEmail = `${TAG}-other@example.invalid`;
  const viewerEmail = `${TAG}-viewer@example.invalid`;
  const users = await owner.query(`INSERT INTO users (email,name,status,password_hash) VALUES
    ($2,'Synthetic CAPA member','active',$1),($3,'Synthetic CAPA other owner','active',$1),
    ($4,'Synthetic CAPA viewer','active',$1) RETURNING id,email`, [password, memberEmail, otherEmail, viewerEmail]);
  const id = (email: string) => Number(users.rows.find(row => row.email === email).id);
  userId = id(memberEmail); otherUser = id(otherEmail); viewerId = id(viewerEmail);
  for (const [organizationId, actor, role] of [[ORG, userId, 'member'], [ORG, otherUser, 'member'], [ORG, viewerId, 'viewer'], [FOREIGN, otherUser, 'member']]) {
    await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at)
      VALUES ($1,$2,$3,now()-interval '1 day') ON CONFLICT(user_id,organization_id) DO UPDATE SET role=EXCLUDED.role`, [organizationId, actor, role]);
  }
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'member', jti: randomUUID() }, activeJwtSecret(), { expiresIn: '1h' });
  // A token's forged admin claim must not upgrade the current viewer row.
  viewerToken = jwt.sign({ type: 'access', userId: viewerId, organizationId: String(ORG), role: 'admin', jti: randomUUID() }, activeJwtSecret(), { expiresIn: '1h' });
  otherToken = jwt.sign({ type: 'access', userId: otherUser, organizationId: String(ORG), role: 'member', jti: randomUUID() }, activeJwtSecret(), { expiresIn: '1h' });
  foreignToken = jwt.sign({ type: 'access', userId: otherUser, organizationId: String(FOREIGN), role: 'member', jti: randomUUID() }, activeJwtSecret(), { expiresIn: '1h' });
}

async function seedPrograms() {
  const workspace = async (org: number) => Number((await owner.query(`INSERT INTO client_workspaces (organization_id,name,slug)
    VALUES ($1,'Synthetic native CAPA workspace',$2) ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`, [org, `synthetic-capa-native-${org}`])).rows[0].id);
  const ownWorkspace = await workspace(ORG); const foreignWorkspace = await workspace(FOREIGN);
  for (const [id, org, actor] of [[program, ORG, userId], [privateProgram, ORG, otherUser], [foreignProgram, FOREIGN, otherUser], [unanchoredProgram, ORG, userId], [uniqueAnchorProgram, ORG, userId]]) {
    await owner.query(`INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
      VALUES ($1,$2,$3,$4,'CER','device','FDA','Synthetic CAPA device',$5)`, [id, org, TAG, `SYN-CAPA-${id}`, actor]);
  }
  for (const [id, org, workspaceId, actor] of [[program, ORG, ownWorkspace, otherUser], [privateProgram, ORG, ownWorkspace, otherUser], [foreignProgram, FOREIGN, foreignWorkspace, otherUser], [uniqueAnchorProgram, ORG, ownWorkspace, userId]]) {
    await owner.query(`INSERT INTO projects (organization_id,client_workspace_id,regulatory_program_id,name,type,status,owner_id,created_by_id,settings)
      VALUES ($1,$2,$3,$4,'regulatory','active',$5,$5,'{"projectSharing":{"visibility":"private","members":[]}}')`, [org, workspaceId, id, TAG, actor]);
  }
  // The actor is an actual private-project grantee, so its sharing grant is
  // consequential; it cannot fall back to ownership when the grant is revoked.
  await owner.query(`INSERT INTO project_members (organization_id,project_id,user_id,role,status)
    SELECT $1,id,$2,'edit','active' FROM projects WHERE organization_id=$1 AND regulatory_program_id=$3`, [ORG, userId, program]);
  await owner.query(`INSERT INTO project_visibility_settings (organization_id,project_id,visibility)
    SELECT $1,id,'private' FROM projects WHERE organization_id=$1 AND regulatory_program_id=$2`, [ORG, program]);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A verified TLS non-bypass APP_DATABASE_URL is required.');
  process.env.AUDIT_HMAC_KEY ||= 'synthetic-capa-native-proof-hmac-key-never-for-production';
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await seedActors(); await seedPrograms();
  shared = (await import('../../server/db/runtime')).getPool(); originalConnect = shared.connect;
  shared.connect = (async (...args: unknown[]) => {
    const q = await Reflect.apply(originalConnect, shared, args) as PoolClient;
    return getTenantScope()?.tenantId === String(ORG) ? instrumentClient(q) : q;
  }) as typeof shared.connect;
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.get('/native-capa-scope', authMiddleware, async (req, res) => {
    const result = await requestPgClient(req).query('SELECT current_user AS role,current_setting(\'app.current_tenant_id\',true) AS tenant');
    res.json({ ...result.rows[0], als: getTenantScope()?.tenantId, lazy: req.dbClient instanceof LazyRequestDbClient });
  });
  app.use(BASE, authMiddleware, (await import('../../server/routes/capa-mdr')).default);
});

afterAll(async () => {
  control = 'none'; if (shared && originalConnect) shared.connect = originalConnect;
  if (previousHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY; else process.env.AUDIT_HMAC_KEY = previousHmacKey;
  await shared?.end(); await runtime?.end(); await owner?.end();
});

async function snapshot() {
  return (await owner.query(`SELECT jsonb_build_object(
    'complaints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM complaints c WHERE c.program_id=$1),
    'mdr',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM mdr_events m WHERE m.program_id=$1),
    'capa',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM capa_records c WHERE c.program_id=$1),
    'actions',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM capa_actions a JOIN capa_records c ON c.id=a.capa_id WHERE c.program_id=$1),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM vigilance_events v WHERE v.program_id=$1),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.chain_seq),'[]') FROM audit_logs a WHERE a.tenant_id=$2)
    ) AS state`, [program, ORG])).rows[0].state;
}

function expectCommitted(response: request.Response, status = 200) {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
  return String(response.body.id);
}

describe('native CAPA authority and governed writes', () => {
  it('uses genuine authentication, async scope, verified TLS runtime and deployed FORCE RLS', async () => {
    const role = (await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false });
    const response = await request(app).get('/native-capa-scope').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: role.role, tenant: String(ORG), als: String(ORG), lazy: true });
    const tables = (await owner.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN
      ('complaints'::regclass,'mdr_events'::regclass,'capa_records'::regclass,'capa_actions'::regclass,'vigilance_events'::regclass)`)).rows;
    expect(tables).toHaveLength(5); expect(tables.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it('commits all eight actual mutation types with the corresponding timeline and chained audit', async () => {
    const before = await snapshot();
    complaintId = expectCommitted(await call('/complaints', complaintBody()), 201);
    expectCommitted(await call(`/complaints/${complaintId}/transition`, { to: 'triaged', triageDecision: { rationale: 'Synthetic reviewed decision.' } }));
    mdrId = expectCommitted(await call('/mdr-events', mdrBody()), 201);
    expectCommitted(await call(`/mdr-events/${mdrId}/transition`, { to: 'preparing' }));
    capaId = expectCommitted(await call('/capa', capaBody()), 201);
    expectCommitted(await call(`/capa/${capaId}/transition`, { to: 'investigation' }));
    actionId = expectCommitted(await call(`/capa/${capaId}/actions`, { type: 'corrective', description: TAG }), 201);
    expectCommitted(await call(`/capa/actions/${actionId}/transition`, { to: 'in_progress' }));
    const after = await snapshot();
    expect(after.events.length - before.events.length).toBe(8); expect(after.audit.length - before.audit.length).toBe(8);
    const records = new Set([complaintId, mdrId, capaId, actionId]);
    const rows = after.audit.filter((row: { record_id: string }) => records.has(row.record_id));
    expect(rows).toHaveLength(8);
    expect(rows.every((row: { actor_id: number; sha256_chain: string; hmac_seal: string }) => row.actor_id === userId && /^[a-f0-9]{64}$/.test(row.sha256_chain) && /^[a-f0-9]{64}$/.test(row.hmac_seal))).toBe(true);
    expect((await call(`/complaints/${complaintId}`)).body.linkedMdrEventId).toBe(mdrId);
    expect((await call(`/capa/${capaId}`)).body.actions.some((row: { id: string }) => row.id === actionId)).toBe(true);
  });

  it('refuses private, foreign and unanchored programmes and a current viewer with forged admin claims', async () => {
    const privateId = expectCommitted(await call('/capa', capaBody(privateProgram), otherToken), 201);
    const foreignId = expectCommitted(await call('/capa', capaBody(foreignProgram), foreignToken), 201);
    const before = await snapshot();
    for (const [id, status] of [[privateProgram, 403], [foreignProgram, 404], [unanchoredProgram, 409]]) {
      const response = await call('/capa', capaBody(String(id))); expect(response.status, JSON.stringify(response.body)).toBe(status); expect(response.body.meta).toBeUndefined();
    }
    expect((await call('/capa', capaBody(), viewerToken)).status).toBe(403);
    expect((await call(`/capa/${privateId}`)).status).toBe(403);
    expect((await call(`/capa/${foreignId}`)).status).toBe(404);
    expect((await call(`/vigilance?program_id=${privateProgram}`)).status).toBe(403);
    const list = await call('/capa'); expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.rows.some((row: { id: string }) => row.id === capaId)).toBe(true);
    expect(list.body.rows.some((row: { id: string }) => row.id === privateId || row.id === foreignId)).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it('proves the actual schema prevents a second programme anchor instead of inventing an impossible ambiguous fixture', async () => {
    const anchor = (await owner.query('SELECT client_workspace_id FROM projects WHERE regulatory_program_id=$1', [uniqueAnchorProgram])).rows[0];
    await expect(owner.query(`INSERT INTO projects (organization_id,client_workspace_id,regulatory_program_id,name,type,status,owner_id,created_by_id)
      VALUES ($1,$2,$3,$4,'regulatory','active',$5,$5)`, [ORG, anchor.client_workspace_id, uniqueAnchorProgram, TAG, userId]))
      .rejects.toMatchObject({ code: '23505', constraint: 'projects_one_anchor_per_program' });
    expect((await owner.query('SELECT id FROM projects WHERE regulatory_program_id=$1', [uniqueAnchorProgram])).rows).toHaveLength(1);
  });

  it('refuses an invalid state transition without changing domain, timeline or audit rows', async () => {
    const before = await snapshot();
    expect((await call(`/capa/${capaId}/transition`, { to: 'closed_effective' })).status).toBe(422);
    expect(await snapshot()).toEqual(before);
  });

  it('refuses an MDR backlink to another accessible programme without changing either complaint or the proposed MDR', async () => {
    const otherComplaint = expectCommitted(await call('/complaints', complaintBody(uniqueAnchorProgram)), 201);
    const before = await snapshot();
    const response = await call('/mdr-events', { ...mdrBody(), sourceComplaintId: otherComplaint });
    expect(response.status, JSON.stringify(response.body)).toBe(404);
    expect(await snapshot()).toEqual(before);
    expect((await owner.query('SELECT linked_mdr_event_id FROM complaints WHERE id=$1', [otherComplaint])).rows[0].linked_mdr_event_id).toBeNull();
  });
});

describe('native CAPA atomic failures and recovery', () => {
  it('holds actor, programme, anchor and private-sharing authority until state, timeline and audit commit together', async () => {
    const before = await snapshot();
    let entered: () => void = () => undefined;
    let release: () => void = () => undefined;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    pause = { entered, wait }; control = 'pause-audit';
    const pending = call('/capa', capaBody()).then(response => response);
    const timer = setTimeout(release, 5000);
    let blocker: PoolClient | undefined;
    try {
      await reached;
      expect(await snapshot()).toEqual(before);
      blocker = await owner.connect();
      const guarded: Array<[string, unknown[]]> = [
        ['DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, userId]],
        ['UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1 AND organization_id=$2', [program, ORG]],
        ['UPDATE projects SET regulatory_program_id=NULL WHERE regulatory_program_id=$1 AND organization_id=$2', [program, ORG]],
        ["UPDATE project_visibility_settings SET visibility='org_public' WHERE organization_id=$1 AND project_id=(SELECT id FROM projects WHERE regulatory_program_id=$2)", [ORG, program]],
        ["UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND user_id=$2 AND project_id=(SELECT id FROM projects WHERE regulatory_program_id=$3)", [ORG, userId, program]],
        ["INSERT INTO project_members (organization_id,project_id,user_id,role,status) SELECT $1,id,$2,'use','active' FROM projects WHERE regulatory_program_id=$3", [ORG, viewerId, program]],
      ];
      for (const [sql, values] of guarded) {
        await blocker.query('BEGIN'); await blocker.query("SET LOCAL lock_timeout='250ms'");
        await expect(blocker.query(sql, values)).rejects.toMatchObject({ code: '55P03' });
        await blocker.query('ROLLBACK');
      }
    } finally {
      await blocker?.query('ROLLBACK'); blocker?.release(); release(); clearTimeout(timer); pause = undefined; control = 'none';
    }
    expectCommitted(await pending, 201);
    expect((await owner.query('SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, userId])).rows).toEqual([{ role: 'member' }]);
  });

  it.each(['timeline-refusal', 'audit-refusal'] as const)('rolls back all eight mutation types on actual %s without claiming successful audit', async failure => {
    const attempts = [
      () => call('/complaints', complaintBody()),
      () => call(`/complaints/${complaintId}/transition`, { to: 'investigation' }),
      () => call('/mdr-events', mdrBody()),
      () => call(`/mdr-events/${mdrId}/transition`, { to: 'open' }),
      () => call('/capa', capaBody()),
      () => call(`/capa/${capaId}/transition`, { to: 'action_planned' }),
      () => call(`/capa/${capaId}/actions`, { type: 'corrective', description: TAG }),
      () => call(`/capa/actions/${actionId}/transition`, { to: 'blocked' }),
    ];
    for (const attempt of attempts) {
      const before = await snapshot(); control = failure;
      const response = await attempt(); control = 'none';
      expect(response.status, JSON.stringify(response.body)).toBe(503); expect(response.body.meta).toBeUndefined();
      expect(response.body.code).toBe(failure === 'audit-refusal' ? 'CAPA_AUDIT_UNAVAILABLE' : 'CAPA_PERSISTENCE_UNAVAILABLE');
      expect(await snapshot()).toEqual(before);
    }
    expect(faults.filter(row => row.stage === (failure === 'audit-refusal' ? 'audit' : 'timeline'))).toHaveLength(8);
    const native = faults.filter(row => row.stage === (failure === 'audit-refusal' ? 'audit' : 'timeline'));
    // The audit-chain tenant-position trigger refuses the redirected audit
    // before its RLS check; timeline writes reach the child-table RLS policy.
    expect(native.map(row => row.code), JSON.stringify(native)).toEqual(Array(8).fill(failure === 'audit-refusal' ? '23000' : '42501'));
  });

  it('reports an actual committed transaction with lost completion as uncertain and provides current authorized readback', async () => {
    const before = await snapshot(); control = 'commit-loss';
    const response = await call('/capa', capaBody()); control = 'none';
    expect(response.status, JSON.stringify(response.body)).toBe(503);
    expect(response.body).toMatchObject({ code: 'CAPA_COMMIT_UNCONFIRMED', recovery: { recoveryUrl: expect.stringContaining('/api/capa-mdr/capa/') } });
    expect(response.body.meta).toBeUndefined();
    const id = response.body.recovery.recordId;
    const after = await snapshot();
    expect(after.capa.length - before.capa.length).toBe(1); expect(after.events.length - before.events.length).toBe(1); expect(after.audit.length - before.audit.length).toBe(1);
    expect(after.capa.some((row: { id: string }) => row.id === id)).toBe(true);
    const recovered = await call(`/capa/${id}`); expect(recovered.status, JSON.stringify(recovered.body)).toBe(200); expect(recovered.body.id).toBe(id);
    expect(rollbackAfterCommit).toBe(0); expect(releases).toEqual([true]);
    expectCommitted(await call(`/capa/${id}/transition`, { to: 'investigation' }));
  });

  it('serializes concurrent transitions and code creation without duplicate events or display codes', async () => {
    const id = expectCommitted(await call('/capa', capaBody()), 201);
    const before = await snapshot();
    const transitioned = await Promise.all([call(`/capa/${id}/transition`, { to: 'investigation' }), call(`/capa/${id}/transition`, { to: 'investigation' })]);
    expect(transitioned.map(response => response.status).sort()).toEqual([200, 422]);
    const after = await snapshot(); expect(after.events.length - before.events.length).toBe(1); expect(after.audit.length - before.audit.length).toBe(1);
    const created = await Promise.all(Array.from({ length: 4 }, () => call('/capa', capaBody())));
    created.forEach(response => expectCommitted(response, 201));
    expect(new Set(created.map(response => response.body.capaCode)).size).toBe(4);
  });

  it('verifies the real tenant audit chain and HMAC seals after successful, refused and uncertain operations', async () => {
    const q = await owner.connect();
    try {
      const { verifyAuditChain, verifyAuditChainSeals } = await import('../../server/services/audit/chain');
      expect(await verifyAuditChain(q, { tenantId: ORG })).toMatchObject({ ok: true, tenants: 1 });
      expect(await verifyAuditChainSeals(q, { tenantId: ORG })).toMatchObject({ valid: true });
    } finally { q.release(); }
  });
});
