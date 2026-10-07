# W3 / D4 — report registry equality

Only `tests/db/report-os-registry-seed.dbtest.ts` changes: sort the fresh actual
ID array with the same JavaScript comparator used by the expected array.
Exact array equality continues to reject omissions, duplicates and replacements;
all 12 metadata comparisons and every other byte of the native file are intact.
Production code, seed migration, definitions, SQL query and native CI are unchanged.

## Verification

- Before editing, the actual original native callback failed on all 61 unchanged
  seeded rows returned in reverse presentation order: process exit 1, `RED.txt`.
- The corrected actual callback passes 20 isolated PGlite controls: the complete
  seed, reversed and rotated rows; missing, duplicated and replaced IDs refused;
  each of 12 metadata fields corrupted and refused; migration replay restores
  metadata while preserving the operator's disable. The actual migration applier
  and committed SQL are executed. `GREEN.json` has the complete verdicts.
- Seven existing generator contracts pass, including byte-identical migration,
  unique complete ID population and preservation of operator disables.
- Native isolation guard covers all 150 physical native test files. Scoped ESLint
  has zero errors and zero warnings both before and after. `SCOPE.json` verifies
  the exact one-line replacement and frozen production, policy and fixture blobs.

The historical native run has a 61-versus-61 equality failure, but does not expose
the full actual/expected lists. Collation was a hypothesis; local collation probes
did not demonstrate the historical failure. The controlled reverse-order RED
proves the presentation-order issue in the original assertion, not the native
failure's exact cause. PGlite qualifies isolated seed SQL and assertions only.
Native PostgreSQL/RLS/HTTP rerun and the exact-source remote semantic compiler
remain required independent gates. No full local compiler runs on this 8-GiB host.
Normal commit checks and the unchanged pre-push prefix run before publication;
the compiler stage is explicitly deferred to its existing 24-GiB GitHub job.

## Reproduction

From a checkout with its existing dependencies installed, copy
`REPRODUCER.mjs.txt` to a scratch `.mjs` path. Run `node /scratch/repro.mjs` from
the repository root, or set `C2C_REPO` to that checkout. Add `--red` to execute
the exact base callback via `git show db89074184a2b59e228fb311babf23e0a7c6cbeb`.
`--red` must exit 1; the current callback must exit 0 with 20 controls.
Existing contracts: `npx vitest run --config vitest.config.ts
server/services/report-os/__tests__/report-type-registry-seed.test.ts`.
Isolation: `npm run ci:db-test-isolation`.
