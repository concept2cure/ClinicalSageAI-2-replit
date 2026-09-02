-- ════════════════════════════════════════════════════════════════════════════
-- ind_icsr_transmissions.transport_receipt_id — the gateway receipt that alone
-- justifies status = 'transmitted'.
--
-- THE GAP (finding LIFE-03). POST /icsr-transmissions/:txId/transmit flipped a
-- prepared ICSR to 'transmitted' through a state-only helper. No byte reached a
-- gateway, and nothing on the row could show whether one had — a sponsor read
-- "transmitted" on a 15-day IND safety report that never left the box.
--
-- THE CHANGE. One additive, nullable column: the transport-layer receipt id the
-- gateway returned. NULL is the truthful state for every existing row (none has
-- a receipt, because nothing was sent) and for every row still 'prepared'. The
-- service writes it in the same UPDATE that sets status = 'transmitted', and
-- only from a real, non-simulated receipt — so a transmitted row without a
-- receipt id cannot be produced going forward.
--
-- WHAT THIS DOES NOT DO. It does not touch existing 'transmitted' rows. Nothing
-- records whether any of them reached an agency; rewriting their status would
-- be a guess in either direction. They keep their status and a NULL receipt id
-- that says exactly that.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, guarded on the table existing (a fresh
-- install gets the column from drizzle-kit push via shared/schema).
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
BEGIN
  IF to_regclass('public.ind_icsr_transmissions') IS NULL THEN
    RAISE NOTICE 'ind_icsr_transmissions absent — transport_receipt_id skipped (drizzle push creates the table with it)';
    RETURN;
  END IF;

  ALTER TABLE ind_icsr_transmissions
    ADD COLUMN IF NOT EXISTS transport_receipt_id TEXT;
END
$do$;
