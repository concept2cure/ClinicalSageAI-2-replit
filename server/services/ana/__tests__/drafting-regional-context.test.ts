import { describe, expect, it } from 'vitest';
import { resolveDraftingRequirements, resolveSystemPrompt } from '../AnaDocumentDraftingService';

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
