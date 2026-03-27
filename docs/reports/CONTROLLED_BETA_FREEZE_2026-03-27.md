# Controlled Beta Freeze

**Date:** 2026-03-27
**Branch:** `concept2cure-v2`
**Status:** FROZEN for controlled beta

---

## What Is Frozen

All UI shell, navigation, onboarding, and page-level surfaces built in Phases 0-8.5:

- ZenSidebar (6 global items + 5 project tabs)
- ZenApp routing and layout mode system
- FirstRunExperience (4-screen onboarding)
- ProjectHomeDashboard (Overview tab)
- AppsPage (tabbed launcher)
- ArtifactsPage (browser with filters)
- VaultPage (folder-grouped browser)
- SetupPage (settings launcher)
- ReviewReadiness (6-tab inline review)
- Naming model (Artifacts/Work/Vault/Review/Submit)
- Submission badge color palette (violet/blue/zinc)

---

## What Is Allowed During Beta

- Bug fixes for **user-visible issues** reported by beta testers
- Copy/text corrections if a label is confusing
- API response handling fixes if real data reveals a parsing issue
- Accessibility fixes if a tester reports a keyboard/screen-reader problem

---

## What Is NOT Allowed During Beta

- New features or pages
- New navigation items
- Layout restructuring
- Design system changes (colors, spacing, typography)
- Onboarding flow changes (unless a blocker is found)
- Review inner-view rewrites
- Dr. Sage cleanup (deferred to post-beta)
- SnowGlobe dead code removal (deferred)
- Broad refactoring of ZenApp.tsx

---

## Known Caveats

1. **Vault is browse-only.** No file upload. Users can browse artifacts grouped by folder but cannot upload through Vault. Workaround: upload via Work tab or AnA.

2. **Dr. Sage code exists** in `components/dr-sage/` (4 files). Imported in ZenApp. Not rendered during onboarding or in project tabs. May be visible if user reaches the global Dr. Sage layer through a legacy path.

3. **Review inner views are dense.** The 6 sub-views (Quality, Compliance, Readiness, Evidence, Audit, Traceability) were not part of the restraint pass. They work but feel denser than the rest of the product.

4. **SnowGlobeView is a null stub** in ReviewReadiness. Dead function body exists as `_removed()`. Unreachable. Cosmetic debt.

5. **`as any` casts** in ZenApp (12 instances). Pre-existing. Not in new code. Not user-visible.

---

## Deferred Technical Debt

| Item | Priority | Effort |
|------|----------|--------|
| Delete `_removed()` dead function (229 lines) | Low | 10 min |
| Remove Dr. Sage files + ZenApp import | Medium | 1 hour |
| Replace 12x `as any` in ZenApp | Low | 2 hours |
| Replace 2x raw `fetch()` in ZenApp with `apiRequest()` | Low | 30 min |
| Remove old enablement components (EnablementCenter, etc.) | Low | 2 hours |
| Wire Vault upload to backend API | Medium | 4-8 hours |
| Review inner-view restraint pass | Medium | 4-6 hours |

---

## Rollback Plan

If a critical issue is discovered during beta:

1. **Single-surface bug:** Fix surgically on `concept2cure-v2`. Commit with `hotfix:` prefix.
2. **Navigation broken:** Revert the specific Phase commit. Each phase was committed separately with clear scope.
3. **Onboarding broken:** The `concept2cure_first_run_complete` localStorage flag can be cleared manually per-user to re-trigger onboarding.
4. **Full rollback:** `git revert` back to pre-Phase-1 commit (`5ffa67fb`). This restores the old sidebar/shell architecture. All new pages are additive (new files) and won't conflict.

---

**This freeze is effective immediately. No code changes without a reported beta blocker.**
