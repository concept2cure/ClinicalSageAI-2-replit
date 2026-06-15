/**
 * External validation-report persistence — END-TO-END against in-process PGlite.
 *
 * Proves the DB-backed service executes its SQL (insert with RETURNING, ordering,
 * jsonb round-trip, org scoping). The audit sink is stubbed (audit_logs is out of
 * scope for this harness). Mirrors ind-persistence-pglite.integration.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../../db/pglite-harness';
import type { ExternalValidationReport } from '../types';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../../auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import {
  createValidationReport,
  listValidationReports,
  getLatestValidationReport,
} from '../validation-report-persistence';

let harness: IndPgliteDb;
const ctx = { organizationId: 1, userId: 9 };

const report = (errorCount: number): ExternalValidationReport => ({
  validatorName: 'internal-criteria',
  validatorVersion: '1.0.0',
  findings: errorCount
    ? [{ severity: 'error', ruleId: 'UNRESOLVED_DOCUMENT', message: 'x', location: 'm1.2' }]
    : [],
  errorCount,
  warningCount: 0,
  ranAt: '2026-06-15T00:00:00.000Z',
});

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
});
afterAll(async () => {
  await harness.close();
});

describe('validation-report persistence against PGlite', () => {
  it('persists a report and reads it back (org-scoped, jsonb round-trip)', async () => {
    const created = await createValidationReport(
      { submissionId: 7, sequenceId: 42, report: report(2) },
      ctx,
    );
    expect(created.id).toBeTruthy();
    expect(created.organizationId).toBe(1);
    expect(created.errorCount).toBe(2);
    expect((created.report as ExternalValidationReport).validatorName).toBe('internal-criteria');
  });

  it('lists newest-first and getLatest returns the most recent', async () => {
    const first = await createValidationReport(
      { submissionId: 7, sequenceId: 99, report: report(1) },
      ctx,
    );
    const second = await createValidationReport(
      { submissionId: 7, sequenceId: 99, report: report(0) },
      ctx,
    );

    const list = await listValidationReports(99, ctx);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.id);
    expect(list.map((r) => r.id)).toContain(first.id);

    const latest = await getLatestValidationReport(99, ctx);
    expect(latest?.id).toBe(second.id);
    expect(latest?.errorCount).toBe(0);
  });

  it('getLatest returns null for a sequence with no reports', async () => {
    expect(await getLatestValidationReport(123456, ctx)).toBeNull();
  });

  it('does not leak across organizations', async () => {
    const a = await createValidationReport(
      { submissionId: 7, sequenceId: 555, report: report(1) },
      ctx,
    );
    const other = await listValidationReports(555, { organizationId: 2 });
    expect(other.map((r) => r.id)).not.toContain(a.id);
    expect(await getLatestValidationReport(555, { organizationId: 2 })).toBeNull();
  });
});
