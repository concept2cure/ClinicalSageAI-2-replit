/**
 * Site risk from the study's own site-level indicator readings, on real PostgreSQL (PGlite) with RBM's own
 * migrations (GA-S8-02). site-risk-engine.test.ts pins the rule against a scripted executor; this runs the read
 * itself: which reading is the latest, which extracts count, how a reading binds to a KRI, and that the snapshot
 * lands with its source and its readings. Site Intelligence is not installed here, as on a database that never
 * ran its migration, which is one of the two cases the second source exists for.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ pool: { connect: async () => { throw new Error('the engine was given its executor'); } } }));
vi.mock('../../c2c/program-access', () => ({ programInOrganization: async (_exec: unknown, _program: string, organizationId: number) => organizationId === 7 }));

import { readSiteIndicatorReadings, readSiteIndicatorHistory, recomputeSiteRisk } from '../site-risk-engine';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
const exec = { query: async (sql: string, args?: unknown[]) => ({ rows: (await db.query<Record<string, unknown>>(sql, args)).rows as any[] }) };
const sql = (text: string, args?: unknown[]) => db.query<Record<string, unknown>>(text, args).then((r) => r.rows);

async function run(id: number, superseded = false) {
  await sql(`INSERT INTO rbm_data_runs (id, organization_id, program_id, source, status, superseded_at) VALUES ($1, 7, $2, 'edc', 'completed', $3)`,
    [id, PROGRAM, superseded ? new Date('2026-10-02T00:00:00Z') : null]);
}
async function observe(o: { run: number | null; key: string; site: string | null; value: number; at: string; org?: number; program?: string; scope?: string }) {
  await sql(`INSERT INTO rbm_metric_observations (organization_id, program_id, run_id, metric_key, scope_level, scope_id, value, unit, observed_at, data_cutoff)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'days',$8,$9)`,
    [o.org ?? 7, o.program ?? PROGRAM, o.run, o.key, o.scope ?? 'site', o.site, o.value, o.at, o.at.slice(0, 10)]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE TABLE organizations(id integer PRIMARY KEY); CREATE TABLE users(id integer PRIMARY KEY); INSERT INTO organizations VALUES (7),(8);');
  for (const file of ['20260629_rbm_surfaces.sql', '20260630_rbm_kri_values.sql', '20260726_rbm_metric_ingestion.sql', '20260930_rbm_ingest_idempotency.sql']) {
    await db.exec(readFileSync(new URL(`../../../../migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 60_000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec('DELETE FROM rbm_site_risk_scores; DELETE FROM rbm_metric_observations; DELETE FROM rbm_data_runs; DELETE FROM rbm_kris;');
  await sql(`INSERT INTO rbm_kris (organization_id, program_id, name, unit, direction, threshold_amber, threshold_red, status, metadata) VALUES
    (7, $1, 'Open query aging', 'days', 'higher_worse', 14, 21, 'not_evaluated', '{}'),
    (7, $1, 'Adverse event entry lag', 'days', 'higher_worse', 7, 14, 'not_evaluated', '{"metricKey":"ae_entry_lag"}')`, [PROGRAM]);
  await run(1); await run(2); await run(3, true);
});

describe('readSiteIndicatorReadings on real PostgreSQL', () => {
  it('takes the latest reading of each KRI at each site, by the KRI\'s name or its metric key', async () => {
    await observe({ run: 1, key: 'Open query aging', site: '104', value: 22, at: '2026-08-31T00:00:00Z' });
    await observe({ run: 2, key: 'open query aging', site: '104', value: 58, at: '2026-10-31T00:00:00Z' });
    await observe({ run: 2, key: 'ae_entry_lag', site: '104', value: 21, at: '2026-10-31T00:00:00Z' });
    await observe({ run: 2, key: 'Open query aging', site: '101', value: 12, at: '2026-10-31T00:00:00Z' });
    const readings = await readSiteIndicatorReadings(exec, 7, PROGRAM);
    expect(readings.map((r) => [r.siteNumber, r.kriName, r.value]).sort()).toEqual([
      ['101', 'Open query aging', 12], ['104', 'Adverse event entry lag', 21], ['104', 'Open query aging', 58],
    ]);
    expect(readings.find((r) => r.siteNumber === '104' && r.kriName === 'Open query aging')).toMatchObject({ amber: 14, red: 21, unit: 'days', dataCutoff: '2026-10-31' });
  });

  it('leaves out a superseded extract, another study, another organization, study-level rows and a retired KRI', async () => {
    await observe({ run: 2, key: 'Open query aging', site: '101', value: 12, at: '2026-09-30T00:00:00Z' });
    await observe({ run: 3, key: 'Open query aging', site: '101', value: 99, at: '2026-10-31T00:00:00Z' });           // superseded run
    await observe({ run: null, key: 'Open query aging', site: '102', value: 30, at: '2026-10-31T00:00:00Z', program: OTHER_PROGRAM });
    await observe({ run: null, key: 'Open query aging', site: '103', value: 30, at: '2026-10-31T00:00:00Z', org: 8 });
    await observe({ run: 2, key: 'Open query aging', site: null, value: 30, at: '2026-10-31T00:00:00Z', scope: 'study' });
    await observe({ run: 2, key: 'A metric no KRI names', site: '105', value: 30, at: '2026-10-31T00:00:00Z' });
    await sql(`UPDATE rbm_kris SET deleted_at = now() WHERE name = 'Adverse event entry lag'`);
    await observe({ run: 2, key: 'ae_entry_lag', site: '106', value: 30, at: '2026-10-31T00:00:00Z' });
    const readings = await readSiteIndicatorReadings(exec, 7, PROGRAM);
    expect(readings.map((r) => [r.siteNumber, r.value])).toEqual([['101', 12]]);
  });
});

describe('readSiteIndicatorHistory on real PostgreSQL', () => {
  /* The snapshot keeps the latest reading only, and the Site risk tab said a trend over time was not available.
     The site rows of every load are still in the store: an indicator's course at a site is already there. */
  it('gives every reading of each KRI at each site, oldest first, bound by name or metric key', async () => {
    await observe({ run: 2, key: 'open query aging', site: '104', value: 58, at: '2026-10-31T00:00:00Z' });
    await observe({ run: 1, key: 'Open query aging', site: '104', value: 22, at: '2026-08-31T00:00:00Z' });
    await observe({ run: 2, key: 'ae_entry_lag', site: '104', value: 21, at: '2026-10-31T00:00:00Z' });
    await observe({ run: 2, key: 'Open query aging', site: '101', value: 12, at: '2026-10-31T00:00:00Z' });
    const history = await readSiteIndicatorHistory(exec, 7, PROGRAM);
    expect(history.filter((h) => h.siteNumber === '104' && h.kriName === 'Open query aging').map((h) => [h.value, h.dataCutoff]))
      .toEqual([[22, '2026-08-31'], [58, '2026-10-31']]);
    expect(history.map((h) => [h.siteNumber, h.kriName]).filter(([site]) => site === '101')).toEqual([['101', 'Open query aging']]);
    expect(history.find((h) => h.kriName === 'Adverse event entry lag')).toMatchObject({ siteNumber: '104', value: 21 });
  });

  it('leaves out a superseded extract, another study, another organization and study-level rows', async () => {
    await observe({ run: 1, key: 'Open query aging', site: '104', value: 22, at: '2026-08-31T00:00:00Z' });
    await observe({ run: 3, key: 'Open query aging', site: '104', value: 99, at: '2026-09-30T00:00:00Z' });
    await observe({ run: 1, key: 'Open query aging', site: '104', value: 77, at: '2026-08-31T00:00:00Z', program: OTHER_PROGRAM });
    await observe({ run: 1, key: 'Open query aging', site: '104', value: 66, at: '2026-08-31T00:00:00Z', org: 8 });
    await observe({ run: 1, key: 'Open query aging', site: null, value: 55, at: '2026-08-31T00:00:00Z', scope: 'study' });
    expect((await readSiteIndicatorHistory(exec, 7, PROGRAM)).map((h) => h.value)).toEqual([22]);
    expect(await readSiteIndicatorHistory(exec, 8, PROGRAM)).toEqual([]);
  });
});

