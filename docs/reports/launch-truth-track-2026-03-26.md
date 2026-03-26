# Launch Truth Track — Credibility Gap Closure Workstream

> **Date:** 2026-03-26 | **Branch:** concept2cure-v2 | **Status:** ACTIVE
> **Scope:** Close every credibility gap identified by product audit before external launch
> **Principle:** If we claim it, we can prove it. If we show it, it's real data. If a user clicks it, something happens.

---

## WHY THIS EXISTS

The product audit (2026-02-20) and beta-readiness assessment (2026-03-25) found real credibility gaps —
not feature gaps, but **trust gaps**. A biotech RA director will probe these within the first week:

| Gap                                         | Why It Kills Trust                                               |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Sentence-level source click-through missing | Core differentiator promised but not wired                       |
| eCTD XML export depth unclear to user       | "Export" button exists but user can't verify output is real eCTD |
| Takeda study claim unsubstantiated          | Central ROI narrative with zero documentation                    |
| AI fallback returns template text silently  | User can't tell if AI actually analyzed or just templated        |
| Veeva Vault integration absent              | Every enterprise pharma evaluation asks for this                 |
| No explicit GA readiness gates              | Features ship without provable acceptance criteria               |

**This is not a feature track. This is a trust track.** It touches UX, backend, documentation, and
commercial materials. Every item has one acceptance test: _can a skeptical buyer verify the claim?_

---

## TRUTH STATUS MATRIX (Audited 2026-03-26)

| Area                    | Backend                            | DB Schema                                   | UI                                      | Evidence                                       | Overall |
| ----------------------- | ---------------------------------- | ------------------------------------------- | --------------------------------------- | ---------------------------------------------- | ------- |
| **eCTD XML Export**     | ✅ Real (xmlbuilder2, ICH M8 v4.0) | ✅ ectdModules, ectdGranules                | ⚠️ Export button exists, no preview     | ⚠️ No user-visible XML validation report       | 75%     |
| **Sentence Provenance** | ❌ Not populated                   | ✅ fragment_truth_links, traceability_links | ❌ No click-through UI                  | ❌ Zero evidence                               | 30%     |
| **AI Gateway Truth**    | ✅ Real providers + explicit flags | ✅ Gateway audit log                        | ⚠️ `isRealAI` flag exists but not shown | ⚠️ Template fallback indistinguishable to user | 70%     |
| **Takeda Study**        | ❌ N/A                             | ❌ N/A                                      | ❌ N/A                                  | ❌ Zero documentation                          | 0%      |
| **Veeva Integration**   | ❌ Missing                         | ⚠️ connectorCredentials schema placeholder  | ❌ Missing                              | ❌ Zero                                        | 0%      |
| **GA Readiness Gates**  | ⚠️ Governance boundary exists      | ⚠️ Partial                                  | ⚠️ Export gate only                     | ❌ No launch gate framework                    | 25%     |

---

## WORKSTREAM TT-1: Sentence-Level Source Click-Through

### Current State

- **DB schema is complete**: `prose.fragment_truth_links` (M001), `intelligent_docs.traceability_links` (M005), enhanced citations (M004) with `evidence_strength`, `source_locator`, `verified_by`
- **No population logic**: No route or service writes to `fragment_truth_links`
- **No UI rendering**: No React component renders clickable source citations in editor/prose
- **Traceability infrastructure exists**: `TraceabilityLinking.tsx` component + `traceability-mapping-routes.ts` exist but operate at document-level, not sentence-level

### Tasks

