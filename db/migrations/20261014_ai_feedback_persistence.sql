-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision the existing feedback store on the deploy path before application writes.
--
-- eCTD/CTD Context:
--   - Module(s): Cross-cutting AnA feedback associated with regulatory authoring workflows.
--   - Integrity Risk Addressed: False recorded acknowledgments when runtime DDL is denied and absent feedback traceability.
--
-- Determinism Contract:
--   - Retain historical nullable actors; new writes use verified active members and the final tenant sweeps.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- 2026-10-14 O01 continuation: deploy the existing /api/concept2cure/feedback
-- store. Previously its only creator was request-time DDL, which the production
-- runtime role cannot execute; the route swallowed that failure and returned
-- recorded:true. This is that same store and column contract, not a new model
-- training store or a native conversation/message binding.
--
-- Replay-safe and compatible with rows created by the former runtime CREATE.
-- Historical nullable actors/labels remain unchanged. New API writes require
-- a verified active member; no tenant, actor or historical content is invented.
-- The canonical tenant sweeps and runtime grants run after this migration.

CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id INTEGER,
  message_id TEXT NOT NULL,
  conversation_id TEXT,
  positive BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_feedback_org_created_idx
  ON public.ai_feedback (organization_id, created_at DESC);
