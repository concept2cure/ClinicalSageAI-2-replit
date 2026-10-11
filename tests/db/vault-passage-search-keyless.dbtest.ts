/**
 * search_document_passages with NO embedding provider and every flag at its
 * production default (D2, founder direction 2026-10-01 and 2026-10-08: "Vault
 * search should not depend on an OpenAI key or a Claude key or any key as AnA
 * should have the capability to do that search on her own").
 *
 * Before: the passage index was written only with 'ana.document_catalog' and
 * 'ana.vault_chunking' both on, and only when every chunk could be embedded; an
 * embedder that could not embed left ZERO chunks. The search embedded the query
 * first and failed without a provider, and the tool refused outright with the
 * catalog off. So a deployment with no AI key had no passage search at all,
 * though vault.document_chunks carries a full-text index on chunk_text.
 *
 * Now every ingest writes the passages; with no embedder they carry no vector
 * and are found by text (advancedRAGPipeline vaultLexicalArm), and the tool
 * says the ranking was by text. 'ana.vault_chunking' decides only whether
 * passages are also embedded.
 *
 * The embedder is configured as a self-hosted lane with no address: the
 * provider refuses at once (EmbeddingConfigurationError), which is what "no
 * provider" is, without a network call.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

/* Production defaults: neither flag forced. These suites share one worker, and
   a sibling sets both at module scope. */
delete process.env.ANA_DOCUMENT_CATALOG_FORCE_ON;
delete process.env.ANA_VAULT_CHUNKING_FORCE_ON;

const PROBE_PREFIX = 'dbtest-keyless ';
const PROBE_CODE = 'DBTEST-KEYLESS-DOC';

const TOX_BODY =
  'GLP 28-Day Repeat-Dose Toxicology Study TOX-77-A in Sprague-Dawley rats. ' +
  'The NOAEL was 50 mg per kg per day. No test-article-related mortality was observed. ' +
  'Reversible hepatocellular hypertrophy was seen at 150 mg per kg per day in males and females. ' +
  'Clinical pathology showed no toxicologically significant changes in haematology parameters.';

const STABILITY_BODY =
  'Stability Summary for drug product batch 23-104 stored at 25 degrees Celsius and 60 percent relative humidity. ' +
  'Assay at the six month timepoint was 98.4 percent of label claim. Total degradation products remained below ' +
  'the qualification threshold throughout. Dissolution met the acceptance criterion at every timepoint tested.';

const CMC_BODY =
  'Drug Substance Specification. Appearance white to off-white powder. Assay by HPLC 98.0 to 102.0 percent. ' +
  'Residual solvents meet ICH Q3C limits. Particle size D90 not more than 50 micrometres.';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let otherOrgUuid: string;
let userId: number;
let programId: string;
let otherProgramId: string;
let app: express.Express;
let actingOrg: () => { id: number; uuid: string };

async function inTenantScope<T>(org: { id: number; uuid: string }, fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope(
    { tenantId: String(org.id), orgUuid: org.uuid, role: 'admin', source: 'request', caller: 'tests/db/vault-passage-search-keyless.dbtest.ts' },
    fn,
  );
}

async function callSearch(
  input: Record<string, unknown>,
  ctx?: { organizationId: number; organizationUuid?: string; projectRef?: string },
) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const handler = getToolHandler('search_document_passages');
  if (!handler) throw new Error('search_document_passages is not registered');
  const scope = ctx ?? { organizationId: orgId, organizationUuid: orgUuid };
  const raw = await inTenantScope({ id: scope.organizationId, uuid: scope.organizationUuid ?? orgUuid }, () =>
    handler(input, {
      organizationId: scope.organizationId,
      organizationUuid: scope.organizationUuid,
      userId,
      projectRef: scope.projectRef ?? null,
      projectId: null,
    }),
  );
  return JSON.parse(raw);
}

