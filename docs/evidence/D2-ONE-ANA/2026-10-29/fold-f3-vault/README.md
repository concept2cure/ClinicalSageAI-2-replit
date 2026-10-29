# The Artifacts center and the device vault fold into the Vault: fold F3 slice C and the checklist commit (D2, 2026-10-29)

**Row:** D2 (`docs/LAUNCH_DEFINITION_OF_DONE.md`). The founder's direction of 2026-10-29: "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- `docs/design/DEVICE_FOLDS_2026-10-29.md`: the common checklist (from `2168fd56`) and §F3;
- the placement map `.design/client-journey/FUNCTION_PARITY.md:672-700` ("Into Vault": from `artifacts-center` and from `device-vault`);
- slice A (`../vault-ana-draft-branch/`, `3038bbe66`) and slice B (`../vault-artifact-leaf/`, `58008b4ac`), whose "Handed on" lists are the step list for this change.

**The work, named for what it is:**
- *complete* the parity the retirement would otherwise drop: *reach* the Artifacts center's read (`GET /api/artifacts-center`) from the Vault as its organization view, and *fix* that read so it lists only the projects the caller can open; *complete* `vault.focus-document` with an artifact id, and *converge* the Live Drive hand-off onto it;
- *fold* `artifacts-center` and `device-vault` into `vault`: delete both screens, their hook, data and route, alias both ids, retire both catalogue rows in place.

Nothing here is built beside an existing implementation. No route was added; one existing route (`GET /api/artifacts-center`) was narrowed, and one (`/api/mdx/vault`) was deleted with its only screen.

## What already exists

