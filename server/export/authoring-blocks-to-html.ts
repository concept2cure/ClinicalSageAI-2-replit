/**
 * Export blocks → print HTML, for the PDF branch of the authoring export.
 *
 * Extracted for the same reason as the DOCX renderer beside it: the PDF branch
 * needs a browser engine to run, so while this lived inline in the route there
 * was no way to assert what it emitted, and the PDF quietly lost the same table
 * structure the DOCX did.
 *
 * Both renderers consume the same `ContentBlock[]`, so the two formats cannot
 * disagree about what the filed document contains — a property this module's
 * tests assert rather than assume.
 *
 * Every text node is escaped here and the emitted structure is a fixed
 * whitelist. Stored markup never reaches the renderer raw: an earlier version
 * escaped the whole string and printed editor HTML as literal tags in a filed
 * PDF, and the version before that passed it through.
 */
import {
  MAX_LIST_DEPTH,
  blockCaption,
  type ContentBlock,
  type InlineRun,
} from './authoring-section-content.js';
import type { ResolvedImage } from './authoring-images.js';
import {
  crossReferenceAnchorId,
  normalizeCrossReferenceDisplay,
  resolveCrossReference,
  type CrossReferenceLookup,
} from '@shared/authoring/cross-references';
import {
  CITATION_MISSING_TEXT,
  REFERENCE_LIST_HEADING,
  citationAnchorId,
  citationMarkerText,
  type CitationRegistry,
} from '@shared/authoring/citations';
import {
  captionLineText,
  type CaptionNumbering,
} from '@shared/authoring/captions';

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Collects the footnotes cited while a section renders, and hands back the
 * marker to print at the citation.
 *
 * Lettered (a, b, c … z, aa) rather than numbered: that is the convention
 * regulatory tables use, and it keeps table notes visually distinct from any
 * numbered references in the prose around them.
 *
 * The marker is derived from POSITION at render time, never stored. That is the
 * whole point of holding the note on its own reference — move a row, cut a
 * paragraph, reorder two tables, and the letters come out right without anyone
 * renumbering them by hand. The stored content carries the note's TEXT; the
 * ordering is a rendering decision.
 *
 * Identical note text cited twice gets ONE letter, cited twice — matching what
 * a writer means by "same note", and what Word's own footnote reuse does.
 */
