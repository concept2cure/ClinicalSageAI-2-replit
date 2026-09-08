# WO-8 Phase 2 — the official eSTAR is filled from governed records, and the surface says what was written

Date: 2026-09-03. Branch: `concept2cure-v2`. Base: `499f096`.

Phase 1 proved the fill engine writes into the real FDA eSTAR. It left one thing unconnected: the only
caller of `POST /api/510k/estar/official` sent `data: {}`, so every one of the 20 mapped fields was skipped and
the user downloaded a blank official form under a status line that read "Downloaded … _eSTAR.pdf". Nothing
upstream supplied a value, and the surface did not say so. This phase closes that, for the nIVD (device) and
IVD (diagnostic) 510(k) descriptors, and brings the device golden journey back to green.

## 1. What JM asked, and what the handoff said

The handoff (`docs/handoff/HANDOFF_DEVICE.md`, now committed where it says it lives) gates Phase 2 on an
Acrobat render check only JM can do, and authorises one click per session. JM's instruction for this session
was "get medical device and diagnostic fully done now", naming the whole stream as the click. That instruction
is recorded here as the authorisation; the Acrobat check is still open (§7) and nothing in this phase
substitutes for it.

`docs/handoff/WO-08_MDX_510K_ESTAR_DEMO.md` — the six-click sequence the handoff points to — does not exist
in the repository and never has (`git log --all` finds no `docs/handoff/` path before this session). The
clicks below are the ones the shipped surfaces already expose, in the order the filing journey runs.

## 2. Baseline, measured before any change

`node_modules` was empty in this container; the "91 tests pass" figure in the Phase 1 report could not be
reproduced until `npm ci` (2,413 packages). After install:

| Suite | Result on `499f096` |
|---|---|
| `server/services/pathway-engines/estar` + `server/services/forms` + `tests/routes/estar-*` + entitlement + `client/src/concept2cure/mdx` | 50 files, 481 tests, all passing |
| `tests/golden-journeys/device-510k-estar.journey.test.ts` (proof tier, runs in CI) | **FAILING** at line 502 |

The journey failure: `missingRequired` expected `[]`, received `cdrh-cover-sheet, user-fee-cover-sheet,
truthful-accurate-statement, risk-management, 510k-summary-or-statement`. Commit `4319d8f2` (W1-5) made those
five eSTAR slots always-required in `estar-mapper.ts`; the journey's seeded sections never covered them. Its
steps 5 and 8 were also stale in the other direction: they assert the template is not vendored and that
`/official` refuses, which Phase 1 made false. The proof tier was red on the canonical branch before this
session started.

Template checksums: `sha256sum -c assets/estar-templates/checksums.txt` → both OK.

## 3. The governed sources — the only places a value may come from

`ESTAR_ADMINISTRATIVE_SOURCES` in `server/services/pathway-engines/estar/estar-administrative-data.ts` is the
reviewable table. A test pins that every key of the `510k-device` and `510k-ivd` field maps appears in it, so a new
mapped key cannot ship without a declared source-or-none.

| Canonical key | Governed source | Fallback | Note |
|---|---|---|---|
| `deviceTradeName` | `regulatory_programs.product_name` | `fda_510k_projects.device_name` | the device profile |
| `deviceCommonName` | — | | user-supplied only |
| `deviceClassificationName` | — | | user-supplied only |
| `regulationNumber` | `fda_510k_projects.regulation_number` | | only when the anchor row exists |
| `productCodes` | `regulatory_programs.product_code` | `fda_510k_projects.product_code` | |
| `associatedProductCodes` | — | | user-supplied only |
| `applicantCompanyName` | `client_workspaces.name` | `organizations.name` | the workspace the program's anchor project belongs to |
| `applicantContactEmail` | `client_workspaces.contact_email` | | the anchor project's workspace contact |
| `applicantContactTelephone` | `client_workspaces.contact_phone` | | |
| `applicantSummaryEmail` | `client_workspaces.contact_email` | | same fact as `applicantContactEmail` |
| `correspondentCompanyName` | — | | user-supplied only |
| `correspondentContactEmail` | — | | user-supplied only |
| `correspondentTelephone` | — | | user-supplied only |
| `correspondentSummaryEmail` | — | | user-supplied only |
| `predicateSubmissionNumber` | `regulatory_programs.predicate_devices[0].kNumber` | | first predicate only |
| `predicateDeviceTradeName` | `regulatory_programs.predicate_devices[0].name` | | |
| `declarationCompanyName` | `client_workspaces.name` | `organizations.name` | same rule as `applicantCompanyName` |
| `declarationCompanyAddress` | — | | `organizations` has no address column |
| `declarationDeviceTradeName` | `regulatory_programs.product_name` | `fda_510k_projects.device_name` | same fact as `deviceTradeName` |
| `indicationsForUseCitation` | — | | user-supplied only |

