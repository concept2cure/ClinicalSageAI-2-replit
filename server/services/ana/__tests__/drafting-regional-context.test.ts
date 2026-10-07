import { describe, expect, it } from 'vitest';
import { resolveDraftingRequirements, resolveSystemPrompt } from '../AnaDocumentDraftingService';
import { getLifecycleDocumentType } from '../../ind/ctd/index';
import { resolveRequirements } from '../../ind/ctd/requirements-resolver';

describe('drafting scope must precede regional filing instructions', () => {
  it.each(['ICH_DSUR', 'ICH_SAP', 'ICH_PROTOCOL'])('%s is a harmonised document, not a filing to ICH', (type) => {
    const prompt = resolveSystemPrompt(type);
    expect(prompt).toContain('ICH is a standards body, not the receiving regulatory agency');
    expect(prompt).toContain('Regional filing context: unconfirmed');
    expect(prompt).not.toContain('Agency: ICH');
    expect(prompt).not.toContain('Primary CTD Module:');
    expect(prompt).not.toContain('Submission Format:');
    expect(prompt).not.toContain('Use none formatting');
  });
  it.each(['ISO_CIP', 'IEC_62304', 'QMS_MDSAP'])('%s preserves its own global reference body', (type) => {
    const prompt = resolveSystemPrompt(type);
    expect(prompt).toContain('Reference body:');
    expect(prompt).not.toContain('ICH is a standards body');
    expect(prompt).toContain('Recorded document context:');
  });
  it.each(['CTA', ' cta '])('ambiguous %s needs jurisdiction before drafting to a trial route', (type) => {
    const prompt = resolveSystemPrompt(type);
    expect(prompt).toContain('CTA jurisdiction is unconfirmed');
    expect(prompt).not.toContain('Filing Type: EU Clinical');
    expect(prompt).not.toContain('CTIS Part I');
    expect(resolveDraftingRequirements(type, '1.1')).toEqual({ requirements: null, requirementsSource: 'none' });
  });
  it('exact regional trial identity still delivers the applicable context', () => {
    expect(resolveSystemPrompt('EU_CTA')).toContain('CTIS');
    expect(resolveSystemPrompt('CA_CTA')).toContain('Health Canada');
  });
  it('DSUR section drafting uses the corrected E2F record through section 20', () => {
    const r = resolveDraftingRequirements('ICH_DSUR', '20');
    expect(r.requirements).toContain('Conclusions');
    expect(r.requirementsSource).toContain('lifecycle-record');
    expect(resolveDraftingRequirements('ICH_DSUR', '3.2.S').requirements).toBeNull();
  });
  it.each([
    ['EU_CTA', 'PART_I.PROTOCOL', 'CTIS'], ['CA_CTA', '1.7.1', 'version number'],
    ['CA_CTA_A', '1.0.1', 'Module 1'], ['JP_CTN', 'ctn.notification', 'notification'],
    ['US_IND_AMENDMENT', 'amendment.protocol', '312.30'], ['ICH_NONCLIN_SUMMARY', '2.6.2', 'Pharmacology'],
  ])('%s drafts from its exact scoped outline', (type, code, expected) => {
    const r = resolveDraftingRequirements(type, code);
    expect(r.requirements).toContain(expected);
    expect(r.requirementsSource).not.toContain('not-indexed-outline');
  });
  it.each(['CA_CTA', 'CA_CTA_A', 'ICH_NONCLIN_SUMMARY'])('%s rejects marketing CTD guidance outside its selected scope', type => {
    for (const section of ['2', 'Module 2', '2.4', 'Nonclinical Overview', '2.7.4 Clinical Safety', '5.3.5.1']) {
      const r = resolveDraftingRequirements(type, section);
      expect(r.requirementsSource).toBe('record:outside-outline');
      expect(r.requirements).toContain('outside');
    }
  });
  it('CTIS groups and conditional attachments are not described as CTD modules or optional waivers', () => {
    const r = resolveDraftingRequirements('EU_CTA', 'PART_I.GMP').requirements!;
    expect(r).toContain('applicability is unresolved');
    expect(r).toContain('not CTD module designations');
    expect(r).not.toContain('Optional section');
  });
});


