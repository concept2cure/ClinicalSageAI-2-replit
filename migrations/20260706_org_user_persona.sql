-- ============================================================================
-- Organization-user persona (AnA Command Center — role-personalized surfaces)
-- ============================================================================
--
-- Adds an OPTIONAL job persona to the org-membership junction so a user can be
-- mapped to a persona (executive | ra_lead | qa | …) that drives a role-aware
-- home and a default report-catalog persona. The vocabulary is the canonical
-- REPORT_PERSONAS list (the same values the Report-OS taxonomy already uses as
-- `allowed_personas` on report types) — no parallel enum.
--
-- NOT an authorization boundary: access control stays on organization_users.role
-- (admin | manager | member | viewer). Persona is null = unset.
--
-- Additive + idempotent.
-- ============================================================================

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS persona TEXT;