Read at `71a10fe2b` (slices A and B merged). Line numbers are at that commit.

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The Vault | `client/src/concept2cure/v2/surfaces/Vault.tsx` | A project's tree over `GET /api/c2c/project-vault/:id`, with the "Governed artifacts" branch (slice A) and the artifact leaf's versions, audit report, governed DOCX, manifest, editor hand-off and Ask AnA (slice B). | With no project open it showed "Open a project to see its vault" and nothing else. No listing across projects. `vault.focus-document` selected by title or section code only. |
| The branch and leaf | `client/src/concept2cure/v2/surfaces/VaultGovernedArtifacts.tsx` | The status breakdown (`GovernedArtifactsLane`), governance, versions, audit report, DOCX fetch, manifest rows. | Nothing across projects. |
| The shared read | `server/services/artifact-registry-read.ts` | One query for both screens. `$2` program or **null for the whole organization**. | With `$2` null it listed every artifact of the organization, archived rows included, with no project-access check. |
| The gallery's read | `server/routes/artifacts-center-routes.ts:159-210` `GET /api/artifacts-center` | The organization's governed artifacts, newest first, LIMIT 200, in the gallery's display shape; claimed by `vault` since slice B. | Organization-only: a member saw the title, kind, signature and project of an artifact in a project the sharing policy does not open to them. `total` was the window's length. |
| The gallery | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:1368-1764` `ArtifactsCenter` | The listing, four-state signature, cited sources and review line, DOCX download (`window.alert` on refusal), Open via `authoring.open-document`, CSV manifest (shared builder), `artifacts-center.focus-artifact`, the Live Drive focus, AnA context. | Subtitle "Every artifact AnA has drafted" over-claimed (slice A: the registry is not AnA's alone). |
| AnA's focus | `shared/navigation/surface-actions.ts:283` `vault.focus-document`; `:641` `artifacts-center.focus-artifact` | Select a vault document by name; focus a gallery row by name. | Neither took an id. |
| Live Drive hand-off | `client/src/concept2cure/v2/V2App.tsx:697-708` `followWork` | Stashes `{ artifactId }` for `artifacts-center` and navigates there. | — |
| The device vault | `client/src/concept2cure/mdx/surfaces/VaultSurface.tsx`, `mdx/hooks/useVault.ts`, `mdx/data/vault.ts`, `server/routes/mdx-vault.ts` | Every artifact and upload of the program with a folder rail by CTD family, a KPI strip, a framework filter, a detail drawer, versions and the five newest audit rows, over `GET /api/mdx/vault` (organization-only versions and audit). | The "framework" was a client-side guess from the kind (`VaultSurface.tsx:47-57`, default `'eng'`). Download and Preview only typed a chat prompt. |
| Sharing policy | `server/services/report-os/project-access.ts` `getAccessibleReportProjectIds`; `server/services/c2c/current-program-access.ts` `readCurrentProgramActor` | The projects a member can open, by the policy `canAccessReportProject` decides one project with; the project Vault admits a project through it (`installProjectRouteAccess` → `requireCurrentProgramAccess`). | — |
| The Vault's deep-link target | `client/src/concept2cure/v2/vaultTarget.ts` | Opens the Vault on one upload (`docId`) after File to Vault. | Uploads only. Not reused: the hand-off already rides the surface-action bus, which holds a directive across navigation and re-attempts on the ready signal. |

### Searches run

- `artifacts-center`, `ArtifactsCenter`, `artifactsCenter` and `device-vault`, `VaultSurface`, `useVault`, `mdx/vault`, `mdx-vault` across `client`, `server`, `shared`, `scripts`, `tests`, `db`, `migrations` (counts per file recorded before any edit; every hit is handled below or is a historical record).
- `getAccessibleReportProjectIds`, `getCurrentAccessibleProgramScope`, `readCurrentProgramActor`: the list form of the policy, and the Vault library search's use of the program form (`project-vault.ts:1348`).
- `consumeNavParams`, `stashNavParamsForTarget`, `applySurfaceAction`, `vaultTarget`: the hand-off channels.
- `/api/atoms`: claimed by `artifacts-center` only; no server mount and no caller.
- Tours (`shared/navigation/demo-scripts.ts`): no stop on either id.
- `concept2cure_artifacts.project_id`: `NOT NULL` (`shared/schema.ts:5968`), so binding the listing by project leaves out no project-less row.

### Deletion history (CLAUDE.md working agreement)

`git log --all --diff-filter=D` on `*ArtifactsCenter*`, `*artifacts-center*`, `client/**/VaultSurface*`, `*useVault*`, `client/src/concept2cure/mdx/data/vault*`, `*mdx-vault*`, `*DeviceVault*`, `*device-vault*`, `**/*Vault*`, `**/*vault*`: one hit, `13337e02a` (2026-10-22, deletion of `vault-structure`, which had no caller). The editor/canvas search the agreement names returns nothing.

**The clone is shallow** (`git rev-parse --is-shallow-repository` is `true`; history reaches back to 2026-10-22), so "nothing deleted" covers that window only.

## Part 1: the parity gaps, closed by reaching what exists

### The organization view (the gallery, folded in)

- **Server, `server/routes/artifacts-center-routes.ts` `GET /`:** reads the caller (`readCurrentProgramActor`) and the projects the sharing policy opens to them (`getAccessibleReportProjectIds`), binds that list into the read before the window and the count, and answers:
  - `{ data, total, meta: { scope: 'accessible-projects', total, listed, truncated } }`; `total` counts every row the scope matches, one past the window tells a full window;
  - a caller who is not a current member: the refusal's own status and code (403 `PROJECT_ACTOR_ACCESS_DENIED`), never an empty listing;
  - a policy that could not be read: 503 `PROJECT_ACCESS_UNAVAILABLE`, never an empty listing;
  - no project open to the caller: an honest empty listing, and the registry is not read.
- **Server, `server/services/artifact-registry-read.ts`:** the scope is a program (the project Vault) **or** a project list (the organization view); exactly one, or it throws. The organization-wide read is gone. Archived rows are left out in both scopes, as the project Vault already did. Binds `[$1 org, $2 program|null, $3 int[]|null, $4 limit]`, nothing interpolated.
- **Client, `client/src/concept2cure/v2/surfaces/VaultOrganizationArtifacts.tsx` (new, the gallery moved):** "Governed artifacts across your projects".
  - Shown below "Open a project to see its vault" when no project is open, which is where `artifacts-center` lands; one click away ("Show governed artifacts across your projects") when a project is open, and read only then.
  - Each row: version, name, kind, the gallery's line verbatim ("2 cited sources · Human review recorded"), format, project, model ("Model not recorded"), updated, the signature on the current version in words (four states, `artifactSignatureLine`), and Download DOCX, Open in editor, Ask AnA.
  - The header says "N governed artifacts in the projects you can open", the window when it is full, and "Only the projects you can open are listed, and archived artifacts are not, as in each project's Vault."
  - A failed read: "… could not be read. Try again. None are listed, and this is not an empty registry." with Try again; a refusal in the classifier's words (`readFailureFor` / `describeReadFailure`), with no Try again where a retry cannot change it.
  - Export manifest through the one builder (`artifactManifest.ts`), file `governed-artifacts-across-projects.csv`, same 17 columns.
- **`VaultGovernedArtifacts.tsx`:** `fetchGovernedDocx(artifactId, title)` is the leaf's DOCX fetch by id, so a row with no tree leaf downloads the same governed export.
- **`Vault.tsx`:** mounts the view, downloads a row through the existing banner, opens a row through the existing `authoring.open-document` path, and publishes the view to AnA (`organizationViewContext`; `organizationArtifacts` in the facts when it is open with a project). A failed read is published as "unavailable — counts unknown, not zero".

### AnA selects an artifact by id; the Live Drive hand-off rides it

- **`shared/navigation/surface-actions.ts` `vault.focus-document`:** `document` is no longer required and `artifactId` is added; the screen refuses neither ("No document named."). No second action.
- **`Vault.tsx` handler:**
  - project open, by id: the leaf whose `artifact.artifactId` it is (`findVaultArtifactLeaf`). An id the tree does not hold gets **one** re-read (AnA may have saved it after the tree was read), then an honest miss: "The artifact … is not in this project's Vault: it belongs to another project, or it is archived."
  - no project open, by id or name: the organization view's row is focused (the gallery's highlight, `.art-row.is-focus`); by name, exact then unique containment; several are named, never guessed; an unknown id is re-read once, then missed in words.
- **`V2App.tsx` `followWork`:** `resolveSurfaceAction('vault.focus-document', { artifactId })` then `applySurfaceAction(…, nav)`, in place of stashing params for `artifacts-center`. The bus holds the directive across the navigation and re-attempts on the Vault's ready signal.

### Parity, every item of `FUNCTION_PARITY.md:672-700`

**From `artifacts-center`:**

| Item | Carried where | Proven by |
|---|---|---|
| AnA-drafted artifacts across all projects | Each project's Governed artifacts branch (`project-vault.ts` `governedArtifactsBranch`, slice A) and the organization view (`VaultOrganizationArtifacts.tsx` over `GET /api/artifacts-center`), **bound to the projects the caller can open, archived rows left out** | `artifacts-center-accessible-projects.pglite.test.ts`; `vaultOrganizationArtifacts.test.tsx` "reads the organization listing…"; slice A's suites |
| Kind, format, model and project | The leaf (`ArtifactGovernanceDetail`) and the organization row | `vaultGovernedArtifacts.test.tsx`; `vaultOrganizationArtifacts.test.tsx` "reads the organization listing…" |
| Signed on the current version (four states) | The leaf and the organization row (`artifactSignatureLine`) | `vaultOrganizationArtifacts.test.tsx` "four states"; slice A |
| Cited-source count and human review | The leaf; the organization row, verbatim (`artifact-governance-<id>`) | `vaultOrganizationArtifacts.test.tsx` "verbatim"; `tests/e2e/golden-customer-journey.e2e.ts` (retargeted; not run here) |
| Governed DOCX download | The leaf (slice B) and the organization row, through `fetchGovernedDocx`; refusals in the banner, no `window.alert` | `vaultArtifactLeaf.test.tsx`; `vaultOrganizationArtifacts.test.tsx` "downloads a row's governed DOCX" |
| Open an artifact in the editor | `authoring.open-document` by title, from the leaf and the row | `vaultArtifactLeaf.test.tsx`; `vaultOrganizationArtifacts.test.tsx` "opens a row in the editor" |
| CSV index | `artifactManifest.ts`, from the branch and the organization view | `vaultArtifactLeaf.test.tsx`; `vaultOrganizationArtifacts.test.tsx` "exports the listing" (the gallery's case moved there) |
| Follow the work after a Live Drive turn | `V2App.tsx` `followWork` → `vault.focus-document { artifactId }` | `foldVaultArtifactsCenter.test.ts` (the source pin); `vaultOrganizationArtifacts.test.tsx` "selects the leaf…", "found on one re-read", "honest miss", "focuses the row in the organization view" |
| AnA focuses an artifact | `vault.focus-document`, by name or id, in the tree or the organization view | the same; `artifacts-center.focus-artifact` is removed (fold guard) |
| AnA sees the gallery | The Vault's context: `organizationArtifacts` (counts, signature states, review, projects, 15 named rows) | `vaultOrganizationArtifacts.test.tsx` "tells AnA what the view shows" |
| Catalogue entry and launch module | Retired: `20260810` and `20260823` amended in place; off `LAUNCH_MODULE_IDS`; the Vault is free at the same tier | `catalog-module-claims.contract.test.ts` "Retired Artifacts center and device vault"; `launch-scope.test.ts` "the folded Artifacts center and device vault" |

**From `device-vault`:**

| Item | Carried where | Proven by |
|---|---|---|
| The subtitle "SHA-256 chained · 7-year minimum retention" | **Not carried**, as the map says | slice A pins its absence in the Vault (`vaultGovernedArtifacts.test.tsx`) |
| Every document of the device project | The Governed artifacts branch across all CTD sections, and the filing cabinet for uploads | slice A's PGlite suite |
| Status, version and author on each row | The leaf | slice A |
| Folder rail by family | The branch grouped by CTD module (`artifactsFolder`: Module 1-5, then No CTD section), browsable in the tree and by `vault.open-folder` | `project-vault-governed-artifacts.test.ts` (section order); `vaultGovernedArtifacts.test.tsx` |
| KPI strip | The lane's status breakdown (`GovernedArtifactsLane`) and the uploads lane. **Not carried:** "Vault size" (a sum of rendered sizes) and the retention tile (it said "—", nothing to count); the map names the status breakdown only | `vaultGovernedArtifacts.test.tsx` |
| Filter by framework | **Not carried, dropped as an unrecorded inference** (main, 2026-10-29). The device "framework" was never recorded on a row: `VaultSurface.tsx:47-57,89` guessed it from the kind (clinical as PMA, any other kind as engineering). The Vault's type and CTD filters filter uploads only. The replacement is **browse by CTD module** (the row above). A framework view needs a recorded framework on the row first; that is the founder's decision | the folder-rail row |
| Ask AnA from each row | The leaf's Ask AnA (slice B) and the organization row's | `vaultArtifactLeaf.test.tsx`; `vaultOrganizationArtifacts.test.tsx` |
| Detail drawer with content hash | The recorded hash on the leaf | slice A |
| Version history | `ArtifactVersions` over `c2c/artifacts.ts …/versions` (slice B) | `vaultArtifactLeaf.test.tsx` |
| Recent audit trail | `ArtifactAuditReport` (slice B): signatures, provenance, exports and the hash verdict, read on request | `vaultArtifactLeaf.test.tsx` |
| Download button (a chat prompt only) | Not carried (not real); the governed DOCX is the real download | — |
| Preview button (a chat prompt only) | Not carried (not real) | — |
| Catalogue entry and device feature listing | Retired; off `MDX_PROJECT_FEATURE_SURFACE_IDS` and the Projects app | contract and launch-scope cases above; `ProjectMdxWorkflow.test.tsx` |

## Part 2: the checklist commit

| Step | Change |
|---|---|
| 1. Sources | Deleted: `ArtifactsCenter` and its `ArtifactRow`, `signatureState`, `manifestRow`, `downloadArtifact` (with its `window.alert`), and the subtitle, from `AdminSurfaces.tsx`; `ARTIFACT_FMT`, `ArtifactFormat` and the unused `ArtifactEntry` type from `fixtures/admin-data.ts`; `mdx/surfaces/VaultSurface.tsx`, `mdx/hooks/useVault.ts`, `mdx/data/vault.ts`; `server/routes/mdx-vault.ts` and its mount (`register-inline-routes.ts`, router and `requireTenantContext` sub-tree). Tests deleted with them: `artifactsCenterStaleSignature.test.tsx` (its case is in `vaultOrganizationArtifacts.test.tsx`), `VaultSurface.noUnbackedClaim`, `VaultSurface.noInventedRecord`, `useVault.qa`, `mdx-vault-admits-project`, `mdx-vault-audit`. Trimmed: `uploadedFileHasNoAuthoringState.test.ts` (keeps `averageAssessedCompletion`), `mdxDerivedFiguresAreDerived.test.ts` (keeps PMA), `mdx-beta-surfaces-routes.test.ts`, the gallery cases of `anaDrivesWave3/4` and `vaultArtifactLeaf`. |
| 2. `MdxSurfaceHost.tsx` | `device-vault`'s import, meta entry, publish and switch case. It was not in `ORGANIZATION_VIEWS`. |
| 3. Ids and claims | Out of `mdx/surfaceIds.ts`, `v2/surfaceViews.ts`, `ui-surface-registry.ts` (`artifacts-center`) and `ui-surface-registry.ui-v2.ts` (`device-vault`). `/api/artifacts-center` is the Vault's claim alone; `/api/atoms` and `/api/mdx/vault` are unclaimed (no route for either now). `launch-scope-device-features.test.ts` `HOOKS` loses `useVault.ts`. |
| 4. `registryModel.ts` | `DEEP_LINK_ALIASES`: `artifacts-center` → `vault`, `device-vault` → `vault`. Off `SEGMENT_MODULES` (five rails). Neither was in `NAV_GROUP_OF`, `NAV_HIDDEN` or `SURFACE_ACTIONS`. No `ALIAS_APPLIES`: with no project open the organization view is the landing. |
| 5. Scope lists | `launch-scope.ts`: the Vault app is `['vault']` / `['vault']` (so `LAUNCH_MODULE_IDS` loses `artifacts-center`); `device-vault` off the Projects app; `mdx-project-features.ts`. Guard in `launch-scope.test.ts`. |
| 6. Catalogue (Rule 1) | `db/migrations/20260810_reconcile_module_catalog.sql`: both ids off step 1's keep-list and step 2's upsert, with a dated header. `20260823_module_catalog_commercial_packaging.sql`: both packaging rows removed, with a dated header. No DELETE, no appended DROP; rows and subscriptions are kept, deprecated. Contract cases: a fresh database twice, and a replay with a subscription and an FK. |
| 7. AnA | The `artifacts-center` and `device-vault` navigation targets stay and resolve through the alias; their descriptions say where they land, and `artifacts-center`'s `artifactId` param went with the gallery that read it. `artifacts-center.focus-artifact` is removed; `vault.focus-document` replaces it. |
| 8. Tours | No tour stopped on either id; the fold guard pins that none does. |
| 9. CI | `ID_BASELINE` 112 → 110 (`check-ana-surface-context.mjs`); `REAL.components` loses `device-vault` (`check-launch-scope-api.ts`); `dump-v2-surfaces.spec.tsx`; `NO_PROJECT_DOOR` (19 features); `launch-scope-api-gate.test.ts` and `launch-reproof-narrowing.test.ts` move `/api/mdx/vault` back to "not served"; `vault-artifact-leaf-gate.test.ts` pins the Vault-only claim; `mdx-prefix-gate.test.ts` and `rls-scoped-route-mounts-tranche2.contract.test.ts` lose the vault sub-tree. Baselines lowered: `sql-interpolation-baseline.json` and `tenant-resolvers-baseline.json` lose `mdx-vault.ts`. |
| 10. Fold guard | `client/src/concept2cure/v2/__tests__/foldVaultArtifactsCenter.test.ts`, on `foldDeviceTasks.test.ts`'s model. |
| Also | `fixtures/collab-data.ts` loses the `artifacts-center` context entry; `shellNav.test.tsx`'s ⌘K case and the golden journey e2e reach the Vault by its name. |

## Red, green, mutations

| | Result | File |
|---|---|---|
| Red, Part 1, at `e2cf417ba` with no product change (the 2 new suites) | 27 of 27 fail | `red.txt` |
| Red, the fold guard, on the tree after Part 1 and before any retirement edit | 8 of 9 fail; the one that passes pins the destination (the Vault mounts) | `red.txt` |
| Red, the two catalogue contract cases | shown by M16 and M17 (each migration's row restored alone) | `mutations.txt` |
| Green on the working tree over `1853a312f` | server and shared: 110 files, 1436 of 1437 tests (the one is `module-grants.test.ts`, which reads `git ls-files`: 6 of 6 on a scratch index with the deletions staged); client: 173 files, 1876 of 1876 | `green.txt` |
| Mutations of the product code | 18 of 18 red, each restored and hash-checked, then every file of the change hash-checked again | `mutations.txt` |

`red.txt` records two edits to the Part 1 tests after the red run, and what each does to the red.

**The new suites:**
- `server/routes/__tests__/artifacts-center-accessible-projects.pglite.test.ts` (8, the real read on PostgreSQL): an open project's rows and a legacy open project's rows are listed; a project the caller cannot open, an archived row, a row under another organization's project id and another organization's row are not, by id or by name; the sharing policy is asked about this caller in this organization; no open project lists nothing and reads no registry row; a refused caller is a 403 and an unverifiable policy a 503, never an empty listing; a full window says how many it did not list.
- `client/src/concept2cure/v2/__tests__/vaultOrganizationArtifacts.test.tsx` (19): the view with no project open (governance, four signature states, the gallery's line verbatim, scope and window, none, failure with retry, refusal without), the manifest, the DOCX and its refusal, the editor, Ask AnA, AnA's context and its failure; read only when opened with a project open; `vault.focus-document` by id in the registry, selecting a leaf, one re-read, an honest miss, the organization row by id and by name, several named, none refused.
- `client/src/concept2cure/v2/__tests__/foldVaultArtifactsCenter.test.ts` (9): the fold guard. It reads code without comments, so a note that a screen retired is not counted as a use.
- `tests/schema-contract/catalog-module-claims.contract.test.ts`: "Retired Artifacts center and device vault" (2 cases).
- `server/services/entitlements/__tests__/launch-scope.test.ts`: "the folded Artifacts center and device vault".

**The mutations:**

| # | Mutation | Red in |
|---|---|---|
| M1 | the organization read loses its project binding | accessible-projects PGlite (3) |
| M2 | archived artifacts kept in both scopes | accessible-projects PGlite, project-vault route (4) |
| M3 | an access check that could not run answered as an empty listing | accessible-projects PGlite (2) |
| M4 | a full window not said | accessible-projects PGlite |
| M5 | the organization view renders a failed read as none | client (2) |
| M6 | a stale signature shown as current in the organization view | client (2) |
| M7 | AnA told counts over a failed organization read | client |
| M8 | focus by id misses without the one re-read | client (2) |
| M9 | a name matching several artifacts focuses the first | client |
| M10 | the listing read while a project is open and nobody opened it | client |
| M11 | the Live Drive hand-off still goes to the Artifacts center | fold guard |
| M12 | the `device-vault` alias removed | fold guard |
| M13 | `artifacts-center` left in the Vault app | fold guard, launch-scope (3) |
| M14 | the `device-vault` registry entry restored | fold guard |
| M15 | `artifacts-center.focus-artifact` left in AnA's registry | fold guard |
| M16 | `20260810` keeps `artifacts-center` on its keep-list | catalogue contract (replay) |
| M17 | `20260823` keeps the `device-vault` packaging row | catalogue contract (the fresh database's unknown-module guard raises) |
| M18 | `ID_BASELINE` left at 112 | `ci:ana-surface-context` ("FELL to 110, below the baseline of 112") |

## Gates

On the working tree over `1853a312f` (`gates.txt`):

| Gate | Result |
|---|---|
| `ci:launch-scope` and its selftest | OK |
| `ci:launch-scope-api` and its selftest | OK, 543 paths, none refused |
| `ci:ana-surface-context` | OK, 110 of 115, baseline 110 exact |
| `ci:surface-discoverability` | OK, 117 renderable surfaces |
| `ci:migration-drop-safety` and its selftest | OK (no DROP appended; both files amended in place) |
| `ci:migration-set-order`, `ci:migration-deploy-path` | OK (no file added to the set; `scripts/db/migration-set.mjs` not touched) |
| `check:catalog-copy` | OK |
| `ci:program-ownership-single-source` | OK on a scratch index copy with the 10 deletions staged; it reads `git ls-files`, so in the shared tree it fails until the deletions are staged |
| `ci:sql-interpolation` | OK; the `mdx-vault.ts` baseline entry (5) removed with the file; no SQL interpolated (the new read binds `$3::int[]`) |
| `ci:undefined-css-classes` | OK (the organization view uses the gallery's existing classes) |
| `ci:unreferenced-modules` | OK, 73 (baseline 73) |
| `ci:tenant-resolvers` | OK; `mdx-vault.ts` removed from its baseline |
| ESLint, every changed file | no file gains a warning (`eslint.txt`); `AdminSurfaces.tsx` 11 → 9 |
| Scoped `tsc` | 0 errors in this change's files |

## Found, not fixed

- **Under `MODULE_ENFORCEMENT=enforce`** (default `off`, never turned on), a device organization's artifact versions and audit report are refused in the Vault leaf: the leaf's reads are under `/api/concept2cure/projects`, whose `vault` claim slice B declined (main, 2026-10-29), unchanged here. Until this change the device vault's organization-only `/api/mdx/vault/:id/versions` served it under enforcement. Nothing changed now (main).
- **`GET /api/artifacts-center/:artifactId/export`** is organization-bound, not project-bound: it serves an artifact's DOCX by id to a member of the organization whether or not the sharing policy opens its project to them. The listing no longer names such an artifact; the export route was not changed (slice B's "Not project-bound").
- **An organization holding `artifacts-center` and not `vault`** is refused the export under enforcement now: the claim is the Vault's alone. Both were launch modules, so every organization created under the launch grant holds both.
- **`ci:requestdb-coverage`** (`audit-requestdb-coverage.mjs --strict-no-regression`) is red on two routes this change does not touch (`document-lifecycle-review-route.ts`, `mdx-labeling-approvals.ts`); it reports `mdx-vault.ts` as one route migrated off the shared pool. Its baseline was not rewritten here, since that would also absorb the two.
- **`vaultFrameworksForView`** (`shared/constants/domain/vault-taxonomy.ts`) has no reader now that `mdx/data/vault.ts` is gone; left (a shared taxonomy module, not this fold's).
- **`ui_kits/mdx/data/vault.js`**, the design kit's copy, still documents `GET /api/mdx/vault`; the kit is not shipped.
- **Comments outside this fold's files that still describe the deleted code as current**, left for their owners (other folds have those files in flight): `client/src/concept2cure/mdx/workbench/Workbench.tsx:7-8` ("The vault lives in surfaces/VaultSurface.tsx"), `server/api/gcc/index.ts:10`, `server/routes/mdx-engineering.ts:43,444` ("the bridge the device Vault reads"), `shared/constants/domain/vault-taxonomy.ts:26-28`, `scripts/seed/ga-demo.d/70-vault-memory-symbols.mjs:6,17` (the demo seed still fills the rows; the Vault reads them). Historical notes elsewhere (`program-project-anchor.ts`, `vault-document-index.service.ts`, `mdx-audit.ts`, `migration-set.mjs`) are accurate as history.

## Files

`files.txt`: 4 new, 10 deleted, 48 modified, and this folder. Evidence: `README.md`, `red.txt`, `green.txt`, `mutations.txt`, `gates.txt`, `eslint.txt`, `files.txt`, `tools/` (`mutate.py.txt`, `mutation-spec.json`, `eslint-compare.sh.txt`).
