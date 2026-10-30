import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CsrSourceEnvelopeSchema } from '../csr-source-input.js';

const file = path.resolve(process.cwd(), 'data/seeds/lumen-demo/seed-data/lmn201_synthetic_csr_source_v1.json');
const raw = JSON.parse(readFileSync(file, 'utf8'));

describe('LMN-201-like synthetic CSR demo source', () => {
  it('passes the existing governed CSR source contract', () => {
    const parsed = CsrSourceEnvelopeSchema.parse(raw);
    expect(parsed.format).toBe('concept2cure.csr-source.v1');
    expect(parsed.studyInfo.protocolNumber).toBe('DEMO-LMN201-PARTB-001');
    expect(parsed.studyInfo.title).toMatch(/SYNTHETIC/);
    expect(parsed.studyInfo.sponsor).toMatch(/FICTIONAL DEMO/);
  });
  it('keeps randomized, safety, ITT and disposition populations consistent', () => {
    const parsed = CsrSourceEnvelopeSchema.parse(raw);
    expect(parsed.participants).toHaveLength(23);
    expect(parsed.studyData.disposition).toHaveLength(23);
    expect(parsed.studyData.demographics).toHaveLength(23);
    expect(parsed.studyData.treatmentArms.map(arm => arm.randomized)).toEqual([12, 11]);
  });
  it('never introduces unsupported statistical significance claims', () => {
    const parsed = CsrSourceEnvelopeSchema.parse(raw);
    expect(parsed.studyData.efficacy.map(e => e.display)).toEqual([
      '10/12 simulated participants', '4/11 simulated participants',
    ]);
    expect(parsed.studyData.efficacy.every(e => e.pValue === undefined && e.ci === undefined)).toBe(true);
  });
  it('rejects an altered population count', () => {
    const altered = structuredClone(raw);
    altered.studyData.treatmentArms[0].randomized = 45;
    expect(CsrSourceEnvelopeSchema.safeParse(altered).success).toBe(false);
  });
});