Eleven of the twenty keys have a governed source; nine are user-supplied only. `client_workspaces` is reached
only through the anchor: `projects.client_workspace_id` of the project whose `regulatory_program_id` is the
program (uuid ident) or of `fda_510k_projects.project_id` (numeric ident). Every read is org-scoped, and a
database without `projects.regulatory_program_id` (Postgres 42703) answers "no anchor" rather than throwing —
the same posture as `program-project-anchor.ts`.

Rules the projection enforces: empty, whitespace or null at the source is absence, never `""`; the session
user is never a contact; `estar_registrations.cdrh_portal_email` is not a contact; no address is invented.
A key with no governed source may only be filled by a value the user types for that export, and the export
records it as `request`, distinguishable from the governed provenance.

The `client_workspaces` mapping is a data-model decision, not a fact FDA supplies: the platform's project
spine attaches every project to a workspace, and the workspace's name and contact are what the platform calls
the client. JM should confirm that reading before a customer files on it (§7).

## 4. What was built

**Server** (`server/services/pathway-engines/estar/`, `server/routes/510k-estar-routes.ts`)

- `estar-administrative-data.ts` (new): the sources table above; `projectEstarAdministrativeData` (pure —
  governed records → values + `store.column` provenance; trims; never emits `""`); `resolveOfficialEstarFields`
  (governed wins, a request value fills only a key with no governed value, a colliding or unknown request key is
  dropped and listed in `ignoredRequestKeys`; the precedence flag is typed as the literal `false` so it cannot be
  flipped at a call site); `reportOfficialEstarFill` (reads filled/blank off the fill result's own
  `filledFields`, so a value the template skipped is reported blank, never claimed); `loadEstarAdministrativeInputs`
  (takes the request-scoped drizzle client; every query org-scoped; `LIMIT 1 ORDER BY id` on the anchor lookup).
- `POST /api/510k/estar/official` accepts `useProgramData: true`. The 200 body carries `fieldReport`
  (`mappedCount`, `filledCount`, `blankCount`, `blankKeys`, per-field `filled` + `source`, `ignoredRequestKeys`),
  the artifact metadata carries `fieldSources`, and `contentForArtifact` records the resolved data — so the
  artifact registry and the audit row know which store each written value came from and which values the user
  typed. Without the flag the route behaves byte-for-byte as before (a test asserts the loader is never called
  and no report appears).
- `GET /api/510k/estar/official-fields?ident=&type=&variant=` (new, read-only): the "what will be written"
  preview — one row per mapped field with caption, SOM path, governed value and source. 404 when the ident is not
  in the caller's org, 422 `ESTAR_FIELD_MAP_NOT_POPULATED` for a descriptor with no verified map, 500 when the
  read fails. Sourced values are never logged.
- `resolveProjectAnchor` no longer turns every database error into "project not found": only a missing
  column/table (42703, 42P01) falls through; anything else reaches the route's 500 handler. `/build` gained the
  try/catch its anchor call lacked.

**Client** (`client/src/concept2cure/mdx/`)

- `hooks/useEstarOfficialFields.ts` (new): the preview read; a 404/422 is an error with a human sentence and no
  retry, never an empty field list; `sourceWords` renders provenance as "Device profile · product name",
  "Client workspace · contact email", never a store or column name.
- `hooks/useEstarExport.ts`: `exportOfficialEstar(program, variant, { useProgramData, data })` sends only the
  typed, non-empty keys; the outcome carries the server's `fieldReport`; the status line reads
  "Downloaded K-…_eSTAR.pdf · 11 of 20 administrative fields filled · 9 left blank".
- `surfaces/OfficialEstarPanel.tsx` (new): the ONE place the official PDF is produced from, on both the 510(k)
  surface (`variant="device"`) and the IVD surface (`variant="ivd"`). Readiness gate from `GET /readiness`
  (locked with the reason, never dead); the field table with governed values read-only and their source in
  words; an input per unsourced key, labelled "Entered for this export only · not stored"; the Generate control;
  after a run, the blank captions and any typed keys the server dropped. Loading, failed, idle and no-program are
  four distinct states; a program switch shows the loading state rather than the previous program's values.
