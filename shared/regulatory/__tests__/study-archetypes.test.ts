/**
 * Study Archetype registry integrity (MDX-STUDY-01).
 *
 * The registry drives protocol scaffolding and filing mapping, so a missing
 * facet or a mis-scoped specialization silently degrades every downstream
 * surface. These tests hold the invariants: every archetype fully populated,
 * ids unique, both domains represented, and specialization filtering exact.
 */

import { describe, it, expect } from 'vitest';
import {
  REGISTRY_VERSION,
  listArchetypes,
  archetypesForSpecialization,
  getArchetype,
  type StudyArchetype,
  type StudySpecialization,
} from '../study-archetypes';

const FACETS: Array<keyof StudyArchetype> = [
  'requiredSections',
  'designQuestions',
  'endpoints',
  'typicalAcceptanceCriteria',
  'statisticalMethods',
  'supportingPlans',
  'filingMappings',
  'approvalRequirements',
  'applicability',
];

describe('registry versioning', () => {
  it('exposes a semver registry version', () => {
    expect(REGISTRY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('registry integrity', () => {
  const archetypes = listArchetypes();

  it('is non-empty', () => {
    expect(archetypes.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = archetypes.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every archetype a label and valid domain', () => {
    for (const a of archetypes) {
      expect(a.label.trim().length).toBeGreaterThan(0);
      expect(['device', 'ivd']).toContain(a.domain);
    }
  });

  it('populates every array facet with non-empty string entries', () => {
    for (const a of archetypes) {
      for (const facet of FACETS) {
        const value = a[facet] as string[];
        expect(Array.isArray(value), `${a.id}.${facet} should be an array`).toBe(true);
        expect(value.length, `${a.id}.${facet} should be non-empty`).toBeGreaterThan(0);
        for (const entry of value) {
          expect(typeof entry).toBe('string');
          expect(entry.trim().length, `${a.id}.${facet} has an empty entry`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('scopes applicability to known specializations', () => {
    const known: StudySpecialization[] = [
      'medical_device',
      'ivd_diagnostics',
      'samd',
      'companion_diagnostic',
      'combination_product',
      'both',
    ];
    for (const a of archetypes) {
      for (const spec of a.applicability) {
        expect(known).toContain(spec);
      }
    }
  });

  it('represents both domains', () => {
    const domains = new Set(archetypes.map((a) => a.domain));
    expect(domains.has('device')).toBe(true);
    expect(domains.has('ivd')).toBe(true);
  });

  it('covers the required device and ivd archetype ids', () => {
    const ids = new Set(archetypes.map((a) => a.id));
    const expected = [
      // device
      'feasibility',
      'pivotal_clinical_investigation',
      'human_factors_validation',
      'pmcf',
      // ivd
      'precision',
      'reproducibility',
      'lod_loq',
      'method_comparison',
      'clinical_performance',
      'lay_user',
      'cdx_concordance',
      'pmpf',
    ];
    for (const id of expected) {
      expect(ids.has(id as StudyArchetype['id']), `missing archetype ${id}`).toBe(true);
    }
  });
});

describe('listArchetypes', () => {
  it('returns copies that cannot mutate the registry', () => {
    const first = listArchetypes();
    first[0].requiredSections.push('MUTATION');
    const second = listArchetypes();
    expect(second[0].requiredSections).not.toContain('MUTATION');
  });
});

describe('archetypesForSpecialization', () => {
  it('returns the full registry for "both"', () => {
    expect(archetypesForSpecialization('both').length).toBe(listArchetypes().length);
  });

  it('filters device-only queries to applicable archetypes', () => {
    const result = archetypesForSpecialization('medical_device');
    expect(result.length).toBeGreaterThan(0);
    for (const a of result) {
      expect(
        a.applicability.includes('medical_device') || a.applicability.includes('both'),
      ).toBe(true);
    }
    // A purely IVD archetype should not surface for a device specialization.
    expect(result.map((a) => a.id)).not.toContain('lod_loq');
  });

  it('returns companion-diagnostic archetypes for that specialization', () => {
    const result = archetypesForSpecialization('companion_diagnostic');
    expect(result.map((a) => a.id)).toContain('cdx_concordance');
    for (const a of result) {
      expect(
        a.applicability.includes('companion_diagnostic') || a.applicability.includes('both'),
      ).toBe(true);
    }
  });

  it('includes the ivd detection-capability archetype for ivd_diagnostics', () => {
    const ids = archetypesForSpecialization('ivd_diagnostics').map((a) => a.id);
    expect(ids).toContain('lod_loq');
    expect(ids).toContain('precision');
  });
});

describe('getArchetype', () => {
  it('resolves a known id', () => {
    const a = getArchetype('precision');
    expect(a?.domain).toBe('ivd');
  });

  it('returns undefined for an unknown id', () => {
    expect(getArchetype('does_not_exist')).toBeUndefined();
  });

  it('returns a copy, not the registry object', () => {
    const a = getArchetype('feasibility')!;
    a.requiredSections.push('MUTATION');
    expect(getArchetype('feasibility')!.requiredSections).not.toContain('MUTATION');
  });
});