describe('recomputeSiteRisk on real PostgreSQL, with no Site Intelligence installed', () => {
  it('writes one row per site, with its tier, its drivers in words, its source and its readings', async () => {
    await observe({ run: 2, key: 'Open query aging', site: '104', value: 58, at: '2026-10-31T00:00:00Z' });
    await observe({ run: 2, key: 'ae_entry_lag', site: '104', value: 21, at: '2026-10-31T00:00:00Z' });
    await observe({ run: 2, key: 'Open query aging', site: '101', value: 12, at: '2026-10-31T00:00:00Z' });
    const out = await recomputeSiteRisk(7, PROGRAM, exec);
    expect(out).toMatchObject({ ok: true, source: 'study_indicators' });
    const rows = await sql('SELECT * FROM rbm_site_risk_scores ORDER BY composite_risk DESC');
    expect(rows.map((r) => [r.site_number, r.site_id, Number(r.composite_risk), r.monitoring_tier])).toEqual([['104', '104', 100, 'enhanced'], ['101', '101', 0, 'reduced']]);
    expect(rows[0].drivers).toEqual(['Adverse event entry lag 21 days: red (limit 14 days)', 'Open query aging 58 days: red (limit 21 days)']);
    expect(rows[0].metadata).toMatchObject({ source: 'study_indicators' });
    expect((rows[0].metadata as { indicators: unknown[] }).indicators).toHaveLength(2);
    expect(rows[0].organization_id).toBe(7);
  });

  it('a recompute replaces the snapshot: a site whose readings were superseded away is gone', async () => {
    await observe({ run: 2, key: 'Open query aging', site: '104', value: 58, at: '2026-10-31T00:00:00Z' });
    await recomputeSiteRisk(7, PROGRAM, exec);
    await sql('UPDATE rbm_data_runs SET superseded_at = now() WHERE id = 2');
    const out = await recomputeSiteRisk(7, PROGRAM, exec);
    expect(out).toMatchObject({ ok: true, snapshots: [] });
    expect(await sql('SELECT id FROM rbm_site_risk_scores')).toEqual([]);
  });

  it('another organization\'s study is refused before anything is read', async () => {
    await observe({ run: 2, key: 'Open query aging', site: '104', value: 58, at: '2026-10-31T00:00:00Z' });
    expect(await recomputeSiteRisk(8, PROGRAM, exec)).toMatchObject({ ok: false, reason: 'not_in_tenant' });
    expect(await sql('SELECT id FROM rbm_site_risk_scores')).toEqual([]);
  });
});
