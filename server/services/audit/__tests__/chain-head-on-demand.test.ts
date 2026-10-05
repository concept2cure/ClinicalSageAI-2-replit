/**
 * Every on-demand verdict on the audit_logs chain says what it did about the
 * chain's HEAD (security plan P0-8 follow-up to DP-04, 2026-10-01).
 *
 * The chain walk cannot see the newest rows removed: what is left is still a
 * valid chain that ends earlier (chain-anchor.dbtest.ts case 1, on PostgreSQL).
 * The daily sweep checks the head against the latest anchor in the evidence
 * bucket. The five on-demand verifiers did not, and answered `ok` for such a
 * chain:
 *   GET /api/c2c/actions/verify-chain                      routes/c2c/actions.ts
 *   GET /audit-trail/seal-integrity                        routes/part11-compliance.ts
 *   GET /api/admin/master/licensing/history (integrity)    routes/admin/licensing-history.ts
 *   verifyTenantChainOnAdminScope (ledger, export, reports) services/audit/tenant-chain-verdict.ts
 *   npm run ops:verify-audit-chain                         scripts/ops/verify-audit-chain.mjs
 *
 * Each now consults the latest anchor through the one verifier
 * (chain-anchor.ts verifyAuditChainAnchor, via verifyChainHead) when the
 * deployment names an anchor bucket, and otherwise labels its verdict
 * "head not verified against the anchor".
 *
 * What is faked: the walk (it passes, as the real one does on a truncated
 * chain), S3 (in memory, holding one real anchor document), and the database
 * statements the anchor verifier issues. The anchor verifier itself, the store
 * resolution from AUDIT_ANCHOR_BUCKET and each route are the real code.
 */
import express from 'express';
import type { PoolClient } from 'pg';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  verifyAuditChain: vi.fn(),
  verifyAuditIntegrity: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  class Cmd {
    constructor(public input: Record<string, any>) {}
  }
  class PutObjectCommand extends Cmd {}
  class GetObjectCommand extends Cmd {}
  class DeleteObjectCommand extends Cmd {}
  class ListObjectsV2Command extends Cmd {}
  class S3Client {
    constructor(public config: Record<string, unknown>) {}
    async send(cmd: Cmd) {
      const i = cmd.input;
      if (cmd instanceof GetObjectCommand) {
        const body = h.objects.get(i.Key);
        if (!body) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        return { Body: (async function* () { yield body; })() };
      }
      if (cmd instanceof ListObjectsV2Command) {
        const keys = [...h.objects.keys()].filter((k) => k.startsWith(i.Prefix ?? '')).sort();
        return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
      }
      throw new Error(`unexpected command ${cmd.constructor.name}`);
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command };
});

// The walk passes: it cannot see the newest rows removed.
vi.mock('../chain.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyAuditChain: h.verifyAuditChain,
}));
vi.mock('../audit-integrity-service', () => ({ verifyAuditIntegrity: h.verifyAuditIntegrity }));
vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => h.dbQuery(...a), connect: vi.fn() },
  query: (...a: unknown[]) => h.dbQuery(...a),
}));
vi.mock('../../../db/withTenantConnection.js', () => ({
  withTenantConnection: async (_ctx: unknown, fn: (c: { query: typeof h.dbQuery }) => unknown) => fn({ query: h.dbQuery }),
}));

import actionsRouter from '../../../routes/c2c/actions';
import part11Router from '../../../routes/part11-compliance';
import licensingRouter, { clearIntegrityCache } from '../../../routes/admin/licensing-history';
import { verifyTenantChainOnAdminScope } from '../tenant-chain-verdict';
import { verifyAuditChains } from '../../../../scripts/ops/verify-audit-chain.mjs';
import { readAuditLedger, readRecordAuditHistory } from '../../../routes/audit-trail-ledger.routes';
import { walkTenantChain } from '../audited-export';
import { generateSignedAuditExport } from '../signedAuditExport';
import { findReport } from '../compliance-reports/catalog';
import type { RunContext } from '../compliance-reports/types';

