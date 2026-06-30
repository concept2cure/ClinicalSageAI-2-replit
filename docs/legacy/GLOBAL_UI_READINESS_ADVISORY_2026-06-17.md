# Global UI Readiness — Advisory to Claude Design

**Date:** 2026-06-17
**From:** Global UI readiness (backend/platform enablement — no UI built)
**To:** Claude Design
**Companion artifacts (shipped with this advisory):**
- `shared/constants/ui-surface-registry.ts` — the machine-readable surface map
- `client/src/lib/api/query-options.ts` — the data-hook factory (install template)
- `client/src/hooks/useGlobalRiCatalog.ts` — reference contract-ready hook
- `client/src/hooks/useUiSurfaces.ts` — registry accessor for building nav
- Tests: `tests/ui-readiness/ui-surface-registry.test.ts`, `client/src/lib/api/__tests__/query-options.test.ts`

**Related handoffs (still current):** `HANDOFF_TO_DESIGN_global_ri.md`, `HANDOFF_TO_DESIGN_document_authoring.md`, `FEATURE_INVENTORY.md`, `GA_GAP_AUDIT_2026-06-10.md`.

---

## 1. The one thing to internalize

The platform's center of gravity is **strong, tested backends with no UI wired to them.** The GA gap audit reached the same conclusion independently: remaining GA work is *design + integration*, not greenfield backend. So the bottleneck for shipping is not "build more backend" — it's **installing surfaces against backends that already exist, fast and without re-discovering them each time.**

My job was to remove that re-discovery cost. This advisory + the registry + the hook template give you **one organized map of every surface, the exact routes/contracts/AnA tools it binds to, and a repeatable install recipe** — so design work is alignment and rendering, not archaeology.

I did **not** build UI. Everything here is the data/contract/hook layer that sits *underneath* the components you own.

---

## 2. The install model (how a surface goes from kit → live)

Every surface follows the same five-layer path. Two of the five already had a proven template (global-RI, Submission Center); this pass generalizes it to all of them.

```
1. KIT          ui_kits/<dir>            design prototype with mock data.jsx
2. SHELL        layoutMode (zen-app)     the real renderer slot in ZenApp
3. ROUTES       /api/...                 mounted, auth'd, tested REST (server/bootstrap)
4. CONTRACT     @shared/types/...        typed DTO the UI imports (end-to-end types)
5. HOOK         client/src/hooks/...     React Query data hook (apiQueryOptions)
```

**Installation = replace a kit's `data.jsx` mock with a hook (5) that returns the contract (4) from the routes (3), rendered in the shell (2).** Nothing about the component design changes; only the data source.

---

## 3. The two gold-standard precedents (copy these)

| Precedent | Nav/taxonomy | Typed contract | One-call discovery | Why it's the model |
|---|---|---|---|---|
| **global-RI** | `shared/constants/global-ri-ui.ts` (9 groups) | `shared/types/global-ri-api.ts` | `GET /api/global-ri/catalog` returns groups + capabilities + **per-tool input JSON-schema** | Nav *and forms* are data-driven. The UI renders the whole surface without hard-coding a single endpoint. |
| **Submission Center** | `shared/types/submission-ui.ts` → `SUBMISSION_WORKSPACES` | `shared/types/submission-api.ts` + OpenAPI | `SUBMISSION_WORKSPACES` (static map) + `submissionErrorMessage()` error catalog | Workspace map + uniform error catalog as framework-agnostic data the UI reads. |

The shared philosophy: **put nav, routing, error strings, and (where possible) form schema in `shared/` as data the UI reads — never hard-coded in components.** A "contract-ready" surface is one where this exists; installing it is rendering, not wiring.

---

## 4. The global surface registry (new — the heart of this pass)

`shared/constants/ui-surface-registry.ts` is the app-wide generalization: **one framework-agnostic record per installable surface**, tying together everything design needs:

- `layoutMode` — the real ZenApp shell key the renderer hangs on
- `uiKit` — the `ui_kits/<dir>` prototype it grows from
- `apiPrefixes` — the **real mounted** REST prefixes (grounded in `server/bootstrap/register-*-routes.ts`)
- `anaToolFamilies` — the AnA tools it can surface in the rail / slash menu
- `sharedContract` — the `@shared/...` type to import for end-to-end typing
- `discoveryCatalog` — the one-call endpoint that returns nav + form schema, where one exists
- `readiness` — honest install readiness (see §5)
- `compliance` — the design skills that gate it (Part 11, a11y, tone, motion)

