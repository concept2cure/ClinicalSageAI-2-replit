/**
 * useStudyArchetypes pure selectors — the sequencing and grouping rules
 * behind the "Applicable study designs" zone (MDX-STUDY-02).
 *
 * `archetypeQueryForContext` decides when the archetype fetch may run and
 * how it is narrowed; getting it wrong either fetches the full registry
 * before the tenant context resolves (a flash of non-adapted content) or
 * hides static regulatory reference content behind a tenant-context
 * failure. Both directions are pinned here.
 */

import { describe, it, expect } from 'vitest';
import {
  archetypeQueryForContext,
  groupArchetypesByDomain,
  type Archetype,
  type EffectiveSpecialization,
} from '../useStudyArchetypes';
import type { DataState } from '../../lib/dataState';

const ready = (
  specialization: EffectiveSpecialization['specialization'],
): DataState<EffectiveSpecialization> => ({
  status: 'ready',
  data: { specialization, source: 'project' },
});

describe('archetypeQueryForContext', () => {
  it('narrows to the resolved specialization', () => {
    expect(archetypeQueryForContext(ready('ivd_diagnostics'))).toBe('ivd_diagnostics');
    expect(archetypeQueryForContext(ready('medical_device'))).toBe('medical_device');
    expect(archetypeQueryForContext(ready('both'))).toBe('both');
  });

  it('falls back to the full registry when no specialization is on file', () => {
    expect(archetypeQueryForContext(ready(null))).toBe('all');
  });

  it('falls back to the full registry when the context resolve fails', () => {
    expect(
      archetypeQueryForContext({ status: 'error', message: 'HTTP 500' }),
    ).toBe('all');
  });

  it('holds the fetch while the context is unresolved', () => {
    expect(archetypeQueryForContext({ status: 'idle' })).toBeNull();
    expect(archetypeQueryForContext({ status: 'loading' })).toBeNull();
  });
});

function archetype(over: Partial<Archetype> = {}): Archetype {
  return {
    id: 'feasibility',
    label: 'Feasibility',
    domain: 'device',
    applicability: ['medical_device'],
    requiredSections: [],
    designQuestions: [],
    endpoints: [],
    typicalAcceptanceCriteria: [],
    statisticalMethods: [],
    supportingPlans: [],
    filingMappings: [],
    approvalRequirements: [],
    ...over,
  };
}

describe('groupArchetypesByDomain', () => {
  it('splits device and ivd archetypes preserving registry order', () => {
    const rows = [
      archetype({ id: 'feasibility', domain: 'device' }),
      archetype({ id: 'precision', domain: 'ivd' }),
      archetype({ id: 'pmcf', domain: 'device' }),
      archetype({ id: 'lod_loq', domain: 'ivd' }),
    ];
    const { device, ivd } = groupArchetypesByDomain(rows);
    expect(device.map((a) => a.id)).toEqual(['feasibility', 'pmcf']);
    expect(ivd.map((a) => a.id)).toEqual(['precision', 'lod_loq']);
  });

  it('returns empty groups for an empty list', () => {
    expect(groupArchetypesByDomain([])).toEqual({ device: [], ivd: [] });
  });
});
