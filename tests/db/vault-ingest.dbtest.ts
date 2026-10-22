/**
 * `POST /api/vault/ingest` against real PostgreSQL — the W0-6 acceptance gate.
 *
 * ── Why a real database is the only thing that could have caught this ────────
 * This route is the ONLY endpoint in the product that persists uploaded bytes,
 * computes a SHA-256 of them, and writes a document row. It has never worked.
 *
 * `vault.documents` had two definitions that never agreed: an 11-column table
 * from `db/migrations/044c_gcc_vault_schema.sql` (created with CREATE TABLE IF
 * NOT EXISTS, so it wins), and the 28-column Drizzle model in
 * `shared/schema/vault.ts` that the route is written against. Against a
 * provisioned database the INSERT raised
 *
 *     ERROR:  column "document_code" of relation "documents" does not exist
 *
 * so every upload in the product returned 500. A mocked pool cannot witness
 * that — it has no catalog, so it cannot be missing a column, and the mocked
 * suites were green throughout. The divergence is a property of a real
 * database, and only a real database can see it.
 *
 * ── What this suite pins ─────────────────────────────────────────────────────
 *   1. an upload SUCCEEDS and the row carries the SHA-256 of the actual bytes
 *   2. the bytes are on disk at the key the row records — a hash for bytes
 *      nobody holds is a record that lies, and the route used to produce
 *      exactly that by treating the write as best-effort
 *   3. the ingestion left a hash-chained `audit_logs` row naming the actor and
 *      the content hash — a document that entered the governed corpus with no
 *      record of who put it there is not evidence a tenant can defend
 *   4. the document and its audit row are ATOMIC — neither can exist alone
 *   5. a caller from another organization is refused and writes nothing
 *   6. an upload refused AFTER its bytes were stored leaves no copy in the
 *      tenant's storage — the refusal says nothing was changed or saved, and
 *      a copy under no record is one no surface can list or delete
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { databaseUrl } from '../setup.db';

const RUN_ID = randomUUID();
/** Fresh QA identities and stored records survive the check. */
const PROBE_PREFIX = `dbtest-w06 ${RUN_ID} `;
const PROBE_CODE = `DBTEST-W06-${RUN_ID.slice(0, 12)}`;

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let otherOrgUuid: string;
let userId: number;
const roleActorIds = {} as Record<'viewer' | 'member' | 'missingMembership', number>;
let programId: string;
let otherProgramId: string;
let app: express.Express;

/** A real PDF, minimal but with the magic bytes the upload-safety check needs. */
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf8',
);
const PDF_SHA256 = createHash('sha256').update(PDF_BYTES).digest('hex');

/**
 * The router under test uses a signed token for the explicit seeded actor
 * and canonical requireTenantContext. Actual OU role and request SQL scope
 * are verified before ingestion. `req.user.organizationId` is what the route's ownership guard
 * reads, so switching it is how the cross-tenant case below is expressed.
 */
let actingOrgId: () => number;

