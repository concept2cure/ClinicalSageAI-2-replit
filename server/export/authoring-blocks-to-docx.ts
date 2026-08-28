/**
 * Export blocks → DOCX elements.
 *
 * This lives beside the parser rather than inside the export route because the
 * route needs a server, a database and a signed document to run, so while this
 * rendering sat inline in `authoring.router.ts` there was no way to assert what
 * it produced. The behaviour it carries is the one both work orders gate on —
 * "the table must be a real table in the resulting .docx" — and a gate that
 * cannot be run against the code it guards is documentation.
 *
 * The `docx` module is passed in rather than imported: the route loads it
 * dynamically (it is ESM-only and the route is hot), and a caller that already
 * holds the namespace should not load a second copy.
 */
import type { ContentBlock, InlineRun } from './authoring-section-content.js';
import type { ResolvedImage } from './authoring-images.js';
import {
  crossReferenceBookmarkId,
  normalizeCrossReferenceDisplay,
  resolveCrossReference,
  type CrossReferenceLookup,
  type CrossReferenceTarget,
} from '@shared/authoring/cross-references';

/** The slice of the `docx` module namespace this renderer needs. */
export type DocxNs = typeof import('docx');

/** Word page content width at 96dpi (Letter, 1" margins) — images larger than
 *  this are scaled down proportionally so a full-resolution chromatogram does
 *  not blow out the page. */
const DOCX_MAX_IMAGE_WIDTH = 620;

/** Fallback box when the header dimensions could not be read: the figure still
 *  ships (a distorted figure beats a silently missing one), at a size that
 *  cannot break the page. */
const DOCX_FALLBACK_SIZE = { width: 480, height: 360 };

function docxImageSize(img: ResolvedImage): { width: number; height: number } {
  if (!img.width || !img.height) return DOCX_FALLBACK_SIZE;
  if (img.width <= DOCX_MAX_IMAGE_WIDTH) return { width: img.width, height: img.height };
  const scale = DOCX_MAX_IMAGE_WIDTH / img.width;
  return {
    width: DOCX_MAX_IMAGE_WIDTH,
    height: Math.max(1, Math.round(img.height * scale)),
  };
}

const DOCX_IMAGE_TYPE: Record<string, 'png' | 'jpg' | 'gif'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
};

/** Numbering definition the ordered lists reference. Declare it on the Document. */
export const ORDERED_LIST_REFERENCE = 'authoring-ordered';

export function orderedListNumbering(D: DocxNs) {
  return {
    config: [
      {
        reference: ORDERED_LIST_REFERENCE,
        levels: [
          { level: 0, format: 'decimal' as const, text: '%1.', alignment: D.AlignmentType.START },
          { level: 1, format: 'lowerLetter' as const, text: '%2.', alignment: D.AlignmentType.START },
        ],
      },
    ],
  };
}

/**
 * Unresolved tracked changes export as REAL Word revisions (w:ins / w:del),
 * not as coloured text.
 *
 * WHAT THIS USED TO DO, and why it mattered. A pending insertion was emitted as
 * a TextRun coloured 067647 and a deletion as one coloured B42318 with a
 * strike. It looked like a redline and was not one. Everything a reviewer does
 * with a redline in Word — Accept, Reject, Next, Accept All, the reviewing pane,
 * filtering by author — is driven by w:ins / w:del elements. Against coloured
 * text the entire Review ribbon is inert.
 *
 * That is the industry's review loop, not an optional nicety: a medical writer
 * sends a draft out, QC and the regulatory reviewer work in Word, and the
 * document comes back with revisions to accept. Exporting colours meant the
 * reviewer had to retype every change by hand, and meant any change they did not
 * notice stayed in the file as green text — a rendering artefact that then went
 * into a submission.
 *
 * Word will only attribute a revision (and enable accept/reject on it) when it
 * carries an author and a date. The editor's suggestion marks have always
 * recorded both; the parser dropped them, which is why this could not have been
 * done here before — see the applyMark note in authoring-section-content.ts.
 *
 * `revisionDate` is threaded in rather than read from the clock so an export is
 * reproducible: the same section must produce the same bytes twice, which
 * matters for a hash-sealed record and for the export tests.
 */
const FALLBACK_AUTHOR = 'Unattributed';

