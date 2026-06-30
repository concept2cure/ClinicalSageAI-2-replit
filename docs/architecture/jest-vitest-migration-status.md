# Jest to Vitest Migration Status

**Date:** 2026-06-30

## Current State

Vitest is the **primary test runner**. The root `vitest.config.ts` is fully
configured with `globals: true`, V8 coverage, and `tests/setup.ts` (which
imports from `vitest` and uses `vi.fn()` / `vi.mock()`).

However, **Jest is still actively used** for client-side tests. The `test`
script in `package.json` runs both runners sequentially:

```
jest --config scripts/jest.config.js && vitest run --config vitest.config.ts
```

## Dependencies

| Package | Location | Version |
|---------|----------|---------|
| `vitest` | devDependencies | 4.1.7 |
| `jest` | devDependencies | ^29.7.0 |
| `babel-jest` | devDependencies | ^30.3.0 |
| `ts-jest` | devDependencies | ^29.2.5 |
| `jest-environment-jsdom` | devDependencies | ^29.7.0 |
| `@types/jest` | devDependencies | ^30.0.0 |
| `@testing-library/jest-dom` | devDependencies | ^6.5.0 |

## Jest Config Files (non-node_modules)

- `scripts/jest.config.js` -- root Jest orchestrator, delegates to `client/`
- `scripts/jest.setup.js` -- Jest setup with `jest.setTimeout()`
- `client/jest.config.js` -- jsdom environment, babel-jest transforms, explicitly
  excludes directories that have been migrated to Vitest
- `server/jest.config.js` -- server-side config (not referenced by test script)

## Pattern Usage (excluding node_modules)

| Pattern | Files | Occurrences |
|---------|-------|-------------|
| `vi.fn()` | 298 | 1,460 |
| `vi.mock()` | 259 | 673 |
| `vi.spyOn()` | 7 | 15 |
| `jest.fn()` | 4 | 24 |
| `jest.mock()` | 3 | 6 |
| `jest.spyOn()` | 1 | 1 |
| `@jest/globals` import | 1 | 1 |

## Residual Jest Files (4 files, 31 total jest.* calls)

1. `tests/integration/api/vault.test.js` -- imports from `@jest/globals`
2. `client/src/setupTests.js` -- Jest setup for client tests
3. `client/src/__tests__/setup.js` -- Jest client setup
4. `client/src/concept2cure/components/intelligentDocs/__tests__/intelligentDocs.test.jsx`

## Recommendation: Migration ~95% Complete

The server and main test suites are fully on Vitest. The remaining Jest
footprint is limited to the **client-side test harness** (jsdom environment)
and a handful of legacy `.jsx`/`.js` test files. To finish the migration:

1. Convert the 4 residual Jest test files to use `vi.*` APIs.
2. Remove `scripts/jest.config.js`, `scripts/jest.setup.js`, `client/jest.config.js`,
   and `server/jest.config.js`.
3. Update `package.json` `test` script to drop the `jest` invocation.
4. Remove `jest`, `babel-jest`, `ts-jest`, `jest-environment-jsdom`, and
   `@types/jest` from `devDependencies`.
5. Keep `@testing-library/jest-dom` -- it is compatible with Vitest.
