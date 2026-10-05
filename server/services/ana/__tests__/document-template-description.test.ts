/**
 * get_document_template's description tells AnA where each outline came from.
 *
 * Follow-up F5 (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
 * g-template-tool-description-truth-facts.md): the description called every
 * outline a "factual document spine from published guidance", but only two are
 * read from a canonical record — the CSR from the ICH E3 tree and the SmPC from
 * the QRD record. The rest (the PBRER interim E2C(R2) copy, the IB, the RMP, the
 * cover letter, the CTD summaries, the device and CTA lists) are heading lists
 * kept by hand in server/services/market-specs/document-template-library.ts.
 *
 * These pin the description to the library: every outline is named, an outline is
 * called record-derived only when the library's sections match that record, and
 * every other outline is named as kept by hand. When a periodic or RMP outline
 * lands and the library derives from it, add it to TEMPLATE_OUTLINES_FROM_RECORD
 * and give it a proof in RECORD_PROOFS below.
 */
import { describe, it, expect } from 'vitest';
import {
  GET_DOCUMENT_TEMPLATE,
  TEMPLATE_OUTLINES_FROM_RECORD,
} from '../submission-center-tool-defs';
import {
  DOCUMENT_TEMPLATES,
  getDocumentTemplate,
} from '../../market-specs/document-template-library';
import { e3TopLevel } from '../../ind/ctd/index.js';
import { SMPC_QRD_SECTIONS } from '../../labeling/smpc-qrd-catalog';

const description = GET_DOCUMENT_TEMPLATE.description;
const RECORD_MARK = 'Read from a canonical record';
const HAND_MARK = 'Kept by hand';
const INSTRUCTION = "Present a hand-kept outline as the platform's outline, not as the guidance's own text, and name its cited basis.";

/**
 * OpenAI-compatible providers trim a tool description to 1023 characters plus an
 * ellipsis (server/services/ai-gateway/gateway.ts, OPENAI_MAX_TOOL_DESCRIPTION_CHARS
 * = 1024, not exported). gpt-4o is an approved cross-provider fallback, so what AnA
 * must hear has to sit in the head.
 */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;
const head = description.slice(0, OPENAI_MAX_TOOL_DESCRIPTION_CHARS - 1);

/** From `start` to `end`, or to the end of the description when `end` is absent. */
function between(start: string, end?: string): string {
  const i = description.indexOf(start);
  if (i < 0) return '';
  if (end === undefined) return description.slice(i);
  const j = description.indexOf(end);
  return j > i ? description.slice(i, j) : '';
}
const recordClause = between(RECORD_MARK, HAND_MARK);
// The hand-kept list is the last clause, so a trim can only drop trailing ids.
const handClause = between(HAND_MARK);

/** One entry of a ';'-separated clause naming `id`, or '' when it is not there. */
function entryFor(clause: string, id: string): string {
  return clause.split(';').find((e) => new RegExp(`(^|[\\s:])${id}\\b`).test(e)) ?? '';
}

/** How an outline is shown to be read from its record: its sections are the record's. */
const RECORD_PROOFS: Record<string, () => void> = {
  clinical_study_report: () => {
    expect(getDocumentTemplate('clinical_study_report')!.sections.map((s) => `${s.number} ${s.heading}`)).toEqual(
      e3TopLevel().map((s) => `${s.number} ${s.title}`),
    );
  },
  smpc: () => {
    const record = new Map(SMPC_QRD_SECTIONS.map((s) => [s.number, s.title]));
    const sections = getDocumentTemplate('smpc')!.sections;
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) expect(record.get(s.number), `smpc ${s.number}`).toBe(s.heading);
  },
};

describe('get_document_template description — says which outlines are canonical', () => {
  it('does not call every outline a factual spine from published guidance', () => {
    expect(description).not.toMatch(/factual document spines? from published guidance/i);
    expect(description).not.toMatch(/\bfactual\b/i);
  });

  it('names every outline the tool serves, by template id', () => {
    for (const t of DOCUMENT_TEMPLATES) expect(description, t.id).toMatch(new RegExp(`\\b${t.id}\\b`));
  });

  it('calls an outline record-derived only when the library reads it from that record', () => {
    expect(Object.keys(TEMPLATE_OUTLINES_FROM_RECORD).sort()).toEqual(Object.keys(RECORD_PROOFS).sort());
    for (const [id, record] of Object.entries(TEMPLATE_OUTLINES_FROM_RECORD)) {
      RECORD_PROOFS[id]();
      expect(entryFor(recordClause, id), id).toContain(record);
      expect(entryFor(handClause, id), id).toBe('');
    }
  });

  it('names every other outline as kept by hand — PBRER, IB, RMP and the cover letter among them', () => {
    expect(handClause).not.toBe('');
    for (const t of DOCUMENT_TEMPLATES) {
      if (t.id in TEMPLATE_OUTLINES_FROM_RECORD) continue;
      expect(entryFor(handClause, t.id), t.id).not.toBe('');
      expect(entryFor(recordClause, t.id), t.id).toBe('');
    }
    for (const id of ['pbrer', 'investigators_brochure', 'risk_management_plan', 'cover_letter']) {
      expect(entryFor(handClause, id), id).not.toBe('');
    }
  });

  it('says the PBRER list is an interim E2C(R2) copy and the cover-letter headings are not a regulator text', () => {
    expect(entryFor(handClause, 'pbrer')).toMatch(/interim copy of the ICH E2C\(R2\)/);
    expect(entryFor(handClause, 'cover_letter')).toMatch(/not a regulator's text/);
  });

  it("tells AnA to present a hand-kept outline as the platform's, not as the guidance's text", () => {
    expect(description).toContain(INSTRUCTION);
  });

  it('keeps the rule, the input usage and the record list ahead of the OpenAI trim, with the hand-kept list last', () => {
    expect(description.length, 'fits under the 1024-character trim').toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    // Should the library outgrow the cap, the trim must still cut only hand-kept ids.
    expect(head).toContain(INSTRUCTION);
    expect(head).toMatch(/`template_id`/);
    expect(head).toMatch(/`family`/);
    expect(recordClause).not.toBe('');
    expect(head).toContain(recordClause);
    expect(description.indexOf(INSTRUCTION)).toBeLessThan(description.indexOf(RECORD_MARK));
    expect(description.indexOf(RECORD_MARK)).toBeLessThan(description.indexOf(HAND_MARK));
    expect(description.trimEnd().endsWith(handClause.trimEnd())).toBe(true);
  });

  it('keeps the input contract', () => {
    expect(GET_DOCUMENT_TEMPLATE.name).toBe('get_document_template');
    expect(GET_DOCUMENT_TEMPLATE.input_schema.required).toEqual([]);
    expect(description).toMatch(/`template_id`/);
    expect(description).toMatch(/`family`/);
  });
});
