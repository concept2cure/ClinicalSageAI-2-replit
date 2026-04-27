# Document Assembly From Artifacts — eCTD Pipeline & Biotech/Pharma Audit

**Date:** 2026-04-27
**Branch:** concept2cure-v2
**Scope:** Read-only audit of how project artifacts (memory atoms, ingested docs, charter sections, generated drafts, AI outputs) become eCTD-compliant Module 1–5 deliverables for biotech/pharma clients.
**Out of scope:** UI (per user directive — do not touch UI).

---

## A. eCTD Pipeline Today (As Implemented)

The pipeline is **partially wired end-to-end**: a real eCTD ZIP can be produced, but the *content* feeding the ZIP is not composed from artifacts in any biotech-ready way.

### Data entry points
1. **Memory atoms** — `server/services/memory-context-assembler.ts:1-100` (working / project / client memory layers)
2. **Ingested documents** — `cmc_source_objects`, `ctd_onboarding_documents` (`migrations/0007_ctd_onboarding_pipeline.sql:36-61`)
3. **Charter sections** — `projectCharters`, `charterSections` (`shared/schema/project-charter.ts:56-203`)
4. **Generated drafts** — `concept2cureArtifacts` (in `shared/schema.ts`)
5. **AI outputs** — CSR builder, submission twin, intelligent report engine write back into artifacts

### Stage 1 — Artifact → Section Draft
- **Service:** `server/services/csr-builder.ts:1-150` (ICH E3 — 16 sections, 50+ subsections defined)
- **Status:** **PARTIAL.** Section structure scaffolded; build-job execution incomplete past the `Launch a CSR build job` cutoff (~line 150).

### Stage 2 — Section Draft → Document
- **Service:** `server/services/submission-twin-service.ts:1-150` (claim extraction, evidence linking, drift)
- **Status:** **SCHEMA-ONLY for documents.** Tracks `submissionTwinClaims` ↔ `submissionTwinEvidenceLinks` and predicts next-best artifacts, but **does not emit eCTD documents**.

### Stage 3 — Document → Submission Package
- **Service:** `server/services/regulatory/submissionPackageBuilder.ts` (`buildPackageManifest()` at line 93)
- **Status:** **WIRED for manifest.** Maps registry IDs → required sections per IND/NDA/BLA. Builds metadata/completeness, **not content**. Used by `report-os.ts:22`.

### Stage 4 — Submission Package → eCTD ZIP (the core)
- **Service:** `server/services/ectdExportService.ts:333-664`
- **Route:** `POST /api/ectd/export/:submissionId` (`server/routes/ectd-export.ts:69-150`)
- **Flow:**
  1. Fetch eCTD modules/granules from `ectdModules`, `ectdGranules` (lines 354-407)
  2. Try content from `document_versions` (456-470) → `concept2cure_artifacts` (476-493) → granule metadata (496) → **structured placeholder** (502-510)
  3. Organize by module + folder tree (413-417)
  4. Generate `index.xml` per ICH M8 (577-584), regional XML for M1 (588-590), per-module manifests (593-603), STF (607-620)
  5. JSZip buffer (645-650)
- **Status:** **WIRED AND ROUTED.** Real eCTD ZIP is produced — but if no content is found in the vault or artifacts, it ships placeholders.

### Stage 5 — eCTD Package Validation
- **Service:** `server/services/ectdExportService.ts:679-814` (`validateEctdPackage()`)
- **Checks:** index.xml well-formed, file refs resolve to ZIP entries (706-712), module folders present (716-721), regional XML present in M1 (725-729), all XML files well-formed (733-745), STF present (748-749)
- **Status:** **WIRED but superficial.** Validates ZIP/XML mechanics. Does **NOT** perform DTD validation, study tagging, leaf metadata, sequence numbering, lifecycle ops, or FDA ESG conformance.

### Module-by-module wiring matrix
| Module | Content source | DTD validation | FDA ESG conformance | Status |
|---|---|---|---|---|
| **M1 Admin** | Regional XML template (US/EU/JP) | Well-formedness only | No | PARTIAL |
| **M2 Summaries** | Placeholder generator | Well-formedness only | No | STUB |
| **M3 CMC/Quality** | `cmc_source_objects` + Module 3 composer | Well-formedness only | No | WIRED-PARTIAL |
| **M4 Nonclinical** | Granule lookup → placeholder | Well-formedness only | No | STUB |
| **M5 Clinical** | CSR builder + granule lookup | Well-formedness only | No | WIRED-PARTIAL |

---

## B. What's Wired End-to-End

