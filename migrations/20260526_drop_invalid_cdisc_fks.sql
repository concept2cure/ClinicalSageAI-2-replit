-- ============================================================================
-- 20260526_drop_invalid_cdisc_fks.sql
-- Drop two invalid single-column foreign keys on CDISC reference tables
-- ============================================================================
--
-- WHY
--   shared/schema.ts previously declared single-column FKs whose target
--   columns are unique only per-tenant / per-study (composite unique
--   indexes), not globally unique:
--
--     cdisc_cdash_fields.form_id   -> cdisc_cdash_forms.form_id
--         (form_id unique only via cdash_tenant_form_idx (tenant_id, form_id))
--     cdisc_docs_define_artifacts.define_id -> cdisc_ectd_define_xml.define_id
--         (define_id unique only via ectd_study_define_idx (study_id, define_id))
--
--   Postgres requires an FK target to carry a single-column unique/PK
--   constraint, so these constraints CANNOT be created — the original
--   ADD CONSTRAINT statements in 0000_sweet_joseph.sql error with
--   "there is no unique constraint matching given keys", which halted a
--   clean `drizzle-kit push` and any from-scratch migrate.
--
--   The matching `.references()` clauses have been removed from
--   shared/schema.ts; these tables are READ-ONLY CDISC reference/future
--   tables with zero active code usages, so there is no app-layer
--   behavior change — parent rows were always identified by their
--   composite keys, never by these single columns.
--
-- SAFETY
--   IF EXISTS makes this a no-op on the (expected) databases where the
--   constraints were never successfully created, while still dropping
--   them on any environment that somehow has them. Idempotent; re-runnable.
--
-- 21 CFR Part 11 note: no audited/tenant data is touched. This is a
-- constraint-definition correction on unused reference tables; no rows
-- are read, written, or deleted.
-- ============================================================================

ALTER TABLE IF EXISTS cdisc_cdash_fields
  DROP CONSTRAINT IF EXISTS cdisc_cdash_fields_form_id_cdisc_cdash_forms_form_id_fk;

ALTER TABLE IF EXISTS cdisc_docs_define_artifacts
  DROP CONSTRAINT IF EXISTS cdisc_docs_define_artifacts_define_id_cdisc_ectd_define_xml_define_id_fk;