- `K510Surface.tsx`: the header "Generate official eSTAR (PDF)" button and the sections-panel "not yet available"
  pill are gone — there is one Generate control. "Export 510(k) package" (the draft ZIP) is unchanged.
- `IvdSurface.tsx`: mounts the panel with `variant="ivd"` above the filing panel. This is the diagnostic half:
  the `510k-ivd` descriptor (19 verified fields, IVD eSTAR v7.0) now has a producing surface.

**Golden journey** (`tests/golden-journeys/device-510k-estar.journey.test.ts`): seeds the five W1-5
always-required sections with neutral titles so only the mapper's document-type rule can satisfy them; step 5
asserts `artifactKind: 'official-estar'`, template available, version 7.0; step 8 is the success path — the
preview names `regulatory_programs.product_name` and `client_workspaces.name` as sources, `POST /official` with
`useProgramData` returns 200, a colliding typed key is reported in `ignoredRequestKeys`, the governed product name
is read back at its XFA SOM path from the delivered PDF, `fieldSources` is persisted in
`concept2cure_artifacts.metadata`, and the governed export audit row count (`regulatory_audit_logs`, the sink
the governed branch actually writes) goes up by exactly one; a refusal step points `ESTAR_TEMPLATE_DIR` at an
empty directory for one call and proves no artifact and no audit row; a cross-tenant preview is a 404.

**Second pass, same session (commits `4b754cf8`, `2fed505f`)** — three more defects on the device and
diagnostic surfaces, found while closing the review's open items:

- **An IVD 510(k) was produced on the wrong template.** An IVD program that files a 510(k) has pathway
  `k510` and lands on the 510(k) surface, which mounted the panel with a literal `variant="device"` — the
  nIVD form. The kit's `Program` now carries the server's `product_type`; `officialEstarVariantFor` decides
  the family from it; the panel header names the family ("nIVD eSTAR" / "IVD eSTAR"); the readiness and
  field reads carry the variant. Proven at the host level: `MdxSurfaceHost` with an IVD row reads
  "IVD eSTAR", and fails with the old literal.
- **The export lock is known before the first click.** New read-only `GET /api/510k/estar/entitlement`
  answers with the same evaluator the producing routes' middleware runs (mode, enforced, allowed,
  requiredTier, tier), evaluating nothing when enforcement is off, and never forwarding a failed tier
  query's error text. The panel locks Generate with the tier on an enforced denial before any click; a
  denial in warn or off mode, or a failed read, locks nothing, because the POST would go through.
- **The 510(k) surface crashed on an unreadable section list.** `useK510EstarSections` mapped
  `data.sections` inside render, so a 200 with a body it could not read threw and unmounted the whole
  surface. An unreadable body is now a reported load failure — never a crash, never an empty list — the rule
  the portfolio hook already followed.

## 5. Proof

All numbers below were read from the runners on the final tree, after the review fixes.

