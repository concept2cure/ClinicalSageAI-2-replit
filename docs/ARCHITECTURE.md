# Concept2Cure.RI Architecture Guide

> **Version:** 1.0.0  
> **Last Updated:** January 24, 2026  
> **Status:** Living Document - Update when creating modules

---

## Module Boundaries

This document defines the authoritative structure for the Concept2Cure.RI platform. **All new code must fit within these boundaries.**

---

## Domain Modules

### 1. CER (Clinical Evaluation Reports) - `modules/cer/`

**Scope:** EU MDR/IVDR clinical evaluation reports, MEDDEV 2.7/1 compliance

```
modules/cer/
├── services/
│   ├── cerGenerationService.ts     # Report generation
│   ├── cerComplianceService.ts     # Validation
│   ├── cerExportService.ts         # PDF/Word export
│   └── cerDataService.ts           # Data retrieval
├── routes/
│   └── cerRoutes.ts
├── components/
│   ├── CERWorkbench/
│   ├── CEREditor/
│   └── CERExport/
├── types/
│   └── cer.types.ts
└── schema/
    └── cerSchema.ts
```

**Owner:** CER Team  
**Related APIs:** `/api/cer/*`

---

### 2. 510(k) Submissions - `modules/510k/`

**Scope:** FDA 510(k) premarket notifications, predicate device analysis

```
modules/510k/
├── services/
│   ├── predicateFinderService.ts   # Predicate device search
│   ├── substantialEquivalenceService.ts
│   ├── estarService.ts             # eSTAR generation
│   └── 510kComplianceService.ts
├── routes/
│   └── 510kRoutes.ts
├── components/
│   ├── PredicateAnalysis/
│   ├── SubstantialEquivalence/
│   └── ESTARBuilder/
├── types/
│   └── 510k.types.ts
└── schema/
    └── 510kSchema.ts
```

**Owner:** 510(k) Team  
**Related APIs:** `/api/510k/*`

---

### 3. CMC (Chemistry, Manufacturing, Controls) - `modules/cmc/`

**Scope:** Drug substance/product manufacturing documentation

```
modules/cmc/
├── services/
│   ├── cmcBlueprintService.ts
│   ├── processValidationService.ts
│   └── stabilityService.ts
├── routes/
│   └── cmcRoutes.ts
├── components/
│   ├── BlueprintEditor/
│   ├── ProcessFlow/
│   ├── StabilityData/
│   └── TaskManagement/
├── types/
│   └── cmc.types.ts
└── schema/
    └── cmcSchema.ts
```

**Owner:** CMC Team  
**Related APIs:** `/api/cmc/*`

---

### 4. Protocol Design - `modules/protocol/`

**Scope:** Clinical trial protocol design, statistical analysis plans

```
modules/protocol/
├── services/
│   ├── protocolDesignService.ts
│   ├── statisticalDesignService.ts
│   └── sampleSizeService.ts
├── routes/
│   └── protocolRoutes.ts
├── components/
│   ├── ProtocolBuilder/
│   ├── StatisticalDesign/
│   └── EndpointManager/
├── types/
│   └── protocol.types.ts
└── schema/
    └── protocolSchema.ts
```

**Owner:** Protocol Team  
**Related APIs:** `/api/protocol/*`

---

### 5. GRDHE (Global Regulatory Data Harmonization) - `server/services/grdhe/`

**Scope:** Multi-jurisdiction regulatory data transformation, adverse event reporting

```
server/services/grdhe/
├── grdheService.ts              # Core service
├── types.ts                      # Type definitions
├── exportGenerators/
│   ├── fdaAE3500A.ts            # FDA MedWatch
│   ├── emaAEE2BR3.ts            # EMA E2B(R3)
│   └── index.ts
└── (routes in server/routes/grdheRoutes.ts)
```

**Owner:** Regulatory Affairs  
**Related APIs:** `/api/grdhe/*`  
**Status:** ✅ Well-organized (reference implementation)

---

### 6. CoAuthor - `modules/coauthor/`

**Scope:** Document authoring, TipTap editor, citations

```
modules/coauthor/
├── services/
│   ├── documentService.ts
│   ├── citationService.ts
│   └── versionService.ts
├── routes/
│   └── authoringRoutes.ts
├── components/
│   ├── Editor/
│   ├── Toolbar/
│   ├── Citations/
│   └── Collaboration/
├── types/
│   └── coauthor.types.ts
└── schema/
    └── coauthorSchema.ts
```

