/**
 * Unit tests for the RBM site-risk engine's pure snapshot derivation.
 * Quality scores (0-100, higher better) invert to risk (higher worse), and the
 * monitoring tier is risk-proportionate. Covers both site_intel.sites variants.
 */

import { describe, it, expect } from 'vitest';
import {
  snapshotFromSiteRow, readProgramSites, recomputeSiteRisk, SITE_READ_MESSAGE, type SiteReadFailure,
  snapshotsFromSiteIndicators, type SiteIndicatorReading,
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

  it('refuses a program that is not a project of the organization', async () => {
    // Ownership check returns nothing → refuse.
    const { exec, calls } = mockExec([[]]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('not_in_tenant');
    // The critical property: Site Intelligence is never queried at all, so a
    // cross-tenant program UUID cannot reach another org's site data.
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).not.toContain('site_intel');
    expect(calls[0].args).toEqual([PROGRAM, ORG]);
  });

  it('asks whether the organization OWNS the program, not whether it has RBM records naming it', async () => {
    // Until 2026-10-01 the proof was a UNION over rbm_* rows. rbm_*.program_id
    // has no foreign key, so a KRI naming another tenant's program passed it,
    // and an owner with no RBM records yet was refused. It is now the one
    // program check: a live project of this organization.
    const { exec, calls } = mockExec([[{ id: PROGRAM }], []]);
    await readProgramSites(exec, ORG, PROGRAM);
    const ownership = calls[0].sql;
    expect(ownership).toMatch(/FROM regulatory_programs WHERE id = \$1 AND organization_id = \$2 AND deleted_at IS NULL/);
    expect(ownership).not.toMatch(/rbm_/);
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

  it('reports an ownership check that could not run distinctly from a refusal', async () => {
    const { exec, calls } = mockExec([pgError('42P01')]);
    const out = await readProgramSites(exec, ORG, PROGRAM);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('ownership_unverifiable');
    expect(calls).toHaveLength(1);
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
      'not_in_tenant', 'source_unavailable', 'schema_mismatch', 'ownership_unverifiable', 'source_error',
    ];
    for (const r of reasons) {
      expect(SITE_READ_MESSAGE[r]).toBeTruthy();
      expect(SITE_READ_MESSAGE[r].toLowerCase()).not.toContain('no sites');
    }
  });
});

