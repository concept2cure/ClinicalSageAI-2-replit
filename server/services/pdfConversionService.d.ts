/**
 * Type declarations for the optional pdfConversionService module.
 *
 * server/routes/ind-pdf.ts loads this module lazily via dynamic `import()` for
 * DOCX-to-PDF conversion. The runtime implementation is provided out-of-band
 * (LibreOffice-backed); when it is absent the dynamic import rejects and the
 * route returns a graceful "conversion unavailable" response. These
 * declarations type the named exports the route destructures.
 */

export function isPdfConversionAvailable(): Promise<boolean>;
export function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer>;
