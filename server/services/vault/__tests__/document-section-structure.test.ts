/**
 * Section structure of extracted text — the pure detector behind the chunk
 * columns section_title, section_hierarchy and chunk_type. No DB, no mocks.
 *
 * Two properties matter. A heading the text really carries is found, with an
 * exact span and the path of sections it sits in. And a line that only looks
 * like one — a list item, a sentence, a table row, a contents entry — is not:
 * a false heading does not leave a gap, it relabels every passage after it
 * until the next real one, and a citation with the wrong section is a claim.
 */
import { describe, it, expect } from 'vitest';
import {
  chunkTypeOf,
  detectDocumentHeadings,
  detectHeadingLine,
  sectionsForChunks,
} from '../document-section-structure';
import { chunkExtractedText } from '../document-chunking.service';

describe('detectHeadingLine — what is a heading', () => {
  it.each([
    ['2.7.3 Summary of Clinical Efficacy', '2.7.3', 3],
    ['3.2.S.4.2 Analytical Procedures', '3.2.S.4.2', 5],
    ['3.2.P.5.1 Specifications', '3.2.P.5.1', 5],
    ['3.2.P Drug Product', '3.2.P', 3],
    ['11.4.1 Efficacy Results', '11.4.1', 3],
    ['11.4.1.1 Analysis of efficacy', '11.4.1.1', 4],
    ['1. Introduction', '1', 1],
    ['9 INVESTIGATIONAL PLAN', '9', 1],
    ['2.7.3. Summary of Clinical Efficacy', '2.7.3', 3],
  ])('%s is a section heading', (line, number, depth) => {
    expect(detectHeadingLine(line)).toMatchObject({ kind: 'section', number, depth, label: line });
  });

  it('reads the tab pdf-parse writes between a number and its title as a separator', () => {
    expect(detectHeadingLine('2.7.3\tSummary of Clinical Efficacy')).toEqual({
      kind: 'section', number: '2.7.3', title: 'Summary of Clinical Efficacy',
      label: '2.7.3 Summary of Clinical Efficacy', depth: 3,
    });
  });

  it.each([
    ['Table 14.2.1 Summary of Primary Efficacy Endpoint', 'table', '14.2.1', 'Summary of Primary Efficacy Endpoint'],
    ['Table 11-3: Proportion of Responders at Week 24', 'table', '11-3', 'Proportion of Responders at Week 24'],
    ['TABLE 2 DEMOGRAPHIC CHARACTERISTICS', 'table', '2', 'DEMOGRAPHIC CHARACTERISTICS'],
    ['Figure 3 Kaplan-Meier Plot of Time to Progression', 'figure', '3', 'Kaplan-Meier Plot of Time to Progression'],
    ['Figure 14.2.1.1 - Mean Change From Baseline', 'figure', '14.2.1.1', 'Mean Change From Baseline'],
    ['Table 14.2.1', 'table', '14.2.1', ''],
    ['Table 14.2.1 (Continued)', 'table', '14.2.1', '(Continued)'],
  ])('%s is a caption', (line, kind, number, title) => {
    expect(detectHeadingLine(line)).toMatchObject({ kind, number, title, depth: 0, label: line });
  });

  it.each([
    // A numbered list item, sentence case, the way inclusion criteria read.
    ['1. Patients aged 18 years or older'],
    ['2) Signed informed consent'],
    ['1) Introduction'],
    // A sentence that ends in a period, or a lead-in that ends in a colon.
    ['2.1 The study was conducted in accordance with GCP.'],
    ['4.2 Patients were excluded if any of the following applied:'],
    // A bare number, or a section number with nothing after it.
    ['12'],
    ['2.7.3'],
    ['3.2.S.4.2'],
    // Table rows: cells pdf-parse separates with tabs, or OCR with spaces.
    ['1\tPlacebo\t45\t(23.1%)'],
    ['2.1\tExamplinib 20 mg\t212\t102 (48.2%)'],
    ['1 Placebo 45 (23.1%)'],
    // A row of words, as a schedule of assessments has: only the tab says so.
    ['3.1\tScreening Visit\tDay -28\tInformed Consent'],
    ['1\tAdverse Event\tSerious\tRelated'],
    // A measurement, a year, a date.
    ['12.5 mg/kg was administered once daily'],
    ['2016 Revision of the Standard'],
    ['12.10.2026 Screening Visit'],
    // A contents entry, by its dot leader.
    ['2.7.3 Summary of Clinical Efficacy ........................ 45'],
    ['2.7.3 Summary of Clinical Efficacy . . . . . . 45'],
    // Caption-shaped sentences and references.
    ['Table 3 shows the demographic profile of the randomised population'],
    ['Table 3. Demographics were balanced across arms.'],
    ['Table of Contents'],
    ['Tables 3 and 4 Summarise the Results'],
    ['Figure shows the mean'],
  ])('%s is not a heading', (line) => {
    expect(detectHeadingLine(line)).toBeNull();
  });

  it('a long line is not a heading, however it starts', () => {
    const long = `2.7.3 Summary of Clinical Efficacy ${'And Further Words '.repeat(6)}`.trim();
    expect(long.length).toBeGreaterThan(120);
    expect(detectHeadingLine(long)).toBeNull();
    expect(detectHeadingLine(`Table 14.2.1 ${'Summary Of Results '.repeat(9)}`.trim())).toBeNull();
  });

  it('a one-segment number needs a title-cased title; a dotted one only a capital', () => {
    expect(detectHeadingLine('1 Informed consent procedures')).toBeNull();
    expect(detectHeadingLine('1 Informed Consent Procedures')).toMatchObject({ number: '1', depth: 1 });
    expect(detectHeadingLine('1.1 Informed consent procedures')).toMatchObject({ number: '1.1', depth: 2 });
  });
});

