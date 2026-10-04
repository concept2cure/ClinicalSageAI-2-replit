/**
 * The review-annotation record's own guards, the program cascade, the tenant
 * purge and the document history window (plan critique 15, rows D2 and D5).
 * PostgreSQL as the runtime role with RLS on; the flows through the routes
 * are in vault-version-annotations.dbtest.ts.
 *
 *   - The table, not only its writer, refuses a post that names another
 *     organisation, program or byte content, a body whose SHA-256 is not its
 *     own, a passage not where it says, a page beyond the page count, a reply
 *     under a closed or foreign annotation, a version that is gone, and an
 *     annotation posted already closed.
 *   - Its words and anchor never change; its outcome is written once, by its
 *     author for a retraction; it is never deleted while its version exists,
 *     not even from a trigger the runtime role made itself, and never
 *     truncated.
 *   - A runtime-role DELETE of the program, which cascades as the table owner,
 *     is refused while the versions exist, for annotations and for document
 *     relationships alike; the tenant purge still removes both.
 *   - A document's history says when older entries are not shown.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { harness, refused, textFile, threePagePdf, type Tenant } from './vault-annotation-harness';

const h = harness('vannorec');
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

let mine: Tenant;
let other: Tenant;
let gone: Tenant;
let relProgram: Tenant;
const u = { author: 0, reviewer: 0 };
const ids = { txt: '', pdf: '', other: '', otherDoc: '', gone: '', relA: '', relB: '', busy: '' };
const ann = { open: '', resolved: '', foreign: '', gone: '' };
let rowTemplate: Record<string, unknown>;

const annotate = async (t: Tenant, doc: string, body: string, anchor: Record<string, unknown> = { kind: 'document' }) => {
  const r = await request(await h.appFor(t, u.author)).post(`/api/c2c/project-vault/${t.programId}/documents/${doc}/annotations`)
    .send({ kind: 'request_changes', body, anchor });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return String(r.body.data.id);
};

/** A direct INSERT as the runtime role, from a valid row with `over` applied. */
const insertAs = (over: Record<string, unknown>) => {
  const row = { ...rowTemplate, ...over };
  const cols = Object.keys(row);
  return h.asRuntime(
    `INSERT INTO public.vault_version_annotations (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row), mine,
  );
};

beforeAll(async () => {
  h.state.owner = new Pool({ connectionString: databaseUrl, max: 4 });
  u.author = await h.user('dbtest-vannorec-author@example.test', 'Ada Author');
  u.reviewer = await h.user('dbtest-vannorec-reviewer@example.test', 'Rex Reviewer');
  await h.cleanup();
  mine = await h.tenant('mine');
  other = await h.tenant('other');
  gone = await h.tenant('gone');
  relProgram = { ...mine, programId: String((await h.state.owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Relata 5mg') RETURNING id`,
    [`${h.PROBE}mine related program`, `${h.CODE}-REL`, mine.orgId],
  )).rows[0].id), slug: 'rel' };
  for (const t of [mine, other, gone]) await h.member(t, u.author, 'admin');
  await h.member(mine, u.reviewer, 'admin');
  ids.txt = await h.ingest(mine, u.author, textFile('A dose of 5 mg once daily.'), { documentCode: `${h.CODE}-TXT`, documentTitle: 'Dose' });
  ids.pdf = await h.ingest(mine, u.author, await threePagePdf(), { documentCode: `${h.CODE}-PDF`, documentTitle: 'Report' });
  ids.otherDoc = await h.ingest(mine, u.author, textFile('Another document.'), { documentCode: `${h.CODE}-OTH`, documentTitle: 'Other' });
  ids.other = await h.ingest(other, u.author, textFile('Their document.'), { documentCode: `${h.CODE}-THEIRS`, documentTitle: 'Theirs' });
  ids.gone = await h.ingest(gone, u.author, textFile('To be purged.'), { documentCode: `${h.CODE}-GONE`, documentTitle: 'Gone' });
  ids.relA = await h.ingest(relProgram, u.author, textFile('Relationship end A.'), { documentCode: `${h.CODE}-RA`, documentTitle: 'A' });
  ids.relB = await h.ingest(relProgram, u.author, textFile('Relationship end B.'), { documentCode: `${h.CODE}-RB`, documentTitle: 'B' });
  ids.busy = await h.ingest(mine, u.author, textFile('A version with a long history.'), { documentCode: `${h.CODE}-BUSY`, documentTitle: 'Busy' });

  ann.open = await annotate(mine, ids.txt, 'Open change request.');
  ann.resolved = await annotate(mine, ids.txt, 'To be resolved.');
  const res = await request(await h.appFor(mine, u.reviewer)).post(`/api/c2c/project-vault/${mine.programId}/annotations/${ann.resolved}/resolve`)
    .send({ note: 'Resolved for the record test.' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  ann.foreign = await annotate(mine, ids.otherDoc, 'On another document.');
  ann.gone = await annotate(gone, ids.gone, 'To be purged with its version.');
  const rel = await request(await h.appFor(relProgram, u.author))
    .post(`/api/c2c/project-vault/${relProgram.programId}/documents/${ids.relA}/relationships`).send({ toDocumentId: ids.relB, type: 'references' });
  expect(rel.status, JSON.stringify(rel.body)).toBe(201);

  const doc = (await h.state.owner.query('SELECT btrim(content_hash) AS h FROM vault.documents WHERE id = $1', [ids.txt])).rows[0];
  rowTemplate = {
    organization_id: mine.orgId, program_id: mine.programId, document_id: ids.txt, kind: 'comment',
    body: 'Inserted directly.', body_sha256: sha('Inserted directly.'), content_hash: doc.h, anchor_kind: 'document',
    author_id: u.author, author_name: 'Ada Author',
  };
}, 120_000);