describe('recomputeSiteRisk — one transaction, never error-as-empty', () => {
  const ORG = 42;
  const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  function exec(script: Array<any[] | Error | ((sql: string) => any[] | Error | undefined)>) {
    const calls: { sql: string; args: unknown[] }[] = [];
    let i = 0;
    return {
      calls,
      exec: {
        async query(sql: string, args: unknown[] = []) {
          calls.push({ sql, args });
          // Transaction control statements are not scripted.
          if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
          const step = script[i];
          i += 1;
          const out = typeof step === 'function' ? step(sql) : step;
          if (out instanceof Error) throw out;
          return { rows: out ?? [] };
        },
      },
    };
  }

  it('a refused program deletes nothing and writes nothing', async () => {
    const { exec: e, calls } = exec([[]]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out).toMatchObject({ ok: false, reason: 'not_in_tenant' });
    expect(calls.some(c => /DELETE|INSERT|BEGIN/.test(c.sql))).toBe(false);
  });

  it('a failed source read leaves the last snapshot untouched', async () => {
    const { exec: e, calls } = exec([[{ one: 1 }], Object.assign(new Error('down'), { code: '08006' })]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out).toMatchObject({ ok: false, reason: 'source_error' });
    expect(calls.some(c => c.sql.includes('DELETE FROM rbm_site_risk_scores'))).toBe(false);
  });

  it('replaces the snapshot inside BEGIN/COMMIT, delete before insert', async () => {
    const { exec: e, calls } = exec([
      [{ one: 1 }],
      [{ id: 1, site_number: 'S001', quality_score: 30 }, { id: 2, site_number: 'S002', quality_score: 90 }],
      [], [], [],
    ]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.snapshots).toHaveLength(2);
    const sqls = calls.map(c => c.sql.trim().split(/\s+/).slice(0, 3).join(' '));
    const begin = sqls.indexOf('BEGIN');
    const del = calls.findIndex(c => c.sql.includes('DELETE FROM rbm_site_risk_scores'));
    const firstInsert = calls.findIndex(c => c.sql.includes('INSERT INTO rbm_site_risk_scores'));
    const commit = sqls.indexOf('COMMIT');
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(del);
    expect(del).toBeLessThan(firstInsert);
    expect(firstInsert).toBeLessThan(commit);
    expect(calls[del].args).toEqual([ORG, PROGRAM]);
  });

  it('a failure mid-write rolls back rather than leaving a partial snapshot', async () => {
    const { exec: e, calls } = exec([
      [{ one: 1 }],
      [{ id: 1 }, { id: 2 }],
      [],                                                   // DELETE
      [],                                                   // first INSERT
      Object.assign(new Error('boom'), { code: '23502' }),  // second INSERT fails
    ]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out.ok).toBe(false);
    const sqls = calls.map(c => c.sql.trim());
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});


/**
 * The study's own site-level indicators as the source (GA-S8-02). Site Intelligence has no writer a person can
 * reach, so every study read "0 sites" while its site-level readings sat unused. These pin the rule and the order
 * of the two sources.
 */
describe('snapshotsFromSiteIndicators — a site scored from the study\'s own indicators', () => {
  const reading = (siteNumber: string, kriName: string, value: number, over: Partial<SiteIndicatorReading> = {}): SiteIndicatorReading => ({
    siteNumber, kriName, unit: 'days', value, amber: 14, red: 21, direction: 'higher_worse', observedAt: '2026-10-31T00:00:00.000Z', dataCutoff: '2026-10-31', ...over,
  });
  const site = (snapshots: ReturnType<typeof snapshotsFromSiteIndicators>, n: string) => snapshots.find((s) => s.siteNumber === n)!;

  it('every indicator red: composite 100, enhanced tier, and each driver says the value and its limit', () => {
    const [s] = snapshotsFromSiteIndicators([reading('104', 'Open query aging', 58), reading('104', 'AE entry lag', 21, { amber: 7, red: 14 })]);
    expect(s).toMatchObject({ siteNumber: '104', siteId: '104', siteName: null, compositeRisk: 100, monitoringTier: 'enhanced', source: 'study_indicators' });
    expect(s.drivers).toEqual(['AE entry lag 21 days: red (limit 14 days)', 'Open query aging 58 days: red (limit 21 days)']);
    expect([s.enrollmentRisk, s.qualityRisk, s.operationalRisk]).toEqual([null, null, null]);
  });

  it('the composite is the mean of red 100, amber 50, green 0, and the tier follows it', () => {
    const out = snapshotsFromSiteIndicators([
      reading('101', 'Open query aging', 12), reading('101', 'AE entry lag', 3, { amber: 7, red: 14 }),   // green, green
      reading('103', 'Open query aging', 15), reading('103', 'AE entry lag', 3, { amber: 7, red: 14 }),   // amber, green
      reading('106', 'Open query aging', 30), reading('106', 'AE entry lag', 3, { amber: 7, red: 14 }),   // red, green
      reading('107', 'Open query aging', 30), reading('107', 'AE entry lag', 9, { amber: 7, red: 14 }),   // red, amber
    ]);
    expect(site(out, '101')).toMatchObject({ compositeRisk: 0, monitoringTier: 'reduced', drivers: [] });
    expect(site(out, '103')).toMatchObject({ compositeRisk: 25, monitoringTier: 'reduced' });
    expect(site(out, '106')).toMatchObject({ compositeRisk: 50, monitoringTier: 'standard' });
    expect(site(out, '107')).toMatchObject({ compositeRisk: 75, monitoringTier: 'enhanced' });
    expect(site(out, '107').drivers).toEqual(['Open query aging 30 days: red (limit 21 days)', 'AE entry lag 9 days: amber (limit 7 days)']);
  });

  it('bands a lower-is-worse indicator by its own direction', () => {
    const [s] = snapshotsFromSiteIndicators([reading('102', 'Consent completeness', 88, { unit: '%', amber: 95, red: 90, direction: 'lower_worse' })]);
    expect(s).toMatchObject({ compositeRisk: 100, monitoringTier: 'enhanced' });
    expect(s.drivers).toEqual(['Consent completeness 88 %: red (limit 90 %)']);
  });

  it('an indicator with no limit is not counted, and a site with nothing evaluated is not scored and stays standard', () => {
    const out = snapshotsFromSiteIndicators([
      reading('105', 'Open query aging', 30), reading('105', 'Screen failures', 4, { amber: null, red: null }),
      reading('108', 'Screen failures', 9, { amber: null, red: null }),
    ]);
    expect(site(out, '105')).toMatchObject({ compositeRisk: 100, monitoringTier: 'enhanced' });
    expect(site(out, '105').indicators?.map((i) => i.status)).toEqual(['red', 'not_evaluated']);
    expect(site(out, '108')).toMatchObject({ compositeRisk: null, monitoringTier: 'standard', drivers: [] });
  });

  it('no readings, no sites', () => {
    expect(snapshotsFromSiteIndicators([])).toEqual([]);
  });
});

describe('recomputeSiteRisk — Site Intelligence first, then the study\'s own indicators', () => {
  const ORG = 42;
  const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const OWNED = [{ one: 1 }];
  const READINGS = [
    { site_number: '104', kri_name: 'Open query aging', unit: 'days', value: '58', threshold_amber: '14', threshold_red: '21', direction: 'higher_worse', observed_at: new Date('2026-10-31T00:00:00Z'), data_cutoff: '2026-10-31' },
    { site_number: '101', kri_name: 'Open query aging', unit: 'days', value: '12', threshold_amber: '14', threshold_red: '21', direction: 'higher_worse', observed_at: new Date('2026-10-31T00:00:00Z'), data_cutoff: '2026-10-31' },
  ];
  function exec(script: Array<any[] | Error>) {
    const calls: { sql: string; args: unknown[] }[] = [];
    let i = 0;
    return { calls, exec: { async query(sql: string, args: unknown[] = []) {
      calls.push({ sql, args });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
      const step = script[i]; i += 1;
      if (step instanceof Error) throw step;
      return { rows: step ?? [] };
    } } };
  }
  const inserts = (calls: { sql: string; args: unknown[] }[]) => calls.filter((c) => c.sql.includes('INSERT INTO rbm_site_risk_scores'));
  const readsObservations = (calls: { sql: string }[]) => calls.some((c) => c.sql.includes('rbm_metric_observations'));

  it('Site Intelligence holds no site for the study: the sites and their risk come from the study\'s indicator readings', async () => {
    const { exec: e, calls } = exec([OWNED, [], READINGS, [], [], []]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out).toMatchObject({ ok: true, source: 'study_indicators' });
    if (!out.ok) return;
    expect(out.snapshots.map((s) => [s.siteNumber, s.compositeRisk, s.monitoringTier])).toEqual([['104', 100, 'enhanced'], ['101', 0, 'reduced']]);
    const written = inserts(calls);
    expect(written).toHaveLength(2);
    const metadata = JSON.parse(String(written[0].args[11]));
    expect(metadata.source).toBe('study_indicators');
    expect(metadata.rule).toMatch(/Red counts 100, amber 50, green 0/);
    expect(metadata.indicators[0]).toMatchObject({ kriName: 'Open query aging', value: 58, status: 'red', red: 21, dataCutoff: '2026-10-31' });
    // The observations are read for the caller's organization and program, never one without the other.
    expect(calls.find((c) => c.sql.includes('rbm_metric_observations'))!.args).toEqual([ORG, PROGRAM]);
  });

  it('Site Intelligence is not installed: the study\'s indicator readings are still the source', async () => {
    const { exec: e } = exec([OWNED, Object.assign(new Error('relation "site_intel.sites" does not exist'), { code: '42P01' }), READINGS, [], [], []]);
    expect(await recomputeSiteRisk(ORG, PROGRAM, e)).toMatchObject({ ok: true, source: 'study_indicators' });
  });

  it('Site Intelligence holds the study\'s sites: it is the source, and the indicator readings are not read', async () => {
    const { exec: e, calls } = exec([OWNED, [{ id: 1, site_number: 'S001', quality_score: 30 }], [], []]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out).toMatchObject({ ok: true, source: 'site_intelligence' });
    expect(readsObservations(calls)).toBe(false);
    expect(JSON.parse(String(inserts(calls)[0].args[11]))).toEqual({ source: 'site_intelligence' });
  });

  it('no site anywhere is a genuine empty snapshot, and says which source was read', async () => {
    const { exec: e, calls } = exec([OWNED, [], [], []]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out).toMatchObject({ ok: true, source: 'study_indicators', snapshots: [] });
    expect(inserts(calls)).toHaveLength(0);
  });

  it('a failed read of the indicator readings is a failure, and the last snapshot is untouched', async () => {
    const { exec: e, calls } = exec([OWNED, [], Object.assign(new Error('down'), { code: '08006' })]);
    const out = await recomputeSiteRisk(ORG, PROGRAM, e);
    expect(out).toMatchObject({ ok: false, reason: 'source_error' });
    expect(calls.some((c) => c.sql.includes('DELETE FROM rbm_site_risk_scores'))).toBe(false);
  });

  it('a Site Intelligence this role may not read is still a failure: one source is never quietly swapped for the other', async () => {
    const { exec: e, calls } = exec([OWNED, Object.assign(new Error('permission denied for schema site_intel'), { code: '42501' })]);
    expect(await recomputeSiteRisk(ORG, PROGRAM, e)).toMatchObject({ ok: false, reason: 'source_unavailable' });
    expect(readsObservations(calls)).toBe(false);
  });

  it('a Site Intelligence shape this engine cannot read is still a failure, never a fall back', async () => {
    const { exec: e, calls } = exec([OWNED, Object.assign(new Error('column "program_id" does not exist'), { code: '42703' })]);
    expect(await recomputeSiteRisk(ORG, PROGRAM, e)).toMatchObject({ ok: false, reason: 'schema_mismatch' });
    expect(readsObservations(calls)).toBe(false);
  });
});
