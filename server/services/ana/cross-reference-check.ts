/**
 * Checks a cross-reference against the section outlines of a tenant's
 * documents. Pure: the caller loads the outlines (c2c_document_sections) under
 * its tenant and passes them in.
 *
 * A reference is a CTD section code in whatever spelling a draft uses
 * ("Section 3.2.P.5.1", "Module 2.7.3", "m2.5", "§2.5.4"). It is found when an
 * outline holds that section or a subsection of it (one rule for that,
 * section-code-match.ts) with something written under it; outline_only when
 * it is only a template heading (status 'todo'); present only as a parent
 * when an outline holds an ancestor but not the section; otherwise not found. A table or figure number,
 * or anything else that is not a section code, is not assessed: nothing here
 * can resolve it, so it is never reported as passing.
 *
 * @module server/services/ana/cross-reference-check
 */

import { normalizeCtdCode } from '../../../shared/regulatory/section-code.js';
import { sectionMatches } from '../ectd/section-code-match.js';

export interface OutlineSection {
  document_id: string;
  title: string | null;
  section_key: string;
  status: string | null;
}

export type CrossReferenceStatus =
  | 'found_in_document'
  | 'found_in_project'
  | 'outline_only'
  | 'parent_only'
  | 'not_found'
  | 'not_assessed';

export interface CrossReferenceCheck {
  reference: string;
  status: CrossReferenceStatus;
  /** The reference read as a CTD section code. */
  section?: string;
  /** For a reference found in another document of the project. */
  documentId?: string;
  documentTitle?: string | null;
  /** The outline status of the section found ('todo', 'drafted', …). */
  sectionStatus?: string | null;
  /** For parent_only: the deepest section an outline does hold. */
  nearestSection?: string;
  note?: string;
}

/** A table, figure, listing, appendix or annex number: nothing here resolves those. */
const NUMBERED_OBJECT = /^\s*(?:table|tab\.|figure|fig\.?|listing|appendix|annex)\b/i;

/**
 * The most specific CTD section code a reference names: "Section 3.2.P.5.1"
 * → "3.2.P.5.1"; "Module 3, Section 3.2.P.5.6" → "3.2.P.5.6" (not "3"); "Table
 * 4" → null. A bare digit is a module only where the reference says "Module"
 * or writes it "m4".
 */
export function sectionCodeOf(reference: string): string | null {
  if (NUMBERED_OBJECT.test(reference)) return null;
  const saysModule = /\bmodule\b/i.test(reference);
  const codes = reference
    .split(/[\s,;()§]+/)
    .map((token) => token.replace(/[.:]+$/, ''))
    .filter((token) => /[.]/.test(token) || /^m\d/i.test(token) || saysModule)
    .map((token) => normalizeCtdCode(token))
    .filter((code): code is string => code !== null);
  return codes.sort((a, b) => b.split('.').length - a.split('.').length)[0] ?? null;
}

function preferExact(rows: OutlineSection[], code: string): OutlineSection {
  return rows.find((s) => normalizeCtdCode(s.section_key) === code) ?? rows[0];
}

/** A heading nothing has been written under yet: status 'todo' throughout. */
function unwritten(rows: OutlineSection[]): boolean {
  return rows.every((s) => s.status === 'todo');
}

export function checkCrossReference(
  reference: string,
  documentId: string,
  sections: readonly OutlineSection[],
): CrossReferenceCheck {
  const code = sectionCodeOf(reference);
  if (!code) {
    return {
      reference,
      status: 'not_assessed',
      note: NUMBERED_OBJECT.test(reference)
        ? 'No resolver for table, figure or appendix numbers; check it in the document.'
        : 'Not a CTD section reference, so it was not checked.',
    };
  }

  const holding = sections.filter((s) => sectionMatches(s.section_key, code));
  const inDocument = holding.filter((s) => s.document_id === documentId);
  const scope = inDocument.length > 0 ? inDocument : holding;
  if (scope.length > 0) {
    const s = preferExact(scope, code);
    const where =
      inDocument.length > 0
        ? {}
        : { documentId: s.document_id, documentTitle: s.title };
    if (unwritten(scope)) {
      return {
        reference,
        status: 'outline_only',
        section: code,
        ...where,
        sectionStatus: s.status,
        note: `${code} is a heading in the outline with nothing written under it yet.`,
      };
    }
    return {
      reference,
      status: inDocument.length > 0 ? 'found_in_document' : 'found_in_project',
      section: code,
      ...where,
      sectionStatus: s.status,
    };
  }

  const ancestors = sections
    .filter((s) => sectionMatches(code, s.section_key))
    .map((s) => normalizeCtdCode(s.section_key))
    .filter((c): c is string => c !== null)
    .sort((a, b) => b.length - a.length);
  if (ancestors.length > 0) {
    return {
      reference,
      status: 'parent_only',
      section: code,
      nearestSection: ancestors[0],
      note: `Only the parent section ${ancestors[0]} is in an outline; ${code} itself is not.`,
    };
  }
  return { reference, status: 'not_found', section: code };
}
