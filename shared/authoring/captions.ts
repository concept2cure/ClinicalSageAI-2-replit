/**
 * Table and figure captions — the storage contract, and how one becomes a
 * number.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * A caption already existed as TEXT. A table carries its `<caption>`, a figure
 * carries its alt text, and both render in both export branches. What did not
 * exist is NUMBERING. In a CTD document a table and a figure are numbered
 * objects — "Table 14.2.1", "Figure 3" — and a reviewer navigates by those
 * numbers: the narrative says "as shown in Table 3" and the reviewer turns to
 * the object labelled Table 3. Until now a writer typed that number by hand,
 * which means it is wrong the moment a table is inserted above it, and there is
 * no way to find the ones that went wrong except by reading the document.
 *
 * It is also the missing half of a chain that already exists. Cross-references
 * (./cross-references.ts) can point at SECTIONS. They could not point at
 * "Table 3", because Table 3 was not an object anything could point at.
 *
 * ── The one design rule ─────────────────────────────────────────────────────
 * A caption stores THE OBJECT'S IDENTITY AND ITS TEXT, AND NEVER ITS NUMBER.
 * "Table 3" is a rendering of where a table currently sits in the document, not
 * a name for it. Store the id and the words; derive the ordinal from position at
 * render time. Then inserting a table above renumbers everything below it — and
 * every reference to any of them — with nobody touching stored content. That is
 * the entire value of the feature, and it is the assertion the tests turn on.
 *
 * It is the same principle as the footnote marker derived from position
 * (server/export/authoring-blocks-to-html.ts), as a cross-reference storing the
 * target's id rather than its number (./cross-references.ts), and as a citation
 * storing its source's id rather than its reference-list number
 * (./citations.ts). This is the fourth instance of one shape, deliberately
 * built to look like its three siblings rather than to invent a new idiom.
 *
 * ── The stored form ─────────────────────────────────────────────────────────
 *     <table data-caption-id="<uuid>"><caption>Summary of adverse events</caption>…
 *     <img data-caption-id="<uuid>" src="…" alt="Chromatogram of batch 21-004">
 *
 * The caption's WORDS are authored content and are stored as authored: no
 * renderer can recompute "Summary of adverse events". The NUMBER is never
 * stored anywhere, in any form — not as an attribute, not as a cache, and not
 * inside the caption text. Unlike a cross-reference or a citation there is no
 * cached rendering to hold, because the caption element already carries the
 * words a text-comparing fidelity gate, a plain-text extraction and a search
 * index need to see.
 *
 * `data-caption-id` is the object's identity and exists for one reason: so a
 * cross-reference can point at it. A caption without an id still NUMBERS — the
 * ordinal is positional and needs no identity — it simply cannot be referenced.
 * That is what stored content written before this feature looks like, and it is
 * a correct, complete rendering rather than a degraded one.
 *
 * ── What counts as a numbered object ────────────────────────────────────────
 * A table or figure is a numbered object exactly when it HAS CAPTION TEXT. An
 * uncaptioned table takes no ordinal and never becomes "Table 4" — because
 * "Table 4" would then name a thing that carries no visible label anywhere in
 * the filed document, and a reviewer told to turn to Table 4 would find
 * nothing. Same refusal, and same reason, as an unresolved citation consuming
 * no number rather than leaving a gap in the reference list.
 *
 * ── Two sequences, not one ──────────────────────────────────────────────────
 * Tables and figures are counted SEPARATELY. A document has a Table 1 and a
 * Figure 1, and they are different objects. One shared counter would produce
 * "Table 1, Figure 2, Table 3", which is not how any submission is numbered.
 */

import type { CrossReferenceTarget } from './cross-references';

/** Carries the object's identity. Its presence is what makes a table or figure
 *  referenceable; its absence does not stop it being numbered. */
export const CAPTION_ID_ATTR = 'data-caption-id';

/** The two numbered object kinds a section's content can hold. */
export type CaptionKind = 'table' | 'figure';

/** What each kind is called in a caption and in a reference to it. House style
 *  for every CTD module; not configurable, because a document whose tables are
 *  labelled two different ways is a document a reviewer cannot navigate. */
export const CAPTION_LABEL: Record<CaptionKind, string> = {
  table: 'Table',
  figure: 'Figure',
};

/**
 * What separates the number from the words in the caption POSITION:
 * "Table 3. Summary of adverse events".
 *
 * A reference to the same object prints "Table 3 Summary of adverse events" —
 * `crossReferenceText` joins a target's code and title with a space. The two
 * differ deliberately and for the same reason the section heading's " - "
 * differs from a section reference's " ": a caption is a label on an object and
 * a reference is a phrase inside a sentence, and "see Table 3. and the figure
 * below" is not a sentence.
 */