afterAll(async () => {
  await h.cleanup().catch(() => {});
  await h.state.owner.end().catch(() => {});
  await h.removeStorage([mine, other, gone]);
});

describe('the record refuses a post its writer would refuse (critique 15)', () => {
  it('admits a well-formed direct post, as the control', async () => {
    expect((await insertAs({})).ok).toBe(true);
  });

  it('refuses another organisation, program or byte content, and a body hash that is not its own', async () => {
    refused(await insertAs({ organization_id: other.orgId }));
    refused(await insertAs({ program_id: relProgram.programId }));
    refused(await insertAs({ content_hash: 'f'.repeat(64) }));
    refused(await insertAs({ body_sha256: sha('Other words.') }));
  });

  it('refuses a passage not where it says, a stale text hash, a page beyond the count, and a page on a version without one', async () => {
    const text = 'A dose of 5 mg once daily.';
    const good = { anchor_kind: 'text', quote: '5 mg', char_start: 10, char_end: 14, text_sha256: sha(text) };
    expect((await insertAs(good)).ok).toBe(true);
    refused(await insertAs({ ...good, char_start: 11, char_end: 15 }));
    refused(await insertAs({ ...good, text_sha256: 'e'.repeat(64) }));
    const pdfHash = (await h.state.owner.query('SELECT btrim(content_hash) AS h FROM vault.documents WHERE id = $1', [ids.pdf])).rows[0].h;
    const page = { document_id: ids.pdf, content_hash: pdfHash, anchor_kind: 'page', page_number: 2, pages_at_post: 3 };
    expect((await insertAs(page)).ok).toBe(true);
    refused(await insertAs({ ...page, page_number: 4, pages_at_post: 4 }));
    refused(await insertAs({ ...page, pages_at_post: 5 }));
    refused(await insertAs({ anchor_kind: 'page', page_number: 1, pages_at_post: 1 }));
  });

  it('refuses a reply under a closed or foreign annotation, a closed post, and a deleted version', async () => {
    const reply = { anchor_kind: null, parent_id: ann.open };
    expect((await insertAs(reply)).ok).toBe(true);
    refused(await insertAs({ ...reply, parent_id: ann.resolved }));
    refused(await insertAs({ ...reply, parent_id: ann.foreign }));
    refused(await insertAs({ resolved_at: new Date().toISOString(), resolved_by: u.author, resolved_by_name: 'Ada Author', resolution_note: 'Born resolved.' }));
    await h.state.owner.query('UPDATE vault.documents SET deleted_at = now() WHERE id = $1', [ids.otherDoc]);
    try {
      const otherHash = (await h.state.owner.query('SELECT btrim(content_hash) AS h FROM vault.documents WHERE id = $1', [ids.otherDoc])).rows[0].h;
      refused(await insertAs({ document_id: ids.otherDoc, content_hash: otherHash }));
    } finally {
      await h.state.owner.query('UPDATE vault.documents SET deleted_at = NULL WHERE id = $1', [ids.otherDoc]).catch(() => {});
    }
  });
});

