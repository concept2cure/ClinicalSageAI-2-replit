# Beta Candidate Validation Report

**Date:** 2026-03-27
**Auditors:** 3 independent agents (Surfaces, Workflows, Code Hygiene)
**Scope:** Full product evaluation for controlled beta readiness

---

## Overall Beta Readiness Score: 8.5 / 10

---

## What Is Truly Beta-Ready Now

| Surface | Grade | Notes |
|---------|-------|-------|
| Global Shell (6 items) | **PASS** | Exactly 6, no extras, no dead ends |
| Project Shell (5 tabs) | **PASS** | Conditional rendering correct |
| AppsPage | **PASS** | Tabbed, track-aware, disabled state clean |
| ArtifactsPage | **PASS** | Monochrome, compact rows, search + tabs |
| VaultPage | **PASS** | Folder grouping, search, honest (no fake upload) |
| SetupPage | **PASS** | 7 sections, clean card layout |
| ProjectHomeDashboard | **PASS** | Calm, restrained, benchmark for the product |
| Onboarding (Pharma path) | **PASS** | 4 screens, project created, lands in right place |
| Onboarding (Device path) | **PASS** | 510(k) Workspace routes correctly |
| Post-onboarding navigation | **PASS** | All 5 tabs accessible, AnA present on all |
| Sidebar badge colors | **PASS** | 3-color palette (violet/blue/zinc) |
| Query keys | **PASS** | All new pages use registered `queryKeys.*` |
| New code type safety | **PASS** | Zero `as any` in Phase 1-8.5 files |

**ReviewReadiness:** PASS WITH CAVEATS — inline rendering works, 6 tabs clean, but has dead code residue (cosmetic, not functional).

---

## True Beta Blockers

**None that would prevent controlled beta launch.**

The following are important but not blocking:

### 1. Silent project creation failure in onboarding (MEDIUM)
If the POST `/api/concept2cure/projects` fails during onboarding, the error is caught silently. User advances to "You're Set" screen but `createdProjectId` is null. Clicking any suggested action then does nothing — the user is stranded.

**Impact:** Only triggers on API failure. Happy path works.
**Fix:** Add error state to screen 3. Disable "Continue" if creation failed. Show retry.

### 2. Dead `_removed()` function in ReviewReadiness (LOW)
229 lines of unreachable code (the old SnowGlobeView body renamed to `_removed`). Null stub handles the switch case. Not user-visible. Would embarrass in a code review.

**Fix:** Delete the function entirely. 10 minutes.

---

## Minor Polish Issues

1. **Sidebar fallback badge** — Projects without a recognized submission type get `text-zinc-500 bg-zinc-100` which looks slightly different from the blue/violet badges. Minor visual inconsistency.

2. **Region not validated in onboarding** — User can skip region selection; defaults to FDA. Sensible default but not user-explicit.

3. **ReviewReadiness "reference data" comment** — Line 140 says "not mock data" but AGENCY_MATRIX is hardcoded reference data. Misleading comment, not a user-visible issue.

4. **Status dot colors in sidebar** — `in_review` uses amber, which is a 4th color outside the 3-color badge palette. Very minor — status dots are 1.5px, barely visible.

---

## Technical Debt (Does Not Block Beta)

| Item | Severity | Notes |
|------|----------|-------|
| 12x `as any` casts in ZenApp.tsx | Tech debt | All pre-existing, none in new Phase 1-8.5 code |
| 2x raw `fetch()` in ZenApp.tsx | Tech debt | Pre-existing, should use `apiRequest()` |
| Dr. Sage files (4 files in `components/dr-sage/`) | Post-beta | Still imported in ZenApp line 149, rendered at line 3303. Not in onboarding or main flow. |
| `console.warn` in ZenApp (2 instances) | Production-safe | Error handlers only, appropriate for production |
| SnowGlobeView dead code body | Cleanup | 229 lines, unreachable, should delete |
| Old enablement components (EnablementCenter, MicroMissions, DualAITheater) | Post-beta | Reference Dr. Sage, not in main shell or onboarding |

---

## Manual Walkthrough Checklist

### First-Time User (Pharma)
- [ ] Clear localStorage → see onboarding
- [ ] Select "Pharma & Biotech" → screen advances
- [ ] Select role, submission type (IND), region (FDA) → Continue
- [ ] Enter project name → Continue (project created via API)
- [ ] See "You're Set" with: Start in Work, Browse Apps, Open Vault
- [ ] Click "Start in Work" → land in Work tab with project active
- [ ] Navigate: Overview → Work → Vault → Review → Submit → all render

### First-Time User (Device)
- [ ] Clear localStorage → see onboarding
- [ ] Select "Medical Device & Diagnostics" → screen advances
- [ ] Select role (Device Engineer), type (510K), region (FDA) → Continue
- [ ] Enter project name → Continue
- [ ] See "You're Set" with: Start in Work, Open 510(k) Workspace, Open Vault
- [ ] Click "Open 510(k) Workspace" → land in embedded 510(k) page
- [ ] Navigate: Overview → Work → Vault → Review → Submit → all render

### Returning User
- [ ] With `concept2cure_first_run_complete` set → skip onboarding
- [ ] See Projects page or last active project
- [ ] All 6 global nav items work
- [ ] All 5 project tabs work when project selected

### Global Destinations
- [ ] New → dropdown with Chat / Project / Artifact
- [ ] Search → command palette opens
- [ ] Projects → project list
- [ ] Apps → tabbed launcher with track-aware sorting
- [ ] Artifacts → browser with 5 tab filters + search
- [ ] Setup → 7 section cards → click opens settings modal

---

## Screenshots/Proof Still Needed

Cannot generate screenshots in this environment. For visual validation:
1. Sidebar collapsed + expanded modes
2. Project tabs appearing/disappearing with project selection
3. Overview dashboard with artifacts
4. Apps page with each tab group
5. Artifacts page with filter tabs
6. Vault page with folder grouping
7. Review page inline (not full-screen)
8. Onboarding 4-screen flow (both tracks)
9. 510(k) workspace landing from onboarding

---

## Recommended Launch Posture

### **Ready for controlled beta — with one caveat.**

The shell, navigation, onboarding, apps, artifacts, vault, overview, review, and submit surfaces are all functional, coherent, and visually consistent. The product feels like one system, not a module dump.

**The one caveat:** If project creation fails during onboarding (API error), the user gets stranded silently. This should be fixed before exposing to paying customers — it's a ~30 minute fix (add error state + retry to screen 3 of FirstRunExperience).

**Everything else** — dead code, Dr. Sage remnants, `as any` casts, raw `fetch()` in ZenApp — is technical debt that does not affect user experience and can be cleaned up post-beta.

---

**No code was changed in this validation. Report only.**