async function buildApp(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { requireTenantContext } = await import('../../server/middleware/tenantContext');
  const a = express();
  a.use(requireTenantContext);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

function actingRequest() {
  const actingOrg = actingOrgId();
  const token = jwt.sign({ type: 'access', userId: String(userId), organizationId: String(actingOrg),
    organizationUuid: actingOrg === orgId ? orgUuid : otherOrgUuid }, activeJwtSecret(), { expiresIn: '15m' });
  return { post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`) };
}

async function seedRoleActor(role: 'viewer' | 'member' | 'missingMembership'): Promise<number> {
  const actor = Number((await owner.query("INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,'not-a-real-hash','active') RETURNING id",
    [`dbtest-w06-${RUN_ID}-${role}@example.invalid`, `${PROBE_PREFIX}${role}`])).rows[0].id);
  if (role !== 'missingMembership') await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, actor, role]);
  return actor;
}

async function anchorProgram(organizationId: number, selectedProgramId: string, actorId: number): Promise<number> {
  const { ensureOrganizationDefaultWorkspace, poolClientWorkspaceStore } = await import('../../server/services/c2c/organization-default-workspace');
  const { requireProgramProjectAnchor } = await import('../../server/services/c2c/program-project-anchor');
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await ensureOrganizationDefaultWorkspace(poolClientWorkspaceStore(client), { orgId: organizationId, orgName: `${PROBE_PREFIX}tenant`, orgSlug: `dbtest-w06-${RUN_ID}-${organizationId}` });
    const anchor = await requireProgramProjectAnchor({ client, orgId: organizationId, userId: actorId, programId: selectedProgramId,
      name: `${PROBE_PREFIX}device project`, code: PROBE_CODE, priority: 'normal', metadata: { registryId: 'US_510K', submissionType: 'US_510K' } });
    await client.query('COMMIT');
    return anchor.projectId;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

/** Inspect only this invocation's exact tenant rows and actual provider scopes. */
async function denialState(scopes: Array<{ organizationId: number; programId: string }>) {
  const { getStorageProvider } = await import('../../server/services/storage/index');
  const organizationIds = [...new Set(scopes.map((scope) => scope.organizationId))];
  const { rows } = await owner.query(
    `SELECT (SELECT count(*)::int FROM vault.documents WHERE organization_id = ANY($1::int[])) AS documents,
            (SELECT count(*)::int FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND action = 'vault.document.ingest') AS ingest_audits`,
    [organizationIds],
  );
  const storage = await Promise.all(scopes.map(async (scope) => ({
    ...scope,
    versionIds: (await getStorageProvider().list(scope.organizationId, scope.programId))
      .map((entry) => entry.vaultVersionId).sort(),
  })));
  return { counts: rows[0], storage };
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
    [`${PROBE_PREFIX}tenant`, `dbtest-w06-${RUN_ID}-tenant`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(
    (await owner.query('SELECT uuid FROM organizations WHERE id = $1', [orgId])).rows[0].uuid,
  );

  const other = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
    [`${PROBE_PREFIX}other tenant`, `dbtest-w06-${RUN_ID}-other`],
  );
  otherOrgId = Number(other.rows[0].id);
  otherOrgUuid = String(
    (await owner.query('SELECT uuid FROM organizations WHERE id = $1', [otherOrgId])).rows[0].uuid,
  );

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [`dbtest-w06-${RUN_ID}@example.invalid`, `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$3,'admin'),($2,$3,'admin')", [orgId, otherOrgId, userId]);
  for (const role of ['viewer', 'member', 'missingMembership'] as const) roleActorIds[role] = await seedRoleActor(role);

  const prog = await owner.query(
    /* Every NOT NULL column without a default. The suite provisions its own
       fixture rather than depending on whatever seed the surrounding CI job ran. */
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}device program`, 'DBTEST-W06-A', orgId, 'AeroFlow AF-1000'],
  );
  programId = String(prog.rows[0].id);

  const otherProg = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}other tenant program`, 'DBTEST-W06-B', otherOrgId, 'Other AF-2000'],
  );
  otherProgramId = String(otherProg.rows[0].id);

  const projectId = await anchorProgram(orgId, programId, userId);
  await anchorProgram(otherOrgId, otherProgramId, userId);
  await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'edit','active')", [orgId, projectId, roleActorIds.member]);
  actingOrgId = () => orgId;
  app = await buildApp();
});

afterAll(async () => {
  await owner.end().catch(() => {});
});

describe('POST /api/vault/ingest — the document actually lands', () => {
  it('accepts the upload and records the SHA-256 of the bytes that were sent', async () => {
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', PROBE_CODE)
      .field('documentTitle', 'Design History File extract')
      .field('documentType', 'OTHER')
      .attach('file', PDF_BYTES, 'dhf-extract.pdf');

    expect(res.status).toBe(201);
    expect(res.body.document.contentHash).toBe(PDF_SHA256);
    expect(res.body.document.fileSize).toBe(PDF_BYTES.length);
  });

  it('persisted a row carrying the canonical columns the route writes', async () => {
    /* Each of these was one of the sixteen columns that did not exist. Asserting
       the VALUES rather than the row count is what makes this a regression test
       for the schema divergence rather than for the handler. */
    const { rows } = await owner.query(
      `SELECT document_code, document_title, document_type, s3_bucket, s3_key,
              file_name, file_size, mime_type, content_hash, classification,
              processing_status, created_by
         FROM vault.documents WHERE document_code = $1`,
      [PROBE_CODE],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      document_code: PROBE_CODE,
      document_title: 'Design History File extract',
      document_type: 'OTHER',
      s3_bucket: 'local',
      file_name: 'dhf-extract.pdf',
      mime_type: 'application/pdf',
      content_hash: PDF_SHA256,
      classification: 'INTERNAL',
      processing_status: 'PENDING',
    });
    /* created_by is an INTEGER matching users.id. As the model's original uuid
       this column could never have held a real value. */
    expect(Number(rows[0].created_by)).toBe(userId);
  });

  it('the bytes are retrievable at the address the row records', async () => {
    /* The route used to catch a failed write, log it at warn, and INSERT
       anyway — committing a real SHA-256 for bytes that are not anywhere. The
       row and the stored object have to agree, so fetch what the row points at
       and hash it back.

       Read through the provider, not off the filesystem. The vault moved onto
       the canonical storage seam: `s3_key` now carries the provider's own
       handle (`vault:/...`), not a path, and `storage_version_id` is the
       authoritative address — which is why resolving s3_key with path.resolve
       started reading a directory that does not exist. Going through
       getStorageProvider().get is also what proves the claim that matters: the
       bytes are reachable BY THE WAY THE PRODUCT REACHES THEM, including the
       orgId the provider requires because object storage sits outside RLS. */
    const { rows } = await owner.query(
      `SELECT storage_version_id FROM vault.documents WHERE document_code = $1`,
      [PROBE_CODE],
    );
    expect(rows[0].storage_version_id, 'ingest must record a provider address').toBeTruthy();
    const { getStorageProvider } = await import('../../server/services/storage/index');
    const got = await getStorageProvider().get(String(rows[0].storage_version_id), orgId);
    expect(got, 'the stored version must be readable for the owning organization').toBeTruthy();
    expect(createHash('sha256').update(got!.bytes).digest('hex')).toBe(PDF_SHA256);
  });
});

