/**
 * CSR slice 7, off the request path since 2026-10-30: POST
 * /api/csr/jobs/:jobId/narratives queues the build and returns 202 with its run
 * id; the worker composes the narratives from the approved ADaM bundle the
 * bound run pins, as the user, and lands §14.3.3 and §12.3.2; GET …/status
 * reports queued / running with subjects done of total / complete /
 * incomplete / failed, and GET returns the QC list. A build with no bound run
 * is refused at once; a hand-built (non-ADaM) source and an unreadable ADaM row
 * are recorded on the run by code. The job tables are the real migration in PGlite; the Vault and run
 * readers are stubbed with SYNTHETIC ADaM (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ database: null as unknown, client: null as unknown, sharedDbUses: 0, tables: vi.fn(), adam: vi.fn(),
  afterNarrativePage: null as null | (() => Promise<void>), afterNarrativeQc: null as null | (() => Promise<void>),
  afterLandedHeader: null as null | (() => Promise<void>), afterLandedSlice: null as null | (() => Promise<void>) }));
// Every use of the shared Drizzle instance is counted: the narrative routes read on the request's own connection
// (requestDb), so their reads must not reach it. ci:requestdb-coverage holds the same rule statically.
vi.mock('../../db', () => ({ get db() { h.sharedDbUses += 1; return h.database; } }));
// The request's connection is the test database, as requireTenantContext attaches it (req.dbClient); a request
// without one is refused as the real helper refuses it, never served from the shared pool.
vi.mock('../../db/requestDb', async original => {
  const actual = await original<typeof import('../../db/requestDb')>();
  return { ...actual, requestDb: (req: { dbClient?: unknown }) => {
    if (!req.dbClient) throw new actual.MissingRequestDbContextError();
    return h.database as ReturnType<typeof actual.requestDb>;
  } };
});
// Observe the real page query after Drizzle executed it. Mutations use the same
// native test database; no page result or digest is supplied by the harness.
vi.mock('../../db/drizzle-queryable', async original => {
  const actual = await original<typeof import('../../db/drizzle-queryable')>();
  return { ...actual, queryableFromDrizzle: (runner: Parameters<typeof actual.queryableFromDrizzle>[0]) => {
    const native = actual.queryableFromDrizzle(runner);
    return { query: async <R = Record<string, unknown>>(text: string, params?: unknown[]) => {
      const result = await native.query<R>(text, params);
      if (h.afterNarrativePage && /\bFROM csr_narrative_outputs\b/.test(text) && /\bLIMIT \$5\b/.test(text)) {
        const change = h.afterNarrativePage; h.afterNarrativePage = null; await change();
      }
      if (h.afterNarrativeQc && /\bSELECT subject_id,\s*sequence,\s*status,\s*content,\s*content_hash,\s*facts_digest,\s*qc\b/.test(text)
        && !/\bLIMIT\b/.test(text)) {
        const change = h.afterNarrativeQc; h.afterNarrativeQc = null; await change();
      }
      if (h.afterLandedHeader && /\bSELECT content_hash,\s*char_length\(content\) AS length/.test(text)) {
        const change = h.afterLandedHeader; h.afterLandedHeader = null; await change();
      }
      if (h.afterLandedSlice && /\bSELECT substr\(content,\s*\$3::int,\s*\$4::int\) AS text/.test(text)) {
        const change = h.afterLandedSlice; h.afterLandedSlice = null; await change();
      }
      return result;
    } };
  } };
});
// The worker's tenant connection is the test database (one connection, as withOrganizationTenantConnection gives).
// Its scope under row security, as a non-owner role, is proven in services/csr/__tests__/csr-worker-tenant-scope.pglite.test.ts.
vi.mock('../../db/withTenantConnection.js', () => ({
  withTenantConnection: async (_o: unknown, fn: (c: unknown) => Promise<unknown>) => fn(h.client),
  withOrganizationTenantConnection: async (_org: number, _caller: string, fn: (c: unknown) => Promise<unknown>) => fn(h.client),
}));
vi.mock('../../services/csr-builder.js', () => ({ launchCSRBuildAsync: vi.fn() }));
vi.mock('../../services/csr/saved-clinical-tables.js', () => ({ readSavedClinicalTables: h.tables }));
vi.mock('../../services/csr/vault-source-input.js', () => ({ readCsrAdamDatasets: h.adam }));
vi.mock('../../services/csr/project-scope', async (original) => ({
  ...(await original<typeof import('../../services/csr/project-scope')>()),
  requireCsrJobAccess: async () => true,
  resolveCsrScope: async () => ({ projectId: 11 }),
}));
import router from '../csr-jobs';
import { CsrSourceInputError } from '../../services/csr/source-access';
import { adaeRows, narrativeBundle, narrativeDatasets } from '../../services/csr/__tests__/support/adam-narrative-synthetic';
import { landSyntheticBuild, sha, subjectOf } from '../../services/csr/__tests__/support/narrative-reference-fixture';
import { readCsrNarrativeReference } from '../../services/csr/csr-narrative-landed';
import { narrativeSectionBlock } from '../../services/csr/narrative-section';

const PROTOCOL = 'SYN-LMN201-PROTOCOL';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const receipt = { documentId: '11111111-2222-4333-8444-000000000099', sha256: 'e'.repeat(64), studyId: 'SYN-NARR', protocolNumber: PROTOCOL };

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: unknown; dbClient: unknown }).user = { organizationId: 7, id: 5 };
  (req as unknown as { dbClient: unknown }).dbClient = h.client;
  next();
});
app.use('/api/csr/jobs', router);
/** The same routes with no request connection attached. */
const noContext = express();
noContext.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 5 }; next(); });
noContext.use('/api/csr/jobs', router);

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  h.database = drizzle(pg);
  h.client = { query: (text: string, params?: unknown[]) => pg.query(text, params as never[]) };
  await pg.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5);`);
  await pg.exec(readFileSync(path.resolve(__dirname, '../../../migrations/20260628_csr_job_state.sql'), 'utf8'));
  const bound = JSON.stringify({ studyInfo: { protocolNumber: PROTOCOL }, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'SYN-NARR' } });
  await pg.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES (1, 7, 11, $1, 'complete', $2, 5), (2, 7, 11, $1, 'complete', '{"studyInfo":{}}', 5)`, [PROTOCOL, bound]);
});
afterAll(async () => { await pg?.close(); });
beforeEach(() => {
  h.afterNarrativePage = null;
  h.afterNarrativeQc = null;
  h.afterLandedHeader = null;
  h.afterLandedSlice = null;
  h.tables.mockReset().mockResolvedValue({ runId: RUN, programId: PROGRAM, studies: [{ source: receipt, tables: {} }] });
  h.adam.mockReset().mockResolvedValue({ bundle: narrativeBundle(), datasets: narrativeDatasets(80), componentsApproved: true });
});

