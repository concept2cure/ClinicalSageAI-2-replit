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
import {
  MAX_LIST_DEPTH,
  blockCaption,
  type ContentBlock,
  type InlineRun,
} from './authoring-section-content.js';
import type { ResolvedImage } from './authoring-images.js';
import {
  crossReferenceBookmarkId,
  normalizeCrossReferenceDisplay,
  resolveCrossReference,
  type CrossReferenceLookup,
  type CrossReferenceTarget,
} from '@shared/authoring/cross-references';
import {
  CITATION_MISSING_TEXT,
  REFERENCE_LIST_HEADING,
  citationBookmarkId,
  citationMarkerText,
  type CitationRegistry,
} from '@shared/authoring/citations';
import {
  CAPTION_NUMBER_SEPARATOR,
  captionCode,
  type CaptionNumbering,
} from '@shared/authoring/captions';

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

/**
 * 1. / a. / i. / (1) / (a) — the standard legal-and-regulatory outline.
 *
 * Only levels 0 and 1 were declared. Every item deeper than that referenced a
 * level Word had no format for, and Word falls back to no number at all — so
 * the third rank of a nested procedure lost its step identifiers entirely. It
 * was invisible in practice because the PARSER never emitted a level above 0:
 * it dropped nesting depth outright and flattened every item to the top rank,
 * which renumbered the document (see `ContentBlock.depth`). Fixing the parser
 * without this would simply move the defect one layer down.
 *
 * `indent` is explicit per level because Word's default hanging indents do not
 * apply to a numbering definition supplied this way, and without them a
 * three-deep procedure renders flush left with only the number to distinguish
 * the ranks.
 */
