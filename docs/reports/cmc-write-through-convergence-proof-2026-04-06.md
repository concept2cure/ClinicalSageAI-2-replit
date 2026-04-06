# CMC → Module 3 Write-Through Convergence Proof Report

**Date:** 2026-04-06
**Author:** System (Claude Code)
**Scope:** CMC data-entry write-through to canonical Module 3 source layer
**Status:** Complete

---

## 1. Objective

Close the gap between legacy CMC data-entry tables and the canonical Module 3 source-object layer (`cmc_source_objects`). Ensure every Module 3-relevant CMC save automatically:
1. Upserts a canonical source object
2. Marks impacted Module 3 sections stale
3. Records provenance
4. Creates review tasks in the existing unified task system
5. Invalidates client-side build-state cache
6. Is accessible through AnA chat-first interface

---

## 2. Architecture Decision

### Single Source of Truth
`cmc_source_objects` is the authoritative Module 3 input layer. Legacy CMC tables (`drugSubstances`, `drugProducts`, `analyticalMethods`, `stabilityStudies`, etc.) continue to serve as the primary data-entry persistence, but every write now mirrors into canonical source objects via the write-through service.

### Non-Blocking Design
Write-through is non-blocking for the primary CMC save. If the canonical upsert fails, the legacy table write still succeeds. Failures are logged with `[CMC Write-Through]` prefix.

### No New Surfaces
Per `module3-workflow-definition.md`: no new Module 3 app, dashboard, or workflow surface was created. All changes extend existing systems:
- Existing CMC route handlers → write-through calls added
- Existing `useCMC.ts` hooks → cache invalidation added
- Existing `domain-prompts.ts` → new prompts added
- Existing `/cmc` slash command → build-state enrichment added
- Existing `unifiedTaskService` → review task creation wired

### No Duplicate Tasking
An initial implementation created duplicate `cmcSubStudyTasks` / `cmcSubStudyApprovals` tables. These were **removed** in favor of wiring into the existing `unifiedTasks` system with `moduleType: 'CMC'` and `taskType: 'review'`. Tasks appear in the Communication/Tasking/Submission Center.

---

## 3. Files Changed

### New Files
| File | Purpose |
|------|---------|
| `server/services/cmc-write-through.ts` | Core write-through service: maps legacy records → canonical payloads, upserts, marks stale, creates tasks |

### Modified Files
| File | Change |
|------|--------|
| `server/api/cmc/routes.ts` | Write-through calls on all CMC create/update (drug substances, products, analytical methods, stability studies, process validation, change control, comparability) |
| `server/api/cmc/stabilityRoutes.ts` | Write-through on create + update |
| `server/api/cmc/specificationRoutes.ts` | Write-through on create + update |
| `server/api/cmc/batchRecordRoutes.ts` | Write-through on create + update + release |
| `client/src/concept2cure/hooks/useCMC.ts` | `invalidateModule3BuildState()` on all mutation success callbacks |
| `server/services/ana-ri/context-enrichment.ts` | `/cmc` enrichment now includes Module 3 build-state (stale sections, source counts) |
| `client/src/concept2cure/config/domain-prompts.ts` | 3 new CMC domain prompts for write-through workflow |

### Deleted Files (Duplicate Removal)
| File | Reason |
|------|--------|
| `server/api/cmc/subStudyTaskRoutes.ts` | Duplicate of existing unified task system |
| `migrations/20260406_cmc_sub_study_tasks.sql` | Duplicate tables removed |
| `shared/schema/cmc-os.ts` (partial) | `cmcSubStudyTasks`, `cmcSubStudyApprovals` tables removed |

---

## 4. Data Flow

```
CMC Data Entry (any form)
    ↓ saves to legacy table (drugSubstances, analyticalMethods, etc.)
    ↓ returns record with projectId
    ↓
Write-Through Service (non-blocking)
    ├── Maps record → canonical CmcSourceType payload
    ├── Upserts into cmc_source_objects (ON CONFLICT UPDATE)
    ├── Records cmc_provenance_events (event_type: 'write_through')
    ├─�� Marks impacted cmc_module3_sections stale
    └── (Optional) Creates unifiedTasks review task
    ↓
Client Cache Invalidation
    ├── Invalidates module3-build-state query key
    └── Invalidates module3-source-lineage query key
    ↓
Dossier tree + build indicators auto-refresh
```

