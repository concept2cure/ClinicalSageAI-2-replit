# Document-Assembly Audit — Ground-Truth Verification

**Date:** 2026-04-27
**Branch:** concept2cure-v2
**Verifies:** `DOCUMENT_ASSEMBLY_ECTD_BIOTECH_AUDIT_2026-04-27.md` + `DOCUMENT_ASSEMBLY_BUILD_PLANS_2026-04-27.md`
**Method:** Read each cited file end-to-end (not excerpts) and produced a verdict per claim.

---

## Summary of corrections

| Plan | Audit verdict | Verified verdict | Plan delta |
|---|---|---|---|
| 1 — eCTD validator | "Build new validator" | Two validators exist (`ectdExportService.validateEctdPackage:726` + `ectd4-validator.validatePackage`). Real structural checks shipped. | **Rescope:** extend + merge, not duplicate. |
| 2 — M3 narrative composer | "Stub" | Templates are real ICH-M4Q narrative producers; 3.2.A/3.2.R absent. | **Hold:** A/R extension + LLM-on-top layer is correct. |
| 3 — M2 summary builders | "Missing entirely" | Confirmed missing. | **Hold.** |
| 4 — CSR builder | "Cut off, scaffolded, no real AI" | **Wrong on three counts.** File is 496 lines and complete. AI via `unified-ai-client` IS the gateway shim. 17 real ICH-E3 template strings. | **Downscope from 4.5w to ~1.5w**: wrap in job-state persistence + extend templates. Composer engine already works. |
| 5 — Submission orchestrator | "Missing" | **`server/routes/submission-orchestrator.ts` already exists.** | **Rescope:** merge with existing route, don't green-field. |

---

## Group A — eCTD pipeline core

### A.1 — `ectdExportService.ts`
**CONFIRMED with line drift.**
- `generateEctdPackage()` at line **375** (audit said 333).
- Placeholder selector at lines **538–552** (audit said 502–510).
- `validateEctdPackage()` at line **726** (audit said 679).
- Validator scope: XML well-formedness (745–759, 779–792), folder presence (763–769), regional XML (771–777), STF (794–797), DTD bundling (799–819). **No DTD-grammar validation, leaf metadata, or sequence rules** — audit verdict stands.

### A.2 — `ectd4-validator.ts:217` placeholder ternary
**CONFIRMED.** Same placeholder also at line **432** in `quickValidate()` — audit missed the second occurrence.
**Status: FIXED in commit `70a136ad`** with full NDA + BLA section sets per 21 CFR 314.50 / 21 CFR 601 / ICH M4.

### A.3 — `ectd-export.ts` routes
**CONFIRMED with line drift.**
- `POST /:submissionId` at lines **108–221** (audit said 69–150).
- `POST /:submissionId/validate` at lines **227–302** (audit said 199).
- Third route audit missed: `GET /:submissionId/preview` at **308–363**.
- Mount confirmed at `server/bootstrap/register-document-routes.ts:59`.

---

## Group B — Module 3 composer

### B.4 — `module3Composer.ts` covers S/P, omits A/R; templates only
**PARTIALLY CORRECT.**
- `MODULE3_SECTION_RULES` at **line 53** (exact match) covers 3.2.S.1–7, 3.2.P.1–8, structural 3.1 and 3.3 (53–74). **3.2.A.\* and 3.2.R.\* absent** — confirmed.
- `SECTION_GENERATORS` at line **116**: deterministic templates, **not stubs**. Each generator produces real markdown tables + sentence-level narrative with interpolated source values. **No LLM call anywhere in this file.**
- **Plan refinement:** treat as working deterministic compiler that needs A/R extension + LLM narrative layer on top. Not a green-field rewrite.

### B.5 — `module3-convergence-service.ts` state-tracking only
**CONFIRMED** with corrected lines: `getModule3BuildStatus()` runs queries at **104–137** (audit said 97–149). Composition delegated to `composeModule3FromCanonicalSources` from `module3Composer.ts`.

### B.6 — `cmc-module3-compiler.ts` exists
**CONFIRMED.** 4,362 bytes. Exports `createSourceHash` and deterministic `SECTION_MAP`. Canonical-source hasher, not a full compiler.

---

## Group C — CSR builder

