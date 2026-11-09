# The New project picker asks what the platform offers in two reads, not 87 (2026-11-09)

Defect 0 of the S12 biotech sweep (`docs/evidence/SPINE/S12/2026-11-09-biotech-sweep/defects.json`, committed in
300d4daf1). The sweep routed it to packages **D1** and **S5**. This is a fix of shipped behaviour: there is no new
screen, route, mount, table or service.

## The defect (verified)

Each open of New project after a page load fired **87** parallel `GET /api/submissions/market-support` requests.
`useFilingOffers` (`client/src/concept2cure/v2/surfaces/AnaVerbs.tsx`) sent two rounds:

1. one read per application type in the catalog (63 types);
2. one read per (type, agency) pair the first round did not name (24 pairs, across 9 markets: EU / Notified Body,
   ICH / Global, National competent authority, and others).

It had to, because the route took a single `applicationType`, even though `readMarketSupport` already took a list
of inputs and read the rule packs once for all of them. The 5-minute `readOffer` cache (human test J1,
2026-11-06) covers a reopen inside the same page, but not the first open after a reload. Against the API limiter,
two opens a minute could rate-limit the whole app.

`red.log` shows it: `expected 87 to be less than or equal to 2`.

## What already exists

- **`server/routes/submissions.ts`, `GET /market-support`** (was lines ~424-450). It took one `applicationType` and
  an optional `market`, called `readMarketSupport` once with one input per market, and answered
  `{ applicationType, asOf, markets }`. It did not take a list of types.
- **`server/services/regulatory/market-support.ts`, `readMarketSupport(client, inputs[], asOf)`**. It already
  composes any number of `(applicationType, market)` inputs from one `listActiveRulePacks` read. It is unchanged.
- **`client/src/concept2cure/v2/surfaces/AnaVerbs.tsx`**:
  - `readOffer`: a path-keyed module cache (5-minute TTL; a read in flight is joined; a failed read is dropped;
    Retry reads fresh).
  - `useFilingOffers`: the two rounds above.
  - `rowFor`: matches a catalog filing to a row by agency or by the market as asked.
  
  The batched reads go through `readOffer` unchanged.
- **`client/src/concept2cure/v2/MarketSupportLine.tsx`**: `marketSupportPath(applicationType, market?)` and
  `useMarketSupport`. `useMarketSupport` reads through `useLiveData`, not through `readOffer`, so it does **not**
  share the picker's cache. The file is unchanged: the picker passes comma-joined strings to the existing
  `marketSupportPath`, and that gives the batched path. The sweep had suggested an array overload; it was not
  needed.
- **`server/routes/c2c/project-intake.ts`, `VALID_PROGRAM_TYPES`** (64 types): the types project creation accepts.
  These are the "known types" a batched read is checked against.
- **`shared/constants/domain/filing-application-type.ts`, `programTypeFor`**: the rule the picker uses to work
  out which type to ask about. The s1-filing-gate group of this sweep moved it here from `Projects.tsx`. It is
  untracked in the working tree, and the route test imports it.
- **Other callers of the single form**, all unchanged, all still answered `{ applicationType, asOf, markets }`:
  - `MarketSupportLine` (project submission rows)
  - `Projects.tsx` (`npw-market-support`)
  - `IndLifecycle.tsx`
  - `NewSubmissionForm.tsx`
  - `client/src/concept2cure/mdx/MdxSurfaceHost.tsx`
  - `tests/e2e/filing-picker-guidance.e2e.ts` (`?applicationType=ind&market=FDA`)

**Searches run (RULE 3):**
- `market-support`, `marketSupportPath`, `useMarketSupport`, `readMarketSupport`, `readOffer`, `RegistryPicker`
  and `__resetFilingOfferReads` across `client/`, `server/`, `shared/` and `tests/`;
- `VALID_PROGRAM_TYPES` and `programTypeFor`;
- the sweep's defect list.

No batched market-support read existed anywhere.

## What changed

