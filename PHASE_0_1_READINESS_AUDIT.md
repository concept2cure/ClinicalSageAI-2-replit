# Phase 0–1: Platform Readiness Audit & Template Validation Report

**Generated:** 2026-02-12
**Branch:** `concept2cure-v2` @ `8d56db7` (v1.0.0)
**Scope:** CERV2 + IND + eCTD + DOCX Factory — Full inventory, gap analysis, and readiness matrix

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Master Template Inventory](#2-master-template-inventory)
3. [Section Outline Coverage Matrix](#3-section-outline-coverage-matrix)
4. [AI Endpoint Readiness](#4-ai-endpoint-readiness)
5. [Export / DOCX Factory Readiness](#5-export--docx-factory-readiness)
6. [Canvas Editing Integration](#6-canvas-editing-integration)
7. [Gap Report](#7-gap-report)
8. [Readiness Matrix (Color-Coded)](#8-readiness-matrix)
9. [Prioritized Remediation Roadmap](#9-prioritized-remediation-roadmap)
10. [End-to-End Dry Run Plan](#10-end-to-end-dry-run-plan)

---

## 1. Executive Summary

### Overall Readiness Score: **72%** (Production-capable with gaps)

| Category                       | Ready                       | Partial             | Missing            | Score |
| ------------------------------ | --------------------------- | ------------------- | ------------------ | ----- |
| CERV2 Templates (510k/PMA/CER) | ✅ 25 sections              | ⚠️ 5 AI-only        | —                  | 83%   |
| IND Templates (Modules 1–5)    | ✅ 19 seed DOCX             | ⚠️ Modules 4–5      | ❌ 60+ sub-modules | 35%   |
| AI Population                  | ⚠️ Template/mock            | —                   | ❌ LLM integration | 40%   |
| Export Pipeline (PDF/DOCX/ZIP) | ✅ Fully functional         | —                   | —                  | 95%   |
| DOCX Factory                   | ✅ 12 endpoints, DB-backed  | ⚠️ 6 seed templates | ❌ 13+ missing     | 60%   |
| Canvas Editing                 | ✅ TipTap editor            | ✅ Autosave         | —                  | 90%   |
| Section CRUD + Versioning      | ✅ 6 endpoints, audit trail | —                   | —                  | 95%   |
| IND Automation                 | ✅ Forms 1571/1572/3674     | ⚠️ Module 3 only    | ❌ Modules 1,2,4,5 | 30%   |

### Critical Blockers (3)

1. **AI endpoints return static templates** — no LLM/GPT integration (marked "Phase 8" but not implemented)
2. **IND Module 4 (Nonclinical) and Module 5 (Clinical) have no DOCX templates or generators**
3. **PMA has zero dedicated DOCX seed templates** (only CERV2 editor sections)

### High-Priority Gaps (5)

4. `cerv2-versions.ts` is dead stub code (no auth, no DB)
5. `fetchEquivalence()` and `fetchBenefitRisk()` wired but never called from editor
6. IND templates route commented out in `server/index.ts`
7. Mock export routes have no auth on non-production
8. DOCX Factory seed only covers 6 of 19 catalog entries on first `POST /seed`

---

## 2. Master Template Inventory

### 2.1 — CERV2 Section Templates (Editor + AI)

#### FDA 510(k) — `cerv2_510k` (10 sections)

| #   | Section ID     | Label                | In DOC_OUTLINES | In shared/docTypes | AI Template                         | Enhanced Mock | Style Pack | Export PDF | Required |
| --- | -------------- | -------------------- | --------------- | ------------------ | ----------------------------------- | ------------- | ---------- | ---------- | -------- |
| 1   | `cover_letter` | Cover Letter         | ✅              | ❌                 | ✅                                  | ❌            | ✅ 510k_v1 | ✅         | ❌       |
| 2   | `admin`        | Administrative Info  | ✅              | ✅                 | ✅                                  | ❌            | ✅         | ❌         | ✅       |
| 3   | `ifu`          | Indications for Use  | ✅              | ✅                 | ✅                                  | ❌            | ✅         | ❌         | ✅       |
| 4   | `summary`      | 510(k) Summary       | ✅              | ❌                 | ✅                                  | ❌            | ✅         | ✅         | ❌       |
| 5   | `desc`         | Device Description   | ✅              | ✅                 | ✅ (+ alias `device_description`)   | ❌            | ✅         | ✅         | ✅       |
| 6   | `pred`         | Predicate Comparison | ✅              | ✅                 | ✅ (+ alias `predicate_comparison`) | ❌            | ✅         | ❌         | ✅       |
| 7   | `se`           | SE Discussion        | ✅              | ✅                 | ✅ (+ alias `se_discussion`)        | ✅ (deep)     | ✅         | ✅         | ✅       |
| 8   | `testing`      | Performance Testing  | ✅              | ✅                 | ✅ (+ alias `performance_testing`)  | ✅ (deep)     | ✅         | ✅         | ❌       |
| 9   | `labeling`     | Labeling             | ✅              | ✅                 | ✅                                  | ❌            | ✅         | ✅         | ❌       |
| 10  | `concl`        | Conclusion           | ✅              | ✅                 | ✅ (+ alias `conclusion`)           | ✅ (deep)     | ✅         | ❌         | ❌       |

**Discrepancy:** `cover_letter` and `summary` are in DOC_OUTLINES but NOT in `shared/docTypes.ts` sections array. The OUTLINE_TO_EDITOR mapper bridges this gap.

#### FDA PMA — `cerv2_pma` (7 sections)

| #   | Section ID | Label                    | In DOC_OUTLINES | In shared/docTypes | AI Template                                       | Enhanced Mock | Style Pack | Export PDF | Required |
| --- | ---------- | ------------------------ | --------------- | ------------------ | ------------------------------------------------- | ------------- | ---------- | ---------- | -------- |
| 1   | `summary`  | PMA Summary              | ✅              | ✅                 | ✅ (+ alias `summary_overview`)                   | ❌            | ✅ pma_v1  | ✅         | ✅       |
| 2   | `nonclin`  | Nonclinical Testing      | ✅              | ✅                 | ✅ (+ alias `bench_testing`)                      | ❌            | ✅         | ✅         | ✅       |
| 3   | `clin`     | Clinical Data            | ✅              | ✅                 | ✅ (+ aliases `study_design`, `clinical_results`) | ✅ (deep)     | ✅         | ✅         | ✅       |
| 4   | `mfgqa`    | Manufacturing / QA       | ✅              | ✅                 | ✅                                                | ❌            | ✅         | ✅         | ❌       |
| 5   | `labeling` | Labeling                 | ✅              | ✅                 | ✅                                                | ❌            | ✅         | ✅         | ❌       |
| 6   | `risk`     | Benefit-Risk             | ✅              | ✅                 | ✅ (+ alias `risk_analysis`)                      | ✅ (deep)     | ✅         | ✅         | ❌       |
| 7   | `pms`      | Post-Market Surveillance | ✅              | ✅                 | ✅ (+ alias `pms_plan`)                           | ❌            | ✅         | ✅         | ❌       |

#### EU MDR CER — `cerv2_cer` (8 sections)

| #   | Section ID    | Label                      | In DOC_OUTLINES | In shared/docTypes | AI Template                                          | Enhanced Mock | Style Pack    | Export PDF | Required |
| --- | ------------- | -------------------------- | --------------- | ------------------ | ---------------------------------------------------- | ------------- | ------------- | ---------- | -------- |
| 1   | `sota`        | State of the Art           | ✅              | ✅                 | ✅ (+ alias `current_knowledge`)                     | ✅ (deep)     | ✅ cer_mdr_v1 | ✅         | ✅       |
| 2   | `device`      | Device Description         | ✅              | ✅                 | ✅ (+ alias `device_description`)                    | ❌            | ✅            | ✅         | ❌       |
| 3   | `dataset`     | Clinical Data / Literature | ✅              | ✅                 | ✅ (+ alias `search_strategy`)                       | ❌            | ✅            | ✅         | ✅       |
| 4   | `appraisal`   | Appraisal                  | ✅              | ✅                 | ✅ (+ alias `appraisal_methodology`)                 | ❌            | ✅            | ✅         | ✅       |
| 5   | `benefitrisk` | Benefit-Risk               | ✅              | ✅                 | ✅ (+ aliases `clinical_benefits`, `residual_risks`) | ✅ (deep)     | ✅            | ✅         | ✅       |
| 6   | `gspr`        | GSPR Mapping               | ✅              | ✅                 | ✅ (+ alias `gspr_overview`)                         | ✅ (deep)     | ✅            | ✅         | ❌       |
| 7   | `pms`         | PMS / PMCF                 | ✅              | ✅                 | ✅ (+ alias `pms_plan`)                              | ❌            | ✅            | ✅         | ❌       |
| 8   | `concl`       | Conclusion                 | ✅              | ✅                 | ✅ (+ alias `overall_conclusion`)                    | ❌            | ✅            | ✅         | ❌       |

---

### 2.2 — DOCX Factory Seed Templates (19 enterprise-grade)

| #   | Template Name                        | doc_type Key              | DOCX File                      | Tags                  | Module | Exists on Disk |
| --- | ------------------------------------ | ------------------------- | ------------------------------ | --------------------- | ------ | -------------- |
| 1   | eCTD Cover Letter                    | `ectd_cover_letter`       | `ectd_cover_letter.docx`       | ectd, module-1        | M1     | ✅             |
| 2   | Form FDA 1571 Narrative Summary      | `ind_1571_narrative`      | `fda_1571_narrative.docx`      | ind, fda-1571         | M1     | ✅             |
| 3   | Investigator Brochure Change Summary | `ib_change_summary`       | `ib_change_summary.docx`       | ib, change-summary    | —      | ✅             |
| 4   | CMC Drug Substance (3.2.S)           | `cmc_drug_substance`      | `cmc_drug_substance.docx`      | cmc, module-3         | M3     | ✅             |
| 5   | CMC Drug Product (3.2.P)             | `cmc_drug_product`        | `cmc_drug_product.docx`        | cmc, module-3         | M3     | ✅             |
| 6   | Clinical Benefit/Risk Summary (2.5)  | `clinical_benefit_risk`   | `clinical_benefit_risk.docx`   | clinical, module-2    | M2     | ✅             |
| 7   | Nonclinical Overview (2.4)           | `nonclinical_overview`    | `nonclinical_overview.docx`    | nonclinical, module-2 | M2     | ✅             |
| 8   | Quality Overall Summary (2.3)        | `quality_overall_summary` | `quality_overall_summary.docx` | quality, module-2     | M2     | ✅             |
| 9   | CSR Synopsis (5.3)                   | `csr_synopsis`            | `csr_synopsis.docx`            | clinical, module-5    | M5     | ✅             |
| 10  | Protocol Synopsis                    | `protocol_synopsis`       | `protocol_synopsis.docx`       | clinical, protocol    | —      | ✅             |
| 11  | 510(k) Cover Letter                  | `510k_cover_letter`       | `510k_cover_letter.docx`       | 510k, device          | 510k   | ✅             |
| 12  | 510(k) SE Comparison                 | `510k_se_comparison`      | `510k_se_comparison.docx`      | 510k, se-comparison   | 510k   | ✅             |
| 13  | 510(k) Device Description            | `510k_device_description` | `510k_device_description.docx` | 510k, device          | 510k   | ✅             |
| 14  | 510(k) Summary (§807.92)             | `510k_summary`            | `510k_summary.docx`            | 510k, summary         | 510k   | ✅             |
| 15  | 510(k) Biocompatibility              | `510k_biocompatibility`   | `510k_biocompatibility.docx`   | 510k, iso-10993       | 510k   | ✅             |
| 16  | CER Evaluation Plan                  | `cer_evaluation_plan`     | `cer_evaluation_plan.docx`     | cer, ectd-4, eu-mdr   | CER    | ✅             |
| 17  | CER Literature Analysis              | `cer_literature_analysis` | `cer_literature_analysis.docx` | cer, ectd-4, eu-mdr   | CER    | ✅             |
| 18  | CER Benefit-Risk & PMCF              | `cer_benefit_risk_pmcf`   | `cer_benefit_risk_pmcf.docx`   | cer, ectd-4, eu-mdr   | CER    | ✅             |
| 19  | CER State of the Art                 | `cer_state_of_art`        | `cer_state_of_art.docx`        | cer, ectd-4, eu-mdr   | CER    | ✅             |

**All 19 DOCX files confirmed present in** `shadow_service/shadow_service/demo_templates/`

---

### 2.3 — IND Automation Templates (Jinja2 + DOCX)

| #   | Template               | Format               | Generator                              | Module     | On Disk |
| --- | ---------------------- | -------------------- | -------------------------------------- | ---------- | ------- |
| 1   | Form FDA 1571          | `.docx` + `.docx.j2` | `render_form1571()`                    | M1 (Forms) | ✅      |
| 2   | Form FDA 1572          | `.docx` + `.docx.j2` | `render_form1572()`                    | M1 (Forms) | ✅      |
| 3   | Form FDA 3674          | `.docx` + `.docx.j2` | `render_form3674()`                    | M1 (Forms) | ✅      |
| 4   | IND Cover Letter       | `.docx` + `.docx.j2` | `generate_cover_letter()`              | M1 (Cover) | ✅      |
| 5   | Module 2 — Clinical    | `.docx.j2`           | —                                      | M2         | ✅      |
| 6   | Module 2 — Nonclinical | `.docx.j2`           | —                                      | M2         | ✅      |
| 7   | Module 2 — Quality     | `.docx.j2`           | —                                      | M2         | ✅      |
| 8   | Module 3 — CMC         | `.xml` + `.docx.j2`  | `TemplateGenerator.generate_module3()` | M3         | ✅      |

---

### 2.4 — eCTD Output Directory (Rendered)

| Sequence | Module                | Files                                               |
| -------- | --------------------- | --------------------------------------------------- |
| `0001`   | m1/                   | `1571.docx`, `1572.docx`, `3674.docx`               |
|          | m2/                   | `clinical.docx`, `nonclinical.docx`, `quality.docx` |
|          | m3/                   | `module3.docx`                                      |
|          | root                  | `index.xml`, `us-regional.xml`, `checksum.md5`      |
| `0002`   | (identical structure) | (amendment sequence)                                |

---

## 3. Section Outline Coverage Matrix

### Cross-Reference: DOC_OUTLINES ↔ shared/docTypes ↔ AI Templates ↔ Export Renderers

| Doc Type   | DOC_OUTLINES (client) | shared/docTypes (canonical)                | AI sectionTemplates              | Export Per-Section PDFs | Mock Vault Docs   |
| ---------- | --------------------- | ------------------------------------------ | -------------------------------- | ----------------------- | ----------------- |
| **510(k)** | 10 sections           | 8 sections (missing cover_letter, summary) | 26 keys (10 canonical + aliases) | 6 PDFs                  | 1 (mock-510k-001) |
| **PMA**    | 7 sections            | 7 sections                                 | 22 keys (7 canonical + aliases)  | 7 PDFs                  | 1 (mock-pma-001)  |
| **CER**    | 8 sections            | 8 sections                                 | 24 keys (8 canonical + aliases)  | 8 PDFs                  | 1 (mock-cer-001)  |

### Section Alignment Detail

```
510(k) Sections:
  DOC_OUTLINES  → [cover_letter, admin, ifu, summary, desc, pred, se, testing, labeling, concl]
  shared/dTypes → [admin, ifu, desc, pred, se, testing, labeling, concl]
  Export PDFs   → [Cover Letter, 510k Summary, Device Description, SE Discussion, Performance Testing, Labeling]
  ─── GAP: admin, ifu, pred, concl have NO dedicated per-section PDF
  ─── GAP: cover_letter, summary NOT in shared/docTypes (bridged via OUTLINE_TO_EDITOR)

PMA Sections:
  DOC_OUTLINES  → [summary, nonclin, clin, mfgqa, labeling, risk, pms]
  shared/dTypes → [summary, nonclin, clin, mfgqa, labeling, risk, pms]
  Export PDFs   → [Summary, Nonclinical, Clinical, Manufacturing, Labeling, Risk-Benefit, Post-Approval]
  ─── ALIGNED ✅

CER Sections:
  DOC_OUTLINES  → [sota, device, dataset, appraisal, benefitrisk, gspr, pms, concl]
  shared/dTypes → [sota, device, dataset, appraisal, benefitrisk, gspr, pms, concl]
  Export PDFs   → [SOTA, Device, Dataset, Appraisal, Benefit-Risk, GSPR, PMS, Conclusions]
  ─── ALIGNED ✅
```

---

## 4. AI Endpoint Readiness

### 4.1 — Endpoint Status

| #   | Endpoint                           | Method | Auth                     | Implementation                                  | LLM Ready | Status  |
| --- | ---------------------------------- | ------ | ------------------------ | ----------------------------------------------- | --------- | ------- |
| 1   | `/api/cerv2/ai/suggest`            | POST   | ✅ authMiddleware + role | Template/mock (placeholder replacement)         | ❌ No LLM | ⚠️ MOCK |
| 2   | `/api/cerv2/ai/equivalence`        | POST   | ✅                       | Template/mock (builds SE text from inputs)      | ❌ No LLM | ⚠️ MOCK |
| 3   | `/api/cerv2/ai/benefit-risk`       | POST   | ✅                       | Template/mock (adapts FDA vs EU MDR)            | ❌ No LLM | ⚠️ MOCK |
| 4   | `/api/cerv2/ai/analyze-section`    | POST   | ✅                       | Enhanced mock (deep content for 8 sections)     | ❌ No LLM | ⚠️ MOCK |
| 5   | `/api/cerv2/ai/templates/:docType` | GET    | ✅                       | Returns all section templates for bulk populate | ❌ Static | ⚠️ MOCK |
| 6   | `/api/cerv2/ai/health`             | GET    | Open                     | Real health check                               | N/A       | ✅ REAL |

### 4.2 — AI Population Coverage by Section

| Doc Type   | Section        | `suggest` Template | `analyze-section` Deep Mock | Client Calls   | Gap |
| ---------- | -------------- | ------------------ | --------------------------- | -------------- | --- |
| **510(k)** | `cover_letter` | ✅                 | ❌ (fallback only)          | ✅ via suggest | —   |
|            | `admin`        | ✅                 | ❌                          | ✅             | —   |
|            | `ifu`          | ✅                 | ❌                          | ✅             | —   |
|            | `summary`      | ✅                 | ❌                          | ✅             | —   |
|            | `desc`         | ✅                 | ❌                          | ✅             | —   |
|            | `pred`         | ✅                 | ❌                          | ✅             | —   |
|            | `se`           | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `testing`      | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `labeling`     | ✅                 | ❌                          | ✅             | —   |
|            | `concl`        | ✅                 | ✅ **DEEP**                 | ✅             | —   |
| **PMA**    | `summary`      | ✅                 | ❌                          | ✅             | —   |
|            | `nonclin`      | ✅                 | ❌                          | ✅             | —   |
|            | `clin`         | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `mfgqa`        | ✅                 | ❌                          | ✅             | —   |
|            | `labeling`     | ✅                 | ❌                          | ✅             | —   |
|            | `risk`         | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `pms`          | ✅                 | ❌                          | ✅             | —   |
| **CER**    | `sota`         | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `device`       | ✅                 | ❌                          | ✅             | —   |
|            | `dataset`      | ✅                 | ❌                          | ✅             | —   |
|            | `appraisal`    | ✅                 | ❌                          | ✅             | —   |
|            | `benefitrisk`  | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `gspr`         | ✅                 | ✅ **DEEP**                 | ✅             | —   |
|            | `pms`          | ✅                 | ❌                          | ✅             | —   |
|            | `concl`        | ✅                 | ❌                          | ✅             | —   |

**Summary:** 25/25 sections have `suggest` templates. 8/25 have deep `analyze-section` mocks. 0/25 have real LLM integration.

### 4.3 — Unused AI Client Methods

| Client Method        | Server Endpoint      | Called From                           | Status       |
| -------------------- | -------------------- | ------------------------------------- | ------------ |
| `fetchEquivalence()` | `POST /equivalence`  | **Not called** from CERV2EditorAI.jsx | ⚠️ Dead code |
| `fetchBenefitRisk()` | `POST /benefit-risk` | **Not called** from CERV2EditorAI.jsx | ⚠️ Dead code |

These should be wired to appropriate UI triggers (e.g., predicate search panel, risk assessment tab).

---

## 5. Export / DOCX Factory Readiness

### 5.1 — Export Pipeline Status

| Format          | Endpoint                         | Implementation                        | All 3 Doc Types   | Auth       | Production Ready |
| --------------- | -------------------------------- | ------------------------------------- | ----------------- | ---------- | ---------------- |
| PDF (combined)  | `POST /export/pdf`               | ✅ Real (`renderCombinedPdf`)         | ✅ 510k, PMA, CER | ✅         | ✅               |
| DOCX (combined) | `POST /export/docx`              | ✅ Real (`renderCombinedDocx`)        | ✅                | ✅         | ✅               |
| ZIP (full pack) | `POST /export/zip`               | ✅ Real (archiver + per-section PDFs) | ✅                | ✅         | ✅               |
| AI→TipTap JSON  | `POST /export/ai-to-editor`      | ✅ Real (markdown→TipTap parser)      | ✅                | ✅         | ✅               |
| Mock PDF        | `GET /export/mock/:docType`      | ✅ Mock (dev only)                    | ✅                | ❌ No auth | ⚠️ Dev only      |
| Mock DOCX       | `GET /export/mock/:docType/docx` | ✅ Mock (dev only)                    | ✅                | ❌         | ⚠️ Dev only      |
| Mock ZIP        | `GET /export/mock/:docType/zip`  | ✅ Mock (dev only)                    | ✅                | ❌         | ⚠️ Dev only      |
| Mock JSON       | `GET /export/mock/:docType/json` | ✅ Mock (dev only)                    | ✅                | ❌         | ⚠️ Dev only      |

### 5.2 — Per-Section PDF Rendering Coverage

| Doc Type   | Per-Section PDFs | Sections Covered                                                                        | Sections Missing                    |
| ---------- | ---------------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| **510(k)** | 6 PDFs           | Cover Letter, Summary, Device Description, SE Discussion, Performance Testing, Labeling | admin, ifu, pred, concl (4 missing) |
| **PMA**    | 7 PDFs           | All 7 sections                                                                          | None ✅                             |
| **CER**    | 8 PDFs           | All 8 sections                                                                          | None ✅                             |

### 5.3 — Style Pack Coverage

| Style Pack   | HTML Template        | CSS            | Doc Type | Status      |
| ------------ | -------------------- | -------------- | -------- | ----------- |
| `510k_v1`    | ✅ `510k_v1.html`    | ✅ `print.css` | 510(k)   | ✅ Complete |
| `pma_v1`     | ✅ `pma_v1.html`     | ✅ `print.css` | PMA      | ✅ Complete |
| `cer_mdr_v1` | ✅ `cer_mdr_v1.html` | ✅ `print.css` | CER      | ✅ Complete |

### 5.4 — DOCX Factory (Shadow Service)

| #   | Endpoint          | Status                | DB-Backed | Auth             |
| --- | ----------------- | --------------------- | --------- | ---------------- |
| 1   | Create template   | ✅ Real               | ✅        | ✅ X-Admin-Token |
| 2   | List templates    | ✅ Real               | ✅        | ✅               |
| 3   | Create version    | ✅ Real               | ✅        | ✅               |
| 4   | List versions     | ✅ Real               | ✅        | ✅               |
| 5   | Create render     | ✅ Real               | ✅        | ✅               |
| 6   | Get render        | ✅ Real               | ✅        | ✅               |
| 7   | List renders      | ✅ Real               | ✅        | ✅               |
| 8   | Execute render    | ✅ Real               | ✅        | ✅               |
| 9   | List events       | ✅ Real               | ✅        | ✅               |
| 10  | Download artifact | ✅ Real               | ✅ (blob) | ✅               |
| 11  | Seed templates    | ✅ Real               | ✅        | ✅               |
| 12  | Demo packs        | ✅ Real (pure Python) | ❌        | ✅               |

**DOCX Factory seed creates 6 regulatory templates** on `POST /seed`:
Only a subset of the 19-item SEED_CATALOG is seeded by default. Remaining 13 require explicit registration via `POST /templates`.

---

## 6. Canvas Editing Integration

### 6.1 — Client Service Wiring

| Service                | File                                          | Base URL              | Endpoints Used                        | Status       |
| ---------------------- | --------------------------------------------- | --------------------- | ------------------------------------- | ------------ |
| `CERV2AIService`       | `client/src/services/CERV2AIService.js`       | `/api/cerv2/ai`       | suggest, analyze-section, templates   | ✅ Connected |
| `CERV2ExportService`   | `client/src/services/CERV2ExportService.js`   | `/api/cerv2/export`   | pdf, docx, zip, ai-to-editor, mock/\* | ✅ Connected |
| `CERV2SectionService`  | `client/src/services/CERV2SectionService.js`  | `/api/cerv2-sections` | CRUD + versions                       | ✅ Connected |
| `CERV2AutoSaveService` | `client/src/services/CERV2AutoSaveService.js` | localStorage          | Debounced save/load                   | ✅ Connected |

### 6.2 — Canvas Feature Checklist

| Feature                | Component                     | Status     | Notes                                         |
| ---------------------- | ----------------------------- | ---------- | --------------------------------------------- |
| TipTap Rich Editor     | `CERV2EditorAI.jsx`           | ✅ Working | Full toolbar with formatting controls         |
| Section-level Autosave | `CERV2AutoSaveService.js`     | ✅ Working | Debounced 2s, localStorage persistence        |
| AI Suggestion Panel    | `CERV2EditorAI.jsx`           | ✅ Working | Fetches on section focus/edit                 |
| Scaffold/Auto-populate | `handleScaffoldRefresh`       | ✅ Working | Bulk template fetch → AI-to-editor conversion |
| Version History        | `CERV2VersionHistory.jsx`     | ✅ Working | Section-level diff via server versions        |
| Attachment Manager     | `CERV2AttachmentManager.jsx`  | ✅ Working | Groups by section, size limits                |
| Compliance Engine      | `CERV2ComplianceEngine.js`    | ✅ Working | Real-time validation + scoring                |
| Review Workflow        | `CERV2ReviewWorkflow.jsx`     | ✅ Working | Multi-role review states                      |
| Export Controls        | `CERV2ExportControls.jsx`     | ✅ Working | PDF/DOCX/ZIP triggers                         |
| Device Context Panel   | `CERV2DeviceContextPanel.jsx` | ✅ Working | Collapsible, persisted context                |
| Predicate Search       | `CERV2PredicateSearch.jsx`    | ✅ Working | Client-side (no dedicated server endpoint)    |
| Citation Manager       | `CERV2CitationManager.jsx`    | ✅ Working | In-section citation tracking                  |
| Section Status Badges  | `cerv2-section-targets.js`    | ✅ Working | Word count targets + status computation       |
| Undo/Redo              | TipTap built-in               | ✅ Working | History extension                             |
| Markdown→TipTap        | Export service                | ✅ Working | `ai-to-editor` endpoint                       |

### 6.3 — Canvas Editing → Export Flow

```
[Canvas Edit] → [AutoSave to localStorage] → [Export Controls]
                                                   ↓
                                    ┌──────────────┼──────────────┐
                                    ↓              ↓              ↓
                               POST /pdf      POST /docx     POST /zip
                                    ↓              ↓              ↓
                              Combined PDF   Combined DOCX   Full Pack
                                                              (per-section
                                                               PDFs + DOCX
                                                               + metadata)
```

**Status:** ✅ End-to-end flow is connected. Edits in Canvas can be exported to all 3 formats.

---

## 7. Gap Report

### 7.1 — CRITICAL Gaps (Block production use)

| #   | Gap                                                               | Module       | Impact                                                                                   | Remediation                                                                                           |
| --- | ----------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| C1  | **AI endpoints return static templates** — no LLM/GPT integration | AI           | All AI suggestions are placeholder text, not contextually generated                      | Integrate OpenAI/Claude API behind `/suggest`, `/analyze-section`, `/equivalence`, `/benefit-risk`    |
| C2  | **IND Module 4 (Nonclinical Studies) — zero templates**           | IND          | Cannot generate Module 4 content                                                         | Create DOCX templates + Jinja2 generators for pharmacology, pharmacokinetics, toxicology sub-sections |
| C3  | **IND Module 5 (Clinical Study Reports) — minimal coverage**      | IND          | Only CSR Synopsis exists; full CSR, tabulations, case report forms missing               | Create comprehensive Module 5 template set                                                            |
| C4  | **PMA has no DOCX seed templates**                                | DOCX Factory | PMA documents can only be generated via CERV2 editor export, not standalone DOCX factory | Create PMA-specific seed templates (summary, nonclin, clin, mfg, labeling, risk, pms)                 |

### 7.2 — HIGH Gaps (Major functionality issues)

| #   | Gap                                                          | Module | Impact                                                    | Remediation                                                                    |
| --- | ------------------------------------------------------------ | ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| H1  | **510(k) per-section PDFs missing 4 sections**               | Export | admin, ifu, pred, concl don't get individual PDFs in ZIP  | Add render functions for missing 4 sections                                    |
| H2  | **`cover_letter` and `summary` not in shared/docTypes.ts**   | Config | Type system doesn't recognize 2 of 10 510(k) sections     | Add to `DocTypeConfigs.cerv2_510k.sections` array                              |
| H3  | **`cerv2-versions.ts` is dead stub code**                    | API    | 2 endpoints with no auth, no DB, return empty arrays      | Either implement fully or remove and redirect to section-level versions        |
| H4  | **`fetchEquivalence()` / `fetchBenefitRisk()` never called** | Client | Two AI features are wired but unreachable from the editor | Wire to PredicateSearch panel (equivalence) and Review Workflow (benefit-risk) |
| H5  | **IND templates route commented out**                        | IND    | 4 IND template endpoints inaccessible                     | Uncomment in `server/index.ts` and verify                                      |

### 7.3 — MEDIUM Gaps (Functional but incomplete)

| #   | Gap                                                   | Module       | Impact                                                                                           | Remediation                                                                   |
| --- | ----------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| M1  | **DOCX Factory seeds only 6 of 19 catalog templates** | DOCX Factory | 13 templates require manual registration                                                         | Update seed logic to register all 19                                          |
| M2  | **Mock export routes lack auth**                      | Export       | Unauthenticated PDF/DOCX/ZIP generation on non-prod                                              | Add `authMiddleware` to mock routes or restrict to `NODE_ENV=development`     |
| M3  | **No predicate search server endpoint**               | API          | `CERV2PredicateSearch.jsx` works client-side only                                                | Create `GET /api/cerv2/ai/predicate-search` backed by FDA 510(k) database     |
| M4  | **IND Module 1 missing 5+ sub-templates**             | IND          | Only cover letter + 3 forms; missing environmental assessment, patent info, financial disclosure | Expand Module 1 template catalog                                              |
| M5  | **IND Module 2 summaries are Jinja2 only**            | IND          | No DOCX preview or editor integration                                                            | Create DOCX render pipeline for Module 2 templates                            |
| M6  | **No IND doc type in CERV2 editor**                   | CERV2        | CERV2 editor only supports 510k/PMA/CER; IND uses separate automation pipeline                   | Consider adding `cerv2_ind` doc type or document the architectural separation |

### 7.4 — LOW Gaps (Cosmetic / polish)

| #   | Gap                                              | Module | Impact                                             | Remediation                                        |
| --- | ------------------------------------------------ | ------ | -------------------------------------------------- | -------------------------------------------------- |
| L1  | **Enhanced mock content only for 8/25 sections** | AI     | 17 sections get basic templates, not rich Markdown | Expand `enhancedMockContent` to cover all sections |
| L2  | **No CHANGELOG.md**                              | Docs   | Release history not documented                     | Generate from git log                              |
| L3  | **Pre-existing build warnings**                  | Build  | react-hook-form resolution, CERV2Page.jsx regex    | Clean up in separate PR                            |
| L4  | **eCTD XML templates are minimal**               | eCTD   | Only basic `index.xml` structure                   | Expand FDA/EMA regional XML templates              |

---

## 8. Readiness Matrix

### 8.1 — By Doc Type

|                            | 510(k)                      | PMA              | CER               | IND                               |
| -------------------------- | --------------------------- | ---------------- | ----------------- | --------------------------------- |
| **Section Definitions**    | ✅ 10 sections              | ✅ 7 sections    | ✅ 8 sections     | ⚠️ 5 modules, sparse sub-sections |
| **AI Template Population** | ✅ All 10                   | ✅ All 7         | ✅ All 8          | ❌ Not in CERV2 AI                |
| **AI Deep Analysis**       | ⚠️ 3/10 deep                | ⚠️ 2/7 deep      | ⚠️ 3/8 deep       | ❌ N/A                            |
| **LLM Integration**        | ❌ None                     | ❌ None          | ❌ None           | ❌ None                           |
| **DOCX Seed Templates**    | ✅ 5 templates              | ❌ 0 templates   | ✅ 4 templates    | ✅ 10 templates                   |
| **Export: PDF**            | ✅ Combined + 6 per-section | ✅ Combined + 7  | ✅ Combined + 8   | ⚠️ IND automation only            |
| **Export: DOCX**           | ✅ Combined                 | ✅ Combined      | ✅ Combined       | ✅ Per-form                       |
| **Export: ZIP**            | ✅ Full pack                | ✅ Full pack     | ✅ Full pack      | ⚠️ eCTD assembly                  |
| **Canvas Editing**         | ✅ Full                     | ✅ Full          | ✅ Full           | ❌ Separate pipeline              |
| **Autosave**               | ✅                          | ✅               | ✅                | ❌                                |
| **Version History**        | ✅                          | ✅               | ✅                | ❌                                |
| **Compliance Engine**      | ✅                          | ✅               | ✅                | ❌                                |
| **Mock Vault Document**    | ✅ CardioMonitor Pro        | ✅ NeuroStim DBS | ✅ GlucoSense CGM | ❌                                |
| **Style Pack**             | ✅ 510k_v1                  | ✅ pma_v1        | ✅ cer_mdr_v1     | ❌                                |
| **Overall**                | **90%**                     | **80%**          | **90%**           | **30%**                           |

### 8.2 — By Feature Layer

| Layer                | Status        | Coverage                                                                                                           | Blockers                                              |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **DB Schema**        | ✅ Production | `cerv2_510k_sections`, `cerv2_section_versions`, `documents`, `document_versions`, `ectd_modules`, `ectd_granules` | None                                                  |
| **API Routes**       | ✅ Production | 40+ endpoints across AI, Export, Sections, Documents, DOCX Factory, IND                                            | `cerv2-versions.ts` stub, IND templates commented out |
| **Auth & RBAC**      | ✅ Production | `authMiddleware` + `requireEditorAccess` on all write endpoints                                                    | Mock routes lack auth                                 |
| **Client Services**  | ✅ Production | 4 services fully wired                                                                                             | 2 AI methods unused                                   |
| **Editor UI**        | ✅ Production | TipTap + 12 Phase 9 components                                                                                     | —                                                     |
| **AI Intelligence**  | ⚠️ Mock only  | Static templates with placeholder replacement                                                                      | No LLM integration                                    |
| **Template Library** | ⚠️ Partial    | 19 seed DOCX + 25 editor section templates                                                                         | PMA DOCX missing, IND Modules 4-5 sparse              |
| **Export Pipeline**  | ✅ Production | PDF, DOCX, ZIP for all 3 CERV2 types                                                                               | 4 missing per-section PDFs for 510(k)                 |

---

## 9. Prioritized Remediation Roadmap

### Phase 0A — Immediate (Before QA)

| Priority | Task                                                                         | Effort | Files Affected                                         |
| -------- | ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| **P0-1** | Add `cover_letter` and `summary` to `shared/docTypes.ts` sections for 510(k) | 30 min | `shared/docTypes.ts`, `server/common/docTypes.js`      |
| **P0-2** | Remove or implement `cerv2-versions.ts` (dead code)                          | 30 min | `server/routes/cerv2-versions.ts`, `server/index.ts`   |
| **P0-3** | Add auth to mock export routes                                               | 15 min | `server/routes/cerv2-export-routes.ts`                 |
| **P0-4** | Wire `fetchEquivalence()` to PredicateSearch panel                           | 1 hr   | `client/src/components/CERV2PredicateSearch.jsx`       |
| **P0-5** | Wire `fetchBenefitRisk()` to Review Workflow                                 | 1 hr   | `client/src/components/CERV2ReviewWorkflow.jsx`        |
| **P0-6** | Uncomment IND templates route                                                | 15 min | `server/index.ts`                                      |
| **P0-7** | Update DOCX Factory seed to register all 19 templates                        | 2 hr   | `shadow_service/shadow_service/seed_docx_templates.py` |

### Phase 0B — Template Completion (1–2 weeks)

| Priority | Task                                                              | Effort | Dependencies |
| -------- | ----------------------------------------------------------------- | ------ | ------------ |
| **P1-1** | Create 7 PMA DOCX seed templates                                  | 3 days | None         |
| **P1-2** | Add 4 missing 510(k) per-section PDF renderers                    | 1 day  | None         |
| **P1-3** | Expand IND Module 1 templates (env assessment, patent, financial) | 2 days | None         |
| **P1-4** | Create IND Module 4 template set (pharma, PK, tox)                | 3 days | None         |
| **P1-5** | Create IND Module 5 template set (full CSR, tabulations)          | 3 days | None         |
| **P1-6** | Expand enhanced mock content to all 25 sections                   | 1 day  | None         |

### Phase 1A — AI Integration (2–4 weeks)

| Priority | Task                                                   | Effort | Dependencies         |
| -------- | ------------------------------------------------------ | ------ | -------------------- |
| **P2-1** | Integrate OpenAI/Claude behind `/api/cerv2/ai/suggest` | 3 days | API key provisioning |
| **P2-2** | Integrate LLM for `/api/cerv2/ai/analyze-section`      | 2 days | P2-1                 |
| **P2-3** | Integrate LLM for `/api/cerv2/ai/equivalence`          | 1 day  | P2-1                 |
| **P2-4** | Integrate LLM for `/api/cerv2/ai/benefit-risk`         | 1 day  | P2-1                 |
| **P2-5** | Create server-side predicate search endpoint           | 2 days | FDA 510(k) database  |
| **P2-6** | Add IND doc type to CERV2 AI routes                    | 3 days | P1-4, P1-5           |

### Phase 1B — End-to-End Polish (1 week)

| Priority | Task                                      | Effort |
| -------- | ----------------------------------------- | ------ |
| **P3-1** | Generate CHANGELOG.md from git history    | 1 hr   |
| **P3-2** | Clean up pre-existing build warnings      | 2 hr   |
| **P3-3** | Expand eCTD XML templates                 | 1 day  |
| **P3-4** | Add IND Canvas editing support (optional) | 3 days |

---

## 10. End-to-End Dry Run Plan

### Test Matrix — 1 document per doc type

| Step                    | 510(k) Test                                  | PMA Test           | CER Test          | IND Test                 |
| ----------------------- | -------------------------------------------- | ------------------ | ----------------- | ------------------------ |
| **1. Load Template**    | Select cerv2_510k                            | Select cerv2_pma   | Select cerv2_cer  | N/A (automation)         |
| **2. AI Scaffold**      | `handleScaffoldRefresh` → 10 sections        | Same → 7 sections  | Same → 8 sections | `POST /generate/module3` |
| **3. AI Suggest**       | Focus each section, verify template text     | Same               | Same              | N/A                      |
| **4. Canvas Edit**      | Edit Device Description, save                | Edit Clinical Data | Edit SOTA         | View generated DOCX      |
| **5. Autosave**         | Verify localStorage persistence              | Same               | Same              | N/A                      |
| **6. Version History**  | Check version diff for edited section        | Same               | Same              | N/A                      |
| **7. Compliance Check** | Run compliance engine                        | Same               | Same              | N/A                      |
| **8. Export PDF**       | `POST /export/pdf` → verify all sections     | Same               | Same              | `render_form1571()`      |
| **9. Export DOCX**      | `POST /export/docx` → open in Word           | Same               | Same              | Module 3 DOCX            |
| **10. Export ZIP**      | `POST /export/zip` → verify per-section PDFs | Same               | Same              | eCTD assembly ZIP        |
| **11. Readiness Score** | Ensure compliance ≥ 80%                      | Same               | Same              | Manual check             |

### Breakpoint Indicators

- ❌ If scaffold returns empty sections → AI template gap
- ❌ If export crashes → renderer gap
- ❌ If Canvas won't save → AutoSave service issue
- ❌ If compliance engine flags >50% incomplete → population gap
- ⚠️ If DOCX formatting is wrong → style pack issue
- ⚠️ If per-section PDF is missing → renderer gap

---

## Appendix A: Complete File Index

### CERV2 Core Files

| Category             | File                                        | Purpose                        |
| -------------------- | ------------------------------------------- | ------------------------------ |
| **Config**           | `shared/docTypes.ts`                        | Canonical doc type definitions |
| **Config**           | `server/common/docTypes.js`                 | Server-side JS mirror          |
| **Editor**           | `client/src/pages/CERV2EditorAI.jsx`        | Main orchestrator (1081 lines) |
| **AI Routes**        | `server/routes/cerv2-ai-routes.ts`          | 6 AI endpoints                 |
| **Export Routes**    | `server/routes/cerv2-export-routes.ts`      | 9 export endpoints             |
| **Section Routes**   | `server/routes/cerv2-sections.ts`           | 6 CRUD endpoints               |
| **Document Routes**  | `server/routes/cerv2-document-routes.ts`    | 3 document endpoints           |
| **Version Routes**   | `server/routes/cerv2-versions.ts`           | 2 stub endpoints ⚠️            |
| **Export Renderers** | `server/export/renderers.ts`                | PDF/DOCX/ZIP rendering         |
| **Style Packs**      | `server/export/stylePacks/config.ts`        | 3 style pack configs           |
| **Mock Vault**       | `server/services/mockVault.ts`              | 3 demo documents               |
| **Template Mapper**  | `server/services/documentTemplateMapper.ts` | 510(k) eSTAR mapping           |

### Phase 9 Components

| File                                                | Purpose                |
| --------------------------------------------------- | ---------------------- |
| `client/src/services/CERV2AIService.js`             | AI endpoint client     |
| `client/src/services/CERV2ExportService.js`         | Export endpoint client |
| `client/src/services/CERV2SectionService.js`        | Section CRUD client    |
| `client/src/services/CERV2AutoSaveService.js`       | localStorage autosave  |
| `client/src/components/CERV2VersionHistory.jsx`     | Version diffs          |
| `client/src/components/CERV2AttachmentManager.jsx`  | File attachments       |
| `client/src/components/CERV2ReviewWorkflow.jsx`     | Review states          |
| `client/src/components/CERV2ExportControls.jsx`     | Export UI              |
| `client/src/components/CERV2DeviceContextPanel.jsx` | Device metadata        |
| `client/src/components/CERV2PredicateSearch.jsx`    | Predicate lookup       |
| `client/src/components/CERV2CitationManager.jsx`    | Citations              |
| `client/src/components/CERV2ComplianceEngine.js`    | Real-time validation   |
| `client/src/utils/cerv2-section-targets.js`         | Word count targets     |
| `client/src/utils/cerv2-validation-utils.js`        | Validation helpers     |

### DOCX Factory (Shadow Service)

| File                                                       | Purpose               |
| ---------------------------------------------------------- | --------------------- |
| `shadow_service/shadow_service/router_docx_factory.py`     | 12 API endpoints      |
| `shadow_service/shadow_service/models_docx_factory.py`     | Pydantic models       |
| `shadow_service/shadow_service/docx_renderer.py`           | DOCX render engine    |
| `shadow_service/shadow_service/generators/docx_factory.py` | SE Matrix factory     |
| `shadow_service/shadow_service/seed_docx_templates.py`     | 19-item seed catalog  |
| `shadow_service/shadow_service/demo_templates/`            | 19 DOCX files on disk |

### IND Automation

| File                                      | Purpose                                       |
| ----------------------------------------- | --------------------------------------------- |
| `ind_automation/templates.py`             | Form 1571/1572/3674 + cover letter generators |
| `ind_automation/create_template.py`       | Module 3 CMC generator                        |
| `ind_automation/templates/`               | Jinja2 templates (forms + modules 2-3)        |
| `server/routes/ind_automation_routes.ts`  | 13 IND automation endpoints                   |
| `server/routes/ind-database.routes.ts`    | 8 IND database endpoints                      |
| `server/routes/ind-submissions.routes.ts` | 6 IND submission endpoints                    |
| `server/routes/ind.ts`                    | 3 basic IND endpoints                         |

---

## Appendix B: API Endpoint Complete Registry

### CERV2 Core — 26 endpoints

```
GET    /api/cerv2/ai/health                          # Health check (open)
POST   /api/cerv2/ai/suggest                         # AI section suggestion
POST   /api/cerv2/ai/equivalence                     # SE equivalence text
POST   /api/cerv2/ai/benefit-risk                    # Benefit-risk determination
POST   /api/cerv2/ai/analyze-section                 # Deep section analysis
GET    /api/cerv2/ai/templates/:docType              # Bulk template fetch

POST   /api/cerv2/export/pdf                         # Combined PDF
POST   /api/cerv2/export/docx                        # Combined DOCX
POST   /api/cerv2/export/zip                         # Full submission pack
POST   /api/cerv2/export/ai-to-editor                # AI → TipTap JSON
GET    /api/cerv2/export/mock/:docType               # Mock PDF (dev)
GET    /api/cerv2/export/mock/:docType/docx          # Mock DOCX (dev)
GET    /api/cerv2/export/mock/:docType/zip           # Mock ZIP (dev)
GET    /api/cerv2/export/mock/:docType/json          # Mock JSON (dev)
GET    /api/cerv2/export/health                      # Health check (open)

GET    /api/cerv2-sections                           # List sections
GET    /api/cerv2-sections/:sectionId                # Get section
POST   /api/cerv2-sections                           # Create section
PATCH  /api/cerv2-sections/:sectionId                # Update section
DELETE /api/cerv2-sections/:sectionId                # Delete section
GET    /api/cerv2-sections/:sectionId/versions       # Version history

GET    /api/cerv2/documents                          # List documents
GET    /api/cerv2/documents/:documentId              # Get document
POST   /api/cerv2/documents/:documentId/save         # Save document

GET    /api/cerv2-versions                           # ⚠️ STUB — returns []
GET    /api/cerv2-versions/:versionId                # ⚠️ STUB — returns null
```

### DOCX Factory — 12 endpoints

```
POST   /api/docx-factory/templates                   # Register template
GET    /api/docx-factory/templates                   # List templates
POST   /api/docx-factory/templates/:id/versions      # Create version
GET    /api/docx-factory/templates/:id/versions      # List versions
POST   /api/docx-factory/renders                     # Create render
GET    /api/docx-factory/renders/:id                 # Get render
GET    /api/docx-factory/renders                     # List renders
POST   /api/docx-factory/renders/:id/execute         # Execute render
GET    /api/docx-factory/renders/:id/events          # Render audit log
GET    /api/docx-factory/artifacts/:id/download      # Download artifact
POST   /api/docx-factory/seed                        # Seed starter templates
GET    /api/docx-factory/demo-packs                  # Demo input packs
```

### IND — 30+ endpoints

```
GET    /api/ind/applications                         # List IND apps
GET    /api/ind/applications/:id                     # Get IND app
POST   /api/ind/applications                         # Create IND app
GET    /api/ind-automation/status                    # Service status
GET    /api/ind-automation/info                      # Service info
GET    /api/ind-automation/projects                  # List projects
POST   /api/ind-automation/generate/module3          # Generate Module 3
POST   /api/ind-automation/batch/module3             # Batch Module 3
POST   /api/ind-automation/generate/form1571         # Form 1571
POST   /api/ind-automation/generate/form1572         # Form 1572
POST   /api/ind-automation/generate/form3674         # Form 3674
POST   /api/ind-automation/generate/cover-letter     # Cover letter
GET    /api/ind-database/project                     # Get IND project
POST   /api/ind-database/project                     # Create project
GET    /api/ind-database/wizard/data                 # Wizard form data
POST   /api/ind-database/sections/:id/generate       # AI-generate section
GET    /api/ind-database/templates                   # IND templates
POST   /api/ind-database/templates/:id/use           # Use template
POST   /api/ind-database/workflow/save               # Save workflow
GET    /api/ind-database/workflow/:entityId           # Get workflow
GET    /api/ind-submissions/active                   # Active submissions
GET    /api/ind-submissions/:id                      # Get submission
POST   /api/ind-submissions/create                   # Create submission
PUT    /api/ind-submissions/:id                      # Update submission
POST   /api/ind-submissions/:id/ind-step             # Advance step
POST   /api/ind-submissions/:id/transition-to-ectd   # Transition to eCTD
```

---

_Generated by Phase 0-1 Readiness Audit — CERV2 Platform v1.0.0_