---

## 5. Write-Through Coverage

| CMC Data Type | Source Type | Impacted Sections | Route File |
|---------------|------------|-------------------|------------|
| Drug Substance | `drug_substance` | 3.1, 3.2.S.1-3, 3.2.S.5, 3.2.P.2, 3.3 | routes.ts |
| Drug Product | `drug_product` | 3.1, 3.2.P.1-3, 3.2.P.6, 3.3 | routes.ts |
| Analytical Method | `method` | 3.2.S.4, 3.2.P.5 | routes.ts |
| Stability Study | `stability` | 3.2.S.7, 3.2.P.8 | routes.ts, stabilityRoutes.ts |
| Specification | `specification` | 3.2.S.4, 3.2.P.5 | specificationRoutes.ts |
| Batch Record | `batch` | 3.2.P.3 | batchRecordRoutes.ts |
| Change Control | `change_control` | 3.2.P.3 | routes.ts |
| Comparability | `comparability` | 3.2.P.2, 3.2.P.8 | routes.ts |
| Process Validation | `process_validation` | 3.2.S.2, 3.2.P.3 | routes.ts |

---

## 6. Chat-First Compliance

### Slash Commands
- `/cmc` — now enriched with Module 3 build-state (stale sections, source counts)
- Existing Module 3 commands (`/cmc` with intents) continue to work

### Domain Prompts (config/domain-prompts.ts)
- `cmc-push-data` — "Push CMC data into Module 3 pipeline"
- `cmc-pending-tasks` — "Show pending CMC review tasks"
- `cmc-data-coverage` — "What CMC data is missing for my project?"
- Plus 8 existing Module 3 workflow prompts

### Zero Capability Loss
All CMC data visibility previously available through dashboard views remains accessible:
- Through AnA conversation: `/cmc`, domain prompts
- Through workspace: Module 3 build indicators, dossier tree status
- Through inspector: Module3BuildInspector in editor sidebar

---

## 7. UI Standards Compliance

| Rule | Status | Evidence |
|------|--------|----------|
| Mutations use `invalidateQueries()` | ✅ | All `useCMC.ts` mutations call `invalidateModule3BuildState()` |
| Query keys registered in `queryKeys.ts` | ✅ | `module3.buildState()`, `module3.sourceLineage()` already registered |
| API calls use `apiRequest()` | ✅ | All hooks use `apiRequest` from `@/lib/queryClient` |
| No new UI surfaces | ✅ | Only extended existing routes, hooks, enrichments |
| No raw `fetch()` | ✅ | All client calls go through `apiRequest()` or `cmcService` |

---

## 8. Governance Compliance

| CLAUDE.md Rule | Status |
|----------------|--------|
| No new screens (chat-first) | ✅ |
| No duplicate task system | ✅ (removed initial duplicate) |
| Module 3 uses shared workspace | ✅ |
| Write-through uses provenance | ✅ (cmc_provenance_events) |
| Build-state reflects more than artifact status | ✅ (11-state enum) |
| Uploaded docs + CMC data converge | ✅ (both feed cmc_source_objects) |
| AnA calls same pipeline | ✅ (/cmc enrichment pulls same build-state) |
| Component registry compliance | N/A (no new UI components) |

---

## 9. Bugs Fixed

| Bug | Severity | Fix |
|-----|----------|-----|
| Comparability PUT read projectId from `req.body` instead of DB | Critical | Changed to read `rows[0].project_id` from RETURNING clause |
| Comparability CREATE used `req.body.projectId` for write-through | Medium | Changed to read `rows[0].project_id` from RETURNING clause |
| Batch release endpoint had no write-through | Medium | Added `writeThroughBatchRecord()` call after release update |

---

## 10. Test Verification Script

```
1. Select Project A
2. Enter/update: drug substance, analytical method, stability data
3. Confirm writes persist with Project A context
4. Confirm canonical source objects created for Project A (query cmc_source_objects)
5. Confirm Module 3 build-state changes (stale sections appear)
6. Open 3.2.S.4, 3.2.S.7, 3.2.P.5
7. Confirm correct artifact resolves in shared workspace
8. Rebuild section → confirm governed artifact updates
9. Switch to Project B → verify no Project A data bleed
10. Use /cmc in AnA → verify stale sections appear in enrichment
11. Check Communication Center → verify review tasks appear for CMC data
```
