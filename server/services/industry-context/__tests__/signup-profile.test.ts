/**
 * Signup → org industry profile derivation.
 *
 * The signup route seeds organization_industry_profiles from the coarse
 * industry_mode enum and the ZenSignup use-case selection. These mappings
 * decide the org's vertical (mdx vs biopharma) from day one, so every arm
 * of the switch is pinned here.
 */

import { describe, it, expect } from 'vitest';
import {
  primaryIndustryForIndustryMode,
  pathwaysForUseCases,
} from '../signup-profile';

describe('primaryIndustryForIndustryMode', () => {
  it('maps medtech to the device/diagnostics industry', () => {
    expect(primaryIndustryForIndustryMode('medtech')).toBe('medical_device_diagnostics');
  });

  it('maps pharma and biotech to biotech_pharma', () => {
    expect(primaryIndustryForIndustryMode('pharma')).toBe('biotech_pharma');
    expect(primaryIndustryForIndustryMode('biotech')).toBe('biotech_pharma');
  });

  it('maps cro, regulatory, and academic to their own industries', () => {
    expect(primaryIndustryForIndustryMode('cro')).toBe('cro');
    expect(primaryIndustryForIndustryMode('regulatory')).toBe('regulatory_consulting');
    expect(primaryIndustryForIndustryMode('academic')).toBe('academic_research');
  });

  it('falls back to biotech_pharma for unknown, legacy, or missing modes', () => {
    expect(primaryIndustryForIndustryMode('medical_writing')).toBe('biotech_pharma');
    expect(primaryIndustryForIndustryMode('something_else')).toBe('biotech_pharma');
    expect(primaryIndustryForIndustryMode(null)).toBe('biotech_pharma');
    expect(primaryIndustryForIndustryMode(undefined)).toBe('biotech_pharma');
  });
});

describe('pathwaysForUseCases', () => {
  it('maps pathway-shaped use cases to default pathways', () => {
    expect(pathwaysForUseCases(['510k'])).toEqual(['510k']);
    expect(pathwaysForUseCases(['pma', 'ind', 'nda'])).toEqual(['pma', 'ind', 'nda']);
    expect(pathwaysForUseCases(['cer'])).toEqual(['eu_mdr']);
  });

  it('drops workflow-shaped use cases and deduplicates', () => {
    expect(pathwaysForUseCases(['cmc', 'ectd', 'multiple'])).toEqual([]);
    expect(pathwaysForUseCases(['510k', 'cmc', '510k'])).toEqual(['510k']);
  });

  it('returns [] for missing or empty input', () => {
    expect(pathwaysForUseCases(undefined)).toEqual([]);
    expect(pathwaysForUseCases(null)).toEqual([]);
    expect(pathwaysForUseCases([])).toEqual([]);
  });
});
