/**
 * P1-44 (DP-50, second half): a Report OS delivery is a record, and "sent" is a
 * claim about it.
 *
 * Until 2026-10-01 POST /api/report-os/deliveries with `platform_send` wrote the
 * outbound letter through persistCorrespondenceToPlatform, which caught its own
 * error and returned `persisted: false`, then answered 201 with status 'sent'
 * whatever had happened. No chained audit row was written, and a delivery with
 * no project was answered 201 and stored nowhere. POST /correspondence/capture,
 * the helper's other caller, answered 201 for a letter that was never stored.
 *
 * What is pinned here:
 *   - the correspondence row (platform_send), the delivery record and the chain
 *     row (`report_os.delivery_sent` / `report_os.delivery_exported`) are written
 *     on ONE tenant-stamped transaction; 'sent' is answered only after COMMIT;
 *   - any of the three refused → 503 REPORT_DELIVERY_NOT_RECORDED, rolled back,
 *     nothing claimed, no error text in the body;
 *   - a delivery with no project is refused (422), not answered and dropped;
 *   - the external channel applies the e-signature rule of
 *     services/report-os/scheduling/delivery.ts: a final report — the run, or any
 *     run in the bundle as it stands NOW — is refused (409 E_SIGNATURE_REQUIRED);
 *   - capture writes the letter, its issues and the learning memory together, and
 *     a refused write is a 503, not a 201.
 *
 * The router's imports are real, drizzle included; the database facade, the
 * pool, the auth middleware and the audit writer are replaced. The connection
 * the route checks out logs every statement in order, whichever layer sent it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  const NAME = Symbol.for('drizzle:Name');
  /** Rows the pool-bound drizzle facade answers a select with, queued per table. */
  const tables: Record<string, unknown[][]> = {};
  /** Every write sent OUTSIDE the transaction: through the pool or the pool-bound facade. */
  const poolWrites: string[] = [];
  /** Every statement on the checked-out connection, in order. */
  const statements: string[] = [];
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fail = { re: null as RegExp | null };
  /** What the pool-bound facade was asked to insert (the old path wrote the record there). */
  const poolValues: unknown[] = [];
  const chain = (next: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['where', 'limit', 'orderBy', 'innerJoin', 'set', 'returning']) c[m] = () => c;
    c.values = (v: unknown) => {
      poolValues.push(v);
      return c;
    };
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(next).then(ok, ko);
    return c;
  };
  const db = {
    select: () => {
      let table = '';
      const c = chain(() => tables[table]?.shift() ?? []);
      c.from = (t: Record<symbol, string>) => {
        table = t[NAME];
        return c;
      };
      return c;
    },
    insert: (t: Record<symbol, string>) =>
      chain(() => {
        poolWrites.push(`insert ${t[NAME]}`);
        if (fail.re?.test(t[NAME])) throw new Error('pool insert refused: secret-detail-xyz');
        return t[NAME] === 'project_intelligence_profiles' ? [{ id: 3 }] : [];
      }),
    update: () => chain(() => []),
  };
  const pool = {
    connect: async () => client,
    query: async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (/^INSERT/i.test(text)) {
        poolWrites.push(text.slice(0, 40));
        if (fail.re?.test(text)) throw new Error('pool insert refused: secret-detail-xyz');
      }
      if (/FROM c2c_submissions/.test(text)) return { rows: [{ '?column?': 1 }] };
      if (/to_regclass/.test(text)) return { rows: [{ table_name: 'present' }] };
      return { rows: [] };
    },
  };
  const client = {
    query: async (q: string | { text: string; rowMode?: string }, params: unknown[] = []) => {
      const text = (typeof q === 'string' ? q : q.text).replace(/\s+/g, ' ').trim();
      statements.push(text);
      calls.push({ text, params });
      if (fail.re?.test(text)) throw new Error('statement refused: secret-detail-xyz');
      const arrayMode = typeof q !== 'string' && q.rowMode === 'array';
      if (arrayMode && /project_intelligence_profiles/.test(text)) return { rows: [[3]], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release: () => statements.push('<released>'),
  };
  return { tables, poolWrites, poolValues, statements, calls, fail, db, pool, audit: vi.fn() };
});

vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: async () => null }));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';

const app = express();
app.use(express.json());
/* The caller's role; finalize's tier (owner, admin, manager) since DP-61. */
const caller = { role: 'manager' };
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; roles: string[] } }).user = { id: 5, role: caller.role, roles: [caller.role] };
  next();
});
app.use('/api/report-os', reportOsRouter);

const STAMP = "SELECT set_config('app.current_tenant_id', $1, true)";
const SUBMISSION = '00000000-0000-4000-8000-0000000000aa';
const BUNDLE_ID = '11111111-1111-4111-8111-111111111111';
const run = (status: string, over: Record<string, unknown> = {}) => ({
  id: 41,
  runUuid: '00000000-0000-4000-8000-000000000041',
  organizationId: 7,
  scopeType: 'project',
  scopeId: '12',
  reportTypeId: 'readiness.executive_digest',
  status,
  dependencySummary: {},
  ...over,
});
const SEND = {
  runId: 41,
  channel: 'platform_send',
  submissionId: SUBMISSION,
  subject: 'Transmittal of the readiness digest',
  message: 'Please find the readiness digest for the clarification requested.',
  recipients: ['agency-contact'],
  captureForLearning: false,
};
const EXPORT = { runId: 41, channel: 'external_pdf_export', subject: 'Readiness digest for the partner', recipients: ['partner'], captureForLearning: false };

const deliver = (body: Record<string, unknown>) => request(app).post('/api/report-os/deliveries').send(body);
const auditEntry = () => h.audit.mock.calls[0]?.[1] as Record<string, any> | undefined;
const auditFails = () =>
  h.audit.mockImplementation(async () => {
    h.statements.push('<audit row>');
    throw new Error('audit_logs refused the row: secret-detail-xyz');
  });
