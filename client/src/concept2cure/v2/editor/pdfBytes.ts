/**
 * What the Project files viewer may frame — decided by the file's bytes.
 *
 * ── The defect this closes (periodic review 2026-09-28, editor family, SEC-A-3)
 * Open used to frame a fetched file when its title ended in `.pdf` or the
 * served Content-Type said pdf, and it framed the blob as served. Both are what
 * the uploader said: the vault stored HTML as text/html under a `.pdf` name and
 * served that type back, so opening the row ran the HTML in the app's origin.
 *
 * So the bytes decide, and the type is not taken from anyone: what is framed
 * begins `%PDF` and is always typed application/pdf, which the browser hands to
 * its PDF viewer and never to the HTML parser. The type is forced for real PDF
 * bytes too — a `%PDF` file served as text/html is also an HTML document.
 *
 * @module client/src/concept2cure/v2/editor/pdfBytes
 */

/** The first four bytes of every PDF: `%PDF`. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

/** The blob the viewer frames, or null when these bytes are not a PDF. */
export function pdfViewerBlob(bytes: Uint8Array): Blob | null {
  const isPdf = PDF_MAGIC.every((b, i) => bytes[i] === b);
  return isPdf ? new Blob([bytes], { type: 'application/pdf' }) : null;
}
