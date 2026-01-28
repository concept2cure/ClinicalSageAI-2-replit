# Step 1 Rollback Plan — Database Foundation
**Date:** 2026‑01‑28  
**Scope:** Phase 1 (Tasks 1.1–1.10) per [docs/CONCEPT2CURE_ROADMAP_PART4.md](docs/CONCEPT2CURE_ROADMAP_PART4.md)

## Objective
Provide a reversible path for Step 1 schema changes within 10 minutes, as required by Gate 4 (Rollback).

## Preconditions
- Production snapshot/backups are available.
- Maintenance window approved.
- Admin access to database and migration runner.

## Rollback Steps (Order Matters)

### 1) Quiesce Writes
- Temporarily disable write paths for Concept2Cure and related modules.
- Verify no active write transactions.

### 2) Backup (Safety Net)
- Create a point‑in‑time snapshot before any rollback actions.

### 3) Rollback Step 1 Additions
Execute the following in order:

#### 3.1 Drop Step 1 WBS + Assignments Tables
```sql
DROP TABLE IF EXISTS cro_team_assignments CASCADE;
DROP TABLE IF EXISTS project_tasks CASCADE;
DROP TABLE IF EXISTS project_workflow_stages CASCADE;
```

#### 3.2 Drop Concept2Cure Foundation Tables (if required)
```sql
DROP TABLE IF EXISTS concept2cure_artifact_versions CASCADE;
DROP TABLE IF EXISTS concept2cure_artifacts CASCADE;
DROP TABLE IF EXISTS concept2cure_messages CASCADE;
DROP TABLE IF EXISTS concept2cure_conversations CASCADE;
```

#### 3.3 Drop Concept2Cure Signatures Table (if required)
```sql
DROP TABLE IF EXISTS concept2cure_signatures CASCADE;
```

#### 3.4 Revert RLS Policies (if required)
```sql
-- Re-run baseline RLS policy migration if rollback impacts tenant policies
-- See: db/migrations/053_gcc_rls_policies.sql
```

### 4) Validate Rollback
- Run schema checks to confirm removed tables are absent.
- Confirm core tables (organizations, projects, users) remain intact.

### 5) Restore Writes
- Re-enable write paths after validation.

## Recovery Path
If rollback fails or data loss occurs:
1. Restore the pre‑rollback snapshot.
2. Re‑run the migration runner to reapply Step 1 migrations.

## Ownership
- **DBA On‑Call:** Responsible for snapshot/restore.
- **App On‑Call:** Responsible for disabling/re‑enabling write paths.

---

**End of Plan**
