// Vitest/Vite ESM resolution shim — see server/config/environment.js for
// rationale. Several server/*.js files import the shared schema with an
// explicit '.js' extension (e.g. '../../shared/schema.js'); vite's
// resolver doesn't fall back to .ts when the importer is itself a .js
// file. This re-export bridges to the canonical schema.ts.
//
// NOTE: schema.ts has no default export and is a pure table/enum/type
// aggregator, so `export *` mirrors its full surface. The esbuild server
// bundle and tsc both resolve schema.ts ahead of this .js, so neither the
// production server build nor type-checking routes through this shim.
export * from './schema.ts';
