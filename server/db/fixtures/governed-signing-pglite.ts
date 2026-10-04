/**
 * Governed-signing tables for PGlite suites (VR-12, 2026-09-29).
 *
 * A fixture, not runtime code: imported by server/db/pglite-harness.ts
 * (createIndPgliteDb({ governedSigning: true })) and by tests only. It lives
 * under fixtures/ so the runtime-DDL gate (scripts/ci/check-runtime-ddl.mjs)
 * does not count it against the harness, whose baseline only shrinks.
 *
 * @module server/db/fixtures/governed-signing-pglite
 */
import { readFileSync } from 'node:fs';
import { AUDIT_LOGS_PGLITE_DDL } from '../pglite-harness';

/* Applied from disk, not copied: the per-tenant chain order key; the D6
   signature columns (signed_target, binding_basis, the anchor CHECK) on top of
   the pre-D6 electronic_signatures copy below; the §11.70 append-only trigger. */
const AUDIT_CHAIN_SEQ = new URL('../../../migrations/20260921_audit_logs_chain_seq.sql', import.meta.url);
const ESIGN_GOVERNED_UNIFICATION = new URL(
  '../../../migrations/20260813d_esignature_governed_unification.sql',
  import.meta.url,
);
const ESIGN_IMMUTABILITY = new URL('../../../db/migrations/20260730_esign_audit_db_level_immutability.sql', import.meta.url);

/**
 * The tables a lifecycle signature writes (VR-12), so a suite signs through the
 * platform's real writers rather than a stand-in:
 *   - c2c_ana_actions, the governed-action ledger recordGovernedAction pairs
 *     with its chained audit_logs row (AUDIT_LOGS_PGLITE_DDL, applied with it);
 *   - electronic_signatures as the 0000 base and 20260629 columns leave it. The
 *     REAL D6 migration and the REAL §11.70 append-only trigger are applied on
 *     top, from disk (applyGovernedSigning);
 *   - users and organization_users, the §11.50 printed-name lookup
 *     (resolveSignerIdentity joins them, so only a member of the org can sign).
 * FKs are omitted; their referents are out of scope.
 */
export const GOVERNED_SIGNING_PGLITE_DDL = `
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, conversation_id TEXT,
  domain TEXT NOT NULL, surface TEXT NOT NULL, command TEXT NOT NULL,
  target TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'low',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode TEXT NOT NULL DEFAULT 'suggest', state TEXT NOT NULL DEFAULT 'proposed',
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(), proposed_by INTEGER NOT NULL,
  decided_at TIMESTAMPTZ, decided_by INTEGER, decision_reason TEXT,
  executed_at TIMESTAMPTZ, audit_row_id UUID, idempotency_key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS electronic_signatures (
  id serial PRIMARY KEY,
  document_id integer NOT NULL,
  version_id integer NOT NULL,
  signature_type varchar(50) NOT NULL,
  signature_purpose text NOT NULL,
  signature_level integer DEFAULT 1,
  signer_id integer NOT NULL,
  signer_name text NOT NULL,
  signer_title text,
  signer_email text NOT NULL,
  authentication_method varchar(50) NOT NULL,
  authentication_timestamp timestamp NOT NULL,
  second_factor_verified boolean DEFAULT false,
  signature_hash varchar(256) NOT NULL,
  signature_meaning text,
  signature_manifest json,
  is_valid boolean DEFAULT true,
  verification_status varchar(50),
  verification_date timestamp,
  compliance_statement text,
  legal_disclaimer text,
  ip_address varchar(45),
  device_info json,
  signed_at timestamp DEFAULT now() NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now(),
  organization_id integer,
  bound_payload_digest text NOT NULL DEFAULT '',
  superseded_by integer
);

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, email text NOT NULL, name text NOT NULL,
  password_hash text, title text
);

CREATE TABLE IF NOT EXISTS organization_users (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL,
  user_id integer NOT NULL,
  role text DEFAULT 'member' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT unique_user_org UNIQUE (user_id, organization_id)
);
`;

/** Create the tables and apply the three migrations, in order. */
export async function applyGovernedSigning(pglite: { exec: (sql: string) => Promise<unknown> }): Promise<void> {
  await pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await pglite.exec(readFileSync(AUDIT_CHAIN_SEQ, 'utf8'));
  await pglite.exec(GOVERNED_SIGNING_PGLITE_DDL);
  await pglite.exec(readFileSync(ESIGN_GOVERNED_UNIFICATION, 'utf8'));
  await pglite.exec(readFileSync(ESIGN_IMMUTABILITY, 'utf8'));
}
