-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — module access requests
-- Compliance: 21 CFR Part 11 (auditability of governed decisions), ALCOA+
-- Purpose: A locked module told a member who could not buy it to "ask an
--          administrator" and then offered nothing that would. This table is
--          where that ask is recorded: one row per (organization, module,
--          requester), carrying the requester's note, and — once an
--          administrator has answered — the decision and the reason for it.
--
--          Approving a request GRANTS the module the one canonical way: an
--          `enabled` row in module_subscriptions. Nothing here is read by the
--          entitlement resolver, and nothing here can revoke a grant. This is
--          the record of the ASK and the ANSWER, never a second entitlement
--          store.
--
-- Determinism Contract:
--   - New table + indexes only, all IF NOT EXISTS; no existing object touched.
--   - organization_id is the integer org key, so the tenant-isolation sweep
--     (20260801_tenant_isolation_sweep.sql, always last in the apply set)
--     attaches the standard RLS policy on its next run.
--   - module_id is deliberately NOT a foreign key to available_modules. The FK
--     on module_subscriptions is ON DELETE CASCADE, and a request is the record
--     of a conversation between two people: it must survive a catalog row being
--     re-keyed or retired, exactly as an audit entry does.
--   - Re-runnable: the status CHECK and the partial unique index are created
--     only when absent, so applying this twice is a no-op.
-- =============================================================================

CREATE TABLE IF NOT EXISTS module_access_requests (
  id               SERIAL PRIMARY KEY,
  organization_id  INTEGER NOT NULL,
  module_id        TEXT    NOT NULL,
  requested_by     INTEGER NOT NULL,
  requester_email  TEXT,
  requester_name   TEXT,
  -- Why they need it, in their words. Optional: a request with no note is a
  -- request, not a draft.
  note             TEXT,
  -- 'open' | 'approved' | 'declined'. Only 'open' participates in the
  -- one-request-per-person rule below; a declined request may be made again.
  status           TEXT    NOT NULL DEFAULT 'open',
  decided_by       INTEGER,
  decided_by_email TEXT,
  decided_at       TIMESTAMPTZ,
  -- The reason-for-change captured at the moment of the decision. Mirrored into
  -- the Part 11 audit chain by the route; kept here so the queue can show the
  -- decision and its reason together without a join into the audit store.
  decision_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Status vocabulary, added separately so re-running cannot raise on a duplicate
-- constraint name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'module_access_requests_status_ck'
  ) THEN
    ALTER TABLE module_access_requests
      ADD CONSTRAINT module_access_requests_status_ck
      CHECK (status IN ('open', 'approved', 'declined'));
  END IF;
END $$;

-- THE DE-DUPLICATION RULE, held by the database rather than by the handler.
--
-- One OPEN request per (organization, module, requester). A second ask by the
-- same person for the same module updates the row that is already open instead
-- of stacking a second one onto an administrator's queue — and because the
-- index is partial, a request that has been answered does not block a fresh one
-- later, which is what makes "ask again after the plan changes" possible.
--
-- Enforced here and not only in the INSERT ... ON CONFLICT that uses it: two
-- concurrent clicks race past any application-level check, and the outcome of
-- that race is the duplicate this index makes impossible.
CREATE UNIQUE INDEX IF NOT EXISTS module_access_requests_open_uniq
  ON module_access_requests (organization_id, module_id, requested_by)
  WHERE status = 'open';

-- The org-admin queue reads "open requests for my organization, newest first".
CREATE INDEX IF NOT EXISTS module_access_requests_org_status_idx
  ON module_access_requests (organization_id, status, created_at DESC);

-- The requester's own view, and the lock panel's "is one already open" check.
CREATE INDEX IF NOT EXISTS module_access_requests_requester_idx
  ON module_access_requests (requested_by, status);

COMMENT ON TABLE module_access_requests IS
  'A member''s request for a locked module, and the org administrator''s answer. Record of the ask and the decision; never an entitlement source — approval writes the grant into module_subscriptions.';
COMMENT ON COLUMN module_access_requests.decision_reason IS
  'Reason-for-change captured at the decision (min 3 chars), mirrored into the Part 11 audit chain.';