export interface DocxRenderOptions {
  /** ISO timestamp used when a suggestion mark carries no data-at. */
  revisionDate?: string;
  /**
   * Register one footnote and get back the Word footnote id to reference.
   *
   * Word holds footnotes on the DOCUMENT, not on the paragraph that cites them,
   * so the renderer cannot own them: ids must be unique across the whole file
   * and the collected notes have to reach `new Document({ footnotes })`. The
   * caller therefore owns the numbering — the same reason `revisionDate` is
   * threaded in rather than read from the clock — and this is how a run says
   * "here is a note, tell me its number".
   *
   * Omitted (no sink), a footnote reference degrades to superscript text rather
   * than vanishing: a note that cannot be attached is still a note the author
   * wrote, and dropping it silently from a filed document is the worse failure.
   */
  footnoteSink?: (noteText: string) => number;
  /**
   * Resolves a cross-reference's target section id to what that section is
   * called NOW, in the document being exported.
   *
   * Threaded in for the same reason `footnoteSink` and `revisionDate` are: the
   * answer belongs to the DOCUMENT, not to one section's runs, and a renderer
   * that guessed it would be inventing part of a filed record. Absent, a
   * reference renders as unresolved — it never falls back to the text the
   * editor cached, because that cached number is precisely what goes stale.
   */
  crossRefs?: CrossReferenceLookup | null;
}

/**
 * The bookmarks a section heading carries, and that every REF field to it cites.
 *
 * TWO bookmarks, side by side and never overlapping: one over the section CODE
 * and one over its TITLE, with the heading's separator left outside both. That
 * shape is forced and it is also the right one:
 *
 *   - a REF field prints the TEXT ITS BOOKMARK COVERS. A reference that shows
 *     only the number and a reference that shows number-and-title therefore
 *     need different bookmarks, or one of the two would silently rewrite itself
 *     into the other form the first time a reviewer pressed F9 in Word;
 *   - `docx@9.5.1` cannot nest one `Bookmark` inside another — a nested one
 *     serializes a stray `<bookmarkUniqueNumericId>` element and DROPS the
 *     inner children, which was verified against the packed document.xml before
 *     this shape was chosen. Two adjacent bookmarks and a plain separator run
 *     between them express exactly the same thing and do serialize.
 *
 * A `code-title` reference is then two REF fields with a space between, and
 * each one prints exactly what this export resolved.
 */
export function sectionBookmarkIds(sectionId: string): { code: string; title: string } {
  const base = crossReferenceBookmarkId(sectionId);
  return { code: base, title: `Ttl${base}` };
}

/** The bookmarked pieces of a target, in the order a heading prints them.
 *  Shared by the heading writer and the reference renderer so a field can
 *  never cite a bookmark the heading did not write. */
function targetSegments(
  target: { id: string; code?: string | null; title?: string | null },
): { bookmark: string; text: string }[] {
  const ids = sectionBookmarkIds(String(target.id));
  const out: { bookmark: string; text: string }[] = [];
  const code = String(target.code ?? '').trim();
  const title = String(target.title ?? '').trim();
  if (code) out.push({ bookmark: ids.code, text: code });
  if (title) out.push({ bookmark: ids.title, text: title });
  return out;
}

/**
 * The heading paragraph for one section, carrying the bookmarks its
 * cross-references point at.
 *
 * A REF field whose bookmark does not exist renders in Word as "Error!
 * Reference source not found." — so bookmark and field must come from the SAME
 * set of sections. They do: the export resolves references against exactly the
 * sections it writes headings for, so a reference that resolved always has its
 * anchor, and one that did not resolve emits stated text and no field at all.
 */
export function sectionHeadingParagraph(
  D: DocxNs,
  section: { id: string; code?: string | null; title?: string | null },
): InstanceType<DocxNs['Paragraph']> {
  const segments = targetSegments(section);
  const children: unknown[] = [];
  segments.forEach((seg, i) => {
    // The separator sits OUTSIDE both bookmarks, so neither field prints it.
    if (i > 0) children.push(new D.TextRun(' - '));
    children.push(new D.Bookmark({ id: seg.bookmark, children: [new D.TextRun(seg.text)] }));
  });
  return new D.Paragraph({
    heading: D.HeadingLevel.HEADING_1,
    children: children as never,
  });
}

/** Word requires a unique id per revision within the document. */
function makeRevisionIds() {
  let next = 1;
  return () => next++;
}