**Owner:** CoAuthor Team  
**Related APIs:** `/api/authoring/*`

---

### 7. Analytics & Reporting - `modules/analytics/`

**Scope:** Dashboards, metrics, business intelligence

```
modules/analytics/
├── services/
│   ├── analyticsService.ts
│   ├── dashboardService.ts
│   └── reportingService.ts
├── routes/
│   └── analyticsRoutes.ts
├── components/
│   ├── Dashboard/
│   ├── Charts/
│   └── Reports/
├── types/
│   └── analytics.types.ts
└── schema/
    └── analyticsSchema.ts
```

**Owner:** Platform Team  
**Related APIs:** `/api/analytics/*`

---

## Shared Infrastructure

### Core Services - `server/services/core/`

```
server/services/core/
├── authService.ts               # Authentication
├── storageService.ts            # File storage
├── auditService.ts              # Audit logging
├── notificationService.ts       # Email/notifications
├── queueService.ts              # Job queue
└── cacheService.ts              # Redis caching
```

### Shared Components - `client/src/components/shared/`

```
client/src/components/shared/
├── ui/                          # shadcn/ui components
├── forms/                       # Form components
├── layout/                      # Layout components
├── feedback/                    # Loading, errors, toasts
└── data-display/                # Tables, cards, lists
```

### Shared Types - `shared/types/`

```
shared/types/
├── common.ts                    # Common types
├── api.ts                       # API request/response types
├── auth.ts                      # Auth types
└── tenant.ts                    # Multi-tenant types
```

---

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Services | `{domain}Service.ts` | `cerService.ts` |
| Routes | `{domain}Routes.ts` | `cerRoutes.ts` |
| Types | `{domain}.types.ts` | `cer.types.ts` |
| React Components | `PascalCase/` directory | `CEREditor/index.tsx` |
| React Hooks | `use{Name}.ts` | `useCERData.ts` |
| Utilities | `{name}.utils.ts` | `date.utils.ts` |
| Tests | `{name}.test.ts` | `cerService.test.ts` |
| Migrations | `{NNN}_{domain}_{description}.sql` | `082_cer_templates.sql` |

---

## File Size Limits

| File Type | Max Lines | Action if Exceeded |
|-----------|-----------|-------------------|
| Services | 500 | Split into focused services |
| Components | 300 | Extract sub-components |
| Routes | 400 | Split by resource |
| Types | 500 | Split by sub-domain |
| Schema | 300 | Split by domain |

---

## Import Rules

### ✅ Allowed

```typescript
// Importing from same module
import { CERService } from './cerService';

// Importing from shared
import { logger } from '@/server/utils/logger';
import { Button } from '@/client/components/ui/button';

// Importing types
import type { CERReport } from '@/modules/cer/types/cer.types';
```

### ❌ Forbidden

```typescript
// Cross-module imports (use API instead)
import { CMCService } from '@/modules/cmc/services/cmcService';

// Circular imports
import { parent } from '../../../parent';

// Deprecated folder imports
import { old } from './_deprecated/oldService';
```

---

## Database Schema Ownership

| Schema Prefix | Owner Module | Example Tables |
|---------------|--------------|----------------|
| `cer_` | CER | `cer_reports`, `cer_sections` |
| `fda_510k_` | 510(k) | `fda_510k_projects`, `fda_510k_predicates` |
| `cmc_` | CMC | `cmc_blueprints`, `cmc_processes` |
| `protocol_` | Protocol | `protocol_designs`, `protocol_arms` |
| `grdhe_` | GRDHE | `grdhe_export_jobs`, `grdhe_mappings` |
| `doc_` | CoAuthor | `doc_documents`, `doc_versions` |
| `analytics_` | Analytics | `analytics_metrics`, `analytics_dashboards` |

---

## Adding New Features Checklist

Before creating any new file, answer:

- [ ] Which domain module does this belong to?
- [ ] Does a similar file/service already exist?
- [ ] Is the file under 500 lines?
- [ ] Are all imports from allowed sources?
- [ ] Is the file named according to conventions?
- [ ] Is it in the correct directory?
- [ ] Does it have proper TypeScript types?
- [ ] Does it use the logger (not console.log)?

---

## Migration from Current State

See [TECH_DEBT_ANALYSIS_2026-01-24.md](./TECH_DEBT_ANALYSIS_2026-01-24.md) for the detailed plan.

---

*This document is the source of truth for architecture decisions. Update it before making structural changes.*
