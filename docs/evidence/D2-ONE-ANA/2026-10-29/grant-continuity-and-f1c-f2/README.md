# Grant continuity across folds (P-61 item 4), then folds F1c and F2

Launch row D2 (one AnA; the device folds). Date 2026-10-29. Item 1 over `d140aefa5`, committed as `92bb29868`. Item 2 over `aa861b9a2`.

- Decision: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-61 item 4, decided 2026-10-29 under the founder's delegation (first numbered P-54).
- Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, F1 and F2 and the common checklist.

**Item 1, grant continuity: done** (`92bb29868`). A subscription to a folded module entitles its holder to the fold's target. The mapping is `FOLDED_MODULE_SUCCESSORS` (`server/services/entitlements/folded-module-successors.ts`). Its one reader is `grantsHeldThroughFolds`, and its one caller is `readLicenseInfo` (`server/services/license-manager.ts`). No grant row is written, and every subscription is kept.

**Item 2, folds F1c and F2: done.**

- Risk management (`risk`) and Design controls (`design-controls`) are folded into Engineering evidence (`device-engineering`).
- IVD completeness (`ivd-completeness`) is folded into IVDR evidence (`device-diagnostics`).
- The three screens are deleted. Their ids are aliases, and their catalogue rows are amended in place (Rule 1).
- Their grants carry, through three new mapping entries. See "Item 2" below.

## What already exists

Every place a module id's entitlement is answered, found before anything was written:

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The grant read | `server/services/license-manager.ts` `readLicenseInfo` | Reads the organization's tier and industry, and its live grants (`enabled = true`, unexpired, by `isGrantExpired`) as `enabledModules`. `canAccessModule` and `getModuleCatalog` both call it. | Nothing read a folded module's grant once its screen was gone. |
| The access answer | same file, `canAccessModule` | Own grant, then the catalogue row (missing: "does not exist"), then the row's revocation (unless `ignoreRevocation`), then tier and industry. Callers: the module gate, `GET /api/module-subscriptions/check/:moduleId`, the admin toggle `PUT /:moduleId/toggle` (with `ignoreRevocation`), and `requireModule`, which gates no route. | — |
| The module gate | `server/middleware/moduleEntitlementGate.ts`, over `buildPrefixMap` / `modulesForPath` (`server/services/entitlements/api-prefix-map.ts`) | A path is served when the organization is entitled to any module that claims it in `UI_SURFACES`. Launch scope is checked first. | After a fold the source's registry entry is gone, so the target alone claims the paths, and only the target's verdict is asked. |
| The catalogue answer | same file, `getModuleCatalog` | One entry per live (non-deprecated) catalogue row, with `subscriptionState` from the row, `isAvailable` from tier and industry. Read by `GET /catalog`, `resolveNavEntitlements`, and `server/services/licensing/entitlements-service.ts`. | A folded module's row is deprecated, so it is not listed, and its grant reached nothing. |
| The rail, ⌘K and AnA's targets | `server/services/entitlements/navigation-entitlements.ts` `decideNavEntitlement` over `getModuleCatalog`; `GET /api/module-subscriptions/navigation` | One verdict per catalogue module. On the client, `navEntitlements.tsx` `verdictFor(id)` is keyed on the destination: `Shell.tsx:151` (rail), `:774` (⌘K), `V2App.tsx:259` (AnA's targets through `resolveSurfaceIdForTarget`), `LaunchScopeGate.tsx:34`, `surfaceAvailable.ts:20`. An old id is turned into its target by `DEEP_LINK_ALIASES` before the verdict is read (`routing.ts`, the F2 grant finding). | — |
| The Apps catalogue screen | `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx` `moduleVerdict` | Mirrors `decideNavEntitlement` over `GET /catalog`'s `subscriptionState`, `isEnabled` and `isAvailable`. | — |
| The operator console | `server/routes/admin/master-licensing.ts` `GET /licensing/tenants/:id`, `effectiveVerdict` | Mirrors `decideNavEntitlement` over its own SQL, so the console shows what the customer's rail shows. | It reads rows only. With the carried grant in the resolver alone, it would have disagreed with the rail. |
| Trial lapse preview | `server/routes/admin/licensing-trials.ts` `coveredByTier` | Whether the plan still covers a module when a trial lapses. | Not changed (see "Not carried"). |
| Capabilities page | `server/services/entitlements/resolver.ts` `resolveCapabilities` | Lists the organization's subscription rows as they are. | It is a list of rows, not a verdict. Not changed. |
| Legacy IVDR gate | `server/bootstrap/register-regulatory-routes.ts` `requireIVDRAccess` | Checks `am.module_key = 'ivdr_module'` for `/api/ivdr`. | It reads the legacy taxonomy, not a catalogue module id. Not changed. |
| AnA's profile | `server/services/user-intelligence.ts` `loadOrganizationProfile` | Lists enabled rows for AnA's context. | Context, not an access answer. Not changed. |

