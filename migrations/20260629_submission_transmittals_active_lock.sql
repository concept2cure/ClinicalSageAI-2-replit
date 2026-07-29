-- 20260629_submission_transmittals_active_lock.sql
--
-- FDA ESG production UAT — §11 hardening (FIX 7).
--
-- Per-package transmit lock. Nothing in code today prevents a second transmit
-- against the same (org, submission, bundle) tuple after a rollback or while a
-- prior attempt is still in flight, so a confused operator can double-ship the
-- same package to FDA. This UNIQUE partial index serialises that at the DB
-- layer: only one ACTIVE transmittal row may exist per
-- (organization_id, package_id, bundle_sha256), where "active" means
-- pending / in_transit / received (i.e. anything not terminally rejected /
-- rolled_back / completed).
--
-- The application-layer guard in the transmit handler returns 409 with the
-- existing transmittal_id BEFORE attempting an INSERT; this index is the
-- belt-and-suspenders backstop that turns a race into a constraint violation
-- rather than a duplicate FDA shipment.
--
-- Cross-tenant scoping is preserved: organization_id is in the key so a
-- different org may transmit the same package_id / bundle_sha256 (which is the
-- realistic case for a CMO running multiple sponsors).

CREATE UNIQUE INDEX IF NOT EXISTS sub_trans_active_lock_idx
  ON submission_transmittals (organization_id, package_id, bundle_sha256)
  WHERE status IN ('pending', 'in_transit', 'received');

COMMENT ON INDEX sub_trans_active_lock_idx IS
  'Per-package transmit lock: at most one active (pending|in_transit|received) '
  'transmittal per (organization_id, package_id, bundle_sha256). Terminal '
  'states (rejected, rolled_back, completed) are excluded so a rolled-back '
  'package can be re-transmitted intentionally.';
