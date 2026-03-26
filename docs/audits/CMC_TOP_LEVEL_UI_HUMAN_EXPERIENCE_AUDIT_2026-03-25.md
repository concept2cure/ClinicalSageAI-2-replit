# CMC Top-Level UI Human Experience Audit — Build Iteration

**Date:** 2026-03-25  
**Audience:** Biotech, Pharma, and Med Device teams (Medical Affairs, Regulatory Affairs, Clinical Affairs)

## Purpose

This audit verifies what a human sees first in the CMC flow and how quickly they can reach outcomes that matter:
- get oriented,
- launch AnA help,
- enter actionable CMC workflows,
- and move toward Module 3 output readiness.

---

## 1) Top-level entrypoint behavior (current)

### Canonical CMC route
- `/cmc` now redirects to `/cmc-wizard` so users consistently land on the richer operational CMC experience.
- `/cmc-classic` remains available as legacy fallback.
- `/cmc-module` redirects to `/cmc-wizard` to avoid dead-link confusion from older navigation tiles.

**Human impact:** reduced route ambiguity and fewer “wrong page” landings.

### Global top navigation AnA action
- The top-nav “Ask RI” action now opens AnA with explicit user context:
  - source surface,
  - current route,
  - breadcrumb trail,
  - active tab,
  - intent goal (`regulatory_decision_support`).

**Human impact:** higher quality first response from AnA and less repetitive context re-entry.

---

## 2) First-view experience inside CMC

### Human-first launchpad
At the top of CMC Module UI, users now see a role-oriented launchpad:
- Medical Affairs: one-click AnA briefing flow,
- Regulatory Affairs: one-click into CMC Wizard execution surface,
- Clinical Affairs: one-click clinical/CMC alignment assistance.

### Visible “top flow” map
Users are shown an explicit outcome path:
`Project setup → Substance/Product data → Quality checks → Reports & Module 3 docs`

**Human impact:** better cognitive orientation, clearer next step, improved confidence in outcome path.

---

## 3) Human-journey acceptance checklist

### A. Orientation (first 30–60 seconds)
- [x] User sees what AnA is and where to ask for help.
- [x] User sees the high-level CMC workflow path toward Module 3.
- [x] User is not forced to discover hidden routes to start.

### B. Actionability (first 2–5 minutes)
- [x] User can start from role-specific objective without guessing tab structure.
- [x] User can enter wizard and deep CMC operations with one click.
- [x] User can trigger AnA with contextual information for better responses.
- [x] User can create a starter Module 3 draft directly from top-level UI actions.

### C. Continuity (across sessions/routes)
- [x] Legacy links (`/cmc-module`) do not strand users.
- [x] Canonical route (`/cmc`) consistently reaches operational surface.
- [x] Legacy route remains recoverable (`/cmc-classic`) for phased migration.

---

## 4) Remaining UX risks (next build passes)

1. **Naming remnants beyond immediate assistant surfaces**
   - Some non-primary legacy files/pages in the broader codebase may still include old references and should be cleaned in follow-up passes.

2. **Cross-module consistency**
   - The same human-first entry patterns used in CMC should be mirrored in IND/eCTD/Regulatory dashboards.

3. **Task-to-document automation visibility**
   - Add explicit “Build/Update Module 3 section” quick actions from project cards and risk findings to tighten action-to-artifact loop.

---

## 5) Next implementation priorities

1. Add top-level Module 3 section build actions (3.2.S / 3.2.P) from project rows. ✅ (starter draft action added)
2. Add in-context progress chips for “Readiness to Module 3 packet.” ✅ (project-level readiness chip added)
3. Add one-click “Ask AnA about this project” on all primary CMC cards/tables. ✅ (top flow + project row actions added)
4. Extend human-first launchpad pattern to regulatory risk dashboard and unified submission center.
