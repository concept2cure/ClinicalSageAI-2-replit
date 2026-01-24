# Simplification Decision Analysis

**Date:** 2025-01-24  
**Purpose:** Make final decisions on 5 open items with full risk/benefit analysis

---

## Analysis Summary

### Data Gathered

| Metric | Value | Implication |
|--------|-------|-------------|
| Schema imports | 107 files | High impact if broken |
| Top used tables | csrReports (14), csrDetails (14), fda510kProjects (8) | ~20 tables are core |
| Auth function calls | 120 | Auth is critical path |
| Dev mode checks | 30 | Dev mode is relied upon |
| DocuShare references | 100 | Active integration |
| Remaining migrations | 60 | Clean sequence |
| Build status | ✅ Works (180ms) | Changes didn't break build |
| TypeScript errors | Pre-existing in eSTARPlusBuilder.ts | Not caused by our changes |

---

## Decision 1: Schema Full Split

### Analysis

**Current State:**
- 11,571 lines, 239 tables, 31 relations
- 107 files import from `@shared/schema`
- Only ~20 tables are frequently used
- Has arrow function references (prevents naive splitting)

**Risk Assessment:**
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Import breaks | Medium | High | Barrel re-exports |
| Circular deps | Low | High | Careful ordering |
| Build failure | Low | Medium | Test after each split |
| Type inference | Medium | Medium | Explicit type exports |

**Effort:** ~4-6 hours for full split

### ✅ DECISION: Proceed with INCREMENTAL SPLIT

**Rationale:** The current monolithic file violates our 500-line ESLint rule and makes maintenance difficult. However, a big-bang approach is risky.

**Execution Plan:**
1. **Phase 1 (Now):** Extract CDISC reference tables (37 tables, read-only, no relations) → `reference.ts`
2. **Phase 2:** Extract core tables (organizations, users) → `core.ts`
3. **Phase 3:** Extract by domain as needed

**Key Safety Measure:** Keep `shared/schema.ts` as-is, create domain files that are imported INTO the main file, then gradually move exports to the barrel.

---

## Decision 2: Auth Mode

### Analysis

**Current State:**
- `middleware/auth.js` - JWT production auth (120 usages)
- `auth.ts` - Dev mode bypass (30 dev checks)
- Both are actively used

**Risk Assessment:**
| Option | Pros | Cons |
|--------|------|------|
| Keep dual | Fast local dev, existing patterns | Two code paths to maintain |
| JWT-only | Consistent behavior, production-like | Needs test token setup |

### ✅ DECISION: Keep DUAL AUTH (Status Quo)

**Rationale:** 
1. 30 files rely on dev mode bypasses
2. Changing would require updating test infrastructure
3. The current pattern is documented and secure (JWT in prod)
4. Dev mode only activates when `NODE_ENV=development`

**No action needed** - current implementation is sound.

---

## Decision 3: DocuShare Integration

### Analysis

**Current State:**
- 100 code references to DocuShare
- Active services: `DocuShareOCRService.js`, `DocuShareAPIClient.ts`
- Active routes: `ocr-routes.js`
- 22 env vars in `.env.example`

**Risk Assessment:**
| Action | Risk | Benefit |
|--------|------|---------|
| Remove | High - breaks active features | Cleaner config |
| Keep | Low | Enterprise feature intact |
| Lazy-load | Low | Cleaner for non-DocuShare users |

### ✅ DECISION: Keep DocuShare, ADD LAZY LOADING

**Rationale:** DocuShare is an active enterprise integration (100 references). Removing would break features.

**Improvement:** Update config to lazy-load DocuShare only when `DOCUSHARE_API_URL` is set:

```typescript
// In server/config/environment.ts
docushare: process.env.DOCUSHARE_API_URL ? {
  enabled: true,
  url: process.env.DOCUSHARE_API_URL,
  // ... other config
} : { enabled: false }
```

---

## Decision 4: Migration Fresh Baseline

### Analysis

**Current State:**
- 60 remaining migrations (conflicts resolved)
- Drizzle config points to `./shared/schema.ts`
- Build works

**Risk Assessment:**
| Option | Risk | Benefit |
|--------|------|---------|
| Fresh baseline | High - needs DB coordination | Clean history |
| Keep 60 | Low | Working system |
| Schema push | Medium | Modern approach |

### ✅ DECISION: Keep 60 Migrations + USE DRIZZLE PUSH

**Rationale:**
1. 60 remaining migrations are sequential and conflict-free
2. Creating a fresh baseline requires coordinating with production DBs
3. Drizzle's `db:push` is recommended for ongoing development

**Documentation:** Add to README:
```bash
# Development: Use schema push
npx drizzle-kit push:pg

# Production: Use migrations
npx drizzle-kit migrate
```

---

## Decision 5: Standalone Servers

### Analysis

**Current State (archived):**
- `vault-server.js` - Document vault API (port 4001)
- `swagger-standalone.js` - Swagger UI (port 5050)
- `advisor-standalone.js` - Advisory service

**Functionality Review:**
- Vault server: Uses mock OpenAI, document management
- Swagger: API documentation viewer
- Advisor: Standalone advisory (redundant with main routes)

### ✅ DECISION: PERMANENTLY DELETE (after grace period)

**Rationale:**
1. None are referenced in `package.json` scripts
2. Vault functionality exists in main server (`/api/vault/*`)
3. Swagger can be served from main server (already has routes)
4. Advisor is redundant with main advisory routes

**Timeline:** Files remain in `_archived/` until 2025-02-24, then permanent deletion.

---

## Execution Plan

### Immediate (Today)

| Task | Action | Risk |
|------|--------|------|
| Schema CDISC split | Extract 37 CDISC tables | Low |
| Config lazy-load | Add DocuShare conditional | Low |
| Docs update | Add migration guidance | None |

### Deferred (30-day review)

| Task | Date | Action |
|------|------|--------|
| Delete archived servers | 2025-02-24 | Remove `_archived/` |
| Delete legacy migrations | 2025-02-24 | Remove `_legacy/` |
| Full schema split | As needed | Continue domain extraction |

---

## Rollback Plan

If any issues arise:

1. **Schema:** `shared/schema.ts` remains intact, just remove domain imports
2. **Auth:** No changes being made
3. **DocuShare:** Config change is additive, not breaking
4. **Migrations:** Legacy folder preserved for 30 days
5. **Servers:** Archived folder preserved for 30 days

---

## Success Criteria

| Metric | Current | Target | Validation |
|--------|---------|--------|------------|
| Build time | 180ms | <200ms | `npm run build` |
| Schema imports | All work | All work | Test 107 files |
| Auth | Working | Working | E2E test |
| TS errors | Pre-existing | Same | `tsc --noEmit` |

---

*Analysis complete. Proceeding with execution.*
