/**
 * The governance ledger's vocabularies, and the figure that is supposed to
 * notice when it stops recording.
 *
 * ## What these tests are for
 *
 * `decision_records` and `assumption_records` each carry CHECK constraints
 * naming the values their text columns accept. Two production writers were
 * passing values outside those sets:
 *
 * - `governed-decision-repository.ts` wrote `domain_track: 'governance'` and
 *   `recommendation_type: 'governed_fabric_decision'`, the latter with an
 *   in-code note asserting the column was free text. It is not.
 * - `operating-system-integration.ts` passed the product-modality vocabulary
 *   (`biotech`, `device`, ...) into the discipline column, having declared it
 *   inline from the wrong one of two same-named enums.
 *
 * Both writers swallowed the rejection into a log line, so the ledger recorded
 * nothing on every deployment while every caller was handed a decision id and
 * told the write had succeeded. Measured on the reference database:
 * decision_records held zero rows, assumption_records held zero rows, and 33
 * persistence failures had been counted in a single server run.
 *
 * The first test below is the one that would have caught it, and catches the
 * next one: it reads the CHECK lists out of the migration and asserts that
 * every literal production code writes into those columns is inside them.
 * A unit test of any one writer would not have — each writer looked correct
 * in isolation, against a type that did not match the database.
 *
 * @module server/services/__tests__/governance-ledger-vocabulary
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOMAIN_TRACKS,
  DEFAULT_DOMAIN_TRACK,
  isDomainTrack,
  assertDomainTrack,
  domainTrackForCtdSection,
} from '../domain-track';
import {
  DEPLOYED_DOMAIN_TRACKS,
  DEPLOYED_RECOMMENDATION_TYPES,
} from '../../../shared/constants/operating-system-vocab';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const MIGRATION = join(
  REPO_ROOT, 'db', 'migrations', '20260323_assumption_decision_contradiction.sql',
);

/** Pull the value list out of a `col TEXT NOT NULL CHECK (col IN (...))` clause. */
function checkListFor(sql: string, table: string, column: string): string[] {
  const tableStart = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`);
  expect(tableStart, `${table} not found in the migration`).toBeGreaterThan(-1);
  const body = sql.slice(tableStart);
  const marker = `${column} TEXT NOT NULL CHECK (${column} IN (`;
  const at = body.indexOf(marker);
  expect(at, `${table}.${column} CHECK not found`).toBeGreaterThan(-1);
  const open = at + marker.length;
  const close = body.indexOf('))', open);
  return body
    .slice(open, close)
    .split(',')
    .map(v => v.trim().replace(/^'/, '').replace(/'$/, ''))
    .filter(Boolean);
}

/** Every .ts file under a directory, excluding tests. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('the ledger vocabulary matches the constraint that enforces it', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('DOMAIN_TRACKS is exactly the domain_track CHECK list, on both tables', () => {
    const onDecisions = checkListFor(sql, 'decision_records', 'domain_track');
    const onAssumptions = checkListFor(sql, 'assumption_records', 'domain_track');

    expect([...DOMAIN_TRACKS]).toEqual(onDecisions);
    expect(onAssumptions).toEqual(onDecisions);
  });

  it('the shared vocabulary is where the list lives, and matches the DDL', () => {
    expect([...DEPLOYED_DOMAIN_TRACKS]).toEqual(checkListFor(sql, 'decision_records', 'domain_track'));
    expect([...DEPLOYED_RECOMMENDATION_TYPES])
      .toEqual(checkListFor(sql, 'decision_records', 'recommendation_type'));
    // domain-track.ts must not carry a second copy of it.
    expect(DOMAIN_TRACKS).toBe(DEPLOYED_DOMAIN_TRACKS);
  });

  it('the default track is itself one of the allowed values', () => {
    expect(DOMAIN_TRACKS).toContain(DEFAULT_DOMAIN_TRACK);
  });

  /* The broad catch. A literal assigned to one of these keys anywhere in
     server/services is a value that will reach the column, and the database is
     the only thing that was checking them. */
  it('no production source assigns a domainTrack literal the column would reject', () => {
    const allowed = new Set(checkListFor(sql, 'decision_records', 'domain_track'));
    const offenders: string[] = [];

    for (const file of sourceFiles(join(REPO_ROOT, 'server', 'services'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/domainTrack:\s*'([^']+)'/g)) {
        if (!allowed.has(m[1])) {
          offenders.push(`${file.replace(REPO_ROOT + '/', '')}: domainTrack: '${m[1]}'`);
        }
      }
    }

    expect(offenders, 'these values are rejected by decision_records_domain_track_check').toEqual([]);
  });

  it('no production source assigns a recommendationType literal the column would reject', () => {
    const allowed = new Set(checkListFor(sql, 'decision_records', 'recommendation_type'));
    const offenders: string[] = [];

    for (const file of sourceFiles(join(REPO_ROOT, 'server', 'services'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/recommendationType:\s*'([^']+)'/g)) {
        if (!allowed.has(m[1])) {
          offenders.push(`${file.replace(REPO_ROOT + '/', '')}: recommendationType: '${m[1]}'`);
        }
      }
    }

    expect(offenders, 'these values are rejected by decision_records_recommendation_type_check').toEqual([]);
  });

  it('the product-modality vocabulary is not a discipline, and is refused as one', () => {
    for (const modality of ['biotech', 'device', 'diagnostics', 'combination', 'biosimilar']) {
      expect(isDomainTrack(modality)).toBe(false);
      expect(() => assertDomainTrack(modality, 'test')).toThrow(/not a governance discipline/);
    }
  });

  it('the refusal names the caller and the allowed set, so it is actionable', () => {
    expect(() => assertDomainTrack('governance', 'recordGovernedDecision'))
      .toThrow(/recordGovernedDecision.*biostatistics/s);
  });
});

describe('domainTrackForCtdSection — the CTD numbering is the discipline split', () => {
  it('attributes Module 3 to CMC, in every spelling the codebase uses', () => {
    expect(domainTrackForCtdSection('m3.2.S.1')).toBe('cmc');
    expect(domainTrackForCtdSection('3.2.P.8')).toBe('cmc');
    expect(domainTrackForCtdSection('m3')).toBe('cmc');
    expect(domainTrackForCtdSection('Module 3')).toBe('cmc');
  });

  it('attributes Modules 4 and 5 to nonclinical and clinical', () => {
    expect(domainTrackForCtdSection('m4.2.3')).toBe('nonclinical');
    expect(domainTrackForCtdSection('m5.3.5.1')).toBe('clinical');
  });

  it("routes Module 2's summaries to the module each one summarises", () => {
    expect(domainTrackForCtdSection('m2.3')).toBe('cmc');
    expect(domainTrackForCtdSection('m2.4')).toBe('nonclinical');
    expect(domainTrackForCtdSection('m2.6')).toBe('nonclinical');
    expect(domainTrackForCtdSection('m2.5')).toBe('clinical');
    expect(domainTrackForCtdSection('m2.7')).toBe('clinical');
  });

  it('attributes Module 1 to regulatory', () => {
    expect(domainTrackForCtdSection('m1.3.1')).toBe('regulatory');
  });

  it('falls through the candidates in order and never guesses past the numbering', () => {
    expect(domainTrackForCtdSection(undefined, null, 'm3.2.S.4')).toBe('cmc');
    expect(domainTrackForCtdSection('', '   ')).toBe(DEFAULT_DOMAIN_TRACK);
    expect(domainTrackForCtdSection('not-a-ctd-code')).toBe(DEFAULT_DOMAIN_TRACK);
    expect(domainTrackForCtdSection()).toBe(DEFAULT_DOMAIN_TRACK);
  });

  it('always returns a value the ledger accepts, whatever it is given', () => {
    for (const input of ['m3', 'm9', 'x', '', 'Module 2', '2.99', undefined]) {
      expect(isDomainTrack(domainTrackForCtdSection(input))).toBe(true);
    }
  });
});

describe('governance health does not read healthy on a ledger that recorded nothing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function healthAfter(
    apply: (m: typeof import('../governance-observability').governanceMetrics) => void,
  ) {
    // The service imports '../db.js' relative to server/services, which from
    // this test file is '../../db.js'. Its table probes read `table_exists`.
    vi.doMock('../../db.js', () => ({
      pool: { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1, table_exists: true }] }) },
    }));
    const { governanceMetrics } = await import('../governance-observability');
    governanceMetrics.reset();
    apply(governanceMetrics);
    return governanceMetrics.getHealth();
  }

  it('reports unhealthy, not healthy, when every attempt failed', async () => {
    /* The measured state: 33 persistence failures, zero writes. The denominator
       counted only successes, so totalOps was 0, the zero-guard returned 0, and
       this endpoint answered `healthy` with `failureRate: 0`. */
    const health = await healthAfter(m => {
      for (let i = 0; i < 33; i++) m.recordPersistenceFailure('recordGovernedDecision', new Error('23514'));
    });

    expect(health.counters.persistenceFailures).toBe(33);
    expect(health.counters.persistenceWrites).toBe(0);
    expect(health.failureRate).toBe(1);
    // The verdict must come from the failures, not from an unreachable database.
    expect(health.dbReachable).toBe(true);
    expect(health.status).toBe('unhealthy');
  });

  it('counts failures in the denominator, so the rate is failures over attempts', async () => {
    const health = await healthAfter(m => {
      for (let i = 0; i < 3; i++) m.recordPersistenceWrite();
      m.recordPersistenceFailure('recordGovernedDecision', new Error('23514'));
    });

    // 1 failure in 4 attempts. Over successes alone it would have read 0.333.
    expect(health.failureRate).toBe(0.25);
    expect(health.status).toBe('degraded');
  });

  it('does not report a failure when nothing has failed', async () => {
    const health = await healthAfter(m => {
      for (let i = 0; i < 5; i++) m.recordPersistenceWrite();
      m.recordQueryExecuted();
    });

    expect(health.failureRate).toBe(0);
    /* Asserted as "not unhealthy" rather than "healthy": table reachability is
       an orthogonal dimension of this verdict and depends on whether the test
       environment has the governance tables, which is not what these tests
       cover. What is asserted is that zero failures never reads as the
       not-recording state. */
    expect(health.status).not.toBe('unhealthy');
  });
});
