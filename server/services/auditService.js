// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. server/api/enterprise/rbac-routes.js imports
// '../../services/auditService.js' (default import) with the .js
// extension; vite doesn't fall back to .ts for a .js importer. Production
// builds resolve .ts first and never load this shim.
export * from './auditService.ts';
export { default } from './auditService.ts';
