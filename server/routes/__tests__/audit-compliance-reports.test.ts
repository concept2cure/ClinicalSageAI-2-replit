/**
 * GET /api/audit/reports and GET /api/audit/reports/:reportId — the
 * compliance reports an organisation's administrators run for an inspector.
 *
 * What the route must hold, in order: the session's organisation and the
 * audit-reader role before any query; an unknown report is 404 and the full
 * audit trail is the existing signed export (409); a bad period is refused; the
 * signing key is resolved before anything is read (a production deployment
 * without it is 503); the report reads in a tenant-stamped transaction; and the
 * run is recorded on the organisation's chain BEFORE anything leaves — when it
 * cannot be, nothing leaves (503). The real sendAuditedExport, the real signer
 * and the real verifier run here; only the database and the chain writer are
 * doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { walk, record, setTenantContextTx } = vi.hoisted(() => ({
  walk: vi.fn(),
  record: vi.fn(),
  setTenantContextTx: vi.fn(),
}));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: walk }));
vi.mock('../../services/auditService.js', () => ({ writeChainedAuditRow: record }));
vi.mock('../../services/tenant/governed-tenant-context.js', () => ({ setTenantContextTx }));

import { createComplianceReportRoutes } from '../audit-compliance-reports';
import { createAuditTrailRoutes } from '../audit-trail-routes';
import { REPORT_RUN_RATE } from '../../services/audit/compliance-reports/run-limits';
import { verifySignedAuditExport } from '../../services/audit/signedAuditExport';

const ORG = 7;
const MEMBERS = [
  { user_id: 1, name: 'Ada Owner', email: 'ada@example.invalid', org_role: 'owner', platform_roles: null },
  { user_id: 2, name: 'Bo Member', email: 'bo@example.invalid', org_role: 'member', platform_roles: null },
  { user_id: 3, name: 'Cy Operator', email: 'cy@example.invalid', org_role: 'member', platform_roles: 'support' },
];

const clientQuery = vi.fn();
const client = { query: clientQuery, release: vi.fn() };
const pool = { query: vi.fn(), connect: vi.fn(async () => client) };

let user: Record<string, unknown> | undefined;
function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: unknown }).user = user;
    next();
  });
  a.use('/api', createComplianceReportRoutes(pool as never));
  return a;
}

const saved = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'r'.repeat(48);
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k-route';
  // The seal check needs its key; without one it states that it did not run (deterministic here).
  delete process.env.AUDIT_HMAC_KEY;
  user = { id: 11, organizationId: ORG, role: 'admin', name: 'Quality Lead' };
  walk.mockResolvedValue({ ok: true, rowsChecked: 4, tenants: 1, legacyRows: 0, sequencedRows: 4 });
  record.mockResolvedValue(undefined);
  clientQuery.mockImplementation(async (sql: string) =>
    /FROM organization_users/.test(sql) ? { rows: MEMBERS } : { rows: [] },
  );
});
afterEach(() => {
  process.env = { ...saved };
});

const nothingRead = () => {
  expect(pool.connect).not.toHaveBeenCalled();
  expect(pool.query).not.toHaveBeenCalled();
  expect(walk).not.toHaveBeenCalled();
  expect(record).not.toHaveBeenCalled();
};

describe('GET /api/audit/reports — the catalog', () => {
  it('a member sees the catalog and that they cannot run it', async () => {
    user = { id: 12, organizationId: ORG, role: 'member' };
    const res = await request(app()).get('/api/audit/reports');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      canRun: false,
      readers: 'organisation owners, admins and managers, and platform administrators',
    });
    expect(res.body.reports).toHaveLength(8);
    expect(res.body.reports.find((r: { id: string }) => r.id === 'audit-trail').endpoint).toBe('/api/audit/export/signed');
    nothingRead();
  });

  it('an administrator can run them; a platform administrator too', async () => {
    expect((await request(app()).get('/api/audit/reports')).body.canRun).toBe(true);
    user = { id: 13, organizationId: ORG, role: 'support' };
    expect((await request(app()).get('/api/audit/reports')).body.canRun).toBe(true);
  });

  it('no organisation, no catalog', async () => {
    user = { id: 14, role: 'admin' };
    expect((await request(app()).get('/api/audit/reports')).status).toBe(403);
  });
});

describe('GET /api/audit/reports/:reportId — refusals before any read', () => {
  it('a non-reader is refused 403 with the audit gate body, before any query', async () => {
    user = { id: 12, organizationId: ORG, role: 'member' };
    const res = await request(app()).get('/api/audit/reports/access-review');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'AUDIT_READ_RESTRICTED',
      message: 'The audit trail is read by organisation administrators and managers.',
    });
    nothingRead();
  });

  it('a session without an organisation is refused 403', async () => {
    user = { id: 14, role: 'admin' };
    expect((await request(app()).get('/api/audit/reports/access-review')).status).toBe(403);
    nothingRead();
  });

  it('an unknown report is 404 UNKNOWN_REPORT', async () => {
    const res = await request(app()).get('/api/audit/reports/everything');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNKNOWN_REPORT' } });
    nothingRead();
  });

  it('the full audit trail is 409 USE_SIGNED_EXPORT: its run is the signed export', async () => {
    const res = await request(app()).get('/api/audit/reports/audit-trail');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: { code: 'USE_SIGNED_EXPORT' } });
    nothingRead();
  });

  it.each(['from=2026-09-30&to=2026-09-01', 'to=2026-02-30', 'from=2024-01-01&to=2026-01-01'])(
    'a bad period (%s) is 400 BAD_PERIOD',
    async (q) => {
      const res = await request(app()).get(`/api/audit/reports/authentication-events?${q}`);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: { code: 'BAD_PERIOD' } });
      nothingRead();
    },
  );

  it('a production deployment without its export key is 503 REPORT_SIGNING_UNAVAILABLE, before any read', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUDIT_EXPORT_SIGNING_KEY;
    const res = await request(app()).get('/api/audit/reports/access-review');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: { code: 'REPORT_SIGNING_UNAVAILABLE' } });
    expect(JSON.stringify(res.body)).not.toContain('AUDIT_EXPORT_SIGNING_KEY');
    nothingRead();
  });
});

describe('GET /api/audit/reports/:reportId — a run', () => {
  it('reads in a tenant-stamped transaction, records the run, and sends an export that verifies', async () => {
    const res = await request(app()).get('/api/audit/reports/access-review?to=2026-09-30');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const sql = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sql[0]).toMatch(/^BEGIN/);
    expect(setTenantContextTx).toHaveBeenCalledWith(client, ORG);
    expect(sql).toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
    const read = clientQuery.mock.calls.find((c) => /FROM organization_users/.test(String(c[0])))!;
    expect(String(read[0])).toMatch(/organization_id = \$1/);
    expect(read[1]?.[0]).toBe(ORG);

    const exp = res.body.export;
    expect(verifySignedAuditExport(exp.data, exp.manifest, exp.signature)).toMatchObject({ valid: true, signingKeyId: 'k-route' });
    const tampered = exp.data.replace('Ada Owner', 'Ada Ownes');
    expect(verifySignedAuditExport(tampered, exp.manifest, exp.signature).valid).toBe(false);
    expect(exp.verification).toMatchObject({ algorithm: 'HMAC-SHA256', signingKeyId: 'k-route' });
    expect(exp.verification.instruction.length).toBeGreaterThan(20);

    const data = JSON.parse(exp.data);
    expect(data.report).toEqual({ id: 'access-review', title: 'User access review', version: 1 });
    expect(data.organizationId).toBe(ORG);
    expect(data.period).toEqual({ from: null, to: '2026-09-30', kind: 'as-of' });
    // Review round 1, item 2: only the integrity attestation walks the chain (DP-46).
    const notChecked = {
      ok: null,
      scope: 'not-checked',
      reason: 'This report does not verify the audit chain. The audit trail integrity attestation does.',
    };
    expect(data.chain).toEqual(notChecked);
    expect(exp.manifest.chainAtGeneration).toEqual(notChecked);
    expect(walk).not.toHaveBeenCalled();
    const privileged = data.sections.find((s: { key: string }) => s.key === 'privileged');
    expect(privileged.rows.map((r: { user_id: number }) => r.user_id)).toEqual([1, 3]);

    expect(record).toHaveBeenCalledTimes(1);
    const [, row] = record.mock.calls[0];
    expect(row).toMatchObject({
      tenantId: ORG,
      userId: 11,
      action: 'compliance.report_run',
      resourceType: 'compliance_report',
      resourceId: 'access-review',
    });
    expect(row.details).toEqual({
      exportId: exp.manifest.exportId,
      reportId: 'access-review',
      period: { from: null, to: '2026-09-30', kind: 'as-of' },
      format: 'json',
      dataHash: exp.manifest.dataHash,
      sections: [
        { key: 'members', rowCount: 3, truncated: false },
        { key: 'privileged', rowCount: 2, truncated: false },
        // P1-43: the latest signed access review, or the statement that there is none (one row either way).
        { key: 'review', rowCount: 1, truncated: false },
      ],
      signingKeyId: 'k-route',
      description: `Ran User access review (as of 2026-09-30, json), export ${exp.manifest.exportId}`,
    });
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="access-review_/);
  });

});

describe('GET /api/audit/reports/:reportId — the package', () => {
  it('the existing verification endpoint verifies the package, and refuses it after a one-byte change', async () => {
    const run = await request(app()).get('/api/audit/reports/access-review?format=csv');
    const { data, manifest, signature } = run.body.export;
    const verifier = express();
    verifier.use(express.json({ limit: '5mb' }));
    verifier.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = user;
      next();
    });
    verifier.use('/api', createAuditTrailRoutes(pool as never));
    const ok = await request(verifier).post('/api/audit/export/verify').send({ data, manifest, signature });
    expect(ok.status).toBe(200);
    expect(ok.body.verification).toMatchObject({ valid: true, errors: [], signingKeyId: 'k-route' });
    const bad = await request(verifier)
      .post('/api/audit/export/verify')
      .send({ data: data.replace('Bo Member', 'Bo Membes'), manifest, signature });
    expect(bad.body.verification.valid).toBe(false);
  });

  it('a CSV run is one file of titled sections', async () => {
    const res = await request(app()).get('/api/audit/reports/access-review?format=csv');
    expect(res.status).toBe(200);
    const lines = res.body.export.data.split('\n');
    expect(lines[0]).toBe('"# User access review"');
    expect(lines).toContain('# Members');
    expect(res.body.export.contentType).toBe('text/csv; charset=utf-8');
    expect(res.body.export.manifest.format).toBe('csv');
  });

  it('an unknown format is refused rather than read as JSON', async () => {
    const res = await request(app()).get('/api/audit/reports/access-review?format=xml');
    expect(res.status).toBe(400);
    nothingRead();
  });

});

describe('GET /api/audit/reports/:reportId — failures', () => {
  it('when the run cannot be recorded on the chain: 503 REPORT_NOT_RECORDED, and nothing is sent', async () => {
    record.mockRejectedValue(new Error('chain write refused'));
    const res = await request(app()).get('/api/audit/reports/access-review');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'REPORT_NOT_RECORDED',
        message: 'The export was refused because it could not be recorded in the audit trail. Nothing was exported.',
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('Ada Owner');
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('a failed read is a 500 that names nothing internal, and the transaction is rolled back', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (/FROM organization_users/.test(sql)) throw new Error('relation "organization_users" does not exist');
      return { rows: [] };
    });
    const res = await request(app()).get('/api/audit/reports/access-review');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('relation');
    expect(clientQuery.mock.calls.map((c) => c[0])).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('the integrity attestation walks the chain and states its checks; a walk that could not run is not verified', async () => {
    walk.mockRejectedValue(new Error('admin scope unavailable'));
    const res = await request(app()).get('/api/audit/reports/audit-trail-integrity?from=2026-09-01&to=2026-09-30');
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body.export.data);
    expect(walk).toHaveBeenCalledWith(ORG);
    // Chain walk: did not run. Linkage: no rows. Seals: no seal key in this test. None verified.
    expect(data.chain).toEqual({
      ok: null,
      scope: 'integrity-checks',
      reason: '3 of 3 checks could not verify.',
      checks: { total: 3, intact: 0, broken: 0, notVerified: 3 },
    });
    expect(res.body.export.manifest.chainAtGeneration).toEqual(data.chain);
  });

  it('the integrity attestation is ok only when every check is intact, and false when any is broken', async () => {
    walk.mockResolvedValue({ ok: false, rowsChecked: 4, tenants: 1, legacyRows: 0, sequencedRows: 4 });
    const res = await request(app()).get('/api/audit/reports/audit-trail-integrity?from=2026-09-01&to=2026-09-30');
    const data = JSON.parse(res.body.export.data);
    expect(data.chain).toMatchObject({ ok: false, scope: 'integrity-checks', rowsChecked: 4, checks: { total: 3, broken: 1 } });
  });
});

describe('GET /api/audit/reports/:reportId — limits', () => {
  it('an organisation runs one report at a time: a second concurrent run is 429 REPORT_IN_PROGRESS', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    let reached: () => void = () => undefined;
    const reading = new Promise<void>((r) => { reached = r; });
    clientQuery.mockImplementation(async (sql: string) => {
      if (/FROM organization_users/.test(sql)) {
        reached();
        await held;
        return { rows: MEMBERS };
      }
      return { rows: [] };
    });
    const a = app();
    const first = request(a).get('/api/audit/reports/access-review').then((r) => r);
    await reading;
    const second = await request(a).get('/api/audit/reports/electronic-signatures');
    expect(second.status).toBe(429);
    expect(second.body).toMatchObject({ success: false, error: { code: 'REPORT_IN_PROGRESS' } });
    release();
    expect((await first).status).toBe(200);
    // Released once the first run has answered.
    expect((await request(a).get('/api/audit/reports/access-review')).status).toBe(200);
  });

  it('report runs are rate limited per organisation and person: 429 REPORT_RATE_LIMITED', async () => {
    const a = app();
    const statuses: number[] = [];
    for (let i = 0; i < REPORT_RUN_RATE.limit; i++) statuses.push((await request(a).get('/api/audit/reports/nope')).status);
    expect(new Set(statuses)).toEqual(new Set([404]));
    const limited = await request(a).get('/api/audit/reports/nope');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ success: false, error: { code: 'REPORT_RATE_LIMITED' } });
    // Another person in the same organisation has their own allowance.
    user = { id: 15, organizationId: ORG, role: 'admin' };
    expect((await request(a).get('/api/audit/reports/nope')).status).toBe(404);
  });

  it.each([0, -3, 7.5, '7abc'])('an organisation id of %j is not a tenant: 403 before anything', async (orgId) => {
    user = { id: 11, organizationId: orgId, role: 'admin' };
    expect((await request(app()).get('/api/audit/reports/access-review')).status).toBe(403);
    expect((await request(app()).get('/api/audit/reports')).status).toBe(403);
    nothingRead();
  });
});
