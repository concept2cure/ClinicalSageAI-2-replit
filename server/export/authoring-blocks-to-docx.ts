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
) {
  return runs.map((r) => {
    const props = {
      text: r.text,
      bold: r.bold || forceBold || undefined,
      italics: r.italics,
      underline: r.underline ? {} : undefined,
      strike: r.strike,
      superScript: r.superScript,
      subScript: r.subScript,
    };
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
              children: [new D.Paragraph({ children: runsOf(D, cell.runs, Boolean(cell.header), revisionId, revisionDate, footnoteSink) })],
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
      out.push(tableOf(D, block, revisionId, revisionDate, footnoteSink));
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
        children: runsOf(D, block.runs, false, revisionId, revisionDate, footnoteSink),
      })
    );
  }
  return out;
}
