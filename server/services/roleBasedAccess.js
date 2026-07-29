// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. server/api/enterprise/{rbac-routes,routes}.js import
// '../../services/roleBasedAccess.js' (default import) with the .js
// extension; vite doesn't fall back to .ts for a .js importer. Production
// builds resolve .ts first and never load this shim.
export * from './roleBasedAccess.ts';
export { default } from './roleBasedAccess.ts';
