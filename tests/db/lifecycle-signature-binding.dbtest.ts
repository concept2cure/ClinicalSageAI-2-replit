/**
 * What a lifecycle sign-off binds, and who may not sign it, on the real schema
 * (VR-12, row D5): read as the runtime role, in the tenant's scope, with RLS
 * enforcing. The route's own flow is pinned on PGlite
 * (server/routes/__tests__/document-lifecycle-part11-record.test.ts); this
 * proves the two reads it depends on work where RLS and grants are real:
 *
 *   - the Vault version's hash, read FOR SHARE (a row lock needs UPDATE
 *     privilege and passes the UPDATE policy), and not another tenant's;
 *   - the separation-of-duties authorship: the canonical record's creator and
 *     the Vault version's uploader.
 *
 * And that the amended guard refuses a reassigned creator on PostgreSQL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-lifecycle-binding ';
const CODE = 'DBTEST-LCSIG';
const CREATOR = 7101;
const UPLOADER = 7102;
const REVIEWER = 7103;
const HASH = 'ab'.repeat(32);

let owner: Pool;
const org: Record<'mine' | 'theirs', { id: number; uuid: string; programId: string; vaultId: string }> = {} as never;
let canonicalId: string;

async function asTenant<T>(which: 'mine' | 'theirs', fn: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { pool } = await import('../../server/db');
  const o = org[which];
  return runWithTenantScope(
    { tenantId: String(o.id), orgUuid: o.uuid, role: 'admin', source: 'request', caller: 'tests/db/lifecycle-signature-binding.dbtest.ts' },
    () => fn(pool),
  );
}

async function cleanup() {
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]).catch(() => {});
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE}%`],
  ).catch(() => {});
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]).catch(() => {});
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();
  for (const which of ['mine', 'theirs'] as const) {
    const o = await owner.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
      [`${PROBE}${which}`, `dbtest-lcsig-${which}`],
    );
    const p = await owner.query(
      `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Signin 5mg') RETURNING id`,
      [`${PROBE}${which} program`, `${CODE}-${which.toUpperCase()}`, o.rows[0].id],
    );
    const v = await owner.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
         content_hash, s3_bucket, s3_key, file_name, created_by)
       VALUES ($1, $2, $3, 'Clinical Overview', 'OTHER', '1.0', $4, 'local', 'k', 'overview.pdf', $5) RETURNING id`,
      [p.rows[0].id, o.rows[0].id, `${CODE}-${which}`, HASH, UPLOADER],
    );
    org[which] = { id: Number(o.rows[0].id), uuid: String(o.rows[0].uuid), programId: String(p.rows[0].id), vaultId: String(v.rows[0].id) };
  }
  canonicalId = randomUUID();
  // canonical_documents rows cannot be deleted (VR-03), so each run makes a
  // fresh one; the probe tenant is the only one that sees them.
  await owner.query(
    `INSERT INTO canonical_documents (canonical_id, organization_id, title, document_type, has_content, content_hash, source_refs, created_by)
     VALUES ($1, $2, 'Clinical Overview', 'US_IND', true, $3, $4::jsonb, $5)`,
    [canonicalId, org.mine.id, HASH, JSON.stringify({ vault_documents: { nativeId: org.mine.vaultId, role: 'content' } }), CREATOR],
  );
});

afterAll(async () => {
  await cleanup();
  await owner.end().catch(() => {});
});

describe('the Vault binding, as the runtime role (VR-12)', () => {
  it('reads this organization\'s version under a share lock, and not another\'s', async () => {
    const { readVaultSource } = await import('../../server/services/regulatory/lifecycle-signature');
    const mine = await asTenant('mine', (c) => readVaultSource(c, org.mine.id, org.mine.vaultId, { lock: true }));
    expect(mine).toEqual({ id: org.mine.vaultId, contentHash: HASH, createdBy: UPLOADER });
    // Their version, named from my scope, whichever organization id is passed.
    expect(await asTenant('mine', (c) => readVaultSource(c, org.theirs.id, org.theirs.vaultId, { lock: true }))).toBeNull();
    expect(await asTenant('mine', (c) => readVaultSource(c, org.mine.id, org.theirs.vaultId, { lock: true }))).toBeNull();
  });

  it('binds the version hash, and refuses when the document recorded another', async () => {
    const { deriveLifecycleBinding, LifecycleSignatureRefusal } = await import('../../server/services/regulatory/lifecycle-signature');
    const doc = {
      canonicalId, title: 'Clinical Overview', documentType: 'US_IND', organizationId: org.mine.id, version: 1,
      stage: 'in_review' as const, createdAt: '', updatedAt: '', hasContent: true, contentHash: HASH, audit: [],
      sources: { vault_documents: { nativeId: org.mine.vaultId, role: 'content' as const } },
    };
    const binding = await asTenant('mine', (c) => deriveLifecycleBinding(c, doc));
    expect(binding).toMatchObject({ digest: HASH, basis: 'vault-document-version-sha256', contentHash: HASH });
    await expect(asTenant('mine', (c) => deriveLifecycleBinding(c, { ...doc, contentHash: 'cd'.repeat(32) }))).rejects.toBeInstanceOf(
      LifecycleSignatureRefusal,
    );
  });
});

describe('separation of duties for a lifecycle document, as the runtime role', () => {
  it('the creator and the uploader are its authors; a third person may sign', async () => {
    const { assertSignerIsNotAuthor, SeparationOfDutiesError } = await import('../../server/services/governance/separation-of-duties');
    const target = `canonical_document:${canonicalId}`;
    for (const author of [CREATOR, UPLOADER]) {
      await expect(
        asTenant('mine', (c) => assertSignerIsNotAuthor(target, org.mine.id, author, { command: 'sign', meaning: 'REVIEWED', client: c })),
        String(author),
      ).rejects.toBeInstanceOf(SeparationOfDutiesError);
    }
    const ok = await asTenant('mine', (c) =>
      assertSignerIsNotAuthor(target, org.mine.id, REVIEWER, { command: 'sign', meaning: 'REVIEWED', client: c }),
    );
    expect(ok.checked).toBe(true);
    expect(ok.reason).toMatch(/lifecycle record creator/);
    expect(ok.reason).toMatch(/Vault uploader/);
  });

  it('the recorded creator cannot be reassigned', async () => {
    await expect(
      owner.query('UPDATE canonical_documents SET created_by = $1 WHERE canonical_id = $2', [REVIEWER, canonicalId]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });
});