describe('the record never changes and is never deleted while its version exists (critique 15)', () => {
  it('refuses changes to its words, anchor and author, and a second or foreign outcome', async () => {
    for (const set of ["body = 'Reworded.'", "author_name = 'Someone Else'", 'organization_id = organization_id + 1', "kind = 'comment'"]) {
      refused(await h.asRuntime(`UPDATE public.vault_version_annotations SET ${set} WHERE id = $1`, [ann.open], mine));
    }
    refused(await h.asRuntime(`UPDATE public.vault_version_annotations SET resolution_note = 'Rewritten note.' WHERE id = $1`, [ann.resolved], mine));
    refused(await h.asRuntime(
      `UPDATE public.vault_version_annotations SET retracted_by = $2, retracted_by_name = 'Rex Reviewer', retraction_reason = 'Not the author.' WHERE id = $1`,
      [ann.open, u.reviewer], mine));
    refused(await h.asRuntime(
      `UPDATE public.vault_version_annotations SET retracted_by = $2, retracted_by_name = 'Ada Author', retraction_reason = 'After resolution.' WHERE id = $1`,
      [ann.resolved, u.author], mine));
  });

  it('refuses DELETE, a DELETE from a trigger the runtime role made itself, and TRUNCATE', async () => {
    refused(await h.asRuntime('DELETE FROM public.vault_version_annotations WHERE id = $1', [ann.open], mine));
    refused(await h.asRuntime(`
      CREATE TEMP TABLE depth_probe (x int);
      CREATE FUNCTION pg_temp.depth_probe_fn() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN DELETE FROM public.vault_version_annotations WHERE id = '${ann.open}'; RETURN NEW; END $f$;
      CREATE TRIGGER depth_probe_t AFTER INSERT ON depth_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.depth_probe_fn();
      INSERT INTO depth_probe VALUES (1);`, [], mine));
    await expect(h.state.owner.query('TRUNCATE public.vault_version_annotations')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(h.state.owner.query('DELETE FROM public.vault_version_annotations WHERE id = $1', [ann.open]))
      .rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    const still = await h.state.owner.query('SELECT 1 FROM public.vault_version_annotations WHERE id = $1', [ann.open]);
    expect(still.rowCount).toBe(1);
  });

  it("refuses a runtime-role DELETE of the program, which would cascade as the owner, for annotations and relationships", async () => {
    refused(await h.asRuntime('DELETE FROM regulatory_programs WHERE id = $1', [mine.programId], mine));
    refused(await h.asRuntime('DELETE FROM regulatory_programs WHERE id = $1', [relProgram.programId], mine));
    const left = await h.state.owner.query(
      `SELECT (SELECT count(*)::int FROM regulatory_programs WHERE id IN ($1, $2)) AS programs,
              (SELECT count(*)::int FROM public.vault_version_annotations WHERE id = $3) AS annotations,
              (SELECT count(*)::int FROM public.vault_document_relationships WHERE from_document_id = $4) AS relationships`,
      [mine.programId, relProgram.programId, ann.open, ids.relA],
    );
    expect(left.rows[0]).toEqual({ programs: 2, annotations: 1, relationships: 1 });
  });

  it("the tenant purge removes an organisation's annotations with its versions, and no one else's; the owners match", async () => {
    await h.state.owner.query('DELETE FROM vault.legal_holds WHERE organization_id = $1', [gone.orgId]).catch(() => {});
    await h.state.owner.query(`UPDATE organizations SET status = 'pending_deletion' WHERE id = $1`, [gone.orgId]);
    try {
      const r = await h.asRuntime('SELECT count(*)::int AS n FROM public.purge_tenant_vault_records($1)', [gone.orgId], 'system');
      expect(r.ok, r.ok ? '' : r.message).toBe(true);
    } finally {
      await h.state.owner.query(`UPDATE organizations SET status = 'active' WHERE id = $1`, [gone.orgId]);
    }
    const counts = await h.state.owner.query(
      `SELECT (SELECT count(*)::int FROM public.vault_version_annotations WHERE organization_id = $1) AS gone,
              (SELECT count(*)::int FROM public.vault_version_annotations WHERE organization_id = $2) AS mine,
              (SELECT relowner FROM pg_class WHERE oid = 'public.vault_version_annotations'::regclass)
                = (SELECT relowner FROM pg_class WHERE oid = 'vault.documents'::regclass) AS same_owner`,
      [gone.orgId, mine.orgId],
    );
    expect(counts.rows[0].gone).toBe(0);
    expect(counts.rows[0].mine).toBeGreaterThan(0);
    expect(counts.rows[0].same_owner).toBe(true);
  });
});

describe("a document's history says when older entries are not shown (critique 15)", () => {
  it('cuts at 200 entries and says so; a short history says nothing is cut', async () => {
    const { writeChainedAuditRow } = await import('../../server/services/auditService');
    const client = await h.state.owner.connect();
    try {
      await client.query('BEGIN');
      for (let i = 1; i <= 201; i += 1) {
        await writeChainedAuditRow(client, {
          tenantId: mine.orgId, userId: u.author, action: 'vault.document.fixity', resourceType: 'vault_document', resourceId: ids.busy,
          details: { description: `Window probe ${i}` },
        });
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    const busy = await request(await h.appFor(mine, u.author)).get(`/api/c2c/project-vault/${mine.programId}/documents/${ids.busy}/history`);
    expect(busy.status).toBe(200);
    expect(busy.body.data.truncated).toBe(true);
    const events = busy.body.data.entries.map((e: { event: string }) => e.event);
    expect(events).toHaveLength(200);
    expect(events[0]).toBe('Window probe 201');
    expect(events[199]).toBe('Window probe 2');
    const quiet = await request(await h.appFor(mine, u.author)).get(`/api/c2c/project-vault/${mine.programId}/documents/${ids.pdf}/history`);
    expect(quiet.body.data.truncated).toBe(false);
  });
});
