# Controlled Beta Launch Readiness

**Date:** 2026-03-27
**Branch:** `concept2cure-v2`

---

## Overall Launch Readiness: READY FOR CONTROLLED BETA

---

## True Blockers

**None.**

The onboarding project-creation failure was the last user-visible blocker. It is now fixed — failed creation shows an error banner and the user can retry. They are never stranded.

---

## Caveats

1. **Vault is browse-only.** File upload is not wired. The UI is honest (no fake button), but a core Vault action is missing. Users can browse artifacts but cannot upload files through Vault. Upload may work through other paths (Work tab, AnA chat).

2. **Dr. Sage code still exists.** 4 files in `components/dr-sage/`, imported and rendered in ZenApp (line 149, 3303). Not visible during onboarding or in the main shell tabs. Visible only if a user somehow reaches the Dr. Sage global layer. Should be removed post-beta.

3. **Review inner views are denser** than the rest of the product. The 6 tab views (Quality, Compliance, Readiness, Evidence, Audit, Traceability) were not part of the restraint pass. They function correctly but may feel "enterprise-y" compared to the calmer Overview, Apps, and Artifacts pages.

4. **Screenshots not yet captured.** Visual validation requires a running instance. 17 screenshots identified in the proof package.

---

## Technical Debt (Does Not Block Launch)

| Item | Impact | Effort |
|------|--------|--------|
| `_removed()` dead function in ReviewReadiness (229 lines) | None — unreachable | 10 min |
| 12x `as any` casts in ZenApp | None — pre-existing | 2 hours |
| 2x raw `fetch()` in ZenApp | None — pre-existing | 30 min |
| Dr. Sage files (4 files + import) | Minimal — not in main flow | 1 hour |
| Old enablement components (EnablementCenter, MicroMissions, etc.) | None — not rendered | 2 hours |
| SnowGlobeView null stub + dead body | None — unreachable | 10 min |

---

## What Was Built (Phases 0-8.5)

| Phase | Deliverable |
|-------|-------------|
| 0 | 7 planning docs + revised canonical spec |
| 1 | Sidebar restructure: 6 global items + 5 project tabs |
| 1 (hardened) | Real AppsPage, ArtifactsPage, VaultPage (not placeholders) |
| 2 | Overview dashboard restored + naming reconciliation (9 fixes) |
| 2 (QA) | 71 issues found across 12 audit agents, 45 fixed |
| 3 | Track-aware Apps launcher with recommendations |
| 3.5 | P1/P2 audit gaps: SetupPage, queryKeys, governed Input |
| 4 | Design reduction pass (+178/-351 lines) |
| 5 | Onboarding rewrite: 4 screens, no Dr. Sage, value-first |
| 6 | Onboarding → project handoff fix |
| 6.5 | Action truthfulness fix (510k routes to real workspace) |
| 7 | Review page restraint (inline, 6 tabs, calmer) |
| 8.5 | Final 5 blockers: color, density, naming, accent, dead code |
| Launch prep | Onboarding failure handling + this report |

---

## Recommended Launch Posture

### Ready for controlled beta.

The product has:
- A calm, 6-item global shell
- A coherent 5-tab project experience
- A value-first 4-screen onboarding for both client tracks
- Track-aware apps with tabbed discovery
- A monochrome, scannable artifacts browser
- An honest vault (browse, no fake upload)
- Inline review with 6 quality/compliance tabs
- Error handling on the critical onboarding path
- Consistent naming (Artifacts, Work, Vault, Review, Submit)
- Single AnA identity throughout

It is not perfect. The Review inner views are dense. Vault can't upload. Dr. Sage code lingers. But these are post-beta polish items, not user trust violations.

**Ship it.**
