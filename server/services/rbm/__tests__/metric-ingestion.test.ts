/**
 * Metric ingestion — validation and projection.
 *
 * The rules that matter here are the ones that keep the module honest: a row
 * that cannot be used is rejected with a reason rather than dropped, a metric
 * that matches no indicator is reported as unmatched rather than swallowed,
 * and staleness is measured against the extract's cutoff rather than the time
 * somebody happened to run the load.
 */

import { describe, it, expect } from 'vitest';
import {
  parseMetricRows, parseMetricCsv, ingestMetrics, freshnessFromRun, ageInDays,
  FRESHNESS_STALE_DAYS, contentHash, type Exec,
} from '../metric-ingestion';

const ORG = 42;
const PROGRAM = '11111111-2222-3333-4444-555555555555';

function mockExec(script: any[][]) {
  const calls: { sql: string; args: unknown[] }[] = [];
  let i = 0;
  const exec: Exec = {
    async query(sql: string, args: unknown[]) {
      calls.push({ sql, args });
      const rows = script[i] ?? [];
      i += 1;
      return { rows };
    },
  };
  return { exec, calls };
}

describe('parseMetricRows — validation', () => {
  it('accepts a well-formed study-scope row', () => {
    const r = parseMetricRows([{ metric_key: 'Query rate', value: '12.5', unit: '%' }]);
    expect(r.rejects).toEqual([]);
    expect(r.observations).toEqual([{
      metricKey: 'Query rate', scopeLevel: 'study', scopeId: null,
      value: 12.5, numerator: null, denominator: null, unit: '%', observedAt: null,
    }]);
  });

  it('derives a value from numerator and denominator when no value is given', () => {
    const r = parseMetricRows([{ metric_key: 'Dropout rate', numerator: '9', denominator: '60' }]);
    expect(r.rejects).toEqual([]);
    expect(r.observations[0].value).toBeCloseTo(0.15);
    // The components are kept: a rate over 60 is different evidence to the
    // same rate over 6, and `value` alone cannot say so.
    expect(r.observations[0]).toMatchObject({ numerator: 9, denominator: 60 });
  });

  it('rejects a zero denominator rather than reporting a rate of zero', () => {
    const r = parseMetricRows([{ metric_key: 'Dropout rate', numerator: '0', denominator: '0' }]);
    expect(r.observations).toEqual([]);
    expect(r.rejects).toEqual([{ row: 1, reason: 'denominator is zero — a rate cannot be computed' }]);
  });

  it('rejects rather than drops: every unusable row carries a row number and a reason', () => {
    const r = parseMetricRows([
      { value: '1' },                                               // no metric_key
      { metric_key: 'x', value: 'not-a-number' },                   // unparseable
      { metric_key: 'x' },                                          // nothing to derive from
      { metric_key: 'x', scope_level: 'planet', value: '1' },       // bad scope
      { metric_key: 'x', scope_level: 'site', value: '1' },         // missing scope_id
      { metric_key: 'x', value: '1', observed_at: 'last tuesday' }, // bad date
    ]);
    expect(r.observations).toEqual([]);
    expect(r.received).toBe(6);
    expect(r.rejects.map(x => x.row)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.rejects[0].reason).toMatch(/metric_key is missing/);
    expect(r.rejects[1].reason).toMatch(/not a finite number/);
    expect(r.rejects[2].reason).toMatch(/no numerator\/denominator/);
    expect(r.rejects[3].reason).toMatch(/scope_level "planet"/);
    expect(r.rejects[4].reason).toMatch(/scope_id is required at site scope/);
    expect(r.rejects[5].reason).toMatch(/is not a valid date/);
  });

  it('keeps the good rows when only some are bad', () => {
    const r = parseMetricRows([
      { metric_key: 'Query rate', value: '12' },
      { metric_key: '', value: '3' },
      { metric_key: 'CRF lag', value: '4' },
    ]);
    expect(r.observations).toHaveLength(2);
    expect(r.rejects).toHaveLength(1);
    expect(r.rejects[0].row).toBe(2);
  });

  it('tolerates the header casing and spacing real extracts arrive with', () => {
    const r = parseMetricRows([{ 'Metric Key': 'Query rate', 'Scope Level': 'site', 'Scope ID': '005', Value: '7' }]);
    expect(r.rejects).toEqual([]);
    expect(r.observations[0]).toMatchObject({ metricKey: 'Query rate', scopeLevel: 'site', scopeId: '005', value: 7 });
  });
});

