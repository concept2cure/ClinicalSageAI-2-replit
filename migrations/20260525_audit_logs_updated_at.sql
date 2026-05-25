-- ============================================================================
-- audit_logs.updated_at — repair audit emission (platform-wide)
-- ============================================================================
--
-- The drizzle auditLogs definition (shared/schema.ts) includes
-- `updated_at timestamp default now()`, so auditService.logAction()'s INSERT
-- lists that column. The materialized audit_logs table here lacks it, so the
-- insert fails — and because every caller uses fire-and-forget `void
-- logAction(...)`, the failure was silent: NO audit_logs rows were being
-- written anywhere (PDEV mutations, MDX §6 emission, etc.). Adding the column
-- repairs the 21 CFR audit chain across the whole platform.
-- ============================================================================

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
