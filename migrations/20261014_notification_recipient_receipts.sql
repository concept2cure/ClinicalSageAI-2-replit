-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Retain per-member read/archive receipts and organization-scoped notification preferences.
--
-- eCTD/CTD Context:
--   - Module(s): Cross-cutting regulatory notification delivery and recipient acknowledgment state.
--   - Integrity Risk Addressed: One recipient changing another recipient receipt or preferences leaking between memberships.
--
-- Determinism Contract:
--   - Never infer broadcast readership; preserve notices and legacy direct-recipient receipt semantics.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- Audit remedies F18/D08, 2026-10-14. A notice is shared content;
-- reading/archiving it belongs to one tenant member, never the shared row.
-- Public + organization_id INTEGER so the final tenant sweeps install RLS.
CREATE TABLE IF NOT EXISTS mdx_notification_receipts (
  organization_id integer NOT NULL REFERENCES organizations(id),
  notification_id integer NOT NULL REFERENCES mdx_notifications(id),
  user_id integer NOT NULL REFERENCES users(id),
  read_at timestamptz,
  archived_at timestamptz,
  PRIMARY KEY (organization_id, notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS mdx_notification_receipts_user_idx
  ON mdx_notification_receipts (organization_id, user_id, notification_id);
-- Broadcast read_at never proved which person read it and is not copied.
-- Legacy direct-recipient read_at remains honored by the service.

-- The old index's creating migration was amended in the same change; no
-- applier re-creates it. This upgrade removes only obsolete uniqueness, no data.
DROP INDEX IF EXISTS notif_sub_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS notif_sub_org_user_category_uniq
  ON mdx_notification_subscriptions (organization_id, user_id, category);
