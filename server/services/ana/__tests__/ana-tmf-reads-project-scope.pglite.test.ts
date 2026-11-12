/**
 * AnA reads a study's trial master file from the deployed store, held to the projects the person can open (eTMF
 * convergence E4 step 2, 2026-11-12; docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md §4; P-74, P-75, P-124).
 *
 * The trial master file part of `search_all_documents` read the retired store's `tmf_artifacts` by organization only,
 * a private project's included, and failed wherever that table does not exist: on every deployed database, so the
 * search named the trial master file store unavailable on every call. `get_tmf_view` listed the retired store's
 * files. Both read the deployed store now, through the same project-access rule as AnA's other reads.
 *
 * The world is _ana-project-scope-fixture.ts, on PGlite, with the real access policy; the doubles are the ones
 * ana-vault-tools-project-scope.pglite.test.ts uses, plus the study list, which reads over drizzle.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { RequestSqlClient } from '../../../db/requestDb';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  failWhen: null as RegExp | null,
}));
vi.mock('../../../db.js', () => {
  const query = async (sql: string, params?: unknown[]) => {
    if (h.failWhen && h.failWhen.test(sql)) throw new Error('relation unreadable');
    return h.pg.query(sql, params as unknown[]);
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({
  query: (sql: string, params?: unknown[]) => h.pg.query<Record<string, unknown>>(sql, params),
}) }));
vi.mock('../../document-data-disposition/eligibility.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document-data-disposition/eligibility')>()),
  artifactDataEligibleSql: () => 'TRUE',
  artifactOriginalFileAvailableSql: () => 'TRUE',
}));
// A project's protocol-design studies, as listStudyDesigns gives them (it reads over drizzle, which this harness does
// not carry): the same table, read here for get_tmf_view's study list.
vi.mock('../../study-design/study-design-repository.js', () => ({
  listStudyDesigns: async (tenantId: number, opts: { programId?: string }) => (await h.pg.query(
    `SELECT study_id AS "studyId", program_id::text AS "programId", protocol_title AS title, '' AS phase, '' AS indication, 'draft' AS status
       FROM cdisc_prm_studies WHERE tenant_id = $1 AND program_id::text = $2 ORDER BY study_id`, [tenantId, opts.programId])).rows,
}));

import { getToolHandler } from '../AnaToolExecutor';
import { asRequestOwner, ownerScopedClient } from './support/request-owner';
import { ANA_PROJECT_SCOPE, ANA_PROJECT_SCOPE_SQL } from './_ana-project-scope-fixture';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const { ORG, MEMBER, P_A1 } = ANA_PROJECT_SCOPE;
const fixtureSql: RequestSqlClient = ownerScopedClient((sql, params) => h.pg.query<Record<string, unknown>>(sql, params));
type Ctx = { organizationId: number; userId?: number; projectId?: number | null; projectRef?: string | null; sqlClient?: RequestSqlClient };
const MEMBER_CTX: Ctx = { organizationId: ORG, userId: MEMBER, sqlClient: fixtureSql };
const INSIDE_A: Ctx = { organizationId: ORG, userId: MEMBER, projectId: null, projectRef: P_A1, sqlClient: fixtureSql };
const run = (name: string, input: Record<string, unknown>, ctx: Ctx) =>
  asRequestOwner(ctx, async () => JSON.parse(String(await getToolHandler(name)!(input, ctx as never))));

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(ANA_PROJECT_SCOPE_SQL);
});
afterAll(async () => { await h.pg.close(); });
beforeEach(() => { h.failWhen = null; });

describe('AnA reads a trial master file only in the projects the person can open', () => {
  it("a trial master file record is found in the studies of the projects the person can open, and its study is named", async () => {
    const out = await run('search_all_documents', { query: 'monitoring' }, MEMBER_CTX);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const tmf = (out.hits as Array<Record<string, any>>).filter((x) => x.store === 'tmf');
    expect(tmf.map((x) => x.study_id).sort()).toEqual(['CT-201', 'NW-101']);
    expect(tmf.find((x) => x.study_id === 'NW-101')).toMatchObject({ artifact_code: 'monitoring_plan', artifact_name: 'Monitoring Plan',
      program_id: P_A1, document: { id: 'd0000000-0000-4000-8000-000000000001', title: 'Northwind monitoring plan v2' } });
    expect(JSON.stringify(out)).not.toMatch(/NW-PRIV-1|Private study/);
    // Inside a project: the open project's sponsor's only.
    const inside = await run('search_all_documents', { query: 'monitoring' }, INSIDE_A);
    expect((inside.hits as Array<Record<string, any>>).filter((x) => x.store === 'tmf').map((x) => x.study_id)).toEqual(['NW-101']);
    // Found by the title of the document it is filed against, too.
    const byTitle = await run('search_all_documents', { query: 'plan v2' }, MEMBER_CTX);
    expect((byTitle.hits as Array<Record<string, any>>).filter((x) => x.store === 'tmf').map((x) => x.artifact_code)).toEqual(['monitoring_plan']);
  });

  it('a declaration that a record does not apply, or a removed filing, is not a hit', async () => {
    const plan = await run('search_all_documents', { query: 'Trial Master File Plan' }, MEMBER_CTX);
    expect(plan.ok, JSON.stringify(plan)).toBe(true);
    expect((plan.hits as Array<Record<string, any>>).filter((x) => x.store === 'tmf')).toEqual([]);
    const crf = await run('search_all_documents', { query: 'case report' }, MEMBER_CTX);
    expect((crf.hits as Array<Record<string, any>>).filter((x) => x.store === 'tmf')).toEqual([]);
  });

  it('a trial master file read that fails is named among the stores not searched, never an empty answer', async () => {
    h.failWhen = /FROM tmf_artifact_filings f/;
    const out = await run('search_all_documents', { query: 'monitoring' }, MEMBER_CTX);
    expect(out).toMatchObject({ ok: false, unavailable_stores: ['tmf'] });
    expect(String(out.error)).toMatch(/not evidence that no records exist/);
    h.failWhen = null;
  });

  it('get_tmf_view with no study lists the studies of the projects the person can open, each with its project', async () => {
    const out = await run('get_tmf_view', {}, MEMBER_CTX);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect((out.studies as Array<Record<string, any>>).map((x) => x.studyId).sort()).toEqual(['CT-201', 'NW-101']);
    expect((out.studies as Array<Record<string, any>>).find((x) => x.studyId === 'NW-101')).toMatchObject({ programId: P_A1, project: 'NW-1' });
    expect(JSON.stringify(out)).not.toMatch(/NW-PRIV-1|Private study/);
    const inside = await run('get_tmf_view', {}, INSIDE_A);
    expect((inside.studies as Array<Record<string, any>>).map((x) => x.studyId)).toEqual(['NW-101']);
  });
});