Searches run:

- `FOLDED_MODULE`, `moduleSuccessor`, `MODULE_SUCCESSOR`, `successor`: nothing in code (only the decision text and the plan).
- `canAccessModule`, `getModuleCatalog`, `readLicenseInfo`, `getLicenseInfo`, `decideNavEntitlement`, `resolveNavEntitlements`, `requireModule(`, `enabledModules`, `subscriptionState`, `module_subscriptions` and `available_modules` across `server`, `shared`, `client/src` and `scripts`.
- `git log --all --diff-filter=D` on `*entitle*`, `*license*` and `*licens*`: nothing deleted that answered a module's entitlement.

Nothing was built beside an existing piece. The grant read, the access answer and the catalogue answer are extended in place. The console reads the resolver's answer instead of a second copy of the mapping.

## The mapping

Each source's catalogue status before its fold was found by replaying every catalogue writer of `C2C_MIGRATION_FILES`, in deploy order, on a fresh PGlite at the fold's parent commit (`tools/catalog-at.mjs.txt`, output in `catalogue-at-each-fold.txt`).

| Source | Target | Fold commit | Source before the fold | Target now | Mapped |
|---|---|---|---|---|---|
| `device-tasks` | `tasks` | `2168fd56` | catalogue module, standard | catalogue module, free | yes |
| `device-vault` | `vault` | `b9de04c62` | catalogue module, standard | catalogue module, free | yes |
| `artifacts-center` | `vault` | `b9de04c62` | catalogue module, free | catalogue module, free | yes |
| `ectd-publishing` | `ectd-compile` | `302d632db` | catalogue module, standard | catalogue module, standard | yes |
| `risk` | `device-engineering` | this change (F1c; product `59b1482d2`, `79d00b348`) | catalogue module, standard | catalogue module, standard | yes (item 2) |
| `design-controls` | `device-engineering` | this change (F1c) | catalogue module, standard (`20260814j`, re-keyed by `20260823_module_catalog_mdx_registers`) | catalogue module, standard | yes (item 2) |
| `ivd-completeness` | `device-diagnostics` | this change (F2; product `1a6701ea6`) | catalogue module, standard | catalogue module, standard | yes (item 2) |
| `part11-console` | `audit-trail` | `66efa6179` | shell surface, no catalogue row (on the keep-list, never seeded) | no row, on purpose (21 CFR 11.10(e)) | no |
| `ana-memory` | `conversation-thread` | `78877084f` | shell surface, no catalogue row | no row | no |
| `setup` | `admin-console` | `beede0408` | shell surface, no catalogue row | no row | no |
| `billing` | `licensing` | `d140aefa5` | shell surface, no catalogue row | no row | no |

A screen with no catalogue row can hold no subscription: `module_subscriptions.module_id` references `available_modules(module_id)` (`migrations/0000_sweet_joseph.sql:6711`). So there is nothing to carry for the four shell surfaces. They are listed in `FOLDED_WITHOUT_CATALOGUE_ROW`, so the omission is stated in code.

Every target is packaged at or below its source's tier, and none has an industry list. So a plan that included the source includes the target already, and only a grant can carry anything. Tasks and the Vault are free, which every plan includes: for `device-tasks`, `device-vault` and `artifacts-center`, the mapping changes no answer today. It holds if either is ever re-tiered.

## What a carried grant is, and its precedence

- **What carries:** a live grant of the folded module, the rows `readLicenseInfo` already reads as `enabledModules`.
- **What does not carry:**
  - a lapsed grant;
  - a revocation (`enabled = false`) of the folded module;
  - the folded module's plan inclusion (see above).
- **Precedence on the target,** the same in `canAccessModule` and `getModuleCatalog`:
  1. the target's own row: a grant allows, and a revocation refuses;
  2. a carried grant;
  3. the plan.

  So a revocation an administrator wrote on the target stands, and the toggle can switch it back on (`ignoreRevocation` sees the carried grant).
