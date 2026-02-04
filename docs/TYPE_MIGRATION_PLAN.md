# TypeScript Type Safety Migration Plan

**Created:** 2025-01-24
**Status:** In Progress
**Build Status:** ✅ Clean (0 errors)

## Overview

This document tracks the migration from `@ts-nocheck` suppressed files to properly typed TypeScript code. The build is currently passing with relaxed TypeScript settings and ~200 files using `@ts-nocheck`.

## Current State

### TypeScript Configuration

- `strict: false`
- `noImplicitAny: false`
- `strictNullChecks: false`
- `checkJs: false`

### Type Definition Files Created

- ✅ `shared/types/database.d.ts` - Core database entity types
- ✅ `shared/types/express.d.ts` - Express request/response augmentation
- ✅ `shared/types/common.d.ts` - Common application types
- ✅ `shared/types/services.d.ts` - Service module declarations
- ✅ `shared/types/third-party.d.ts` - Third-party library types
- ✅ `server/types/fda-integration.ts` - FDA service types
- ✅ `server/types/medical-device.ts` - Medical device service types
- ✅ `shared/schema-index.ts` - Type-safe schema re-exports

## Migration Priority

### Tier 1: Critical Infrastructure (Fix First)

| File                | Lines | Original Errors | Complexity | Status         |
| ------------------- | ----- | --------------- | ---------- | -------------- |
| `server/index.ts`   | 4,305 | ~50-100         | Medium     | 🟡 @ts-nocheck |
| `server/storage.ts` | 3,776 | 102             | High       | 🟡 @ts-nocheck |

### Tier 2: Core Services (Fix Next)

| File                                       | Lines | Original Errors | Complexity             | Status             |
| ------------------------------------------ | ----- | --------------- | ---------------------- | ------------------ |
| `server/statistics-service.ts`             | 6,302 | 238             | High (schema mismatch) | 🟡 @ts-nocheck     |
| `server/services/medicalDeviceService.ts`  | 858   | 105             | Medium                 | 🟡 @ts-nocheck     |
| `server/services/fdaIntegrationService.ts` | 799   | 73              | Low-Medium             | 🟡 Partially typed |

### Tier 3: Routes & Middleware

- ~50 route files with @ts-nocheck
- ~10 middleware files with @ts-nocheck

### Tier 4: Client Components

- ~60 React components with @ts-nocheck

## Known Schema Issues

### Critical: csrReports Table Mismatch

Code expects columns that don't exist in the schema:

| Code Uses               | Actual Schema                           |
| ----------------------- | --------------------------------------- |
| `csrReports.title`      | `csrReports.reportTitle`                |
| `csrReports.phase`      | `csrReports.metadata.phase` (JSON)      |
| `csrReports.indication` | `csrReports.metadata.indication` (JSON) |
| `csrReports.sponsor`    | `csrReports.metadata.sponsor` (JSON)    |

**Decision Required:** Either:

1. Add missing columns to schema via migration
2. Refactor code to extract from `metadata` JSON field

## How to Fix a File

1. Remove `// @ts-nocheck` from the file
2. Run `npm run check` or check VS Code errors
3. Add proper type annotations for parameters
4. Import types from `server/types` or `shared/types`
5. For schema mismatches, use type assertions or fix the query

### Example Fix Pattern

```typescript
// Before (with @ts-nocheck)
async function getUser(id) {
  return await db.select().from(users).where(eq(users.id, id));
}

// After (properly typed)
import type { User } from 'shared/types/database';

async function getUser(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}
```

## Progress Tracking

### Files Fixed (Removed @ts-nocheck)

- [ ] server/index.ts
- [ ] server/storage.ts
- [ ] server/statistics-service.ts
- [ ] (add more as fixed)

### Type Coverage Goals

- [ ] Phase 1: All Tier 1 files typed (Target: Week 1)
- [ ] Phase 2: All Tier 2 files typed (Target: Week 2)
- [ ] Phase 3: Enable `noImplicitAny: true` (Target: Week 3)
- [ ] Phase 4: Enable `strict: true` (Target: Week 4)

## Commands

```bash
# Check for TypeScript errors
npm run check

# Find all files with @ts-nocheck
grep -r "@ts-nocheck" --include="*.ts" --include="*.tsx" -l | wc -l

# Check specific file for errors
npx tsc --noEmit path/to/file.ts
```

## Notes

- The build passes because of relaxed tsconfig settings and @ts-nocheck
- True type safety requires progressively removing @ts-nocheck and fixing errors
- Schema changes may require database migrations
- Some files in `_archive/` and `_deprecated_migrations/` can be ignored
