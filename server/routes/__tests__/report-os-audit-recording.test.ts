/**
 * Report OS runs, finalizations and PDF exports are events on the record
 * (21 CFR Part 11 §11.10(e)). Until 2026-09-30 none of them wrote an audit row:
 * a run, a seal and a PDF that left the system all left the audit trail as it
 * was.
 *
 * What is pinned here, per route:
 *   - POST /runs              → one chained row, `report_os.run_created`, after
 *     the run is written; when it cannot be written the answer is 503 saying
 *     the run exists and was not recorded — never a 201 that implies it was.
 *   - POST /runs/:id/finalize (review round 1, DP-47) → owners, admins and
 *     managers only, refused before any read; a run already final is refused
 *     (409 RUN_ALREADY_FINAL), so a seal is never overwritten; the status, the
 *     seal and `report_os.run_finalized` are written in ONE tenant-stamped
 *     transaction on one connection — all land or none (503, nothing changed).
 *   - GET /runs/:id/export.pdf and GET /bundles/:bundleId/export.pdf (DP-50) →
 *     the entitlement gate, then a chained row carrying the hash of the exact
 *     bytes, written BEFORE anything is sent; 503 and no PDF when it cannot be.
 *   - POST /taxonomy/seed is gone: the registry has one writer, the generated
 *     migration (scripts/db/generate-report-type-registry-seed.ts).
 * Every chained row is written on a tenant-stamped transaction (BEGIN, the
 * organisation stamped, …, COMMIT; ROLLBACK on failure; connection released).
 *
 * The router's own imports are real; the database facade, the auth
 * middleware, the entitlement gate, the run computation and the audit writer
 * are replaced, because the contract under test is what the handlers do around
 * the audit row.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  const queued = { select: [] as unknown[][], insert: [] as unknown[][], update: [] as unknown[][] };
  const reads = { select: 0 };
  /** A drizzle-shaped chain whose await yields the next queued result. */
  const chain = (next: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'set', 'returning', 'values']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(next).then(ok, ko);
    return c;
  };
  const db = {
    select: () => {
      reads.select += 1;
      return chain(() => queued.select.shift() ?? []);
    },
    insert: () => chain(() => queued.insert.shift() ?? []),
    update: () => chain(() => queued.update.shift() ?? []),
  };
  /** Every statement the route sends on the connection it checks out, in order. */
  const statements: string[] = [];
  /** Rows the connection answers a statement with (default: none). */
  const respond = { fn: (_sql: string): unknown[] => [] };
  const client = {
    query: async (sql: string) => {
      statements.push(sql.replace(/\s+/g, ' ').trim());
      return { rows: respond.fn(sql), rowCount: 1 };
    },
    release: () => statements.push('<released>'),
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  return { queued, reads, db, pool, statements, respond, audit: vi.fn(), gate: vi.fn(), compute: vi.fn() };
});

vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: async () => null }));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  /* organizationId is what the real auth middleware sets; the router's write
     gate (requireEditorAccessForWrites) reads it. */
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = {
    id: 5, role: req.get('x-test-role') ?? 'manager', organizationId: 7,
  };
  next();
});
app.use('/api/report-os', reportOsRouter);

const STAMP = "SELECT set_config('app.current_tenant_id', $1, true)";
const TYPE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['program', 'project', 'submission'] };
const RUN = {
  id: 41,
  runUuid: '00000000-0000-4000-8000-000000000041',
  organizationId: 7,
  scopeType: 'submission',
  scopeId: 'sub-1',
  reportTypeId: TYPE.typeId,
  status: 'completed',
  confidence: 90,
  blockers: [] as string[],
  dependencySummary: { providers: [], summary: {}, criticalBlockers: [] },
  createdAt: new Date('2026-09-30T12:00:00Z'),
  completedAt: new Date('2026-09-30T12:00:00Z'),
};

const auditEntry = () => h.audit.mock.calls[0]?.[1] as Record<string, any> | undefined;
const auditFails = () =>
  h.audit.mockImplementation(async () => {
    h.statements.push('<audit row>');
    throw new Error('audit_logs refused the row');
  });
const pdfBody = (r: request.Test) =>
  r.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

beforeEach(() => {
  h.queued.select.length = 0;
  h.queued.insert.length = 0;
  h.queued.update.length = 0;
  h.reads.select = 0;
  h.statements.length = 0;
  h.respond.fn = () => [];
  h.audit.mockReset().mockImplementation(async () => {
    h.statements.push('<audit row>');
  });
  h.gate.mockReset().mockResolvedValue({ entitled: true, tier: 'standard' });
  h.compute.mockReset().mockResolvedValue({ providers: [], blockers: [], criticalBlockers: [], summary: {}, confidence: 90 });
});