- **How it reads:**
  - `canAccessModule` answers `{ allowed: true, heldThrough: '<source>' }`.
  - The catalogue entry is `subscriptionState: 'enabled'`, `isEnabled: true`, with `heldThrough`, so `decideNavEntitlement`, the Apps catalogue's mirror and the toggle all resolve it as a grant with no branch of their own. This follows the lapsed-grant precedent in `getModuleCatalog`.
  - The rail reports `subscribed`.
  - The console's tenant read takes `heldThroughFolds` from `readLicenseInfo`.

The decision says the subscription entitles. It does not say what happens when an administrator has switched the target off. The lead ruled on it (2026-10-29): **revocation wins.** An explicit row on the target module is the most specific, attributable statement an admin has made, and a fold must never silently override it. The admin can switch it back on.

The case in point is the F2 grant finding's kind 1: device-diagnostics switched off while ivd-completeness is granted. Such an organization keeps the screen off until its administrator switches device-diagnostics on. Pinned both ways, M3 below. Reversing it means moving one block above the revocation check in `canAccessModule`, and the `own === 'none'` condition in `catalogSubscription`.

## The pin

`server/services/entitlements/__tests__/folded-module-grant-continuity.test.ts`. The DB-facing parts are real:

- the real gate, as production builds it (`launchScope: 'on'`, `unattributed: 'enforce'`, `MODULE_ENFORCEMENT=enforce`);
- the real registry;
- the real `canAccessModule`, `getModuleCatalog` and `resolveNavEntitlements`, and the console router.

They run over a PGlite database that holds:

- every catalogue writer of `C2C_MIGRATION_FILES`, in deploy order;
- each folded module's row as it stood before its fold, with the catalogue set replayed over it, so the row is deprecated and its grants are kept: what a deployed database holds;
- the real `module_subscriptions` key to the catalogue.

Every organization is on the free plan. Only `resolveMasterAdmin` is stubbed (false).

What it pins:

- The mapping equals the table above, and each folded id's `DEEP_LINK_ALIASES` entry is the same target.
- Each target is a live catalogue module, and each source's row is kept, deprecated.
- The four shell surfaces have no row.
- **Gate:**
  - an organization holding only the source is served every one of the target's gated paths;
  - an organization holding neither is refused (403 `MODULE_NOT_LICENSED`) every path the fold family alone claims on a tiered target, and is served by plan on a free one;
  - a revocation on the target refuses;
  - a lapsed or revoked source grant carries nothing;
  - the target's own grant serves.
- **Resolver:**
  - `canAccessModule`, including the toggle's `ignoreRevocation`;
  - the catalogue entry, and the folded module not listed;
  - the rail (`subscribed`; `tier` for neither; `disabled` when revoked);
  - the console's tenant read.
- **One place:** only `folded-module-successors.ts` names `FOLDED_MODULE_SUCCESSORS`. Only it and `license-manager.ts` name `grantsHeldThroughFolds`, and `license-manager.ts` calls it once.

**Red** (`red.txt`): written before `license-manager.ts` read the mapping, with the mapping file present: 6 failed, 11 passed (17).

- An organization holding only `ectd-publishing` was refused all 11 eCTD Compile paths.
- `canAccessModule` answered "requires standard tier or higher (current: free)".
- The catalogue entry was `none`, and the rail said `included` for Tasks instead of `subscribed`.
- The one-place guard found no caller.

The console cases were added with the change. M7 is their red.

**Green** (`green.txt`): 19 of 19. The 16 suites around the resolver pass one file at a time (162 tests):

- `grant-expiry`, `license-manager-reports-what-it-read` and `navigation-entitlements`;
- the four `module-subscriptions` route suites;
- `master-licensing`, `moduleEntitlementGate`, `moduleEntitlementMasterAdmin` and `engineering-risk-design-controls-gate`;
- `entitlements-acceptance-not-assumed`, `resolver-unread-layer-not-a-default`, `workspace-config-gateway-size-limit-only-where-on-file` and `deep-research-board-a-failed-connector-is-an-error`;
- the client's `appsCatalogEntitlement`.

**Mutations** (`mutations.txt`, runner `tools/mutate.py.txt`): 10 of 10 red, each restored byte for byte (sha256), and `sha256sum -c` over the three files after the run.

