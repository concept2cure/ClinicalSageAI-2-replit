/**
 * D6 — SINGLE E-SIGNATURE WRITE PATH, proven against a real (PGlite) Postgres.
 *
 * The governed sign action (/api/c2c/actions/sign → writeMutation('sign')) must
 * persist a 21 CFR Part 11 electronic_signatures row in the SAME transaction as
 * its sha256-chained ledger pair (audit_logs + c2c_ana_actions). Before D6 it
 * wrote only the ledger — a Part 11 inspector querying electronic_signatures
 * missed every governed sign (Submission Center freeze/dispatch, authoring).
 *
 * This suite applies the REAL migration under test
 * (migrations/20260813d_esignature_governed_unification.sql) on top of the
 * pre-D6 electronic_signatures shape, then drives the REAL writeMutation
 * (db.js pool mocked onto PGlite) and asserts:
 *   - sign → ledger pair + electronic_signatures row, all committed together;
 *   - binding honesty: derivable target (ectd-sequence) gets a real content
 *     digest + basis; non-derivable target gets the audit chain hash with the
 *     explicit governed-action-ledger basis — never a fabricated content hash;
 *   - §11.200 attribution hash re-derives from the persisted manifest bytes;
 *   - ATOMICITY / FAIL CLOSED: when the signature row cannot be written the
 *     whole governed sign rolls back (no ledger row without a signature row);
 *   - non-sign commands write no signature row (regression);
 *   - the migration's anchor CHECK refuses anchorless signature rows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ── db.js → PGlite (writeMutation manages its own pool transactions) ─────────

const holder = vi.hoisted(() => ({
  query: async (_sql: string, _params?: unknown[]): Promise<{ rows: any[] }> => {
    throw new Error('PGlite not initialised yet');
  },
}));

vi.mock('../../../db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => holder.query(sql, params),
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => holder.query(sql, params),
      release: () => {},
    }),
  },
}));
vi.mock('../../../services/mfaService.js', () => ({ verifyToken: vi.fn() }));

import { writeMutation, recordGovernedAction } from '../actions.js';
import { deriveGovernedTargetBinding, BINDING_BASIS } from '../../../services/part11/signature-persistence.js';

// The REAL D6 migration under test — revert it and this suite fails.
const D6_MIGRATION = fs.readFileSync(
  path.join(__dirname, '../../../../migrations/20260813d_esignature_governed_unification.sql'),
  'utf8',
);

// audit_logs + c2c_ana_actions — post-vocab governed shapes (as in the sibling
// governed-action PGlite suite).
const AUDIT_LOGS_DDL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, action TEXT,
  table_name TEXT, record_id TEXT, actor_id INTEGER, target TEXT,
  target_type TEXT, target_id TEXT, reason TEXT, payload_hash TEXT,
  ana_action_id TEXT, sha256_chain TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), hmac_seal TEXT,
  old_values   JSON,
  new_values   JSON,
  ip_address   TEXT,
  user_agent   TEXT
);`;

const ANA_ACTIONS_DDL = `
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, conversation_id TEXT,
  domain TEXT NOT NULL, surface TEXT NOT NULL, command TEXT NOT NULL,
  target TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'low',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode TEXT NOT NULL DEFAULT 'suggest', state TEXT NOT NULL DEFAULT 'proposed',
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(), proposed_by INTEGER NOT NULL,
  decided_at TIMESTAMPTZ, decided_by INTEGER, decision_reason TEXT,
  executed_at TIMESTAMPTZ, audit_row_id UUID, idempotency_key TEXT UNIQUE
);`;

// electronic_signatures EXACTLY as the pre-D6 physical shape: the 0000 base
// migration columns (document_id/version_id NOT NULL) plus the 20260629
// release-gate columns. FKs omitted (their referents are out of scope here);
// the D6 migration is then applied on top, so the suite proves the REAL
// ALTERs (DROP NOT NULL, signed_target, binding_basis, anchor CHECK).
const ELECTRONIC_SIGNATURES_PRE_D6_DDL = `
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
);`;

const USERS_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY, email text NOT NULL, name text NOT NULL,
  password_hash text, title text
);`;

// organization_users as in the 0000 base migration (FKs omitted — referents out
// of scope). The §11.50 signer lookup joins users through this authorization
// relation, so the printed name resolves ONLY for a member of the signing org.
const ORGANIZATION_USERS_DDL = `
CREATE TABLE IF NOT EXISTS organization_users (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL,
  user_id integer NOT NULL,
  role text DEFAULT 'member' NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT unique_user_org UNIQUE (user_id, organization_id)
);`;

// Governed-target content tables for the derivable-binding case.
const ECTD_DDL = `
CREATE TABLE IF NOT EXISTS ectd_sequences (
  id serial PRIMARY KEY, submission_id integer NOT NULL, region text NOT NULL,
  sequence_number text NOT NULL, type text NOT NULL DEFAULT 'original',
  status text NOT NULL DEFAULT 'draft', organization_id integer NOT NULL,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS submission_leaves (
  id serial PRIMARY KEY, sequence_id integer NOT NULL, section_code text NOT NULL,
  lifecycle_op text NOT NULL DEFAULT 'new', document_table text, document_id integer,
  checksum text, title text NOT NULL, organization_id integer NOT NULL,
  deleted_at timestamptz
);`;

let pg: PGlite;
const ORG = 7;
const SIGNER = 42;

const signEnvelope = (target: string, over: Record<string, unknown> = {}) => ({
  target,
  reason: 'Freeze sequence for FDA dispatch (reviewed and approved)',
  payload: { intent: 'freeze', meaning: 'approval' },
  reauth: { password: 'pw', totp: '123456' },
  ...over,
});

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_DDL);
  await pg.exec(ANA_ACTIONS_DDL);
  await pg.exec(ELECTRONIC_SIGNATURES_PRE_D6_DDL);
  await pg.exec(USERS_DDL);
  await pg.exec(ORGANIZATION_USERS_DDL);
  await pg.exec(ECTD_DDL);
  await pg.exec(D6_MIGRATION); // the REAL migration under test
  await pg.query(
    `INSERT INTO users (id, email, name, title) VALUES ($1, $2, $3, $4)`,
    [SIGNER, 'qa.lead@acme.test', 'Quinn A. Lead', 'Director, Regulatory QA'],
  );
  // Membership in the signing org — without it the signer lookup resolves
  // nobody and every legitimate sign would (correctly) refuse.
  await pg.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')`,
    [ORG, SIGNER],
  );
  holder.query = (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }>;
});
afterEach(async () => {
  await pg.close();
});

const client = () => ({
  query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }>,
});

/** json column value → object (drivers may hand back text or parsed object). */
const asManifest = (v: unknown): any => (typeof v === 'string' ? JSON.parse(v) : v);
/** json column value → the exact persisted bytes (compact JSON round-trips). */
const manifestBytes = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