It ships with pure selectors (`surfacesGroupedByNavTier`, `surfacesByReadiness`, `readinessSummary`, `contractReadySurfaces`, `getSurface`) and a thin client accessor (`useUiSurfaces`) so you can **build the left rail and an install tracker straight from data**, and it re-exports `GLOBAL_RI_GROUPS` so the global-RI browser can't drift from the backend.

It is **tested** (`tests/ui-readiness/ui-surface-registry.test.ts`): ids unique, taxonomy valid, every surface binds to a real `/api` prefix, and **every referenced `ui_kit` dir and every `@shared` contract is asserted to exist on disk** — so the map can't rot silently.

---

## 5. Readiness tiers (what to build first)

| Tier | Meaning | Install action |
|---|---|---|
| **contract-ready** | typed `@shared` contract and/or one-call discovery catalog exist | Render from data. Highest leverage — start here. |
| **routes-ready** | REST mounted + tested; contract partial/absent | Bind components directly to endpoints; add a `@shared` type as you go. |
| **kit-only** | design prototype exists; backend binding map being assembled | Use the registry row's `apiPrefixes` to wire. |
| **planned** | routes exist, surface not yet prioritized | Defer. |

Drive a live count with `readinessSummary()`. The two **contract-ready** surfaces (`global-ri`, `submission-center`) are the fastest installs and the reference implementations for everything else.

---

## 6. Surface readiness matrix (current snapshot)

Grouped by left-rail tier (matches `FEATURE_INVENTORY.md §7`). "Contract" / "Catalog" columns mark the highest-leverage surfaces.

### Global
| Surface | layoutMode | Kit | Primary routes | Contract / Catalog | Readiness |
|---|---|---|---|---|---|
| Projects | `projects` | home | `/api/projects`, `/api/programs` | — | routes-ready |
| Apps catalog | `apps` | — | `/api/module-subscriptions` | — | planned |
| Artifacts Center | `artifacts-center` | — | `/api/biotech-artifacts`, `/api/atoms`, `/api/corpus` | — | routes-ready |

### Project
| Surface | layoutMode | Kit | Primary routes | Contract / Catalog | Readiness |
|---|---|---|---|---|---|
| Project home | `project-home` | mdx | `/api/projects`, `/api/rim` | — | routes-ready |
| **Document editor & authoring** | `editor` | authoring | `/api/document-authoring`, `/api/authoring`, `/api/workflow`, `/api/esignature` | `document-contract` | routes-ready |
| Regulatory workspace | `regulatory-workspace` | mdx | `/api/document-authoring`, `/api/project-sections` | `authoring-context` | routes-ready |
| Vault (DMS) | `vault` | mdx | `/api/corpus`, `/api/device-data-center`, `/api/evidence` | — | routes-ready |
| Review & approval | `review` | mdx | `/api/workflow`, `/api/part11` | — | routes-ready |
| **Submission Center** | `submissions` | submission | `/api/submissions`, `/api/submission-center`, `/api/region-profiles` | `submission-ui` / **SUBMISSION_WORKSPACES** | **contract-ready** |
| eCTD co-author | `submissions` | ectd_coauthor | `/api/ectd`, `/api/content-assembly` | `submission-api` | routes-ready |
| 510(k) workbench | `section-workspace` | mdx | `/api/510k-workflow`, `/api/cerv2`, `/api/fda-forms` | `predicate-intelligence` | routes-ready |
| CER generator (EU MDR) | `section-workspace` | — | `/api/cer`, `/api/cerv2` | — | routes-ready |
| CMC / Module 3 | `cmc` | cmc | `/api/cmc`, `/api/cmc/module3-os`, `/api/cmc/stability` | — | routes-ready |
| IND lifecycle | `ind-checklist` | pdev | `/api/ind-lifecycle`, `/api/ind-forms`, `/api/ind-autodraft` | — | routes-ready |
| Product dev (PDEV→IND) | `pdev` | pdev | `/api/pdev` | — | kit-only |
| Biopharma (BLA/CTD) | `biopharma` | biopharma | `/api/biopharma`, `/api/biopharma/bla`, `/api/biopharma/ctd` | — | kit-only |
| Template library | `template-library` | — | `/api/templates`, `/api/c2c/templates` | — | routes-ready |
| Tasks & collaboration | `tasking` | tasking | `/api/tasks`, `/api/collaboration` | `communication-center` | routes-ready |
| Dossier map | `dossier-map` | — | `/api/rim`, `/api/global-ri` | — | routes-ready |
| CSR workflow | `csr-workflow` | — | `/api/csr`, `/api/csr-builder` | — | routes-ready |

