// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// the rationale. server/middleware/auth.js imports '../utils/jwtVerify.js'
// with the .js extension; vite's resolver doesn't fall back to .ts when
// the importer is a .js file. Production builds compile jwtVerify.ts ->
// jwtVerify.js and overwrite this shim.
export * from './jwtVerify.ts';
