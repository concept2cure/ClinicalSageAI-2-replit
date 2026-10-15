-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — Vault retention
-- Compliance: ADR-0014 §6 (retention of governed records); 21 CFR 11.10(c);
--             EU Clinical Trials Regulation Art. 58; Annex 11 §17
-- Purpose: An organisation's own retention period for what the Vault admits.
--
-- eCTD/CTD Context:
--   - Module(s): all
--   - Integrity Risk Addressed: retention_until was computed at admission from
--     a GLOBAL named policy (vault.retention_policies, keyed by policy_name, no
--     organisation column) and nothing else. No policy is seeded on any
--     applier, so every document admitted without one was dated NULL — kept
--     with no clock at all — and an organisation had nowhere to record the
--     period its own regulators and SOPs require (P1-22 remainder, DP-20).
--
-- Determinism Contract:
--   - Additive. One table, its constraints, nothing else. No existing object
--     is altered. No DROP.
--
-- Notes:
--   - Idempotent (CREATE TABLE IF NOT EXISTS). Re-runs every deploy per RULE 1
--     in CLAUDE.md.
--   - public, organization_id INTEGER NOT NULL, listed above the final
--     tenant-isolation pair in scripts/db/migration-set.mjs, so the integer
--     sweep (db/migrations/20260801_tenant_isolation_sweep.sql) gives it
--     ENABLE + FORCE RLS and tenant_isolation_policy (CLAUDE.md RULE 1,
--     third corollary). It carries no policy of its own for that reason.
-- =============================================================================
--
-- WHAT ADR-0014 §6 DECIDES, AND WHERE EACH PART LIVES
--
--   default 25 years from finalization  DEFAULT_RETENTION_YEARS (shared/schema/
--                                       vault.ts), applied at admission in
--                                       server/services/vault/vault-ingest.service.ts
--   a longer period                     a row here, retention_years > 25
--   a shorter one with a recorded       a row here, retention_years < 25, which
--   reason naming the governing rule    the CHECK below refuses without both
--   a legal hold always overrides       vault.legal_holds; the sweep refuses to
--                                       dispose of a held record (retentionCron.ts)
--
-- One row per organisation (UNIQUE): the CURRENT period. Its history — every
-- before/after, who, when and why — is the chained audit_logs row written in
-- the same transaction as each change (server/routes/vault-retention-period.ts),
-- so a second history table here would be a second account of the same events.
--
-- Years, not days: the period is what a regulation or SOP states (15 years,
-- 25 years), and a year count is what an inspector compares it with. A named
-- policy's retention_days stays as it is; admission takes the LATER of the two
-- dates, so a named policy is never shortened silently.
--
-- The 25 in the CHECK is ADR-0014 §6's default, the same number as
-- DEFAULT_RETENTION_YEARS. It is in the database so a row written by any path,
-- not only the route, cannot record a shorter period without its reason.

CREATE TABLE IF NOT EXISTS public.organization_retention_settings (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL,
  retention_years  INTEGER NOT NULL,
  reason           TEXT,
  governing_rule   TEXT,
  set_by           INTEGER NOT NULL,
  set_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The constraints are added here, each only when absent, rather than inline:
-- scripts/db/install-fresh.mjs runs `drizzle-kit push` BEFORE this set, and push
-- creates this public table from shared/schema/vault.ts — after which the
-- CREATE TABLE above is a no-op. Inline constraints would then exist only on a
-- database that took the deploy path, and the two paths would disagree about
-- the one rule this table exists to hold. Adding them by name and shape when
-- missing gives both paths the same table. The names are drizzle's own
-- (`<table>_<column>_unique`, `<table>_<col>_<ref>_<refcol>_fk`) and the model
-- declares the same checks, so a push-created table is recognised, not doubled.
DO $mig$
DECLARE
  t CONSTANT regclass := 'public.organization_retention_settings'::regclass;
  org_att SMALLINT;
BEGIN
  SELECT attnum INTO org_att FROM pg_attribute WHERE attrelid = t AND attname = 'organization_id';

  -- One current period per organisation.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND contype = 'u' AND conkey = ARRAY[org_att]) THEN
    ALTER TABLE public.organization_retention_settings
      ADD CONSTRAINT organization_retention_settings_organization_id_unique UNIQUE (organization_id);
  END IF;

  -- The organisation's own row; removed with the organisation.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND contype = 'f' AND conkey = ARRAY[org_att]) THEN
    ALTER TABLE public.organization_retention_settings
      ADD CONSTRAINT organization_retention_settings_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'organization_retention_settings_years_range') THEN
    ALTER TABLE public.organization_retention_settings
      ADD CONSTRAINT organization_retention_settings_years_range CHECK (retention_years BETWEEN 1 AND 100);
  END IF;

  -- Shorter than the default is a governed act: a reason, and the rule that
  -- permits it, or the row does not exist.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'organization_retention_settings_shorter_is_reasoned') THEN
    ALTER TABLE public.organization_retention_settings
      ADD CONSTRAINT organization_retention_settings_shorter_is_reasoned CHECK (
        retention_years >= 25
        OR (
          reason IS NOT NULL AND length(btrim(reason)) >= 10
          AND governing_rule IS NOT NULL AND length(btrim(governing_rule)) >= 3
        )
      );
  END IF;
END
$mig$;
