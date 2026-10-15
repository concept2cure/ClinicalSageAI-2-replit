/**
 * Renders one eCTD leaf as a PDF, REPRODUCIBLY.
 *
 * Reproducibility is what lets the sequence lifecycle tell what changed. A
 * follow-up sequence carries only the leaves that differ from what is on file,
 * and it decides that by comparing the md5 of the rendered file against the
 * digest recorded for the same stage when the prior sequence was filed (the
 * packager's `sourceMd5` — see below). If rendering the same content twice
 * produced different bytes, every leaf would differ from itself, `unchanged`
 * would be unreachable, and every follow-up would re-file the entire tree as
 * `replace`, superseding documents at the agency that nobody edited.
 *
 * What this does NOT give you, stated because an earlier version of this
 * comment claimed it:
 *
 *   - **The shipped bytes.** Where Ghostscript is installed (the production
 *     image), the packager converts every leaf to PDF/A after this runs, and
 *     Ghostscript stamps dates and a random document ID of its own. So the
 *     lifecycle compares against the digest of what was HANDED to the packager,
 *     which it records as `sourceMd5` whenever it changed the bytes; comparing
 *     against the shipped `md5` compared two stages of one document and
 *     re-filed every unchanged leaf in production.
 *   - **A reproducible bundle digest.** The ZIP writer stamps every entry with
 *     the current time, so assembling the same content twice yields two bundle
 *     sha256s. The Part 11 signature binds the exact bytes that were sent, which
 *     is what it must bind; it is not a content identifier.
 *
 * PDFKit would defeat even the leaf half by default: it stamps `/CreationDate`
 * and `/ModDate` from the wall clock at one-second granularity, and writes its
 * own version into `/Producer` and `/Creator`. So the output is pinned here on
 * both counts — the timestamps come from the CONTENT (see `contentModifiedAt`),
 * and the producer strings are ours, so that upgrading pdfkit does not re-file
 * an entire application at an agency as a side effect of a dependency bump.
 *
 * @module server/services/ectd/leaf-pdf
 */
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { renderMarkdownToPDF } from '../documentExportService';

/** Pinned so the bytes do not move when pdfkit does. */
const LEAF_PRODUCER = 'Concept2Cure eCTD leaf renderer';

export interface LeafPdfInput {
  /** The leaf's heading line — the artifact title and its section. */
  title: string;
  /** The leaf body, in the markdown the canonical renderer accepts. */
  markdown: string;
  /**
   * When the content rendered here last changed — the newest `updatedAt` among
   * the artifacts in this leaf, or the section's own for an empty-section
   * placeholder.
   *
   * It is deliberately NOT `new Date()`. A leaf's PDF timestamps describe the
   * document, not the moment someone pressed assemble; deriving them from the
   * content is what makes two assemblies of unchanged content byte-identical,
   * and it is also the more truthful of the two answers.
   */
  contentModifiedAt: Date;
}

/**
 * Render a leaf. Byte-for-byte a pure function of its input: the same
 * `LeafPdfInput` always yields the same buffer, on any machine, at any time.
 */
export async function buildLeafPdf(input: LeafPdfInput): Promise<Buffer> {
  const stamp = new Date(input.contentModifiedAt);
  if (Number.isNaN(stamp.getTime())) {
    // Named here rather than left to pdfkit, which throws a bare "Invalid time
    // value" that reaches an operator as an unexplained assembly failure. Every
    // row this is derived from has a NOT NULL timestamp, so an unresolvable one
    // means a caller passed a partial row — worth saying so.
    throw new TypeError(
      `Cannot render leaf ${JSON.stringify(input.title)}: contentModifiedAt is not a date ` +
        `(${JSON.stringify(input.contentModifiedAt)}). A leaf is stamped from the content it ` +
        `renders, so the artifact or section row it came from must carry its timestamps.`,
    );
  }
  const doc: any = new (PDFDocument as any)({
    size: 'A4',
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    bufferPages: true,
    info: {
      Title: input.title,
      Producer: LEAF_PRODUCER,
      Creator: LEAF_PRODUCER,
      CreationDate: stamp,
      ModDate: stamp,
    },
  });

  const chunks: Buffer[] = [];
  const bufferStream = new PassThrough();
  bufferStream.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.pipe(bufferStream);

  doc.fontSize(14).font('Helvetica-Bold').text(input.title);
  doc.moveDown();
  doc.fontSize(11).font('Helvetica');
  renderMarkdownToPDF(doc, input.markdown, 11);

  doc.end();

  return new Promise<Buffer>((resolve) => {
    bufferStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