const BUCKET = 'c2c-prod-part11-evidence';
const ANCHOR_KEY = 'anchors/audit-chain/2026/10/01/2026-10-01T02-00-00-000Z-0a1b2c3d.json';
const HEAD_7 = { organizationId: 7, rowId: '6f1c0d2e-0000-4000-8000-000000000007', chainSeq: '4', sha256Chain: '7'.repeat(64), rowCount: 4, headOccurredAt: '2026-09-30T23:00:00.000Z' };
const HEAD_8 = { organizationId: 8, rowId: '6f1c0d2e-0000-4000-8000-000000000008', chainSeq: '2', sha256Chain: '8'.repeat(64), rowCount: 2, headOccurredAt: '2026-09-30T22:00:00.000Z' };
const LABEL = /head not verified against the anchor/;

/** Organisation 7's two newest rows are gone (its anchored head with them); organisation 8 is intact. */
function answerAnchorStatements(sql: string, params: unknown[] = []) {
  if (sql.includes("current_setting('app.rls_enforce'")) return { rows: [{ rls_enforce: null, role: null }] };
  if (sql.includes('WITH ORDINALITY AS a(organization_id')) {
    const orgs = params[0] as number[];
    return {
      rows: orgs.map((org, i) =>
        org === 7
          ? { ord: i + 1, present: false, head_tenant: null, head_seq: null, head_sha: null, current_rows: '2' }
          : { ord: i + 1, present: true, head_tenant: 8, head_seq: HEAD_8.chainSeq, head_sha: HEAD_8.sha256Chain, current_rows: '2' },
      ),
    };
  }
  if (sql.includes("to_regclass('public.audit_log_archives')")) return { rows: [{ present: false }] };
  return null;
}

/**
 * requirePlatformAdmin.ts resolvePlatformAdmin's grant lookup. Platform standing
 * is an active platform_role_grants row, as in production — never the request
 * role, which behind server/auth.ts is the TENANT membership role (D6,
 * 2026-10-05, docs/evidence/D6/2026-10-05-platform-standing/). Only
 * PLATFORM_ADMIN (user 3) holds one, a platform_admin grant.
 */
const PLATFORM_GRANT_HOLDER = 3;
function platformGrantRows(params: unknown[] = []) {
  const asked = Array.isArray(params[1]) ? (params[1] as string[]) : [];
  return { rows: params[0] === PLATFORM_GRANT_HOLDER && asked.includes('platform_admin') ? [{ '?column?': 1 }] : [] };
}

const walkOk = { ok: true, rowsChecked: 4, tenants: 2, legacyRows: 0, sequencedRows: 4 };
const originalEnv = { ...process.env };

beforeEach(() => {
  h.objects.clear();
  h.objects.set(ANCHOR_KEY, Buffer.from(JSON.stringify({
    format: 'c2c.audit-chain-anchor/1', store: 'public.audit_logs', anchoredAt: '2026-10-01T02:00:00.000Z', heads: [HEAD_7, HEAD_8],
  })));
  h.verifyAuditChain.mockReset().mockResolvedValue(walkOk);
  h.verifyAuditIntegrity.mockReset().mockResolvedValue({
    chain: walkOk, seals: { checked: true, valid: true, brokenAt: null }, ok: true, unverifiable: false,
  });
  h.dbQuery.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => {
    const anchor = answerAnchorStatements(sql, params);
    if (anchor) return anchor;
    // requirePlatformAdmin.ts resolvePlatformAdmin: a grant row for PLATFORM_ADMIN only.
    if (sql.includes('FROM platform_role_grants')) return platformGrantRows(params);
    throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
  });
  process.env.AUDIT_ANCHOR_BUCKET = BUCKET;
  clearIntegrityCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

/** A member of organisation 7 by default; a platform administrator only when the identity says so. */
function actionsApp(identity: Record<string, unknown> = { userId: 1, organizationId: 7 }) {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req as object, identity);
    next();
  });
  app.use('/api/c2c/actions', actionsRouter);
  return app;
}