describe('parseMetricCsv', () => {
  it('parses a delimited extract', () => {
    const r = parseMetricCsv('metric_key,scope_level,scope_id,value\nAE count,subject,S-01,3\n');
    expect(r.rejects).toEqual([]);
    expect(r.observations[0]).toMatchObject({ metricKey: 'AE count', scopeLevel: 'subject', scopeId: 'S-01', value: 3 });
  });

  it('reports a malformed file as a reject, not as an empty load', () => {
    // Silently returning zero observations would look identical to "the export
    // was empty", which is a very different fact.
    const r = parseMetricCsv('metric_key,value\n"unterminated,1\n');
    expect(r.observations).toEqual([]);
    expect(r.rejects).toHaveLength(1);
    expect(r.rejects[0].reason).toMatch(/could not be parsed/);
  });
});

/**
 * ingestMetrics returns IngestResult | IngestRefused. These tests assert the
 * landed path, so narrow explicitly rather than casting — a refusal reaching a
 * test that expects a load should fail loudly with its reason.
 */
function landed(out: Awaited<ReturnType<typeof ingestMetrics>>) {
  if (!out.ok) throw new Error(`expected the extract to land, but it was refused: ${out.reason}`);
  return out;
}

describe('ingestMetrics — projection onto the engines', () => {
  it('lands a study metric as a KRI reading with the engine-computed status', async () => {
    const { exec, calls } = mockExec([
      [],                                                                           // findPriorRun: none
      [{ id: 1 }],                                                                  // run insert
      [],                                                                           // observation insert
      [{ id: 5, direction: 'higher_worse', threshold_amber: '10', threshold_red: '20' }], // KRI lookup
      [], [],                                                                       // value insert + KRI roll-up
      [],                                                                           // run finalize
    ]);
    const out = landed(await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc', rows: [{ metric_key: 'Query rate', value: '25' }],
    }));
    expect(out.status).toBe('succeeded');
    expect(out.projection.kriReadings).toBe(1);
    // 25 is at/above the red threshold of 20 — banded by the engine, not here.
    const valueInsert = calls.find(c => c.sql.includes('INSERT INTO rbm_kri_values'))!;
    expect(valueInsert.args).toContain('red');
    // Tenant scope: the org id is bound on every statement (its position
    // varies — it is the last arg on the roll-up UPDATE).
    for (const c of calls) expect(c.args).toContain(ORG);
  });

  it('reports a study metric that matches no indicator as unmatched', async () => {
    // Otherwise "1 row ingested, 0 rejected" would read as success while every
    // indicator stayed unevaluated.
    const { exec } = mockExec([
      [],                                                                           // findPriorRun: none
      [{ id: 1 }], [],
      [],   // no KRI
      [],   // no QTL
      [],
    ]);
    const out = landed(await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc', rows: [{ metric_key: 'Unconfigured metric', value: '3' }],
    }));
    expect(out.projection.kriReadings).toBe(0);
    expect(out.projection.unmatched).toEqual(['Unconfigured metric']);
  });

  it('merges subject metrics rather than replacing the profile', async () => {
    // One feed rarely carries every dimension; replacing would delete metrics
    // another source supplied.
    const { exec, calls } = mockExec([[], [{ id: 1 }], [], [], []]);
    const out = landed(await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc',
      rows: [{ metric_key: 'ae_count', scope_level: 'subject', scope_id: 'S-01', value: '4' }],
    }));
    expect(out.projection.subjectProfiles).toBe(1);
    const upsert = calls.find(c => c.sql.includes('rbm_patient_profiles'))!;
    expect(upsert.sql).toContain('||');
    expect(upsert.sql).toContain('ON CONFLICT');
  });

  it('marks a run partial when some rows landed and some were rejected', async () => {
    const { exec, calls } = mockExec([[], [{ id: 1 }], [], [], [], []]);
    const out = landed(await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc',
      rows: [{ metric_key: 'Query rate', value: '12' }, { metric_key: 'bad' }],
    }));
    expect(out.status).toBe('partial');
    expect(out.accepted).toBe(1);
    expect(out.rejected).toBe(1);
    // The reasons are persisted on the run, not just returned.
    const finalize = calls.find(c => c.sql.includes('UPDATE rbm_data_runs'))!;
    expect(String(finalize.args[4])).toMatch(/no numerator\/denominator/);
  });

  it('marks a run failed when nothing usable arrived', async () => {
    const { exec } = mockExec([[], [{ id: 1 }], []]);
    const out = landed(await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc', rows: [{ metric_key: 'bad' }],
    }));
    expect(out.status).toBe('failed');
    expect(out.accepted).toBe(0);
  });
});

