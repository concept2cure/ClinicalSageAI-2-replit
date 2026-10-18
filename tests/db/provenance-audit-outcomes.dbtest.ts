/** Canonically provisioned stores, genuine auth/ALS and configured app_service transport.
 * No schema/policy/grant is installed. All records are synthetic and retained.
 * Audit-refusal uses the real tenant boundary; thrown/lost-ack controls are
 * explicitly scoped sink seams. Packet isolation is a real program JOIN:
 * predicate.defense_packets has no organization_id; canonical parent-scoped
 * FORCE RLS and the explicit programme JOIN both apply.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';

const ORG = 98120, FOREIGN = 98121;
const PREFIX = `synthetic-provenance-${randomUUID()}`;
const PROGRAM = randomUUID(), OTHER_PROGRAM = randomUUID(), PRIVATE_PROGRAM = randomUUID();
let owner: Pool, runtime: Pool, app: express.Express, sharedPool: Pool;
let actor: number, otherActor: number, projectId: number, factId: string, otherFactId: string, postMarketId: string;
let legacyProgramId: number, sourceId: number;
let token: string, foreignToken: string, viewerToken: string;
let control: 'none' | 'refusal' | 'thrown' | 'lost-ack' = 'none';
let auditSpy: { mockRestore(): void } | undefined;
const get = (path: string, bearer = token) => request(app).get(path).set('Authorization', `Bearer ${bearer}`);
const post = (path: string, body: unknown, bearer = token) => request(app).post(path).set('Authorization', `Bearer ${bearer}`).send(body);
const change = '/api/change-propagation', graph = '/api/regulatory-graph', lineage = '/api/decision-lineage';
const auditRows = async (id: string, action: string) => (await owner.query(
  'SELECT id,tenant_id,actor_id,action FROM audit_logs WHERE record_id=$1 AND action=$2', [id, action],
)).rows;

async function account(kind: string, passwordHash: string) {
  return Number((await owner.query(`INSERT INTO users (email,name,status,password_hash)
    VALUES ($1,$2,'active',$3) ON CONFLICT(email) DO UPDATE SET status='active',mfa_enabled=false,mfa_secret=NULL,
      password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`,
  [`synthetic-provenance-${kind}@example.invalid`, `Synthetic provenance ${kind}`, passwordHash])).rows[0].id);
}
async function seedProgram(programId: string, organizationId: number, userId: number, visibility = 'org') {
  const workspaceId = Number((await owner.query(`INSERT INTO client_workspaces (organization_id,name,slug)
    VALUES ($1,$2,'synthetic-provenance') ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`, [organizationId, PREFIX])).rows[0].id);
  await owner.query(`INSERT INTO regulatory_programs
    (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES ($1,$2,$3,$4,'ind','small_molecule','FDA','Synthetic product',$5)`,
  [programId, organizationId, PREFIX, `SYN-${programId}`, userId]);
  return Number((await owner.query(`INSERT INTO projects
    (organization_id,name,type,status,owner_id,created_by_id,settings,regulatory_program_id,client_workspace_id)
    VALUES ($1,$2,'regulatory','active',$3,$3,$4,$5,$6) RETURNING id`,
  [organizationId, PREFIX, userId, JSON.stringify({ projectSharing: { visibility, members: [] } }), programId, workspaceId])).rows[0].id);
}
async function packet(programId = PROGRAM) {
  return String((await owner.query(`INSERT INTO predicate.defense_packets
    (program_id,subject_hash,predicate_k_number,risk_code_map_version,risk_vocab_hash,defense_readiness_score,manifest_hash,status)
    VALUES ($1,$2,'K-SYNTHETIC','synthetic-v1','synthetic-old',0,$3,'RENDERED') RETURNING id`,
  [programId, PREFIX, `${PREFIX}-${randomUUID()}`])).rows[0].id);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL required: owner execution is not a tenant proof.');
  process.env.AUDIT_HMAC_KEY ??= 'synthetic-provenance-key-no-production-use';
  process.env.AUDIT_HMAC_SECRET ??= 'synthetic-provenance-tamper-key-no-production-use';
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,'Synthetic provenance audit','synthetic-provenance-audit','active'),
    ($2,'Synthetic foreign provenance','synthetic-provenance-audit-foreign','active') ON CONFLICT(id) DO NOTHING`, [ORG, FOREIGN]);
  const passwordHash = await bcrypt.hash('Synthetic-provenance-only!', 4);
  actor = await account('member', passwordHash);
  otherActor = await account('foreign', passwordHash);
  const viewer = await account('viewer', passwordHash);
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at) VALUES
    ($1,$2,'member',now()-interval '1 day'),($3,$4,'member',now()-interval '1 day'),($1,$5,'viewer',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,created_at=EXCLUDED.created_at`, [ORG, actor, FOREIGN, otherActor, viewer]);
  projectId = await seedProgram(PROGRAM, ORG, actor);
  await seedProgram(OTHER_PROGRAM, FOREIGN, otherActor);
  await seedProgram(PRIVATE_PROGRAM, ORG, otherActor, 'private');
  const seedFact = async (programId: string, organization: number) => String((await owner.query(`INSERT INTO canonical_facts
    (organization_id,program_id,entity,field,value_num,unit,value_type,created_by)
    VALUES ($1,$2,'trial','sample_size',186,'subjects','count',$3) RETURNING id`, [organization, programId, actor])).rows[0].id);
  factId = await seedFact(PROGRAM, ORG);
  otherFactId = await seedFact(OTHER_PROGRAM, FOREIGN);
  // The legacy evidence integer is a soft label, not a UUID programme FK.
  // Exercise the actual claim/binding path without claiming a namespace bridge.
  legacyProgramId = projectId;
  sourceId = Number((await owner.query(`INSERT INTO evidence_sources (organization_id,program_id,title,source_type,content_hash)
    VALUES ($1,$2,$3,'manual',$4) RETURNING id`, [ORG, legacyProgramId, PREFIX, 'a'.repeat(64)])).rows[0].id);
  postMarketId = String((await owner.query(`INSERT INTO post_market_documents
    (organization_id,program_id,document_type,code,title,summary) VALUES ($1,$2,'pms_plan',$3::text,$3::text,'A total of N=120 subjects were randomized.') RETURNING id`,
  [ORG, PROGRAM, PREFIX])).rows[0].id);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const bearer = (userId: number, organization: number) => jwt.sign({ type: 'access', userId,
    organizationId: String(organization), role: 'admin' }, activeJwtSecret(), { expiresIn: '1h' });
  token = bearer(actor, ORG); foreignToken = bearer(otherActor, FOREIGN); viewerToken = bearer(viewer, ORG);
  const { authenticateToken } = await import('../../server/middleware/auth');
  app = express(); app.use(express.json());
  app.get('/native-provenance-scope', authenticateToken, async (req, res) => {
    const result = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_tenant_id',true) AS tenant,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`);
    res.json({ ...result.rows[0], als: getTenantScope()?.tenantId, lazy: req.dbClient instanceof LazyRequestDbClient });
  });
  app.use(change, (await import('../../server/routes/change-propagation')).default);
  app.use(graph, (await import('../../server/routes/regulatory-graph')).default);
  app.use(lineage, authenticateToken, (await import('../../server/routes/decision-lineage')).default);
  sharedPool = (await import('../../server/db/runtime')).getPool();
  const auditService = (await import('../../server/services/auditService')).default;
  const real = auditService.logAction.bind(auditService);
  auditSpy = vi.spyOn(auditService, 'logAction').mockImplementation(async (...args) => {
    const entry = args[0];
    const owned = typeof entry === 'object' && Number(entry.tenantId ?? entry.organizationId) === ORG;
    if (owned && control === 'thrown') throw new Error('Synthetic private provenance audit error');
    if (owned && control === 'refusal') return real({ ...entry, tenantId: FOREIGN, organizationId: FOREIGN });
    const result = await Reflect.apply(real, auditService, args);
    if (owned && control === 'lost-ack') return { persisted: false, chained: false, tamperProof: false, error: 'Synthetic acknowledgment suppressed after real commit' };
    return result;
  });
});
afterEach(() => { control = 'none'; });
afterAll(async () => { auditSpy?.mockRestore(); await owner?.end(); await runtime?.end(); await sharedPool?.end(); });

describe('real provenance stores and actual caller contracts', () => {
  it('uses configured app_service transport, current membership, request scope and parent-scoped packet RLS', async () => {
    expect((await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0])
      .toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false });
    expect((await get('/native-provenance-scope')).body).toMatchObject({ role: 'app_service', tenant: String(ORG), tls: shouldUseSsl(process.env.APP_DATABASE_URL), als: String(ORG), lazy: true });
    const catalogs = (await owner.query(`SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid IN ('canonical_facts'::regclass,'fact_bindings'::regclass,'predicate.defense_packets'::regclass)`)).rows;
    expect(catalogs.filter(row => row.nspname === 'public').every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect(catalogs.find(row => row.nspname === 'predicate')).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    expect((await runtime.query('SELECT id FROM canonical_facts WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });
  for (const outcome of ['none', 'refusal', 'thrown'] as const) {
    it(`preserves actual section bindings, persistent scans and fact propagation for ${outcome}`, async () => {
      control = outcome;
      const expected = outcome === 'none' ? { persisted: true, chained: true } : { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' };
      const bound = await post(`${change}/facts/${factId}/bind-section`, { docRef: `${PREFIX}-${outcome}`, sectionKey: 'm5.3.5', observedValue: '120' });
      expect(bound.status, JSON.stringify(bound.body)).toBe(201);
      expect(bound.body).toMatchObject({ ok: true, consistency: 'divergent', auditTrail: expected });
      expect((await owner.query('SELECT id,binding_status FROM fact_bindings WHERE id=$1', [bound.body.binding.id])).rows)
        .toMatchObject([{ id: bound.body.binding.id, binding_status: 'drifted' }]);
      const artifactId = `${PREFIX}-${outcome}`;
      await owner.query(`INSERT INTO concept2cure_artifacts
        (artifact_id,project_id,organization_id,type,category,title,content,ctd_section,created_by_id)
        VALUES ($1,$2,$3,'markdown','document',$1,'A total of N=120 subjects were randomized.','m5.3.5',$4)`, [artifactId, projectId, ORG, actor]);
      const preview = await post(`${change}/programs/${PROGRAM}/artifacts/${artifactId}/scan-citations`, {});
      expect(preview.status).toBe(200); expect(preview.body.persisted).toBe(false); expect(preview.body).not.toHaveProperty('auditTrail');
      for (const path of [`artifacts/${artifactId}`, `post-market/${postMarketId}`]) {
        const scan = await post(`${change}/programs/${PROGRAM}/${path}/scan-citations`, { persist: true });
        expect(scan.status, JSON.stringify(scan.body)).toBe(200);
        expect(scan.body).toMatchObject({ persisted: true, auditTrail: expected });
        expect(scan.body.citations.length).toBeGreaterThan(0);
      }
      const claimId = Number((await owner.query(`INSERT INTO evidence_claims
        (source_id,program_id,organization_id,claim_text,claim_type,entity,field,value_num,unit,value_type,verification,canonical_fact_id)
        VALUES ($1,$2,$3,'Synthetic N=120','numeric','trial','sample_size',120,'subjects','count','drifted',$4) RETURNING id`,
      [sourceId, legacyProgramId, ORG, factId])).rows[0].id);
      await owner.query(`INSERT INTO fact_bindings (organization_id,program_id,fact_id,target,target_kind,observed_value,binding_status)
        VALUES ($1,$2,$3,$4,'claim','120','drifted')`, [ORG, PROGRAM, factId, `claim:${claimId}`]);
      const propagated = await post(`${change}/facts/${factId}/propagate`, { reason: 'Synthetic native audit proof' });
      expect(propagated.status, JSON.stringify(propagated.body)).toBe(200);
      expect(propagated.body).toMatchObject({ ok: true, auditTrail: expected });
      expect(propagated.body.propagated.some((row: { claimId: number }) => row.claimId === claimId)).toBe(true);
      expect((await owner.query('SELECT value_num,verification FROM evidence_claims WHERE id=$1', [claimId])).rows)
        .toMatchObject([{ value_num: '186', verification: 'verified' }]);
      expect((await post(`${change}/facts/${otherFactId}/bind-section`, { docRef: 'foreign', observedValue: '1' })).status).toBe(404);
      expect((await get(`${graph}/programs/${PROGRAM}/facts`, foreignToken)).status).not.toBe(200);
    });
  }
});

describe('actual packet status, dependencies and audit receipts', () => {
  it('keeps a packet verification outage distinct from an absent packet and performs no dependency write', async () => {
    const id = await packet(PRIVATE_PROGRAM);
    const module = await import('../../server/db/requestDb');
    const actual = module.requestPgClient;
    const read = vi.spyOn(module, 'requestPgClient').mockImplementation(req => {
      const client = actual(req);
      return { query: (text: string, values?: unknown[]) => text.includes('FROM predicate.defense_packets')
        ? Promise.reject(new Error('Synthetic packet verification unavailable')) : client.query(text, values) };
    });
    try {
      const failed = await post(`${graph}/defense-packets/${id}/register-dependencies`, {});
      expect(failed.status, JSON.stringify(failed.body)).toBe(503);
      expect(failed.body).not.toHaveProperty('recordedCount');
      expect((await owner.query('SELECT id FROM data_lineage_records WHERE target_object_id=$1', [id])).rows).toEqual([]);
    } finally { read.mockRestore(); }
  });
  for (const outcome of ['none', 'refusal', 'thrown'] as const) {
    it(`keeps the safety status stale and carries the real packet receipt for ${outcome}`, async () => {
      const id = await packet(), foreign = await packet(OTHER_PROGRAM);
      control = outcome;
      const response = await post(`${graph}/propagate/predicate`, { programId: PROGRAM, predicateKNumber: 'K-SYNTHETIC' });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const expected = outcome === 'none' ? { persisted: true, chained: true } : { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' };
      expect(response.body).toMatchObject({ markedStaleCount: 1, auditTrail: expected,
        packetAuditReceipts: [{ packetId: id, auditTrail: expected }] });
      expect((await owner.query('SELECT id,status FROM predicate.defense_packets WHERE id=ANY($1::uuid[]) ORDER BY id', [[id, foreign]])).rows)
        .toEqual(expect.arrayContaining([{ id, status: 'STALE' }, { id: foreign, status: 'RENDERED' }]));
      expect(await auditRows(id, 'document.DEFENSE_PACKET_STALE_DETECTED')).toHaveLength(outcome === 'none' ? 1 : 0);
      const retry = await post(`${graph}/propagate/predicate`, { programId: PROGRAM, predicateKNumber: 'K-SYNTHETIC' });
      expect(retry.body.markedStaleCount).toBe(0); expect(retry.body.packetAuditReceipts).toEqual([]); expect(retry.body).not.toHaveProperty('auditTrail');
      control = 'none';
      expect((await post(`${graph}/defense-packets/${id}/register-dependencies`, {})).status).toBe(200);
      expect((await get(`${graph}/defense-packets/${foreign}/dependencies`)).status).toBe(404);
      const privatePacket = await packet(PRIVATE_PROGRAM);
      expect((await get(`${graph}/defense-packets/${privatePacket}/dependencies`)).status).toBe(403);
      expect((await post(`${graph}/propagate/predicate`, { programId: PRIVATE_PROGRAM, predicateKNumber: 'K-SYNTHETIC' })).status).toBe(403);
      expect((await owner.query('SELECT status FROM predicate.defense_packets WHERE id=$1', [privatePacket])).rows).toEqual([{ status: 'RENDERED' }]);
      expect((await post(`${graph}/defense-packets/${id}/register-dependencies`, {}, viewerToken)).status).toBe(403);
    });
  }
  it('carries actual cascade and on-demand sentinel receipts through their HTTP results', async () => {
    const seed = String((await owner.query(`INSERT INTO canonical_facts
      (organization_id,program_id,entity,field,value_num,unit,value_type,created_by)
      VALUES ($1,$2,'trial','cascade_n',186,'subjects','count',$3) RETURNING id`, [ORG, PROGRAM, actor])).rows[0].id);
    const claim = Number((await owner.query(`INSERT INTO evidence_claims
      (source_id,program_id,organization_id,claim_text,claim_type,entity,field,value_num,unit,value_type,canonical_fact_id)
      VALUES ($1,$2,$3,'Synthetic cascade count','numeric','trial','cascade_n',186,'subjects','count',$4) RETURNING id`,
    [sourceId, legacyProgramId, ORG, seed])).rows[0].id);
    await owner.query(`INSERT INTO fact_bindings (organization_id,program_id,fact_id,target,target_kind,observed_value)
      VALUES ($1,$2,$3,$4,'claim','186')`, [ORG, PROGRAM, seed, `claim:${claim}`]);
    const link = async (id: string) => owner.query(`INSERT INTO data_lineage_records
      (organization_id,source_object_type,source_object_id,target_object_type,target_object_id,linkage_type)
      VALUES ($1,'evidence_claim',$2,'defense_packet',$3,'derived_from')`, [ORG, String(claim), id]);
    const first = await packet(); await link(first); control = 'refusal';
    const changed = await post(`${change}/facts/${seed}/change`, { valueNum: 120, reason: 'Synthetic cascade proof' });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({ ok: true, cascadedClaims: 1, auditTrail: { persisted: false },
      cascadePacketAuditReceipts: [{ packetId: first, auditTrail: { persisted: false } }] });
    const second = await packet(); await link(second);
    const scanned = await post(`${graph}/programs/${PROGRAM}/drift/scan`, {});
    expect(scanned.status, JSON.stringify(scanned.body)).toBe(200);
    expect(scanned.body.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(scanned.body.items.some((item: { packetAuditReceipts?: Array<{ packetId: string }> }) => item.packetAuditReceipts?.some(receipt => receipt.packetId === second))).toBe(true);
    expect((await owner.query('SELECT status FROM predicate.defense_packets WHERE id=ANY($1::uuid[])', [[first, second]])).rows)
      .toEqual([{ status: 'STALE' }, { status: 'STALE' }]);
  });
});

describe('sole-ledger decision acknowledgment and exact attempt recovery', () => {
  for (const outcome of ['none', 'refusal', 'thrown', 'lost-ack'] as const) {
    it(`reports actual decision acknowledgment and exact readback for ${outcome}`, async () => {
      control = outcome;
      const response = await post(`${lineage}/record`, { entityType: 'synthetic_artifact', entityId: projectId,
        action: 'review', performedBy: String(otherActor), details: { decisionId: 'spoofed', note: 'Synthetic only' } });
      expect(response.status, JSON.stringify(response.body)).toBe(outcome === 'none' ? 201 : 503);
      const attempt = response.body.attemptId ?? response.body.decisionId;
      expect(attempt).toMatch(/^DEC-/); expect(attempt).not.toBe('spoofed');
      expect(response.body.queryable).toBe(outcome === 'none');
      expect(JSON.stringify(response.body)).not.toMatch(/private provenance audit error|action itself completed/);
      control = 'none';
      const receipt = await get(`${lineage}/record-attempt/${attempt}`);
      expect(receipt.status, JSON.stringify(receipt.body)).toBe(['none', 'lost-ack'].includes(outcome) ? 200 : 404);
      if (receipt.status === 200) {
        expect(receipt.body).toMatchObject({ state: 'recorded', recorded: true, queryable: true, decisionId: attempt });
        expect(receipt.body).not.toHaveProperty('details');
        expect((await owner.query('SELECT actor_id FROM audit_logs WHERE id=$1', [receipt.body.auditRecordId])).rows).toEqual([{ actor_id: actor }]);
        const actual = await get(`${lineage}/synthetic_artifact/${projectId}`);
        expect(actual.status).toBe(200);
        expect(actual.body.nodes.some((node: { details: { decisionId?: string }; entityId: number }) => node.details.decisionId === attempt && node.entityId === projectId)).toBe(true);
        const wrongType = await get(`${lineage}/different_entity/${projectId}`);
        expect(wrongType.body.nodes.some((node: { details: { decisionId?: string } }) => node.details.decisionId === attempt)).toBe(false);
      }
      expect((await get(`${lineage}/record-attempt/${attempt}`, foreignToken)).status).toBe(404);
    });
  }
});

interface PoolQueryShape { text: string; config?: { text: string; values?: unknown[] } }
function poolQueryShape(args: unknown[]): PoolQueryShape {
  const first = args[0];
  const config = first && typeof first === 'object' && 'text' in first
    ? first as { text: string; values?: unknown[] } : undefined;
  return { text: typeof first === 'string' ? first : config?.text ?? '', config };
}

/** Bound only the fixture's global discovery query; tenant work stays untouched. */
function fixtureDiscoveryArgs(args: unknown[], shape: PoolQueryShape): unknown[] {
  const restricted = `${shape.text} WHERE "program_id" = ANY($1::uuid[])`;
  const values = [[PROGRAM, OTHER_PROGRAM, PRIVATE_PROGRAM]];
  return shape.config && !Array.isArray(args[1])
    ? [{ ...shape.config, text: restricted, values }, ...args.slice(1)]
    : [shape.config ? { ...shape.config, text: restricted } : restricted, values, ...args.slice(2)];
}

