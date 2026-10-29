/**
 * A Bayesian primary result in the CSR source and its §11.4 table (2026-10-29).
 *
 * RePreve (LMN-201, NCT05330182) reports its primary analysis as Bayesian. The
 * CSR source contract (shared/csr-source-input.ts) had only a confidence
 * interval and a p-value, and is strict, so a source recording a posterior was
 * refused and the §11.4 table had nowhere to put one. The values here are the
 * synthetic demo source's, plus a synthetic posterior; none is the sponsor's.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CsrSourceEnvelopeSchema } from '../../../../shared/csr-source-input';
import { buildCSRTables } from '../../csr-tabulation-builders';

let synthetic: Record<string, unknown>;
beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), 'c2c-csr-bayes-'));
  try {
    const generated = spawnSync(process.execPath,
      [resolve('data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.mjs'), directory], { encoding: 'utf8' });
    expect(generated.status, generated.stderr).toBe(0);
    synthetic = JSON.parse(readFileSync(join(directory, 'csr_source_v1_500_synthetic.json'), 'utf8'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30_000);

type Efficacy = { endpointType: string; armId: string; comparatorArmId?: string } & Record<string, unknown>;
/** The synthetic source with a recorded Bayesian result on the active arm's primary endpoint. */
function withPosterior(extra: Record<string, unknown>) {
  const source = structuredClone(synthetic) as { studyData: { efficacy: Efficacy[] } };
  const active = source.studyData.efficacy.find(r => r.endpointType === 'primary' && r.comparatorArmId)
    ?? source.studyData.efficacy.find(r => r.endpointType === 'primary')!;
  Object.assign(active, extra);
  return { source, armId: active.armId };
}
const POSTERIOR = {
  credibleInterval: { lower: 1.1, upper: 69.5, level: '95% equal-tailed' },
  posteriorProbability: { value: 0.993, hypothesis: 'OR > 1' },
};

describe('a Bayesian result in the CSR source', () => {
  it('is accepted and reaches the §11.4 table, cell for cell as recorded', () => {
    const { source } = withPosterior(POSTERIOR);
    const parsed = CsrSourceEnvelopeSchema.safeParse(source);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    if (!parsed.success) return;
    const table = buildCSRTables(parsed.data.studyData).primaryEfficacy;
    expect(table.headers).toEqual(['Endpoint', 'Arm', 'Result', 'CI', 'p-value',
      'Credible interval', 'Posterior probability', 'Posterior hypothesis', 'vs Comparator']);
    const row = table.rows.find(r => r[7] === 'OR > 1')!;
    expect(row.slice(5, 8)).toEqual(['1.10–69.50 (95% equal-tailed)', '0.993', 'OR > 1']);
    // Nothing is computed: the frequentist cells stay empty when none was recorded.
    expect(row[4]).toBe('—');
    for (const other of table.rows.filter(r => r !== row)) expect(other.slice(5, 8)).toEqual(['—', '—', '—']);
  });

  it('leaves a table without one byte-identical, so its scientific-review receipts still verify', () => {
    const parsed = CsrSourceEnvelopeSchema.parse(synthetic);
    const table = buildCSRTables(parsed.studyData).primaryEfficacy;
    expect(table.headers).toEqual(['Endpoint', 'Arm', 'Result', 'CI', 'p-value', 'vs Comparator']);
    expect(table.rows.every(r => r.length === 6)).toBe(true);
  });

  it('never rounds a posterior up to certainty or down to impossibility', () => {
    for (const [value, shown] of [[0.9996, '>0.999'], [0.0004, '<0.001'], [1, '1.000'], [0.5, '0.500']] as const) {
      const parsed = CsrSourceEnvelopeSchema.parse(withPosterior({ posteriorProbability: { value, hypothesis: 'OR > 1' } }).source);
      const row = buildCSRTables(parsed.studyData).primaryEfficacy.rows.find(r => r[7] === 'OR > 1')!;
      expect(row[6]).toBe(shown);
    }
  });

  it('refuses reversed credible bounds, a probability outside 0–1 and a posterior with no hypothesis', () => {
    const refused = (extra: Record<string, unknown>) => CsrSourceEnvelopeSchema.safeParse(withPosterior(extra).source).success;
    expect(refused({ credibleInterval: { lower: 69.5, upper: 1.1, level: '95%' } })).toBe(false);
    expect(refused({ posteriorProbability: { value: 1.2, hypothesis: 'OR > 1' } })).toBe(false);
    expect(refused({ posteriorProbability: { value: 0.99 } })).toBe(false);
    expect(refused({ posteriorProbability: { value: 0.99, hypothesis: ' ' } })).toBe(false);
  });
});
