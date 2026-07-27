-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Bundle execution receipts (ADR-0009, conflict C-4)
-- Date: 2026-07-25
--
-- WHY THIS EXISTS
-- The resolution bundle executor is the platform's "detect, decide, execute,
-- prove" differentiator — but the proof half was unverifiable. The receipt was
-- returned in-memory and stored only as pretty-printed JSON in the MUTABLE
-- resolution_bundles.resolution_memo text column: overwritable by any later
-- update, carrying no integrity hash, and not independently queryable. Master
-- WO-03 explicitly forbids treating a status field as proof; verification must
-- resolve linked objects and hashes.
--
-- This table is the append-only, hashed receipt store. Rows are written by
-- server/services/resolution/receipt-store.ts at execution time and verified by
-- verifyBundleExecutionReceipt(), which recomputes hashes and re-resolves the
-- asserted object states — it never trusts a status field.
--
-- Receipts are audit evidence: rows are never updated or deleted on a normal
-- retention schedule.
--
-- ROLLBACK: the table is new and starts empty.
--   DROP TABLE IF EXISTS bundle_execution_receipts;
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bundle_execution_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),

  bundle_id UUID NOT NULL,
  plan_id UUID,
  decision_id UUID,

  -- The full receipt body as built by the executor (canonical JSON; the hash
  -- below is computed over the key-sorted serialization of exactly this value).
  receipt_body JSONB NOT NULL,

  -- Snapshot of the durable object states the receipt asserts, captured at
  -- persist time (artifact statuses/versions, supersession rows). Verification
  -- re-resolves live state and compares against this, detecting post-hoc
  -- tampering with either the receipt or the objects.
  object_state_snapshot JSONB NOT NULL,

  -- Integrity
  receipt_hash TEXT NOT NULL,       -- sha256 over canonical receipt_body
  object_state_hash TEXT NOT NULL,  -- sha256 over canonical object_state_snapshot

  executed_by INTEGER NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bundle_execution_receipts_org_project_idx
  ON bundle_execution_receipts (organization_id, project_id);
CREATE INDEX IF NOT EXISTS bundle_execution_receipts_bundle_idx
  ON bundle_execution_receipts (bundle_id);
