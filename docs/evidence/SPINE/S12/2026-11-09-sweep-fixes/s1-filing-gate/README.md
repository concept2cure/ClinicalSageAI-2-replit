# S1: the create endpoint refuses a filing sent as a type it does not create (2026-11-09)

Package **S1** (`docs/design/one-design-plan.json`). Defect from the S12 biotech sweep (300d4daf1).

## The defect (verified)

`POST /api/c2c/projects` (`server/routes/c2c/projects.ts`, create handler) gated only on
`body.programType` + `primaryAgency` (`marketOfferGivenOutline`). `submissionTypeId` was recorded in
`metadata` and never compared with the application type that filing creates. An API caller could send
`submissionTypeId: 'eu_variation_ii'` with `programType: 'maa'` at EMA and get a full MAA scaffold, a
submission spine and a project anchor (`red.log`: 201, `scaffoldedSections: 24`, `submissionCreated: true`).
The New project picker marks that filing **not offered**: it asks the verdict about the type the filing
creates, an NDA at EMA, and the running app answers `not_offered`, "EMA has no governed NDA outline here"
(`picker-verdict.log`, a read-only GET on the dev server).

## What already exists

- `client/src/concept2cure/v2/surfaces/Projects.tsx`, `programTypeFor(sel, uiSeg)`: the picker's rule for the
  application type a catalog filing creates. The wizard posts its result as `programType` and the filing's id
  as `submissionTypeId`. It was client-only, so the server could not ask it.
- `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx`, `RegistryPicker`: asks the market verdict for each
  `(applicationTypeOf(entry), entry.agency)` pair and lists a filing as not offered when its type's verdict is.
- `server/routes/c2c/projects.ts`, the create handler: the market gate before any SQL
  (`marketOfferGivenOutline(marketInput, true)` → `sendFilingNotOffered`), and the post-scaffold "no outline"
  refusal (`FilingNotOfferedError`, rolled back).
- `server/routes/c2c/project-intake.ts`, `productTypeForIntake`, already refuses a **partial** set of
  identity mismatches with a 400: a filing document class sent as another type
  (`documentClassIdentityDecision`), a regional device filing (`regionalIntakeDecision`), and a device filing
  whose catalog pathway differs (`deviceIntakeDecision`). An application filing (a variation that creates an
  NDA, sent as an MAA) had no check.
- `shared/regulatory/filing-catalog.ts` (`resolveFilingCatalogEntry`, `PATHWAY_BY_ID`,
  `regionalDeviceApplicationClassForFiling`) and `shared/regulatory/filing-document-classes.ts`
  (`filingDocumentClassForFiling`, `filingTypeInSentence`): the inputs `programTypeFor` reads.
- `server/services/regulatory/market-support.ts`: `marketOfferGivenOutline`, `readMarketSupport`.

Searches run (RULE 3): `programTypeFor`, `applicationTypeOf`, `resolveFilingCatalogEntry`, `pathwayKey`
consumers in `server/`, `'505b2'` → NDA mappings, `submissionTypeId` senders (client, server, `scripts/`), and
`git log --all --diff-filter=D` / `-S'function programTypeFor'` for an earlier shared copy. No shared
equivalent exists. `server/services/authoring/authoring-assembly-source.ts:30` derives a pathway for
assembly by a different rule (document class, else fixed, else `pathwayKey`), not the picker's.

## Scope check

S1's paths include `shared/constants/**`, `server/routes/c2c/**` and `Projects.tsx`. `shared/regulatory/**`
is **not** in S1, so `shared/regulatory/filing-catalog.ts` was not edited. `shared/constants/domain/product-types.ts`
(in S1, and the closest existing home) is being edited by another agent right now and is outside this
group's files, so it was not the target. `shared/constants/mdx.ts` states "zero runtime dependencies", so it
was not used either.

**For review (RULE 6, "split, don't add").** The function moved, unchanged, into a new file,
`shared/constants/domain/filing-application-type.ts`, not into the folder it came from: the server cannot
import from `client/src`. It is a move of existing code, not a new capability (no route, service, screen,
mount or table). If the session prefers no new file, it can fold this module into
`shared/constants/domain/product-types.ts` after the other agent's change there lands; the imports are the
only callers to update.

## A move with no change (RULE 6, "split, don't add")