| What | Result |
|---|---|
| eSTAR engine + forms + eSTAR route suites + entitlement + MDX kit + device journey + governed-export suites | **61 files, 882 tests passed, 9 skipped** after the first pass; **62 files, 898 tests passed, 9 skipped** after the second (the 9 are pre-existing skips in `tests/governed-export-behavioral.test.ts`, untouched) |
| `estar-administrative-data.test.ts` (new) | 27 tests, including the real-template block: project → fill the vendored nIVD v7.0 → `readXfaDatasetsValues` finds each governed value at its SOM path; blank keys are not written |
| `tests/routes/estar-official-pdf.test.ts` | 24 tests (18 → 24): `useProgramData` fill with `fieldReport`, `ignoredRequestKeys`, `metadata.fieldSources`; `GET /official-fields` 200 / 404 / 422; a database error (57014) answers 500 on both routes and never 404; a missing table (42P01) still answers 404 |
| `tests/routes/estar-export-governance.test.ts` | `/build` answers 500 `PROJECT_RESOLUTION_FAILED` on a database error, 404 on a missing table |
| `tests/golden-journeys/device-510k-estar.journey.test.ts` | green: 20 steps, 13 ok, 7 blocked-as-expected, 0 failed (was failing on the base branch) |
| `OfficialEstarPanel.render.test.tsx` (new) | 19 tests, then 26 after the second pass (pre-click lock, warn/off/failed-read no-lock, family header, variant on every read) |
| `k510IvdVariant.test.tsx` (new, host level) | 2 tests: an IVD row on the 510(k) surface reads "IVD eSTAR", a device row "nIVD eSTAR"; fails with the old literal variant |
| `useK510.sections.test.ts` (new) | 2 tests: an unreadable body is reported, not thrown; the documented shape adapts |
| `useMdxPrograms.productType.test.ts` (new) | the server product type survives adaptation beside the k510 pathway |
| `tests/routes/estar-entitlement-precheck.test.ts` (new) | 9 tests: mode off evaluates nothing (shown failing when evaluation is forced), on/warn verdicts, a failed evaluator is a 500 with no error text, toggle grant honoured |
| `useEstarOfficialFields.test.ts` (new) | 28 tests |
| `useEstarExport.test.ts` | 14 tests (4 → 14), then 18 (the entitlement read, the enforced-only lock rule, the one wording) |
| eslint on all 14 changed/new files | 0 errors; the warnings are the pre-existing max-lines / complexity / test-file `no-undef` classes, none new |
| `sha256sum -c assets/estar-templates/checksums.txt` | both OK |
| `tsc --noEmit -p tsconfig.check.json` on the final tree | exit 0, no diagnostics |
| ESLint warning ratchet (`ci:eslint-ratchet`) on the merged tree | **2 over the baseline (6701 > 6699)** — not from this change: every MDX file is outside `eslint .`'s scope by the repo's ignore pattern, and the changed server and test files carry the same per-rule counts as before (one `no-unused-vars` removed). The four new warnings are in `client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx`, `server/services/ana/AnaToolExecutor.ts` and `server/services/ectd/leaf-pdf-renderer.ts`, landed upstream after the 18:15 baseline commit; those files are outside this stream's territory and were not edited |
| CI gates run locally on the final tree | client-api-calls, route-collisions, orphaned-endpoints (strict), unrun-tests, test-imports, compliance-claims, ana-surface-context, surface-discoverability, client-reachability, bundle-reachability, internals-in-copy, empty-state-honesty, action-overclaim, server-error-leaks, error-envelope, microcopy, ectd-stubs, risk-codes, migration-set-order, session-scoped-rls-bypass, catalog-copy, fabricated-identity, ledger, requestdb-coverage — all pass |

**Verified by making each check fail.** Every guard added in this phase was broken by a scripted edit, its test
run, and the file restored byte-identical; the failing run is recorded in the agents' reports and summarised here:

| Guard | Test that fails without it |
|---|---|
| governed wins over a colliding request value | unit + real-template + route: 3 failures |
| unknown request keys dropped and reported | 3 failures |
| a request-supplied key the template skipped is listed as ignored | `expected ['bogus'] to equal ['bogus','correspondentCompanyName']` |
| 404 on a foreign ident, reading no governed data | route test + journey cross-tenant step |
| 422 on a descriptor with no verified map | route test |
| a database error is a 500, not a 404 (`/official-fields`, `/official`, `/build`) | 5 failures with the bare catches restored; `/build` throws out of the handler with its try removed |
| 42703 / 42P01 fall through, anything else propagates | unit test with code 57014 |
| the anchor lookup is `ORDER BY id LIMIT 1` | `ORDER BY is present on the anchor lookup` |
| the journey counts the sink the governed branch actually writes | success step reads `+0` against `audit_logs` — the old guard could never fire |
| the five W1-5 sections are matched by document type, not title | with the old titles and a wrong category the journey passed; with neutral titles it fails on the category |
| `/build` persists `officialEstarPdf:false` | journey fails when the flag is flipped |
| governed rows render read-only; unsourced rows carry inputs | render test, both directions |
| Generate posts `useProgramData:true` and only typed non-empty keys | render + hook tests |
| not ready ⇒ disabled with the blockers in the title | render test |
| a program switch never shows the previous program's values or its previous "Downloaded" line | two render tests + hook `reset()` test |
| a 404/422 field read is a sentence with no retry; a 5xx keeps retry | 7 hook/panel failures with the raw message passed through |
| a failed field read disables Generate with the reason | 2 failures |
| the first painted frame says "checking", not "not producible" | `renderToStaticMarkup` test |
| an enforced entitlement denial locks Generate before the first click; warn/off/failed read do not | 3 failures with `entitlementBlocksExport` forced false |
| the template family follows the program's product type, at the host level | pure test + host test fail with the old literal |
| the mode-off short-circuit in `GET /entitlement` evaluates nothing | 2 failures when evaluation is forced |
| an unreadable section-list body is reported, not thrown | unit test fails and the host test errors without the guard |