const ORG_8_ADMIN = { userId: 2, organizationId: 8, user: { id: 2, organizationId: 8, role: 'admin', roles: ['admin'] } };
// Admitted by its platform_role_grants row (platformGrantRows), not by a role:
// its own id, so the default member of organisation 7 (user 1) holds no grant.
const PLATFORM_ADMIN = { userId: PLATFORM_GRANT_HOLDER, organizationId: 8, user: { id: PLATFORM_GRANT_HOLDER, organizationId: 8, role: 'member', roles: ['member'] } };
// A tenant membership row naming super_admin, and no platform grant.
const MEMBERSHIP_SUPER_ADMIN = { userId: 4, organizationId: 8, userRole: 'super_admin', user: { id: 4, organizationId: 8, role: 'super_admin', roles: ['super_admin'] } };

function part11App() {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req as object, { pool: { query: h.dbQuery }, user: { id: 1, organizationId: 7, roles: ['platform_admin'] } });
    next();
  });
  app.use('/', part11Router);
  return app;
}

function licensingApp() {
  const app = express();
  app.use('/api/admin/master', licensingRouter);
  return app;
}

/** The licensing page's own reads: one decision row, and the bounded size count. */
function answerLicensingReads() {
  h.dbQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const anchor = answerAnchorStatements(sql, params);
    if (anchor) return anchor;
    if (sql.includes('FROM (SELECT 1 FROM audit_logs LIMIT')) return { rows: [{ n: 4 }] };
    if (sql.includes('FROM audit_logs a')) {
      return {
        rows: [{
          id: 'aud-1', occurred_at: '2026-09-30T10:00:00.000Z', tenant_id: 8, user_id: 3, table_name: 'module_packaging',
          record_id: 'cmc', new_values: { masterAdminAction: 'module.repackage', reason: 'r' }, sha256_chain: 'x', hmac_seal: null,
          chain_seq: 1, total_matching: 1,
        }],
      };
    }
    throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
  });
}

describe('with an anchor bucket configured, a chain whose anchored head is gone is not reported ok', () => {
  it('GET /api/c2c/actions/verify-chain answers 409 and names the missing head (a member of organisation 7)', async () => {
    const res = await request(actionsApp()).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.head).toMatchObject({ verified: false, status: 'broken', anchorKey: ANCHOR_KEY });
    expect(res.body.head.breaks).toEqual([
      { organizationId: 7, rowId: HEAD_7.rowId, kind: 'head_missing', anchoredRows: 4, currentRows: 2 },
    ]);
  });

  it('GET /audit-trail/seal-integrity reports the integrity not ok, with the anchor break', async () => {
    const res = await request(part11App()).get('/audit-trail/seal-integrity');
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.head).toMatchObject({ verified: false, status: 'broken' });
  });

  it('the licensing history reports the record store broken, not verified', async () => {
    answerLicensingReads();
    const res = await request(licensingApp()).get('/api/admin/master/licensing/history');
    expect(res.status).toBe(200);
    expect(res.body.integrity).toMatchObject({ status: 'broken', reason: 'chain-head-broken', head: 'broken' });
  });

  it("the tenant verdict (ledger, export, compliance reports) is broken for the truncated organisation only", async () => {
    const seven = await verifyTenantChainOnAdminScope(7);
    expect(seven.ok).toBe(false);
    expect(seven.head).toMatchObject({ verified: false, status: 'broken' });
    expect(seven.head.breaks.map((b) => b.organizationId)).toEqual([7]);

    const eight = await verifyTenantChainOnAdminScope(8);
    expect(eight.ok).toBe(true);
    expect(eight.head).toMatchObject({ verified: true, status: 'verified', breaks: [] });
  });

  it('npm run ops:verify-audit-chain reports public.audit_logs broken and exits 1', async () => {
    const report = await verifyAuditChains(scriptClient(), { AUDIT_ANCHOR_BUCKET: BUCKET });
    const logs = report.tables.find((t: { table: string }) => t.table === 'public.audit_logs');
    expect(logs).toMatchObject({ status: 'broken', firstBreak: { reason: 'chain head missing or different against the latest anchor' } });
    expect(logs?.head).toMatchObject({ verified: false, status: 'broken' });
    expect(report.verdict).toBe('broken');
    expect(report.exitCode).toBe(1);
  });
});

