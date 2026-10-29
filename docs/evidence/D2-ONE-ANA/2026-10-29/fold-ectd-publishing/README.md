# The eCTD reference folds into eCTD Compile (D2, 2026-10-29, fold ectd-publishing)

**Row:** D2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The founder's direction of 2026-10-29: "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- the placement map, `.design/client-journey/FUNCTION_PARITY.md`, "Into eCTD compile (`ectd-compile`)", "From `ectd-publishing`" (9 items, all real today);
- the common fold checklist in `docs/design/DEVICE_FOLDS_2026-10-29.md` (from `2168fd56`);
- the deletion rule in `CLAUDE.md`'s working agreement.

**The work, named for what it is:**
- *reach* the retired screen's reference (the eCTD version, the FDA Regional IG OID, the spec versions, the v3.2.2 and v4.0 vocabularies) from eCTD Compile, by moving its code, not copying it (Part 1);
- *fix* four honest-state defects the move found (below);
- *fold* `ectd-publishing` into `ectd-compile` (Part 2): re-register its three actions, alias the id, amend the three catalogue writers in place, and take it off every list.

No route, table or service was added. The panel reads the same three GETs of `server/routes/ectd-v4.ts` the retired screen read.

**The replacement, by path** (CLAUDE.md working agreement):
- `client/src/concept2cure/v2/surfaces/EctdCompileReference.tsx` (the reads, guards, labels, hook, panel, AnA facts and action handlers) and `QualifiedSpecVersions` in `client/src/concept2cure/v2/surfaces/EctdCompileDtdEvidence.tsx`, both rendered by `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`;
- proven reachable by `client/src/concept2cure/v2/__tests__/ectdCompileReference.test.tsx` (it mounts the real eCTD Compile and drives the three actions through the real bus) and `client/src/concept2cure/v2/__tests__/foldEctdPublishing.test.ts` (the alias from a link, an in-app move and AnA's target);
- served in production under eCTD Compile's two exact claims, proven by `ci:launch-scope-api` and `launch-reproof-narrowing.test.ts`;
- the catalogue row never created on a fresh database, and a deployed row deprecated on every replay with its tier and subscriptions kept, proven by `tests/schema-contract/catalog-module-claims.contract.test.ts` and `moduleCatalogReconciliation.test.ts`.

**Parts 1 and 2 land together** (the lead's decision): Part 1 alone left the reads refused at launch.

## What already exists

Read at `a254c975a`. Line numbers are at that commit.

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| The `ectd-publishing` screen | `client/src/concept2cure/v2/surfaces/PublishingCenter.tsx` (429 lines) | Version selector, default v4.0 (:149, :323); Regional IG OID chip (:331); "Qualified against" table with Try again (:337-361); v3.2.2 coded-attribute lists with counts (:370-393); v4.0 code-list browser and filter (:396-418); AnA context (:207-261); three view-only actions (:264-307); publishes under `ectd-publishing` (:309). | Out of the launch catalogue (`launch-scope.test.ts:160`, "a reference page that publishes nothing"); `deferred-capability-inventory.ts:28` names `ectd-compile` as where it converges. A failed listing under v4.0 drew an **empty picker** (:399, `listing?.v4 ?? []`). It read the default list id `contextOfUse` before the listing answered, and after it failed (:189). No Try again on the vocabulary error (:378) or the code-list error (:412). A late code-list answer could paint over a later pick (no revision guard). |
| The routes | `server/routes/ectd-v4.ts` (mounted `/api/ectd` by `server/bootstrap/register-document-routes.ts:132-141`) | `GET /controlled-vocab` (:141, listing with `regionalIgOid`, 14 v4.0 lists, the v3.2.2 lists), `GET /controlled-vocab/:listId` (:156, `hasOwnProperty` guard, 404 for an unknown id), `GET /qualification/spec-versions` (:212). Each is tenant-gated (401/403, `requireTenant`). Also `POST /v4/validate` and `/v4/forward-compat`, which no screen calls. | — |
| The data | `server/services/ectd/qualification/qualify.ts:53-67` `SPEC_VERSIONS`; `server/services/ectd/controlled-vocab/cv-v4-data.ts:386` `V4_CODE_LISTS`; `cv-v3-data.ts` `V3_CODE_LISTS` | Deterministic, vendored. | — |
| eCTD Compile | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx` (1811 lines) | Region and type menus, readiness, Validate/Compile, the compile result with the package, validation findings (:1539), history (:1562), filed state, orchestrator, signature, audit. AnA context (:1135-1234) and three actions (`ectd-compile.set-region`, `set-submission-type`, `load-run`). | No reference: nothing on it names a spec version or a vocabulary code. With no project open it showed only "Open a project to compile its eCTD". |
| The validation evidence | `client/src/concept2cure/v2/surfaces/EctdCompileDtdEvidence.tsx` (145 lines) | `PackageDtdValidation` and `RegionalPackageFact`: the package's DTD execution proof, in the compile result and in history. | No spec versions. |
| The version a compile builds | `server/services/submission-gateways/regional-packager.ts:856`; `server/routes/ectd-compile.ts:20-35`; `server/services/regulatory/market-support.ts:202` | The packager writes `<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">`; the compile route's header names the ICH v3.2.2 backbone; market support says "this platform builds eCTD v3.2.2 only". | **No sequence records an eCTD version.** `statusSequence` (`ectd-compile.ts:389-393`) returns id, number, region, leaf count and type; `SubmissionSpine.sequence` (`services/cmc/submission-spine.ts:57`) the same. So "the sequence's version" is the one version the compiler assembles, v3.2.2. |
| The three actions | `shared/navigation/surface-actions.ts:726-753` | `ectd-publishing.set-version`, `.open-list`, `.filter-codes`. | — |
| The AnA target | `shared/navigation/index.ts:236` | `ectd-publishing`, scope `global`. | — |
| Registry and catalogue | `shared/constants/ui-surface-registry.ts:471-488` (`apiPrefixes: ['/api/ectd']`); `client/src/concept2cure/v2/surfaceViews.ts:462`; `db/migrations/20260810_reconcile_module_catalog.sql`; `20260823_module_catalog_commercial_packaging.sql`; `migrations/20260814j_catalog_missing_product_surfaces.sql`; `server/services/ana-ri/message-intent.ts:104` | The surface, its claim on `/api/ectd`, and its catalogue rows. | — |
| Launch scope at the API | `server/services/entitlements/launch-scope-api.ts`; `server/services/entitlements/__tests__/launch-reproof-narrowing.test.ts:66-69` | `/api/ectd/controlled-vocab` and `/api/ectd/qualification` are claimed only by `ectd-publishing`, so production refuses them (`NOT_SERVED_AT_LAUNCH`). | A launch screen reading them is refused until `ectd-compile` claims them (Part 2, below). |

### Searches run

- `ectd-publishing|PublishingCenter` across the repo: 484 files, 22 of them code (the rest evidence and docs). Each code file is handled in Part 1 or Part 2, or named under Part 2's "Not carried".
- `qualification/spec-versions|controlled-vocab` under `client`, `server`, `shared`, `scripts`, `tests`: the router, its test, the registry note, the narrowing test, the visual-QA fixtures and the retired screen and its two suites. No other client reader.
- `HL7 RPS|'v4.0'|regionalIgOid|Regional IG|controlled vocabulary|codeCount|spec-versions|genericode` under `client/src`: the retired screen and `DesignControlsTrace.tsx` (an unrelated count). No other eCTD version selector or vocabulary browser exists in the client.
- `ectd_version|ectdVersion|specVersion` across the compile route, the spine and the schema: no eCTD version on a sequence or submission (`csr-knowledge-db.ts:771` and `coauthor.ts:894` are unrelated stores).
- `ectd4|rps|v4` in `server/routes/ectd-compile.ts`: the compile has no v4.0 path; its draft backbone says `version="4.0"` and is labelled a working document, not a package.
- `useSurfaceActionHandlers` and the bus (`surfaceActions.ts:229-232`): an action id not in `shared/navigation/surface-actions.ts` is warned and never dispatched, so the actions move only with their registry entries (Part 2).

### Deletion history (CLAUDE.md working agreement)

`git log --all --diff-filter=D` on `*PublishingCenter*`, `*publishingCenter*`, `*ectd-publishing*`, `*EctdReference*`, `*ectdReference*`, `*EctdCompileReference*`, `*ControlledVocab*`, `*controlledVocab*`, `*controlled-vocab*`, `*SpecVersion*`, `*spec-version*`, `*Qualification*`, `*ectd-v4*`, `*EctdV4*`, `client/**/*Publish*`, `client/**/*Vocab*`, `client/**/*Editor*` and `client/**/*Canvas*`: no hits. On `*ectd*`: CTD template and seed files (`e943e0d49`, `aaf83b232`, `0f0705fc8`) and `server/api/ectd/routes.ts` (`3c394edb3`, an unmounted CTD structure router), none of them this reference.

**The clone is shallow** (`git rev-parse --is-shallow-repository` is `true`; history reaches back to `892739bb7`, 2026-10-22), so "nothing deleted" covers that window only.

## Where it goes, and why

- **The spec table sits beside the validation findings**, as the map says: after the Validation findings card and before the compilation history. It is always shown, because it is the register those findings are read against, not a result of them. It is `QualifiedSpecVersions` in `EctdCompileDtdEvidence.tsx`, the file the map names. It is presentational; its read is the panel's.
- **The reference panel follows it** ("eCTD reference"): the version, the Regional IG OID and the vocabularies. The table is directly above the selector that chooses its version.
- **It opens at v3.2.2**, the version this compile assembles. No sequence records a version (above), and the packager writes one. When v4.0 is chosen, the panel says "Reference only. This compile assembles eCTD v3.2.2, not v4.0." and the table's header says the same. The retired screen opened at v4.0.
- **It is on screen with no project open.** The reference is not the project's; `ectd-publishing` was a `global` target; after the alias, a person with no project open would otherwise lose it. The two "no reads with no project" assertions (`ectdCompile.test.tsx`, `anaOperatesEctdCompile.test.tsx`) now say exactly that: no project-scoped read goes out, and the reference's two reads do.
- **AnA's view is eCTD Compile's own context:** one sentence in the summary and a `reference` object in the facts (version, the version this compile assembles, read state, the labelled spec versions, the list counts, the OID, the open list, the filter and its count). Counts are published only from a read that answered.

## Part 1

### Files

| File | Change |
|---|---|
| `client/src/concept2cure/v2/surfaces/EctdCompileReference.tsx` | **New, moved.** The retired screen's reads (`readJson` as `readShaped`), shape guards, `SPEC_LABELS`, `V4_LABELS`, `sentenceLabel`, filter, AnA context (as `ectdReferenceSummary` and `ectdReferenceFacts`) and its three handlers (`ectdReferenceActionHandlers`, keyed by the caller's action ids). The hook `useEctdReference`, the panel and `EctdReferenceCards`. |
| `client/src/concept2cure/v2/surfaces/EctdCompileDtdEvidence.tsx` | `QualifiedSpecVersions`, the "Qualified against" table, moved, with Try again. |
| `client/src/concept2cure/v2/surfaces/EctdCompile.tsx` | The hook, the cards (beside the findings, and in the no-project state), the summary sentence, `facts.reference`, one conversational `availableActions` line. +13 lines. |
| `client/src/concept2cure/v2/surfaces/PublishingCenter.tsx` | 429 → 54 lines: a host over the moved module under the old id until Part 2 deletes it. It keeps its v4.0 opening and its own action ids, so nothing changes for the retiring id. |
| `client/src/concept2cure/v2/__tests__/ectdCompileReference.test.tsx` | **New**, 16 cases (below). |
| `client/src/concept2cure/v2/__tests__/ectdCompile.test.tsx`, `anaOperatesEctdCompile.test.tsx` | The no-project read assertions, narrowed to project-scoped reads, naming the two reference reads. |
| `client/src/concept2cure/v2/__tests__/publishingCenterHonestReads.test.tsx` | One title: "Couldn’t load the controlled vocabulary" (one state for the listing under either version). Deleted in Part 2 with the screen. |

### Defects fixed by the move

1. **A failed listing under v4.0 was an empty picker.** It now shows the failed read with Try again, and no picker.
2. **The code list was read before the listing answered, and after it failed,** with a default id. Only an id the listing supplied is read now (the server's own rule, `ectd-v4.ts:161-163`). It still opens at `contextOfUse` when the listing has it, wherever it is listed.
3. **No Try again on the vocabulary error or the code-list error.** Both have one now. The code-list one re-reads that list.
4. **A slower answer for an earlier pick could paint over the list now picked.** A revision guard drops it.

### Parity: every item of `FUNCTION_PARITY.md` "From `ectd-publishing`"

| Item | Carried where | Proven by |
|---|---|---|
| Choose the eCTD version (`PublishingCenter.tsx:149,322-326`) | The "eCTD reference" panel's version menu, opening at v3.2.2 | "opens at v3.2.2, the version this compile assembles…"; M1 |
| FDA Regional IG OID (`:329-333`) | The same panel, under v4.0 | "shows the Regional IG OID, the v4.0 specifications…"; M14 |
| The spec versions qualified against (`:338-361`) | `QualifiedSpecVersions` (`EctdCompileDtdEvidence.tsx`), beside the findings | "places the specifications beside the validation findings…"; "an empty answer says…"; M2, M13 |
| v3.2.2 vocabularies with code counts (`:370-393`) | The panel, under v3.2.2 | "opens at v3.2.2…" (rows and counts) |
| Browse a v4.0 code list (`:396-402`) | The panel, under v4.0 | "shows the Regional IG OID…"; "reads only a code list the listing supplied"; "a slower answer…"; M9, M10, M11, M19 |
| Filter codes (`:403-407`) | The panel | "shows the Regional IG OID…" (narrows, and "No codes match your filter"); M12 |
| Retry a failed read (`:349`), and the code-list error too | Try again on the spec table, the listing and the code list | the three Try again cases; M6, M7, M8 |
| AnA context for the reference (`:207-261`) | eCTD Compile's context (`EctdCompile.tsx` summary and `facts.reference`) | the two AnA cases; M15-M18 |
| AnA target (`index.ts:233`) | Part 2: kept, re-described, and resolved by `DEEP_LINK_ALIASES['ectd-publishing'] = 'ectd-compile'` | `foldEctdPublishing.test.ts` (a link, an in-app move, AnA's target); P2-M1 |
| The three surface actions | Part 2: `ectd-compile.set-reference-version`, `.open-code-list`, `.filter-codes`, registered by eCTD Compile through the moved `ectdReferenceActionHandlers` | the four action cases in `ectdCompileReference.test.tsx` (through the real bus, the hold on the listing included); P2-M7 to P2-M10 |

**Also on screen:** the retired screen's "Nothing here publishes, transmits, validates or freezes a sequence" went with it; the panel says "Read-only. Nothing in this panel changes what the compile assembles.", and eCTD Compile's own governed acts stay a person's click.

### Carried into Part 2, and why

**`ci:launch-scope-api` fails on Part 1 alone, and production would refuse the reads.** The three paths are claimed only by `ectd-publishing`, which is out of the launch scope, so on eCTD Compile they are `out-of-scope` (`gates.txt`). The panel then shows its failed-read state with Try again, never an empty list. The fix is two exact claims on `ectd-compile` in `shared/constants/ui-surface-registry.ts`, `'/api/ectd/controlled-vocab'` and `'/api/ectd/qualification/spec-versions'` (not `/api/ectd/v4`, which no screen calls), with `/api/ectd/controlled-vocab` and `/api/ectd/qualification/spec-versions` moved to `STILL_SERVED` in `launch-reproof-narrowing.test.ts`. `/api/ectd/qualification` itself stays in `NOT_SERVED_AT_LAUNCH`: the exact claim does not cover the root or its other children. That file is on the shared checklist list, so it landed in Part 2, and the two parts land together. With Part 2, the gate passes (`gates.txt`, Part 2).

## Red, green, mutations (Part 1)

| | Result | File |
|---|---|---|
| Red: the new suite, before any product change | 15 of 15 fail. The 16th case, added after, fails with HEAD's `EctdCompile.tsx` swapped in (restored, hash-checked). | `red.txt` |
| Green: the new suite and the retired screen's two suites | 3 files, 22 of 22 | `green.txt` |
| Green: every suite that mounts eCTD Compile or touches `ectd-publishing` (the new suite among them) | 15 files, 135 of 135 | `green.txt` |
| Green: the shell-wide suites that render surfaces | 15 files, 759 of 759 | `green.txt` |
| Green: the launch-scope API suites (`launch-reproof-narrowing`, `launch-scope`) and the routes' own suite (`ectd-v4.test.ts`) | 3 files, 254 of 254. Unchanged by Part 1: the claim they test moves in Part 2. | `green.txt` |
| Mutations of the product code | 19 of 19 red (M1-M19), each caught by a named case. Each file was restored and hash-checked after each mutation and at the end. | `mutations.txt` |

**Gates** (`gates.txt`): `ci:launch-scope-api:selftest`, `ci:launch-scope`, `ci:ana-surface-context` (108 of 112, baseline unchanged), `ci:surface-discoverability`, `ci:undefined-css-classes`, `ci:fixture-fallback`, `ci:unauthenticated-fetch` and `audit:repo-health:ceiling` exit 0. **`ci:launch-scope-api` exits 1** on the three reference paths, as stated above; `tools/claim-proof.ts.txt` shows that the two exact claims make them `launch` and leave `/api/ectd/qualification`, its other children, `/api/ectd/v4` and `/api/ectd/templates` refused.

Scoped tsc over the 8 changed files and their imports (tsconfig.json's options, every `*.d.ts` under `client/src`, `shared`, `server/types`): 0 errors in this change; 3 elsewhere, TS2307 for `./styles.module.css` in three `components/ana` panels this change does not touch. ESLint (`eslint.txt`): no file gains a warning; `PublishingCenter.tsx` goes from 4 to 0.

## Part 2: ectd-publishing retired

Read at `e455afe16` (the setup retirement on trunk), over Part 1's files unchanged (hashes checked). The tree was set aside for a push and restored byte-for-byte; the final runs are over `70c9e75ad`, which merged three upstream pushes, none touching a file of this change or naming the retired id.

### What was done, by the checklist (`docs/design/DEVICE_FOLDS_2026-10-29.md`)

| Step | Change |
|---|---|
| 1. Delete the source | `client/src/concept2cure/v2/surfaces/PublishingCenter.tsx` and its two suites, `publishingCenterHonestReads.test.tsx` and `publishingCenterSpecLabels.test.tsx`. Every case they held is in `ectdCompileReference.test.tsx`; the one that was not (no CSS title-casing of a spec label) was added there. Nothing else imported them (`foldEctdPublishing.test.ts` finds no `PublishingCenter` in `client/src`). |
| 2. MdxSurfaceHost | Not a host-mounted id; nothing to do. |
| 3. Views and registry | `ectd-publishing` leaves `surfaceViews.ts` and `ui-surface-registry.ts`. Its claim on `/api/ectd` moved as the two exact reads the reference makes: `ectd-compile` claims `/api/ectd/controlled-vocab` and `/api/ectd/qualification/spec-versions`. `/api/ectd/v4` (validate and forward-compat) had no caller and stays refused at launch, like `/api/ectd/templates` and the rest of `/api/ectd/qualification`. `ui-surface-registry.ui-v2.ts` no longer says ectd-publishing owns publishing. The deferred inventory loses its row (11 → 10, `deferred-capability-inventory.test.ts`). |
| 4. registryModel | `DEEP_LINK_ALIASES['ectd-publishing'] = 'ectd-compile'`. The id was in no `NAV_GROUP_OF`, `NAV_HIDDEN`, `SEGMENTS.focus`, `SURFACE_ACTIONS` or `SEGMENT_MODULES` entry. |
| 5. Launch scope | It left the Submission Center app on 2026-10-08; a guard names it (`launch-scope.test.ts`, "the folded eCTD publishing reference"). `mdx-project-features.ts` never had it. |
| 6. Catalogue (Rule 1) | Three writers amended in place, each with a dated header; no DELETE, no appended DROP. `migrations/20260814j_catalog_missing_product_surfaces.sql`, the row's only writer: its VALUES row removed, so a fresh database never holds a catalogue row for the retired screen. `db/migrations/20260810_reconcile_module_catalog.sql`: off step 1's keep-list, and step 1b (the heal step that cleared step 1's deprecation for this one row) removed, so a deployed row is deprecated on every replay and nothing clears it. `db/migrations/20260823_module_catalog_commercial_packaging.sql`: its packaging row removed, so the unknown-module guard passes on a fresh database. A deployed row keeps its metadata, its recorded tier and its subscriptions. Two contract cases (below). The checklist names only 20260810 and 20260823; 20260814j is here because, unlike device-tasks', this row was not seeded by 20260810's upsert, and `moduleCatalogReconciliation.test.ts` (which counts a seeded, unretired row as advertised) failed until it was removed. |
| 7. AnA target and actions | The target `ectd-publishing` stays in `shared/navigation/index.ts`, re-described as eCTD Compile's eCTD reference, and resolves through the alias. The three actions are re-keyed in `shared/navigation/surface-actions.ts`: `ectd-compile.set-reference-version`, `ectd-compile.open-code-list`, `ectd-compile.filter-codes`. eCTD Compile registers them by spreading `ectdReferenceActionHandlers` into its handler map, and its ready signal now also fires when the reference listing settles, so a held `open-code-list` is released. `filter-codes` takes its query as optional: the resolver refuses an empty required param, so the old action could never clear the filter. |
| 8. Tours | No tour stopped on it (`foldEctdPublishing.test.ts`). |
| 9. CI lists | `check-ana-surface-context.mjs` `ID_BASELINE` 108 → 107. `check-launch-scope-api.ts` `REAL.components`, `dump-v2-surfaces.spec.tsx` and `ProjectMdxWorkflow.test.tsx` never named it. `check-surface-discoverability.mjs` needs no edit (114 → 113 renderable, 88 → 87 in the Apps catalog). `anaDrivesWave6.test.tsx` expects the three actions under `ectd-compile`. |
| 10. Fold guard | `client/src/concept2cure/v2/__tests__/foldEctdPublishing.test.ts` (6 cases). |
| The launch boundary | `launch-reproof-narrowing.test.ts`: `/api/ectd/controlled-vocab` moves to `STILL_SERVED` with `/api/ectd/qualification/spec-versions`; `/api/ectd/qualification` stays in `NOT_SERVED_AT_LAUNCH` (74 now). |
| The map | `FUNCTION_PARITY.md` "From `ectd-publishing`" marked carried, and its audit row "Yes (2026-10-29)"; `INFORMATION_ARCHITECTURE.md`'s two rows say folded. |

### Not carried

- **The validation documents.** `docs/validation/URS-004-SUBMISSION-CENTER.md` (URS-SUBC-011 names `PublishingCenter.tsx`), `OQ-004-SUBMISSION-CENTER.md` (OQ-SUBC-14 opens `/concept2cure/ectd-publishing`) and `VMP-001` still name the retired screen, as they still name the retired dossier map. The OQ step does not fail: the link now lands on eCTD Compile, so its second screenshot shows eCTD Compile. Revising controlled validation documents is a change for their owner, not a fold.
- **History notes left as written:** the 2026-09-22 amendment notes in 20260810 and 20260823 (superseded by the 2026-10-29 headers above them), `check-launch-scope.mjs` and its selftest, and the comment in `tests/db/entitlement-grants-resolution.dbtest.ts`. Each records what happened then; none asserts it now.
- **`server/services/ana-ri/message-intent.ts`** keeps `'ectd-publishing': ['ectd']`: the target is still a callable app (`@eCTD reference`), so the enrichment still applies, and it opens eCTD Compile.

### Red, green, mutations (Part 2)

| | Result | File |
|---|---|---|
| Red: the fold guard, the four action cases, the two catalogue cases, the launch-scope guard and the narrowing move, before any Part 2 product change | 13 of the 15 new or moved cases fail. The 2 that pass pin a fact already true (it left the launch lists on 2026-10-08): the launch-scope guard and the fold guard's scope case; P2-M12 and P2-M12f show both failing. The fresh-database catalogue case was rewritten after the 20260814j amendment ("never creates the row"); P2-M15 shows it failing. | `red.txt` |
| Green: those suites and their neighbours, with eCTD Compile's and usage billing's | 12 files, 375 of 375 | `green.txt` |
| Green: every suite that reads the registry, the views, the aliases, navigation, the actions, tours, launch scope or the catalogue (`tools/regression-suites.txt`) | 315 files: 310 pass, 4,464 of 4,476 tests. The 12 failures are in 5 files and fail the same on an export of `70c9e75ad` without this change: `engineChoices`, `oneBoxDuringRun`, `runPolicySwitch`, `composition-boundary-callers`, `template-library-truth`. | `green.txt` |
| Mutations | 18 of 18 red, each caught by a named case or gate: the alias removed; the claims dropped (the narrowing suite and `ci:launch-scope-api`) or widened to `/api/ectd`; the keep-list entry, the heal step, the packaging row and the 20260814j insert each put back (the contract and reconciliation suites, the fold guard); the handlers unregistered; the ready signal not released by the listing; an action left on the retired id; the filter query required again; a view kept; the id put back in the launch app (the launch-scope guard and the fold guard); `ID_BASELINE` left at 108 (`ci:ana-surface-context`); the inventory row put back. Each file was restored and hash-checked, and the tree matched the frozen record after. | `mutations.txt` |

**Gates** (`gates.txt`, Part 2): 45 of 45 exit 0, run against a scratch copy of the index with this change staged. 23 gates list files with `git ls-files`; on the real index the deleted `PublishingCenter.tsx` is still listed and the new files are not, and `ci:class-vocabulary` failed opening the deleted file (shown in `gates.txt`). The run covers every npm gate in `.husky/pre-push`, except `ci:pushed-typecheck` (full-repo, barred here) and the two pushed-lint gates (no unpushed commit; see `eslint.txt`). Among them: `ci:class-vocabulary`, `ci:untracked-imports`, `ci:launch-scope` and its selftest, **`ci:launch-scope-api`** (558 paths, none refused) and its selftest, `ci:ana-surface-context` (107 of 111, baseline 107 exact), `ci:surface-discoverability` (113: 87 in the Apps catalog, 26 contextual), `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:migration-deploy-path`, `check:catalog-copy`, `ci:program-ownership-single-source` and its selftest, `ci:sql-interpolation`, `ci:undefined-css-classes`, `ci:fixture-fallback`, `ci:unauthenticated-fetch`, `audit:repo-health:ceiling`, `ci:unreferenced-modules`, `check:microcopy`.

Scoped tsc over the 19 changed TS files and their imports: 0 errors in this change (the same 3 TS2307s elsewhere). ESLint (`eslint.txt`): no file gains a warning.
