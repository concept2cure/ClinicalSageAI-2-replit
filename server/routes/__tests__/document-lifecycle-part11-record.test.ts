/**
 * A lifecycle sign-off is a Part 11 signature record, bound to content the
 * server reads (VR-12, row D5).
 *
 * Before: POST /:id/sign and advance → approved recorded a `csig:<uuid>` JSON
 * object on the canonical row. No electronic_signatures row, no printed name,
 * no content binding. The org-wide trail went through logAction, which runs on
 * its own connection and swallows a failure, so a stage change could commit
 * with no audit row. The content hash was whatever the request body said, and
 * nothing stopped the author from reviewing and approving their own document.
 *
 * Here the route runs with its PRODUCTION bindings against PGlite, with the
 * real D6 signature migration and the real §11.70 trigger applied
 * (createIndPgliteDb({ governedSigning: true })). Only the credential check is
 * a stand-in.
 */
import express from 'express';
import request from 'supertest';
import { createHash, timingSafeEqual } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { createDocumentLifecycleRouter } from '../document-lifecycle';

// P-27 (2026-10-08): signing authority is the platform's one policy
// (checkSigningAuthority), which reads the signer's membership role through
// resolveSignerOrgRole on the process database. This router runs on the
// harness, where every seeded user is an admin of ORG (beforeAll); the stand-in
// answers that, and nothing for any other organization.
vi.mock('../../services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: async (_userId: number, organizationId: number) => (organizationId === 1 ? 'admin' : null),
}));
import type { SignerCredentials, SignerReverification } from '../../services/part11/reverify-signer';

const ORG = 1;
const OTHER_ORG = 2;
const PASSWORD = 'correct horse battery staple';
/** The signer's own reason: a sign-off carries one (VR-13; none is written for them). */
const REASON = 'Checked against the protocol';
const AUTHOR = 42;
const REVIEWER = 43;
const APPROVER = 44;
const UPLOADER = 45;
const VAULT_HASH = createHash('sha256').update('the bytes the sponsor uploaded').digest('hex');

let harness: IndPgliteDb;
let vaultId: string;
let otherOrgVaultId: string;
let reverifyCalls = 0;

async function reverify(_userId: number, creds: SignerCredentials): Promise<SignerReverification> {
  reverifyCalls += 1;
  const given = Buffer.from(String(creds.password ?? ''));
  const expected = Buffer.from(PASSWORD);
  // Constant-time, as the real ceremony's bcrypt compare is.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'invalid credentials' };
  }
  return { ok: true, authenticationMethod: 'password', secondFactorVerified: false };
}

/** The route as mounted in production, acting as `userId` (an org admin). */
function appAs(userId: number): express.Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as express.Request & { tenantContext?: unknown }).tenantContext = { organizationId: ORG };
    (req as express.Request & { user?: unknown }).user = {
      id: userId,
      organizationId: ORG,
      role: 'admin',
      roles: ['admin', 'regulatory-author'],
    };
    next();
  });
  a.use('/docs', createDocumentLifecycleRouter({ db: harness.db as never, reverify }));
  return a;
}

const q = async <T = any>(sql: string, params: unknown[] = []) => (await harness.pglite.query<T>(sql, params)).rows;
const sign = (userId: number, id: string) =>
  request(appAs(userId)).post(`/docs/${id}/sign`).send({ meaning: 'reviewed', password: PASSWORD, reason: REASON });
const advance = (userId: number, id: string, to: string, extra: Record<string, unknown> = {}) =>
  request(appAs(userId)).post(`/docs/${id}/advance`).send({ to, ...extra });
const signatures = (id: string) =>
  q(`SELECT * FROM electronic_signatures WHERE signed_target = $1 ORDER BY id`, [`canonical_document:${id}`]);
const stageOf = async (id: string) => (await q<{ stage: string }>('SELECT stage FROM canonical_documents WHERE canonical_id = $1', [id]))[0].stage;

