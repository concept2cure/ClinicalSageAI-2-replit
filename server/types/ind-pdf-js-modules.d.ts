/**
 * Ambient type declarations for the untyped JavaScript service modules consumed
 * by server/routes/ind-pdf.ts.
 *
 * These modules ship as plain `.js` (no co-located `.ts`/`.d.ts`), so without
 * these declarations the imports fall back to the generic `*.js` wildcard in
 * server/types/global.d.ts, which only exposes a `default` export. That makes
 * the named imports below fail to type-check even though they resolve at runtime.
 *
 * Consumer: server/routes/ind-pdf.ts
 */

declare module '*unifiedDocumentIngestion.js' {
  export function extractPdfWithPython(
    pdfBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<any>;
  const _default: any;
  export default _default;
}

declare module '*pdfConversionService.js' {
  export function isPdfConversionAvailable(): Promise<boolean>;
  export function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer>;
  const _default: any;
  export default _default;
}
