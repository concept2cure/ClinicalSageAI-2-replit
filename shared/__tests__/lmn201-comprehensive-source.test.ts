import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CsrSourceEnvelopeSchema } from '../csr-source-input';

type Fixture = Record<string, any>;
let directory: string;
let source: Fixture;
let challenges: Array<{ category: string; status: string }>;
const clone = (): Fixture => structuredClone(source);

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'c2c-csr-500-'));
  const script = resolve('data/seeds/lumen-demo/scripts/generate_lmn201_comprehensive.mjs');
  const result = spawnSync(process.execPath, [script, directory], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Synthetic fixture generation failed');
  source = JSON.parse(readFileSync(join(directory, 'csr_source_v1_500_synthetic.json'), 'utf8'));
  challenges = JSON.parse(readFileSync(join(directory, 'negative_cases.json'), 'utf8')).cases;
}, 30_000);
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('500-subject LMN-201-like synthetic CSR source', () => {
  it('validates with the real governed source contract', () => {
    const parsed = CsrSourceEnvelopeSchema.safeParse(source);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    expect(source.participants).toHaveLength(500);
    expect(source.studyData.treatmentArms.map((arm: { randomized: number }) => arm.randomized)).toEqual([250, 250]);
  });

  it('keeps 120 challenge instructions separate from actual executed checks', () => {
    expect(challenges).toHaveLength(120);
    expect(challenges.every(c => c.status === 'not_executed')).toBe(true);
  });

  const mutations: Array<[string, (data: Fixture) => void]> = [
    ['duplicate_subject', data => { data.participants[1].subjectId = data.participants[0].subjectId; }],
    ['arm_mismatch', data => { data.participants[0].armId = 'CONTROL'; }],
    ['population_mismatch', data => { data.studyData.treatmentArms[0].randomized += 1; }],
    ['missing_demographic', data => { data.studyData.demographics.shift(); }],
    ['disposition_mismatch', data => { data.studyData.disposition[0].status = 'discontinued'; }],
    ['unknown_ae_subject', data => { data.studyData.adverseEvents[0].subjectId = 'UNKNOWN-PATIENT'; }],
    ['endpoint_duplicate', data => { data.studyData.efficacy.push(structuredClone(data.studyData.efficacy[0])); }],
    ['unsupported_inference', data => { data.studyData.efficacy[0].pValue = 2; }],
  ];
  it.each(mutations)('rejects %s through the existing CSR source schema', (category, mutate) => {
    expect(challenges.some(c => c.category === category)).toBe(true);
    const changed = clone();
    mutate(changed);
    const result = CsrSourceEnvelopeSchema.safeParse(changed);
    expect(result.success, category).toBe(false);
    // The original clean source must remain valid after negative probes.
    expect(CsrSourceEnvelopeSchema.safeParse(source).success).toBe(true);
  });
});
