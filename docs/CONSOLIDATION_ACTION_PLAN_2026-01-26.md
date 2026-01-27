# Route & Service Consolidation Action Plan

**Generated:** January 26, 2026
**Status:** Q1 2026 Consolidation Sprint
**Roadmap Reference:** PRODUCT_VISION_ROADMAP.md

---

## 📊 Current State Assessment

| Metric                  | Current   | Target Q2 | Target Q4 | Gap                |
| ----------------------- | --------- | --------- | --------- | ------------------ |
| **Total Routes**        | 330       | 150       | 100       | -180 to go         |
| **Active Routes**       | 142       | 100       | 80        | -42 to go          |
| **Deprecated Routes**   | 197       | 0         | 0         | ✅ Ready to delete |
| **Total Services**      | 261       | 175       | 150       | -86 to go          |
| **Active Services**     | 182       | 150       | 130       | -32 to go          |
| **Deprecated Services** | 82        | 0         | 0         | ✅ Ready to delete |
| **Test Coverage**       | ~10 tests | 70%       | 85%       | ⚠️ CRITICAL        |

---

## 🎯 Immediate Actions (This Week)

### Phase 1: Delete Deprecated Code (Safe - 284 files)

```bash
# These are in _deprecated folders - safe to remove
rm -rf server/routes/_deprecated     # 3.0MB, 197 files
rm -rf server/services/_deprecated   # 1.5MB, 82 files
```

**Impact:** Removes 279 files, reduces codebase by 4.5MB

---

## 📦 Route Consolidation Targets

### Priority 1: 510(k) Routes (8 → 2 files)

| Current Files               | Keep/Consolidate             |
| --------------------------- | ---------------------------- |
| `510kRoutes.ts`             | ✅ KEEP (primary)            |
| `510kEstarRoutes.ts`        | ✅ KEEP (eSTAR)              |
| `510k-api-routes.ts`        | → Merge into `510kRoutes.ts` |
| `510k-compliance-routes.ts` | → Merge into `510kRoutes.ts` |
| `510k-literature-routes.ts` | → Merge into `510kRoutes.ts` |
| `510k-project.routes.ts`    | → Merge into `510kRoutes.ts` |
| `fda510k-routes.ts`         | → Merge into `510kRoutes.ts` |
| `fda510k-test.ts`           | Move to `__tests__/`         |

**Result:** 8 → 2 active files

---

### Priority 2: CER Routes (5 → 2 files)

| Current Files               | Keep/Consolidate            |
| --------------------------- | --------------------------- |
| `cerRoutes.ts`              | ✅ KEEP (primary)           |
| `cer/generateFullCER.js`    | ✅ KEEP (generator)         |
| `cer-routes.ts`             | → Merge into `cerRoutes.ts` |
| `cer-analytics-routes.ts`   | → Merge into `cerRoutes.ts` |
| `cerDeviceProfileRoutes.ts` | → Merge into `cerRoutes.ts` |

**Result:** 5 → 2 active files

---

### Priority 3: Document Routes (8 → 2 files)

| Current Files                    | Keep/Consolidate                  |
| -------------------------------- | --------------------------------- |
| `document-routes.ts`             | ✅ KEEP (primary)                 |
| `documentAuthoring.routes.ts`    | ✅ KEEP (authoring)               |
| `documentOrchestrationRoutes.ts` | → Merge into `document-routes.ts` |
| `document_qc_routes.ts`          | → Merge into `document-routes.ts` |
| `document-data-center.ts`        | → Merge into `document-routes.ts` |
| `document_approval.py`           | Python - evaluate                 |
| `document_routes.py`             | Python - evaluate                 |
| `medical-device-documents.mjs`   | → Merge into `document-routes.ts` |

**Result:** 8 → 2-3 active files

---

### Priority 4: Quality Routes (5 → 1 file)

| Current Files                  | Keep/Consolidate           |
| ------------------------------ | -------------------------- |
| `quality-management-routes.ts` | ✅ KEEP (primary)          |
| `quality-management-api.ts`    | → Merge into above         |
| `quality-validation-routes.ts` | → Merge into above         |
| `section-quality-gates.ts`     | → Merge into above         |
| `tenant-quality-validation.ts` | → Merge into tenant routes |

**Result:** 5 → 1-2 active files

---

### Priority 5: Tenant Routes (9 → 2 files)

| Current Files                  | Keep/Consolidate                |
| ------------------------------ | ------------------------------- |
| `tenants.ts`                   | ✅ KEEP (primary)               |
| `tenant-config.ts`             | ✅ KEEP (config)                |
| `tenants-simple.ts`            | → Merge into `tenants.ts`       |
| `tenant-stats.ts`              | → Merge into `tenants.ts`       |
| `tenant-users.ts`              | → Merge into `tenants.ts`       |
| `tenant-section-gating.ts`     | → Merge into `tenant-config.ts` |
| `tenant-traceability.ts`       | → Merge into `tenant-config.ts` |
| `tenant-ctq-factors.ts`        | → Merge into `tenant-config.ts` |
| `tenant-quality-validation.ts` | → Merge into `tenant-config.ts` |

**Result:** 9 → 2 active files

---

### Priority 6: Cortex Routes (5 → 2 files)

