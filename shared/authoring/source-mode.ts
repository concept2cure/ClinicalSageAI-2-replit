/**
 * Content the section editor opens in source mode by its markup alone.
 *
 * RichSectionEditor (client/src/concept2cure/v2/editor/RichSectionEditor.tsx)
 * opens content holding a figure, svg, video, embed or object in source mode:
 * a textarea showing every character of the stored string, because its schema
 * cannot hold those elements and a save would rewrite them out of the record.
 * It also opens content its fidelity gate calls lossy, which needs the
 * editor's schema and is not decided here.
 *
 * One copy, for the editor and for the lineage's machine attribution
 * (server/services/clinical-regulatory-evidence/machine-attribution.ts). The
 * lineage read such content as HTML and credited AnA with clauses whose
 * markup this reader shows (periodic review 2026-09-28, editor family, the
 * batch-draft accept, round 4, D4). It now reads it as the editor does.
 */
const SOURCE_MODE_ELEMENT = /<(figure|svg|video|embed|object)[\s/>]/i;

/** True when the editor opens `stored` in source mode whatever its fidelity. */
export function opensInSourceMode(stored: string): boolean {
  return SOURCE_MODE_ELEMENT.test(stored);
}
