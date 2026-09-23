/**
 * Protocol → DOCX input — the assembled protocol mapped onto the ONE DOCX
 * factory (`docx/docxFactory.ts` `generateRegulatory`).
 *
 * WHY THIS EXISTS. `protocol-export` rendered Markdown and a ClinicalTrials.gov
 * draft. No sponsor submits Markdown to an IRB, an ethics committee or an
 * agency; every protocol tool in the category exports Word. The platform
 * already owns a DOCX renderer with a cover page, headings, tables and
 * bullet lists, so this module is a mapper and nothing else — it introduces no
 * second renderer (zero duplication).
 *
 * THE HONESTY CONTRACT, learned the hard way in this repository
 * (`docx/__tests__/template-default-text.test.ts`): a section nobody wrote
 * must not become a regulatory declaration. Every part of the protocol that is
 * absent — no synopsis, no objectives, an empty section — is rendered as a
 * BRACKETED INSTRUCTION such as `[No content recorded for "Statistical
 * Considerations"]`, which reads as a gap to fill, never as ordinary body prose
 * that could pass for an authored statement. Header facts the record does not
 * carry render as an em dash in the header table. Nothing is invented: the
 * metadata carries no sponsor, product or region because the protocol record
 * carries none, and the date is injected by the caller rather than read from a
 * clock, so the same record always maps to the same document.
 *
 * Pure: no DB, no clock, no model.
 *
 * @module server/services/protocol-export/protocol-docx
 */

import type { DocxInput, DocxSection, DocxTable } from '../docx/docxFactory';
import type { AssembledProtocol } from './protocol-export-logic';

/** What the cover page and filename call this document type. */
export const PROTOCOL_DOCX_SUBMISSION_TYPE = 'PROTOCOL';

/** The shape of every "nothing recorded" marker, so a test can assert on it. */
export const GAP_MARKER_PATTERN = /^\[No .* recorded.*\]$/;

export interface ProtocolDocxOptions {
  /** ISO date printed on the cover. Injected, never read from a clock. */
  date: string;
}

const gap = (what: string): string => `[No ${what} recorded]`;
const dash = (v: string | null | undefined): string => (v && v.trim() ? v.trim() : '—');

/** Split authored text into paragraphs on blank lines; drop empties. */
function paragraphsOf(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+\n/g, '\n').trim())
    .filter((p) => p.length > 0);
}

function headerTable(doc: AssembledProtocol): DocxTable {
  const h = doc.header;
  return {
    caption: 'Protocol identification',
    headers: ['Field', 'Value'],
    rows: [
      ['Protocol number', dash(h.protocolNumber)],
      ['Protocol kind', dash(h.kind)],
      ['Design', dash(h.designType)],
      ['Phase', dash(h.phase)],
      ['Version', dash(h.version)],
    ],
  };
}

function summarySection(doc: AssembledProtocol): DocxSection {
  const synopsis = paragraphsOf(doc.synopsis);
  return {
    sectionCode: '1',
    title: 'Protocol Summary',
    paragraphs: synopsis.length ? synopsis : [gap('synopsis')],
    tables: [headerTable(doc)],
  };
}

function objectivesSection(doc: AssembledProtocol): DocxSection {
  if (doc.objectives.length === 0) {
    return { sectionCode: '2', title: 'Objectives and Endpoints', paragraphs: [gap('objectives')] };
  }
  return {
    sectionCode: '2',
    title: 'Objectives and Endpoints',
    paragraphs: [],
    tables: [
      {
        caption: 'Objectives and endpoints',
        headers: ['Type', 'Objective', 'Endpoint', 'Timepoint'],
        rows: doc.objectives.map((o) => [dash(o.objectiveType), dash(o.objective), dash(o.endpoint), dash(o.timepoint)]),
      },
    ],
  };
}

function criteriaSection(code: string, title: string, what: string, items: string[]): DocxSection {
  return items.length
    ? { sectionCode: code, title, paragraphs: [], bulletItems: items.map((c) => c.trim()).filter(Boolean) }
    : { sectionCode: code, title, paragraphs: [gap(what)] };
}

function scheduleSection(doc: AssembledProtocol): DocxSection {
  if (doc.schedule.length === 0) {
    return { sectionCode: '4', title: 'Schedule of Assessments', paragraphs: [gap('schedule of assessments')] };
  }
  return {
    sectionCode: '4',
    title: 'Schedule of Assessments',
    paragraphs: [],
    tables: [
      {
        caption: 'Schedule of assessments',
        headers: ['Visit', 'Timepoint', 'Procedures'],
        rows: doc.schedule.map((v) => [dash(v.visitName), dash(v.timepoint), v.procedures?.length ? v.procedures.join('; ') : '—']),
      },
    ],
  };
}

function bodySection(index: number, s: AssembledProtocol['sections'][number]): DocxSection {
  const paragraphs = paragraphsOf(s.content);
  return {
    sectionCode: String(5 + index),
    title: s.title,
    paragraphs: paragraphs.length ? paragraphs : [gap(`content for "${s.title}"`)],
    pageBreak: true,
  };
}

/**
 * Map an assembled protocol onto the DOCX factory's input. Every section of
 * the record appears, in order; an empty one appears with a bracketed gap
 * marker rather than being dropped, so the document's table of contents is
 * honest about what has and has not been written.
 */
export function protocolToDocxInput(doc: AssembledProtocol, opts: ProtocolDocxOptions): DocxInput {
  return {
    metadata: {
      title: doc.title,
      submissionType: PROTOCOL_DOCX_SUBMISSION_TYPE,
      ...(doc.header.version ? { version: doc.header.version } : {}),
      date: opts.date,
    },
    sections: [
      summarySection(doc),
      objectivesSection(doc),
      criteriaSection('3.1', 'Inclusion Criteria', 'inclusion criteria', doc.eligibility.inclusion),
      criteriaSection('3.2', 'Exclusion Criteria', 'exclusion criteria', doc.eligibility.exclusion),
      scheduleSection(doc),
      ...doc.sections.map((s, i) => bodySection(i, s)),
    ],
  };
}
