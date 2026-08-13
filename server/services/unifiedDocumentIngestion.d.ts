/**
 * Type declarations for the plain-JavaScript unifiedDocumentIngestion module.
 *
 * The implementation ships as `unifiedDocumentIngestion.js` with no co-located
 * types, so without this file named imports (e.g. `UnifiedDocumentIngestion`
 * in the convergence test, the default export re-exported by
 * services/documents/index.ts) fall back to the generic `*.js` wildcard and
 * fail to type-check.
 *
 * Only the surface consumed by callers is declared here.
 */

export declare class UnifiedDocumentIngestion {
  [key: string]: any;
}

export declare const unifiedDocumentIngestion: UnifiedDocumentIngestion;
export declare const unifiedUpload: any;
