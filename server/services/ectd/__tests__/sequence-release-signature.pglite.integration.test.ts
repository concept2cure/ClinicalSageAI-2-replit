/**
 * The submissions spine's release signature — against a real (PGlite) Postgres,
 * with the real migrations.
 *
 * The unit suite next to this one mocks `db.execute` and asserts the query's
 * shape. That proves the RULES but not that the query runs: a wrong column
 * name, a bad cast, a json/jsonb mix-up would pass every one of those tests and
 * fail in production as a caught exception — which this resolver turns into
 * `undetermined`, a state that blocks quietly and looks like an outage rather
 * than a defect.
 *
 * So here the query executes against the actual tables its migrations create:
 *   • migrations/20260604_submission_core_canonical.sql — ectd_sequences,
 *     submission_leaves (what `deriveGovernedTargetBinding` digests);
 *   • migrations/20260813d_esignature_governed_unification.sql — signed_target,
 *     binding_basis, the anchor CHECK;
 * and the signature's digest is produced by the REAL
 * `deriveGovernedTargetBinding`, the same function the resolver re-derives
 * with. A drift between signer and verifier would show up here as a signature
 * that never verifies, which is exactly what it would do to a customer.
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
import { resolveSequenceReleaseSignature } from '../sequence-release-signature';

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
  await pglite.exec(ANA_ACTIONS_DDL);
  await pglite.exec(ELECTRONIC_SIGNATURES_PRE_D6_DDL);
  // The REAL migration that adds signed_target / binding_basis.
  await pglite.exec(migration('migrations/20260813d_esignature_governed_unification.sql'));

  holder.query = q;
  holder.db = drizzle(pglite) as unknown as { execute: (sqlQuery: unknown) => Promise<unknown> };
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

const resolve = (sequenceId: number, orgId: number = ORG) =>
  resolveSequenceReleaseSignature({ sequenceId, organizationId: orgId });

describe('against the real schema', () => {
  it('the query runs, and a dispatch-intent signature over the current leaves verifies', async () => {
    const sequenceId = await makeSequence(ORG, '0000', 3);
    const signatureId = await sign(sequenceId, ORG);

    const status = await resolve(sequenceId);
    expect(status.verdict).toBe('signed');
    expect(status.signatureId).toBe(signatureId);
  });

  it('a leaf added after signing drifts the manifest, and the signature stops verifying', async () => {
    const sequenceId = await makeSequence(ORG, '0001', 2);
    await sign(sequenceId, ORG);
    expect((await resolve(sequenceId)).verdict).toBe('signed');

    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, checksum, organization_id, created_by)
       VALUES ($1,'9.9','Late addition','sum-late',$2,$3)`,
      [sequenceId, ORG, USER],
    );

    const status = await resolve(sequenceId);
    expect(status.verdict, 'content added after signing still read as signed').toBe('invalid');
  });

  it('a FREEZE-intent signature does not release anything', async () => {
    const sequenceId = await makeSequence(ORG, '0002', 1);
    await sign(sequenceId, ORG, { intent: 'freeze' });
    expect((await resolve(sequenceId)).verdict).toBe('unsigned');
  });

  it('a sign action that never executed does not count', async () => {
    const sequenceId = await makeSequence(ORG, '0003', 1);
    await sign(sequenceId, ORG, { state: 'proposed' });
    expect((await resolve(sequenceId)).verdict).toBe('unsigned');
  });

  it('a ledger-basis signature binds no content, so it is not a release signature', async () => {
    const sequenceId = await makeSequence(ORG, '0004', 1);
    await sign(sequenceId, ORG, { basis: 'governed-action-ledger-sha256-chain', digest: 'chain-hash' });
    expect((await resolve(sequenceId)).verdict).toBe('unsigned');
  });

  it('a revoked signature is revoked, not signed', async () => {
    const sequenceId = await makeSequence(ORG, '0005', 1);
    await sign(sequenceId, ORG, { revoked: true });
    expect((await resolve(sequenceId)).verdict).toBe('revoked');
  });

  it('does not see another organization’s signature on its own sequence', async () => {
    // The signature is real and verifies — for the org that took it. Asking as a
    // different tenant must find nothing, not clear the gate.
    const sequenceId = await makeSequence(OTHER_ORG, '0000', 2);
    await sign(sequenceId, OTHER_ORG);
    expect((await resolve(sequenceId, OTHER_ORG)).verdict).toBe('signed');
    expect(
      (await resolve(sequenceId, ORG)).verdict,
      'a cross-tenant signature cleared this org’s gate',
    ).not.toBe('signed');
  });

  it('re-signing after a change verifies again — the newest signature decides', async () => {
    const sequenceId = await makeSequence(ORG, '0006', 1);
    await sign(sequenceId, ORG);
    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, checksum, organization_id, created_by)
       VALUES ($1,'8.8','Added','sum-8',$2,$3)`,
      [sequenceId, ORG, USER],
    );
    expect((await resolve(sequenceId)).verdict).toBe('invalid');

    const reSigned = await sign(sequenceId, ORG);
    const status = await resolve(sequenceId);
    expect(status.verdict).toBe('signed');
    expect(status.signatureId).toBe(reSigned);
  });
});
