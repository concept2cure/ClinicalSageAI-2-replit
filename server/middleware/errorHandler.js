// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// the rationale. server/routes/folder-management.js imports
// '../middleware/errorHandler.js' with the .js extension; vite's resolver
// doesn't fall back to .ts when the importer is itself a .js file, so the
// import 404s in the test runner. Production builds compile
// errorHandler.ts -> errorHandler.js and overwrite this shim.
export * from './errorHandler.ts';
export { default } from './errorHandler.ts';