const at = (re: RegExp) => h.statements.findIndex((s) => re.test(s));
const count = (re: RegExp) => h.statements.filter((s) => re.test(s)).length;
const CORRESPONDENCE = /^INSERT INTO c2c_correspondence \(/;
const MEMORY = /^insert into "project_memory_entries"/;

/** A refused delivery: 503, nothing claimed, no detail, rolled back, nothing written outside. */
function expectNothingClaimed(res: request.Response) {
  expect(res.status).toBe(503);
  expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_DELIVERY_NOT_RECORDED' } });
  expect(res.body.error.message).toMatch(/not sent/i);
  expect(res.body.error.message).toMatch(/Nothing was recorded/);
  expect(res.body.data).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toContain('secret-detail-xyz');
  expect(h.statements).not.toContain('COMMIT');
  expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
  expect(h.poolWrites, 'nothing may be written outside the transaction').toEqual([]);
}

beforeEach(() => {
  for (const k of Object.keys(h.tables)) delete h.tables[k];
  h.poolWrites.length = 0;
  h.poolValues.length = 0;
  h.statements.length = 0;
  h.calls.length = 0;
  h.fail.re = null;
  h.audit.mockReset().mockImplementation(async () => {
    h.statements.push('<audit row>');
  });
  h.tables.projects = [[{ id: 12 }]];
});

describe('POST /deliveries platform_send: the letter, the record and the chain row, together (P1-44)', () => {
  beforeEach(() => {
    h.tables.report_runs = [[run('completed')]];
  });

  it("answers 'sent' only after the correspondence row, the delivery record and report_os.delivery_sent commit", async () => {
    const res = await deliver(SEND);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { deliveryId, correspondenceId, status } = res.body.data;
    expect(status).toBe('sent');
    expect(correspondenceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.statements.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    expect(h.statements.slice(-2)).toEqual(['COMMIT', '<released>']);
    expect(at(CORRESPONDENCE)).toBeGreaterThan(1);
    expect(at(MEMORY)).toBeGreaterThan(at(CORRESPONDENCE));
    expect(at(/<audit row>/)).toBeGreaterThan(at(MEMORY));
    expect(at(/^COMMIT$/)).toBeGreaterThan(at(/<audit row>/));
    expect(h.calls.find((c) => CORRESPONDENCE.test(c.text))?.params[0]).toBe(correspondenceId);
    expect(JSON.stringify(h.calls.find((c) => MEMORY.test(c.text))?.params)).toContain(`delivery:${deliveryId}`);
    expect(h.poolWrites, 'nothing is written outside the transaction').toEqual([]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(auditEntry()).toMatchObject({
      tenantId: 7,
      userId: 5,
      action: 'report_os.delivery_sent',
      resourceType: 'report_delivery',
      resourceId: deliveryId,
      details: { channel: 'platform_send', runId: 41, projectId: 12, submissionId: SUBMISSION, correspondenceId, recipientCount: 1 },
    });
  });

  it('a refused correspondence write is not sent: 503, no chain row, nothing recorded', async () => {
    h.fail.re = /INSERT INTO c2c_correspondence \(/;
    const res = await deliver(SEND);
    expectNothingClaimed(res);
    expect(h.audit, 'no chain row may claim a letter that was not written').not.toHaveBeenCalled();
    expect(count(MEMORY), 'no delivery record may be written after the refused letter').toBe(0);
  });

  it('a refused delivery record is not sent: 503, the letter rolls back with it, no chain row', async () => {
    h.fail.re = /project_memory_entries/;
    const res = await deliver(SEND);
    expectNothingClaimed(res);
    expect(at(CORRESPONDENCE)).toBeGreaterThan(1);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('a refused chain row is not sent: 503, the letter and the record roll back with it', async () => {
    auditFails();
    const res = await deliver(SEND);
    expectNothingClaimed(res);
    expect(h.statements.slice(-3)).toEqual(['<audit row>', 'ROLLBACK', '<released>']);
  });

  it('the learning memory is written inside the same transaction', async () => {
    const res = await deliver({ ...SEND, captureForLearning: true });
    expect(res.status).toBe(201);
    const commit = at(/^COMMIT$/);
    expect(h.statements.slice(0, commit).filter((s) => MEMORY.test(s))).toHaveLength(2);
    expect(h.poolWrites).toEqual([]);
  });

  it('a delivery with a message at the schema limit is stored whole, so it can be listed again', async () => {
    h.tables.report_runs = [[run('completed')]];
    const message = 'm'.repeat(20000);
    const res = await deliver({ ...SEND, channel: 'external_pdf_export', submissionId: undefined, message });
    expect(res.status).toBe(201);
    // Wherever it was written: on the transaction (now) or through the pool-bound facade (before).
    const written = [
      ...h.calls.filter((c) => MEMORY.test(c.text)).flatMap((c) => c.params),
      ...h.poolValues.map((v) => (v as { content?: unknown }).content),
    ].find((p): p is string => typeof p === 'string' && p.startsWith('{"deliveryRecord"'));
    expect(written, 'the delivery record must be written').toBeDefined();
    expect(() => JSON.parse(written!), 'a cut record is unreadable by GET /deliveries').not.toThrow();
    expect(JSON.parse(written!).deliveryRecord.message).toHaveLength(20000);
  });

  it('a delivery with no project is refused (422), not answered and stored nowhere', async () => {
    h.tables.report_runs = [[run('completed', { scopeType: 'submission', scopeId: SUBMISSION })]];
    const res = await deliver(SEND);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(/"sent"/);
    expect(h.statements).toEqual([]);
    expect(h.poolWrites).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('a final report is sent inside the platform without an e-signature (the platform channel has no signature gate)', async () => {
    h.tables.report_runs = [[run('final')]];
    const res = await deliver(SEND);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('sent');
  });
});

describe('POST /deliveries needs the finalize tier (DP-61)', () => {
  beforeEach(() => {
    h.tables.report_runs = [[run('completed')]];
  });

  it('a member cannot send an outbound letter or record an export: 403, nothing written', async () => {
    caller.role = 'member';
    try {
      const res = await deliver(SEND);
      expect(res.status).toBe(403);
      expect(count(CORRESPONDENCE)).toBe(0);
      expect(h.audit).not.toHaveBeenCalled();
    } finally {
      caller.role = 'manager';
    }
  });
});

describe('POST /deliveries external_pdf_export (P1-44)', () => {
  it("records 'exported' with report_os.delivery_exported on one transaction, and no letter", async () => {
    h.tables.report_runs = [[run('partial')]];
    const res = await deliver(EXPORT);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe('exported');
    expect(count(CORRESPONDENCE)).toBe(0);
    expect(h.statements.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    expect(at(/<audit row>/)).toBeGreaterThan(at(MEMORY));
    expect(h.statements.slice(-2)).toEqual(['COMMIT', '<released>']);
    expect(auditEntry()).toMatchObject({
      action: 'report_os.delivery_exported',
      resourceType: 'report_delivery',
      resourceId: res.body.data.deliveryId,
      details: { channel: 'external_pdf_export', runId: 41 },
    });
  });

  it('refuses a final run without an e-signature (409 E_SIGNATURE_REQUIRED) and records nothing', async () => {
    h.tables.report_runs = [[run('final')]];
    const res = await deliver(EXPORT);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'E_SIGNATURE_REQUIRED' } });
    expect(h.statements).toEqual([]);
    expect(h.poolWrites).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('refuses a bundle holding a run that is final NOW, whatever the bundle recorded when it was made', async () => {
    const item = (runId: number) => ({
      runId, runUuid: `run-${runId}`, reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Digest',
      scopeType: 'project', scopeId: '12', status: 'completed', confidence: 80, blockers: [], createdAt: '2026-09-30T12:00:00.000Z',
    });
    const bundle = { bundleId: BUNDLE_ID, organizationId: 7, name: 'Board pack', createdAt: '2026-09-30T12:00:00.000Z', projectIds: [12], runIds: [41, 42], items: [item(41), item(42)] };
    h.tables.project_memory_entries = [[{ title: `bundle:${BUNDLE_ID}`, content: JSON.stringify({ bundleRecord: bundle }), createdAt: new Date() }]];
    h.tables.report_runs = [[{ id: 41, status: 'completed' }, { id: 42, status: 'final' }]];
    const res = await deliver({ ...EXPORT, runId: undefined, bundleId: BUNDLE_ID, projectId: 12 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('E_SIGNATURE_REQUIRED');
    expect(h.statements).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('POST /correspondence/capture: a letter that was not stored is not a 201 (P1-44, the helper\'s other caller)', () => {
  const capture = () =>
    request(app).post('/api/report-os/correspondence/capture').send({
      projectId: 12,
      submissionId: SUBMISSION,
      subject: 'Information request',
      body: 'Deficiency: clarification requested on the stability section.',
    });

  it('writes the letter, its issues and the learning memory on one transaction', async () => {
    const res = await capture();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.persistedToPlatform).toBe(true);
    expect(h.calls.find((c) => CORRESPONDENCE.test(c.text))?.params[0]).toBe(res.body.data.correspondenceId);
    expect(h.statements.slice(0, 2)).toEqual(['BEGIN', STAMP]);
    expect(at(/^INSERT INTO c2c_correspondence_issues/)).toBeGreaterThan(at(CORRESPONDENCE));
    expect(at(MEMORY)).toBeGreaterThan(at(/^INSERT INTO c2c_correspondence_issues/));
    expect(h.statements.slice(-2)).toEqual(['COMMIT', '<released>']);
    expect(h.poolWrites).toEqual([]);
  });

  it('answers 503 with nothing captured when the letter is refused, and writes no learning memory', async () => {
    h.fail.re = /INSERT INTO c2c_correspondence \(/;
    const res = await capture();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'CORRESPONDENCE_NOT_RECORDED' } });
    expect(res.body.error.message).toMatch(/Nothing was recorded/);
    expect(JSON.stringify(res.body)).not.toContain('secret-detail-xyz');
    expect(count(MEMORY)).toBe(0);
    expect(h.statements.slice(-2)).toEqual(['ROLLBACK', '<released>']);
    expect(h.poolWrites).toEqual([]);
  });
});