describe('without an anchor bucket, every verdict says it is a walk only', () => {
  beforeEach(() => {
    delete process.env.AUDIT_ANCHOR_BUCKET;
  });

  it('GET /api/c2c/actions/verify-chain', async () => {
    const res = await request(actionsApp()).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.head).toMatchObject({ verified: false, status: 'not_configured' });
    expect(res.body.head.reason).toMatch(LABEL);
  });

  it('GET /audit-trail/seal-integrity', async () => {
    const res = await request(part11App()).get('/audit-trail/seal-integrity');
    expect(res.body.data.head).toMatchObject({ verified: false, status: 'not_configured' });
    expect(res.body.data.head.reason).toMatch(LABEL);
  });

  it('the licensing history keeps the walk verdict and marks the head not verified', async () => {
    answerLicensingReads();
    const res = await request(licensingApp()).get('/api/admin/master/licensing/history');
    expect(res.body.integrity).toMatchObject({ status: 'verified', reason: 'chain-and-seals-verified', head: 'not-verified' });
  });

  it('the tenant verdict', async () => {
    const v = await verifyTenantChainOnAdminScope(7);
    expect(v.ok).toBe(true);
    expect(v.head).toMatchObject({ verified: false, status: 'not_configured' });
    expect(v.head.reason).toMatch(LABEL);
  });

  it('npm run ops:verify-audit-chain', async () => {
    const report = await verifyAuditChains(scriptClient(), {});
    const logs = report.tables.find((t: { table: string }) => t.table === 'public.audit_logs');
    expect(logs?.status).toBe('ok');
    expect(logs?.head).toMatchObject({ verified: false, status: 'not_configured' });
    expect(logs?.head?.reason).toMatch(LABEL);
  });
});

describe('an anchor bucket that cannot be read is an error to an operator verifier, never a verdict', () => {
  it('GET /api/c2c/actions/verify-chain does not answer ok (a member of organisation 7)', async () => {
    h.objects.set('anchors/audit-chain/2026/10/02/x.json', Buffer.from('{ not json'));
    const res = await request(actionsApp()).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.ok).toBeUndefined();
  });

  it('GET /api/c2c/actions/verify-chain does not answer ok (a platform administrator, estate-wide)', async () => {
    h.objects.set('anchors/audit-chain/2026/10/02/x.json', Buffer.from('{ not json'));
    const res = await request(actionsApp(PLATFORM_ADMIN)).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.ok).toBeUndefined();
  });

  it('npm run ops:verify-audit-chain reports public.audit_logs unverifiable (exit 2), not ok', async () => {
    h.objects.set('anchors/audit-chain/2026/10/02/x.json', Buffer.from('{ not json'));
    const report = await verifyAuditChains(scriptClient(), { AUDIT_ANCHOR_BUCKET: BUCKET });
    const logs = report.tables.find((t: { table: string }) => t.table === 'public.audit_logs');
    expect(logs?.status).toBe('unverifiable');
    expect(logs?.reason).toMatch(/anchor could not be read/);
    expect(report.exitCode).toBe(2);
  });
});

// ── Fix round (2026-10-01): IAM-26, DP-71, DP-72 ─────────────────────────────

