/**
 * AnA's description of a Vault document is a suggestion a person confirms
 * (D5, Data Room catalog S4, 2026-10-08;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before: catalog_project_document stored the kind, purpose, summary and key
 * data as the person's own record (cataloged_by), with no model, no turn, no
 * audit row, any kind the model typed, and no way for a person to confirm or
 * correct it. Now, on real PostgreSQL behind the real request tenant scope:
 *   - AnA's write is 'suggested', names the agent, model, thread and turn, and
 *     has a chained audit row;
 *   - a kind outside the Vault vocabulary is refused and nothing is written;
 *   - a viewer cannot confirm; a member confirms, once, audited;
 *   - a correction needs a reason, is audited with it, and the database
 *     refuses a 'corrected' row without one;
 *   - AnA cannot replace a record a person decided on;
 *   - session recall says whose description it is.
 *
 * The fixture is built in rows (document, text, an 'extracted' catalog row and
 * one read receipt over every character), so the coverage and key_data gates
 * pass and only what this suite tests is left to decide.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

process.env.ANA_DOCUMENT_CATALOG_FORCE_ON = 'true';

const PREFIX = 'dbtest-catalog-governed ';
const RUN = Date.now().toString(36);
const TEXT = 'Certificate of Analysis. Batch number: 23-104. Assay (HPLC): 99.2 % of label claim.';
const MODEL = 'claude-test-model';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let programId: string;

async function setMembership(role: string): Promise<void> {
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [orgId, userId, role],
  );
}

/** A document of the project with its text fully read, ready to be described. */
async function readDocument(tag: string): Promise<string> {
  const hash = `${RUN}${tag}`.padEnd(64, '0').slice(0, 64);
  const doc = await owner.query(
    `INSERT INTO vault.documents
       (program_id, organization_id, document_code, document_title, document_type,
        version, s3_bucket, s3_key, file_name, file_size, mime_type, content_hash,
        classification, placement_status, processing_status, extracted_text)
     VALUES ($1, $2, $3, 'Certificate of Analysis', 'OTHER', '1.0', 'local', 'probe/key',
             'coa.txt', $4, 'text/plain', $5, 'INTERNAL', 'unfiled', 'INDEXED', $6)
     RETURNING id`,
    [programId, orgId, `DBTEST-CATGOV-${RUN}-${tag}`.toUpperCase(), TEXT.length, hash, TEXT],
  );
  const id = String(doc.rows[0].id);
  await owner.query(
    `INSERT INTO vault.document_catalog (document_id, content_hash, catalog_status, char_count)
     VALUES ($1, $2, 'extracted', $3)`,
    [id, hash, TEXT.length],
  );
  await owner.query(
    `INSERT INTO vault.document_read_receipts (document_id, content_hash, char_start, char_end, read_by)
     VALUES ($1, $2, 0, $3, $4)`,
    [id, hash, TEXT.length, userId],
  );
  return id;
}

async function anaCatalogs(documentId: string, kind = 'cert') {
  await setMembership('member');
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const handler = getToolHandler('catalog_project_document');
  if (!handler) throw new Error('catalog_project_document is not registered');
  const raw = await runWithTenantScope(
    { tenantId: String(orgId), orgUuid, role: 'member', source: 'request', caller: 'document-catalog-governed.dbtest' },
    () =>
      handler(
        {
          document_id: documentId,
          document_kind: kind,
          purpose: 'Release evidence for one clinical batch.',
          summary: 'CoA for batch 23-104: assay 99.2 % of label claim.',
          key_data: { batch: '23-104', assay_pct: 99.2 },
        },
        {
          organizationId: orgId, userId, humanConfirmed: true, model: MODEL, threadId: `thread-${RUN}`, turnId: `turn-${RUN}`,
          servingModel: { provider: 'anthropic', model: MODEL, requestId: `req-${RUN}` },
        } as never,
      ),
  );
  return JSON.parse(raw);
}

