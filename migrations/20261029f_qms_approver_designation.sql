-- =============================================================================
-- 20261029f — QMS approver designation on the organization membership
-- =============================================================================
-- Launch row D2, slice RR4 of docs/design/REVIEW_ROUTING_2026-10-23.md
-- (decision D-Q, §7.8; NEW-4, §4). Evidence
-- docs/evidence/D2-REVIEW-ROUTING/2026-10-29-RR4/.
--
-- A QMS controlled document is approved by a member the organization has
-- designated as a QMS approver (21 CFR 211.22(c), 21 CFR 820.40, ISO 13485
-- §4.2.4). D-Q decided that this is a per-organization designation held as
-- membership data, not a new org role. So it lives on the membership row,
-- organization_users, as two nullable columns:
--
--   qms_approver_designated_at   when an administrator designated the member
--   qms_approver_designated_by   which administrator did
--
-- Both are set together and cleared together (the named CHECK below). The
-- reason, and every designation and removal, is the governed ledger pair
-- (`qms-approver.designate` / `qms-approver.remove` on
-- `organization-member:<userId>`, recordGovernedAction), written on the same
-- transaction by server/services/qms/qms-approver-designation.ts, the one
-- writer of these columns. Removing a member removes the row, and with it the
-- designation; the ledger keeps the history.
--
-- Until an organization designates anyone, members holding the `approver` org
-- role stand in (D-Q). That rule is the reader's
-- (qms-approver-designation.ts), not this file's.
--
-- Rule 1 (CLAUDE.md): every statement here re-runs on every deploy. It is
-- additive and guarded: two ADD COLUMN IF NOT EXISTS and one named CHECK added
-- only when pg_constraint shows it absent. It drops nothing and creates no
-- table. organization_users is public with organization_id INTEGER NOT NULL
-- (base schema), so the sweep after it keeps its policy.
--
-- EVERY IF NOT EXISTS OBJECT HERE FREEZES ONCE DEPLOYED. A later change to a
-- column or the constraint is made by amending THIS file in place, with a
-- dated note and an explicit, conditional ALTER.
-- =============================================================================

ALTER TABLE public.organization_users ADD COLUMN IF NOT EXISTS qms_approver_designated_at timestamptz;
ALTER TABLE public.organization_users ADD COLUMN IF NOT EXISTS qms_approver_designated_by integer;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'organization_users_qms_approver_pair'
       AND conrelid = 'public.organization_users'::regclass
  ) THEN
    ALTER TABLE public.organization_users
      ADD CONSTRAINT organization_users_qms_approver_pair
      CHECK ((qms_approver_designated_at IS NULL) = (qms_approver_designated_by IS NULL));
  END IF;
END
$mig$;
