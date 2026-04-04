# Deletion, Quarantine & Migration Register

> **Program:** Concept2Cure Data + System Control Program v4
> **Date:** 2026-04-04
> **Branch:** `claude/data-system-control-program-v4`

---

## Register Format

Every structural action is recorded here with:
- **Target**: file or concern
- **Category**: delete | quarantine | migrate | wrap | deprecate
- **Reason**: why this action is justified
- **Risk**: none | low | medium | high
- **Action**: what was done
- **Rollback**: how to undo if needed

---

## Prior Session Actions (Phase 1+2 Dead Code Purge)

### Deleted Route Files (36 files)

| Target | Category | Reason | Risk | Action | Rollback |
|--------|----------|--------|------|--------|----------|
| `server/routes/academic_protocol_assessment.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/evidenceV2.ts` | delete | Zero imports, superseded | none | Deleted | git revert |
| `server/routes/regulatory-intelligence-api.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/comment-routes.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/maud-routes.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/nonclinicalRoutes.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/phase6.routes.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/csr-upload-routes.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/programsV2.ts` | delete | Zero imports, v2 never adopted | none | Deleted | git revert |
| `server/routes/compliance-gap-analysis.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/cognitive-ecosystem.routes.ts` | delete | Zero imports, duplicate of .ts | none | Deleted | git revert |
| `server/routes/notifications.routes.ts` | delete | Zero imports, duplicate | none | Deleted | git revert |
| `server/routes/cerRoutes.ts` | delete | Legacy v1, superseded by cerv2-* | none | Deleted | git revert |
| `server/routes/cer-unified.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/dropout-forecast-routes.ts` | delete | Zero imports | none | Deleted | git revert |
| `server/routes/hallucination-check.ts` | delete | Zero imports | none | Deleted | git revert |
| _...and 20 more route files_ | delete | Zero imports | none | Deleted | git revert |

### Deleted Orphaned Services (33 files)

| Target | Category | Reason | Risk | Action | Rollback |
|--------|----------|--------|------|--------|----------|
| `server/services/watermarkService.js` | delete | Zero imports | none | Deleted | git revert |
| `server/services/electronic-signature-service.js` | delete | Zero imports | none | Deleted | git revert |
| `server/services/discoveryService.js` | delete | Zero imports | none | Deleted | git revert |
| `server/services/faersService.js` | delete | Zero imports | none | Deleted | git revert |
| `server/services/pdfGenerator.js` | delete | Dead registry ref only | none | Deleted | git revert |
| `server/services/enhancedPdfBuilder.js` | delete | Type stubs only | none | Deleted | git revert |
| `server/services/fdaService.js` | delete | Dead registry, client uses FDA510kService | none | Deleted | git revert |
| `server/services/firebase-admin.ts` | delete | npm name collision only | none | Deleted | git revert |
| _...and 25 more service files_ | delete | Zero imports | none | Deleted | git revert |

### Deleted Client Components (285+ files)

| Target | Category | Reason | Risk | Action | Rollback |
|--------|----------|--------|------|--------|----------|
| `client/src/components/docushare/` (14 files) | delete | Entire directory, zero external imports | none | Deleted | git revert |
| `client/src/components/ind-automation/` (13 files) | delete | Entire directory, zero external imports | none | Deleted | git revert |
| `client/src/components/510k/` (17 files) | delete | Zero imports per file | none | Deleted | git revert |
| `client/src/components/cer/` (47 files) | delete | Zero imports per file | none | Deleted | git revert |
| `client/src/components/protocol/` (10 files) | delete | Zero imports per file | none | Deleted | git revert |
| _...and 180+ more component files_ | delete | Zero imports | none | Deleted | git revert |

### Import Fixes

| Target | Category | Reason | Risk | Action | Rollback |
|--------|----------|--------|------|--------|----------|
| `client/src/components/510k/index.js` | migrate | 4 exports referenced deleted files | low | Removed broken exports | git revert |
| `client/src/portal-v2/ClientPortalV2.tsx` | migrate | Wrong CERV2Page import path | low | Fixed path | git revert |
| `client/src/concept2cure/components/industry/index.ts` | migrate | Broken relative paths | low | Fixed ./x -> ../x | git revert |
| `tests/enterprise-integration.test.ts` | migrate | Dead test blocks | low | Removed dead describes | git revert |

---

## Data + System Control Program Actions

_Actions from this program will be recorded below as each phase executes._

---

*This register is append-only. Every action must have a rollback path.*
