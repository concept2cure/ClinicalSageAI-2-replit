# ADR-001: Bilingual TypeScript/JavaScript Architecture

## Status

**Accepted** -- 2026-06-30

## Context

The codebase uses both TypeScript and JavaScript. Current breakdown:

| Area | TypeScript | JavaScript | TS % |
|------|-----------|------------|------|
| server/ | 3,029 | 110 | 96.5% |
| client/src/ | 562 | 34 | 94.3% |

JS files concentrate in specific directories:

- `server/scripts/` (9 JS, 4 TS) -- standalone data import and CLI utilities
- `server/utils/` (17 JS, 29 TS) -- legacy helpers predating TS adoption
- `server/templates/` (3 JS, 0 TS) -- code-generation templates
- `server/config/` (6 JS, 11 TS) -- environment bootstrapping

`tsconfig.json` does not set `allowJs` or `checkJs`, so JS files are
excluded from type-checking. They are still bundled by Vite at build time.

## Decision

TypeScript is the default language for all new code. JavaScript is
acceptable only in these cases:

1. **Standalone scripts** (`server/scripts/`) -- one-off import/migration
   scripts that run outside the application and benefit from zero
   compilation overhead.
2. **Template files** (`server/templates/`) -- code-generation output
   where TS would add unnecessary complexity.
3. **Configuration files** -- `*.mjs` config files required by tooling
   (ESLint, PostCSS, etc.) that do not support `.ts` natively.

All application code (routes, services, middleware, React components)
must be TypeScript.

## Guidelines

- **New files**: Write TypeScript unless the file fits an exception above.
- **Editing JS files**: If the change is non-trivial (> ~20 lines), convert
  the file to TypeScript as part of the change.
- **Type safety for JS**: If a JS file must stay JS, add a JSDoc `@ts-check`
  header and `@param`/`@returns` annotations for exported functions.
- **No `allowJs` in tsconfig**: Keep JS files outside the TS compilation
  pipeline. This avoids implicit any leaking into typed code.
- **Migration priority**: `server/utils/*.js` files should be migrated
  first since they are imported by typed application code. Scripts and
  templates are lowest priority.

## Consequences

- TypeScript remains the enforced standard for application logic.
- Existing JS utility scripts continue to work without forced migration.
- Contributors have a clear decision rule for choosing TS vs JS.
- The `server/utils/` directory will gradually converge to 100% TS.
