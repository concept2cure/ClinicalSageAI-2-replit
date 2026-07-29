// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. server/scripts/import_*.js import '../data-importer.js' with
// the .js extension; vite doesn't fall back to .ts for a .js importer.
// Production builds resolve .ts first and never load this shim.
export * from './data-importer.ts';
