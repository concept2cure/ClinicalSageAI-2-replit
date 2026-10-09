/**
 * P11-28b end to end on a real (PGlite) Postgres with the real migrations: the
 * COMPOSITE resolver (orchestrator spine first, then the sequence's own) and the
 * three step verdicts, for a never-signed NDA sequence.
 *
 * The unit suites prove the rule with the spines mocked. This proves the rule
 * holds where the verdict actually comes from: that on the real schema, with
 * the real orchestrator store present and empty, the resolver says the
 * SEQUENCE decided — so the Dispatch button is offered — and that the
 * signature the Dispatch click records is the one that then clears the
 * dispatch gate. If the orchestrator lookup failed on a real column or cast it
 * would read `undetermined`, report `decidedBy: 'orchestrator'`, and the button
 * would stay hidden: the defect, silently back.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'node:fs';
import path from 'node:path';

const holder = vi.hoisted(() => ({
  db: null as unknown as { execute: (q: unknown) => Promise<unknown> },
  query: async (_sql: string, _params?: unknown[]): Promise<{ rows: any[] }> => {
    throw new Error('PGlite not initialised yet');
  },
}));

vi.mock('../../../db.js', () => ({
  get db() {
    return holder.db;
  },
  pool: { query: (sql: string, params?: unknown[]) => holder.query(sql, params) },
}));

import { deriveGovernedTargetBinding, BINDING_BASIS } from '../../part11/signature-persistence';
import { resolveReleaseSignatureStatus, signingNowResolvesRelease } from '../release-signature-status';
import { composeStepVerdicts } from '../assess-dispatch-readiness';

const ORG = 42;
const OTHER_ORG = 99;
const USER = 7;

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

/** electronic_signatures as the 0000 base + 20260629 release-gate columns leave
 *  it, i.e. the physical shape the D6 migration below is applied on top of. */
const ELECTRONIC_SIGNATURES_PRE_D6_DDL = `
CREATE TABLE IF NOT EXISTS electronic_signatures (
  id serial PRIMARY KEY,
  document_id integer NOT NULL,
  version_id integer NOT NULL,
  signature_type varchar(50) NOT NULL,
  signature_purpose text NOT NULL,
  signer_id integer NOT NULL,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  authentication_method varchar(50) NOT NULL,
  authentication_timestamp timestamp NOT NULL,
  signature_hash varchar(256) NOT NULL,
  signature_manifest json,
  is_valid boolean DEFAULT true,
  verification_status varchar(50),
  signed_at timestamp DEFAULT now() NOT NULL,
  organization_id integer,
  bound_payload_digest text NOT NULL DEFAULT '',
  superseded_by integer
);`;

const ANA_ACTIONS_DDL = `
CREATE TABLE IF NOT EXISTS c2c_ana_actions (
  id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, conversation_id TEXT,
  domain TEXT NOT NULL, surface TEXT NOT NULL, command TEXT NOT NULL,
  target TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'low',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode TEXT NOT NULL DEFAULT 'suggest', state TEXT NOT NULL DEFAULT 'proposed',
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(), proposed_by INTEGER NOT NULL
);`;

let pglite: PGlite;

async function q<R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[] }> {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as R[] };
}

/** A sequence with `leafCount` leaves, and the submission it belongs to. */
async function makeSequence(orgId: number, sequenceNumber: string, leafCount: number): Promise<number> {
  const sub = await q<{ id: number }>(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('S','nda','pharma','fda',$1,$2) RETURNING id`,
    [orgId, USER],
  );
  const seq = await q<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by)
     VALUES ($1,'fda',$2,$3,$4) RETURNING id`,
    [sub.rows[0].id, sequenceNumber, orgId, USER],
  );
  const sequenceId = seq.rows[0].id;
  for (let i = 0; i < leafCount; i++) {
    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, checksum, organization_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [sequenceId, `2.${i}`, `Leaf ${i}`, `sum-${i}`, orgId, USER],
    );
  }
  return sequenceId;
}

/** The digest the SIGNER would have bound, computed by the real derivation. */
async function currentDigest(sequenceId: number, orgId: number): Promise<string> {
  const binding = await deriveGovernedTargetBinding({ query: q }, `ectd-sequence:${sequenceId}`, orgId);
  expect(binding.basis).toBe(BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST);
  expect(binding.digest).toBeTruthy();
  return binding.digest as string;
}