describe('POST /api/vault/ingest — the Part 11 record of who put it there', () => {
  it('wrote a hash-chained audit row naming the actor and the content hash', async () => {
    const { rows } = await owner.query(
      `SELECT a.action, a.actor_id, a.tenant_id, a.sha256_chain, a.payload_hash, a.new_values
         FROM audit_logs a
         JOIN vault.documents d ON d.id::text = a.record_id
        WHERE d.document_code = $1 AND a.action = 'vault.document.ingest'`,
      [PROBE_CODE],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].actor_id)).toBe(userId);
    expect(Number(rows[0].tenant_id)).toBe(orgId);
    /* The chain link and the payload digest are what make the entry evidence
       rather than a log line. */
    expect(rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);

    const details =
      typeof rows[0].new_values === 'string' ? JSON.parse(rows[0].new_values) : rows[0].new_values;
    /* WHICH bytes were admitted, not merely that an upload happened — this is
       the link that makes a later integrity check mean anything. */
    expect(JSON.stringify(details)).toContain(PDF_SHA256);
  });

  it('a document and its audit row cannot exist without each other', async () => {
    const docs = await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE document_code LIKE $1`,
      [`${PROBE_CODE}%`],
    );
    const audits = await owner.query(
      `SELECT count(*)::int AS n FROM audit_logs a
         JOIN vault.documents d ON d.id::text = a.record_id
        WHERE d.document_code LIKE $1 AND a.action = 'vault.document.ingest'`,
      [`${PROBE_CODE}%`],
    );
    /* Both writes share one transaction, so the counts move together. Before
       this change the second was structurally always zero. */
    expect(audits.rows[0].n).toBe(docs.rows[0].n);
    expect(docs.rows[0].n).toBeGreaterThan(0);
  });
});

describe('POST /api/vault/ingest — another tenant cannot write into your program', () => {
  it('refuses the upload and leaves nothing behind', async () => {
    const scopes = [{ organizationId: orgId, programId: otherProgramId },
      { organizationId: otherOrgId, programId: otherProgramId }];
    const beforeState = await denialState(scopes);
    const before = await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE program_id = $1`,
      [otherProgramId],
    );

    /* The caller is authenticated in the first org and targets the second
       org's real anchored program. Current parent admission refuses that
       identity before document or storage writes. */
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', otherProgramId)
      .field('documentCode', `${PROBE_CODE}-CROSS`)
      .field('documentTitle', 'Should never land')
      .field('documentType', 'OTHER')
      .attach('file', PDF_BYTES, 'cross-tenant.pdf');

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    /* The refusal names no table, no column and no query. */
    expect(JSON.stringify(res.body)).not.toMatch(/vault\.|regulatory_programs|SELECT|relation/i);

    const after = await owner.query(
      `SELECT count(*)::int AS n FROM vault.documents WHERE program_id = $1`,
      [otherProgramId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    expect(await denialState(scopes)).toEqual(beforeState);
  });
});

