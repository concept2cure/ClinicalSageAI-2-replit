# Fold F2: ivd-completeness into device-diagnostics

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `1a6701ea6`. The plan is
`docs/design/DEVICE_FOLDS_2026-10-29.md`, F2 item 5. The product slice is `../README.md`.

**Status: blocked, before anything was deleted.** The fold needs founder decision 4 (the grant mapping). The parity
check passes, apart from four gaps the fold itself closes. The fold guard is written and is red at head. No product
file was changed.

## Why it stopped

The lead's instruction: find out how the alias treats an organization that holds `ivd-completeness` but not
`device-diagnostics`, and stop before deleting anything if it would lose access. It would. See "The grant finding".

## What already exists

Re-read at head. The product slice's table (`../README.md`, "What already exists") still holds. Its pieces:

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Old screen | `client/src/concept2cure/v2/surfaces/IvdCompleteness.tsx` (`surfaceViews.ts:323`, `:490`) | Mounts the board and the workbench. Publishes `ivd-completeness` to AnA from `ivdReadinessContext`. | It draws no markup of its own. |
| The board | `client/src/concept2cure/v2/surfaces/IvdReadinessBoard.tsx` | The seven families, verdict, tiles, items, Ask AnA per family, the refused, failed and unread states. `ivdReadinessContext` builds AnA's context. | — |
| The workbench | `client/src/concept2cure/v2/surfaces/IvdAssessmentWorkbench.tsx` | Annex VIII save, FSN draft, saved lists, read a record, working copy into Authoring. | Without `onNav`, "Create working copy for review and signing" is disabled (`:112`, `:133`). |
| Replacement | `client/src/concept2cure/mdx/surfaces/IvdSurface.tsx` (`device-diagnostics`), mounted by `mdx/MdxSurfaceHost.tsx:365-372` | Reads the board for the open project (`:85`), draws it in the readiness panel (`:208-218`), mounts the workbench for the project (`:220`). | It receives no `onNav` from the host. The host publishes its own context for the id (`MdxSurfaceHost.tsx:343`), not the board's. |
| Alias mechanism | `DEEP_LINK_ALIASES` (`v2/registryModel.ts:959`), resolved in `v2/routing.ts:20-38` | Same as `device-tasks` → `tasks`. | — |
| Entitlement | `server/services/entitlements/navigation-entitlements.ts` (`decideNavEntitlement`), `server/middleware/moduleEntitlementGate.ts`, `server/services/license-manager.ts` (`canAccessModule`) | Per-module verdicts. The rail, ⌘K and AnA's targets look up the destination's verdict (`Shell.tsx:146-150`, `V2App.tsx:259`). An API path is served when any module that claims it is entitled. | — |
| Catalogue writers | `db/migrations/20260810_reconcile_module_catalog.sql:293`, `:359`; `20260823_module_catalog_commercial_packaging.sql:236`; `20260823_module_catalog_customer_copy.sql:130` | Keep-list, upsert, packaging and customer copy for `ivd-completeness`. | — |

Searches run: `ivd-completeness`, `IvdCompleteness`, `ivdCompleteness`, `ivd_completeness`, `IvdReadiness`,
`IvdAssessment`, the five API prefixes and both module ids, across `client`, `shared`, `server`, `scripts`, `tests`,
`db` and `migrations`. History: `git log --all --diff-filter=D` on `*IvdCompleteness*`, `*ivdCompleteness*`,
`*ivd-completeness*`, `*IvdReadiness*`, `*IvdSurface*` and `*IvdAssessment*` finds nothing. `git log --all -S
"'ivd-completeness'"` finds only additions and edits. The clone is shallow (1,182 commits).

## Parity check

Every function of `IvdCompleteness.tsx`, and where device-diagnostics has it.

| Function | Where device-diagnostics has it | Verdict |
|---|---|---|
| Readiness board for the open project | `IvdSurface.tsx:85`, `:208-218`, the same component | Present |
| Verdict line, tiles, families, items, Ask AnA per family, refused, failed, unread and empty states, retry | `IvdReadinessBoard.tsx`, mounted at `IvdSurface.tsx:217` | Present (same code) |
| Heading (project and IVDR spine) | `IvdSurface.tsx:168-176` and the panel title `:213` | Present |
| Workbench: classification save, FSN draft, lists, read a record, refresh guard | `IvdSurface.tsx:220` | Present |
| Workbench: working copy into Authoring | `IvdSurface.tsx:220` passes `onNav`, but the host does not pass it (`MdxSurfaceHost.tsx:368-372`) | **Gap. The fold closes it** (README item 1) |
| AnA sees the readiness | Not published. device-diagnostics publishes the host's context only | **Gap. The fold closes it** (README item 2) |
| AnA action chip `assess_filing_readiness` | `SURFACE_ACTIONS['device-diagnostics']` lacks it (`registryModel.ts:608-614`) | **Gap. The fold closes it** (checklist step 7) |
| API claims for the board's and the workbench's calls | Claimed only by `ivd-completeness` (`ui-surface-registry.ui-v2.ts:192`) | **Gap. The fold closes it** (README item 3) |
| The organization-wide board, with no project open | None. device-diagnostics needs a project | Dropped by the map (`FUNCTION_PARITY.md:739`, "scoped to the program") |
| The wrong-segment notice | None | A screen state, not a function |
| Rail and focus entries | `device-diagnostics` is in both (`registryModel.ts:246`, `:693`) | Present |

