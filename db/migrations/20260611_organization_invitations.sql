-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure RIAI — Tenant Membership (cross-org invite consent)
-- Compliance: 21 CFR Part 11 §11.10(d) — limiting system access to authorized
--             individuals. Previously an org admin inviting an email that
--             already belonged to a user in ANOTHER organization silently
--             added that user to the inviting org (membership without the
--             user's knowledge or consent). Memberships grant data access, so
--             they must be consented, attributable, and auditable.
-- Purpose: Pending-invitation register for existing cross-org users
--          (decision-register item 12, issue #727). Inviting an existing user
--          from another org now creates a PENDING row here; the membership in
--          organization_users is only created when the invited user accepts.
--          status lifecycle: pending -> accepted | declined (responded_at set
--          on response; rows are retained as an audit record of consent).
--
-- Notes:
--   - Org-scoped: every row carries organization_id.
--   - user_id is nullable to allow invites for not-yet-registered emails;
--     the current invite flow always resolves an existing user, so it is
--     populated today.
--   - Partial unique index makes pending invites idempotent per org+email.
--   - Migration is idempotent (IF NOT EXISTS).
-- =============================================================================

CREATE TABLE IF NOT EXISTS organization_invitations (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id         INTEGER REFERENCES users(id),
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  invited_by_id   INTEGER REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  responded_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS organization_invitations_org_idx
  ON organization_invitations (organization_id);
CREATE INDEX IF NOT EXISTS organization_invitations_user_idx
  ON organization_invitations (user_id);

-- One live (pending) invitation per org + email; resolved invitations are
-- retained for audit and do not block a re-invite.
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_uniq
  ON organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';
