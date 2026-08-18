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

/** The slice of the `docx` module namespace this renderer needs. */
export type DocxNs = typeof import('docx');

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

const REDLINE_INSERT = '067647';
const REDLINE_DELETE = 'B42318';

function runsOf(D: DocxNs, runs: InlineRun[], forceBold = false) {
  return runs.map(
    (r) =>
      new D.TextRun({
        text: r.text,
        bold: r.bold || forceBold || undefined,
        italics: r.italics,
        underline: r.underline ? {} : undefined,
        strike: r.strike,
        color:
          r.suggestion === 'insertion'
            ? REDLINE_INSERT
            : r.suggestion === 'deletion'
              ? REDLINE_DELETE
              : undefined,
      })
  );
}

function headingFor(D: DocxNs, level: number | undefined) {
  return level === 1
    ? D.HeadingLevel.HEADING_2
    : level === 2
      ? D.HeadingLevel.HEADING_3
      : D.HeadingLevel.HEADING_4;
}

/**
 * A real Word table. The subject-versus-predicate comparison in a 510(k) and
 * every Module 3 specification, batch-analysis and stability table ARE the
 * argument being filed; exporting them as tab-separated paragraphs — which is
 * what happened before — files a different document.
 */
function tableOf(D: DocxNs, block: ContentBlock) {
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
              children: [new D.Paragraph({ children: runsOf(D, cell.runs, Boolean(cell.header)) })],
            })
        ),
      })
  );
  return new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } });
}

/** Render parsed section blocks to DOCX paragraphs and tables, in order. */
export function blocksToDocx(D: DocxNs, blocks: ContentBlock[]): (InstanceType<DocxNs['Paragraph']> | InstanceType<DocxNs['Table']>)[] {
  const out: (InstanceType<DocxNs['Paragraph']> | InstanceType<DocxNs['Table']>)[] = [];
  for (const block of blocks) {
    if (block.kind === 'table') {
      out.push(tableOf(D, block));
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
        children: runsOf(D, block.runs),
      })
    );
  }
  return out;
}