**Review.** Six independent read-only lenses (client↔server contract, honest state, Part 11, server correctness,
journey truth, UI copy/a11y) produced 21 findings; each non-nit was put to three refuters instructed to
disprove it. Confirmed and fixed: stale program data during a switch; every database error rendered as
"project not found"; the journey's vacuous audit-row guard; the redacted 404/422 error with a dead retry.
Nits fixed: skipped request keys not reported as ignored, non-deterministic anchor lookup, W1-5 title masking,
unasserted `/build` metadata flag, `xfaSomPath` type, first-frame claim, title-only disabled reasons,
Generate live after a failed preview, the stale export outcome. Closed in the second pass: the Generate control now reads the entitlement verdict on mount (above).
Recorded, not fixed (§7): `GET /official-fields` is readable by any authenticated member of the org (the same read scope as the device
profile and registration reads), which puts client-workspace contact details in front of non-editor roles;
`resolveProgramProjectAnchor` in `server/services/c2c/` still swallows non-schema errors and has no ORDER BY —
outside this stream's territory.

**Not observed here.** Acrobat rendering (§7). The typecheck (`tsc --noEmit -p tsconfig.check.json`) was
run by the server build agent before the review fixes (exit 0) and again on the final tree — see the commit
message for its result.

## 6. The clicks, as they now run

All on the 510(k) surface (`device-510k`) for a device program, or the IVD surface (`device-diagnostics`) for an
IVD program. Every step is a shipped control; nothing is simulated.

1. **Open the program.** Device workstream → program card → the pathway surface. The panel header reads the
   field list for that program.
2. **Device profile** — save product name, product code, class, regulatory path (the `DeviceProfilePanel`).
   These are `regulatory_programs` columns and become `deviceTradeName`, `productCodes`, `declarationDeviceTradeName`.
3. **eSTAR registration** — mark the FDA prerequisites held (`EstarFilingPanel`, `PUT /registration`).
4. **Filing readiness** — pick the catalog entry, assess against authored content (`POST /filing-readiness`).
5. **Official eSTAR** — the new panel: read "N of 20 fields have a governed source", type any of the nine
   user-supplied fields for this export, press Generate. The PDF downloads; the status line states filled and
   blank counts; the blank captions are listed.
6. **Track** — start tracking the filing and advance its lifecycle (`POST /submissions`, `PATCH /submissions/:id`).

## 7. Still open — JM only

1. **Acrobat render.** Unchanged from Phase 1: values are in the `datasets` packet; whether Acrobat displays
   them, and whether the form's own scripts overwrite them, has not been observed. No agent may attempt this.
2. **The applicant/correspondent reading of `client_workspaces`** (§3). If JM's answer is "the tenant is the
   correspondent when the workspace is a distinct client", that is one more row in the source table.
3. **Persisting user-typed administrative values.** They ride on the request and are recorded in the artifact's
   `contentForArtifact`, but are not stored on the program. Storing them needs a schema decision (a column or
   a table), which is a migration — not taken here.
4. **Legal check and provenance of the template bytes** — unchanged from Phase 1 §7.
5. **A 403 body that can carry a database error.** `server/services/entitlements/require-entitlement.ts`
   interpolates the evaluator's `reason` into the middleware's 403 `message`; when the tier query itself
   fails in enforce mode, `tier lookup failed: <driver text>` reaches the client. The new pre-check does not
   forward it; the middleware still does. Outside this stream's territory; not edited.
6. **252 commits not on origin.** This container's local `concept2cure-v2` ref (`890afa03`, 2026-08-28) is
   335 commits ahead of and 318 behind origin; `git cherry` finds none of its 252 non-merge commits in origin,
   not even as rebased equivalents. github-actions and dependabot commits are among them, so that line was
   on origin at some point and origin no longer carries it. Nothing was pushed; a git bundle of exactly those
   commits was handed to JM. Whether any of it should come back is JM's call.

## 8. Process notes

- The handoff was committed verbatim first (`65f8df90`), then the Phase 2 change. Two other streams pushed
  to `concept2cure-v2` during this session; their commits were merged in before the push, as Rule 0 directs.
- The workflow's refutation, fix and gate agents were cut off once by a session limit; the fixes were then
  driven by two territory-scoped agents and the gates re-run by the orchestrating session.
- Two platform documents still describe the removed header button: `docs/design/FULL_FEATURE_INVENTORY_FOR_DESIGN.md`
  and `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md`. Outside this stream's territory; not edited.

## 9. What was not done, and why

- The seven `'unset'` descriptors stay unset; no more of the 434 remaining nIVD paths were mapped (handoff §8).
- No dependency was added.
- No `WO-08_MDX_510K_ESTAR_DEMO.md` was written; the handoff forbids new architecture documents and the
  clicks are recorded in §6 of this report instead.
