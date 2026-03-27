# Post-Phase-7 UI Coherence Audit

**Date:** 2026-03-27
**Auditors:** 3 independent agents (Navigation, Naming, Visual Density)
**Scope:** Full product evaluation after Phases 1-7

---

## Overall Score: 7.5 / 10

**Architecture: 9/10.** Navigation model is correct, internally consistent, zero dead ends.
**Naming: 9/10.** Two minor violations remain (VaultPage folder label, 510k-workspace action truthfulness).
**Visual coherence: 6.5/10.** Color language splits between monochromatic and polychromatic zones.

---

## What Now Feels Production-Grade

1. **Global shell (6 items)** — Exactly 6, no extras, no legacy. NewDropdown has click-outside, Escape, full ARIA. Badge palette reduced to 3 colors. Every item has a real destination.

2. **Project shell (5 tabs)** — Appear/disappear correctly with project selection. Every tab renders a real component. Review is now inline, not a viewport takeover.

3. **ProjectHomeDashboard** — The benchmark. Single readiness line, clean artifact list, text-link actions. 9/10. Would ship.

4. **SetupPage** — Clean 7-section card layout with quick links. 8/10. Calm and organized.

5. **Onboarding** — 4 screens, no Dr. Sage, no agent theater, track-aware, project creation inline, truthful suggested actions. Props interface clean, ZenApp wiring correct.

6. **Navigation mapping** — PRIMARY_NAV_ID_BY_LAYOUT and SIDEBAR_NAV_TO_LAYOUT are internally consistent. DEMOTED_REDIRECTS safely catches old deep links. Zero orphaned layout modes.

7. **Spacing rhythm** — All pages use consistent 4px/8px/16px/24px grid. 9/10.

---

## What Still Feels Too Dense

1. **ArtifactsPage (6/10)** — Each artifact row has 6-7 scannable elements (icon, title, project name, CTD section badge, version, status badge with icon). 5 status colors (zinc, amber, emerald, blue, violet) create visual noise. Feels like a checklist, not a calm browser.

2. **VaultPage (6.5/10)** — File rows have 5+ elements per line. Uppercase folder headers with tracking-wider add unnecessary visual weight. Status icons inject color variety that breaks the monochrome calm of other pages.

3. **AppsPage (7/10)** — Shows 5-7 app cards at once with full descriptions. Each card has icon + label + description + arrow = 4 text lines. Better than before (was 22 items), but still denser than ProjectHomeDashboard's restraint.

---

## What Still Feels Legacy

1. **ZenSidebar NavItem accent map** — Line 196: `violet` accent maps to blue styling (`bg-blue-100`, `text-blue-600`) instead of violet. Copy-paste error from original code. Not visually broken (both render as blue-ish) but semantically wrong.

2. **VaultPage folder label** — Line 40: `generated: 'Generated Documents'` should be `'Generated'` per the canonical naming model. This was caught in Phase 2 naming audit for ProjectWorkspaceShell but the same label in VaultPage's own FOLDER_LABELS was missed.

3. **SnowGlobeView dead code** — ~230 lines of SnowGlobe/AnA Predictions code still in ReviewReadiness.tsx. Tab removed from visible UI but function body remains. Not harmful but adds maintenance weight.

---

## What Still Feels Semantically Dishonest

1. **510k-workspace action in onboarding** — The Device track confidence screen offers "Open 510(k) Workspace" which routes via `navigate(/concept2cure/project/:id/510k)`. This IS truthful now (fixed in Phase 6.5). However, Agent 2 flagged that the action ID `'510k-workspace'` doesn't exist in SIDEBAR_NAV_TO_LAYOUT or PROJECT_NAV_ITEMS — it's handled by special-case routing in ZenApp's onComplete. Not a bug, but the routing is implicit rather than declarative.

2. **VaultPage "Browse files and evidence"** — Subtitle and search placeholder reference "files" but the data comes from the artifacts API (`/api/concept2cure/projects/:id/artifacts`). What VaultPage actually shows is artifacts grouped by folder, not raw files. The distinction is blurry but the naming leans toward "files" when the data model is "artifacts."

---

## Top 5 Beta Blockers

1. **Color language split** — ArtifactsPage and VaultPage use 4-5 semantic colors (amber, emerald, blue, violet) that appear nowhere else in the product. This breaks the monochromatic calm established by ProjectHomeDashboard, AppsPage, and SetupPage. Fix: unify status badges to zinc background + semantic text color only.

2. **Artifact/Vault row density** — 6-7 elements per row is too much for a calm scanner. Fix: collapse metadata into a single compact info line (e.g., "Module 2.3 · v2 · In Review") instead of separate badges.

3. **VaultPage "Generated Documents" folder label** — Should be "Generated" per canonical naming. 1-line fix.

4. **ZenSidebar violet accent → blue styling** — Line 196 maps violet to blue colors. 1-line fix.

5. **SnowGlobeView dead code** — 230 lines of unused code in ReviewReadiness. Should be removed or extracted.

---

## Top 5 Polish Opportunities

1. **Unify status badge styling across Artifacts/Vault** — Use `bg-zinc-100 text-{semantic}-700` instead of `bg-{semantic}-50 text-{semantic}-700`. This keeps semantic meaning but reduces color volume. Estimated: 20 minutes.

2. **Collapse artifact row metadata** — Group CTD section + version + status into one compact element. Estimated: 30 minutes per page.

3. **Remove SnowGlobeView dead code** — Delete the function and its imports from ReviewReadiness. Estimated: 10 minutes.

4. **Fix violet accent in NavItem** — Change `bg-blue-100` to `bg-violet-100` on line 196. Estimated: 1 minute.

5. **Fix VaultPage "Generated Documents" label** — Change to "Generated". Estimated: 1 minute.

---

## Recommended Next Phase

**Small cleanup pass.** Not a redesign. Not a feature sprint.

The product is architecturally correct and mostly visually coherent. The remaining issues are:
- 2 one-line naming fixes
- 1 dead code removal (230 lines)
- 1 color unification pass across 2 pages (ArtifactsPage + VaultPage)

This is ~1-2 hours of surgical work, not a phase-sized effort.

After that, the product is beta-ready for the shell, navigation, apps, artifacts, vault, review, and onboarding surfaces. The inner view components (QualityCenterView, ComplianceView, etc. inside ReviewReadiness) and the deep workspace surfaces (ProjectWorkspaceShell internals, GovernedDocumentPanel) are pre-Phase-1 code that wasn't in scope.

---

**No code was changed in this audit. This is a report only.**
