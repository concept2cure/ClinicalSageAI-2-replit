/**
 * What the database holds when a regulatory commitment is fulfilled (rows D2
 * and D5, 2026-10-19; decision P-41), whatever the route:
 *
 *   - a fulfilled PMR, PMC or REMS commits only naming evidence and with a
 *     live signature written by the same transaction, by the person recorded,
 *     of the content basis, meaning approval or responsibility, not withdrawn,
 *     whose manifest names the same evidence and date
 *     (regulatory_commitments_signed_fulfilment_guard). Each of those clauses
 *     has its own case below, beside a forged signature that is correct in
 *     every respect and is accepted, so each refusal is for its own reason;
 *   - a move into fulfilled names who recorded it; evidence is written only
 *     in that update, only this organisation's, only a sequence the agency
 *     received and a Vault version at its own sha256; a commitment's type
 *     never changes (so a PMR cannot be retyped out of its signature); a
 *     recorded fulfilment cannot change or be removed by an UPDATE; a removal
 *     is written once (regulatory_commitments_fulfilment_record_guard);
 *   - the database signs exactly the types the code signs;
 *   - the tenant purge still erases a tenant whose commitments name evidence.
 *
 * Every statement here runs as the runtime role (APP_DATABASE_URL, NOSUPERUSER
 * NOBYPASSRLS, RLS on) in the organisation's tenant scope, except where a
 * legacy row is staged as the owner and says so.
 * migrations/20261019_commitment_fulfilment_evidence.sql; the routes are
 * tests/db/commitment-fulfilment-evidence.dbtest.ts; the fixture is
 * tests/db/commitment-fulfilment-fixture.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { SIGNED_FULFILMENT_TYPES } from '../../server/services/ha-interactions/ha-logic';
import {
  app, as, asRuntime, fulfilUrl, hashes, orgCommitment, organization, owner, orgId, project, projectCommitment,
  projectRow, rawFulfil, regulatoryProgram, seq, sequence, setupFixture, signedBody, stateOf,
  submission, teardownFixture, users, vault, vaultVersion, PREFIX,
} from './commitment-fulfilment-fixture';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

beforeAll(() => setupFixture('database'), 120_000);
afterAll(() => teardownFixture());

describe('the record a fulfilment is made on', () => {
  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const r = await runWithSystemTenantScope('commitment-fulfilment-database.dbtest', () =>
      getPool().query(`SELECT r.rolsuper, r.rolbypassrls, current_user AS who FROM pg_roles r WHERE r.rolname = current_user`),
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('the database signs exactly the types the code signs (SIGNED_FULFILMENT_TYPES), no more and no fewer', async () => {
    for (const type of ['pmr', 'pmc', 'rems', 'meeting_commitment', 'other']) {
      const cid = await orgCommitment(type, `Type pin ${type}`);
      const r = await asRuntime([rawFulfil(cid, { seq: seq.ok }, users.signer.id)]);
      const signed = (SIGNED_FULFILMENT_TYPES as readonly string[]).includes(type);
      expect(r.ok, `${type}: ${JSON.stringify(r)}`).toBe(!signed);
      if (!r.ok) expect(r.message).toMatch(/COMMITMENT_SIGNATURE_REQUIRED/);
    }
  });

});

describe('a recorded fulfilment is fixed', () => {
  let cid: number;
  beforeAll(async () => {
    cid = await projectCommitment(project.X, 'pmr', 'Pediatric study under PREA');
    const res = await request(app).post(fulfilUrl(project.X, cid)).set(as('signer')).send(signedBody({ sequenceId: seq.ok, vaultDocumentId: vault.P }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('the recorded fulfilment cannot be changed, cleared, or retyped by the runtime role', async () => {
    for (const [sql, params] of [
      ['UPDATE regulatory_commitments SET fulfilment_sequence_id = $2 WHERE id = $1', [cid, seq.ack]],
      ["UPDATE regulatory_commitments SET fulfilled_date = DATE '2026-09-01' WHERE id = $1", [cid]],
      ['UPDATE regulatory_commitments SET fulfilment_vault_document_id = NULL, fulfilment_vault_sha256 = NULL WHERE id = $1', [cid]],
      ["UPDATE regulatory_commitments SET status = 'open' WHERE id = $1", [cid]],
      ["UPDATE regulatory_commitments SET commitment_type = 'other' WHERE id = $1", [cid]],
      ["UPDATE regulatory_commitments SET description = 'Something else' WHERE id = $1", [cid]],
    ] as Array<[string, unknown[]]>) {
      const r = await asRuntime([[sql, params]]);
      expect(r.ok, sql).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
    }
    expect((await stateOf(cid))).toMatchObject({ status: 'fulfilled', fulfilment_sequence_id: seq.ok, vault: vault.P });
  });

  it('a recorded fulfilment is not removed from the register by an UPDATE (deleted_at)', async () => {
    const r = await asRuntime([['UPDATE regulatory_commitments SET deleted_at = now() WHERE id = $1', [cid]]]);
    expect(r.ok, 'a signed PMR fulfilment was hidden by setting deleted_at').toBe(false);
    if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION: regulatory_commitments\.deleted_at/);
    const left = await owner.query('SELECT deleted_at FROM regulatory_commitments WHERE id = $1', [cid]);
    expect(left.rows[0].deleted_at).toBeNull();
  });

  it('a removal is written once: deleted_at, once set, is not cleared', async () => {
    const other = await projectCommitment(project.X, 'other', 'Removed and restored probe');
    expect((await asRuntime([['UPDATE regulatory_commitments SET deleted_at = now() WHERE id = $1', [other]]])).ok).toBe(true);
    const r = await asRuntime([['UPDATE regulatory_commitments SET deleted_at = NULL WHERE id = $1', [other]]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
  });
});

describe("the database holds it, whatever the route", () => {
  it('a fulfilled PMR with evidence and no signature fails at COMMIT', async () => {
    const cid = await orgCommitment('pmr', 'Raw PMR, no signature');
    const r = await asRuntime([rawFulfil(cid, { seq: seq.ok }, users.signer.id)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/COMMITMENT_SIGNATURE_REQUIRED/);
    expect((await stateOf(cid)).status).toBe('open');
  });

  it('a fulfilled PMR that names nothing fails at COMMIT', async () => {
    const cid = await orgCommitment('pmr', 'Raw PMR, no evidence');
    const r = await asRuntime([rawFulfil(cid, {}, users.signer.id)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/COMMITMENT_EVIDENCE_REQUIRED/);
  });

  it('a move into fulfilled must say who recorded it', async () => {
    const cid = await orgCommitment('meeting_commitment', 'Raw meeting commitment, unattributed');
    const r = await asRuntime([rawFulfil(cid, {}, null)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/COMMITMENT_FULFILMENT_UNATTRIBUTED/);
  });

});

describe('the signature the COMMIT requires: each clause refuses for itself', () => {
  /** A signature row the runtime role writes itself, correct in every respect the guard reads unless overridden. */
  const forged = (cid: number, o: {
    signer?: number; act?: Record<string, unknown>; basis?: string; meaning?: string;
    verificationStatus?: string | null; supersededBy?: number | null; isValid?: boolean;
  } = {}): [string, unknown[]] => [
    `INSERT INTO electronic_signatures (organization_id, signed_target, signature_type, signature_purpose, signer_id, signer_name, signer_email,
                                        authentication_method, authentication_timestamp, signature_hash, signature_meaning, signature_manifest,
                                        bound_payload_digest, binding_basis, verification_status, superseded_by, is_valid)
     VALUES ($1, $2, 'governed-action', 'Forged', $3, 'Forger', 'forger@example.invalid', 'password', now(), $4::text, $5, $6::json, $4::text, $7, $8, $9::int, $10)`,
    [orgId, `regulatory-commitment:${cid}`, o.signer ?? users.signer.id, 'f'.repeat(64), o.meaning ?? 'approval',
      JSON.stringify({ act: o.act ?? { fulfilledDate: '2026-10-01', sequenceId: seq.ok, vaultDocumentId: null, vaultSha256: null } }),
      o.basis ?? 'commitment-fulfilment-content-sha256', o.verificationStatus ?? null, o.supersededBy ?? null, o.isValid ?? true],
  ];
  const actOn = (o: Record<string, unknown> = {}) => ({ fulfilledDate: '2026-10-01', sequenceId: seq.ok, vaultDocumentId: null, vaultSha256: null, ...o });

  it('control: a forged signature correct in every respect the guard reads is accepted, so each refusal below is for its own clause', async () => {
    const cid = await orgCommitment('pmr', 'Raw PMR, signature correct in every respect');
    const r = await asRuntime([forged(cid), rawFulfil(cid, { seq: seq.ok }, users.signer.id)]);
    expect(r, JSON.stringify(r)).toEqual({ ok: true });
    expect((await stateOf(cid)).status).toBe('fulfilled');
  });

  it.each([
    ['signed by another user than the one recorded (signer)', () => ({ signer: users.member.id })],
    ['signed over another sequence than the one stored (manifest)', () => ({ act: actOn({ sequenceId: seq.ack }) })],
    ['signed over another date (manifest)', () => ({ act: actOn({ fulfilledDate: '2026-09-30' }) })],
    ['bound to the ledger hash, not the content (basis)', () => ({ basis: 'governed-action-sha256-chain' })],
    ['meaning review, which does not attest (meaning)', () => ({ meaning: 'review' })],
    ['revoked (withdrawn)', () => ({ verificationStatus: 'revoked' })],
    ['voided (withdrawn)', () => ({ verificationStatus: 'voided' })],
    ['superseded (withdrawn)', () => ({ supersededBy: 2147483000 })],
    ['marked invalid (withdrawn)', () => ({ isValid: false })],
  ] as const)('a signature %s does not count (M5)', async (_label, override) => {
    const cid = await orgCommitment('pmr', `Raw PMR, forged: ${_label}`);
    const r = await asRuntime([forged(cid, override()), rawFulfil(cid, { seq: seq.ok }, users.signer.id)]);
    expect(r.ok, 'the COMMIT went through').toBe(false);
    if (!r.ok) expect(r.message).toMatch(/COMMITMENT_SIGNATURE_REQUIRED/);
    expect((await stateOf(cid)).status).toBe('open');
  });

  it('a signature committed by an earlier transaction does not count: the fulfilment and its signature commit together (M5)', async () => {
    const cid = await orgCommitment('pmr', 'Raw PMR, signature from an earlier transaction');
    expect(await asRuntime([forged(cid)])).toEqual({ ok: true });
    const r = await asRuntime([rawFulfil(cid, { seq: seq.ok }, users.signer.id)]);
    expect(r.ok, 'a fulfilment committed against a signature written before it').toBe(false);
    if (!r.ok) expect(r.message).toMatch(/COMMITMENT_SIGNATURE_REQUIRED/);
    expect((await stateOf(cid)).status).toBe('open');
  });

});