async function buildApp(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import(
    '../../server/middleware/establishRequestTenantScope'
  );
  const a = express();
  a.use((req, _res, next) => {
    const org = actingOrg();
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = org.id;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: org.id, organizationUuid: org.uuid, role: 'admin' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

async function cleanupProbeRows(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action = 'vault.document.ingest'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${PROBE_CODE}%`],
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query(
    `DELETE FROM vault.document_chunks WHERE document_id IN
       (SELECT id FROM vault.documents WHERE document_code LIKE $1)`,
    [`${PROBE_CODE}%`],
  );
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${PROBE_CODE}%`]);
  // Each deploy's backfill (migrations/20260529_phase9_backfill.sql) gives every
  // program a document, so a probe program an interrupted run left behind can
  // carry one by the next run.
  await owner.query(
    'DELETE FROM c2c_documents WHERE project_id IN (SELECT id FROM regulatory_programs WHERE name LIKE $1)',
    [`${PROBE_PREFIX}%`],
  );
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

async function upload(code: string, title: string, body: string, program?: string): Promise<string> {
  const res = await request(app)
    .post('/api/vault/ingest')
    .field('programId', program ?? (actingOrg().id === orgId ? programId : otherProgramId))
    .field('documentCode', code)
    .field('documentTitle', title)
    .field('documentType', 'REPORT')
    .attach('file', Buffer.from(body, 'utf8'), `${code}.txt`);
  expect(res.status).toBe(201);
  return String(res.body.document.id);
}

beforeAll(async () => {
  // No provider: a self-hosted lane with no address refuses every embedding.
  process.env.EMBEDDING_PROVIDER = 'local';
  delete process.env.EMBEDDING_LOCAL_BASE_URL;
  delete process.env.LOCAL_AI_BASE_URL;
  const { resetEmbeddingProvider } = await import(
    '../../server/services/ai-gateway/embeddings/embedding-provider'
  );
  resetEmbeddingProvider();

  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-keyless-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);

  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE_PREFIX}other tenant`, 'dbtest-keyless-other'],
  );
  otherOrgId = Number(other.rows[0].id);
  otherOrgUuid = String(other.rows[0].uuid);

  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-keyless@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);

  await cleanupProbeRows();

  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}program`, 'DBTEST-KEYLESS-A', orgId, 'Passagen 5mg'],
  );
  programId = String(prog.rows[0].id);

  const otherProg = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}other program`, 'DBTEST-KEYLESS-B', otherOrgId, 'Otherin 5mg'],
  );
  otherProgramId = String(otherProg.rows[0].id);

  actingOrg = () => ({ id: orgId, uuid: orgUuid });
  app = await buildApp();

  await upload(`${PROBE_CODE}-TOX`, 'TOX-77-A 28-day rat study', TOX_BODY);
  await upload(`${PROBE_CODE}-STAB`, 'Stability summary batch 23-104', STABILITY_BODY);

  actingOrg = () => ({ id: otherOrgId, uuid: otherOrgUuid });
  await upload(`${PROBE_CODE}-OTHER`, 'Another sponsor 28-day rat study', TOX_BODY);
  actingOrg = () => ({ id: orgId, uuid: orgUuid });
}, 120_000);

afterAll(async () => {
  await cleanupProbeRows().catch(() => {});
  await owner.end().catch(() => {});
});

describe('the passage index is written with no key and no flag', () => {
  it('both uploads are chunked, with no vector on any chunk, and the ledger says chunked', async () => {
    const { rows } = await owner.query(
      `SELECT d.document_code, c.chunk_status, c.chunk_count,
              (SELECT COUNT(*)::int FROM vault.document_chunks ch WHERE ch.document_id = d.id) AS chunks,
              (SELECT COUNT(*)::int FROM vault.document_chunks ch
                WHERE ch.document_id = d.id AND ch.embedding IS NOT NULL) AS embedded
         FROM vault.documents d
         LEFT JOIN vault.document_catalog c ON c.document_id = d.id
        WHERE d.document_code LIKE $1 AND d.program_id = $2
        ORDER BY d.document_code`,
      [`${PROBE_CODE}%`, programId],
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.chunk_status).toBe('chunked');
      expect(Number(r.chunks)).toBeGreaterThan(0);
      expect(Number(r.chunk_count)).toBe(Number(r.chunks));
      expect(Number(r.embedded)).toBe(0);
    }
  });

  it('with passage embedding on but no provider, a new upload is still chunked, all or none embedded', async () => {
    process.env.ANA_VAULT_CHUNKING_FORCE_ON = 'true';
    try {
      const id = await upload(`${PROBE_CODE}-CMC`, 'Drug substance specification', CMC_BODY);
      const { rows } = await owner.query(
        `SELECT c.chunk_status,
                (SELECT COUNT(*)::int FROM vault.document_chunks ch WHERE ch.document_id = $1) AS chunks,
                (SELECT COUNT(*)::int FROM vault.document_chunks ch
                  WHERE ch.document_id = $1 AND ch.embedding IS NOT NULL) AS embedded
           FROM vault.document_catalog c WHERE c.document_id = $1`,
        [id],
      );
      expect(rows[0]).toMatchObject({ chunk_status: 'chunked', embedded: 0 });
      expect(Number(rows[0].chunks)).toBeGreaterThan(0);
    } finally {
      delete process.env.ANA_VAULT_CHUNKING_FORCE_ON;
    }
  }, 60_000);
});

describe('search_document_passages answers by text, and says so', () => {
  it('returns the passage that answers the question, from the right document', async () => {
    const out = await callSearch({ query: 'assay result at the six month timepoint' });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(out.ranking).toBe('text');
    expect(out.passages.length).toBeGreaterThan(0);
    expect(out.passages[0].documentTitle).toContain('Stability');
    expect(out.passages[0].text).toContain('98.4');
    expect(out.message).toMatch(/text/i);
  }, 60_000);

  it('answers a tox question from the tox document', async () => {
    const out = await callSearch({ query: 'NOAEL and hepatocellular hypertrophy in rats' });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(out.passages[0].documentTitle).toContain('TOX-77-A');
  }, 60_000);

  it("never returns another organization's document, even for identical text", async () => {
    const out = await callSearch({ query: 'NOAEL and hepatocellular hypertrophy in rats' });
    const titles = (out.passages as Array<{ documentTitle: string }>).map(p => p.documentTitle);
    expect(titles.some(t => t.includes('Another sponsor'))).toBe(false);
  }, 60_000);

  it('a word in no document matches nothing, honestly', async () => {
    const out = await callSearch({ query: 'zebrafish xenograft angiogenesis' });
    expect(out.ok).toBe(true);
    expect(out.passages).toEqual([]);
  }, 60_000);
});
