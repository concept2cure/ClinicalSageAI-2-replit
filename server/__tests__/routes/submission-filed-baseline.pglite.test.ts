/**
 * Declaring the sequences a US submission filed outside the platform is a
 * signed act, and the database holds it to that (D7, 2026-10-29;
 * docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
 *
 * Runs for real, on an in-process PGlite: the router, the ceremony
 * (signGovernedAct), the act's SQL, the content binder,
 * persistGovernedSignSignature and the electronic_signatures INSERT, and the
 * real migration with its COMMIT-time signature guard. Stubbed at their module
 * boundaries: the password check, the signer's role, the tenant context, the
 * ledger pair, and the project-access read (getSubmissionForRequest, which has
 * its own suites).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'migrations/20261029g_submission_filed_baselines.sql'), 'utf8');

const ORG = 7;
const LEAD = 5;
const OTHER = 6;
const GOOD = 'correct horse battery staple';
const PROGRAM = '22222222-2222-4222-8222-222222222222';
const OTHER_PROGRAM = '33333333-3333-4333-8333-333333333333';
const EVIDENCE = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_SHA = 'e'.repeat(64);
const SIGN = { meaning: 'responsibility', reason: 'Sequences 0000-0041 were filed with our previous publisher', password: GOOD };

const h = vi.hoisted(() => ({
  pg: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; affectedRows?: number }> },
  ledger: 0,
  log: [] as string[],
  userId: 5,
  /** The signer's organization role: approver is a manager (program-access ORG_MANAGE_ROLES) and signs. */
  role: 'approver',
  readRefused: false,
}));

const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: async (_u: number, creds: { password?: string }) => (creds.password === GOOD
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => h.role }));
vi.mock('../../routes/c2c/actions', () => ({
  recordGovernedAction: async (_c: unknown, p: { command: string; target: string }) => {
    h.ledger += 1;
    h.log.push(`LEDGER:${p.command}:${p.target}`);
    return { actionId: `act_${h.ledger}`, auditId: `aud_${h.ledger}`, sha256Chain: 'c'.repeat(64) };
  },
}));
vi.mock('../../services/submission-service/submission-request-read', async (orig) => {
  const real = await orig<typeof import('../../services/submission-service/submission-request-read')>();
  return {
    ...real,
    getSubmissionForRequest: async () => {
      if (h.readRefused) throw new real.SubmissionReadError(403, 'PROGRAM_ACCESS_DENIED', 'You do not have access to this project.');
      return {};
    },
  };
});

import router from '../../routes/submission-filed-baseline';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: h.userId, organizationId: ORG, role: 'member', roles: ['member', 'regulatory-author'] };
    next();
  });
  a.use('/api/submissions', router);
  return a;
}

type Row = Record<string, any>;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await h.pg.query(sql, params)).rows[0];
const count = async (table: string) => Number((await one(`SELECT count(*)::int AS n FROM ${table}`)).n);
const declare = (submissionId: number, body: Row = {}) => request(app())
  .post(`/api/submissions/${submissionId}/filed-baseline`)
  .send({ lastFiledSequence: '0041', originalSequence: '0000', evidenceDocumentId: EVIDENCE, ...SIGN, ...body });
