/** Signed-JWT HTTP and real canonical SQL; PGlite does not prove concurrent scheduling. */
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, PREREQ, PROGRAM, PROGRAM_B, VAULT_DDL, asToken, makeApp, mint } from './_authoring-canvas-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../services/document-data-disposition/__tests__/lineage-stores-fixture';
import type { AssemblySourceManifest, AssemblySourceSelector } from '../../../shared/authoring/assembly-sources';
import { writeChainedAuditRow } from '../../services/auditService';

const seam = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown, sql: [] as string[],
  afterQuery: undefined as undefined | ((sql: string, args?: unknown[]) => Promise<void>) }));
vi.mock('../../db', () => ({ get db() { return seam.db; }, get pool() { return seam.pool; }, getPool: () => seam.pool,
  query: (sql: string, args?: unknown[]) => (seam.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
let db: JourneyDb; let app: express.Express; let docId: string;
let author: (r: request.Test) => request.Test;
let viewer: (r: request.Test) => request.Test;
const TEMPLATE = 'dddddddd-0000-4000-8000-000000000098';
const READER = { id: '5', organizationId: ORG, email: 'reader@canvas.example', name: 'Saved source reader' };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

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
  const query = async (sql: string, args?: unknown[]) => {
    seam.sql.push(sql); const result = await db.pool.query(sql, args);
    await seam.afterQuery?.(sql, args); return result;
  };
  seam.pool = { query, connect: async () => ({ query, release: () => undefined }) };
  author = asToken(await mint(AUTHOR)); viewer = asToken(await mint(READER));
  const { default: router } = await import('../authoring.router'); app = makeApp(router);
  await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,5,'viewer')", [ORG]);
  await db.pool.query("UPDATE users SET email=$1 WHERE id=5", [READER.email]);
  await db.pool.query(`INSERT INTO authoring_templates(id,template_name,template_content,is_active,tenant_id,regions,template_type)
    VALUES($1,'Saved source fixture',$2::jsonb,true,$3,ARRAY['FDA'],'section')`,
  [TEMPLATE, JSON.stringify({ sections: [{ code: '2.5.1', title: 'Existing section', content: '', order_index: 1 }] }), ORG]);
}, 180_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  seam.afterQuery = undefined;
  await db.pool.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=3", [ORG]);
  await db.pool.query("UPDATE users SET status='active' WHERE id IN(3,5)");
  await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
  await db.pool.query('UPDATE projects SET owner_id=3,created_by_id=3 WHERE id=42');
  docId = randomUUID();
  await db.pool.query(`INSERT INTO authoring_documents(id,title,module,status,created_by,tenant_id,client_program_id,provenance)
    VALUES($1,'Saved source document','M2','draft',$2,$3,$4,'{"source":"seed","note":"Preserve parent provenance"}'::jsonb)`, [docId, AUTHOR.id, ORG, PROGRAM]);
  await db.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id)
    VALUES(gen_random_uuid(),$1,'2.5.1','Existing section','<p>Preserve this authored content.</p>',7,$2)`, [docId, ORG]);
  seam.sql.length = 0;
});

async function capture(text = 'Saved current evidence: observed result 12; verification remains necessary.'): Promise<Extract<AssemblySourceSelector, { kind: 'data-room' }>> {
  const checksum = sha(randomUUID());
  const rows = (await db.pool.query(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,version,extraction_status,extracted_text,created_by)
    VALUES($1,$2,'client_document','Saved capture',$3,'capture-1','extracted',$4,3) RETURNING id`, [ORG, PROGRAM, checksum, text])).rows as Array<{ id: number }>;
  return { kind: 'data-room', sourceId: rows[0].id, expectedChecksum: checksum };
}
async function vault(): Promise<AssemblySourceSelector> {
  const documentId = randomUUID(); const checksum = sha(documentId);
  await db.pool.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,content_hash,extracted_text)
    VALUES($1,$2,$3,$4,'Saved Vault source','protocol',$5,'Stored Vault evidence text.')`, [documentId, PROGRAM, ORG, `SAVED-${documentId}`, checksum]);
  await db.pool.query(`INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES($1,$2,'extracted','plain-text',27)`, [documentId, checksum]);
  return { kind: 'vault', documentId, expectedChecksum: checksum };
}
async function withdraw(source: Extract<AssemblySourceSelector, { kind: 'data-room' }>, choice: 'keep_data' | 'remove_data') {
  await db.pool.query(`INSERT INTO public.document_data_dispositions
    (organization_id,program_id,captured_source_id,choice,reason,actor_id,source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt)
    VALUES($1,$2,$3,$4,'Governed synthetic source withdrawal for saved-reference verification',3,$5,$5,$6::jsonb,'{}'::jsonb,$7::jsonb)`,
  [ORG, PROGRAM, source.sourceId, choice, source.expectedChecksum,
    JSON.stringify({ capturedSourceIds: [source.sourceId], vaultDocumentIds: [], artifactIds: [], uploadIds: [] }),
    JSON.stringify({ id: randomUUID(), sha256Chain: 'a'.repeat(64) })]);
}
async function build(sources: AssemblySourceSelector[]): Promise<{ manifest: AssemblySourceManifest; eventId: string }> {
  const input = { programId: PROGRAM, templateId: TEMPLATE, selection: { target: 'document' }, sources };
  const preview = await author(request(app).post(`/api/authoring/docs/${docId}/assembly/preview`)).send(input);
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const saved = await author(request(app).post(`/api/authoring/docs/${docId}/assembly/commit`)).send({ ...input,
    fingerprint: preview.body.data.fingerprint, reason: 'Record exact sources for this existing document' });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const rows = (await db.pool.query(`SELECT t.id FROM authoring_audit_trail t JOIN audit_logs a ON a.new_values->>'trailId'=t.id::text
    WHERE t.doc_id=$1 AND t.operation_type='ASSEMBLY_SOURCES' ORDER BY a.chain_seq DESC LIMIT 1`, [docId])).rows as Array<{ id: string }>;
  return { manifest: saved.body.data.plan.sources, eventId: rows[0].id };
}
const read = (query = `programId=${PROGRAM}`) => author(request(app).get(`/api/authoring/docs/${docId}/assembly/sources?${query}`));
const viewerRead = () => viewer(request(app).get(`/api/authoring/docs/${docId}/assembly/sources?programId=${PROGRAM}`));
async function corrupt(table: 'authoring_audit_trail' | 'audit_logs', sql: string, args?: unknown[]) {
  await db.pglite.exec(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  try { return await db.pool.query(sql, args); }
  finally { await db.pglite.exec(`ALTER TABLE ${table} ENABLE TRIGGER USER`); }
}
async function extraChain(eventId: string, orphan = false) {
  const rows = (await db.pool.query("SELECT new_values FROM audit_logs WHERE new_values->>'trailId'=$1", [eventId])).rows as Array<{ new_values: Record<string, unknown> }>;
  const details = { ...rows[0].new_values, ...(orphan ? { trailId: randomUUID() } : {}) };
  const q = { query: async (sql: string, args?: unknown[]) => ({ rows: (await db.pool.query(sql, args)).rows as Array<Record<string, unknown>> }) };
  await db.pool.query('BEGIN');
  try {
    await writeChainedAuditRow(q, { tenantId: ORG, userId: AUTHOR.id, action: 'authoring.section.ASSEMBLY_SOURCES',
      resourceType: 'authoring_document', resourceId: docId, details });
    await db.pool.query('COMMIT');
  } catch (error) { await db.pool.query('ROLLBACK'); throw error; }
}
function noMetadata(response: request.Response, status = 409) {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.success).toBe(false); expect(response.body.data).toBeUndefined();
  expect(JSON.stringify(response.body)).not.toMatch(/Saved capture|observed result|extractedTextSha256/);
}
async function grantViewer(sectionOnly = false) {
  const sections = (await db.pool.query('SELECT id FROM authoring_sections WHERE doc_id=$1', [docId])).rows as Array<{ id: string }>;
  await db.pool.query(`INSERT INTO doc_permissions(doc_id,section_id,tenant_id,principal_id,email,role,granted_by)
    VALUES($1,$2,$3,'5',$4,'VIEWER','3')`, [docId, sectionOnly ? sections[0].id : null, ORG, READER.email]);
}

describe('saved source references through the existing editor HTTP', () => {
  it('reads an all-preserved source-based build after reopen without writing or returning source text', async () => {
    const saved = await build([await capture()]); seam.sql.length = 0;
    const response = await read();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({ version: 1, docId, programId: PROGRAM,
      record: { eventId: saved.eventId, manifest: saved.manifest } });
    expect(JSON.stringify(response.body)).not.toContain('observed result 12');
    expect(JSON.stringify(response.body)).not.toContain(AUTHOR.email);
    expect(Object.keys(response.body.data.record).sort()).toEqual(['eventId', 'manifest', 'recordedAt']);
    expect(seam.sql.some(sql => /^\s*(INSERT|UPDATE|DELETE|BEGIN|COMMIT)\b/i.test(sql))).toBe(false);
  });

  it('returns explicit null only for an admitted exact document with no saved selection', async () => {
    const response = await read(); expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ version: 1, docId, programId: PROGRAM, record: null });
    expect(seam.sql.some(sql => /^\s*(INSERT|UPDATE|DELETE|BEGIN|COMMIT)\b/i.test(sql))).toBe(false);
  });

  it('rechecks and returns the exact ordered mixed Data Room and Vault manifest', async () => {
    const saved = await build([await capture(), await vault()]); const response = await read();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.record.manifest).toEqual(saved.manifest);
    expect(response.body.data.record.manifest.entries.map((entry: { source: AssemblySourceSelector }) => entry.source.kind)).toEqual(['data-room', 'vault']);
    expect(JSON.stringify(response.body)).not.toContain('Stored Vault evidence text');
  });

  it('finds recorded source intent beyond the general audit rail window', async () => {
    const saved = await build([await capture()]);
    await db.pool.query(`INSERT INTO authoring_audit_trail(doc_id,operation_type,actor_email,tenant_id,metadata)
      SELECT $1,'EDIT','fixture@example.invalid',$2,'{}'::jsonb FROM generate_series(1,501)`, [docId, ORG]);
    const response = await read(); expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.record.eventId).toBe(saved.eventId);
  });

  it('uses canonical bigint order despite backwards recorded times and opposite trail time order', async () => {
    const firstSource = await capture(); const secondSource = await capture('Different supported evidence.');
    const originalAuthor = author;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z')); author = asToken(await mint(AUTHOR)); const first = await build([firstSource]);
      await db.pool.query("SELECT setval('public.audit_logs_chain_seq_seq',9007199254740993,true)");
      vi.setSystemTime(new Date('2028-01-01T00:00:00.000Z')); author = asToken(await mint(AUTHOR)); const second = await build([secondSource]);
      await corrupt('authoring_audit_trail', "UPDATE authoring_audit_trail SET created_at=CASE WHEN id=$1 THEN '2040-01-01'::timestamptz ELSE '2000-01-01'::timestamptz END WHERE id=ANY($2::uuid[])", [first.eventId, [first.eventId, second.eventId]]);
      const response = await read(); expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.record).toEqual({ eventId: second.eventId, manifest: second.manifest, recordedAt: '2028-01-01T00:00:00.000Z' });
    } finally { vi.useRealTimers(); author = originalAuthor; }
  });
});

describe('current whole-document and source read admission', () => {
  it('allows a current whole-document viewer to read saved references on a frozen document', async () => {
    const saved = await build([await capture()]); await grantViewer();
    await db.pool.query("UPDATE authoring_documents SET status='FROZEN',locked_at=now() WHERE id=$1", [docId]);
    const response = await viewerRead(); expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.record.manifest).toEqual(saved.manifest);
  });

  it.each([false, true])('refuses section-only readers even when saved history exists=%s', async exists => {
    if (exists) await build([await capture()]); await grantViewer(true);
    const response = await viewerRead(); noMetadata(response, 404);
  });

  it('refuses an exact document under a different project and malformed requests', async () => {
    await build([await capture()]); noMetadata(await read(`programId=${PROGRAM_B}`), 404);
    noMetadata(await read('programId=bad'), 400); noMetadata(await read(''), 400);
  });

  it('refuses private-project access despite a retained document owner grant', async () => {
    await build([await capture()]);
    await db.pool.query('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=42');
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    noMetadata(await read(), 403);
  });

  it('refuses same-length extraction corrections without falling back to older intent', async () => {
    await build([await capture()]); const source = await capture('Observed result 12 participants.'); await build([source]);
    await db.pool.query('UPDATE cre_evidence_sources SET extracted_text=$2 WHERE id=$1', [source.sourceId, 'Observed result 13 participants.']);
    noMetadata(await read());
  });

  it('allows a source-based build recorded against eligible retained text without reopening original bytes', async () => {
    const source = await capture(); await withdraw(source, 'keep_data'); const saved = await build([source]);
    const response = await read(); expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.record.manifest).toEqual(saved.manifest);
    expect(response.body.data.record.manifest.entries[0]).toMatchObject({ disposition: 'keep_data', originalFileAvailable: false });
  });

  it('refuses source withdrawal after a saved build and never returns it as empty history', async () => {
    const source = await capture(); await build([source]); await withdraw(source, 'remove_data'); noMetadata(await read());
  });
});

describe('saved source record integrity refuses older fallback', () => {
  it.each(['trail-operation', 'chain-action', 'metadata', 'time', 'sequence'] as const)('refuses damaged newest %s', async kind => {
    await build([await capture()]); const saved = await build([await capture('Most recent source evidence.')]);
    if (kind === 'trail-operation') await corrupt('authoring_audit_trail', "UPDATE authoring_audit_trail SET operation_type='EDIT' WHERE id=$1", [saved.eventId]);
    if (kind === 'chain-action') await corrupt('audit_logs', "UPDATE audit_logs SET action='authoring.section.EDIT' WHERE new_values->>'trailId'=$1", [saved.eventId]);
    if (kind === 'metadata') await corrupt('authoring_audit_trail', "UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{assembly,sources,entries,0,title}','\"Altered title\"'::jsonb) WHERE id=$1", [saved.eventId]);
    if (kind === 'time') await corrupt('audit_logs', "UPDATE audit_logs SET occurred_at=occurred_at+interval '1 day' WHERE new_values->>'trailId'=$1", [saved.eventId]);
    if (kind === 'sequence') await corrupt('audit_logs', "UPDATE audit_logs SET chain_seq=NULL WHERE new_values->>'trailId'=$1", [saved.eventId]);
    noMetadata(await read());
  });

  it.each(['unchained', 'orphan', 'duplicate'] as const)('refuses %s source evidence instead of returning the valid older pair', async kind => {
    const saved = await build([await capture()]);
    if (kind === 'unchained') await db.pool.query(`INSERT INTO authoring_audit_trail(doc_id,operation_type,actor_email,tenant_id,metadata)
      SELECT doc_id,operation_type,actor_email,tenant_id,metadata FROM authoring_audit_trail WHERE id=$1`, [saved.eventId]);
    else await extraChain(saved.eventId, kind === 'orphan');
    noMetadata(await read());
  });

  it('recognizes damaged unchained reference metadata even when its operation was altered', async () => {
    const saved = await build([await capture()]);
    await db.pool.query(`INSERT INTO authoring_audit_trail(doc_id,operation_type,actor_email,tenant_id,metadata)
      SELECT doc_id,'EDIT',actor_email,tenant_id,metadata FROM authoring_audit_trail WHERE id=$1`, [saved.eventId]);
    noMetadata(await read());
  });
});

describe('late saved-source changes are withheld', () => {
  it.each([false, true])('refuses a new source event arriving during an admitted read with history=%s', async exists => {
    if (exists) await build([await capture()]); const next = await capture('Newly selected source evidence.');
    let injected = false;
    seam.afterQuery = async sql => {
      if (!injected && sql.startsWith('WITH trails AS')) { injected = true; seam.afterQuery = undefined; await build([next]); }
    };
    noMetadata(await read()); expect(injected).toBe(true);
  });

  it('refuses a source change during the late record recheck', async () => {
    const source = await capture('Observed result 12 participants.'); await build([source]); let records = 0;
    seam.afterQuery = async sql => {
      if (sql.startsWith('SELECT t.doc_id::text') && ++records === 2) {
        seam.afterQuery = undefined;
        await db.pool.query('UPDATE cre_evidence_sources SET extracted_text=$2 WHERE id=$1', [source.sourceId, 'Observed result 13 participants.']);
      }
    };
    noMetadata(await read()); expect(records).toBe(2);
  });

  it('refuses current document grant loss during source verification', async () => {
    await build([await capture()]); let revoked = false;
    seam.afterQuery = async sql => {
      if (!revoked && sql.startsWith('SELECT extracted_text FROM cre_evidence_sources')) {
        revoked = true; seam.afterQuery = undefined;
        await db.pool.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1', [docId]);
      }
    };
    noMetadata(await read(), 503); expect(revoked).toBe(true);
  });

  it('keeps an unavailable history query distinct from successfully empty history', async () => {
    seam.afterQuery = async sql => { if (sql.startsWith('WITH trails AS')) throw new Error('Synthetic history read unavailable'); };
    noMetadata(await read(), 503);
  });
});