| ID     | Task                                                                                                                                      | Priority | Effort | Files                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------- |
| TT-1.1 | Add fragment-truth population in authoring pipeline — when AI generates content with source references, write `fragment_truth_links` rows | P0       | 8h     | `server/routes/authoring.router.ts`, `server/routes/authoring-actions.ts` |
| TT-1.2 | Add `GET /api/authoring/:docId/citations` endpoint returning linked sources per fragment                                                  | P0       | 4h     | `server/routes/authoring.router.ts`                                       |
| TT-1.3 | Build `<CitationClickthrough>` editor extension — renders superscript citation numbers that open a source panel on click                  | P0       | 8h     | `client/src/concept2cure/components/editor/extensions/`                   |
| TT-1.4 | Source panel shows: document name, page/paragraph locator, evidence strength badge, "Open Source" button                                  | P1       | 4h     | `client/src/concept2cure/components/editor/`                              |
| TT-1.5 | Wire citation population into RIM interceptors — compliance scan and artifact interceptor should generate truth links                     | P1       | 4h     | `server/services/intelligence/rim-interceptors.ts`                        |
| TT-1.6 | Add test: generate content → verify fragment_truth_links populated → verify API returns linked sources                                    | P1       | 4h     | `tests/`                                                                  |

### Acceptance Criteria

- [ ] User sees numbered superscript citations in authored text
- [ ] Clicking a citation opens a panel showing the source document, location, and evidence strength
- [ ] Every AI-generated paragraph with source material has at least one truth link
- [ ] `fragment_truth_links` table has rows after content generation (verifiable via DB query)

---

## WORKSTREAM TT-2: eCTD Export Verifiability

### Current State

- **Server-side is real**: `generateEctdPackage()` in `ectdExportService.ts` builds ZIP with M1-M5 structure, real XML via `xmlbuilder2`, ICH M8 v4.0 DTD, checksums
- **Alternative generator**: `documentExportService.ts` has `generateECTDIndexXml()` with HL7 v3 schema
- **Routes exist**: `ectd-export.ts` exposes POST generate, POST validate, GET preview
- **Client stub**: `client/src/utils/ectd-validator.js:generateEctdIndexXml()` is a demo placeholder — **this must not be called in production paths**
- **Gap**: User cannot see or verify the XML output. No "preview XML" or "validate structure" visible in UI

### Tasks

| ID     | Task                                                                                                                  | Priority | Effort | Files                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------ |
| TT-2.1 | Add "Preview eCTD Structure" panel to submission workflow showing generated XML tree (read-only)                      | P0       | 6h     | `client/src/concept2cure/components/workflow/`                                 |
| TT-2.2 | Add visual validation report after export — show pass/fail per eCTD module with file checksums                        | P0       | 6h     | `client/src/concept2cure/components/workflow/`, `server/routes/ectd-export.ts` |
| TT-2.3 | Ensure client-side `ectd-validator.js` mock generator is NEVER called in production export flow — add guard or remove | P0       | 2h     | `client/src/utils/ectd-validator.js`                                           |
| TT-2.4 | Add "Download eCTD Package" button with progress indicator and post-download validation summary                       | P1       | 4h     | `client/src/concept2cure/components/workflow/`                                 |
| TT-2.5 | Add integration test: create project → populate sections → export → validate ZIP contains valid index.xml             | P1       | 4h     | `tests/`                                                                       |

### Acceptance Criteria

- [ ] User can preview the eCTD XML tree structure before exporting
- [ ] After export, user sees a validation report with per-module pass/fail status
- [ ] Client-side mock XML generator cannot be invoked in production paths
- [ ] Exported ZIP contains valid `index.xml` with correct DTD declaration and checksums

---

## WORKSTREAM TT-3: Takeda Study — Claim Documentation

### Current State

- **Zero evidence in codebase**. The "100 hours → 2.6-3.7 hours" and "97% time savings" claim appears ONLY in:
  - `docs/competitive-analysis-weave-bio.md` — **attributed to Weave Bio (competitor), not C2C**
  - `C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md` — flagged as P0 unsubstantiated risk
- **No methodology, no results, no QC report, no independent validation**
- Audit explicitly says: "This claim has zero supporting documentation" (line 304)

### Tasks

