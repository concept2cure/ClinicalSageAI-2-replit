/**
 * Unit tests for the RBM site-risk engine's pure snapshot derivation.
 * Quality scores (0-100, higher better) invert to risk (higher worse), and the
 * monitoring tier is risk-proportionate. Covers both site_intel.sites variants.
 */

import { describe, it, expect } from 'vitest';
import {
  snapshotFromSiteRow, readProgramSites, SITE_READ_MESSAGE, type SiteReadFailure,
} from '../site-risk-engine';

describe('snapshotFromSiteRow', () => {
  it('inverts high quality scores to low risk → reduced tier', () => {
    const s = snapshotFromSiteRow({
      id: 1, site_number: 'S001', site_name: 'Alpha',
      enrollment_score: 90, quality_score: 90, operational_score: 90, composite_score: 90,
    });
    expect(s.enrollmentRisk).toBe(10);
    expect(s.qualityRisk).toBe(10);
    expect(s.operationalRisk).toBe(10);
    expect(s.compositeRisk).toBe(10);
    expect(s.monitoringTier).toBe('reduced');
    expect(s.drivers).toEqual([]);
    expect(s.siteId).toBe('1');
    expect(s.siteNumber).toBe('S001');
    expect(s.siteName).toBe('Alpha');
  });

  it('derives composite from components when absent and flags high-risk drivers', () => {
    const s = snapshotFromSiteRow({
      id: 2, site_number: 'S002',
      enrollment_score: 30, quality_score: 30, operational_score: 30,
    });
    expect(s.compositeRisk).toBe(70); // avg of three 70s
    expect(s.monitoringTier).toBe('enhanced');
    expect(s.drivers.sort()).toEqual(['enrollment', 'operational', 'quality']);
  });

  it('reads the alternate schema variant (overall_score / compliance_score)', () => {
    const s = snapshotFromSiteRow({
      id: 3, overall_score: 50, compliance_score: 50, enrollment_score: 50, quality_score: 50,
    });
    expect(s.operationalRisk).toBe(50); // from compliance_score
    expect(s.compositeRisk).toBe(50);   // from overall_score
    expect(s.monitoringTier).toBe('standard');
  });

  it('tolerates missing scores → null risks, reduced tier', () => {
    const s = snapshotFromSiteRow({ id: 4, site_number: 'S004' });
    expect(s.compositeRisk).toBeNull();
    expect(s.enrollmentRisk).toBeNull();
    expect(s.monitoringTier).toBe('reduced');
    expect(s.drivers).toEqual([]);
  });
});

/**
 * Tenant isolation and honest failure reporting.
 *
 * readProgramSites used to take only a programId and filter site_intel.sites on
 * `program_id = $1`. The recompute route reads programId from the request body,
 * so one organization could recompute against another organization's sites by
 * passing their program UUID — and the result was then persisted under the
 * caller's organization_id. These tests exist to keep that closed.
 */
describe('readProgramSites — tenant isolation', () => {
  const ORG = 42;
  const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  /** Scripted executor: records calls, returns canned rows or throws per step. */
  function mockExec(script: Array<any[] | Error>) {
    const calls: { sql: string; args: unknown[] }[] = [];
    let i = 0;
    const exec = {
      async query(sql: string, args: unknown[]) {
        calls.push({ sql, args });
        const step = script[i];
        i += 1;
        if (step instanceof Error) throw step;
        return { rows: step ?? [] };
      },
    };
    return { exec, calls };
  }

  const pgError = (code: string, message = code) =>
    Object.assign(new Error(message), { code });

  it('refuses a program the organization holds no RBQM records for', async () => {
    // Ownership check returns nothing → refuse.
    const { exec, calls } = mockExec([[]]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('not_in_tenant');
    // The critical property: Site Intelligence is never queried at all, so a
    // cross-tenant program UUID cannot reach another org's site data.
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).not.toContain('site_intel');
    expect(calls[0].args).toEqual([ORG, PROGRAM]);
  });

  it('scopes the ownership check by organization AND program', async () => {
    const { exec, calls } = mockExec([[{ '?column?': 1 }], []]);
    await readProgramSites(exec, ORG, PROGRAM);
    // Every branch of the ownership union must carry both predicates; a branch
    // missing organization_id would re-open the hole for that table.
    const ownership = calls[0].sql;
    const branches = ownership.split('UNION ALL');
    expect(branches.length).toBeGreaterThan(1);
    for (const b of branches) {
      expect(b).toContain('organization_id = $1');
      expect(b).toContain('program_id = $2');
    }
  });

  it('reads sites only after ownership is proved', async () => {
    const { exec, calls } = mockExec([
      [{ '?column?': 1 }],                                  // owns it
      [{ id: 1, site_number: 'S001', quality_score: 30 }],  // site_intel rows
    ]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.rows).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toContain('site_intel.sites');
  });

  it('distinguishes a missing source from a study with no sites', async () => {
    // The defect this replaces: `catch { return [] }` made these identical, so an
    // uninstalled Site Intelligence rendered as a study with clean site risk.
    const missing = mockExec([[{ '?column?': 1 }], pgError('42P01')]);
    const m = await readProgramSites(missing.exec, ORG, PROGRAM);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.reason).toBe('source_unavailable');

    const empty = mockExec([[{ '?column?': 1 }], []]);
    const e = await readProgramSites(empty.exec, ORG, PROGRAM);
    // A genuine empty result is a SUCCESS with zero rows — not a failure.
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.rows).toEqual([]);
  });

  it('names a schema mismatch rather than reporting no sites', async () => {
    const { exec } = mockExec([[{ '?column?': 1 }], pgError('42703', 'column does not exist')]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('schema_mismatch');
  });

  it('reports an unprovisioned RBQM store distinctly from a refusal', async () => {
    const { exec } = mockExec([pgError('42P01')]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('store_missing');
  });

  it('classifies an unexpected database error as source_error, not emptiness', async () => {
    const { exec } = mockExec([[{ '?column?': 1 }], pgError('08006', 'connection failure')]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('source_error');
      expect(out.detail).toContain('connection failure');
    }
  });

  it('has an operator-facing message for every failure, none of which says "no sites"', () => {
    const reasons: SiteReadFailure[] = [
      'not_in_tenant', 'source_unavailable', 'schema_mismatch', 'store_missing', 'source_error',
    ];
    for (const r of reasons) {
      expect(SITE_READ_MESSAGE[r]).toBeTruthy();
      expect(SITE_READ_MESSAGE[r].toLowerCase()).not.toContain('no sites');
    }
  });
});
