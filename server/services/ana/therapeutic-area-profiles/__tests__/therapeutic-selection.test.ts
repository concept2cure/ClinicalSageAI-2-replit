import { describe, expect, it } from 'vitest';
import { getProfile, listProfiles, renderProfileForPrompt } from '../index.js';
import type { TherapeuticAreaProfile } from '../types.js';

const options = { onlyApplicableRules: true, asOf: '2026-10-30' } as const;
const cardiology = getProfile('cardiology')!;
const scopedProfile = (): TherapeuticAreaProfile => ({
  ...cardiology,
  contextRules: [{ id: 'clinical-rule', scope: 'section', appliesTo: '2.5',
    severity: 'major', instruction: 'Assess the selected clinical endpoint.', guidanceRef: 'ICH E6(R3)' }],
  commonGaps: [],
  guidanceRefs: [
    { authority: 'FDA', code: 'Unindexed reference A', title: 'General reference A', why: 'General background.' },
    { authority: 'FDA', code: 'Unindexed reference B', title: 'General reference B', why: 'General background.' },
    { authority: 'ICH', code: 'ICH E6(R3)', title: 'Good Clinical Practice', why: 'Supports the selected rule.' },
  ],
});

describe('existing therapeutic knowledge reaches clinical sections without entering CMC/nonclinical', () => {
  it.each(['2.5', '2.5.6', '2.7.3', '2.7.4', '5.3.5.1', '5.3.5.2'])('includes endpoints and statistics at CTD %s', activeCtdSection => {
    const prompt = renderProfileForPrompt(cardiology, { ...options, activeCtdSection, documentKind: 'ctd' });
    expect(prompt).toContain(cardiology.statisticalConsiderations[0]);
    expect(prompt).toContain(cardiology.endpointConsiderations[0]);
  });

  it('reaches existing clinical guidance for each static profile without claiming scientific coverage', () => {
    for (const profile of listProfiles()) {
      const prompt = renderProfileForPrompt(profile, { ...options, activeCtdSection: '2.5', documentKind: 'ctd' });
      if (profile.statisticalConsiderations.length) expect(prompt, profile.id).toContain(profile.statisticalConsiderations[0]);
      if (profile.endpointConsiderations.length) expect(prompt, profile.id).toContain(profile.endpointConsiderations[0]);
      expect(prompt, profile.id).toContain('clinical applicability remains undetermined');
    }
  });

  it.each(['9', '9.7.1', '11.4.1', '12.2', '13'])('includes relevant ICH E3 %s clinical guidance', activeCtdSection => {
    const prompt = renderProfileForPrompt(cardiology, { ...options, activeCtdSection, documentKind: 'csr' });
    expect(prompt).toContain('### Endpoint Considerations');
    expect(prompt).toContain('### Statistical Considerations');
  });

  it('reaches protocol guidance without a CTD section code', () => {
    const prompt = renderProfileForPrompt(cardiology, { ...options, documentKind: 'protocol' });
    expect(prompt).toContain(cardiology.endpointConsiderations[0]);
    expect(prompt).toContain(cardiology.statisticalConsiderations[0]);
  });

  it('retains clinical guidance when a CSR is identified by its CTD filing location', () => {
    const prompt = renderProfileForPrompt(cardiology, { ...options, activeCtdSection: '5.3.5.1', documentKind: 'csr' });
    expect(prompt).toContain('### Endpoint Considerations');
  });

  it.each(['2.4', '2.6.6', '3.2.P.2', '4.2.3.2'])('excludes clinical arrays at unrelated CTD %s even with a conflicting kind', activeCtdSection => {
    for (const documentKind of ['ctd', 'protocol'] as const) {
      const prompt = renderProfileForPrompt(cardiology, { ...options, activeCtdSection, documentKind });
      expect(prompt).not.toContain('### Endpoint Considerations');
      expect(prompt).not.toContain('### Statistical Considerations');
    }
  });

  it('does not treat CTD module 1 or a CSR front-matter section as scientific results', () => {
    expect(renderProfileForPrompt(cardiology, { ...options, activeCtdSection: '1.3', documentKind: 'ctd' }))
      .not.toContain('### Endpoint Considerations');
    expect(renderProfileForPrompt(cardiology, { ...options, activeCtdSection: '3', documentKind: 'csr' }))
      .not.toContain('### Endpoint Considerations');
  });
});