### Specialist
| Surface | layoutMode | Kit | Primary routes | Contract / Catalog | Readiness |
|---|---|---|---|---|---|
| **Global regulatory intelligence** | `intelligence` | intelligence | `/api/global-ri` | `global-ri-api` / **GET /api/global-ri/catalog** | **contract-ready** |
| Precedent intelligence | `precedent-intelligence` | intelligence | `/api/precedent-engine` | `predicate-intelligence` | routes-ready |
| Biostatistics | `biostatistics` | — | `/api/biostat`, `/api/ana-biostats` | — | routes-ready |
| Report engine | `report-engine` | — | `/api/haq-manager`, `/api/intelligence` | `intelligence` | routes-ready |
| Safety narrative / PV | `safety-narrative` | — | `/api/pharmacovigilance` | — | routes-ready |
| Device & diagnostics | `device-diagnostics-workbench` | risk | `/api/mdx`, `/api/manufacturing`, `/api/ivdr` | — | routes-ready |
| Labeling | `labeling` | labeling | `/api/mdx` | — | kit-only |
| Risk management | `risk` | risk | `/api/mdx`, `/api/design-risk` | — | kit-only |
| Deep research | `deep-research` | — | `/api/deep-research` | — | routes-ready |

### Admin
| Surface | layoutMode | Kit | Primary routes | Contract / Catalog | Readiness |
|---|---|---|---|---|---|
| Admin / setup | `setup` | — | `/api/setup`, `/api/admin`, `/api/users`, `/api/enterprise/rbac` | — | routes-ready |
| Audit trail | `audit` | — | `/api/admin/audit`, `/api/part11` | — | routes-ready |
| Billing | `setup` | — | `/api/billing` | — | routes-ready |
| AnA memory | `ana-memory` | — | `/api/ana`, `/api/mdx` | — | routes-ready |

> The authoritative, exhaustive mount table is `server/bootstrap/register-*-routes.ts`. The registry lists *primary* prefixes per surface, not every sub-route.

---

## 7. Cross-cutting concerns — wire these once, before any surface

Five things every surface depends on. They are captured as data in the registry (`CROSS_CUTTING_CONCERNS`) so the install plan accounts for them once, not per-surface.

| Concern | Routes / module | Notes |
|---|---|---|
| **Auth & session** | `/api/auth`, `/api/auth/sso`, `client/src/utils/authToken.ts` | JWT (sliding 7-day), MFA (TOTP), SSO/SCIM. Token + org id already flow through `apiRequest`. |
| **Tenant / org** | `/api/setup`, `client/src/contexts/TenantContext` | Org context via `x-organization-id` header (already wired in `queryClient.ts`). Multi-org picker. |
| **Feature flags / entitlements** | `client/src/flags/featureFlags.ts` (`isFeatureEnabled`), `/api/module-subscriptions` | Per-tenant gating. **Locked modules show an upgrade CTA, never a dead button.** |
| **AnA assistant rail** | `/api/ana-ri/stream` (SSE), `/api/ana`, `@shared/types/ai-actions` | Persistent right rail on **every** surface. Modes standard/deep-research/quick-ask. Context card + suggested prompts + "Ask AnA about this" chips + provenance pedigree badge. |
| **E-signature modal** | `/api/esignature` | Cross-cutting governed-action affordance (password re-verify + TOTP, §11.50 manifestation). Reused by review, submission, authoring. |

The client data plumbing for these already exists and is standardized: `client/src/lib/queryClient.ts` (`apiRequest`, `getQueryFn`, `queryClient`) injects auth + org headers and normalizes errors. **Build every hook on top of it** — don't introduce a second fetch convention.

---

## 8. The hook template — "all hooks readily available and tested"

I seeded the data-hook layer with a reusable, tested factory so design imports hooks instead of writing fetch logic.

**`client/src/lib/api/query-options.ts`** — `apiQueryOptions<T>(url, overrides?)` wraps the project's standard `apiRequest` into a typed React Query `queryOptions` object (default `queryKey: [url]`). Keeping the *options* pure (no React) is what makes the data layer unit-testable without rendering.