describe('detectDocumentHeadings — headings in place', () => {
  it('finds only line-initial headings, never a numbered item inside a paragraph', () => {
    const text = 'Eligible patients met all criteria: 1. Patients aged 18 or over, 2. Signed consent.\n';
    expect(detectDocumentHeadings(text)).toEqual([]);
  });

  it('records the exact span and the page of each heading', () => {
    const text = 'Cover page text.\n\n  2.7.3 Summary of Clinical Efficacy  \r\nBody on page one.\n'
      + 'Table 2.7.3-1 Responder Rates\nRows follow on page two.';
    const page2 = text.indexOf('Table');
    const headings = detectDocumentHeadings(text, [
      { page: 1, start: 0, end: page2 - 1 },
      { page: 2, start: page2, end: text.length },
    ]);
    expect(headings.map(h => [h.label, h.page])).toEqual([
      ['2.7.3 Summary of Clinical Efficacy', 1],
      ['Table 2.7.3-1 Responder Rates', 2],
    ]);
    for (const h of headings) {
      expect(text.slice(h.charStart, h.charEnd)).toBe(h.label);
    }
  });

  it('gives no page when the page spans were not verified', () => {
    const [h] = detectDocumentHeadings('11.4.1 Efficacy Results\nBody.');
    expect(h.page).toBeNull();
  });

  it('a run of contents entries is not structure', () => {
    const text = [
      'TABLE OF CONTENTS',
      '9 Investigational Plan 21',
      '10 Study Patients 34',
      '11 Efficacy Evaluation 40',
      '',
      '9 Investigational Plan',
      'The study was a randomised, double-blind trial.',
    ].join('\n');
    expect(detectDocumentHeadings(text).map(h => h.label)).toEqual(['9 Investigational Plan']);
  });

  it('page numbers on their own lines do not break a contents run', () => {
    const text = '2.7.1 Background and Overview\n4\n2.7.2 Summary of Results\n9\n2.7.3 Comparison and Analyses\n15\nBody.';
    expect(detectDocumentHeadings(text)).toEqual([]);
  });

  it('a list of tables is not a set of captions', () => {
    const text = 'LIST OF TABLES\nTable 1 Demographics\nTable 2 Disposition\nTable 3 Exposure\nBody.';
    expect(detectDocumentHeadings(text)).toEqual([]);
  });

  it('a section opening straight into its subsections is structure', () => {
    const text = '3.2.S Drug Substance\n3.2.S.1 General Information\n3.2.S.1.1 Nomenclature\nINN: examplinib.';
    expect(detectDocumentHeadings(text).map(h => h.number)).toEqual(['3.2.S', '3.2.S.1', '3.2.S.1.1']);
  });

  it('two headings in a row are kept', () => {
    const text = '2.7.3 Summary of Clinical Efficacy\n2.7.4 Summary of Clinical Safety\nBody.';
    expect(detectDocumentHeadings(text)).toHaveLength(2);
  });
});

