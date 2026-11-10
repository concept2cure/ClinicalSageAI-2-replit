/**
 * The PDF rendition of a Vault version, on PostgreSQL as the runtime role with
 * RLS on, through the real ingest and download routes (P-107 item 3).
 *
 * server/routes/__tests__/vault-download-rendition.test.ts pins the handler
 * against a query mock, where "withheld by a data disposition" can only be the
 * lookup finding no row. Here the lookup is the real statement on real rows:
 *   - a Word version, ingested through the Vault's own route, is read as a
 *     PDF made by the real converter from its stored bytes, naming the SHA-256
 *     the Vault recorded for it;
 *   - viewing it writes the version's chained download row, and nothing else:
 *     no Vault row, and no stored object;
 *   - a version a data disposition withholds, and a version asked for under
 *     another organization's project, are refused for the rendition exactly as
 *     for the source;
 *   - a PDF version gets none.
 *
 * The conversion needs LibreOffice. Where it is not installed, the first test
 * expects the Vault to say so (503) instead of a PDF.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Document, Packer, Paragraph } from 'docx';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-p107r-${RUN} `;
const CODE = `DBTEST-P107R-${RUN}`;
const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const installed = spawnSync(process.env.LIBREOFFICE_BIN || 'libreoffice', ['--version'], { stdio: 'ignore' }).status === 0;

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let word: Buffer;
let wordId: string;
let withheld: Buffer;
let withheldId: string;
let pdfId: string;

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const wordFile = async (line: string) => Buffer.from(await Packer.toBuffer(new Document({
  sections: [{ children: [new Paragraph(line), new Paragraph(`Run ${RUN}.`)] }],
})));

async function appFor(t: Tenant): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = t.orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, bytes: Buffer, file: { name: string; type: string; code: string; title: string }): Promise<string> {
  const res = await request(await appFor(t))
    .post('/api/vault/ingest')
    .field('programId', t.programId)
    .field('documentCode', `${CODE}-${file.code}`)
    .field('documentTitle', file.title)
    .field('documentType', 'OTHER')
    .attach('file', bytes, { filename: file.name, contentType: file.type });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

/** The download, as the source or as the rendition, with the body as bytes. */
async function download(t: Tenant, documentId: string, as: 'source' | 'rendition') {
  const path = `/api/c2c/project-vault/${t.programId}/documents/${documentId}/download${as === 'rendition' ? '?rendition=pdf' : ''}`;
  return request(await appFor(t)).get(path).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
}
const json = (res: { body: unknown }) => JSON.parse((res.body as Buffer).toString('utf8'));

const downloadRows = async (documentId: string) => (await owner.query(
  `SELECT chain_seq, new_values FROM audit_logs WHERE tenant_id = $1 AND action = 'vault.document.download' AND record_id = $2 ORDER BY chain_seq`,
  [mine.orgId, documentId])).rows as Array<{ chain_seq: string | null; new_values: unknown }>;
const vaultRows = async () => (await owner.query(
  `SELECT id, content_hash, storage_version_id FROM vault.documents WHERE program_id = $1 ORDER BY id`, [mine.programId])).rows;

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-p107r-${RUN}-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Renditin 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  const current = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, current, { userId, namespace: `${PROBE}${slug}-parent` });
  return current;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [`dbtest-p107r-${RUN}@example.test`, 'Rhea Reader', 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  await assertVaultFixtureRuntime(mine);

  word = await wordFile('Stability protocol SP-014, as filed.');
  wordId = await ingest(mine, word, { name: 'SP-014 protocol.docx', type: WORD_MIME, code: 'WORD', title: 'Stability protocol' });
  withheld = await wordFile('A protocol that is withdrawn after it is filed.');
  withheldId = await ingest(mine, withheld, { name: 'withdrawn protocol.docx', type: WORD_MIME, code: 'WITHHELD', title: 'Withdrawn protocol' });
  pdfId = await ingest(mine, pdf('a PDF version'), { name: 'overview.pdf', type: 'application/pdf', code: 'PDF', title: 'Clinical overview' });
}, 120_000);