describe('IAM-26: verify-chain gives a caller who is not a platform administrator their own organisation only', () => {
  it("an administrator of organisation 8 gets organisation 8's verdict, and nothing of organisation 7", async () => {
    const res = await request(actionsApp(ORG_8_ADMIN)).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'organization' });
    expect(h.verifyAuditChain).toHaveBeenCalledTimes(1);
    expect(h.verifyAuditChain.mock.calls[0][1]).toEqual({ tenantId: 8 });
    expect(res.body.head).toMatchObject({ verified: true, status: 'verified', breaks: [] });
    // Organisation 7's broken head, its row and its counts are not in the body.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(HEAD_7.rowId);
    expect(body).not.toContain('"organizationId":7');
    // The estate's tenant count is not either.
    expect(res.body.tenants).toBeUndefined();
  });

  it("a break the walk finds in another organisation's row is said to be there, not named", async () => {
    h.verifyAuditChain.mockResolvedValue({
      ...walkOk,
      ok: false,
      brokenAt: { id: 'their-row', expected: 'x'.repeat(64), stored: 'y'.repeat(64), tenantId: 9, segment: 'legacy', commitsTo: { id: 'their-prev', tenantId: 9 } },
    });
    const res = await request(actionsApp(ORG_8_ADMIN)).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBe(409);
    expect(res.body.brokenAt).toEqual({ segment: 'legacy', row: 'another organization', commitsTo: 'another organization' });
    for (const secret of ['their-row', 'their-prev', 'x'.repeat(64), 'y'.repeat(64)]) {
      expect(JSON.stringify(res.body)).not.toContain(secret);
    }
  });

  it("a tenant membership role of super_admin with no platform grant gets its own organisation only", async () => {
    const res = await request(actionsApp(MEMBERSHIP_SUPER_ADMIN)).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'organization' });
    expect(h.verifyAuditChain.mock.calls[0][1]).toEqual({ tenantId: 8 });
    expect(JSON.stringify(res.body)).not.toContain(HEAD_7.rowId);
  });

  it('a platform administrator still gets the estate-wide verdict, every organisation\'s break included', async () => {
    const res = await request(actionsApp(PLATFORM_ADMIN)).get('/api/c2c/actions/verify-chain');
    expect(res.status).toBe(409);
    expect(res.body.scope).toBe('estate');
    expect(h.verifyAuditChain.mock.calls[0]).toHaveLength(1);
    expect(res.body.head.breaks.map((b: { organizationId: number }) => b.organizationId)).toEqual([7]);
  });
});

/** The ledger's own reads: one chained audit_logs row of organisation 7, no audit_events, no signature stores. */
function ledgerClient(): Pick<PoolClient, 'query'> {
  const client = {
    async query(sql: string) {
      if (sql.includes("to_regclass('electronic_signatures')")) return { rows: [{ qms: false, authoring: false, authoring_titles: false }] };
      if (sql.includes('FROM audit_events')) return { rows: [] };
      if (sql.includes('FROM audit_logs')) {
        return {
          rows: [{
            id: 'aud-7', action: 'vault.document.filed', actor_id: 3, target: null, table_name: 'vault_document', record_id: 'doc-1',
            reason: 'filed', ip_address: null, new_values: {}, occurred_at: '2026-09-30T20:00:00.000Z', sha256_chain: 'a'.repeat(64),
            chain_seq: '2', prev_hash: 'b'.repeat(64), when_display: '2026-09-30 20:00', user_name: 'Q. Reviewer', user_email: null,
          }],
        };
      }
      throw new Error(`unexpected ledger statement: ${sql.slice(0, 80)}`);
    },
  };
  return client as unknown as Pick<PoolClient, 'query'>;
}

/** Enough of a pool for the signed export: empty stores, and the export record's id. */
const exportPool = {
  query: async (sql: string) => (/INSERT INTO audit_events/.test(sql) ? { rows: [{ id: 501 }] } : { rows: [] }),
};
const exportRequest = { organizationId: 7, format: 'json' as const, exportedBy: 'inspector', exportedByRole: 'admin' };

