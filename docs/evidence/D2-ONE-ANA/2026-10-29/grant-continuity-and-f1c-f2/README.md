# Grant continuity across folds (P-61 item 4), then folds F1c and F2

Launch row D2 (one AnA; the device folds). Date 2026-10-29. Working tree over `d140aefa5`.

- Decision: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-61 item 4, decided 2026-10-29 under the founder's delegation (first numbered P-54).
- Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, F1 and F2 and the common checklist.

**Item 1, grant continuity: done.** A subscription to a folded module entitles its holder to the fold's target. The mapping is `FOLDED_MODULE_SUCCESSORS` (`server/services/entitlements/folded-module-successors.ts`). Its one reader is `grantsHeldThroughFolds`, and its one caller is `readLicenseInfo` (`server/services/license-manager.ts`). No grant row is written, and every subscription is kept.

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