interface FootnoteCollector {
  marker(noteText: string): string;
  notes(): { marker: string; text: string }[];
}
function makeFootnoteCollector(): FootnoteCollector {
  const seen = new Map<string, string>();
  const letter = (i: number): string => {
    let out = '';
    let n = i;
    do {
      out = String.fromCharCode(97 + (n % 26)) + out;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return out;
  };
  return {
    marker(noteText) {
      const hit = seen.get(noteText);
      if (hit) return hit;
      const m = letter(seen.size);
      seen.set(noteText, m);
      return m;
    },
    notes() {
      return [...seen.entries()].map(([text, marker]) => ({ marker, text }));
    },
  };
}

function inline(
  runs: InlineRun[],
  fn?: FootnoteCollector,
  crossRefs?: CrossReferenceLookup | null,
  citations?: CitationRegistry | null,
): string {
  return runs
    .map((r) => {
      let t = escapeHtml(r.text);
      /* A CROSS-REFERENCE prints what its target says NOW, resolved through the
         document's section directory — never the text the editor cached when
         the reference was inserted. That cached text is the stale number the
         whole feature exists to abolish, so it is not a fallback: with no
         directory the reference is UNRESOLVED and says so, exactly as a
         dangling one does. Neither state is silence, and neither is a number. */
      if (r.crossRefTarget) {
        const ref = resolveCrossReference(
          r.crossRefTarget,
          normalizeCrossReferenceDisplay(r.crossRefDisplay),
          crossRefs,
        );
        if (!ref.found) {
          return `<span class="xref-missing">${escapeHtml(ref.text)}</span>`;
        }
        return (
          `<a class="xref" href="#${escapeHtml(crossReferenceAnchorId(r.crossRefTarget))}">` +
          `${escapeHtml(ref.text)}</a>`
        );
      }
      /* A CITATION prints the number the document's registry gives its source,
         in reading order — never the editor's cached name and never a number
         from stored content, because the number IS the position and the stored
         content does not know it. The marker links to the source's entry in the
         reference list, which the caller renders once for the whole document.

         A source that does not resolve is STATED in place. It takes no number
         (numbering it would leave a gap in the reference list) and it never
         falls back to the cached name, which would read as a citation that
         worked. With no registry at all every citation is unresolved, exactly
         as a cross-reference is with no directory — neither state is silence. */
      if (r.citationSourceId) {
        const cited = citations?.cite(r.citationSourceId);
        if (!cited || !cited.found) {
          return `<span class="cite-missing">${escapeHtml(CITATION_MISSING_TEXT)}</span>`;
        }
        return (
          `<a class="cite" href="#${escapeHtml(citationAnchorId(r.citationSourceId))}">` +
          `${escapeHtml(citationMarkerText(cited.number, r.citationLocator))}</a>`
        );
      }
      /* A footnote reference renders as its marker, not as whatever character
         happened to be typed — the letter belongs to the note's position. With
         no collector the reference degrades to plain superscript rather than
         disappearing: a note the author wrote must not vanish from a filed
         document just because this path could not letter it. */
      if (r.footnote && fn) {
        return `<sup class="fn-ref">${escapeHtml(fn.marker(r.footnote))}</sup>`;
      }
      if (r.superScript) t = `<sup>${t}</sup>`;
      if (r.subScript) t = `<sub>${t}</sub>`;
      if (r.bold) t = `<b>${t}</b>`;
      if (r.italics) t = `<i>${t}</i>`;
      /* An unresolved suggestion exports AS REDLINE. Settling it silently at
         export time would fabricate a decision nobody made. */
      if (r.suggestion === 'insertion') return `<ins>${t}</ins>`;
      if (r.suggestion === 'deletion') return `<del>${t}</del>`;
      if (r.underline) t = `<u>${t}</u>`;
      if (r.strike) t = `<s>${t}</s>`;
      return t;
    })
    .join('');
}

/**
 * One numbered caption, as this render resolved it.
 *
 * `line` is the whole caption — "Table 3. Summary of adverse events" — because
 * the number and the words are one label, and `anchor` is the fragment a
 * cross-reference to this object links to. Both are computed by the caller from
 * the DOCUMENT's counter; neither is ever read from stored content.
 */
interface RenderedCaption {
  line: string;
  /** Null when the object has no identity, so nothing can link to it. */
  anchor: string | null;
}

/**
 * The caption element, in the house position for its kind.
 *
 * `authored` is the words as stored. It is what prints when this render was
 * given no numbering — the caption is authored content and must appear whether
 * or not the caller asked for ordinals, exactly as a footnote reference
 * degrades to plain superscript when there is no collector to letter it. What
 * never happens is a number appearing from anywhere but the counter.
 */
function captionHtml(
  tag: 'caption' | 'figcaption',
  authored: string | undefined,
  caption: RenderedCaption | null | undefined,
): string {
  const text = caption ? caption.line : String(authored ?? '');
  if (!text) return '';
  const id = caption?.anchor ? ` id="${escapeHtml(caption.anchor)}"` : '';
  return `<${tag}${id}>${escapeHtml(text)}</${tag}>`;
}

/** One figure as print HTML: the bytes as a data URI when they resolved, a
 *  stated placeholder when they did not. Shared by the standalone image block
 *  and the in-cell figure so the two cannot disagree.
 *
 *  The bytes ride into the print engine as a data URI — no network fetch
 *  happens inside the renderer, so the auth boundary is never in play. Emitted
 *  markup stays whitelisted: the src is built here from resolved bytes, never
 *  copied from stored markup. */
function figureHtml(
  fig: { src?: string; alt?: string },
  images?: Map<string, ResolvedImage>,
  caption?: RenderedCaption | null,
): string {
  const resolved = fig.src ? images?.get(fig.src) : undefined;
  if (!resolved) {
    return `<p class="img-missing">[Figure not exported: ${escapeHtml(
      fig.alt || fig.src || 'unresolved image reference',
    )}]</p>`;
  }
  /* `alt` stays the author's words. It is what a screen reader announces and
     what a text extraction reads; prefixing it with "Figure 3" would put a
     rendering of position into the accessibility text, where it means nothing. */
  const alt = fig.alt ? ` alt="${escapeHtml(fig.alt)}"` : '';
  return (
    `<figure><img src="data:${resolved.mimeType};base64,${resolved.buffer.toString('base64')}"${alt}>` +
    captionHtml('figcaption', fig.alt, caption) +
    `</figure>`
  );
}

function tableHtml(
  b: ContentBlock,
  fn?: FootnoteCollector,
  crossRefs?: CrossReferenceLookup | null,
  citations?: CitationRegistry | null,
  images?: Map<string, ResolvedImage>,
  caption?: RenderedCaption | null,
): string {
  const rows = (b.rows ?? [])
    .map(
      (row) =>
        `<tr>${row
          .map((c) => {
            const tag = c.header ? 'th' : 'td';
            const cs = c.colSpan ? ` colspan="${c.colSpan}"` : '';
            const rs = c.rowSpan ? ` rowspan="${c.rowSpan}"` : '';
            /* A figure inside a cell. Before `TableCell.images` existed the
               <img> left no trace, and a table whose cells held only figures
               was deleted from the export entirely. */
            const figs = (c.images ?? []).map((f) => figureHtml(f, images)).join('');
            return `<${tag}${cs}${rs}>${inline(c.runs, fn, crossRefs, citations)}${figs}</${tag}>`;
          })
          .join('')}</tr>`
    )
    .join('');
  return `<table>${captionHtml('caption', b.caption, caption)}${rows}</table>`;
}

export interface HtmlRenderOptions {
  /**
   * Resolves a cross-reference's target section id to what it is called NOW.
   *
   * Threaded in for the same reason `footnoteSink` is threaded into the DOCX
   * renderer: the answer belongs to the DOCUMENT being exported, not to one
   * section, and the renderer must not invent it. Absent, references render as
   * unresolved rather than falling back to the editor's cached text.
   */
  crossRefs?: CrossReferenceLookup | null;
  /**
   * Numbers the citations, for the whole DOCUMENT.
   *
   * One registry across every section, for the same reason the DOCX footnote
   * sink is one per file: a submission carries ONE reference list, and two
   * sections citing the same report must print the same number. The caller owns
   * it and renders the list once, with `renderReferenceListHtml`.
   *
   * Absent, citations render as unresolved rather than as a guessed number.
   */
  citations?: CitationRegistry | null;
  /**
   * Numbers the captioned tables and figures, for the whole DOCUMENT.
   *
   * One counter across every section, for the same reason the citation registry
   * is one per document: a submission's tables run 1..n from front to back, and
   * a renderer that started its own would open every section with "Table 1".
   * Tables and figures are counted separately — a document has a Table 1 AND a
   * Figure 1.
   *
   * Absent, a caption prints its authored words with no ordinal. The words are
   * the author's and appear either way; the number is only ever the caller's
   * counter, never a guess made here.
   */
  captions?: CaptionNumbering | null;
}

/**
 * Render blocks to print HTML. Consecutive list items of the same kind become
 * one real list, so a numbered procedure keeps its numbering instead of
 * becoming a run of bulleted paragraphs.
 *
 * NESTED LISTS ARE NESTED. This used to hold one flat `openList`, so a
 * sub-step arrived as a sibling of its parent step and the browser numbered it
 * as one — the same renumbering the parser's dropped `depth` caused, arriving
 * a second time by a different route (see `ContentBlock.depth`). A nested list
 * is opened INSIDE the `<li>` it belongs to, which is both what the document
 * means and the only structure that numbers correctly.
 */
export function blocksToHtml(
  blocks: ContentBlock[],
  images?: Map<string, ResolvedImage>,
  opts: HtmlRenderOptions = {},
): string {
  const parts: string[] = [];
  const crossRefs = opts.crossRefs ?? null;
  const citations = opts.citations ?? null;
  const captions = opts.captions ?? null;
  const fn = makeFootnoteCollector();

  /* The block's caption, numbered from the document's counter. `blockCaption`
     is the SAME predicate the directory pass used to build the cross-reference
     targets, so the ordinal a caption prints and the ordinal a reference to it
     prints are the same ordinal by construction. */
  const captionOf = (b: ContentBlock): RenderedCaption | null => {
    if (!captions) return null;
    const object = blockCaption(b);
    if (!object) return null;
    const ordinal = captions.next(object.kind);
    return {
      line: captionLineText(object.kind, ordinal, object.caption),
      anchor: object.id ? crossReferenceAnchorId(String(object.id)) : null,
    };
  };
  /** The open list ancestry, innermost last. */
  const stack: ('ol' | 'ul')[] = [];
  /** True when the innermost list has an `<li>` not yet closed. A nested list
   *  belongs INSIDE that item, so it must not be closed early. */
  let openLi = false;

  /** Close the innermost list — and the parent `<li>` that contained it, which
   *  was deliberately left open to hold it. */
  const popList = () => {
    if (openLi) parts.push('</li>');
    parts.push(`</${stack.pop()}>`);
    openLi = stack.length > 0;
  };
  const closeLists = () => {
    while (stack.length) popList();
  };

  for (const b of blocks) {
    if (b.kind === 'list-item') {
      const want: 'ol' | 'ul' = b.ordered ? 'ol' : 'ul';
      const depth = Math.min(Math.max(Math.floor(b.depth ?? 0), 0), MAX_LIST_DEPTH);

      // Shallower than we are: close back down to it.
      while (stack.length > depth + 1) popList();
      // Same rank, different KIND — a bulleted list following a numbered one
      // at the same rank is two lists, not one.
      if (stack.length === depth + 1 && stack[depth] !== want) popList();
      // Deeper: open lists until we reach it, each inside the item above.
      while (stack.length < depth + 1) {
        // A depth that skips a rank (malformed stored markup) still needs an
        // item to hang the nested list on — `<ol><ol>` is not a list.
        if (stack.length && !openLi) {
          parts.push('<li>');
          openLi = true;
        }
        parts.push(`<${want}>`);
        stack.push(want);
        openLi = false;
      }

      // A sibling at this rank: close the previous item first.
      if (openLi) parts.push('</li>');
      parts.push(`<li>${inline(b.runs, fn, crossRefs, citations)}`);
      openLi = true;
      continue;
    }
    closeLists();
    if (b.kind === 'table') parts.push(tableHtml(b, fn, crossRefs, citations, images, captionOf(b)));
    else if (b.kind === 'image') parts.push(figureHtml(b, images, captionOf(b)));
    else if (b.kind === 'heading') {
      /* Every heading used to render as <h3>, whatever its level: the document's
         entire hierarchy collapsed to one rank in the HTML and PDF paths. Offset
         by one for the same reason the DOCX path does — the section title is the
         h1 above this content. */
      const h = Math.min(Math.max((b.level ?? 1) + 1, 2), 6);
      parts.push(`<h${h}>${inline(b.runs, fn, crossRefs, citations)}</h${h}>`);
    }
    else parts.push(`<p>${inline(b.runs, fn, crossRefs, citations)}</p>`);
  }
  closeLists();
  /* The notes themselves, after the content that cites them.
     HTML has no page, so there is nowhere to put a true page-foot note: they
     are rendered as a labelled block at the end of the section, which is where
     a table's notes sit in a printed submission anyway. The DOCX path does not
     do this — Word has real footnotes and gets them (FootnoteReferenceRun). */
  const notes = fn.notes();
  if (notes.length > 0) {
    parts.push('<section class="footnotes"><h6>Notes</h6><dl>');
    for (const n of notes) {
      parts.push(`<dt>${escapeHtml(n.marker)}</dt><dd>${escapeHtml(n.text)}</dd>`);
    }
    parts.push('</dl></section>');
  }
  return parts.join('');
}

/**
 * The document's reference list.
 *
 * Rendered ONCE, by the caller, after every section — a submission carries one
 * reference list, not one per section, and it is the caller that holds the
 * whole document.
 *
 * What is in it: every source a citation actually resolved to, once each,
 * numbered in first-appearance order. A source nobody cited is not here — the
 * registry only ever learns about a source because a citation asked for its
 * number. A source cited fifteen times appears once, under the number all
 * fifteen markers print.
 *
 * Empty when nothing was cited: a document with no citations gets no heading
 * for a list that would have no entries.
 */
export function renderReferenceListHtml(citations: CitationRegistry | null | undefined): string {
  const entries = citations?.entries() ?? [];
  if (entries.length === 0) return '';
  const items = entries
    .map(
      (e) =>
        `<li id="${escapeHtml(citationAnchorId(e.source.id))}" value="${e.number}">` +
        `${escapeHtml(e.text)}</li>`,
    )
    .join('');
  return (
    `<section class="references"><h2>${escapeHtml(REFERENCE_LIST_HEADING)}</h2>` +
    `<ol class="reference-list">${items}</ol></section>`
  );
}

/** Print styles for the emitted structure. Kept with the markup it styles. */
export const PRINT_STYLES = `
  ul, ol { margin: 0.4em 0 0.4em 1.4em; padding: 0; }
  li { margin: 0.15em 0; }
  /* The DOCX numbering definition is 1. / a. / i. / (1) / (a). A browser
     defaults every ol rank to decimal, so without this the PDF and the DOCX
     rendition of the SAME frozen section state different step identifiers —
     and a reviewer citing "step 2.a" would be citing nothing in one of them.
     Kept in the same order as orderedListNumbering; changing one without the
     other reopens the disagreement. */
  ol { list-style-type: decimal; }
  ol ol { list-style-type: lower-alpha; }
  ol ol ol { list-style-type: lower-roman; }
  ol ol ol ol { list-style-type: decimal; }
  ol ol ol ol ol { list-style-type: lower-alpha; }
  td figure, th figure { margin: 0.3em 0; }
  td figure img, th figure img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; page-break-inside: auto; }
  th, td { border: 1px solid #bfbfbf; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 10.5pt; }
  th { background: #f2f4f5; font-weight: bold; }
  tr { page-break-inside: avoid; }
  caption { caption-side: bottom; font-style: italic; font-size: 10pt; padding-top: 4px; }
  /* A caption is the object's label, so it is a jump target: a resolved
     cross-reference links straight to it. Kept off-italic nothing — the number
     is part of the same sentence and reads as one label. */
  caption[id], figcaption[id] { scroll-margin-top: 1em; }
  figure { margin: 0.8em 0; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 100%; height: auto; }
  figcaption { font-style: italic; font-size: 10pt; padding-top: 4px; }
  .img-missing { color: #6b7280; font-style: italic; }
  /* A resolved cross-reference is a real anchor into the section it names. */
  a.xref { color: #1d4ed8; text-decoration: none; }
  /* An unresolved one is STATED, in place. Not a number, not a blank. */
  .xref-missing { color: #b42318; font-style: italic; }
  /* A resolved citation is a link into the reference list entry it numbers. */
  a.cite { color: #1d4ed8; text-decoration: none; white-space: nowrap; }
  /* An unresolved one is STATED, in place. Never a number that would look right. */
  .cite-missing { color: #b42318; font-style: italic; }
  .references { margin-top: 1.2em; page-break-inside: auto; }
  .reference-list { margin: 0.4em 0 0 1.6em; padding: 0; }
  .reference-list li { margin: 0.25em 0; }
`;