describe('freshness', () => {
  const now = new Date('2026-07-26T00:00:00.000Z');

  it('measures staleness from the extract cutoff, not the load time', () => {
    // A load that ran this morning against a three-week-old export is not
    // fresh data, and must not be presented as such.
    const f = freshnessFromRun({
      source: 'edc', startedAt: '2026-07-26T08:00:00.000Z', dataCutoff: '2026-07-01',
      status: 'succeeded', rowsAccepted: 100, rowsRejected: 0,
    }, now);
    expect(f.stale).toBe(true);
    expect(f.ageDays).toBe(25);
  });

  it('is fresh when the cutoff is recent', () => {
    const f = freshnessFromRun({
      source: 'edc', startedAt: '2026-07-26T08:00:00.000Z', dataCutoff: '2026-07-24',
      status: 'succeeded', rowsAccepted: 100, rowsRejected: 0,
    }, now);
    expect(f.stale).toBe(false);
    expect(f.ageDays).toBeLessThanOrEqual(FRESHNESS_STALE_DAYS);
  });

  it('treats a failed load as stale however recent it was', () => {
    const f = freshnessFromRun({
      source: 'edc', startedAt: '2026-07-26T08:00:00.000Z', dataCutoff: '2026-07-26',
      status: 'failed', rowsAccepted: 0, rowsRejected: 40,
    }, now);
    expect(f.stale).toBe(true);
  });

  it('treats a never-loaded source as stale', () => {
    const f = freshnessFromRun({
      source: 'ctms', startedAt: null, dataCutoff: null,
      status: 'running', rowsAccepted: 0, rowsRejected: 0,
    }, now);
    expect(f.stale).toBe(true);
    expect(f.ageDays).toBeNull();
  });

  it('ageInDays returns null for an absent or unparseable timestamp', () => {
    expect(ageInDays(null, now)).toBeNull();
    expect(ageInDays('not a date', now)).toBeNull();
  });
});

