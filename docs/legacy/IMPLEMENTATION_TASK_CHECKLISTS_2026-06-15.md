# Implementation Task Checklists — First Buildable Slices

**Date:** 2026-06-15
**Status:** Planning artifact. **No code written.** Ordered, independently-buildable tasks (vertical slices) derived from the two specs.
**Derived from:**
- `REPORTING_INTELLIGENCE_AUDIT_AND_SPEC_2026-06-15.md` → "Report OS GA"
- `DEVICE_IVD_SUBMISSION_ASSEMBLY_SPEC_2026-06-15.md` → "Device eSTAR"

These are the two **first slices** — the cheapest paths to the two biggest truth-fixes (mock reporting; non-submittable eSTAR). Each task is sized to be a single PR, ordered so each builds on the last, and tagged with its acceptance check. Nothing here is built yet.

---

## Track A — Report OS GA, Slice 1 (kill the mock-data risk)

**Goal:** the Reports surface users see runs on the real `REPORT_OS` engine, produces the 3 existing report families (Exec/Board, RA Lead, QA/Audit) at a chosen scope, and exports a sealed PDF/A — with **zero fixture data** in any governed output.

- [ ] **A0 — Truthfulness quick-fix (do first, independent).** Label the `Reports.tsx` fixtures as "Sample data" and disable export when data is fixture-sourced. *Accept:* no fixture-backed view offers a governed export; sample state is visibly labeled.
- [ ] **A1 — Point `useReports`/Reports at `/api/report-os/*`.** Replace the `/api/intelligence/reports` + fixture-fallback path with reads from the existing REPORT_OS routes (`/scopes`, `/taxonomy`, `/runs`). *Accept:* surface renders live data or an honest empty state; fixtures removed from the governed path.
- [ ] **A2 — Scope selector + program-group picker.** Bind to `/scopes` and `/program-groups`. *Accept:* user can pick account/program/project/study/submission/document or a saved group; permissions respected (tenant-isolation contract test passes).
- [ ] **A3 — Report-type list (persona-filtered).** Render taxonomy via `/taxonomy`, filtered by `allowedPersonas`. *Accept:* the 3 families show for the right personas; locked ones show why.
- [ ] **A4 — Run (async) + status.** `POST /runs`, poll for completion; show blockers/confidence/freshness at the top of the result. *Accept:* a run completes and renders provider results with per-provider freshness; partial runs show caveats, never hide degradation.
- [ ] **A5 — Run history + rerun.** List prior runs/snapshots; rerun links to previous. *Accept:* history shows the snapshot chain; rerun produces a linked snapshot.
- [ ] **A6 — Sealed PDF/A export wired to the button.** Replace the "ask AnA to export" stub with `GET /runs/:id/export.pdf`; seal on finalize, watermark drafts. *Accept:* finalized report exports a sealed PDF/A; draft exports are watermarked; export is audit-logged with Part 11 e-sign on finalize.
- [ ] **A7 — Tests + a11y gate.** fixture-never-exported test; tenant isolation on all report-os reads; seal/verify round-trip; run `accessibility-enforcement` (ARIA live for async status, keyboard scope tree, color-never-alone confidence bands). *Accept:* tests green; a11y audit clean.

**Slice-1 done when:** a user picks a scope, runs Exec/Board + RA Lead + QA/Audit, reads confidence-annotated results, and downloads a sealed PDF/A — no fixtures anywhere in the governed path.

---

## Track B — Device eSTAR, Slice 1 (produce a real 510(k))

**Goal:** a 510(k) project produces the **official FDA eSTAR PDF, filled and attachment-complete**, passing `eSTARValidator`, exported as a governed artifact — and readiness stops calling a loose ZIP "submittable."

- [ ] **B0 — Truthfulness quick-fix (do first, independent).** Stop labeling the loose-ZIP output (`POST /api/510k/estar/build`) as a submittable eSTAR; mark it "draft package — not the official eSTAR." *Accept:* no surface claims the ZIP is a submittable eSTAR.
- [ ] **B1 — Vendor the official eSTAR template(s).** Add `assets/estar-templates/` (non-IVD + IVD variants, version-pinned) behind a self-containment gate modeled on `dtd-bundler.ts`. *Accept:* templates present or build gate fails closed with a clear message; version recorded.
- [ ] **B2 — Declarative field map (canonical → eSTAR AcroForm field), per template version.** *Accept:* map covers all required eSTAR fields the platform has canonical sources for; gaps are listed, never invented.
- [ ] **B3 — Generalize the IND AcroForm fill service.** Extract `fillOfficialPdf(template, fieldMap, data)` from `ind-forms/ind-form-fill-service.ts`; keep IND working. *Accept:* IND forms still fill correctly (regression); new generic fn covered by test.
- [ ] **B4 — Fill the eSTAR PDF + attach section files.** Use B1–B3; attach the existing rendered section PDFs into eSTAR's attachment slots (renderers become inputs). *Accept:* output is one official eSTAR PDF that opens in Adobe with fields populated and attachments embedded.
- [ ] **B5 — `assembleDeviceSubmission(project, '510k')` contract.** Mirror the eCTD spine (`assemble-from-core` → packager → `dispatch-gate`); return `{ artifact, validationReport, blockers, provenance }`. *Accept:* contract returns the eSTAR artifact + `eSTARValidator` result; same envelope as the report orchestrator.
- [ ] **B6 — Validation gate (honest).** `eSTARValidator` errors block "submittable"; external eValidator behind the existing opt-in fail-closed flag. *Accept:* no "submittable" status without validation pass; production dispatch blocked when external validator required-but-absent.
- [ ] **B7 — Governed export + submission-center wiring.** Drop the eSTAR artifact into the existing freeze/dispatch flow with Part 11 e-sign + audit. *Accept:* finalize/freeze/e-sign/audit all fire; reporting "submission readiness" now computes against the real artifact.
- [ ] **B8 — Tests.** Golden-file round-trip of filled eSTAR fields; `eSTARValidator` no-error on a complete project; truthfulness test (no "submittable" without official artifact + validation). *Accept:* all green.

**Slice-1 done when:** a complete 510(k) project emits the official FDA eSTAR PDF, filled + attachment-complete, passing the validator, governed and e-signed — and nothing labels a non-eSTAR output as submittable.

---

## Sequencing across both tracks

- **Do B0 and A0 immediately** — they're one-line honesty fixes, independent of everything else, and remove the two active "looks-final-but-isn't" trust risks. Worth shipping before the rest.
- **A and B are independent** and can run in parallel by different owners (frontend-leaning for A, regulatory-engineering for B).
- **Shared dependency:** the **corpus ingestion sweep** (data-ops) should run in parallel so that Track A Slice 2 (prediction reports) and any precedent-backed device readiness land on real data, not empty tables.
- **Hard ordering inside each track** is as listed; don't start A6 (export) before A4 (run), or B4 (fill) before B1–B3 (template + map + fill fn).

## What this checklist deliberately omits
- Report OS Slices 2–4 (prediction providers, scheduling/portfolio, AnA integration) — sequenced in the reporting spec.
- Device Slices 2–4 (De Novo, PMA-on-eCTD, MDR/IVDR end-to-end) — sequenced in the device spec.
- Procurement items (eValidator license, eCTD DTDs, ESG/EUDAMED creds) — tracked separately; the code seams exist behind opt-in flags.
- Global-agency assembly beyond FDA/EMA/PMDA — roadmap, not a slice.
