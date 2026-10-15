/**
 * Which part of a cited document a drafted section is grounded in (S5d): the
 * stretch that holds the section's terms, not the title page; the opening
 * only when there is nothing to choose by.
 */
import { describe, expect, it } from 'vitest';
import { chooseSourceWindow, sectionTerms } from '../draft-source-window';

const filler = (n: number) => 'Front matter, table of contents and administrative text. '.repeat(n);
const CSR = [
  filler(400),
  '\n11.4 Efficacy results. The primary endpoint, change from baseline in FEV1 at week 24, improved by 120 mL (95% CI 80 to 160).',
  ' The response rate was 47% in the bexotinib arm.\n',
  filler(400),
  '\n12.2 Adverse events. Headache was the most common adverse event (12%).\n',
  filler(200),
].join('');

describe('chooseSourceWindow', () => {
  it('grounds an efficacy section in the efficacy results, not the opening', () => {
    const w = chooseSourceWindow(CSR, 'Efficacy results: primary endpoint FEV1 week 24', 2000);
    expect(w.basis).toBe('relevant');
    expect(w.end - w.start).toBe(2000);
    const served = CSR.slice(w.start, w.end);
    expect(served).toContain('improved by 120 mL');
    expect(served).toContain('47%');
    // It starts at a boundary before its first hit, not mid-word.
    expect(CSR[w.start - 1]).toBe('\n');
  });

  it('grounds a safety section in the adverse events', () => {
    const w = chooseSourceWindow(CSR, 'Summarize adverse events and headache incidence', 2000);
    expect(CSR.slice(w.start, w.end)).toContain('Headache was the most common adverse event');
  });

  it('keeps the opening when no term is in the document, and says so', () => {
    expect(chooseSourceWindow(CSR, 'pharmacokinetics clearance half-life', 2000)).toEqual({ start: 0, end: 2000, basis: 'opening' });
    expect(chooseSourceWindow(CSR, '', 2000)).toEqual({ start: 0, end: 2000, basis: 'opening' });
  });

  it('serves a document that fits whole, whole', () => {
    expect(chooseSourceWindow('short text', 'efficacy', 2000)).toEqual({ start: 0, end: 10, basis: 'whole' });
  });

  it('never runs past the end of the document', () => {
    const tail = filler(300) + '\nFinal: efficacy endpoint met.';
    const w = chooseSourceWindow(tail, 'efficacy endpoint', 1000);
    expect(w.end).toBe(tail.length);
    expect(tail.slice(w.start, w.end)).toContain('efficacy endpoint met');
  });

  it('is deterministic: the same section and document give the same window', () => {
    const q = 'primary endpoint efficacy';
    expect(chooseSourceWindow(CSR, q, 3000)).toEqual(chooseSourceWindow(CSR, q, 3000));
  });
});

describe('sectionTerms', () => {
  it('keeps the words that choose, without instructions boilerplate or a section number', () => {
    // A CTD number is not in the source's text; "draft", "section", "summarize" are in every instruction.
    expect(sectionTerms('Draft section 2.7.3: Summarize the efficacy of Drug X')).toEqual(['efficacy', 'drug']);
  });
});
