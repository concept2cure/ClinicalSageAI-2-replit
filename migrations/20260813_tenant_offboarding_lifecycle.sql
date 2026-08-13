-- Governed tenant offboarding lifecycle.
--
-- WHY. Until this migration the only way to remove a tenant was
-- `DELETE FROM organizations` — an immediate, irreversible cascade issued by a
-- single authenticated API call (server/routes/tenants-simple.ts). For a
-- platform that stores IND applications, 510(k) submissions and clinical
-- protocols under 21 CFR Part 11, that is not an acceptable offboarding
-- control: Part 11 §11.10(e) requires that record deletion be reconstructable
-- from the audit trail, and every enterprise MSA on this product commits to a
-- data-return window before destruction.
--
-- This migration adds the state a governed offboarding needs. It adds columns
-- only; it changes no existing rows' behaviour, and the new columns are all
-- NULL for every existing organization, which `derivePosture` reads as "not
-- offboarding".
--
-- The lifecycle the columns support:
--
--   active
--     └─ request deletion ──> pending_deletion   (read-only; exportable)
--            │                      │
--            │                      ├─ cancel ──> active
--            │                      │
--            └── retention window elapses ──> purge ──> purged  (no access)
--
-- `status` carries the state (it already exists and is already the column the
-- lifecycle guard reads); these columns carry the evidence.
--
-- Idempotent: every statement is IF NOT EXISTS.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deletion_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_by   INTEGER,
  ADD COLUMN IF NOT EXISTS deletion_reason         TEXT,
  -- When the retention window closes and a purge becomes permissible. The purge
  -- itself is never automatic: an operator must still call the purge endpoint.
  -- Storing the earliest-permissible instant rather than scheduling a job keeps
  -- destruction an explicit, audited act.
  ADD COLUMN IF NOT EXISTS purge_eligible_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_by               INTEGER,
  -- SHA-256 of the export manifest handed to the customer before purge. Proves
  -- the data-return obligation was met, without retaining the data itself.
  ADD COLUMN IF NOT EXISTS final_export_digest     TEXT,
  ADD COLUMN IF NOT EXISTS final_export_at         TIMESTAMPTZ;

COMMENT ON COLUMN organizations.deletion_requested_at IS
  'When offboarding was requested. Non-null implies status = pending_deletion until purge or cancel.';
COMMENT ON COLUMN organizations.purge_eligible_at IS
  'Earliest instant a purge may run. Enforced by tenant-offboarding.ts, not by a scheduler.';
COMMENT ON COLUMN organizations.final_export_digest IS
  'SHA-256 of the tenant export manifest produced before purge — evidence the data-return obligation was met.';

-- Operators need "which tenants are mid-offboarding, and which are now purgeable"
-- to be a cheap query; it drives the admin console and the retention report.
-- Partial index: the overwhelming majority of rows have a NULL here.
CREATE INDEX IF NOT EXISTS idx_organizations_purge_eligible_at
  ON organizations (purge_eligible_at)
  WHERE purge_eligible_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_deletion_requested_at
  ON organizations (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;