describe('POST /api/vault/ingest — a refused upload leaves no bytes behind', () => {
  /* Each refusal below happens after the provider has already written the
     bytes. Listed through the provider — the same seam the product stores
     through — so the assertion is about what the tenant's storage holds, not
     about a path this suite guesses at. */
  async function storedVersionIds(): Promise<Set<string>> {
    const { getStorageProvider } = await import('../../server/services/storage/index');
    return new Set((await getStorageProvider().list(orgId, programId)).map((o) => o.vaultVersionId));
  }
  /* Bytes that differ from PDF_BYTES but still carry the PDF signature. */
  const revised = (tag: string) => Buffer.concat([PDF_BYTES, Buffer.from(`% ${tag}\n`, 'utf8')]);

  it('different bytes at an occupied code and version: 409, and no new object in storage', async () => {
    const before = await storedVersionIds();
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', PROBE_CODE)
      .field('documentTitle', 'A different file under the same code')
      .field('documentType', 'OTHER')
      .attach('file', revised('version-conflict'), 'dhf-extract.pdf');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONTENT_CONFLICT');
    expect([...(await storedVersionIds())].filter((id) => !before.has(id))).toEqual([]);
  });

  it('the same bytes under a second code: 409, no new object, and the original still reads back', async () => {
    const before = await storedVersionIds();
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-DUP`)
      .field('documentTitle', 'The same file filed twice')
      .field('documentType', 'OTHER')
      .attach('file', PDF_BYTES, 'dhf-extract-copy.pdf');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CONTENT');
    expect([...(await storedVersionIds())].filter((id) => !before.has(id))).toEqual([]);

    /* The discard removes the refused attempt's OWN version — a fresh id per
       put — so the admitted record's bytes, which are the same bytes, are
       untouched. */
    const { rows } = await owner.query(
      `SELECT storage_version_id FROM vault.documents WHERE document_code = $1`,
      [PROBE_CODE],
    );
    const { getStorageProvider } = await import('../../server/services/storage/index');
    const got = await getStorageProvider().get(String(rows[0].storage_version_id), orgId);
    expect(got, 'the admitted document must still be readable').toBeTruthy();
    expect(createHash('sha256').update(got!.bytes).digest('hex')).toBe(PDF_SHA256);
  });

  it('a folder outside the program taxonomy: 400, and no new object in storage', async () => {
    const before = await storedVersionIds();
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-FOLDER`)
      .field('documentTitle', 'Filed into a folder that does not exist')
      .field('documentType', 'OTHER')
      .field('folderId', 'dbtest-no-such-folder')
      .attach('file', revised('invalid-folder'), 'misfiled.pdf');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FOLDER');
    expect([...(await storedVersionIds())].filter((id) => !before.has(id))).toEqual([]);
  });

  it('the reference check the discard relies on sees an admitted record, as the runtime role', async () => {
    /* The discard deletes only after asking whether a record points at the
       version. Under RLS a query that cannot see the row answers "no", so a
       blinded check would turn the safeguard into a deletion of a record's
       bytes. Asked here in the tenant's own scope, as app_service. */
    const { rows } = await owner.query(
      `SELECT storage_version_id FROM vault.documents WHERE document_code = $1`,
      [PROBE_CODE],
    );
    const admitted = String(rows[0].storage_version_id);
    const { storedVersionIsReferenced } = await import(
      '../../server/services/vault/vault-ingest-discard'
    );
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const scope = {
      tenantId: String(orgId),
      orgUuid,
      role: 'admin',
      source: 'request' as const,
      caller: 'tests/db/vault-ingest.dbtest.ts',
    };
    expect(await runWithTenantScope(scope, () => storedVersionIsReferenced(admitted, orgId))).toBe(true);
    expect(
      await runWithTenantScope(scope, () =>
        storedVersionIsReferenced('00000000-0000-4000-8000-000000000000', orgId),
      ),
    ).toBe(false);
    /* The organization filter is part of the answer: the same version asked
       for under another organization is not held. */
    expect(await runWithTenantScope(scope, () => storedVersionIsReferenced(admitted, otherOrgId))).toBe(false);
  });

  it('an admitted upload still stores exactly one object — the one its record names', async () => {
    const before = await storedVersionIds();
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-NEW`)
      .field('documentTitle', 'A second, different document')
      .field('documentType', 'OTHER')
      .attach('file', revised('admitted'), 'second.pdf');

    expect(res.status).toBe(201);
    const added = [...(await storedVersionIds())].filter((id) => !before.has(id));
    const { rows } = await owner.query(
      `SELECT storage_version_id FROM vault.documents WHERE document_code = $1`,
      [`${PROBE_CODE}-NEW`],
    );
    expect(added).toEqual([String(rows[0].storage_version_id)]);
  });
});

describe("POST /api/vault/ingest — a file carries its uploader's fields", () => {
  /* Gap 7.1 (docs/design/VEEVA_GAP_2026-10-22.md): the uploader now sends a row's
     own fields. The route already took them; this pins what lands. */
  it("a file sent with its row's fields is recorded with exactly those, and its folder as the person's filing", async () => {
    const res = await actingRequest()
      .post('/api/vault/ingest')
      .field('programId', programId)
      .field('documentCode', `${PROBE_CODE}-ROW`)
      .field('documentTitle', 'Risk management file, revision C')
      .field('documentType', 'REPORT')
      .field('version', '2.1')
      .field('classification', 'CONFIDENTIAL')
      .field('folderId', 'eng')
      .field('evidenceKind', 'report')
      .attach('file', Buffer.concat([PDF_BYTES, Buffer.from('% row-fields\n', 'utf8')]), 'risk-file.pdf');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { rows } = await owner.query(
      `SELECT document_title, document_type, version, classification, folder_id, evidence_kind, ctd_section,
              placement_status, placed_by
         FROM vault.documents WHERE document_code = $1`,
      [`${PROBE_CODE}-ROW`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      document_title: 'Risk management file, revision C', document_type: 'REPORT', version: '2.1',
      classification: 'CONFIDENTIAL', folder_id: 'eng', evidence_kind: 'report', ctd_section: null,
      placement_status: 'confirmed',
    });
    expect(Number(rows[0].placed_by)).toBe(userId);
  });
});

describe('POST /api/vault/ingest — only a role that may write adds to the Vault (D3)', () => {
  /* The route carries requireEditorAccess, so it cannot show the service's own
     check. AnA's file_chat_upload_to_vault, authoring's file-to-vault and eSTAR
     retention call the service directly — so the service is asked directly,
     in the scope each of them runs in. */
  async function ingestAs(role: string | null, code: string, tag: string) {
    const { ingestVaultDocument } = await import('../../server/services/vault/vault-ingest.service');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    return runWithTenantScope(
      { tenantId: String(orgId), orgUuid, role, source: 'request', caller: 'tests/db/vault-ingest.dbtest.ts' },
      () =>
        ingestVaultDocument({
          organizationId: orgId,
          userId: role === 'viewer' ? roleActorIds.viewer : role === 'member' ? roleActorIds.member : roleActorIds.missingMembership,
          programId,
          documentCode: code,
          documentTitle: `Uploaded as ${role ?? 'no role'}`,
          documentType: 'OTHER',
          fileName: `${tag}.pdf`,
          mimeType: 'application/pdf',
          fileBuffer: Buffer.concat([PDF_BYTES, Buffer.from(`% ${tag}\n`, 'utf8')]),
        }),
    );
  }
  async function storedVersionIds(): Promise<Set<string>> {
    const { getStorageProvider } = await import('../../server/services/storage/index');
    return new Set((await getStorageProvider().list(orgId, programId)).map((o) => o.vaultVersionId));
  }

  it('refuses a viewer before anything is stored or recorded', async () => {
    const before = await storedVersionIds();
    const out = await ingestAs('viewer', `${PROBE_CODE}-VIEWER`, 'viewer');
    expect(out).toMatchObject({ ok: false, status: 403, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    const { rows } = await owner.query(
      'SELECT count(*)::int AS n FROM vault.documents WHERE document_code = $1',
      [`${PROBE_CODE}-VIEWER`],
    );
    expect(rows[0].n).toBe(0);
    expect([...(await storedVersionIds())].filter((id) => !before.has(id))).toEqual([]);
  });

  it('refuses an actual actor without organization membership', async () => {
    const scopes = [{ organizationId: orgId, programId }];
    const beforeState = await denialState(scopes);
    const out = await ingestAs(null, `${PROBE_CODE}-NOROLE`, 'no-role');
    expect(out).toMatchObject({ ok: false, status: 403, code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(JSON.stringify(out)).not.toMatch(/vault\.|regulatory_programs|SELECT|relation/i);
    expect(await denialState(scopes)).toEqual(beforeState);
  });

  it('admits a member — the role SSO provisioning assigns', async () => {
    const out = await ingestAs('member', `${PROBE_CODE}-MEMBER`, 'member');
    expect(out.ok).toBe(true);
  });
});