| Current Files               | Keep/Consolidate               |
| --------------------------- | ------------------------------ |
| `cortexRoutes.ts`           | ✅ KEEP (primary)              |
| `lumen-cortex.ts`           | ✅ KEEP (lumen bridge)         |
| `cortexQueryRoutes.ts`      | → Merge into `cortexRoutes.ts` |
| `cortexAdvisoryRoutes.ts`   | → Merge into `cortexRoutes.ts` |
| `cortexManagementRoutes.ts` | → Merge into `cortexRoutes.ts` |

**Result:** 5 → 2 active files

---

### Priority 7: Intelligence Routes (5 → 2 files)

| Current Files                     | Keep/Consolidate                      |
| --------------------------------- | ------------------------------------- |
| `intelligence-routes.ts`          | ✅ KEEP (primary)                     |
| `semantic-intelligence-routes.ts` | ✅ KEEP (semantic)                    |
| `intel-routes.ts`                 | → Merge into `intelligence-routes.ts` |
| `intelligence_report_routes.ts`   | → Merge into `intelligence-routes.ts` |
| `intelligence_report.py`          | Python - evaluate                     |

**Result:** 5 → 2 active files

---

### Priority 8: IND Routes (8 → 2 files)

| Current Files               | Keep/Consolidate                         |
| --------------------------- | ---------------------------------------- |
| `ind-submissions.routes.ts` | ✅ KEEP (primary)                        |
| `indWizardAPI.js`           | ✅ KEEP (wizard)                         |
| `ind_automation_routes.ts`  | → Merge into `ind-submissions.routes.ts` |
| `ind-database.routes.ts`    | → Merge into `ind-submissions.routes.ts` |
| `ind-templates.ts`          | → Merge into `ind-submissions.routes.ts` |
| `indSequenceRoutes.mjs`     | → Merge into `ind-submissions.routes.ts` |
| `ind_xml_validation.py`     | Python - keep for now                    |
| `ind_sequence_*.py`         | Python - keep for now                    |

**Result:** 8 → 2 active files (+ Python utilities)

---

## 📈 Projected Impact

| Action                   | Files Removed | Route Target  |
| ------------------------ | ------------- | ------------- |
| Delete `_deprecated`     | 279           | -             |
| Consolidate 510k         | -6            | 8 → 2         |
| Consolidate CER          | -3            | 5 → 2         |
| Consolidate Document     | -5            | 8 → 3         |
| Consolidate Quality      | -4            | 5 → 1         |
| Consolidate Tenant       | -7            | 9 → 2         |
| Consolidate Cortex       | -3            | 5 → 2         |
| Consolidate Intelligence | -3            | 5 → 2         |
| Consolidate IND          | -4            | 8 → 4         |
| **Total**                | **314**       | **142 → 100** |

---

## 🧪 Critical: Test Coverage Gap

### Current State (CRITICAL)

- Route tests: **2** (for 142 routes = 1.4%)
- Service tests: **2** (for 182 services = 1.1%)
- Client tests: **4**
- E2E tests: **2**

### Target: 70% Coverage

**Priority Test Files to Create:**

1. **Core Routes** (HIGH)
   - `cortexRoutes.test.ts`
   - `510kRoutes.test.ts`
   - `cerRoutes.test.ts`
   - `document-routes.test.ts`
   - `tenants.test.ts`

2. **Core Services** (HIGH)
   - `cortexPrimeService.test.ts`
   - `cerGenerationService.test.ts`
   - `ectdService.test.ts`
   - `deviceProfileService.test.ts`

3. **Integration Tests** (MEDIUM)
   - Submission workflow E2E
   - Document lifecycle E2E
   - User authentication E2E

---

## 📅 Execution Timeline

### Week 1 (Jan 27-31)

- [ ] Delete `_deprecated` folders
- [ ] Consolidate 510k routes (8 → 2)
- [ ] Consolidate CER routes (5 → 2)

### Week 2 (Feb 3-7)

- [ ] Consolidate Document routes (8 → 3)
- [ ] Consolidate Quality routes (5 → 1)
- [ ] Consolidate Tenant routes (9 → 2)

### Week 3 (Feb 10-14)

- [ ] Consolidate Cortex routes (5 → 2)
- [ ] Consolidate Intelligence routes (5 → 2)
- [ ] Consolidate IND routes (8 → 4)

### Week 4 (Feb 17-21)

- [ ] Service consolidation phase 1
- [ ] Create core route tests (5 files)
- [ ] Create core service tests (4 files)

---

## ✅ Definition of Done

For each consolidation:

1. ✅ All endpoints preserved and functional
2. ✅ OpenAPI/Swagger docs updated
3. ✅ Old route marked deprecated with redirect
4. ✅ Integration tests pass
5. ✅ No breaking changes to client code
6. ✅ Audit trail preserved

---

## 🚀 Quick Wins (Do Now)

```bash
# 1. Delete deprecated folders (safe, immediate)
rm -rf server/routes/_deprecated
rm -rf server/services/_deprecated

# 2. Update route count
find server/routes -type f \( -name "*.ts" -o -name "*.js" \) ! -path "*_deprecated*" | wc -l
```

---

_Document generated by roadmap alignment analysis_