export function orderedListNumbering(D: DocxNs) {
  const FORMATS = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter'] as const;
  const TEXTS = ['%1.', '%2.', '%3.', '(%4)', '(%5)'];
  return {
    config: [
      {
        reference: ORDERED_LIST_REFERENCE,
        levels: FORMATS.map((format, level) => ({
          level,
          format,
          text: TEXTS[level],
          alignment: D.AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
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
  /**
   * Numbers the citations, for the whole DOCUMENT.
   *
   * One registry across every section, for exactly the reason `footnoteSink` is
   * one per file: a submission carries ONE reference list, and two sections
   * citing the same study report must print the same number. The caller owns it
   * and emits the list once, with `referenceListParagraphs`.
   *
   * Absent, a citation renders as unresolved rather than as a guessed number —
   * the same refusal a cross-reference makes with no directory.
   */
  citations?: CitationRegistry | null;
  /**
   * Numbers the captioned tables and figures, for the whole DOCUMENT.
   *
   * One counter across every section, for exactly the reason `footnoteSink` is
   * one per file: a submission's tables run 1..n from front to back, and a
   * renderer that started its own counter would open every section with
   * "Table 1". Tables and figures are counted separately.
   *
   * Absent, a caption prints its authored words with no ordinal — the words are
   * the author's and are filed either way, while a number only ever comes from
   * the caller's counter.
   */
  captions?: CaptionNumbering | null;
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
 *
 * "Section" is the name it was born with and it now serves EVERY cross-reference
 * target: a captioned table or figure is bookmarked by exactly this pair, over
 * its "Table 3" and over its caption words, because a reference to a table is
 * the same kind of thing as a reference to a section and is resolved by the same
 * function. Target ids are distinct, so the two families cannot collide.
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
  citations?: CitationRegistry | null,
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
    /* A CITATION becomes the number this document's registry gives its source,
       inside a real Word internal hyperlink to that source's entry in the
       reference list. So a reviewer can click a marker and land on the
       reference, and the number itself comes from reading position rather than
       from anything stored — insert a citation in an earlier section and every
       marker after it moves, with no section's stored bytes touched.

       The anchor is only ever emitted for a source that resolved, and the
       reference list writes a bookmark for exactly the sources that resolved,
       so a marker can never link into a bookmark Word does not have.

       An unresolved source is STATED, in the filed document, in words a
       reviewer can read — never a number (which would look right and be
       wrong), and never nothing. */
    if (r.citationSourceId) {
      const cited = citations?.cite(r.citationSourceId);
      if (!cited || !cited.found) {
        return [new D.TextRun({ text: CITATION_MISSING_TEXT, italics: true, color: 'B42318' })];
      }
      return [
        new D.InternalHyperlink({
          anchor: citationBookmarkId(r.citationSourceId),
          children: [new D.TextRun(citationMarkerText(cited.number, r.citationLocator))],
        }),
      ] as never[];
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

/** A block's nesting depth as a Word list level, clamped to what the numbering
 *  definition declares. Both list kinds clamp identically so an ordered and an
 *  unordered list at the same depth line up. */
function listLevel(depth: number | undefined): number {
  return Math.min(Math.max(Math.floor(depth ?? 0), 0), MAX_LIST_DEPTH);
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
  citations?: CitationRegistry | null,
  images?: Map<string, ResolvedImage>,
) {
  const border = { style: D.BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
  const rows = (block.rows ?? []).map(
    (row) =>
      new D.TableRow({
        tableHeader: row.some((c) => c.header) || undefined,
        children: row.map((cell) => {
          const children: InstanceType<DocxNs['Paragraph']>[] = [];
          if (cell.runs.length) {
            children.push(
              new D.Paragraph({
                children: runsOf(
                  D, cell.runs, Boolean(cell.header), revisionId, revisionDate, footnoteSink,
                  crossRefs, citations,
                ),
              })
            );
          }
          /* A figure inside a cell — the subject device beside the predicate,
             a chromatogram in a results column. Same honesty rule as a
             standalone figure: it ships, or the cell SAYS it could not. */
          for (const fig of cell.images ?? []) children.push(...figureParagraphs(D, fig, images));
          /* Word requires at least one paragraph per cell; an empty cell with
             none produces a file Word repairs on open. */
          if (!children.length) children.push(new D.Paragraph({ text: '' }));
          return new D.TableCell({
            columnSpan: cell.colSpan,
            rowSpan: cell.rowSpan,
            shading: cell.header
              ? { type: D.ShadingType.CLEAR, fill: 'F2F4F5', color: 'auto' }
              : undefined,
            borders: { top: border, bottom: border, left: border, right: border },
            children,
          });
        }),
      })
  );
  return new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } });
}

/**
 * One numbered caption, as this render resolved it. Never read from stored
 * content: `ordinal` comes from the document's counter and `id` is the object's
 * identity, which is what a REF field to it cites.
 */
interface RenderedCaption {
  kind: 'table' | 'figure';
  ordinal: number;
  /** The authored words, without a number. */
  words: string;
  /** Null when the object has no identity, so nothing can point at it. */
  id: string | null;
}

/**
 * The caption paragraph a table or a figure carries, or null when there is
 * nothing to print.
 *
 * ── Why it is bookmarked, and in two pieces ─────────────────────────────────
 * A cross-reference to a table becomes a Word REF field, and a REF field prints
 * THE TEXT ITS BOOKMARK COVERS. So the caption needs the same pair of adjacent,
 * non-overlapping bookmarks a section heading carries — one over "Table 3" and
 * one over the caption's words — or a reference showing only the number and a
 * reference showing number-and-caption could not be told apart, and one of them
 * would silently rewrite itself into the other the first time a reviewer
 * pressed F9. The separator sits OUTSIDE both, so neither field prints it. See
 * `sectionHeadingParagraph`, which this deliberately mirrors.
 *
 * ── Why the words print even with no numbering ──────────────────────────────
 * The caption is authored content. A render given no counter still files it,
 * unnumbered and unbookmarked — the same degradation a footnote reference makes
 * when there is no sink to letter it. What never happens is a number from
 * anywhere but the counter.
 */
function captionParagraph(
  D: DocxNs,
  authored: string | undefined,
  caption: RenderedCaption | null | undefined,
): InstanceType<DocxNs['Paragraph']> | null {
  const style = { italics: true, size: 18 } as const;
  if (!caption) {
    const words = String(authored ?? '').trim();
    if (!words) return null;
    return new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      children: [new D.TextRun({ text: words, ...style })],
    });
  }
  const code = captionCode(caption.kind, caption.ordinal);
  const words = String(caption.words ?? '').trim();
  const children: unknown[] = [];
  if (caption.id) {
    const ids = sectionBookmarkIds(caption.id);
    children.push(
      new D.Bookmark({ id: ids.code, children: [new D.TextRun({ text: code, ...style })] }),
    );
    if (words) {
      children.push(new D.TextRun({ text: CAPTION_NUMBER_SEPARATOR, ...style }));
      children.push(
        new D.Bookmark({ id: ids.title, children: [new D.TextRun({ text: words, ...style })] }),
      );
    }
  } else {
    children.push(
      new D.TextRun({
        text: words ? `${code}${CAPTION_NUMBER_SEPARATOR}${words}` : code,
        ...style,
      }),
    );
  }
  return new D.Paragraph({
    alignment: D.AlignmentType.CENTER,
    children: children as never,
  });
}

/** One figure as DOCX paragraphs: the image and its caption when the bytes
 *  resolved, a stated placeholder when they did not. Shared by the standalone
 *  image block and the in-cell figure so the two cannot disagree about what a
 *  missing figure looks like in a filed document. */
function figureParagraphs(
  D: DocxNs,
  fig: { src?: string; alt?: string },
  images?: Map<string, ResolvedImage>,
  caption?: RenderedCaption | null,
): InstanceType<DocxNs['Paragraph']>[] {
  const resolved = fig.src ? images?.get(fig.src) : undefined;
  const type = resolved ? DOCX_IMAGE_TYPE[resolved.mimeType] : undefined;
  if (!resolved || !type) {
    /* The section shows a figure this export could not resolve (bytes gone,
       foreign reference, external URL never fetched server-side). The filed
       record must SAY that — a document quietly missing a figure the editor
       displays is a different document. */
    return [
      new D.Paragraph({
        children: [
          new D.TextRun({
            text: `[Figure not exported: ${fig.alt || fig.src || 'unresolved image reference'}]`,
            italics: true,
            color: '8A8F98',
          }),
        ],
      }),
    ];
  }
  const out = [
    new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      children: [
        new D.ImageRun({ type, data: resolved.buffer, transformation: docxImageSize(resolved) }),
      ],
    }),
  ];
  const captionPara = captionParagraph(D, fig.alt, caption);
  if (captionPara) out.push(captionPara);
  return out;
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
  const citations = opts.citations ?? null;
  const captions = opts.captions ?? null;
  /* The block's caption, numbered from the document's counter. `blockCaption`
     is the SAME predicate the directory pass used to build the cross-reference
     targets, so the ordinal printed on the caption and the ordinal printed by a
     REF field to it are the same ordinal by construction. */
  const captionOf = (b: ContentBlock): RenderedCaption | null => {
    if (!captions) return null;
    const object = blockCaption(b);
    if (!object) return null;
    return {
      kind: object.kind,
      ordinal: captions.next(object.kind),
      words: object.caption,
      id: object.id ? String(object.id) : null,
    };
  };
  const out: (InstanceType<DocxNs['Paragraph']> | InstanceType<DocxNs['Table']>)[] = [];
  for (const block of blocks) {
    if (block.kind === 'image') {
      out.push(...figureParagraphs(D, block, images, captionOf(block)));
      continue;
    }
    if (block.kind === 'table') {
      const caption = captionOf(block);
      out.push(
        tableOf(D, block, revisionId, revisionDate, footnoteSink, crossRefs, citations, images),
      );
      const captionPara = captionParagraph(D, block.caption, caption);
      if (captionPara) out.push(captionPara);
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
            ? { numbering: { reference: ORDERED_LIST_REFERENCE, level: listLevel(block.depth) } }
            : { bullet: { level: listLevel(block.depth) } }
          : {}),
        children: runsOf(
          D, block.runs, false, revisionId, revisionDate, footnoteSink, crossRefs, citations,
        ),
      })
    );
  }
  return out;
}