describe('governed sign → electronic_signatures (single write path)', () => {
  it('persists the ledger pair AND the Part 11 signature row, committed together', async () => {
    const r = await writeMutation('sign', signEnvelope('program:prog_1') as any, SIGNER, ORG);
    expect(r.state).toBe('executed');

    const action = (await pg.query(`SELECT * FROM c2c_ana_actions WHERE id = $1`, [r.actionId])).rows[0] as any;
    const audit = (await pg.query(`SELECT * FROM audit_logs WHERE id = $1`, [r.auditId])).rows[0] as any;
    const sigs = (await pg.query(`SELECT * FROM electronic_signatures`)).rows as any[];

    expect(action).toBeTruthy();
    expect(audit).toBeTruthy();
    expect(sigs).toHaveLength(1);
    const sig = sigs[0];

    // Anchored to the governed target (documents anchor absent, allowed post-D6).
    expect(sig.signed_target).toBe('program:prog_1');
    expect(sig.document_id).toBeNull();
    expect(sig.version_id).toBeNull();
    expect(sig.organization_id).toBe(ORG);

    // §11.50: printed name, meaning, reason — the signer's stored identity.
    expect(sig.signer_id).toBe(SIGNER);
    expect(sig.signer_name).toBe('Quinn A. Lead');
    expect(sig.signer_email).toBe('qa.lead@acme.test');
    expect(sig.signer_title).toBe('Director, Regulatory QA');
    expect(sig.signature_meaning).toBe('approval');
    expect(sig.signature_purpose).toBe('Freeze sequence for FDA dispatch (reviewed and approved)');
    expect(sig.signature_type).toBe('governed-action');

    // §11.200 factors as actually verified for this envelope.
    expect(sig.authentication_method).toBe('password+totp');
    expect(sig.second_factor_verified).toBe(true);

    // Manifest cross-links the ledger row both ways.
    const manifest = asManifest(sig.signature_manifest);
    expect(manifest.actionId).toBe(r.actionId);
    expect(manifest.auditId).toBe(r.auditId);
    expect(manifest.auditSha256Chain).toBe(r.sha256Chain);
  });

  it('non-derivable target: binds the audit chain hash under the EXPLICIT ledger basis (no fabricated content hash)', async () => {
    const r = await writeMutation('sign', signEnvelope('program:prog_9') as any, SIGNER, ORG);
    const sig = (await pg.query(`SELECT * FROM electronic_signatures`)).rows[0] as any;

    expect(sig.binding_basis).toBe(BINDING_BASIS.GOVERNED_ACTION_LEDGER);
    expect(sig.bound_payload_digest).toBe(r.sha256Chain); // the action hash, stated as such
    expect(asManifest(sig.signature_manifest).bindingNote).toMatch(/not a content hash/i);
  });

  it('derivable target (ectd-sequence): binds a REAL content digest of the leaf manifest', async () => {
    await pg.query(
      `INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, type, status, organization_id)
       VALUES (21, 5, 'fda', '0000', 'original', 'validated', $1)`,
      [ORG],
    );
    await pg.query(
      `INSERT INTO submission_leaves (sequence_id, section_code, lifecycle_op, document_table, document_id, checksum, title, organization_id)
       VALUES (21, 'm2.5', 'new', 'unified_documents', 900, 'abc123', 'Clinical Overview', $1),
              (21, 'm1.us.cover', 'new', NULL, NULL, 'def456', 'Cover Letter', $1)`,
      [ORG],
    );

    const r = await writeMutation('sign', signEnvelope('ectd-sequence:21') as any, SIGNER, ORG);
    const sig = (await pg.query(`SELECT * FROM electronic_signatures`)).rows[0] as any;

    expect(sig.binding_basis).toBe(BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST);
    expect(sig.bound_payload_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(sig.bound_payload_digest).not.toBe(r.sha256Chain);

    // Deterministic: re-deriving over the same persisted content reproduces it.
    const rederived = await deriveGovernedTargetBinding(client(), 'ectd-sequence:21', ORG);
    expect(rederived.basis).toBe(BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST);
    expect(rederived.digest).toBe(sig.bound_payload_digest);

    // …and content tamper changes it (the §11.70 point of the binding).
    await pg.query(`UPDATE submission_leaves SET checksum = 'TAMPERED' WHERE section_code = 'm2.5'`);
    const after = await deriveGovernedTargetBinding(client(), 'ectd-sequence:21', ORG);
    expect(after.digest).not.toBe(sig.bound_payload_digest);
  });

  it('§11.200 attribution hash re-derives from the persisted manifest bytes', async () => {
    await writeMutation('sign', signEnvelope('program:prog_2') as any, SIGNER, ORG);
    const sig = (await pg.query(`SELECT * FROM electronic_signatures`)).rows[0] as any;
    const rederived = createHash('sha256')
      .update(manifestBytes(sig.signature_manifest))
      .digest('hex');
    expect(rederived).toBe(sig.signature_hash);
  });

  it('ATOMIC / FAIL CLOSED: when the signature row cannot be written, the ledger writes roll back too', async () => {
    // Force the electronic_signatures INSERT to fail (simulates any persistence
    // failure of the signature substrate).
    await pg.exec(`DROP TABLE electronic_signatures`);

    await expect(
      writeMutation('sign', signEnvelope('program:prog_3') as any, SIGNER, ORG),
    ).rejects.toThrow();

    const actions = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    const audits = (await pg.query(`SELECT count(*)::int AS n FROM audit_logs`)).rows[0] as { n: number };
    expect(actions.n).toBe(0); // no ledger sign without a Part 11 signature row
    expect(audits.n).toBe(0);
  });

  it('FAIL CLOSED: an unresolvable signer aborts the sign (no anonymous signatures)', async () => {
    // The user row still exists; only the organization_users membership in the
    // signing org is gone. The membership-scoped lookup then resolves nobody,
    // so the code's OWN §11.100 refusal fires — a genuine no-signer condition,
    // not a missing relation masquerading as one.
    await pg.query(
      `DELETE FROM organization_users WHERE user_id = $1 AND organization_id = $2`,
      [SIGNER, ORG],
    );
    await expect(
      writeMutation('sign', signEnvelope('program:prog_4') as any, SIGNER, ORG),
    ).rejects.toThrow(/signer/i);
    const actions = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    expect(actions.n).toBe(0);
  });

  it('non-sign governed commands do not write electronic_signatures (regression)', async () => {
    await writeMutation(
      'claim',
      { target: 'task:t1', reason: 'picking this work item up' } as any,
      SIGNER,
      ORG,
    );
    const sigs = (await pg.query(`SELECT count(*)::int AS n FROM electronic_signatures`)).rows[0] as { n: number };
    const actions = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    expect(actions.n).toBe(1);
    expect(sigs.n).toBe(0);
  });

  it('caller-owned transaction: sign writes ride the external client and roll back with it', async () => {
    await pg.exec('BEGIN');
    const ext = {
      query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }>,
      release: () => {},
    };
    await writeMutation('sign', signEnvelope('program:prog_5') as any, SIGNER, ORG, 'api', 'mdx', ext as any);
    await pg.exec('ROLLBACK');

    const sigs = (await pg.query(`SELECT count(*)::int AS n FROM electronic_signatures`)).rows[0] as { n: number };
    const actions = (await pg.query(`SELECT count(*)::int AS n FROM c2c_ana_actions`)).rows[0] as { n: number };
    expect(sigs.n).toBe(0);
    expect(actions.n).toBe(0);
  });

  it("the migration's anchor CHECK refuses an anchorless signature row", async () => {
    await expect(
      pg.query(
        `INSERT INTO electronic_signatures
           (signature_type, signature_purpose, signer_id, signer_name, signer_email,
            authentication_method, authentication_timestamp, signature_hash, signed_at, organization_id)
         VALUES ('approval', 'no anchor', 1, 'X', 'x@x.test', 'password', now(), 'h', now(), $1)`,
        [ORG],
      ),
    ).rejects.toThrow(/anchor|check/i);
  });

  it('recordGovernedAction alone stays ledger-only (domain callers unaffected)', async () => {
    await recordGovernedAction(client(), {
      orgId: ORG,
      userId: SIGNER,
      command: 'sign',
      target: 'batch:b1',
      reason: 'batch release governs its own ledger',
    });
    const sigs = (await pg.query(`SELECT count(*)::int AS n FROM electronic_signatures`)).rows[0] as { n: number };
    expect(sigs.n).toBe(0);
  });
});
