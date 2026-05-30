/**
 * CSR Intelligence Library — backward-compatible re-export.
 *
 * The real implementation now lives in `csr-intelligence-library.ts` (typed,
 * deterministic extraction + ICH E3 structural validation). This file is kept
 * so the historical import path `./CSRIntelligenceLibrary` continues to resolve.
 */

export {
  csrIntelligenceLibrary,
  csrIntelligenceLibrary as default,
  extractCsrEntities,
  validateCsrStructure,
} from './csr-intelligence-library';
