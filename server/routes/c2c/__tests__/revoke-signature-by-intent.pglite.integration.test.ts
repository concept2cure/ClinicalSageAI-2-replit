/**
 * A governed revocation withdraws exactly the signature the person asked to
 * withdraw (row D5, 2026-10-15; 21 CFR Part 11 §11.10(e), §11.70).
 *
 * Since P-34 (docs/LAUNCH_DEFINITION_OF_DONE.md "### P-34") one sequence target,
 * `ectd-sequence:<id>`, carries live signatures given for different acts: a
 * freeze, a dispatch (the release), a transmit, a Shadow Review waiver and, per
 * P-35, one disposition per critical finding. `persistGovernedSignatureRevocation`
 * resolved "the signature under revocation" as the NEWEST live row on the
 * target, whatever it was given for. So revoking a release could withdraw a
 * waiver instead, or the reverse, and the revocation row named the wrong
 * signature as revoked: an audit trail that records an act that did not happen,
 * and leaves in force the one that was meant to be withdrawn.
 *
 * The rule pinned here: a revocation names its signature by id, by the sign
 * action it was given under, or by the intent it declared; exactly one live
 * signature must answer, or the revocation is refused (409) and nothing is
 * written. On a target whose signatures declare no intent, its one live
 * signature is revoked without naming it; with several, nothing is chosen
 * for the caller there either.
 *
 * Over PGlite with the REAL electronic_signatures migrations (the D6 shape,
 * 20260813d, and the §11.70 immutability trigger, 20260730), the REAL
 * writeMutation for both the signs and the revocations, and the REAL route for
 * the HTTP answers. Only the database handle, the signer's role and the
 * credential check are replaced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PROGRAM_SPINE_PGLITE_DDL, SUBMISSION_CORE_PGLITE_DDL } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({
  query: async (_sql: string, _params?: unknown[]): Promise<{ rows: any[] }> => {
    throw new Error('PGlite not initialised yet');
  },
  reverified: [] as number[],
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
vi.mock('../../../services/mfaService.js', () => ({ verifyToken: vi.fn(async () => false), isMfaEnabled: vi.fn(async () => false) }));
// §11.10(g): the revoker holds signing authority (the membership row is drizzle's; not under test here).
vi.mock('../../../services/part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'approver' }));
// §11.200: the credential check passes, and records that it was asked.
vi.mock('../../../services/part11/reverify-signer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/part11/reverify-signer.js')>()),
  reverifySigner: async (userId: number) => {
    holder.reverified.push(userId);
    return { ok: true, authenticationMethod: 'password', secondFactorVerified: false };
  },
}));

import actionsRouter, { writeMutation } from '../actions.js';

const repo = path.join(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf8');

const AUDIT_LOGS_DDL = `
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, tenant_id INTEGER, user_id INTEGER, action TEXT,
  table_name TEXT, record_id TEXT, actor_id INTEGER, target TEXT,
  target_type TEXT, target_id TEXT, reason TEXT, payload_hash TEXT,
  ana_action_id TEXT, sha256_chain TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), hmac_seal TEXT,
  old_values JSON, new_values JSON, ip_address TEXT, user_agent TEXT
);`;

const ANA_ACTIONS_DDL = `
CREATE TABLE c2c_ana_actions (
  id TEXT PRIMARY KEY, org_id INTEGER NOT NULL, conversation_id TEXT,
  domain TEXT NOT NULL, surface TEXT NOT NULL, command TEXT NOT NULL,
  target TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'low',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  agentic_mode TEXT NOT NULL DEFAULT 'suggest', state TEXT NOT NULL DEFAULT 'proposed',
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(), proposed_by INTEGER NOT NULL,
  decided_at TIMESTAMPTZ, decided_by INTEGER, decision_reason TEXT,
  executed_at TIMESTAMPTZ, audit_row_id UUID, idempotency_key TEXT UNIQUE
);`;

// The pre-D6 physical shape (governed-sign-esignature.pglite.integration.test.ts);
// the real D6 migration and the real immutability trigger are applied on top.
const ELECTRONIC_SIGNATURES_PRE_D6_DDL = `
CREATE TABLE electronic_signatures (
  id serial PRIMARY KEY,
  document_id integer NOT NULL, version_id integer NOT NULL,
  signature_type varchar(50) NOT NULL, signature_purpose text NOT NULL, signature_level integer DEFAULT 1,
  signer_id integer NOT NULL, signer_name text NOT NULL, signer_title text, signer_email text NOT NULL,
  authentication_method varchar(50) NOT NULL, authentication_timestamp timestamp NOT NULL,
  second_factor_verified boolean DEFAULT false, signature_hash varchar(256) NOT NULL,
  signature_meaning text, signature_manifest json,
  is_valid boolean DEFAULT true, verification_status varchar(50), verification_date timestamp,
  compliance_statement text, legal_disclaimer text, ip_address varchar(45), device_info json,
  signed_at timestamp DEFAULT now() NOT NULL, created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now(), organization_id integer,
  bound_payload_digest text NOT NULL DEFAULT '', superseded_by integer
);`;

const PEOPLE_DDL = `
CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL, name text NOT NULL, password_hash text, title text, status text DEFAULT 'active');
CREATE TABLE organization_users (
  id serial PRIMARY KEY, organization_id integer NOT NULL, user_id integer NOT NULL,
  role text DEFAULT 'member' NOT NULL, UNIQUE (user_id, organization_id)
);`;

const ECTD_DDL = `
CREATE TABLE ectd_sequences (
  id serial PRIMARY KEY, submission_id integer NOT NULL, region text NOT NULL,
  sequence_number text NOT NULL, type text NOT NULL DEFAULT 'original',
  status text NOT NULL DEFAULT 'draft', organization_id integer NOT NULL, deleted_at timestamptz
);
CREATE TABLE submission_leaves (
  id serial PRIMARY KEY, sequence_id integer NOT NULL, section_code text NOT NULL,
  lifecycle_op text NOT NULL DEFAULT 'new', document_table text, document_id integer,
  document_uuid uuid, document_content_sha256 text, checksum text, title text NOT NULL,
  organization_id integer NOT NULL, deleted_at timestamptz
);`;

const ORG = 7;
const SIGNER = 42;
const SEQ = 21;
const TARGET = `ectd-sequence:${SEQ}`;

let pg: PGlite;
const q = (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: any[] }>;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_DDL);
  await pg.exec(ANA_ACTIONS_DDL);
  await pg.exec(ELECTRONIC_SIGNATURES_PRE_D6_DDL);
  await pg.exec(PEOPLE_DDL);
  await pg.exec(ECTD_DDL);
  // A US sequence's binding includes its recorded FDA application and applicant
  // identity (ectd-sequence-binding.ts, 2026-10-21), read from submissions,
  // organizations, regulatory_programs and ind_sponsors. The REAL registry and
  // applicant-binding migrations, as governed-sign-esignature does.
  await pg.exec(PROGRAM_SPINE_PGLITE_DDL);
  await pg.exec(SUBMISSION_CORE_PGLITE_DDL);
  await pg.exec(read('migrations/20260609_ind_master_data.sql'));
  await pg.exec(read('migrations/20261021_regulatory_programs_applicant_sponsor.sql'));
  await pg.exec(read('migrations/20261012_submission_leaf_stf_study_tagging.sql'));
  await pg.exec(read('migrations/20260813d_esignature_governed_unification.sql'));
  await pg.exec(read('db/migrations/20260730_esign_audit_db_level_immutability.sql'));
  await q(`INSERT INTO users (id, email, name, title) VALUES ($1, 'dana@acme.test', 'Dana Reyes', 'Head of Regulatory')`, [SIGNER]);
  await q(`INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'approver')`, [ORG, SIGNER]);
  await q(`INSERT INTO organizations (id, name) VALUES ($1, 'Acme Therapeutics')`, [ORG]);
  await q(
    `INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES (5, 'Acme IND', 'ind', 'biotech', 'fda', $1, $2)`,
    [ORG, SIGNER],
  );
  await q(
    `INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, status, organization_id)
     VALUES ($1, 5, 'fda', '0000', 'validated', $2)`,
    [SEQ, ORG],
  );
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, checksum, organization_id)
     VALUES ($1, 'm2.5', 'Clinical Overview', 'abc123', $2)`,
    [SEQ, ORG],
  );
  holder.query = q;
  holder.reverified.length = 0;
});
afterEach(async () => {
  await pg.close();
});

const MEANING: Record<string, string> = {
  freeze: 'approval',
  dispatch: 'approval',
  transmit: 'release',
  'shadow-waiver': 'responsibility',
  'shadow-finding-disposition': 'responsibility',
};

/** A governed sign on `target` through the real writer, declaring `intent` (or none). Returns its signature row id. */
async function sign(intent: string | null, target = TARGET): Promise<{ signatureId: number; actionId: string }> {
  const payload: Record<string, unknown> = { meaning: intent ? MEANING[intent] : 'approval' };
  if (intent) payload.intent = intent;
  const r = await writeMutation(
    'sign',
    { target, reason: `Signed for ${intent ?? 'approval'} after review`, payload, reauth: { password: 'pw' } },
    SIGNER,
    ORG,
  );
  const row = (await q(
    `SELECT id FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`,
    [r.actionId],
  )).rows[0];
  return { signatureId: Number(row.id), actionId: r.actionId };
}

