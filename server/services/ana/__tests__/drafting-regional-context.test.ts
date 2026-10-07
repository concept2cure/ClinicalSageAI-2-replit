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
  it.each(['EU_CTA', 'CA_CTA', 'CA_CTA_A', 'JP_CTN', 'ICH_NONCLIN_SUMMARY', 'US_IND_AMENDMENT'])('%s cannot draft against a known wrong or fallback scaffold', (type) => {
    const r = resolveDraftingRequirements(type, '3.2.S');
    expect(r.requirementsSource).toContain('not-indexed');
    expect(r.requirements).toContain('current agency/client template');
    expect(r.requirements).not.toContain('Governing standard: ICH M4Q');
  });
});