| Id | Mutation | Red on |
|---|---|---|
| M1 | the licence read derives no carried grant | gate, `canAccessModule`, catalogue, rail, console (6) |
| M2 | `canAccessModule` ignores the carried grant | gate, `canAccessModule` (3) |
| M3 | the carried grant is read before the target's own revocation | the revocation stands (2) |
| M4 | the catalogue ignores the carried grant | catalogue, rail (2) |
| M5 | the catalogue carries over the target's own revocation | catalogue, rail (2) |
| M6 | a lapsed grant of the folded module carries | the lapsed case (1) |
| M7 | the console ignores the carried grant | console (1) |
| M8 | `canAccessModule` consults the mapping a second time, with the same answer | the one-place guard (1) |
| M9 | the mapping drops `ectd-publishing` | mapping, gate, resolver, console (7) |
| M10 | the mapping carries `billing`, which had no catalogue row | mapping (1) |

**Gates for item 1:**

- **eslint** (plain `npx eslint --no-ignore`): the same warning count as head on every changed file. `license-manager.ts` 1 (`canAccessModule` complexity, 20 to 21), `master-licensing.ts` 1, `navigation-entitlements.ts` 2. The new files have 0. The catalogue row mapper's added branches went into a pure helper, `catalogSubscription`, rather than adding a warning.
- **tsc,** scoped (`tools/tsconfig.item1.json.txt`): 0 errors over 127 repository files.

## Not carried (item 1)

- **`coveredByTier`** (`licensing-trials.ts`, the trial-lapse preview) still answers by plan only. A trial of a fold's target, held besides through a folded module's grant, is reported as lost on lapse when the carried grant would keep it. That is an operator preview, not an access answer.
- **The real-PostgreSQL console test** (`tests/db/master-licensing-console.dbtest.ts`) needs a PostgreSQL server and was not run here.
- **Which organizations hold a carried grant** is not known: there is no production database here. The F2 finding's `class-query.sql` shape answers it for one pair.

## Item 2: folds F1c and F2

The plan is `DEVICE_FOLDS_2026-10-29.md` F1 "Work" item 5 and F2 "Work" item 5, plus the common checklist. The product work was already done:

- **F1:** slices A and B, `59b1482d2` and `79d00b348` (`../fold-f1a-risk-design-controls-safety/`, `../fold-f1b-engineering-parity/`). device-engineering has shared the two families' claims since `66d688db9`.
- **F2:** `1a6701ea6` (`../fold-f2-ivd-completeness/`). device-diagnostics has shared the IVD claims since `a86ed04ed`.

This change is the fold itself, and the items those READMEs left for it.

### What already exists (item 2)

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| Risk screen | `client/src/concept2cure/v2/surfaces/Risk.tsx` | A header over the shared register, and the publish of its AnA context as `risk`. | Nothing Engineering lacks (F1b parity). |
| Design controls screen | `client/src/concept2cure/v2/surfaces/DesignControls.tsx` | A header over the shared trace, and the publish as `design-controls`. | The same. |
| IVD completeness screen | `client/src/concept2cure/v2/surfaces/IvdCompleteness.tsx` | The board and the workbench for the open project (or the organization), and the publish as `ivd-completeness`. | — |
| The register, the trace, the read | `v2/surfaces/RiskRegister.tsx`, `v2/surfaces/DesignControlsTrace.tsx`, `v2/projectScopedRead.tsx` | One implementation each, mounted by Engineering and by the older screens. | — |
| Engineering | `mdx/surfaces/EngineeringSurface.tsx` | Mounts both panels for its project. It hands their AnA context to the host, which merges it into device-engineering's one publish (`MdxSurfaceHost.tsx` `withEngineeringPanels`, `engineeringPanelsContext.ts`). | — |
| IVDR evidence | `mdx/surfaces/IvdSurface.tsx` | Mounts the board and the workbench for its project. | It received no `onNav` from the host, so the workbench's working copy was disabled. Nothing published the board's AnA context under device-diagnostics. |
| Registry entries | `shared/constants/ui-surface-registry.ts` (`risk`), `ui-surface-registry.ui-v2.ts` (`design-controls`, `ivd-completeness`) | Each claimed its families. | — |
| Catalogue writers | `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_commercial_packaging.sql` and `20260823_module_catalog_customer_copy.sql` (`risk`, `ivd-completeness`); `migrations/20260814j_catalog_missing_product_surfaces.sql` and `db/migrations/20260823_module_catalog_mdx_registers.sql` (`design-controls`) | Seed, keep, tier and describe the rows. | — |
| AnA | `shared/navigation/index.ts:134` (`risk` target); `shared/navigation/surface-actions.ts` `riskMatrixActions('risk', …)`; `registryModel.ts` `SURFACE_ACTIONS` (`risk`, `ivd-completeness`) | — | — |
| Tours | `shared/navigation/demo-scripts.ts`, `training-medtech` and `sales-medtech` | Navigate to `risk` and drive `risk.*`. | — |

