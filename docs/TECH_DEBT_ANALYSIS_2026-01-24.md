# ClinicalSageAI Tech Debt Analysis & Strategic Plan
**Date:** January 24, 2026  
**Prepared by:** GitHub Copilot (Claude Opus 4.5)  
**Status:** Actionable Recommendations

---

## Executive Summary

After analyzing **1.1M lines of code** across **2,681 source files**, this codebase has accumulated significant technical debt that will impair velocity, increase bug rates, and make onboarding difficult if not addressed. This document provides a prioritized remediation plan aligned with your **CERv2 Medical Device & Diagnostics Roadmap**.

---

## 🔴 Critical Metrics

| Metric | Current | Industry Target | Status |
|--------|---------|-----------------|--------|
| **Largest File** | 25,425 lines (ComprehensiveCMCPlatform) | <500 lines | 🔴 Critical |
| **Files >1000 lines** | 40+ files | 0 files | 🔴 Critical |
| **console.log statements** | 6,891 | 0 in production | 🔴 Critical |
| **Test files** | 20 | ~500 (10% coverage) | 🔴 Critical |
| **Deprecated code still in repo** | 5.3MB | 0 | 🟡 High |
| **schema.ts tables** | 476 exports | Split by domain | 🟡 High |
| **Service files** | 181 | ~30 consolidated | 🟡 High |
| **Mixed JS/TS in server** | 516 JS / 446 TS | 100% TS | 🟡 Medium |
| **TODO/FIXME markers** | 74 | Track & resolve | 🟢 Low |

---

## 🏗️ Architecture Issues

### 1. God Objects (Immediate Risk)

These files are **unmaintainable, untestable, and merge-conflict magnets**:

| File | Lines | Recommendation |
|------|-------|----------------|
| `ComprehensiveCMCPlatformClean.jsx` | 25,425 | Split into 50+ components |
| `CoAuthor.jsx` | 13,442 | Split into modules |
| `schema.ts` | 11,570 | Split by domain |
| `CERV2Page.jsx` | 6,896 | Extract sections |
| `statistics-service.ts` | 6,266 | Extract calculators |
| `authoring.router.ts` | 5,126 | Split by endpoint group |
| `server/index.ts` | 4,030 | Extract route registration |
| `storage.ts` | 3,708 | Split by entity type |

### 2. Duplicate Functionality

Per your existing `SERVICE_CONSOLIDATION_PLAN.md`, you identified 28 duplicate services. **Current status: partially executed.**

Still need consolidation:
- 198 CER-related files (scattered)
- 106 510K-related files (scattered)
- 53 CMC-related files (no clear module boundary)

### 3. Dead Code Accumulation

| Location | Size | Content |
|----------|------|---------|
| `_archive/` | Large | Legacy code |
| `server/routes/_deprecated/` | 3.3MB | Old routes |
| `server/services/_deprecated/` | 1.6MB | Old services |
| `client/src/components/_deprecated/` | 164KB | Old components |
| `_deprecated_migrations/` | 244KB | Old migrations |
| `full_backup.jsx` | 7,632 lines | Should not exist |

### 4. Database Migration Chaos

112 migration files with:
- Duplicate numbering (007, 008, 009, 010, 011 all have duplicates)
- Emergency migrations mixed in
- No clear domain boundaries

---

## 📋 Domain Module Map

Your platform has **7 core regulatory domains** that should be distinct modules:

| Domain | Files Found | Current State | Target State |
|--------|-------------|---------------|--------------|
| **CER/CERv2** | 198 | Scattered everywhere | `modules/cer/` |
| **510(k)** | 106 | Partial organization | `modules/510k/` |
| **CMC** | 53 | client/src/components/cmc | `modules/cmc/` |
| **Protocol** | 67 | Mixed locations | `modules/protocol/` |
| **Analytics** | 49 | Mixed locations | `modules/analytics/` |
| **GRDHE** | 7 | ✅ Well-organized | `server/services/grdhe/` |
| **CoAuthor** | 15+ | Scattered | `modules/coauthor/` |