/** The recipe an inspector re-derives (filed-sequence-baseline/v1). */
const digestOf = (submissionId: number, last: string, original: string) => createHash('sha256')
  .update(JSON.stringify(['filed-sequence-baseline/v1', submissionId, 'US', last, original, EVIDENCE, EVIDENCE_SHA])).digest('hex');

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as typeof h.pg;
  await pg.exec(`CREATE TABLE organizations (id int PRIMARY KEY);
    CREATE TABLE users (id int PRIMARY KEY, name text, email text, title text);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id int NOT NULL, user_id int NOT NULL);
    CREATE FUNCTION public.actor_name(p int) RETURNS TABLE(name text) LANGUAGE sql AS $$ SELECT name FROM users WHERE id = p $$;
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL, lead_user_id int, deleted_at timestamptz);
    CREATE TABLE submissions (id int PRIMARY KEY, organization_id int NOT NULL, primary_region text NOT NULL, program_id uuid, deleted_at timestamptz);
    CREATE TABLE ectd_sequences (id serial PRIMARY KEY, organization_id int NOT NULL, submission_id int NOT NULL, region text NOT NULL,
      sequence_number text NOT NULL, type text NOT NULL DEFAULT 'original', status text NOT NULL DEFAULT 'draft',
      frozen_at timestamptz, dispatch_status text, deleted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE submission_leaves (id serial PRIMARY KEY, sequence_id int NOT NULL);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, organization_id int NOT NULL, content_hash text, created_by int, deleted_at timestamptz);
    INSERT INTO organizations VALUES (${ORG});
    INSERT INTO users VALUES (${LEAD}, 'Lee Lead', 'lead@example.com', 'Head of RA'), (${OTHER}, 'Oli Other', 'other@example.com', NULL);
    INSERT INTO organization_users (organization_id, user_id) VALUES (${ORG}, ${LEAD}), (${ORG}, ${OTHER});
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', ${ORG}, ${LEAD}, NULL), ('${OTHER_PROGRAM}', ${ORG}, ${OTHER}, NULL);
    INSERT INTO vault.documents VALUES ('${EVIDENCE}', ${ORG}, '${EVIDENCE_SHA}', ${LEAD}, NULL);`);
  await pg.exec(`CREATE TABLE electronic_signatures (
    id serial PRIMARY KEY, document_id integer, version_id integer, signed_target text, binding_basis text,
    signature_type varchar(50) NOT NULL, signature_purpose text NOT NULL, signature_level integer DEFAULT 1,
    signer_id integer NOT NULL, signer_name text NOT NULL, signer_title text, signer_email text NOT NULL,
    authentication_method varchar(50) NOT NULL, authentication_timestamp timestamp NOT NULL, second_factor_verified boolean DEFAULT false,
    signature_hash varchar(256) NOT NULL, signature_meaning text, signature_manifest json,
    is_valid boolean DEFAULT true, verification_status varchar(50), verification_date timestamp,
    compliance_statement text, legal_disclaimer text, ip_address varchar(45), device_info json,
    signed_at timestamp DEFAULT now() NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now(),
    organization_id integer, bound_payload_digest text NOT NULL DEFAULT '', superseded_by integer)`);
  await pg.exec(MIGRATION);
}, 60_000);
afterAll(async () => { await (h.pg as unknown as PGlite)?.close(); });
beforeEach(async () => {
  await h.pg.query('DELETE FROM electronic_signatures');
  await h.pg.query('SET session_replication_role = replica');
  await h.pg.query('DELETE FROM submission_filed_baselines');
  await h.pg.query('SET session_replication_role = origin');
  await h.pg.query('DELETE FROM submission_leaves');
  await h.pg.query('DELETE FROM ectd_sequences');
  await h.pg.query('DELETE FROM submissions');
  await h.pg.query(`INSERT INTO submissions VALUES
    (1, ${ORG}, 'fda', '${PROGRAM}', NULL),
    (2, ${ORG}, 'eu', '${PROGRAM}', NULL),
    (3, ${ORG}, 'fda', NULL, NULL),
    (4, ${ORG}, 'fda', '${OTHER_PROGRAM}', NULL)`);
  h.userId = LEAD;
  h.role = 'approver';
  h.readRefused = false;
  h.log.length = 0;
});

describe('declaring the sequences filed outside the platform', () => {
  it('is signed, and the signature binds what was declared and its evidence', async () => {
    const res = await declare(1);
    expect(res.status).toBe(201);
    const row = await one('SELECT * FROM submission_filed_baselines');
    expect(row).toMatchObject({ submission_id: 1, region: 'US', last_filed_sequence: '0041', original_sequence: '0000',
      evidence_sha256: EVIDENCE_SHA, declared_by: LEAD });
    const sig = await one('SELECT * FROM electronic_signatures');
    expect(sig.signed_target).toBe(`submission-filed-baseline:${row.id}`);
    expect(sig.binding_basis).toBe('filed-sequence-baseline-content-sha256');
    expect(sig.bound_payload_digest).toBe(digestOf(1, '0041', '0000'));
    expect(sig.signature_meaning).toBe('responsibility');
    const manifest = typeof sig.signature_manifest === 'string' ? JSON.parse(sig.signature_manifest) : sig.signature_manifest;
    expect(manifest.act).toMatchObject({ lastFiledSequence: '0041', originalSequence: '0000', evidenceSha256: EVIDENCE_SHA,
      removedDraftSequences: [] });
    expect(h.log).toEqual([`LEDGER:sign:submission-filed-baseline:${row.id}`]);
    expect(res.body.signatureId).toBe(sig.id);
  });

  it('is read back with who signed it, the meaning and the next sequence', async () => {
    await declare(1);
    const res = await request(app()).get('/api/submissions/1/filed-baseline');
    expect(res.status).toBe(200);
    expect(res.body.baseline).toMatchObject({ lastFiledSequence: '0041', originalSequence: '0000', declaredByName: 'Lee Lead',
      meaning: 'responsibility', nextSequence: '0042' });
    expect((await request(app()).get('/api/submissions/4/filed-baseline')).body).toEqual({ baseline: null });
  });

  it('removes an empty "Start sequence 0000" draft, and the signed record names it', async () => {
    await h.pg.query(`INSERT INTO ectd_sequences (organization_id, submission_id, region, sequence_number, type)
      VALUES (${ORG}, 1, 'fda', '0000', 'original')`);
    const res = await declare(1);
    expect(res.status).toBe(201);
    expect((await one('SELECT deleted_at FROM ectd_sequences')).deleted_at).not.toBeNull();
    const sig = await one('SELECT signature_manifest FROM electronic_signatures');
    const manifest = typeof sig.signature_manifest === 'string' ? JSON.parse(sig.signature_manifest) : sig.signature_manifest;
    expect(manifest.act.removedDraftSequences).toEqual(['0000']);
  });

  it('a change is a new declaration; the earlier one stays', async () => {
    await declare(1);
    expect((await declare(1, { lastFiledSequence: '0043' })).status).toBe(201);
    expect(await count('submission_filed_baselines')).toBe(2);
    expect(await count('electronic_signatures')).toBe(2);
  });
});