The plan says design-controls "has no catalogue row", and that is wrong: two writers seed it. 20260814j inserts it, and 20260823_module_catalog_mdx_registers re-keys it at standard. That file's own header already corrects the same mistake.

Searches run:

- the three ids;
- `Risk`, `DesignControls`, `IvdCompleteness`, `riskMatrixActions` and `risk.` action ids;
- every catalogue writer.

They ran across `client/src`, `shared`, `server`, `scripts`, `tests`, `migrations`, `db/migrations`, `config` and `docs/validation`. No validation document names the three screens.

History: `git log --all --diff-filter=D` over `client/**/*Risk*`, `*DesignControl*`, `*IvdCompleteness*`, `*ivdCompleteness*`, `*riskAndDesign*`, `*Engineering*` and `*IvdSurface*` finds nothing deleted. The clone is shallow (1,400 commits).

Nothing is built beside an existing piece:

- **Engineering's context merge:** the report-to-host mechanism moved out of `engineeringPanelsContext.ts` into one hook, `mdx/surfaces/hostContextReport.ts` `useReportToHost`. Engineering's panels, IVDR evidence's board and the test harness use it.
- **IVDR evidence's merge:** the host's `withIvdReadiness`, the twin of `withEngineeringPanels`.

### Parity

**F1c, into device-engineering.** F1b's parity table (`../fold-f1b-engineering-parity/README.md`, "Parity") holds at head:

- The trace's matrix, gap breakdown and "Close the first gap", the §7.3 checklist, add a design input with the project, per-row Ask AnA and the "store not provisioned" state are present.
- The register, the 5×5 matrix with its initial/residual toggle, the hazard drawer, metrics and lead, add a hazard with the project, add a control, the signed Accept residual, AnA's three matrix actions and the hazard entity context are present.

Two things were left for the fold and are done here:

| Function | Where | Status |
|---|---|---|
| AnA's screen context for both panels | Engineering hands it to the host, which merges it into device-engineering's publish (`facts.riskRegister`, `facts.designControlsTrace`) | Present since `device-vault-admits-project` fix 2, kept |
| AnA's matrix actions | `device-engineering.*` only; `risk.*` removed | Done here |
| The tours | Both medtech tours drive Engineering | Done here |

**F2, into device-diagnostics.** The fold slice's parity check (`../fold-f2-ivd-completeness/fold/README.md`) left four gaps, each closed here:

| Gap | Closed by |
|---|---|
| The workbench's working copy was disabled | The host passes `onNav` to `IvdSurface` |
| AnA did not see the readiness | `IvdSurface` hands `ivdReadinessContext(...)` to the host (`onReadinessContext`), merged into device-diagnostics' publish as `facts.ivdReadiness` (`ivdReadinessAnaContext.test.tsx`) |
| `assess_filing_readiness` not on device-diagnostics | `SURFACE_ACTIONS['device-diagnostics']` |
| The IVD claims were ivd-completeness's | All four moved to device-diagnostics (below) |

Its "the 403 reads as 'organization could not be confirmed'" note was fixed upstream already (`readRefusalOf` names MODULE_NOT_LICENSED; `IvdSurface.readiness.test.tsx`).

### The checklist, as done

1. **Deleted:** `Risk.tsx`, `DesignControls.tsx` and `IvdCompleteness.tsx`. Two suites were deleted with them (see "Deletions"). Nothing else imported them, apart from the re-exports `mapRiskItems`, `postResidualAcceptance` and `designControlChecklistDefs`, whose two importers now import the source.
2. **The host:** no host-mounted id retires. It passes `onNav` and `onReadinessContext` to `IvdSurface`, and publishes `diagnosticsContext`.
3. **The registry:**
   - the three ids are out of `surfaceViews.ts` and both registries;
   - the risk and design-controls families are device-engineering's alone;
   - device-diagnostics takes `/api/ivd-lifecycle` and `/api/validate-completeness`, beside the two it shared;
   - `/api/c2c/projects` stays with projects and submission-center;
   - `HOOKS` keeps the four panel files under their one screen each.