### Implemented & routed
1. **eCTD ZIP generation** — `ectdExportService.generateEctdPackage()` → `/api/ectd/export/:submissionId` (`server/routes/ectd-export.ts:103`).
2. **eCTD ZIP structural validation** — `validateEctdPackage()` → `/api/ectd/export/:submissionId/validate` (`server/routes/ectd-export.ts:199`).
3. **Submission package manifest** — `buildPackageManifest()` mapping IND/NDA/BLA → required sections (`submissionPackageBuilder.ts:93-176`).
4. **Module 3 CMC convergence** — `module3-convergence-service.ts:97-149` maps artifacts → `cmc_source_objects` → `cmc_module3_sections` (build-state tracking).
5. **CSR scaffolding** — ICH E3 16-section structure + 50+ subsections (`csr-builder.ts:36-107`); Foresight integration (`foresight-csr-integration.ts`).
6. **Submission lifecycle agent** — `ectd-submission-agent.ts:69-424` manages draft → assembling → validated → submitted with file-naming validation, but **no content composition**.
7. **Submission twin** — `submission-twin-service.ts` tracks claims/evidence/drift/fragility; predicts next-best artifact. **Does not emit documents.**

### Not wired
- IND-enabling auto-assembly (preclinical summary, CMC overview, protocol)
- NDA narrative summaries (M2.3, M2.4, M2.7)
- BLA comparability protocols / biosimilar stream
- CMC narrative composition for 3.2.S, 3.2.P, 3.2.A, 3.2.R
- Annual reports
- IND amendments
- Biostatistics module
- Briefing books
- Safety reports / NTA

---

## C. What's Missing for Biotech/Pharma

### 1. IND submission package (wired ~0%)
- **Needs:** FDA Form 1571, protocol + amendments, M2.3.13 preclinical summary, M2.4 CMC overview, NTA safety report, Phase 1 plan.
- **Exists:** `indConfig` JSON on `projectCharters` (`project-charter.ts:85`).
- **Gap:** No IND assembly service; no 30-day-clock model; no pre-IND meeting workflow.

### 2. NDA submission package (wired ~10%)
- **Needs:** Form 356h, fully-populated M1–M5, M2.3 quality summary, M2.4.S nonclinical summary, M2.7.S clinical summary (depends on CSR), labeling draft, REMS where applicable.
- **Exists:** `ndaConfig` JSON; manifest builder scaffold.
- **Gap:** M2.3/2.4/2.7 builders missing; CSR → M2.7 composition missing; 505(b)(1) vs (b)(2) not differentiated.

### 3. BLA submission package (wired ~5%)
- **Needs:** Comparability protocol (biosimilar), characterization (M2.3.1), animal tox/PK (M2.4.13), clinical immunogenicity (M2.7.4).
- **Exists:** `blaConfig` JSON (`project-charter.ts:89`).
- **Gap:** No BLA assembly service; biosimilar stream entirely absent.

### 4. CMC Module 3 (wired ~30%)
- **Wired:** `cmc_source_objects` ingestion (`module3-convergence-service.ts:105-111`); `cmc_module3_sections` build-state (113-120); `module3Composer` referenced.
- **Not wired:** Automated narrative generation from source objects; per-subsection builders for 3.2.S.1–3.2.S.7, 3.2.P.1–3.2.P.8, 3.2.A.*, 3.2.R.*; cross-reference injection ("see stability in 3.2.S.7"); QbD integration.

### 5. CSR / ICH E3 (wired ~20%)
- **Exists:** Section structure, subsection IDs, AI-client attempt (`csr-builder.ts:14-20`), Foresight glue.
- **Missing:** Section drafting from study data; efficacy/safety tabulation (§11, §12); integrated stat outputs; comparison tables; cross-link to M2.7.S.

### 6. Biostatistics & statistical sections (wired 0%)
- **Needs:** §9.7 (methods), §11.4 (efficacy results), §12.4 (lab evaluation).
- **Exists:** `ana-biostats/` referenced in `body-aware-authoring.ts`; no active routes.
- **Gap:** Biostat module is absent from the assembly pipeline.

### 7. eCTD validation & DTD compliance (wired ~40%)
- **Implemented:** XML well-formedness; file-ref resolution; folder structure (`ectdExportService.ts:763-814`).
- **Missing:** DTD validation against `ich-ectd-3-2.dtd` (referenced in index.xml line 201, but no real validation); per-leaf `@study-id` tagging (ICH M8); sequence-number gap detection; MD5 checksum-type enforcement; lifecycle ops (new/append/replace/delete); regional rule differences (FDA ESG vs EMA CESP vs PMDA).

### Submission-type coverage
| Pathway | Schema | Manifest | Builder | Validation | Notes |
|---|---|---|---|---|---|
| IND | Yes | — | — | — | Pre-IND, 30-day clock not modeled |
| NDA | Yes | scaffold | — | — | M2.3/2.4/2.7 missing; (b)(1)/(b)(2) undifferentiated |
| BLA | Yes | — | — | — | Comparability/biosimilar absent |
| 510(k) | Yes | — | — | — | Predicate comparison missing |
| PMA | Yes | — | — | — | IDE integration absent |
| De Novo | Yes | — | — | — | Special controls missing |
| eCTD ZIP | — | — | Yes | superficial | Generates ZIP; no DTD/ESG checks |
| CSR (ICH E3) | Yes | — | scaffold | — | Foresight glue partial |