async function vaultApp(role: string): Promise<express.Express> {
  await setMembership(role);
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = role;
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const catalogRow = async (documentId: string) =>
  (await owner.query(
    `SELECT catalog_state, document_kind, purpose, summary, proposed_by, proposed_model, proposed_thread_id,
            proposed_turn_id, confirmed_by, confirmed_at, correction_reason, embedding_status, cataloged_by
       FROM vault.document_catalog WHERE document_id = $1`,
    [documentId],
  )).rows[0];

const auditRows = async (documentId: string) =>
  (await owner.query(
    `SELECT action, new_values::jsonb AS details, reason FROM audit_logs
      WHERE record_id = $1 AND action LIKE 'vault.document.catalog_%' ORDER BY occurred_at`,
    [documentId],
  )).rows;

const shown = async (role: string, documentId: string) =>
  (await request(await vaultApp(role)).get(`/api/c2c/project-vault/${programId}/documents/${documentId}/catalog`)).body.data;

/** A decision on the record as it was just shown (its revision), unless the body names another. */
const post = async (role: string, documentId: string, action: 'confirm' | 'correct', body: Record<string, unknown> = {}) => {
  const revision = (await shown('member', documentId)).revision;
  return request(await vaultApp(role)).post(`/api/c2c/project-vault/${programId}/documents/${documentId}/catalog/${action}`)
    .send({ revision, ...body });
};

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX}tenant`, 'dbtest-catalog-governed-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Dana Reviewer', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-catalog-governed@example.test'],
  );
  userId = Number(user.rows[0].id);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Governed AF-1') RETURNING id`,
    [`${PREFIX}program ${RUN}`, `CATGOV-${RUN}`.toUpperCase(), orgId],
  );
  programId = String(prog.rows[0].id);
}, 60_000);

afterAll(async () => {
  await owner?.end().catch(() => {});
});

describe("AnA's catalog write is a suggestion that names who wrote it", () => {
  let documentId: string;
  beforeAll(async () => { documentId = await readDocument('suggest'); });

  it('is stored as suggested, with the agent, model, thread and turn', async () => {
    const out = await anaCatalogs(documentId);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(out.catalogState).toBe('suggested');
    expect(await catalogRow(documentId)).toMatchObject({
      catalog_state: 'suggested', document_kind: 'cert', proposed_by: 'agent:ana', proposed_model: MODEL,
      proposed_thread_id: `thread-${RUN}`, proposed_turn_id: `turn-${RUN}`, confirmed_by: null, cataloged_by: userId,
    });
  }, 60_000);

  it('has a chained audit row naming the agent, model and turn', async () => {
    const [row] = await auditRows(documentId);
    expect(row.action).toBe('vault.document.catalog_suggest');
    expect(row.details).toMatchObject({
      actorKind: 'agent:ana', tool: 'catalog_project_document', model: MODEL, turnId: `turn-${RUN}`,
      to: { state: 'suggested', documentKind: 'cert' },
    });
  });

  it('the Vault read shows it as a suggestion by AnA and its model', async () => {
    const res = await request(await vaultApp('viewer')).get(`/api/c2c/project-vault/${programId}/documents/${documentId}/catalog`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ state: 'suggested', proposedBy: 'agent:ana', proposedModel: MODEL, documentKindLabel: 'Certificate', canWrite: false });
    expect((await shown('member', documentId)).canWrite).toBe(true);
  });

  it('session recall labels it as her unconfirmed suggestion', async () => {
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const { getCatalogBootstrapDigest } = await import('../../server/services/vault/document-catalog.service');
    const { formatVaultFileLine } = await import('../../server/services/ana-session-bootstrap-format');
    const digest = await runWithTenantScope(
      { tenantId: String(orgId), orgUuid, role: 'member', source: 'request', caller: 'document-catalog-governed.dbtest' },
      () => getCatalogBootstrapDigest(orgId, 50),
    );
    const file = digest.files.find(f => f.catalogStatus === 'cataloged');
    expect(file?.catalogState).toBe('suggested');
    expect(formatVaultFileLine(file!)).toContain('your suggestion, not yet confirmed by a person');
  });
});

describe('the kind is the Vault vocabulary', () => {
  it('refuses a kind outside it and writes nothing', async () => {
    const documentId = await readDocument('vocab');
    const before = await catalogRow(documentId);
    const out = await anaCatalogs(documentId, 'Certificate of Analysis');
    expect(out.refused, JSON.stringify(out)).toBe(true);
    expect(out.reason).toMatch(/is not an evidence kind the Vault records/);
    expect(await catalogRow(documentId)).toEqual(before);
    expect(await auditRows(documentId)).toHaveLength(0);
  }, 60_000);
});