describe('direct sweep tenant lifecycle admission', () => {
  it('uses real canonical posture and role-null tenant work, skipping suspended and deleted fixture programs', async () => {
    const { invalidateTenantPosture } = await import('../../server/services/tenant/tenant-lifecycle');
    await owner.query(`INSERT INTO fact_bindings (organization_id,program_id,fact_id,target,target_kind,observed_value)
      VALUES ($1,$2,$3,$4,'document','186') ON CONFLICT(fact_id,target) DO NOTHING`,
    [FOREIGN, OTHER_PROGRAM, otherFactId, `document:${PREFIX}-foreign-sweep`]);
    const privateFact = String((await owner.query(`INSERT INTO canonical_facts
      (organization_id,program_id,entity,field,value_num,value_type) VALUES ($1,$2,'trial','job_deleted',1,'count') RETURNING id`,
    [ORG, PRIVATE_PROGRAM])).rows[0].id);
    await owner.query(`INSERT INTO fact_bindings (organization_id,program_id,fact_id,target,target_kind,observed_value)
      VALUES ($1,$2,$3,$4,'document','0')`, [ORG, PRIVATE_PROGRAM, privateFact, `document:${PREFIX}-deleted-sweep`]);
    await owner.query("UPDATE organizations SET status='suspended' WHERE id=$1", [FOREIGN]);
    await owner.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [PRIVATE_PROGRAM]);
    invalidateTenantPosture(FOREIGN); invalidateTenantPosture(ORG);
    const original = sharedPool.query;
    const scopes: Array<{ tenantId: string; role: string | null | undefined }> = [];
    let boundedDiscovery = 0;
    sharedPool.query = ((...args: unknown[]) => {
      const shape = poolQueryShape(args);
      const { text } = shape;
      let actualArgs = args;
      if (/^\s*select distinct /i.test(text) && text.includes('"fact_bindings"') && !/\bwhere\b/i.test(text)) {
        boundedDiscovery += 1;
        actualArgs = fixtureDiscoveryArgs(args, shape);
      }
      const scope = getTenantScope();
      if (text.includes('"fact_bindings"') && /inner join/i.test(text) && scope?.caller === 'drift-sentinel-program') {
        scopes.push({ tenantId: scope.tenantId, role: scope.role });
      }
      return Reflect.apply(original, sharedPool, actualArgs);
    }) as Pool['query'];
    try {
      const { runDriftSentinelSweep } = await import('../../server/jobs/driftSentinelSweep');
      const result = await runDriftSentinelSweep();
      expect(boundedDiscovery).toBe(1);
      expect(result).toMatchObject({ programs: 3, processedPrograms: 1, errors: 0,
        skippedNotEntitled: 1, skippedUnverifiedProgram: 1, skippedUnverifiedTenant: 0 });
      expect(result.skippedPrograms).toEqual(expect.arrayContaining([
        { programId: OTHER_PROGRAM, reason: 'tenant_not_entitled' }, { programId: PRIVATE_PROGRAM, reason: 'program_unverified' },
      ]));
      expect(scopes).toEqual([{ tenantId: String(ORG), role: null }]);
      expect((await owner.query('SELECT observed_value,binding_status FROM fact_bindings WHERE fact_id=$1', [privateFact])).rows)
        .toEqual([{ observed_value: '0', binding_status: 'bound' }]);
    } finally {
      sharedPool.query = original;
      await owner.query("UPDATE organizations SET status='active' WHERE id=$1", [FOREIGN]);
      await owner.query('UPDATE regulatory_programs SET deleted_at=NULL WHERE id=$1', [PRIVATE_PROGRAM]);
      invalidateTenantPosture(FOREIGN); invalidateTenantPosture(ORG);
    }
  });
});