describe('chunkTypeOf — TABLE only for a demonstrably tabular block', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => `Site ${i + 1}\tExamplinib 20 mg\t${20 + i}\t${10 + i} (4${i}.0%)`).join('\n');
  const prose = 'The primary endpoint was met. Responder rates were higher in the active arm than in the placebo arm at every visit.';

  it('tab-separated rows are a table, including a spreadsheet rendering', () => {
    expect(chunkTypeOf(`Table 11-3 Responders\n${rows(6)}`)).toBe('TABLE');
    expect(chunkTypeOf(`## Sheet: Responders (7 rows × 4 columns)\nSite\tArm\tN\tResponders\n${rows(6)}`)).toBe('TABLE');
  });

  it('prose with a caption, or with a stray tab, is text', () => {
    expect(chunkTypeOf(`Table 11-3 Responders\n${prose}\n${prose}`)).toBe('TEXT');
    expect(chunkTypeOf(`${prose}\nArm\tN\n${prose}\n${prose}`)).toBe('TEXT');
  });

  it('a table that is less than half the chunk is text', () => {
    expect(chunkTypeOf(`${rows(2)}\n${prose.repeat(4)}`)).toBe('TEXT');
  });

  it('one row is not a table, and a heading with a tab is not a row', () => {
    expect(chunkTypeOf('Arm\tN\tResponders')).toBe('TEXT');
    expect(chunkTypeOf('2.7.3\tSummary of Clinical Efficacy\n2.7.4\tSummary of Clinical Safety')).toBe('TEXT');
  });
});