describe('POST /runs records the run on the audit chain', () => {
  const post = () =>
    request(app).post('/api/report-os/runs').send({ scopeType: 'submission', scopeId: 'sub-1', reportTypeId: TYPE.typeId });

  beforeEach(() => {
    h.queued.select.push([TYPE]);
    h.queued.insert.push([RUN], [{ id: 9, runId: RUN.id }]);
  });

  it('writes report_os.run_created for the run, on a tenant-stamped transaction, and answers 201', async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.run_created',
      resourceType: 'report_run',
      resourceId: '41',
      details: { runUuid: RUN.runUuid, reportTypeId: TYPE.typeId, scopeType: 'submission', scopeId: 'sub-1', status: 'completed' },
    });
    expect(h.statements).toEqual(['BEGIN', STAMP, '<audit row>', 'COMMIT', '<released>']);
  });

  it('answers 503 saying the run exists but was not recorded when the row cannot be written', async () => {
    auditFails();
    const res = await post();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_RUN_NOT_RECORDED' }, data: { runId: 41 } });
    expect(res.body.error.message).toMatch(/created but could not be recorded/i);
    expect(JSON.stringify(res.body)).not.toContain('audit_logs refused');
    expect(h.statements).toEqual(['BEGIN', STAMP, '<audit row>', 'ROLLBACK', '<released>']);
  });
});

