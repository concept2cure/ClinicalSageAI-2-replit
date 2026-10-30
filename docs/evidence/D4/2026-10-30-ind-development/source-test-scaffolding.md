# Keep existing source and leaf tests focused after recorded-product admission

## What already exists

- `draft-source-service-checkpoint.test.ts`,
  `draft-context-checkpoint.integration.test.ts` and
  `draft-source-cancellation-checkpoint.test.ts` exercise the actual private
  `draft-project-sources.ts` issuer, consumer-identity binding, revalidation and
  cancellation checkpoints through the actual drafting service. Catalogue/
  gateway boundaries are intentionally synthetic; their project executor does
  not contain a product/charter authorization schema.
- `ind-cmc-leaf-drafting.test.ts`, `ind-pharmacology-leaf-drafting.test.ts` and
  `blueprint-grounded-drafting.test.ts` exercise the actual recorded requirements
  and gateway request assembly. Their fixed numeric/project IDs are test labels,
  not claims of recorded product ownership.
- `recorded-product-drafting-service.pglite.test.ts` separately exercises the
  new actual product loader, real ownership/actor/anchor/sharing queries,
  requirements selection, late mutations and streaming. It uses no product
  admission mock and is unchanged by this scaffolding slice.
- `drafting-source-lineage.pglite.integration.test.ts` calls the lineage
  resolver/gate directly, never the drafting service/product loader, so it needs
  no change and was not rerun.

## Bounded fixture correction

The six source/leaf suites now explicitly return an **unassessed**, all-null
product read from a shared test-only fixture. This isolates their established
subject from the independent new product boundary, without adding any production
fallback or weakening admission. The actual source issuer, identity checks,
source/extraction/access rechecks, cancellation operation counts, requirements
resolver and gateway request assertions remain unchanged.

This fixture does not establish tenant/actor/product authority. The real-PGlite
product suite carries that evidence; a source-only test with this fixture must
not be cited as product-admission qualification.

## Verification

Before correction, the six targeted files failed: 44 failed / 64 passed, with
two unhandled fake-scope rejections in held cancellation cases. The red is test
scaffolding reaching the newly required product boundary, not evidence that
production admission should be relaxed (`source-test-scaffolding-red.log`).

After the explicit test-only isolation, the same six files pass all 108 cases
with no unhandled errors (`source-test-scaffolding-green.log`). Scoped ESLint
on the six files and shared fixture exits 0 with zero errors/warnings, and
`git diff --check` passes. No production file or assertion was weakened; no
broad suite, project TypeScript check or provider call was made in this slice.