/**
 * A document created by AUTHOR over a fresh Vault version UPLOADER uploaded.
 * Fresh, because a version has one lifecycle record (VR-13): starting it again
 * returns the same one.
 */
async function vaultDocument(extra: Record<string, unknown> = {}): Promise<string> {
  vaultId = (await q<{ id: string }>(
    `INSERT INTO vault.documents (organization_id, content_hash, created_by, document_code, document_title, document_type, version)
     VALUES ($1, $2, $3, gen_random_uuid()::text, 'Clinical Overview', 'US_IND', '1.0') RETURNING id`,
    [ORG, VAULT_HASH, UPLOADER],
  ))[0].id;
  const res = await request(appAs(AUTHOR))
    .post('/docs')
    .send({
      title: 'Clinical Overview',
      documentType: 'US_IND',
      hasContent: true,
      sources: { vault_documents: { nativeId: vaultId, role: 'content' } },
      ...extra,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.canonicalId;
}

async function inReview(): Promise<string> {
  const id = await vaultDocument();
  expect((await advance(AUTHOR, id, 'in_review')).status).toBe(200);
  return id;
}

/** Make every INSERT into `table` fail, run `fn`, then lift it. */
async function refusingInserts<T>(table: string, fn: () => Promise<T>): Promise<T> {
  await harness.pglite.exec(`ALTER TABLE ${table} ADD CONSTRAINT vr12_injected_failure CHECK (false) NOT VALID`);
  try {
    return await fn();
  } finally {
    await harness.pglite.exec(`ALTER TABLE ${table} DROP CONSTRAINT vr12_injected_failure`);
  }
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ leafSources: true, governedSigning: true });
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id UUID NOT NULL DEFAULT gen_random_uuid(),
      organization_id INTEGER,
      content_hash CHARACTER(64) NOT NULL,
      created_by INTEGER,
      deleted_at TIMESTAMPTZ,
      -- What a lifecycle record takes from its version, and the family rule (VR-13).
      document_code TEXT,
      document_title TEXT,
      document_type TEXT,
      version TEXT,
      supersedes_id UUID
    );`);
  for (const [id, name] of [
    [AUTHOR, 'Ana Author'],
    [REVIEWER, 'Rae Reviewer'],
    [APPROVER, 'Abe Approver'],
    [UPLOADER, 'Uma Uploader'],
  ] as const) {
    await q('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [id, `${name.split(' ')[0].toLowerCase()}@example.test`, name]);
    await q('INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)', [ORG, id, 'admin']);
  }
  vaultId = (await q<{ id: string }>(
    'INSERT INTO vault.documents (organization_id, content_hash, created_by) VALUES ($1, $2, $3) RETURNING id',
    [ORG, VAULT_HASH, UPLOADER],
  ))[0].id;
  otherOrgVaultId = (await q<{ id: string }>(
    'INSERT INTO vault.documents (organization_id, content_hash, created_by) VALUES ($1, $2, $3) RETURNING id',
    [OTHER_ORG, VAULT_HASH, UPLOADER],
  ))[0].id;
});

afterAll(async () => {
  await harness.close();
});

describe('a review sign-off is an electronic signature record (VR-12)', () => {
  it('writes exactly one electronic_signatures row, bound to the Vault version, and one chained audit row', async () => {
    const id = await inReview();
    const res = await sign(REVIEWER, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const rows = await signatures(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      signer_id: REVIEWER,
      signer_name: 'Rae Reviewer',
      signature_meaning: 'REVIEWED',
      bound_payload_digest: VAULT_HASH,
      binding_basis: 'vault-document-version-sha256',
      organization_id: ORG,
    });
    // The canonical copy names the record, not a minted reference.
    expect(res.body.signature.signatureRef).toBe(`esig:${rows[0].id}`);
    expect(res.body.signature.boundContentHash).toBe(VAULT_HASH);

    const audit = await q(
      `SELECT action, sha256_chain FROM audit_logs WHERE target = $1 AND action LIKE '%sign%'`,
      [`canonical_document:${id}`],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    // The signature's manifest names that audit row's chain hash.
    const manifest = rows[0].signature_manifest;
    expect((typeof manifest === 'string' ? JSON.parse(manifest) : manifest).auditSha256Chain).toBe(audit[0].sha256_chain);
  });

  it('approving writes its own record, bound to the same content, with the approver named', async () => {
    const id = await inReview();
    expect((await sign(REVIEWER, id)).status).toBe(200);
    const res = await advance(APPROVER, id, 'approved', { reason: REASON, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const rows = await signatures(id);
    expect(rows.map((r) => [r.signer_name, r.signature_meaning, r.bound_payload_digest])).toEqual([
      ['Rae Reviewer', 'REVIEWED', VAULT_HASH],
      ['Abe Approver', 'APPROVED', VAULT_HASH],
    ]);
    const [row] = await q('SELECT approval_signature FROM canonical_documents WHERE canonical_id = $1', [id]);
    expect(row.approval_signature.signatureRef).toBe(`esig:${rows[1].id}`);
  });

  it('a document with no source the server can read binds the ledger, and says so', async () => {
    const res = await request(appAs(AUTHOR)).post('/docs').send({ title: 'No source', documentType: 'US_IND', hasContent: true });
    const id: string = res.body.canonicalId;
    expect((await advance(AUTHOR, id, 'in_review')).status).toBe(200);
    expect((await sign(REVIEWER, id)).status).toBe(200);
    const [row] = await signatures(id);
    expect(row.binding_basis).toBe('governed-action-sha256-chain');
    const [ledger] = await q(`SELECT sha256_chain FROM audit_logs WHERE target = $1 AND action LIKE '%sign%'`, [`canonical_document:${id}`]);
    expect(row.bound_payload_digest).toBe(ledger.sha256_chain);
  });

  it('the signature record refuses UPDATE (control: the §11.70 trigger is in force here)', async () => {
    const id = await inReview();
    expect((await sign(REVIEWER, id)).status).toBe(200);
    const [row] = await signatures(id);
    await expect(
      harness.pglite.query(`UPDATE electronic_signatures SET signer_name = 'Someone Else' WHERE id = $1`, [row.id]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });
});

describe('the content hash is the server reading, never the request', () => {
  it('ignores a body contentHash: the stored hash is the Vault row\'s', async () => {
    const id = await vaultDocument({ contentHash: 'forged' });
    const [row] = await q('SELECT content_hash, has_content FROM canonical_documents WHERE canonical_id = $1', [id]);
    expect(row.content_hash).toBe(VAULT_HASH);
    expect(row.has_content).toBe(true);
  });

  it('ignores a body contentHash on a document with no readable source', async () => {
    const res = await request(appAs(AUTHOR)).post('/docs').send({ title: 'x', documentType: 'US_IND', contentHash: 'forged' });
    const [row] = await q('SELECT content_hash FROM canonical_documents WHERE canonical_id = $1', [res.body.canonicalId]);
    expect(row.content_hash).toBe('');
  });

  it('ignores a body contentHash on a transition: the trail records the stored one', async () => {
    const id = await vaultDocument();
    expect((await advance(AUTHOR, id, 'in_review', { contentHash: 'forged' })).status).toBe(200);
    const [row] = await q('SELECT audit FROM canonical_documents WHERE canonical_id = $1', [id]);
    expect(row.audit[0].contentHash).toBe(VAULT_HASH);
  });

  it('refuses a Vault source that is not this organization\'s, and records nothing', async () => {
    const before = (await q('SELECT count(*)::int AS n FROM canonical_documents'))[0].n;
    const res = await request(appAs(AUTHOR))
      .post('/docs')
      .send({ title: 'x', documentType: 'US_IND', sources: { vault_documents: { nativeId: otherOrgVaultId, role: 'content' } } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VAULT_SOURCE_NOT_FOUND');
    expect((await q('SELECT count(*)::int AS n FROM canonical_documents'))[0].n).toBe(before);
  });
});

describe('signature, audit row and stage change commit together or not at all', () => {
  it('an audit INSERT that fails rolls the transition back', async () => {
    const id = await vaultDocument();
    const res = await refusingInserts('audit_logs', () => advance(AUTHOR, id, 'in_review'));
    expect(res.status).toBe(500);
    expect(await stageOf(id)).toBe('authoring');
  });

  it('a signature INSERT that fails rolls the approval back', async () => {
    const id = await inReview();
    expect((await sign(REVIEWER, id)).status).toBe(200);
    const res = await refusingInserts('electronic_signatures', () => advance(APPROVER, id, 'approved', { reason: REASON, password: PASSWORD }));
    expect(res.status).toBe(500);
    expect(await stageOf(id)).toBe('in_review');
    expect(await signatures(id)).toHaveLength(1);
  });

  it('a signature INSERT that fails leaves no review sign-off', async () => {
    const id = await inReview();
    const res = await refusingInserts('electronic_signatures', () => sign(REVIEWER, id));
    expect(res.status).toBe(500);
    const [row] = await q('SELECT review_signature, audit FROM canonical_documents WHERE canonical_id = $1', [id]);
    expect(row.review_signature).toBeNull();
    expect(row.audit).toHaveLength(1);
  });
});

describe('nobody signs off a document they created or uploaded', () => {
  it('the creator cannot review it: 403 SELF_APPROVAL, before any credential check, and nothing is written', async () => {
    const id = await inReview();
    reverifyCalls = 0;
    const res = await sign(AUTHOR, id);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SELF_APPROVAL');
    expect(reverifyCalls).toBe(0);
    expect(await signatures(id)).toHaveLength(0);
  });

  it('the uploader of the Vault version cannot review it', async () => {
    const id = await inReview();
    const res = await sign(UPLOADER, id);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SELF_APPROVAL');
  });

  it('the creator cannot approve it after someone else reviewed it', async () => {
    const id = await inReview();
    expect((await sign(REVIEWER, id)).status).toBe(200);
    const res = await advance(AUTHOR, id, 'approved', { reason: REASON, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SELF_APPROVAL');
    expect(await stageOf(id)).toBe('in_review');
  });

  it('the creator is recorded, and the record cannot be reassigned', async () => {
    const id = await vaultDocument();
    const [row] = await q('SELECT created_by FROM canonical_documents WHERE canonical_id = $1', [id]);
    expect(row.created_by).toBe(AUTHOR);
    await expect(
      harness.pglite.query('UPDATE canonical_documents SET created_by = $1 WHERE canonical_id = $2', [REVIEWER, id]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });
});

describe('a review covers the content it was signed over', () => {
  it('after a revision that changed the content, the round-1 review does not satisfy the approval gate', async () => {
    const res = await request(appAs(AUTHOR)).post('/docs').send({ title: 'Revised', documentType: 'US_IND', hasContent: true });
    const id: string = res.body.canonicalId;
    expect((await advance(AUTHOR, id, 'in_review')).status).toBe(200);
    expect((await sign(REVIEWER, id)).status).toBe(200);
    expect((await advance(REVIEWER, id, 'authoring', { reason: 'revise section 2' })).status).toBe(200);
    // The content changes while the document is back in authoring.
    await q(`UPDATE canonical_documents SET content_hash = 'revised' WHERE canonical_id = $1`, [id]);
    expect((await advance(AUTHOR, id, 'in_review')).status).toBe(200);
    const stale = await advance(APPROVER, id, 'approved', { reason: REASON, password: PASSWORD });
    expect(stale.status).toBe(409);
    expect(stale.body.blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');
  });
});
