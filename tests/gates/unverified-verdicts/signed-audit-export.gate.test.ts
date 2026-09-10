/**
 * WO-16B findings 25 and 26 — the signed audit export.
 *
 *   25  `snapshotChainIntegrity` returned `status: 'intact'` over an empty
 *       result set ("nothing to verify" rendered as "verified") and over a table
 *       whose rows carry no `record_hash` at all (the loop skipped every link
 *       and finished with brokenLinks === 0). The manifest then HMAC-signed
 *       that claim. Its `catch` branch honestly answered `'unavailable'` and is
 *       unchanged.
 *   26  The audit_events row recording that an export happened could never be
 *       written: the export id (a string) went into `entity_id integer NOT
 *       NULL`, raising 22P02 on every call into a swallowing catch — after the
 *       manifest had already been sealed without it.
 *
 * `generateSignedAuditExport(pool, …)` takes its pool as a parameter, so the
 * dependency is injected directly: a pool whose `query()` answers or rejects
 * the way a database would. Nothing at the service boundary is mocked.
 *
 * RED on the pre-fix head: 'intact' for the first two, and a sealed export
 * whose record INSERT had failed for the third.
 */
import { describe, expect, it } from 'vitest';
import { generateSignedAuditExport } from '../../../server/services/audit/signedAuditExport';
import { assertNoVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

type Row = Record<string, unknown>;

const unhashedRow = (i: number): Row => ({
  id: i,
  organization_id: 7,
  sequence_number: null,
  event_type: 'document.update',
  entity_type: 'document',
  entity_id: 100 + i,
  user_id: 1,
  user_name: 'Probe',
  user_role: 'admin',
  ip_address: '127.0.0.1',
  timestamp: new Date(2026, 8, 10, 12, 0, i),
  reason: 'r',
  comments: null,
  regulatory_significant: true,
  gxp_relevant: true,
  record_hash: null,
  previous_hash: null,
  created_at: new Date(2026, 8, 10, 12, 0, i),
});

const isChainSnapshot = (sql: string) => /ORDER BY organization_id, sequence_number/i.test(sql);
const isDataQuery = (sql: string) => /ORDER BY timestamp ASC/i.test(sql);
const isRecordInsert = (sql: string) => /INSERT INTO audit_events/i.test(sql);

/** A pool that serves `rows` to both SELECTs and records the export INSERT. */
function poolServing(rows: Row[], opts: { insert?: 'ok' | Error; snapshot?: 'ok' | Error } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    query: (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (isRecordInsert(sql)) {
        return opts.insert instanceof Error ? Promise.reject(opts.insert) : Promise.resolve({ rows: [{ id: 9 }], rowCount: 1 });
      }
      if (isChainSnapshot(sql)) {
        return opts.snapshot instanceof Error ? Promise.reject(opts.snapshot) : Promise.resolve({ rows, rowCount: rows.length });
      }
      if (isDataQuery(sql)) return Promise.resolve({ rows, rowCount: rows.length });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

const request = { organizationId: 7, format: 'json' as const, exportedBy: 'probe', exportedByRole: 'admin' };

describe('signed audit export: chainIntegrity is a verdict only when something was verified', () => {
  it('an all-unhashed table is "unverified", not "intact" — and the manifest says how many rows had no hash', async () => {
    const pool = poolServing([unhashedRow(1), unhashedRow(2), unhashedRow(3)]);
    const out = await generateSignedAuditExport(pool as any, request);
    expect(out.manifest.chainIntegrity.status).toBe('unverified');
    expect(out.manifest.chainIntegrity.totalEntries).toBe(3);
    expect(out.manifest.chainIntegrity.hashedEntries).toBe(0);
    expect(out.manifest.chainIntegrity.unhashedEntries).toBe(3);
    expect(out.manifest.chainIntegrity.reason).toMatch(/no row carries a record_hash/i);
    assertNoVerdictClaims(out.manifest.chainIntegrity, 'manifest.chainIntegrity (unhashed table)');
  });

  it('an empty result set is "unverified" with a reason, not "intact"', async () => {
    const pool = poolServing([]);
    const out = await generateSignedAuditExport(pool as any, request);
    expect(out.manifest.chainIntegrity.status).toBe('unverified');
    expect(out.manifest.chainIntegrity.totalEntries).toBe(0);
    expect(out.manifest.chainIntegrity.reason).toMatch(/no entries/i);
  });

  it('a snapshot query that fails is still "unavailable" — the honest branch is unchanged', async () => {
    const pool = poolServing([unhashedRow(1)], {
      snapshot: Object.assign(new Error('permission denied for table audit_events'), { code: '42501' }),
    });
    const out = await generateSignedAuditExport(pool as any, request);
    expect(out.manifest.chainIntegrity.status).toBe('unavailable');
    expect(out.manifest.chainIntegrity.reason).toMatch(/42501/);
  });
});

describe('signed audit export: the export must record itself, or refuse', () => {
  it('records the export BEFORE sealing, with an integer entity id, and carries the row id in the signed manifest', async () => {
    const pool = poolServing([unhashedRow(1)]);
    const out = await generateSignedAuditExport(pool as any, request);
    const insert = pool.calls.find(c => isRecordInsert(c.sql));
    expect(insert).toBeDefined();
    // organization_id then entity_id: both must be integers the columns accept.
    expect(insert!.params[0]).toBe(7);
    expect(Number.isInteger(insert!.params[1])).toBe(true);
    // The export id is still recorded — in the row's metadata, where a string belongs.
    expect(insert!.params.some(p => typeof p === 'string' && p.includes(out.manifest.exportId))).toBe(true);
    expect(out.manifest.exportRecord).toEqual({ auditEventId: 9 });
  });

  it('refuses to produce an export whose audit record could not be written (the pre-fix 22P02)', async () => {
    const pool = poolServing([unhashedRow(1)], {
      insert: Object.assign(new Error('invalid input syntax for type integer: "AUDIT-EXPORT-1"'), { code: '22P02' }),
    });
    await expect(generateSignedAuditExport(pool as any, request)).rejects.toMatchObject({
      name: 'VerificationUnavailableError',
    });
  });

  it('refuses without an organisation — the record must be attributable to a tenant', async () => {
    const pool = poolServing([unhashedRow(1)]);
    await expect(
      generateSignedAuditExport(pool as any, { ...request, organizationId: undefined }),
    ).rejects.toMatchObject({ name: 'VerificationUnavailableError' });
  });
});
