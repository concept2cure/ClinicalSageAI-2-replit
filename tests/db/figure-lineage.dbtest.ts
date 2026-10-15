/**
 * A drafted figure the cited Vault version states is derived lineage to that
 * version (D2, Data Room catalog S5c, 2026-10-15;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * On real PostgreSQL behind the tenant scope, as the runtime role:
 *   - the amended CHECKs (20260908) admit a `vault_document` span and still
 *     refuse one with no reference or hash;
 *   - every lineage reader returns it with its state (current, or unresolved
 *     when the version cannot be found), and none fails on its uuid reference (the readers cast a
 *     spine reference to integer; that cast is now only for spine rows);
 *   - a span naming another organization's Vault version is refused and
 *     nothing is written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const PREFIX = 'dbtest-figure-lineage';
const RUN = Date.now().toString(36);
const HASH = 'b'.repeat(64);
const CONTENT = '<p>The endpoint was observed in 30 subjects.</p>';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let vaultDocId: string;
let foreignDocId: string;
const sectionId = randomUUID();
const ref = () => ({ documentTable: 'authoring_sections', documentId: sectionId });

async function org(slug: string) {
  const { rows } = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX} ${slug}`, `${PREFIX}-${slug}`],
  );
  return { id: Number(rows[0].id), uuid: String(rows[0].uuid) };
}

async function vaultDoc(organizationId: number, tag: string): Promise<string> {
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Drug X') RETURNING id`,
    [`${PREFIX} ${tag} ${RUN}`, `FIGLIN-${tag}-${RUN}`.toUpperCase(), organizationId],
  );
  const doc = await owner.query(
    `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version, s3_bucket, s3_key,
       file_name, file_size, mime_type, content_hash, classification, placement_status, processing_status, extracted_text)
     VALUES ($1, $2, $3, 'Clinical study report', 'OTHER', '1.0', 'local', 'probe/key', 'csr.txt', 10, 'text/plain', $4,
             'INTERNAL', 'unfiled', 'INDEXED', 'observed in 30 subjects') RETURNING id`,
    [prog.rows[0].id, organizationId, `${PREFIX}-${tag}-${RUN}`.toUpperCase(), HASH],
  );
  return String(doc.rows[0].id);
}

async function scoped<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  return runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'figure-lineage.dbtest' }, fn);
}

const figure = (vaultDocumentId: string) => ({
  charStart: CONTENT.indexOf('30 subjects'), charEnd: CONTENT.indexOf('30 subjects') + '30 subjects'.length,
  spanText: '30 subjects', vaultDocumentId, contentHash: HASH, sourceLocator: 'offset:12',
});

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  ({ id: orgId, uuid: orgUuid } = await org('org'));
  ({ id: otherOrgId } = await org('other'));
  vaultDocId = await vaultDoc(orgId, 'mine');
  foreignDocId = await vaultDoc(otherOrgId, 'theirs');
}, 60_000);

afterAll(async () => {
  await owner?.end().catch(() => {});
});

describe('a drafted figure as derived lineage to its Vault version', () => {
  it('is recorded, and every reader returns it with its state', async () => {
    const svc = await import('../../server/services/clinical-regulatory-evidence/span-lineage.service');
    const { pool } = await import('../../server/db');
    await scoped(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        expect(await svc.replaceVaultFigureSpans(orgId, ref(), [figure(vaultDocId)], { createdBy: 'dbtest' }, client as never)).toEqual({ recorded: 1 });
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });
    const spans = await scoped(() => svc.listDocumentSpans(orgId, ref()));
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ provenanceKind: 'vault_document', usage: 'derived', referenceId: vaultDocId, state: 'current', sourceTitle: 'Clinical study report' });
    const origins = await scoped(() => svc.getSelectionOrigins(orgId, ref(), 0, CONTENT.length));
    expect(origins.counts.fromSources).toBe(1);
    // The organization-wide stale read joins every span to the spine; a uuid reference must not break it.
    await expect(scoped(() => svc.listStaleSpans(orgId))).resolves.toEqual(expect.any(Array));
  });

  it('reads as unresolved when its version cannot be found, never as current', async () => {
    // A version's content hash is immutable (VR-06), so a Vault citation does not go stale
    // by its bytes changing; it can only stop resolving.
    const svc = await import('../../server/services/clinical-regulatory-evidence/span-lineage.service');
    const lost = { documentTable: 'authoring_sections', documentId: randomUUID() };
    await owner.query(
      `INSERT INTO document_span_lineage (document_table, document_id, char_start, char_end, span_text_sha256, provenance_kind,
         source, reference_id, payload_sha256, usage, organization_id)
       VALUES ($1, $2, 0, 5, $3, 'vault_document', 'vault_document', $4, $5, 'derived', $6)`,
      [lost.documentTable, lost.documentId, 'e'.repeat(64), randomUUID(), HASH, orgId],
    );
    expect((await scoped(() => svc.listDocumentSpans(orgId, lost)))[0].state).toBe('unresolved');
  });

  it("refuses a span naming another organization's Vault version, and writes nothing", async () => {
    const svc = await import('../../server/services/clinical-regulatory-evidence/span-lineage.service');
    const { pool } = await import('../../server/db');
    const other = { documentTable: 'authoring_sections', documentId: randomUUID() };
    await expect(scoped(async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await svc.replaceVaultFigureSpans(orgId, other, [figure(foreignDocId)], {}, client as never);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    })).rejects.toThrow(/does not hold/);
    const { rows } = await owner.query('SELECT count(*)::int AS n FROM document_span_lineage WHERE document_id = $1', [other.documentId]);
    expect(rows[0].n).toBe(0);
  });

  it('the database refuses a vault_document span with no reference or hash', async () => {
    const err = await owner.query(
      `INSERT INTO document_span_lineage (document_table, document_id, char_start, char_end, span_text_sha256, provenance_kind, usage, organization_id)
       VALUES ('authoring_sections', $1, 0, 5, $2, 'vault_document', 'derived', $3)`,
      [randomUUID(), 'e'.repeat(64), orgId],
    ).then(() => 'ok', (e: { code?: string }) => e.code);
    expect(err).toBe('23514');
  });
});