const revoke = (payload: Record<string, unknown>, target = TARGET) =>
  writeMutation(
    'revoke-signature',
    { target, reason: 'Signed against the wrong content; withdrawing', payload, reauth: { password: 'pw' } },
    SIGNER,
    ORG,
  );

type SigState = { superseded_by: number | null; is_valid: boolean; verification_status: string | null };
const state = async (id: number): Promise<SigState> =>
  (await q(`SELECT superseded_by, is_valid, verification_status FROM electronic_signatures WHERE id = $1`, [id])).rows[0];

const LIVE = { superseded_by: null, is_valid: true };

/** The revocation row that superseded `id`, with its manifest. */
async function revocationOf(id: number): Promise<{ id: number; manifest: Record<string, unknown> }> {
  const row = (await q(
    `SELECT r.id, r.signature_manifest FROM electronic_signatures r
       JOIN electronic_signatures s ON s.superseded_by = r.id WHERE s.id = $1`,
    [id],
  )).rows[0];
  expect(row, `signature ${id} was not superseded by a revocation row`).toBeTruthy();
  const manifest = typeof row.signature_manifest === 'string' ? JSON.parse(row.signature_manifest) : row.signature_manifest;
  return { id: Number(row.id), manifest };
}

const counts = async () => ({
  revokeActions: Number((await q(`SELECT count(*)::int AS n FROM c2c_ana_actions WHERE command = 'revoke-signature'`)).rows[0].n),
  revocationRows: Number((await q(`SELECT count(*)::int AS n FROM electronic_signatures WHERE signature_type = 'governed-revocation'`)).rows[0].n),
  revokeAudits: Number((await q(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'c2c.work.revoke-signature'`)).rows[0].n),
});
const NOTHING_WRITTEN = { revokeActions: 0, revocationRows: 0, revokeAudits: 0 };

describe('revoking one signature on a sequence that holds signatures for several acts: the one named', () => {
  it('revoking the dispatch signature revokes that one and leaves the newer Shadow Review waiver in force', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');

    await revoke({ intent: 'dispatch' });

    expect(await state(dispatch.signatureId)).toMatchObject({ is_valid: false, verification_status: 'revoked' });
    expect(await state(waiver.signatureId), 'the waiver was revoked in place of the dispatch signature').toMatchObject(LIVE);
    const revocation = await revocationOf(dispatch.signatureId);
    expect(revocation.manifest).toMatchObject({ revokedSignatureId: dispatch.signatureId, revokedSignatureIntent: 'dispatch' });
  });

  it('the converse: revoking the waiver leaves the newer dispatch signature in force', async () => {
    const waiver = await sign('shadow-waiver');
    const dispatch = await sign('dispatch');

    await revoke({ intent: 'shadow-waiver' });

    expect(await state(waiver.signatureId)).toMatchObject({ is_valid: false, verification_status: 'revoked' });
    expect(await state(dispatch.signatureId), 'the release was revoked in place of the waiver').toMatchObject(LIVE);
    expect((await revocationOf(waiver.signatureId)).manifest).toMatchObject({
      revokedSignatureId: waiver.signatureId,
      revokedSignatureIntent: 'shadow-waiver',
    });
  });

  it('by its id: the named signature is revoked, though a newer one for another act is live', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');

    await revoke({ signatureId: dispatch.signatureId });

    expect((await state(dispatch.signatureId)).superseded_by).not.toBeNull();
    expect(await state(waiver.signatureId)).toMatchObject(LIVE);
  });

  it('by the sign action it was given under', async () => {
    const freeze = await sign('freeze');
    const dispatch = await sign('dispatch');

    await revoke({ signatureActionId: freeze.actionId });

    expect((await revocationOf(freeze.signatureId)).manifest).toMatchObject({
      revokedSignatureId: freeze.signatureId,
      revokedSignatureActionId: freeze.actionId,
    });
    expect(await state(dispatch.signatureId)).toMatchObject(LIVE);
  });
});

describe('revoking one signature on a sequence that holds signatures for several acts: refused rather than chosen', () => {
  it('refuses, writing nothing, when live signatures for more than one act are on the target and none is named', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');

    const err = await revoke({}).then(() => null, (e: any) => e);

    expect(err, 'an unnamed revocation picked one of two signatures given for different acts').toMatchObject({
      code: 'REVOCATION_TARGET_AMBIGUOUS',
    });
    expect(err.message).toContain(`${dispatch.signatureId} (dispatch`);
    expect(err.message).toContain(`${waiver.signatureId} (shadow-waiver`);
    expect(await counts()).toEqual(NOTHING_WRITTEN);
    expect(await state(dispatch.signatureId)).toMatchObject(LIVE);
    expect(await state(waiver.signatureId)).toMatchObject(LIVE);
  });

  it('refuses when more than one live signature declares the named intent (one disposition per critical finding)', async () => {
    const first = await sign('shadow-finding-disposition');
    const second = await sign('shadow-finding-disposition');

    await expect(revoke({ intent: 'shadow-finding-disposition' })).rejects.toMatchObject({ code: 'REVOCATION_TARGET_AMBIGUOUS' });
    expect(await counts()).toEqual(NOTHING_WRITTEN);

    // Named by id, the one meant is the one withdrawn.
    await revoke({ signatureId: first.signatureId, intent: 'shadow-finding-disposition' });
    expect((await state(first.signatureId)).superseded_by).not.toBeNull();
    expect(await state(second.signatureId)).toMatchObject(LIVE);
  });

  it('refuses, writing nothing, when no live signature answers to what was named', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');

    await expect(revoke({ intent: 'transmit' }), 'no transmit signature exists').rejects.toMatchObject({
      code: 'REVOCATION_TARGET_UNRESOLVED',
    });
    await expect(
      revoke({ signatureId: dispatch.signatureId, intent: 'shadow-waiver' }),
      'the named signature was given for another act',
    ).rejects.toMatchObject({ code: 'REVOCATION_TARGET_UNRESOLVED', message: expect.stringMatching(/'dispatch', not 'shadow-waiver'/) });
    await expect(revoke({ signatureId: 999_999 }), 'no such signature on this target').rejects.toMatchObject({
      code: 'REVOCATION_TARGET_UNRESOLVED',
    });
    await expect(revoke({ signatureActionId: 'act_not_a_sign' })).rejects.toMatchObject({ code: 'REVOCATION_TARGET_UNRESOLVED' });
    expect(await counts()).toEqual(NOTHING_WRITTEN);
    expect(await state(dispatch.signatureId)).toMatchObject(LIVE);
    expect(await state(waiver.signatureId)).toMatchObject(LIVE);
  });

  it('a signature already revoked cannot be revoked again by naming it, and no longer counts as live', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');
    await revoke({ signatureId: dispatch.signatureId });

    await expect(revoke({ signatureId: dispatch.signatureId })).rejects.toMatchObject({ code: 'REVOCATION_TARGET_UNRESOLVED' });
    expect((await counts()).revocationRows).toBe(1);

    // With the dispatch signature withdrawn the waiver is the one live signature: unnamed is not ambiguous.
    await revoke({});
    expect((await state(waiver.signatureId)).superseded_by).not.toBeNull();
  });

  it('a signature voided for a refused act (P-23) is out of force: not a candidate, and naming it resolves nothing', async () => {
    // The row voidSignatureForRefusedAct leaves: is_valid false, verification_status 'voided', not superseded.
    await q(
      `INSERT INTO c2c_ana_actions (id, org_id, domain, surface, command, target, payload, state, proposed_by)
       VALUES ('act_voided_dispatch', $1, 'mdx', 'api', 'sign', $2, '{"intent":"dispatch","meaning":"approval"}', 'executed', $3)`,
      [ORG, TARGET, SIGNER],
    );
    const voided = Number((await q(
      `INSERT INTO electronic_signatures
         (signed_target, signature_type, signature_purpose, signer_id, signer_name, signer_email, authentication_method,
          authentication_timestamp, signature_hash, signature_manifest, is_valid, verification_status, organization_id, bound_payload_digest)
       VALUES ($1, 'governed-action', 'Dispatch the sequence', $2, 'Dana Reyes', 'dana@acme.test', 'password',
               now(), 'h-voided', '{"actionId":"act_voided_dispatch"}', false, 'voided', $3, 'd') RETURNING id`,
      [TARGET, SIGNER, ORG],
    )).rows[0].id);
    const waiver = await sign('shadow-waiver');

    await expect(revoke({ signatureId: voided })).rejects.toMatchObject({ code: 'REVOCATION_TARGET_UNRESOLVED' });
    expect(await counts()).toEqual(NOTHING_WRITTEN);

    // The waiver is the one live signature, so an unnamed revocation is not ambiguous.
    await revoke({});
    expect((await state(waiver.signatureId)).superseded_by).not.toBeNull();
    expect(await state(voided)).toMatchObject({ superseded_by: null, verification_status: 'voided' });
  });

  it('a signature on another target is not this target’s, even named by id', async () => {
    const elsewhere = await sign('dispatch', 'program:prog_other');
    await sign('dispatch');

    await expect(revoke({ signatureId: elsewhere.signatureId })).rejects.toMatchObject({ code: 'REVOCATION_TARGET_UNRESOLVED' });
    expect(await state(elsewhere.signatureId)).toMatchObject(LIVE);
  });

  it.each([
    [{ signatureId: 'twelve' }],
    [{ signatureId: -3 }],
    [{ signatureId: 1.5 }],
    [{ signatureActionId: 42 }],
    [{ signatureActionId: '  ' }],
    [{ intent: '' }],
    [{ intent: ['dispatch'] }],
  ])('refuses a selector that names nothing it could resolve: %j', async (payload) => {
    await sign('dispatch');
    await expect(revoke(payload)).rejects.toMatchObject({ code: 'REVOCATION_SELECTOR_INVALID' });
    expect(await counts()).toEqual(NOTHING_WRITTEN);
  });
});

describe('a target whose signatures declare no intent', () => {
  it('its one live signature is revoked without naming it', async () => {
    const only = await sign(null, 'program:prog_1');
    await revoke({}, 'program:prog_1');
    expect((await revocationOf(only.signatureId)).manifest).toMatchObject({ revokedSignatureId: only.signatureId });
  });

  it('with several live signatures and none named, nothing is revoked: two signers on one record are not one choice', async () => {
    const older = await sign(null, 'program:prog_2');
    const newer = await sign(null, 'program:prog_2');
    await expect(revoke({}, 'program:prog_2')).rejects.toMatchObject({ code: 'REVOCATION_TARGET_AMBIGUOUS' });
    expect(await state(newer.signatureId)).toMatchObject(LIVE);
    expect(await state(older.signatureId)).toMatchObject(LIVE);
    // Named by id, the one named goes, the other stays.
    await revoke({ signatureId: older.signatureId }, 'program:prog_2');
    expect((await state(older.signatureId)).superseded_by).not.toBeNull();
    expect(await state(newer.signatureId)).toMatchObject(LIVE);
  });

  it('naming an intent its signatures never declared resolves nothing', async () => {
    await sign(null, 'program:prog_3');
    await expect(revoke({ intent: 'dispatch' }, 'program:prog_3')).rejects.toMatchObject({ code: 'REVOCATION_TARGET_UNRESOLVED' });
  });

  it('with nothing live on the target, the refusal is the one it always was', async () => {
    await expect(revoke({}, 'program:prog_4')).rejects.toMatchObject({
      code: 'REVOCATION_TARGET_UNRESOLVED',
      message: expect.stringMatching(/no active electronic signature is anchored to target 'program:prog_4'/),
    });
  });
});

describe('POST /api/c2c/actions/revoke-signature', () => {
  function app() {
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: SIGNER, organizationId: ORG, role: 'approver' };
      next();
    });
    a.use('/api/c2c/actions', actionsRouter);
    return a;
  }
  const post = (payload: Record<string, unknown>) =>
    request(app())
      .post('/api/c2c/actions/revoke-signature')
      .send({ target: TARGET, reason: 'Signed against the wrong content; withdrawing', payload, reauth: { password: 'pw' } });

  it('answers 409 REVOCATION_TARGET_AMBIGUOUS naming the live signatures, and writes nothing', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');

    const res = await post({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REVOCATION_TARGET_AMBIGUOUS');
    expect(res.body.candidates).toEqual([
      expect.objectContaining({ signatureId: waiver.signatureId, intent: 'shadow-waiver', signatureActionId: waiver.actionId }),
      expect.objectContaining({ signatureId: dispatch.signatureId, intent: 'dispatch', signatureActionId: dispatch.actionId }),
    ]);
    expect(await counts()).toEqual(NOTHING_WRITTEN);
  });

  it('answers 409 REVOCATION_TARGET_UNRESOLVED when nothing answers to the selector', async () => {
    await sign('dispatch');
    const res = await post({ intent: 'transmit' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REVOCATION_TARGET_UNRESOLVED');
  });

  it('refuses a malformed selector with 400 before the credential is asked for', async () => {
    await sign('dispatch');
    holder.reverified.length = 0;
    const res = await post({ signatureId: 'the dispatch one' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REVOCATION_SELECTOR_INVALID');
    expect(holder.reverified, 'the signer was asked for a password for a request that is refused anyway').toEqual([]);
    expect(await counts()).toEqual(NOTHING_WRITTEN);
  });

  it('revokes the named signature and only that one', async () => {
    const dispatch = await sign('dispatch');
    const waiver = await sign('shadow-waiver');

    const res = await post({ signatureId: dispatch.signatureId });

    expect(res.status).toBe(200);
    expect((await state(dispatch.signatureId)).superseded_by).not.toBeNull();
    expect(await state(waiver.signatureId)).toMatchObject(LIVE);
  });
});
