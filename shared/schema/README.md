# Schema Domain Architecture

## Overview

The monolithic `shared/schema.ts` (11,571 lines, 239 tables) is being migrated to a domain-based architecture for better maintainability.

## Migration Status

| Domain | Tables | Status | File |
|--------|--------|--------|------|
| Core | ~15 | 🔴 Pending | core.ts |
| Documents | ~22 | 🔴 Pending | documents.ts |
| Regulatory | ~47 | 🔴 Pending | regulatory.ts |
| Clinical | ~20 | 🔴 Pending | clinical.ts |
| AI | ~15 | 🔴 Pending | ai.ts |
| Compliance | ~12 | 🔴 Pending | compliance.ts |
| **Reference (CDISC)** | **37** | **✅ Done** | **cdisc-reference.ts** |
| Supply Chain | ~6 | 🔴 Pending | supply-chain.ts |
| Tasks/Workflow | ~10 | 🔴 Pending | tasks.ts |

## CDISC Reference Tables (Completed)

The 37 CDISC standards tables have been documented in `cdisc-reference.ts`:
- **Usage:** 0 active imports (reference/future use)
- **Location:** Lines 8696-9720 in schema.ts
- **Import path:** `import { CDISC_TABLES } from '@shared/schema/cdisc-reference'`

Tables include:
- PRM (Protocol Representation Model)
- CDASH (Clinical Data Acquisition)
- CSR (Clinical Study Report)
- ADaM (Analysis Data Model)
- eCTD metadata
- IND integration
- Compliance rules
- Product Quality domains
- Medical Device domains

## Import Patterns

### Before Migration (Current)
```typescript
import { users, organizations, documents } from '@shared/schema';
```

### After Migration (Same API!)
```typescript
// Works exactly the same - backward compatible
import { users, organizations, documents } from '@shared/schema';

// Or import from specific domain (optional optimization)
import { users, organizations } from '@shared/schema/core';
import { documents } from '@shared/schema/documents';
```

## Domain Ownership

| Domain | Owner | Description |
|--------|-------|-------------|
| Core | Platform Team | Auth, users, tenants |
| Documents | Content Team | File management, SharePoint |
| Regulatory | Regulatory Team | CER, IND, 510k, submissions |
| Clinical | Clinical Team | CSR, trials, protocols |
| AI | AI Team | RAG, embeddings, knowledge |
| Compliance | QA Team | Audit, validation, Part 11 |
| Reference | Platform Team | CDISC standards (read-only) |

## Constraints

1. Each domain file must be < 500 lines (ESLint rule)
2. Cross-domain references use `../schema` imports
3. All exports go through `index.ts` barrel
4. No breaking changes to import API
