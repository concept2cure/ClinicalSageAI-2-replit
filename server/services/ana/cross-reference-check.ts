/**
 * Checks a cross-reference against the section outlines of a tenant's
 * documents. Pure: the caller loads the outlines (c2c_document_sections) under
 * its tenant and passes them in.
 *
 * A reference is a CTD section code in whatever spelling a draft uses
 * ("Section 3.2.P.5.1", "Module 2.7.3", "m2.5", "§2.5.4"). It is found when an
 * outline holds that section or a subsection of it (one rule for that,
 * section-code-match.ts); present only as a parent when an outline holds an
 * ancestor but not the section; otherwise not found. A table or figure number,
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

const LEADING_WORD = /^(?:section|sec\.?|module|mod\.?|§)\s*/i;

/** "Section 3.2.P.5.1" → "3.2.P.5.1"; "Table 4" → null. */
export function sectionCodeOf(reference: string): string | null {
  const token = reference.trim().replace(LEADING_WORD, '').split(/[\s,;()]+/)[0] ?? '';
  return normalizeCtdCode(token.replace(/[.:]+$/, ''));
}

function preferExact(rows: OutlineSection[], code: string): OutlineSection {
  return rows.find((s) => normalizeCtdCode(s.section_key) === code) ?? rows[0];
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
      note: /^(?:table|figure|fig\.?)\b/i.test(reference.trim())
        ? 'No resolver for table or figure numbers; check it in the document.'
        : 'Not a CTD section reference, so it was not checked.',
    };
  }

  const holding = sections.filter((s) => sectionMatches(s.section_key, code));
  const inDocument = holding.filter((s) => s.document_id === documentId);
  if (inDocument.length > 0) {
    return { reference, status: 'found_in_document', section: code, sectionStatus: preferExact(inDocument, code).status };
  }
  if (holding.length > 0) {
    const s = preferExact(holding, code);
    return {
      reference,
      status: 'found_in_project',
      section: code,
      documentId: s.document_id,
      documentTitle: s.title,
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