export const CAPTION_NUMBER_SEPARATOR = '. ';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/** The object's number as a reviewer reads it: "Table 3", "Figure 1". */
export function captionCode(kind: CaptionKind, ordinal: number): string {
  return `${CAPTION_LABEL[kind]} ${ordinal}`;
}

/** The full caption line in the caption position, number and words together. */
export function captionLineText(
  kind: CaptionKind,
  ordinal: number,
  caption: string,
): string {
  const words = clean(caption);
  const code = captionCode(kind, ordinal);
  return words ? `${code}${CAPTION_NUMBER_SEPARATOR}${words}` : code;
}

/**
 * Assigns ordinals to captioned objects as they are met, in reading order.
 *
 * ── Why a counter and not a stored number ───────────────────────────────────
 * The number IS the position. It is computed in one pass over the document in
 * reading order and never read from stored content. Insert a table in the first
 * section and every table after it moves by one, with no section's stored bytes
 * changed and no revision minted for a change nobody made to anyone's words.
 *
 * ── Scope ───────────────────────────────────────────────────────────────────
 * ONE numbering per exported DOCUMENT, not per section — a submission's tables
 * run 1..n across the whole document, and two sections cannot both open with
 * "Table 1". That is why it is threaded into both renderers by the caller, for
 * the same reason `footnoteSink`, `crossRefs` and the citation registry are:
 * the answer belongs to the document, and a renderer that invented it would be
 * inventing part of a filed record.
 *
 * The editor holds ONE section and uses the same counter: it numbers the
 * objects in the sections above this one first, then this section's own, so a
 * table shows the number the filing prints rather than restarting at 1 — the
 * same reason the citation canvas is given the source ids cited above it.
 */
export interface CaptionNumbering {
  /** The ordinal for the next captioned object of this kind. Consumes it. */
  next(kind: CaptionKind): number;
}

export function makeCaptionNumbering(): CaptionNumbering {
  const used: Record<CaptionKind, number> = { table: 0, figure: 0 };
  return {
    next(kind) {
      used[kind] += 1;
      return used[kind];
    },
  };
}

/** A captioned object as any reader of stored content sees it, before it has a
 *  number: its identity (when it has one) and its authored words. */
export interface CaptionedObject {
  /** `data-caption-id`. Absent for content written before captions had one. */
  id?: string | null;
  kind: CaptionKind;
  /** The authored caption. Never carries a number. */
  caption: string;
}

/** One captioned object after numbering. */
export interface NumberedCaption extends CaptionedObject {
  ordinal: number;
  /** "Table 3" — what a reference to this object prints. */
  code: string;
  /** "Table 3. Summary of adverse events" — what the caption position prints. */
  line: string;
}

/**
 * Number a run of captioned objects, in the order they were read.
 *
 * Objects with no caption text must not be in the list at all: see the header —
 * numbering one would name something the document never labels.
 */
export function numberCaptions(
  objects: readonly CaptionedObject[],
  numbering: CaptionNumbering = makeCaptionNumbering(),
): NumberedCaption[] {
  return objects.map((o) => {
    const ordinal = numbering.next(o.kind);
    return {
      ...o,
      ordinal,
      code: captionCode(o.kind, ordinal),
      line: captionLineText(o.kind, ordinal, o.caption),
    };
  });
}

/**
 * Numbered captions as CROSS-REFERENCE TARGETS.
 *
 * This is the whole of the integration with cross-references, and it is
 * deliberately this small. A reference already resolves a target id to a `code`
 * and a `title` and prints one or both; a table is a target whose code is
 * "Table 3" and whose title is its caption. Nothing in the resolver, in either
 * renderer's reference branch, or in the editor's reference node knows or needs
 * to know that some targets are tables — they are merged into the same
 * directory the sections go into and resolved by the same function. There is no
 * second mechanism, and a reference to a deleted table fails exactly the way a
 * reference to a deleted section already does.
 *
 * An object with no id is omitted: it has no identity to point at. It still
 * consumed its ordinal above, so the ones after it are numbered as the document
 * prints them.
 */
export function captionCrossReferenceTargets(
  numbered: readonly NumberedCaption[],
): CrossReferenceTarget[] {
  const out: CrossReferenceTarget[] = [];
  for (const n of numbered) {
    const id = clean(n.id);
    if (!id) continue;
    out.push({ id, code: n.code, title: clean(n.caption) });
  }
  return out;
}
