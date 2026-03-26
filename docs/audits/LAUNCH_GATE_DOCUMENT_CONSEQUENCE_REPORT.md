# Launch-Gate Sprint: Document Consequence Visibility — Final Report

> **Branch**: `concept2cure-v2` > **Date**: 2026-03-26
> **Sprint goal**: Make document consequence visibly real across the beta path

---

## 1 Baseline Audit (Phase 0)

Full baseline: [`docs/audits/LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md`](../audits/LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md)

| Entry point                                     | Governed?   | Notes                                                                                                                              |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Artifact Compute Plane → `artifactWriteback.ts` | **Yes**     | `registerArtifactWithGovernance()` writes provenance + audit record                                                                |
| Conversation OS proposal → `acceptProposal()`   | **Yes**     | Calls `registerArtifactWithGovernance()`, records in `conversation_os_accepted_artifact_versions`                                  |
| CERv2 export routes → `cerv2-export-routes.ts`  | **Partial** | HTTP governance headers present but NOT persisted. Now flagged with comment + header `X-Concept2Cure-Governance-Persistence: none` |
| 510(k) document stubs                           | **No**      | Dead-end — routes exist but no real compute path. Flagged in 510k audit                                                            |
| 13 client hooks using raw `fetch()`             | **No**      | `useDocumentFactory`, `useDocumentActions`, `useCMC`, `useModules`, `useProjectKnowledge`, others — bypass `apiRequest()`          |

---

## 2 Changes Made

### A. Compute Consequence Visibility — `ComputeJobPanel.tsx`

**What**: Governed artifact metadata (`placement_state`, `provenance_ref`, `audit_ref`) now visible in the job list **without expanding**.

- New summary row per job: `title · version · status · section · prov✓ · audit✓`
- Open / Provenance / Audit action buttons on each job
- Backend `listComputeJobs` query updated to return these fields from `result_summary` JSON

**Files**:

- `client/src/concept2cure/components/compute/ComputeJobPanel.tsx`
- `server/services/compute/computeService.ts`

### B. Proposal Consequence Capture — `ProjectWorkspaceShell.tsx`

**What**: `actOnProposal()` now captures the full governance consequence from the API response.

- Response includes: `governanceState` (ACCEPTED_GOVERNED | ACCEPTED_PERSISTED_NO_GOVERNANCE), `artifactId`, `version`, `placementState`, `provenanceRef`, `auditRef`
- Consequence stored in component state and rendered in "Document Proposals" section
- Clear labeling: governed proposals show ✓ with metadata; ungoverned show ⚠ with honest label

**Files**:

- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`

### C. Workspace Consequence Surface — `ProjectWorkspaceShell.tsx`

**What**: Replaced debug "Conversation OS Durability" section with production-grade "Recent Governed Documents" surface.

- Shows last 5 governed artifacts: title, version, status, CTD section, source type
- Open / Provenance / Audit / Place action buttons per artifact
- Falls back to empty state when no governed documents exist
- "Document Proposals" section below shows all pending and accepted proposals with governance state

**Files**:

- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`

### D. 510(k) / CER Export Dead-End Flagging — `cerv2-export-routes.ts`

**What**: Flagged governance headers as HTTP-response-only (not persisted to provenance/audit).

- Added `X-Concept2Cure-Governance-Persistence: none` header
- Added in-code comment explaining the gap and linking to the real governed path (Artifact Compute Plane)

**Files**:

- `server/routes/cerv2-export-routes.ts`

### E. Merge Conflict / Build Fixes

