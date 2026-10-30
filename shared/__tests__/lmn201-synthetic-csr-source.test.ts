import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CsrSourceEnvelopeSchema } from '../csr-source-input';

const fixturePath = path.resolve('data/seeds/lumen-demo/seed-data/lmn201_synthetic_csr_source_v1.json');
const source = JSON.parse(readFileSync(fixturePath, 'utf8'));

describe('LMN-201-like synthetic CSR sandbox fixture', () => {
  it('conforms to the existing governed CSR supporting-source contract', () => {
    const result = CsrSourceEnvelopeSchema.safeParse(source);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('reconciles invented populations and aggregate displays', () => {
    expect(source.studyInfo.sampleSize).toBe(23);
    expect(source.participants).toHaveLength(23);
    const arms = source.studyData.treatmentArms;
    expect(arms.map((arm: { randomized: number }) => arm.randomized)).toEqual([12, 11]);
    expect(source.studyData.efficacy.map((endpoint: { value: number }) => endpoint.value))
      .toEqual([10 / 12, 4 / 11]);
    expect(source.studyData.adverseEvents).toHaveLength(5);
  });

  it('is unmistakably synthetic and contains no fabricated statistical inference', () => {
    expect(source.studyInfo.title).toMatch(/SYNTHETIC|NOT ACTUAL/i);
    expect(source.studyInfo.sponsor).toMatch(/FICTIONAL DEMO/i);
    for (const endpoint of source.studyData.efficacy) {
      expect(endpoint.pValue).toBeUndefined();
      expect(endpoint.ci).toBeUndefined();
      expect(endpoint.display).toMatch(/simulated/i);
    }
  });

  it('does not pretend the public overall enrollment count is an invented participant listing', () => {
    expect(source.participants).toHaveLength(23);
    expect(source.participants.every((p: { subjectId: string }) => p.subjectId.startsWith('DEMO-'))).toBe(true);
    expect(source.studyInfo.sampleSize).not.toBe(45);
  });
});
