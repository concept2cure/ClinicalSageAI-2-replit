import { describe, expect, it } from 'vitest';
import { filingAuthorityLabel, workbenchWritingFiling, writingAgencyPresentation } from '../writingAgencyPresentation';

const base = () => ({ binding: { known: true, documentId: 'bound-filing' as string | null },
  filing: { document: { id: 'bound-filing', agency: 'pmda', doc_type: 'jnda' } as never, loading: false, error: undefined },
  program: { id: 'project', registryId: 'US_IND' } as never, programId: 'project', programReadState: 'ready' as const,
  section: { draftingRegionState: 'not-recorded' as const }, sectionsCurrent: true, sectionsState: 'ready' });

describe('workbench writing presentation consumes exact existing context without adding authority', () => {
  it('uses the exact bound agency and withholds primary project fallback', () => {
    const filing = workbenchWritingFiling(base());
    expect(filing.verifiedFilingAgency).toBe('pmda'); expect(filing.registryId).toBeUndefined();
    expect(writingAgencyPresentation({ filing }).defaultRegion).toBe('PMDA');
  });
  it('requires matching selected identity and completed reads', () => {
    const input = base(); input.binding.documentId = 'another-filing';
    const filing = workbenchWritingFiling(input);
    expect(filing.state).toBe('error'); expect(filing.verifiedFilingAgency).toBeNull();
    expect(writingAgencyPresentation({ filing }).generationHold).toMatch(/could not be verified/);
    const loading = base(); loading.filing.loading = true;
    expect(workbenchWritingFiling(loading).state).toBe('loading');
  });
  it('keeps known-null unbound separate from unknown binding', () => {
    const input = base(); input.binding.documentId = null;
    expect(workbenchWritingFiling(input).registryId).toBe('US_IND');
    input.binding.known = false;
    expect(workbenchWritingFiling(input)).toMatchObject({ verifiedFilingAgency: null, state: 'error' });
  });
  it('does not use incomplete section ownership for generation', () => {
    const input = base(); input.sectionsCurrent = false;
    expect(writingAgencyPresentation({ filing: workbenchWritingFiling(input) }).generationHold).toMatch(/Reading/);
  });
  it.each(['cer', 'mdr', 'ivdr'])('displays only the known %s EMA storage alias as Notified Body without mutating records', doc_type => {
    const row = { doc_type, agency: 'ema' };
    expect(filingAuthorityLabel(row)).toBe('EU / Notified Body');
    expect(row).toEqual({ doc_type, agency: 'ema' });
  });
  it.each(['maa', 'nda', 'ind', 'ivd'])('keeps an unrelated %s / EMA label unchanged', doc_type => {
    expect(filingAuthorityLabel({ doc_type, agency: 'ema' })).toBe('EMA');
  });
});
