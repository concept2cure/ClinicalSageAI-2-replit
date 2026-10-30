/** Actual authenticated authoring HTTP and canonical SQL/evidence on PGlite.
 * Single-connection execution proves atomicity, not native PostgreSQL concurrency. */
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, OTHER_PROGRAM, PREREQ, PROGRAM, PROGRAM_B, VAULT_DDL, asToken, makeApp, mint } from './_authoring-canvas-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../services/document-data-disposition/__tests__/lineage-stores-fixture';
import type { AssemblyPlan } from '../../../shared/authoring/assembly';
import { getIndAuthoringTemplates } from '../../services/authoring/ind-authoring-templates';
import { builtinAuthoringTemplateId } from '../../services/authoring/builtin-authoring-templates';
import { registerAssemblyFilingCases } from './_authoring-assembly-filing-cases';
import { registerAssemblySectionSourceCases } from './_authoring-assembly-section-source-cases';
import { readSelectedAuthoringSources } from '../../services/authoring/authoring-assembly-sources';
import type { AssemblySourceManifest, AssemblySourceSelector } from '../../../shared/authoring/assembly-sources';

const seam = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, sql: [] as string[], fail: '', matches: 0,
  commitFault: '' as '' | 'before' | 'after' | 'revoked', releases: [] as unknown[] }));
