/**
 * Renders one eCTD leaf as a PDF, REPRODUCIBLY.
 *
 * Reproducibility is not a nicety here, it is what makes two other things true:
 *
 *   - **The sequence lifecycle can tell what changed.** A follow-up sequence
 *     carries only the leaves that differ from what is on file, and it decides
 *     that by comparing the md5 of the rendered file against the md5 recorded
 *     when the prior sequence was filed. If rendering the same content twice
 *     produces different bytes, every leaf differs from itself, `unchanged` is
 *     unreachable, and every follow-up re-files the entire tree as `replace` —
 *     superseding documents at the agency that nobody edited.
 *   - **A signed bundle digest means something.** The Part 11 signature binds a
 *     bundle sha256. If assembling the same package twice yields two digests,
 *     the digest identifies a rendering run rather than the content that was
 *     signed, and no one can re-derive it.
 *
 * PDFKit defeats both by default: it stamps `/CreationDate` and `/ModDate` from
 * the wall clock at one-second granularity, and writes its own version into
 * `/Producer` and `/Creator`. So the output is pinned here on both counts —
 * the timestamps come from the CONTENT (see `contentModifiedAt`), and the
 * producer strings are ours, so that upgrading pdfkit does not re-file an
 * entire application at an agency as a side effect of a dependency bump.
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