describe('a person confirms', () => {
  let documentId: string;
  beforeAll(async () => {
    documentId = await readDocument('confirm');
    expect((await anaCatalogs(documentId)).ok).toBe(true);
  }, 60_000);

  it('a viewer cannot, and the record is untouched', async () => {
    const before = await catalogRow(documentId);
    const res = await post('viewer', documentId, 'confirm');
    expect(res.status).toBe(403);
    expect(await catalogRow(documentId)).toEqual(before);
  });

  it('a confirmation of a record that changed after it was shown is refused', async () => {
    const stale = (await shown('member', documentId)).revision;
    expect((await anaCatalogs(documentId, 'report')).ok).toBe(true); // AnA re-suggests on the same bytes
    const res = await post('member', documentId, 'confirm', { revision: stale });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CHANGED_SINCE_SHOWN');
    expect((await catalogRow(documentId)).catalog_state).toBe('suggested');
    expect((await anaCatalogs(documentId, 'cert')).ok).toBe(true); // back to the kind the rest asserts
  }, 60_000);

  it('a decision that names no revision is refused', async () => {
    const res = await post('member', documentId, 'confirm', { revision: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REVISION_REQUIRED');
  });

  it('a member confirms it as written, audited with the proposer', async () => {
    const res = await post('member', documentId, 'confirm');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await catalogRow(documentId)).toMatchObject({ catalog_state: 'confirmed', confirmed_by: userId, document_kind: 'cert' });
    const confirm = (await auditRows(documentId)).find(r => r.action === 'vault.document.catalog_confirm');
    expect(confirm.details).toMatchObject({ proposedBy: 'agent:ana', proposedModel: MODEL, from: { state: 'suggested' }, to: { state: 'confirmed' } });
  });

  it('only once', async () => {
    const res = await post('member', documentId, 'confirm');
    expect(res.status).toBe(409);
  });

  it('AnA cannot replace a record a person confirmed', async () => {
    const out = await anaCatalogs(documentId, 'report');
    expect(out.refused, JSON.stringify(out)).toBe(true);
    expect(out.reason).toMatch(/A person confirmed this document's catalog record/);
    expect((await catalogRow(documentId)).document_kind).toBe('cert');
  }, 60_000);

  it('recall says a person confirmed it', async () => {
    const { formatVaultFileLine } = await import('../../server/services/ana-session-bootstrap-format');
    expect(formatVaultFileLine({ fileName: 'coa.txt', documentTitle: 'CoA', placementStatus: 'unfiled', catalogStatus: 'cataloged', documentKind: 'cert', catalogState: 'confirmed' }))
      .toContain('(confirmed by a person)');
  });
});

describe('a person corrects, with a reason', () => {
  let documentId: string;
  beforeAll(async () => {
    documentId = await readDocument('correct');
    expect((await anaCatalogs(documentId)).ok).toBe(true);
  }, 60_000);

  it('without a reason, nothing changes', async () => {
    const before = await catalogRow(documentId);
    const res = await post('member', documentId, 'correct', { documentKind: 'batch_record' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(await catalogRow(documentId)).toEqual(before);
  });

  it('a kind outside the vocabulary is refused', async () => {
    const res = await post('member', documentId, 'correct', { documentKind: 'Certificate of Analysis', reason: 'The CoA is a batch record here.' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_DOCUMENT_KIND');
  });

  it('with a reason, the correction is recorded and audited with it', async () => {
    const reason = 'A CoA is filed with its batch record in this program.';
    const res = await post('member', documentId, 'correct', { documentKind: 'batch_record', reason });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await catalogRow(documentId)).toMatchObject({
      catalog_state: 'corrected', document_kind: 'batch_record', correction_reason: reason, confirmed_by: userId,
      embedding_status: 'stale', proposed_model: MODEL,
    });
    const row = (await auditRows(documentId)).find(r => r.action === 'vault.document.catalog_correct');
    expect(row.reason).toBe(reason);
    expect(row.details).toMatchObject({ changes: [{ field: 'documentKind', from: 'cert', to: 'batch_record' }], proposedModel: MODEL });
  });

  it("the database refuses a 'corrected' record without a reason", async () => {
    const err = await owner.query(
      `UPDATE vault.document_catalog SET correction_reason = NULL WHERE document_id = $1`, [documentId],
    ).then(() => 'ok', (e: { code?: string }) => e.code);
    expect(err).toBe('23514');
  });

  it('new bytes clear the description and its decision', async () => {
    const { recordExtractionOutcome } = await import('../../server/services/vault/document-catalog.service');
    await recordExtractionOutcome(owner, {
      documentId, contentHash: 'f'.repeat(64),
      outcome: { status: 'extracted', method: 'text', confidence: 1, error: null, charCount: 10, wordCount: 2 } as never,
    });
    expect(await catalogRow(documentId)).toMatchObject({
      catalog_state: null, document_kind: null, proposed_by: null, proposed_model: null, confirmed_by: null, correction_reason: null,
    });
  });
});
