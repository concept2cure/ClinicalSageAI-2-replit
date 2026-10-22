-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Bind each in-flight sequence claim to its verified transmit signature and unique attempt.
--
-- eCTD/CTD Context:
--   - Module(s): Electronic submission sequence dispatch and signed transport receipts across CTD modules.
--   - Integrity Risk Addressed: A late receipt resolving a newer dispatch claim or an inferred historical signature association.
--
-- Determinism Contract:
--   - Keep legacy bindings nullable; reconcile receipts against the exact server-verified signature and attempt.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- 2026-10-14 audit remediation X01/D7: bind a sequence's in-flight claim to
-- its verified transmit signature. A late MDN from an older send must not
-- resolve a newer claim. Nullable for legacy rows; never infer a binding.
ALTER TABLE public.ectd_sequences
  ADD COLUMN IF NOT EXISTS transmit_signature_action_id TEXT,
  ADD COLUMN IF NOT EXISTS transmit_attempt_id UUID;

COMMENT ON COLUMN public.ectd_sequences.transmit_signature_action_id IS
  'Server-verified transmit signature claiming this exact attempt; later signed receipts must match it before resolving sequence state.';

COMMENT ON COLUMN public.ectd_sequences.transmit_attempt_id IS
  'Fresh server-generated UUID for each claimed transport attempt; prevents an older signed receipt resolving a newer claim even if its signature action ID was reused.';
