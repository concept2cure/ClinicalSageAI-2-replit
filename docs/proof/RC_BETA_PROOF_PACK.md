# Release-Candidate Beta Proof Pack

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784` → targeting `concept2cure-v2`
**Stages covered:** 8–13 (complete cleanup and integration program)
**Purpose:** Prove the product is ready for controlled human beta testing

---

## 1. What This Pack Proves

This proof pack demonstrates that the cleanup workstream has produced a real,
testable, governed product — not a branch experiment. Every claim below is
backed by code evidence, not documentation alone.

---

## 2. Shell Truth

### Entry chain is honest

| Step | Expected behavior | Evidence |
|------|------------------|---------|
| `http://host/` | Redirects to `/concept2cure` | `App.jsx` L413–436: `Redirect` to `/concept2cure`; PULSE-01 test |
| `/sign-in`, `/auth`, `/login` | All redirect to `/concept2cure/login` | `App.jsx` L367–380: explicit `Redirect`; PULSE-02 test |
| `/concept2cure/login` | Shows login form (email/password or demo personas) | `ZenRouter.tsx` login route; PULSE-04 test |
| `/concept2cure` (authenticated) | Shows Zen shell with sidebar | `ZenApp.tsx` — renders sidebar + main content; PULSE-04 test |
| `/client-portal` | Does not strand users | PULSE-03 test (warns if user settles in portal) |

### Sidebar navigation is real

| Nav item | Layout mode | data-testid |
|----------|-------------|-------------|
| Overview | `project-home` | — |
| Tools | `documents` | `workspace-tools` |
| Vault | `vault-workspace` | `workspace-vault` |
| Review | `review` | `workspace-review` |
| Submit | `submissions` | — |
| Setup | `setup` | `workspace-setup` |

Evidence: `ZenSidebar.tsx` (1,255 lines, 6 global + 5 project tabs); SMOKE-01 through SMOKE-06 tests.

### ZenApp is the real shell (now smaller)

| Metric | Before Stage 10 | After Stage 10 |
|--------|---------------:|---------------:|
| ZenApp.tsx lines | 4,265 | 3,795 |
| Extracted modules | 0 | 4 |
| Types/constants inline | ~270 lines | 0 (in `zen-app-constants.ts`) |

---

## 3. Governed Workspace

### ProjectWorkspaceShell is the strongest surface

| Feature | Status | Evidence |
|---------|--------|---------|
| File/Dossier/Template tree | Working | `ProjectWorkspaceShell.tsx` (3,499 lines) |
| DocumentListPane (browse) | Working | Imported and rendered in workspace |
| EditorPanel (edit) | Working | Lazy-loaded, opens from workspace |
| Inspector panel (provenance/compare/audit) | Working | Conditional render when doc open |
| Template structure view | Working | Phase 3 additions landed |
| Section requirements panel | Working | Expanded in Phase 3 |

### Document lifecycle

| Stage | Mechanism | Evidence |
|-------|----------|---------|
| Draft | `tagArtifact` with `status: 'draft'` | `ana-ri.ts` generate path |
| Review | `promote-artifact` handler | `server/services/ai-actions/handlers/promote-artifact.ts` |
| Approved | Governance boundary service | `governance-boundary-service.js` |
| Locked | Decision lifecycle service | `decision-lifecycle-service.js` |
| Export | Export gate checks in governed contract | `governedDocumentContractService.ts` |

---

## 4. AnA Is the Enforced Standard

### Primary AI paths are governed

| Path | Contract enforcement |
|------|---------------------|
| `/api/ana-ri/chat` | AI gateway → `processResponseActions` → governed artifacts |
| `/api/ana-ri/generate` | `generateArtifact()` → quality gates → `tagArtifact(draft)` |
| `/api/authoring-actions/*` | `resolveGovernedContext` → `GOVERNED_CONTRACT_INVALID` on failure |
| `/api/ai-actions/execute` | Typed dispatch → per-handler governance |

### Contract tests pass

```
33 passed (33) — all Stage 12 contract tests green
```

### Remaining bypass paths are outside beta shell

Legacy services (`openaiService.js`, `CerOpenAIService.js`, CMC components) exist
but are not reachable from the concept2cure shell.

---

## 5. Backend Route Ownership Is Documented

### 6 duplicate families analyzed

| Family | Conflict? | Resolution |
|--------|-----------|-----------|
| `/api/ind` | No overlap | Safe — different sub-paths |
| `/api/regulatory` | **`GET /search` shadowed** | Documented; registry handler is canonical |
| `/api/documents` | No overlap | Safe — facade pattern |
| `/api/ai` | No overlap | Safe — different concerns |
| `/api/projects` | **`/find` swallowed by `:projectId`** | Documented; use `/api/project-modules/find` |
| `/api/programs` | No overlap | Safe |

### Route scale

- 307 route files, 6.3 MB total under `server/routes/`
- ~180 `app.use()` mounts in `server/index.ts`
- ~120 unique URL prefixes

---

## 6. Test Net Summary

| Category | Count | Status |
|----------|------:|--------|
| Vitest unit/contract/tripwire tests | 267 | Majority pass; known failures documented |
| Stage 12 contract tests | 33 | **All pass** |
| Playwright E2E (`.e2e.ts`) | 10 | Including new beta-pulse (requires running app) |
| Playwright E2E (`.spec.ts`) | 10 | Now included in default testMatch |
| Governance tests | 3 files | authoring-actions, governed-upload, contract service |

---

## 7. Protected Organs Are Locked

| File | Unlock condition |
|------|-----------------|
| `ZenApp.tsx` (3,795 lines) | Stage 9 pulse baseline (done) |
| `ProjectWorkspaceShell.tsx` (3,499 lines) | Stage 9 pulse baseline (done) |
| `AnaPersistentPanel.tsx` (5,405 lines) | Stage 9 pulse baseline (done) |
| `server/index.ts` (7,911 lines) | Stage 11 route convergence (done — documented) |
| `concept2cure.ts` (16,383 lines) | Stage 11 route convergence (done — documented) |

---

## 8. What Is Deliberately Hidden

| Surface | Disposition | Why |
|---------|------------|-----|
| Mission Control / SnowGlobe | Demoted in ZenApp | Not demo-ready |
| Dr. Sage legacy | Present in repo, not in shell | Replaced by AnA |
| Standalone eCTD without project | Empty state expected | Not primary path |
| Legacy routes (`/v3`, `/client-portal`) | Not in beta path | Dead or deprecated |
| CMC parallel AI paths | Outside concept2cure shell | Need future convergence |

---

## 9. Stage Evidence Chain

| Stage | Key deliverables | Status |
|-------|-----------------|--------|
| 8 | Canonical state doc, merge risk matrix, protected organs lock | Complete |
| 9 | 8 Playwright pulse tests, Playwright config fix | Complete |
| 10 | 4 extracted modules, ZenApp −470 lines | Complete |
| 11 | Route ownership matrix, 2 bugs documented | Complete |
| 12 | AI entry-point audit, 33 contract tests | Complete |
| 13 | This proof pack, beta test script, known-issues ledger | Complete |
