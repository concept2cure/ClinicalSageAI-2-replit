import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const PROGRAM = 'a0a00000-0000-4000-8000-000000000001';
const PACKET = 'b0b00000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const PROOF = 'c0c00000-0000-4000-8000-000000000001';
const { query, programAccess, actor, anchor, projectAccess, writeAccess, audit, fetchMock } = vi.hoisted(() => ({
  query: vi.fn(), programAccess: vi.fn(), actor: vi.fn(), anchor: vi.fn(), projectAccess: vi.fn(), writeAccess: vi.fn(),
  audit: vi.fn(), fetchMock: vi.fn(),
}));
vi.mock('../../middleware/auth.js', () => ({ authenticateToken: (req: any, _res: any, next: any) => {
  req.user = { id: 4, organizationId: 7 }; req.dbClient = { query }; next();
} }));
vi.mock('../../db.js', () => ({ pool: { query } }));
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: programAccess }));
vi.mock('../../services/csr/project-scope', () => ({ readCsrProjectActor: actor }));
vi.mock('../../services/c2c/program-project-anchor', () => ({ readProgramAnchorRow: anchor }));
vi.mock('../../services/report-os/project-access', () => ({ canAccessReportProject: projectAccess }));
vi.mock('../../services/c2c/governed-program-write', () => ({ requireGovernedProgramWriteTx: writeAccess }));
vi.mock('../../services/audit/auditLogger.js', () => ({ logAuditEvent: audit }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn() } }));
import defense from '../defense-packet';
import seMatrix from '../se-matrix';
function app() { const a = express(); a.use(express.json()); a.use('/api/programs', defense, seMatrix); return a; }
const url = (suffix: string) => `/api/programs/${PROGRAM}/predicate-intel/${suffix}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock); process.env.REVIEW_ADMIN_TOKEN = 'synthetic-contract-token';
  programAccess.mockResolvedValue(true); actor.mockResolvedValue({ userId: 4, role: 'manager' });
  anchor.mockResolvedValue({ id: 41 }); projectAccess.mockResolvedValue(true); writeAccess.mockResolvedValue(undefined);
  audit.mockResolvedValue({ persisted: true, chained: true, tamperProof: false });
  query.mockImplementation(async (statement: unknown) => {
    const text = typeof statement === 'string' ? statement : String((statement as { text?: unknown }).text ?? '');
    if (/predicate\.defense_packets/.test(text)) return { rows: [{ id: PACKET, program_id: PROGRAM, manifest_hash: HASH, risk_code_map_version: 'synthetic-map', risk_vocab_hash: 'b'.repeat(64) }] };
    return { rows: [] };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('unsupported outcomes refuse before any external or audit write', () => {
  it('does not claim an audit-only task waiver is recorded', async () => {
    const res = await request(app()).post(url(`defense-packet/${PACKET}/waive-task`)).send({ taskId: 'T-1', waiverReason: 'Synthetic reason' });
    expect(res.status).toBe(501); expect(res.body).toMatchObject({ code: 'DEFENSE_TASK_WAIVER_UNAVAILABLE', waiver_recorded: false });
    expect(audit).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not invent a render job ID or generate unrendered content', async () => {
    const res = await request(app()).post(`/api/programs/${PROGRAM}/se-matrix/render`).send({ selectedPredicate: { kNumber: 'K123456' } });
    expect(res.status).toBe(501); expect(res.body).toMatchObject({ code: 'SE_MATRIX_RENDER_UNAVAILABLE', renderJobId: null });
    expect(audit).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not put tenant input into a global safety corpus', async () => {
    const res = await request(app()).post(url('safety-signals/ingest')).send({ kNumber: 'K123456', signals: [] });
    expect(res.status).toBe(503); expect(res.body.code).toBe('SAFETY_SIGNAL_INGEST_UNAVAILABLE');
    expect(audit).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('authoritative object binding and actual audit outcomes', () => {
  it('refuses query-string scope injection through an unvalidated lineage depth', async () => {
    const res = await request(app()).get(url('lineage/K123456/graph')).query({ maxDepth: '2&program_id=foreign' });
    expect(res.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refuses another programme packet before a shared-token request', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(app()).get(url(`defense-packet/${PACKET}`));
    expect(res.status).toBe(404); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refuses unreadable private programme content before an outbound request', async () => {
    projectAccess.mockResolvedValue(false);
    const res = await request(app()).get(url(`defense-packet/${PACKET}`));
    expect(res.status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns verification unavailable, not missing data, when packet storage cannot be read', async () => {
    query.mockRejectedValue(new Error('SENTINEL-private-driver'));
    const res = await request(app()).get(url(`defense-packet/${PACKET}`));
    expect(res.status).toBe(503); expect(JSON.stringify(res.body)).not.toContain('SENTINEL'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a real status response but exposes its lost audit row', async () => {
    const packet = { packet: { id: PACKET, program_id: PROGRAM, status: 'STALE' } };
    fetchMock.mockResolvedValue(json(packet)); audit.mockResolvedValue({ persisted: false, chained: false, tamperProof: false, error: 'SENTINEL-secret' });
    const res = await request(app()).patch(url(`defense-packet/${PACKET}/status`)).send({ status: 'STALE' });
    expect(res.status).toBe(200); expect(res.body).toEqual(packet);
    expect(res.headers['x-audit-row-persisted']).toBe('false'); expect(res.headers['x-audit-row-code']).toBe('AUDIT_ROW_NOT_PERSISTED');
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
  });
  it('describes a created upstream packet with failed readback as unconfirmed', async () => {
    fetchMock.mockResolvedValue(json({ defense_packet_id: PACKET, manifest_hash: HASH, render_job_id: null, status: 'CREATED' }));
    query.mockImplementation(async (statement: unknown) => {
      const text = typeof statement === 'string' ? statement : '';
      if (/predicate\.defense_packets/.test(text)) throw new Error('SENTINEL-readback');
      return { rows: [] };
    });
    const res = await request(app()).post(url('defense-packet')).send({ render: false });
    expect(res.status).toBe(503); expect(res.body).toMatchObject({ code: 'SHADOW_OPERATION_UNCONFIRMED', retrySafe: false });
    expect(res.body.recoveryUrl).toContain('defense-packets'); expect(res.body.error).not.toMatch(/nothing.*written/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});


describe('each real attempted event reaches the transparent response', () => {
  it('does not replace a failed request event with a healthy created/render event', async () => {
    fetchMock.mockResolvedValue(json({ defense_packet_id: PACKET, manifest_hash: HASH, render_job_id: null, status: 'CREATED' }));
    audit.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false }).mockResolvedValue({ persisted: true, chained: true, tamperProof: false });
    const res = await request(app()).post(url('defense-packet')).send({ render: false });
    expect(res.status).toBe(200); expect(res.headers['x-audit-row-persisted']).toBe('false');
    expect(audit.mock.calls.map(([e]) => e.action)).toEqual(['DEFENSE_PACKET_CREATION_REQUESTED', 'DEFENSE_PACKET_CREATED']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('reports a lost render-start event rather than claiming all creation events persisted', async () => {
    query.mockResolvedValue({ rows: [{ id: PACKET, program_id: PROGRAM, manifest_hash: HASH }] });
    fetchMock.mockResolvedValue(json({ defense_packet_id: PACKET, manifest_hash: HASH, render_job_id: PROOF, status: 'RENDERING' }));
    audit.mockResolvedValueOnce({ persisted: true, chained: true }).mockResolvedValueOnce({ persisted: true, chained: true }).mockResolvedValueOnce({ persisted: true, chained: false });
    const res = await request(app()).post(url('defense-packet')).send({});
    expect(res.status).toBe(200); expect(audit.mock.calls.map(([e]) => e.action)).toContain('DEFENSE_PACKET_RENDER_STARTED');
    // Tamper-proof-only is persisted, and remains distinct in the canonical collector.
    expect(res.headers['x-audit-row-persisted']).toBe('true');
  });
  it.each([
    { path: 'defense-packet', body: { render: false }, upstream: { error: 'synthetic rejected input' }, status: 422, events: ['DEFENSE_PACKET_CREATION_REQUESTED', 'DEFENSE_PACKET_CREATION_FAILED'] },
    { path: `defense-packet/${PACKET}/staleness-check`, body: {}, upstream: { is_stale: true, reasons: ['version'], packet_risk_vocab_hash: HASH }, status: 200, events: ['DEFENSE_PACKET_STALE_DETECTED'] },
    { path: 'defense-packet/build', body: {}, upstream: { defense_packet: { packet_id: HASH, manifest_hash: HASH, tasks: [] }, submission_gate: { allowed: false } }, status: 200, events: ['DEFENSE_PACKET_CREATED', 'DEFENSE_PACKET_BLOCKED'] },
    { path: `defense-packet/${HASH}/submission-gate`, body: {}, upstream: { allowed: false, reason: 'needs evidence' }, status: 200, events: ['DEFENSE_PACKET_BLOCKED'] },
    { path: 'replay-determinism', body: { originalManifestHash: HASH }, upstream: { deterministic: true }, status: 200, events: ['DETERMINISM_REPLAY'] },
  ])('forwards actual audit loss on $path', async ({ path, body, upstream, status, events }) => {
    fetchMock.mockResolvedValue(json(upstream, status)); audit.mockResolvedValue({ persisted: false, chained: false, tamperProof: false });
    const res = await request(app()).post(url(path)).send(body);
    expect(res.status).toBe(status); expect(res.headers['x-audit-row-persisted']).toBe('false');
    expect(audit.mock.calls.map(([e]) => e.action)).toEqual(events);
    if (status === 200) expect(res.body).toEqual(upstream);
  });
  it('does not claim a failed replay completed', async () => {
    fetchMock.mockResolvedValue(json({ error: 'validation' }, 422));
    const res = await request(app()).post(url('replay-determinism')).send({ originalManifestHash: HASH });
    expect(res.status).toBe(422); expect(audit).not.toHaveBeenCalled(); expect(res.headers['x-audit-row-persisted']).toBeUndefined();
  });
  it('retains exact binary bytes and reports a failed download audit after success', async () => {
    query.mockResolvedValue({ rows: [{ id: PROOF, program_id: PROGRAM, manifest_hash: HASH }] });
    const bytes = Buffer.from([0, 1, 254, 255]);
    fetchMock.mockResolvedValue(new Response(bytes, { status: 200, headers: { 'X-Proof-Pack-Hash': HASH } }));
    audit.mockRejectedValue(new Error('SENTINEL-audit-private'));
    const res = await request(app()).get(url(`proof-pack/${PROOF}/download`)).buffer(true).parse((response, done) => {
      const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200); expect(res.body).toEqual(bytes); expect(res.headers['x-audit-row-persisted']).toBe('false');
    expect(res.headers['x-proof-pack-hash']).toBe(HASH); expect(audit.mock.calls[0][0].action).toBe('PROOF_PACK_DOWNLOADED');
  });
  it('does not record a failed download as downloaded', async () => {
    query.mockResolvedValue({ rows: [{ id: PROOF, program_id: PROGRAM, manifest_hash: HASH }] });
    fetchMock.mockResolvedValue(json({ error: 'blocked' }, 409));
    const res = await request(app()).get(url(`proof-pack/${PROOF}/download`));
    expect(res.status).toBe(409); expect(audit).not.toHaveBeenCalled(); expect(res.headers['x-audit-row-persisted']).toBeUndefined();
  });
  it('keeps a healthy no-audit packet read free of invented audit headers', async () => {
    fetchMock.mockResolvedValue(json({ packet: { id: PACKET, program_id: PROGRAM } }));
    const res = await request(app()).get(url(`defense-packet/${PACKET}`));
    expect(res.status).toBe(200); expect(res.headers['x-audit-row-persisted']).toBeUndefined(); expect(audit).not.toHaveBeenCalled();
  });
});