function runsOf(
  D: DocxNs,
  runs: InlineRun[],
  forceBold = false,
  revisionId: () => number = makeRevisionIds(),
  revisionDate = '1970-01-01T00:00:00Z',
  footnoteSink?: (noteText: string) => number,
  crossRefs?: CrossReferenceLookup | null,
) {
  /* flatMap, not map: a cross-reference showing number AND title is two REF
     fields with a separator between them, because each field prints the text of
     the bookmark it cites. Every other run kind still yields exactly one. */
  return runs.flatMap((r) => {
    const props = {
      text: r.text,
      bold: r.bold || forceBold || undefined,
      italics: r.italics,
      underline: r.underline ? {} : undefined,
      strike: r.strike,
      superScript: r.superScript,
      subScript: r.subScript,
    };
    /* A CROSS-REFERENCE becomes REAL Word REF fields citing the target
       section's heading bookmarks, each carrying the text THIS export resolved
       as its cached result. So the reviewer sees what the platform resolved,
       clicking it jumps to the section (\h makes the field a hyperlink), and
       updating fields in Word re-reads the live bookmark. The one thing it is
       never built from is the number the editor cached — that stale value is
       what this feature exists to remove.

       A reference whose target is not in this export gets no field at all: a
       REF to a bookmark that was never written renders in Word as that program's
       own error string, and a filed document must state the problem in words a
       reviewer can read. */
    if (r.crossRefTarget) {
      const display = normalizeCrossReferenceDisplay(r.crossRefDisplay);
      const ref = resolveCrossReference(r.crossRefTarget, display, crossRefs);
      if (!ref.found) {
        return [new D.TextRun({ text: ref.text, italics: true, color: 'B42318' })];
      }
      const segments = targetSegments(ref.target as CrossReferenceTarget);
      // `code` prints the first segment only — the code, or the title when the
      // section has no code (which is what crossReferenceText resolves to).
      const wanted = display === 'code' ? segments.slice(0, 1) : segments;
      const out: unknown[] = [];
      wanted.forEach((seg, i) => {
        if (i > 0) out.push(new D.TextRun(' '));
        out.push(new D.SimpleField(` REF ${seg.bookmark} \\h `, seg.text));
      });
      return out as never[];
    }
    /* A real Word footnote reference — the auto-numbered superscript a reader
       can click, that Word renumbers when content moves and that carries the
       note to the bottom of the page. Emitted before the tracked-change branch
       because a footnote inside a suggestion is vanishingly rare and Word has
       no way to express a revised footnote reference anyway. */
    if (r.footnote && footnoteSink) {
      return new D.FootnoteReferenceRun(footnoteSink(r.footnote));
    }
    if (r.suggestion === 'insertion' || r.suggestion === 'deletion') {
      const change = {
        id: revisionId(),
        author: r.suggestionAuthor || FALLBACK_AUTHOR,
        date: r.suggestionAt || revisionDate,
      };
      return r.suggestion === 'insertion'
        ? new D.InsertedTextRun({ ...props, ...change })
        : // Word renders the strike itself on a w:del; leaving ours on would
          // double it, and a rejected deletion would come back struck.
          new D.DeletedTextRun({ ...props, strike: undefined, ...change });
    }
    return new D.TextRun(props);
  });
}

/* Content headings sit one level below the section title, which is HEADING_1 —
   so content level 1 is Word's Heading 2, and so on down to Heading 6. The old
   mapping stopped at HEADING_4 and sent everything deeper there too, which is
   the collapse a publisher's template then bakes into the submission's
   navigation pane and table of contents. */
const DOCX_HEADING = [
  'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6',
] as const;
function headingFor(D: DocxNs, level: number | undefined) {
  const idx = Math.min(Math.max((level ?? 1) - 1, 0), DOCX_HEADING.length - 1);
  return D.HeadingLevel[DOCX_HEADING[idx]];
}

/**
 * A real Word table. The subject-versus-predicate comparison in a 510(k) and
 * every Module 3 specification, batch-analysis and stability table ARE the
 * argument being filed; exporting them as tab-separated paragraphs — which is
 * what happened before — files a different document.
 */
/* The sink reaches tables deliberately: a footnote in a table cell is the
   PRIMARY case, not an edge one. Every Module 3 specification, batch-analysis
   and stability table carries lettered notes under it, and so does every
   efficacy summary — that is what footnote support in this product is for. */