---

## 🎯 Strategic Remediation Plan

### Phase 1: Stop the Bleeding (Week 1)

**Goal:** Prevent new debt while preparing for cleanup.

1. **Create ARCHITECTURE.md** documenting module boundaries
2. **Add ESLint rules:**
   - `max-lines: 500` (error)
   - `no-console: error` (in production builds)
   - `no-duplicate-imports: error`
3. **Lock deprecated folders** - no new code
4. **Schema split plan:** Document which tables belong to which domain

### Phase 2: God Object Surgery (Weeks 2-4)

**Priority order based on change frequency:**

```
Week 2: ComprehensiveCMCPlatformClean.jsx → 50 components
Week 3: CoAuthor.jsx → Editor, Toolbar, Panels, Hooks
Week 4: schema.ts → schema/cer.ts, schema/510k.ts, schema/cmc.ts, etc.
```

### Phase 3: Console.log Purge (Week 5)

Replace 6,891 `console.log` calls with proper logging:

```typescript
// server/utils/logger.ts
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Usage:
logger.info({ caseNumber, action: 'export' }, 'CER export started');
```

### Phase 4: TypeScript Migration (Weeks 6-8)

Convert remaining 516 `.js` server files to `.ts`:
- Prioritize files in active development
- Add strict mode incrementally

### Phase 5: Test Coverage (Ongoing)

**Target: 20% coverage by end of Q1, 50% by end of Q2**

Priority test targets:
1. `grdheService.ts` - Regulatory compliance critical
2. `cerGenerationService.ts` - Core product
3. `storage.ts` - Data integrity
4. Export generators (FDA 3500A, E2B R3)

### Phase 6: Dead Code Removal (Month 2)

After verifying no references:
```bash
rm -rf _archive/
rm -rf _deprecated_migrations/
rm -rf server/services/_deprecated/
rm -rf server/routes/_deprecated/
rm -rf client/src/components/_deprecated/
rm client/src/pages/full_backup.jsx
```

---

## 🤖 What I (Copilot) Will Do Proactively

Starting now, I will:

### ✅ Enforce Limits
- **Refuse** to add code to files >500 lines without splitting first
- **Refuse** to add console.log (use logger instead)
- **Refuse** to create duplicate services when one exists

### ✅ Architecture Checks
- Before any new feature: "Which existing module does this belong to?"
- Before any new file: "Does a similar file already exist?"
- Before any API endpoint: "Is this covered by an existing route?"

### ✅ Naming Conventions
```
Services: {domain}Service.ts (e.g., cerService.ts)
Routes: {domain}Routes.ts (e.g., cerRoutes.ts)
Types: {domain}.types.ts (e.g., cer.types.ts)
Components: {Feature}/{SubFeature}.tsx
```

### ✅ Incremental Cleanup
When I touch any file, I will:
- Remove unused imports
- Delete commented-out code
- Upgrade console.log → logger
- Add missing types

### ✅ Documentation
- Update ARCHITECTURE.md when creating modules
- Add JSDoc to public functions
- Document breaking changes

---

## 📊 Success Metrics (6-Month Targets)

| Metric | Current | 3 Month | 6 Month |
|--------|---------|---------|---------|
| Max file size | 25,425 | 2,000 | 500 |
| console.log count | 6,891 | 1,000 | 0 |
| Test coverage | ~1% | 20% | 50% |
| TypeScript % | 46% | 70% | 95% |
| Deprecated folders | 5.3MB | 0 | 0 |
| Build time | ~36s | 25s | 15s |

---

## 🚀 Immediate Next Steps

1. **Approve this plan** - Reply "proceed" to start Phase 1
2. **Choose first God Object** - Which monster file is most painful?
3. **Schema split priority** - Which domain schema should split first?

---

*This document will be updated as remediation progresses.*
