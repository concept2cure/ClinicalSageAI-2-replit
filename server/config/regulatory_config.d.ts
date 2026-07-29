/**
 * Type declarations for regulatory_config.js
 *
 * Hand-written to give the TypeScript barrel (config/index.ts) a typed view
 * of the runtime JS config. The JS file exports named constants/functions
 * only (no default export); the barrel re-exports the module namespace.
 */

export declare const ECTD_HEADING_REGEX: RegExp;
export declare const DOCUMENT_TYPE_MAP: Record<string, any>;
export declare const DOCUMENT_CONTENT_CLASSIFIERS: Record<string, any>;
export declare const ECTD_SECTION_MAPPINGS: Record<string, any>;
export declare const DOC_TYPE_CLASSIFICATION_PATTERNS: Record<string, any>;
export declare const REGION_CLASSIFICATION_PATTERNS: Record<string, any>;

export declare function extractEctdSectionFromContent(content: string): string | null;
export declare function classifyDocumentType(content: string, title?: string): string;
export declare function extractRegionTags(content: string, title?: string): string[];
export declare function mapDocumentType(userType: string): string;