4. **`registryModel.ts`:**
   - aliases `risk` and `design-controls` → device-engineering, and `ivd-completeness` → device-diagnostics;
   - the ids are out of `NAV_GROUP_OF`, `NAV_HIDDEN`, both segments' `focus`, `SURFACE_ACTIONS` and both device rails (risk was under "Intelligence & risk").
5. **Scope lists:** the three ids are out of `launch-scope.ts` and `mdx-project-features.ts`. The guard is in `launch-scope.test.ts`, "the folded risk file, design-control trace and IVDR readiness board".
6. **Catalogue:** see "The catalogue" below.
7. **AnA:**
   - the `risk` target stays and resolves through the alias (with no project open it asks for one, as a project target);
   - design-controls and ivd-completeness had no target;
   - `risk.*` is removed and `device-engineering.*` kept;
   - `riskMatrixActions` takes device-engineering only.
8. **Tours:**
   - `training-medtech` stops at device-engineering and drives `device-engineering.select-hazard` and `.set-matrix-view`; its design-controls stop speaks on the same screen;
   - `sales-medtech` speaks the risk file on Engineering and drives `.set-matrix-view`.
9. **CI:**
   - `ID_BASELINE` 106 → 103 (three retired publishers; the targets' publishes are the host's, so no id is added);
   - `REAL.components` is unchanged (none of the three was host-mounted);
   - `dump-v2-surfaces.spec.tsx` names none of them;
   - `NO_PROJECT_DOOR` loses the three (16 project features);
   - `check-surface-discoverability.mjs` named none of them;
   - `collab-data.ts` `SURFACE_CTX` loses `risk`, as earlier folds removed theirs.
10. **Fold guards:** `foldRiskDesignControls.test.ts` and `foldIvdCompleteness.test.ts`. The second is the F2 lane's draft (`../fold-f2-ivd-completeness/fold/red/`), extended with the host's readiness merge and the two moved claims.

### Deletions (working agreement)

| Deleted | Replacement, by path | Test that proves it reachable |
|---|---|---|
| `v2/surfaces/Risk.tsx` | `mdx/surfaces/EngineeringSurface.tsx` mounting `v2/surfaces/RiskRegister.tsx`, at `device-engineering` (alias `risk`) | `foldRiskDesignControls.test.ts`; `EngineeringSurface.riskRegister.test.tsx` |
| `v2/surfaces/DesignControls.tsx` | the same screen mounting `v2/surfaces/DesignControlsTrace.tsx` (alias `design-controls`) | `foldRiskDesignControls.test.ts`; `EngineeringSurface.designControls.test.tsx` |
| `v2/surfaces/IvdCompleteness.tsx` | `mdx/surfaces/IvdSurface.tsx` at `device-diagnostics` (alias `ivd-completeness`) | `foldIvdCompleteness.test.ts`; `IvdSurface.readiness.test.tsx`; `ivdReadinessAnaContext.test.tsx` |
| `v2/__tests__/riskAndDesignControlsSharedMounts.test.tsx` | Each case's twin on Engineering: project read and New hazard naming the project (`EngineeringSurface.riskRegister` "reads it by the project", "adds a hazard to the project"); unkeyed answer (its "a read that is not this project"); viewer (its and `.designControls`' viewer cases). The no-project case pinned the retired screen's organization read. | — |
| `v2/__tests__/designControlsReadsOpenProject.test.tsx` | `EngineeringSurface.designControls`: "reads them by the project", the three unkeyed answers, "adds a design input to the project". The no-project cases pinned the retired screen. | — |
| `ivdCompletenessOneBoard.test.tsx`'s two read cases | `IvdSurface.readiness.test.tsx` ("reads the board with the project's id"). The organization read was the retired screen's. The file keeps "one board, one mount". | — |

### Suites moved onto the panels as Engineering mounts them

These suites rendered `<Risk>` or `<DesignControls>`. They pin the shared panels' behaviour, so their cases now run against those panels as Engineering mounts them: `v2/__tests__/engineeringPanels.harness.tsx`, test support that reads for the project, `requireProject`, under device-engineering, with the section head's write button.

The harness is used rather than EngineeringSurface itself because another session is editing EngineeringSurface.tsx in this tree. Engineering's own suites pin that it mounts the panels.

Each case's fixture now answers the project's read with a keyed answer. Its assertions are unchanged, except:

