# DMS Vault Beta Build Plan (Combined)

Status: ACTIVE
Canonical: Yes
Supersedes: DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md
Superseded By: —
Related Reports: VAULT_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md


_Date: 2026-03-25_

## Objective
Ship a **beta-usable, submission-aware Vault DMS** next week that is competitive with baseline expectations from incumbent stacks (Veeva Vault + SharePoint usage patterns), while improving day-1 UX using no-cost plugins and open-source tooling.

---

## 1) Current baseline (already in product)

- Package-aware structures for IND/eCTD, 510(k), PMA, CER, NDA.
- Upload/search/download core flows.
- Document status tracking + favorites.
- Version-aware save path and audit trail foundation in fallback DMS routes.
- ANA RI elevated access path (admin-equivalent role mapping for ANA-tagged identities).
- Starter template placeholders and append/delete lifecycle controls added for beta prep.

---

## 2) No-cost plugin stack to improve Vault UX quickly

> All recommendations below are free/open-source tiers, suitable for immediate beta use.

### A. Document intake + upload UX

1. **react-dropzone** (MIT)
   - Drag-and-drop uploads with file type + size validation before API call.
   - Benefit: faster intake, fewer failed uploads.

2. **uppy (Dashboard + Tus/XHR plugins)** (MIT)
   - Resumable uploads, progress UI, retry behavior.
   - Benefit: handles large regulatory files better than basic single-input flows.

3. **filepond** (core open source)
   - Polished upload UX, previews, chunk handling via plugins.
   - Benefit: reduced friction for non-technical regulatory users.

### B. File preview + comparison

4. **PDF.js** (Apache-2.0)
   - Inline PDF preview and page navigation.
   - Benefit: fewer downloads to inspect docs.

5. **mammoth.js** (BSD-2-Clause)
   - Render DOCX to HTML for quick read mode.
   - Benefit: quick medical-writer review inside vault.

6. **diff-match-patch** or **jsdiff** (Apache-2.0 / BSD-like)
   - Visual text diffs between versions.
   - Benefit: stronger review cycle quality and faster approvals.

### C. Information architecture + findability

7. **Fuse.js** (Apache-2.0)
   - Fast client-side fuzzy search over loaded doc metadata.
   - Benefit: improves perceived search relevance instantly.

8. **TanStack Table** (MIT)
   - Advanced table sorting/filter chips/column pinning.
   - Benefit: enterprise-grade list control for QA/reg leads.

9. **react-virtual** / windowing
   - Smooth rendering for large vault lists.
   - Benefit: performance with high doc volumes.

### D. Collaboration + assistance

10. **Tiptap comments/track-change extensions** (already in stack)
    - In-document comment markers and change metadata.
    - Benefit: structured review notes for submission docs.

11. **react-hotkeys-hook** (MIT)
    - Keyboard shortcuts (open search, upload, move folder).
    - Benefit: power-user speed and accessibility.

12. **react-joyride** (MIT)
    - Guided onboarding tours for first-time beta users.
    - Benefit: lower training overhead in pilot week.

### E. Compliance/traceability helpers

13. **jsoneditor** (MIT) for metadata panel
    - Controlled metadata editing + schema hints.
    - Benefit: better data quality for submission routing.

14. **Mermaid** (MIT)
    - Visual workflow state diagrams embedded in help pages.
    - Benefit: easier governance + SOP understanding.

---

## 3) Build plan (next-week execution)

## Day 1 (today + tomorrow)
- Implement **drag-and-drop upload** (`react-dropzone`) and pre-upload validation.
- Add **inline PDF preview** for `View` action (PDF.js modal).
- Add **onboarding tour** for Vault first-run (react-joyride).

## Day 2
- Implement **fuzzy metadata search enhancement** (Fuse.js fallback to API results).
- Introduce **advanced table mode** (TanStack Table) behind feature flag.
- Add keyboard shortcuts for upload/search/switch package mode.

## Day 3
- Add **DOCX read preview** (mammoth) and basic **version text diff** view.
- Add metadata quality panel with required-field highlights by package type.

## Day 4
- Harden lifecycle controls:
  - approval lock behavior,
  - delete safeguards,
  - append-version audit annotations.
- Seed project templates for IND + 510(k) with deeper starter files.

## Day 5
- Pilot run with 2 internal scenarios:
  1. biotech IND kickoff,
  2. device 510(k) dossier prep.
- Capture UX metrics and defect log.

---

## 4) Submission-type smart layout requirements

### IND/eCTD
- Keep CTD module grouping (M1-M5) as primary spine.
- Include pre-IND strategy folder set.
- Default template set:
  - Cover Letter,
  - Form 1571/1572 placeholders,
  - protocol shell,
  - IB shell,
  - CMC summary shell.

### 510(k)
- Align to eSTAR-ready sections (admin + technical).
- Default template set:
  - Cover letter,
  - IFU statement,
  - 510(k) summary,
  - substantial equivalence,
  - device description,
  - testing placeholders.

### PMA / CER / NDA
- Keep package-specific folder trees and baseline starter templates.
- Gate expansion based on pilot demand in beta.

---

## 5) KPI targets for beta week

- Project bootstrap time with templates: **< 10 minutes**.
- Successful upload completion rate: **> 98%**.
- Median time to locate a target doc via search/filter: **< 20 seconds**.
- % docs with complete metadata at upload: **> 90%**.
- Pilot user satisfaction (quick survey): **≥ 8/10**.

---

## 6) Risk controls

- Use feature flags for new plugins to reduce rollout risk.
- Keep API fallbacks intact for upload/search actions.
- Avoid introducing paid-only dependencies before beta stabilization.
- Preserve all write actions in audit trail with actor + timestamp + reason.

---

## 7) Immediate backlog tickets (implementation-ready)

1. `vault-ux-dropzone-upload`
2. `vault-inline-pdf-preview`
3. `vault-fuzzy-search-fusejs`
4. `vault-advanced-table-mode`
5. `vault-hotkeys-and-onboarding-tour`
6. `vault-version-diff-view`
7. `vault-metadata-contracts-ind-510k`
8. `vault-template-pack-expansion-v1`
9. `vault-beta-pilot-kpi-instrumentation`