describe('the database holds what is named, and the type, whatever the route', () => {
  it("names only a version of this organisation, at its own sha256", async () => {
    const cid = await orgCommitment('meeting_commitment', 'Raw meeting commitment, bad Vault pin');
    for (const ev of [{ vault: vault.B, sha: hashes[vault.B] }, { vault: vault.P, sha: 'f'.repeat(64) }]) {
      const r = await asRuntime([rawFulfil(cid, ev, users.signer.id)]);
      expect(r.ok, JSON.stringify(ev)).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/COMMITMENT_EVIDENCE_INVALID|violates foreign key/);
    }
  });

  it('names only a sequence the agency received', async () => {
    const cid = await orgCommitment('meeting_commitment', 'Raw meeting commitment, pending sequence');
    const r = await asRuntime([rawFulfil(cid, { seq: seq.pending }, users.signer.id)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/COMMITMENT_EVIDENCE_INVALID/);
    const other = await asRuntime([rawFulfil(cid, { seq: seq.foreign }, users.signer.id)]);
    expect(other.ok).toBe(false);
  });

  it('evidence is attached only in the update that records the fulfilment, never to a legacy row afterwards', async () => {
    const cid = await orgCommitment('pmr', 'Legacy PMR fulfilled before fulfilments were signed');
    // Fulfilled as it was before this change: no evidence, no recorder (triggers off, as owner).
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query("UPDATE regulatory_commitments SET status = 'fulfilled', fulfilled_date = DATE '2026-01-01' WHERE id = $1", [cid]);
      await c.query('COMMIT');
    } finally {
      c.release();
    }
    const r = await asRuntime([[
      'UPDATE regulatory_commitments SET fulfilment_sequence_id = $2, fulfilment_recorded_by = $3, fulfilment_recorded_at = now() WHERE id = $1',
      [cid, seq.ok, users.signer.id],
    ]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION|COMMITMENT_SIGNATURE_REQUIRED/);
  });

  it('an open PMR cannot be retyped out of its signature: not in the update that fulfils it, nor before it', async () => {
    const cid = await orgCommitment('pmr', 'Open PMR, retype probe');
    // One statement: retype and fulfil, unsigned, naming nothing.
    const one = await asRuntime([[
      `UPDATE regulatory_commitments
          SET commitment_type = 'other', status = 'fulfilled', fulfilled_date = DATE '2026-10-01',
              fulfilment_recorded_by = $2, fulfilment_recorded_at = now()
        WHERE id = $1`,
      [cid, users.signer.id],
    ]]);
    expect(one.ok, 'an open PMR was retyped to other and fulfilled unsigned in one UPDATE').toBe(false);
    if (!one.ok) expect(one.message).toMatch(/IMMUTABILITY_VIOLATION: regulatory_commitments\.commitment_type/);
    // Two steps: retype while open, then fulfil as the unsigned type would be.
    for (const type of ['other', 'meeting_commitment']) {
      const r = await asRuntime([["UPDATE regulatory_commitments SET commitment_type = $2 WHERE id = $1", [cid, type]]]);
      expect(r.ok, `an open PMR was retyped to ${type}`).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
    }
    const unsigned = await request(app).post(fulfilUrl('org', cid)).set(as('signer')).send({ reason: 'Recorded as met without a signature.' });
    expect(unsigned.status, JSON.stringify(unsigned.body)).toBe(400);
    expect(await owner.query('SELECT commitment_type, status FROM regulatory_commitments WHERE id = $1', [cid]).then((q) => q.rows[0]))
      .toEqual({ commitment_type: 'pmr', status: 'open' });
  });

  it('a fulfilled meeting commitment cannot be retyped into a PMR', async () => {
    const cid = await orgCommitment('meeting_commitment', 'Retype probe');
    const ok = await request(app).post(fulfilUrl('org', cid)).set(as('signer')).send({ reason: 'Briefing package sent as agreed.' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const r = await asRuntime([["UPDATE regulatory_commitments SET commitment_type = 'pmr' WHERE id = $1", [cid]]]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/IMMUTABILITY_VIOLATION/);
  });
});

describe('a tenant whose commitments name evidence can still be erased', () => {
  it('purge removes the commitments before the Vault versions they name, with no 23503; the signature stays', async () => {
    const { purgeTenant } = await import('../../server/services/tenant/tenant-offboarding');
    const org = await organization('purge');
    const u = Number((await owner.query(`INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Purge Actor', 'x', 'active') RETURNING id`, [`${PREFIX}-purge@example.invalid`])).rows[0].id);
    const prog = await regulatoryProgram(org.id, 'PURGE');
    await projectRow(org.id, 'purge', u, prog);
    const s = await sequence({ org: org.id, submissionId: await submission(org.id, 'purge IND', prog, u), number: '0007', status: 'dispatched', dispatchStatus: 'acknowledged', actor: u });
    const v = await vaultVersion(org.id, prog, 'Purge CSR', u);
    const cid = Number((await owner.query(
      `INSERT INTO regulatory_commitments (organization_id, commitment_type, description, status, created_by) VALUES ($1, 'pmr', 'Purge PMR', 'open', $2) RETURNING id`,
      [org.id, u],
    )).rows[0].id);
    // The signed fulfilment, as the ceremony leaves it: signature and row in one transaction.
    const c = await owner.connect();
    let sig: number | undefined;
    try {
      await c.query('BEGIN');
      sig = Number((await c.query(
        `INSERT INTO electronic_signatures (organization_id, signed_target, signature_type, signature_purpose, signer_id, signer_name, signer_email,
                                            authentication_method, authentication_timestamp, signature_hash, signature_meaning, signature_manifest,
                                            bound_payload_digest, binding_basis)
         VALUES ($1, $2, 'governed-action', 'Fulfilled', $3, 'Purge Actor', 'purge@example.invalid', 'password', now(), $4, 'approval', $5::json, $6,
                 'commitment-fulfilment-content-sha256') RETURNING id`,
        [org.id, `regulatory-commitment:${cid}`, u, 'b'.repeat(64), JSON.stringify({ act: { fulfilledDate: '2026-10-01', sequenceId: s, vaultDocumentId: v, vaultSha256: hashes[v] } }), 'b'.repeat(64)],
      )).rows[0].id);
      await c.query(
        `UPDATE regulatory_commitments SET status = 'fulfilled', fulfilled_date = DATE '2026-10-01', fulfilment_sequence_id = $2,
                fulfilment_vault_document_id = $3::uuid, fulfilment_vault_sha256 = $4, fulfilment_recorded_by = $5, fulfilment_recorded_at = now()
          WHERE id = $1`,
        [cid, s, v, hashes[v], u],
      );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
    await owner.query(`UPDATE organizations SET status = 'pending_deletion', purged_at = NULL, deletion_requested_at = now() - interval '40 days', purge_eligible_at = now() - interval '1 day' WHERE id = $1`, [org.id]);
    await owner.query(`INSERT INTO tenant_export_receipts (organization_id, digest, table_count, row_count, created_by) VALUES ($1, $2, 1, 1, NULL)`, [org.id, `${PREFIX}-digest`]);

    const { getPool } = await import('../../server/db/runtime');
    const { runWithSystemTenantScope } = await import('../../server/db/tenantStore');
    const purged = await runWithSystemTenantScope('commitment-fulfilment-evidence.dbtest', () =>
      purgeTenant(getPool(), { organizationId: org.id, purgedByUserId: u, preconditions: { finalExportDigest: `${PREFIX}-digest` } }));
    expect(purged.status, JSON.stringify(purged)).toBe('purged');
    expect((await owner.query(`SELECT count(*)::int AS n FROM regulatory_commitments WHERE organization_id = $1`, [org.id])).rows[0].n).toBe(0);
    expect((await owner.query(`SELECT count(*)::int AS n FROM vault.documents WHERE organization_id = $1`, [org.id])).rows[0].n).toBe(0);
    expect((await owner.query(`SELECT signed_target FROM electronic_signatures WHERE id = $1`, [sig])).rows).toEqual([{ signed_target: `regulatory-commitment:${cid}` }]);
  }, 60_000);
});
