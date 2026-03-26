import { describe, expect, test } from 'vitest';
import { computeQualityBand } from '../kernel-observability';

describe('kernel-observability', () => {
  test('maps quality scores to expected bands', () => {
    expect(computeQualityBand(0.9)).toBe('strong');
    expect(computeQualityBand(0.7)).toBe('moderate');
    expect(computeQualityBand(0.4)).toBe('weak');
  });
});

