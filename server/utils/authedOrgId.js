// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. Several server/*.js files import '../utils/authedOrgId.js'
// with the .js extension; vite's resolver doesn't fall back to .ts when
// the importer is a .js file. Production builds (esbuild server bundle)
// resolve .ts first and never load this shim.
export * from './authedOrgId.ts';