| File | Change |
|---|---|
| `server/routes/submissions.ts` | The existing handler also accepts a comma-separated `applicationType` list: at most 100 entries, each at most 64 characters, deduplicated, and each in `VALID_PROGRAM_TYPES`. An unknown type gets 400 `VALIDATION` naming it, before any read. `market` may also be a comma-separated list of at most 32. Each listed type is stated at each market asked, or at every region when none is asked. All of it comes from **one** `readMarketSupport` call. A list is answered `{ applicationTypes, asOf, byType: { [type]: markets[] } }`. A single type (no comma) keeps its answer exactly as before. The query parsing moved into a small `marketSupportQuery` helper in the same file, which keeps the handler under the complexity limit. |
| `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` | New `readOffersByType(types, markets, fresh)` makes one read through `readOffer`: the list form when there are two or more types, the single form when there is one. It returns each type's rows, or `null` when the read failed or any row lacks an offer (the same fail-closed rule as before). `useFilingOffers` makes one read for every type, then one read for every unnamed type at every unnamed market. Each unnamed pair keeps only the row for its own market as asked, which is exactly the row its single read used to return. |
| `client/src/concept2cure/v2/__tests__/registryPickerOffers.test.tsx` | **Red test:** the first open asks at most two reads. The `serverAnswer` mock answers the list form as the route does. Two "asked of the server by its own market" assertions now parse the type and market lists instead of matching one URL shape. The missing-build-fields case strips `outline` from both answer shapes. |
| `server/routes/__tests__/submissions-market-support.test.ts` | **Red tests** for the list form: answered by type, each type equal to its own single read, from one pack read; type × market lists; one type at a market list keeps the single shape; no repeats; an unknown type refused before any read; every known type accepted; 100 entries accepted and 101 refused; every type the picker can ask, for every catalog filing in every lane, is accepted; the single shape is unchanged, including an unknown single type, which is still answered with the server's own refusal. |
| `client/src/concept2cure/v2/__tests__/registryPickerReference.test.tsx`, `newProjectWizardCrossLaneSearch.test.tsx`, `newProjectWizardRegionalDevices.test.tsx` | These render the real `RegistryPicker`, so their market-support mocks now answer the list form the way the route does: rows by type, with market lists split. They are mock-only edits; none of their assertions changed. Before the edit, the cross-lane suite (4 tests) and the regional-devices suite (17 tests) failed. They timed out waiting for a picker that correctly refuses a list answer with no `byType`. The reference suite's mock was amended before it was run, because it asks about two types and answered only the single shape. |

**Why the second read is type × market.** Positional pairs would be an odd contract. The product of 13 types and 9
markets is 117 pure computations after the one pack read, so it costs nothing. The client keeps only each pair's
own row. Nothing reached the screen that did not before: the existing test "for every catalog row, a tile is
shown exactly when the server offers the filing" compares all 234 rows with the server's own `marketSupport`, and
it is green.

## Evidence

- **`red.log`**: the tests run before any implementation change; the header shows an empty diff for
  `AnaVerbs.tsx`, `MarketSupportLine.tsx` and `submissions.ts`. 6 failed and 34 passed. The failures:
  - client: `expected 87 to be less than or equal to 2`;
  - route: the list was answered as one unknown type `"nda,maa"` (`byType` missing, `applicationTypes`
    undefined), an unknown type in a list got `200` instead of `400`, and every known type in one list got `400`
    instead of `200`.

  The two route tests that passed before the fix are guards that must hold both ways: 101 entries are refused, and
  the single shape is unchanged.

  Two route tests were added after `red.log` was taken, so neither has a red run on file:
  - "one type at a list of markets keeps the single answer": at HEAD the market list is read as one literal market,
    which gives 1 row instead of 2;
  - "every type the New project picker can ask … is a type the list accepts": a check on the catalog that does not
    depend on the route.
- **`tests.log`**: 40 files, 454 tests, all passed. They cover the picker, the wizard suites that render it or mock
  market-support, `marketSupportLine`, `projectMarkets`, `newSubmissionRegionStatement`,
  `submissionCenterNewFromProject`, the route, `submissions-create-not-offered`, and the market-support service
  suites. A probe run, not kept in the test, counted exactly **2** reads on first mount, with decoded URLs of 646
  and 252 characters.