const nativeNarratives = { query: (text: string, params?: unknown[]) => pg.query<Record<string, unknown>>(text, params as never[]) };
async function importedDigest(jobId: number) {
  await landSyntheticBuild(nativeNarratives, jobId, 6, { length: 100 });
  const read = await readCsrNarrativeReference(nativeNarratives, { organizationId: 7, jobId });
  expect(read.state).toBe('verified');
  if (read.state !== 'verified') throw new Error('The synthetic imported narrative reference was not verified.');
  return read.reference.storeDigest;
}
async function replaceStoredNarrative(jobId: number, append = ' Synthetic rebuilt observation.') {
  const old = await pg.query<{ content: string }>(`SELECT content FROM csr_narrative_outputs WHERE job_id=$1 AND sequence=0`, [jobId]);
  const next = old.rows[0].content + append;
  await pg.query(`UPDATE csr_narrative_outputs SET content=$2,content_hash=encode(sha256(convert_to($2,'UTF8')),'hex')
    WHERE job_id=$1 AND sequence=0`, [jobId, next]);
  await pg.query(`UPDATE csr_section_outputs SET content=replace(content,$2,$3),
    content_hash=encode(sha256(convert_to(replace(content,$2,$3),'UTF8')),'hex')
    WHERE job_id=$1 AND section_number='14.3.3'`, [jobId, old.rows[0].content, next]);
}

