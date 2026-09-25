/**
 * Audit immutability trigger check — unit tests against a fake catalog client,
 * plus a drift guard between the expected-trigger list and the migrations that
 * create the triggers (security audit 2026-09-24 finding DP-06, plan item P0-9a).
 *
 * The real catalog (pg_trigger / pg_class / pg_namespace) is exercised in
 * audit-immutability-triggers.pglite.test.ts; here the client answers the one
 * probe statement from rows each test controls.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAuditImmutabilityTriggers,
  describeAuditImmutabilityGap,
  EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS,
  type AuditImmutabilityTriggerReport,
  type ExpectedImmutabilityTrigger,
} from '../audit-immutability-triggers';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// A type alias, not an interface: the probe's client returns Record<string, unknown>
// rows, and only an alias is assignable to that without an index signature.
type CatalogRow = {
  schema_name: string;
  table_name: string;
  trigger_name: string;
  table_present: boolean;
  trigger_present: boolean;
  tgenabled: string | null;
};

/** One catalog row per expected trigger, as the probe returns it when all is well. */
function healthyRows(): CatalogRow[] {
  return EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.map((t: ExpectedImmutabilityTrigger) => ({
    schema_name: t.schema,
    table_name: t.table,
    trigger_name: t.trigger,
    table_present: true,
    trigger_present: true,
    tgenabled: 'O',
  }));
}

function fakeClient(rows: CatalogRow[]) {
  // Typed to the probe's TriggerCatalogClient contract: an interface row type is
  // not assignable to Record<string, unknown> without the widening.
  const query = vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> => ({
      rows: rows as unknown as Record<string, unknown>[],
    }),
  );
  return { query, calls: query.mock.calls };
}

const qualified = (t: ExpectedImmutabilityTrigger) => `${t.schema}.${t.table}.${t.trigger}`;

describe('EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS', () => {
  it('names the immutability triggers of every audit store the sweep verifies', () => {
    const names = EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.map(qualified);
    expect(names).toEqual(
      expect.arrayContaining([
        'public.audit_logs.trg_audit_logs_no_update',
        'public.audit_logs.trg_audit_logs_no_delete',
        'public.audit_logs.trg_audit_logs_no_truncate',
        'public.audit_events.trg_audit_events_no_update',
        'public.audit_events.trg_audit_events_no_delete',
        'public.audit_events.trg_audit_events_no_truncate',
        'audit.tamper_proof_log.trg_prevent_audit_mutation',
        'public.electronic_signatures.trg_electronic_signatures_immutable',
      ]),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('is created by a migration on the deploy applier, under exactly that name (drift guard)', () => {
    const migrationSet = fs.readFileSync(path.join(repoRoot, 'scripts/db/migration-set.mjs'), 'utf8');
    for (const t of EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS) {
      const sql = fs.readFileSync(path.join(repoRoot, t.source), 'utf8');
      expect(sql, `${t.source} must CREATE TRIGGER ${t.trigger}`).toMatch(
        new RegExp(`CREATE TRIGGER\\s+${t.trigger}\\b`),
      );
      expect(migrationSet, `${t.source} must be in C2C_MIGRATION_FILES`).toContain(`'${t.source}'`);
    }
  });
});

describe('assertAuditImmutabilityTriggers', () => {
  it('reports ok when every expected trigger is present and enabled', async () => {
    const client = fakeClient(healthyRows());
    const report = await assertAuditImmutabilityTriggers(client);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.disabled).toEqual([]);
    expect(report.tablesAbsent).toEqual([]);
    expect(report.present).toBe(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.length);
    expect(report.expected).toBe(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.length);
  });

  it('issues one read-only catalog probe over pg_trigger, pg_class and pg_namespace, parameterised', async () => {
    const client = fakeClient(healthyRows());
    await assertAuditImmutabilityTriggers(client);
    expect(client.calls).toHaveLength(1);
    const [sql, params] = client.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/pg_trigger/);
    expect(sql).toMatch(/pg_class/);
    expect(sql).toMatch(/pg_namespace/);
    expect(sql).toMatch(/tgisinternal/);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
    // Every expected (schema, table, trigger) travels as a bind parameter, never interpolated.
    expect(params).toHaveLength(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.length * 3);
    expect(params).toContain('trg_audit_logs_no_delete');
    expect(sql).not.toContain('trg_audit_logs_no_delete');
  });

  it('names a trigger the catalog does not have (trg_audit_logs_no_delete dropped)', async () => {
    const rows = healthyRows().map((r) =>
      r.trigger_name === 'trg_audit_logs_no_delete' ? { ...r, trigger_present: false, tgenabled: null } : r,
    );
    const report = await assertAuditImmutabilityTriggers(fakeClient(rows));
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['public.audit_logs.trg_audit_logs_no_delete']);
    expect(report.disabled).toEqual([]);
    expect(report.tablesAbsent).toEqual([]);
    expect(report.present).toBe(EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS.length - 1);
  });

  it('treats a disabled trigger (ALTER TABLE … DISABLE TRIGGER) as not protecting the table', async () => {
    const rows = healthyRows().map((r) =>
      r.trigger_name === 'trg_prevent_audit_mutation' ? { ...r, tgenabled: 'D' } : r,
    );
    const report = await assertAuditImmutabilityTriggers(fakeClient(rows));
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([]);
    expect(report.disabled).toEqual(['audit.tamper_proof_log.trg_prevent_audit_mutation']);
  });

  it('reports a table that does not exist yet as missing every trigger on it', async () => {
    const rows = healthyRows().map((r) =>
      r.table_name === 'audit_events'
        ? { ...r, table_present: false, trigger_present: false, tgenabled: null }
        : r,
    );
    const report = await assertAuditImmutabilityTriggers(fakeClient(rows));
    expect(report.ok).toBe(false);
    expect(report.tablesAbsent).toEqual(['public.audit_events']);
    expect(report.missing).toEqual([
      'public.audit_events.trg_audit_events_no_update',
      'public.audit_events.trg_audit_events_no_delete',
      'public.audit_events.trg_audit_events_no_truncate',
    ]);
  });

  it('fails closed when the probe returns no row for an expected trigger', async () => {
    // A row that never comes back is not a pass: the expected list, not the
    // result set, decides what was checked.
    const rows = healthyRows().filter((r) => r.trigger_name !== 'trg_electronic_signatures_immutable');
    const report = await assertAuditImmutabilityTriggers(fakeClient(rows));
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(['public.electronic_signatures.trg_electronic_signatures_immutable']);
  });

  it('propagates a probe failure rather than reporting ok (caller decides the posture)', async () => {
    const client = { query: vi.fn().mockRejectedValue(new Error('permission denied for table pg_trigger')) };
    await expect(assertAuditImmutabilityTriggers(client)).rejects.toThrow(/permission denied/);
  });
});

