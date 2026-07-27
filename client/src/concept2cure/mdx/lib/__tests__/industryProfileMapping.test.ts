/**
 * industryProfileMapping — picker chip ↔ governed org industry profile
 * (primary_industry / mdx_specialization) translation. Pure, no I/O.
 */

import { describe, expect, it } from 'vitest';
import {
  CLIENT_TYPE_OPTIONS,
  PRIMARY_INDUSTRIES,
  buildOrgProfilePatch,
  governedToPicker,
  pickerMatchesProfile,
  pickerToGoverned,
} from '../industryProfileMapping';

describe('pickerToGoverned', () => {
  it('maps every picker chip to a governed pair', () => {
    for (const t of CLIENT_TYPE_OPTIONS) {
      const g = pickerToGoverned(t);
      expect(g).not.toBeNull();
      expect(PRIMARY_INDUSTRIES).toContain(g!.primaryIndustry);
    }
  });

  it('distinguishes medtech and diagnostics via mdx_specialization', () => {
    expect(pickerToGoverned('medtech')).toEqual({
      primaryIndustry: 'medical_device_diagnostics',
      mdxSpecialization: 'medical_device',
    });
    expect(pickerToGoverned('diagnostics')).toEqual({
      primaryIndustry: 'medical_device_diagnostics',
      mdxSpecialization: 'ivd_diagnostics',
    });
  });

  it('collapses biotech and pharma to biotech_pharma with no specialization', () => {
    expect(pickerToGoverned('biotech')).toEqual({
      primaryIndustry: 'biotech_pharma',
      mdxSpecialization: null,
    });
    expect(pickerToGoverned('pharma')).toEqual({
      primaryIndustry: 'biotech_pharma',
      mdxSpecialization: null,
    });
  });

  it('returns null for values outside the picker vocabulary', () => {
    expect(pickerToGoverned('spacetech')).toBeNull();
    expect(pickerToGoverned('')).toBeNull();
  });
});

describe('governedToPicker', () => {
  it('resolves every primary_industry to a chip', () => {
    for (const p of PRIMARY_INDUSTRIES) {
      expect(CLIENT_TYPE_OPTIONS).toContain(governedToPicker(p, null));
    }
  });

  it('renders ivd_diagnostics as diagnostics, any other device spec as medtech', () => {
    expect(governedToPicker('medical_device_diagnostics', 'ivd_diagnostics')).toBe('diagnostics');
    expect(governedToPicker('medical_device_diagnostics', 'medical_device')).toBe('medtech');
    expect(governedToPicker('medical_device_diagnostics', 'samd')).toBe('medtech');
    expect(governedToPicker('medical_device_diagnostics', null)).toBe('medtech');
  });

  it('round-trips every chip except pharma (which canonicalizes to biotech)', () => {
    for (const t of CLIENT_TYPE_OPTIONS) {
      const g = pickerToGoverned(t)!;
      const back = governedToPicker(g.primaryIndustry, g.mdxSpecialization);
      expect(back).toBe(t === 'pharma' ? 'biotech' : t);
    }
  });
});

describe('pickerMatchesProfile', () => {
  it('keeps the pharma chip when the profile is biotech_pharma', () => {
    expect(pickerMatchesProfile('pharma', 'biotech_pharma', null)).toBe(true);
    expect(pickerMatchesProfile('biotech', 'biotech_pharma', null)).toBe(true);
  });

  it('honors the governed device-vs-IVD distinction', () => {
    expect(pickerMatchesProfile('medtech', 'medical_device_diagnostics', 'ivd_diagnostics')).toBe(
      false,
    );
    expect(
      pickerMatchesProfile('diagnostics', 'medical_device_diagnostics', 'ivd_diagnostics'),
    ).toBe(true);
    expect(pickerMatchesProfile('medtech', 'medical_device_diagnostics', 'samd')).toBe(true);
  });

  it('rejects a chip from a different industry or outside the vocabulary', () => {
    expect(pickerMatchesProfile('cro', 'biotech_pharma', null)).toBe(false);
    expect(pickerMatchesProfile('spacetech', 'cro', null)).toBe(false);
  });
});

describe('buildOrgProfilePatch', () => {
  it('sends primary_industry and specialization for a device chip', () => {
    expect(buildOrgProfilePatch('medtech', null)).toEqual({
      primaryIndustry: 'medical_device_diagnostics',
      mdxSpecialization: 'medical_device',
    });
    expect(buildOrgProfilePatch('diagnostics', 'medical_device')).toEqual({
      primaryIndustry: 'medical_device_diagnostics',
      mdxSpecialization: 'ivd_diagnostics',
    });
  });

  it('does not coarsen a finer device specialization that renders as the same chip', () => {
    expect(buildOrgProfilePatch('medtech', 'samd')).toEqual({
      primaryIndustry: 'medical_device_diagnostics',
    });
    expect(buildOrgProfilePatch('medtech', 'combination_product')).toEqual({
      primaryIndustry: 'medical_device_diagnostics',
    });
  });

  it('clears the specialization when leaving the device industry', () => {
    expect(buildOrgProfilePatch('biotech', 'medical_device')).toEqual({
      primaryIndustry: 'biotech_pharma',
      mdxSpecialization: null,
    });
  });

  it('returns null for an unmappable picker value', () => {
    expect(buildOrgProfilePatch('spacetech', null)).toBeNull();
  });
});
