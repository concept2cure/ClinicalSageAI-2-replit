/**
 * Type declarations for the plain-JavaScript unifiedDocumentIngestion module.
 *
 * The implementation ships as `unifiedDocumentIngestion.js` with no co-located
 * types, so without this file the import in server/routes/ind-pdf.ts falls back
 * to the generic `*.js` wildcard (default export only) and the named import of
 * `extractPdfWithPython` fails to type-check.
 *
 * Only the surface consumed by callers is declared here.
 */

export function extractPdfWithPython(
  pdfBuffer: Buffer,
  options?: Record<string, unknown>
): Promise<any>;

export declare class UnifiedDocumentIngestion {
  [key: string]: any;
}

export declare const unifiedDocumentIngestion: UnifiedDocumentIngestion;
export declare const unifiedUpload: any;
