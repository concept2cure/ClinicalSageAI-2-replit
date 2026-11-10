/**
 * One native source that cannot be verified does not take a section's Sources list down (S12; the coordinating
 * session's ruling of 2026-11-09). On the demo stack every C2C-101 section's GET /api/authoring/sections/:id/sources
 * answered 503 NATIVE_SOURCE_ACCESS_UNAVAILABLE: a native Quality source's verification failed (a row lock inside the
 * route's READ ONLY transaction), and the read refused the whole list. Ruled: the section's other sources are listed
 * normally; the one that could not be verified is listed as `unverifiable` with its reason code, its details withheld,
 * never admitted. The read runs as the route runs it, inside BEGIN READ ONLY on one client, and the failing verification
 * aborts that transaction the way the demo stack's did. The native source is captured by the real catalogue; the Quality
 * collector is the producer seam, as in native-catalogue-current-records.pglite.test.ts, whose harness this follows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { NativeRecordSnapshot } from '../record-source';
import { seedSourceReadParents } from './source-read-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../document-data-disposition/__tests__/lineage-stores-fixture';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';

const h = vi.hoisted(() => ({ query: vi.fn(), collect: vi.fn(), authorize: vi.fn() }));
vi.mock('../../../db', () => ({
  pool: { query: (sql: string, args?: unknown[]) => h.query(sql, args), connect: async () => ({
    query: (sql: string, args?: unknown[]) => h.query(sql, args), release: () => undefined,
  }) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args) }),
}));
vi.mock('../../qms/project-evidence', () => ({ readQualityProjectEvidence: h.collect, authorizeQualityEvidenceSnapshot: h.authorize }));
// Capture and supersession use their actual source transaction. The audit
// chain's independent SQL suites own seal verification, not this race fixture.
vi.mock('../data-room-capture-audit', () => ({ captureActor: () => null, recordCapture: async () => undefined, recordSupersession: async () => undefined }));

import { searchDataRoom } from '../data-room-search';
import { listSectionSources } from '../source-usage.service';
import { CRE_SOURCE_CITATION } from '../source-usage.service';

const ORG = 71, OTHER_ORG = 72, USER = 1;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const AUTHORED = '33333333-3333-4333-8333-333333333333';
const PRIVATE_TITLE = 'Private controlled procedure';
const ORIGINAL = 'Private controlled procedure: draft facts, not approved.';
const q = { query: (sql: string, args?: unknown[]) => h.query(sql, args) };
let pg: PGlite;
let afterProjection: (() => Promise<void>) | null = null;
let queryTrace: string[] = [];
let failRead = false;

function snapshot(text: string): NativeRecordSnapshot {
  return { key: 'quality:qms_documents:9:working', title: PRIVATE_TITLE, text, version: '2', sourceScope: 'project',
    native: { kind: 'qms_documents', id: '9', authoringDocumentId: AUTHORED }, lifecycle: 'draft' };
}
const catalogue = () => searchDataRoom(ORG, { programId: PROGRAM, limit: 200, offset: 0 }, { userId: USER });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(RECORDED_LINEAGE_STORES_DDL);
  await seedSourceReadParents(pg, [ORG, OTHER_ORG], [PROGRAM, OTHER_PROGRAM]);
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'migrations/20260726_cre_source_program_scope.sql', 'migrations/20260829_cre_source_versioning.sql',
    'migrations/20261006_document_data_dispositions.sql', 'db/migrations/20260725_authoring_document_loop_tables.sql',
    // The applier files that alter the loop tables this harness builds (authoring-migration-list-closure contract).
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql', 'db/migrations/20260730_authoring_comments_router_columns.sql',
    'migrations/20260727_authoring_document_program_scope.sql']) await pg.exec(readFileSync(file, 'utf8'));
  // The catalogue read names each source's study (S2, c15afd47ca): the study store as its creating migration defines it.
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['cdisc_prm_studies']));
  await pg.exec(`ALTER TABLE cre_evidence_sources ADD COLUMN created_by integer, ADD COLUMN extracted_text text,
    ADD COLUMN char_count integer, ADD COLUMN page_count integer, ADD COLUMN study_ref integer;
    CREATE TABLE quality_fixture_state(id integer PRIMARY KEY,content text,visible boolean);`);
}, 90_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  afterProjection = null; queryTrace = []; failRead = false;
  await pg.exec('DELETE FROM cre_evidence_sources; DELETE FROM quality_fixture_state');
  await pg.query('INSERT INTO quality_fixture_state VALUES(9,$1,TRUE)', [ORIGINAL]);
  h.query.mockReset().mockImplementation(async (sql: string, args?: unknown[]) => {
    queryTrace.push(sql);
    const result = await pg.query(sql, args);
    if (sql === 'COMMIT' && afterProjection) {
      const update = afterProjection; afterProjection = null; await update();
    }
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  });
  h.collect.mockReset().mockImplementation(async (collectQ: unknown) => {
    if (failRead) {
      // A stubbed Quality reader that rejects, after a statement that aborts the caller's transaction (here a row lock
      // inside READ ONLY). The demo stack's own cause, currentRole's lock, is fixed on trunk (37f520f3be); this failure
      // does not depend on it, and still proves the savepoint.
      await (collectQ as { query: (s: string) => Promise<unknown> }).query('SELECT id FROM organizations FOR SHARE').catch(() => undefined);
      throw new Error('Native source verification unavailable');
    }
    const rows = (await pg.query<{ content: string; visible: boolean }>('SELECT content,visible FROM quality_fixture_state WHERE id=9')).rows;
    return rows[0]?.visible ? [snapshot(rows[0].content)] : [];
  });
  h.authorize.mockReset().mockImplementation(async () => {
    const rows = (await pg.query<{ visible: boolean }>('SELECT visible FROM quality_fixture_state WHERE id=9')).rows;
    if (!rows[0]?.visible) throw { status: 404, code: 'QUALITY_RECORD_NOT_AVAILABLE' };
  });
});

const SECTION = '44444444-4444-4444-8444-444444444444';
const DOC = '55555555-5555-4555-8555-555555555555';

/** A section in the program citing the captured native source and an ordinary client document. */
async function sectionCitingBoth(): Promise<{ native: number; plain: number }> {
  const native = (await catalogue()).sources[0].id;
  const plain = (await pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources (organization_id, client_program_id, source_type,
      visibility_class, title, checksum, ingestion_status, extraction_status, provenance, metadata)
    VALUES ($1, $2, 'client_document', 'project_private', 'protocol.pdf', 'sha-plain', 'ingested', 'extracted',
      '{"origin":"chat_upload"}'::jsonb, '{}'::jsonb) RETURNING id`, [ORG, PROGRAM])).rows[0].id;
  await pg.query(`INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, client_program_id)
    VALUES ($1, 'Module 2.5', 'M2', 'draft', '1', $2, $3) ON CONFLICT DO NOTHING`, [DOC, ORG, PROGRAM]);
  await pg.query(`INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
    VALUES ($1, $2, '2.5.3', 'Clinical pharmacology', '', $3) ON CONFLICT DO NOTHING`, [SECTION, DOC, ORG]);
  for (const [id, checksum] of [[native, null], [plain, 'sha-plain']] as const) {
    await pg.query(`INSERT INTO authoring_citations (id, section_id, source, reference_id, payload_sha256, created_by, tenant_id)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, '1', $5)`, [SECTION, CRE_SOURCE_CITATION, String(id), checksum, ORG]);
  }
  return { native, plain };
}

/** The section's sources, read as the route reads them: BEGIN READ ONLY on one client. */
async function routeRead() {
  await h.query('BEGIN READ ONLY');
  try { const sources = await listSectionSources(ORG, SECTION, { executor: q, userId: USER }); await h.query('COMMIT'); return sources; }
  catch (error) { await h.query('ROLLBACK'); throw error; }
}

describe("a section's Sources list with a native source that cannot be verified (S12)", () => {
  beforeEach(async () => { await pg.exec('DELETE FROM authoring_citations; DELETE FROM authoring_sections; DELETE FROM authoring_documents'); });

  it('lists the other source normally, and the native one as unverifiable with its reason, its details withheld', async () => {
    const { native, plain } = await sectionCitingBoth();
    failRead = true;
    const sources = await routeRead();
    expect(sources).toHaveLength(2);
    expect(sources.find((s) => s.source?.id === plain)).toMatchObject({ state: 'current', source: { title: 'protocol.pdf' } });
    const unverifiable = sources.find((s) => s.state === 'unverifiable');
    expect(unverifiable).toMatchObject({ reasonCode: 'NATIVE_SOURCE_ACCESS_UNAVAILABLE', source: null });
    expect(JSON.stringify(sources)).not.toContain(PRIVATE_TITLE);
    expect(JSON.stringify(sources)).not.toContain(ORIGINAL);
    expect(native).toBeGreaterThan(0);
  });

  it('lists both normally when the native source verifies', async () => {
    await sectionCitingBoth();
    const sources = await routeRead();
    expect(sources.map((s) => s.state).sort()).toEqual(['current', 'unverified']);
    expect(sources.some((s) => s.state === 'unverifiable')).toBe(false);
  });

  it('a denied native source is still omitted, never disclosed as unverifiable', async () => {
    await sectionCitingBoth();
    await pg.query('UPDATE quality_fixture_state SET visible=FALSE WHERE id=9');
    const sources = await routeRead();
    expect(sources.some((s) => s.state === 'unverifiable')).toBe(false);
    expect(sources.filter((s) => s.state === 'unresolved')).toHaveLength(1);
    expect(JSON.stringify(sources)).not.toContain(PRIVATE_TITLE);
  });
});