/** The integrity attestation's chain row, run on what walkTenantChain says for organisation 7. */
async function reportChainRow() {
  const client = { query: vi.fn(async () => ({ rows: [] })) };
  const ctx: RunContext = {
    client,
    orgId: 7,
    period: { from: '2026-09-01', to: '2026-09-30', kind: 'range' },
    bounds: { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' },
    chain: await walkTenantChain(7),
    checks: {
      auditEventsLinkage: async () => ({ status: 'intact', totalEntries: 1, hashedEntries: 1, brokenLinks: 0 }),
      auditLogsSeals: async () => ({ ran: true, valid: true, sealedRows: 1, brokenAt: null }),
    },
  };
  const out = await findReport('audit-trail-integrity')!.run!(ctx);
  return out.verdicts.rows.find((r) => r.check === 'audit_logs hash chain')!;
}

describe('DP-71: every reader of the tenant verdict states what it did about the head', () => {
  beforeEach(() => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = 'b'.repeat(40);
  });

  describe('no anchor bucket: the verdict is the walk only, and each reader says so', () => {
    beforeEach(() => {
      delete process.env.AUDIT_ANCHOR_BUCKET;
    });

    it('the ledger (meta.chain)', async () => {
      const out = await readAuditLedger(ledgerClient(), 7, 10);
      expect(out.meta.chain.ok).toBe(true);
      expect(out.meta.chain.head).toMatchObject({ verified: false, status: 'not_configured' });
      expect(out.meta.chain.head?.reason).toMatch(LABEL);
    });

    it("a document's history (meta.chain)", async () => {
      const out = await readRecordAuditHistory(ledgerClient(), 7, { tableName: 'vault_document', recordId: 'doc-1' });
      expect(out.meta.chain.head).toMatchObject({ status: 'not_configured' });
      expect(out.meta.chain.head?.reason).toMatch(LABEL);
    });

    it('the export walk (turn-record and authoring exports)', async () => {
      const v = await walkTenantChain(7);
      expect(v.ok).toBe(true);
      expect(v.head).toMatchObject({ status: 'not_configured' });
      expect(v.head?.reason).toMatch(LABEL);
    });

    it("the signed audit export's manifest", async () => {
      const out = await generateSignedAuditExport(exportPool as never, exportRequest, { verifyAuditLogsChain: verifyTenantChainOnAdminScope });
      expect(out.manifest.auditLogsChain).toMatchObject({ status: 'intact', head: { status: 'not_configured' } });
      expect(out.manifest.auditLogsChain?.head?.reason).toMatch(LABEL);
    });

    it("the integrity attestation's chain row", async () => {
      const row = await reportChainRow();
      expect(row.verdict).toBe('intact');
      expect(row.detail).toMatch(LABEL);
    });
  });

  describe("organisation 7's anchored head is gone: each reader says broken and where, never 'null'", () => {
    it('the ledger (meta.chain)', async () => {
      const out = await readAuditLedger(ledgerClient(), 7, 10);
      expect(out.meta.chain.ok).toBe(false);
      expect(out.meta.chain.head).toMatchObject({ status: 'broken' });
      expect(out.meta.chain.head?.breaks).toEqual([
        { organizationId: 7, rowId: HEAD_7.rowId, kind: 'head_missing', anchoredRows: 4, currentRows: 2 },
      ]);
    });

    it('the export walk', async () => {
      const v = await walkTenantChain(7);
      expect(v.ok).toBe(false);
      expect(v.head?.breaks?.map((b) => b.rowId)).toEqual([HEAD_7.rowId]);
    });

    it("the signed audit export's manifest", async () => {
      const out = await generateSignedAuditExport(exportPool as never, exportRequest, { verifyAuditLogsChain: verifyTenantChainOnAdminScope });
      expect(out.manifest.auditLogsChain).toMatchObject({ status: 'broken', head: { status: 'broken' } });
      expect(out.manifest.auditLogsChain?.head?.breaks?.map((b) => b.rowId)).toEqual([HEAD_7.rowId]);
    });

    it("the integrity attestation's chain row", async () => {
      const row = await reportChainRow();
      expect(row.verdict).toBe('broken');
      expect(row.detail).not.toBe('null');
      expect(row.detail).toContain(HEAD_7.rowId);
      expect(row.detail).toMatch(/missing or different/);
    });

    it("organisation 8's readers name nothing of organisation 7", async () => {
      const out = await readAuditLedger(ledgerClient(), 8, 10);
      expect(out.meta.chain).toMatchObject({ ok: true, head: { status: 'verified', breaks: [] } });
      expect(JSON.stringify(out.meta.chain)).not.toContain(HEAD_7.rowId);
    });
  });
});

