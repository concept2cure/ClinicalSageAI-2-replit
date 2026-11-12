# S1 sweep fix: a DMF project's client type is its stated product class, not "Dmf"

Package S1 (the project and its filing identity). Files changed:
`shared/constants/domain/product-types.ts` and `shared/constants/domain/__tests__/product-types.test.ts`.
Nothing new: this completes `shared/constants/domain/product-types.ts` (the workstream it already derives).

## The defect (verified)

A DMF project's client type in the project list was the raw string `Dmf`:

- `WORKSTREAM_FILING_TYPES` (`product-types.ts`, MDX / Biotech / Pharma) did not list `dmf`.
- `workstreamSqlCase` therefore sent a DMF row to its `ELSE initcap(replace(program_type, '_', ' '))`, so the list
  projected `ws = 'Dmf'`.
- `workstreamForFilingType('dmf', …)` returned `null`.

What the user saw:

- The client-type filter (`ProjectPortfolioFilters.tsx:60`, `CLIENT_TYPES = ['MDX', 'Biotech', 'Pharma']`) matched no
  DMF row, under any option.
- The server's own `$8` filter in `PROJECT_CARD_LIST_SQL` compares against the same CASE, so it matched no DMF row
  either.
- Project home's About (`ProjectHome.tsx:1913`, `2292`) read "Dmf", or "not recorded" when the page was opened by its
  address.

Live confirmation on the running dev server (read-only, `live.log`): `GET /api/c2c/projects` returned 81 rows. The `ws`
counts were `Biotech 62, Pharma 15, MDX 2, Dmf 2`. Both DMF rows are `product_type = 'biologic'`.

## What already exists

- `shared/constants/domain/product-types.ts`:
  - `WORKSTREAM_FILING_TYPES` buckets the applications whose filing fixes the lane.
  - `WORKSTREAM_BY_PRODUCT_CLASS` (`biologic → Biotech`, `drug → Pharma`, added 2026-10-18) buckets the filing
    document classes, which cover drugs and biologics alike, by their stated product class.
  - `workstreamForFilingType` (the client and service function) and `workstreamSqlCase` (its SQL twin) apply both.
    The class branch is used only when a product-type column is passed.
- `shared/regulatory/filing-document-classes.ts`: `filingDocumentClassOf` and `filingDocumentClassTypes`, the classes
  that bucket by product class. `dmf` is not one of them. Its header names DMF among the application types.
- `server/routes/c2c/project-intake.ts`:
  - `VALID_PROGRAM_TYPES` accepts `dmf`.
  - `productTypeForIntake` refuses a DMF create that states no class, and accepts only `drug` or `biologic`. Per its
    comment: "an IND, a CTA, an MAA, a J-NDA or a DMF, each of which covers drugs and biologics alike — the class is
    the person's to state (P-21)". Every DMF row therefore carries a stated medicinal class.
- `server/services/c2c/project-portfolio.ts` projects `ws` and filters on it, using
  `workstreamSqlCase('p.program_type', 'p.product_type')`. `server/services/report-os/device-portfolio.ts` uses the
  same CASE for its MDX filter.
- Client consumers of the function:
  - `client/src/concept2cure/v2/surfaces/Projects.tsx:1034`, the wizard's review step;
  - `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:1913`, About;
  - `client/src/concept2cure/mdx/hooks/useMdxPrograms.ts:64`.
- Server consumers of the function:
  - `server/services/mdx-health.service.ts:252`;
  - `server/services/regulatory/market-support.ts:689`, which calls it with no class. For `dmf` that is still `null`,
    so the result is not MDX, as before.
- Existing tests:
  - `shared/constants/domain/__tests__/product-types.test.ts`, "workstream bucketing" (string checks of the generated
    SQL);
  - `server/services/c2c/__tests__/project-portfolio-vocabulary.test.ts`, which shows the PGlite pattern this test
    reuses.

