# Broadened Codebase Audit Report
**Date**: 2026-04-02
**Scope**: Full codebase sweep beyond PR #344-#356 files
**Method**: 4 parallel sweep agents + targeted fix agents

---

## Executive Summary

After completing the PR-specific audit (75 findings, 50 fixed), we broadened to a
full codebase sweep targeting 4 systemic patterns. This uncovered **351+ additional
instances** of the same issues found in the PRs, confirming they were systemic.

| Pattern | Instances Found | Fixed This Session | Remaining |
|---------|----------------|-------------------|-----------|
| Header-based tenant spoofing | 28 (8 HIGH) | 11 | 17 (mostly MEDIUM/LOW) |
| Raw fetch() bypassing auth | 251 across 70+ files | ~25 (priority files) | ~226 |
| Mock data in production | 60+ (6 HIGH modules) | 0 (identified only) | 60+ |
| Silent error handling | 12 (5 HIGH) | 6 | 6 |

---

## Wave 4 Fixes Applied (12 commits total this session)

### Commit 8: `7631cf9` — VaultPage governed + catch(e: any) cleanup
- VaultPage: raw `<select>` → `<Select>`, spinner → `<LoadingState>`
- 49x `catch(e: any)` → `catch(e)` + `instanceof Error` across 4 server files

### Commit 9: `b57202e` — Raw fetch batch 1
- api/blueprint.js, api/protocol.js, hooks/useOrchestration.ts

### Commit 10: `361b050` — Raw fetch batch 2 + tenant spoofing
- api/coauthor.js, 4 hooks, 2 contexts
- license-routes.js, medical-device-documents.mjs

### Commit 11: `35c9f71` — Tenant spoofing batch 2
- smart-blocks.js, rtm-export.ts, ind.ts, DocumentDataCenterService.ts
- useProjectTasks.ts raw fetch fix

### Commit 12: `43657e9` — Silent error handling
- CSRPage.jsx: 6 console.error → toast notifications

---

## Systemic Issues Identified (Not Fully Fixed — Too Large)

### 1. Raw `fetch()` — 251 instances across 70+ files
**Root cause**: The `apiRequest()` utility was introduced after many files were written.
The older service layer (`client/src/services/`, `client/src/api/`) and legacy pages
(`CoAuthor.jsx`, `CERV2Page.jsx`, `CSRIntelligence.jsx`) predate the standard.

**Risk**: 88% of raw fetch calls have NO auth headers — they rely on cookies/session
which may not be present in all deployment configurations.

**Recommendation**: Systematic migration in priority order:
1. Services layer (client/src/services/) — 10 files, ~80 calls
2. API layer (client/src/api/) — 4 files, ~20 calls
3. Concept2cure hooks — 8 files, ~25 calls (mostly done)
4. Pages — 15+ files, ~120 calls (largest effort)

### 2. Mock Data in Production — 6 HIGH-severity modules
**Affected modules**:
- `server/routes/supplyChain.routes.ts` — 7 hardcoded mock arrays for GxP supply chain
- `server/routes/fda510k-routes.ts` — Simulated compliance analysis with setTimeout
- `server/routes/510k-compliance-routes.ts` — Fake compliance checks and auto-fix
- `server/api/templates/routes.ts` — Falls back to mockTemplates when DB empty
- `server/routes/protocol_routes.ts` — Math.random() generated drug names
- `server/services/documentService.js` — Mock CER documents

**Recommendation**: These modules need either:
- Real database queries replacing the mock arrays
- Beta/demo gating with clear `X-Demo-Mode: true` response headers
- Removal if not actively used

### 3. Tenant Header Spoofing — 17 remaining instances
**Already fixed**: 11 instances across CMC routes + 5 other server files
**Remaining MEDIUM**: stability.router.ts (5 RLS instances), ectd-documents.ts,
coauthor.ts, cerv2-document-routes.ts, medical-device-routes.js, conversation-health.ts,
quotaEnforcementService.js

**Recommendation**: Apply same pattern — replace `req.headers['x-organization-id']`
with `(req as any).tenantId || (req as any).tenantContext?.organizationId`

### 4. Silent Error Handling — 6 remaining instances
**Fixed**: CSRPage.jsx (6 handlers)
**Remaining**: AuditPage.jsx, SignaturePage.jsx (2), CSRIntelligence.jsx,
CERV2EditorAI.jsx (2), ClinicalEvidenceTracker.tsx

---

## Full Session Summary (All 4 Waves)

| Wave | Commits | Scope | Files Changed |
|------|---------|-------|---------------|
| 1 | 3 | PR audit: CRITICAL + HIGH | 22 |
| 2 | 3 | PR audit: remaining HIGH | 7 |
| 3 | 1 | PR audit: MEDIUM (components, DDL, transactions) | 8 |
| 4 | 5 | Codebase sweep: fetch, spoofing, errors, types | 20 |
| **Total** | **12** | | **57 files** |

### By Category
- **Security**: 22 tenant spoofing fixes, 25+ auth-bypass fetch fixes
- **Correctness**: 9 compilation/runtime fixes, 2 transaction safety fixes
- **Quality**: 49 type safety fixes, 6 governed component upgrades, 18 test improvements
- **UX**: 12 toast error feedback additions, 3 DataStateWrapper/LoadingState additions
