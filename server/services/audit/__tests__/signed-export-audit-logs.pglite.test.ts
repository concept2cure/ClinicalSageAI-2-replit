/**
 * VR-02 (docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md; first half of
 * P1-19 in docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md) —
 * the signed audit export contains the Vault's events.
 *
 * The export an inspector receives (Admin → Audit trail → Export, GET
 * /api/audit/export/signed) read audit_events only. Every launch app writes its
 * governed events — Vault ingest, filing, download — to audit_logs through the
 * one chained writer, so none of them appeared in any exported file:
 * §11.10(b) asks for accurate and COMPLETE copies.
 *
 * Real SQL on PGlite: the real audit_logs DDL and chain_seq migration, rows
 * written by the real chained writer in a transaction.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { writeChainedAuditRow } from '../../auditService';
import { generateSignedAuditExport, verifySignedAuditExport } from '../signedAuditExport';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../migrations/20260921_audit_logs_chain_seq.sql',
);
const ORG = 51, OTHER = 52;
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let pg: PGlite;
const pool = { query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]) } as never;

async function vaultEvent(tenantId: number, action: string, recordId: string) {
  await pg.transaction(async (tx) => {
    await writeChainedAuditRow(tx as never, {
      tenantId, userId: 3, action, resourceType: 'vault_document', resourceId: recordId, details: { recordId },
    });
  });
}

const base = { organizationId: ORG, format: 'json' as const, exportedBy: 'inspector-probe', exportedByRole: 'admin' };
const ok = async () => ({ ok: true, rowsChecked: 4, legacyRows: 0, sequencedRows: 4 }) as never;
const rowsOf = (data: string) => JSON.parse(data) as Array<Record<string, unknown>>;

beforeAll(async () => {
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'test-export-key';
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
  // Real columns the shared fixture predates (0000_sweet_joseph.sql, 20260527_mutation_primitives.sql:86).
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
                 ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
  // The columns of audit_events the export reads and writes.
  await pg.exec(`CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, event_type TEXT, entity_type TEXT,
    entity_id INTEGER NOT NULL DEFAULT 0, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), reason TEXT, comments TEXT, metadata JSONB,
    regulatory_significant BOOLEAN, gxp_relevant BOOLEAN, record_hash TEXT, previous_hash TEXT,
    sequence_number INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  await pg.exec(`DELETE FROM audit_logs; DELETE FROM audit_events;`);
  await pg.query(`INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name)
                  VALUES ($1, 'scim.user.provisioned', 'user', 9, 'scim')`, [ORG]);
  await vaultEvent(ORG, 'vault.document.ingest', DOC);
  await vaultEvent(ORG, 'vault.document.file', DOC);
  await vaultEvent(ORG, 'vault.document.ingest', DOC2);
  await vaultEvent(OTHER, 'vault.document.ingest', DOC);
});

describe('the signed export carries audit_logs', () => {
  it('contains the Vault events, each with its chain hash, sequence and source', async () => {
    const out = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok });
    const rows = rowsOf(out.data);
    const vault = rows.filter((r) => r.source === 'audit_logs');
    expect(vault.map((r) => r.event_type).sort()).toEqual(['vault.document.file', 'vault.document.ingest', 'vault.document.ingest']);
    for (const r of vault) {
      expect(r.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
      expect(r.chain_seq).not.toBeNull();
      expect(r.entity_type).toBe('vault_document');
    }
    expect(out.manifest.sources).toEqual({ audit_events: 1, audit_logs: 3 });
  });

  it('never carries another tenant\'s rows', async () => {
    const out = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok });
    expect(rowsOf(out.data).every((r) => Number(r.organization_id) === ORG)).toBe(true);
  });

  it('still carries the audit_events rows it always did', async () => {
    const out = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok });
    expect(rowsOf(out.data).filter((r) => r.source === 'audit_events').map((r) => r.event_type)).toEqual(['scim.user.provisioned']);
  });

  it('narrows to one document when asked, and the manifest says so', async () => {
    const out = await generateSignedAuditExport(pool, { ...base, resourceType: 'vault_document', recordIds: [DOC] }, { verifyAuditLogsChain: ok });
    const rows = rowsOf(out.data);
    expect(rows.map((r) => r.event_type).sort()).toEqual(['vault.document.file', 'vault.document.ingest']);
    expect(rows.every((r) => r.entity_id === DOC)).toBe(true);
    expect(out.manifest.queryFilters).toMatchObject({ resourceType: 'vault_document', recordIds: [DOC] });
  });

  it('verifies, and refuses after a one-byte change to a row', async () => {
    const out = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok });
    expect(verifySignedAuditExport(out.data, out.manifest, out.signature).valid).toBe(true);
    const tampered = out.data.replace('vault.document.file', 'vault.document.fild');
    expect(verifySignedAuditExport(tampered, out.manifest, out.signature).valid).toBe(false);
  });

  it('states the audit_logs chain verdict it was given — and never "intact" without one', async () => {
    const broken = async () => ({ ok: false, rowsChecked: 4, legacyRows: 0, sequencedRows: 4, brokenAt: 'row-x' }) as never;
    const withBroken = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: broken });
    expect(withBroken.manifest.auditLogsChain).toMatchObject({ status: 'broken', brokenAt: 'row-x' });
    const withNone = await generateSignedAuditExport(pool, base);
    expect(withNone.manifest.auditLogsChain?.status).toBe('unverified');
    expect(withNone.manifest.auditLogsChain?.reason).toBeTruthy();
  });
});