| ID     | Task                                                                                                                                                                   | Priority | Effort | Owner                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------------- |
| TT-3.1 | **DECISION REQUIRED**: Is this claim based on real data? If yes → document. If no → remove from all materials.                                                         | P0       | —      | Founder               |
| TT-3.2 | If real: Create `docs/evidence/takeda-benchmark-study.md` with methodology, data, QC assessment, limitations                                                           | P0       | 8h     | Product / Clinical    |
| TT-3.3 | If real: Add reproducible benchmark test — automated script that measures document generation time under controlled conditions                                         | P1       | 8h     | Engineering           |
| TT-3.4 | If NOT real: Remove all references from `competitive-analysis-weave-bio.md` and any marketing materials                                                                | P0       | 2h     | Product               |
| TT-3.5 | Create truthful benchmark: run internal time-comparison study (manual vs. C2C-assisted) for IND Module 2.5 Clinical Overview, document results regardless of magnitude | P1       | 16h    | Product + Engineering |
| TT-3.6 | Update competitive analysis to distinguish competitor claims (Weave Bio) from C2C's own validated metrics                                                              | P0       | 2h     | Product               |

### Acceptance Criteria

- [ ] Every time-reduction claim in the codebase has a linked evidence document
- [ ] Competitive analysis clearly distinguishes C2C claims from competitor claims
- [ ] If Takeda study is real: methodology document exists and is reviewable
- [ ] If Takeda study is not real: zero references remain in codebase

---

## WORKSTREAM TT-4: AI Runtime Truth Transparency

### Current State

- **AI Gateway is real**: Claude primary (quality=97), OpenAI fallback, Moonshot secondary
- **Explicit flags exist**: Every response includes `isRealAI: boolean` and `fallback: boolean`
- **Deterministic mode**: Template responses returned when no API keys available, tagged with `[KNOWN]`/`[INFERRED]`/`[MISSING]`
- **Gap**: UI does not surface `isRealAI` / `fallback` status to the user. User cannot distinguish real AI analysis from template fallback
- **Template fallbacks**: `getFallbackSuggestion()` and `getFallbackVerification()` in `ai-assistance.ts` return generic regulatory templates when all providers fail

### Tasks