describe('refused, with nothing declared or signed', () => {
  const seed = async (sql: string) => { await h.pg.query(sql); };
  const refusals: Array<{ label: string; submissionId: number; body?: Row; arrange?: () => Promise<void>; status: number; code: string }> = [
    { label: 'the project access read refuses', submissionId: 1, arrange: async () => { h.readRefused = true; }, status: 403, code: 'PROGRAM_ACCESS_DENIED' },
    { label: 'the password is wrong', submissionId: 1, body: { password: 'wrong' }, status: 401, code: 'PASSWORD_VERIFICATION_FAILED' },
    { label: 'the submission is not for the US', submissionId: 2, status: 422, code: 'NOT_US_SUBMISSION' },
    { label: 'the submission has no project', submissionId: 3, status: 422, code: 'UNANCHORED_SUBMISSION' },
    { label: "the signer is not the project's lead or a manager", submissionId: 4, arrange: async () => { h.role = 'member'; }, status: 403, code: 'FORBIDDEN' },
    { label: 'the Original Application is after the last sequence', submissionId: 1, body: { originalSequence: '0042' }, status: 422, code: 'VALIDATION' },
    { label: 'the evidence is not in the Vault', submissionId: 1, body: { evidenceDocumentId: '44444444-4444-4444-8444-444444444444' }, status: 422, code: 'EVIDENCE_NOT_FOUND' },
    { label: 'a US sequence is frozen', submissionId: 1, status: 409, code: 'BASELINE_FIXED',
      arrange: () => seed(`INSERT INTO ectd_sequences (organization_id, submission_id, region, sequence_number, type, status)
        VALUES (${ORG}, 1, 'fda', '0042', 'amendment', 'frozen')`) },
    { label: 'a sequence within them holds content', submissionId: 1, status: 409, code: 'PLATFORM_SEQUENCE_WITHIN_BASELINE',
      arrange: async () => {
        await seed(`INSERT INTO ectd_sequences (id, organization_id, submission_id, region, sequence_number, type)
          VALUES (900, ${ORG}, 1, 'fda', '0000', 'original')`);
        await seed('INSERT INTO submission_leaves (sequence_id) VALUES (900)');
      } },
  ];
  it.each(refusals)('when $label', async ({ submissionId, body, arrange, status, code }) => {
    await arrange?.();
    const res = await declare(submissionId, body);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(await count('submission_filed_baselines')).toBe(0);
    expect(await count('electronic_signatures')).toBe(0);
    expect((await one('SELECT count(*)::int AS n FROM ectd_sequences WHERE deleted_at IS NOT NULL')).n).toBe(0);
  });

  it('the same declaration again', async () => {
    await declare(1);
    const res = await declare(1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BASELINE_UNCHANGED');
    expect(await count('electronic_signatures')).toBe(1);
  });

  it("the signer's standing is asked before the password", async () => {
    h.role = 'member';
    const res = await declare(4, { password: 'wrong' });
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('the database holds a declaration to its signature', () => {
  const insert = (id: string) => h.pg.query(
    `INSERT INTO submission_filed_baselines (id, organization_id, submission_id, region, last_filed_sequence, original_sequence,
       evidence_vault_document_id, evidence_sha256, reason, declared_by)
     VALUES ('${id}', ${ORG}, 1, 'US', '0041', '0000', '${EVIDENCE}', '${EVIDENCE_SHA}', 'Inserted directly', ${LEAD})`);

  it('refuses a declaration written without its signature, at COMMIT', async () => {
    await expect(insert('55555555-5555-4555-8555-555555555555')).rejects.toThrow(/FILED_BASELINE_SIGNATURE_REQUIRED/);
    expect(await count('submission_filed_baselines')).toBe(0);
  });

  it('refuses UPDATE and TRUNCATE', async () => {
    await declare(1);
    await expect(h.pg.query(`UPDATE submission_filed_baselines SET last_filed_sequence = '0050'`)).rejects.toThrow(/SUBMISSION_FILED_BASELINE_IMMUTABLE/);
    await expect(h.pg.query('TRUNCATE submission_filed_baselines')).rejects.toThrow(/SUBMISSION_FILED_BASELINE_IMMUTABLE/);
    expect(await count('submission_filed_baselines')).toBe(1);
  });

  it('the migration replays', async () => {
    await (h.pg as unknown as PGlite).exec(MIGRATION);
    await (h.pg as unknown as PGlite).exec(MIGRATION);
    const triggers = await one(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'public.submission_filed_baselines'::regclass AND NOT tgisinternal`);
    expect(triggers.n).toBe(3);
  });
});