function tableOf(
  D: DocxNs,
  block: ContentBlock,
  revisionId: () => number,
  revisionDate: string,
  footnoteSink?: (noteText: string) => number,
  crossRefs?: CrossReferenceLookup | null,
) {
  const border = { style: D.BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const rows = (block.rows ?? []).map(
    (row) =>
      new D.TableRow({
        tableHeader: row.some((c) => c.header) || undefined,
        children: row.map(
          (cell) =>
            new D.TableCell({
              columnSpan: cell.colSpan,
              rowSpan: cell.rowSpan,
              shading: cell.header
                ? { type: D.ShadingType.CLEAR, fill: 'F2F4F5', color: 'auto' }
                : undefined,
              borders: { top: border, bottom: border, left: border, right: border },
              children: [new D.Paragraph({ children: runsOf(D, cell.runs, Boolean(cell.header), revisionId, revisionDate, footnoteSink, crossRefs) })],
            })
        ),
      })
  );
  return new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } });
}

/** Render parsed section blocks to DOCX paragraphs and tables, in order.
 *  `images` maps a block's `src` to resolved bytes; an image block whose src
 *  is not in the map renders as a stated placeholder, never as silence.
 *
 *  Two independent capabilities land on this one signature: figures (the
 *  `images` map) and unresolved tracked changes exported as real w:ins / w:del
 *  revisions (`opts.revisionDate`). They were built in parallel and both are
 *  kept — a filing needs its figures AND a redline a reviewer can accept in
 *  Word. `images` stays third so existing positional callers are unaffected. */
export function blocksToDocx(
  D: DocxNs,
  blocks: ContentBlock[],
  images?: Map<string, ResolvedImage>,
  opts: DocxRenderOptions = {},
): (InstanceType<DocxNs['Paragraph']> | InstanceType<DocxNs['Table']>)[] {
  // ONE counter per document: Word requires revision ids to be unique across
  // the file, so a per-call counter would repeat them and collapse separate
  // revisions into one.
  const revisionId = makeRevisionIds();
  const revisionDate = opts.revisionDate ?? '1970-01-01T00:00:00Z';
  const footnoteSink = opts.footnoteSink;
  const crossRefs = opts.crossRefs ?? null;
  const out: (InstanceType<DocxNs['Paragraph']> | InstanceType<DocxNs['Table']>)[] = [];
  for (const block of blocks) {
    if (block.kind === 'image') {
      const resolved = block.src ? images?.get(block.src) : undefined;
      const type = resolved ? DOCX_IMAGE_TYPE[resolved.mimeType] : undefined;
      if (resolved && type) {
        out.push(
          new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            children: [
              new D.ImageRun({
                type,
                data: resolved.buffer,
                transformation: docxImageSize(resolved),
              }),
            ],
          })
        );
        if (block.alt) {
          out.push(
            new D.Paragraph({
              alignment: D.AlignmentType.CENTER,
              children: [new D.TextRun({ text: block.alt, italics: true, size: 18 })],
            })
          );
        }
      } else {
        /* The section shows a figure this export could not resolve (bytes
           gone, foreign reference, external URL never fetched server-side).
           The filed record must SAY that — a document quietly missing a
           figure the editor displays is a different document. */
        out.push(
          new D.Paragraph({
            children: [
              new D.TextRun({
                text: `[Figure not exported: ${block.alt || block.src || 'unresolved image reference'}]`,
                italics: true,
                color: '8A8F98',
              }),
            ],
          })
        );
      }
      continue;
    }
    if (block.kind === 'table') {
      out.push(tableOf(D, block, revisionId, revisionDate, footnoteSink, crossRefs));
      if (block.caption) {
        out.push(
          new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            children: [new D.TextRun({ text: block.caption, italics: true, size: 18 })],
          })
        );
      }
      /* Word merges adjacent tables that no paragraph separates, so two
         consecutive tables would render as one with no visible boundary. */
      out.push(new D.Paragraph({ text: '' }));
      continue;
    }
    out.push(
      new D.Paragraph({
        ...(block.kind === 'heading' ? { heading: headingFor(D, block.level) } : {}),
        ...(block.kind === 'list-item'
          ? block.ordered
            ? { numbering: { reference: ORDERED_LIST_REFERENCE, level: 0 } }
            : { bullet: { level: 0 } }
          : {}),
        children: runsOf(D, block.runs, false, revisionId, revisionDate, footnoteSink, crossRefs),
      })
    );
  }
  return out;
}