Every function that is real today is in device-diagnostics or is one of the four gaps the fold's own items close.
None is missing from the product.

## The grant finding

**How the alias treats them.** The alias resolves before any verdict is read: in the URL (`routing.ts:20-24`), in an
in-app move (`destinationFor`), in the rail and ⌘K (keyed on the destination), and for AnA's targets. After the fold
nothing reads the `ivd-completeness` grant. The registry entry and the catalogue row go, and the three API prefixes
are claimed by device-diagnostics alone. **The target's entitlement decides.**

**Who is affected.** Both modules have the same packaging: min tier `standard`, no industry, both in the Projects launch
app, and `provision_org_modules()` writes both. So a plan gives the same verdict for both. They differ only when a
subscription row records a decision about one module and not the other:

1. device-diagnostics switched off (`enabled = false`) while ivd-completeness is granted or included;
2. ivd-completeness granted above a free plan, with no live device-diagnostics grant.

**What they lose** (shown in `grant-finding.txt`):
- `device-diagnostics` is locked in the rail and in ⌘K, and AnA reports it locked. Clicking it opens the unlock panel.
- With `MODULE_ENFORCEMENT=enforce`: `/api/ivd-completeness/completeness` and `/api/ivd-assessments*` go from served to
  403 `MODULE_NOT_LICENSED`. The board then says the read was refused, and the workbench cannot list or save.
- With enforcement off (the default), an old link and the project's Plan door still open the screen. Those check only
  the launch scope (`LaunchScopeGate.tsx`, `surfaceAvailable.ts`), and the API is not gated by module.

**How many.** Not known. There is no production database here. `class-query.sql` lists them by the rule
`canAccessModule` applies. It was checked on PGlite with eight seeded organizations and returned exactly the three that
are in the class (`class-query-check.txt`).

**The decision.** Founder decision 4. No grant migration was written, because new grants are barred
(`A2_10_REMAINING_FOLDS.md:64-66`). The choices are:
- fold, and let the device-diagnostics verdict govern. Organizations of kind 1 then have the board under the module they
  switched off. Organizations of kind 2 lose it;
- or map the grants first, which is a new grant.

The other direction already happens today. With enforcement on, an organization entitled to device-diagnostics and not
to ivd-completeness is refused the readiness panel's reads on device-diagnostics, because only ivd-completeness claims
them. The fold's claim move fixes that, and it widens access in that direction. It belongs to the same decision.

## Replacement and reachability

Replacement: `client/src/concept2cure/mdx/surfaces/IvdSurface.tsx` at `device-diagnostics`, through `MdxSurfaceHost.tsx`.

The fold guard, `red/foldIvdCompleteness.test.ts.txt` (to go at `client/src/concept2cure/v2/__tests__/foldIvdCompleteness.test.ts`),
checks five things:
- the old id resolves to device-diagnostics from a URL and an in-app move, with and without a project open;
- device-diagnostics draws the board and the workbench, and the host passes `onNav`;
- device-diagnostics claims the three IVD prefixes;
- the old id has no view, no registry entry and no kit file, and no client file imports `IvdCompleteness`;
- the id is in neither scope list, nor the rail, nor a focus list, and `assess_filing_readiness` is on device-diagnostics.

At head it is red, 5 of 5, each for its own reason (`red/fold-guard-at-head.txt`). The old id still resolves to its own
screen, and `surfaceViews.ts` and `ivdCompletenessOneBoard.test.tsx` still import it. The guard was taken out of the
test tree after that run, so no red test is left for the commit. It is eslint-clean, and tsc reports no error in it.

## What changed

Only this folder. No product, test, migration or CI file was changed. A temporary test made the grant finding and was
removed after the run. Its source is `grant-finding.test.ts.txt`.

## What the fold needs, beyond the checklist and the product slice's list

- `db/migrations/20260823_module_catalog_customer_copy.sql:130` has an `ivd-completeness` row. Its guard raises "copy
  names modules that are not in available_modules" on a fresh database once 20260810 stops upserting the row. It has
  to be amended in place too, with its count note. The device-tasks fold had no copy row, so the checklist does not
  name this file.
- `/api/validate-completeness` is claimed only by `ivd-completeness`, and no client calls it. Once the entry goes, it
  is unattributed and refused in production. Move it or let it close, and record which.
- The readiness context cannot be a second `usePublishSurfaceContext('device-diagnostics', …)` in IvdSurface. The
  store holds one context (`surfaceContext.ts`), and the host already publishes that id. Each effect overwrites the
  other, and the host's null branch clears by id. The host has to hold the readiness: call `useIvdReadiness` there for
  device-diagnostics, pass it to IvdSurface, and merge `ivdReadinessContext(...)` into the host's context for that id.
  `ID_BASELINE` then goes 112 → 111, for the retired publisher only.
- `IvdReadinessBoard.tsx:135` reads every 403 as "Your organization could not be confirmed". A `MODULE_NOT_LICENSED`
  403 would show that wrong reason.

## Files

- `red/fold-guard-at-head.txt`, `red/foldIvdCompleteness.test.ts.txt`
- `grant-finding.txt`, `grant-finding.test.ts.txt`
- `class-query.sql`, `class-query-check.txt`
