# Regional device application packs and readiness

W1/D2; canonical `concept2cure-v2`; local testing only. Contract:
[device project initialization](../../../../design/DEVICE_PROJECT_INITIALIZATION_2026-10-20.md).

## What already exists

- `server/services/c2c/filing-class-packs.ts` projects canonical editor outlines
  into versioned governed packs. It now also resolves the eight exact regional
  device application classes from the existing filing catalog; documentary
  classes retain their separate meaning and unchanged prior provenance.
- `scripts/db/emit-filing-class-packs.ts` is the existing immutable migration
  emitter. It now conditionally widens both governed document type and agency
  CHECKs. The new generated migration is registered in the existing
  `scripts/db/migration-set.mjs` after prior pack and provenance migrations.
- `scaffold-project-documents.ts` is the existing transactional scaffold. The
  real service creates these optional working outlines at zero/draft; no new
  bootstrap or editor is introduced.
- `readinessEvaluator.ts` already marked unmodelled artifacts unassessed. The
  zero-required-section case now uses that same conservative pattern: zero,
  `assessed: false`, and critical `SECTION_REQUIREMENTS_NOT_MODELLED`.
- Existing rule-pack provenance normalization, review attribution and digest
  checks preserve what a pack claims. They are not a prerequisite requiring a
  pack review before authoring or signing content. These preparation packs
  establish neither a complete legal requirement set nor a submission route.

## Results

- [Meaningful RED](red.json): 24 failures: eight missing exact pack specs and
  sixteen empty/approved-optional requirement-assessment failures. The FDA IND
  positive control passed. [Raw output](red.log).
- [Final GREEN](final-green.json): 73 passed across eight files; zero failures
  or pending tests. [Raw output](final-green.log).
- [Nineteen source pins before](final-sources-before.json) and
  [after](final-sources-after.json) match throughout the final run.
- [Strict scoped lint](lint.json): five production/test files, zero errors or
  warnings. [Lint summary](lint-summary.json) separately records the optional
  script audit: nine warnings, zero errors, matching the
  [HEAD script baseline](scripts-lint-baseline.json). Canonical ESLint excludes
  `scripts/**`; those existing warnings were not presented as strict passes.
- [Emitter verification](emit-verification.json): regenerating the same new file
  is unchanged, and no pack version remains unseeded.
- [Seventeen prior pack migration files](prior-pack-migrations.json) retain
  exactly their HEAD bytes. No previous pack version or outline was rewritten.

The pack contract drives real PGlite migrations and the real scaffold. It
compares every new pack node with the existing exact editor source, verifies
unreviewed/low provenance and no transport channel, preserves both old NDA and
new Ninsho review attribution over repeated whole-pack-set replay, and refuses
same-length altered trees. Missing named CHECKs are installed; future strict
supersets and their bound records survive replay; unknown values remain refused.

The readiness contract checks all eight empty outlines and approved optional
headings, retaining a modelled FDA IND positive control. Existing filing-pack,
CHECK replay, section-completion, fallback and unmodelled-artifact contracts
remain green.

`green-initial.json` is an earlier 30-case pass. `green.json` records an
intermediate test-fixture failure (querying a column the review-state view does
not expose); the fixture now resolves the bound version. Both raw receipts are
retained; `final-green.json` supersedes them. [Machine summary](summary.json).

## Reproduce

Use Node 22 from `/workspace/scratch/editor-toolchain/node_modules/.bin`, then:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  tests/schema-contract/c2c-regional-device-packs.contract.test.ts \
  tests/schema-contract/c2c-filing-class-packs.contract.test.ts \
  tests/schema-contract/check-constraint-replay.pglite.test.ts \
  tests/schema-contract/c2c-section-completion.contract.test.ts \
  server/services/regulatory/__tests__/readinessEvaluator.optional-device-outlines.test.ts \
  server/services/regulatory/__tests__/readinessEvaluator.fallback.test.ts \
  server/services/regulatory/__tests__/readinessEvaluator.unmodelled-artifacts.test.ts \
  server/services/regulatory/__tests__/submission-readiness.test.ts
```

No compiler, build, full warning scan, Git mutation, provider call, agency
transmission or human testing was performed by this worker. Root integration
qualifies the final merged sources and supersedes this focused packet if shared
or initialization dependencies subsequently change.