describe('reference selection and product applicability remain advisory and bounded', () => {
  it('keeps a reference cited by the selected section rule ahead of earlier general references', () => {
    const prompt = renderProfileForPrompt(scopedProfile(), { ...options, activeCtdSection: '2.5', maxBulletsPerSection: 1 });
    expect(prompt).toContain('Supports the selected rule.');
    expect(prompt).not.toContain('General reference A');
    expect(prompt).not.toContain('General reference B');
  });

  it('retains an unknown conditional rule as undetermined, then excludes a known incompatible modality', () => {
    const profile = scopedProfile();
    profile.contextRules[0] = { ...profile.contextRules[0],
      applicability: { phases: ['Phase 1'], modalities: ['small_molecule'], populations: ['adult'] } };
    const unknown = renderProfileForPrompt(profile, { ...options, activeCtdSection: '2.5' });
    expect(unknown).toContain('[applicability undetermined]');
    expect(unknown).toContain('Assess the selected clinical endpoint.');
    const excluded = renderProfileForPrompt(profile, { ...options, activeCtdSection: '2.5',
      productContext: { phase: 'Phase 1', modality: 'gene_therapy', population: 'adult', source: 'declared' } });
    expect(excluded).not.toContain('Assess the selected clinical endpoint.');
    expect(excluded).toContain('declared advisory, not evidence');
    expect(excluded).toContain('clinical-rule. This is not a legal waiver.');
    const conditional = renderProfileForPrompt(profile, { ...options, activeCtdSection: '2.5',
      productContext: { phase: 'Phase 1', modality: 'small_molecule', population: 'adult', source: 'declared' } });
    expect(conditional).toContain('[applicability conditional]');
    expect(conditional).not.toContain('[applicability required]');
  });

  it('does not turn supplied recorded labels or a structural match into qualified evidence', () => {
    const prompt = renderProfileForPrompt(scopedProfile(), { ...options, activeCtdSection: '2.5',
      productContext: { phase: 'Phase 1', modality: 'small_molecule', population: 'adult', source: 'recorded' } });
    expect(prompt).toContain('recorded advisory, not evidence');
    expect(prompt).toContain('clinical applicability remains undetermined');
  });

  it('does not infer incompatibility from an unrecognized phase or free-text population label', () => {
    const profile = scopedProfile();
    profile.contextRules[0] = { ...profile.contextRules[0],
      applicability: { phases: ['Phase 1'], populations: ['adult'] } };
    for (const productContext of [
      { phase: 'phase_i', population: 'adult' },
      { phase: 'Phase 1', population: 'adults' },
      { phase: 'unknown', population: 'adult' },
    ]) {
      const prompt = renderProfileForPrompt(profile, { ...options, activeCtdSection: '2.5', productContext });
      expect(prompt).toContain('Assess the selected clinical endpoint.');
      expect(prompt).toContain('[applicability undetermined]');
    }
  });

  it('can exclude a known incompatible canonical phase without inventing a population ontology', () => {
    const profile = scopedProfile();
    profile.contextRules[0] = { ...profile.contextRules[0], applicability: { phases: ['Phase 1'] } };
    const prompt = renderProfileForPrompt(profile, { ...options, activeCtdSection: '2.5',
      productContext: { phase: 'phase_3' } });
    expect(prompt).not.toContain('Assess the selected clinical endpoint.');
    expect(prompt).toContain('not a legal waiver');
  });

  it('reports references absent from existing dated registries as unresolved', () => {
    const prompt = renderProfileForPrompt(scopedProfile(), { ...options, activeCtdSection: '3.2.P', maxBulletsPerSection: 1 });
    expect(prompt).toContain('currency unresolved: unverified');
    expect(prompt).not.toContain('current=true');
  });

  it('preserves supersession and regional not-yet-effective warnings from the existing currency service', () => {
    const profile = scopedProfile();
    profile.guidanceRefs = [
      { authority: 'ICH', code: 'ICH E6(R2)', title: 'Good Clinical Practice', why: 'Old cited revision.' },
      { authority: 'ICH', code: 'ICH E6(R3) Annex 2', title: 'Good Clinical Practice', why: 'Upcoming regional annex.' },
    ];
    const prompt = renderProfileForPrompt(profile, { ...options, jurisdiction: 'EU', maxBulletsPerSection: 5 });
    expect(prompt).toContain('superseded');
    expect(prompt).toContain('not yet in effect');
    expect(prompt).toContain('2027-01-15');
    expect(prompt).toContain('eu-e6r3-annex2-effective');
    expect(prompt).toContain('does not establish applicability');
  });

  it.each(['2030-01-01', '2025-01-01'])('leaves stale or future source verification unresolved as of %s', asOf => {
    const prompt = renderProfileForPrompt(scopedProfile(), { ...options, asOf, activeCtdSection: '2.5', maxBulletsPerSection: 1 });
    expect(prompt).toContain('source verification unresolved');
  });
});