afterAll(async () => {
  // Retain new namespaces, source bytes and append-only history, including failures.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('the PDF rendition of a Word version (P-107 item 3)', () => {
  it('is a PDF made from the stored Word file, bound to the SHA-256 the Vault recorded, and viewing it is recorded in the chain', async () => {
    const rowsBefore = await vaultRows();
    const auditBefore = await downloadRows(wordId);
    const res = await download(mine, wordId, 'rendition');

    if (!installed) {
      expect(res.status).toBe(503);
      expect(json(res).error).toBe('RENDITION_CONVERTER_UNAVAILABLE');
      expect(await downloadRows(wordId)).toHaveLength(auditBefore.length);
      return;
    }
    expect(res.status, (res.body as Buffer).toString('utf8').slice(0, 300)).toBe(200);
    const rendition = res.body as Buffer;
    expect(rendition.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['x-vault-rendition']).toBe('pdf');
    expect(res.headers['x-rendition-sha256']).toBe(sha(rendition));
    // Bound to the source: the hash it names is the hash of the bytes ingested and the hash on the version's row.
    expect(res.headers['x-rendition-source-sha256']).toBe(sha(word));
    expect(rowsBefore.find((r) => r.id === wordId)?.content_hash).toBe(sha(word));
    expect(res.headers['x-content-sha256']).toBeUndefined();

    // Recorded as the source download is: one more chained download row for this version, naming the source hash.
    const auditAfter = await downloadRows(wordId);
    expect(auditAfter).toHaveLength(auditBefore.length + 1);
    const row = auditAfter[auditAfter.length - 1];
    expect(row.chain_seq).not.toBeNull();
    expect(JSON.stringify(row.new_values)).toContain(sha(word));
    // The row says what left the Vault: the PDF rendition under its own hash, made from the version of that hash.
    expect(row.new_values).toMatchObject({ contentHash: sha(word), rendition: { format: 'pdf', sha256: sha(rendition) } });

    // Never kept or filed: the Vault's rows are what they were, and none holds the rendition's hash.
    const rowsAfter = await vaultRows();
    expect(rowsAfter).toEqual(rowsBefore);
    expect(rowsAfter.some((r) => r.content_hash === sha(rendition))).toBe(false);
  }, 180_000);

  it('leaves the source download as it was: the Word file itself, under its recorded hash', async () => {
    const res = await download(mine, wordId, 'source');
    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(word)).toBe(true);
    expect(res.headers['x-content-sha256']).toBe(sha(word));
    expect(res.headers['x-vault-rendition']).toBeUndefined();
  });

  it('a PDF version needs no rendition and gets none', async () => {
    const before = await downloadRows(pdfId);
    const res = await download(mine, pdfId, 'rendition');
    expect(res.status).toBe(409);
    expect(json(res).error).toBe('RENDITION_NOT_NEEDED');
    expect(await downloadRows(pdfId)).toHaveLength(before.length);
  });
});

describe('a rendition is refused exactly as its source is', () => {
  it('under another organization\'s project', async () => {
    const asSource = await download(theirs, wordId, 'source');
    const asRendition = await download(theirs, wordId, 'rendition');
    expect(asSource.status).toBe(404);
    expect(asRendition.status).toBe(asSource.status);
    expect(json(asRendition)).toEqual(json(asSource));
  });

  it('when a data disposition withholds the version\'s file', async () => {
    // Before the disposition the version is readable, so the refusal below is the disposition's.
    expect((await download(mine, withheldId, 'source')).status).toBe(200);
    await owner.query(
      `INSERT INTO document_data_dispositions (organization_id, program_id, vault_document_id, choice, reason, actor_id,
         source_sha256, preview_hash, linked_ids, impact_snapshot, audit_receipt)
       VALUES ($1, $2, $3, 'remove_data', 'Withdrawn: it carries personal data.', $4, $5, $6, $7, '{}', $8)`,
      [mine.orgId, mine.programId, withheldId, userId, sha(withheld), 'b'.repeat(64),
        JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [withheldId], artifactIds: [], uploadIds: [] }),
        JSON.stringify({ id: randomUUID(), sha256Chain: 'c'.repeat(64) })]);
    const auditBefore = await downloadRows(withheldId);

    const asSource = await download(mine, withheldId, 'source');
    const asRendition = await download(mine, withheldId, 'rendition');
    expect(asSource.status).toBe(404);
    expect(asRendition.status).toBe(asSource.status);
    expect(json(asRendition)).toEqual(json(asSource));
    expect(asRendition.headers['x-vault-rendition']).toBeUndefined();
    expect(await downloadRows(withheldId)).toHaveLength(auditBefore.length);
  }, 60_000);
});
