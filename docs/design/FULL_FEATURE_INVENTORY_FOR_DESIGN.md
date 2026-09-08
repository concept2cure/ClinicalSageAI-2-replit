# Concept2Cure / AnA — Full Codebase Feature Inventory for Design

**Audience:** the Claude Design team (and any designer) tasked with redesigning or rebuilding the Concept2Cure / AnA product.
**Goal:** let you reconstruct every screen, panel, control, state, and data binding in the shipping client **without opening a single source file.**
**Scope:** the entire React/TypeScript client surface — 320 client `.tsx` files across the `concept2cure/` application plus the shared `components/ui/` design-system library — and a concise map of the ~200 server API route groups that back them.
**Status of the product:** a regulated regulatory-affairs platform for medical-device (510(k)/De Novo/PMA/IVDR/CER) and biopharma (IND→NDA/BLA/MAA) submissions, built to **21 CFR Part 11** (electronic records & signatures) and **WCAG 2.2 AA**. Much of the deep functionality ships behind feature flags and/or against sample fixtures (see §0.4 the Honesty Contract).

This document is the **feature inventory**. It is the companion to, and superset of, `ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md` (which goes deep on one surface — the AnA Document Studio — with opinionated design specs). Where the advisory says *how AnA's Document Studio should look and behave*, this inventory says *what every surface in the whole application is, what's on it, and what it does.* Read this for breadth; read the advisory for depth on the AnA flagship.

---

## 0.1 How to read this document

- It is organized into **9 Parts.** Read them in order the first time: Part 1 (the shell / information architecture) and Part 2 (the design system & vocabulary) are the foundation; Parts 3–8 are the surfaces; Part 9 is the reconciliation backlog (the inconsistencies you must resolve).
- Every **surface** (screen, route, layout-mode, panel, drawer, modal, major sub-component) is enumerated with a consistent template: **Route/entry · Purpose · Layout & regions · Controls & actions · States · Status vocabularies · Data · Gating · Sub-components · Notes for design.**
- **Verbatim strings** — status enums, tab labels, button copy, empty-state text, column headers, filter chips — are quoted exactly as they appear in code so your redesign can preserve or deliberately change them, not accidentally lose them.
- File paths are relative to `client/src/`. API paths are the real `/api/...` endpoints.
- "Honesty contract", "governed action", "disabled-with-reason", and `data-status` are load-bearing product concepts defined in §0.3–0.5 below — they recur on nearly every surface.

## 0.2 The application at a glance — the four-layer mental model

1. **The shell (Part 1).** One React app (`ZenApp.tsx`, ~2,357 lines) renders every surface by switching on a single `layoutMode` string. The union has ~110 members but **only ~16 render a distinct surface** — the rest redirect or are dead. The real product IA is four "bundle" surfaces — **Home, MDX (devices), AnA RI (chat), eCTD (submission)** — plus ~12 domain shells (biopharma, CMC, PDEV, authoring, insights, intelligence, tasking, risk, quality, communication, labeling, projects).
2. **The design system (Part 2).** ~76 shared primitives in `components/ui/`, a token system with one canonical OKLCH source (brand terracotta `#D97757`) plus three competing legacy/bridge namespaces, the unified `data-status` attribute, and the e-signature modal. This is the vocabulary every surface is built from.
3. **The domain surfaces (Parts 3–8).** The device pathways, the drug-development shells, the document-authoring & submission engine, the cross-cutting workflow tools (auth, projects, tasking, quality, risk, communication), and the analytics/intelligence surfaces.
4. **AnA, the AI layer (Part 3).** A chat-first assistant that is *also* a UI surface: a streaming conversation (left) beside a live document and a stack of "trust panels" (right), driving the **author → validate → verify → resolve → seal** loop. AnA is both its own full-screen app and a dockable rail embedded in most other surfaces.

## 0.3 The shared shell idiom (you will see this everywhere)

Most domain surfaces are built from one repeating three-pane idiom — internalize it once:
- **Left:** a navigation **Rail** (icon+label items, grouped into sections).
- **Center/top:** a **TopBar / TabBar** (surface title, project/scope selector, primary tabs).
- **Main:** the work surface (dashboard, table, board, editor, or chat).
- **Right (optional, collapsible):** the **AnA dock** — the assistant rail, toggled with **⌘\\**, with a command palette on **⌘K**.

Tasking, risk, communication, PDEV, MDX, intelligence, and biopharma all instantiate this idiom with different rails and content. A unified shell component is the single biggest consolidation opportunity (see Part 9).

## 0.4 The Honesty Contract (a hard product rule, not a nicety)

The product is built to never lie to a regulatory reviewer. Three behaviors recur on nearly every surface and your redesign **must** preserve them:
- **Sample data is always labeled.** Fixture-backed surfaces show a visible "Sample data" pill/banner (`SampleDataBanner`, `isSample` flags). Many surfaces use a `live ?? fixture` fallback so there is never a blank screen — but the sample state is always disclosed.
- **`isSample` / `not_assessed` / sample-provenance content is never sealable or exportable.** The seal/export affordance is **disabled-with-reason** for it — the control is visibly disabled and a tooltip/inline text states *why* (never color alone, never clickable-then-403).
- **Estimates are framed as estimates; AI-authored narrative carries a disclosure.** Provenance (who/when/version/source) travels with content and is reachable in context.

## 0.5 Governed actions & the Part 11 ladder

Any mutation of regulated content (seal, sign, submit, transmit, approve, lock, transfer) is a **governed action**. The codebase implements a consistent escalation ladder; your redesign must keep the rungs distinct:
1. **Plain mutation** — non-regulated edits, autosave: silent.
2. **Reason-for-change** — a `ReasonModal` / typed-confirm dialog captures a free-text reason (min length) and, for destructive force-actions, a typed confirmation word.
3. **E-signature (the top rung)** — the canonical `EsignModal` implements 21 CFR Part 11 §11.50 (signature manifest), §11.100 (meaning: AUTHOR / REVIEWER / APPROVER as a radiogroup), and §11.200 (re-authentication with password + TOTP at signing time, not session reuse). It emits a signed manifest with a version hash.

There are currently **three** dialog variants for this (`EsignModal`, PDEV's `PdevConfirmDialog`, the shell's `ReasonModal`) — unifying them is a Part 9 item.

## 0.6 The unified `data-status` styling contract (the key designer lever)

A single HTML attribute, `data-status`, drives status styling across the app and is the cleanest hook your design system can standardize on. Verbatim values:

`verified` · `unverified` · `clean` · `minor_issues` · `needs_review` · `blocker` · `concordant` · `discordant` · `ready` · `blocked` · `not_assessed` · `sample`

Related attributes: `data-seal`, `data-risk`, `data-class` (e.g. IVD class A–D), `data-kind`. **Status is never conveyed by color alone** anywhere in the app — every status chip pairs a tone with an icon/shape and a text label, and numeric scores are shown as numbers. Preserve this.

---

## 0.7 Table of contents

- **Part 0 — Orientation** (above): how to read · four-layer model · shared shell idiom · honesty contract · governed-action ladder · `data-status` contract
- **Part 1 — App Shell, Routing & Navigation Chrome** — the IA backbone, LayoutMode catalog, route table, Home & Projects, global contexts
- **Part 2 — Design System: Primitives, Tokens & Global UX** — ~76 UI primitives, the token namespaces, `data-status`, EsignModal, i18n, flags
- **Part 3 — AnA AI Layer (Document Studio)** — streaming chat, split-pane Studio, the 10 trust panels, affordance cards, the seal/sign chain, SSE event model
- **Part 4 — MDX Medical-Device Workspace** — 510(k)/De Novo, PMA, CER, IVDR, UDI, post-market, pathway tabs, drafter
- **Part 5 — Biopharma / PDEV / CMC** — IND→NDA/BLA lifecycle, CMC/Module 3, PDEV readiness, pediatric/PV/orphan
- **Part 6 — Submission Assembly · Authoring · Labeling** — submission gateway & eCTD, the universal authoring engine, labeling, the e-signature modal
- **Part 7 — Cross-Cutting Workflows** — auth, projects, tasking, quality/QMS, risk, communication, knowledge, shared shell components
- **Part 8 — Insights, Intelligence & API Surface Map** — Report-OS, the intelligence surfaces, and the ~200 `/api/*` route-group catalog
- **Part 9 — Reconciliation Backlog & Master Gaps** — duplicated surfaces, token fragmentation, vocabulary divergence, and what's still sample-data today


---

# Part 1 — App Shell, Routing & Navigation Chrome

## Area — overview

This area is the **navigation/IA backbone** of Concept2Cure.RI / AnA — the outer mount, the wouter route map, the `ZenApp` layout-mode dispatcher (~2,357 lines), the Phase-1 Home surface (rail + topbar + command palette + dashboard), and the Projects list/detail surfaces. Files read (16 substantive + supporting data files):

- `client/src/main.tsx` — React root + global providers
- `client/src/App.jsx` — outer route switch, auth aliases, provider tree
- `client/src/concept2cure/router/ZenRouter.tsx` — auth gate + route table
- `client/src/concept2cure/router/approvedRoutePolicy.ts` — external-testing route allowlist
- `client/src/concept2cure/router/projectModuleRoutePolicy.ts` — `/project/:id/:module` parser
- `client/src/concept2cure/router/zenRouteNormalization.ts` — demoted-mode redirects
- `client/src/concept2cure/ZenApp.tsx` — the layout-mode dispatcher / shell
- `client/src/concept2cure/zen-app-constants.ts` — LayoutMode catalog, nav maps, tool panels
- `client/src/concept2cure/components/concept2cure-home/*` — Home (Concept2CureHome, AnaCard, CommandPalette, data.tsx)
- `client/src/concept2cure/components/concept2cure-projects/*` — Projects (Screen, List, Detail, Filters, MoreMenu, types, data)
- `client/src/concept2cure/context/ProjectContext.tsx` + `contexts/DocumentModeContext.tsx`

**The single most important architectural fact for designers:** `ZenApp` is a giant `if`-cascade keyed on a `layoutMode` string. ~110 `LayoutMode` values exist in the *type union*, but **only ~10 actually render a real surface today**. The rest are either (a) early-return routes to one of the four "design-system bundle" surfaces, (b) **redirected on mount** to a surviving mode, or (c) **dead** — they fall through to a final `<Redirect to="/concept2cure" />`. The product's real navigable IA is much smaller than the type list suggests. The four canonical "bundle" surfaces are: **Home**, **MDX (Medical Device & Diagnostics)**, **AnA RI chat shell**, **eCTD co-authoring**. Everything else is a domain shell (CMC, Labeling, Risk, Tasking, Communication, Submission Gateway, Intelligence, Quality, Authoring, Project Detail) or a redirect.

---

## OUTER MOUNT & PROVIDER STACK

### React root — `client/src/main.tsx`
- **Route / entry:** the literal `#root` mount; first code to run.
- **Purpose:** boot the SPA, install CSP nonce + Sentry + i18next before any render.
- **Layout & regions:** none (mount only).
- **Provider tree (outer→inner):** `React.StrictMode` → `ErrorBoundary` → `I18nextProvider` → `QueryClientProvider` → `FileContextProvider` → `<App/>` + `<Toaster/>`.
- **Notes for design:** Design-system tokens (`design-system/colors_and_type.css`), `projects-prototype.css`, then `index.css` load in that order — token vars (`--accent-100`, `--bg-000`) must resolve before any component CSS. i18n is initialized pre-render so first paint reflects detected language and `<html lang>`.

### App route switch — `client/src/App.jsx`
- **Route / entry:** every URL (it is the top `<Switch>`).
- **Purpose:** auth-alias redirects + mount the lazy `ZenRouter`.
- **Provider tree added here:** `ModuleErrorBoundary` → `ErrorBoundary` → `QueryClientProvider` → `AuthProvider` → `LanguageProvider` → `TenantProvider` → `EvidenceGraphProvider` → `<Switch>`.
- **Routes (verbatim):**
  - `/sign-in`, `/auth`, `/login` → **Redirect** `/concept2cure/login`
  - `/client-portal`, `/client-portal/:rest*` → **Redirect** `/concept2cure`
  - `*` (everything else) → `<Suspense><ZenRouter/></Suspense>`
- **Notes for design:** `memoryOptimizer.startPeriodicCleanup()` runs at module load. Loading shim is an invisible transparent div (`aria-hidden`).

---

## ROUTER LAYER — `router/ZenRouter.tsx`

- **Purpose:** auth gating + the canonical route table; wraps the protected app in `ProjectProvider`.
- **Auth model:** uses `usePortalAuth()` (from `@/services/portal/authService`). `ProtectedRoute` redirects unauthenticated users to `/concept2cure/login?returnTo=<encoded path>`. `AuthRoute` redirects already-authenticated users away from auth pages to `/concept2cure`. While `isBootstrapping`/`isLoading`, renders an invisible transparent loading screen.
- **Page transition:** every route is wrapped in `PageTransition` — Framer Motion fade+slide (`opacity 0→1`, `y 8→0`, 0.18s, cubic-bezier `[0.2,0,0,1]`). Exit `y 0→-8`. `<AnimatePresence mode="wait">` keyed on location.

### Full route catalog (verbatim paths)
| Path | Renders | Notes |
|---|---|---|
| `/concept2cure/login` | `Concept2CureLogin` (in `AuthRoute`) | sign-in / MFA / forgot/reset password |
| `/concept2cure/signup` | `ZenSignup` (legacy) | request-access |
| `/login` | Redirect → `/concept2cure/login` | |
| `/signup` | Redirect → `/concept2cure/signup` | |
| `/concept2cure/password-reset` | `Concept2CureLogin` | |
| `/concept2cure/onboarding` | Redirect → `/concept2cure` | |
| `/billing`, `/billing/success`, `/billing/canceled` | Redirect → `/concept2cure` | |
| `/concept2cure/mdx` | `MdxRoute` (protected) | Medical Device & Diagnostics standalone |
| `/concept2cure/insights` | `InsightsSurface` (protected) | reporting/analytics/prediction |
| `/` | `ProtectedZenApp` | |
| `/concept2cure/project/:projectId/:rest*` | `ProtectedZenApp` | project + module deep-link |
| `/concept2cure/project/:projectId` | `ProtectedZenApp` | project workspace |
| `/concept2cure` | `ProtectedZenApp` | home/projects |
| `/concept2cure/*` | `ProtectedZenApp` | catch-all under namespace |
| `*` (any other) | Redirect → `/concept2cure` | |

`ProtectedZenApp` = `<ProtectedRoute><ProjectProvider><ZenApp/></ProjectProvider></ProtectedRoute>`.

### Approved-route policy — `router/approvedRoutePolicy.ts`
- **Purpose:** an "external testing mode" allowlist that fences which routes are reachable during launch-safe demos. Inert unless `externalTestingMode` (read from `localStorage['concept2cure_external_testing_mode']`) is true.
- **Allowed exact:** `/concept2cure`, `/concept2cure/projects`. **Allowed prefix:** `/concept2cure/vault/*`, `/concept2cure/review/*`, `/concept2cure/setup/*`. **Allowed project modules:** `510k`, `pma`, `cer`. **Hidden:** `/concept2cure/{admin,internal,labs,legacy}/*`. Everything else **redirects** to fallback (`/concept2cure/project/:id` if a project is active, else `/concept2cure`). Dispositions: `allowed | redirected | hidden`.

### Project-module route policy — `router/projectModuleRoutePolicy.ts`
- **Purpose:** parse `/concept2cure/project/:id/:module/...` and decide shell-embed vs standalone.
- **Supported modules (`ProjectModuleKey`):** `510k`, `pma`, `cer`, `ind`, `ectd`, `cmc`.
- Gated by feature flag `EMBED_MODULES_IN_SHELL`. When on, supported module routes render *inside* the ZenApp frame (`shouldRenderInShell`); else standalone.

### Layout-mode normalization — `router/zenRouteNormalization.ts`
- **`DEMOTED_LAYOUT_REDIRECTS`** (redirect-on-mount, no renderer): `mission-control`→`projects`, `snowglobe`/`snowglobe-chambers`→`projects`, `rules`→`projects`, `ectd-coauthor`→`documents`, `document-vault`→`vault`, `vault-workspace`→`vault`, `review-readiness`→`review`, `clinical-trial`→`documents`, `document-builder`→`documents`, `artifacts`→`artifacts-center`, `sherpa`/`analytics`/`timeline`/`audit`→`projects`, `enablement-center`/`platform-admin`/`biologics-dashboard`/`ctd-onboarding`/`client-intelligence`/`collaboration-hub`/`user-inbox`/`client-branding`/`training-center`/`client-onboarding`/`knowledge-base`/`project-knowledge`/`ana-platform-control`→`projects`.

---

## THE SHELL — `ZenApp.tsx`

- **Route / entry:** rendered for `/`, `/concept2cure`, `/concept2cure/project/:id[/...]`, `/concept2cure/*`.
- **Purpose:** the application shell. Resolves URL + `layoutMode` state into exactly one rendered surface; owns global modals (settings, command palette, new/edit project, first-run), keyboard shortcuts, AnA navigation routing, and all project CRUD handlers.
- **Initial layoutMode:** `urlProjectId ? 'regulatory-workspace' : initialProjectId ? 'project-home' : 'projects'`.

### How a user moves between surfaces (navigation model)
1. **URL → state:** `useLocation()` (wouter). Deep links `/project/:id` set `activeProjectId` + `layoutMode='regulatory-workspace'`. Legacy `?projectId=` and `?panel=` query params supported. `?nav=<dest>` on first load dispatches through `handleAnaPanelNavigate`.
2. **`handleAnaPanelNavigate(path)`** — the central nav router (~220 lines). Every rail tile, home tile, and palette item flows through it. It maps a string id to a `layoutMode` set + side-effects. Key branches:
   - `projects`, `ectd-coauthor`, `pdev`, `cmc`, `labeling`, `risk`, `tasking`, `communication`, `submission-gateway`, `quality`, `artifacts`→`authoring`, `protocol`/`biostat`/`reporting`→`intelligence` (sets `intelligenceTab`).
   - **`BUNDLE_MDX_HASH`** map → sets `mdxDeepLink` hash and `layoutMode='mdx'`: `mdx`, `biopharma`, `device-diagnostics-workbench`→`#device-diagnostics-workbench`, `vault`→`#vault`, `submission`→`#submissions`, `protocol`→`#templates`, `reporting`→`#analytics`, `memory`→`#memory`, `artifacts`→`#vault`, `audit`/`admin`→`#admin`.
   - **`BUNDLE_INTENTS`** (`biostat`) → seeds an AnA chat message and switches to chat shell.
   - `ana-intelligence`→opens Settings@`ana-intelligence`; `project-config`→opens edit-project; `open_capabilities`→project-home + seeded chat; `guided_*` (project/ind_ectd/authoring/verify/submission)→workspace + `guidedStageRequest`.
   - Project-scoped layouts route through `requireActiveProject` (opens project picker if none selected, with toast "Pick a project / Choose a project to continue.").
   - Falls back via `SIDEBAR_NAV_TO_LAYOUT`, then `SAFE_ANA_NAV_TARGETS`, else warns and lands on `project-home`/`projects`.
3. **Persisted nav state:** `c2c.rail.collapsed`, `c2c.rail.activeNav` (Home rail); per-project `currentWorkbenchContext` saved server-side (ownership preferences) and restored on project open.

### Global chrome owned by the shell
- **Settings modal** (`settingsOpen`, `settingsSection`) — opened via ⌘ shortcut, account/org/intelligence palette actions, and several nav ids. Section `ana-intelligence` is the AI-config panel.
- **Command palette** (`commandPaletteOpen`) — opened via keyboard; `handleCommandAction` routes ~40 action ids (see below).
- **New / Edit project dialogs** (`newProjectOpen`, `editProjectOpen`).
- **First-run** (`showFirstRun`) — gated on `localStorage['concept2cure_first_run_complete']`; auto-dismisses once projects exist.
- **Tool panels** (`activeToolPanel`, `toolPanelFullscreen`) — right-side slide-in panels (see TOOL_PANELS).
- **Keyboard shortcuts** via `useZenKeyboardShortcuts`: open command palette, open settings, open edit-project, close tool panel, open Vault panel, new chat, set layout mode.

### Command-palette action routing (`handleCommandAction`, verbatim ids)
- **Tool opens** (`tool-*`): only `ectd`, `intelligence`, `vault`, `doc-editor`, `ana-biostats` supported; others toast "Command unavailable / This tool is not enabled in the current workspace."
- **MODULE_ROUTES:** `go-copilot`→regulatory-workspace, `go-home`→projects, `go-review-readiness`→review-readiness, `go-biostatistics`→regulatory-workspace (+ana-biostats panel), `go-report-engine`→report-engine.
- **NAV_ACTION_ROUTES** (project-scoped guarded): `nav-intelligence-feed`, `nav-gap-analysis`, `nav-change-impact`, `nav-ana-memory`, `nav-mission-control`, `nav-artifact-graph`, `nav-review-center`, `nav-dossier-view`, `nav-risk-cockpit`, `nav-route-planner`, `nav-evidence-manager`, `nav-decision-log`, `nav-authority-tracker`, `nav-provenance-trail`, `nav-notifications`, `nav-collaboration-hub`, `nav-task-board`, `nav-team-workspace`, `nav-program-analytics`, `nav-snowglobe`, `nav-snowglobe-chambers` (most of these targets are dead/redirected modes).
- **Other:** `go-author`→documents, `go-agents`→workspace(intelligence), `new-chat`, `new-510k`/`new-ind`/`new-nda`/`new-bla`/`new-pma`→new-project dialog, `settings-account`/`settings-org`/`settings`→settings, `settings-intelligence`/`ana-intelligence`→settings@ana-intelligence, `projects`→projects.

### Workspace top-bar header actions (`handleHeaderAction`, verbatim)
`ri-copilot` (Intelligence), `submission-builder` (Submission Builder), `cmc` (CMC), `clinical-module5` (Clinical / Module 5), `verify` (Verify), `review` (Review), `publish` (Publish), `haq` (HAQ), `vault` (Vault Workspace). These flip `riViewMode` (`intelligence`|`editor`) and/or call `requireActiveProject(targetLayout)`. `currentGlobalNodeLabel` maps nav-id → human label for the header crumb.

---

## LayoutMode CATALOG — `zen-app-constants.ts`

The `LayoutMode` type union has ~110 members. Below, grouped by what they actually render in `ZenApp`'s if-cascade. **RENDERS** = produces a distinct surface; **→bundle** = early-returns to a bundle component; **REDIRECT** = normalized/redirected on mount; **DEAD** = falls to final `<Redirect to="/concept2cure">`.

### Surfaces that RENDER a distinct component (the real navigable IA)
| layoutMode | Renders | Component | Project-scoped? |
|---|---|---|---|
| `projects` | **Home / Projects** | `<Concept2CureHome>` | no |
| `mdx` | **Medical Device & Dx** | `<MdxRoute initialNav={hash}>` | no |
| `pdev` | **Pharmaceutical Development** | `<PdevRoute>` (flag `ENABLE_PDEV_SURFACE`) | no |
| `biopharma` | **Biopharma domain shell** | `<BiopharmaRoute>` | no |
| `cmc` | **CMC workstream** | `<CmcRoute>` | no |
| `labeling` | **Labeling** | `<LabelingRoute>` | no |
| `risk` | **Risk (ISO 14971)** | `<RiskRoute>` | no |
| `tasking` | **Tasking & Collaboration** | `<TaskingRoute>` | no |
| `communication` | **Communication Center** | `<CommunicationRoute>` | no |
| `submission-gateway` | **Submission Gateway** | `<SubmissionRoute>` | no |
| `intelligence` | **Intelligence cluster** | `<IntelligenceRoute initialNav={tab}>` | no |
| `quality` | **Quality / SOP register** | `<QualityRoute>` | no |
| `authoring` | **Universal Authoring** | `<AuthoringRoute initialDocType>` | no |
| `project-detail` | **Project detail** | `<ProjectDetailRoute>` | yes |
| `ectd-coauthor` | **eCTD co-authoring** | `<ClaudeEctdCoauthor>` | (project) |
| `project-home` / `regulatory-workspace` / `deep-research` | **AnA RI chat shell** | `<Ana mode="full">` | yes (deep-research no) |

### Embedded-module surfaces (URL `/project/:id/:module`, flag `EMBED_MODULES_IN_SHELL`)
- `ectd` → `<ClaudeEctdCoauthor>`; `510k`→MdxRoute `#k510`; `pma`→`#pma`; `cer`→`#cer`; `ind`/`cmc` → **redirect** to project chat shell (bundle hasn't designed them).

### Type-union members that are REDIRECTED on mount (`DEMOTED_LAYOUT_REDIRECTS`)
`mission-control`, `snowglobe`, `snowglobe-chambers`, `rules`, `document-vault`, `vault-workspace`, `review-readiness`, `clinical-trial`, `document-builder`, `artifacts`, `sherpa`, `analytics`, `timeline`, `audit`, `enablement-center`, `platform-admin`, `biologics-dashboard`, `ctd-onboarding`, `client-intelligence`, `collaboration-hub`, `user-inbox`, `client-branding`, `training-center`, `client-onboarding`, `knowledge-base`, `project-knowledge`, `ana-platform-control` (and `ectd-coauthor`→documents in the table, though it has a live early-return above).

### DEAD layoutModes (fall through to final `<Redirect to="/concept2cure">`)
Per the in-code "TO BE REMOVED" comment, these still exist in the union but render nothing: `apps`, `artifacts-center`, `biostatistics` (forces ana-biostats panel + redirect), `csr-workflow`, `ctd`, `device-diagnostics-workbench`, `documents`, `dossier-map`, `editor`, `ind-checklist`, `precedent-intelligence`, `report-engine`, `review`, `safety-narrative`, `section-workspace`, `setup`, `submissions`, `task-board`, `templates`, `template-library`, `vault`, `workspace`. Plus pure type-safety stubs: `assistant`, `medtech-dashboard`, `dossier`, `ind-workspace`, `submission-workspace`, `author`, `intelligence-hub`, `command-center`, `legal-center`, `about-training`, `ana-dashboard`, `integrations`, and the MissionControl sub-modes (`intelligence-feed`, `gap-analysis`, `change-impact`, `ana-memory`, `artifact-graph`, `review-center`, `dossier-view`, `risk-cockpit`, `route-planner`, `evidence-manager`, `decision-log`, `authority-tracker`, `provenance-trail`, `notifications`, `program-wizard`, `team-workspace`, `program-analytics`).

> **Design takeaway:** the catalog of ~110 modes is largely legacy/aspirational. The product that ships is the ~16 RENDERS rows above. `PROJECT_SCOPED_LAYOUTS` (require an active project): `project-home, documents, review, submissions, dossier-map, section-workspace, csr-workflow, ind-checklist, template-library, regulatory-workspace, editor, precedent-intelligence, biostatistics, review-readiness, report-engine, safety-narrative, device-diagnostics-workbench, vault-workspace, task-board`.

### TOOL_PANELS (right-side slide-in panels)
`ectd` (eCTD Navigator), `protocol` (Protocol Designer), `intelligence` (Regulatory Intelligence), `vault` (Document Vault), `doc-editor` (Document Editor), `ana-biostats` (AnA Biostats), `sop` (SOP Management), `capa` (CAPA Management), `pms` (Post-Market Surveillance), `inspection` (Inspection Readiness). Each has a title + lucide icon + component name.

### Nav-id maps
- **`PRIMARY_NAV_ID_BY_LAYOUT`** and **`LEGACY_NAV_ID_BY_LAYOUT`** map layoutMode→header nav id (e.g. `documents`→`work`, `submissions`→`publish`, `review`→`review`, `regulatory-workspace`→`submission-builder`).
- **`SIDEBAR_NAV_TO_LAYOUT`** maps sidebar/string ids → layoutMode (e.g. `documents`→regulatory-workspace, `verify`→review-readiness, `publish`/`submit`→submissions, `tools`→documents, `dataroom`/`upload`→regulatory-workspace).

### Industry modes / project colors
- **INDUSTRY_MODES:** `biotech, pharma, cro, medtech, academic, regulatory, medical_writing` (default `biotech`).
- **Project type colors:** 510K=blue, IND=purple, NDA=green, BLA=orange, PMA=red, MAA=pink, DE_NOVO=amber, EUA=cyan.

---

## HOME SURFACE — `components/concept2cure-home/`

### Concept2CureHome — `Concept2CureHome.tsx`
- **Route / entry:** `layoutMode === 'projects'` early-return in ZenApp. Phase-1 design-system home.
- **Purpose:** landing surface — left rail + topbar + greeting/composer + AnA briefing + dashboard + module launcher + recents. When the rail's `projects` item is active, swaps the page body for `<ProjectsScreen>`.
- **Layout & regions:** `[ Rail (left) | Main { TopBar (header) ; Page body } ]` + floating `CommandPalette` + optional `TweaksPanel`.
- **Left Rail (`Rail`):** logo "Concept2Cure**.RI**"; collapse chevron; search button "Search artifacts, chats…" with `⌘K` kbd (opens palette); section label "Modules"; nav items (see NAV_ITEMS); when active+expanded, a sub-drawer of either live project names (for `projects`) or static `NAV_SUB` entries; spacer; account button (avatar initials + name + role + chevron, opens account/settings).
- **TopBar (`TopBar`):** breadcrumb `Concept2Cure.RI › <active nav label>`; `ScopeSwitcher` (tabs: All / Biopharma / Device/Dx); workspace pill "BioNova Therapeutics" (opens workspace switcher → settings); `LanguageSwitcher`; search btn; notifications bell (with dot badge); help btn.
- **Greeting/Composer (`GreetAndCompose`):** ✻ star + time-of-day greeting `"Good {morning/afternoon/evening}, {name}"`; sub-prompt; textarea placeholder "Ask AnA — draft a section, pull a precedent, review a SAP…" (Enter to send → `onLaunchChat` seeds AnA chat); composer buttons: Attach, Tools, model chip "AnA 1.0 RI ▾", Send (▲, disabled when empty); suggestion pills (SUGGESTIONS).
- **AnA briefing card (`AnaCard`):** "AnA · morning briefing · {lastSync}"; dismiss X; body = "{n} things need you today" OR "You're all caught up…"; numbered briefing rows (live RIM next-actions); actions "Start with #1 →" + "See all tasks" (opens palette).
- **Dashboard:** header "At a glance" + "View all dashboards →"; 4 metric cards (DASH) each with **honesty pill "Sample data"** when the live fetch failed. Live sources: Active projects (`/api/concept2cure/projects`), Tasks due + Alerts (`/api/concept2cure/reviews/my-queue`); Submission readiness has no org aggregate → always "Sample data".
- **Module launcher (`Launcher`):** "All modules" + "Customize →"; cards from MODULES (`<a href>`), pinned domain cards styled distinctly.
- **Recents (`Recents`):** "Recent activity" (+ "Sample data" pill if no live threads) + "View all →"; rows of chat threads or static RECENTS demo rows with status pills.
- **Controls & actions:** every rail/launcher/palette nav click → `handleSelectNav(id)` → host `onNavigate` (ZenApp) first, then local active-nav. Dashboard tile click → `onDashboardTileClick(slug)`. Briefing/thread clicks deep-link to projects or seed chat.
- **States:** Sample-data pills on Dashboard/Recents/Projects when live fetch empty/errors; AnA card "all caught up" empty state; rail collapsed state (persisted).
- **Gating:** `ENABLE_PDEV_SURFACE` hides the `pdev` rail item + module card. Tweaks/edit mode activates via canvas `postMessage` or `?tweaks=1`.
- **Notes for design:** "Tweaks" panel (Dark mode toggle, Rail collapsed toggle, Active module segmented: Device/Biopharma/Projects) is a designer-only preview surface, gated behind edit mode. Bundle hardcodes user "Jordan / JC"; production injects real auth user.

### NAV_ITEMS (rail/launcher/palette modules — verbatim, `data.tsx`)
Grouped by `group`:
- **domain:** `mdx` "Medical Device and Diagnostics", `biopharma` "Biotech and Pharma", `pdev` "Pharmaceutical Development".
- **work:** `projects` "Projects", `vault` "Vault DMS", `tasking` "Tasking and Collaboration", `communication` "Communication Center", `submission` "Submission Center".
- **intelligence:** `protocol` "Protocol and Study Design", `cmc` "CMC Module", `biostat` "Biostatistics", `quality` "Quality and Lifecycle", `reporting` "Reports".
- **system:** `memory` "AnA Memory", `artifacts` "User Artifacts", `audit` "Audit and Compliance", `admin` "Admin Settings".

`NAV_SUB` provides per-item static sub-drawer entries (e.g. cmc: "Drug substance · §3.2.S / Drug product · §3.2.P / Stability studies / Specifications"; audit: "21 CFR Part 11 trail / E-signatures / Access log / Change history"; admin: "Users & roles / Integrations / Agency credentials / Billing").

`DASH` metrics: Submission readiness 87% (bar, "NDA 212345 · 3 items blocking"), Active projects 14, Tasks due 7, Alerts 2. `MODULES` = one launcher card per nav item with title/desc/foot. `SUGGESTIONS`: Draft CTD Section 2.5 / Find 510(k) predicates / Review biostat SAP / Submission readiness / Cross-agency precedent. `SCOPE_OPTIONS`: All / Biopharma / Device-Dx. `BRIEFING_BY_SCOPE`: scoped demo briefing rows.

### CommandPalette — `CommandPalette.tsx`
- **Route / entry:** ⌘K / Ctrl+K anywhere on Home; "See all tasks" on AnaCard.
- **Purpose:** fuzzy launcher — jump to a module, ask AnA, or resume a recent.
- **Layout:** backdrop + dialog; input row (search icon, placeholder "Ask AnA, jump to a module, search recents…", `Esc` kbd); grouped list (sections in order **Ask AnA / Module / Recent**); footer hints "↑↓ navigate / ↵ select / Esc close".
- **Items:** `Module` = all `visibleNavItems()` (hint "Open"); `Ask AnA` = 5 fixed prompts (hint "↵ Ask"); `Recent` = 3 demo rows (hint "Resume"). Empty: "No matches for \"{q}\"".
- **Controls:** ArrowUp/Down move focus, Enter selects, Esc/backdrop close. Only `Module` items trigger a rail/route nav (`onPaletteNav`).
- **Note:** This is the **Home** command palette — distinct from ZenApp's own `commandPaletteOpen`/`handleCommandAction` palette used in workspace modes.

### icons.tsx / styles.module.css / useHomeData.ts / useHomeBriefing.ts
- `useHomeData` → `metrics`, `recentThreads`, `projects` (live with sample fallback). `useHomeBriefing` → live RIM next-action briefing items. `HomeIcon` is a lucide name→glyph map. CSS Modules scope the entire home stylesheet (37KB).

---

## PROJECTS SURFACE — `components/concept2cure-projects/`

### ProjectsScreen — `ProjectsScreen.tsx`
- **Route / entry:** rendered inside Home when rail nav = `projects`.
- **Purpose:** owns list↔detail toggle plus three global overlays.
- **Sub-components:** `ProjectsList` (list) / `ProjectDetail` (when `openId` set); modals `ProjectQuickSwitcher` (⌘K), `ProjectNotifications`, `NewProjectDialog`. Data via `useProjectsApi` (live + seed fallback).

### ProjectsList — `ProjectsList.tsx`
- **Layout & regions:** header (title "Projects" + "Sample data" pill when seed + subtitle "Persistent workspaces with chats, memory, instructions and shared files." + right cluster: notifications bell w/ dot, quick-switch search (⌘K), "New project" primary btn); `ProjectsListFilters`; `ProjectsListBulkBar`; rows; empty states.
- **Row anatomy:** checkbox; name (+ star if starred); description; mini submission-progress bar (`{type} · {completed}/{total}`); chat count; file count. Click opens detail.
- **States:** seed/"Sample data" pill; empty `no-projects` (→ create); filtered-empty `no-results` (→ clear). Bulk bar: archive / export (JSON snapshot download) / transfer (pending) / delete — all confirm via `ProjectArchiveModal`.
- **Status labels (verbatim):** active "Active", in_review "In review", submitted "Submitted", draft "Draft", archived "Archived".
- **Saved views (localStorage `concept2cure.projects.savedViews.v1`):** plus built-in `PLF_SAVED_VIEWS`: "My active 510(k)s", "Pending agency response", "EU MDR — this quarter", "Archived".

### ProjectsListFilters — `ProjectsListFilters.tsx`
- Saved-views row (toggle pills + "Save view" inline form). Search ("Search by project, sponsor, or product…"). 5 multi-select filter pills with counts: **Type, Status, Agency, Owner, Activity**. "Clear all (n)".
- Filter options (`data/filters.ts`): TYPES `510(k), IND, NDA, BLA, PMA, EU MDR CER, IVDR`; STATUSES `Active, In review, Submitted, Draft, Archived`; AGENCIES `FDA, EMA, PMDA, MHRA, Health Canada`; OWNERS `JM Smith, A Park, L Tanaka, F Müller, D Reyes`; ACTIVITY `Today, This week, This month, This quarter`.

### ProjectDetail — `ProjectDetail.tsx`
- **Layout & regions:** "← All projects" back; header (title; **status pill** (click cycles draft→active→in_review→submitted→active, `data-status`, governed `useTransition`); right cluster: search (⌘F), configure (gear, opens `ProjectConfigPanel`), `ProjectMoreMenu` (⋯), star toggle); description; optional **PDEV section** (IND projects only — tiles: Program overview / IND assembly / FDA interactions → `onOpenPdev`); **tabs**; tab body; modals.
- **Tabs (`DetailTab`, verbatim):** Chats (count), Schedule, Memory, Instructions, Files, Linked, Activity. Each is a separate tab component in `tabs/`.
- **Governed actions (21 CFR Part 11):** `useClaim` (⋯ "Claim project"), `useTransition` (status pill), `useSign` + `useLock` (forwarded to ConfigPanel / `ReasonModal`). `ReasonModal` captures reason-for-change (+ optional re-auth password/TOTP for sign; + email for transfer) — all "recorded in the audit log".
- **�was/state:** ⌘F → `ProjectInternalSearch`. Archive/delete/restore via `ProjectArchiveModal`. Config save persists name/desc/status/product/sponsor/targetAgency/targetDate/submissionType.

### ProjectMoreMenu — `ProjectMoreMenu.tsx`
- ⋯ dropdown: "Claim project" (if unclaimed), "Duplicate as template", "Export project (ZIP)", "Archive project", "Delete project…" (danger).

### NewProjectDialog — `modals/NewProjectDialog.tsx`
- 3-step wizard: **region → type → confirm**. Regions (`NPD_REGIONS`): US/FDA, EU/EMA, GB/MHRA, CA/HC, JP/PMDA, CH/Swissmedic (each with count). Application types per region grouped by family (Device clearance / Device approval / Clinical trial / Marketing authorization / Supplement / Pre-submission). Each type carries `applicationType`, `dossierStandard` (eSTAR/eCTD/IMDRF/MEDDEV), `stage`, and a `preset`. Confirm step shows a **section/milestone/artifact/gateway preview** (`NPD_PREVIEWS`, e.g. 510k → 10 sections, 5 milestones, "CDRH eSTAR" gateway). Fields: name, product, sponsor (default "Concept2Cure").

### Project tab/modal/panel leaf components (one-liners)
- `tabs/ChatsTab` — project conversation list + composer (prefill support).
- `tabs/ScheduleTab` — schedule-of-events view.
- `tabs/MemoryTab` — AnA memory summary/learnings.
- `tabs/InstructionsTab` — project custom instructions (save w/ active toggle).
- `tabs/FilesTab` — project files (+ "Ask AnA" on a file).
- `tabs/LinkedTab` — linked projects (predicate/parent IND/510k/sister/reference).
- `tabs/ActivityTab` — audit-style activity log (export/file/memory/instr/esig/comment/lifecycle/access kinds, e-sig flag).
- `panels/ProjectConfigPanel` — settings drawer (general/instructions/team/compliance/settings tabs; danger zone lock/transfer).
- `modals/ProjectQuickSwitcher` — ⌘K project picker.
- `modals/ProjectNotifications` — notifications panel (agency/predicate/supplier/review/lifecycle kinds).
- `modals/ProjectInternalSearch` — ⌘F in-project search (jumps to a tab).
- `modals/ProjectArchiveModal` — archive/restore/delete confirm.
- `modals/ReasonModal` — reason-for-change capture (+ re-auth / email) for governed actions.

---

## GLOBAL APP STATE (context the shell provides)

### ProjectContext — `context/ProjectContext.tsx`
- Wraps `ZenApp` (in `ProtectedZenApp`). A `useReducer` store for projects, conversations, artifacts, active selections, and a `ui` slice (sidebarCollapsed, artifactPanelVisible/Width, theme light/dark/system, isTyping…). Actions: project/conversation/artifact CRUD, message add/edit, fork conversation, publish/remix artifact, UI toggles, user-profile. **Persistence: localStorage** (`concept2cure_state`, `concept2cure_user_profile`) + cross-tab `storage` event sync. Exposes `useProject()`.

### DocumentModeContext — `contexts/DocumentModeContext.tsx`
- Stage-aware editor-mode system. `DocumentMode`: `none | preview | view | edit | readonly | draft | review | locked`. `WorkflowStage`: project-home / dossier / documents / section-workspace / review / submissions. `ArtifactStatus`: draft/review/approved/locked. `ModeCapabilities` flags drive editor affordances (editable, showToolbar, showAIActions, canSave, canToggleLock, slashCommands, showEditButton, showReviewToggle, canvasVisible, canApprove, canSign, canRelocate, canRollback, canMoveDocument). Mode transitions are auditable (Part 11) via `onModeChange`.
- Other shell providers (from main/App): `TenantProvider`, `LanguageProvider`, `EvidenceGraphProvider`, `FileContextProvider`, `AuthProvider` (portal), `QueryClientProvider`, `I18nextProvider`.

---

## Notes for design (cross-cutting)
- **Honesty contract:** "Sample data" pills appear on Home Dashboard tiles, Recents, and Projects list whenever a live fetch returns empty/errors — never render fake zeros as real. NewProjectDialog uses `pr-${Date.now()}` mock ids (to be replaced).
- **Part 11 / governed actions:** status transition, claim, sign (e-signature w/ re-auth), lock, transfer — all route through `ReasonModal` (reason-for-change capture) and are described as audit-logged. Activity tab is the per-project audit trail.
- **Accessibility present:** rails/tabs use `role`/`aria-current`/`aria-selected`/`role="tablist"`; palette has labeled dialog + keyboard nav; loading screens are `aria-hidden` transparent divs; reduced page-transition motion (0.18s) is the only shell animation.
- **Two distinct command palettes** exist (Home's `CommandPalette` vs ZenApp's `handleCommandAction`) — a redesign should reconcile them.
- **Workspace pill** hardcodes "BioNova Therapeutics"; there is no real org switcher UI yet (clicking it opens Settings).

---

### Open questions / gaps
- The real **org/workspace switcher** is stubbed (workspace pill → Settings; bulk "Transfer" is "pending workspace-picker kit"). No standalone tenant-switch surface was found in scope.
- `InsightsSurface` (`/concept2cure/insights`) and `MdxRoute` are referenced but their internals are out of this scope (separate inventory areas).
- The 13 domain-shell routes (`CmcRoute`, `LabelingRoute`, `RiskRoute`, `TaskingRoute`, `CommunicationRoute`, `SubmissionRoute`, `IntelligenceRoute`, `QualityRoute`, `AuthoringRoute`, `ProjectDetailRoute`, `PdevRoute`, `BiopharmaRoute`) render real surfaces but their internal IA is owned by other areas — only their shell entry points are documented here.
- `Settings` modal contents (sections beyond `ana-intelligence`) and the `Ana` chat shell internals are out of scope here.
- Feature-flag default values for `EMBED_MODULES_IN_SHELL` and `ENABLE_PDEV_SURFACE` are not in these files (live in `@/flags/featureFlags`).
- Whether any DEAD layoutModes are still reachable through un-audited internal `setLayoutMode` calls is uncertain — the code comments flag them as "awaiting deletion."

---

# Part 2 — Design System — Primitives, Tokens & Global UX

## Area overview
This area is the reusable building-block layer a designer must standardize before any screen can be rebuilt. It has three parts:

1. **UI primitives** — `client/src/components/ui/` (~76 files): the shadcn/Radix component kit plus two canonical in-house kits: `statesV2.tsx` (loading/empty/error/blocked/no-results/progress states) and `workspace-primitives.tsx` (headers, panels, tab bars, inspector rails, status badges for the core regulatory workflow). Several domain-specific primitives (`alarm.tsx`, `database-aware.jsx`, `regulatory-tooltip.jsx`, `status-badge.tsx`, `error-boundary.jsx`) layer regulated-product behavior on top.
2. **Theming / tokens** — multiple coexisting token namespaces, intentionally kept separate to avoid collisions:
   - **Canonical OKLCH source of truth:** `client/src/design-system/colors_and_type.css` (imported first by `index.css` and `main.tsx`).
   - **Claude-style chat shell tokens:** `client/src/concept2cure/design/claude-design.css`.
   - **Legacy "Zen" enterprise foundation:** `client/src/concept2cure/design/zen.css`.
   - **`--shadcn-*` HSL bridge:** declared in `client/src/index.css` `:root` — HSL component triples that `hsl(var(--shadcn-*))` in Tailwind consumes, deliberately namespaced so they don't collide with canonical direct-color tokens.
   - **Legacy `theme.css`:** `client/src/styles/theme.css`.
   - `theme.json`, `high-contrast.css`, `toast.css`.
3. **Global UX scaffolding** — i18n (`client/src/i18n/`, `client/src/locales/`), feature flags (`client/src/flags/featureFlags.ts`), error boundaries, toasts, and the unified `data-status` honesty/verdict attribute system.

Design principle running through everything (per file comments): **black/white/stone foundation, calm 200ms ease-out motion only (no spring/bounce), color-never-alone (verdict always has icon + text label), `prefers-reduced-motion` respected, WCAG 2.2 AA, 21 CFR Part 11 honesty contract (sample/unverified states surfaced explicitly).**

---

## PART A — UI PRIMITIVES (`client/src/components/ui/`)

### A1. statesV2.tsx — Canonical UI-state kit (`client/src/components/ui/statesV2.tsx`)
- **What it is:** v3.0.0 "Enterprise Edition" accessible state components. The one approved set for loading / empty / error / etc. Default export is an object bundling all of them.
- **Components & states:**
  - `LoadingState` — animated spinner + message. Props: `message` (default "Loading..."), `size` (`sm`=h-4/w-4, `md`=h-8/w-8, `lg`=h-12/w-12), `fullScreen` (renders as `role=dialog aria-modal` overlay with `bg-white/80 backdrop-blur`), `ariaLabel`. a11y: `role=status`, `aria-live=polite`, `aria-busy`, `sr-only` text.
  - `EmptyState` — icon + title + description + up to 2 actions. Action `variant`: `primary` (blue-600), `secondary` (gray-100), `destructive` (red-600). a11y: `role=region`, `aria-labelledby/describedby`, action group `role=group`.
  - `ErrorState` — red warning icon, title (default "Something went wrong"), message, optional `errorCode`, expandable "Technical details" `<details>`, "Try Again" retry button, "Get Help" support link. `fullScreen` variant focuses container. a11y: `role=alert`, `aria-live=assertive`.
  - `Skeleton`, `SkeletonText` (n lines, last 3/4 width), `SkeletonCard` (avatar + 2 lines + body), `SkeletonTable` (configurable rows×columns) — all `animate-pulse bg-gray-200`, `role=status aria-busy`.
  - `DataStateWrapper<T>` — generic wrapper that switches between loading → error → empty → children(data). Has built-in empty detection (null / empty array / empty object) overridable via `isEmpty`.
  - `InlineLoading` — tiny inline spinner for buttons.
  - `ProgressIndicator` — bar with `variant` (default blue / success green / warning yellow / error red), `size` (sm h-1 / md h-2 / lg h-3), `showPercentage`. a11y: `role=progressbar` with valuenow/min/max.
  - `InlineErrorState` — field/section-level red inline error with optional "Retry". `role=alert`.
  - `NoResultsState` — search-specific empty: shows `No results for "<query>"`, suggestion text (default "Try broadening your search or adjusting filters."), "Clear search" link.
  - `BlockedState` — permission denied / locked. Amber lock icon, title default "Access restricted", optional action.
  - `MissingConfigurationState` — setup-required. Blue gear icon, title default "Configuration required", optional action.
- **Notes for design:** This is the empty/loading/error vocabulary the whole product should share. Every state has an icon + heading + body + optional action triad; copy is calm/factual.

### A2. workspace-primitives.tsx — Canonical workflow layout kit (`client/src/components/ui/workspace-primitives.tsx`)
- **What it is:** v1.0.0 "the ONE approved set of layout components for the core biotech workflow." Mandated for Project Home, Dossier, Documents, Section Workspace, Review, Submissions.
- **Components:**
  1. `WorkspaceHeader` — 44px-tall (`h-11`) page header: optional Back button ("Back" + ChevronLeft), title icon, monospace breadcrumb, semibold title, status badge, type badge (e.g. "IND"/"NDA"), subtitle, meta slot, right-aligned actions. `border-b border-stone-200 bg-white`.
  2. `WorkspaceHeaderRich` — multi-line section header (px-6 py-3) with secondary-info line.
  3. `PageTitleHeader` — dashboard-level: 2xl semibold `<h1>`, metadata badge pills, description, actions.
  4. `WorkspaceStatusBadge` + `WORKFLOW_STATUS_CONFIG` — **the ONE canonical status config.** Pill: `rounded-full text-[10px]`, icon + label. Statuses (verbatim key → label → color):
     - `not-started` → "Not Started" → stone-100/stone-600 (Clock)
     - `drafting` → "Drafting" → blue-100/blue-700 (FileText)
     - `in-review` → "In Review" → amber-100/amber-700 (AlertTriangle)
     - `approved` → "Approved" → emerald-100/emerald-700 (CheckCircle2)
     - `blocked` → "Blocked" → red-100/red-700 (XCircle)
     - `locked` → "Locked" → purple-100/purple-700 (Lock)
     - `ready` → "Ready" → emerald-100/emerald-700 (CheckCircle2)
     - `needs-work` → "Needs Work" → amber-100/amber-700 (AlertTriangle)
     - `needs-review` → "Needs Review" → amber-100/amber-700 (Clock)
  5. `WorkspaceCanvas` — scrollable content wrapper. `maxWidth` 3xl/4xl/5xl/6xl/full; `bg` default(`stone-50/50`)/white/none.
  6. `SectionPanel` — `rounded-xl border border-stone-200` card with optional stone-50 title bar + headerRight slot, `noPadding` option.
  7. `WorkspaceTabBar` — underline tabs (`role=tablist`, `aria-selected/controls`), active = `border-stone-900`, optional count pill per tab.
  8. `WorkspaceActionBar` — left content + right-aligned action group, bottom border.
  9. `WorkspaceStatusStrip` — readiness/progress strip with summary text + progress bar; color auto: ≥80 emerald, ≥50 amber, <50 red, else stone.
  10. `SecondaryInfoItem` — "·" dot separator + `text-[11px] text-stone-400` metadata.
  11. `STATUS_ICON_MAP` — shared icon/color map for dossier trees (approved=emerald CheckCircle2, in-review=amber Clock, drafting=blue FileText, not-started=stone-300 Clock, blocked=red AlertTriangle, locked=stone-400 Lock, ready=emerald CheckCircle2, needs-work=amber AlertTriangle).
  12. `InspectorPanel` — w-72 right rail, `border-l`, optional title bar with "×" close.
  13. `InspectorRibbon` — grouped toggle toolbar (`role=toolbar`) for editor inspector panels. Each item: icon + label + optional badge count (amber dot) + pulse-when-active + "suggested" blue dot. **Progressive collapse:** only the active group expands; others collapse to a clickable label pill.
  14. `InspectorDrawer` — w-80 slide-in side panel; mobile = fixed overlay w/ `bg-black/20` backdrop, desktop = inline; 200ms ease-out slide+fade, respects mount/unmount animation.
- **Notes for design:** This is the entire chrome vocabulary for the regulated workflow — headers, panels, tabs, inspector rails, status pills. Colors are stone/emerald/amber/red/blue/purple as above.

### A3. Core shadcn / Radix primitives (verbatim variants where load-bearing)

- **button.tsx** (`Button`, `buttonVariants`) — Radix `Slot` (`asChild`). Variants: `default` (bg-primary), `destructive` (bg-destructive), `outline` (border-input bg-background), `secondary`, `ghost`, `link` (underline). Sizes: `default` (h-10 px-4), `sm` (h-9 px-3), `lg` (h-11 px-8), `icon` (h-10 w-10). `disabled:opacity-60`, `focus-visible:ring-2 ring-ring`. (`button/` dir + `button.stories.tsx` are the Storybook variants.)
- **badge.tsx** (`Badge`, `badgeVariants`) — `rounded-full border px-2.5 py-0.5 text-xs font-semibold`. Variants: `default` (bg-primary), `secondary`, `destructive`, `outline`.
- **status-badge.tsx** (`StatusBadge`) — domain pill, status union **`'Processing' | 'Processed' | 'Failed'`** → Processed=green-100/800, Processing=amber-100/800, Failed=red-100/800. `rounded-full text-xs font-semibold`.
- **toast.tsx** — Radix toast. Variants: `default` (bg-background) and `destructive` (border-destructive bg-destructive). Viewport: top on mobile, bottom-right on `sm`+, max-w 420px. Swipe-to-dismiss, slide animations. Exports Toast/Title/Description/Close(×)/Action/Provider/Viewport. `toaster.tsx` wires it to the `useToast` store.
- **alarm.tsx** (`AppAlarm`) — full-screen `bg-black/80 z-[9999]` modal "STABILITY ALARM ACTIVATED" with red header, destructive Alert, "Restart Server" + "FIX NOW" buttons. Dev-stability guard, animate-pulse.
- **error-boundary.jsx** — class `ErrorBoundary` (catches render errors → Card fallback "Something went wrong" + "Try Again"/"Go Home"; logs to `window.appMonitor`; shows stack only in non-prod) and `ModuleErrorBoundary` (catches Vite module-load errors → "Clear Cache & Reload"/"Go to Homepage", clears vite/hmr localStorage keys).
- **database-aware.jsx** — `DatabaseAware` (wraps children, shows skeleton while DB status loading, "Database Connection Issue" Card + "Retry Connection" when disconnected, reads `useDatabaseStatus()`) and `DataAware` (generic data wrapper: skeleton / "Error Loading Data" + Retry / empty message / children(data)).

*(Full enumeration of all ~76 primitives — section A4 below, appended after the subagent pass.)*

---

## PART B — THEMING / DESIGN TOKENS

> **Path reconciliation (important for the design team):** there are TWO near-identical Claude.ai-exact OKLCH token files:
> - `design-system/colors_and_type.css` (repo root, 21,059 bytes) — **the declared canonical source of truth**, imported first by `client/src/index.css` (`@import "../../design-system/colors_and_type.css"`) and by `main.tsx`. (It was also copied to `client/public/design-system/colors_and_type.css`; that copy had fallen 119 lines behind and was removed on 2026-08-10 — see Open questions below.)
> - `client/src/concept2cure/design/claude-design.css` (20,872 bytes) — a near-identical sibling ("Concept2Cure.RI — Colors & Type (Claude.ai-exact)") used by the AnA chat-shell CSS modules.
> The token catalog below was extracted from this OKLCH file family and applies to both. They differ only by a few hundred bytes; map from `design-system/colors_and_type.css`.

### B0. Token-layer map (four coexisting namespaces + overrides)
| File | Role | Namespace | Color format |
|---|---|---|---|
| `design-system/colors_and_type.css` (+ `concept2cure/design/claude-design.css`) | **Canonical source of truth** | `--background`, `--bg-*`, `--text-*`, `--accent-main-*`, `--font-*`, `--shadow-*`, `--radius*`, `--space-*`, `--dur-*`, `--ease*` | OKLCH (hex in comments) |
| `client/src/index.css` `:root` | **`--shadcn-*` HSL bridge** + global shims | `--shadcn-*` (HSL triples), plus `--color-*`, `--space-xs/sm/md/lg`, accent/dur aliases | HSL triples / hex |
| `concept2cure/design/zen.css` | Legacy enterprise theme (v3.0.0), self-contained | `--zen-*` (all prefixed) | hex/rgb |
| `styles/theme.css` | Legacy theme (has duplicate-key bugs) | `--color-*`, `--font-*`, `--text-*`, `--space-*`, `--elevation-*` | hex |
| `high-contrast.css` | Accessibility override (no tokens) | none — blanket `!important` | pure black/white |
| `theme.json` | Runtime theme config (shadcn-style JSON) | JSON keys | single hex |

### B1. Canonical OKLCH tokens — `design-system/colors_and_type.css` / `claude-design.css`
Light mode `:root`; dark mode `.dark, [data-theme="dark"]`. **Brand color = `#D97757` ("Claude orange"/terracotta)** — agreed across all four token files and `theme.json`.

**shadcn/Tailwind semantic surface (OKLCH; hex in comments):**
`--background` #faf9f5 (warm cream), `--foreground` #3d3d3a, `--card` #faf9f5, `--card-foreground` #141413, `--popover` #ffffff, `--popover-foreground` #2b2a28, `--primary` #c96442 (Claude orange pressed), `--primary-foreground` #fff, `--secondary` #ebe5d9, `--secondary-foreground` #5d5c57, `--muted` #eee5d0, `--muted-foreground` #8a8880, `--accent` #ebe5d9, `--accent-foreground` #2b2a28, `--destructive` #141413 (Claude destructive = ink, not red), `--destructive-foreground` #fff, `--border` #dad9d4, `--input` #b4b2a7, `--ring` #5088ea (blue focus ring).

**Data-viz (light):** `--chart-1` terracotta, `--chart-2` violet, `--chart-3/4` wheat, `--chart-5` terracotta.
**Sidebar:** `--sidebar` #f0eee6, `--sidebar-foreground` #43423e, `--sidebar-primary` (orange), `--sidebar-accent` #ebe5d9, `--sidebar-border`, `--sidebar-ring`.

**`--bg-*` background scale (hex):** light `--bg-000` #faf9f5 (page), `-050` #f5f4ee, `-100` #f0eee6 (sidebar), `-200` #e8e6dc (hover), `-300` #d1cfc0 (strong divider), `-400` #b0aea5, `-500` #6b6963, `--bg-inverse` #262624. Dark mode inverts (`--bg-000` #262624 … `--bg-inverse` #faf9f5).

**`--text-*` ink scale (hex):** light `--text-000` #fff, `-100` #141413 (primary), `-200` #3d3d3a, `-300` #6b6963, `-400` #8a8880, `-500` #b0aea5. Dark inverts.

**`--accent-main-*` brand scale:** `--accent-main-000` #faf0ec, `-100` **#d97757 (THE brand)**, `-200` #c96442 (pressed/darker), `-900` #431407. Pro badge: `--accent-pro-000/100/200` (#ece9f7/#6c5dac/#544698). AnA assistant persona (muted blue): `--ai` #6a9bcc, `--ai-hover` #5585b3, `--ai-muted` #dce8f3.

**Borders:** `--border` (above), `--border-subtle` = sidebar-border, `--border-strong` = --bg-300, `--border-focus` = accent-main-100.

**Semantic status:** `--success` #788c5d (+`--success-muted` #e4ebd8), `--warning` #c87d2e (+#f8e9d0), `--error` #b93a3a (+#f5dfdd), `--info` = --ai. **Note:** canonical uses `--success/--warning/--error` + shadcn `--destructive` (#141413). `--danger` exists ONLY in legacy `theme.css`. The ana CSS modules reference `--danger`/`--warning`/`--success` with hex fallbacks (`#b4541f`/`#b4831f`/`#2f7d57`).

**Semantic aliases used by product code:** `--canvas`=background, `--canvas-muted`=sidebar, `--canvas-elevated` #fff (dark #30302e); `--ink`=text-100, `--ink-body`=text-200, `--ink-muted`=text-300, `--ink-subtle`=text-400, `--ink-disabled`=text-500. Stone ramp `--stone-0…950` (#fff → #141413).

**Shadows:** light intentionally near-zero alpha (`--shadow-xs/sm/md/lg/xl/2xl` mostly `hsl(0 0% 0% / 0.00)` — warm, almost flat), `--shadow-glow` `0 0 20px rgb(217 119 87 / 0.10)`. Dark mode has real visible shadows (xs `0 1px 2px /0.30` … xl `/0.50`).

**Radii:** base `--radius: 0.5rem`. `--radius-sm` 4px, `-md` 6px, `-lg` 8px, `-xl` 12px, `-2xl` 16px, `-3xl` 24px, `--radius-full` 9999px.

**Spacing (4px grid):** `--space-px` 1px, `-0-5` 2px, `-1` 4px, `-1-5` 6px, `-2` 8px, `-3` 12px, `-4` 16px, `-5` 20px, `-6` 24px, `-8` 32px, `-10` 40px, `-12` 48px, `-16` 64px, `-20` 80px.

**Motion:** `--dur-fast` 100ms, `--dur-normal` 200ms (default), `--dur-slow` 300ms, `--ease` cubic-bezier(0.4,0,0.2,1) (ease-out, no overshoot), `--ease-spring` cubic-bezier(0.16,1,0.3,1) (no overshoot).

**Layout chrome:** `--sidebar-collapsed` 56px, `--sidebar-expanded` 260px, `--topbar` 48px, `--content-max` 768px, `--content-wide` 1024px.

**Typography families:** Commercial Klim faces loaded `src: local()` only (woff2 not shipped — falls through silently to free fallbacks). `--font-sans` Styrene B → Söhne → system; `--font-display` Styrene B → Söhne; `--font-serif` Tiempos Text → Copernicus → Georgia; `--font-editorial` Copernicus → Tiempos; `--font-mono` ui-monospace → JetBrains Mono → Menlo.
**Tracking:** `--tracking-tighter` -0.05em … `--tracking-widest` 0.10em. **Leading:** `--leading-tight` 1.25 … `--leading-loose` 1.75.
**Type ramp (CLASSES, not vars — design rule "never shout"):** `.display-1` 60px/600, `.display-2` 48px, `h1` 24px/600, `h2` 18px/600, `h3` 16px/600, `h4` 13px/600 uppercase wider, `.body/p` 13px relaxed, `.body-lg` 15px, `.body-sm` 12px, `.meta/small` 10px/500 uppercase wider, `.prose-reading`/`.doc-content` 15px serif, `.status-pill` 11px/500. Max title outside marketing is `text-lg` (18px); body 13px; meta 10px.

### B2. `--shadcn-*` HSL bridge — `client/src/index.css`
HSL component triples (consumed via `hsl(var(--shadcn-*))` in `tailwind.config.ts`), deliberately namespaced after a 2026-04-29 audit found bare `--border` from prototype CSS resolving to an invalid `45 17% 88%`. Tokens: `--shadcn-background` 45 33% 97%, `-foreground` 60 3% 8%, `-card`, `-popover`, `-muted`, `-muted-foreground`, `-primary` 18 60% 60%, `-primary-foreground`, `-secondary`, `-accent`, `-destructive` 0 84% 60%, `-border`/`-input` 45 17% 88%, `-ring` 18 60% 60%, `-radius` 0.5rem, full `-sidebar-*` set, and `-chart-1..5`. Index.css also defines a separate legacy `--color-*` palette (primary stone #292524, success #788c5d, warning #d97706, gray-50..500 warm scale), `--space-xs/sm/md/lg`, `--shadcn-shadow-lg/xl`, gradients, and global shims aliasing `--accent-000/100/200`→`--accent-main-*`, `--dur`→`--dur-normal`, `--err`→`--error`, `--ok`→`--success`. Index.css also styles Radix switch (`aria-checked=true`→green #22c55e, false→red #ef4444), Radix select/popover/calendar fixes, ProseMirror/TipTap editor, markdown, `.ana-response` chat typography, and CJK `:lang()` font fallbacks (ja/zh/ko).

### B3. Legacy `zen.css` — `concept2cure/design/zen.css` (v3.0.0)
Self-contained "Zen" minimalist theme; ALL tokens `--zen-*` prefixed (hex/rgb), plus a full `.zen-*` component library (btn/card/chat/sidebar/badge/command). Duplicates the canonical palette under a different namespace — map to canonical. Notable divergences: `--zen-accent-hover` #c15f3c (canonical #c96442); `--zen-warning` #d97706 / `--zen-error` #dc3545 (canonical #c87d2e / #b93a3a); `--zen-radius-lg` 0.75rem (canonical 0.5rem); `--zen-ease-spring` cubic-bezier(0.175,0.885,0.32,1.275) **overshoots** (canonical does not); `--zen-sidebar-collapsed` 60px (canonical 56px). Base `.zen` hard-codes `font-family: 'Lora', Georgia, serif`.

### B4. Legacy `theme.css` — `client/src/styles/theme.css`
Older Material-ish `--color-*` set (hex). **Bug: declares many tokens twice in one `:root` — second declaration wins.** Effective: `--color-primary` #d97757, `--color-primary-variant` #c15f3c, `--color-secondary` #6a9bcc, `--color-success` #788c5d, `--color-warning` #d97706, `--color-danger` **#dc3545 (only file with `--color-danger`)**, `--color-text-primary` #141413. Type: `--font-base` effective 'Lora', Georgia, serif; `--font-heading`/`--font-ui` 'Poppins' (conflicts with canonical Styrene B and zen Lora — three heading fonts). Scale `--text-xs..xl` (0.75–1.25rem), `--space-xs..lg`, `--elevation-low/medium/high`.

### B5. `high-contrast.css`
No tokens. Brute-force `!important` override: universal `*` → `color:black; background:white; border-color:black; text-shadow:none; box-shadow:none`; components (`.card/.button/.badge/.input/.select`) → `border:2px solid black`; `opacity:1 !important` (defeats disabled dimming). Auto dark variant via `@media (prefers-color-scheme: dark)` (inverts to white-on-black). **Activation: unscoped — takes effect simply by being loaded** (toggled at runtime by injecting the stylesheet, not a wrapper class). Flattens all elevation/disabled cues.

### B6. `theme.json` — runtime config
```json
{ "primary": "#D97757", "variant": "professional", "appearance": "light",
  "radius": 0.5, "motionProfile": "subtle-global-v1", "densityScale": 1, "uiScale": 1 }
```
shadcn/Replit-style; `primary` and `radius` must stay in sync with canonical.

### B7. Other style files (in scope, supporting)
- `styles/projects-prototype.css` (86 KB) — **mirror-synced Phase-3 Projects prototype kit; must NOT be hand-edited.** Consumes bare `--accent-{000,100,200}`, `--dur`, `--border`, `--shadow-lg/xl` (hence the index.css shims). Defines its own `[data-status="..."]` styling for project/version statuses (active/approved/archived/awaiting_review/blocked/complete/current/final/in_review/retired/submitted/superseded/upcoming etc.).
- `styles/document-preview.css`, `styles/tour-animations.css`.
- `concept2cure/components/ana/styles.module.css` (2,468 lines) — the AnA chat-shell + verification/verdict trust-panel CSS module (see Part D for its `data-status` vocabulary).

---

## PART C — GLOBAL UX SCAFFOLDING

### C1. i18n — `client/src/i18n/{index.ts, languages.ts, format.ts}`
- **18 supported languages** (`LANGUAGES` registry; each `{code,label,native,dir,intlLocale}`): en English, fr Français, de Deutsch, ja 日本語, zh 中文, ko 한국어, es Español, pt Português, it Italiano, nl Nederlands, pl Polski, sv Svenska, da Dansk, fi Suomi, cs Čeština, el Ελληνικά, hu Magyar, ro Română. All `dir:'ltr'` (dir field reserved for future RTL).
- **Default/fallback:** `DEFAULT_LANGUAGE='en'`; `defaultNS`/`fallbackNS`='common'. `load:'languageOnly'` (ja-JP→ja).
- **Detection/persistence (two-layer):** init detects `['localStorage','navigator']`, key **`c2c.language`** (`LANGUAGE_STORAGE_KEY`); after auth, account `preferences.language` wins (applied in `LanguageContext`). `applyDocumentLanguage()` syncs `<html lang>`/`<html dir>` on every change (drives `:lang()` CSS + a11y).
- **Resources:** `i18next-http-backend`, `loadPath:'/locales/{{lng}}/{{ns}}.json'`. Namespaces: `common, auth, home, settings`. Only `en/common` in initial bundle.
- **format.ts:** `formatDate` (default dateStyle medium), `formatDateTime`, `formatNumber`, `formatPercent`, `formatRelativeTime` (Intl.RelativeTimeFormat, numeric:auto). **Japan-tuned:** `formatJapaneseEraDate` (和暦 via `ja-JP-u-ca-japanese`, always Japanese regardless of UI lang — for PMDA/MHLW docs), `getJapaneseFiscalYear`/`formatJapaneseFiscalYear` (年度, Apr–Mar, e.g. `2026年度`).

### C2. Feature flags — `client/src/flags/featureFlags.ts`
In-memory `Record` (no env/localStorage/query wiring). API: `isFeatureEnabled(id)`, `setFeatureEnabled(id,bool)`, `resetFeatureFlags()`, `getAllFeatureFlags()`. **28 flags.** Only **3 default OFF**: `ENABLE_ANA_DOCUMENT_STUDIO` (AnA split-pane doc preview + DOCX export + verification trust-panel — "ships dark, enable per-org"), `ENABLE_MODEL_EFFORT_PICKER` (Fast/Balanced/Thorough effort control + model dropdown in AnA composer), `ENABLE_EARLY_ACCESS_MODULES` (Inspection Readiness, Post-Market Surveillance, CAPA, SOP — "disable for production"). All others default ON: `ENABLE_510K_MODULE`, `ENABLE_PREDICATE_SEARCH`, `ENABLE_EQUIVALENCE_ANALYSIS`, `ENABLE_LITERATURE_DISCOVERY`, `ENABLE_PATHWAY_ADVISOR`, `ENABLE_EQUIVALENCE_DRAFTING`, `ENABLE_COMPLIANCE_CHECKER`, `ENABLE_PACKAGE_ASSEMBLY`, `ENABLE_SECTION_RECOMMENDER`, `ENABLE_CER_MODULE`, `ENABLE_PMA_MODULE`, `ENABLE_IVDR_MODULE`, `ENABLE_MAUD_VALIDATION`, `ENABLE_AI_GENERATION`, `ENABLE_SEMANTIC_SEARCH`, `ENABLE_COMPARISONS`, `ENABLE_SAVED_REFERENCES`, `ENABLE_CITATION_FORMATS`, `ENABLE_NLP_SUMMARIZATION`, `ENABLE_CUSTOM_RELEVANCE`, `ENABLE_ONBOARDING_TOUR`, `ENABLE_ONBOARDING_CHATBOT`, `ENABLE_DEVICE_PROFILE`, `EMBED_MODULES_IN_SHELL`, `ENABLE_PDEV_SURFACE`.

### C3. Toasts — `client/src/toast.css` (react-toastify theme)
Types: info #6a9bcc, success #788c5d, warning #d97706, error #dc3545, default cream #faf9f5 (dark text). Toast width 320px, min-height 64px, font 'Poppins', radius 4px, z-index 9999. Six fixed positions (top/bottom × left/center/right); ≤480px full-width snapped to edge. Animation = **bounce** preset (0.7s, large translate3d, cubic-bezier(0.215,0.61,0.355,1)) — note this is library default, louder than the system's calm 200ms. Progress bar 5px, multi-color gradient. (Separate from the Radix `toast.tsx` primitive in Part A — this CSS themes react-toastify.)

### C4. EsignModal — 21 CFR Part 11 e-signature — `concept2cure/_shared/components/EsignModal.tsx` (+ `.css`)
The single gate for governed mutations (batch release, artifact approval, submission transmit, access grant). Backend `/api/esignature/*` via `useEsignature()` (`verifyPassword`, `verifyMfa`). Header subtitle: `21 CFR Part 11 · §11.50 · §11.100 · §11.200`.
- **§11.50 meaning (radiogroup, 5 enum):** `authorship` "Authorship", `review` "Review", `approval` "Approval" (default), `responsibility` "Responsibility", `release` "Release" — each with a one-line description.
- **§11.100 identity:** signer name/email/role shown with initials avatar; server is source of truth.
- **§11.200 re-auth:** password always (`MIN_PASSWORD=6`), plus TOTP when `requireMfa` (6-digit `/^\d{6}$/`, "never stored").
- **Reason for change:** textarea, `MIN_REASON=8` chars, placeholder "A short, specific reason. Stored verbatim in the audit trail." — focused first field.
- **Phases:** `form → committing → signed`. `canCommit` = reason≥8 ∧ pw≥6 ∧ (no MFA ∨ valid TOTP). Commit → verifyPassword → verifyMfa → caller `onSign({meaning,reason,password,totp})` → manifest `{meaning,reason,signedAt,hash?}`. Failures surface inline (`role=alert`), return to form (no fabricated success).
- **Signed confirmation "Signature applied":** Action, Signed by, Meaning, Reason, When, Chain hash (mono). Copy: "The 21 CFR Part 11 audit trail has a new entry. This cannot be undone."
- **Buttons:** header "Cancel signing" (X), footer "Cancel" + "Sign and commit" (shield icon, spinner+"Signing"), signed "Done".
- **a11y:** `role=dialog aria-modal`, focus trap (Tab cycle via FOCUSABLE), focus→reason after open, focus returned to trigger on close, Esc closes (blocked while committing), labels + `aria-describedby`, tokens only, 200ms ease-out, `outline:2px solid var(--accent-main-100)`, full reduced-motion handling.

### C5. SealBadge — verified-and-sealed evidence — `concept2cure/components/ana/SealBadge.tsx`
Calm, factual evidence for a signed-and-sealed verified export (replaces a "Sign and seal" action). **Status carried as TEXT, never color alone** (shieldCheck icon + text):
- "Signed and sealed" (current) / "Signed and sealed (superseded)" (when `supersededByVersion` set → meta appends "Superseded by v{N}.").
- Meaning via `MEANING_LABEL`: AUTHOR→Authorship, REVIEWER→Review, APPROVER→Approval. Meta: `{version} — {meaning} by {name} on {sealedAt}.` + " AI involvement disclosed." when `aiDisclosed`.
- **Provenance trail** disclosure button (`aria-expanded`/`aria-controls`) → `<dl>`: Printed name, Meaning (§11.50), Reason for change, Sealed at, **Content hash (SHA-256)** (mono), AI disclosure, Provenance atoms ("{n} source reference(s)"). `formatSealedAt` = `YYYY-MM-DD HH:MM:SS UTC`.
- Uses **no `data-status`/`data-seal`** — only `data-open` on chevron; all color via CSS-module classes.

### C6. Locales — TWO trees (caveat for design)
- `client/src/locales/` (asked-about path): only **4 langs** (de/en/fr/ja), each a single **flat English-keyed** `common.json` (key === source phrase, e.g. `"Save":"Save"`). Smaller/legacy.
- `client/public/locales/` (what i18next actually loads): **all 18 langs**, each with 4 nested-key namespaces `common.json/auth.json/home.json/settings.json` (e.g. `common.actions.save`, `common.topbar.askAna` "Ask AnA, jump to…", `common.density.compact`, `common.language.label`). **This is the authoritative tree.**

---

## PART A4 — FULL PRIMITIVE ENUMERATION (all ~76 files in `client/src/components/ui/`)

Format: `file | what | variants/sizes/states | a11y`. Many primitives ship as both `.tsx` and legacy `.jsx` duplicates (flagged). The barrel `index.ts` re-exports ~48 of these but **excludes** alarm, chart, container, layout, sidebar, statesV2, workspace-primitives and all domain `.jsx` files (import those directly).

### Forms
- **input.tsx** | text input | no cva, single style `h-10` rounded-md border-input | focus-visible ring-2, disabled:opacity-60.
- **textarea.tsx / .jsx** | multiline | no variants, `min-h-[80px]` (.tsx `text-base md:text-sm`, .jsx `text-sm`) | focus ring.
- **label.tsx** | form label | base only | Radix Label, `peer-disabled:opacity-70`.
- **checkbox.tsx** | checkbox | `h-4 w-4`, `data-[state=checked]:bg-primary` | Radix, focus ring.
- **radio-group.tsx / .jsx** | radio group | (.jsx exports `Radio` alias) | Radix, focus ring.
- **switch.tsx** | toggle switch | `h-6 w-11`, `data-[state=checked]:bg-primary` thumb | Radix. (NB: index.css force-styles `[role=switch]` checked→green / unchecked→red.)
- **slider.tsx** | range slider | track/range/thumb | Radix, thumb focus ring.
- **select.tsx** | select dropdown | Trigger/Content/Item/Group/Label/Separator/ScrollButtons | Radix, checked indicator.
- **select-wrapper.jsx** | `EnhancedSelect` | props value/onValueChange/options/optionsArray/groups/inForm/placeholder; resolves selected label | wraps FormControl when inForm.
- **input-otp.tsx** | OTP input | InputOTP/Group/Slot/Separator | active-slot ring, caret.
- **form.tsx** | react-hook-form bindings | Form/FormField/FormItem/FormLabel/FormControl/FormDescription/FormMessage/useFormField | **strongest a11y**: auto htmlFor/id, aria-describedby, aria-invalid, error→label text-destructive.
- **editor.jsx** | `Editor` TipTap rich-text | props value(HTML)/onChange/placeholder/readOnly; toolbar Bold/Italic/H1/H2/Bullet/Ordered, active `bg-zinc-200`; StarterKit+Placeholder+Highlight | ProseMirror outline-none min-h-200, button titles.
- **calendar.tsx** | date picker (react-day-picker) | nav/day via buttonVariants outline/ghost | selected/today/outside states.

### Overlays / Dialogs
- **dialog.tsx** | modal | Root/Trigger/Content/Header/Footer/Title/Description/Close | Radix, overlay, focus trap, sr-only "Close".
- **alert-dialog.tsx** | confirm dialog | Action/Cancel via buttonVariants (Cancel=outline) | Radix role=alertdialog, focus trap.
- **sheet.tsx** | slide-in panel | cva side: `top`/`bottom`/`left`(w-3/4 sm:max-w-sm)/`right`(default) | Radix Dialog-based, per-side slide.
- **drawer.tsx** | bottom drawer (vaul) | Root/Trigger/Content/Header/Footer/Title/Description | drag handle, overlay.
- **popover.tsx** | popover | Root/Trigger/Content (align/sideOffset) | Radix.
- **hover-card.tsx** | hover card | Root/Trigger/Content | Radix.
- **tooltip.tsx** | tooltip | Provider/Root/Trigger/Content | Radix, animate-in.
- **dropdown-menu.tsx / .jsx** | dropdown menu | full set (Sub/Checkbox/Radio/Shortcut/inset) | Radix, checked indicators.
- **context-menu.tsx** | right-click menu | full set | Radix.
- **menubar.tsx** | app menubar | full set | Radix.
- **command.tsx** | command palette (cmdk) | Command/Dialog/Input/List/Item/Group/Shortcut | combobox a11y, keyboard nav.

### Navigation
- **navigation-menu.tsx** | nav menu | cva navigationMenuTriggerStyle | Radix, viewport, animated indicator.
- **breadcrumb.tsx** | breadcrumb | List/Item/Link/Page/Separator/Ellipsis | aria-current=page, aria-hidden separators.
- **pagination.tsx** | pagination | PaginationLink via buttonVariants (active=outline else ghost) | aria-current, aria-label prev/next.
- **tabs.tsx / .jsx** | tabs | List/Trigger/Content, `data-[state=active]:bg-background shadow-sm` | Radix roving focus.
- **TabRow.jsx** | horizontal-scroll tab container | props children/label/className, wraps in TabsList for RovingFocus | prevents tab wrap on small screens.

### Data Display
- **table.tsx** | table | Table/Header/Body/Footer/Row/Head/Cell/Caption | semantic table, `data-[state=selected]` rows.
- **avatar.tsx** | avatar | `h-10 w-10 rounded-full` | Radix Avatar Image+Fallback.
- **accordion.tsx** | accordion | Item/Trigger/Content, chevron rotates | Radix, data-[state=open] anim.
- **collapsible.tsx / .jsx** | collapsible | Root/Trigger/Content | Radix pass-through.
- **carousel.tsx** | carousel (embla) | Content/Item/Previous/Next, orientation h/v | role=region aria-roledescription=carousel, keyboard arrows.
- **chart.tsx** | Recharts wrapper | ChartContainer(config)/ChartStyle/ChartTooltip/ChartLegend; ChartConfig keys→{label,icon,color|theme{light,dark}} | injects per-chart `--color-{key}` CSS vars via `<style nonce>` (useCspNonce for CSP); useChart throws outside container.
- **scroll-area.tsx** | scroll area | Root + ScrollBar (v/h) | Radix.
- **resizable.tsx** | resizable panels | PanelGroup/Panel/Handle | react-resizable-panels, handle focus ring.
- **aspect-ratio.tsx** | aspect ratio | pass-through Root | Radix.
- **separator.tsx** | divider | orientation h(default)/v, decorative default true | Radix role=none when decorative.

### Feedback / Status
- **badge.tsx** | badge | cva variants `default`(bg-primary)/`secondary`/`destructive`/`outline`(text-foreground) | focus ring, rounded-full.
- **status-badge.tsx** | status pill | status `Processed`(green-100/800)/`Processing`(amber-100/800)/`Failed`(red-100/800) | span, no extra ARIA.
- **alert.tsx / .jsx** | inline alert | cva variant `default`(bg-background)/`destructive`(border-destructive/50 text-destructive) | role=alert; Alert/Title/Description.
- **alarm.tsx** | `AppAlarm` full-screen stability alarm | props title/message/isActive/onRestart/onFix; fixed bg-black/80 z-9999 animate-pulse, red header | blocks UI; Restart(outline)+"FIX NOW"(destructive).
- **toast.tsx** | Radix toast | cva variant `default`/`destructive`; Provider/Viewport/Toast/Action/Close/Title/Description | swipe data-[swipe], Close X focus ring.
- **toaster.tsx** | toast renderer | consumes useToast(), viewport bottom-right sm:.
- **progress.tsx / .jsx** | progress bar | .tsx value/indicatorClassName; **.jsx adds variant** primary/success(green-600)/warning(yellow-500)/error(red-500)+max | Radix Progress.
- **skeleton.tsx** | placeholder | `animate-pulse bg-muted` | none.
- **spinner.tsx** | `Spinner` | size sm(h-4)/md(h-6 default)/lg(h-8) | Loader2 animate-spin.

### Layout
- **container.tsx** | `Container` | `container mx-auto px-4 sm:px-6 lg:px-8` | wrapper.
- **layout.tsx** | `Layout` | `min-h-screen flex flex-col` | wrapper.
- **card.tsx + card/index.jsx** | card | Card/Header/Title(h3 text-2xl)/Description/Content/Footer, no variants | .tsx forwardRef; card/index.jsx plain-fn duplicate (no ref).
- **sidebar.tsx** (733 lines) | full sidebar system | SidebarProvider (expanded/collapsed, cookie `sidebar:state`, 16rem/18rem mobile/3rem icon); SidebarMenuButton cva variant default/outline, size default(h-8)/sm(h-7)/lg(h-12); sub-parts Header/Footer/Content/Group/Menu/Item/Action/Badge/Skeleton/Rail/Trigger/Input | **Cmd/Ctrl+B** toggle; mobile uses Sheet; data-state/data-collapsible; useSidebar throws outside provider; tooltips when collapsed.
- **toggle.tsx** | toggle button | cva variant default(transparent)/outline; size default(h-10)/sm(h-9)/lg(h-11) | Radix, data-[state=on].
- **toggle-group.tsx** | toggle group | inherits toggleVariants via context | Radix roving focus.

### Domain-specific / App-aware
- **database-aware.jsx** | `DatabaseAware` + `DataAware` | DatabaseAware: useDatabaseStatus() → Skeleton/children/"Database Connection Issue" Card+Retry; DataAware: data/isLoading/error/empty render-prop | minHeight prop.
- **error-boundary.jsx** | `ErrorBoundary` (class) + `ModuleErrorBoundary` | catches render/Vite-module errors, logs window.appMonitor; props fallback/title/description/showHomeButton/onReset; default destructive Card + "Try Again"/"Go Home"; ModuleErrorBoundary "Clear Cache & Reload" | reset callback.
- **regulatory-tooltip.jsx** | `RegulatoryTooltip` | props term/children; built-in REGULATORY_TERMS DB (IND/NDA/BLA/510k/PMA/ICH/CTD/eCTD…) w/ fullName/definition/category/agency/examples/relatedTerms/guidance/complexity; falls back to `POST /api/regulatory/terms/lookup`; complexity color | cursor-help, dotted-underline trigger, Radix Tooltip rich Card.

### File Upload (4+ overlapping implementations)
- **file-upload.tsx** | `FileUpload` (TS) | props onChange/accept(*/*)/maxSize(10MB)/disabled/placeholder/value; drag-drop+click single file, size validation | Upload/X/FileIcon, clickable dropzone.
- **file-upload.jsx** | same `FileUpload`, plain-JS duplicate.
- **file-upload-wrapper.jsx** | `FileUpload` stability wrapper | wraps ./file-upload TSX, try/catch guard, logs to `localStorage.component_errors`; marked "CRITICAL STABILITY — DO NOT MODIFY"; **app code should import from here**.
- **file-uploader.tsx** | `FileUploader` (TS) | props accept/maxFiles(1)/maxSize/onUpload/uploadMessage/disabled; UploadedFile[] progress; useToast errors | Upload/FileText/X/FileCheck, multi-file progress.
- **file-uploader.jsx** | `FileUploader` (JS, different API) | props onFilesSelected/multiple/maxFiles(10)/accept(pdf,docx,xls,txt,xml,img)/maxSizeMB(50); toast on limit | UploadCloud, multi-file list.

### Storybook / docs
- **button.stories.tsx** | Storybook for Button — documents all variants/sizes/disabled/icon, notes 21 CFR Part 11 a11y (icon buttons require aria-label).
- **button/index.jsx** | non-cva JS Button duplicate where `asChild` renders `<a>` (diverges from .tsx Slot).

**A11y baseline across the kit:** focus-visible ring-2 ring-ring ring-offset-2 everywhere, `disabled:opacity-60`, Radix roles/focus-trapping; `form.tsx` strongest (aria wiring); `chart.tsx` threads CSP nonce into injected `<style>`.

---

## PART D — THE UNIFIED `data-status` HONESTY/VERDICT SYSTEM (cross-cutting)

A single HTML attribute, `data-status`, drives a **left-accent-border + matching head color + icon + text label** pattern across the AnA verification/verdict panels (`concept2cure/components/ana/styles.module.css`, 2,468 lines) and the Projects prototype. **Color is NEVER used alone** — every verdict carries an icon and a text label (the regulated-product "color-never-alone" rule). Semantic colors resolve from canonical tokens with hex fallbacks: success `var(--success,#2f7d57)`, warning `var(--warning,#b4831f)`, danger `var(--danger,#b4541f)`, neutral `var(--ink-muted)`/`var(--border)`.

**`data-status` value vocabulary (verbatim, with the panel that renders each and its accent color):**
| Value | Where | Accent |
|---|---|---|
| `verified` | verifyPanel (E1 verification trust-strip) | success green |
| `unverified` | verifyPanel | danger |
| `clean` | consistencyPanel (E2 dossier consistency sweep) | success green |
| `minor_issues` | consistencyPanel | neutral ink-muted |
| `needs_review` | consistencyPanel | warning |
| `blocker` | consistencyPanel | danger |
| `concordant` | concordPanel (E12 CDx claim-concordance) + concordClaim | success green |
| `discordant` | concordPanel + concordClaim | danger |
| `missing_counterpart` | concordClaim | danger |
| `ready` | gatePanel (E10 readiness gate) + perVerdict (IVDR PER) | success green |
| `blocked` | gatePanel + perVerdict + val-prog-card/sub-row (mdx) | danger |
| `not_assessed` | gatePanel | neutral border |
| `sample` | honesty-contract note (concordSampleNote/consistencySample/briefSampleNote/labelingSample/qcSampleFlag) — italic, dashed border or danger text, explicitly flags demo/sample data | — |

**Related attributes in the same system:** `data-seal='sealed'` (premortemSeal → success); `data-risk` `critical`/`high`/`insufficient_data` (briefPanel pre-mortem → danger/border); `data-class` `high`/`moderate`/`low` (premortemEstimate → success/warning/danger); `data-kind` `ungrounded`/`overclaim`/`contradiction` (evidence claim chips → accent). The Projects prototype CSS adds project/version `data-status` values: `active, approved, archived, awaiting_review, blocked, complete, completed, current, draft/drafting, final, in_review, retired, submitted, success, superseded, upcoming`.

**Honesty contract (Part 11) touchpoints for design:** verdicts read as **calm stone facts, not neon alarms**; "sample"/"unverified"/"anticipated" states are always surfaced explicitly (e.g. briefing-book pushback framed as ANTICIPATED, never an actual agency position; CDx concordance shows a sample-data note). EsignModal + SealBadge (Part C4/C5) are the governed-mutation and sealed-evidence surfaces. All these panels respect `prefers-reduced-motion` and use 200ms ease-out only.

---

### Open questions / gaps
- **`button/` and `card/` subdirs:** confirmed `card/index.jsx` (plain-fn Card duplicate) and `button/index.jsx` (non-cva, `asChild`→`<a>`); did not deep-read every Storybook arg in `button.stories.tsx`.
- ~~**Token-file canonicality:** `design-system/colors_and_type.css` (root), `client/public/design-system/colors_and_type.css` (mirror), and `concept2cure/design/claude-design.css` are near-identical OKLCH siblings; exact byte-level diffs between them were not computed (sizes 21,059 / 21,059 / 20,872). The product imports the root one first.~~ **Answered 2026-08-10, and the answer was not "near-identical".** The diffs were computed: `client/public/design-system/colors_and_type.css` was **119 lines behind** the root file, missing the entire `--motion-*` alias block — whose own comment in the canonical file states that without it "every `duration-fast`/`duration-normal` utility silently ships no animation". The rest of that tree was stale in the same direction: its MDX kit predated Project Home entirely (missing `ProjectHome.jsx`, 273 lines of CSS, the `openWorkbench` flow), and its `home/data.jsx` had eight nav destinations still `null` that the root had wired. Nothing imported it and no URL referenced it, so `client/public/design-system/` was removed rather than refreshed — a second copy is what let it drift for months unnoticed. `design-system/` (the sync-managed mirror) and `concept2cure/design/claude-design.css` remain; that pair is still worth a designer decision.
- **Three legacy token namespaces (`zen.css`, `theme.css`, `--shadcn-*` bridge) coexist with the canonical OKLCH set** and disagree on a few values (darker-terracotta variant, warning/error hexes, heading font Styrene B vs Lora vs Poppins, spring-easing overshoot). Which legacy files are still loaded at runtime vs dead was not fully traced (zen.css is `@import`ed by index.css; theme.css import path not confirmed).
- **`--danger` vs `--error`/`--destructive`:** three different semantic names for "bad" across files; the ana CSS modules use `--danger` with hex fallback `#b4541f` but canonical defines `--error` `#b93a3a` — the runtime resolved value depends on which file ultimately defines `--danger` (only theme.css does, as `#dc3545`). Worth a designer decision.
- **react-toastify (`toast.css`, bounce 0.7s) vs Radix `toast.tsx`/`toaster.tsx`:** two separate toast systems coexist; which one each surface uses was not mapped.
- **`statesV2.tsx` palette uses raw Tailwind grays/blue/red/green/amber** (e.g. `bg-blue-600`, `text-gray-500`) rather than the stone/OKLCH canonical tokens used by `workspace-primitives.tsx` — a consistency gap a designer should reconcile.
- High-contrast mode activation mechanism (which setting injects `high-contrast.css`) was inferred from the unscoped selectors, not traced to a toggle component.


---

# Part 3 — AnA AI Layer — Document Studio

## AnA — overview

- **Files read:** 44 in `client/src/concept2cure/components/ana/` (28 `.tsx` components + 16 `.ts` modules/hooks/fixtures), plus `server/routes/ana-ri/stream.ts` (SSE contract) and a skim of `server/services/ana/AnaToolDefinitions.ts` (tool vocabulary) and `_shared/components/EsignModal.tsx` (e-sign meanings).
- **What the area is:** AnA ("AnA · Reg Intelligence", branded "AnA 1.0 RI") is a Claude-style streaming chat shell for a regulated regulatory-affairs platform (Concept2Cure / "Concept2Cure.RI"). It is a faithful port of an Opus design bundle, re-targeted from generic chat to a **split-pane Document Studio**: chat on the left, a live regulatory-document preview + a stack of **trust panels** on the right. The product's spine is an **author → validate → verify → resolve → seal** loop where every governed output is honesty-gated (sample/not-assessed content can never be sealed or exported) and Part 11–signed.
- **Main surfaces:** the App shell (Sidebar + TopBar + main); four views (home / chat / projects / artifacts); the streaming chat thread (EmptyState, ChatView, Message, Composer + pickers); the split-pane Document Studio (DocumentStudioPane / LabelingAuthoringPane) with its trust-panel stack (Verification, Consistency, Concordance, ReadinessGate, LabelCurrency, SafetyNarrativeQc, BriefingBook, CrlPremortem, PER, SE-table); the e-signature/seal surfaces (GovernedActionSignoff inline, VerificationPanel seal action → EsignModal → SealBadge/ProvenanceTrail); and the authoring affordance cards (SafetyNarrative, IndModule, NatHistoryDossier, GsprConformity).
- **Global gating flags:** `ENABLE_ANA_DOCUMENT_STUDIO` (the entire Studio split-pane + all affordances/labeling/seal actions), `ENABLE_MODEL_EFFORT_PICKER` (Fast/Balanced/Thorough + model dropdown).

---

## A. App shell & navigation

### Ana (App shell + orchestrator) — `client/src/concept2cure/components/ana/Ana.tsx`
- **Route / entry:** The top-level exported component (`index.ts` re-exports `Ana`). Mounted by the host app (ZenApp / Concept2CureHome) with a large props contract (user, recents, projects, activeProject, authoringContext, projectIntelligence, many `on*` navigation callbacks). Accepts legacy `AnaPersistentPanel` props for back-compat (`mode`, `defaultChatMode`, `externalMessage`, `contextProfile`, `navContext` — several accepted-but-ignored).
- **Purpose:** Own all chat + studio state, wire the streaming hook, and switch between the four views and the optional split-pane.
- **Layout & regions:** `div.shell` (data-collapsed) → left **Sidebar** (rail) + `main` → **TopBar** (header) + the view body. When the Studio is open and `view==='chat'`, body becomes a horizontal `PanelGroup` (react-resizable-panels, autoSaveId `ana-document-studio`): left `Panel` defaultSize 54 / minSize 32 holds the chat; a `PanelResizeHandle` ("Resize document preview"); right `Panel` defaultSize 46 / minSize 28 holds **DocumentStudioPane** or **LabelingAuthoringPane**.
- **Controls & actions:** New chat (resets, view→home); select recent (hydrates thread); export conversation→Markdown (TopBar Share); send (view→chat, `chat.send`); suggested-action pill click → sends `"Please {label} based on our discussion."`; safety-narrative submit (pins tools, sends composed message); per-message copy/retry/feedback/edit-regenerate/action-click. Studio: download-as-DOCX (`/api/docx-factory/render`, falls back to Markdown), close pane, version select, resolve-verification, resolve-consistency, assemble eCTD module, readiness submit, follow readiness deep-link, **seal** (e-sign → `useVerifiedSeal`).
- **States:** view = home | chat | projects | artifacts. Studio auto-opens on each new draft (resets `studioClosed`, jumps `versionIndex` to latest); user can close; re-opens for a different draft. `studioOpen = activeDocument && !studioClosed && view==='chat'`.
- **Status vocabularies:** SUGGESTED_ACTION_LABELS map (verbatim): `risk_memo`→"Create a risk memo", `deficiency_preemption_memo`→"Create a deficiency preemption memo", `evidence_memo`→"Create an evidence memo", `strategy_note`→"Draft a strategy note", `reviewer_question_brief`→"Prepare a reviewer question brief", `rewritten_section`→"Rewrite the section", `revised_artifact`→"Revise the artifact", `attach_to_dossier`→"Attach to the dossier".
- **Data:** Binds `useAnaChat` (stream), `useRecents`, `useVerifiedSeal`. Reads/writes: `POST /api/ana-ri/stream`, `GET /api/conversation-os/artifacts/{id}/document-versions` (durable version lineage), `POST /api/docx-factory/render`, `POST /api/concept2cure/feedback`, `POST /api/ana-ri/seal-verified-version`. Computes `activeDocument` = latest generatedDraft's title, its versions (durable persisted lineage preferred, else same-title in-session grouping), carrying verification/consistency/briefingPremortem onto the newest version.
- **Honesty-contract touchpoints (factual):** labeling drafts forced `dataSource:'sample'` (non-exportable) until a live join; IND-module + dossier provenance forced `'sample'`; eCTD assemble uses sample fixtures that vary gate state but remain unsealable; many "INTEGRATION / BUILD-1 INTEGRATION" markers note where live tool envelopes / version persistence wire in.
- **Sub-components:** Sidebar, TopBar, EmptyState, ChatView, ProjectsView, DocumentStudioPane, LabelingAuthoringPane (+ all their children).

### Sidebar — `Sidebar.tsx`
- **Layout:** `nav.sb`. Top: brand logo (`concept2cure-icon.svg`) + "Concept2Cure**.RI**", collapse toggle (PanelLeft). Then "New chat" (Plus). Nav items: **Chats** (MessageSquare), **Projects** (FolderOpen), **Artifacts** (Sparkles) — each `aria-current="page"` when selected (Chats selected for both home and chat). "Recents" section: empty copy "No recent chats yet", else a row per thread (label = thread title or `Conversation · {date}` / "New conversation"). Bottom: account chip (avatar initials + name + plan).
- **Collapsed state:** rail ~56px expanded ~260px (per file header).
- **Data:** Recents from `useRecents` (`GET /api/chat/threads?project_id&limit`).

### TopBar — `TopBar.tsx`
- **Layout:** `header.topbar`. Left: model chip — in projects/artifacts shows the view title ("Projects"/"Artifacts"); otherwise a live `aiDot` + "AnA 1.0 RI" + chevron. Right: Share/Download (only when `canExport`, title "Download conversation as markdown") and "More" (MoreHorizontal, reserved, inert).

### ProjectsView — `ProjectsView.tsx`
- **Route/entry:** view `projects` and `artifacts` both render this.
- **Layout:** header "Projects" + subtitle "Persistent workspaces with shared context and files." + optional "New project" chip. Empty copy: "No projects yet. Create one to start a workspace." Grid of `projectCard` buttons (folder icon, title, description, meta line).
- **Data:** `AnaProject = { id, title, description, meta }` passed from host.

---

## B. Chat surfaces

### EmptyState (home view) — `EmptyState.tsx`
- **Route/entry:** `view==='home'`.
- **Layout:** centered `empty` → greeting `✻ Good {morning|afternoon|evening|night}, {firstName}` (host can override); optional **intel card** (project health); Composer; suggestion pill row; agency strip.
- **Intel card:** shown only with real signal. Stats (filtered): **Readiness** `{n}%` (accent), **Signals**, **Documents**, **Memory atoms**; "Next: {topAction.title}" line (sparkles, tooltip = action reason). Source: `projectIntelligence` prop (documentCount, signalCount, readinessScore, memoryAtomCount, recommendations, nextActions, riskFactors, openQuestions).
- **Suggestion pills (default verbatim):** "Draft CTD Section 2.5" (file), "Find 510(k) predicates" (search), "Review biostat SAP" (flask), "Submission readiness" (clip), "Cross-agency precedent" (globe). Host can override; icon keys: file/search/flask/clip/globe/book/chat/folder/sparkles.
- **Agency strip (verbatim):** FDA · EMA · PMDA · Health Canada · MHRA · ICH.
- **Controls:** Composer send; pill click sends the label as a message (no attachments).

### ChatView — `ChatView.tsx`
- **Route/entry:** `view==='chat'`.
- **Layout:** `chat` → scrollable `chatScroll`/`chatThread` of Message rows + end sentinel; sticky `chatFooter` with optional "New messages" jump-to-latest pill + Composer ("Reply to AnA…").
- **Scroll behavior:** auto-follows tokens when within ~80px of bottom; releases on scroll-up and surfaces the jump pill (ChevronDown + "New messages").
- **Controls:** forwards copy/retry/feedback/action-click/edit-regenerate/suggested-action; passes tool picker, effort/model picker, safety-narrative through to Composer.

### Message (one chat row) — `Message.tsx`
- **Purpose:** render a user bubble or an AnA assistant reply with full transparency metadata.
- **User row:** right-aligned bubble; attachment chips above (name + read-method/word-count meta via `attachmentReadLabel`); hover pencil → switches bubble into an inline Composer ("Edit your message…") with Cancel → `onEditRegenerate` re-sends.
- **Assistant row:** blue "A" avatar; name "AnA · Reg Intelligence" followed by inline meta chips:
  - **Detected lens** chip (capitalized: Audit / Risk / Strategy / Improve / Compare; `auto` hidden).
  - **Degraded** chip (fallback provider, non-Anthropic).
  - **Stopped** chip (user aborted).
  - **Evidence** chip: shield-check "{n} sources" when grounded, or alert "{n} weak" when weak/unsupported; expandable into an evidence panel ("Evidence grounding" / "Claims to verify") listing a risk summary, flagged claims (kind tags: **Ungrounded / Overclaim / Contradiction**), and "Context drawn on" enrichment source names.
  - **Latency** chip ("2.3 s" / "850 ms").
  - **Relative timestamp** chip (just now / 2m / 1h / 3d ago).
- **Reasoning (thinking):** collapsible "Show/Hide reasoning" (sparkles); auto-open while thinking streams, auto-collapses when answer text begins; "thinking…" italic while empty+streaming.
- **Tool-call rows:** `toolCalls` rendered as calm status rows (flask icon + label) with data-status running|success|error → typing dots / check / "failed".
- **Body:** markdown rendered via `renderSafeMarkdown` (marked + DOMPurify); live during stream with typing dots; `<pre>` blocks decorated with a copy button + language tag. Pre-first-token shows the `statusPhase` italic ("Planning response…" etc.) + typing dots.
- **Executed-action chips:** `.suggestPill` row under prose (icon = check if executed, dots if error, sparkles otherwise); clickable only when carrying artifactId/sectionCode (or an "open in editor" draft).
- **Suggested-action chips:** raw DocumentActionType strings mapped via `suggestedActionLabels` (sparkles), shown post-stream.
- **Warnings:** degraded-mode rows (`warnings[]`).
- **Pending sign-offs:** renders `GovernedActionSignoff` per blocked governed action; resolved ones collapse to a check + outcome message; dismissed ones hide.
- **Action bar (hover):** Copy / Retry / Good (thumbsUp) / Bad (thumbsDown).

### Composer — `Composer.tsx`
- **Layout (bundle shape):** `[textarea]` then `composerActions`: left = attach (paperclip) · Tools (ToolPicker) · "AnA 1.0 RI ▾" chip · (optional) ModelEffortPicker · (optional) "Safety narrative" chip; right = send/stop circle.
- **Controls & behavior:** Enter sends (Shift+Enter newline); Escape stops while streaming; send button flips to a Stop square while streaming. Auto-grow textarea to ~8 lines then scroll. Attach: click-to-browse + drag/drop → `useChatUpload` → `/api/chat/upload` (OCR into project memory); attachment chips show Uploading…/ready (read-method meta)/error states; remove button per chip; `data-dragging` highlight. SR-only live region announces upload `statusMessage`.
- **Gating:** effort picker shown only if `onEffortChange` AND `ENABLE_MODEL_EFFORT_PICKER`; safety-narrative chip shown only if `onSafetyNarrative` AND `ENABLE_ANA_DOCUMENT_STUDIO`. When `onSelectedToolsChange` absent the Tools button renders inert/disabled.

### ToolPicker — `ToolPicker.tsx`
- **Purpose:** pin specific ANA tools for the next turn (additive focus — never a hard restriction).
- **Layout:** wrench button with a count badge → popover "Tools" with "Reset to auto" / "Auto" state, hint "Pin tools to focus this turn. Auto lets ANA choose by intent.", and category groups of checkbox rows (tool name humanized).
- **States:** Loading ("Loading tools…"), error ("Couldn't load tools"), populated. Org-denied tools render disabled (title "Disabled by your organization"). Empty selection = "auto".
- **Data:** `GET /api/ana-tool-policy/catalog` → `{ categories:[{id,label,tools:[{name,description}]}], deniedTools }`.

### ModelEffortPicker — `ModelEffortPicker.tsx`
- **Purpose:** Fast/Balanced/Thorough segmented control + optional advanced model dropdown. Flag-gated `ENABLE_MODEL_EFFORT_PICKER`.
- **Effort options (verbatim):** **Fast** ("Quick, lower-cost answers"), **Balanced** ("Default — task-matched routing"), **Thorough** ("Deeper reasoning, highest quality"). ARIA radiogroup with arrow-key roving tabindex.
- **Model dropdown:** lazy `GET /api/claude/models`; first option "Auto" (null override) then `{label}` per model. Non-blocking on fetch failure.

---

## C. Document Studio split-pane

### DocumentStudioPane — `DocumentStudioPane.tsx`
- **Route/entry:** right `Panel` of the studio split when the active draft is **not** a labeling draft. Gated by `ENABLE_ANA_DOCUMENT_STUDIO` upstream.
- **Purpose:** pure view over the active generated draft + its trust-panel stack; the author→verify→resolve→seal surface.
- **Layout & regions:** `aside.studioPane` ("Document preview", Escape closes) →
  1. **Header:** file icon + title + "· {FORMAT}" (e.g. DOCX); actions "Download as DOCX" (→ "Preparing…", aria-busy) and close ("Close preview", X).
  2. **Sub-bar** (only with >1 version or >1 page): Version `<select>` ("v1 … vN (latest)") and a page pager ("Page X of Y", prev/next, live region).
  3. **Trust-panel stack** (each rendered only when its result is present, in this order): VerificationPanel → eCTD assemble/ReadinessGatePanel → ConcordancePanel → NatHistoryDossierAffordance → IndModuleAffordance → ConsistencyPanel → BriefingBookPanel.
  4. **Body:** serif reading surface `studioDoc`, one paginated page (`paginateContent`, ~2200 chars/page at paragraph boundaries) of sanitized markdown.
- **eCTD module choices (verbatim):** "Module 2.5 — Clinical Overview", "Module 2.7 — Clinical Summary", "Module 5.3.5 — Clinical Study Reports". Affordance label "Assemble module and check readiness" → "Assembling and checking…".
- **Data props:** draft, verification, consistency, briefingPremortem, concordance(+dataStatus), readinessGate, dossier, indModule, onSeal/signer/seal, versionCount/activeVersionIndex.

### LabelingAuthoringPane — `LabelingAuthoringPane.tsx`
- **Route/entry:** replaces DocumentStudioPane in the right panel when the active draft's documentType matches a labeling mode (US: USPI/PLR/"prescribing information"; EU: SmPC/QRD/"summary of product characteristics"). Flag-gated.
- **Purpose:** build-from-template labeling authoring (roadmap E9): mode toggle + mandatory-section guard + deterministic currency gate + source verification.
- **Layout:** header (title · structure) with a **US ↔ EU** radiogroup toggle (roving tabindex, arrow keys); basis line ("{label} — {basis}"); sample notice when `dataSource==='sample'`; **Section guard** ("{structure} sections — {present} of {total} present", badge "Complete" / "{n} missing", checklist of required headers with check/alert); LabelCurrencyPanel (when verdict present); VerificationPanel (when verification present); footer ("{n} required section headers checked" + "Seal & export").
- **Honesty contract:** `canExport = !isSample && currencyClear && verifyClear`; export button disabled with an explicit title reason ("Sample drafts cannot be exported" / "Label currency is not clear" / "Draft is not verified against source").

---

## D. Trust panels (the verification/honesty surfaces)

All trust panels share the pattern: a `role="status" aria-live="polite"` strip, a `data-status` token, an icon paired with a text verdict (color never alone), factual microcopy (no emoji), and an "Ask AnA to resolve" affordance that composes a targeted fix message and re-runs the check. Sample/not-assessed content is advisory-only and suppresses resolve/seal/export.

### VerificationPanel — `VerificationPanel.tsx`
- **Source tool:** `verify_docx_against_source`. **data-status:** `verified` | `unverified`.
- **Verdict copy:** "Verified against your source" (shield-check) / "Not verified against your source" (alert). Detail: "{confirmed} of {checked} required strings present verbatim", "{additions} added / {deletions} dropped lines vs. source"; fallback "Document matches/does not match the source you provided." Lists missing required strings.
- **Actions:** "Ask AnA to resolve" (when not ok); **"Sign and seal verified version"** (when `ok` + `onSeal` + not already sealed) → opens shared **EsignModal** (action "Seal verified version", defaultMeaning "approval") → on sign maps meaning via `esigMeaningToSealMeaning` (authorship→AUTHOR, review→REVIEWER, approval→APPROVER; responsibility/release rejected) → renders **SealBadge**. Inline `sealError` (role=alert).

### ConsistencyPanel — `ConsistencyPanel.tsx`
- **Source tool:** `check_dossier_consistency` (cross-artifact dossier sweep — the "second verification surface"). **data-status / verdict (verbatim):** `clean` / `minor_issues` / `needs_review` / `blocker`.
- **Verdict labels:** "Consistent with your dossier" (shield-check) / "Minor inconsistencies" (info) / "Inconsistencies need review" (alert) / "Blocking inconsistencies" (octagon-alert).
- **Detail:** clean → "No conflicting values found across {n} artifacts"; else "{n} divergences vs. {n} artifacts, {n} high-severity". Per-divergence bullets `data-severity` (critical/high/medium/low) with **kind labels:** Value mismatch / Endpoint drift / Population drift / Missing reference / Orphan reference; shows "This draft: {x} · Dossier: {y}" and "Source: {artifact} · {ctdSection}".
- **Honesty:** `isSample` → "Sample content — this verdict is advisory only and cannot be sealed or exported." and resolve suppressed.

### ConcordancePanel — `ConcordancePanel.tsx` (E12)
- **Source tool:** `pair_companion_diagnostic` cross-dossier CDx claim concordance. **data-status:** `concordant` | `discordant`.
- **Verdict:** "CDx claims concordant/not concordant across the paired dossiers". Detail "{n} of {total} CDx claims match verbatim across the drug and device submissions." + "Concordance is a verbatim string comparison, not an AI judgment."
- **Per-claim rows** `data-status`: **concordant / discordant / missing_counterpart** ("Concordant" / "Discordant" / "Missing counterpart"); Drug/Device side-by-side text + source pointers ("{label}: {submission} · {locator}"); absent-claim copy "No such claim in the {drug|device} submission."
- **Honesty:** `ConcordanceDataStatus` `sample` | `not_assessed` non-sealable note "Sample data / Not assessed — illustrative only. This result is not sealable or exportable as a submission record."

### ReadinessGatePanel — `ReadinessGatePanel.tsx` (E10)
- **Source:** `aggregateReadiness({assemble_ectd_module_from_artifacts, validate_docx, check_dossier_consistency})`. **data-status / gate (verbatim):** `ready` | `blocked` | `not_assessed`.
- **Status labels:** "Ready for submission" / "Blocked — resolve before submission" / "Readiness not assessed". Two sub-checks ("Structural validation: valid/failed", "Dossier consistency: {verdict}") with check/alert; blocking-items list (`data-severity`, deep-link buttons).
- **Action:** "Seal and submit to PDUFA clock" → "Assessing…"; **disabled unless `gate.sealable`** (the honesty contract bound directly to the verdict); hint copy when unavailable.

### LabelCurrencyPanel — `LabelCurrencyPanel.tsx`
- **Source tool:** `review_label_currency` (deterministic, not an AI guess). **data-status:** `verified` (current) | `unverified` (stale).
- **Verdict:** "Label currency: current" / "Label currency: stale"; detail "All approved markets carry a current approved label." / "{n} approved markets are missing a current label. Risk level: {riskLevel}." Findings list "{message} ({basis})".

### SafetyNarrativeQcPanel — `SafetyNarrativeQcPanel.tsx` (E5)
- **Source:** `computeNarrativeQc` over ICH E3 §16 required fields. **data-status:** `verified` (sealable) | `unverified`.
- **Verdict:** "Narrative QC clear — ready for sign-off" / "Narrative QC — not ready for sign-off" (+ subjectId). Detail "{present} of {total} required fields present." + "Sample data — non-sealable." + blockReason. Checklist of required fields (check/missing, SR-only "— present/missing").

### BriefingBookPanel — `BriefingBookPanel.tsx` (E8)
- **Source tools:** `assemble_briefing_book` / `simulate_reviewer_challenges` / `run_submission_premortem`. **data-risk (verbatim):** `critical` | `high` | `medium` | `low` | `insufficient_data`.
- **Header always:** "Anticipated FDA pushback" (alert). Detail "{n} anticipated reviewer challenges across {n} sponsor questions. {risk label} (n={precedents}) / — pattern-only, confidence: low." Honesty note "These are anticipated questions a reviewer may raise — not an actual FDA position." Not-assessed → "Sample data — not assessed. This briefing book cannot be sealed or exported until built from live meeting data."
- **Body:** per sponsor question → challenge list (severity pill **Critical/High/Medium/Low** + lens + question + "Basis:" + "Suggested response:"); plus "General anticipated pushback".

### CrlPremortemPanel — `CrlPremortemPanel.tsx` (E14)
- **Source tool:** `assemble_crl_premortem_artifact`. **ArtifactStatus:** `estimated` | `not_assessed` | `sample`; **probabilityClass:** low/moderate/high; **sealStatus:** `unsealed`/`sealed`.
- **Layout:** header (title + seal chip "Unsealed draft"/"Sealed"); **approval-probability estimate** strip (`data-class`, "~{pct}%" or "Not estimated", framing line, "Overall pre-mortem risk: {LEVEL} · Confidence: {c} · n={denom} · {approved} approved / {denied} denied"); honesty note; **Top risks** (ranked, severity, reviewer question, "Grounding: {citation}"); **Prioritized fix-list** (priority + action); footer **Export as DOCX** disabled-with-reason when not exportable (verbatim STATUS_REASON copy for not_assessed/sample). E1 seal action noted as a future attach point.

### SEComparisonTable — `SEComparisonTable.tsx` (E6)
- **Source:** 510(k) Substantial-Equivalence matrix. **provenance:** `analyzed` (sealable) | `sample` | `not_assessed`. **EquivalenceStatus (verbatim):** EQUIVALENT→"Equivalent", DISCUSSION_REQUIRED→"Discussion required", NOT_EQUIVALENT→"Not equivalent", TOXIC→"Predicate safety signal", PENDING→"Pending assessment".
- **Layout:** semantic `<table>` (scope'd headers, caption) Characteristic / subject / predicate / Equivalence; verdict pill `data-tone` ok|warn|open with paired glyph (check/alert/blocker). Preview-only note for sample/not_assessed; export note when analyzed.

### PerAuthoringPanel — `PerAuthoringPanel.tsx` (E3, IVDR PER)
- **Source:** `buildPerAuthoringPlan` (build_from_template → verify_docx_against_source). **verdict data-status:** `ready` | `blocked`.
- **Layout:** header "Performance Evaluation Report · {device} · {version}"; Annex XIII section skeleton; "Enforced figures ({n})" list (value + source); verdict ("Ready to author and verify…" / "Not sealable or exportable yet."); blockers list; "Author PER and verify" button disabled-with-reason.

---

## E. Authoring affordance cards (Composer + Studio entry points)

### SafetyNarrativeAffordance — `SafetyNarrativeAffordance.tsx` (E5)
- **Entry:** "Safety narrative" Composer chip (flask). Flag-gated `ENABLE_ANA_DOCUMENT_STUDIO`.
- **Layout:** expandable panel "Guided safety narrative — ICH E3 §16"; mode tablist **Single case / Batch (line listing)**; Single form fields (Subject id*, Study id, Study drug, Relevant medical history, Event term*, Severity/grade, Seriousness criteria, Action taken, Outcome, Investigator causality) with required-field errors; live **SafetyNarrativeQcPanel** preview; Batch textarea + "Upload listing" (CSV/TSV/JSON, parse meta "{n} cases parsed, {n} rows skipped ({format})", skipped-row errors); "Sample data — narrative is illustrative and non-sealable" checkbox; submit "Draft, author & verify" / "Author {n} narratives".
- **Behavior:** pins `SAFETY_NARRATIVE_TOOLS` (draft→author→verify) and sends a composed message through the normal stream; batch fan-out noted as deferred INTEGRATION.

### IndModuleAffordance — `IndModuleAffordance.tsx` (E11)
- **Entry:** rendered inside DocumentStudioPane when active draft is CTD Module 2.5/2.7. **provenance:** `live` | `sample` | `not_assessed` (only `live` sealable).
- **Layout:** `dossierPanel` ("IND Module {n} — verified authoring"); provenance-specific detail; "Author Module {n} from source" → "Authoring…". Composes a message pinning author_docx_native + verify_docx_against_source where required_strings include every source figure (catches transcription errors before seal).

### NatHistoryDossierAffordance — `NatHistoryDossierAffordance.tsx` (E13)
- **Entry:** DocumentStudioPane `dossier` slot. **provenance:** `live` | `sample` | `not_assessed`.
- **Layout:** "Natural-history / external-control dossier"; provenance detail; "Assemble evidence dossier" → "Assembling…". Composes a message naming search_clinical_evidence + advise_rwe_design + author_docx_native + verify (required_strings = cited NCT ids + four section headers).

### GsprConformityAffordance — `GsprConformityAffordance.tsx` (E7)
- **Entry:** flag-gated GSPR matrix affordance (returns null when flag off). **data-status:** `verified`/`unverified`.
- **Layout:** "GSPR conformity matrix — EU MDR Annex I"; "{assessed} of {23} requirements assessed."; lists not-yet-assessed clause ids; "Author GSPR conformity matrix" disabled until exportable. Emits an authoring plan (author_docx_native → verify with deriveRequiredStrings).

---

## F. E-signature / seal surfaces (Part 11)

### GovernedActionSignoff (inline modal) — `GovernedActionSignoff.tsx`
- **Entry:** rendered inline under an assistant Message for each blocked governed action (`extractPendingSignoffs` finds `PART11_SIGNATURE_REQUIRED` results in `post_done.executedCommands`).
- **Tiered Part 11:** every governed action captures a **Reason for change** (≥10 chars, recorded to audit trail). High-impact actions (`signatureRequired`) additionally require a **§11.50 meaning radiogroup** (Authorship / Review / Approval), **Password** (electronic signature), and **Authentication code** (MFA, 6-digit). Attestation copy cites §11.50 and 21 CFR 11.100(b); credentials verified at signing, not reused.
- **Buttons:** Cancel; "Sign and run" (high-impact) / "Confirm and run" (reason-only) → "Signing…". Full focus trap, initial focus, Escape cancel, error live region.
- **Data:** `POST /api/ana-ri/governed-action` (`useGovernedAction`).

### VerificationPanel seal action → EsignModal → SealBadge
- **EsignModal** (`_shared/components/EsignModal.tsx`): five §11.50 meanings — **Authorship / Review / Approval / Responsibility / Release**; AnA seal admits only the first three (responsibility/release rejected). Captures meaning + reason (≥8) + password (≥6) + optional TOTP.
- **SealBadge + ProvenanceTrail** — `SealBadge.tsx`: replaces the seal action once sealed. Head "Signed and sealed" (or "(superseded)"); meta "{vN} — {meaning} by {name} on {sealedAt UTC}. AI involvement disclosed." Expandable provenance trail (`<dl>`): Printed name, Meaning (§11.50), Reason for change, Sealed at, **Content hash (SHA-256)** (monospaced), AI disclosure, Provenance atoms count. Meaning labels: AUTHOR→Authorship, REVIEWER→Review, APPROVER→Approval.
- **Data:** `POST /api/ana-ri/seal-verified-version` (`useVerifiedSeal`) → immutable `SealedRecord` (algorithm sha256, contentHash, atoms, aiDisclosed, sealedAt). Seal binds to a persisted artifact + version when available, else server fallback.

---

## G. SSE event model & tool_result lifecycle (`useAnaChat.ts` ↔ `server/routes/ana-ri/stream.ts`)

- **Endpoint:** `POST /api/ana-ri/stream` (SSE, 15s heartbeat comment frames; client 90s idle-abort watchdog). Request body carries message, thread_id, project_id, submission_type, user_role, language, project_context/document_context/authoring_context/module_context, a legacy `context` block, last-10 conversation_history, `selected_tools` (pinned, additive), `effort_level`, `model_override`.
- **SSE event types (client-handled):**
  - `status` — phases `orchestrating` ("Planning response…"), `loading_context` ("Loading project memory…"), `generating` ("Generating response…"); fills the placeholder `statusPhase` until first token.
  - `thread_id` — captured for continuity (`onThreadChange`).
  - `orchestration` — `detectedIntent.lens` (→ lens chip), `suggestedActions` (→ pills), submission type, role, workstream.
  - `text` — token chunk appended; clears statusPhase.
  - `thinking` — extended-thinking delta → collapsible reasoning.
  - `step` — agentic round announcement (round + tool names + plan).
  - `tool_use` — server-labeled tool invocation → "running" tool-call row.
  - `tool_result` — resolves the latest running call to success/error; **parsed by tool name** into trust-panel results: `verify_docx_against_source`→VerificationResult, `check_dossier_consistency`→ConsistencyResult (verdict + bySeverity + divergences + isSample), `assemble_crl_premortem_artifact`→CrlPremortemArtifact, `assemble_briefing_book`→BriefingBookPremortemResult.
  - `artifact_draft` — editor-openable draft (title, content, documentType) → `generatedDraft` → drives Document Studio + "Open in editor" chip.
  - `artifact_version_saved` — durable artifactId + version attached to the draft → enables cross-session version lineage fetch.
  - `done` — model, provider (fallback detection: provider≠'anthropic' → Degraded), latencyMs, effortUsed, telemetry (phase timings, cache, memory diagnostics).
  - `post_done` (background) — cleanedResponse (guidance/command blocks stripped), executedActions chips, executedCommands → pendingSignoffs, enrichmentSources → groundingSources.
  - `grounding_strip` — evidence verdict (validated, source_count, grounded/weak/missing counts, reviewer_risk_summary, flagged_claims).
  - `warning` — degraded-mode signal appended to message warnings.
  - `error` — surfaced as a failed reply.
- **Abort semantics:** user stop → "Stopped" badge + sealed partial tokens; idle timeout → "Response timed out" + "Sorry — AnA stopped responding…".
- **Tool label map (client TOOL_LABELS, verbatim examples):** compute_sample_size→"Computing sample size — biostatistics engine", verify_docx_against_source→"Verifying against your source", check_dossier_consistency→"Checking dossier consistency", author_docx_native→"Authoring the document", build_from_template→"Building from your template", validate_docx→"Validating document integrity", search_clinical_evidence/search_literature/lookup_fda_guidance/lookup_ich_guideline/mine_precedents etc. Server may override with input-aware labels.
- **Tool vocabulary (server `AnaToolDefinitions.ts`, ~120 tools):** spans advisory (advise_study_design, advise_labeling_structure, advise_estimand, advise_regulatory_pathway…), evidence/search (search_clinical_evidence, search_literature, search_drug_labels, search_device_recalls, lookup_fda_guidance, lookup_ich_guideline, mine_precedents), authoring (author/build_from_template, generate_document, generate_statistical_document, ind_generate_section, draft_safety_narrative, create_per_document), verification/QC (verify_docx_against_source, validate_docx, check_dossier_consistency, check_numerical_integrity, check_grounding, assess_output_confidence), pre-mortem (run_submission_premortem, assemble_crl_premortem_artifact, assemble_briefing_book, simulate_reviewer_challenges), biostatistics (compute_sample_size, compare_statistical_scenarios), device/IVD (analyze_predicate_device, pair_companion_diagnostic, classify_ivd_device, record_*_performance_study), and governed submission/lifecycle actions (package_ectd_for_region, transmit_submission, create_q_sub, render_signature_manifestation).

---

## H. Cross-cutting design facts

- **Unified `data-status` vocabulary (by panel):** verification/labelCurrency/GSPR/safety-QC → `verified|unverified`; consistency → `clean|minor_issues|needs_review|blocker`; readiness gate → `ready|blocked|not_assessed`; concordance → `concordant|discordant` (+ claim rows `concordant|discordant|missing_counterpart`); CRL premortem status → `estimated|not_assessed|sample`; SE provenance → `analyzed|sample|not_assessed`; tool-call rows → `running|success|error`. Severity tokens `critical|high|medium|low` recur on divergences/challenges/risks.
- **Honesty contract (consistent across surfaces):** any `isSample` / `sample` / `not_assessed` / fixture-derived / non-`live` provenance renders an explicit advisory/preview-only note AND disables seal/export with a stated reason; resolve affordances are suppressed. Seal/submit buttons bind `disabled` directly to the computed `sealable`/`exportable`/`gate.sealable` flag so the UI can never drift from the contract.
- **Accessibility already present:** every verdict strip is `role="status" aria-live="polite"`; color is always paired with text + glyph (color-never-alone, WCAG 1.4.1); radiogroups (effort, labeling mode, §11.50 meaning) use roving tabindex + arrow keys; GovernedActionSignoff is a full modal with focus trap, initial focus, aria-invalid/describedby errors, Escape; SE-table uses semantic table with scope'd headers + SR-only caption; SR-only present/missing text on checklists.
- **Icon set (`icons.tsx`, lucide):** shieldCheck (verified/seal), alert (TriangleAlert), info, blocker (OctagonAlert), scan, flask, file, sparkles, book, check, share, close, stop, arrowUp, down(chevron), copy, redo, thumbUp/Down, panelLeft, plus, chat, folder, search, globe, clip, attach, tools, dots.

---

### Open questions / gaps
- Many live data joins are stubbed in `Ana.tsx`: eCTD assemble uses `SAMPLE_*` fixtures (varying gate state), labeling/IND/dossier provenance forced to `sample`, `labelingCurrencyVerdict = undefined`. The real tool-envelope → client-shape mapping (and BUILD-1 version persistence) is marked INTEGRATION but not wired, so the live runtime appearance of those panels can't be fully confirmed from code alone.
- ConcordancePanel, SEComparisonTable, PerAuthoringPanel, GsprConformityAffordance, CrlPremortemPanel are fully implemented but I did not find their mount sites wired into `Ana.tsx`/`DocumentStudioPane` props at runtime (DocumentStudioPane accepts `concordance` but Ana never passes it; CrlPremortem/SE/PER/Gspr appear unmounted in the current shell) — they may be mounted by host code outside this scope or pending integration.
- Exact CSS token values (colors, spacing, type ramp) live in `styles.module.css` (79KB, not enumerated here); the design bundle `App.jsx` is cited as the visual authority.
- `__tests__/` directory contents not enumerated (out of design scope).
- The five-meaning EsignModal vs three-meaning AnA seal mapping is confirmed; whether host surfaces ever use the other two meanings (responsibility/release) for AnA artifacts is undetermined.

---

# Part 4 — MDX Medical-Device Regulatory Workspace

## Area overview

**Scope:** `client/src/concept2cure/mdx/` (72 files). This is the **Medical Device and Diagnostics (MDX)** workstream of Concept2Cure.RI / AnA — a regulated (21 CFR Part 11, WCAG 2.2 AA) regulatory-affairs platform for device & IVD submissions. It is a self-contained single-page app (`App.tsx`) mounted by `MdxRoute.tsx`, optionally embedded under a host project (ZenApp). The app is a **shell** (left rail + topbar + pathway tab bar + AnA assistant rail + ⌘K palette) wrapping one active **surface** at a time, selected by `activeNav`.

**The shell never changes; the surface area swaps.** Surfaces fall into four nav groups:
- **Workstream** — Overview, 510(k), PMA, CER, IVD Diagnostics, Precedent Intelligence
- **Workbench** — Tasks, Vault, Validation Center, Submission Center, Templates (+ Pre-Sub manager, reached via ⌘K / host)
- **Intelligence** — Analytics, Claude Memory
- **System** — Admin and Access
- Plus **Project Home** (per-program dashboard, reached by clicking a program tile), **Engineering / UDI / Post-market** (doc-first surfaces), and the **AnaDrafter** full-page takeover.

**Honesty contract throughout:** every surface fetches live tenant data and falls back to "kit fixtures" (canonical example content) when the fetch is null/loading/error/unconfigured. A `SampleDataBanner` or inline warn-banner is rendered whenever fixtures are showing, so users never mistake example regulated data for their own. The **only emoji-class glyph allowed** is the AnA sparkle `✻` (U+273B).

**Shared status vocabulary (program-level):** `idle · active · blocked · complete`. Pathway codes (`k510 · pma · cer`) are orthogonal to status and never used as status. Section/doc statuses, severities, and verdicts are enumerated per surface below.

---

## SHELL — global chrome (always present)

### App shell container — `App.tsx`
- **Route / entry:** root component rendered by `MdxRoute.tsx`. Accepts `initialNav` (e.g. host passes `k510`), `projectName`, `projectId`, `onOpenAuthoring`.
- **Purpose:** compose the rail + topbar + tab bar + active surface + AnA rail + ⌘K palette; own the `activeNav` / `railCollapsed` / `anaOpen` / `anaMode` / `selectedProgram` / `cmdkOpen` state.
- **Layout & regions:** CSS grid `.shell` with `data-collapsed` / `data-ana-open` attributes. Left = `Rail`; center = `.main` containing `TopBar` (48px) → `TabBar` (44px) → `.page` (scrolling surface, carries `data-screen-label="MDX · <hereLabel>"`); right edge = `AnaRail` (32px seam → 400px panel). `CmdK` is an overlay.
- **Controls & actions:** global keyboard — **⌘K / Ctrl+K** toggles palette, **⌘\ / Ctrl+\** toggles AnA rail. First visit auto-opens AnA once (`mdx.visited` flag).
- **States:** persisted to localStorage: `mdx.activeNav`, `mdx.railCollapsed`, `mdx.anaOpen`, `mdx.anaMode`, `mdx.viewMode`, `mdx.visited`.
- **Data:** `useMdxPrograms()` is the single source of truth for the program list (feeds TabBar counts, Overview, pathway-default lookup); falls back to `MDX_PROGRAMS` fixture. AnA chat wired via `useAnaChat` → SSE `/api/ana-ri/stream`, with `moduleContext: { workstream: 'mdx', activeNav, anaMode }`, `submissionType` derived (`510K`/`PMA`/`CER`).
- **`HERE_LABEL` breadcrumb map (verbatim):** overview→"Overview", project-home→"Project home", k510→"510(k) Submissions", pma→"PMA Submissions", cer→"CER Generator", device-diagnostics-workbench→"IVD diagnostics workbench", predicate→"Precedent intelligence", engineering→"Device engineering", udi→"UDI and labeling", postmarket→"Post-market vigilance", tasks→"Tasks and reviews", vault→"Document vault", validation→"Validation center", submissions→"Submission center", templates→"Templates", analytics→"Analytics", memory→"Claude memory", admin→"Admin and access", pre-sub→"Pre-submission manager".
- **Default user:** `Jordan Chen` / `JC` / `Enterprise · Reg Affairs`.
- **Notes for design:** `onAskAna(text, {tool})` is the universal AnA dispatch — when a `tool` id is passed, it is embedded as `>toolId …` in the message text. Phase 9: per-pathway editors are handed off to a host "Universal Authoring" shell via `onOpenAuthoring(docType)`; MDX no longer owns editors.

### Left rail — `shell/Rail.tsx`
- **Route / entry:** persistent left column, 260px expanded / 56px collapsed (`data-collapsed`).
- **Layout & regions:** top = logo "Concept2Cure**.RI**" + collapse toggle (panelLeft icon); middle = nav groups; bottom = account button (avatar `JC`, name, role, chevron).
- **Controls & actions:** collapse/expand button; one `nav-item` button per nav entry (`aria-current` when active, `setActiveNav(id)`); collapsed mode shows `title` tooltips. Section headers per group (empty label for System group renders no header).
- **Nav items (verbatim id · label · group):** overview·Overview, k510·510(k) Submissions, pma·PMA Submissions, cer·CER Generator, device-diagnostics-workbench·IVD Diagnostics, predicate·Precedent Intelligence (Workstream); tasks·Tasks and Reviews, vault·Document Vault, validation·Validation Center, submissions·Submission Center, templates·Templates (Workbench); analytics·Analytics, memory·Claude Memory (Intelligence); admin·Admin and Access (System).
- **Notes:** `MDX_STUBS` is empty — no nav id falls through to an "in design" placeholder (Phase 4 shipped engineering/udi/postmarket/analytics/memory/admin).

### Topbar — `shell/TopBar.tsx`
- **Layout:** 48px. Breadcrumb `Concept2Cure.RI › Medical Device and Diagnostics › <hereLabel>`; spacer; program pill (when a program is in context) showing `code · first-2-words-of-title` + chevron (click → opens palette / switch program); ⌘K trigger button reading "Ask AnA, jump to…" with `⌘K` kbd; action buttons Filter / Notifications / Help.

### Pathway tab bar — `shell/TabBar.tsx`
- **Layout:** 44px. 5 tabs with live counts from program list: **Overview** (count = total programs), **510(k)** (count = k510 programs), **PMA** (count = pma), **CER** (count = cer), **Precedent intel** (no count). `aria-current` on active.

### Command palette ⌘K — `shell/CmdK.tsx`
- **Route / entry:** modal overlay (`cmdk-backdrop` role=dialog). Opened via ⌘K, topbar trigger, program pill.
- **Purpose:** unified navigate / run-tool / ask-AnA launcher. First keystroke routes: `/` → navigate, `>` → run a RIM tool, else → ask AnA.
- **Layout & regions:** input row with leading search icon + mode chip (current AnA mode); context line (`Context: <program code · title>` or `Medical Device and Diagnostics · <activeNav>`); result list (role=listbox); footer with ↑↓/↵/esc hints + a **Mode** selector (Standard / Deep research / Nano-banana buttons).
- **Controls & actions:** keyboard nav (ArrowUp/Down/Enter/Escape); items are kind-tagged (nav→arrowRight icon, tool→zap, ask/suggest→sparkles, hint→help). `nav` sets activeNav; `tool` calls `onAskAna('>toolId', {tool})`; `ask` sends the typed query; `suggest` sends the suggestion label.
- **NAV_ROUTES (verbatim label · hint):** Overview·"Portfolio health · programs", 510(k) submissions·"Predicate, SE matrix, eSTAR", PMA submissions·"10-phase workflow · modules", CER generator·"Signals · literature · Article 61", Precedent intelligence·"Cross-agency patterns", Tasks and reviews·"Kanban + list", Document vault·"Files · versions · audit", Validation center·"Rules · blockers · readiness", Submission center·"Pipeline · ESG · receipts", Templates·"Reusable boilerplate".
- **Hints when empty:** 'Type "/" to jump to a surface', 'Type ">" to run a RIM tool', 'Or just type a question — AnA routes via gateway'.
- **Placeholder:** `Ask AnA, "/" to navigate, ">" for a tool…`.

### AnA assistant rail — `shell/AnaRail.tsx`
- **Route / entry:** right edge. Collapsed = 32px seam button (`✻ AnA`, opens on click). Expanded = 400px panel. ⌘\ toggles.
- **Purpose:** in-context Claude chat grounded on the active surface/program, with file upload into project memory.
- **Layout & regions:** header (`✻` mark + "AnA 1.0 RI" + "Claude <model>" + History / New thread / Collapse buttons); **mode row** (3 mode buttons); body = context card (program code·title·stage·readiness%), "Suggested for this surface" buttons, "Thread" message list; footer = attachment chips + composer (attach button, textarea "Ask AnA about this workspace…", send).
- **AnA modes (verbatim id · label · model · desc):** standard·Standard·Sonnet 4.5·"Chat, reasoning, quick answers"; deep-research·Deep research·Opus 4.5·"Drafting, multi-step analysis, long-form"; nano-banana·Nano-banana·Haiku 4.5·"Autocomplete, inline, classification".
- **Controls & actions:** New thread confirms via `window.confirm` before clearing; file upload via `useChatUpload({projectId})` with accept set, per-file status (uploading / ready / error) + extraction-method label; send disabled until draft or a ready attachment exists.
- **Per-surface AnA suggestions (`MDX_SUGGESTIONS`, verbatim):** overview: "Find device-code precedents","Generate readiness report","Flag filing risks"; k510: "Find more CGM predicates","Draft SE discussion","Check eSTAR validation"; pma: "Summarize enrollment gap","Draft DSMB charter","Pull pivotal precedents"; cer: "Run FAERS signal scan","Adjudicate lead dislodgement","Draft Article 61 section"; device-diagnostics-workbench: "Classify under Annex VIII","Summarize analytical performance","Close open GSPR requirements"; predicate: "Compare K221847 vs subject","Find predicates for CGM","Cluster by product code"; engineering: "ISO 14971 risk review","Cybersecurity premarket","Biocompatibility for 14-day"; udi: "Generate UDI for BX-204","Labeling MRI statements","Multi-language harmonization"; postmarket: "This week signals","Open MDRs","Trending adverse events"; editor: "Draft this section from predicate","Check claim against evidence","Rewrite for FDA tone".
- **AnA RIM tools (`ANA_TOOLS`, group · label · desc):** Precedent: search_predicates·"Search predicates", get_se_matrix·"Substantial equivalence", search_precedents·"Search precedents"; Evidence: search_literature·"Search literature" (PubMed/Embase/Cochrane), search_adverse·"Adverse events" (FAERS/MAUDE); Program: get_program_status, get_rim_signals, run_judgment·"Judgment framework" (6-model scoring), get_evidence_chain, suggest_next_action; Authoring: draft_section·"Draft section" (510(k),CER,PMA), create_artifact.

### Inline "Ask AnA" affordance — `surfaces/AskAnaChip.tsx`
- Sparkle `span role=button` rendered inside clickable rows; stops propagation so it doesn't fire the parent row; keyboard-activatable (Enter/Space); `aria-label`/`title` "Ask AnA about <X>".

---

## WORKSTREAM SURFACES

### Overview (portfolio health) — `surfaces/Overview.tsx`
- **Route / entry:** default surface (`activeNav='overview'` / tab "Overview").
- **Purpose:** portfolio health KPIs + filterable program grid/list; entry point into Project Home.
- **Layout & regions:** section header "Device portfolio health" + "Readiness report" CTA → 4 KPI health cards → section header "Programs" + "New program" CTA → view toolbar (filters + grid/list toggle) → program grid OR list.
- **Health KPIs (derived live, fall back to `MDX_HEALTH`):** "Active programs" (`n 510(k) · n PMA · n cleared`), "Average readiness" (% with bar, tone ok/warn/err), "Blockers open" (lists blocked program codes; tone err if >0), "Submissions in flight" ("Stages: assemble · submit").
- **Controls & actions:** Pathway chips **All / 510(k) / PMA / CER** (with counts); Status chips **All / Active / Blocked / Idle** (with status dots + counts); **Grid / List** view toggle (`aria-pressed`, persisted to `mdx.viewMode`, auto-defaults to list above 12 programs); each program card/row → `onOpenProgram` (→ Project Home); inline AskAnaChip "Summarize status and risks for <title>".
- **Grid card:** title, `code · Lead: <lead>`, status chip (dot + status word), stage label + `readiness% ready`, progress bar (color by status: blocked=warning, complete=success, else accent), next-blocker row (alertCircle + text) OR "No open blockers" (check), footer meta + owner initials chips.
- **List columns:** Program / Pathway (path-chip with status dot + 510(k)|PMA|CER) / Stage · Readiness (bar) / Next blocker / Lead (initials) / Due · Activity.
- **States:** **empty-state takeover** when live list resolved with zero programs — "No programs yet" + "Create your first program" CTA (does NOT render fixture tiles).
- **Status vocabularies:** program status `idle · active · blocked · complete`; pathway `k510|pma|cer`.

### 510(k) Surface — `surfaces/K510Surface.tsx`
- **Route / entry:** `activeNav='k510'`, wrapped in `PathwayPanes pathway="k510"`. Receives active program; defaults to BX-204 CGM fixture.
- **Purpose:** drive a 510(k) submission — 7-stage strip, predicate intelligence, substantial-equivalence matrix, eSTAR section tracker.
- **Layout & regions:** section header (`510(k) pathway · <title>`, `Stage X of 7 — <label> · <due>`) + 4 action buttons; 7-node stage strip; two-column body: left = Predicate table + SE matrix panels, right = eSTAR sections panel.
- **Stages (`K510_STAGES`, verbatim):** Intake ("Device spec · intended use") · Classify ("Product code · pathway") · Predicate search ("Precedent intelligence") · Performance testing ("Bench · analytical · clinical") · Substantial equivalence ("SE matrix · differences") · Assemble eSTAR ("20 sections · validation") · Submit ("eSTAR + cover letter"). Stage node state: complete (check) / active / blocked / idle.
- **Controls & actions:**
  - Header: **"Open §11 in editor"** (→ `onOpenEditor(11)`), **"Export 510(k) package"** (AnA: assemble Module 6 PDF + Form FDA 3514 + attachments draft ZIP — explicitly *not* the official eSTAR). The header carries no official-eSTAR button.
  - Official eSTAR panel (`surfaces/OfficialEstarPanel.tsx`, mounted by this surface with the pathway from `officialEstarTypeFor(program)` and the family from `officialEstarVariantFor(program)`; the same panel is mounted by the PMA and IVD surfaces): the ONE Generate control for the official FDA eSTAR. Three parts, top to bottom — (1) a readiness gate driven by `useEstarReadiness(type, variant)`: the panel states whether the vendored template and field map are present and lists the blockers when they are not; (2) a governed field preview from `useEstarOfficialFields`: one row per administrative field showing the caption, the value the platform holds and where it came from (device profile, eSTAR registration, applicant workspace, 510(k) project); a row whose value is blank but has a declared source reads "Not set — <source>" and offers an export-only input, never a guessed value; (3) the single **Generate** control, disabled with its reason until readiness passes, which submits the governed fill request with the reviewed values. Header names pathway and family, e.g. "Official eSTAR · 510(k) · nIVD eSTAR".
  - Predicate table: row checkboxes (multi-select, min 1), filter "show selected only", sparkle "Refine query"; columns **K-number / Device / Cleared / Match (bar + %) / Diffs / Status**; per-row AskAnaChip "Compare predicate <K> …".
  - SE matrix: CSV export button; single-predicate view (Attribute / Subject / Verdict / Predicate / Note) or multi-predicate grid; verdict icons: same=check, equivalent=eq, different=minus.
  - eSTAR panel: "Run pre-flight validation" (play icon → AnA RTA validation); each section row → `onOpenEditor(id)`; rows show `§NN` + label + status pill; AnA-draft banner per row when a draft is pending.
- **States:** predicate fetch error w/o rows → explicit warn-banner "Predicate intelligence is configuring for your tenant…" (shows fixture as preview); eSTAR loading "· loading…"; official-eSTAR-not-ready inline status row.
- **Status vocabularies:** `EstarStatus = complete · review · draft · na · empty`; `PredicateStatus = selected · candidate · reviewed · rejected`; match-bar tone: ≥80 ok, ≥60 warn, else err.
- **Data:** `useK510EstarSections`, `useK510Predicates`, `useK510SeMatrix`; the official-eSTAR panel owns `useEstarReadiness` and `useEstarOfficialFields`; fixtures `K510_STAGES/PREDICATES/SE_ROWS/ESTAR`. 20 canonical eSTAR sections (e.g. §11 Substantial Equivalence Discussion, §19 Performance Testing — Clinical [blocker]).
- **Notes:** governed export plane; honesty banner for predicates; AnA-draft accept loop.

### PMA Surface — `surfaces/PmaSurface.tsx`
- **Route / entry:** `activeNav='pma'`, wrapped in `PathwayPanes pathway="pma"`. Defaults to CV-330 Implantable Monitor fixture.
- **Purpose:** PMA submission — 10-phase grid, 4 trial KPIs, 6 module cards.
- **Layout & regions:** section header (`PMA pathway · <title>`, `Phase X of 10 — <label> · <due>`) + "Open module editor" CTA; 10-phase grid (each: label, progress bar, %, status dot); 4 trial health cards; section header "PMA modules" + 6 module cards.
- **10 phases (`PMA_PHASES`, verbatim):** Pre-submission · Preclinical · IDE approval · Manufacturing validation · Pivotal trial · Labeling · Module assembly · Advisory panel · Approval · Post-approval studies. Per-phase status complete/active/blocked/idle, pct derived from program stageIdx+readiness.
- **Trial metrics (`PMA_TRIAL_METRICS`):** Enrolled (412/680, bar, "Behind plan by 3 weeks"), Active sites (14, "Target 15 · 1 site pending IRB"), Primary endpoint (94% sensitivity, "Pre-specified ≥ 90%"), Adverse events (47, "3 serious · 2 device-related under adjudication", tone err).
- **Modules (`PMA_MODULES`, label · docs · status · desc):** Preclinical(47·complete), Clinical(23·active), Manufacturing(31·review), Labeling(12·draft), Statistical(8·review), Financial(14·complete). Click → AnA "Open PMA module …". Module status pills: `complete · active · review · draft`.
- **Data:** `useProgramExtras` (pmaModules, pmaTrialMetrics) with fixture fallback.

### CER Surface — `surfaces/CerSurface.tsx`
- **Route / entry:** `activeNav='cer'`, wrapped in `PathwayPanes pathway="cer"`. Defaults to IV-415 Companion Diagnostic fixture.
- **Purpose:** EU MDR Article 61 Clinical Evaluation Report — safety signals, literature corpus, CER sections, generation plan.
- **Layout & regions:** header (`Clinical Evaluation Report · <title>`, `EU MDR Article 61 · <due>`) + "Generate draft" CTA; two-column: left = Safety signals table + Literature corpus bar chart; right = CER sections list + Generation plan card.
- **Safety signals:** subtitle `N signals · n included · n excluded · n under review`; filter "show included only"; "Run fresh signal scan" (zap → FAERS/MAUDE/Eudamed/literature); columns **ID / Source / Event / N / Severity / Status**; empty-state "No safety signals reported yet" when live feed returns zero.
- **Status vocabularies:** signal status `included · excluded · review`; severity rendered as status-pill (severity values from data).
- **Literature corpus:** `<total> hits · PubMed · FDA · ClinicalTrials.gov · N-year window`; per-year bars; empty-state "No literature corpus indexed yet".
- **CER sections:** "Article 61 template · N sections"; CSV export; rows `NN` + label + status pill (statuses from sections table).
- **Generation plan:** 3 sparkle bullets (Clinical data summary from 4 included signals + 412 lit hits; Safety/risk-benefit with adjudicated lead-dislodgement; PMS plan from FAERS trajectory) + "Draft with AnA" accent button.
- **Data:** `useK510EstarSections` (CER reuses the cerv2_510k_sections table), `useProgramExtras` (safetySignals, literature, literatureTotal).

### IVD Diagnostics Surface — `surfaces/IvdSurface.tsx`
- **Route / entry:** `activeNav='device-diagnostics-workbench'`, wrapped in `PathwayPanes pathway="ivd"`. Org-scoped lists + program-scoped GSPR.
- **Purpose:** IVDR pathway — 7-stage strip, Annex VIII classification, analytical validation, clinical 2×2, GSPR (Annex I) compliance matrix.
- **Layout & regions:** header (`IVDR pathway · <subject>`, `Stage X of 7 — <label> · <due>`) + "Assemble technical file" CTA; 7-node stage strip; two-column: left = Annex VIII classification table + Clinical 2×2 table; right = Analytical validation table + GSPR matrix.
- **Stages (`IVD_STAGES`):** Intake · Classification (Annex VIII rule engine) · Analytical validation (LoD·LoQ·precision) · Clinical evidence (2×2·sens·spec) · GSPR compliance (Annex I · 23 requirements) · Assemble dossier · Submit (EUDAMED · NB review).
- **Classification table:** columns **Device / Intended purpose / Class / Rule**; device sub-line shows CDx · Self-test · Near-patient tags; class pill review for C/D, complete for A/B; per-row AskAnaChip. Classes `A · B · C · D`.
- **Clinical 2×2:** columns **Study / TP/FP/TN/FN / Sens. / Spec. / PPV / NPV**; study status pill complete or review.
- **Analytical validation:** columns **Analyte / LoD / LoQ / CV% / Status**; status mapped via `PARAM_PILL` — pass→"complete", fail→"empty", pending→"draft". (`IvdParamStatus = pass · fail · pending`.)
- **GSPR matrix:** `overall% compliant · n requirements open`; per-chapter rows (I/II/III) with `compliant/total compliant` + non-compliant/not-assessed sub-counts + % pill (≥80 complete, ≥50 review, else draft). Req statuses: `compliant · partially_compliant · non_compliant · not_assessed · not_applicable`.
- **States:** `usingFixture` → honest warn-banner "Showing the canonical IVDR example…".
- **Data:** `useIvdClassifications/Validations/ClinicalEvidence/GsprMatrix`.

### Precedent Intelligence — `surfaces/PrecedentSurface.tsx`
- **Route / entry:** `activeNav='predicate'` (tab "Precedent intel"). NOT wrapped in PathwayPanes.
- **Purpose:** saved precedent queries (CRUD) + cross-portfolio insights across FDA/EMA/PMDA.
- **Layout & regions:** header "Precedent intelligence"; two-column: left = Saved queries panel (list + add-form), right = Cross-agency precedent patterns (insight list).
- **Saved queries:** `N saved · personal + org-shared`; per row: index, label, query sub-text, hit count (`-1` → "not yet run" else `N hits`), "Run search" sparkle (→ AnA), remove (x). Add form: Label input ("e.g. CGM 14-day wear"), Query input, "Pin" submit. Empty-state "No saved queries yet — pin a search below…".
- **Insights:** "Derived from your portfolio" → bulleted insight bodies; loading "Computing insights…"; unavailable fallback.
- **Data:** `useSavedPrecedentQueries` (`/api/saved-precedent-queries` CRUD), `usePortfolioInsights` (`/api/regulatory-programs/portfolio-insights`).

---

## PATHWAY SUB-TABS (shared by 510k / PMA / CER / IVD)

### PathwayPanes — `surfaces/pathway/PathwayPanes.tsx`
- **Route / entry:** wraps every pathway surface; renders a sub-tab bar above the surface content and a slide-in dossier drawer.
- **Sub-tabs (`PaneTab`, label · sub-label · count/badge):** **Workspace** (sub varies: "Predicate · SE · eSTAR" / "Phases · modules" / "Class · validation · GSPR" / "Signals · literature") · **Audit trail** ("21 CFR Part 11", count = audit events) · **<corrLabel>** ("Agency / NB queries", count + badge if open>0; corrLabel per pathway: k510="RTA / AI-Hold", pma="Day-100", cer="NB Q&A", ivd="NB / GSPR") · **Approvals** ("Pending e-sign", count + badge if pending>0) · **Files** ("Full filesystem").
- **Data:** `usePathwayTabsData(pathway, programId)` (live audit/correspondence/approvals, fixture fallback `PATHWAY_TABS_DATA`); `useDossierHydration` seeds the in-memory dossier store.

**Audit Trail pane:**
- Integrity bar: "Tamper-evident · SHA-256 · N events" (hover explains hash-chaining) + filter chips **All / E-sign / Review / Edits / Comments / Access** + "Signed export" (PDF + JSON manifest).
- Two-pane: day-grouped event list (time, kind chip, actor + target, lock icon if signed) | detail (kind chip, id, target, When/Actor·role/IP/Diff/File/Body/Reason/Signature dl-grid, **Hash chain** prev/this, "Open in dossier" + "Export this event").
- **Audit kinds (`AUDIT_KIND_META`, kind → label · tone):** section.edit→Edit·neutral, section.lock→Lock·neutral, section.unlock→Unlock·warn, review.start→Review·neutral, review.complete→Verified·success, sign→E-sign·accent, comment→Comment·neutral, attach→Attach·neutral, export→Export·neutral, access→Access·neutral. Audit rows carry hash/prev chain; live rows tagged `live:true`.

**Correspondence pane:**
- Stat bar: `n open · n in review · n closed` + filter chips **All / Open / In review / Closed**.
- Two-pane: letter list (kind chip, AnA "flagged" badge, status, subject, from·received·due with overdue/`Nd late`) | detail (kind+status, subject, from·channel·received, due banner, summary, **References in dossier** (→ openSection), **Triage** dl-grid [AnA / Owner / Priority pill / Tasks], actions **"Draft response with AnA"** (→ AnaDrafter) / Assign / Mark closed).
- **Correspondence status:** `open · in_review · closed`; **priority:** `high · med · low`. Kinds vary by pathway (verbatim seed): k510 — RTA / Interactive Review / AI-Hold; pma — Day-100 / Major Deficiency; cer — NB Major NC / NB Q&A / NB Minor NC; ivd — same NB NC set. Channels: CDRH eSTAR / eCopy / CDRH letter / TEAM-NB portal.

**Approvals pane:**
- "Pending your signature" (`n require your e-sign · n total open`, "21 CFR Part 11 · §11.50 · §11.70") + "Signed" section.
- **ApprovalCard e-sign flow (Part 11):** stage pill (review/qa/medical/regulatory), due chip, target, requested-by · signer · role; "E-sign" opens an inline form: **Meaning of signature** input + password (≥6 chars) + "Apply signature" (disabled until both filled) + Cancel; footer "21 CFR §11.100(b) · By signing you certify the listed meaning. Time, IP, and a SHA-256 of this record will be appended to the audit trail." On sign → "Signed just now" with acknowledged meaning + `WP-####`. Non-signers see "Remind <name>" / "View". **Approval status:** `pending · signed`; stages `review · qa · medical · regulatory`.

**DossierDrawer (slide-in, role=dialog):**
- Header crumb `<pathway> dossier › <section label>` + status pill + close; optional folder path (mono); tabs **Document / Attachments (count) / Activity (count)**.
- Document tab: contentEditable body with debounced (600ms) autosave to `DossierStore.writeSectionBody`; status dot dirty/saved + "edits sync to audit + activity".
- Attachments tab: drag-drop zone ("Drop files or click to attach", "PDF · DOCX · XLSX · CSV · PNG · JSON"); attachment rows (icon by kind, name, size·who·when·source, "new" tag for live).
- Activity tab: audit-chip rows (actor, diff, file, signature, when·role, "new" tag).
- Footer: status dot + "Last edited <time>" + `v<version>` + "Open in editor" (→ onOpenEditor, closes drawer).

### Files Tree Pane — `surfaces/pathway/FilesTreePane.tsx`
- **Route / entry:** the "Files" sub-tab. Full filesystem view of the pathway program.
- **Layout:** breadcrumb bar (`/`-split path) + "<N> files · <510(k)|PMA|CER> program"; two-pane: left tree (expand/collapse dirs, file/folder icons) | right preview.
- **Tree structure:** `Files/` → **Dossier/** (live in-memory store: section folders, each with `body.md`, `meta.json`, `attachments/`), **Correspondence/** (synth `<date> — <slug>.md` per letter), **Approvals/** (synth `<id> — <slug>.json`), **Audit/** (`audit-trail.ndjson`), **Sources/** (placeholder dirs predicates/ literature/ signals/).
- **Previews by file kind:** body → markdown `<pre>` + "Open in dossier" + meta (lines, KB, edited-by); meta → JSON; attachment → card (Kind/Size/Uploaded-by/When + "Binary content not previewable · Download original"); correspondence → letter (subject, status pill open/closed, Incoming/Outgoing, from/to, body); approval → JSON; audit → ndjson lines ("N events · SHA-256 chained · append-only", first 200); dir → folder listing; placeholder dir → "No files yet. Sources are added when you cite a predicate, paper, or signal."
- **Data:** `DossierStore` (subscribeAll for live updates), `PATHWAY_TABS_DATA`.

### AnaDrafter (correspondence response drafter) — `components/AnaDrafter.tsx`
- **Route / entry:** full-page takeover launched from "Draft response with AnA" in the Correspondence pane; back returns to the list.
- **Purpose:** draft a structured agency/NB response, deficiency-by-deficiency, with internal sign-off gating before Send.
- **Layout & regions:** top bar (back, kind chip + subject, ref·from·received, due chip, status pill, Citations toggle, Regenerate); two-pane body — **left:** the agency letter rendered as paper (from/ref/our_ref/dated/via, body paragraphs with inline-clickable `D<n>` deficiency tags, deficiency rail, sign-off + cc); **right:** the response (unstarted hero with 5-step plan + "Generate draft", or drafted body); footer (acknowledged-by, Save draft / Discard / Send).
- **Drafted body:** Acknowledgment (A) section, one card per deficiency (reviewer ask, editable Response textarea, optional result table, Discussion, Evidence-to-attach list with "generated" tags, Dossier-updates with diff + "Open in dossier", Citations chips section/reg refs), Closing (Z) section, **Reviewers** internal sign-off grid (Approve toggles, role·name·signed-at).
- **States / statuses:** draft status `unstarted · drafted · in_review · approved · sent` (StatusPill: Not started·idle / Draft·draft / In review·review / Approved·success / Sent·success). Send disabled until **all reviewers approved**; due-chip tone late/warn/ok. Empty fallback when no structured letter on file.
- **Data:** `CORRESP_DETAIL` keyed by correspondence id; reviewers default Reg Lead/Biostat/Med Affairs/QA.
- **Notes:** "No changes are written to the dossier until you accept the proposed updates."

### AnaDraftBanner — `components/AnaDraftBanner.tsx`
- Inline banner on a section row when AnA drafted content (write_kit_section) not yet accepted: "Drafted by AnA · <timeAgo>" + summary + **Refine** (→ open editor) / **Accept** (→ `useAcceptAnaDraft`, stamps accepted_at/by, status→ready_for_review). Loading "Accepting…", error alert. Accent orange reserved for the single Accept action; sentence case, no emoji.

---

## DOC-FIRST SURFACES (Engineering · UDI · Post-market)

These share a doc-first layout: page-header (eyebrow + title + sub + 2 CTAs) → SampleDataBanner → 4 metric cards → **DocumentsPanel** (primary) → blockers/triage feed → collapsible "Situational awareness" accordion.

### Documents Panel — `components/DocumentsPanel.tsx`
- **Purpose:** reusable "documents this surface owns" list; row per document.
- **Layout:** section head (title, subtitle, optional framework filter `seg` row with counts) → doc rows.
- **Row:** framework tag, optional `DHF §<ref>`, **status pill**, "blocker" pill, e-sig chip (signed/sign pending/esig n/a with title), title, meta (`ver` · `sectionsComplete/sections sections` · progress bar · `completion%` · owner → reviewers · lastEdit), blocker note, flag chips (open comments / deviations / open risks / unresolved anomalies), actions (sparkle "Ask AnA to draft" + open arrow). Click row → `onOpenEditor(id)`.
- **Status vocab:** `DocStatus = draft · review · ready · locked`; `DocEsigState = na · pending · signed`.

### Engineering Surface — `surfaces/EngineeringSurface.tsx`
- **Route / entry:** `activeNav='engineering'`. Per-program (`useEngineering(programId)`).
- **Purpose:** device-engineering regulatory documents (design controls) + risk/DHF dashboards.
- **Header:** eyebrow "Workstream · <code · title>", title "Device engineering", sub "<N> regulatory documents to deliver before <due>. 21 CFR 820.30 design controls · ISO 14971 risk · IEC 62304 software · FDA Cyber 2023." CTAs: "Open SRS" (doc-srs-bx204), "Open Risk Management File" (doc-rmr-bx204).
- **Metrics:** Documents in flight (ready/review/draft), Blocked documents (tone err), Awaiting signature ("Pending Part 11 e-signature"), Avg completion (%).
- **Blocker feed:** "What's blocking your documents" — consolidated from DHF gaps, unverified risks, ECRs, non-conformances; rows `dot · kind · ref · title · note · owner · age`; severity err/warn/low; "Show N more · open situational awareness".
- **Situational awareness accordion:** DHF strip (cells with `data-status`, `§num`, ver, updated, status pill); **ISO 14971 residual-risk heatmap** (severity × probability grid, click cell to filter, tone by `ENG_RISK_ACCEPT` verdict, count badges); Risk records (id, hazard, residual, harm; click → AnA); trace-row summary count.

### UDI Surface — `surfaces/UdiSurface.tsx`
- **Route / entry:** `activeNav='udi'`. Cross-tenant.
- **Purpose:** produce labels (IFU/package/on-device/patient) + GUDID/EUDAMED registration files.
- **Header:** "UDI and labeling", "<N> label and submission artifacts to deliver. 21 CFR 801 · ISO 15223-1 · EU MDR Annex I · ASTM F2503." CTAs: "Open UDI Master Record" (doc-master-bx204), "Open BX-204 IFU" (doc-ifu-bx204-en).
- **Metrics:** Documents in flight (labels/submissions), Blocked documents (data-tone err/ok), Awaiting signature ("Pending Part 11 e-signature"), Avg completion %.
- **DocumentsPanel** ("Documents in flight" — labels filtered `editor==='label'`, submissions `editor==='data-submission'`).
- **Blocker feed:** "Blocking label release" — `n hard blockers · n review pending · ISO symbols · translations · UDI checksums · risk-class confirmation`; rows merged from `UDI_ISSUES` + blocked docs; severity err/warn/low.
- **Situational awareness:** Device registry · UDI-DI table (Device / Class / FDA UDI-DI / GUDID status pill / EU UDI-DI / EUDAMED status pill / MRI badge); ISO 15223-1 symbols glossary (present/missing); MRI conditional matrix (Device / Mode / Field / SAR / Gradient / Notes). MRI modes: `conditional · unsafe · safe`; GUDID/EUDAMED statuses include `published · draft · in-review · not-started`.
- **Data:** `useUdi` (devices/symbols/issues/mri), `UDI_DOCUMENTS`/`UDI_DOC_FRAMEWORKS`.

### Post-market Surface — `surfaces/PostmarketSurface.tsx`
- **Route / entry:** `activeNav='postmarket'`. Cross-program.
- **Purpose:** vigilance — MDRs (FDA 5-day/30-day, EU 15-day), FSCAs/FSNs, CAPAs, PSURs.
- **Header:** "Post-market vigilance", "<N> regulatory submissions in flight. 21 CFR 803 MDR · EU MDR Art. 87 · 21 CFR 820.100 CAPA · PSUR." CTAs: "Triage signals" (AnA), "Open <MDR-id> (<dueIn>)" (most urgent MDR).
- **Metrics:** MDRs due ≤72h (tone err, "FDA 5-day · 30-day · EU 15-day clocks"), CAPAs in flight (tone warn, "n investigation · n review"), PSURs + PMS plans ("n signed · annual + 2-year cadence"), Open signals ("n critical · awaiting MDR roll-up").
- **DocumentsPanel** ("Regulatory submissions in flight" — MDR/CAPA/FSCA/PSUR frameworks).
- **Signal triage queue:** critical/under-review signals not yet wrapped in MDR/CAPA, oldest first; row → AnA "Draft an MDR for signal …". Signal severity `critical · review · watching`; signal state e.g. `investigate · mdr-30d · fsca-evaluate · patch-q3 · closed-trend · review-q4`.
- **Situational awareness:** **CAPA board** (5 stages **Open · Investigate · Action · Verify · Close**, cards with critical pill); Vigilance trending sparklines (per-device SVG); PMS plan execution table (Device / Sources / Signals / State pill on-track→active else review).
- **Data:** `usePostmarket` (signals/capas/pmsPlan/trends), `PV_DOCUMENTS`.

---

## INTELLIGENCE SURFACES

### Analytics Surface — `surfaces/AnalyticsSurface.tsx`
- **Route / entry:** `activeNav='analytics'`. Read-only, cross-program.
- **Purpose:** portfolio cycle times, blocker root causes, reviewer velocity vs peer cohort, AnA effectiveness.
- **Header:** eyebrow "Intelligence", title "Analytics", pathway seg **All / 510(k) / PMA / CER**, "Export" (AnA one-page PDF).
- **Sections:** KPI cards (with up/down delta arrows); DocumentsPanel ("Reports and dossiers"); **Pace of clearance** (24-month bar histogram, this-year highlight); **"Where the time goes"** phase cycle-time vs peer median (diverging bars left=faster/right=slower, 510(k) + PMA tracks, legend); two-column — **Top blockers · root cause** (count, cause, trend up/down/flat, pathway·median age·owner; click → AnA) + **Reviewer velocity · by product code** (FDA decision-day cohort distribution line with cohort p50 + "ours" ticks, first-cycle approval rate); **AnA tool usage · acceptance** (per-tool accepted/calls bars, last 8 weeks).
- **Data:** `useAnalytics(pathway)` with `ANL_*` fixtures + `SampleDataBanner`.

### Memory Surface — `surfaces/MemorySurface.tsx`
- **Route / entry:** `activeNav='memory'`. No-docs variant (atoms feed AnA across surfaces).
- **Purpose:** curated org AnA context — memory atoms (rules-of-record pinned to conversations).
- **Header:** eyebrow "Intelligence", title "AnA memory"; CTAs "Memory report" / "Ingest source".
- **Headline strip:** `N atoms · n pinned to every conversation · n awaiting verification (Review →) · n memory effects today`.
- **3-column grid:** left sidebar (Category filter list with colored dots + counts, Importance filter, "Unverified only" toggle); center **Memory atoms** (`filtered of total · ordered by recency × use`; atom card: id, category tag, importance tag, "pinned", "unverified" warn, scope chips, title, body, source link, supersedes chain, use count + last used, actions **Verify** (if unverified) / **Trace** / **Supersede**; empty-state "No atoms match your filters"); right **Effects · today** ("What memory did" — effect cards by kind, atom ref, count×).
- **Ingestion:** "sources → atoms" jobs; per job: id·added·state pill (verified→complete / in-progress→active / else review), source, accepted/rejected/pending bar; click → AnA.
- **Data:** `useMemory` (atoms/categories/effects/importance/ingest) + `SampleDataBanner`.

---

## SYSTEM SURFACE

### Admin Surface — `surfaces/AdminSurface.tsx`
- **Route / entry:** `activeNav='admin'`. Cross-program, tabbed.
- **Purpose:** org members, roles/scopes, program grants, SSO, API keys, submission gateways, settings, admin audit. "Every action below emits a 21 CFR Part 11 audit entry."
- **Header:** eyebrow "System", title "Admin and access"; CTAs "Audit a member" / "Invite member". Then KPI cards + DocumentsPanel ("Compliance exports" — Part 11 artifacts).
- **Tabs (`AdminTab`):** **Members · Roles + scopes · SSO + provisioning · API keys · Submission gateways · Settings**.
  - **Members:** filter seg by state (All/Active/Invited/Disabled) + role; table (avatar / Member / Role pill / Groups chips / SSO okta|local / MFA check|warn / Last seen); selecting a member opens a drawer (role, state pill active/review/idle, SSO, MFA Enrolled/Pending, groups, **Role scopes** chips, **Program access** grants, "Grant access" / "Audit activity" — both emit Part 11 entries). Member state: `active · invited · disabled`.
  - **Roles + scopes:** role cards (pill, member count, desc, scope chips, "Edit scopes").
  - **SSO:** connection cards — primary "connected", proposed "staging", fallback "enabled", SCIM enabled/disabled; actions "Rotate signing cert" / "Promote to primary".
  - **API keys:** table (Key / Name / Scopes chips / Owner / Created / Rotate in [overdue=red] / Last used); click → AnA rotate flow (stage, dual-publish 24h, deprecate).
  - **Submission gateways (production):** rows keyed `region:gateway` from `useGatewayStatus`; badge **Configured** (green) / **Not configured** (amber) / **Status unavailable** (grey); shows transport + `set <ENV_PREFIX> to enable`. Gateways: FDA ESG, EMA CESP, EU EUDAMED, PMDA Gateway, Health Canada CESG. "A gateway stays inert until configured, and never transmits with partial setup."
  - **Settings:** setting rows (label, desc, current value, chevron) → AnA change-with-audit.
- **Admin audit (always shown, last 24h):** "SHA-256 chained · cryptographically verifiable · N actions"; rows id·when·actor(system grey)·action·target·sha.
- **Data:** `useAdmin` (kpis/members/roles/grants/apiKeys/audit/settings/sso), `useGatewayStatus('production')` + fixtures.

---

## WORKBENCH SURFACES — `workbench/Workbench.tsx`

### Tasks and reviews — `TasksSurface`
- **Route / entry:** `activeNav='tasks'`.
- **Purpose:** cross-portfolio assigned work — blockers, peer reviews, e-signatures.
- **Layout:** header (Board/List seg, All/Mine seg, "New task") → metric cards → Kanban board OR list table.
- **Kanban columns (`TASKS_COLUMNS`):** **To do · In progress · In review · Blocked · Done** (tones default/active/review/blocked/complete). Cards: program · §section, e-sig shield, title, label pill, comments, due, assignee. Click → AnA "Open task …".
- **List columns:** Task / Summary / Program·§ / Label / Due / Assignee / Cmt.
- **Metrics (`TASKS_METRICS`):** Open across portfolio (47), Due this week (14), Awaiting my action (6, warn), Cycle time median (2.4d).
- **Task fields:** `col`, prog, sect, title, assignee, due, tone, label, kind (edit/review/sign), esig, comments.
- **Data:** `useWorkbenchTasks` (`/api/submission-ops/workload`) fixture fallback.

### Document vault — `VaultSurface`
- **Route / entry:** `activeNav='vault'`. "Every program artifact, every version, every signature. 21 CFR Part 11 audit trail."
- **Layout:** header (Export manifest CSV / Upload) → 3-pane: folder/type tree | file table | detail drawer.
- **Tree:** Folders list (`VAULT_FOLDERS` with counts) + Types filters (`VAULT_FILTERS`). Search box "Search files, hashes, authors…".
- **File table columns:** Name (type tag + name + blocker pill + e-sig shield) / Type / Size / Version / Status pill / Updated.
- **Drawer:** eyebrow prog·kind, title; meta grid (Version / Size / Status pill / Linked artifacts / Author / SHA-256); actions Download / Preview / Ask Claude; **Version history** (`VAULT_VERSIONS`, status-tagged); **Audit trail** (AUD-#### rows: Signed / Checksum verified / Uploaded).
- **Data:** static `VAULT_*` fixtures.

### Validation center — `ValidationSurface`
- **Route / entry:** `activeNav='validation'`. "eSTAR required-field rules and claim-evidence checks, every program, one dashboard."
- **Layout:** header (Export report CSV / "Ask Claude to triage") → summary metric cards → **Readiness by program** matrix (program cards: code, status pill, title, pathway, readiness bar, `n err · n warn · n ok`; click filters rules) → **Rules** section (severity seg All/Blockers/Warnings; table Sev pill[Blocker/Warning/Pass] / Rule / Program·§ / Category / Message / Since).
- **Data:** `useMdxPrograms` + `useWorkbenchValidation` (joins `/api/submission-ops/blockers`); fixtures `VALIDATION_RULES/PROGRAMS/SUMMARY`. Severity `err · warn` (+ pass).

### Submission center — `SubmissionsSurface`
- **Route / entry:** `activeNav='submissions'`. "Package and transmit — FDA ESG, notified bodies, EU MDR."
- **Layout:** header (status filter cycle All→active→blocked→complete / "New submission") → **Pipeline** (7 stages from `SUBMISSION_PIPELINE`, num·label·desc·count) → **Active submissions** (list | detail).
- **List row:** prog code, status pill, title, target, files·bytes, gate chips (err/warn/ok), Sent/Target date. Empty-state "No submissions yet".
- **Detail:** eyebrow prog·pathway, title, target; actions "Ask Claude" (if blocked) + **Transmit / View receipt** (disabled if gate errs>0 or unsigned); **Submission gate** (Validation err/warn/pass, Cover letter signed?, E-signature signed/pending, Package files·bytes); **Activity** log.
- **Data:** `useSubmissions` (`/api/submission-ops/packages`), `useSubmissionDetail` (readiness + milestones). Submission status `active · blocked · complete`.

### Templates — `TemplatesSurface`
- **Route / entry:** `activeNav='templates'`. "Reusable section skeletons and boilerplate. Org-approved, version-controlled."
- **Layout:** header ("New template") → template card grid (icon, uses, name, owner·updated, tag chips); click → AnA "Open template …".
- **Data:** `useWorkbenchTemplates` (`/api/templates`) fixture fallback.

---

## PROJECT HOME — `projectHome/ProjectHome.tsx`
- **Route / entry:** `activeNav='project-home'`, reached by clicking a program tile on Overview. Exit via "Overview" breadcrumb or "Open workbench" CTA.
- **Purpose:** per-program dashboard.
- **Layout & regions:** header (breadcrumb Overview › <PROGRAM-ID>, title, meta pills [code · Lead · Stage · due-tone], "Ask Claude" + "Open workbench"); 2-column grid — **main:** Submission readiness (SVG `ReadinessRing` % + SecBars Drafted/In review/Approved/Blocked), Your tasks (live filtered to program, fallback `PH_TASKS`), Milestones (timeline `n of N complete`, states complete/active/idle), Claude recommendations (`PH_RIM_RECS`, kind + body + "Ask Claude", impact high/med); **side:** Change impact (who·when·what + affected-section tags), Governance (`deriveGovernance` — Reg lead/Eng owner/Quality/Clinical/Submitter, sig pending/signed/reserved), Recent activity (who·what·when).
- **Data:** `useProgramDetail` (lead + team → governance), `useWorkbenchTasks`, `useProgramExtras` (milestones/rimRecs/changeImpact/activity); each panel fixture-falls-back, live wins.

---

## PRE-SUB MANAGER — `presub/PreSubManager.tsx`
- **Route / entry:** `activeNav='pre-sub'` (HERE_LABEL "Pre-submission manager"; page title "Pre-Sub manager"). FDA Q-Submission tracker.
- **Purpose:** track Pre-Sub / SIR / Study Risk / Agreement / Informational meetings — questions, FDA responses, commitments rolled into the live dossier.
- **Layout & regions:** page header (Export CSV / "New Q-Sub") → KPI metric strip → "Q-Submissions in flight" section → filter row (type seg All/Mine + type chips; stage seg) → list | detail two-pane.
- **List row:** qNumber + type chip, title, prog·fdaTeam; stage dot + label + `Nd`, `answered/questions`, `rolledIn/commitments commitments rolled in`.
- **Detail:** eyebrow prog·qNumber·type, title, FDA team·filed·target; actions "Summarize" / "Export package" (eSTAR Section 6 attachment); summary; **stage strip** + meeting card (date·kind·team, Confirmed/Tentative); tabs **Questions (answered/total) · Timeline · Commitments**; question view (Q#, status "FDA responded"/"Awaiting FDA", our position, FDA response, commitment with dossier-link + Rolled in/Blocker/Pending); commitments table; timeline rows.
- **Types (`PRESUB_TYPES`):** Pre-Sub · Submission Issue · Study Risk Det. · Agreement · Informational. **Stages (`PRESUB_STAGES`):** Planning · Package · Filed · Awaiting FDA · Feedback · Integrate. Question status `answered · awaiting`; commitment states Rolled in/Blocker/Pending; meeting confirmed/tentative.
- **Empty/loading:** "Loading detail…" / "Detail unavailable" / "Package in draft"; "No Q-Subs match these filters".
- **Data:** `usePresubList` (`/api/q-sub`), `usePresubDetail` (`/api/q-sub/:id`); fixtures `PRESUB_KPIS/TYPES/STAGES/LIST/DETAIL`. KPIs: In flight, Awaiting FDA, Responses received, Days to feedback.

---

## SampleDataBanner — `components/SampleDataBanner.tsx`
- Honest fixture marker rendered whenever a live source is null while showing fixtures. Loading copy: "Loading your data — <subject> shows canonical sample content until it arrives." Standing copy: "**Sample data** — not your project. <subject> shows canonical example content; your live data appears once the source is connected." Neutral treatment (no accent orange); `role=status aria-live=polite`.

---

## CSS files (styling contracts referenced by surfaces)
- `app.css` — base shell, page-header, metrics-row, section, ctable, kanban, vault, validation, submissions, admin, memory, analytics, DOCUMENTS PANEL.
- `pathway-tabs.css` — pwt-bar, audit-pane, corr-pane, ap-pane (approvals/e-sign), dd-drawer (dossier).
- `files-tree.css` — ftp-pane tree + preview.
- `drafter.css` — ana-drafter two-pane letter/response, ana-draft-banner.

---

## Cross-cutting design notes
- **Part 11 touchpoints:** every audit pane (SHA-256 hash-chain, signed export), the ApprovalCard e-sign form (meaning-of-signature + password + §11.100(b) attestation), the Submission gate, Admin "every action emits a Part 11 audit entry", Vault audit trail, Pre-Sub commitments.
- **Honesty contract:** SampleDataBanner + per-surface warn-banners + empty-state takeovers ensure fixtures are never mistaken for tenant data; predicate/IVD/CER surfaces are explicit about example vs live.
- **Governed actions:** official eSTAR generation (gated, disabled-with-reason), AnaDrafter Send (gated on all-reviewer approval), submission Transmit (gated on gate errs + e-sign), Admin grants/settings/key-rotation (audit-emitting).
- **Accessibility present:** `aria-current` on nav/tabs, `role=dialog/listbox/tab/tablist/status/alert`, `aria-live`, `aria-pressed`, keyboard handlers on chips and palette, sr-only upload status. Calm-motion / sentence-case / no-emoji rules referenced in component headers.

---

## Open questions / gaps
- **Icon set** (`icons.tsx`) not fully enumerated here — surfaces reference `I.*` keys (Lucide); the exact glyph per key is in that file (not read in full).
- **Live endpoint paths** are partly inferred from hook comments (`/api/ana-ri/stream`, `/api/saved-precedent-queries`, `/api/regulatory-programs/portfolio-insights`, `/api/q-sub`, `/api/submission-ops/{workload,blockers,packages}`, `/api/templates`, `/api/510k/estar/official`, `/api/mdx/engineering/:programId`, `/api/ivdr/*`); the full request/response shapes live in the `hooks/` files (read at signature level only).
- Several data fixtures (cer.ts, memory.ts, analytics.ts, admin.ts, engineering.ts, udi.ts/postmarket.ts tails, correspondenceDetail.ts) were read only partially or via their consuming surface — exhaustive row content (e.g. full symbol glossary, every analytics KPI value) is in those data files.
- **Pre-Sub `onJumpToDossier`** is wired through props but the host's dossier-jump target isn't defined within MDX scope.
- The `editor` suggestion key and Phase-9 authoring layout live in the **host** (ZenApp), out of this scope.

---

# Part 5 — Biopharma / PDEV / CMC

## Area — overview

Three sibling domain shells under `client/src/concept2cure/`, each a self-contained React+TS workspace (rail + topbar + tabbar/sub-nav + surface router + AnA assistant dock), all styled on the shared MDX base stylesheet (`.rail/.topbar/.tabbar/.ana-seam`) plus a per-domain `app.css` overlay. **60 files read** (biopharma 24, cmc 17, pdev 19).

- **Biopharma** (`biopharma/`, 24 files) — the IND→NDA/BLA/MAA/JNDA submission-lifecycle workspace. One shell, three tenant types (medtech / biotech / pharma) drive rail/tab filtering + greetings. Conversation-first surfaces (greeting + composer + Today queue + collapsed reference dashboard). Most reference dashboards are **fixture-backed and visibly labeled "Sample data"** pending moat-phase endpoints; Overview + Today queues use live programs + correspondence. Medtech tenants are redirected to MDX.
- **CMC / Module 3** (`cmc/`, 17 files) — chemistry-manufacturing-controls authoring OS. 9 flat surfaces, **all live-data** (React Query against `/api/cmc/*`), with real governed mutations (spec approval, batch release, Module-3 section approval) through a shared 21 CFR Part 11 e-signature modal. Project-scoped via a top-bar project selector.
- **PDEV → IND readiness** (`pdev/`, 19 files) — pre-IND program-development tracker. 3-pane shell, 8 nav items across Workstream (CMC/Nonclinical/Clinical/Regulatory) + Workspace (IND assembly / Contradictions / FDA interactions) groups. **All live-data** (`/api/pdev/*`), heavily governed: every mutation routes through a universal reason-for-change confirm dialog (typed confirm word + min-char reason). 14-state activity lifecycle is the core vocabulary.

Shared infra used by all three: `useAnaChat` (`/api/ana-ri/stream`), `useChatUpload` (`/api/chat/upload`, OCR→project memory), `EsignModal` from `_shared/components`, `ProgramSubTabs` (`_shared/program`).

---

# BIOPHARMA

## Biopharma shell / App — `biopharma/App.tsx`, `biopharma/BiopharmaRoute.tsx`
- **Route / entry:** `BiopharmaRoute` (route-agnostic; host ZenApp triggers `nav=biopharma`). `App` takes `initialNav` (default `overview`). Mounts MDX base CSS then biopharma `app.css`.
- **Purpose:** The biopharma regulatory-affairs operating shell — routes the active nav to a surface, hosts the persistent AnA dock.
- **Layout & regions:** `div.shell` → left `BiopharmaRail` + `main.main` (TopBar, TabBar, `.page > .page-inner` holding the surface) + right `BiopharmaAnaDock`. `data-collapsed` / `data-ana-open` / `data-density` attributes drive layout.
- **Controls & actions:** `⌘\` toggles AnA dock; `⌘K` / palette → sends first surface suggestion to AnA. Surface switch via rail or tab.
- **States:** Medtech tenant → full-page redirect card ("Your workspace lives in MDX", kicker "Medical device and diagnostics", sets `window.location.hash='#mdx'`). Otherwise routes 11 live surfaces + Stub for `cmc/clinical/biostat/precedent` + MDX-shared stubs.
- **Data:** programs `/api/biopharma/programs` (+`?pathway=`, +`/:id`); inbound `/api/regulatory-correspondence/correspondence`; prefs/session `/api/users/me`, `PUT /api/users/me/preferences`; AnA `/api/ana-ri/stream`. Active-program pill = first live program matching the active pathway tab.
- **Gating:** `organizations.client_type` (medtech→redirect; biotech/pharma→different rail+tab sets).
- **Sub-components:** Rail, TopBar, TabBar, AnaDock, SurfaceComposer + 11 surfaces + Stub.

### Client types (`data/clientTypes.ts`)
Three configs drive IA. `medtech` (redirect `/mdx`), `biotech` (workstream: overview, ind, bla, maa, jnda, precedent; lifecycle: cmc, clinical, pharmacov, pediatric, orphan, meetings, biostat), `pharma` (workstream: overview, ind, nda, maa, jnda, lifecycle, precedent; lifecycle: cmc, clinical, pharmacov, pediatric, biostat, meetings). Each carries `greetingState` sample copy + 4 starters. Default/migration type = pharma.

### Rail — `biopharma/shell/Rail.tsx` + `data/nav.ts`
- **Regions:** logo "Concept2Cure**.RI**", collapse toggle, 5 collapsible groups, account button (avatar/name/role pill).
- **Nav groups (verbatim):** Workstream · Lifecycle · Workbench · Intelligence · System. Smart default: Workstream open, others collapsed; persists to `users.preferences.railGroups`. Active item's group always forced open. Collapsed groups show a hidden-count badge.
- **Nav items (id · label · icon · group), verbatim:** overview·Overview·grid·workstream; ind·"IND / CTA"·flask; nda·"NDA · 505(b)"·file; bla·"BLA · 351(a)"·atom; maa·"MAA · EU centralized"·globe; jnda·"JNDA · Japan"·shieldCheck; precedent·"Precedent intelligence"·scale | lifecycle·"Lifecycle management"·history; cmc·"CMC · Module 3"·beaker; clinical·"Clinical operations"·users; pharmacov·"Pharmacovigilance · PSUR"·alertCircle; pediatric·"Pediatric · PIP / PSP"·shieldCheck; orphan·"Orphan and rare"·sparkles; meetings·"Agency meetings"·messageCircle; biostat·"Biostatistics"·sigma | (Workbench) tasks·"Tasks and reviews"; ana-review·"AnA review queue"; vault·"Document vault"; validation·"Validation center"; submissions·"Submission center"; templates·"Templates" | (Intelligence) analytics·Analytics; memory·"AnA memory"; conversations·"AnA conversations" | (System) search·"Global search"; notifications·Notifications; audit·"Audit log"; onboarding·Onboarding; admin·"Admin and access".
- Rail/tab items filtered by the client-type workstream/lifecycle allow-lists.

### TopBar — `biopharma/shell/TopBar.tsx`
Breadcrumb (Concept2Cure.RI › domainLabel › hereLabel). Active-program pill (dot + code, opens palette). `⌘K` "Ask AnA" cmdk button. Density toggle (compact/comfortable/spacious, role=tablist, persists `users.preferences.density`). LanguageSwitcher + filter/bell/help icon buttons. i18n via `react-i18next` (`common` namespace).

### TabBar — `biopharma/shell/TabBar.tsx`
Horizontal tabs with live counts: Overview · "IND / CTA" · NDA · BLA · MAA · JNDA · Lifecycle · "Precedent intel". Counts = programs filtered by `program_type`. Filtered by client-type allow-list (+overview always).

### AnA dock — `biopharma/shell/AnaDock.tsx`
Two states: **32px seam** (closed; ✻ AnA button) / **400px dock** (open). Header "AnA 1.0" + scope label (the active here-label) + new-thread (confirm clears) + collapse. Empty state: "Grounded on {label}. I can draft, cite, validate, or run governed actions…". Per-surface suggestion chips (3, from `BIOPHARMA_SUGGESTIONS`). Streaming typing dots. Each AnA message shows a "**Grounded** {label} · {time}" tool line. Composer: textarea (Enter sends), paperclip upload (`useChatUpload`, scoped to projectId), "AnA 1.0" chip, send. Attachment chips show extraction label / uploading / error. **All UI says "AnA 1.0" — no model names** (standing rule).

### SurfaceComposer — `biopharma/shell/SurfaceComposer.tsx`
The conversation-first lead-in every pathway surface wraps. Anatomy: greeting block (kicker + title + stateLine + primary buttons) → composer with drag/drop file zone (drop hint "Drop to file with AnA — she'll classify and anchor it to {scope}") → up to 4 starter chips → "Today · needs attention here" queue (item count + optional "Sample data" pill; each item: icon + title + sub + right-edge action label, click dispatches `cmd` to AnA) → collapsed "Reference data" dashboard (chevron, optional Sample-data pill, "expand to scan"/"collapse"). `SurfaceQueueItem` tones: info/warn/err.

### Shared bits — `biopharma/surfaces/bits.tsx`
- **StatusPill** — dot + label. STATUS→class map (verbatim keys): approved/complete→ok, drafted/drafting/queued/"in draft"→draft, review/submitted/active/monitoring/filed/enrolling→review, closed/agreed/final→ok, open/evaluating→warn, blocked→fail, predicted→predicted.
- **ReadinessBar** — bar + pct; auto-tone ≥80 ok / ≥50 warn / else err.
- **ToneText**, **AskAnaChip** (✻ + label), **SamplePill** ("Sample data").

### Overview — `biopharma/surfaces/Overview.tsx`
- **Route:** nav `overview` (start-of-day). **Layout:** (1) greeting ("Good morning/…, {first}.") + live state-of-portfolio line (program count, blocked count, avg readiness, open inbound count; loading/empty variants); (2) composer + file drop zone (drop → AnA "Classify and file these uploaded documents…"); (3) 4 client-type starter chips; (4) "Today · your queue" (live inbound correspondence + blocked programs; SAMPLE_QUEUE w/ pill only when stores unavailable); (5) collapsed "Active programs" (sorted by readiness, code + program_type tag + indication + ReadinessBar + open arrow); (6) collapsed "Upcoming agency milestones" (derived from program pdufa_date/filing_date, top 6 by days).
- **Data:** programs (prop) + `useInboundCorrespondence`. **Notes:** state line + queue derived from **live data only**; sample fallback always pill-labeled (honesty contract).

### IND / CTA surface — `biopharma/surfaces/IndSurface.tsx` (reference implementation)
- **Route:** nav `ind`, kicker "IND / CTA · §312". State line: code · status · % ready · sections approved · inbound count. 4 starters (triage HAQs, prep Type B/C briefing book, IND amendment readiness, blockers across modules). Primary buttons: "Submit IND amendment", "Draft with AnA".
- **Today queue:** live inbound (responseRequired) + blocked IND programs; SAMPLE_QUEUE incl. "3 open HAQs", "3 predicted HAQs ready to pre-empt", stability sign-off, pediatric waiver, Type C briefing book.
- **Collapsed reference dashboard (Sample data):** (a) **Modules strip** M1–M5 cards (path, StatusPill, label, ReadinessBar, "done of sections"); (b) **FDA interactions & HAQs** list — rows tag kind ("HAQ · predicted", "Type B · Pre-IND", "Type C", "HAQ · CMC/clinical/nonclinical", "Safety report"), predicted rows show "{n}% likely", open HAQs show Pre-draft/Draft-response button, StatusPill; (c) **Cross-module contradictions** (sev warn/err icon, title, owner avatar, description, where-chips); (d) **Blockers table** — columns: Sev · Owner · Blocker · Section · Due · Action; sev rendered "Critical"/"Warn".
- **Fixture statuses (verbatim):** predicted, closed, drafting, open, submitted. **Data:** `FIXTURE_IND` + live programs + correspondence.

### Pathway surfaces (NDA · BLA · MAA · JNDA) — `biopharma/surfaces/Pathway.tsx`
One `BiopharmaPathway` template, 4 exports. Per-pathway config (kicker, scope, agency, 4 starters, sample queue, optional fixture cards):
- **NDA** ("NDA · 505(b)", FDA): fixture cards = **Pivotal studies** (id, Phase, N, primary endpoint e.g. "ORR 38.6%"/"OS hazard ratio 0.62", CSR, StatusPill final/topline) + **FDA review clock** (Filed, Day 74 filing review, Mid-cycle, Day 120 internal, PDUFA target). "Generate filing readiness pack" CTA.
- **BLA** ("BLA · 351(a) biologics", FDA): no fixture cards; queue = stability OOS, analytical similarity OOS, comparability protocol.
- **MAA** ("MAA · EU centralized procedure", EMA): queue = CHMP list of questions, PIP modification, scientific advice follow-up.
- **JNDA** ("JNDA · PMDA · Japan", PMDA): fixture cards = **PMDA review clock** (Pre-NDA consultation, Application filed, Day 85 first inquiry, Day 120 expert discussion, PMDA target) + **Consultations & bridging** (bridging studies + consultations w/ StatusPill). "Draft Pre-NDA briefing for PMDA" CTA.
- Live **{PATHWAY} programs** table always rendered (code tag, indication, sponsor, target date, ReadinessBar, StatusPill). State line from first matching program.

### Lifecycle management — `biopharma/surfaces/LifecycleSurface.tsx`
nav `lifecycle`, kicker "Post-approval · supplements · variations". Primary "New supplement". Sample queue (Type II variation in CHMP review, high-risk CMC change, Type IB drafting, PADER cycle). Reference (Sample data): **Supplements & variations** (agency tag, kind·product·subject, id·filed·due, StatusPill) covering sNDA Prior Approval / CBE-30, EU Type II/IB variation, JP Partial change; **CMC change control** (risk sev high/medium/low, title, area·programs, status evaluating/planned/implemented; "Classify against ICH Q12" CTA); **Renewal cycles** (PADER annual / EU 5-year / PMDA re-exam 8-year).

### Pediatric — `biopharma/surfaces/PediatricSurface.tsx`
nav `pediatric`, kicker "Pediatric · §505B PREA · EMA PIP". Primary "Open pediatric plan". Reference (Sample data): **Plans** (product tag; kind "EMA PIP"/"FDA iPSP"; ages; deferrals/waivers/milestones/due; StatusPill agreed/submitted/"in draft") + **Upcoming PREA milestones** ("Draft PREA waiver justification" CTA). Statuses: agreed/submitted/in draft.

### Pharmacovigilance — `biopharma/surfaces/PvSurface.tsx`
nav `pharmacov`, kicker "Pharmacovigilance · PSUR / PBRER · signals". Primary "Submit safety report". Reference (Sample data): **Active signals** (product, term, "{n} cases · PRR {x}" tone-colored ≥3 err / ≥2 warn, owner, age, StatusPill evaluating/monitoring; "Adjudicate the pneumonitis signal" CTA) + **Aggregate reports in cycle** (PSUR/PBRER cycle, due agency, drafted-by, reviewers, StatusPill drafting/queued).

### Orphan and rare — `biopharma/surfaces/OrphanSurface.tsx`
nav `orphan`, kicker "Orphan drug · rare disease". Primary "Open designation application". Reference (Sample data): **Designations** (product, agency FDA/EMA/PMDA, indication, date·prevalence·benefits, status→pill designated→approved/requested→review/planned→drafted) + **RPD vouchers and grants** + **Patient advocacy engagements**.

### Agency meetings — `biopharma/surfaces/MeetingsSurface.tsx`
nav `meetings`, kicker "FDA · EMA · PMDA · Type A/B/C/D · scientific advice". Primary "Request meeting". Reference (Sample data): **Upcoming meetings** (kind e.g. "FDA · Type C"/"EMA · SciAdv"/"PMDA · Pre-NDA", product·topic, date·briefing due·owner, briefing-pct ReadinessBar, StatusPill briefing-due→review/scheduled→drafted/else queued; "Draft Type C briefing book" CTA); **Recent meetings** (outcome aligned→approved/partial→review/else drafted, minutes); **Briefing book pipeline** (sections drafted/reviewed/finalized, computed ReadinessBar, "{n}/{n} final").

### Stub — `biopharma/surfaces/Stub.tsx`
"Coming in next phase" kicker + label + meta (kit reference path or "shares implementation with {sharedWith}") + "Ask AnA about {label}". Used for cmc/clinical/biostat/precedent + MDX-shared surfaces (tasks/ana-review/vault/validation/submissions/templates/analytics/memory/conversations/search/notifications/audit/admin → render in MDX chassis).

### Data modules
- `data/programs.ts` — `BiopharmaProgram` (id, code, name, program_type, status, sponsor_name, lead_indication, target_agencies[], filing_date, pdufa_date, completion_percentage, updated_at, section_counts{todo,drafted,review,approved,locked,total}). Hooks `useBiopharmaPrograms(pathway?)`, `useBiopharmaProgram(id)`.
- `data/correspondence.ts` — `useInboundCorrespondence()` → InboundCorrespondence[] | null (null=loading/error → sample fallback). Filters direction=inbound & status≠closed.
- `data/preferences.ts` — `useUserPreferences()`; density/railGroups/dockOpen persisted server (`PUT /api/users/me/preferences`) + localStorage mirror; clientType + first name from `/api/users/me`.
- `data/fixtures.ts` — **all SAMPLE DATA** (FIXTURE_IND/NDA/PEDIATRIC/PV/JNDA/LIFECYCLE/ORPHAN/MEETINGS). `data/nav.ts` — nav, HERE_LABEL map, BIOPHARMA_SUGGESTIONS (per-surface, 3 each).

---

# CMC / MODULE 3

## CMC shell / App — `cmc/App.tsx`, `cmc/CmcRoute.tsx`
- **Route / entry:** `CmcRoute` (host triggers `nav=cmc`, passes activeProjectId). Props `activeProjectId`, `initialNav` (default overview). Mounts MDX base CSS then cmc `app.css`.
- **Purpose:** CMC (Module 3) authoring OS — 9 live surfaces scoped to a selected project.
- **Layout:** `div.shell` → CmcRail + main (CmcTopBar, CmcTabBar, page) + AnA (32px seam when closed; **inline 300px panel** when open — simpler than biopharma dock). `⌘\` toggles AnA.
- **Project context:** selected project id from `useProjects` (canonical id space the `/api/cmc/*/:projectId` routes filter on), defaults to first project, persisted `localStorage 'cmc.projectId'`. Portfolio overview (`usePortfolioOverview`, product_id space) feeds Overview only.
- **AnA:** `useAnaChat` w/ CMC module context; inline panel renders suggestion starters when empty, then transcript; `⌘/Ctrl+Enter` sends. USER stub `{name:'You', initials:'JC', role:'Enterprise · CMC'}`.

### Rail — `cmc/shell/Rail.tsx` + `data/nav.ts`
Single flat "CMC · Module 3" group. **9 surfaces (id · label · icon):** overview·"Module 3 overview"·beaker; specs·Specifications·list; stability·"Stability program"·thermometer; batch·"Batch records"·box; change·"Change simulator"·shuffle; blueprint·"Blueprint generator"·layout; global·"Global compliance"·globe; pathway·"Program records"·list; copilot·"CMC copilot"·sparkles. Logo + collapse + account ("JC / Enterprise · CMC").

### TopBar — `cmc/shell/TopBar.tsx`
Breadcrumb (Concept2Cure.RI › "CMC · Module 3" › hereLabel). `⌘K` Ask AnA. Density toggle (role=tablist, persists `cmc.density`). **Project `<select>`** (the project-scoping control; "No projects"/"Select a project" placeholders). LanguageSwitcher + bell/help.

### TabBar — `cmc/shell/TabBar.tsx`
role=tablist, the same 9 CMC_NAV surfaces as tabs (aria-selected).

### Shared state primitives — `cmc/surfaces/state.tsx`
`Loading` (role=status), `ErrorState` (role=alert), `Empty`, `NoProject` ("Select a project to load Module 3 data."), **StatusChip** (tone ok/warn/err/dim → icon checkCircle/warning/xCircle/alertCircle + label; **never color-only**). Result renderers `ProseResult`/`DataTable`/`KeyValues`/`ResultView` (heterogeneous API results → prose/table/kv, never raw JSON).

### Overview — `cmc/surfaces/Overview.tsx`
- **Route:** nav `overview`, kicker "CMC · Module 3 operating system". 3 starter chips + "Ask AnA". **KPI row:** Submissions / RPI average / IR overdue / Module 3 gaps. **Portfolio table** (columns: Submission · Product · Region · Type · RPI · IR overdue) from `usePortfolioOverview`. **Module 3 build state** (readiness bar + pct + "Export ready"/"Not export ready" StatusChip; "{approved} of {total} sections approved · {n} stale · {n} open critical contradictions"). **Section approvals** (governed) — table Section · Path · State · Action; unapproved rows get "Approve section" → **EsignModal** (meaning=approval, reason required, Part 11; on sign re-fetch sections + readiness).
- **Data:** `usePortfolioOverview` (`/api/cmc/blueprint/portfolio/overview`), `useModule3Readiness` (`/api/cmc/module3-os/readiness/:projectId`), `useModule3Sections` (`/api/cmc/module3-os/sections/:projectId`), `useApproveModule3Section` (`.../:sectionKey/approve`).

### Specifications — `cmc/surfaces/Specifications.tsx`
- **Table columns:** Attribute · Material · Method · Release · Shelf life · ICH · Status · Action. Per-row **Edit** + (if not approved) **Approve specification** (governed e-sign w/ re-auth password+totp).
- **New/Edit dialog (CmcDialog):** fields Material name* · Material type* · Analytical method · Acceptance criteria · Test parameters · ICH reference · Status (draft/review/superseded — **approved/effective excluded; approval is e-sign-only**) · Justification. Writes server columns material_name/type, test_methods, acceptance_criteria, test_parameters, regulatory_basis, justification, approval_status.
- **Status tone:** approved/effective→ok, review→warn, reject/fail→err, else dim.
- **Endpoints:** GET `/api/cmc/specifications/:projectId`, POST `/api/cmc/specifications`, PUT `/:id`, POST `/:id/approve`.

### Stability program — `cmc/surfaces/Stability.tsx`
- **Table:** Study · Type · Condition · Status · Results(count) · Action. "New protocol" + per-row "Add result". "Ask AnA" → "Project shelf life… ICH Q1E fit".
- **New protocol dialog:** Study name* · Study type (Long-term/Accelerated/Stress/Intermediate) · Status (planned/in-progress/completed) · Storage condition · Duration · Time points · Container closure ("ICH Q1A study definition").
- **Add result dialog:** Time point* · Parameter* · Value* (appended to study `results` JSON via PUT).
- **Endpoints:** GET `/api/cmc/stability/:projectId`, POST `/api/cmc/stability`, PUT `/:id`.

### Batch records — `cmc/surfaces/Batch.tsx`
- **Table:** Batch · Stage · Manufacture date · Deviations · Status · Action. Releasable rows get **Release batch** (governed **EsignModal**, meaning=release, re-auth password+totp; on sign invalidates project batches). Non-releasable → "Disposition set".
- **New batch dialog:** Batch number* · Product name* · Batch size · Manufacturing site · Manufacturing date · Expiry date · Status (in-progress/pending-release/released/rejected).
- **Status tone:** released/completed→ok, investigation/pending/conditional→warn, reject→err.
- **Endpoints:** GET `/api/cmc/batch-records/:projectId`, POST `/api/cmc/batch-records`, POST `/:id/release`.

### Change simulator — `cmc/surfaces/Change.tsx`
- Form: **Change type** (11: API supplier change, Process scale-up, Excipient replacement, Analytical method change, Facility change, Equipment change, Process parameter change, Specification change, Packaging change, Stability protocol change, Other) · Describe the change* · Current state · Proposed state · **Markets** checkboxes (FDA, EMA, PMDA, NMPA, Health Canada, UK MHRA). "Simulate change" → **Impact analysis** card (ResultView). Subtitle references SUPAC + ICH Q12. POST `/api/cmc/change-impact-simulator/simulate`.

### Blueprint generator — `cmc/surfaces/Blueprint.tsx`
- **Sections to compose** checkboxes (§3.2.S.2.2 Description of manufacturing process, §3.2.S.4.1 Specification DS, §3.2.S.7.1 Stability summary DS, §3.2.P.5.1 Specification DP, §3.2.P.8.1 Stability summary & conclusion) → "Generate blueprint" → ResultView. **Quality by design** card: CQAs + CPPs DataTables. Endpoints: GET `/api/cmc/quality/qbd/:projectId`, POST blueprint generate.

### Global compliance — `cmc/surfaces/Global.tsx`
- Form: Document type · Base region (ich/fda/ema/pmda/other) · Content to transform* · **Target markets** checkboxes (FDA/EMA/PMDA/NMPA/Health Canada/UK MHRA) → **Per-market transformation** (per-region sections, content + note). POST `/api/cmc/global-compliance/transform`.

### Program records — `_shared/program/ProgramSubTabs.tsx` (mounted at nav `pathway`)
- 3-tab WAI-ARIA panel (roving tabindex, arrow nav): **Audit** (`/api/mdx/audit`), **Correspondence** (`/api/regulatory-correspondence/correspondence?projectId=`), **Approvals** (`/api/approval-workflows/pending`). Correspondence issue review + approve/reject workflows route through **EsignModal**. StatusChip never color-only. Shared across new shells carrying a project context.

### CMC copilot — `cmc/surfaces/Copilot.tsx`
- Chat surface: empty state shows 3 starter chips (CMC_SUGGESTIONS.copilot), then transcript (you/ana bubbles), "Thinking…". POST `/api/cmc/cmc-copilot/query` per turn. Enter sends.

### CmcDialog — `cmc/surfaces/CmcDialog.tsx`
Accessible modal shell (role=dialog aria-modal, focus trap, Esc closes unless busy, focus return). Used by spec/stability/batch authoring forms. Mirrors EsignModal a11y contract.

### Data — `cmc/data/nav.ts`
CMC_NAV (9), HERE_LABEL_CMC, CMC_SUGGESTIONS (3 per surface). Endpoints documented in `services/cmcService.ts` (baseUrl `/api/cmc`).

---

# PDEV → IND READINESS

## PDEV shell / App — `pdev/App.tsx`, `pdev/PdevRoute.tsx`
- **Route / entry:** `PdevRoute` behind feature flag `ENABLE_PDEV_SURFACE`. Props `initialNav`, `initialProgramId`, optional `onAskAna` (host can own AnA). Mounts `app.css`.
- **Purpose:** Pre-IND program-development tracker — workstream readiness, activity lifecycle, IND assembly, FDA interactions, contradictions, all governed.
- **Layout:** `div.pdev-shell` (`data-collapsed`/`data-ana-open`) → PdevRail + `main.pdev-main` (PdevTopBar, `.pdev-page > .pdev-page-inner` surface) + PdevAnaDock. Overlay sheets: ActivityDetail, AiDraftWorkbench, EvidencePicker, plus snapshot confirm.
- **Program selection:** IND programs from `/api/regulatory-programs` (filter programType=IND, status≠archived); defaults to first; backing numeric projectId resolved from `metadata.projectId`.
- **Here-labels:** overview "Program dashboard", cmc/nonclinical/clinical/regulatory "{X} workstream", ind_assembly "IND assembly readiness", contradictions "Contradictions registry", fda_interactions "FDA interactions".
- **Endpoints (documented in App header):** `/api/pdev/programs/:id` (+`/readiness`, `/workstreams/:ws`, `/activities/:key/{evidence,workflow,provenance}`, `/ind-assembly`, `/fda-interactions`, `/fda-feedback/proposals`, `/contradictions`); POST `.../activities/:key/state`, `.../evidence`, DELETE `.../evidence/:evId`, POST `.../ai-draft`, `.../ind-assembly/compile`, `.../fda-feedback/apply`, `/workflow-runs/:runId/checkpoints/:cpId/decision`; `/api/evidence-objects` (picker search).
- **States:** program error card, "No IND programs yet" empty, loading.

### Closed enums — `pdev/data/enums.ts` (the core status vocabularies)
- **Workstreams:** cmc, nonclinical, clinical, regulatory (labels CMC/Nonclinical/Clinical/Regulatory).
- **Stages (5):** early_pdev "Early PDEV", late_pdev "Late PDEV", pre_ind_meeting "Pre-IND meeting", ind_package "IND package", post_ind "Post-IND".
- **Activity states (14) + labels (verbatim):** not_started "Not started", drafting "Drafting", ai_draft_generated "AI draft ready", evidence_linked "Evidence linked", human_review_required "Review required", in_review "In review", changes_requested "Changes requested", approved "Approved", locked "Locked", submission_ready "Submission ready", submitted "Submitted", agency_feedback_received "Agency feedback", revision_required "Revision required", superseded "Superseded". Completed set = approved/locked/submission_ready/submitted; blocked = revision_required.
- **State pill tones:** done / blocked / ai / warn-strong (changes_requested) / warn (review states) / flight (drafting) / neutral (superseded) / idle.
- **PDEV_SUGGESTIONS** per surface (3 each).

### Rail — `pdev/shell/Rail.tsx` + `data/nav.ts`
- Logo + collapse. Breadcrumb back-button "Domain: PDEV". **Active program `<select>`** (code · productName). Groups: **Workstream** (Overview·grid, CMC·beaker, Nonclinical·microscope, Clinical·stethoscope, Regulatory·shieldCheck) and **Workspace** (IND assembly·rocket, Contradictions·alertCircle, FDA interactions·chat). `comingSoon` items render disabled with "soon" chip. Account stub.

### TopBar — `pdev/shell/TopBar.tsx`
Breadcrumb (Concept2Cure.RI › PDEV › {program.code} › hereLabel). Active-program pill. `⌘K` "Ask AnA, jump to…" (placeholder → AnA). Filter/bell/help.

### AnA dock — `pdev/shell/AnaDock.tsx`
Seam (closed) / panel (open). Header "AnA 1.0 RI" + **model line "Claude Opus 4.5"** (note: this dock shows a model name, unlike biopharma/cmc). Context block: program code · productName, "Readiness {n}% · target IND {date}", pinned active-activity chip, top-blocker chip. Suggestion chips (3) when no transcript; else transcript (you/ana, streaming caret). Footer: upload chips, paperclip (`useChatUpload`), textarea (`⌘/Ctrl+Enter` sends), send; foot meta "Routes via AnA gateway · Opus 4.5" / "Streaming · response will appear in Conversations".

### Overview (Program dashboard) — `pdev/surfaces/Overview.tsx`
- Header: eyebrow "Domain · PDEV", "{code} · {productName}", sub (primaryAgency · target IND · phase). Actions: "Ask AnA", **"Snapshot readiness"** (governed → confirm dialog, confirmWord "yes", min 10).
- **Readiness card:** big % + "Overall readiness" + top blocker + "Threshold {n}% · last snapshot {date}" + fill bar.
- **Workstream rollup strip:** 4 cards (CMC/Nonclinical/Clinical/Regulatory) each with readiness %, complete mini-bar (done/total), blocked mini-bar, "View workstream" → drill.

### Workstream drill — `pdev/surfaces/Workstream.tsx`
- Header "{Workstream} workstream", "{n} activities across 5 stages". **Grid/List view toggle** (default grid ≤12 activities else list; persists `localStorage pdev.viewMode`). **Stage strip** (5 nodes, state idle/active/done/blocked, done/count). **Filter chips** (All + drafting/in_review/revision_required/approved with counts).
- **Grid card:** key (mono) + state pill + title + "{n} doc · {n} evidence" + due chip (overdue/soon/idle) + deps chip. **List:** Activity · State · Stage · Due · Docs. Click → ActivityDetail sheet.

### Activity detail sheet — `pdev/surfaces/ActivityDetail.tsx` (6 tabs)
Right-side `role=dialog` sheet. Header: key + title + state pill + workstream + stage. **Tabs: State · Documents · Evidence · Workflow · Provenance · Audit.**
- **State:** current state, description, due, dependencies list, **Change state grid** (all 14 states as chips → governed confirm "Change activity state", target "{key} · {from} → {to}"; hint about dependency refusal + audit-flagged force override).
- **Documents:** required docs (code, "mandatory · IND" chip, eCTD module/section or "working doc", title) + "Generate draft" → AiDraftWorkbench.
- **Evidence:** link rows (linkType pill supports/contradicts/references/supersedes, title, type·category·source·strength, **Detach** governed) + "Attach evidence" → picker.
- **Workflow:** approval chain — run id + "→ {targetState}" + status; checkpoints (step num, name, required roles, approvals, **Approve/Reject** governed at awaiting_review); or "No approval chain" + "Kick off approval" (→approved, governed).
- **Provenance:** counts (artifacts/evidence/lineage edges/audit events), artifact rows (id, title, version, ctdSection, contentHash), lineage rows (linkageType, sourceTitle, transformationType, confidence %, aiModel) + "Export PDF" (→AnA).
- **Audit:** event rows (id, timestamp, actor, action, detail).
- Every mutation → PdevConfirmDialog.

### IND assembly readiness — `pdev/surfaces/Assembly.tsx`
- Header "IND assembly readiness" + "Diagnose gaps" (→AnA). **5-module grid (m1–m5):** label, readiness % + bar (tone ≥80 ok/≥50 warn/else err), mandatory present/total, all-docs present/total, top-3 blockers (+N more). **Compile card** ("Most consequential action · audit-flagged"): readiness vs threshold; **"Compile IND assembly"** (disabled below threshold or no project) + **"Force compile…"** below threshold → confirm with **min 30-char reason + confirmWord "yes-transmit"**. Warns when no backing project.

### FDA interactions — `pdev/surfaces/FdaStream.tsx`
- Header "{n} touchpoints · {n} commitments awaiting rollup" + "Blockers only" (→AnA). **Timeline** rows: kind chip (6 kinds: q_submission, q_sub_commitment, q_sub_meeting, q_sub_question, q_sub_timeline, fda_communication), date, title (+ "blocker" chip), summary, status chip (pending-rollup/responded/closed/open). **Roll up FDA feedback into PDEV activities:** proposal rows (id, blocker chip, title → proposedKey + confidence %, **Apply** governed confirm "Apply rollup").

### Contradictions registry — `pdev/surfaces/Contradictions.tsx`
- 2-pane (list | detail). Header "{n} cross-artifact inconsistencies · {n} block promotion" + "Triage". **List rows:** severity dot (critical/high/medium/low), id, **authority-state pill** (advisory_only / requires_review / requires_approval / blocks_promotion / requires_escalation), object A vs object B, type · reviewState · date. **Detail:** severity + id + authority pill, Object A vs B, description, Type/Review state (unresolved/under_review/reviewed/approved_resolution/superseded)/Regulatory body, "Open object A/B" (→AnA).

### AI drafting workbench — `pdev/surfaces/AiDraftWorkbench.tsx`
- 2-pane wide sheet. **Left:** Context (key + eCTD section), Target document, Optional prompt, "Generate draft". **Right:** streaming preview — **quality grade pill (A/B/C)** "Quality gate: {grade}", "{n} citations · {model}", title, per-section (§num, label, preview). Requires backing projectId (else App shows "Project linkage required" sheet). POST `.../ai-draft`.

### Evidence picker — `pdev/surfaces/EvidencePicker.tsx`
- Sheet: debounced search (`/api/evidence-objects?programId=&q=`; 404 → empty-state "upload one in the evidence library first"). Result rows select; then **Link type** seg (supports/contradicts/references/supersedes), **Strength** seg (strong/moderate/weak), **Rationale** textarea → "Attach" → governed confirm.

### PdevConfirmDialog — `pdev/components/ConfirmDialog.tsx` (universal governed-mutation modal)
role=dialog aria-modal. Eyebrow "Governed action · audit-logged", action title, target, optional resource. **Reason field** with live char count "{n} / {min} min" (default min 10; compile uses 30). **Typed confirm word** (default "yes"; compile "yes-transmit"). Submit button "Confirm and log" / "Logging audit…". Server writes SHA-256 audit-chain entry with reason verbatim. submitError shown inline without closing.

---

### Cross-cutting design-relevant findings
- **Honesty contract:** biopharma reference dashboards are fixture-backed and **always pill-labeled "Sample data"**; live ?? fixture fallback throughout; Overview/queues derive from live data only. CMC and PDEV are fully live (no fixtures — CLAUDE.md "seed fixtures must not land in v2").
- **Governed-action / Part 11 touchpoints:** CMC spec approval, batch release, Module-3 section approval → **EsignModal** (meaning + reason + re-auth password/totp). PDEV every mutation (state change, evidence attach/detach, workflow approve/reject/kickoff, FDA rollup apply, IND compile, snapshot) → **PdevConfirmDialog** (typed confirm word + min-char reason, server audit chain). ProgramSubTabs correspondence/approvals also e-sign.
- **Accessibility already present:** StatusChip/state pills pair icon+text (never color-only); CmcDialog + PdevConfirmDialog focus-trap/Esc/focus-return; ProgramSubTabs full WAI-ARIA tabs with arrow nav; role=status/alert for loading/errors; aria-live upload status.
- **AnA naming inconsistency (design flag):** biopharma + cmc say "AnA 1.0" with **no model name** (standing rule); PDEV AnA dock shows "Claude Opus 4.5" / "Opus 4.5" — a contradiction to reconcile.
- **Density** (compact/comfortable/spacious) is a topbar control in biopharma + cmc (not pdev).

### Open questions / gaps
- Biopharma stub surfaces (CMC·Module 3, Clinical operations, Biostatistics, Precedent intelligence) and all Workbench/Intelligence/System items render as Stub or defer to MDX — their real screens are out of this scope (MDX) or unbuilt.
- Moat-phase endpoints for biopharma predicted-HAQs, pediatric/PV/orphan/meetings/lifecycle stores are not yet wired — only fixture shapes exist.
- `data/correspondence.ts` (biopharma) and `usePdevData.ts`/`cmcService.ts` exact response schemas beyond what surfaces consume were read only where surfaces bind; deeper service-layer field maps not fully enumerated here.
- CMC `change`/`global`/`blueprint`/`copilot` render AI/service results via generic ResultView — exact result schema is server-defined and not fixed in the client.

---

# Part 6 — Submission Assembly · Document Authoring · Labeling

## Area overview

Three sibling workstream "domain shells" plus a cluster of shared authoring components and the platform e-signature modal. **~46 files read** across:

- `submission/` (16 files) — the **agency-transmission gateway**: a Rail + TopBar + TabBar + 3 surfaces (Submission center, Transmittals, Pre-flight) over FDA ESG / EMA CESP / EUDAMED / PMDA Gateway, with an inline AnA dock. Plus an `_install/` registry of 7 future "workspace slots" (Planner, Builder, Sequences, Validation, Shadow review, Cross-region, Dispatch) currently rendered as a "Temporary" placeholder, and a typed Submission Center API client + hooks.
- `authoring/` (10 files) — **Universal Authoring**: one document model, two modes (Conversation / Workbench) over `(doc_type × agency)` rule packs. Outline tree, AnA chat, an artifact/document renderer with inline provenance + compliance gates, a section workbench table, a selection toolbar, and a governed "send for review" reason-for-change flow against live `/api/c2c/documents/*`.
- `labeling/` (14 files) — **Labeling workstream**: Rail + TopBar + TabBar + 4 surfaces (Labeling overview, Documents, Translation coverage, ISO 15223-1 symbols) with create/edit dialogs and a governed-lite symbol-remove confirm.
- `components/claude-ectd-coauthor/` — a self-contained **eCTD co-authoring workbench** (TopBar + Tree + Intelligence chat + Artifact) usable standalone with fixtures or wired to live AnA chat + readiness.
- `components/intelligentDocs/` — **Smart Claim Highlighter** (TipTap mark + indicators) and **Source Suggestion Panel** (Phase 5 intelligent-doc system, Tailwind-styled).
- `components/editor/` — `gaReadinessModel.ts` (GA-readiness checklist/capability/remediation model) + a TipTap `IndentExtension`.
- `_shared/components/EsignModal.tsx` + `hooks/useEsignature.ts` — the platform **21 CFR Part 11 e-signature modal**.

The three shells share a common chrome idiom: a left **Rail** (logo "Concept2Cure**.RI**", collapsible, workstream nav, account button), a **TopBar** (breadcrumb, ⌘K "Ask AnA, jump to…" command button, density toggle Compact/Comfortable/Spacious, context selectors), a **TabBar**, the page surface, and an **AnA dock** on the right that toggles with **⌘\** between a collapsed `.ana-seam` "✻ AnA" button and an open chat panel backed by a real `useAnaChat` stream. Density/AnA-open/context selections persist to `localStorage`.

---

## SUBMISSION GATEWAY

### Submission shell — `submission/App.tsx` (+ `SubmissionRoute.tsx`)
- **Route / entry:** mounted by ZenApp on `nav=submission-gateway`; `SubmissionRoute` imports `mdx/app.css` then `submission/app.css`. Props: `activeProjectId?` (accepted for parity, **not** used as a filter — gateway is org-scoped), `initialNav='overview'`.
- **Purpose:** Operate the agency-transmission layer — transmittals, ACK chains, pre-flight findings — distinct from the package/section/readiness `submissions` layoutMode.
- **Layout & regions:** `.shell` grid = Rail (left) · `main` (TopBar + TabBar + `.page`) · AnA aside (right). `data-collapsed`, `data-ana-open` on shell; `.page` carries `data-screen-label="Submission gateway · <here>"` and `data-density`.
- **Controls & actions:** Rail nav (3 items), Rail collapse, account button; TopBar ⌘K palette (opens AnA with the surface's first suggestion), **Environment** toggle (Production / Staging), **Density** toggle, **Region filter** select (All regions / United States / European Union / Japan), Notifications + Help buttons; AnA dock with 3 starter prompts, message log, textarea (⌘/Ctrl+Enter sends), Send.
- **States:** AnA collapsed-seam vs open-panel; AnA empty shows 3 suggestion starters; streaming shows `statusPhase || 'Routing…'`, placeholder "AnA is thinking…", inputs disabled while streaming.
- **Data:** `useAnaChat({ screenName, moduleContext:{ workstream:'submission-gateway', activeNav, environment, region } })` → `/api/ana-ri/stream`. Persists `submission.anaOpen/density/environment/region`.
- **Notes for design:** Environment toggle distinguishes the live agency endpoint (Production = "Production agency endpoint", Staging = "Pre-production endpoint") — a regulated-action-relevant control.

### Submission Rail — `submission/shell/Rail.tsx`
- Single flat group "Submission gateway"; nav items from `SUBMISSION_NAV`: **Submission center** (send icon), **Transmittals** (globe), **Pre-flight** (shield). Logo "Concept2Cure.RI"; account row shows initials "JC", name "You", role "Enterprise · Reg affairs". `aria-current` on active.

### Submission TopBar — `submission/shell/TopBar.tsx`
- Breadcrumb: `Concept2Cure.RI › Submission gateway › <hereLabel>`. Environment tablist (Production/Staging, with titles), Density tablist (Compact/Comfortable/Spacious), Region `<select>` (all/fda/ema/pmda), bell + help.

### Submission TabBar — `submission/shell/TabBar.tsx`
- `role=tablist` over the same 3 `SUBMISSION_NAV` items.

### Submission center (Overview) — `submission/surfaces/Overview.tsx`
- **Route / entry:** `activeNav='overview'`, default surface.
- **Purpose:** AnA-first triage of in-flight + rejected transmittals with summary tiles and a gateway-connections reference.
- **Layout & regions:** page head (kicker "Submission gateway · agency transmittals", title "Submission center", meta "{n} in flight · {n} rejected · {connected} of {total} gateways configured", primary action **Triage with AnA**) → AnA composer (`.sub-composer`, placeholder "Ask AnA about a transmittal, a validation finding, or a gateway…") → 3 starter buttons → **summary tiles** (Transmittals / In flight / Rejected / Gateways configured) → **Transmittals card** (table) → collapsible **Gateway connections** panel.
- **Controls & actions:** composer submit; starters → AnA; tile (display only); transmittal rows → AnA round-trip with full receipt prompt; collapse toggle "Gateway connections" (`aria-expanded`).
- **States:** table Loading "Loading transmittals…" / Error "Could not load transmittals." / Empty "No transmittals yet. Transmit a package to send it to an agency." / populated (shows attention queue = rejected then in-flight, else first 8). Gateway panel Loading/Error/Empty "No gateways available." Each gateway row: connectivity dot, `gatewayLabel · regionLabel`, `transport.toUpperCase() · environment`, pill **Configured** (checkCircle) / **Not configured** (alertCircle).
- **Data:** `useTransmittals(filter)` + `useGateways(environment)` from `hooks/useSubmission`. Filter = `{}` or `{region}`.

### Transmittals — `submission/surfaces/Transmittals.tsx`
- **Purpose:** Full in-flight + recent transmission table with ACK chains and status pills.
- **Layout:** page head (kicker, title "Transmittals to the agencies", meta "{total} total · {inFlight} in flight · {REGION} only?") → card "All transmittals" → table.
- **Table columns (verbatim):** Program · Type · Gateway · Submission id · ACK · Status · Submitted. Each row is a button → AnA prompt "Open transmittal … and show the full receipt detail and next step". Program shows first 8 chars of programId; Submission id is `transmissionId` (mono) or "—".
- **`TransmittalTable`** is shared with Overview.
- **Data:** `GET /api/mdx/gateways/transmittals` (org-scoped, optional region).

### Pre-flight (Validation) — `submission/surfaces/Validation.tsx`
- **Purpose:** Pick a transmittal, view + resolve its validation findings (errors/warnings/oks) with rule + section refs.
- **Layout:** page head (kicker "Submission gateway · pre-flight", title "Pre-flight validation", meta "{open} open to clear · {total} total findings" or "{n} transmittals to inspect") → 2-pane `.sub-preflight`: left **Transmittals** picker (`role=listbox`/`option`, each shows `gatewayLabel · submissionType` + `transmissionId`/`#id`); right **Findings** list.
- **Findings rows:** FindingIcon + severity word (Error/Warning/Info) + message; rule/file ref line (`ruleTitle/ruleId · filePath`); resolved rows show "Resolved · {note}" and a **Resolved** pill; open non-ok rows get a **Resolve** button (disabled while pending); ok rows show **Pass** pill. Card foot: **Clear findings with AnA** (only when open>0).
- **States:** list Loading/Error/Empty "No transmittals to validate yet."; detail Empty "Select a transmittal…" / "No findings recorded for this transmittal."
- **Data:** `useTransmittals`, `useTransmittal(id)` (embeds findings), `useResolveFinding` → `PATCH /api/mdx/gateways/findings/:id/resolve`.

### Submission shared state — `submission/surfaces/state.tsx`
- `Loading` (`role=status`), `ErrorState` (`role=alert`), `Empty`, `StatusPill`, `AckChain`, `FindingIcon`, `severityLabel`, `formatBytes`, `formatTime`.
- **Status vocabulary** (`data/nav.ts` `STATUS_LABEL`): Pending · In transit · Received · Rejected · ACK1 received · ACK2 received · ACK3 received · Validation passed · Validation failed · In agency review · Response required · Completed. Tones: ok (completed/ack3/validation_passed/review_started), err (rejected/validation_failed), dim (pending), warn (rest). `isInFlight`/`isRejected` helpers.
- **ACK chain:** three cells `1/2/3`, glyphs ✓ (received) / ✗ (failed) / – (na) / · (pending); `aria-label "ACK 1: received"` etc. Failed status renders a1=received, a2=failed, a3=na by convention.
- **Finding severity:** error→err, warning→warn, else ok. WCAG: every status/ACK/finding pairs tone + text + icon, never color alone.
- **Region/gateway labels:** REGION_LABEL {fda:United States, ema:European Union, pmda:Japan}; GATEWAY_LABEL {esg:FDA ESG, cesp:EMA CESP, eudamed:EUDAMED, pmda_gateway:PMDA Gateway}.

### Submission Center `_install` registry & client (future workspaces)
- **`_install/workspaces.tsx`** — `SUBMISSION_WORKSPACE_SLOTS`: 7 slots each `{id,label,routePattern,status:'temporary'|'ready',dataHooks[],element}`. Labels + routes: **Planner** `/submissions/:id/plan`, **Builder** `/submissions/:id/builder`, **Sequences** `/submissions/:id/sequences`, **Validation** `/submissions/:id/validation`, **Shadow review** `/submissions/:id/shadow-review`, **Cross-region** `/submissions/:id/cross-region`, **Dispatch** `/submissions/:id/dispatch`. All currently render `Temporary`.
- **`_install/Temporary.tsx`** — centered card: Hammer icon, eyebrow "Temporary", workspace title, body "This workspace is wired to live data and waiting on its design-system UI kit…", optional note. Each slot's note names the live backend (e.g. Dispatch: "The QC gate is live; transmit stays behind the e-signature gate.").
- **`_install/submissionClient.ts`** — typed wrapper over the full Submission Center API: `/api/submissions` CRUD, sequences (`/sequences`, `/transition`), builder leaves (`/leaves`), planner (`/plan`), validation explain (`/validation/explain`), cross-region (`/cross-region`), dispatch QC (`/dispatch-qc`, does **not** transmit), provenance/consistency (Truth Engine), shadow review, region profiles. Plus **`generateSectionStream`** — SSE authoring stream at `POST /api/submissions/:id/sections/generate` (events: chunk/done/error). Errors normalized to `SubmissionApiError{code,message}`.
- **`_install/hooks.ts`** — React Query hooks (`useSubmissions`, `useSequences`, `useLeaves`, `useConsistencyFindings`, `useProvenance`, `useShadowReviews`, `useShadowFindings`, `useRegionProfiles`) + mutations (create submission/sequence, transition, upsert leaf, plan, explain validation, cross-region, dispatch QC, run consistency, run shadow review) with `submissionKeys`.
- **Note for design:** This registry implies a future second submission surface set (eCTD assembly Builder, sequence lifecycle, dispatch QC behind e-sign) not yet built.

---

## UNIVERSAL AUTHORING

### Authoring shell — `authoring/App.tsx` (+ `AuthoringRoute.tsx`)
- **Route / entry:** ZenApp `nav=artifacts`; `AuthoringRoute` imports `authoring/app.css`. Prop `initialDocType?`.
- **Purpose:** One canonical document, two modes over `(doc_type × agency)` rule packs; live `?? fixture` data pattern.
- **Layout & regions:** `.au-shell` with `data-mode` (conversation|workbench), `data-focus`, `data-tree` (collapsed). Regions: **TopBar** (full width), **OutlineTree** (left), optional **live-docs strip** ("Your documents"), **`.au-primary`** main:
  - Conversation mode: **Chat** (left) + **Artifact** (right).
  - Workbench mode: **WorkbenchTable** + a section card + **Inspector** (right).
- **Controls & actions (App-level):** load a live document chip (sets docType/agency/liveDocId, appends "Loaded"/"Readiness" tool rows); manual docType/agency change drops back to fixtures; **Send for review** (Workbench card) opens the reason-for-change modal; selection-toolbar actions (strengthen/tighten/regenerate/cite/precedent/comment/flag) drive the chat + streaming rewrite engine; **TweaksPanel** (Mode, Document type, Agency, Evidence Off/Footnote/Margin, Focus On/Off).
- **States:** streaming rewrite typed-out animation (`streamingId`/`streamText`); pending chat shows typing dots; live-docs strip hidden when none; section body live ?? `bodyCache` fixture ?? null (empty state).
- **Reason-for-change modal** (`.au-reason-scrim`, `role=dialog aria-modal`): heading "Send §{path} for review", body "Records a 21 CFR Part 11 reason for change against this section. The system writes a version snapshot and an audit-ledger entry.", textarea ("Reason for change (10+ characters)"), **Cancel** / **Send for review** (disabled until ≥10 chars or while saving). On success appends tool rows "Sent for review" + "Audit: Part-11 version snapshot + ledger entry written".
- **Data:** `useC2cDocuments`, `useC2cDocumentOutline`, `useC2cDocumentSection`, `useSaveC2cSection` (`PATCH /api/c2c/documents/:id/sections/:key`, Bearer + `x-organization-id`, body `{reason, content?, status?}`). Live outline overlays rule-pack fixtures.
- **Notes for design:** "Send for review" is the **governed mutation / Part-11 touchpoint** here — reason capture + version snapshot + `c2c_ana_actions` ledger. Streaming rewrites and demo AnA turns are **mock/fixture** (honesty-contract: live data when a real doc is loaded, otherwise kit demo content).

### Authoring TopBar — `authoring/shell/TopBar.tsx`
- Logo, outline toggle, breadcrumb `program.code / program.title / <docLabel>`. **DocTypePicker** popover (lists all `AUTH_DOC_TYPES` with family sublabels), **AgencyPicker** popover (label · region · esubmit channel). **View toggle** Conversation / Workbench. **Evidence density** toggle Off / Cite / Margin (titled "Inline footnote chips" / "Margin evidence rail (audit prep)"). **Save status** pill: "Drafting…" when streaming else "Autosaved · {version} · {lastSaved}". **History** button → `HistoryPopover` ("Version history · this section": rows v0.4/v0.3/v0.2/v0.1 with who/when/note, Current vs "Compare · Restore"). Share, Export, Focus toggle, **Submit for review** (primary).

### Outline tree — `authoring/shell/OutlineTree.tsx`
- Head "Outline" / "Rule pack", search ("Find section"), recursive groups/leaves. **StatusDot** classes: approved→ok, review→review, drafted→draft, locked→locked, fail→fail, else todo. Group meta shows `ready/total`. **ReadinessFoot**: "Submission readiness", state word, `{pct}%`, `{ready}/{total} sections`, progress bar, Version. (ready = approved + locked.)

### Conversation (Chat + Composer + Skills + SelectionToolbar) — `authoring/conversation/Conversation.tsx`
- **Chat:** head (title "Intelligence"/"Ask AnA" + hint "AnA 1.0 RI · c2c-Opus 4.7"), scrolling thread (user bubbles with optional `pre` pill; AI messages render block kinds: `p`, `tool` (check + label + value), `stream` (spinner + "Streaming {target} {hint}"), `chip` (artifact card)), typing dots when pending, SkillsRow (first 6 AUTH_SKILLS), Composer.
- **Composer:** autosizing textarea ("Ask AnA · type / for commands", Enter sends / Shift+Enter newline), slash-command menu (filters `AUTH_SLASH_COMMANDS`), chip row: Attach, **Skills**, **Mention** (@), **c2c-Opus 4.7** model, command palette (⌘K), Send (arrow up).
- **SelectionToolbar:** floating above selection — **Strengthen**, **Tighten**, **Regenerate** · **Cite**, **Precedent** · **Comment**, **Flag** (each with title tooltip). Actions typed `SelectionAction`.

### Artifact (document renderer + provenance + compliance gates) — `authoring/artifact/Artifact.tsx`
- **ArtifactHead:** section heading + meta (`path · label · program.code · version · edited {lastSaved}`), **gate pill** (shield + per-severity counts err/warn/info, toggle show/hide), **tabs Document / eCTD XML / Changes**, Revert, More. Document tab adds a **format bar** (Style select Title/H1/H2/H3/Body/Caption; B/I/U/Strikethrough; bullet/numbered/indent; table/figure/citation/footnote/link; track-changes/comments/find-replace).
- **StateBar:** Status pill (Approved/In review/Drafted/Locked/Not started), Owner, Agency, Due, Mandatory Yes/No.
- **Paragraph:** provenance tag (confidence % colored high≥0.92/med≥0.82/low + auditId); hover **provenance popover** (Source, Model, Confidence, Audit ID, foot); **compliance gates** wrap matched spans in `<mark class=au-gate-{sev}>`; footnote citation chips (evidenceMode='footnote') or margin card (evidenceMode='margin'); streaming caret.
- **GatePopover:** severity badge (Error/Warning/Info), category label, title, desc, **Suggested fix** + **Apply fix · writes audit row** / Dismiss (or Close when no fix).
- **ArtifactEmpty:** "{agency} pack", section label, "Nothing drafted yet…", **Draft with AnA**.

### Workbench (section table + inspector) — `authoring/workbench/Workbench.tsx`
- **WorkbenchTable:** head ("{docType.label}", "{agency} rule pack · {n} sections", **Draft with AnA**); **KPI strip**: Readiness % ({ready}/{total} ready), In review, Drafted, Mandatory blockers (mandatory sections without a draft). **Table columns:** Path · Section · Status · Owner · Updated · Actions. Status pills via STATUS_LABELS (Approved/In review/Drafted/Locked/Not started); mandatory rows tagged "Req"; row actions Open (eye) + **Draft**.
- **Inspector:** tabs **Ask AnA** / **Evidence** / **Reviewers**. EvidencePane (linked evidence cards with kind/meta/conf%, "Search RIM + Vault"); ReviewersPane (Owner with "Reviewing" pill, other reviewers with "Request").

### Authoring data + types — `authoring/data.ts`, `authoring/hooks.ts`, `authoring/icons.tsx`
- **Agencies (8):** FDA, EMA, PMDA, Health Canada, MHRA, ICH harmonized, TGA, NMPA — each with full name, region, esubmit channel.
- **Doc types (16):** IND, CTA, NDA, BLA, MAA, 510(k), De Novo, PMA, Clinical Evaluation Report, PSUR/PBRER, Investigator Brochure, Protocol, Clinical Study Report (E3), Briefing Book, Module 3 · CMC, Module 2 summaries — each with family + default agencies.
- **Rule-pack outlines** keyed `docType:agency` (ind:fda, ind:mhra, cta:ema, k510:fda, pma:fda, cer:ema, psur:ema, ib:ich, protocol:ich, csr:ich, briefing:fda, mod3:ich, mod2:ich) with per-section mandatory + status (approved/drafted/review/todo).
- **Section status vocab:** todo, drafted, review, approved, locked, fail (+ "Not started" label).
- **Compliance gates** (`AUTH_GATES`): severities err/warn/info; categories Number check / Citation check / Cross-document consistency / Evidence chain / Style. Examples: source-data mismatch (184 vs 186), superseded citation (FDA 2023→2024), PV disclosure gap (grade 5 pending adjudication).
- **Slash commands:** /cite /precedent /tighten /strengthen /diff /review /flag /crossref /validate /translate.
- **Skills (8):** Draft section, Compare to predicate, Pull evidence, Risk-benefit synthesis, Translate agency pack, Validate against pack, Precedent search, Compile submission.
- **Programs/reviewers/evidence** fixtures. `AUTH_DEFAULT` opens IND × FDA §2.5 v0.4, readiness 78.
- **hooks.ts** exposes the live `/api/c2c/documents/*` contract (summary/rule-pack/outline/section/save), all live ?? fixture.

---

## LABELING

### Labeling shell — `labeling/App.tsx` (+ `LabelingRoute.tsx`)
- **Route / entry:** ZenApp `nav=labeling`; `LabelingRoute` imports `mdx/app.css` then `labeling/app.css`; passes `activeProjectId`. Same shell idiom as CMC.
- **Purpose:** Operate labeling documents, translation coverage, and ISO 15223-1 symbols, project-scoped.
- **Controls & actions:** Rail (4 nav), TopBar ⌘K palette, Density toggle, **project `<select>`** (canonical project id space from `useProjects`; "No projects" / "Select a project" placeholders); AnA dock (⌘\) with starters + textarea.
- **Data:** `useProjects()`, `useAnaChat({ projectId, moduleContext:{ workstream:'labeling', activeNav, projectId } })`. Persists `labeling.anaOpen/density/projectId`.

### Labeling Rail / TopBar / TabBar — `labeling/shell/*`
- Nav (`LABELING_NAV`): **Labeling overview** (tag), **Labeling documents** (fileText), **Translation coverage** (globe), **ISO 15223-1 symbols** (shapes). Breadcrumb `Concept2Cure.RI › Labeling › <here>`. Account role "Enterprise · Labeling".

### Labeling overview — `labeling/surfaces/Overview.tsx`
- Page head (kicker "Labeling · IFU · ISO 15223-1", title "Labeling overview", meta "{n} labeling documents · {approved}/{total} translations approved on the lead document", **Reconcile IFU with AnA**) → AnA composer ("Ask AnA about an IFU, label or translation…") → 3 starters → **document grid** (`.lb-docs`). Each doc card: kind label, **StatusChip**, device name, "{version} · {language} · {REGION}"; click → AnA "Open the {kind} … and show translation coverage".
- **States:** NoProject / Loading "Loading labeling documents…" / Error / Empty "No labeling documents recorded for this project yet."
- **Data:** `useLabelingDocuments({programId})`, `useLabelingCoverage(firstDocId)`.

### Labeling documents — `labeling/surfaces/Documents.tsx`
- Page head (title "Labeling documents", meta "IFU, package insert, patient label, operator manual", **New document** (disabled without project) + **Ask AnA**) → table.
- **Columns:** Document · Kind · Version · Language · Region · Status · Action (Edit).
- **DocumentDialog** (create/edit, via `LabelingDialog`): fields Document name*, Document kind (`DOC_KINDS`: ifu/package_insert/patient_label/operator_manual/service_manual/quick_ref/box_label), Language*, Status (`DOC_STATUSES`: draft/review/approved/effective/superseded), Region (No region / US / EU / JP / GLOBAL), Version. Footer Cancel / Create document|Save changes. Writes camelCase keys; create adds `programId`. Error row `role=alert`.
- **Data:** `useLabelingDocuments`, `useCreateLabelingDocument` (POST), `useUpdateLabelingDocument` (PATCH /:id).

### Translation coverage — `labeling/surfaces/Translations.tsx`
- Page head (title "Translation coverage", meta "{approved}/{total} approved · {n} back-translation verified", **Add translation** (disabled until doc selected) + **Ask AnA**) → **DocPicker** → table.
- **Columns:** Language · Method · Back-translation (Verified chip / "Not verified") · Status · Action (Edit).
- **TranslationDialog:** Language* (≥2 chars, locked on edit), Method (`TRANS_METHODS`: human / mt postedited / machine), Translator, Status (`TRANS_STATUSES`: pending/in_progress/review/approved/rejected), **Back-translation verified** checkbox. Footer Cancel / Add translation|Save changes.
- **Translation status tones:** approved→ok, review/in_progress→review, rejected→err, pending→warn.
- **Data:** `useLabelingCoverage(docId)`, `useLabelingTranslations(docId)`, `useAddTranslation` (POST), `useUpdateTranslation` (PATCH /translations/:transId).

### ISO 15223-1 symbols — `labeling/surfaces/Symbols.tsx`
- Page head (title "ISO 15223-1 symbols", meta "Symbols declared on the selected label, with the standard that requires each", **Add symbol** + **Ask AnA**) → DocPicker → table.
- **Columns:** Code · Symbol · Required by · Action (Remove).
- **AddSymbolDialog:** Symbol code* (e.g. 5.4.3), Symbol name* (e.g. "Consult instructions for use"), Required by (comma-separated standards), Description (textarea).
- **RemoveSymbolCell:** **governed-lite** two-step — Remove button → inline confirm "Remove this symbol?" (warning icon) with Cancel / **Confirm remove** (DELETE /symbols/:symId). A deliberate confirm, explicitly **not** a full e-signature.
- **Data:** `useLabelingSymbols(docId)`, `useAddSymbol`, `useRemoveSymbol`.

### Labeling shared — `DocPicker.tsx`, `LabelingDialog.tsx`, `state.tsx`, `data/nav.ts`
- **DocPicker:** labelled `<select>` of program-scoped docs ("{device} · {kind} · {language}"), auto-selects first; "No documents" when empty.
- **LabelingDialog:** accessible modal chrome (`role=dialog aria-modal`, labelled by title, focus trap, focus return, Esc closes unless `busy`), overlay click-to-close (inert while busy), head (title/subtitle/close), body (caller form), right-aligned footer. Mirrors the CmcDialog/EsignModal a11y contract.
- **state.tsx:** Loading (`role=status`), ErrorState (`role=alert`), Empty, NoProject ("Select a project to load its labeling documents."), **StatusChip** (tone + icon + label, never color-alone). Doc status tones: approved/effective→ok, review→review, superseded/draft→dim.
- **Doc-kind labels:** IFU, Package insert, Patient label, Operator manual, Service manual, Quick reference, Box label.

---

## SHARED AUTHORING COMPONENTS

### eCTD co-authoring workbench — `components/claude-ectd-coauthor/`
- **`ClaudeEctdCoauthor.tsx`** — Phase 3 workbench shell: `.shell` grid TopBar · Tree · Intelligence · Artifact, plus floating SelectionToolbar. `data-focus`, `data-tree-collapsed`. Bundle ARTIFACTS/TREE/REWRITES are fixtures + fallback; props can override (`artifacts`, `tree`, `initialPath='2.5'`, `rewrites`, callbacks `onSubmitForReview/onShare/onExport/onRevert`, live `chat` UseAnaChatReturn). Streaming rewrite engine (typed-out, commits to local artifact mirror, bumps confidence, stamps "Rewritten · strengthened · {time}"). Live-chat mode adapts AnA messages into structured blocks; mock mode uses SEED_MESSAGES.
- **`TopBar.tsx`** — logo (brand SVG), tree toggle, breadcrumb `{applicationLabel='NDA 212345'} / {moduleShort} / {path} {title}`, **status pill** "Autosaved · {version} · {lastEdited}", Share, Export, Focus, **Submit for review** (primary).
- **`Tree.tsx`** — eCTD M1–M5 navigator, search "Find section…", module rows (M{num} + label + status dot), expandable children, footer **Submission readiness / Sections blocking / Last RIM sync** (defaults "87% / 3 / 4 min ago"). EctdStatus dots: approved/review/draft/todo/blocked.
- **`Intelligence.tsx`** — center chat: head "Intelligence" + "AnA 1.0 RI · c2c-Opus 4.7", thread (user/AI; blocks p/tool/stream/chip), typing dots, composer ("Ask AnA about this section, or draft more…", Enter sends) with Attach / Tools / c2c-Opus 4.7 / Send.
- **`Artifact.tsx` + `ArtifactDoc.tsx`** — right pane: head "Section {path} — {title}", meta "{version} · edited {lastEdited} · {lastEditedBy}", tabs **Document / eCTD XML / Changes**, Revert, More. Doc render: **masthead** grid + "21 CFR Part 11 · Signed · {lastEditedBy}", section number, H1, paragraphs (confidence gutter hi≥0.9/med≥0.8/lo; inline citations; **provenance tooltip** Source/Model/Confidence/Audit ID/foot; streaming overlay), tables (cells with ok/warn pills).
- **`SelectionToolbar.tsx`** — floating: **Ask AnA** (sparkle), **Find precedent** (shield), **Tighten**, **Flag**.
- **`useEctdReadiness.ts`** — `GET /api/authoring-actions/module-readiness/:projectId/all` → readinessPct / blockingCount / lastRimSync (null → bundle defaults).
- **`useEctdAuthoringData.ts`** — normalizes `authoring_documents.status` (mixed-case) to EctdStatus (approved/review/blocked/todo/draft), computes worst-status per module for the tree icon, builds artifact blocks from live content. (`data.ts` = fixtures; `index.ts` re-exports; `styles.module.css`.)
- **Notes for design:** This is a **parallel, self-contained eCTD authoring surface** with its own provenance + "21 CFR Part 11 · Signed" masthead and "Submit for review" — overlaps conceptually with `authoring/` but distinct chrome (CSS Modules, not `.au-*`).

### Intelligent document system — `components/intelligentDocs/`
- **`SmartClaimHighlighter.tsx`** — TipTap **`ClaimHighlightMark`** (attrs claimId/claimType/sourceStatus; renders span with status classes); **ClaimIndicator** (compact dot ✓/!/✗ colored green/amber-pulse/red with tooltips "Claim supported by source" / "Needs source reference" / "No matching source found"); **ClaimSummaryStrip** (document footer: "{n} claims detected", {n} sourced / {n} need sources / {n} unsupported, "{pct}% traceable"); **ClaimTooltip** (claim-type label, quoted text, sources linked or **Link Source**).
- **`SourceSuggestionPanel.tsx`** — right-rail AI source suggestions: header + selected-claim card, **filter tabs** by source type, **SourceCard** (emoji icon by type, relevance % colored by confidence band ≥90/≥70/≥50, excerpt, Show more / **Link Source** with "Linking…"), Empty/Loading states, footer "Searching {n} connected sources" with bridge dots; **InlineSuggestionTooltip**. (Tailwind-styled, distinct from the design-system `.au-*`/`.sub-*`/`.lb-*` surfaces.)
- **`types.ts`** vocab: DocumentStatus (draft/in-review/pending-approval/…), ClaimType (efficacy/safety/design/regulatory/clinical/statistical/manufacturing/comparison), sourceStatus (supported/needs-source/unsupported), SourceType, DataBridgeConnection.status (connected/available/needs-update/missing/synced), guard severity (error/warning/suggestion).

### Editor model — `components/editor/`
- **`gaReadinessModel.ts`** — `buildReadinessChecks` (7 checks: Project context / Active document / Real-time collaboration / E-signature workflow / Provenance trail / Open comments resolved / Backend connectivity; statuses ready/partial/missing with detail copy), `buildCapabilityModels` (Template-guided drafting, Data-room figure insertion, Cross-document consistency, Governed review + e-sign, Submission readiness; columns weaveBio/artos/c2c with inspectorTarget + gapSummary), `buildRemediationQueue` (top-6 high/medium remediations). Drives a GA-readiness inspector elsewhere.
- **`extensions/IndentExtension.ts`** + `__tests__/` — TipTap indent extension and unit tests (model-level, no UI surface).

### E-signature modal — `_shared/components/EsignModal.tsx` + `hooks/useEsignature.ts`
- **Purpose:** The single 21 CFR Part 11 gate for governed mutations across concept2cure (CMC batch release, artifact approval, submission transmit, access grant).
- **Props:** `open, action, target, targetMeta?, defaultMeaning?, signer?, requireMfa?, onClose, onSign`. `onSign` runs the real governed mutation after re-auth and resolves an `EsigSignedManifest{meaning,reason,signedAt,hash?}`.
- **Layout (form phase):** head "Electronic signature" + "21 CFR Part 11 · §11.50 · §11.100 · §11.200", close. **Target block** "You are signing" + target + meta + **signer identity** (avatar initials, name, email/role). **Signature meaning** radiogroup (§11.50): **Authorship / Review / Approval / Responsibility / Release** (each with description). **Reason** textarea (≥8 chars, "Stored verbatim in the audit trail"). **Password** (§11.200, ≥6). **Authenticator code (TOTP)** when `requireMfa` (6-digit; "Re-challenge is required per signing event. Never stored."). Inline error `role=alert`. Footer Cancel / **Sign and commit** (shield; spinner "Signing" while committing; disabled until `canCommit`).
- **Signed phase:** check mark, "Signature applied", "{meaning} signature recorded against {target}. The 21 CFR Part 11 audit trail has a new entry. This cannot be undone.", **manifest table** (Action, Signed by, Meaning, Reason, When, Chain hash), **Done**.
- **Flow:** capture meaning + reason → `useEsignature.verifyPassword` (always) + `verifyMfa` (if MFA) against `/api/esignature/verify-password|verify-mfa` → `onSign` (caller mutation, forwards password/totp as reauth envelope) → manifest. No fabricated success; verify/sign failures surface inline.
- **Accessibility:** `role=dialog aria-modal`, labelled by title, focus trap, focus return to trigger, Esc closes when not committing, every input labelled, errors announced.
- **`useEsignature.ts`:** react-query mutations `verifyPassword`, `verifyMfa`, `sign` (`POST /api/esignature/sign` → `{signatureId, signatureHash, signedAt}`; requires numeric documentId/versionId). Meaning enum: authorship/review/approval/responsibility/release. Re-auth secrets never stored/logged.
- **Notes for design:** This is the canonical **Part-11 governed-action confirmation** pattern — reason-for-change + meaning + re-authentication + immutable signed manifest. The labeling symbol-remove confirm and the authoring "send for review" reason modal are lighter-weight variants on the same governed-action theme.

---

## Cross-cutting design-relevant findings
1. **Two distinct authoring surfaces coexist:** `authoring/` (`.au-*`, design-system tokens, live `/api/c2c/documents/*`) and `components/claude-ectd-coauthor/` (CSS Modules, `/api/authoring*`). Both have an outline/tree + AnA chat + artifact-with-provenance + "Submit for review" + Document/eCTD XML/Changes tabs. A redesign must decide whether these converge.
2. **Honesty-contract (sample/unverified) is pervasive:** streaming rewrites, demo AnA turns, the submission `_install` "Temporary" placeholder, and the `live ?? fixture` pattern. Surfaces never go blank — fixtures render when no live data exists. The submission `_install` registry describes **7 future eCTD-assembly workspaces not yet built**.
3. **Governed-action ladder:** full Part-11 e-signature (EsignModal) → reason-for-change modal (authoring send-for-review) → two-step confirm (labeling symbol remove) → plain mutation (labeling doc/translation create-edit). Each writes an audit/ledger trail server-side.
4. **WCAG 2.2 AA is already coded in:** status/ACK/finding chips always pair tone + text + icon; loading uses `role=status`, errors `role=alert`; dialogs trap focus, restore focus, support Esc; ACK cells carry spelled-out `aria-label`s.
5. **Status vocabularies differ per surface** (transmittal lifecycle vs authoring section status vs eCTD status vs labeling doc/translation status vs intelligent-doc claim status) — enumerated above; a unified design system should reconcile them.

### Open questions / gaps
- The submission **gateway hooks** (`hooks/useSubmission`, `services/submissionService`) and labeling **hooks/services** (`hooks/useLabeling`, `services/labelingService`) live outside this scope — exact field shapes (Transmittal, Gateway, Finding, LabelingDoc/Translation/Symbol) inferred from usage, not read in full here.
- `useAnaChat` internals (streaming, `statusPhase`, `executedActions`, action `executed/error` flags) are referenced but defined elsewhere.
- `authoring/app.css`, `submission/app.css`, `labeling/app.css`, and `styles.module.css` carry the actual visual tokens/spacing — not transcribed (CSS out of brief's per-surface scope).
- The `IndentExtension` and `__tests__` are model/behavior-only; no standalone UI surface.
- Where the GA-readiness model (`gaReadinessModel.ts`) is rendered (which inspector panel) is not in this scope.

---

# Part 7 — Cross-Cutting Workflow & Collaboration Surfaces

## Area — overview

Files read: **~38 substantive source files** across eight directories (auth, projects, tasking, quality, risk, communication, components/knowledge, components/shared). Test files (`__tests__/*.test.ts`) and pure CSS (`app.css`, `project.css`) were noted but not transcribed line-by-line; their tokens/behaviors are folded into the relevant surface entries.

This area is the connective tissue of Concept2Cure / AnA — everything that is NOT a per-program authoring module: getting in (auth/login/signup/MFA), the project dashboard, the cross-program task system (board/list/your-work), the quality management system (controlled-document register), the ISO 14971 risk-management workstream (register/matrix/controls/overview), the Communication Center (review queue / e-sign approvals / Part 11 audit trail), and the small shared building blocks (custom AI instructions, locked-module upsell card).

**Common shell idiom** (tasking, risk, communication): a `.shell` flex container with `data-collapsed` / `data-ana-open` attributes, holding a left **Rail** (logo "Concept2Cure.RI", collapsible nav, account chip), a **main** column (TopBar breadcrumb + density/owner toggles, TabBar of surfaces, scrollable `.page`), and a right **AnA dock** that is a collapsed `.ana-seam` button (✻ AnA) when shut and an inline chat panel (live `useAnaChat` stream) when open. **⌘\ (or Ctrl+\)** toggles the AnA dock everywhere; ⌘K opens the command/AnA palette. AnA open-state, density, owner toggle, and project id are persisted to `localStorage` under per-workstream keys (`risk.*`, `tasking.*`, `comm.*`).

**Honesty/Part-11 posture:** Quality performs **no direct mutations** — every governed action is a conversational prompt handed to AnA which captures reason-for-change + e-signature so the Part 11 audit trail stays the single path. Quality falls back to typed fixtures (`live ?? fixture`) on load/error. Risk/tasking/communication render **live data only** (no demo arrays). The Communication approvals tab uses a real `EsignModal` (21 CFR Part 11) storing the signing reason verbatim.

---

## AUTH (`concept2cure/auth/` — 8 src files + 5 tests)

### Sign-in / MFA / Password-reset — `auth/ZenLogin.tsx`
- **Route / entry:** `/concept2cure/login` (and `/login`). A single component with an internal `view` state machine: `sign-in | mfa | forgot-password | reset-password | reset-sent | success`. Opens directly to `reset-password` when a `?token=` query param is present.
- **Purpose:** Authenticate an existing user into the regulatory workspace, including MFA and self-service password reset.
- **Layout & regions:** Full-screen calm canvas `bg-[#faf9f5]`, centered single **Card** (max-width 400px) with `CardHeader` (dynamic title + description) and `CardContent`. Title/description swap per view (e.g. "Sign in to Concept2Cure" / "Secure access to your regulatory workspace.").
- **Controls & actions:**
  - *sign-in:* Email input; **PasswordField** (label "Password" + inline **Show/Hide** toggle); **Checkbox** "Keep me signed in" (default checked); **"Forgot password?"** ghost button → forgot view; **"Sign in"** submit (spinner while loading). In dev only (`import.meta.env.DEV`), an amber-styled **"Demo Access"** button posts to `/api/auth/dev-login` with `jm.smith@concept2cure.pro`, seeds 4 localStorage + 4 sessionStorage token keys, then hard-navigates to `/concept2cure`.
  - *mfa:* Method chips when >1 method (labels are `method.type.replace('_',' ')`); a 6-box **MfaCodeInput** (numeric, auto-advance, paste-aware) OR a free-text **Recovery code** input when method is `backup_code`; **"Verify"** button; **Back** (ArrowLeft) to sign-in; **"Resend code"** with a 60s countdown ("Resend in {n}s") for email method; **"Use a recovery code"** switch when backup codes supported.
  - *forgot-password:* Email input with mail icon; **"Send reset link"**; **"Back to sign in"**.
  - *reset-sent:* Emerald check circle, "If an account exists for <email>, a reset link is on its way."; **"Return to sign in"**.
  - *reset-password:* Two PasswordFields ("New password" / "Confirm password"); **"Update password"**; **"Back to sign in"**.
  - *success:* Emerald check, success message, **"Continue"** → `/concept2cure`.
- **States:** loading (Spinner in buttons, fields disabled); error (destructive **Alert** with AlertCircle, red-50); per-field errors (`field: 'email'|'password'|'mfa'|'reset'`). Auto-clears error on any field change.
- **Data:** `useAuth` (portal authService) → `login({email,password,rememberDevice})`, `verifyMfa({method,code})`; `authService.requestPasswordReset`, `confirmPasswordReset`, `resendLoginOtp`, `getUser`. `MfaMethod['type']` = `totp | sms | email | hardware_key | biometric | backup_code`. Post-login destination from `computeRedirect(...)`.
- **Notes for design:** MFA digit boxes use `autoComplete="one-time-code"`, `inputMode="numeric"`. Demo Access is a dev-only escape hatch (honesty: clearly amber/separate).

### Request-access / Signup wizard — `auth/ZenSignup.tsx`
- **Route / entry:** `/concept2cure/signup` (and `/signup`). Reads `?plan=` to preselect a plan.
- **Purpose:** Multi-step account-request wizard with org info, plan selection, and scroll-to-accept legal agreements.
- **Layout & regions:** `bg-[#faf9f5]` column. Header with **LanguageSwitcher** (variant="auth"), C2C logo tile, i18n title/subtitle. A **4-dot progress indicator** (numbered, checkmarks completed, connecting bars). White rounded card hosting the animated (framer-motion slide x) step. Footer "FDA 21 CFR Part 11 Compliant" shield + copyright. Bottom "Already have an account? Sign in" link.
- **Steps** (`info | organization | plan | compliance | submitted`):
  - *info:* First/Last name (2-col), Email, Password, Confirm password, Job title. Validation: required fields, email regex, password ≥12 chars, match. **"Continue"**.
  - *organization:* Organization name, **Organization type** select (Pharmaceutical / Biotechnology / Medical Device / CRO / Regulatory Consulting / Academic-Research / Government-Regulatory Agency / Other), Country, **Use case** select (510(k) / PMA / IND / NDA-BLA / Clinical Evaluation Reports / CMC Documentation / eCTD Compilation / Multiple Regulatory Activities). Back/Continue.
  - *plan:* Three DTC plan cards — **Researcher** (Free; "5 deep research queries/mo, 2 projects"), **Startup Biotech** ($499/mo; badge "Popular"; "50 research queries, CSR builder, eCTD authoring"), **Growth** ($1,499/mo; "200 queries, full CTD builder, all connectors"). Paid plans show "14-day free trial". Footnote re: no card for free plan.
  - *compliance:* Two **scroll-to-accept** legal panels — **Terms of Service** and **Privacy Policy & Data Rights** — each with a "Scroll to read"→"Read" badge and a checkbox that stays disabled until the user scrolls to the bottom (verbatim multi-paragraph legal copy embedded, covering AI-content review, 7-yr Part 11 audit logs, AES-256/TLS 1.3, Anthropic Claude API no-training clause, 3-month minimum). A privacy panel hosts an **AI Model Improvement** opt-in toggle (default off). A third standalone **Regulatory Compliance** acknowledgment checkbox (FDA 21 CFR Part 11, HIPAA, GDPR, ICH GCP). Submit button label switches "Create account" / "Create account & start trial".
  - *submitted:* Green check, "Welcome to Concept2Cure… workspace ready at <email>", blue tip card, **"Open app"** → `/ai`.
- **Data writes:** `POST /api/auth/signup` (email, password, companyName, industryMode mapped from org type, firstName, lastName). On paid plan: `POST /api/billing/dtc-checkout` → Stripe redirect. Stores `token` to localStorage.
- **Gating/i18n:** All copy via `useTranslation('auth')`. Org-type→industryMode map present.
- **Notes for design:** Scroll-to-accept is a deliberate compliance gate (color-never-alone: text badges "Scroll to read"/"Read"). Heavy embedded legal text — designer should treat as scrollable content regions.

### `auth/ZenAuthLayout.tsx`
- Minimal calm wrapper: `min-h-screen bg-stone-50` with a relative child container. Used to host auth pages.

### Auth helpers (non-visual, but encode rules the UI surfaces)
- **`redirectUtils.ts`** — `computeRedirect`: same-origin only; allowed prefixes `['/concept2cure','/client-portal']`; rejects external/`//`/backslash/`..`/control chars; role default → `client_admin`/`client_user` go to `/client-portal`, else `/concept2cure`.
- **`passwordPolicy.ts`** — 5 live rules surfaced as checklist labels: "At least 12 characters", "One uppercase letter", "One lowercase letter", "One number", "One symbol".
- **`loginLockout.ts`** — lockout after **5** failed attempts for **15 minutes** (matches server policy); `getLockoutRemainingSeconds` for countdown copy.
- **`authInputUtils.ts`** — `normalizeEmail`; MFA method labels map: totp→"Authenticator app", sms→"SMS", email→"Email code", hardware_key→"Security key", biometric→"Biometric", backup_code→"Recovery code".
- **`index.ts`** — exports ZenLogin, ZenSignup, ZenAuthLayout.

---

## PROJECTS (`concept2cure/projects/` — 7 files)

### Project Detail dashboard — `projects/ProjectDetail.tsx` (+ `ProjectDetailRoute.tsx`)
- **Route / entry:** Rendered by host (ZenApp) with `projectId`; thin `ProjectDetailRoute` wrapper imports `project.css`. Callbacks: `onBack`, `onOpenDraft`, `onOpenWorkstream`.
- **Purpose:** Single-project cockpit — header KPIs, module workstreams, project-grounded AnA conversation, recent drafts, and a team/evidence/activity rail.
- **Layout & regions:** `.pj-shell`; `.pj-topbar` breadcrumb ("← Projects › {code} · {name}"); `.pj-body` split into `.pj-main` (header + 3 stacked sections) and right `.pj-aside`.
- **Sections (main):**
  - **ProjectHeader** — code/program_type chip, project name `<h1>`, **status pill** (kind derived: review/ok/err/dim from substrings review/approv/block/active); subline (indication · sponsor · "filed {date}" · "PDUFA {date}"); meta columns: **Readiness** (% + progress bar), **Pathway** (program_type · target agencies), **Workstreams** (n modules), and conditionally **Next milestone** "PDUFA · {n} days" (warn).
  - **Workstreams** ("{n} modules · click to open") — **ProjectWorkstreams** cards per module. MODULE_LABELS map: m1 Admin·Module 1 (Forms, labeling), m2 Summaries·Module 2 (QOS, nonclin, clinical), m3 CMC·Module 3, m4 Nonclinical·Module 4, m5 Clinical·Module 5, plus cmc/nonclin/clin/admin aliases. Each card: label, completion %, "{desc} · {approved}/{total} sections", progress fill. `statusFromPct`: ≥100 approved, ≥75 review, ≥25 drafted, else todo. Empty: "No sections authored yet."
  - **"Conversation with AnA"** (meta "Project-grounded") — **ProjectThread**: scrolling turn list (`.pj-turn ana|user`, avatar A/Y, relative time, streaming caret ▍, **TurnChips** showing tool-call/action labels); composer textarea ("Continue the project conversation, or open a section…", Enter=send, Shift+Enter newline); footer model button "AnA 1.0" (resets) + send arrow. Empty: "No conversation yet. Ask AnA something about this project."
  - **"Recent drafts"** ("{n} sections") — **ProjectDrafts** rows: file icon, title (label ?? section_key), sub (doc_title/doc_type · section_key), **status pill** (STATUS_LABELS: approved→Approved, review→In review, locked→Locked, drafted→Drafted, todo→To do), source "AnA"/"Human" + relative time. Keyboard-operable rows (role=button, Enter). Empty: "No sections authored yet."
- **Aside — ProjectAside:** **Team** (count; person rows with initials avatar, name, role, presence Online/Offline derived from `added_at`; empty "No members added yet."); **Pinned evidence** ("Vault →" link; kind/title/meta; empty "No evidence pinned yet."); **Activity** ("Open log →"; action text with `_`→space + relative time; empty "No recent activity.").
- **States:** loading "Loading project…"; error/not-found "Project not found." (red); else populated.
- **Data:** `Promise.all` over `/api/c2c/projects/:id`, `/workstreams`, `/drafts`, `/team`, `/evidence`, `/activity` (credentials: include, unwraps `{data}`). Entities: Project, Workstream, Draft, Member, Evidence, Activity (typed in file).
- **Notes for design:** PDUFA-days warn styling; relative-time helpers; presence is heuristic from `added_at`.

---

## TASKING (`concept2cure/tasking/` — 14 files)

Cross-program, **org-scoped** task system. Surfaces: overview ("Your work"), board, list. All live from `/api/regulatory/tasks/*`.

### Shell — `tasking/App.tsx` (+ `TaskingRoute.tsx`)
- **Entry:** Host mounts on `nav=tasking`. Rail group label "Tasking"; nav items **Your work** (check), **Board** (columns), **List** (list).
- **TopBar:** breadcrumb "Concept2Cure.RI › Tasking › {here}"; ⌘K palette button "Ask AnA, jump to…"; **Owner** toggle tablist (Everyone / Mine); **Density** toggle (Compact / Comfortable / Spacious); **Program filter** select ("All programs" + numeric program options — currently empty because canonical project ids are non-numeric); Notifications + Help icon buttons.
- **State persistence:** `tasking.anaOpen`, `tasking.density`, `tasking.owner` in localStorage; current user id from `localStorage 'userId'`. Owner "mine" applies `assigneeId` server filter.

### Your work (Overview) — `tasking/surfaces/Overview.tsx`
- **Purpose:** AnA-first triage home with live counters and a needs-attention queue.
- **Anatomy:** page head (kicker "Tasking and collaboration", title "Your work across every program", meta "{You own|The team owns} {n} open tasks · {x} due today · {y} overdue · {z} blocked"); actions **"New task"** (opens NewTaskDialog) + **"Triage with AnA"**. AnA composer input ("Ask AnA to triage, reassign, or summarize your work…"). Three starter prompt chips (sparkle). **4 summary tiles**: Open tasks / Due today / Overdue / Blocked. **Needs attention** card (overdue+today+blocked, sorted overdue-first then priority weight critical4/high3/medium2/low1, top 6): icon (xCircle blocked / warning overdue / clock), title, "{module} · {assignee|Unassigned}", PriorityPill, due chip, assignee initials. Empty: "Nothing overdue, due today, or blocked. You are caught up."

### Board (Kanban) — `tasking/surfaces/Board.tsx`
- **Purpose:** Live Kanban; moving a card PATCHes status.
- **Columns (TASK_COLUMNS):** **To do** (pending), **In progress** (in-progress), **In review** (review), **Blocked** (blocked), **Done** (completed). Each card: module-type kind, PriorityPill, title, due chip, assignee initials; **move-prev / move-next** arrow buttons (disabled at ends or while pending), and a **link** button (LinkTaskDialog). Column empty "Nothing here". Head actions: **New task**, **Ask AnA**. role="list"/"listitem" with aria counts.

### List (table) — `tasking/surfaces/List.tsx`
- Columns: **Task** (title + category sub) / **Program** (moduleType) / **Assignee** (initials + name|Unassigned) / **Priority** (pill) / **Due** (chip, warning icon if overdue) / **Status** (StatusChip). Sorted by due date (undated last). Empty "No tasks match this filter yet." Plus **Ask AnA** + starter chips.

### Dialogs
- **NewTaskDialog** (`surfaces/NewTaskDialog.tsx`): title "New task", subtitle "Create a task in any program…". Fields: Title*, Description, **Program** select* (CMC / IND / Medical device / eCTD / Vault / Protocol design), **Priority** (Low/Medium/High/Critical), Due date, **Assignee** (roster select from `useTeamMembers`→`/api/collaboration/team`, falls back to free-text when roster empty; hint reports member count/loading), **Program id (numeric, optional)** with "New tasks start as to do." hint. Submit "Create task"/"Creating…". `POST /api/regulatory/tasks/unified`.
- **LinkTaskDialog** (`surfaces/LinkTaskDialog.tsx`): "Link task", subtitle "Connect "{title}" to another task." **Relationship** select (Depends on / Related to / References / Parent of) + **Target task** select (excludes source). Empty-target hint. `POST /api/regulatory/tasks/:id/link`.
- **TaskDialog** (`surfaces/TaskDialog.tsx`): the shared a11y modal chrome (role=dialog, aria-modal, focus trap + return, Esc closes unless `busy`, overlay click-close). Title/subtitle/body/footer slots; close "×".

### Shared chips/state — `tasking/surfaces/state.tsx`
- Loading/Error(role=alert "Could not load this data. Try again.")/Empty. **StatusChip** tone+icon+label (color-never-alone). `statusTone`: completed→ok, review→review, in-progress→warn, blocked/cancelled→err, else dim. **PriorityPill** (word carries meaning). **dueInfo**: Done/Overdue/Today/Tomorrow/"{n}d" with tones. `initials()`.

### Nav data — `tasking/data/nav.ts`
- Status labels: pending→"To do", in-progress→"In progress", review→"In review", blocked→"Blocked", completed→"Done", cancelled→"Cancelled". Priority labels Low/Medium/High/Critical. Three AnA suggestions per surface (verbatim in file). COLUMN_TARGET_STATUS maps columns→status. Icons in `icons.tsx` (Lucide subset).

---

## QUALITY / QMS (`concept2cure/quality/` — 6 files)

### Quality system shell — `quality/App.tsx` (+ `QualityRoute.tsx`)
- **Entry:** ZenApp `layoutMode === 'quality'` (home rail "Quality and Lifecycle"). Single-surface shell.
- **Layout:** `.qms-shell`; `.qms-topbar` crumbs "Quality and lifecycle / SOP register" + **"Ask AnA"** button (sparkle) that asks for a quality-system read-out; scrollable `.qms-page` hosting **SopRegister**.

### SOP / Controlled-document register — `quality/SopRegister.tsx`
- **Purpose:** Controlled-document register & SOP library — lifecycle, periodic review, read-and-understood training, change control. **AnA-first; no direct mutations** (all governed actions go through AnA which captures reason/e-sig).
- **Anatomy:**
  - **Head:** eyebrow "Workstream", h1 "Quality system", descriptive sub. Actions: **"Pre-inspection check"** (ghost, shieldCheck) and **"New controlled document"** (primary, plus) — both AnA prompts.
  - **KPIs (4):** Effective documents (/ n in register), Under review (warn; "Awaiting approval"/"None in review"), Review overdue (err; "Past next-review date"/"All current"), Training compliance % (ok≥95 / warn≥80 / err; "Read-and-understood, current cycle").
  - **Template gallery** ("Build from the Quality system library", "{n} document types · standard Purpose to Approval structure"): cards per **SOP_TEMPLATES** — Quality manual (QM-), Policy (POL-), Standard operating procedure (SOP-), Work instruction (WI-), Form (FORM-), Validation protocol (VP-), Training curriculum (TC-). Each card → AnA prompt to create from library with the 9 standard sections.
  - **Controlled-document register table:** columns **Number, Title, Type, Version, Status, Effective, Next review** + row actions. Status filter chips: **All / Effective / Under review / Draft**. Status pill tones via STATUS_TONE. Row actions by status: draft|in_review → **Approve** (AnA: confirm second reviewer, e-sig, dates, Part 11 entry); effective → **Revise** (controlled revision, reason-for-change, version bump→draft) + **Retire** (reason, dependency check, audit entry); always a sparkle "Ask AnA about this document". Next-review shows a flag icon + `.qms-overdue` when past due.
  - **Periodic review** panel ("{overdue} overdue · {n} within 120 days"): rows with doc number/title and "Overdue" (flag) or next-review date; click → AnA schedule-review prompt. Empty "No documents due for review."
  - **Read-and-understood training** panel ("Per controlled procedure"; **"Record training"** link → AnA prompt capturing ack method e-signature/attestation/trainer-verified + refresh date): per-doc progress bar with tone (err<80 / warn<95 / ok), "{current}/{of}", last cycle. Empty "No training-controlled documents yet."
- **Status vocabulary (DocStatus):** draft "Draft", in_review "Under review", effective "Effective", superseded "Superseded", retired "Retired". **DocType labels:** Quality manual / Policy / SOP / Work instruction / Form / Specification / Validation protocol / Training curriculum.
- **Data:** `useSopRegister` GET `/api/mdx/qms/documents`; `useSopTemplates` `/api/mdx/qms/templates`; `useReviewDue` `/api/mdx/qms/documents/review-due?within=120`; `useTrainingCompliance` `/api/mdx/qms/training/compliance`. **`live ?? fixture`** fallbacks (FIXTURE_DOCS/TRAINING in `data.ts`; e.g. QM-001 Quality manual, SOP-820-100 CAPA, etc.). Standard sections: Purpose, Scope, Responsibilities, Definitions, Procedure, References, Attachments, Revision history, Approval.
- **Notes for design:** Strong Part 11 storytelling — "reviewer must differ from author", e-signature capture, audit entries, but the surface itself is read-only and delegates writes to AnA. No CAPA/inspection *screens* of their own here — CAPA appears as a controlled document (SOP-820-100) and "Pre-inspection check" is an AnA prompt; there is no dedicated CAPA-form or inspection-log UI in this scope.

---

## RISK (`concept2cure/risk/` — 14 files)

ISO 14971 risk-management workstream, **project-scoped** (canonical project id space via `useProjects`). Live from `/api/mdx/risk-*`.

### Shell — `risk/App.tsx` (+ `RiskRoute.tsx`, Rail/TopBar/TabBar)
- **Rail group "Risk management":** **Risk overview** (shield), **Risk register** (list), **Risk matrix** (grid), **Risk controls** (sliders).
- **TopBar:** crumbs "Concept2Cure.RI › Risk management › {here}"; ⌘K palette (i18n `common` topbar.* labels); **Density** toggle; **Project selector** (i18n "No projects"/"Select a project"); **LanguageSwitcher** (variant="topbar"); Notifications/Help. Default project = activeProjectId ?? localStorage `risk.projectId` ?? first project.

### Risk overview — `risk/surfaces/Overview.tsx`
- Page head (kicker "Risk management · ISO 14971:2019", title "Risk overview", meta "{total} hazards analyzed · {n} unacceptable · {m} ALARP after controls" or "Select a project to scope the risk file"); **"Draft risk-benefit with AnA"**. AnA composer ("Ask AnA about a hazard, score a risk, or capture a new one…") + 3 starter chips. **4 tiles**: Hazards analyzed / Open or mitigating / High residual risk (score ≥ 15) / Risk accepted. **Needs attention** queue (non-acceptable residual, highest score first, top 5): warning/alertCircle icon, ref+hazard, harm, ScoreChip, BandPill. Empty "No risks above the acceptable band…"

### Risk register — `risk/surfaces/Register.tsx`
- Table columns: **Ref, Hazard and harm, Initial, Residual, Band, Status, Action**. Ref is mono; hazard link → AnA. ScoreChip per initial/residual ("Not re-scored" when absent), BandPill, StatusChip, **Re-score** action. Head: **"Add hazard"** (disabled without project), **"Ask AnA"**.
  - **AddHazardDialog:** Hazard*, Hazardous situation, Harm*, Severity(1–5)*, Probability(1–5)* selects (value paired with word), live **ScorePreview** ("Initial risk"). `POST /api/mdx/risk-items`.
  - **RescoreDialog:** Severity/Probability + optional **residual** severity/probability (checkbox "Record residual risk after controls"), "Residual risk is acceptable" checkbox, **Benefit-risk rationale** textarea; two ScorePreviews. `PATCH /api/mdx/risk-items/:id`.

### Risk matrix — `risk/surfaces/Matrix.tsx`
- 5×5 severity(rows 5→1) × probability(cols 1→5) heatmap. **Pre-control / Post-control** mode tabs. Each cell is a labelled button carrying band word + score + count; aria-label e.g. "{n} hazards · severity S × probability P = score · {band}"; click → AnA showing those refs. Legend: **Acceptable** (Score < 8 · no further action), **ALARP** (Score 8–14 · reduce as far as practicable), **Unacceptable** (Score ≥ 15 · must add controls). Summary meta from `/api/mdx/risk-summary/:programId`.

### Risk controls — `risk/surfaces/Controls.tsx`
- **ItemPicker** (risk-item select, program-scoped) drives the surface. Risk context strip: Initial ScoreChip → Residual ScoreChip+BandPill (or "Not re-scored yet"). Table: **Control, Hierarchy level, Evidence, Status**. Control rows show description, "Introduces a new risk — track as its own item" note, ISO §7 hierarchy label, evidence (effectiveness/verification/implementation), and an inline **status select** advancing proposed→implemented→verified→effective. **AddControlDialog:** description* + hierarchy level* (Inherent safety / Protective measure / Information for safety; hint "Prefer inherent safety over protective measures over information for safety"). `POST /api/mdx/risk-items/:id/controls`, `PATCH /api/mdx/risk-controls/:controlId`.

### Vocabularies — `risk/data/nav.ts`
- **Severity 1–5:** 5 Catastrophic (Death), 4 Critical (Permanent impairment/life-threatening), 3 Serious (Injury requiring intervention), 2 Minor (Temporary, no intervention), 1 Negligible (Inconvenience). **Probability 1–5:** 1 Improbable, 2 Remote, 3 Occasional, 4 Probable, 5 Frequent. **Bands:** Acceptable / ALARP / Unacceptable (`riskBand` thresholds ≥15 unacceptable, ≥8 alarp, else acceptable). **Item status:** Open / Mitigating / Verified / Accepted / Closed. **Control type:** Inherent safety / Protective measure / Information for safety. **Control status:** Proposed / Implemented / Verified / Effective.
- **state.tsx:** Loading/Error/Empty/NoProject ("Select a project to load its risk file."); StatusChip/BandPill/ScoreChip (renders S×P = product) /ScorePreview (aria-live polite). Color-never-alone throughout. RiskDialog mirrors the TaskDialog a11y contract.

---

## COMMUNICATION CENTER (`concept2cure/communication/` — 6 files)

Regulated-handoff hub, **org-scoped**. Reuses tasking shell chrome + tasking state helpers.

### Shell — `communication/App.tsx` (+ `CommunicationRoute.tsx`)
- **Rail "Communication Center"** nav (also repeated as tabbar): **Review queue** (eye; "Items awaiting your review"), **Approvals** (checkCircle; "Pending e-signature"), **Audit trail** (scroll; "21 CFR Part 11"). TopBar shows `{here}` + **Everyone / Mine** owner toggle. ⌘\ AnA dock; persists `comm.anaOpen`, `comm.owner`; user id from `localStorage 'userId'`.

### Review queue — `communication/surfaces/ReviewQueue.tsx`
- Tasks in `status: 'review'` (mine→`assigneeId`). `.panel` with header "Review queue" + "{n} items in review · {assigned to you|all programs}". Table: **Task** (title + category) / **Module** / **Owner** (initials · name|Unassigned) / **Priority** (pill) / **Due** (status-pill review/empty, or "No due date") with an inline **"Ask AnA"** button per row. Empty "Nothing is waiting on your review." `useTasks`→`/api/regulatory/tasks/all`.

### Approvals — `communication/surfaces/Approvals.tsx`
- Pending e-sign sign-offs across all programs. `.panel` "Pending approvals" + "{n} awaiting your e-signature · across all programs". Table: **Document / Step / Requested by / Due / Decision**. Per row: **Approve**, **Reject**, **Ask AnA** buttons. Sign action opens the shared **EsignModal** (21 CFR Part 11): action "Approve step"/"Reject approval", targetMeta states the reason is required + stored verbatim in the audit trail, defaultMeaning approval/review. `useApprovalsPending` / `useApproveWorkflow` / `useRejectWorkflow` against `/api/approval-workflows/*`. Empty "You have no approvals awaiting sign-off."

### Audit trail — `communication/surfaces/AuditTimeline.tsx`
- Read-only immutable Part 11 chain. `.panel` "Audit trail" + "{n} events · 21 CFR Part 11 · immutable". Table: **When / Actor (name + role) / Action (status-pill) / Target / Reason** ("—" when none). `useAuditTrail` GET `/api/mdx/audit`. Empty "No audit events recorded yet."
- **nav.ts** AnA suggestions per tab (verbatim, e.g. reviews: "Summarize what is waiting on me" / "Which reviews are overdue?" / "Draft a response for the oldest item").

---

## KNOWLEDGE (`components/knowledge/` — 1 file)

### Custom Instructions — `components/knowledge/CustomInstructions.tsx`
- **Entry:** Rendered inside project settings / knowledge panel (Claude.ai-parity "custom instructions").
- **Purpose:** Per-project AI behavior config that applies to all conversations in the project.
- **Layout:** A **Collapsible** with a trigger button (Sparkles purple, "Custom Instructions", "(configured)" hint when set, chevron). Expanded content: info banner ("Custom instructions tell AnA how to behave for this specific project."), an optional **"Use {projectType} Template"** button (when empty + template exists), a **Textarea** (min-150px, placeholder with examples) with an absolute **character counter "{n} / 4,000"** (amber near limit >80%, red over), and an action row: **Reset** (RotateCcw, tooltip "Reset changes", only when dirty) + **Save Instructions** button (states: idle Save / "Saving…" spinner / green "Saved" check; disabled when no changes, over limit, or saving).
- **Templates:** `INSTRUCTION_TEMPLATES` keyed by **510K / IND / NDA / BLA** — each multi-line regulatory persona text with `[PLACEHOLDER]` tokens (predicate K-number, PDUFA date, phase, etc.).
- **Data:** controlled `value` + `onChange(instructions): Promise<void>`; `projectType` selects template; `disabled` gate; `defaultOpen` auto-expands when knowledge finishes loading.
- **Notes for design:** 4,000-char cap with visible counter; success state is transient (2s).

---

## SHARED (`components/shared/` — 1 file + tests)

### Locked Module Card — `components/shared/LockedModuleCard.tsx`
- **Purpose:** Upsell/empty-state card shown in place of a module the org's tier doesn't include.
- **Layout:** Centered card (`role="region"`, aria-label "{title} — locked module", faint #faf9f5 bg, 0.85 opacity): optional dimmed icon, **title** h3, **description** p, a pill "**{requiredTier} tier**" (default "Enterprise"), and an optional **"Request access"** button (brand `#d97757`, hover `#c4684c`, aria-label "Request upgrade for {title}") firing `onRequestUpgrade(moduleId)`.
- **Notes for design:** Inline-styled (not CSS-module/Tailwind) brand-terracotta button; the one canonical "you don't have this yet" pattern across modules.

---

### Open questions / gaps
- **No dedicated CAPA or inspection screen** exists in the `quality/` scope. CAPA is represented only as a controlled document (SOP-820-100) and inspections only as the AnA "Pre-inspection check" prompt — if the brief expected standalone CAPA/inspection UIs, they live elsewhere or are intended to be AnA-driven.
- The tasking **Program filter** is intentionally empty (canonical project ids are non-numeric and can't filter `unified_tasks`); a designer should know the select renders but only ever shows "All programs" today.
- `EsignModal`, `useAnaChat`, `useTasks/useRisk/useProgramTabs`, `useProjects`, `useTeamMembers`, the portal `authService`, and `mdx/icons` live **outside this scope** (in `_shared/`, `components/ana/`, `hooks/`, `services/`, `mdx/`) — their exact internal UI/markup (e.g. EsignModal field layout, AnA streaming visuals) was not transcribed here.
- CSS files (`project.css`, `tasking/app.css`, `risk/app.css`, `quality/app.css`) define the visual tokens (`.pj-*`, `.task-*`, `.risk-*`, `.qms-*`, `.bp-*` primitives, `status-pill`, `.panel`/`.tbl`) but were not transcribed property-by-property.
- Auth lockout/password-policy helpers exist and are unit-tested, but I did not confirm which login view *renders* the live password checklist or lockout countdown (the helpers are imported by signup/login flows; the checklist UI may be in ZenSignup's password step which validates length only inline).

---

# Part 8 — Insights, Intelligence & API Surface Map

## Area overview
Two client clusters plus a server route-group catalog.

- **Insights (`client/src/concept2cure/insights/`, 22 files)** — a scope-aware, chat-first regulatory-reporting screen ("Report-OS"). The user picks a **scope** (account → document) + identifier, browses a **report catalog**, generates a **report run**, and reads the **rendered document** (sections of typed blocks incl. governed charts). All data is **live** from `/api/report-os/*`; no fixtures. Honesty contract is central: truthfulness banners, status-downgrade reasons, provenance-on-hover, AI-narrative disclosures. Main surfaces: `InsightsSurface`, `ScopeSwitcher`, `ReportCatalog`, `ReportView`, `ReportBlockView`, plus a 7-component recharts chart kit.
- **Intelligence (`client/src/concept2cure/intelligence/`, 12 files)** — Phase 11 "Intelligence cluster": a Rail + TopBar shell over four read-only surfaces: **Protocol & Study Design**, **CMC Module**, **Biostatistics**, **Reports**. Data comes from `/api/intelligence/{protocol,cmc,biostat,reports}` with **per-field fixture fallback** (`live ?? fixture`), so screens render fully today on designed sample data. Mutations are out of scope — every "do" action deep-links to Authoring (Phase 9).
- **API route-group catalog (§3)** — ~200 `/api/*` route groups; this doc gives a concise group→Unit-of-UI mapping (not all 453 files), with the 39 `/api/global-ri/*` jurisdiction groups summarized.

The two clusters overlap in name ("Reports") but are distinct: Insights = the live Report-OS render engine; Intelligence/Reports = a sample-data readiness dashboard.

---

# 1. Insights cluster (Report-OS)

### InsightsSurface — `client/src/concept2cure/insights/surface/InsightsSurface.tsx`
- **Route / entry:** Top-level Insights screen; embedded by host (likely a `report-engine`/insights LayoutMode). Props: `organizationId?`, `initialScope?`, `onAsk?`.
- **Purpose:** Pick a scope, generate a report type, and read the rendered governed report document. Read-only — "drives decisions, not edits."
- **Layout & regions:** (top→bottom)
  1. `h1` "Insights" + subhead: "Scope-aware regulatory reporting over the Report-OS render model. Pick a scope, generate a report type, and read the rendered document. Read-only — drives decisions, not edits."
  2. **Scope card** (`in-card`, h3 "Scope") containing `ScopeSwitcher`.
  3. **Split row** (`in-split`): LEFT = `ReportCatalog` card; RIGHT = "Recent runs" card.
  4. **Section** (`in-sec`): the selected run's `ReportView`, preceded by an "Ask AnA about this report" button.
- **Controls & actions:**
  - ScopeSwitcher (scope type Select + scope id Input) — changing scope clears the selected run.
  - In catalog: per-type **"Generate"** button → `useGenerateReport` mutation; on success auto-selects the new run.
  - Recent-runs rows: **"View"** button (becomes **"Viewing"** when active) selects a run for rendering.
  - **"Ask AnA about this report"** (only if `onAsk` provided) — hands a scoped prompt string up; not wired to a backend here. Prompt: `Explain the {reportTypeId} report for {scopeType} {scopeId}` (or latest-insights variant).
- **States:**
  - **No org:** message "No organization is selected. Sign in to an organization to generate and list reports."; generate disabled. Org id falls back to `sessionStorage`/`localStorage` `trialsage_org_id`.
  - **Catalog loading:** "Loading the report types enabled for your organization."
  - **Catalog error:** "The report taxonomy could not be loaded. Check your connection and retry; the catalog of report types will appear here."
  - **Generate error:** red `role=alert` "The report could not be generated. {message}".
  - **Recent runs — no scope id:** "Enter a scope identifier to list the runs generated for it."
  - **Recent runs loading / error / empty:** "Loading runs for {scope} {id}." / "Runs for this scope could not be loaded. Retry…" / "No runs have been generated for {scope} {id}. Generate a report from the catalog to see it here."
  - **Run row label:** `{reportTypeId} · {status} · confidence {n}%` or "confidence not yet computed".
  - **Report panel:** none-selected "Select a run or generate a report to read its rendered document here."; loading "Rendering the report document for the selected run."; error `role=alert` "The rendered report could not be loaded. {message}"; no-doc "The selected run has no rendered document yet."
- **Status vocabularies:** run `status` (raw string from server, shown verbatim); confidence as percent.
- **Data:** Hooks `useReportTypes`, `useReportRuns({organizationId, scopeType, scopeId})`, `useRenderedReport(runId)`, `useGenerateReport`. Endpoints under `/api/report-os` (see §1 data layer). Org bound server-side from JWT; orgId here only scopes cache + request body.
- **Gating:** Requires an org (JWT). No explicit feature flag in this file.
- **Notes for design:** Governed generate action; honesty-first empty/error copy (never "Nothing here yet"); Ask-AnA is a scoped prompt hand-off.

### ScopeSwitcher — `surface/ScopeSwitcher.tsx`
- **Purpose:** Pick the active report scope (type + identifier). Controlled, presentational.
- **Controls:** `Select` "Scope" with options **Account, Program, Project, Study, Submission, Document** (enum order); `Input` "Scope identifier" placeholder "Enter the scope identifier". Both disable while a downstream action is in flight.
- **Notes:** Uses design-system primitives (`Select`, `Input`, `Label`), never raw HTML controls; labelled with `aria-label`.

### ReportCatalog — `surface/ReportCatalog.tsx`
- **Purpose:** List report types allowed for the active scope; one **"Generate"** per type.
- **Layout:** `in-card`, h3 "Report catalog"; each row = type `label` + `family` subtitle + Generate button.
- **States:** Empty (scope allows nothing): "No report types are enabled for the {scope} scope. Switch scope to see the types it can produce." Generate disabled while `generating` (mutation in flight or no org).
- **Data:** Filters `types` by `allowedScopes.includes(scope)`; `onGenerate(typeId)`.

### ReportView — `surface/ReportView.tsx`
- **Purpose:** Render a full `RenderedReport` — identity header, truthfulness banner, sections of blocks, PDF export.
- **Layout & regions:**
  - Header: `h1` = `reportTypeId`; **status pill**; spacer; **"Export to PDF →"** anchor (real GET to `{REPORT_OS_BASE}/runs/{runId}/export.pdf`, opens new tab; omitted when no runId).
  - Subhead line: `{scopeType} · {scopeId} · generated {date}` (+ ` · allowed status {allowedStatus}` when truthfulness present).
  - **Truthfulness banner** (amber, `role=status`) shown when status ≠ final OR downgraded: title "{Pill} — blocking gaps" or "Status downgraded by truthfulness gate (downgraded from {x})"; bulleted `truthfulness.reasons`.
  - Sections: each `in-sec` with `h2` title and its `ReportBlockView` blocks.
- **Status vocabularies (verbatim pills):** `draft`→**Draft** (class `drafted`), `partial`→**Partial** (class `review`), `final`→**Final** (class `complete`).
- **Data:** Reads `RenderedReport` (see types). Export link is a navigable anchor (not a button) to keep it a real GET.
- **Notes for design:** Part 11 / honesty: status downgrade + blocking-gap reasons surfaced inline; export is a governed PDF GET.

### ReportBlockView — `surface/ReportBlockView.tsx`
- **Purpose:** Render one `ReportBlock` by its discriminant `kind`. Unknown kinds render nothing (forward-compatible).
- **Block kinds & rendering (verbatim):**
  - `summary` — muted paragraph.
  - `narrative` — serif body + uppercase tag **"AI-generated narrative · {disclosure}"** (AI honesty marker).
  - `metric` — KPI card: label, value (`—` when null) + optional unit; status chip **Ready / Partial / Missing** (olive/amber/red); provenance shown as **"Source on hover"** (title/aria-label "Derived from {sourceTable}.{field} #{recordId} · {transformation}").
  - `table` — column headers + rows (`—` for null cells); provenance on hover.
  - `chart` — wraps `ChartBlock` (see §1 charts).
  - `gap-list` — items with severity label **Critical / High / Medium / Low** (colors `#8a3a3a / #c84a4a / #d97706 / muted`), title + optional message.
  - `blocker-list` — items each tagged **"Blocking"** (dark red).
  - `disclosure` — amber `role=note` "Method disclosure": method text, **Validated / Not validated** + confidence %, italic note.
- **Notes for design:** Tone always carried by a text label, never color alone; provenance never fabricated (omitted when absent).

### Insights chart kit — `client/src/concept2cure/insights/charts/`
Recharts-based, governed palette, each chart renders a visually-hidden `DataTableFallback` (WCAG "color never alone"). Dispatcher `ChartBlock` parses an untrusted `spec` defensively and renders a quiet "Unsupported chart: {x}." note for unknown kinds.
- **`ChartBlock.tsx`** — governed dispatcher mapping `chartType` → chart; defensive `asNumber/asString/asRecordArray/asTone` parsers.
- **`kinds.ts`** — fixed chart-kind union: `readiness_ring, bar, trend, stacked_bar, forecast_band, calibration`.
- **`ReadinessRing.tsx`** — radial 0–100 gauge; color thresholds ≥80 success / ≥50 warning / else error; center "{n}%".
- **`ProgramBar.tsx`** — horizontal bars per program, tone `ok/warn/risk` → olive/amber/red; cols Program/Value/Status.
- **`TrendLine.tsx`** — single-series line over time (x/y).
- **`LifecycleStackedBar.tsx`** — stacked bar **Approved (olive) / In review (amber) / Draft (stone)** per group.
- **`ForecastBand.tsx`** — p50 line + shaded p50–p90 band in **AI blue** (#6a9bcc) signalling AI-derived projection.
- **`CalibrationPlot.tsx`** — reliability scatter (predicted vs observed, 0–1) with diagonal reference line; point size = bucket count.
- **`DataTableFallback.tsx`** — `sr-only` `<table>` mirroring each chart's values for assistive tech.
- **`tokens.ts`** — single palette source: canvas `#faf9f5`, accent terracotta `#d97757`, AI blue `#6a9bcc`, success olive `#788c5d`, warning amber `#d97706`, error `#dc3545`, neutral stone steps; motion 200ms ease-out (no spring/bounce). `useReducedMotion.ts` disables animation under `prefers-reduced-motion`.

### Insights data layer (`data/`, `hooks/`)
- **`data/types.ts`** — client mirror of the server render model. `ReportScope` = account|program|project|study|submission|document. `ReportRunStatus` = draft|partial|final. `ReportBlock` union (8 kinds above). `RenderedReport`, `ReportTypeSummary` (`typeId,label,family,allowedScopes,allowedPersonas`), `ReportRunSummary` (`id,reportTypeId,scope*,status,confidence,blockers?`), `ProgramGroupSummary`, `ReportRunDependency`, `TruthfulnessEvaluation` (`allowedStatus, downgradedFrom?, reasons[]`).
- **`data/api.ts`** — typed client over `apiRequest` (Bearer JWT + `x-organization-id`), unwraps `{data}` envelope. `REPORT_OS_BASE = '/api/report-os'`. Functions/endpoints:
  - `GET /api/report-os/taxonomy` — report types
  - `GET /api/report-os/scopes` — scope enum
  - `POST /api/report-os/runs` — generate a run (`CreateReportRunInput`)
  - `GET /api/report-os/runs?…` — list runs (filters: scopeType, scopeId, status, reportTypeId, search, sortBy[createdAt|completedAt|confidence|status|reportType|scopeType], sortOrder, limit)
  - `GET /api/report-os/runs/:id/rendered` — rendered document
  - `GET /api/report-os/runs/:id/dependencies` — provider dependency records
  - `GET /api/report-os/runs/:id/export.pdf` — PDF (used as anchor)
  - `GET /api/report-os/program-groups?organizationId=` — program groups (org actually bound from JWT)
- **`hooks/useInsights.ts`** — React Query hooks: `useReportTypes` (5m stale), `useReportRuns` (30s), `useRenderedReport` (60s, enabled when runId), `useRunDependencies`, `useProgramGroups`, `useGenerateReport` (invalidates runs caches on settle). Keys in `hooks/queryKeys.ts` under namespace `['concept2cure','insights',…]`.

---

# 2. Intelligence cluster (Phase 11)

### IntelligenceApp / IntelligenceRoute — `intelligence/App.tsx`, `IntelligenceRoute.tsx`
- **Route / entry:** Mounted by host (ZenApp) as the `intelligence` LayoutMode; `?tab=`/rail click sets `initialNav` ∈ `protocol|cmc|biostat|reporting` (default `protocol`). `IntelligenceRoute` just imports `app.css` and re-exports the App. Props: `initialNav?`, `onAskAna?`, `onNavigate?`.
- **Purpose:** Read-only intelligence shell; routes between four surfaces. All mutation deep-links to Authoring.
- **Layout & regions:** `in-shell` = LEFT `Rail` + RIGHT `in-main` (`TopBar` + page with active surface). `data-screen-label="Intelligence · {Here label}"`.
- **Controls & actions:** Rail switches `activeNav`; TopBar Ask-AnA palette button fires the first suggestion for the active tab; `onOpenAuthoring(rulePack)` calls `onNavigate('authoring')` + an AnA prompt "Open authoring with rule pack {x}".
- **Notes:** Authoring (Phase 9) not yet routed in v2 — deep-links rely on host fallback.

### Rail — `intelligence/shell/Rail.tsx`
- **Layout:** Logo "Concept2Cure**.RI**"; section "Intelligence"; four nav items (see below) with `aria-current`; spacer; "Cross-links" section with rail links: **"← Back to home"** (`projects`), **"Biopharma"** (`biopharma`), **"Medtech / IVD"** (`mdx`).
- **Nav items (from `data.ts INT_NAV`, verbatim labels + descriptions):**
  - **Protocol and Study Design** (microscope) — "Study design templates, endpoint libraries, active protocols and amendments."
  - **CMC Module** (beaker) — "Chemistry, manufacturing, controls — drug substance, drug product, stability, specs."
  - **Biostatistics** (sigma) — "Statistical analysis plans, sample-size calculations, TLF packages, interim analyses."
  - **Reports** (barChart3) — "Readiness dashboards, timeline forecasts, precedent likelihood models."

### TopBar — `intelligence/shell/TopBar.tsx`
- **Layout:** Breadcrumb "Concept2Cure.RI › Intelligence › {Here label}"; spacer; **Ask-AnA search** button (label `topbar.askAna`, kbd ⌘K); `LanguageSwitcher` (i18n); icon buttons **filter / notifications / help** (titles via i18n `topbar.*`).

### ProtocolSurface — `intelligence/surfaces/Protocol.tsx`
- **Purpose:** Active protocols + endpoint library + amendments; hand-off rule pack `protocol:ich`.
- **Layout & regions:**
  - 4 KPI cards: **Active protocols** (count, "{blocked} blocked · 1 overdue amendment"); **Templates** (28, "ICH E6 R3 · adaptive · master protocol"); **Endpoint library** (count, "Indication-mapped to precedent"); **Amendments in flight** (count, "1 IRB pending · 1 IRB approved").
  - **Active protocols** table — header link **"Open in authoring →"**; columns: Protocol, Program, Indication · phase, Sites · enrolled, Lead, **Status**, Updated, ⋯ menu. Row status pill (`in-status {status}`).
  - **Split:** "Endpoint library" card (kind, hint, guidance, precedent count) + "Amendments" card (id, what, kind, status · updated).
  - `AnaStrip` footer (3 protocol prompts).
- **Status vocabularies:** protocol `status` = **active / complete / blocked**; amendment status strings "IRB pending / IRB approved / Filed"; amendment kind "Substantial / Non-sub".
- **Data:** `useProtocols()` → `GET /api/intelligence/protocol` (per-field `?? fixture`). Fixture programs are "BX-…" oncology/IPF/SMA examples.

### CmcSurface — `intelligence/surfaces/Cmc.tsx`
- **Purpose:** Portfolio CMC packages + stability + spec library; hand-off rule pack `mod3:ich`. NOTE in code: a richer standalone CMC module exists at `client/src/concept2cure/cmc/`; rail ownership is an open designer question (HANDOFF.md).
- **Layout & regions:**
  - 4 KPIs: **Active CMC packages** ("2 commercial (lifecycle)"); **Stability programs** ("Avg {n}% complete"); **Batches on file** ("73 GMP · 12 PPQ"); **Open deviations** ("2 critical · 4 minor", `delta-warn`).
  - **CMC packages** table — header link **"Module 3 in authoring →"**; columns: Program, Kind, DS site, DP site, Shelf life, Batches, Stability %, **Open finding** (blocker text or "No open findings"), **Status**.
  - **Split:** "Stability programs" card (program · kind, target/completed, %) + "Specification library" card (4 fixed spec rows w/ versions, e.g. "Drug substance (mAb · IgG1κ) · ICH Q6B aligned · 23 CQAs · v4.1").
  - `AnaStrip` (cmc prompts).
- **Status vocabularies:** package `status` = **active / commercial**.
- **Data:** `useCmc()` → `GET /api/intelligence/cmc` (fixture fallback).

### BiostatSurface — `intelligence/surfaces/Biostat.tsx`
- **Purpose:** SAP table + TLF queue + interim analyses + sample-size calculator; hand-off rule pack `mod2:ich`.
- **Layout & regions:**
  - 4 KPIs: **Active SAPs** ("{review} in review · {drafted} drafted"); **Power studies open** (3, study list); **TLF builds queued** ("Earliest due in 20 days"); **Interim analyses** ("All DSMB pre-planned").
  - **Statistical analysis plans** table — header link **"Open in authoring →"**; columns: SAP, Program, Study, Primary endpoint (+ alpha · power sub), Power/size, Owner, **Status**, Updated.
  - **Split:** LEFT card "TLF queue" (id · program, what · due in, %, status pill) + nested "Interim analyses" (study · kind, dsmb, date); RIGHT card "Sample-size calculator" — `in-calc` with 4 **uncontrolled inputs** (Alpha 1-sided, Power, Effect delta, Std dev) over fixture defaults, and an output "Sample size {expected} subjects (240/240)". (No compute endpoint wired yet — audit-only server compute planned.)
  - `AnaStrip` (biostat prompts).
- **Status vocabularies:** SAP `status` = **review / approved / drafted**; TLF status = **building / queued**.
- **Data:** `useBiostat()` → `GET /api/intelligence/biostat` (fixture fallback).

### ReportsSurface — `intelligence/surfaces/Reports.tsx`
- **Purpose:** Readiness bar chart + precedent-likelihood models + timeline forecast. Read-only (no authoring hand-off).
- **Layout & regions:**
  - **Sample-data notice** (amber `role=note`, `data-testid="reports-sample-notice"`) when `isSample`: "Sample data — not live. Connect live reporting to replace these figures. Export is disabled until data is live."
  - 4 KPIs: **Programs tracked** ("Across MDX + Biopharma"); **Avg readiness** % ("+4 vs last week"); **Forecast confidence** % ("model: ridge + historical reviewer-velocity"); **Precedent matches** ("RIM cross-agency corpus").
  - **Split:** "Submission readiness · by program" horizontal bar list (tone ok/warn/err) + "Precedent-likelihood models" card (name, applied-to programs, basis, output e.g. "0.81 · high").
  - **Timeline forecast vs target** table — columns Program, Milestone, Target, Forecast, **Δ** (green if negative/early, amber if late), Conf. %. Header export control: when live, **"Export PDF →"** (fires AnA prompt); when sample, disabled label **"Export unavailable (sample data)"**.
  - `AnaStrip` (reporting prompts).
- **Status vocabularies:** bar tone **ok / warn / err** → green/amber/red.
- **Gating / honesty:** `isSample = true` unless ALL of kpis+bars+forecast+models came from the server (route currently only populates `forecast`). Sample data must not be exported as a governed report.
- **Data:** `useReports()` → `GET /api/intelligence/reports` (fixture fallback + `isSample` flag).

### Intelligence shared (`data.ts`, `hooks.ts`, `AnaStrip.tsx`, `icons.tsx`, `app.css`)
- **`hooks.ts`** — `useProtocols/useCmc/useBiostat/useReports` over `useFetchJson` on `/api/intelligence/*`, each falling back per-field to fixtures in `data.ts`. Read-only (no mutations in Phase 11).
- **`AnaStrip.tsx`** — 3 scoped suggestion chips per surface (`INT_SUGGESTIONS`), each fires `onAsk(q)`.
- **`data.ts`** — all fixture shapes (the live-data contract) + nav + suggestions; designed "BX-…" portfolio sample data.
- **`icons.tsx`** — inline SVG icon set (`I.*`).

---

# 3. API route-group catalog (server)

~200 `/api/*` groups are registered across `server/bootstrap/register-*-routes.ts`. Below is a concise group→UI mapping (one line per group/cluster); not every leaf file is listed. ✅ live / 🟡 partial follows the existing inventory where known.

## 3.1 Insights / Intelligence backends (this scope's UIs)
- `/api/report-os/*` — **Insights surface (Report-OS).** taxonomy, scopes, runs (create/list/rendered/dependencies/finalize/export.pdf), program-groups (+snapshots), bundles, deliveries, correspondence/capture, health. Backs `InsightsSurface` end-to-end.
- `/api/insights/*` (`report-os-insights.ts`) — Report-OS **quality scores, predictions, subscriptions** (CRUD). Augments Insights (AI quality/insights panel + subscriptions).
- `/api/intelligence/*` (`intelligence-cluster.ts`) — **Intelligence cluster** `GET /protocol|/cmc|/biostat|/reports`. Backs the four Intelligence surfaces (currently thin; surfaces fixture-fallback).
- `/api/intelligence/projects/:id/*` (`intelligence.ts`) — per-project **recommendations, readiness, profile(+enrich), memory, next-actions, feedback(+summary), cross-module, dashboard, RIM assess/signals/cross-artifact/section**. Backs project-level intelligence/readiness widgets (not the Phase-11 cluster).

## 3.2 AnA RI engine (chat/intelligence core)
- `/api/ana-ri/*` (`server/routes/ana-ri/`: chat, generate-execute, kernel, lookups, plan, post-processing, seal-verified, stream, threads, utility) — **AnA RI conversational engine**: threads, streaming chat, plan/generate/execute, verified-seal, lookups. Backs the AnA assistant strip/console across surfaces.
- `/api/ana-ri/*` inline (`ana-ri-inline-routes.ts`) — vector search, endpoint recommend, retention policies, ask-ana-ri.
- `/api/ana`, `/api/ana-biostats`, `/api/ana-cortex`, `/api/ana-1-0-ri-cortex`, `/api/ana-tool-policy`, `/api/claude` (`ana-intelligence.ts`) — AnA model/provenance/cortex/tool-policy endpoints backing AnA features + gap analysis.

## 3.3 Global Regulatory Intelligence — `/api/global-ri/*` (39 jurisdiction/domain route groups)
Mounted via `global-ri.routes.ts` (auth + AUTHOR role + rate limiter); each domain router under `server/routes/global-ri/` mounts at root, every full path carries its own prefix. Each domain typically exposes a `GET` reference/checklist + `POST` assess. **UI:** per-domain checklist/assessment screens + guidance cross-refs (Global RI workspace). The 39 domain files:
`cmc, cta, pediatric, exclusivity, inspection, device, companion-diagnostics, pharmacovigilance, safety-reporting, labeling, promotional-compliance, stability, process-validation, expanded-access, advanced-therapies, controlled-substances, bioequivalence, submission-format, module1, timeline, programs, reliance, import-export-licensing, establishment-registration, clinical-evidence-standards, dossier, nonclinical, impurities, combination, changes, disclosure, gdp, gcp, guidance, catalog, fees, strategy, lifecycle, promotional-compliance`. (See doc §7.2 for per-domain detail; `GET /api/global-ri/catalog` lists the full endpoint catalog.)
- `/api/global-compliance`, `/api/global-markets`, `/api/region-profiles` — cross-jurisdiction compliance + market/region profiles backing the global readiness map.

## 3.4 Submission / dossier / authoring (consumed by submission & authoring UIs, not this scope's surfaces)
- `/api/submissions`, `/api/submission-center`, `/api/submission-ops`, `/api/submission-orchestrator`, `/api/submission-readiness`, `/api/regulatory-submissions`, `/api/ectd`, `/api/ctd`, `/api/packager`, `/api/docx-factory`, `/api/export`, `/api/tenant-export` — submission assembly/packaging/readiness/export.
- `/api/authoring`, `/api/authoring-actions`, `/api/authoring-pdf`, `/api/document-authoring`, `/api/coauthor`, `/api/content-assembly`, `/api/predictive-sections`, `/api/project-sections`, `/api/cerv2-sections` — authoring engine (Phase 9 hand-off target for Intelligence).
- `/api/ind*` (forms, master-data, lifecycle, sections, submissions, generation, autodraft, pdf), `/api/510k*`, `/api/q-sub`, `/api/pma-workflow`, `/api/substantial-equivalence`, `/api/predicate-intelligence` — IND / 510(k) / De Novo / PMA lifecycle.

## 3.5 Domain modules (each backs its own LayoutMode/workspace)
- `/api/cer`, `/api/cerv2*` — Clinical Evaluation Reports (CER/CERV2 workbench).
- `/api/cmc` — standalone CMC module (distinct from Intelligence/Cmc tab — see open question).
- `/api/biostat`, `/api/biostat-design-stats` (`biostatPlatform.ts`) — biostatistics platform (sample size/power) backing the Biostatistics LayoutMode.
- `/api/mdx`, `/api/pdev`, `/api/biopharma`, `/api/device-*`, `/api/ivdr`, `/api/udi-ivdr`, `/api/companion-diagnostics`, `/api/diagnostics-performance` — Medtech/IVD/Biopharma/Pdev clusters.
- `/api/protocol-*` (amendments, consent, deviations, milestones, portfolio, reviews, risks, templates, export, development) — protocol management (Intelligence/Protocol live source candidates).
- `/api/study-design`, `/api/csr*`, `/api/precedent-engine`, `/api/saved-precedent-queries`, `/api/regulatory-precedent-intelligence` — study design + CSR + precedent.
- `/api/rim`, `/api/regulatory`, `/api/regulatory-intelligence`, `/api/regulatory-assessments`, `/api/regulatory-correspondence`, `/api/regulatory-programs`, `/api/ha-interactions`, `/api/haq-manager` — RIM + regulatory intelligence/correspondence/HAQ.
- `/api/pharmacovigilance`, `/api/manufacturing`, `/api/clinical-operations`, `/api/stability`, `/api/nonclinical`, `/api/preclinical`, `/api/post-market`, `/api/inspections`, `/api/capa*` — operational regulatory modules.

## 3.6 Analytics & reporting (other than Report-OS)
- `/api/analytics` (`analytics-routes.ts`) — protocol upload/analyze, dashboard, export, demo-analysis. Backs analytics dashboards + protocol analyzer.
- `/api/intelligent-reports`, `/api/csr-analytics`, `/api/coverage-analysis`, `/api/dossier-readiness`, `/api/foresight*` — report generation, CSR analytics, coverage/forecast.

## 3.7 Platform / governance / cross-cutting (not surfaced by this scope, listed for the map)
- `/api/auth`, `/api/users`, `/api/user`, `/api/tenants`, `/api/tenant-users`, `/api/enterprise`, `/api/api-keys` — auth/identity/tenancy.
- `/api/part11`, `/api/esignature`, `/api/audit-*`, `/api/decision-lineage`, `/api/data-lineage`, `/api/evidence*` — 21 CFR Part 11 e-sign, audit trail, lineage/provenance.
- `/api/billing`, `/api/billing-dashboard`, `/api/pm-settings`, `/api/client-branding`, `/api/notifications`, `/api/collaboration`, `/api/tasks`, `/api/templates`, `/api/documents`, `/api/upload`, `/api/corpus`, `/api/telemetry`, `/api/admin/*` — billing, settings, branding, notifications, collaboration, tasks, docs/corpus, telemetry, admin.
- `/api/firecrawl*`, `/api/external-evidence`, `/api/external-intelligence`, `/api/grant-finder`, `/api/grants`, `/api/deep-research`, `/api/knowledge*` — external ingestion/research/knowledge.

---

### Open questions / gaps
- **Intelligence cluster live endpoints are thin.** `/api/intelligence/{protocol,cmc,biostat,reports}` exists but currently populates few fields (e.g. reports only `forecast`), so surfaces show sample/fixture data flagged via `isSample`. Designers should treat Intelligence-cluster numbers as sample until backend lands.
- **CMC rail ownership** — two CMC surfaces exist (Intelligence/Cmc tab vs standalone `client/src/concept2cure/cmc/`); which owns the home-rail `cmc` entry is an explicit open designer question (HANDOFF.md). Not in this scope's files to resolve.
- **Authoring hand-off targets (`protocol:ich`, `mod3:ich`, `mod2:ich`)** route to a Phase 9 Authoring module not yet wired in v2; the host fallback handles the unknown target. Final landing screen TBD.
- **Sample-size calculator** inputs are uncontrolled with no compute endpoint yet (audit-only server compute planned per PHASE_11_INSTALL.md §3); the displayed sample size is the fixture value, not recomputed.
- **Insights `onAsk` / Ask-AnA** prompt hand-off is not wired to a backend in these files — the host must connect it to the AnA console.
- **Exact per-endpoint method/auth detail for the 39 global-ri domains** was summarized at the group level (per task scope), not enumerated leaf-by-leaf; `GET /api/global-ri/catalog` is the authoritative runtime list.
- The `/api/report-os` vs `/api/insights` split: `report-os.ts` is the run engine; `report-os-insights.ts` adds quality/predictions/subscriptions — both feed the one Insights screen but only the former is bound in `data/api.ts` (subscriptions/quality not yet consumed by the inventoried client files).

---

# 09 — Reconciliation Backlog & Master Gaps (read before you design the system)

The eight inventory parts above describe the surfaces as they exist. This part collects the **cross-surface inconsistencies, duplications, and unfinished seams** that a redesign should resolve deliberately rather than faithfully reproduce. Each item names what diverges and where, so the design team can make one decision that propagates everywhere.

## 9.1 Duplicated / overlapping surfaces — pick one home for each

| Concern | Surfaces that overlap | Decision needed |
|---|---|---|
| **Document authoring** | `concept2cure/authoring/` (Universal Authoring: Conversation/Workbench) **vs** `components/claude-ectd-coauthor/` | Two authoring engines with different chrome. Converge on one, or define a clear division (e.g. universal authoring vs eCTD-specific co-author). |
| **CMC / Module 3** | `concept2cure/cmc/` (standalone, fully-live, 9 surfaces) **vs** `intelligence/surfaces/Cmc.tsx` (sample readiness dashboard) | Two CMC surfaces with unresolved rail ownership. Decide which owns the CMC nav slot. |
| **"Reports"** | `insights/` Report-OS (live render engine) **vs** `intelligence/surfaces/Reports.tsx` (sample dashboard) | Same word, two engines. Disambiguate naming and IA. |
| **Command palette** | Home's palette **vs** ZenApp's palette **vs** per-shell ⌘K (MDX, tasking, etc.) | Multiple ⌘K implementations. Unify into one command system. |
| **AnA presence** | Full-screen AnA RI app **vs** dockable AnA rail (MDX/biopharma/pdev/intelligence) **vs** per-surface AnA "strip/chip" | Define one AnA component with display modes rather than several. |
| **File upload** | 4 overlapping uploader components in `components/ui/` | Collapse to one. |
| **Toasts** | react-toastify (bounce animation) **vs** Radix toast | Two notification systems; pick one (and kill the bounce — violates motion discipline). |

## 9.2 Token & theming fragmentation — the #1 design-system problem

Four coexisting token namespaces disagree with each other:
- **Canonical:** `design-system/colors_and_type.css` (= `claude-design.css`) — OKLCH, brand `#D97757`, `--bg-*`/`--text-*`/`--accent-main-*`, `--dur-normal: 200ms`, no-overshoot easing, class-based "never shout" type ramp.
- **Bridge:** the `--shadcn-*` HSL variables in `index.css` (what the shadcn primitives actually consume).
- **Legacy:** `zen.css` and `theme.css` (double `:root`), plus `high-contrast.css`, `theme.json`, `toast.css`.

They disagree on: the darker-terracotta variant, the warning/error hex values, the heading font (**Styrene B vs Lora vs Poppins**), and whether spring easing is allowed. There is also a **`--danger` vs `--error` vs `--destructive`** naming split. And `statesV2.tsx` (a canonical state-component kit) uses **raw Tailwind grays/blue instead of the OKLCH tokens** — so the very components meant to standardize empty/error states are off-palette. **Action:** establish one token source of truth and a single semantic naming scheme, then map every primitive to it.

## 9.3 AnA identity & model-name inconsistency

The product rule is "AnA" with no exposed model name — but it leaks:
- `biopharma/` and `cmc/` say **"AnA 1.0"** (no model name — correct).
- The **PDEV** dock surfaces **"Claude Opus 4.5"** (exposes a model — violates the rule).
Pick one identity string and one policy on whether/where a model name ever appears, and apply globally. (The model-effort picker, when shown, is itself flag-gated — `ENABLE_MODEL_EFFORT_PICKER`, default off.)

## 9.4 Governed-action dialog divergence

Three dialogs implement the Part 11 ladder (§0.5): `EsignModal` (canonical, full §11.50/100/200), PDEV's `PdevConfirmDialog` (typed-confirm + reason + SHA-256 chain), and the shell's `ReasonModal` (reason only). Quality delegates *all* governed actions to AnA rather than mutating directly; Communication uses the real `EsignModal`; MDX/CMC/PDEV each wire their own. **Action:** define one governed-action component family with explicit tiers (reason-only / typed-confirm-force / full e-sign) and route every surface through it.

## 9.5 Status-vocabulary divergence across surfaces

Although `data-status` is unified for *styling*, the *enums themselves* differ per surface: transmittal `Pending→Completed` + ACK1/2/3; eSTAR `complete/review/draft/na/empty`; doc `draft/review/ready/locked`; correspondence `open/in_review/closed`; PDEV's 14-state activity lifecycle + 5 stages + 4 workstreams; IVD class A–D; signal `critical/review/watching`; program `idle/active/blocked/complete`. These are legitimately different domains, but several express the same idea (draft→review→ready/approved→locked) in different words. **Action:** define a canonical lifecycle spine and map each domain vocabulary onto it, so a designer styling one understands all.

## 9.6 The dead LayoutMode catalog

`ZenApp.tsx` switches on a ~110-member `layoutMode` union, but ~27 redirect-on-mount and ~45 fall through to a final `<Redirect>`. Only ~16 render distinct surfaces. **Action:** the redesign's IA should be built from the ~16 real surfaces (+ the 4 bundle entries), not the historical mode list. The org/workspace switcher is currently a **stub** (hardcodes "BioNova Therapeutics" → opens Settings) and needs a real multi-tenant design.

## 9.7 Sample-vs-live coverage map (what is real today)

Designers should know which surfaces show real data vs fixtures, because the "Sample data" state is a first-class design state:
- **Fully live (no fixtures):** CMC (`/api/cmc/*`), PDEV (`/api/pdev/*`), Submission gateway transmittals, Insights Report-OS render.
- **Live core + sample reference panels:** Biopharma (live programs/correspondence; sample reference dashboards), MDX surfaces (fixture-backed with explicit "sample data" markers; live editors handed to host shell).
- **Sample / fixture-backed today:** Intelligence (all four tabs — Protocol/CMC/Biostat/Reports — `isSample`, export disabled until live), several AnA trust panels (Concordance, SE-table, PER, GSPR, CRL-premortem) implemented but not yet wired into the AnA shell pending BUILD-1 integration.

## 9.8 Master gaps & open questions (could not be determined from client code)

Carried up from each part's "Open questions":
- **Feature-flag defaults & per-org enablement** — 28 flags exist; 3 default-off including both `ENABLE_ANA_*`. The exact per-org rollout rules live server-side (`organizations.settings.features`) and aren't fully visible in the client.
- **Settings modal contents** — the org/workspace/settings surface was out of every agent's scope and is under-specified.
- **AnA chat internals at the service layer** — `useAnaChat`, the command executor (~80 commands), and the ~195–270 AnA tools are referenced by the UI but their full request/response shapes are server-side (see the route-group catalog in Part 8 and the AnA tool/command appendices in `UI_CODEBASE_STUDY.md`).
- **Exhaustive data-fixture rows and exact hook payload shapes** — enumerated structurally, not row-by-row.
- **`icons.tsx` glyph sets** — each shell has its own icon module; the full glyph inventory was not transcribed.
- **CAPA / inspection screens** — there are no standalone ones; CAPA is a controlled document and inspection is an AnA prompt. A redesign may want first-class surfaces here.

## 9.9 Companion documents

- `ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md` — deep, opinionated design spec for the AnA Document Studio flagship (data-status contract, verdict matrix, e-sign field spec, per-component specs, microcopy, layout, print, design-QA checklist).
- `UI_CODEBASE_STUDY.md` — conceptual model of the document lifecycle + AnA command/tool appendices (~80 commands, ~270 tools, SSE events, route-group catalog, role model).
- `FEATURE_AND_SERVICE_INVENTORY.md` — backend/service-domain inventory (submission, biopharma, authoring engine, AnA layer, evidence/knowledge, specialist/quality, platform/global-RI).
- The `HANDOFF_TO_DESIGN_*.md` set — focused handoffs (dossier reconciliation, EU/global data, HEOR/market access, medical coding, regulatory currency, RIM/memory).

Together with the eight inventory Parts above, these give the design team the full breadth (this document) and the full depth (the companions) of the product.
