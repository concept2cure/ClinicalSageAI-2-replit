/**
 * AUD-01 (client administration walk, 2026-11-10): the signed export carries
 * what a governed change changed, as the audit trail screen shows it.
 *
 * The walker searched the 65 kB signed export for "sessionTimeoutMinutes",
 * "before", "requirePdfA" and "seatsPurchased": each appeared 0 times. The
 * export read audit_logs without its stored values (new_values / old_values), so
 * an inspector's copy of a settings change said only that settings changed.
 * §11.10(b) asks for accurate and complete copies.
 *
 * Real SQL on PGlite, rows written by the real chained writer.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { writeChainedAuditRow } from '../../auditService';
import { generateSignedAuditExport, verifySignedAuditExport } from '../signedAuditExport';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ORG = 7;
let pg: PGlite;
const pool = { query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]) } as never;
const ok = async () => ({ ok: true, rowsChecked: 2, legacyRows: 0, sequencedRows: 2 }) as never;
const base = { organizationId: ORG, format: 'json' as const, exportedBy: 'inspector', exportedByRole: 'admin' };

async function write(action: string, resourceType: string, resourceId: string, details: Record<string, unknown>, reason?: string) {
  await pg.transaction(async (tx) => {
    await writeChainedAuditRow(tx as never, { tenantId: ORG, userId: 5, action, resourceType, resourceId, details, reason });
  });
}

beforeAll(async () => {
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'test-export-key';
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
                 ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
  await pg.exec(`CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, event_type TEXT, entity_type TEXT,
    entity_id INTEGER NOT NULL DEFAULT 0, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(), old_values JSON, new_values JSON, changed_fields JSON,
    reason TEXT, comments TEXT, metadata JSONB,
    regulatory_significant BOOLEAN, gxp_relevant BOOLEAN, record_hash TEXT, previous_hash TEXT,
    sequence_number INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, name text, email text);
    INSERT INTO users (id, name, email) VALUES (5, 'Avery Lind', 'avery@example.test'), (11, 'Priya Raman', 'priya@example.test');
    CREATE TABLE IF NOT EXISTS organization_users (user_id integer, organization_id integer);
    INSERT INTO organization_users VALUES (5, ${ORG}), (11, ${ORG});`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260929_actor_names.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec('DELETE FROM audit_logs; DELETE FROM audit_events;');
  await write('tenant_settings_changed', 'organization_settings', '7', {
    sections: ['security'], changedFields: { security: ['sessionTimeoutMinutes'] },
    values: { security: { before: { sessionTimeoutMinutes: 15 }, after: { sessionTimeoutMinutes: 1 } } },
  }, 'Shorter idle sign-out');
  await write('compliance.seats_purchased.update', 'organization_seats', '7', {
    reason: 'Restore the seat count', previousValue: { seatsPurchased: 50 }, newValue: { seatsPurchased: 5 } });
  await write('member_role_changed', 'organization_users', '11',
    { targetUserId: 11, previousRole: 'approver', newRole: 'admin', reason: 'Continuity' }, 'Continuity');
});

const logRows = (data: string) => (JSON.parse(data) as Array<Record<string, unknown>>).filter((r) => r.source === 'audit_logs');

describe('the signed export carries what a governed change changed (AUD-01)', () => {
  it('carries the stored values: the walker\'s four searches now find them', async () => {
    const out = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok });
    for (const word of ['sessionTimeoutMinutes', '"before"', 'seatsPurchased']) {
      expect(out.data.includes(word), `${word} in the export`).toBe(true);
    }
  });

  it('carries each change in words, the person and the thing named, and the stored reason', async () => {
    const rows = logRows((await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok })).data);
    const by = (a: string) => rows.find((r) => r.event_type === a) as Record<string, unknown>;

    const settings = by('tenant_settings_changed');
    expect(settings.event_name).toBe('Organisation settings changed');
    expect(settings.target_name).toBe('Organisation settings');
    expect(settings.change_summary).toBe('idle sign-out (minutes) from 15 to 1');
    expect(settings.changes).toEqual([{ field: 'security.sessionTimeoutMinutes', label: 'Idle sign-out (minutes)', before: '15', after: '1' }]);
    expect(settings.reason).toBe('Shorter idle sign-out');
    expect(settings.user_name).toBe('Avery Lind');

    const seats = by('compliance.seats_purchased.update');
    // V-3: the reason column is exported exactly as stored (it is part of what an inspector re-hashes);
    // the reason the writer kept with the values is carried beside it, never in its place.
    expect(seats.reason, 'the stored reason column, unchanged').toBeNull();
    expect(seats.reason_from_values, 'the reason stored with the values').toBe('Restore the seat count');
    expect(settings.reason_from_values, 'a row whose column holds the reason').toBeNull();
    expect(seats.change_summary).toBe('purchased seats from 50 to 5');

    const role = by('member_role_changed');
    expect(role.target_name).toBe('Priya Raman');
    expect(role.change_summary).toBe('role from Approver to Administrator');
    expect((role.new_values as Record<string, unknown>).previousRole).toBe('approver');
  });

  it('still verifies, and a one-byte change to a stored value is refused', async () => {
    const out = await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok });
    expect(verifySignedAuditExport(out.data, out.manifest, out.signature).valid).toBe(true);
    const tampered = out.data.replace('"sessionTimeoutMinutes": 1', '"sessionTimeoutMinutes": 9');
    expect(tampered).not.toBe(out.data);
    expect(verifySignedAuditExport(tampered, out.manifest, out.signature).valid).toBe(false);
  });

  it('an audit_logs row stored with old_values carries them unchanged (V-4b)', async () => {
    await pg.query(
      `INSERT INTO audit_logs (id, tenant_id, user_id, actor_id, action, table_name, record_id, target, sha256_chain, old_values, new_values)
       VALUES ('ov-1', $1, 5, 5, 'update', 'organization', '7', 'organization:7', $2, $3::json, $4::json)`,
      [ORG, 'd'.repeat(64), JSON.stringify({ name: 'Acme Bio' }), JSON.stringify({ name: 'Acme Biologics' })]);
    const row = logRows((await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok })).data).find((r) => r.id === 'ov-1') as Record<string, unknown>;
    expect(row.old_values).toEqual({ name: 'Acme Bio' });
    expect(row.new_values).toEqual({ name: 'Acme Biologics' });
    expect(row.change_summary).toBe('name from Acme Bio to Acme Biologics');
  });

  it('a governed change whose row holds no values says so, as the audit trail does (V-4c)', async () => {
    await write('billing.budget.update', 'billing_budgets', '7', { reason: 'Quarterly review' });
    const row = logRows((await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok })).data)
      .find((r) => r.event_type === 'billing.budget.update') as Record<string, unknown>;
    expect(row.change_note).toBe('This entry does not record the values before and after.');
    expect(row.change_summary).toBeNull();
  });

  it('a change whose value before and after are the same says it stayed (V-2)', async () => {
    await write('compliance.seats_purchased.update', 'organization_seats', '7', {
      reason: 'Confirm', previousValue: { seatsPurchased: 5 }, newValue: { seatsPurchased: 5 } });
    const row = logRows((await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok })).data)
      .find((r) => r.reason_from_values === 'Confirm') as Record<string, unknown>;
    expect(row.change_summary).toBe('purchased seats stayed at 5');
    expect(row.change_note).toBeNull();
  });

  it('a large stored object is said in a bounded line, never in full (V-6)', async () => {
    const big = (tag: string) => Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`section${i}`, { title: `${tag} heading ${i}`, pages: [i, i + 1, i + 2] }]));
    await pg.query(
      `INSERT INTO audit_logs (id, tenant_id, user_id, actor_id, action, table_name, record_id, target, sha256_chain, old_values, new_values)
       VALUES ('big-1', $1, 5, 5, 'vault.document.update', 'vault_document', 'v9', 'vault_document:v9', $2, $3::json, $4::json)`,
      [ORG, 'e'.repeat(64), JSON.stringify({ outline: big('Old'), tags: Array.from({ length: 80 }, (_, i) => `old-tag-${i}`) }),
        JSON.stringify({ outline: big('New'), tags: Array.from({ length: 80 }, (_, i) => `new-tag-${i}`) })]);
    const row = logRows((await generateSignedAuditExport(pool, base, { verifyAuditLogsChain: ok })).data).find((r) => r.id === 'big-1') as Record<string, unknown>;
    const changes = row.changes as Array<{ before: string; after: string }>;
    expect(changes.length).toBe(2);
    for (const c of changes) {
      expect(c.before.length).toBeLessThanOrEqual(120);
      expect(c.after.length).toBeLessThanOrEqual(120);
    }
    expect(String(row.change_summary).length).toBeLessThanOrEqual(600);
    // The stored values themselves are carried whole.
    expect(Object.keys((row.new_values as { outline: object }).outline)).toHaveLength(60);
  });

  it('the CSV carries the same columns', async () => {
    const out = await generateSignedAuditExport(pool, { ...base, format: 'csv' }, { verifyAuditLogsChain: ok });
    const header = out.data.split('\n')[0];
    for (const col of ['event_name', 'target_name', 'change_summary', 'change_note', 'reason_from_values', 'old_values', 'new_values']) {
      expect(header.includes(`"${col}"`) || header.split(',').includes(col), col).toBe(true);
    }
    expect(out.data).toContain('idle sign-out (minutes) from 15 to 1');
  });
});