| ID     | Task                                                                                                                 | Priority | Effort | Files                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------------------------- |
| TT-4.1 | Surface AI provenance badge in chat — show which provider/model generated each response                              | P0       | 4h     | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` |
| TT-4.2 | Add "Template Response" visual indicator when fallback is used — distinct from real AI responses                     | P0       | 2h     | `client/src/concept2cure/components/chat/`                       |
| TT-4.3 | Add AI health status indicator in app header or settings — shows current provider status (healthy/degraded/fallback) | P1       | 4h     | `client/src/concept2cure/components/`                            |
| TT-4.4 | Log and expose AI provider metrics endpoint: requests by provider, fallback rate, average response time              | P1       | 4h     | `server/routes/ai-assistance.ts`                                 |
| TT-4.5 | Add `/api/ai/health` dashboard endpoint summarizing current provider availability and fallback chain status          | P1       | 2h     | `server/routes/ai-assistance.ts`                                 |
| TT-4.6 | Ensure gateway audit log captures provider, model, quality tier, and fallback chain for every request                | P1       | 2h     | `server/services/ai-gateway/gateway.ts`                          |

### Acceptance Criteria

- [ ] Every AI response in chat shows which model produced it (e.g., "Claude 3.5 Sonnet" or "Template Fallback")
- [ ] Template/fallback responses are visually distinct (muted styling + "AI unavailable" notice)
- [ ] AI health status is visible to admin users
- [ ] Audit log captures full provenance for every AI request

---

## WORKSTREAM TT-5: Enterprise Integration Readiness (Veeva)

### Current State

- **Entirely absent from codebase** — no packages, no API client, no routes, no sync logic
- **Schema placeholder exists**: `connectorCredentials` table has a `connectorId` column (intent to support)
- **DocuShare config exists**: `server/config/docushareConfig.ts` (different DMS, not Veeva)
- Flagged as P0 gap in product audit: "Veeva Vault is used by virtually every pharma/biotech company"

### Tasks

| ID     | Task                                                                                                                                    | Priority | Effort | Files                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------- |
| TT-5.1 | **DECISION REQUIRED**: Is Veeva integration in scope for BETA or GA? If deferred, document explicitly as "Post-GA" with rationale       | P0       | —      | Founder                                        |
| TT-5.2 | If in scope: Define Veeva Vault REST API integration spec (auth, document sync, metadata mapping)                                       | P1       | 8h     | Engineering                                    |
| TT-5.3 | If in scope: Build `server/services/integrations/veeva-vault-client.ts` — OAuth2 auth + document CRUD                                   | P1       | 16h    | Engineering                                    |
| TT-5.4 | If in scope: Build bidirectional sync routes `server/routes/veeva-integration.ts`                                                       | P1       | 16h    | Engineering                                    |
| TT-5.5 | If deferred: Create `docs/integrations/veeva-vault-roadmap.md` documenting why deferred, what's needed, and target timeline             | P0       | 4h     | Product                                        |
| TT-5.6 | If deferred: Add "Enterprise Integrations" section to settings page showing planned integrations with status                            | P1       | 4h     | `client/src/concept2cure/components/settings/` |
| TT-5.7 | Regardless: Add connector framework to `server/services/integrations/` — abstract DMS interface that Veeva and DocuShare both implement | P2       | 8h     | Engineering                                    |

### Acceptance Criteria

- [ ] Veeva integration is either implemented or explicitly documented as deferred with rationale
- [ ] If deferred: roadmap document exists with scope, dependencies, and timeline
- [ ] If deferred: settings UI shows "Veeva Vault — Coming Q3 2026" (not hidden)
- [ ] Connector framework exists for future DMS integrations

---

## WORKSTREAM TT-6: GA Readiness Gates

### Current State

- **Governance boundary service exists**: `server/services/governance-boundary-service.ts` handles document promotion gates (advisory → governed_draft → approved → locked → submission_ready)
- **Readiness scoring exists**: `server/services/intelligence/readiness-scoring-engine.ts` scores module-level readiness
- **Export gate exists**: `CERV2FullExportSimulation.jsx` blocks export below readiness threshold
- **No launch-level gate framework**: No structured checklist that blocks external access until all truth-track items pass
- **Kernel beta-readiness service**: `server/services/kernel-beta-readiness.ts` (new, from latest merge)

### Tasks

| ID     | Task                                                                                                                                                                                                   | Priority | Effort | Files                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------------------------------------------ |
| TT-6.1 | Read and assess `kernel-beta-readiness.ts` (new from merge) — determine if it provides a foundation for launch gates                                                                                   | P0       | 2h     | `server/services/kernel-beta-readiness.ts` |
| TT-6.2 | Define launch readiness gate checklist with automated and manual checks                                                                                                                                | P0       | 4h     | `docs/reports/`                            |
| TT-6.3 | Build `/api/platform/readiness` endpoint that runs all gate checks and returns pass/fail per area                                                                                                      | P0       | 8h     | `server/routes/`                           |
| TT-6.4 | Gates must include: (1) No mock routes mounted, (2) AI providers healthy, (3) DB migrations current, (4) eCTD export validates, (5) All truth-track items resolved, (6) Audit trail immutability holds | P0       | 8h     | `server/services/`                         |
| TT-6.5 | Build admin-only "Launch Readiness Dashboard" showing gate status with drill-down                                                                                                                      | P1       | 8h     | `client/src/concept2cure/components/`      |
| TT-6.6 | Add readiness gate check to CI/CD — block deploy to production if any P0 gate fails                                                                                                                    | P1       | 4h     | `.github/workflows/`                       |

### Acceptance Criteria

- [ ] `/api/platform/readiness` returns structured JSON with pass/fail per gate
- [ ] No P0 gate can be bypassed without explicit override (logged to audit trail)
- [ ] CI/CD blocks production deploy when P0 gates fail
- [ ] Admin dashboard shows live gate status

---

## EXECUTION TIMELINE

### Phase 1 — Decisions & Quick Wins (Days 1-3)

| Item   | What                                             | Who         |
| ------ | ------------------------------------------------ | ----------- |
| TT-3.1 | Takeda study: real or not? Decision required     | Founder     |
| TT-5.1 | Veeva: in scope or deferred? Decision required   | Founder     |
| TT-4.1 | Surface AI provenance badge in chat              | Engineering |
| TT-4.2 | Add template-response visual indicator           | Engineering |
| TT-2.3 | Guard client-side mock XML from production paths | Engineering |
| TT-6.1 | Assess kernel-beta-readiness.ts                  | Engineering |

### Phase 2 — Core Trust Infrastructure (Days 4-8)

| Item       | What                                            | Who         |
| ---------- | ----------------------------------------------- | ----------- |
| TT-1.1     | Fragment-truth population in authoring pipeline | Engineering |
| TT-1.2     | Citations API endpoint                          | Engineering |
| TT-1.3     | CitationClickthrough editor extension           | Engineering |
| TT-2.1     | eCTD structure preview panel                    | Engineering |
| TT-2.2     | Post-export validation report UI                | Engineering |
| TT-6.2-6.4 | Launch readiness gate framework                 | Engineering |

### Phase 3 — Hardening & Evidence (Days 9-14)

| Item       | What                                          | Who                   |
| ---------- | --------------------------------------------- | --------------------- |
| TT-1.4-1.6 | Source panel, RIM wiring, tests               | Engineering           |
| TT-2.4-2.5 | Download with validation, integration test    | Engineering           |
| TT-3.2-3.6 | Takeda resolution (document or remove)        | Product + Engineering |
| TT-4.3-4.6 | AI health dashboard, metrics, audit           | Engineering           |
| TT-5.2-5.7 | Veeva resolution (build or document deferral) | Engineering           |
| TT-6.5-6.6 | Launch dashboard, CI gate                     | Engineering           |

---

## DEPENDENCIES ON EXISTING WORKSTREAMS

| This Track         | Depends On                     | Reason                                                |
| ------------------ | ------------------------------ | ----------------------------------------------------- |
| TT-1 (Provenance)  | AnA GA Plan Stage 1            | Chat pipeline must work before citations can populate |
| TT-2 (eCTD Export) | Beta Plan Week 1               | Foresight/CORTEX wiring affects section completeness  |
| TT-4 (AI Truth)    | AI Gateway audit (GA Audit #7) | Routing and fallback audit must be current            |
| TT-6 (Gates)       | Beta Plan Sprint 1             | Mock routes must be removed before gates can pass     |

---

## HOW TO USE THIS DOCUMENT

1. **Product**: Use TT-3 and TT-5 decisions to unblock engineering
2. **Engineering**: Execute TT-1, TT-2, TT-4, TT-6 in phase order
3. **QA**: Each workstream has acceptance criteria — these are your test cases
4. **Commercial**: No claim goes into any external material until the corresponding TT item is resolved
5. **Every sprint review**: Review truth status matrix at the top — overall % must increase

---

## GOVERNANCE

- **Weekly steering**: Review truth status matrix in every sprint review
- **Escalation**: Any P0 item blocked for >3 days escalates to founder
- **Audit trail**: All truth-track decisions logged in `docs/reports/` with date and rationale
- **No override without record**: If a P0 gate is waived, the waiver and its rationale are documented

---

_Generated from forensic codebase audit, product audit responses, beta-readiness assessment, and GA audit plan._
_Branch: concept2cure-v2 | Date: 2026-03-26_
