/** Real migration-backed packet SQL: exact program/tenant parent, current actor admission. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, authorize: vi.fn(), packetQueries: 0 }));
const PROGRAM = '00000000-0000-0000-0000-0000000000c3';
const OTHER_PROGRAM = '00000000-0000-0000-0000-0000000000c4';
const FOREIGN_PROGRAM = '00000000-0000-0000-0000-0000000000c5';
const DELETED_PROGRAM = '00000000-0000-0000-0000-0000000000c6';
const PACKET = '00000000-0000-0000-0000-0000000000d4';
const FOREIGN_PACKET = '00000000-0000-0000-0000-0000000000d5';
const DELETED_PACKET = '00000000-0000-0000-0000-0000000000d6';
const program = { programType: '510K', productType: 'device', deviceClass: 'II', primaryAgency: 'FDA' };
const executor = { query: async (text: string, params?: unknown[]) => {
  h.packetQueries++;
  return h.pg!.query<Record<string, unknown>>(text, params);
} };
vi.mock('../../middleware/auth', () => ({ authenticateToken: (req: any, _res: any, next: any) => {
  req.user = { id: 3, organizationId: 7 }; req.dbClient = executor; next();
} }));
vi.mock('../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: async () => true }));
vi.mock('../../services/authoring/authoring-program-access', async original => ({
  ...(await original<typeof import('../../services/authoring/authoring-program-access')>()), authorizeAuthoringProgram: h.authorize,
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: async () => ({ persisted: true, chained: true }) }));
import router from '../regulatory-graph';
import { runReviewerSimulation } from '../../services/intelligence-engine/reviewer-simulator.service';
import { AuthoringProgramAccessError } from '../../services/authoring/authoring-program-access';

function app() {
  const a = express(); a.use(express.json()); a.use('/api/regulatory-graph', router); return a;
}
const post = (body: object, programId = PROGRAM) => request(app()).post(`/api/regulatory-graph/programs/${programId}/reviewer-simulation`).send(body);

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`CREATE SCHEMA predicate;
    CREATE TABLE regulatory_programs(id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, deleted_at TIMESTAMPTZ);`);
  await h.pg.exec(readFileSync(join(__dirname, '../../../db/migrations/20260211_phase6_6d_defense_packets.sql'), 'utf8'));
  await h.pg.exec(readFileSync(join(__dirname, '../../../migrations/20260429_reviewer_simulation.sql'), 'utf8'));
  await h.pg.query(`INSERT INTO regulatory_programs(id,organization_id,deleted_at) VALUES($1,7,NULL),($2,7,NULL),($3,8,NULL),($4,7,NOW())`, [PROGRAM, OTHER_PROGRAM, FOREIGN_PROGRAM, DELETED_PROGRAM]);
  for (const [id, parent] of [[PACKET, PROGRAM], [FOREIGN_PACKET, FOREIGN_PROGRAM], [DELETED_PACKET, DELETED_PROGRAM]]) {
    await h.pg.query(`INSERT INTO predicate.defense_packets(id,program_id,subject_hash,predicate_k_number,risk_code_map_version,risk_vocab_hash,defense_readiness_score,top_risks,risk_codes_used,manifest_hash,status)
      VALUES($1::uuid,$2::uuid,'synthetic-subject','K123456','test-map','test-vocab',55,'["TECH_DIFFERENCE"]','["TECH_DIFFERENCE"]',$3,'RENDERED')`, [id, parent, `synthetic-${id}`]);
  }
}, 60_000);
beforeEach(() => { h.authorize.mockReset().mockResolvedValue(undefined); h.packetQueries = 0; });
afterAll(async () => { await h.pg?.close(); });

describe('canonical recorded packet facts and current access', () => {
  it('reads actual migration-backed fields and the verified request actor/q, ignoring caller scores', async () => {
    const res = await post({ program, defensePacketId: PACKET, packet: { defenseReadinessScore: 99 }, dryRun: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.questions.map((q: { question: string }) => q.question).join(' ')).toContain('55/100');
    expect(res.body.inputsSource).toMatchObject({ packet: 'defense_packets', defensePacketId: PACKET, defensePacketStatus: 'RENDERED' });
    expect(h.authorize).toHaveBeenCalledWith(executor, { tenantId: 7, actor: { id: '3', email: '' }, programId: PROGRAM, forWrite: false });
  });
  it.each([[FOREIGN_PACKET, FOREIGN_PROGRAM], [PACKET, OTHER_PROGRAM], [DELETED_PACKET, DELETED_PROGRAM]])('refuses a foreign, mismatched, or deleted parent for packet %s', async (packet, parent) => {
    const res = await post({ program, defensePacketId: packet, dryRun: true }, parent);
    expect(res.status).toBe(422); expect(res.body.code).toBe('DEFENSE_PACKET_NOT_FOUND');
    expect(res.body.questions).toBeUndefined();
  });
  it('revoked or private-project admission refuses before any packet read', async () => {
    h.authorize.mockRejectedValueOnce(new AuthoringProgramAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Private project'));
    const res = await post({ program, defensePacketId: PACKET, dryRun: true });
    expect(res.status).toBe(403); expect(res.body.code).toBe('DEFENSE_PACKET_ACCESS_DENIED'); expect(h.packetQueries).toBe(0);
  });
  it('a missing executor is unavailable, never packet absence or a global pool fallback', async () => {
    await expect(runReviewerSimulation({ organizationId: 7, programId: PROGRAM, program, defensePacketId: PACKET, dryRun: true }))
      .rejects.toMatchObject({ code: 'DEFENSE_PACKET_ACCESS_UNAVAILABLE', statusCode: 503 });
    expect(h.packetQueries).toBe(0); expect(h.authorize).not.toHaveBeenCalled();
  });
  it('a missing canonical store is unavailable, never an empty successful run', async () => {
    const missing = { query: vi.fn(async () => { throw Object.assign(new Error('Private missing relation'), { code: '42P01' }); }) };
    await expect(runReviewerSimulation({ organizationId: 7, programId: PROGRAM, program, defensePacketId: PACKET, dryRun: true }, { executor: missing, userId: 3 }))
      .rejects.toMatchObject({ code: 'DEFENSE_PACKET_STORE_NOT_AVAILABLE', statusCode: 503 });
    expect(missing.query).toHaveBeenCalledOnce();
  });
  it.each(['foreign', 'private', 'revoked'])('a no-packet persisted run refuses %s access before any write', async kind => {
    h.authorize.mockRejectedValueOnce(new AuthoringProgramAccessError(kind === 'foreign' ? 404 : 403, 'PROJECT_PERMISSION_DENIED', kind));
    const res = await post({ program, dryRun: false });
    expect(res.status).toBe(403); expect(res.body.code).toBe('REVIEWER_PROGRAM_ACCESS_DENIED'); expect(h.packetQueries).toBe(0);
  });
  it('does not use a caller trigger label as a verified actor for persistence', async () => {
    await expect(runReviewerSimulation({ organizationId: 7, programId: PROGRAM, program, triggeredBy: '3' }))
      .rejects.toMatchObject({ code: 'REVIEWER_PROGRAM_ACCESS_UNAVAILABLE', statusCode: 503 });
    expect(h.packetQueries).toBe(0);
  });
  it('rechecks current access after reading packet records and refuses a newly revoked writer', async () => {
    h.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new AuthoringProgramAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Revoked after read'));
    const res = await post({ program, defensePacketId: PACKET, dryRun: false });
    expect(res.status).toBe(403); expect(res.body.runId).toBeUndefined(); expect(h.packetQueries).toBe(1);
    expect(h.authorize).toHaveBeenCalledTimes(2);
  });
  it('persists an admitted no-packet run on the same verified connection with its actual actor', async () => {
    const res = await post({ program, triggeredBy: 'foreign-actor-label', dryRun: false });
    expect(res.status, JSON.stringify(res.body)).toBe(200); expect(res.body.runId).toEqual(expect.any(String));
    expect(h.authorize).toHaveBeenCalledTimes(2);
    for (const call of h.authorize.mock.calls) expect(call).toEqual([executor, { tenantId: 7, actor: { id: '3', email: '' }, programId: PROGRAM, forWrite: true }]);
    const stored = (await h.pg!.query('SELECT organization_id,program_id,triggered_by,summary FROM reviewer_simulation_runs WHERE id=$1', [res.body.runId])).rows[0];
    expect(stored).toMatchObject({ organization_id: 7, program_id: PROGRAM, triggered_by: '3', summary: { inputsSource: { packet: 'not_available' } } });
    expect(h.packetQueries).toBe(1);
  });
  it('a run without a named packet proceeds with explicit unassessed packet checks', async () => {
    const res = await post({ program, dryRun: true });
    expect(res.status).toBe(200); expect(res.body.inputsSource.packet).toBe('not_available'); expect(h.packetQueries).toBe(0);
  });
});
