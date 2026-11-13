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
import { listClientDocuments } from '../evidence-spine.service';

const ORG = 71, OTHER_ORG = 72, USER = 1;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const SIBLING = '44444444-4444-4444-8444-444444444444';
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
  await pg.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
    VALUES($1,$2,'Sibling programme','SOURCE-SIBLING','IND','drug','FDA','QA fixture')`, [SIBLING, ORG]);
  await pg.query(`INSERT INTO projects(id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES(171,$1,$1,'Sibling project','regulatory','active',1,1,$2,'{}')`, [ORG, SIBLING]);
  await pg.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,171,'private')", [ORG]);
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

  it('lists a captured file before the Quality record snapshots, however old the file is', async () => {
    await catalogue();
    await pg.query(`INSERT INTO cre_evidence_sources (organization_id,client_program_id,source_type,title,checksum,is_current,
        extraction_status,extracted_text,provenance,metadata,created_at)
      VALUES ($1,$2,'client_document','Protocol.pdf',$3,true,'extracted','Protocol text','{}'::jsonb,'{}'::jsonb,now() - interval '30 days')`,
    [ORG, PROGRAM, 'c'.repeat(64)]);
    const listed = (await catalogue()).sources;
    expect(listed.length).toBeGreaterThan(1);
    expect(listed[0].title).toBe('Protocol.pdf');
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

// 2026-11-10, the Codespace click-through: approving one project's controlled document left its captured Quality
// source stale, and every project's Vault answered 500. The Vault's list checked every source in the organization.
describe('a changed Quality record in one project', () => {
  async function staleInOtherProgram() {
    await searchDataRoom(ORG, { programId: SIBLING, limit: 200, offset: 0 }, { userId: USER });
    await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]);
  }

  it('does not refuse another project\'s list of its sources', async () => {
    await staleInOtherProgram();
    await expect(listClientDocuments(q, ORG, { userId: USER, programId: PROGRAM, currentOnly: true })).resolves.toEqual([]);
  });

  it('still refuses a list of its own project, so a stale record never reads as current', async () => {
    await staleInOtherProgram();
    await expect(listClientDocuments(q, ORG, { userId: USER, programId: SIBLING, currentOnly: true }))
      .rejects.toMatchObject({ status: 409, code: 'NATIVE_SOURCE_CHANGED' });
  });
});

/** This native record belongs only to B; project, source, disposition and access SQL remain real. */
function siblingRecordsOnly() {
  const collect = h.collect.getMockImplementation()!;
  h.collect.mockImplementation((client: unknown, actor: { programId: string }) => actor.programId === SIBLING ? collect(client, actor) : []);
}
const catalog = (extra: Partial<Parameters<typeof searchDataRoom>[1]> = {}) => searchDataRoom(ORG,
  { programId: PROGRAM, programIds: [PROGRAM, SIBLING], currentOnly: true, limit: 200, offset: 0, ...extra }, { userId: USER });
async function captureSibling() {
  siblingRecordsOnly();
  await searchDataRoom(ORG, { programId: SIBLING, limit: 200, offset: 0 }, { userId: USER });
}
function afterPage(read: () => Promise<void>) {
  const query = h.query.getMockImplementation()!;
  let done = false;
  h.query.mockImplementation(async (sql: string, args?: unknown[]) => {
    const result = await query(sql, args);
    if (!done && sql.includes('clock_timestamp() AS processing_observed_at')) { done = true; await read(); }
    return result;
  });
}

describe('the Data catalog admits only its effective canonical projects', () => {
  it.each([
    { label: 'outside its canonical set', programIds: [PROGRAM] },
    { label: 'outside its project facet', programIds: [PROGRAM, SIBLING], project: PROGRAM },
    { label: 'with an empty canonical set', programIds: [] },
    { label: 'with a facet outside its canonical set', programIds: [PROGRAM], project: SIBLING },
  ])('does not inspect a readable stale sibling $label', async ({ label: _label, ...query }) => {
    await captureSibling();
    await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]);
    h.collect.mockClear(); h.authorize.mockClear();
    expect(await catalog(query)).toMatchObject({ total: 0, currentTotal: 0, sources: [] });
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.collect.mock.calls.every(([, actor]) => actor.programId === PROGRAM)).toBe(true);
    if (!query.programIds.length || query.project === SIBLING) expect(h.collect).not.toHaveBeenCalled();
  });

  it('refreshes an included sibling and retains its immutable predecessor on the first page', async () => {
    await captureSibling(); const before = await storedSources();
    await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]);
    const result = await catalog(); const retained = await storedSources();
    expect(result).toMatchObject({ total: 1, currentTotal: 1 });
    expect(retained).toEqual([{ ...before[0], is_current: false },
      { id: retained[1].id, extracted_text: CHANGED, is_current: true, previous_version_id: before[0].id }]);
    expect(result.sources.map(source => source.id)).toEqual([retained[1].id]);
  });

  it('discovers an included sibling’s existing native record before that data room has ever been opened', async () => {
    siblingRecordsOnly();
    expect(await catalog()).toMatchObject({ total: 1, currentTotal: 1 });
    expect(await storedSources()).toHaveLength(1);
  });

  it('does not synchronize subsequent pages and still refuses stale records inside their scope', async () => {
    await captureSibling();
    await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]); queryTrace = [];
    await expect(catalog({ offset: 1 })).rejects.toMatchObject({ status: 409, code: 'NATIVE_SOURCE_CHANGED' });
    expect(queryTrace).not.toContain('BEGIN');
  });

  it('refuses a sibling changed just after its own first-page capture', async () => {
    siblingRecordsOnly();
    const mutate = async () => {
      if (h.collect.mock.lastCall?.[1]?.programId !== SIBLING) { afterProjection = mutate; return; }
      await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]);
    };
    afterProjection = mutate;
    await expect(catalog()).rejects.toMatchObject({ status: 409, code: 'NATIVE_SOURCE_CHANGED' });
  });
});

describe('catalogue scope preserves privacy and its final admission fence', () => {
  it('omits a denied native object without a title or text', async () => {
    await captureSibling(); await pg.query('UPDATE quality_fixture_state SET visible=FALSE WHERE id=9');
    const result = await catalog();
    expect(result).toMatchObject({ total: 0, sources: [] });
    expect(JSON.stringify(result)).not.toContain(PRIVATE_TITLE); expect(JSON.stringify(result)).not.toContain(ORIGINAL);
  });

  it('omits a project whose private grant is no longer in the current evaluated catalog', async () => {
    await captureSibling(); await pg.exec('UPDATE projects SET owner_id=NULL,created_by_id=NULL WHERE id=171');
    try { expect(await catalog()).toMatchObject({ total: 0, sources: [] }); }
    finally { await pg.exec('UPDATE projects SET owner_id=1,created_by_id=1 WHERE id=171'); }
  });

  it('still verifies the actor when the canonical catalogue set is empty', async () => {
    await pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, USER]);
    try { await expect(catalog({ programIds: [] })).rejects.toMatchObject({ status: 403 }); }
    finally { await pg.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, USER]); }
  });

  it('refuses native content changed after the page SQL and before its final admission', async () => {
    await captureSibling();
    afterPage(async () => { await pg.query('UPDATE quality_fixture_state SET content=$1 WHERE id=9', [CHANGED]); });
    await expect(catalog()).rejects.toMatchObject({ status: 503, code: 'SOURCE_READ_ACCESS_CHANGED' });
  });

  it('retains the actor fence if membership is revoked during the final admission of B', async () => {
    await captureSibling(); let pageRead = false;
    afterPage(async () => { pageRead = true; });
    const collect = h.collect.getMockImplementation()!;
    h.collect.mockImplementation(async (client: unknown, actor: { programId: string }) => {
      const records = await collect(client, actor);
      if (pageRead && actor.programId === SIBLING) {
        pageRead = false; await pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, USER]);
      }
      return records;
    });
    try { await expect(catalog()).rejects.toMatchObject({ status: 403 }); }
    finally { await pg.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, USER]); }
  });
});

// Walked 2026-11-12 (w41): the one editor's sources read took 7.5 to 8 s for a project with 168 sources. One scope
// computation admitted the same project for the same person once per source it listed: 1,835 statements, 307 of them
// the same four-statement admission. A read admits a project once; it still verifies the scope before it answers.
describe('one read admits a project once, however many of its sources it lists', () => {
  const admissions = () => queryTrace.filter(sql => sql.includes('FROM regulatory_programs WHERE id = $1')).length;
  async function capture(count: number, from: number) {
    for (let n = from; n < from + count; n++) {
      await pg.query(`INSERT INTO cre_evidence_sources (organization_id,client_program_id,source_type,title,checksum,is_current,
          extraction_status,extracted_text,provenance,metadata)
        VALUES ($1,$2,'client_document',$3,$4,true,'extracted','Captured text','{}'::jsonb,'{}'::jsonb)`,
      [ORG, PROGRAM, `Capture ${n}.pdf`, String(n).padStart(64, 'd')]);
    }
  }
  const scope = () => getCurrentReadableSourceScope(q, { organizationId: ORG, userId: USER, programId: PROGRAM });

  it('runs as many project admissions for eight sources as for two', async () => {
    await capture(2, 1);
    queryTrace = [];
    expect((await scope()).sourceIds).toHaveLength(2);
    const forTwo = admissions();
    await capture(6, 3);
    queryTrace = [];
    expect((await scope()).sourceIds).toHaveLength(8);
    expect(admissions()).toBe(forTwo);
  });

  it('still refuses the read when the person leaves the organization while its sources are being admitted', async () => {
    await capture(3, 1);
    // An admission ends with the project's sharing read. The second one is the first source's; once it has answered,
    // the person is no longer a member, and the two sources after it are not asked about again.
    let answered = 0;
    const real = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql: string, args?: unknown[]) => {
      const result = await real(sql, args);
      if (sql.includes('v.visibility') && ++answered === 2) {
        await pg.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, USER]);
      }
      return result;
    });
    try {
      await expect(scope()).rejects.toMatchObject({ status: 403 });
      expect(answered, 'the sharing read ran for the scope, the first source, and the check before answering').toBeGreaterThanOrEqual(2);
    } finally {
      await pg.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, USER]);
    }
  });
});