describe('ingestMetrics — replay guard', () => {
  const ROWS = [{ metric_key: 'Query rate', value: '25' }];

  it('hashes content, not the filename', () => {
    // Two exports can share a name and differ; identical content routinely
    // arrives under different names. Identity has to be the bytes.
    const a = contentHash({ rows: ROWS });
    const b = contentHash({ rows: ROWS });
    const c = contentHash({ rows: [{ metric_key: 'Query rate', value: '26' }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a second load of the same extract, naming the run that holds it', async () => {
    // The defect: a second load is not a no-op — each study-scope observation
    // appends a row to rbm_kri_values, so a duplicate doubles the KRI history
    // every trend and every robust z-score is computed over.
    const { exec, calls } = mockExec([
      [{ id: 7, status: 'succeeded', data_cutoff: '2026-07-01', started_at: '2026-07-02T00:00:00Z', rows_accepted: 12, mapping_version: 'v1' }],
    ]);
    const out = await ingestMetrics(exec, ORG, { programId: PROGRAM, source: 'edc', rows: ROWS });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('duplicate_content');
      expect(out.priorRun?.runId).toBe(7);
      expect(out.priorRun?.rowsAccepted).toBe(12);
    }
    // Nothing was written: no run row, no observation, no reading.
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('FROM rbm_data_runs');
  });

  it('only counts a landed, un-superseded run as a duplicate', async () => {
    const { exec, calls } = mockExec([[], [{ id: 9 }]]);
    await ingestMetrics(exec, ORG, { programId: PROGRAM, source: 'edc', rows: ROWS });
    const lookup = calls[0].sql;
    // A FAILED run's content was not landed, so reloading it is correct and must
    // not be blocked; a SUPERSEDED run was already deliberately replaced.
    expect(lookup).toContain("status IN ('succeeded', 'partial')");
    expect(lookup).toContain('superseded_at IS NULL');
    expect(calls[0].args).toEqual([ORG, PROGRAM, 'edc', contentHash({ rows: ROWS })]);
  });

  it('refuses a reprocess with no reason', async () => {
    // A reprocess replaces what an earlier run established; an unexplained
    // replacement leaves a supersession in the audit trail with no rationale.
    const { exec, calls } = mockExec([
      [{ id: 7, status: 'succeeded', data_cutoff: null, started_at: null, rows_accepted: 1, mapping_version: 'v1' }],
    ]);
    const out = await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc', rows: ROWS, reprocess: true, reprocessReason: '  ',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('reprocess_reason_required');
    expect(calls).toHaveLength(1);
  });

  it('a reprocess supersedes the prior run AND retracts its readings', async () => {
    // Superseding the run record while leaving its appended readings behind
    // would still double the history — the same corruption, reached through the
    // deliberate path. So the retraction is part of what reprocess means.
    const { exec, calls } = mockExec([
      [{ id: 7, status: 'succeeded', data_cutoff: null, started_at: null, rows_accepted: 3, mapping_version: 'v1' }], // prior
      [{ id: 9 }],                       // new run insert
      [],                                // supersede update
      [{ id: 91 }, { id: 92 }],          // retracted readings
      [],                                // observation insert
      [{ id: 5, direction: 'higher_worse', threshold_amber: '10', threshold_red: '20' }],
      [], [],                            // value insert + roll-up
      [],                                // finalize
    ]);
    const out = landed(await ingestMetrics(exec, ORG, {
      programId: PROGRAM, source: 'edc', rows: ROWS,
      reprocess: true, reprocessReason: 'Corrected unit mapping',
    }));
    expect(out.supersededRunId).toBe(7);
    expect(out.retractedReadings).toBe(2);

    const insert = calls.find(c => c.sql.includes('INSERT INTO rbm_data_runs'))!;
    expect(insert.args).toContain('Corrected unit mapping');
    expect(insert.args).toContain(7);              // supersedes_run_id
    expect(insert.args).toContain(out.contentHash);

    const supersede = calls.find(c => c.sql.includes('superseded_at = NOW()'))!;
    expect(supersede.args).toEqual([7, ORG]);

    // The retraction is scoped on run_id, so hand-entered readings (run_id NULL)
    // and other runs' readings are untouched.
    const retract = calls.find(c => c.sql.includes('DELETE FROM rbm_kri_values'))!;
    expect(retract.sql).toContain('run_id = $2');
    expect(retract.args).toEqual([ORG, 7]);
  });

  it('stamps every ingested reading with its run, so it can be retracted later', async () => {
    const { exec, calls } = mockExec([
      [],                                // no prior run
      [{ id: 9 }], [],
      [{ id: 5, direction: 'higher_worse', threshold_amber: '10', threshold_red: '20' }],
      [], [], [],
    ]);
    const out = landed(await ingestMetrics(exec, ORG, { programId: PROGRAM, source: 'edc', rows: ROWS }));
    expect(out.supersededRunId).toBeNull();
    expect(out.retractedReadings).toBe(0);
    const valueInsert = calls.find(c => c.sql.includes('INSERT INTO rbm_kri_values'))!;
    expect(valueInsert.sql).toContain('run_id');
    expect(valueInsert.args).toContain(9);
  });
});
