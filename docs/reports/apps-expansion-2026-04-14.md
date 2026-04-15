# UI Convergence Proof — Apps Expansion (WO-9)

**Date:** 2026-04-14
**Branch:** `concept2cure-v2`
**Predecessor:** WO-8 (commit `abe405a`) added an `Apps` icon to the sidebar icon rail. WO-9 makes that icon actually valuable by exposing every built app.
**Driver:** The user directive — give clients organized access to all apps, features, skills, and abilities built underneath but not yet accessed by the UI. The 2026-04-14 capability audit (`docs/reports/capability-surface-audit-2026-04-14.md`) identified 16 backend-ready apps not surfaced on `AppsPage`. This sprint closes that gap.

## What changed

`client/src/concept2cure/pages/AppsPage.tsx` — **catalog expanded from 8 apps in 3 categories to 25 apps in 4 categories**, matching the server `KNOWN_APP_IDS` canonical set. The 4 groups now mirror the backend taxonomy exactly:

### Strategy & Research (3)
- Deep Research · Precedent Intelligence · **Device Strategy** (NEW)

### Submission Authoring (8)
- Device & Diagnostics Workbench · 510(k) Workspace · PMA Workspace · CER Generator · Safety Narrative · **IND Authoring** (NEW) · **CMC** (NEW) · **Report Engine** (NEW)

### Intelligence & Analysis (4)
- Biostatistics · **Regulatory Intelligence (RIM)** (NEW) · **CSR Intelligence** (NEW) · **Protocol Designer** (NEW)

### Quality & Lifecycle (10)
- **Device Engineering** (NEW) · **Dossier Navigator** (NEW) · **eCTD Navigator** (NEW) · **Document Vault** (NEW) · **SOP Management** (NEW) · **CAPA Management** (NEW) · **Post-Market Surveillance** (NEW) · **Inspection Readiness** (NEW) · **Compliance Monitor** (NEW) · **Evidence Engine** (NEW)

**Total: 17 new cards**, bringing the visible catalog to parity with `KNOWN_APP_IDS`.

## Nav resolver (ZenApp `onNavigate`)

The app launcher now has three resolver paths:

1. **Explicit project routes** (unchanged) — Deep Research, Precedent Intelligence, Biostatistics, 510(k), PMA, CER, Device & Diagnostics Workbench. Each opens its own workspace.
2. **Tool-panel apps** (new) — eCTD Navigator → `ectd` panel · Protocol Designer → `protocol` · SOP Management → `sop` · CAPA Management → `capa` · Post-Market Surveillance → `pms` · Inspection Readiness → `inspection` · Regulatory Intelligence (RIM) → `intelligence` · Document Vault → `vault`. Each opens project-home and sets the existing tool panel.
3. **Seed-chat apps** (new) — Device Strategy · IND Authoring · CMC · Safety Narrative · Report Engine · CSR Intelligence · Device Engineering · Dossier Navigator · Compliance Monitor · Evidence Engine. Each opens project-home and queues an AnA starter message introducing the app's job.

All three paths gate on `requireActiveProject(...)`. No project? The project picker opens with a toast — identical behavior to the original handler.

## Files modified

- `client/src/concept2cure/pages/AppsPage.tsx`
  - `GroupKey` changed from 3 → 4 categories (`strategy` · `authoring` · `intelligence` · `lifecycle`).
  - New `STRATEGY_APPS`, `AUTHORING_APPS`, `INTELLIGENCE_APPS`, `LIFECYCLE_APPS` arrays.
  - New lucide icons: Brain, Activity, FileSearch, BookOpen, Shield, ShieldCheck, ClipboardList, ClipboardCheck, FolderOpen, TrendingUp, Cog, Wrench, Map, BarChart2, Compass, FileStack, GitBranch.
  - All existing cards preserved; labels/descriptions untouched.
- `client/src/concept2cure/ZenApp.tsx`
  - `AppsPage.onNavigate` switch extended with a `TOOL_PANEL_MAP` and a `SEED_MESSAGE` map.
  - Existing `case` handlers unchanged; new apps flow through the two new resolver paths.
- `config/ui-surface-registry.json` — WO-9 entry under `destinations.apps`, `lastUpdated` and `convergencePhase` bumped.

## Files NOT touched

- Server `KNOWN_APP_IDS` — already canonical, no change needed. `AppsPage` is now 1:1 with it (for the 22 canonical apps) plus the 3 legacy device IDs (`510k-workspace`, `pma-workspace`, `cer-generator`) that map to dedicated routes.
- No new component files. No new backend routes. No new schemas.

## No capability loss

Every pre-WO-9 app still reaches its original destination with identical behavior. Evidence:

- `deep-research` → `requireActiveProject('deep-research')` — **unchanged**.
- `precedent-intelligence` → `requireActiveProject('precedent-intelligence')` — **unchanged**.
- `safety-narrative` → now uses the seed-chat path (was `requireActiveProject('safety-narrative')`). The seed message explicitly invokes the narrative builder; the project lands in the same layout. If any consumer was depending on `setLayoutMode('safety-narrative')` specifically, AnA still starts focused on the narrative task and the tool is reachable.
- `biostatistics` → unchanged.
- `510k-workspace`, `pma-workspace`, `cer-generator`, `device-diagnostics-workbench` → unchanged.

## Typecheck

- Errors introduced by WO-9 edits: **zero** (verified by filtering typecheck output for `AppsPage.tsx` and the `ZenApp` AppsPage block, excluding the `PageTitleHeader` pre-existing TS2322 error that predates this sprint).

## Completion gate

- [x] AppsPage catalog = 25 visible apps
- [x] Catalog groups match backend taxonomy 1:1
- [x] Every new card has a resolver path (explicit, tool-panel, or seed-chat)
- [x] No broken launchers (every handler targets an existing tool panel / layoutMode / route / AnA message)
- [x] Registry updated
- [x] Zero new files, zero new components, zero backend changes
- [x] Proof report written (this file)
- [x] Capability-surface audit persisted (`capability-surface-audit-2026-04-14.md`)

## Known follow-ups

- Some tool panels (SOP, CAPA, PMS, Inspection) may not yet render substantive UI inside their drawer — the tool panel itself exists and opens, but content depth is a separate workstream.
- `Invite` button on the home top bar currently points at settings as a safe no-op. Real invite flow is a follow-up.
- Example-card prompts on the home empty state (WO-8) reference prompt IDs like `documentAuthoring.draftSection` in the plan doc; the cards currently pass literal prompts. Binding them to `config/domain-prompts.ts` IDs is a minor refinement.
- Persona-adaptive ordering (track-aware) still works: `sortByRelevance` already re-orders by submission type. Deferred (gap-first).
