# Deleted-Files Import Audit — 2026-04-05

**Scope:** 681 deleted files; 57 were client-side TypeScript/JavaScript source files  
**Method:** Every deleted `client/src/` file checked for live import references in the codebase  
**Result:** No live runtime import breakages found. Six barrel (index) files have internal broken re-exports, but none are consumed by any active code path.

---

## 1. Actual Broken Imports (Runtime-Impacting)

**None.** No live file in `client/src/` imports a symbol that resolves to a deleted file.

---

## 2. Broken Barrel Files (Compile-Time Risk if Consumed)

These barrel/index files re-export symbols from deleted files. They are **not currently imported** by any active code, but they will fail if a future import targets them.

### 2a. `client/src/concept2cure/components/canvas/index.ts`
- Exports `ConvergentCanvas` and `CanvasZone` from `./ConvergentCanvas` — **deleted**
- A live `ConvergentCanvas` exists at `client/src/concept2cure/components/layout/ConvergentCanvas.tsx`
- **No live file imports from this barrel**

### 2b. `client/src/concept2cure/components/index.ts` (transitively broken)
- Re-exports from `./canvas` (which is broken per 2a)
- **No live file imports directly from this barrel**
- `concept2cure/index.ts` does `export * from './components'` and `export * from './layouts'` but `concept2cure/index.ts` itself is not imported anywhere

### 2c. `client/src/concept2cure/layouts/index.ts`
- Exports `Concept2CureLayout` from `./Concept2CureLayout` — **deleted**
- **No live file imports from this barrel**

### 2d. `client/src/concept2cure/components/projects/index.ts`
- Exports `ProjectConfigPanel` from `./ProjectConfigPanel` — **deleted**
- `ZenApp.tsx` imports `ProjectConfigPanel` from `./components/workspace/ProjectConfigPanel` (EXISTS) — not the projects barrel
- **No live file imports from this barrel**

### 2e. `client/src/portal-v2/index.ts`
- Exports `ClientPortalV2` and its default from `./ClientPortalV2` — **deleted**
- A separate `ClientPortalV2` exists at `client/src/portal-v2/components/client-portal/index.tsx`
- **No live file imports from this barrel** (only appears in a JSDoc code comment example)

### 2f. `client/src/portal-v2/components/index.ts`
- Exports from `./AdminPortalIndex` — **deleted**
- Exports from `./cortex` (entire cortex directory deleted: CortexChatWidget, CortexHealthIndicator, CortexInsightCard, CortexKnowledgeGraph, CortexSearchPanel)
- **No live file imports from this barrel**

### 2g. `client/src/components/510k/index.js`
- Exports `PredicateAnalysis` from `./PredicateAnalysis` — **deleted**
- Exports `EnhancedLiteratureDiscovery` from `./EnhancedLiteratureDiscovery` — **deleted**
- **No live file imports from this barrel**

---

## 3. Verified Clean (Deleted Files with No References)

| Deleted File | Result |
|---|---|
| `client/src/contexts/AuthContext.jsx` | No imports found |
| `client/src/contexts/DialogContext.jsx` | No imports found |
| `client/src/contexts/DocuShareContext.jsx` | No imports found |
| `client/src/contexts/OnboardingContext.jsx` | No imports found |
| `client/src/contexts/SubmissionContext.jsx` | No imports found |
| `client/src/contexts/TooltipLearningContext.jsx` | No imports found |
| `client/src/contexts/UserContext.jsx` and `.tsx` | No imports found |
| `client/src/hooks/useFetchFAERS.jsx` | No imports found |
| `client/src/hooks/useQCWebSocket.tsx` | Replaced by `.ts` and `.js` versions; no consumers of .tsx specifically |
| `client/src/concept2cure/IndustryAwareApp.tsx` | No imports found |
| `client/src/concept2cure/ZenAppWithSession.tsx` | No imports found |
| `client/src/role/RoleContext.tsx` | No imports found |
| `client/src/services/authService.js` | Not imported; all `authService` imports target `portal-v2/services/authService.tsx` (EXISTS) |
| All 510k component files (DocumentGenerationPanel, ProgressTracker, TeamAssignment, PredicateComparison) | No direct imports found |
| All gcc component files | No imports found |
| All innovation component files | No imports found |
| `client/src/portal-v2/ClientPortalV2.tsx` | Only referenced in portal-v2/index.ts barrel (not consumed) |
| `client/src/portal-v2/components/AdminPortalIndex.tsx` | Only referenced in portal-v2/components/index.ts barrel (not consumed) |
| All portal-v2 cortex components | Only referenced in portal-v2/components/index.ts barrel (not consumed) |
| `client/src/components/ForesightAI/Phase0I/DoseEscalation.jsx` | No imports; `DoseEscalationModule.tsx` (different file) still exists |

---

## 4. Recommendations

The six broken barrel files (§2) should have their stale re-exports removed to prevent future confusion:

1. `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/canvas/index.ts` — remove lines 15–16
2. `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/layouts/index.ts` — remove line 5
3. `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/projects/index.ts` — remove line 8
4. `/home/user/ClinicalSageAI-2-replit/client/src/portal-v2/index.ts` — remove the `ClientPortalV2` export block (lines 19–20)
5. `/home/user/ClinicalSageAI-2-replit/client/src/portal-v2/components/index.ts` — remove AdminPortalIndex block (lines 30–40) and cortex block (lines 89–96)
6. `/home/user/ClinicalSageAI-2-replit/client/src/components/510k/index.js` — remove lines 5–6

None are urgent (no live code consumes them), but they will fail TypeScript/build checks if the barrels ever get imported.