describe("DP-72: an anchor that cannot be read leaves a tenant's own audit trail readable, and unverified", () => {
  beforeEach(() => {
    process.env.AUDIT_EXPORT_SIGNING_KEY = 'b'.repeat(40);
    h.objects.set('anchors/audit-chain/2026/10/02/x.json', Buffer.from('{ not json'));
  });

  const UNREADABLE = /^head not verified against the anchor: the anchor could not be read/;

  it('the tenant verdict is the walk, with the head unavailable and ok null (not ok, not broken)', async () => {
    const v = await verifyTenantChainOnAdminScope(7);
    expect(v.ok).toBeNull();
    expect(v.rowsChecked).toBe(4);
    expect(v.head).toMatchObject({ verified: false, status: 'unavailable', breaks: [] });
    expect(v.head.reason).toMatch(UNREADABLE);
  });

  it('the ledger still returns its entries, and its verdict is unverified', async () => {
    const out = await readAuditLedger(ledgerClient(), 7, 10);
    expect(out.data.map((e) => e.id)).toEqual(['AUD-aud-7']);
    expect(out.meta.chain.ok).toBeNull();
    expect(out.meta.chain.head).toMatchObject({ status: 'unavailable' });
    expect(out.meta.chain.head?.reason).toMatch(UNREADABLE);
  });

  it("a document's history still returns its entries, unverified", async () => {
    const out = await readRecordAuditHistory(ledgerClient(), 7, { tableName: 'vault_document', recordId: 'doc-1' });
    expect(out.data).toHaveLength(1);
    expect(out.meta.chain.ok).toBeNull();
  });

  it('the export walk, the signed manifest and the attestation say not verified, with the reason', async () => {
    const v = await walkTenantChain(7);
    expect(v).toMatchObject({ ok: null, head: { status: 'unavailable' } });
    expect(v.reason).toMatch(UNREADABLE);

    const out = await generateSignedAuditExport(exportPool as never, exportRequest, { verifyAuditLogsChain: verifyTenantChainOnAdminScope });
    expect(out.manifest.auditLogsChain).toMatchObject({ status: 'unverified', head: { status: 'unavailable' } });
    expect(out.manifest.auditLogsChain?.reason).toMatch(UNREADABLE);

    const row = await reportChainRow();
    expect(row.verdict).toBe('not verified');
    expect(row.detail).toMatch(UNREADABLE);
  });

  it('a walk that fails still fails: only the head step is caught', async () => {
    h.verifyAuditChain.mockRejectedValue(new Error('walk failed'));
    await expect(verifyTenantChainOnAdminScope(7)).rejects.toThrow('walk failed');
  });
});

/** The ops script's connection: audit_logs present (4 chained, none sealed); the other two tables absent. */
function scriptClient() {
  return {
    async query(sql: string, params?: unknown[]) {
      const anchor = answerAnchorStatements(sql, params);
      if (anchor) return anchor;
      if (sql.includes('SELECT to_regclass($1)')) return { rows: [{ present: params?.[0] === 'public.audit_logs' }] };
      if (sql.includes('count(sha256_chain)::int AS chained')) return { rows: [{ total: 4, chained: 4, sealed: 0 }] };
      throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
    },
  };
}