- `riskSignedContentOnScreen` reads the context the register hands up, not a `risk` publish;
- `designControlsPendingStore`'s "live" case: the retired header's "live" eyebrow went with the screen, so it now pins that the panel claims no live store over a missing one.

| Suite | Cases |
|---|---|
| `riskHonesty.test.tsx` | 6 |
| `riskAcceptResidualSigned.test.tsx` | 8 |
| `riskSignedContentOnScreen.test.tsx` | 10 |
| `anaDrivesWave3.test.tsx`, the risk block (now under device-engineering) | 3 |
| `designControlsHonesty.test.tsx` | 4 |
| `designControlsPendingStore.test.tsx` | 6 |
| `designControlsNoFixtures.test.tsx` | 7 |
| `riskMapping.test.ts`, `server/services/regulatory/__tests__/design-controls-qmsr.test.ts` | import only |

Neighbouring suites updated for the fold (`tools/neighbour-suite-updates.py.txt`):

- `moduleCatalogReconciliation` (`KNOWN_RESEEDS` is human-factors alone);
- `projectFeatureBreadcrumb`: its examples are now device-engineering and device-diagnostics, and a new case says ⌘K lists no folded screen;
- `appsMdxSolution`: its risk row is Engineering evidence;
- `core-project-record-gating`: the record's claimants are projects and submission-center;
- `engineering-risk-design-controls-gate` and `ivd-board-under-diagnostics`: the target is the one claimant; holders of the folded module are served by the resolver's carried grant, pinned with the real resolver in the item-1 pin;
- `ProjectMdxWorkflow` (`NO_PROJECT_DOOR`);
- `launch-scope-device-features` (`HOOKS`).

### The catalogue (CLAUDE.md Rule 1)

Each writer is amended in place, with a dated header. There is no DELETE and no appended DROP.

| File | Removed |
|---|---|
| `db/migrations/20260810_reconcile_module_catalog.sql` | `risk` and `ivd-completeness` from step 1's keep-list and step 2's upsert |
| `db/migrations/20260823_module_catalog_commercial_packaging.sql` | their packaging rows (the unknown-module guard) |
| `db/migrations/20260823_module_catalog_customer_copy.sql` | their copy rows (the copy guard; 32 descriptions, not 34) |
| `migrations/20260814j_catalog_missing_product_surfaces.sql` | the `design-controls` VALUES row |
| `db/migrations/20260823_module_catalog_mdx_registers.sql` | the `design-controls` upsert row and its place in the end-state assertion; human-factors is unchanged |

What each database holds:

- **A fresh database** holds none of the three rows. device-engineering, device-diagnostics and human-factors stay live at standard (`catalogue-at-each-fold.txt` method; contract case 1).
- **A deployed database** keeps each row, its recorded tier and its subscriptions, deprecated on every replay by 20260810 step 1. design-controls was never on that file's lists, and nothing clears its flag now (contract case 2).

No file was added to or reordered in `C2C_MIGRATION_FILES`, so **`scripts/db/migration-set.mjs`: no lines of mine** in item 1 or item 2.

### Red, green, make the check fail (item 2)

**Red** (`red.txt`, item-2 sections):

- **The pin, with the three expected rows before the mapping, the aliases or the catalogue had them:** 8 failed of 22.
  - A free-plan organization holding only `risk` was refused `/api/mdx/engineering` and `/api/design-controls`.
  - One holding only `design-controls` was refused `/api/mdx/engineering` and `/api/mdx/risk-items`.
  - One holding only `ivd-completeness` was refused six IVDR paths.
- **The fold guards at head:** `foldRiskDesignControls` 5 failed of 7; `foldIvdCompleteness` 5 failed of 5.
- **The catalogue contract cases and the host readiness test** were written with the change. Mutations N15–N20 and N12–N14 are their red.

**Green** (`green.txt`): 89 files, one at a time, 939 tests, all passing.

**Mutations** (`mutations.txt`): 21 of 21 red, each on its own target, each file restored byte for byte, and `sha256sum -c` over the 16 mutated files after the run.

