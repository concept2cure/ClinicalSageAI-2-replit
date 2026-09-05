/**
 * A source's version is observed or it is absent — it is never invented.
 *
 * Ledger L21: `cre_evidence_sources.version` had no writer, so every row read
 * NULL. The dangerous fix is the obvious one — default it to 1, or to the
 * position in the supersession chain, or to a timestamp — because a fabricated
 * number in a provenance column is worse than a NULL one: a reviewer cannot
 * tell it apart from a version read off the title page.
 *
 * These tests pin BOTH halves of the contract:
 *   1. a declared version is recorded, with the evidence it was read from;
 *   2. an undeclared version is recorded AS undeclared — distinguishable from
 *      a row nothing ever examined, and never filled in with a default.
 */
import { describe, it, expect } from 'vitest';
import { determineSourceVersion } from '../source-version';

describe('determineSourceVersion — records what the document declares', () => {
  it('reads a version off the title page and says where it read it', () => {
    const d = determineSourceVersion({
      documentText: 'CLINICAL STUDY PROTOCOL\nProtocol C2C-401\nVersion 3.2\n15 January 2026',
      fileName: 'protocol.pdf',
    });
    expect(d.version).toBe('3.2');
    expect(d.declaration).toMatchObject({
      declared: true,
      version: '3.2',
      basis: 'document_text_declaration',
      evidence: 'Version 3.2',
    });
  });

  it('falls back to the filename when the document declares nothing', () => {
    const d = determineSourceVersion({
      documentText: 'Statistical Analysis Plan. Primary endpoint is ORR.',
      fileName: 'SAP_v2.pdf',
    });
    expect(d.version).toBe('2');
    expect(d.declaration).toMatchObject({
      declared: true, basis: 'filename_declaration', evidence: '_v2',
    });
    // Both were looked at, in that order — the record says so.
    expect(d.declaration.examined).toEqual(['document_text', 'filename']);
  });

  it('lets the document outrank its filename', () => {
    // The filename is whatever the person saving it typed. A version on the
    // title page is the document asserting its own identity.
    const d = determineSourceVersion({
      documentText: 'PROTOCOL\nVersion 4.0',
      fileName: 'protocol_v1_FINAL_FINAL.pdf',
    });
    expect(d.version).toBe('4.0');
    expect(d.declaration).toMatchObject({ basis: 'document_text_declaration' });
  });

  it('accepts Amendment and Revision as declarations too', () => {
    expect(determineSourceVersion({ documentText: 'Protocol Amendment 3' }).version).toBe('3');
    expect(determineSourceVersion({ documentText: 'Revision No. 2' }).version).toBe('2');
    expect(determineSourceVersion({ fileName: 'IB-rev4.docx' }).version).toBe('4');
  });
});

describe('determineSourceVersion — an unknown version is recorded as unknown', () => {
  it('records NO version, and records that it looked', () => {
    // THE CASE THE COLUMN EXISTS TO NOT LIE ABOUT. This document declares
    // nothing. `version` must stay null — not 1, not "latest", not a date —
    // and `declared: false` must be on the record, because a bare null cannot
    // be told apart from a row nothing ever examined.
    const d = determineSourceVersion({
      documentText: 'Investigator Brochure. Section 1. Physical properties.',
      fileName: 'brochure.pdf',
    });
    expect(d.version).toBeNull();
    expect(d.declaration).toEqual({
      declared: false,
      version: null,
      basis: null,
      reason: 'no_declaration_found',
      examined: ['document_text', 'filename'],
    });
    // Not defaulted, in any of the tempting ways.
    for (const tempting of ['1', 'v1', 'latest', '1.0', new Date().toISOString()]) {
      expect(d.version).not.toBe(tempting);
    }
  });

  it('declines when the document declares two different versions', () => {
    const d = determineSourceVersion({
      documentText: 'Protocol Version 2.0, superseding Version 1.0.',
      fileName: 'protocol.pdf',
    });
    expect(d.version).toBeNull();
    expect(d.declaration).toMatchObject({
      declared: false, reason: 'ambiguous_declarations', candidates: ['2.0', '1.0'],
    });
  });

  it('does not resolve an ambiguous document from its filename', () => {
    // Falling through to weaker evidence after the stronger evidence gave a
    // conflict is picking a winner. It declines instead — and the record shows
    // the filename was never consulted.
    const d = determineSourceVersion({
      documentText: 'Version 2.0 ... Version 5.0',
      fileName: 'protocol_v9.pdf',
    });
    expect(d.version).toBeNull();
    expect(d.declaration.examined).toEqual(['document_text']);
  });

  it('declines a filename with no clean label boundary', () => {
    // `v2final` could be version 2, or a token that merely starts with v2.
    // Recording "2" would be a guess dressed as an observation.
    const d = determineSourceVersion({ fileName: 'report_v2final.docx' });
    expect(d.version).toBeNull();
    expect(d.declaration).toMatchObject({ reason: 'no_declaration_found', examined: ['filename'] });
  });

  it('does not mistake a date, a section number or a dose for a version', () => {
    for (const text of [
      'Protocol C2C-401. 15 January 2026.',
      'Section 3.2.P.1 Description of dosage form',
      'Dose escalation to 2.5 mg/kg',
      'ClinicalTrials.gov NCT04123456',
    ]) {
      const d = determineSourceVersion({ documentText: text, fileName: 'doc.pdf' });
      expect(d.version, text).toBeNull();
    }
  });

  it('records that nothing was examined when there is nothing to examine', () => {
    const d = determineSourceVersion({ documentText: null, fileName: null });
    expect(d.version).toBeNull();
    expect(d.declaration).toMatchObject({ declared: false, examined: [] });
  });

  it('treats absent extraction as absent text, not as an empty document', () => {
    // The upload path passes null (not the filename placeholder) when
    // extraction produced nothing. The filename is then the only evidence.
    const d = determineSourceVersion({ documentText: null, fileName: 'protocol_v7.pdf' });
    expect(d.version).toBe('7');
    expect(d.declaration.examined).toEqual(['filename']);
  });
});
