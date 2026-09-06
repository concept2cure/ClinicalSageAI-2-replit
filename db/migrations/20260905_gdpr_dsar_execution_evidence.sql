-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Record what was actually carried out to satisfy a data subject
--          request, so "completed" is evidence rather than an assertion.
--
-- eCTD/CTD Context:
--   - Module(s): not module-scoped; platform-wide privacy lifecycle records
--   - Integrity Risk Addressed: a request marked completed with nothing behind
--     it. completeDataSubjectRequest() set status='completed' plus free-text
--     response_details and performed no erasure, export or rectification. For
--     an erasure request that row is a claim under GDPR Art. 17 that personal
--     data is gone, and Art. 5(2) requires the controller to be able to
--     DEMONSTRATE it. Free text is not demonstrable: it cannot say which
--     scopes were searched, so "no data found" and "nothing was looked at"
--     are indistinguishable after the fact.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Additive only: one nullable JSONB column. Existing rows keep NULL, which
--     reads correctly as "completed without recorded evidence" rather than
--     being backfilled with a claim nobody made.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable. This
--     table is organization_id-keyed and inherits the policies already applied
--     to gdpr_data_subject_requests; no policy change is required here.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================

-- Structured record of the work performed to satisfy the request:
--   {
--     "action": "erased" | "exported" | "rectified" | "restricted"
--               | "decision_recorded",
--     "scopes": [ { "scope": "<table or system>", "rows": <integer> }, ... ],
--     "performedBy": "<operator or job identifier>",
--     "performedAt": "<ISO 8601 timestamp>"
--   }
--
-- `scopes` is the part that matters and is why this is not free text. A subject
-- who genuinely holds no data yields rows: 0 across the scopes that were
-- searched — which is a true and defensible outcome — whereas an empty scopes
-- list means nothing was searched at all. Those two are the same sentence in
-- prose and different facts in an inspection.
ALTER TABLE gdpr_data_subject_requests
  ADD COLUMN IF NOT EXISTS execution_evidence JSONB;

COMMENT ON COLUMN gdpr_data_subject_requests.execution_evidence IS
  'What was actually carried out to satisfy this request (action, scopes searched with row counts, operator, timestamp). NULL means the request was completed without recorded evidence.';
