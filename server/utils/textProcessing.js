// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. server/services/unifiedDocumentIngestion.js imports
// '../utils/textProcessing.js' with the .js extension; vite doesn't fall
// back to .ts for a .js importer. Production builds resolve .ts first and
// never load this shim.
export * from './textProcessing.ts';
export { default } from './textProcessing.ts';