/**
 * The document's reference list, as Word paragraphs.
 *
 * Emitted ONCE, by the caller, after every section's content — a submission
 * carries one reference list, not one per section, and it is the caller that
 * holds the whole document. Same division of labour as the footnotes, which
 * Word also holds on the document rather than on the paragraph that cites them.
 *
 * What is in it: every source a citation actually resolved to, once each,
 * numbered in first-appearance order. An uncited source is not here — the
 * registry only ever learns of a source because a marker asked for its number.
 * A source cited fifteen times appears once, under the number all fifteen
 * markers print.
 *
 * Each entry carries the bookmark its in-text markers link to. Bookmark and
 * link come from the same registry, so a marker cannot point at an anchor this
 * list did not write.
 *
 * Empty when nothing was cited: no heading for a list with no entries.
 */
export function referenceListParagraphs(
  D: DocxNs,
  citations: CitationRegistry | null | undefined,
): InstanceType<DocxNs['Paragraph']>[] {
  const entries = citations?.entries() ?? [];
  if (entries.length === 0) return [];
  const out = [
    new D.Paragraph({ text: REFERENCE_LIST_HEADING, heading: D.HeadingLevel.HEADING_1 }),
  ];
  for (const entry of entries) {
    out.push(
      new D.Paragraph({
        children: [
          new D.Bookmark({
            id: citationBookmarkId(entry.source.id),
            children: [new D.TextRun(`[${entry.number}]`)],
          }),
          new D.TextRun(`  ${entry.text}`),
        ] as never,
      }),
    );
  }
  return out;
}