### C.7 — `csr-builder.ts`
**WRONG on three counts, partially correct on one.**
- File is **496 lines and complete.** Default export at lines 489–496. Not "cut off."
- `unified-ai-client` import at lines 14–20: **this IS the AI gateway shim.** Same import pattern in `submission-twin-service.ts:40`. The variable `ai` is non-null when module resolves; `generateSectionWithAI` (230–275) calls `ai.complete()`. Audit's "legacy, not the gateway" framing is wrong.
- `launchCSRBuild()` at line 152: returns synchronously after computing all sections in-process loop (152–183). **In-process synchronous**, not "scaffolded." Job-persistence gap is real; "scaffolded" framing is wrong.
- `generateCSRSections` at line 189: iterates sections with AI-or-template selection (196–222). When AI is unavailable, falls back to `generateSectionTemplate` (439–480) which has **17 real ICH-E3 template strings.** Not a stub.
- Raw SQL in `compareWithExistingCSRs` at lines 325–355 — confirmed. Org-scoped query at line 332.

**Plan delta:** Plan 4 downscopes from "build CSR generator" (4.5w) to "wrap composer in job-state model + persist sections + extend templates" (~1.5w).

### C.8 — Foresight files
**CONFIRMED.** Both exist: `foresight-csr-integration.ts` (15.3KB, bridges Python deep-learning service) and `csr-foresight-orchestrator.ts` (18.7KB, higher-level orchestration).

---

## Group D — Submission package

### D.9 — `submissionPackageBuilder.ts`
**PARTIALLY CORRECT.** `buildPackageManifest()` at line 93 — but does NOT itself hardcode IND/NDA/BLA section maps. Delegates to `getSectionBlueprintForEntry(entry)` (104) and `getRequiredArtifacts(registryId)` (105), which live in `shared/regulatory/project-bootstrap.js` and `./requiredArtifactMatrix.js`. Validation rule gating by application type at lines 180–200.
**Plan delta:** treat `shared/regulatory/project-bootstrap.js` + `requiredArtifactMatrix.ts` as the canonical section-blueprint source, not this builder.

### D.10 — `ectd-submission-agent.ts`
**CONFIRMED.** 423 lines. Class `EctdSubmissionAgent` at 69–421. State machine via `ectd_submissions.status`: 'draft' (78) → 'assembling' (143) → 'validated' (251) → 'submitted' (282). Filename validation at line 179. **No narrative composition anywhere.**

### D.11 — `submission-twin-service.ts`
**CONFIRMED.** 1,533 lines. Grep for `ectd|m1/|m2/|m3/|backbone|index.xml` returned zero matches. 14 public methods around claims/evidence/drift/challenges/change-impact/readiness/assessments. **No eCTD emission.**

---

## Group E — Routes and missing routes

### E.12 — Missing route files
**CONFIRMED.** No files under `server/routes/` match `charter`, `commitment`, `regulatory-meeting`, `timeline-phase`, `module3-narrative`, `m2-summary`.
**`server/routes/submission-orchestrator.ts` DOES exist** — audit-grouped "submission-assembly / orchestrator routes" should split: orchestrator present, assembly absent.

### E.13 — pgvector queries scope by org + project
**PARTIALLY CORRECT.**
- Operator surface: **`<=>` (cosine) is the only operator used.** No `<->` (L2) anywhere in `server/services/`.
- **Org scope: mostly present.** Confirmed in `working-memory.ts:278`, `advancedRAGPipeline.ts:908`, `LiteratureAggregatorService.ts:365`, `client-intelligence-memory.ts:1571`, `regulatory-guidance-retrieval.ts:71`.
- **Project scope: largely ABSENT.** Only `advancedRAGPipeline.ts:1068-1069` filters by `project_id`. No project filter in working-memory, RAG-chunks, vault-chunks, literature, client-memory, regulatory-guidance, or regulatory-negotiation paths.

### E.14 — `conversation_working_memory` org scope
**CONFIRMED — three gaps, not one:**
1. `working-memory.ts:221-223` — **FIXED in commit `70a136ad`**
2. `working-memory.ts:364-367` — **FIXED in commit `70a136ad`**
3. `cortex-unified.ts:327-330` — **FIXED in commit `70a136ad`**
- `memory-consolidation-job.ts:86` is cross-tenant by design per its own comment (line 63 documents the intent). Not a gap.

