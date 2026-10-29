/**
 * CSR slice 8 (2026-10-29): the cross-references a CSR body makes ("Table
 * 14.3.1.2", "Listing 16.2.7", "Appendix 16.1.1", "Section 11.4.1") and what
 * each one links to: a heading in the body itself, a table in the §14 leaf, a
 * listing leaf, or a supplied appendix document.
 *
 * A reference that names nothing in the assembly is returned unresolved and
 * drawn as plain text; the assembly reports it. It is never linked to a near
 * neighbour. Pure.
 */
export type LinkTarget =
  | { kind: 'internal'; destination: string }
  | { kind: 'external'; fileName: string; destination: string | null };

export interface TextRun { text: string; link?: LinkTarget; reference?: string }

export interface CrossReferenceIndex {
  /** Headings drawn in the body, by E3 number. */
  bodyHeadings: ReadonlySet<string>;
  /** Named destinations in other leaves, by the number a reader cites (14.3.1.2, 16.2.7, 14.3). */
  leafTargets: ReadonlyMap<string, { fileName: string; destination: string | null }>;
}

export interface UnresolvedReference { reference: string; number: string; section?: string }

const REFERENCE = /(?:\b(Tables?|Listings?|Figures?|Appendix|Appendices|Sections?)\s+|§\s?)(\d{1,2}(?:\.\d{1,2}){0,4})(?![\d]|\.\d)/g;

/** The leaf target of a number: itself, or for 16.3.x its parent 16.3 (the CRFs leaf). */
function leafTarget(index: CrossReferenceIndex, number: string) {
  return index.leafTargets.get(number) ?? (number.startsWith('16.3.') ? index.leafTargets.get('16.3') : undefined);
}

export function resolveReference(index: CrossReferenceIndex, number: string): LinkTarget | null {
  const leaf = leafTarget(index, number);
  if (leaf) return { kind: 'external', fileName: leaf.fileName, destination: leaf.destination };
  if (index.bodyHeadings.has(number)) return { kind: 'internal', destination: `H${number}` };
  return null;
}

/** Split text into plain runs and linked reference runs. */
export function splitCrossReferences(text: string, index: CrossReferenceIndex, unresolved: UnresolvedReference[]): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(REFERENCE)) {
    const at = match.index ?? 0;
    const number = match[2];
    const target = resolveReference(index, number);
    if (!target) {
      unresolved.push({ reference: match[0].trim(), number });
      continue;
    }
    if (at > last) runs.push({ text: text.slice(last, at) });
    runs.push({ text: match[0], link: target, reference: number });
    last = at + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}
