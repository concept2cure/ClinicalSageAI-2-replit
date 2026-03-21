# Phase 2 — AI Coverage Expansion Report

## Executive Summary

Phase 2 moved ClinicalSageAI from "AI exists in a chat panel" to **AI is usable across structured working surfaces**. Users can now invoke AI actions directly from tables, forms, validation views, and previously-fragmented legacy routes — without leaving their current work context.

---

## A. What Was Implemented

### Reusable Inline AI Framework (Priority 1)

**Server-side** (8 new action handlers):
- `server/services/ai-actions/handlers/inline-ai.ts` — Factory for all inline AI handlers
- `server/services/ai-actions/handlers/register-inline-ai.ts` — Registry integration
- Actions: `summarize_selection`, `explain_selection`, `rewrite_selection`, `extract_structured_data`, `compare_selection`, `refine_with_validation_findings`, `create_followup_task`, `attach_selection_as_source`

**Client hooks**:
- `client/src/concept2cure/hooks/useInlineAI.ts` — Context-aware inline AI hook wrapping Phase 1 `useAIAction`

**Client components**:
- `InlineAIMenu` — Dropdown menu of AI actions (for tables, toolbars, forms)
- `InlineAIButton` — Single-action button (for row-level use in tables)
- `ValidationRefineTrigger` — Validation findings list with explain + refine workflow
- `AIContextualActionGroup` — Bulk selection action bar for tables

**Types extended** (`shared/types/ai-actions.ts`):
- 8 new `AIActionType` values
- 3 new `AIActionSourceSurface` values (`inline_menu`, `inline_button`, `validation_surface`)

---

## B. Surfaces Now Supporting Inline AI (Priority 2)

| Surface | Component | AI Actions Available |
|---------|-----------|---------------------|
| Validation Results | `ValidationResultsPanel.tsx` | Explain per finding, Refine All |
| Document List | `DocumentListPane.tsx` | Summarize, Explain, Extract Data per row |
| Review Queue | `ReviewQueuePanel.tsx` | Summarize, Create Task per item |
| Approval Requests | `ApprovalRequestsPanel.tsx` | Summarize, Explain per request |
| Medical Writer Queue | `MedicalWriterQueue.tsx` | Summarize, Explain, Rewrite per document |
| Evidence Binder | `EvidenceBinderTable.tsx` | Explain, Extract Data per claim |
| CSR Compare Viewer | `CSRCompareViewer.tsx` | Compare, Summarize, Explain on comparison |
| Semantic Search | `SemanticSearchResults.jsx` | Summarize per search result |
| Analytical Validation | `AnalyticalValidationTracker.tsx` | Explain per validation parameter |
| CAPA Management | `CAPAManagement.tsx` | Summarize, Explain, Create Task per CAPA |

**Total: 10 structured surfaces with inline AI** (from 0 previously).

---

## C. Legacy Routes That Gained AI Coverage (Priority 3)

| Route | Dashboard | Before | After |
|-------|-----------|--------|-------|
| `/concept2cure/ectd-agent` | eCTD Submission | Standalone page, no AI | Inside ZenApp shell with AI sidebar |
| `/concept2cure/pharmacovigilance` | Pharmacovigilance | Standalone page, no AI | Inside ZenApp shell with AI sidebar |
| `/concept2cure/documents` | Document Artifacts Hub | Standalone page, no AI | Inside ZenApp shell with AI sidebar |
| `/concept2cure/haq-manager` | HAQ Response Manager | Standalone page, no AI | Inside ZenApp shell with AI sidebar |
| `/concept2cure/ind-autodraft` | IND Auto-Draft | Standalone page, no AI | Inside ZenApp shell with AI sidebar |
| `/concept2cure/clinical-operations` | Clinical Operations | Standalone page, no AI | Inside ZenApp shell with AI sidebar |

**Total: 6 legacy routes migrated** into ZenApp shell, each now has:
- Persistent AI sidebar/chat
- Command palette access
- Contextual assistant panel (collapsible)
- Access to Phase 1 action model

---

## D. End-to-End Workflows That Now Work

### 1. Validation → Explain → Refine → Apply
1. User runs validation on a document
2. `ValidationResultsPanel` shows findings with explain buttons
3. User clicks "Explain" on a critical finding → AI explains in regulatory context
4. User clicks "Refine All" → AI rewrites content addressing all findings
5. User clicks "Apply Changes" → refined content replaces original

### 2. Table Row → AI Summary → Task Creation
1. User views CAPA management table
2. Clicks AI menu on a CAPA row → selects "Summarize"
3. Reviews AI summary of the CAPA (source, root cause, actions)
4. Clicks "Create Task" → AI generates a structured follow-up task

### 3. CSR Comparison → AI Analysis
1. User opens CSR Compare Viewer with 2+ studies
2. Clicks "Compare" in the InlineAIMenu
3. AI highlights clinically meaningful differences
4. User copies result or selects "Explain" for deeper analysis

### 4. Legacy Route → Contextual AI
1. User navigates to `/concept2cure/pharmacovigilance`
2. Page renders inside ZenApp shell (not standalone)
3. AI assistant panel available on the right
4. User can ask questions about PV data with full project context

### 5. Evidence Review → Data Extraction
1. User views Evidence Binder Table for IVDR claims
2. Clicks "Extract Data" on an evidence row
3. AI extracts structured fields (dates, study params, endpoints)
4. User copies extracted data or attaches as source

---

## E. Remaining Major Gaps (Phase 3)

| Gap | Impact | Effort |
|-----|--------|--------|
| Auth tokens in localStorage (not httpOnly cookies) | Security — XSS token theft risk | HIGH |
| No CSRF token on mutations | Security — CSRF attack vector | HIGH |
| 30+ files with dangerouslySetInnerHTML | Security — XSS if sanitization fails | MEDIUM |
| Migration file numbering duplicates | DB — schema ordering issues | MEDIUM |
| Missing timezone on 50+ timestamp columns | Data integrity across regions | MEDIUM |
| Status fields use text instead of pgEnum | Schema — no DB-level enforcement | LOW |
| Sentry privacy config (PII in replays) | Compliance — HIPAA/GDPR | MEDIUM |
| File upload MIME validation only (no magic bytes) | Security — spoofed uploads | LOW |
| Per-user rate limiting needs Redis backing | Scale — in-memory won't work multi-instance | LOW |

---

## F. Recommended Phase 3 Focus

### Security Hardening Sprint
1. Migrate auth tokens to httpOnly cookies + CSRF tokens
2. Audit dangerouslySetInnerHTML usage (30 files)
3. Add Content-Security-Policy headers
4. Add file magic byte validation for uploads

### Data Integrity Sprint
5. Fix migration file numbering (rename to sequential)
6. Add withTimezone to all timestamp columns
7. Convert status text fields to pgEnum
8. Add updatedBy/createdBy to remaining mutation tables

### AI Deepening Sprint
9. Add AI to remaining 5 high-value surfaces (PreSubPackageGenerator, MetadataList, DeepSearchPanel, ApprovalsTab CMC, CSR Uploader)
10. Implement selection-based AI (text highlight → AI action) in document editor
11. Add AI action history panel in sidebar
12. Implement "suggested actions" based on current context