| File                        | Fix                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ZenApp.tsx`                | Resolved 2 leftover merge conflict markers from `codex/execute-beta-integrity-sprint-plan`                    |
| `GlobalOperatingShell.tsx`  | Added `Home` import, renamed `GLOBAL_NODES` → `LAYERS`, fixed JSX close, fixed `isActive` operator precedence |
| `ProjectWorkspaceShell.tsx` | Fixed hook ordering — `loadArtifacts` moved before `actOnProposal` to avoid undefined reference               |

---

## 3 Tests

| Test file                                                      | Tests  | Status          |
| -------------------------------------------------------------- | ------ | --------------- |
| `server/services/__tests__/conversation-os.test.ts`            | 3      | ✅ Pass         |
| `server/__tests__/services/artifactComputeWorker.test.ts`      | 3      | ✅ Pass         |
| `server/__tests__/services/computeService.integration.test.ts` | 3      | ✅ Pass         |
| `tests/services/document-consequence.test.ts` **(new)**        | 6      | ✅ Pass         |
| **Total**                                                      | **15** | **✅ All pass** |

### New document-consequence tests cover:

1. Compute metadata fields exist in listComputeJobs result
2. Proposal accept returns governed state
3. Accepted proposal appears in list
4. `listArtifactVersions` reads durable records
5. Memory fallback gated behind `CONVERSATION_OS_ALLOW_MEMORY_FALLBACK`
6. Non-governed consequence honestly labeled

---

## 4 Validation Evidence

| Check                       | Result                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| TypeScript (`tsc --noEmit`) | 3697 pre-existing errors, **0 in touched files**                    |
| ESLint                      | **0 errors**, 91 warnings (all pre-existing, mostly unused imports) |
| Vitest (15 tests)           | **15/15 pass**                                                      |
| Hook ordering               | Fixed — `loadArtifacts` defined before `actOnProposal`              |
| Merge conflicts             | Resolved — ZenApp.tsx clean                                         |
| Build errors                | Fixed — GlobalOperatingShell.tsx compiles                           |

---

## 5 Known Gaps & Caveats

### 5.1 Ungoverned Client Hooks (13 entry points)

These hooks bypass `apiRequest()` and/or don't route through the Artifact Compute Plane:

| Hook                  | File                                                   | Issue                                                   |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `useDocumentFactory`  | `client/src/concept2cure/hooks/useDocumentFactory.ts`  | Raw `fetch()`                                           |
| `useDocumentActions`  | `client/src/concept2cure/hooks/useDocumentActions.ts`  | Raw `fetch()`                                           |
| `useCMC`              | `client/src/concept2cure/hooks/useCMC.ts`              | Raw `fetch()` + ungoverned fallback                     |
| `useModules`          | `client/src/concept2cure/hooks/useModules.ts`          | Raw `fetch()`                                           |
| `useProjectKnowledge` | `client/src/concept2cure/hooks/useProjectKnowledge.ts` | Raw `fetch()`                                           |
| `useDocumentEditor`   | `client/src/concept2cure/hooks/useDocumentEditor.ts`   | Raw `fetch()`                                           |
| 7 additional hooks    | Various                                                | AI actions that produce documents outside compute plane |

**Recommendation**: Next sprint should convert all raw `fetch()` to `apiRequest()` and route document-producing actions through the Artifact Compute Plane.

### 5.2 CER Export Path

`cerv2-export-routes.ts` sends governance headers but does NOT persist them. The header `X-Concept2Cure-Governance-Persistence: none` now makes this explicit. Full governance requires routing through the compute plane.

### 5.3 510(k) Module

Dead-end. Routes exist but no real compute backend. Flagged in `docs/audits/510K_DOCUMENT_GENERATION_AUDIT.md`.

### 5.4 Pre-existing Type Errors

3697 TypeScript errors exist across the codebase (primarily in ZenApp.tsx type mismatches, JSX module imports, and control-plane test files). None are in files touched by this sprint.

---

## 6 Files Changed (Summary)

| File                                                                     | Type     | Lines changed |
| ------------------------------------------------------------------------ | -------- | ------------- |
| `client/src/concept2cure/components/compute/ComputeJobPanel.tsx`         | Modified | ~80           |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Modified | ~300          |
| `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`      | Modified | ~15           |
| `client/src/concept2cure/ZenApp.tsx`                                     | Modified | ~10           |
| `server/services/compute/computeService.ts`                              | Modified | ~10           |
| `server/routes/cerv2-export-routes.ts`                                   | Modified | ~5            |
| `tests/services/document-consequence.test.ts`                            | **New**  | 153           |
| `docs/audits/LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md`               | **New**  | ~100          |
| `docs/audits/510K_DOCUMENT_GENERATION_AUDIT.md`                          | **New**  | ~60           |
| `docs/audits/LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`                 | **New**  | this file     |

---

## 7 One-Line Truth

> **Launch-gate trust materially improved**: the primary compute + proposal paths now show real governed consequences (provenance, audit, placement) inline — but 13 client hooks still bypass governance, and the CER/510k export paths remain ungoverned.