---

## D. Artifact Lineage & Governance Gaps

### Provenance tracking — what exists
1. **Content-hash chain (PARTIAL).** `contentHash` (SHA-256) on `projectCharters` (`project-charter.ts:115`), `charterSections` (172), `concept2cureArtifacts` (~schema.ts), `vaultDocuments` (`vault.ts:89`). Enables integrity verification — not full causality.
2. **Provenance events (PARTIAL).** `concept2cureProvenanceEvents` and `cmc_provenance_events` (`cmc-os.ts:85`) are written, but no route surfaces them as a "what artifacts contributed to section X" query.
3. **Version control (PARTIAL).** `concept2cureArtifactVersions` (immutable history); `charterSections.version` + `previousVersionHash` (`project-charter.ts:173`). No audit trail linking version A → B → assembly output.
4. **Artifact-section mapping (WIRED schema-only).** `c2c_artifact_section_map` (`migrations/0002_phase15_submission_ops.sql:41-57`) maps artifacts → sections with owner/role; no route confirmed to use it for evidence tracing.

### Gaps
1. **End-to-end traceability.** No service answers "which memory atoms / docs / AI outputs produced section 3.2.S.2?"
2. **Regeneration auditability.** No change-impact service re-runs affected sections when a source artifact updates.
3. **Artifact → eCTD leaf mapping.** No explicit binding of `concept2cure_artifacts` to eCTD granules/leaves in the generated `index.xml`.
4. **21 CFR Part 11 submission provenance.** No per-submission provenance event recording exactly what went into the ZIP.
5. **Memory-atom → section attribution.** No back-link from final section content to retrieved memory atoms.

---

## E. Top 5 Gaps to Close Before a Biotech Submission Could Ship

### 1. eCTD validation against DTD & FDA ESG (BLOCKER)
- **File:** `server/services/ectd/ectd4-validator.ts` (skeleton).
- **Add:** DTD schema validation; per-leaf `study-id` tagging; lifecycle-op rule enforcement; MD5 checksum enforcement; sequence-gap detection; regional-gateway compliance (FDA vs EMA vs PMDA).
- **Why:** Submissions with invalid eCTD structure are rejected at the FDA ESG gateway before human review.

### 2. M2 summary builders (BLOCKER for NDA)
- **Add services for:** 2.3.S (quality summary, from M3.2 narratives), 2.4.S (nonclinical summary, from M4 study reports), 2.7.S (clinical summary, from CSR §11–12).
- **Why:** No NDA without M2 summaries; today there is no automation path.

### 3. CMC Module 3 narrative composition (BLOCKER for any submission)
- **File:** `server/services/module3Composer.ts` (partial).
- **Add:** Narrative generation from `cmc_source_objects` (now only tracked, not composed); per-subsection builders for 3.2.S.1–3.2.S.7, 3.2.P.1–3.2.P.8, 3.2.A.*, 3.2.R.*; cross-reference injection.
- **Why:** CMC is required for IND, NDA, BLA, 510(k). Today the pipeline ingests data but does not write the narrative.

### 4. CSR builder completion (CRITICAL for clinical submissions)
- **File:** `server/services/csr-builder.ts:150+`.
- **Add:** `launchCSRBuildJob()` execution; section generation from study data; efficacy/safety tabulation (§11, §12); demographics/baseline tables; AE summary tables; CDISC ODM or vault integration.
- **Why:** No NDA/BLA without a CSR; today only scaffolding.

### 5. Submission-package assembly orchestrator (BLOCKER for any workflow)
- **Add:** New `submission-package-orchestrator.ts` that sequences artifacts → sections → modules → ZIP; resolves dependencies (don't generate M2.3.S until M3.2 is locked); tracks progress; recovers from failures; regenerates downstream when an upstream artifact changes; emits a per-submission audit log of inputs.
- **Why:** No single service coordinates the full artifact → eCTD journey today; routes call individual services without sequencing.

---

## Summary

The system has **solid eCTD ZIP generation and basic structural validation**, but **lacks end-to-end biotech submission assembly**. The architecture is modular (`csr-builder`, `module3-composer`, `submission-twin`) but services are not orchestrated. Memory atoms, artifact provenance, and submission-twin intelligence exist but **do not flow into the final submission document**.

A biotech client today **can**: build M1 regional XML, ingest M3 source data, start an M5 CSR scaffold, and generate a placeholder-filled eCTD ZIP that passes well-formedness checks.

A biotech client today **cannot**: auto-compose M3 narrative from data, auto-generate M2 summaries, complete a CSR from study data, validate against FDA ESG DTD rules, or run a coordinated IND/NDA/BLA pipeline end-to-end.

Top priority sequence: **(1) validation hardening → (2) Module 3 narrative composition → (3) M2 summary builders → (4) CSR completion → (5) orchestrator**.