describe('current M11 protocol requirements are consumed by section drafting', () => {
  it('a parent objective section briefs its current child headings from the canonical outline', () => {
    const r = resolveDraftingRequirements('ICH_PROTOCOL', '3');
    expect(r.requirementsSource).toBe('record:outline:protocol-m11:3:exact');
    expect(r.requirements).toContain('TRIAL OBJECTIVES AND ASSOCIATED ESTIMANDS');
    expect(r.requirements).toContain('3.1 Primary Objective(s) and Associated Estimand(s)');
    expect(r.requirements).toContain('3.2 Secondary Objective(s) and Associated Estimand(s)');
    expect(r.requirements).toContain('FDA May 2026');
    expect(r.requirements).toContain('Existing E6(R2) projects require a reviewed mapping');
  });

  it('an applicable assessment carries scope limits without implying universal assessment requirements', () => {
    const r = resolveDraftingRequirements('ICH_PROTOCOL', '8.7 Immunogenicity Assessments');
    expect(r.requirementsSource).toBe('record:outline:protocol-m11:8.7:exact');
    expect(r.requirements).toContain('assess whether its content applies to this trial');
    expect(r.requirements).toContain('Purpose notes are platform authoring summaries');
    expect(r.requirements).toContain('does not implement or validate M11 technical specification exchange');
    expect(r.requirements).toContain('interventional clinical trial protocols');
  });

  it.each(['8.7.1', '15', '3.2.S'])('an unmodelled protocol heading %s is explicit and never replaced by another document framework', section => {
    const r = resolveDraftingRequirements('ICH_PROTOCOL', section);
    expect(r.requirementsSource).toBe('record:protocol-m11:not-indexed');
    expect(r.requirements).toContain('not encoded in the current M11 outline');
    expect(r.requirements).toContain('do not supply its requirements from memory');
    expect(r.requirements).not.toContain('Drug Substance');
  });
});


describe('current US IND safety reporting remains subtype and route scoped', () => {
  it('section drafting includes the canonical current route limits before any form or placement assumptions', () => {
    const r = resolveDraftingRequirements('US_IND_SR', 'safety.cover');
    expect(r.requirementsSource).toBe('record:lifecycle:ind_safety_report:safety.cover');
    expect(r.requirements).toContain('commercial/noncommercial status');
    expect(r.requirements).toContain('AEMS');
    expect(r.requirements).toContain('noncommercial INDs are exempt');
    expect(r.requirements).toContain('Reports under (ii), (iii) and (iv) use eCTD');
    expect(r.requirements).toContain('no universal Module 5 assignment');
    expect(r.requirements).toContain('does not build, validate or transmit an E2B(R3) message');
    expect(resolveDraftingRequirements('US_IND_SR', '1').requirementsSource).toBe(r.requirementsSource);
  });

  it('lifecycle timing distinguishes determination-based 15-day reporting, receipt-based 7-day reporting and prompt follow-up', () => {
    const dt = getLifecycleDocumentType('ind_safety_report')!;
    expect(dt.timing).toContain('sponsor determination');
    expect(dt.timing).toContain('initial receipt');
    expect(dt.timing).toContain('as soon as the information is available');
    expect(dt.timing).not.toContain('Follow-up information is submitted within 15');
    expect(dt.components.find(c => c.code === 'safety.followup')!.authoringGuidance).not.toContain('within 15 calendar days of the sponsor receiving');
    expect(dt.components.find(c => c.code === 'safety.cover')!.generationPrompt).toContain('only where the selected route requires');
    expect(dt.components.find(c => c.code === 'safety.icsr')!.generationPrompt).toContain('not an E2B(R3) message');
  });

  it('the bounded canonical lifecycle brief keeps current route and timing and an unknown section stays unindexed', () => {
    const answer = resolveRequirements({ document: 'ind_safety_report' });
    expect(answer.kind).toBe('answer');
    if (answer.kind !== 'answer') throw new Error('IND safety record missing');
    expect(answer.requirements).toContain('AEMS');
    expect(answer.requirements).toContain('sponsor determination');
    expect(answer.requirements).toContain('as soon as the information is available');
    expect(answer.requirements).not.toContain('December 2015, draft');
    expect(resolveDraftingRequirements('US_IND_SR', '5.3.5.1').requirementsSource).toBe('record:ind-safety:not-indexed');
  });
});
