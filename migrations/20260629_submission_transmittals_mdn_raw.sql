-- 20260629_submission_transmittals_mdn_raw.sql
--
-- FDA ESG production UAT — §11 hardening (FIX 2).
--
-- Persist the raw MDN body alongside the message-id on submission_transmittals.
-- Today the AS2 transmit path retains the MDN message-id only (fda-esg.ts:399-420)
-- and downloadAcknowledgment synthesises an ack-text summary (fda-esg.ts:466-490).
-- For a 21 CFR Part 11 §11.10(e) audit trail the auditor needs to see what the
-- agency actually returned — not a kit-side reconstruction. This column holds
-- the raw MDN response body verbatim. Nullable so pre-fix rows (which never
-- captured the body) keep validating; the gateway falls back to synthesised
-- text on those rows.

ALTER TABLE submission_transmittals
  ADD COLUMN IF NOT EXISTS mdn_raw text;

COMMENT ON COLUMN submission_transmittals.mdn_raw IS
  'Raw MDN response body from the FDA ESG AS2 endpoint. NULL for transmittals '
  'predating this column or for non-AS2 transports (SFTP has no MDN). '
  'Used by downloadAcknowledgment to return the verbatim agency response.';
