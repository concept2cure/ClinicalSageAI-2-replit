/**
 * Protocol → DOCX mapping.
 *
 * The properties that matter are the honest ones: a part of the protocol that
 * was never written renders as a bracketed gap marker and never as prose that
 * could pass for an authored declaration; every recorded section appears, in
 * order, so the table of contents cannot hide what is unwritten; nothing is
 * invented (no sponsor, product or region the record does not carry; no clock);
 * and the same record maps to the same document every time. The last case
 * proves the mapped input is one the real factory renders.
 */
import { describe, expect, it } from 'vitest';

import { generateRegulatory } from '../../docx/docxFactory';
import type { AssembledProtocol } from '../protocol-export-logic';
import { GAP_MARKER_PATTERN, PROTOCOL_DOCX_SUBMISSION_TYPE, protocolToDocxInput } from '../protocol-docx';

const DATE = '2026-09-23';

function full(): AssembledProtocol {
  return {
    title: 'A Phase 3 Study of ACM-101 in Rheumatoid Arthritis',
    header: { protocolNumber: 'ACM-101-301', kind: 'clinical', designType: 'randomized', phase: '3', version: '1.2' },
    synopsis: 'First paragraph of the synopsis.\n\nSecond paragraph.',
    objectives: [
      { objectiveType: 'primary', objective: 'Demonstrate superiority', endpoint: 'ACR20 at week 24', timepoint: 'week 24' },
      { objectiveType: 'secondary', objective: 'Characterise safety', endpoint: null, timepoint: null },
    ],
    eligibility: { inclusion: ['Adults 18 to 75', 'Active RA per ACR/EULAR 2010'], exclusion: ['Active infection'] },
    schedule: [
      { visitName: 'Screening', timepoint: 'Day -28 to -1', procedures: ['Consent', 'Labs'] },
      { visitName: 'Baseline', timepoint: 'Day 1', procedures: null },
    ],
    sections: [
      { sectionKey: 'background', title: 'Background & Rationale', content: 'Why this study.\n\nWhat is known.' },
      { sectionKey: 'statistics', title: 'Statistical Considerations', content: null },
      { sectionKey: 'ethics', title: 'Ethics, Consent & Regulatory', content: '   ' },
    ],
  };
}

function empty(): AssembledProtocol {
  return {
    title: 'Untitled protocol',
    header: { protocolNumber: null, kind: null, designType: null, phase: null, version: null },
    synopsis: null,
    objectives: [],
    eligibility: { inclusion: [], exclusion: [] },
    schedule: [],
    sections: [],
  };
}

const allParagraphs = (sections: { paragraphs: string[] }[]) => sections.flatMap((s) => s.paragraphs);

describe('protocolToDocxInput — structure', () => {
  it('maps the header onto the cover metadata without inventing sponsor, product or region', () => {
    const out = protocolToDocxInput(full(), { date: DATE });
    expect(out.metadata.title).toBe('A Phase 3 Study of ACM-101 in Rheumatoid Arthritis');
    expect(out.metadata.submissionType).toBe(PROTOCOL_DOCX_SUBMISSION_TYPE);
    expect(out.metadata.version).toBe('1.2');
    expect(out.metadata.date).toBe(DATE);
    expect(out.metadata).not.toHaveProperty('sponsor');
    expect(out.metadata).not.toHaveProperty('product');
    expect(out.metadata).not.toHaveProperty('region');
  });

  it('renders every recorded section, in order, after the five fixed front sections', () => {
    const out = protocolToDocxInput(full(), { date: DATE });
    expect(out.sections.map((s) => s.title)).toEqual([
      'Protocol Summary',
      'Objectives and Endpoints',
      'Inclusion Criteria',
      'Exclusion Criteria',
      'Schedule of Assessments',
      'Background & Rationale',
      'Statistical Considerations',
      'Ethics, Consent & Regulatory',
    ]);
    expect(out.sections.slice(5).every((s) => s.pageBreak === true)).toBe(true);
  });

  it('splits authored text into paragraphs on blank lines and drops empties', () => {
    const out = protocolToDocxInput(full(), { date: DATE });
    expect(out.sections[0].paragraphs).toEqual(['First paragraph of the synopsis.', 'Second paragraph.']);
    expect(out.sections[5].paragraphs).toEqual(['Why this study.', 'What is known.']);
  });

  it('tabulates objectives and the schedule with one row per record and a dash for an absent cell', () => {
    const out = protocolToDocxInput(full(), { date: DATE });
    const objectives = out.sections[1].tables?.[0];
    expect(objectives?.rows).toHaveLength(2);
    expect(objectives?.rows[1]).toEqual(['secondary', 'Characterise safety', '—', '—']);
    const schedule = out.sections[4].tables?.[0];
    expect(schedule?.rows).toEqual([
      ['Screening', 'Day -28 to -1', 'Consent; Labs'],
      ['Baseline', 'Day 1', '—'],
    ]);
  });

  it('lists eligibility criteria as bullets', () => {
    const out = protocolToDocxInput(full(), { date: DATE });
    expect(out.sections[2].bulletItems).toEqual(['Adults 18 to 75', 'Active RA per ACR/EULAR 2010']);
    expect(out.sections[3].bulletItems).toEqual(['Active infection']);
  });
});

describe('protocolToDocxInput — a section nobody wrote is a gap, never a declaration', () => {
  it('renders an empty or whitespace-only section as a bracketed gap marker naming the section', () => {
    const out = protocolToDocxInput(full(), { date: DATE });
    expect(out.sections[6].paragraphs).toEqual(['[No content for "Statistical Considerations" recorded]']);
    expect(out.sections[7].paragraphs).toEqual(['[No content for "Ethics, Consent & Regulatory" recorded]']);
  });

  it('on an empty record, every front section carries a gap marker and the header table carries dashes', () => {
    const out = protocolToDocxInput(empty(), { date: DATE });
    for (const s of out.sections) {
      expect(s.paragraphs, s.title).toHaveLength(1);
      expect(s.paragraphs[0], s.title).toMatch(GAP_MARKER_PATTERN);
    }
    expect(out.sections[0].tables?.[0].rows.every((r) => r[1] === '—')).toBe(true);
    expect(out.metadata).not.toHaveProperty('version');
  });

  it('never emits an unbracketed sentence for something absent', () => {
    // Any paragraph that is not authored text must be a gap marker. On the
    // empty record there is no authored text at all, so every paragraph must
    // match the marker — a plain "Not applicable" or "None." would fail here.
    const out = protocolToDocxInput(empty(), { date: DATE });
    const prose = allParagraphs(out.sections).filter((p) => !GAP_MARKER_PATTERN.test(p));
    expect(prose).toEqual([]);
  });

  it('does not drop a section because it is empty', () => {
    const doc = full();
    const out = protocolToDocxInput(doc, { date: DATE });
    expect(out.sections.length).toBe(5 + doc.sections.length);
  });
});

describe('protocolToDocxInput — determinism and rendering', () => {
  it('maps the same record to the same input every time', () => {
    const a = protocolToDocxInput(full(), { date: DATE });
    const b = protocolToDocxInput(full(), { date: DATE });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is an input the real DOCX factory renders to a Word file', async () => {
    const out = await generateRegulatory(protocolToDocxInput(full(), { date: DATE }));
    expect(Buffer.isBuffer(out.buffer)).toBe(true);
    // A .docx is a zip: the local-file-header signature is "PK\x03\x04".
    expect(out.buffer.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
    expect(out.filename.endsWith('.docx')).toBe(true);
    expect(out.filename).toContain(PROTOCOL_DOCX_SUBMISSION_TYPE);
  });
});