| Id | Mutation | Red on |
|---|---|---|
| N1 | `risk` has no alias | fold guard, pin |
| N2 | `ivd-completeness` has no alias | fold guard, pin |
| N3 | `risk` keeps a view | fold guard |
| N4 | `risk` left in the Projects scope list | launch-scope, fold guard |
| N5 | `ivd-completeness` left in the project features | launch-scope, fold guard |
| N6 | `risk.*` matrix actions registered again | fold guard (it survived the first run; the guard was strengthened, see `mutations.txt`) |
| N7 | the medtech tour navigates to `risk` again | fold guard |
| N8 | device-engineering drops the design-controls claim | fold guard (the pin reads the target's paths from the registry, so it does not see a dropped claim) |
| N9 | device-diagnostics drops `/api/ivd-lifecycle` | fold guard |
| N10 | `assess_filing_readiness` not on device-diagnostics | fold guard |
| N11 | the host passes `IvdSurface` no `onNav` | fold guard |
| N12 | the host publishes device-diagnostics without the board's context | host readiness test (3), fold guard |
| N13 | `IvdSurface` reports nothing to the host | host readiness test (3) |
| N14 | the host merges a board read for another project | host readiness test, the project switch |
| N15, N16 | 20260810 upserts `risk` or `ivd-completeness` again | catalogue contract: the replay raises "catalog modules with no tier assigned", so the suite cannot start (a deploy would fail) |
| N17 | the MDX registers file upserts `design-controls` again | catalogue contract (2) |
| N18 | 20260814j inserts `design-controls` again | catalogue contract, the fresh case |
| N19 | the customer copy keeps its `risk` row | catalogue contract: the copy guard raises on a fresh replay |
| N20 | the packaging keeps its `ivd-completeness` row | catalogue contract: the unknown-module guard raises |
| N21 | the mapping drops `design-controls` | pin (4) |

### Gates (item 2, `gates.txt`)

These pass:

- `ci:launch-scope` (7 apps, 45 surfaces, 12 modules) and its selftest;
- `ci:launch-scope-api` (564 paths, none refused) and its selftest;
- `ci:ana-surface-context` (103 of 107 routable ids, baseline 103 exact);
- `ci:surface-discoverability` (109 renderable: 84 catalogued, 25 contextual);
- `ci:migration-drop-safety` and its selftest, `ci:migration-set-order`, `ci:migration-deploy-path` and its selftest, `ci:migration-guard-order`, `ci:migration-reachability`;
- `check:catalog-copy`;
- `ci:program-ownership-single-source`;
- `ci:undefined-css-classes` and `ci:unreferenced-modules`;
- `ci:sign-ceremony` and its selftest.

`ci:sql-interpolation` fails, on four files of other sessions only: `server/services/tenant/held-records.ts`, `server/services/tenant-export/held-record-integrity.ts`, `server/services/vault/retention-period.ts`, and `server/routes/vault-retention-period.ts` (whose baseline can now be lowered). None is in this change.

- **eslint** (`eslint.txt`): every changed file is at or below head's warning count, and the new files have none.
- **No file newly crosses 1,500 lines.**
- **tsc** (`typecheck.txt`): 4 errors over 1,128 repository files. All four are missing asset declarations (`*.module.css`, `*.svg`) in files this change does not touch, and the same four appear with those files checked alone.

### Not carried (item 2)

- **Two unreached branches remain:**
  - `projectScopedRead`'s organization branch (`requireProject` false);
  - `useIvdReadiness(null)`, the board's organization scope.

  No mount reaches either now. Removing them changes shared code that another session's Engineering work sits on.
- **`/api/validate-completeness` and `/api/ivd-lifecycle`** moved to device-diagnostics so that whoever was served is still served. No screen calls them (AnA reaches the IVD lifecycle engines directly, `ivdLifecycleTools.ts`), and `ivd-platform.openapi.json` documents the second. Whether to close them is a separate decision.
- **Rows recorded with no project** (hazards, design inputs) show under no project, as before. An "assign to this project" act is not built.
- **The IVD route's organization branch** (`ivd-completeness-routes.ts`, no project) stays. Nothing calls it with no project now.
- **`EngineeringSurface.tsx` is not edited.** Another session has it in flight, and the fold needed no change to it.
- **Documents not edited:** `INFORMATION_ARCHITECTURE.md`, `A2_10_REMAINING_FOLDS.md` and `DEVICE_FOLDS_2026-10-29.md` are not updated; the last still says design-controls has no catalogue row. `FUNCTION_PARITY.md` is updated (both sections, and the three table rows "Yes (2026-10-29)").
- **Not run here:** the real-PostgreSQL suites (`tests/db/*.dbtest.ts`) and the whole-tree typecheck.