/** An executed governed sign action + its electronic_signatures row. */
async function sign(
  sequenceId: number,
  orgId: number,
  opts: { intent?: string; digest?: string; basis?: string; state?: string; revoked?: boolean } = {},
): Promise<number> {
  const target = `ectd-sequence:${sequenceId}`;
  const actionId = `act_${sequenceId}_${opts.intent ?? 'dispatch'}_${Math.floor(performance.now() * 1000)}`;
  await q(
    `INSERT INTO c2c_ana_actions (id, org_id, domain, surface, command, target, payload, state, proposed_by)
     VALUES ($1,$2,'biopharma','submissions','sign',$3,$4::jsonb,$5,$6)`,
    [
      actionId,
      orgId,
      target,
      JSON.stringify({ intent: opts.intent ?? 'dispatch', meaning: 'I approve this release.' }),
      opts.state ?? 'executed',
      USER,
    ],
  );
  const digest = opts.digest ?? (await currentDigest(sequenceId, orgId));
  const row = await q<{ id: number }>(
    `INSERT INTO electronic_signatures (
       document_id, version_id, signature_type, signature_purpose, signer_id, signer_name,
       signer_email, authentication_method, authentication_timestamp, signature_hash,
       signature_manifest, organization_id, signed_target, binding_basis, bound_payload_digest,
       verification_status, superseded_by
     ) VALUES (NULL, NULL, 'governed-action', 'release', $1, 'A Signer',
       'signer@example.test', 'password', now(), 'hash',
       $2::json, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      USER,
      JSON.stringify({ actionId, target }),
      orgId,
      target,
      opts.basis ?? BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST,
      digest,
      opts.revoked ? 'revoked' : null,
      null,
    ],
  );
  return row.rows[0].id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER_ORG},'b');`);
  await pglite.exec(`INSERT INTO users (id, email, name) VALUES (${USER},'s@e.test','A Signer');`);
  // The REAL sequence/leaf tables the binding is derived from.
  await pglite.exec(migration('migrations/20260604_submission_core_canonical.sql'));
  // The later leaf columns the binding digests (2026-09-22, W5/D7): the content
  // pin and the uuid half of the document pointer. Both are on the applier.
  await pglite.exec(migration('migrations/20260814e_submission_leaf_source_pin.sql'));
  await pglite.exec(migration('migrations/20260917b_submission_leaf_document_uuid.sql'));
  await pglite.exec(ANA_ACTIONS_DDL);
  await pglite.exec(ELECTRONIC_SIGNATURES_PRE_D6_DDL);
  // The REAL migration that adds signed_target / binding_basis.
  await pglite.exec(migration('migrations/20260813d_esignature_governed_unification.sql'));
  // The REAL orchestrator store, present and empty — so the orchestrator spine
  // answers `unsigned` from a query that ran, not `undetermined` from one that
  // could not.
  await pglite.exec(migration('db/migrations/20260725_submission_orchestrator_store_port.sql'));

  holder.query = q;
  holder.db = drizzle(pglite) as unknown as { execute: (sqlQuery: unknown) => Promise<unknown> };
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

const CLEAR = { cleared: true, blockers: [] as string[] };

async function statusOf(sequenceId: number) {
  const sub = await q<{ submission_id: number }>(`SELECT submission_id FROM ectd_sequences WHERE id = $1`, [sequenceId]);
  return resolveReleaseSignatureStatus({
    submissionId: sub.rows[0].submission_id,
    organizationId: ORG,
    sequenceNumber: '0000',
    sequenceId,
    region: 'fda',
  });
}

/** The three verdicts for an otherwise-clear sequence, from the real status. */
async function verdictsOf(sequenceId: number) {
  const status = await statusOf(sequenceId);
  const v = composeStepVerdicts(
    {
      structural: CLEAR,
      external: CLEAR,
      shadowPresence: CLEAR,
      releaseSignature: { required: true, verdict: status.verdict, detail: status.detail },
    },
    status,
  );
  return { status, ...v };
}

describe('P11-28b on the real schema: the Dispatch click supplies the release it is gated on', () => {
  it('a never-signed NDA: the sequence decides, dispatch-on-signing is open, dispatch-now is not', async () => {
    const sequenceId = await makeSequence(ORG, '0000', 3);
    const { status, gate, freezeGate, dispatchGateOnSigning } = await verdictsOf(sequenceId);

    expect(status.verdict, String(status.detail)).toBe('unsigned');
    expect(status.decidedBy, 'the orchestrator lookup did not run cleanly on the real store').toBe('sequence');
    expect(signingNowResolvesRelease(status)).toBe(true);
    expect(gate.cleared, 'dispatch-now must still require the signature').toBe(false);
    expect(freezeGate.cleared).toBe(true);
    expect(dispatchGateOnSigning.cleared, 'the Dispatch button would stay hidden').toBe(true);
  });

  it('the dispatch signature the click records is the release: dispatch-now clears once it is on record', async () => {
    const sequenceId = await makeSequence(ORG, '0000', 2);
    await sign(sequenceId, ORG, { intent: 'dispatch' });

    const { status, gate } = await verdictsOf(sequenceId);
    expect(status.verdict, String(status.detail)).toBe('signed');
    expect(status.decidedBy).toBe('sequence');
    expect(gate.cleared, 'the signature offered by the button did not satisfy the gate it was offered for').toBe(true);
  });

  it('a FREEZE signature is not the release: dispatch-on-signing stays the only way through', async () => {
    const sequenceId = await makeSequence(ORG, '0000', 2);
    await sign(sequenceId, ORG, { intent: 'freeze' });

    const { status, gate, dispatchGateOnSigning } = await verdictsOf(sequenceId);
    expect(status.verdict).toBe('unsigned');
    expect(gate.cleared).toBe(false);
    expect(dispatchGateOnSigning.cleared).toBe(true);
  });

  it('content changed after the dispatch signature: invalid, and nothing is offered over it', async () => {
    const sequenceId = await makeSequence(ORG, '0000', 2);
    await sign(sequenceId, ORG, { intent: 'dispatch' });
    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, checksum, organization_id, created_by)
       VALUES ($1,'3.9','Added after signing','sum-x',$2,$3)`,
      [sequenceId, ORG, USER],
    );

    const { status, gate, freezeGate, dispatchGateOnSigning } = await verdictsOf(sequenceId);
    expect(status.verdict).toBe('invalid');
    expect(signingNowResolvesRelease(status)).toBe(false);
    expect(gate.cleared).toBe(false);
    expect(freezeGate.cleared).toBe(false);
    expect(dispatchGateOnSigning.cleared, 'a fresh signature was offered over tamper evidence').toBe(false);
  });
});