- **`lint.log`**: no new error or warning in any changed file. Each file was compared with `git show HEAD:<file>`
  linted under the same filename.
  - `AnaVerbs.tsx`: 2 warnings before and after (the existing `RegistryPicker` length and complexity warnings).
  - `submissions.ts`: 1 before and after (the existing `max-lines`).
  
  A complexity warning that the first version of the handler added was removed by extracting `marketSupportQuery`.
- **`typecheck.log`**: a targeted `tsc` over the 7 changed files found 0 errors in them. The errors it does list
  come from ambient declarations that a files-only config does not load.
- **`live.log`**: two read-only GETs on the dev server, which was not restarted. At HEAD the route takes
  `nda,maa` as one unknown type and answers every market "No outline" / "Not supported". This confirms the server
  half is not live until a restart.

## Plan packages (for the commit trailers)

From `docs/design/one-design-plan.json`:

- `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` belongs to **D1** (Shell, Home and the conversation; an
  explicit path).
- `server/routes/submissions.ts` belongs to **S5** (Spine 5: eCTD assembly, validation and filing; through
  `server/routes/submission*.ts`).
- **F1** (Repairs: defects in shipped behaviour), **R1**, **L1** and **PLAN** cover `**`.
- Tests and `docs/evidence/**` are in `alwaysAllowed`.

These match the sweep's routing (D1, S5). The client depends on the new route form, so either:

- commit them together under **`Plan: F1`**, or
- commit **S5** first (`submissions.ts` and the route test), then **D1** (`AnaVerbs.tsx` and the client tests).

Trailers:
- `Completes: server/routes/submissions.ts`
- `Completes: client/src/concept2cure/v2/surfaces/AnaVerbs.tsx`

## Not done, and why

- **The server change is not live in the running app.** Restarting the dev server was out of bounds. Vite serves
  the edited client straight away. So, until a restart, New project in the running app shows its own failure
  state ("could not be read, so none is offered yet", with Retry). It fails closed and never offers a wrong
  filing. After a restart it should make 2 reads. Opening the wizard in the running app (RULE 4, "opened and used")
  is still owed after that restart.
- **Interaction with sweep defect 2** (Priority Review, PMR/PMC and others created as NDA projects). Its suggested
  fix makes `programTypeFor` return a filing's own id for unmapped filings. Those ids are not in
  `VALID_PROGRAM_TYPES`, so the batched read would refuse the whole list and the picker would show its failure
  state. The new route test "every type the New project picker can ask … is a type the list accepts" fails first
  and points here. If that fix lands, admit those ids to the batched check or map them otherwise. Do not drop the
  check silently.
- **Rate-limit figure.** `server/config/platform-limits.ts` states 600 requests a minute per identity for the API
  tier. The "200 a minute per IP" in the task text was not verified here. The fix does not depend on it.
- `tests/e2e/filing-picker-guidance.e2e.ts` (Playwright) was not run. It needs a server running this code, and it
  calls only the single form, which is unchanged.
- A full `npm run typecheck` was not run, because of memory and the other agents running in parallel. The
  targeted check is in `typecheck.log`.

## RIM's review (L9, session 011e42, 2026-11-09) and what changed for it

RIM, S5's holder, agreed to the completion with two asks, both done before commit:
1. **Never split the answer by position alone.** `marketSupportByType(inputs, out)` (exported from
   `server/routes/submissions.ts`) groups each answer by its own `applicationType` and checks it matches its input's
   type and market; answers that are not exactly one per input, in input order, make the route answer 500
   `MARKET_SUPPORT_MISALIGNED` in words rather than state one type's support under another. (`readMarketSupport` is one
   pack read and `inputs.map(marketSupport)`, so it is aligned today; the check keeps it so.)
2. **Cap the product of the two lists.** Measured: every type the platform knows (64) at every region it names (12) is
   768 inputs, the picker's first read, computed in 11.7 ms after the one pack read; the largest possible list
   (64 × 32 = 2,048) in 13.7 ms. The cap is 1,600 inputs, refused above with a 400 that says so.

Tests: 14 of 14 in `submissions-market-support.test.ts` (2 new: misaligned answers refused; the product cap); the five
picker and route suites pass, 72 cases (`tests-after-l9.log`). Lint unchanged on both files.
