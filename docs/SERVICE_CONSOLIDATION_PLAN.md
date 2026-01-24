# Service Consolidation Plan

## Document Control
| Attribute | Value |
|-----------|-------|
| Document ID | CONSOL-001 |
| Version | 1.0.0 |
| Date | 2025-01-14 |
| Status | Implementation Plan |

---

## Executive Summary

The ClinicalSageAI codebase contains significant service duplication across 7 functional areas. This document outlines the consolidation plan to reduce 28 duplicate services to 15 canonical services.

---

## 1. CER Generator Services

### Current State: 9 files
### Target State: 5 files (4 to deprecate)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `cerGenerationService.ts` | 1163 | **KEEP** | Canonical - MDR/IVDR compliant |
| `cerPdfExporter.js` | 1066 | **KEEP** | Specialized MEDDEV 2.7/1 PDF |
| `cerComplianceService.ts` | 583 | **KEEP** | Validation (distinct purpose) |
| `cerChatService.js` | 280 | **KEEP** | AI chat (distinct purpose) |
| `cerDataService.js` | 431 | **KEEP** | Data retrieval (distinct purpose) |
| `cerGenerator.ts` | 852 | **DEPRECATE** | Merged into cerGenerationService |
| `cerService.js` | 634 | **DEPRECATE** | Functionality in cerGenerationService |
| `cerPdfService.js` | 113 | **DEPRECATE** | Legacy Puppeteer approach |
| `cerServiceLite.ts` | 186 | **DEPRECATE** | Merged into cerGenerationService |

---

## 2. Document Processing Services

### Current State: 5 files
### Target State: 2 files (3 to deprecate)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `unifiedDocumentIngestion.js` | 1376 | **KEEP** | Canonical - unified ingestion |
| `documentClassifier.ts` | 432 | **MERGE** | Specialized features worth keeping |
| `documentProcessor.js` | 858 | **DEPRECATE** | Merged into unified |
| `documentProcessingService.ts` | 912 | **DEPRECATE** | Duplicate of documentProcessor |
| `documentService.js` | 98 | **DEPRECATE** | Test stub only |

---

## 3. PDF Generation Services

### Current State: 3 files
### Target State: 1 file (2 to deprecate)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `indPdfExporter.ts` | 996 | **KEEP** | Canonical - PDF-Lib based |
| `pdfService.js` | 358 | **DEPRECATE** | CommonJS, less features |
| `pdfService-esm.js` | 209 | **DEPRECATE** | Merged into indPdfExporter |

---

## 4. Word Generation Services

### Current State: 2 files
### Target State: 1 file (1 to deprecate)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `wordService-esm.js` | 183 | **KEEP** | Canonical - ESM format |
| `wordService.js` | 245 | **DEPRECATE** | CommonJS version |

---

## 5. Document Assembly Services

### Current State: 2 files
### Target State: 1 file (1 to deprecate)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `documentAssemblyService-esm.js` | 916 | **KEEP** | Canonical - ESM format |
| `documentAssemblyService.js` | 849 | **DEPRECATE** | CommonJS version |

---

## 6. Audit Services

### Current State: 3 files
### Target State: 2 files (1 merge)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `auditService.js` | 212 | **KEEP** | Canonical - general audit |
| `cortexComplianceService.ts` | 1038 | **KEEP** | Cortex-specific (different scope) |
| `ectdAuditService.js` | 298 | **MERGE** | eCTD-specific, merge as module |

---

## 7. Compliance Services

### Current State: 4 files
### Target State: 3 files (1 to deprecate)

| File | Lines | Action | Reason |
|------|-------|--------|--------|
| `complianceService.ts` | 604 | **KEEP** | Canonical - 21 CFR Part 11 |
| `cortexComplianceService.ts` | 1038 | **KEEP** | Cortex-specific |
| `cerComplianceService.ts` | 583 | **KEEP** | Document validation |
| `complianceAnalyzer.js` | 72 | **DEPRECATE** | Merge into complianceService |

---

## Implementation Steps

### Phase 1: Mark Deprecated Files (Immediate)
```bash
# Add @deprecated JSDoc tags to all files marked DEPRECATE
# Create _deprecated folder for archived services
```

### Phase 2: Update Imports (Week 1)
1. Update all routes importing deprecated services
2. Update inter-service dependencies
3. Run full test suite

### Phase 3: Archive Deprecated Files (Week 2)
```bash
mkdir -p server/services/_deprecated
mv server/services/cerGenerator.ts server/services/_deprecated/
mv server/services/cerService.js server/services/_deprecated/
mv server/services/cerPdfService.js server/services/_deprecated/
mv server/services/cerServiceLite.ts server/services/_deprecated/
mv server/services/documentProcessor.js server/services/_deprecated/
mv server/services/documentProcessingService.ts server/services/_deprecated/
mv server/services/documentService.js server/services/_deprecated/
mv server/services/pdfService.js server/services/_deprecated/
mv server/services/pdfService-esm.js server/services/_deprecated/
mv server/services/wordService.js server/services/_deprecated/
mv server/services/documentAssemblyService.js server/services/_deprecated/
mv server/services/complianceAnalyzer.js server/services/_deprecated/
```

### Phase 4: Verify and Clean (Week 3)
1. Run full build
2. Run integration tests
3. Verify no broken imports
4. Delete _deprecated folder after 30-day monitoring

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Broken imports | Medium | High | Comprehensive grep before removal |
| Missing features | Low | Medium | Merge features before deprecation |
| Test failures | Medium | Medium | Run full test suite after each phase |
| Production issues | Low | High | 30-day monitoring before deletion |

---

## Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total service files | 180+ | ~165 | -15 (-8%) |
| Duplicate functions | 50+ | <10 | -80% |
| Import complexity | High | Medium | Simplified |
| Code maintenance burden | High | Medium | Reduced |

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tech Lead | | | |
| QA Lead | | | |
| DevOps | | | |

---

*Document End*