describe('describeAuditImmutabilityGap', () => {
  it('names every missing and disabled trigger, the absent tables and the migration to run', () => {
    const report: AuditImmutabilityTriggerReport = {
      ok: false,
      expected: 8,
      present: 6,
      missing: ['public.audit_logs.trg_audit_logs_no_delete'],
      disabled: ['audit.tamper_proof_log.trg_prevent_audit_mutation'],
      tablesAbsent: [],
    };
    const message = describeAuditImmutabilityGap(report);
    expect(message).toContain('public.audit_logs.trg_audit_logs_no_delete');
    expect(message).toContain('audit.tamper_proof_log.trg_prevent_audit_mutation');
    expect(message).toContain('db/migrations/20260617_audit_logs_immutability.sql');
    expect(message).toContain('db/migrations/20260813_audit_tamper_proof_log.sql');
    expect(message).toMatch(/deploy-migrate/);
  });
});

describe('security-health panel exposure', () => {
  it('runs as a critical check that fails when a trigger is missing', async () => {
    const { __testing } = await import('../../securityHealth');
    const check = (__testing as Record<string, unknown>).checkAuditImmutabilityTriggers as
      | ((pool: unknown) => Promise<{ status: string; critical: boolean; reason?: string; name: string }>)
      | undefined;
    expect(check, 'checkAuditImmutabilityTriggers must be on the panel').toBeTypeOf('function');

    const rows = healthyRows().map((r) =>
      r.trigger_name === 'trg_audit_events_no_delete' ? { ...r, trigger_present: false, tgenabled: null } : r,
    );
    const failing = await check!(fakeClient(rows));
    expect(failing.name).toBe('audit_immutability_triggers');
    expect(failing.status).toBe('fail');
    expect(failing.critical).toBe(true);
    expect(failing.reason).toContain('public.audit_events.trg_audit_events_no_delete');

    const passing = await check!(fakeClient(healthyRows()));
    expect(passing.status).toBe('pass');
    expect(passing.critical).toBe(true);
  });
});