**The pattern to replicate per surface (two lines of real logic):**
```ts
// client/src/hooks/useSubmissions.ts
import { useQuery } from '@tanstack/react-query';
import type { SubmissionList } from '@shared/types/submission-api';
import { apiQueryOptions } from '@/lib/api/query-options';

export const submissionsOptions = () => apiQueryOptions<SubmissionList>('/api/submissions');
export const useSubmissions = () => useQuery(submissionsOptions());
```

**Reference implementation shipped:** `client/src/hooks/useGlobalRiCatalog.ts` binds the real, tested `GET /api/global-ri/catalog`, typed with `GlobalRiCatalog`, with pure `*Options()` + thin `use*()`. Its pure layer is covered by `client/src/lib/api/__tests__/query-options.test.ts`.

So the connective tissue is **available** (factory + reference hook + registry accessor) and **tested**; remaining hooks are a mechanical per-surface application of the template, each ~5 lines, each unit-testable at the options level.

---

## 9. Recommended install sequence

1. **Cross-cutting first (§7).** Auth/session, tenant, feature-flag gating, the AnA rail, and the e-sign modal — these unblock everything and are already plumbed client-side.
2. **The two contract-ready surfaces.** `global-ri` (capability browser: group nav → capability list → auto-form from `inputSchema` → result panel) and `submission-center` (workspace map + error catalog). These are the fastest installs and the reference for the rest.
3. **Document authoring stack** (`HANDOFF_TO_DESIGN_document_authoring.md`): editor + Yjs co-author + track-changes + comments + versions + approval + e-sign. Highest product value; all backends exist.
4. **Template library + sentence-level traceability** — the two highest-differentiation surfaces with zero UI today (traceability backend + API are done per the GA audit; only the client click-through remains).
5. **Routes-ready project + specialist surfaces**, adding a `@shared` contract per surface as you install (promotes it to contract-ready, compounding the leverage).

Run the `design-brief` → `brief-to-tasks` → build → `design-review` flow per surface, with `accessibility-enforcement` and `regulatory-compliance-ux` as gates throughout (these are encoded in each surface's `compliance` field).

---

## 10. Gaps I'm flagging to design (not backend gaps)

- **Most surfaces are `routes-ready`, not `contract-ready`.** They work, but the UI re-derives shapes. **Recommendation:** as each surface is installed, add a small `@shared/types/<surface>.ts` (like `submission-ui.ts`) so the next person renders from data. The registry's `contractReadySurfaces()` tracks progress.
- **No single global discovery endpoint** beyond global-RI. The registry is the static stand-in. If design wants one-call discovery app-wide, the natural next backend step is a `GET /api/ui/surfaces` that serves the registry — but that's optional; the static import is sufficient.
- **`apps` is `planned`.** Entitlement-gated module catalog needs a product decision on the locked-state CTA before design.
- **Kit ↔ layoutMode drift risk.** Several kits (`labeling`, `risk`, `biopharma`, `pdev`) are ahead of their backend binding maps. The registry now pins each kit to its `layoutMode` + `apiPrefixes` so the binding is explicit.

---

## 11. Explicit non-goals (what I did **not** do)

- No React components, styles, or layout. Design + the UI kits own presentation.
- No new product strings beyond surface `label`/`notes` (which are catalog content, not copy).
- No new backend endpoints. Every `apiPrefix` in the registry is an existing mount.
- No changes to the AnA rail, auth, or tenant plumbing — only documented them.

---

## 12. What shipped with this advisory (checklist)

- [x] `shared/constants/ui-surface-registry.ts` — 30+ surfaces + 5 cross-cutting concerns, grounded in real routes, with pure selectors. Single source of truth for nav + install tracking.
- [x] `client/src/lib/api/query-options.ts` — the tested data-hook factory.
- [x] `client/src/hooks/useGlobalRiCatalog.ts` — reference contract-ready hook on a real endpoint.
- [x] `client/src/hooks/useUiSurfaces.ts` — registry accessor for building the left rail + install tracker.
- [x] `tests/ui-readiness/ui-surface-registry.test.ts` — parity/validity + on-disk reference checks.
- [x] `client/src/lib/api/__tests__/query-options.test.ts` — pure data-layer coverage.
- [x] This advisory.

Everything is additive and type-clean against the project baseline. Nothing here renders a pixel — it's the organized floor design installs on.