`programTypeFor` and its `SelTpl` type are **moved, unchanged**, from `client/src/concept2cure/v2/surfaces/Projects.tsx`
to `shared/constants/domain/filing-application-type.ts`: the 65-line function and the type are byte-identical to
HEAD's (an independent verifier diffed them: empty). It was moved so the New project wizard and POST
`/api/c2c/projects` read **one** rule for which application type a catalog filing creates (zero duplication), not so
anything new exists. `Projects.tsx` no longer defines it; it imports it from the shared module, as do the server route
and the tests that used it. The only new code is the intake's check that uses it.

## What changed

| File | Change |
|---|---|
| `shared/constants/domain/filing-application-type.ts` (new, moved code) | `programTypeFor` and its `SelTpl` parameter type, moved byte-for-byte from `Projects.tsx`; header says why. |
| `client/src/concept2cure/v2/surfaces/Projects.tsx` | Imports `programTypeFor` / `type SelTpl` from the shared module. Drops the two imports only the function used. Updates one comment that said the function was "above". No behaviour change. |
| `server/routes/c2c/projects.ts` | `sendFilingTypeMismatch`: when `submissionTypeId` resolves to a catalog entry, the type the picker computes for it (`programTypeFor`, called as the picker calls it) must equal `programType`. Otherwise **422 `FILING_NOT_OFFERED`** before any SQL. The message reads: "Type II Variation (Major) creates an NDA project, not an MAA. A project is created as the application its filing creates; choose a filing that creates an MAA." Where the verdict refuses the filing's own type in that market even with an outline, that reason replaces the second sentence and the offer is returned as `marketSupport`. The check runs after `productTypeForIntake`, so the existing 400 refusals keep their wording. `selectedFiling` is hoisted, so the catalog lookup happens once. |
| `client/src/concept2cure/v2/__tests__/wizardFilingType.test.ts`, `registryPickerOffers.test.tsx` | Import `programTypeFor` from its new home. |
| `server/routes/c2c/__tests__/projects-create-market-offer.test.ts` | New block "the filing chosen decides the application type": two refusals (catalog id and legacy id `type_ii_var`), the refused-own-type case (`us_ind` sent as an NDA at MHRA), and two that are still created (`eu_maa` as MAA, `us_505b2` as NDA, 201 with one program insert). |
| `shared/constants/domain/__tests__/filing-application-type.test.ts` (new) | The shared function gives each filing its application type. No catalog filing's type depends on the picker's tab, across all 251 rows and 6 lanes. The server passes no tab, so this is what makes its answer equal the picker's. |

The pre-write verdict cannot see whether an outline exists. The server reads rule packs only in the scaffold.
So for the variation it does not say "EMA has no governed NDA outline". It says what it knows: the filing
creates an NDA, not an MAA.

## Evidence

- `red.log`:
  - Run 1 is the new tests against HEAD. The two Type II Variation refusals get **201** with a full MAA
    creation, and the shared test fails because the module does not exist.
  - Run 2 is the final test block against the HEAD route (`git show HEAD:…`, then restored). 3 failed
    (both refusals and the refused-own-type case) and 2 passed (the matching bodies).
  - Between the runs, the refusal's expected wording was aligned to the catalog's display name,
    "Type II Variation (Major)".
- `tests.log`, green:
  - Server and shared: 15 files, 346 tests. These cover every `projects-create*` suite (the four pglite
    suites included), `project-intake-*`, `market-support-ich-not-offered`, `product-types`,
    `filing-catalog-unification` and the new shared test.
  - Client: 31 files, 346 tests (`wizardFilingType`, `registryPickerOffers` and every suite that imports
    `surfaces/Projects`).
  - A scoped `tsc` found 0 errors in the changed files. Its 18 errors are ambient declarations the scoped
    include does not pull in, listed there.
- `lint.log`: no new warnings.
  - `Projects.tsx` went from 7 warnings to 6, and `filing-application-type.ts` from 0 to 1. Both are the same
    `programTypeFor` complexity-43 warning, which moved with the function.
  - `projects.ts` stays at 3. The existing handler and file-length warnings grow by the new lines.
- `picker-verdict.log`: the running app's verdict for `nda@EMA` (`not_offered`) and `maa@EMA`
  (`author_only`).
- In the running app, Vite serves `Projects.tsx` importing `shared/constants/domain/filing-application-type.ts`,
  and that module exports `programTypeFor` (HTTP 200, checked with a read-only GET).

## Not done, and why

- **The refusal was not exercised against the running server.** A POST writes, which this task forbids, and
  the dev server runs the code from before this change until it restarts. The route tests prove the fix.
- **The wizard was not clicked through in a browser.** The client change is a pure move with identical
  behaviour. The 31 client suites are green and Vite resolves the new module.
- **Nothing was committed.** The changes are left in the working tree for the session to review.
