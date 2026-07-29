// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. server/scripts/import_lumen_bio_trials.js imports
// '../data-importer-v2.js' with the .js extension; vite doesn't fall back
// to .ts for a .js importer. Production builds resolve .ts first and never
// load this shim.
export * from './data-importer-v2.ts';
