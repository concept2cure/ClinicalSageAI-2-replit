/** The actual catalogue/capture/admission path must not translate a concurrent
 * readable native change into a successful empty result. The independently
 * tested QMS collector is the producer seam; all source, project/actor,
 * disposition and catalogue SQL below runs on PostgreSQL. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { NativeRecordSnapshot } from '../record-source';
import { seedSourceReadParents } from './source-read-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../document-data-disposition/__tests__/lineage-stores-fixture';

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
import { getCurrentReadableSourceScope } from '../source-read-access';

const ORG = 71, OTHER_ORG = 72, USER = 1;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';
const AUTHORED = '33333333-3333-4333-8333-333333333333';
const PRIVATE_TITLE = 'Private controlled procedure';
const ORIGINAL = 'Private controlled procedure: draft facts, not approved.';
const CHANGED = 'Private controlled procedure: corrected draft facts, still not approved.';
const q = { query: (sql: string, args?: unknown[]) => h.query(sql, args) };
let pg: PGlite;
let afterProjection: (() => Promise<void>) | null = null;
let queryTrace: string[] = [];
let failRead = false;

function snapshot(text: string): NativeRecordSnapshot {
  return { key: 'quality:qms_documents:9:working', title: PRIVATE_TITLE, text, version: '2', sourceScope: 'project',
    native: { kind: 'qms_documents', id: '9', authoringDocumentId: AUTHORED }, lifecycle: 'draft' };
}
async function storedSources() {
  return (await pg.query<{ id: number; extracted_text: string; is_current: boolean; previous_version_id: number | null }>(
    'SELECT id,extracted_text,is_current,previous_version_id FROM cre_evidence_sources ORDER BY id')).rows;
}
const catalogue = () => searchDataRoom(ORG, { programId: PROGRAM, limit: 200, offset: 0 }, { userId: USER });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(RECORDED_LINEAGE_STORES_DDL);
  await seedSourceReadParents(pg, [ORG, OTHER_ORG], [PROGRAM, OTHER_PROGRAM]);
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'migrations/20260726_cre_source_program_scope.sql', 'migrations/20260829_cre_source_versioning.sql',
    'migrations/20261006_document_data_dispositions.sql']) await pg.exec(readFileSync(file, 'utf8'));
  await pg.exec(`ALTER TABLE cre_evidence_sources ADD COLUMN created_by integer, ADD COLUMN extracted_text text,
    ADD COLUMN char_count integer, ADD COLUMN page_count integer, ADD COLUMN study_ref integer;
    CREATE TABLE quality_fixture_state(id integer PRIMARY KEY,content text,visible boolean);
    -- The catalog read names each source's project and study (S2, 2026-11-06): the columns it reads.
    CREATE TABLE IF NOT EXISTS cdisc_prm_studies(id serial PRIMARY KEY,tenant_id integer NOT NULL,study_id varchar(100),protocol_title text);
    ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS name text;`);
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
  h.collect.mockReset().mockImplementation(async () => {
    if (failRead) throw new Error('Native source verification unavailable');
    const rows = (await pg.query<{ content: string; visible: boolean }>('SELECT content,visible FROM quality_fixture_state WHERE id=9')).rows;
    return rows[0]?.visible ? [snapshot(rows[0].content)] : [];
  });
  h.authorize.mockReset().mockImplementation(async () => {
    const rows = (await pg.query<{ visible: boolean }>('SELECT visible FROM quality_fixture_state WHERE id=9')).rows;
    if (!rows[0]?.visible) throw { status: 404, code: 'QUALITY_RECORD_NOT_AVAILABLE' };
  });
});

describe('native catalogue facts during a concurrent update', () => {
  it('refuses a readable record changed after snapshot commit instead of reporting an empty catalogue', async () => {
    afterProjection = async () => { await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]); };
    await expect(catalogue()).rejects.toMatchObject({ status: 409, code: 'NATIVE_SOURCE_CHANGED' });
    expect(await storedSources()).toMatchObject([{ extracted_text: ORIGINAL, is_current: true }]);
  });

  it('a later refresh retains the predecessor and presents the current immutable source', async () => {
    afterProjection = async () => { await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]); };
    await expect(catalogue()).rejects.toMatchObject({ code: 'NATIVE_SOURCE_CHANGED' });
    const before = await storedSources();
    const refreshed = await catalogue();
    expect(refreshed).toMatchObject({ total: 2, currentTotal: 1 });
    const retained = await storedSources();
    expect(retained).toEqual([{ ...before[0], is_current: false },
      { id: retained[1].id, extracted_text: CHANGED, is_current: true, previous_version_id: before[0].id }]);
    expect(refreshed.sources.find(source => source.isCurrent)?.id).toBe(retained[1].id);
  });

  it('preserves stable source identities when no current native fact changed', async () => {
    const first = await catalogue(); const second = await catalogue();
    expect(first).toMatchObject({ total: 1, currentTotal: 1 });
    expect(second.sources.map(source => source.id)).toEqual(first.sources.map(source => source.id));
    expect(await storedSources()).toHaveLength(1);
  });
});

describe('native catalogue omission stays private', () => {
  it.each(['denied', 'missing'])('omits a genuinely %s object without its title, snippet, identity or prose', async state => {
    afterProjection = async () => {
      if (state === 'denied') await pg.query('UPDATE quality_fixture_state SET visible=FALSE WHERE id=9');
      else await pg.query('DELETE FROM quality_fixture_state WHERE id=9');
    };
    const result = await catalogue();
    expect(result).toMatchObject({ total: 0, currentTotal: 0, sources: [] });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_TITLE);
    expect(JSON.stringify(result)).not.toContain(ORIGINAL);
    expect(queryTrace.some(sql => sql.includes('SELECT extracted_text AS native_text'))).toBe(false);
    expect(await storedSources()).toMatchObject([{ extracted_text: ORIGINAL, is_current: true }]);
  });

  it('an exact selected denied source receives generic unavailable admission rather than a stale-readable signal', async () => {
    const captured = await catalogue();
    await pg.query('UPDATE quality_fixture_state SET visible=FALSE WHERE id=9');
    queryTrace = [];
    await expect(getCurrentReadableSourceScope(q, { organizationId: ORG, userId: USER, programId: PROGRAM,
      sourceIds: [captured.sources[0].id] })).rejects.toMatchObject({ status: 404, code: 'NATIVE_SOURCE_NOT_AVAILABLE' });
    expect(queryTrace.some(sql => sql.includes('SELECT extracted_text AS native_text'))).toBe(false);
  });

  it('failed native verification still refuses the catalogue instead of creating an empty success', async () => {
    afterProjection = async () => { failRead = true; };
    await expect(catalogue()).rejects.toMatchObject({ status: 503 });
  });
});
