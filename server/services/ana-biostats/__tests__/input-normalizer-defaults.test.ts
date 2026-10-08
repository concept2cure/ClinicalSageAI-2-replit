import { describe, expect, it } from 'vitest';
import { inputNormalizer } from '../input-normalizer';
import type { StatisticalInput } from '../types';
import { getToolHandler } from '../../ana/AnaToolExecutor';

const PROVIDED_INPUT: Partial<StatisticalInput> = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  effectSize: 0.5,
  alpha: 0.05,
  powerTarget: 0.8,
  allocationRatio: 1,
};

describe('attrition assumptions distinguish supplied values from defaults', () => {
  it.each([0, 0.2])('keeps an explicitly supplied valid rate %s without labeling it a default', (rate) => {
    const result = inputNormalizer.normalize({ ...PROVIDED_INPUT, attritionRate: rate });
    expect(result.valid).toBe(true);
    expect(result.normalizedInput.attritionRate).toBe(rate);
    expect(result.prefilled).not.toContain('attritionRate');
  });

  it.each([
    ['omitted', {}],
    ['undefined', { attritionRate: undefined }],
    ['null', { attritionRate: null }],
  ] as const)('retains the existing default and attribution when the rate is %s', (_label, rate) => {
    // JSON callers can send null; the existing normalizer treats it as absent.
    const input = { ...PROVIDED_INPUT, ...rate } as Partial<StatisticalInput>;
    const result = inputNormalizer.normalize(input);
    expect(result.valid).toBe(true);
    expect(result.normalizedInput.attritionRate).toBe(0.15);
    expect(result.prefilled).toEqual(['attritionRate']);
  });

  it.each([-0.1, 1])('still rejects rate %s rather than substituting a default', (rate) => {
    const result = inputNormalizer.normalize({ ...PROVIDED_INPUT, attritionRate: rate });
    expect(result.valid).toBe(false);
    expect(result.normalizedInput.attritionRate).toBe(rate);
    expect(result.errors).toContainEqual({
      field: 'attritionRate', message: 'Attrition rate must be between 0 and 1', required: false,
    });
    expect(result.prefilled).not.toContain('attritionRate');
  });

  it('leaves the caller\'s supplied design and zero attrition unchanged', () => {
    const input = Object.freeze({ ...PROVIDED_INPUT, attritionRate: 0 });
    const before = { ...input };
    const result = inputNormalizer.normalize(input);
    expect(input).toEqual(before);
    expect(result.normalizedInput).toMatchObject(before);
  });
});

async function compute(input: Record<string, unknown>) {
  const handler = getToolHandler('compute_sample_size');
  if (!handler) throw new Error('compute_sample_size handler is not registered');
  const raw = await handler(input, {});
  if (typeof raw !== 'string') throw new Error('compute_sample_size did not return its JSON envelope');
  return JSON.parse(raw);
}

describe('AnA reports the engine\'s actual attrition assumption', () => {
  it('returns a supplied zero as a user assumption with no dropout inflation or default claim', async () => {
    const result = await compute({ ...PROVIDED_INPUT, attritionRate: 0 });
    expect(result.status).toBe('computed');
    expect(result.engine).toBe('deterministic');
    expect(result.assumptions.attritionRate).toBe(0);
    expect(result.sampleSize.total).toBe(result.sampleSize.rawTotal);
    expect(result.prefilledDefaults).not.toContain('attritionRate');
  });

  it('still applies and names the existing default when AnA receives no rate', async () => {
    const result = await compute({ ...PROVIDED_INPUT });
    expect(result.status).toBe('computed');
    expect(result.assumptions.attritionRate).toBe(0.15);
    expect(result.sampleSize.total).toBeGreaterThan(result.sampleSize.rawTotal);
    expect(result.prefilledDefaults).toContain('attritionRate');
  });
});
