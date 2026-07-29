// Vitest/Vite ESM resolution shim. server/middleware/auth.js and
// server/utils/monitoring.js import '../config/environment.js' with the
// .js extension (required by Node ESM at runtime). Vite's resolver
// doesn't rewrite .js -> .ts when the importer is a .js file, so without
// this shim those imports 404 in the test runner. Production builds emit
// environment.js from environment.ts and overwrite this shim — no
// runtime impact.
export * from './environment.ts';
export { default } from './environment.ts';
