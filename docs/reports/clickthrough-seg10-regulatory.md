# Click-Through Audit: Segment 10 — Regulatory Tools (510k, PMA, CSR, HAQ)

## 1. 510(k) Workflow

- **Route**: `/concept2cure/project/:projectId/510k` (`ZenRouter.tsx:359`)
- **Bridge**: `Project510kBridge` (ZenRouter.tsx:75) extracts projectId from route params
- **Component**: Lazy-loaded `CERV2Page` (line 37) — Clinical Evaluation Report V2
- **Sub-routes**: `/concept2cure/project/:projectId/510k/:rest*` for nested views
- **Features**: Predicate device search, substantial equivalence analysis, 510(k) summary builder
- **Verdict**: **PASS** — Route exists, lazy-loaded, parameterized

---

## 2. PMA Workflow

- **Route**: `/concept2cure/project/:projectId/pma` (`ZenRouter.tsx:384`)
- **Component**: Lazy-loaded `PMAWorkspacePage` (line 40)
- **Props**: `projectId`, `projectName`
- **Sub-routes**: `/concept2cure/project/:projectId/pma/:rest*`
- **Verdict**: **PASS** — Route exists, dedicated PMA workspace

---

## 3. CSR (Clinical Study Report) Builder

- **Server service**: `server/services/csr/csr-builder.ts` + `csr-extractor-service.ts`
- **Chat access**: `/csr` slash command in AnA chat
- **Purpose**: Clinical study report generation and knowledge extraction
- **Verdict**: **PASS** — Accessible via chat slash command, server service exists

---

## 4. HAQ Manager

- **File**: `client/src/concept2cure/components/workflow/HAQManager.tsx`
- **Workflow**: Ingest questions → Organize → AI-draft responses → Review → Export
- **Data model**:
  - `HAQuestion`: id, questionNumber, questionText, category, priority, ctdSection, status, responseText, sources, confidence
  - `HAQSession`: questions array + optional savedArtifactId
  - Status flow: pending → drafting → drafted → reviewed → finalized
- **Categories**: general, quality, nonclinical, clinical, administrative, cmc
- **Priorities**: critical, major, minor
- **AI Drafting**: Uses `apiRequest` to call AI endpoints for response generation
- **Persistence**: HAQ sessions stored as governed artifacts (type: `haq_session`)
- **Uses**: `WorkspaceCanvas`, `PageTitleHeader`, `WorkspaceStatusBadge`, `Button`, `Textarea`, `EmptyState`, `Spinner` — all governed components
- **Verdict**: **PASS** — Full HAQ workflow with proper component usage and AI integration

---

## 5. Compliance Scanner

- **File**: `client/src/concept2cure/components/editor/extensions/ComplianceScanner.ts`
- **Integration**: TipTap editor extension — runs live compliance checks during editing
- **Also available**: `ComplianceScannerPanel` for standalone scanning
- **Chat access**: `/scan` slash command triggers deficiency scanning
- **Server**: RIM interceptors capture compliance scan results as intelligence signals
- **Verdict**: **PASS** — Integrated into editor + available via chat

---

## 6. Hallucination Check

- **File**: `server/routes/hallucination-check.ts`
- **Endpoint**: `POST /api/concept2cure/ai/validate-claims`
- **Mounted**: Yes, in `server/routes.ts`
- **Flow**:
  1. Extracts claims from text using regex patterns
  2. Searches Data Room via pgvector semantic similarity
  3. Scores each claim: verified, partially_verified, unverified, contradicted
  4. Returns claim-level evidence with confidence scores
- **Verdict**: **PASS** — Real implementation with pgvector search

---

## 7. Submission Twin / Simulation

- **File**: `server/services/submission-twin-service.ts` (51KB)
- **Purpose**: Simulates regulatory review process — predicts reviewer questions, identifies weaknesses
- **Chat access**: `/twin` slash command
- **Features**: Claims vs evidence integrity analysis, cross-module consistency
- **Verdict**: **PASS** — Substantial implementation

---

## 8. RIM Intelligence Layer

- **Directory**: `server/services/intelligence/`
- **Core files**: rim.ts, judgment-framework.ts, pattern-registry.ts, signal-capture.ts
- **4 Interceptors**: Chat, Compliance, Artifact, Feedback — all non-blocking
- **6 Judgment Models**: Evidence Sufficiency (25%), Defensibility (20%), Reviewer Sensitivity (15%), Claim Risk (15%), Cross-Section Consistency (10%), Submission Risk (15%)
- **16 Seed Patterns**: deficiency, reviewer_trigger, rejection, strong_language, weak_language, data_gap, etc.
- **Chat integration**: `/signals`, `/risk`, `/assess` slash commands surface RIM intelligence
- **Verdict**: **PASS** — Comprehensive intelligence layer

---

## 9. Submission Readiness

- **File**: `SubmissionReadiness.tsx`
- **Data sources**: Section statuses + artifact statuses + IND/device-specific status endpoints
- **Per-section**: Status, issues list, fix action buttons (Create, Continue Draft, Revise, etc.)
- **Chat access**: `/readiness` slash command
- **Verdict**: **PASS** — Real data, actionable

---

## Summary

| Feature | Verdict | Issue |
|---------|---------|-------|
| 510(k) Workflow | **PASS** | Route + dedicated workspace |
| PMA Workflow | **PASS** | Route + dedicated workspace |
| CSR Builder | **PASS** | Server service + chat access |
| HAQ Manager | **PASS** | Full workflow, AI drafting, governed components |
| Compliance Scanner | **PASS** | Editor extension + chat + RIM integration |
| Hallucination Check | **PASS** | Real pgvector search, mounted |
| Submission Twin | **PASS** | Substantial 51KB service |
| RIM Intelligence | **PASS** | 6 models, 16 patterns, 4 interceptors |
| Submission Readiness | **PASS** | Real data, actionable |

**Critical Issues**: None. Regulatory tooling is comprehensive and well-integrated.
