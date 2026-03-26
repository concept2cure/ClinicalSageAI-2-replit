# 510(k) / Medical Device / eSTAR — Document Generation Audit

> **Date:** 2026-03-26
> **Scope:** All beta-visible 510(k) document generation flows
> **Question:** Which flows produce governed artifacts (provenance, audit, placement) vs. dead-end download-only?

---

## Executive Summary

**FINDING: NONE of the 510(k)/eSTAR/CER export flows produce governed artifacts.** All document generation actions are download-only dead ends — they stream ZIPs, PDFs, or DOCX files to the browser with no writeback to `concept2cure_artifacts`, no provenance events, no audit trail, and no placement in the project artifact tree.

The **only** governed artifact path in the system is the **Compute Job Panel** (`governed_export` surface preset), which does call `registerArtifactWithGovernance()` — but this path is a general-purpose compute plane, not specifically wired to any 510(k) or eSTAR content generation logic today.

---

## Inventory of All 510(k) Document Generation Flows

### 1. `POST /api/510k/estar/build` — eSTAR ZIP Builder (Active)

| Property                                    | Value                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **File**                                    | `server/routes/510k-estar-routes.ts`                                                            |
| **Function**                                | `router.post('/build', ...)`                                                                    |
| **What it generates**                       | ZIP stream containing 6 FDA-named PDFs (`01_CoverLetter.pdf` … `06_Labeling.pdf`) + attachments |
| **Calls `registerArtifactWithGovernance`?** | **NO**                                                                                          |
| **Provenance / Audit trail?**               | **NONE** — no database writes, no provenance events                                             |
| **User-facing button**                      | `ESTARBuilderPanel.jsx` → "Generate eSTAR Package"                                              |
| **Verdict**                                 | ❌ **Dead-end download.** Streams ZIP to browser and exits. No record that doc was generated.   |

---

### 2. `POST /api/cerv2/export/pdf` — CERV2 PDF Export

| Property                                    | Value                                                                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File**                                    | `server/routes/cerv2-export-routes.ts`                                                                                                                                |
| **Function**                                | `router.post('/pdf', ...)`                                                                                                                                            |
| **What it generates**                       | Single combined PDF from TipTap editor JSON                                                                                                                           |
| **Calls `registerArtifactWithGovernance`?** | **NO**                                                                                                                                                                |
| **Provenance / Audit trail?**               | **Partial** — sets governance headers (`X-Concept2Cure-AI-Generated`, `X-Concept2Cure-Human-Review-Approved`) but these are HTTP response headers only, not persisted |
| **User-facing button**                      | CERV2Page → Export menu → "Download PDF"                                                                                                                              |
| **Verdict**                                 | ❌ **Dead-end download with governance-theater headers.** Has a human review gate (`CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW`) but no DB persistence.                 |

---

### 3. `POST /api/cerv2/export/docx` — CERV2 DOCX Export

| Property | Value |
| -------- | ----- |
