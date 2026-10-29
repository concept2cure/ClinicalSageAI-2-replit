/**
 * Which section of a linked document the editor opens, from the sections it
 * read for that document (DocumentWorkbench `openLinkedSection`). Pure, so
 * the two rules sit side by side and the workbench keeps one read path.
 *
 * - An exact code: exactly one section holds it, or nothing is opened (the
 *   rule and words the workbench has always had).
 * - Within a CTD code (F3: a Project home module row knows its module, not a
 *   section): the document's first section, by order, whose code lies under
 *   it (`ctdCodeWithin`, the shared rule). With none started, the document
 *   opens at its first section and says so; a section is never invented.
 */
import { ctdCodeWithin } from '@shared/regulatory/section-code';

export interface PickableSection { id: string; code: string; order_index: number | null }
export type LinkedSectionPick = { sectionId: string } | { notice: string; openDocument: boolean };

/** `sections` is null when the read failed. */
export function pickExactSection(sections: readonly PickableSection[] | null, code: string): LinkedSectionPick {
  const matches = (sections ?? []).filter((s) => s.code.toLowerCase() === code.toLowerCase());
  if (!sections || matches.length !== 1) {
    return { notice: `The linked document's section ${code} could not be resolved uniquely. Nothing else was opened.`, openDocument: false };
  }
  return { sectionId: matches[0].id };
}

const withinWords = (within: string): string => {
  const m = /^m?([1-5])$/i.exec(within.trim());
  return m ? `Module ${m[1]}` : `section ${within}`;
};

/** The pick a linked target asks for: its exact code wins, then its module; null for neither. */
export function linkedSectionPickFor(
  t: { sectionCode: string | null; sectionWithin?: string },
): ((sections: readonly PickableSection[] | null) => LinkedSectionPick) | null {
  const { sectionCode: code, sectionWithin: within } = t;
  if (code) return (sections) => pickExactSection(sections, code);
  return within ? (sections) => pickSectionWithin(sections, within) : null;
}

export function pickSectionWithin(sections: readonly PickableSection[] | null, within: string): LinkedSectionPick {
  const where = withinWords(within);
  if (!sections) {
    return { notice: `The linked document's sections could not be read, so it was not opened at ${where}. Nothing else was opened.`, openDocument: false };
  }
  const order = (s: PickableSection) => s.order_index ?? Number.POSITIVE_INFINITY;
  const under = sections.filter((s) => ctdCodeWithin(s.code, within)).sort((a, b) => order(a) - order(b));
  if (under.length > 0) return { sectionId: under[0].id };
  return { notice: `No section of ${where} has been started in this document yet. It opened at its first section; start one from the outline.`, openDocument: true };
}