---

## Group F — Schema lines

### F.15 — `shared/schema.ts` table line numbers
**PARTIALLY CORRECT (line drift across the board).**
| Table | Audit | Actual | Drift |
|---|---|---|---|
| `projects` | 5034 | **5044** | +10 |
| `projectIntelligenceProfiles` | 15641 | **15699** | +58 |
| `projectMemoryEntries` | 15704 | **15762** | +58 |
| `projectIngestedDocuments` | 15751 | **15809** | +58 |
| `ectdGranules` | 7751 | **7778** | +27 |
| `concept2cureArtifacts` | ~5267 | **5284** | +17 |

All tables exist. No structural errors. **Build plans should re-check schema line numbers before any edit.**

### F.16 — `shared/schema/project-charter.ts` lines
**CONFIRMED — all six lines are exact matches.** `projectCharters:56`, `charterSections:158`, `timelinePhases:220`, `projectCommitments:293`, `regulatoryMeetings:609`, `charterAuditEvents:683`. Schema is shipped — the missing piece is the routes layer.

---

## What this means for the build plans

### Plan 1 — eCTD validator hardening
- **Action:** extend `ectd4-validator.ts` and merge with `ectdExportService.validateEctdPackage`, not duplicate.
- **Scope retained:** DTD validation, leaf metadata, sequence gap detection, checksum buffer verification, study-id tagging, regional rule packs, validation-run audit.
- **Effort:** ~3 weeks unchanged.

### Plan 2 — M3 narrative composer
- **Action:** keep — extend with 3.2.A.* / 3.2.R.* + LLM-grounded narrative layer on top of the working deterministic generators.
- **Effort:** ~3.5 weeks unchanged.

### Plan 3 — M2 summary builders
- **Action:** hold as designed.
- **Effort:** ~3 weeks unchanged.

### Plan 4 — CSR builder
- **Major rescope.** Composer engine already works (real AI + real templates). Real gaps: synchronous in-process execution + no per-section persistence + missing template coverage for full ICH E3.
- **New scope:** wrap composer in `csr_build_jobs` state model + per-section persistence in `csr_section_outputs` + extend template strings + port the raw SQL at `csr-builder.ts:325-355` to Drizzle.
- **Effort:** ~1.5 weeks (was 4.5 weeks).

### Plan 5 — Submission orchestrator
- **Action:** merge with existing `server/routes/submission-orchestrator.ts`, not green-field.
- **Effort:** likely ~3 weeks (was 4 weeks).

### New surgical-fixes plan (already partially shipped)
Three gaps that became surgical fixes and shipped in commit `70a136ad`:
1. `working-memory.ts` thread-keyed reads now org-scoped (covers 2 gaps + 1 cross-file gap).
2. `project-rollup-service.ts` batch task / module queries now org-scoped (defense-in-depth).
3. `ectd4-validator.ts` NDA/BLA submissions now validated against real NDA/BLA section lists.

Remaining surgical fix: **project-id scope across pgvector `<=>` queries** in `working-memory.ts`, RAG chunks, vault chunks, literature, client-memory, regulatory-guidance, regulatory-negotiation paths. Scope is broader than the audit said — likely a separate workflow.

---

## Revised critical path to GA

1. **Phase 0a — surgical security fixes** — **SHIPPED** in commit `70a136ad`.
2. **Phase 0b — project-id scope hardening across pgvector queries** — small workflow, ~1 day.
3. **Phase 1 — eCTD validator hardening (extend + merge)** — ~3 weeks.
4. **Phase 2 — Module 3 A/R + LLM narrative layer** — ~3.5 weeks (parallel with Phase 1).
5. **Phase 3 — CSR job-state wrapper + template extension** — ~1.5 weeks (parallel with Phase 1).
6. **Phase 4 — M2 summary builders** — ~3 weeks (depends on Phase 2 & 3).
7. **Phase 5 — Submission orchestrator merge** — ~3 weeks (final integration).

**Total critical path to NDA-ready: ~12 person-weeks** (revised down from ~18 weeks based on verification corrections — primarily because CSR builder is mostly built, not scaffolded).
