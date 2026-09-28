/**
 * The governed-action ledger as `recordGovernedAction` (server/routes/c2c/actions.ts)
 * writes it, for PGlite tests: `audit_logs` with the columns that function inserts
 * beyond AUDIT_LOGS_PGLITE_DDL, and `c2c_ana_actions`. Apply AFTER
 * AUDIT_LOGS_PGLITE_DDL. Only the columns the writer touches; no chain_seq, so
 * under vitest the chain writer uses its pre-fix order (it says so, once).
 *
 * Test-only DDL lives under __tests__/, not in server/db/pglite-harness.ts, which
 * ci:runtime-ddl counts as server code.
 */
export const GOVERNED_ACTION_LEDGER_PGLITE_DDL = `
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ana_action_id TEXT;
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, conversation_id TEXT,
  domain TEXT NOT NULL, surface TEXT NOT NULL, command TEXT NOT NULL, target TEXT NOT NULL,
  risk TEXT NOT NULL DEFAULT 'low', payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode TEXT NOT NULL DEFAULT 'suggest', state TEXT NOT NULL DEFAULT 'proposed',
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(), proposed_by INTEGER NOT NULL,
  decided_at TIMESTAMPTZ, decided_by INTEGER, decision_reason TEXT, executed_at TIMESTAMPTZ,
  audit_row_id TEXT, idempotency_key TEXT
);
`;