describe('sectionsForChunks — the path at each chunk\'s first character', () => {
  const span = (text: string, from: string) => ({ charStart: text.indexOf(from), charEnd: text.length });

  it('builds the path by numbering, and pops back up for a sibling', () => {
    const text = [
      '2.7 Clinical Summary',
      'Overview text.',
      '2.7.3 Summary of Clinical Efficacy',
      'Efficacy text.',
      '2.7.3.1 Background and Overview',
      'Background text.',
      '2.7.4 Summary of Clinical Safety',
      'Safety text.',
    ].join('\n');
    const [efficacy, background, safety] = sectionsForChunks(text, [
      span(text, 'Efficacy text'), span(text, 'Background text'), span(text, 'Safety text'),
    ]);
    expect(efficacy.sectionHierarchy).toEqual(['2.7 Clinical Summary', '2.7.3 Summary of Clinical Efficacy']);
    expect(efficacy.sectionTitle).toBe('2.7.3 Summary of Clinical Efficacy');
    expect(background.sectionHierarchy).toEqual([
      '2.7 Clinical Summary', '2.7.3 Summary of Clinical Efficacy', '2.7.3.1 Background and Overview',
    ]);
    expect(safety.sectionHierarchy).toEqual(['2.7 Clinical Summary', '2.7.4 Summary of Clinical Safety']);
    expect(safety.sectionTitle).toBe('2.7.4 Summary of Clinical Safety');
  });

  it('files a section only under the sections its number names', () => {
    const text = '11.4 Efficacy Results\nEfficacy text.\n12.2.1 Brief Summary of Adverse Events\nSafety text.';
    const [safety] = sectionsForChunks(text, [span(text, 'Safety text')]);
    expect(safety.sectionHierarchy).toEqual(['12.2.1 Brief Summary of Adverse Events']);
  });

  it('a chunk at the heading itself is in that section', () => {
    const text = 'Preamble.\n11.4.1 Efficacy Results\nBody.';
    const [at] = sectionsForChunks(text, [span(text, '11.4.1')]);
    expect(at.sectionTitle).toBe('11.4.1 Efficacy Results');
  });

  it('a chunk before the first heading has no section, and says so with NULL', () => {
    const text = 'Sponsor: Example Pharma\nProtocol EXM-301\n\n1. Introduction\nBody.';
    const [cover] = sectionsForChunks(text, [{ charStart: 0, charEnd: 20 }]);
    expect(cover).toEqual({ chunkType: 'TEXT', sectionTitle: null, sectionHierarchy: null });
  });

  it('a document with no detectable heading leaves every chunk NULL', () => {
    const text = 'Meeting minutes.\nAttendees discussed the timeline.\n1. Patients aged 18 or over were eligible.';
    const chunks = chunkExtractedText(text);
    expect(sectionsForChunks(text, chunks)).toEqual(
      chunks.map(() => ({ chunkType: 'TEXT', sectionTitle: null, sectionHierarchy: null })),
    );
  });

  describe('a statistic in a table stays mapped to its narrative block', () => {
    const rows = Array.from({ length: 8 }, (_, i) => `Site ${i + 1}\tExamplinib 20 mg\t${30 + i}\t${12 + i} (4${i}.1%)`);
    const text = [
      '11 EFFICACY EVALUATION',
      '11.4 Efficacy Results and Tabulations of Individual Patient Data',
      '11.4.1 Primary Efficacy Endpoint',
      'The proportion of responders at Week 24 is presented in Table 11-3.',
      'Table 11-3 Proportion of Responders at Week 24 (Full Analysis Set)',
      'Site\tTreatment\tN\tResponders n (%)',
      ...rows,
      'Overall\tExamplinib 20 mg\t212\t102 (48.2%)',
      'The response rate was higher than placebo in every subgroup examined in this analysis.',
      'Figure 11-1 Responder Rate by Visit',
      'Site 9\tExamplinib 20 mg\t40\t21 (52.5%)',
      'Site 10\tExamplinib 20 mg\t41\t22 (53.6%)',
      '11.4.2 Secondary Efficacy Endpoints',
      'Secondary endpoints are described below.',
    ].join('\n');
    const SECTION = [
      '11 EFFICACY EVALUATION',
      '11.4 Efficacy Results and Tabulations of Individual Patient Data',
      '11.4.1 Primary Efficacy Endpoint',
    ];
    const CAPTION = 'Table 11-3 Proportion of Responders at Week 24 (Full Analysis Set)';

    it('a table chunk is named by its caption, with its section as the path above it', () => {
      const from = text.indexOf('Site 3\t');
      const [table] = sectionsForChunks(text, [{ charStart: from, charEnd: text.indexOf('The response rate') }]);
      expect(table).toEqual({ chunkType: 'TABLE', sectionTitle: CAPTION, sectionHierarchy: [...SECTION, CAPTION] });
    });

    it('narrative after the table stays under the section: where a table ends is not in the text', () => {
      const from = text.indexOf('The response rate');
      const [narrative] = sectionsForChunks(text, [{ charStart: from, charEnd: from + 88 }]);
      expect(narrative).toEqual({ chunkType: 'TEXT', sectionTitle: SECTION[2], sectionHierarchy: SECTION });
    });

    it('a figure caption names nothing, and ends the reach of the table caption before it', () => {
      const from = text.indexOf('Site 9');
      const [afterFigure] = sectionsForChunks(text, [{ charStart: from, charEnd: text.indexOf('11.4.2') }]);
      expect(afterFigure).toEqual({ chunkType: 'TABLE', sectionTitle: SECTION[2], sectionHierarchy: SECTION });
    });

    it('the next numbered section ends the table and pops its sibling', () => {
      const [next] = sectionsForChunks(text, [span(text, 'Secondary endpoints')]);
      expect(next.sectionHierarchy).toEqual([SECTION[0], SECTION[1], '11.4.2 Secondary Efficacy Endpoints']);
    });
  });

  it('is deterministic', () => {
    const text = '2.7.3 Summary of Clinical Efficacy\nBody.\nTable 2.7.3-1 Rates\nA\tB\nC\tD\n';
    const chunks = [{ charStart: 0, charEnd: text.length }, { charStart: 41, charEnd: text.length }];
    expect(sectionsForChunks(text, chunks)).toEqual(sectionsForChunks(text, chunks));
  });
});