Searches run:

- `rg` over `shared`, `server/routes/c2c`, `server/services/c2c` and `client/src/concept2cure` for `'dmf'`,
  `workstreamForFilingType`, `workstreamSqlCase`, `WORKSTREAM_FILING_TYPES` and `VALID_PROGRAM_TYPES`;
- `git log --all --diff-filter=D -- '*workstream*' '*Workstream*' '*product-type*'`, which found nothing deleted.

## What changed

`product-types.ts`: `APPLICATIONS_BUCKETED_BY_PRODUCT_CLASS = ['dmf']`, applied in both places the filing document
classes already bucket by product class:

- in `workstreamForFilingType`: `filingDocumentClassOf(key) || APPLICATIONS_BUCKETED_BY_PRODUCT_CLASS.includes(key)`;
- in `workstreamSqlCase`'s class branch, where the `IN (…)` list is now
  `[...filingDocumentClassTypes(), ...APPLICATIONS_BUCKETED_BY_PRODUCT_CLASS]`.

DMF with `drug` buckets as Pharma and with `biologic` as Biotech. With no class stated it still returns `null`, so the
code never guesses (P-21). Nothing else moves: IND, CTA, MAA and J-NDA keep their fixed buckets, and the ELSE echo stays
for a type that is genuinely unknown.

`product-types.test.ts`, two tests in "workstream bucketing":

1. `workstreamForFilingType('dmf','drug') === 'Pharma'`, `('dmf','biologic') === 'Biotech'` and
   `('DMF','Biologic') === 'Biotech'`, while `('dmf')` with no class stays `null`.
2. A PGlite run of the generated `workstreamSqlCase('p.program_type','p.product_type')` over every pair the create
   endpoint can record:
   - each `VALID_PROGRAM_TYPES` value, as written and upper-cased (the store holds mixed casing);
   - each product class `productTypeForIntake` accepts for that type.

   Every row must be MDX, Biotech or Pharma, never an initcap echo, and must equal `workstreamForFilingType` for the
   same pair. A guard asserts that the DMF pairs are in the set, so the run cannot pass vacuously.

## Evidence

- `red.log`: before the fix, 2 failed and 69 passed. The PGlite run reports exactly
  `dmf/drug -> SQL Dmf, function null` and the same for `DMF/drug`, `dmf/biologic` and `DMF/biologic`. Every other
  accepted pair already bucketed.
- `tests.log`: after the fix, `product-types.test.ts` passes 71 of 71. Thirteen related existing suites pass, 245 of
  245:
  - `pathways`;
  - `project-portfolio-vocabulary`;
  - `project-portfolio-card-facts.pglite`;
  - both `mdx-health` suites;
  - `market-support`;
  - `project-intake-class`;
  - `projects-create-market-offer`;
  - `foldDeviceAnalytics`;
  - `projectHomeIdentityFacts`;
  - `wizardFilingType`;
  - `useMdxPrograms.productType`;
  - `mdxPathwayIdentity`.
- `lint.log`: eslint shows 0 errors and 0 warnings on both files, at HEAD and in the working tree, so there are no new
  warnings. The test file is in lint scope. `tsc --noEmit` reports no error naming product-types, and
  `ci:test-imports` passes.
- `live.log`: the running server, not restarted, still projects `Dmf` for both DMF rows. The fixed CASE, run read-only
  (`BEGIN READ ONLY … ROLLBACK`) over the same two rows of the local DB, yields `Biotech` for both.

## Not done, and why

- The list's `ws` comes from server SQL, so the running dev server shows the fix only after a restart. This task forbids
  restarting it, so the server change is proven by the PGlite test and the read-only query.
- These `*.log` files are matched by `.gitignore:74` (`*.log`). Other evidence folders track theirs with `git add -f`.
- The changes are not committed. A commit needs the trailers `Plan: S1` and
  `Completes: shared/constants/domain/product-types.ts`.
