/**
 * A cross-reference grounds a claim only if it resolves
 * (g-in-text-reference-resolution).
 *
 * Until 2026-10-05 grounding-core counted any "Table|Figure|Appendix <digit>"
 * or "Section|§ <digit>" token as a citation and never resolved it, so an
 * invented table grounded an invented number: 'TEAEs occurred in 45% (54/120)
 * of patients (Table 14.9.99).' raised no grounding finding in a CSR, although
 * ICH E3 §14 has no 14.9 (server/services/ind/ctd/csr-e3-guidance.ts).
 *
 * Pure: no DB, no I/O, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyInTextReferences,
  extractInTextReferences,
} from '../in-text-references';
import { assessGrounding } from '../grounding-core';
import { critiqueDraft, critiqueDocument, type PrecisionFinding } from '../writing-precision-gate';
import { listCtdGuidanceCodes } from '../../ind/ctd/index';

const grounding = (findings: PrecisionFinding[]) => findings.filter((f) => f.category === 'grounding');

const FABRICATED = 'TEAEs occurred in 45% (54/120) of patients (Table 14.9.99).';

describe('critiqueDraft — an unresolved reference does not ground a number', () => {
  it('raises one critical grounding finding naming the number and the reference (red at HEAD)', () => {
    const report = critiqueDraft({ text: FABRICATED, documentType: 'csr' });
    const g = grounding(report.findings);
    expect(g).toHaveLength(1);
    expect(g[0].severity).toBe('critical');
    expect(g[0].message).toContain('Table 14.9.99');
    expect(g[0].message).toContain('45%');
    expect(g[0].evidence.join(' ')).toContain('Table 14.9.99');
    expect(report.metrics.ungroundedClaims).toBe(1);
    expect(report.references.unresolved.map((r) => r.label)).toEqual(['Table 14.9.99']);
  });

  it('unqualified Section 9.12 in a CSR is unresolved (E3 §9 ends at 9.8)', () => {
    const report = critiqueDraft({
      text: 'A total of 240 patients were randomised (Section 9.12).',
      documentType: 'csr',
    });
    const g = grounding(report.findings);
    expect(g).toHaveLength(1);
    expect(g[0].message).toContain('Section 9.12');
  });

  it('one finding per distinct unresolved reference, never stacked with the generic one', () => {
    const report = critiqueDraft({
      text: [
        'Nausea occurred in 12% of patients (Table 14.9.99).',
        'Headache occurred in 8% of patients (Table 14.9.99).',
        'Rash occurred in 3% of patients.',
      ].join(' '),
      documentType: 'csr',
    });
    const g = grounding(report.findings);
    // One for Table 14.9.99 (both sentences), one generic for the uncited rash claim.
    expect(g).toHaveLength(2);
    const ref = g.find((f) => f.message.includes('Table 14.9.99'))!;
    expect(ref.evidence).toHaveLength(2);
    const generic = g.find((f) => !f.message.includes('Table 14.9.99'))!;
    expect(generic.message).toContain('1 quantitative claim');
  });

  it.each([
    ['a sponsor-numbered table below an E3 leaf', 'Nausea occurred in 12% of patients (Table 14.3.1.2).', 'csr'],
    ['an E3 section', 'Nausea occurred in 12% of patients (Section 12.2.2).', 'csr'],
    ['a CTD module code', 'Nausea occurred in 12% of patients (Module 2.7.4).', undefined],
    ['a CFR citation', 'Serious events were reported within 15 days per 21 CFR § 312.32.', 'csr'],
    ['a reference into the protocol', 'A total of 240 patients were planned (protocol Section 9.12).', 'csr'],
    ['plain sponsor numbering with no captions', 'Nausea occurred in 12% of patients (Table 7).', undefined],
  ])('control — %s raises no grounding finding', (_label, text, documentType) => {
    const report = critiqueDraft({ text, documentType });
    expect(grounding(report.findings)).toEqual([]);
  });

  it('plain Table 7 with no captions is an honest notice, never a finding', () => {
    const report = critiqueDraft({ text: 'Nausea occurred in 12% of patients (Table 7).' });
    expect(report.references.notResolvable.map((r) => r.label)).toEqual(['Table 7']);
    expect(report.references.unresolved).toEqual([]);
  });

  it('plain Table 7 resolves against passed captions, and is unresolved when the captions do not hold it', () => {
    const ok = critiqueDraft({
      text: 'Nausea occurred in 12% of patients (Table 7).',
      knownCaptions: ['Table 7: Adverse events by SOC'],
    });
    expect(grounding(ok.findings)).toEqual([]);
    expect(ok.references.resolved.map((r) => r.label)).toEqual(['Table 7']);

    const missing = critiqueDraft({
      text: 'Nausea occurred in 12% of patients (Table 7).',
      knownCaptions: ['Table 1: Demographics', 'Table 2: Disposition'],
    });
    const g = grounding(missing.findings);
    expect(g).toHaveLength(1);
    expect(g[0].message).toContain('Table 7');
  });
});

describe('critiqueDocument — per-section critiques resolve against the document class', () => {
  it('flags an invented E3 table inside one CSR section without a per-section structure finding', () => {
    const doc = critiqueDocument(
      [
        { title: '12.2 Adverse Events', text: FABRICATED },
        { title: '12.3 Deaths', text: 'No deaths occurred.' },
      ],
      { documentType: 'csr' },
    );
    const s = doc.sections[0].report;
    expect(grounding(s.findings).map((f) => f.message).join(' ')).toContain('Table 14.9.99');
    expect(s.findings.filter((f) => f.category === 'structure')).toEqual([]);
  });

  it('a section heading passed as a title resolves a sponsor-added section number', () => {
    const doc = critiqueDocument(
      [
        { title: '9.12 Additional analyses', text: 'Sensitivity analyses are described below.' },
        { title: '11.4 Efficacy Results', text: 'The response rate was 42% (Section 9.12).' },
      ],
      { documentType: 'csr' },
    );
    expect(grounding(doc.sections[1].report.findings)).toEqual([]);
  });
});

describe('extractInTextReferences / classifyInTextReferences', () => {
  it('extracts kind, number and qualifier', () => {
    const refs = extractInTextReferences(
      'See Table 14.3.1.2, Listing 16.2.7, Module 3.2.S.4.1, protocol Section 9.12 and 21 CFR § 312.32.',
    );
    expect(refs.map((r) => r.label)).toEqual([
      'Table 14.3.1.2',
      'Listing 16.2.7',
      'Module 3.2.S.4.1',
      'Section 9.12',
      'Section 312.32',
    ]);
    expect(refs[3].qualifier).toMatch(/protocol/i);
    expect(refs[4].qualifier).toMatch(/CFR/);
  });

  it('classifies against the E3 tree in a CSR', () => {
    const status = (text: string) =>
      classifyInTextReferences(text, { documentType: 'csr' }).map((r) => `${r.label}:${r.status}`);
    expect(status('Table 14.9.99')).toEqual(['Table 14.9.99:unresolved']);
    expect(status('Table 14.3.1.2')).toEqual(['Table 14.3.1.2:resolved']);
    expect(status('Listing 16.2.7.1')).toEqual(['Listing 16.2.7.1:resolved']);
    expect(status('Section 12.2.2')).toEqual(['Section 12.2.2:resolved']);
    expect(status('§9.12')).toEqual(['Section 9.12:unresolved']);
    expect(status('Section 9.12 of the protocol')).toEqual(['Section 9.12:not-resolvable-from-input']);
    expect(status('Table 11-1')).toEqual(['Table 11-1:not-resolvable-from-input']);
    expect(status('Section 505(b)(2)')).toEqual(['Section 505:not-resolvable-from-input']);
    expect(status('Table 3.A total')).toEqual(['Table 3:not-resolvable-from-input']);
    expect(classifyInTextReferences('Section 3 of ICH E9', { documentType: 'csr' })[0].qualifier).toBe('ICH E9');
  });

  it('says why an unresolved E3 number does not resolve', () => {
    const [r] = classifyInTextReferences('Table 14.9.99', { documentType: 'csr' });
    expect(r.reason).toMatch(/14\.1, 14\.2, 14\.3/);
  });

  it('classifies CTD module codes with no descendant leniency', () => {
    const status = (text: string) => classifyInTextReferences(text, {}).map((r) => `${r.label}:${r.status}`);
    expect(status('Module 2.7.4')).toEqual(['Module 2.7.4:resolved']);
    expect(status('Module 2.7')).toEqual(['Module 2.7:resolved']); // the parent of 2.7.1–2.7.6
    expect(status('Module 3.2.P.2.1')).toEqual(['Module 3.2.P.2.1:resolved']); // structural parent of exact child guidance
    expect(status('Module 2.7.9')).toEqual(['Module 2.7.9:unresolved']);
    expect(status('Module 5.3.5.99')).toEqual(['Module 5.3.5.99:unresolved']);
    expect(status('Module 1.14.1.3')).toEqual(['Module 1.14.1.3:not-resolvable-from-input']);
    expect(status('Module 3.3')).toEqual(['Module 3.3:not-resolvable-from-input']); // registry lacks module top headings
    expect(status('Module 6.1')).toEqual(['Module 6.1:unresolved']);
  });

  it('resolves a CMC structural heading without claiming exact guidance or unchecked descendants', () => {
    const codes = listCtdGuidanceCodes();
    expect(codes).not.toContain('3.2.P.2.1');
    expect(codes).toEqual(expect.arrayContaining(['3.2.P.2.1.1', '3.2.P.2.1.2']));

    const refs = classifyInTextReferences(
      'Module 3.2.P.2.1; Module 3.2.P.2.1.1; Module 3.2.P.2.1.2; Module 3.2.P.2.1.99; Module 3.2.P.2.1.1.99.',
      {},
    );
    expect(refs.map((r) => `${r.label}:${r.status}`)).toEqual([
      'Module 3.2.P.2.1:resolved',
      'Module 3.2.P.2.1.1:resolved',
      'Module 3.2.P.2.1.2:resolved',
      'Module 3.2.P.2.1.99:not-resolvable-from-input',
      'Module 3.2.P.2.1.1.99:not-resolvable-from-input',
    ]);
    expect(refs[0].reason).toBe('CTD 3.2.P.2.1 is a CTD heading.');
    expect(refs[4].reason).toContain('does not subdivide CTD 3.2.P.2.1.1');
  });

  it('outside a CSR, a section or E3-looking table is not resolvable from the text alone', () => {
    const r = classifyInTextReferences('Section 9.12 and Table 14.9.99', { documentType: 'protocol' });
    expect(r.map((x) => x.status)).toEqual(['not-resolvable-from-input', 'not-resolvable-from-input']);
  });
});

describe('assessGrounding — opts are opt-in', () => {
  it('without opts, any Table marker still grounds (check_grounding behaviour unchanged)', () => {
    expect(assessGrounding(FABRICATED).ok).toBe(true);
  });

  it('with a CSR reference context, an unresolved Table does not ground', () => {
    const r = assessGrounding(FABRICATED, { references: { documentType: 'csr' } });
    expect(r.ok).toBe(false);
    expect(r.ungroundedClaims[0].references?.map((x) => `${x.label}:${x.status}`)).toEqual([
      'Table 14.9.99:unresolved',
    ]);
  });

  it('with a CSR context, "Table 3 of the CSR" is the CSR itself: sponsor numbering, a notice, still grounded', () => {
    const r = assessGrounding('The overall response rate was 42% (Table 3 of the CSR).', {
      references: { documentType: 'csr' },
    });
    expect(r.ok).toBe(true);
  });
});

describe('fix round 1 — a compliant reference is never reported as fabricated', () => {
  it('Module 2.5.7 (M4E Literature References) is not unresolved although the registry stops at 2.5.6', () => {
    const [r] = classifyInTextReferences('Module 2.5.7', {});
    expect(r.status).toBe('not-resolvable-from-input');
    expect(r.reason).toMatch(/2\.5/);
    const report = critiqueDraft({ text: 'Literature supports a 30% response rate (Module 2.5.7).' });
    expect(grounding(report.findings)).toEqual([]);
  });

  it('a gap under a CTD heading whose registered children are complete stays unresolved', () => {
    const status = (text: string) => classifyInTextReferences(text, {}).map((r) => `${r.label}:${r.status}`);
    expect(status('Module 2.7.9')).toEqual(['Module 2.7.9:unresolved']);
    expect(status('Module 3.2.S.8')).toEqual(['Module 3.2.S.8:unresolved']);
    expect(status('Module 5.9')).toEqual(['Module 5.9:unresolved']); // M4 Module 5 is 5.1–5.4, all registered
    expect(status('Module 2.1')).toEqual(['Module 2.1:not-resolvable-from-input']); // 2.1 TOC is not registered
  });

  it.each([
    ['Table 14.3.5.1', 'Vital signs changed by 5% (Table 14.3.5.1).'],
    ['Listing 16.2.9', 'Vital signs changed by 5% in 3 patients (Listing 16.2.9).'],
    ['Appendix 16.1.13', 'Drug concentrations were measured in 40 patients (Appendix 16.1.13).'],
  ])('sponsor TFL numbering beyond an E3 sub-heading — %s — is a notice, never a finding', (label, text) => {
    const report = critiqueDraft({ text, documentType: 'csr' });
    expect(grounding(report.findings)).toEqual([]);
    expect(report.references.notResolvable.map((r) => r.label)).toContain(label);
  });

  it('a number directly under §14 or §16 that E3 lacks is still unresolved', () => {
    const status = (text: string) =>
      classifyInTextReferences(text, { documentType: 'csr' }).map((r) => `${r.label}:${r.status}`);
    expect(status('Table 14.9.99')).toEqual(['Table 14.9.99:unresolved']);
    expect(status('Listing 16.7')).toEqual(['Listing 16.7:unresolved']);
    expect(status('Section 9.5.9')).toEqual(['Section 9.5.9:unresolved']); // sections keep the strict rule
  });

  it('a section title that is a table caption does not make the other sections\' tables unresolved', () => {
    const doc = critiqueDocument(
      [
        { title: 'Table 1 Demographics', text: 'Baseline characteristics were balanced.' },
        { title: '12.2 Adverse Events', text: 'Nausea occurred in 12% of patients (Table 7).' },
      ],
      { documentType: 'csr' },
    );
    expect(grounding(doc.sections[1].report.findings)).toEqual([]);
    expect(doc.sections[1].report.references.notResolvable.map((r) => r.label)).toEqual(['Table 7']);
  });

  it('a title still resolves the reference it matches', () => {
    const doc = critiqueDocument(
      [
        { title: 'Table 7 Adverse events by SOC', text: 'See below.' },
        { title: '12.2 Adverse Events', text: 'Nausea occurred in 12% of patients (Table 7).' },
      ],
      { documentType: 'csr' },
    );
    expect(doc.sections[1].report.references.resolved.map((r) => r.label)).toEqual(['Table 7']);
  });

  it('inside a CSR, "the CSR" is this document: an invented E3 number there is unresolved', () => {
    const status = (text: string) =>
      classifyInTextReferences(text, { documentType: 'csr' }).map((r) => `${r.label}:${r.status}`);
    expect(status('A total of 240 patients were randomised (see CSR Section 9.12).')).toEqual([
      'Section 9.12:unresolved',
    ]);
    expect(status('Rates are in Table 14.9.99 of the clinical study report.')).toEqual(['Table 14.9.99:unresolved']);
    // A named other study's CSR is still another document.
    expect(status('See CSR ABC-001 Section 9.12.')).toEqual(['Section 9.12:not-resolvable-from-input']);
    // Outside a CSR, "the CSR" is another document.
    expect(classifyInTextReferences('see CSR Section 9.12', { documentType: 'protocol' })[0].status).toBe(
      'not-resolvable-from-input',
    );
  });
});

describe('fix round 2 — a reference into another document is never judged against this CSR', () => {
  const statusIn = (text: string, documentType = 'csr') =>
    classifyInTextReferences(text, { documentType }).map((r) => `${r.label}:${r.status}`);

  it.each([
    'Protocol ABC-001, Section 9.12',
    'Protocol ABC-001 Section 9.12',
    'Protocol Amendment 2, Section 9.12',
    'protocol amendment 2 Section 9.12',
    'Section 9.12 of the Study 201 protocol',
    'Section 9.12 of the ABC-001 protocol',
    'Section 9.12 of the clinical protocol',
    'SAP v2.0 Section 9.12',
    'SAP version 2.0, Section 9.12',
    'the SAP (version 3.0), Section 9.12',
    'Section 9.12 of the final SAP',
    'IB Edition 5, Section 9.12',
    'Study 201 CSR Section 9.12',
    'the Phase 2 CSR Section 9.12',
    'the CSR for Study 201, Section 9.12',
    'Section 9.12 of the CSR for Study 201',
    'Table 14.4.1 of the Study 201 CSR',
    'Study 201 CSR Table 14.4.1',
  ])('%s — not resolvable, and no grounding finding on the number it cites', (ref) => {
    const [r] = classifyInTextReferences(ref, { documentType: 'csr' });
    expect(r.status).toBe('not-resolvable-from-input');
    expect(r.qualifier).not.toBeNull();
    expect(r.qualifierInferred).toBe(false); // named next to the reference, not merely earlier in the sentence
    const report = critiqueDraft({ text: `The planned sample size was 240 patients (${ref}).`, documentType: 'csr' });
    expect(grounding(report.findings)).toEqual([]);
  });

  it('a protocol named earlier in the same sentence makes an unqualified section a notice, never a finding', () => {
    const text = 'In the protocol, the primary analysis of 240 patients (Section 9.12) was planned.';
    const [r] = classifyInTextReferences(text, { documentType: 'csr' });
    expect(r.status).toBe('not-resolvable-from-input');
    expect(r.reason).toMatch(/protocol/);
    expect(grounding(critiqueDraft({ text, documentType: 'csr' }).findings)).toEqual([]);
  });

  it('a coordinated reference shares the qualifier of its neighbour', () => {
    expect(statusIn('Section 9.12 of the protocol and Section 9.13')).toEqual([
      'Section 9.12:not-resolvable-from-input',
      'Section 9.13:not-resolvable-from-input',
    ]);
    expect(statusIn('Section 9.12 and Section 9.13 of the SAP')).toEqual([
      'Section 9.12:not-resolvable-from-input',
      'Section 9.13:not-resolvable-from-input',
    ]);
  });

  it('a plural keyword or a bare number list shares the document named after it', () => {
    expect(statusIn('Sections 9.12 and 9.13 of the SAP')).toEqual(['Section 9.12:not-resolvable-from-input']);
    expect(statusIn('Section 9.12, 9.13 of the SAP')).toEqual(['Section 9.12:not-resolvable-from-input']);
    expect(statusIn('Response was 45% (Tables 14.2.1 and 14.2.2).')).toEqual(['Table 14.2.1:resolved']);
  });

  it('a percentage after "the clinical study report" is the sentence\'s data, not a study id: still this CSR', () => {
    expect(statusIn('As described in the clinical study report, 45% had TEAEs (Table 14.9.99).')).toEqual([
      'Table 14.9.99:unresolved',
    ]);
  });

  it('this CSR, a bare CSR, a per-protocol population and a guideline mention stay judged against E3', () => {
    expect(statusIn('Section 9.12 of this report')).toEqual(['Section 9.12:unresolved']);
    expect(statusIn('see CSR Section 9.12')).toEqual(['Section 9.12:unresolved']);
    expect(statusIn('In the per-protocol population, TEAEs occurred in 45% (Table 14.9.99).')).toEqual([
      'Table 14.9.99:unresolved',
    ]);
    expect(statusIn('Protocol deviations occurred in 12% of patients (Table 14.9.99).')).toEqual([
      'Table 14.9.99:unresolved',
    ]);
    expect(statusIn('Per the ICH E3 guideline, TEAEs occurred in 45% (Table 14.9.99).')).toEqual([
      'Table 14.9.99:unresolved',
    ]);
    // A protocol named in an earlier sentence does not reach this one.
    expect(statusIn('The protocol was amended twice. TEAEs occurred in 45% (Table 14.9.99).')).toEqual([
      'Table 14.9.99:unresolved',
    ]);
  });

  it('an unresolved §14 table says how to clear it: the TFL captions', () => {
    const [r] = classifyInTextReferences('Table 14.4.1', { documentType: 'csr' });
    expect(r.status).toBe('unresolved');
    expect(r.reason).toMatch(/knownCaptions/);
    const [ok] = classifyInTextReferences('Table 14.4.1', {
      documentType: 'csr',
      knownCaptions: ['Table 14.4.1 Pharmacokinetic parameters'],
    });
    expect(ok.status).toBe('resolved');
  });

  it('a module code below a registry leaf is not resolvable, never resolved unchecked', () => {
    const status = (text: string) => classifyInTextReferences(text, {}).map((r) => `${r.label}:${r.status}`);
    expect(status('Module 2.7.4.99')).toEqual(['Module 2.7.4.99:not-resolvable-from-input']);
    expect(status('Module 3.2.P.2.1.1.99')).toEqual(['Module 3.2.P.2.1.1.99:not-resolvable-from-input']);
    expect(grounding(critiqueDraft({ text: 'Nausea occurred in 12% of patients (Module 2.7.4.99).' }).findings)).toEqual(
      [],
    );
  });
});
