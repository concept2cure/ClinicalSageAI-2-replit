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
import { MAX_LIST_DEPTH, type ContentBlock, type InlineRun } from './authoring-section-content.js';
import type { ResolvedImage } from './authoring-images.js';
import {
  crossReferenceAnchorId,
  normalizeCrossReferenceDisplay,
  resolveCrossReference,
  type CrossReferenceLookup,
} from '@shared/authoring/cross-references';

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
): string {
  const resolved = fig.src ? images?.get(fig.src) : undefined;
  if (!resolved) {
    return `<p class="img-missing">[Figure not exported: ${escapeHtml(
      fig.alt || fig.src || 'unresolved image reference',
    )}]</p>`;
  }
  const alt = fig.alt ? ` alt="${escapeHtml(fig.alt)}"` : '';
  return (
    `<figure><img src="data:${resolved.mimeType};base64,${resolved.buffer.toString('base64')}"${alt}>` +
    (fig.alt ? `<figcaption>${escapeHtml(fig.alt)}</figcaption>` : '') +
    `</figure>`
  );
}

function tableHtml(
  b: ContentBlock,
  fn?: FootnoteCollector,
  crossRefs?: CrossReferenceLookup | null,
  images?: Map<string, ResolvedImage>,
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
            return `<${tag}${cs}${rs}>${inline(c.runs, fn, crossRefs)}${figs}</${tag}>`;
          })
          .join('')}</tr>`
    )
    .join('');
  const caption = b.caption ? `<caption>${escapeHtml(b.caption)}</caption>` : '';
  return `<table>${caption}${rows}</table>`;
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
  const fn = makeFootnoteCollector();
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
      parts.push(`<li>${inline(b.runs, fn, crossRefs)}`);
      openLi = true;
      continue;
    }
    closeLists();
    if (b.kind === 'table') parts.push(tableHtml(b, fn, crossRefs, images));
    else if (b.kind === 'image') parts.push(figureHtml(b, images));
    else if (b.kind === 'heading') {
      /* Every heading used to render as <h3>, whatever its level: the document's
         entire hierarchy collapsed to one rank in the HTML and PDF paths. Offset
         by one for the same reason the DOCX path does — the section title is the
         h1 above this content. */
      const h = Math.min(Math.max((b.level ?? 1) + 1, 2), 6);
      parts.push(`<h${h}>${inline(b.runs, fn, crossRefs)}</h${h}>`);
    }
    else parts.push(`<p>${inline(b.runs, fn, crossRefs)}</p>`);
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
  figure { margin: 0.8em 0; text-align: center; page-break-inside: avoid; }
  figure img { max-width: 100%; height: auto; }
  figcaption { font-style: italic; font-size: 10pt; padding-top: 4px; }
  .img-missing { color: #6b7280; font-style: italic; }
  /* A resolved cross-reference is a real anchor into the section it names. */
  a.xref { color: #1d4ed8; text-decoration: none; }
  /* An unresolved one is STATED, in place. Not a number, not a blank. */
  .xref-missing { color: #b42318; font-style: italic; }
`;