describe('imported narrative version on the existing paged read', () => {
  it('acknowledges the exact imported store on every cursor page and leaves the current unpinned read available', async () => {
    const digest = await importedDigest(71);
    const first = await request(app).get(`/api/csr/jobs/71/narratives/text?limit=2&expectedStoreDigest=${digest}`);
    expect(first.status).toBe(200);
    expect(first.body.storeDigest).toBe(digest);
    expect(first.body.narratives).toHaveLength(2);
    const cursor = first.body.next;
    const second = await request(app).get(`/api/csr/jobs/71/narratives/text?limit=2&expectedStoreDigest=${digest}&afterSequence=${cursor.sequence}&afterSubject=${encodeURIComponent(cursor.subjectId)}`);
    expect(second.status).toBe(200);
    expect(second.body.storeDigest).toBe(digest);
    expect(second.body.narratives).toHaveLength(2);
    expect(second.body.narratives[0].sequence).toBe(2);
    const current = await request(app).get('/api/csr/jobs/71/narratives/text?limit=2');
    expect(current.status).toBe(200);
    expect(current.body.narratives).toHaveLength(2);
    const qc = await request(app).get(`/api/csr/jobs/71/narratives?expectedStoreDigest=${digest}`);
    expect(qc.status).toBe(200);
    expect(qc.body.storeDigest).toBe(digest);
    expect(qc.body.subjects).toHaveLength(6);
    expect((await request(app).get('/api/csr/jobs/71/narratives')).body.subjects).toHaveLength(6);
  });

  it('refuses a later page after a valid rebuild changes a row outside that page', async () => {
    const digest = await importedDigest(72);
    const first = await request(app).get(`/api/csr/jobs/72/narratives/text?limit=2&expectedStoreDigest=${digest}`);
    expect(first.status).toBe(200);
    await replaceStoredNarrative(72);
    const latest = await request(app).get('/api/csr/jobs/72/narratives/text?limit=2');
    expect(latest.status).toBe(200);
    expect(latest.body.narratives[0]).toMatchObject({ verified: true, text: expect.stringContaining('Synthetic rebuilt observation.') });
    const cursor = first.body.next;
    const stale = await request(app).get(`/api/csr/jobs/72/narratives/text?limit=2&expectedStoreDigest=${digest}&afterSequence=${cursor.sequence}&afterSubject=${encodeURIComponent(cursor.subjectId)}`);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
    expect(stale.body).not.toHaveProperty('narratives');
    expect(stale.body).not.toHaveProperty('next');
    const staleQc = await request(app).get(`/api/csr/jobs/72/narratives?expectedStoreDigest=${digest}`);
    expect(staleQc.status).toBe(409);
    expect(staleQc.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
    expect(staleQc.body).not.toHaveProperty('subjects');
  });

  it('refuses a store replacement after the actual page query and before the read returns', async () => {
    const digest = await importedDigest(73);
    h.afterNarrativePage = () => replaceStoredNarrative(73);
    const stale = await request(app).get(`/api/csr/jobs/73/narratives/text?limit=2&expectedStoreDigest=${digest}`);
    expect(h.afterNarrativePage).toBeNull();
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
    expect(stale.body).not.toHaveProperty('narratives');
  });

  it('refuses malformed or repeated imported-version pins instead of treating them as current reads', async () => {
    for (const query of ['expectedStoreDigest=not-a-digest', `expectedStoreDigest=${'a'.repeat(64)}&expectedStoreDigest=${'b'.repeat(64)}`]) {
      for (const suffix of ['/text', '']) {
        const invalid = await request(app).get(`/api/csr/jobs/1/narratives${suffix}?${query}`);
        expect(invalid.status).toBe(400);
        expect(invalid.body.code).toBe('CSR_NARRATIVE_REFERENCE_INVALID');
        expect(invalid.body).not.toHaveProperty('narratives');
        expect(invalid.body).not.toHaveProperty('subjects');
      }
    }
  });

  it('refuses a store replacement after the actual QC query and before its rows return', async () => {
    const digest = await importedDigest(74);
    h.afterNarrativeQc = () => replaceStoredNarrative(74);
    const stale = await request(app).get(`/api/csr/jobs/74/narratives?expectedStoreDigest=${digest}`);
    expect(h.afterNarrativeQc).toBeNull();
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
    expect(stale.body).not.toHaveProperty('subjects');
  });
});

const REMNANT = 'SYN-OLD-UNSELECTED';
const remnantText = 'Synthetic old observation, not selected for the landed report.';
const remnantQc = { armName: 'Synthetic old arm', categories: ['serious'] as const, events: ['Unselected old observation'], missingFields: [], prose: 'template' };
async function referenceWithRemnant(jobId: number, quoted = false) {
  await landSyntheticBuild(nativeNarratives, jobId, 6, { length: 100 });
  await pg.query(`INSERT INTO csr_narrative_outputs (organization_id,job_id,subject_id,sequence,status,content,content_hash,facts_digest,qc)
    VALUES (7,$1,$2,1,'composed',$3,$4,$5,$6::jsonb)`, [jobId, REMNANT, remnantText, sha(remnantText), sha('old facts'), JSON.stringify(remnantQc)]);
  const quotedBlock = narrativeSectionBlock({ subjectId: REMNANT, armName: remnantQc.armName, categories: ['serious'], events: remnantQc.events, text: remnantText });
  if (quoted) await replaceStoredNarrative(jobId, '\n\nSynthetic quotation within the selected subject, not an additional narrative:' + quotedBlock + '\n\nEnd of synthetic quotation.');
  const read = await readCsrNarrativeReference(nativeNarratives, { organizationId: 7, jobId });
  expect(read.state).toBe('verified');
  if (read.state !== 'verified') throw new Error('Synthetic landed membership was not verified.');
  expect(read.reference.narratives).toBe(6);
  return { reference: read.reference, quotedBlock };
}
interface ImportedPageCursor { sequence: number; subjectId: string; landedOffset: number; proof: string }
function importedPageUrl(jobId: number, reference: { storeDigest: string; landedSha256: string },
  after?: ImportedPageCursor, qc = false, limit = 2) {
  const query = new URLSearchParams({ limit: String(limit), expectedStoreDigest: reference.storeDigest, expectedLandedSha256: reference.landedSha256 });
  if (after) {
    query.set('afterSequence', String(after.sequence)); query.set('afterSubject', after.subjectId);
    query.set('afterLandedOffset', String(after.landedOffset)); query.set('afterProof', after.proof);
  }
  return `/api/csr/jobs/${jobId}/narratives${qc ? '' : '/text'}?${query}`;
}

describe('exact imported landed membership and bounded pages', () => {
  it('excludes valid old rows from both the report and visible-page QC while retaining the current store read', async () => {
    const { reference } = await referenceWithRemnant(81);
    const current = await request(app).get('/api/csr/jobs/81/narratives/text?limit=20');
    expect(current.body.narratives).toHaveLength(7);
    expect(current.body.narratives.find((row: { subjectId: string }) => row.subjectId === REMNANT)).toMatchObject({ verified: true });
    const landed = await request(app).get(importedPageUrl(81, reference, undefined, false, 20));
    expect(landed.status).toBe(200);
    expect(landed.body.narratives.map((row: { subjectId: string }) => row.subjectId)).toEqual(Array.from({ length: 6 }, (_, i) => subjectOf(i)));
    expect(landed.body).toMatchObject({ storeDigest: reference.storeDigest, landedSha256: reference.landedSha256, next: null });
    const first = await request(app).get(importedPageUrl(81, reference));
    expect(first.body.narratives).toHaveLength(2);
    expect(first.body.next).toMatchObject({ sequence: 1, subjectId: subjectOf(1), landedOffset: expect.any(Number), proof: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const qcFirst = await request(app).get(importedPageUrl(81, reference, undefined, true));
    expect(qcFirst.body.subjects.map((row: { subjectId: string }) => row.subjectId)).toEqual([subjectOf(0), subjectOf(1)]);
    const second = await request(app).get(importedPageUrl(81, reference, first.body.next));
    const qcSecond = await request(app).get(importedPageUrl(81, reference, first.body.next, true));
    expect(second.body.narratives.map((row: { subjectId: string }) => row.subjectId)).toEqual([subjectOf(2), subjectOf(3)]);
    expect(qcSecond.body.subjects.map((row: { subjectId: string }) => row.subjectId)).toEqual([subjectOf(2), subjectOf(3)]);
    expect(qcSecond.body).toMatchObject({ storeDigest: reference.storeDigest, landedSha256: reference.landedSha256 });
  });

  it('does not treat a quoted complete Subject block as membership in the landed report', async () => {
    const { reference } = await referenceWithRemnant(82, true);
    const text = await request(app).get(importedPageUrl(82, reference, undefined, false, 20));
    expect(text.status).toBe(200);
    expect(text.body.narratives.map((row: { subjectId: string }) => row.subjectId)).toEqual(Array.from({ length: 6 }, (_, i) => subjectOf(i)));
    expect(text.body.narratives[0].text).toContain(`Subject ${REMNANT}`);
    const qc = await request(app).get(importedPageUrl(82, reference, undefined, true, 20));
    expect(qc.body.subjects.map((row: { subjectId: string }) => row.subjectId)).not.toContain(REMNANT);
  });

  it('rejects a forged offset inside a quoted block and a modified proof on both existing reads', async () => {
    const { reference, quotedBlock } = await referenceWithRemnant(83, true);
    const first = await request(app).get(importedPageUrl(83, reference, undefined, false, 1));
    expect(first.status).toBe(200);
    const { rows } = await pg.query<{ end_offset: number }>(`SELECT strpos(content,$2)+char_length($2)-1 AS end_offset
      FROM csr_section_outputs WHERE job_id=$1 AND section_number='14.3.3'`, [83, quotedBlock]);
    const original = first.body.next as ImportedPageCursor;
    const forged = { ...original, sequence: 1, subjectId: REMNANT, landedOffset: Number(rows[0].end_offset), proof: original.proof ?? '0'.repeat(64) };
    const wrongProof = { ...original, proof: original.proof?.startsWith('0') ? '1' + original.proof.slice(1) : '0' + (original.proof ?? '1'.repeat(64)).slice(1) };
    for (const cursor of [forged, wrongProof]) for (const qc of [false, true]) {
      const invalid = await request(app).get(importedPageUrl(83, reference, cursor, qc));
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('CSR_NARRATIVE_PAGE_INVALID');
      expect(invalid.body).not.toHaveProperty('narratives'); expect(invalid.body).not.toHaveProperty('subjects');
    }
  });

  it('refuses a landed-only version change before or after a real page query even when the store digest is unchanged', async () => {
    const { reference } = await referenceWithRemnant(84);
    const changeLanded = () => pg.query(`UPDATE csr_section_outputs SET content=content||$2,
      content_hash=encode(sha256(convert_to(content||$2,'UTF8')),'hex') WHERE job_id=$1 AND section_number='14.3.3'`, [84, '\n\nSynthetic changed closing.']).then(() => undefined);
    h.afterNarrativePage = changeLanded;
    const during = await request(app).get(importedPageUrl(84, reference));
    expect(h.afterNarrativePage).toBeNull();
    expect(during.status).toBe(409);
    expect(during.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
    expect(during.body).not.toHaveProperty('narratives');
    const later = await request(app).get(importedPageUrl(84, reference, undefined, true));
    expect(later.status).toBe(409); expect(later.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
    expect(later.body).not.toHaveProperty('subjects');
  });
});

it('refuses an ABA swap of actual narrative and landed bytes between the admitted header and slice', async () => {
  const { reference } = await referenceWithRemnant(86);
  const original = (await pg.query<{ content: string; content_hash: string }>(`SELECT content,content_hash
    FROM csr_narrative_outputs WHERE job_id=86 AND sequence=0`)).rows[0];
  const landed = (await pg.query<{ content: string; content_hash: string }>(`SELECT content,content_hash
    FROM csr_section_outputs WHERE job_id=86 AND section_number='14.3.3'`)).rows[0];
  const swapped = original.content + ' Synthetic ABA-swapped observation.';
  h.afterLandedHeader = async () => {
    await pg.query(`UPDATE csr_narrative_outputs SET content=$1,content_hash=$2 WHERE job_id=86 AND sequence=0`, [swapped, sha(swapped)]);
    // Deliberately leave the recorded landed hash at A while its actual bytes
    // and the per-subject row are B; no fabricated query result is supplied.
    await pg.query(`UPDATE csr_section_outputs SET content=replace(content,$1,$2)
      WHERE job_id=86 AND section_number='14.3.3'`, [original.content, swapped]);
  };
  h.afterLandedSlice = async () => {
    await pg.query(`UPDATE csr_narrative_outputs SET content=$1,content_hash=$2 WHERE job_id=86 AND sequence=0`, [original.content, original.content_hash]);
    await pg.query(`UPDATE csr_section_outputs SET content=$1,content_hash=$2 WHERE job_id=86 AND section_number='14.3.3'`, [landed.content, landed.content_hash]);
  };
  const response = await request(app).get(importedPageUrl(86, reference));
  expect(h.afterLandedHeader).toBeNull();
  expect(h.afterLandedSlice).toBeNull();
  const restored = await request(app).get('/api/csr/jobs/86/narratives/text?limit=1');
  expect(restored.body.narratives[0]).toMatchObject({ text: original.content, verified: true });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
  expect(response.body).not.toHaveProperty('narratives');
});

it('refuses QC-only ABA metadata even when every landed and narrative byte remains at the imported version', async () => {
  const { reference } = await referenceWithRemnant(87);
  const original = (await pg.query<{ qc: Record<string, unknown> }>(`SELECT qc FROM csr_narrative_outputs WHERE job_id=87 AND sequence=0`)).rows[0].qc;
  const transient = { ...original, missingFields: ['Synthetic transient QC field'], prose: 'model', model: 'synthetic-aba-model' };
  h.afterLandedHeader = () => pg.query(`UPDATE csr_narrative_outputs SET qc=$1::jsonb WHERE job_id=87 AND sequence=0`,
    [JSON.stringify(transient)]).then(() => undefined);
  h.afterLandedSlice = () => pg.query(`UPDATE csr_narrative_outputs SET qc=$1::jsonb WHERE job_id=87 AND sequence=0`,
    [JSON.stringify(original)]).then(() => undefined);
  const response = await request(app).get(importedPageUrl(87, reference, undefined, true));
  expect(h.afterLandedHeader).toBeNull();
  expect(h.afterLandedSlice).toBeNull();
  const restored = await request(app).get('/api/csr/jobs/87/narratives');
  expect(restored.body.subjects[0].qc).toEqual(original);
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('CSR_NARRATIVE_REFERENCE_CHANGED');
  expect(response.body).not.toHaveProperty('subjects');
});

/** Poll the status the board reads until the run leaves queued/running. */
async function settled(jobId: number) {
  for (let i = 0; i < 400; i++) {
    const res = await request(app).get(`/api/csr/jobs/${jobId}/narratives/status`);
    expect(res.status).toBe(200);
    if (res.body.run && !['queued', 'running'].includes(res.body.run.status)) return res.body.run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('the narrative run did not settle');
}

/* ci:requestdb-coverage found this file on the shared pool (red since 2026-10-29); its reads now run on the
   request's own tenant-scoped connection, and a request without one is refused rather than served from the pool. */
describe('the narrative reads run on the request connection, never the shared pool', () => {
  it('reads status, QC and text through requestDb and touches the shared Drizzle instance not at all', async () => {
    h.sharedDbUses = 0;
    for (const path of ['narratives/status', 'narratives', 'narratives/text']) {
      expect((await request(app).get(`/api/csr/jobs/1/${path}`)).status).toBeLessThan(500);
    }
    expect(h.sharedDbUses).toBe(0);
  });

  it('refuses a read with no request connection instead of falling back to the shared pool', async () => {
    h.sharedDbUses = 0;
    const res = await request(noContext).get('/api/csr/jobs/1/narratives/status');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not read the narrative build.' });
    expect(h.sharedDbUses).toBe(0);
  });
});

describe('POST /api/csr/jobs/:jobId/narratives (SYNTHETIC data)', () => {
  it('returns 202 with a run id at once; the worker composes as the user and lands §14.3.3 and §12.3.2', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.tables.mockImplementationOnce(async () => { await gate; return { runId: RUN, programId: PROGRAM, studies: [{ source: receipt, tables: {} }] }; });
    const res = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ runId: expect.any(Number), status: 'queued', resumed: false });
    const during = await request(app).get('/api/csr/jobs/1/narratives/status');
    expect(during.body.run).toMatchObject({ id: res.body.runId, status: expect.stringMatching(/^(queued|running)$/) });
    const again = await request(app).post('/api/csr/jobs/1/narratives').send({});
    expect(again).toMatchObject({ status: 409, body: { code: 'CSR_NARRATIVE_BUILD_IN_PROGRESS', runId: res.body.runId } });
    release();
    const run = await settled(1);
    expect(run).toMatchObject({ status: 'complete', subjectsDone: run.subjectsTotal, error: null,
      result: { status: 'complete', refused: 0, sections: { written: ['14.3.3', '12.3.2'], kept: [] } } });
    expect(run.subjectsTotal).toBeGreaterThan(0);
    expect(h.tables).toHaveBeenCalledWith(h.client, { organizationId: 7, userId: 5, programId: PROGRAM }, RUN);
    expect(h.adam).toHaveBeenCalledWith(expect.objectContaining({ connect: expect.any(Function) }), { organizationId: 7, userId: 5, programId: PROGRAM }, { documentId: receipt.documentId, expectedSha256: receipt.sha256 });
    const { rows } = await pg.query<{ section_number: string; lineage: Record<string, unknown> }>(`SELECT section_number, lineage FROM csr_section_outputs WHERE job_id = 1 ORDER BY section_number`);
    expect(rows.map(r => r.section_number)).toEqual(['12.3.2', '14.3.3']);
    expect(rows[1].lineage).toMatchObject({ composer: 'csr-narrative-job', runId: RUN, manifestSha256: receipt.sha256 });
    const qc = await request(app).get('/api/csr/jobs/1/narratives');
    expect(qc.status).toBe(200);
    expect(qc.body.subjects.length).toBe(run.subjectsTotal);
    // The read-only §14.3.3 viewer in Authoring reads the text a page at a time, each checked by the database (2026-10-30).
    const first = await request(app).get('/api/csr/jobs/1/narratives/text?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.narratives).toHaveLength(2);
    expect(first.body.narratives[0]).toMatchObject({ subjectId: qc.body.subjects[0].subjectId, verified: true, text: expect.any(String) });
    const next = first.body.next;
    expect(next).toEqual({ sequence: first.body.narratives[1].sequence, subjectId: first.body.narratives[1].subjectId });
    const second = await request(app).get(`/api/csr/jobs/1/narratives/text?limit=2&afterSequence=${next.sequence}&afterSubject=${encodeURIComponent(next.subjectId)}`);
    expect(second.body.narratives[0].subjectId).toBe(qc.body.subjects[2].subjectId);
    expect((await request(app).get('/api/csr/jobs/1/narratives/text?afterSequence=x')).body).toMatchObject({ code: 'CSR_NARRATIVE_PAGE_INVALID' });
  });

  it('refuses a build with no bound run at once, and queues nothing', async () => {
    const res = await request(app).post('/api/csr/jobs/2/narratives').send({});
    expect(res).toMatchObject({ status: 409, body: { code: 'CSR_NARRATIVE_RUN_REQUIRED' } });
    expect((await request(app).get('/api/csr/jobs/2/narratives/status')).body).toEqual({ run: null });
  });

  it('records a hand-built source on the run by name, as the Vault reader states it', async () => {
    h.adam.mockRejectedValueOnce(new CsrSourceInputError(422, 'CSR_NARRATIVE_ADAM_REQUIRED', 'Patient narratives are composed from subject-level ADaM data. No narratives were composed.'));
    expect((await request(app).post('/api/csr/jobs/1/narratives').send({})).status).toBe(202);
    expect(await settled(1)).toMatchObject({ status: 'failed', error: { code: 'CSR_NARRATIVE_ADAM_REQUIRED', message: expect.stringMatching(/subject-level ADaM data/) } });
  });

  it('records a refusal by its code when the reader states one without the CSR_ prefix (access lost, Vault bytes unavailable)', async () => {
    h.tables.mockRejectedValueOnce(new CsrSourceInputError(403, 'PROJECT_PERMISSION_DENIED', 'You cannot author this project with your current access.'));
    expect((await request(app).post('/api/csr/jobs/1/narratives').send({})).status).toBe(202);
    expect(await settled(1)).toMatchObject({ status: 'failed', error: { code: 'PROJECT_PERMISSION_DENIED', message: 'You cannot author this project with your current access.' } });
  });

  it('records an ADAE row that does not establish seriousness, naming the row', async () => {
    const adae = adaeRows(30, (row, i, ae) => (i === 3 && ae.term === 'Pneumonia' ? row.map((v, c) => (c === 8 ? null : v)) : row));
    h.adam.mockResolvedValueOnce({ bundle: narrativeBundle(), datasets: narrativeDatasets(30, { adae }), componentsApproved: true });
    expect((await request(app).post('/api/csr/jobs/1/narratives').send({})).status).toBe(202);
    const run = await settled(1);
    expect(run).toMatchObject({ status: 'failed', error: { code: 'CSR_ADAM_VALUE_MISSING' } });
    expect(run.error.issues[0].path).toMatch(/^ADAE\[\d+\]\.AESER$/);
  });
});