describe('POST /runs/:id/finalize (DP-47)', () => {
  const finalize = (role = 'manager') => request(app).post(`/api/report-os/runs/${RUN.id}/finalize`).set('x-test-role', role);
  const eligible = (status = 'completed') => h.queued.select.push([{ ...RUN, status }], [{ label: TYPE.label, truthfulnessRules: {} }]);
  /** The connection answers the locked re-read with `locked` and the snapshot read with one snapshot. */
  const lockedAs = (locked: string) => {
    h.respond.fn = (sql) =>
      /FROM report_runs/.test(sql) ? [{ status: locked }] : /FROM report_snapshots/.test(sql) ? [{ id: 3, snapshot_metadata: { reportTypeId: TYPE.typeId } }] : [];
  };

  it.each(['member', 'viewer'])('refuses a %s with 403 before reading anything', async (role) => {
    eligible();
    const res = await finalize(role);
    expect(res.status).toBe(403);
    expect(h.reads.select).toBe(0);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin', 'manager'])('lets the %s finalize: status, seal and chain row commit together', async (role) => {
    eligible();
    lockedAs('completed');
    const res = await finalize(role);
    expect(res.status).toBe(200);
    const seal = res.body.data.seal;
    expect(seal.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.run_finalized',
      resourceType: 'report_run',
      resourceId: '41',
      details: { reportTypeId: TYPE.typeId, sealHash: seal.contentHash, algorithm: 'sha256', atomCount: seal.atomCount },
    });
    // One connection, one transaction: the lock, both writes and the row sit between BEGIN and COMMIT.
    const s = h.statements;
    expect(s.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    expect(s.slice(-2)).toEqual(['COMMIT', '<released>']);
    const at = (re: RegExp) => s.findIndex((x) => re.test(x));
    expect(at(/FROM report_runs .*FOR UPDATE/)).toBeGreaterThan(1);
    expect(at(/^UPDATE report_runs SET status = 'final'/)).toBeGreaterThan(at(/FOR UPDATE/));
    expect(at(/^UPDATE report_snapshots SET snapshot_metadata/)).toBeGreaterThan(at(/^UPDATE report_runs/));
    expect(at(/<audit row>/)).toBeGreaterThan(at(/^UPDATE report_snapshots/));
    expect(at(/COMMIT/)).toBeGreaterThan(at(/<audit row>/));
    expect(h.reads.select, 'the run and its type are read before the transaction; nothing else').toBe(2);
  });

  it('refuses a run that is already final with 409 RUN_ALREADY_FINAL and writes nothing', async () => {
    eligible('final');
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'RUN_ALREADY_FINAL' } });
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses when a concurrent finalize won the lock, and rolls back', async () => {
    eligible();
    lockedAs('final');
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RUN_ALREADY_FINAL');
    expect(h.statements.filter((x) => /^UPDATE/.test(x))).toEqual([]);
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('answers 503 with nothing changed when the chain row cannot be written: the writes roll back with it', async () => {
    eligible();
    lockedAs('completed');
    auditFails();
    const res = await finalize();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_FINALIZE_NOT_RECORDED' }, data: { runId: 41 } });
    expect(res.body.error.message).toMatch(/not finalized/i);
    expect(res.body.error.message).toMatch(/Nothing was changed/);
    expect(JSON.stringify(res.body)).not.toContain('audit_logs refused');
    expect(h.statements).not.toContain('COMMIT');
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
  });

  it('records nothing when the truthfulness gate refuses the finalize', async () => {
    h.queued.select.push(
      [{ ...RUN, blockers: ['missing CSR'] }],
      [{ label: TYPE.label, truthfulnessRules: { requireBlockers: true, allowPartial: true } }],
    );
    const res = await finalize();
    expect(res.status).toBe(409);
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('GET /runs/:id/export.pdf records the export before anything is sent', () => {
  const exportPdf = () => pdfBody(request(app).get(`/api/report-os/runs/${RUN.id}/export.pdf`));

  beforeEach(() => {
    h.queued.select.push([RUN], [{ label: TYPE.label, family: TYPE.family }], []);
  });

  it('writes report_os.run_exported carrying the hash of the bytes sent, then sends the PDF', async () => {
    const res = await exportPdf();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const body = res.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      action: 'report_os.run_exported',
      resourceType: 'report_run',
      resourceId: '41',
      details: { reportTypeId: TYPE.typeId, format: 'pdf', filename: 'report-run-41.pdf', byteLength: body.length, sha256: createHash('sha256').update(body).digest('hex') },
    });
    expect(h.statements).toEqual(['BEGIN', STAMP, '<audit row>', 'COMMIT', '<released>']);
  });

  it('answers 503 and sends no PDF when the export cannot be recorded', async () => {
    auditFails();
    const res = await exportPdf();
    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toBeUndefined();
    const body = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(body).toMatchObject({ success: false, error: { code: 'REPORT_EXPORT_NOT_RECORDED' } });
    expect(body.error.message).toMatch(/Nothing was exported/);
  });
});

describe('GET /bundles/:bundleId/export.pdf (DP-50)', () => {
  const BUNDLE_ID = '11111111-1111-4111-8111-111111111111';
  const item = (runId: number, reportTypeId: string) => ({
    runId, runUuid: `run-${runId}`, reportTypeId, reportTypeLabel: reportTypeId, scopeType: 'project', scopeId: '12',
    status: 'completed', confidence: 80, blockers: [], createdAt: '2026-09-30T12:00:00.000Z',
  });
  const BUNDLE = {
    bundleId: BUNDLE_ID, organizationId: 7, name: 'Board pack', createdAt: '2026-09-30T12:00:00.000Z',
    projectIds: [12], runIds: [41, 42], items: [item(41, TYPE.typeId), item(42, 'portfolio.board_pack')],
  };
  const exportBundle = () => pdfBody(request(app).get(`/api/report-os/bundles/${BUNDLE_ID}/export.pdf`));

  beforeEach(() => {
    h.queued.select.push(
      [{ title: `bundle:${BUNDLE_ID}`, content: JSON.stringify({ bundleRecord: BUNDLE }), createdAt: new Date() }],
      [{ typeId: TYPE.typeId, family: 'readiness' }, { typeId: 'portfolio.board_pack', family: 'portfolio' }],
    );
  });

  it('refuses with the run export gate when a report in the bundle is above the plan, and sends nothing', async () => {
    h.gate.mockResolvedValue({ entitled: true, tier: 'standard', feature: 'report_families', requiredTier: 'standard' });
    const res = await exportBundle();
    expect(res.status).toBe(403);
    const body = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(body).toMatchObject({ requiredTier: 'enterprise', feature: 'portfolio_rollup', tier: 'standard' });
    expect(h.audit).not.toHaveBeenCalled();
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('writes report_os.bundle_exported carrying the hash of the bytes sent, then sends the PDF', async () => {
    h.gate.mockResolvedValue({ entitled: true, tier: 'enterprise', feature: 'report_families', requiredTier: 'standard' });
    const res = await exportBundle();
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.bundle_exported',
      resourceType: 'report_bundle',
      resourceId: BUNDLE_ID,
      details: { runIds: [41, 42], format: 'pdf', byteLength: body.length, sha256: createHash('sha256').update(body).digest('hex') },
    });
    expect(h.statements).toEqual(['BEGIN', STAMP, '<audit row>', 'COMMIT', '<released>']);
  });

  it('answers 503 and sends no PDF when the bundle export cannot be recorded', async () => {
    h.gate.mockResolvedValue({ entitled: true, tier: 'enterprise', feature: 'report_families', requiredTier: 'standard' });
    auditFails();
    const res = await exportBundle();
    expect(res.status).toBe(503);
    expect(res.headers['content-disposition']).toBeUndefined();
    const body = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(body).toMatchObject({ success: false, error: { code: 'REPORT_EXPORT_NOT_RECORDED' } });
  });
});

describe('the registry has one writer', () => {
  it('POST /taxonomy/seed no longer exists: the generated migration seeds the registry', async () => {
    const res = await request(app).post('/api/report-os/taxonomy/seed');
    expect(res.status).toBe(404);
  });
});