vi.mock('../../db', () => ({ get db() { return seam.db; }, get pool() { return seam.pool; }, getPool: () => seam.pool,
  query: (sql: string, args?: unknown[]) => (seam.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let docId: string;
let releaseCleanup = Promise.resolve();
interface FixtureSection extends Record<string, unknown> { id: string; code: string; order_index: number | null }
interface FixtureAssemblyAudit { metadata: { assembly: { fingerprint: string; templateSnapshot: string } } }
const TEMPLATE = 'dddddddd-0000-4000-8000-000000000001';
const FOREIGN_TEMPLATE = 'dddddddd-0000-4000-8000-000000000002';
const outline = () => [
  { code: '2.5.1', title: 'Kept source heading', content: '<p>Stored template text one.</p>', order_index: 100 },
  { code: '2.5.2', title: 'Next template heading', content: '<p>Stored template text two.</p>', order_index: 200 },
  { code: '2.5.3', title: 'Last template heading', content: '<p>Stored template text three.</p>', order_index: 300 },
];

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL + RECORDED_LINEAGE_STORES_DDL
    + extractTableDdl('db/migrations/20260724_clinical_regulatory_evidence_spine.sql', ['cre_evidence_sources'])
    + 'ALTER TABLE cre_evidence_sources ADD COLUMN created_by integer;'
    + 'ALTER TABLE concept2cure_artifacts ADD COLUMN artifact_id text, ADD COLUMN content_hash text, ADD COLUMN metadata jsonb;', migrations: [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'db/migrations/20260725_authoring_audit_trail.sql',
    'db/migrations/20260813_audit_tamper_proof_log.sql',
    'db/migrations/20260730_authoring_runtime_ddl.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'db/migrations/20260727_authoring_object_permissions.sql',
    'db/migrations/20260803_document_span_lineage.sql',
    'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260728_authoring_document_governed_binding.sql',
    'migrations/20260814d_document_alias_map.sql',
    'migrations/20260921_audit_logs_chain_seq.sql',
    'migrations/20260921_authoring_document_provenance.sql',
    'migrations/20260905_document_catalog.sql',
    'migrations/20261008e_document_catalog_attribution.sql',
    'migrations/20261006_document_data_dispositions.sql',
    'migrations/20260726_cre_source_program_scope.sql',
    'migrations/20260829_cre_source_versioning.sql',
    'migrations/20261008c_data_room_source_text.sql',
  ] });
  seam.db = db.db;
  const query = async (sql: string, values?: unknown[]) => {
    seam.sql.push(sql);
    const writes: Record<string, RegExp> = { revision: /INSERT INTO doc_revisions\b/i,
      audit: /INSERT INTO authoring_audit_trail\b/i, lineage: /INSERT INTO document_span_lineage\b/i,
      sourceaudit: /INSERT INTO authoring_audit_trail\b/i };
    if (seam.fail === 'sourceaudit' && writes.sourceaudit.test(sql) && values?.includes('ASSEMBLY_SOURCES')) {
      seam.matches++; throw new Error('Injected assembly manifest evidence failure');
    }
    if (seam.fail && seam.fail !== 'sourceaudit' && writes[seam.fail].test(sql) && ++seam.matches === 2) throw new Error(`injected second-section ${seam.fail} failure`);
    return db.pool.query(sql, values);
  };
  let checkedOut = false;
  seam.pool = { query: async (sql: string, values?: unknown[]) => {
    if (checkedOut) throw new Error('No spare connection is available in the single-slot pool fixture');
    return query(sql, values);
  }, connect: async () => {
    checkedOut = true;
    return {
    query: async (sql: string, values?: unknown[]) => {
      if (sql === 'COMMIT' && seam.commitFault === 'before') { seam.sql.push(sql); throw new Error('Synthetic lost COMMIT send'); }
      const result = await query(sql, values);
      if (sql === 'COMMIT' && seam.commitFault === 'after') throw new Error('Synthetic lost COMMIT response');
      if (sql === 'COMMIT' && seam.commitFault === 'revoked') {
        await db.pool.query('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=42');
        await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
      }
      return result;
    },
    release(error?: Error) {
      checkedOut = false;
      seam.releases.push(error);
      // PGlite has one connection. A real discarded connection closes and
      // rolls back its server-side open transaction; model that separately.
      if (error && seam.commitFault === 'before') releaseCleanup = db.pool.query('ROLLBACK').then(() => undefined);
    },
  }; } };
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
  await db.pool.query(`INSERT INTO authoring_templates(id,template_name,template_content,is_active,tenant_id,regions,template_type)
    VALUES($1,'Organization assembly template',$2::jsonb,true,$3,ARRAY['FDA'],'section'),($4,'Foreign template',$2::jsonb,true,2,ARRAY['FDA'],'section')`,
  [TEMPLATE, JSON.stringify({ sections: outline() }), ORG, FOREIGN_TEMPLATE]);
}, 180_000);
afterAll(async () => { await releaseCleanup; await db?.close(); });
beforeEach(async () => {
  await releaseCleanup;
  seam.fail = ''; seam.matches = 0; seam.commitFault = ''; seam.releases = [];
  await db.pool.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
  await db.pool.query("UPDATE users SET status='active' WHERE id=$1", [Number(AUTHOR.id)]);
  await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
  await db.pool.query("UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42", [Number(AUTHOR.id)]);
  await db.pool.query("UPDATE authoring_templates SET template_content=$1::jsonb,is_active=true,metadata=$2::jsonb,regions=ARRAY['FDA'] WHERE id=$3",
    [JSON.stringify({ sections: outline() }), '{}', TEMPLATE]);
  docId = randomUUID();
  await db.pool.query(`INSERT INTO authoring_documents(id,title,module,status,created_by,tenant_id,client_program_id,provenance)
    VALUES($1,'Current document','M2','draft',$2,$3,$4,$5::jsonb)`, [docId, AUTHOR.id, ORG, PROGRAM, '{"source":"seed","note":"Keep this parent metadata"}']);
  await db.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id,track_changes)
    VALUES(gen_random_uuid(),$1,' 2.5.1 ','Original title','<p>Original authored text.</p>',900,$2,true)`, [docId, ORG]);
  seam.sql.length = 0;
});

const body = (extra: Record<string, unknown> = {}) => ({ programId: PROGRAM, templateId: TEMPLATE, selection: { target: 'document' }, ...extra });
const preview = (extra: Record<string, unknown> = {}) => author(request(app).post(`/api/authoring/docs/${docId}/assembly/preview`)).send(body(extra));
const commit = (plan: Pick<AssemblyPlan, 'fingerprint'>, extra: Record<string, unknown> = {}) => author(request(app).post(`/api/authoring/docs/${docId}/assembly/commit`))
  .send({ ...body(), fingerprint: plan.fingerprint, reason: 'Assemble the reviewed template structure', ...extra });
async function plan(extra: Record<string, unknown> = {}): Promise<AssemblyPlan> {
  const response = await preview(extra);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data;
}
async function stored(): Promise<FixtureSection[]> {
  return (await db.pool.query('SELECT * FROM authoring_sections WHERE doc_id=$1 ORDER BY order_index,created_at,id', [docId])).rows as FixtureSection[];
}
async function evidenceCounts() {
  return (await db.pool.query(`SELECT (SELECT count(*)::int FROM doc_revisions WHERE section_id IN(SELECT id FROM authoring_sections WHERE doc_id=$1)) AS revisions,
    (SELECT count(*)::int FROM authoring_audit_trail WHERE doc_id=$1) AS audits,
    (SELECT count(*)::int FROM document_span_lineage WHERE document_id IN(SELECT id::text FROM authoring_sections WHERE doc_id=$1)) AS lineage`, [docId])).rows[0];
}
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
async function captured(text = 'Captured unfiled protocol: synthetic participant count 12; investigator review required.') {
  const contentHash = sha(randomUUID());
  const rows = (await db.pool.query(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,version,extraction_status,extracted_text,created_by)
    VALUES($1,$2,'client_document','Captured protocol',$3,'capture-1','extracted',$4,$5) RETURNING id`,
  [ORG, PROGRAM, contentHash, text, Number(AUTHOR.id)])).rows as Array<{ id: number }>;
  return { kind: 'data-room' as const, sourceId: rows[0].id, expectedChecksum: contentHash };
}
async function vaulted(text = 'Vault source: synthetic treatment exposure and investigator findings.') {
  const documentId = randomUUID(); const contentHash = sha(documentId);
  await db.pool.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,content_hash,extracted_text)
    VALUES($1::uuid,$2,$3,$1::uuid::text,'Vault protocol','protocol',$4,$5)`, [documentId, PROGRAM, ORG, contentHash, text]);
  await db.pool.query(`INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES($1,$2,'extracted','plain-text',$3)`, [documentId, contentHash, text.length]);
  return { kind: 'vault' as const, documentId, expectedChecksum: contentHash };
}
const sourceIdentity = () => ({ organizationId: ORG, userId: Number(AUTHOR.id), programId: PROGRAM });
const readSources = (sources: AssemblySourceSelector[], expectedManifest?: AssemblySourceManifest) =>
  readSelectedAuthoringSources({ query: async (sql, args) => ({ rows: (await db.pool.query(sql, args)).rows as Array<Record<string, unknown>> }) },
    sourceIdentity(), sources, { expectedManifest });
async function withdraw(source: Awaited<ReturnType<typeof captured>>, choice: 'keep_data' | 'remove_data') {
  await db.pool.query(`INSERT INTO public.document_data_dispositions
    (organization_id,program_id,captured_source_id,choice,reason,actor_id,source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt)
    VALUES($1,$2,$3,$4,'Governed synthetic source withdrawal for integration verification',$5,$6,$6,$7::jsonb,'{}'::jsonb,$8::jsonb)`,
  [ORG, PROGRAM, source.sourceId, choice, Number(AUTHOR.id), source.expectedChecksum,
    JSON.stringify({ capturedSourceIds: [source.sourceId], vaultDocumentIds: [], artifactIds: [], uploadIds: [] }),
    JSON.stringify({ id: randomUUID(), sha256Chain: 'a'.repeat(64) })]);
}

describe('catalogue sources through the existing assembly HTTP and SQL', () => {
  it('previews an ordered mixed unfiled Data Room/Vault set without copying source prose or writing rows', async () => {
    const sources = [await captured(), await vaulted()];
    seam.sql.length = 0;
    const planned = await plan({ sources });
    expect(planned.sources?.entries.map(entry => entry.source)).toEqual(sources);
    expect(planned.sources?.entries.map(entry => entry.title)).toEqual(['Captured protocol', 'Vault protocol']);
    expect(planned.sources?.entries.every(entry => entry.extractedTextSha256.length === 64 && entry.span.sha256.length === 64)).toBe(true);
    expect(JSON.stringify(planned)).not.toContain('synthetic participant count');
    expect(seam.sql.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
    const verified = await readSources(sources, planned.sources);
    expect(verified.manifest).toEqual(planned.sources);
    expect(verified.chunks[0]).toMatchObject({ sourceId: `cre_source:${sources[0].kind === 'data-room' ? sources[0].sourceId : ''}` });
    expect(verified.chunks[1].sourceId).toBeNull();
  });

  it('records reference intent even when every selected section is preserved, with no new text or genesis', async () => {
    const sources = [await captured()]; const selection = { target: 'section', code: '2.5.1' };
    const planned = await plan({ sources, selection }); const before = await stored();
    const parent = (await db.pool.query('SELECT provenance FROM authoring_documents WHERE id=$1', [docId])).rows[0];
    const response = await commit(planned, { sources, selection });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await stored()).toEqual(before);
    expect(await evidenceCounts()).toMatchObject({ revisions: 0, audits: 1, lineage: 0 });
    const audits = (await db.pool.query('SELECT operation_type,section_id,metadata FROM authoring_audit_trail WHERE doc_id=$1', [docId])).rows;
    expect(audits).toEqual([expect.objectContaining({ operation_type: 'ASSEMBLY_SOURCES', section_id: null,
      metadata: expect.objectContaining({ assembly: expect.objectContaining({ sources: planned.sources, selection }) }) })]);
    expect((await db.pool.query('SELECT provenance FROM authoring_documents WHERE id=$1', [docId])).rows[0]).toEqual(parent);
    expect(seam.sql.some(sql => sql.includes('cre_evidence_sources') && sql.includes('FOR SHARE'))).toBe(true);
  });

  it('persists the same manifest on appended section evidence and the document assembly event', async () => {
    const sources = [await captured(), await vaulted()]; const planned = await plan({ sources });
    const response = await commit(planned, { sources });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await evidenceCounts()).toMatchObject({ revisions: 2, audits: 3 });
    const audits = (await db.pool.query('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1', [docId])).rows as Array<{ metadata: { assembly: { sources: AssemblySourceManifest } } }>;
    expect(audits.every(row => row.metadata.assembly.sources.fingerprint === planned.sources?.fingerprint)).toBe(true);
    expect((await stored()).every(row => !String(row.content).includes('synthetic participant count'))).toBe(true);
  });

  it.each(['data-room', 'vault'] as const)('rejects a same-length %s extraction correction and rolls back the entire source-bound build', async kind => {
    const source = kind === 'data-room' ? await captured('Observed result 12 participants.') : await vaulted('Observed result 12 participants.');
    const planned = await plan({ sources: [source] }); const before = await stored(); const counts = await evidenceCounts();
    if (source.kind === 'data-room') await db.pool.query('UPDATE cre_evidence_sources SET extracted_text=$2 WHERE id=$1', [source.sourceId, 'Observed result 13 participants.']);
    else await db.pool.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [source.documentId, 'Observed result 13 participants.']);
    const response = await commit(planned, { sources: [source] });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.data).toBeUndefined();
    expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(counts);
    expect(seam.sql.some(sql => /^ROLLBACK/.test(sql))).toBe(true);
  });

  it('reuses the exact bounded preview span despite a later query and rejects a forged excerpt receipt', async () => {
    const text = 'Unrelated preamble. '.repeat(800) + 'Captured protocol primary efficacy result. '.repeat(400);
    const source = await captured(text); const planned = await plan({ sources: [source] });
    const manifest = planned.sources!;
    expect(manifest.entries[0].span.end - manifest.entries[0].span.start).toBeLessThanOrEqual(8000);
    const verified = await readSelectedAuthoringSources({ query: async (sql, args) => ({ rows: (await db.pool.query(sql, args)).rows as Array<Record<string, unknown>> }) },
      sourceIdentity(), [source], { query: 'unrelated preamble', expectedManifest: manifest });
    expect(verified.chunks[0].content).toBe(text.slice(manifest.entries[0].span.start, manifest.entries[0].span.end));
    const forged = globalThis.structuredClone(manifest); forged.entries[0].span.sha256 = 'f'.repeat(64);
    await expect(readSources([source], forged)).rejects.toMatchObject({ status: 409, code: 'ASSEMBLY_SOURCES_CHANGED' });
  });

  it('refuses another project source and never reads its body', async () => {
    const source = await captured();
    await db.pool.query('UPDATE cre_evidence_sources SET client_program_id=$2 WHERE id=$1', [source.sourceId, PROGRAM_B]);
    seam.sql.length = 0;
    const response = await preview({ sources: [source] });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.data).toBeUndefined();
    expect(seam.sql.some(sql => /^SELECT extracted_text FROM cre_evidence_sources/.test(sql))).toBe(false);
    expect(seam.sql.some(sql => /SELECT s\.\*,/.test(sql))).toBe(false);
  });

  it('fails the selected set when one source becomes unreadable instead of silently dropping it', async () => {
    const sources = [await captured(), await captured('Will become unavailable.')];
    await db.pool.query("UPDATE cre_evidence_sources SET extracted_text='',extraction_status='failed' WHERE id=$1", [sources[1].sourceId]);
    const response = await preview({ sources });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error).toBe('ASSEMBLY_SOURCES_UNAVAILABLE');
    expect(response.body.data).toBeUndefined();
  });
});

describe('retained source eligibility and transactional reference evidence', () => {
  it('allows current verified retained Data Room text while disclosing the unavailable original', async () => {
    const source = await captured();
    await withdraw(source, 'keep_data');
    const planned = await plan({ sources: [source] });
    expect(planned.sources?.entries[0]).toMatchObject({ originalFileAvailable: false, disposition: 'keep_data' });
    expect(planned.sources?.limitations.join(' ')).toContain('original file is unavailable');
    const response = await commit(planned, { sources: [source] });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
  });

  it.each(['withdrawn', 'superseded', 'checksum'] as const)('refuses a %s selected Data Room record without appending anything', async reason => {
    const source = await captured(); const sources = [source]; const planned = await plan({ sources });
    const before = await stored(); const counts = await evidenceCounts();
    if (reason === 'withdrawn') await withdraw(source, 'remove_data');
    else if (reason === 'superseded') await db.pool.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [source.sourceId]);
    else source.expectedChecksum = 'f'.repeat(64);
    const response = await commit(planned, { sources });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.data).toBeUndefined();
    expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(counts);
  });

  it('rolls back all appended text and evidence if recording the source-reference event fails', async () => {
    const sources = [await captured()]; const planned = await plan({ sources });
    const before = await stored(); const counts = await evidenceCounts();
    seam.fail = 'sourceaudit';
    const response = await commit(planned, { sources });
    expect(response.status, JSON.stringify(response.body)).toBe(503);
    expect(seam.matches).toBe(1);
    expect(await stored()).toEqual(before); expect(await evidenceCounts()).toEqual(counts);
    expect(seam.sql.some(sql => /^ROLLBACK/.test(sql))).toBe(true);
  });

  it('rechecks current source-parent access after reading and withholds an asynchronously revoked source', async () => {
    const sources = [await captured()]; let revoked = false;
    const q = { query: async (sql: string, args?: unknown[]) => {
      const result = await db.pool.query(sql, args);
      if (!revoked && /^SELECT extracted_text FROM cre_evidence_sources/.test(sql)) {
        revoked = true;
        await db.pool.query('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=42');
        await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
      }
      return { rows: result.rows as Array<Record<string, unknown>> };
    } };
    await expect(readSelectedAuthoringSources(q, sourceIdentity(), sources)).rejects.toMatchObject({ code: 'ASSEMBLY_SOURCES_UNAVAILABLE' });
    expect(revoked).toBe(true);
  });
});

describe('current-document assembly over real HTTP', () => {
  it('refuses an explicitly empty catalogue selection instead of silently building without its sources', async () => {
    const response = await preview({ sources: [] });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error).toBe('ASSEMBLY_SOURCES_INVALID');
    expect(seam.sql.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('previews without writes and preserves normalized existing identities/content/order', async () => {
    const planned = await plan();
    expect(planned.rows.map(row => [row.code, row.disposition, row.ordering])).toEqual([
      [' 2.5.1 ', 'preserve', 900], ['2.5.2', 'append', 901], ['2.5.3', 'append', 902],
    ]);
    expect(planned.rows[0].content).toBe('<p>Original authored text.</p>');
    expect(planned.rows[1].content).toBe('<p>Stored template text two.</p>');
    expect(planned.rows.every(row => !row.aiDraftable)).toBe(true);
    expect(planned.draftRegion).toBe('FDA');
    expect(seam.sql.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('appends all missing sections atomically while keeping every existing field and parent metadata', async () => {
    const before = await stored();
    const parent = (await db.pool.query('SELECT template_id,provenance,title,module,status FROM authoring_documents WHERE id=$1', [docId])).rows[0];
    const planned = await plan();
    const response = await commit(planned, { sections: [{ code: 'evil', content: 'Untrusted replacement' }] });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const rows = await stored();
    expect(rows[0]).toEqual(before[0]);
    expect(rows.map(row => row.order_index)).toEqual([900, 901, 902]);
    expect(response.body.data.sections.map((row: { id: string }) => row.id)).toEqual(rows.map(row => row.id));
    expect((await db.pool.query('SELECT template_id,provenance,title,module,status FROM authoring_documents WHERE id=$1', [docId])).rows[0]).toEqual(parent);
    expect(await evidenceCounts()).toMatchObject({ revisions: 2, audits: 2 });
    const metadata = (await db.pool.query("SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND operation_type='CREATE' ORDER BY created_at,id", [docId])).rows as FixtureAssemblyAudit[];
    expect(metadata.every(row => row.metadata.assembly.fingerprint === planned.fingerprint && row.metadata.assembly.templateSnapshot === planned.templateSnapshot)).toBe(true);
  });

  it('assembles one selected section and a later unchanged preserved-only plan writes nothing', async () => {
    const selection = { target: 'section', code: ' 2.5.3 ' };
    const planned = await plan({ selection });
    const response = await commit(planned, { selection });
    expect(response.status).toBe(200);
    expect((await stored()).map(row => row.code)).toEqual([' 2.5.1 ', '2.5.3']);
    const again = await plan({ selection });
    seam.sql.length = 0;
    expect((await commit(again, { selection })).status).toBe(200);
    expect(seam.sql.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('refuses a repeated old fingerprint and never duplicates completed rows', async () => {
    const planned = await plan();
    expect((await commit(planned)).status).toBe(200);
    const repeated = await commit(planned);
    expect(repeated.status).toBe(409);
    expect(repeated.body.error).toBe('ASSEMBLY_CHANGED');
    expect(await stored()).toHaveLength(3);
  });

  it.each(['revision', 'audit', 'lineage'])('rolls back all new rows/evidence and parent timestamp when the second %s fails', async failure => {
    const before = await stored();
    const parent = (await db.pool.query('SELECT updated_at FROM authoring_documents WHERE id=$1', [docId])).rows[0];
    const planned = await plan();
    seam.fail = failure;
    const response = await commit(planned);
    seam.fail = '';
    expect(response.status, JSON.stringify(response.body)).toBe(503);
    expect(await stored()).toEqual(before);
    expect(await evidenceCounts()).toEqual({ revisions: 0, audits: 0, lineage: 0 });
    expect((await db.pool.query('SELECT updated_at FROM authoring_documents WHERE id=$1', [docId])).rows[0]).toEqual(parent);
    expect((await commit(planned)).status).toBe(200);
  });

  it.each(['text', 'order', 'title', 'template', 'guidance'])('refuses stale %s without changing any saved row', async change => {
    const planned = await plan();
    if (change === 'text') await db.pool.query("UPDATE authoring_sections SET content='Changed by another writer' WHERE doc_id=$1", [docId]);
    if (change === 'order') await db.pool.query('UPDATE authoring_sections SET order_index=5 WHERE doc_id=$1', [docId]);
    if (change === 'title') await db.pool.query("UPDATE authoring_documents SET title='Renamed' WHERE id=$1", [docId]);
    if (change === 'template') await db.pool.query("UPDATE authoring_templates SET template_content=jsonb_set(template_content,'{sections,1,content}','\"Changed template\"') WHERE id=$1", [TEMPLATE]);
    if (change === 'guidance') await db.pool.query('UPDATE authoring_templates SET guidance_content=$1::jsonb WHERE id=$2', ['{"scope":"Changed guidance"}', TEMPLATE]);
    const before = await stored();
    const response = await commit(planned);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ASSEMBLY_CHANGED');
    expect(await stored()).toEqual(before);
  });
});

describe('fresh authorization, structure and regional template scope', () => {
  it.each(['viewer', 'disabled', 'private', 'grant', 'frozen'])('freshly refuses %s changes after preview', async change => {
    const planned = await plan();
    if (change === 'viewer') await db.pool.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
    if (change === 'disabled') await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [Number(AUTHOR.id)]);
    if (change === 'private') {
      await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
      await db.pool.query('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=42');
    }
    if (change === 'grant') await db.pool.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1', [docId]);
    if (change === 'frozen') await db.pool.query("UPDATE authoring_documents SET status='FROZEN' WHERE id=$1", [docId]);
    const response = await commit(planned);
    expect(response.status).toBe(403);
    expect(await stored()).toHaveLength(1);
  });

  it('refuses a foreign template, foreign project and a same-organization different project target', async () => {
    expect((await preview({ templateId: FOREIGN_TEMPLATE })).status).toBe(404);
    expect((await preview({ programId: OTHER_PROGRAM })).status).toBe(404);
    expect((await preview({ programId: PROGRAM_B })).status).toBe(404);
  });

  it.each([null, 2_147_483_647])('refuses unsafe append order %s without renumbering', async order => {
    await db.pool.query('UPDATE authoring_sections SET order_index=$1 WHERE doc_id=$2', [order, docId]);
    expect((await preview()).status).toBe(409);
    expect((await stored())[0].order_index).toBe(order);
  });

  it('refuses normalized duplicate template codes and a missing selected code', async () => {
    expect((await preview({ selection: { target: 'section', code: 'absent' } })).status).toBe(404);
    const sections = outline(); sections[2].code = ' 2.5.2 ';
    await db.pool.query('UPDATE authoring_templates SET template_content=$1::jsonb WHERE id=$2', [JSON.stringify({ sections }), TEMPLATE]);
    expect((await preview()).status).toBe(409);
  });

  it('preserves builtin empty structure and exact recorded guidance without changing the parent template identity', async () => {
    const template = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
    const planned = await plan({ templateId: template.id });
    expect(planned.draftRegion).toBe('FDA');
    expect(planned.rows.filter(row => row.disposition === 'append').every(row => row.content === '' && !!row.draftingGuidance)).toBe(true);
    const response = await commit(planned, { templateId: template.id });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const saved = response.body.data.sections.find((row: { id: string; code: string }) => row.code === planned.rows.find(row => row.disposition === 'append')!.code);
    const guide = await author(request(app).get(`/api/authoring/guidance/${saved.id}`));
    expect(guide.status, JSON.stringify(guide.body)).toBe(200);
    expect(JSON.stringify(guide.body)).toContain(template.id);
    const parent = (await db.pool.query('SELECT template_id FROM authoring_documents WHERE id=$1', [docId])).rows[0] as { template_id: string | null };
    expect(parent.template_id).toBeNull();
  });

  it('uses Canadian drafting scope and refuses a module mismatch instead of assuming FDA', async () => {
    const id = builtinAuthoringTemplateId('registry:CA_CTA');
    expect((await preview({ templateId: id })).body.error).toBe('TEMPLATE_MODULE_MISMATCH');
    await db.pool.query('UPDATE authoring_documents SET module=NULL WHERE id=$1', [docId]);
    expect((await plan({ templateId: id })).draftRegion).toBe('Health Canada');
  });

  it('keeps preparation templates in manual mode and rejects a recorded regional conflict', async () => {
    const templateId = builtinAuthoringTemplateId('component:pil');
    await db.pool.query('UPDATE authoring_documents SET module=NULL WHERE id=$1', [docId]);
    const planned = await plan({ templateId });
    expect(planned.rows.every(row => !row.aiDraftable)).toBe(true);
    expect(planned.limitations.join(' ')).toContain('not a QRD leaflet');
    const source = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
    const { builtinTemplateSource } = await import('../../services/authoring/authoring-template-sections');
    await db.pool.query('UPDATE authoring_documents SET template_id=$1,provenance=$2::jsonb WHERE id=$3',
      [source.id, JSON.stringify({ templateSource: builtinTemplateSource(source) }), docId]);
    expect((await preview({ templateId })).body.error).toBe('ASSEMBLY_TEMPLATE_SCOPE_MISMATCH');
  });

  it('refuses common sections in a bound market copy using the canonical filing rule', async () => {
    await db.pool.query("ALTER TABLE c2c_documents ADD COLUMN IF NOT EXISTS filing_scope text DEFAULT 'home'");
    const filing = `market_${randomUUID()}`;
    await db.pool.query("INSERT INTO c2c_documents(id,org_id,project_id,filing_scope,doc_type,agency) VALUES($1,$2,$3,'market','maa','ema')", [filing, ORG, PROGRAM]);
    await db.pool.query("UPDATE authoring_templates SET regions=ARRAY['EMA'] WHERE id=$1", [TEMPLATE]);
    await db.pool.query('UPDATE authoring_documents SET c2c_document_id=$1 WHERE id=$2', [filing, docId]);
    const response = await preview();
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('WRONG_FILING_SCOPE');
    expect(await stored()).toHaveLength(1);
  });
});

const assemblyCaseFixture = { query: (sql: string, args?: unknown[]) => db.pool.query(sql, args), documentId: () => docId,
  clearStatements: () => { seam.sql.length = 0; }, getStatements: () => seam.sql,
  preview, commit, plan, stored, evidenceCounts, captured };
registerAssemblyFilingCases(assemblyCaseFixture);
registerAssemblySectionSourceCases({ ...assemblyCaseFixture, templateId: TEMPLATE, vaulted, readSources });

describe('uncertain assembly commit transport', () => {
  it.each(['before', 'after'] as const)('discards the client without rollback/retry when the %s-COMMIT transport fails', async fault => {
    const planned = await plan();
    seam.commitFault = fault; seam.sql.length = 0;
    const response = await commit(planned);
    await releaseCleanup;
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body).not.toHaveProperty('data');
    expect(seam.sql.filter(sql => sql === 'COMMIT')).toHaveLength(1);
    expect(seam.sql).not.toContain('ROLLBACK');
    expect(seam.releases).toEqual([expect.any(Error)]);
    expect(await stored()).toHaveLength(fault === 'after' ? 3 : 1);
    const checked = await plan();
    expect(checked.rows.filter(row => row.disposition === 'append')).toHaveLength(fault === 'after' ? 0 : 2);
  });

  it('withholds private content if project access is revoked after a confirmed commit', async () => {
    const planned = await plan();
    seam.commitFault = 'revoked'; seam.sql.length = 0;
    const response = await commit(planned);
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body).not.toHaveProperty('data');
    expect(JSON.stringify(response.body)).not.toContain('Original authored text');
    expect(await stored()).toHaveLength(3);
    expect(seam.sql).not.toContain('ROLLBACK');
    expect(seam.releases).toEqual([undefined]);
  });
});

describe('universal template source and regional mapping', () => {
  it.each([['US_IND', 'FDA'], ['CA_CTA', 'Health Canada'], ['EU_MAA', 'EMA'], ['JP_CTN', 'PMDA']])('retains exact %s drafting region %s', async (registryId, expectedRegion) => {
    await db.pool.query('UPDATE authoring_documents SET module=NULL WHERE id=$1', [docId]);
    const planned = await plan({ templateId: builtinAuthoringTemplateId(`registry:${registryId}`) });
    expect(planned.draftRegion).toBe(expectedRegion);
    expect(planned.rows.length).toBeGreaterThan(0);
    expect(planned.limitations.join(' ')).toMatch(/current agency|current applicable|current agency\/client/);
  });

  it('commits the global reference resolver inside one transaction and copies only its empty structure', async () => {
    await db.pool.query('CREATE SCHEMA IF NOT EXISTS intelligence');
    await db.pool.query(`CREATE TABLE IF NOT EXISTS intelligence.document_templates(id uuid PRIMARY KEY,template_name text,document_type text,agency text,status text,module_path text)`);
    await db.pool.query('CREATE TABLE IF NOT EXISTS intelligence.template_sections(template_id uuid,section_code text,section_title text,ordering integer)');
    const id = randomUUID();
    await db.pool.query("INSERT INTO intelligence.document_templates VALUES($1,'Global reference','section','hc','active','2.8')", [id]);
    await db.pool.query("INSERT INTO intelligence.template_sections VALUES($1,'2.8.1','Global first',100),($1,'2.8.2','Global second',200)", [id]);
    const planned = await plan({ templateId: id });
    expect(planned.draftRegion).toBe('Health Canada');
    expect(planned.rows.map(row => [row.code, row.content, row.aiDraftable])).toEqual([['2.8.1', '', false], ['2.8.2', '', false]]);
    const response = await commit(planned, { templateId: id });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((await stored()).map(row => row.order_index)).toEqual([900, 901, 902]);
  });
});
