/**
 * The IVDR readiness board reads the open project's records, and only a
 * project the caller's organization owns (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/).
 *
 * GET /api/ivd-completeness/completeness read four tables by organization
 * only, although each has program_id, and the GSPR checklist as the
 * organization's newest one (LIMIT 1), whichever project it was for. Opened
 * under a project, the board showed another assay's classification, studies,
 * PER and GSPR score as that project's.
 *
 * With `?program_id=` the route now asks admitProject first
 * (server/lib/admit-project.ts, over programInOrganization): 404 for a
 * foreign, missing, deleted or malformed project and 503 when the check cannot
 * run, with no IVD table read either way. All five reads then filter by the
 * project. ivdr_gspr_assessments keys on project_id TEXT (20260813c), so it is
 * compared as text against the uuid's canonical text, lower-cased; the column
 * is never cast, so a legacy non-uuid value cannot fail the read. Without a
 * project the route behaves as before and says `scope: 'organization'`.
 *
 * A store that could not be read is named in `unread`, its families carry no
 * percentage, and there is no overall figure; an unread store is never a
 * family "not started".
 *
 * Real DDL (20260524, 20260508, 20260813c) on PGlite. Nothing mocks the
 * ownership answer: the real programInOrganization runs against the same
 * database through the pool.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  ownershipDown: false,
  /** Statements the request client ran, in order. */
  trace: [] as string[],
  /** Fail the request client's statement whose text matches, with this SQLSTATE. */
  failing: null as null | { match: RegExp; code: string },
}));

vi.mock('../../db', () => ({
  pool: {
    query: async (sql: string, args?: unknown[]) => {
      if (h.ownershipDown) throw Object.assign(new Error('connection terminated'), { code: '57P01' });
      return h.pg.query(sql, args);
    },
  },
  db: {},
}));

import createIvdCompletenessRoutes from '../ivd-completeness-routes';

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const ORG = 7;
const OTHER_ORG = 8;
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** The caller organization's second project, with records of its own. */
const SIBLING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** The caller organization's third project, with no IVD records. */
const EMPTY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const DELETED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MISSING = '99999999-9999-4999-8999-999999999999';

/** What the request client hands drizzle: PGlite, in array mode when asked. */
const requestClient = {
  async query(q: string | { text: string; rowMode?: string }, params?: unknown[]) {
    const text = typeof q === 'string' ? q : q.text;
    h.trace.push(text);
    if (h.failing && h.failing.match.test(text)) {
      throw Object.assign(new Error('synthetic read failure'), { code: h.failing.code });
    }
    const result = await h.pg.query<Record<string, unknown>>(text, params);
    return typeof q !== 'string' && q.rowMode === 'array'
      ? { ...result, rows: result.rows.map((row) => Object.values(row)) }
      : result;
  },
};

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantId: ORG, dbClient: requestClient });
    next();
  });
  a.use('/api/ivd-completeness', createIvdCompletenessRoutes());
  return a;
}

const board = (programId?: string) =>
  request(app()).get(`/api/ivd-completeness/completeness${programId ? `?program_id=${programId}` : ''}`);

type Family = { id: string; pct: number | null; items: Array<{ title: string; pct: number }> };
const family = (body: { data: { families: Family[] } }, id: string) => body.data.families.find((f) => f.id === id)!;
const titles = (body: { data: { families: Family[] } }) => body.data.families.flatMap((f) => f.items.map((i) => i.title));
const ivdReads = () => h.trace.filter((s) => /ivd_|ivdr_/.test(s));

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT); CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
                   INSERT INTO organizations (id, name) VALUES (${ORG}, 'caller'), (${OTHER_ORG}, 'other');`);
  for (const f of [
    'migrations/20260524_program_workbench_schema.sql',
    'migrations/20260813c_ivdr_schema_reconciliation.sql',
    'migrations/20260508_ivd_diagnostic_surfaces.sql',
    'migrations/20260813c_ivdr_schema_reconciliation.sql',
  ]) await h.pg.exec(read(f));
  for (const [id, org, name] of [[OWN, ORG, 'Own'], [SIBLING, ORG, 'Sibling'], [EMPTY, ORG, 'Empty'], [FOREIGN, OTHER_ORG, 'Foreign'], [DELETED, ORG, 'Deleted']] as const) {
    await h.pg.query(
      `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, $4, 'IVDR', 'ivd', 'EU', $5)`,
      [id, org, name, name, name],
    );
  }
  await h.pg.query(`UPDATE regulatory_programs SET deleted_at = now() WHERE id = $1`, [DELETED]);

  // One row per scope in every store: the organization's unscoped record (no
  // project), the open project's, a sibling project's, and another
  // organization's. The organization-wide and sibling rows are written LATER,
  // so a read that ignores the project shows them first.
  const at = (n: number) => `now() - interval '${n} minutes'`;
  await h.pg.exec(`
    INSERT INTO ivdr_classifications (organization_id, program_id, device_name, ivdr_class, created_at, updated_at) VALUES
      (${ORG}, '${OWN}', 'Own assay', 'C', ${at(40)}, ${at(40)}),
      (${ORG}, NULL, 'Organization-wide assay', 'D', ${at(30)}, ${at(30)}),
      (${ORG}, '${SIBLING}', 'Sibling assay', 'B', ${at(20)}, ${at(20)}),
      (${OTHER_ORG}, '${FOREIGN}', 'Foreign assay', 'A', ${at(10)}, ${at(10)});
    INSERT INTO ivd_analytical_performance (organization_id, program_id, study_type, title, pass_fail, created_at) VALUES
      (${ORG}, '${OWN}', 'lod', 'Own LoD study', 'fail', ${at(40)}),
      (${ORG}, NULL, 'lod', 'Organization-wide LoD study', 'pass', ${at(30)}),
      (${ORG}, '${SIBLING}', 'precision', 'Sibling precision study', 'pass', ${at(20)}),
      (${OTHER_ORG}, '${FOREIGN}', 'lod', 'Foreign LoD study', 'pass', ${at(10)});
    INSERT INTO ivd_clinical_performance (organization_id, program_id, title, pre_specified_endpoint_met, updated_at) VALUES
      (${ORG}, '${OWN}', 'Own clinical study', true, ${at(40)}),
      (${ORG}, NULL, 'Organization-wide clinical study', false, ${at(30)}),
      (${ORG}, '${SIBLING}', 'Sibling clinical study', true, ${at(20)}),
      (${OTHER_ORG}, '${FOREIGN}', 'Foreign clinical study', true, ${at(10)});
    INSERT INTO ivdr_per_documents (organization_id, program_id, device_name, per_version, scientific_validity_done,
                                    analytical_performance_done, clinical_performance_done, pmpf_plan_attached, updated_at) VALUES
      (${ORG}, '${OWN}', 'Own assay', 'own-v1', true, false, false, false, ${at(40)}),
      (${ORG}, NULL, 'Organization-wide assay', 'org-v9', true, true, true, true, ${at(30)}),
      (${ORG}, '${SIBLING}', 'Sibling assay', 'sibling-v2', true, true, false, true, ${at(20)}),
      (${OTHER_ORG}, '${FOREIGN}', 'Foreign assay', 'foreign-v3', true, true, true, true, ${at(10)});
    -- project_id is TEXT. The open project's checklist was written with the
    -- uuid in capitals; a legacy row holds a value that is no uuid at all.
    INSERT INTO ivdr_gspr_assessments (organization_id, project_id, device_name, requirements, updated_at, created_at) VALUES
      (${ORG}, '${OWN.toUpperCase()}', 'Own assay', '[{"status":"compliant"},{"status":"non_compliant"},{"status":"not_applicable"}]', ${at(40)}, ${at(40)}),
      (${ORG}, 'legacy-project-7', 'Legacy assay', '[{"status":"non_compliant"}]', ${at(30)}, ${at(30)}),
      (${ORG}, '${SIBLING}', 'Sibling assay', '[{"status":"compliant"},{"status":"compliant"}]', ${at(20)}, ${at(20)}),
      (${OTHER_ORG}, '${FOREIGN}', 'Foreign assay', '[{"status":"compliant"}]', ${at(10)}, ${at(10)});
  `);
}, 60_000);

afterAll(async () => {
  await h.pg?.close();
});

beforeEach(() => {
  h.trace.length = 0;
  h.ownershipDown = false;
  h.failing = null;
});

describe('under a project, the board reads that project and nothing else', () => {
  it('every family comes from the open project\'s records only', async () => {
    const res = await board(OWN);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ scope: 'program', programId: OWN, program: 'Own assay', unread: [] });
    expect(titles(res.body).sort()).toEqual([
      'GSPR conformity (Annex I)',
      'Own LoD study',
      'Own assay · Class C',
      'Own clinical study',
      'Performance Evaluation Report own-v1',
      'Post-Market Performance Follow-up (PMPF) plan',
      'Scientific validity report',
    ]);
    const shown = JSON.stringify(res.body);
    for (const other of ['Organization-wide', 'Sibling', 'Foreign', 'org-v9', 'sibling-v2', 'foreign-v3', 'Legacy']) {
      expect(shown, `${other} shown under the project`).not.toContain(other);
    }
  });

  it('GSPR is this project\'s checklist, matched as text whatever its case, not the organization\'s newest', async () => {
    const res = await board(OWN);
    // One compliant of two applicable. The organization's newest checklist is the sibling's, at 100%.
    expect(family(res.body, 'gspr')).toMatchObject({ pct: 50, items: [{ title: 'GSPR conformity (Annex I)', pct: 50 }] });
    expect(res.body.data.gsprSourced).toBe(true);
  });

  it('a project with no IVD records reads seven empty families, never the organization\'s', async () => {
    const res = await board(EMPTY);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ scope: 'program', programId: EMPTY, program: null, overall: 0, gsprSourced: false, perDocumentPresent: false });
    expect(titles(res.body)).toEqual([]);
    expect(res.body.data.summary).toMatchObject({ total: 7, evidenced: 0, notStarted: 7, unread: 0 });
  });
});

describe('a project the organization does not own is refused before anything is read', () => {
  it.each([
    ['another organization\'s', FOREIGN],
    ['a missing', MISSING],
    ['a deleted', DELETED],
    ['a malformed', 'not-a-uuid'],
  ])('%s project: 404, and no IVD table is read', async (_label, id) => {
    const res = await board(id);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(JSON.stringify(res.body)).toContain('Project not found');
    expect(ivdReads()).toEqual([]);
  });

  it('two project ids are no project: 404', async () => {
    const res = await request(app()).get(`/api/ivd-completeness/completeness?program_id=${OWN}&program_id=${SIBLING}`);
    expect(res.status).toBe(404);
    expect(ivdReads()).toEqual([]);
  });

  it('when the ownership check cannot run: 503, and no IVD table is read', async () => {
    h.ownershipDown = true;
    const res = await board(OWN);
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(ivdReads()).toEqual([]);
  });
});

describe('with no project named, the organization scope is stated', () => {
  it('reads the organization as before and says so', async () => {
    const res = await board();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.scope).toBe('organization');
    expect(res.body.data.programId).toBeUndefined();
    expect(titles(res.body)).toContain('Organization-wide assay · Class D');
    expect(JSON.stringify(res.body)).not.toContain('Foreign');
  });
});

describe('an unread store says so; it is never a family not started', () => {
  it('a GSPR read that fails leaves GSPR unread, with no percentage and no overall figure', async () => {
    h.failing = { match: /ivdr_gspr_assessments/, code: '57014' };
    const res = await board(OWN);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.unread).toEqual(['gspr']);
    expect(family(res.body, 'gspr')).toMatchObject({ pct: null, items: [] });
    expect(res.body.data.overall).toBeNull();
    expect(res.body.data.summary).toMatchObject({ total: 7, unread: 1 });
    expect(res.body.data.summary.notStarted).toBe(
      (res.body.data.families as Family[]).filter((f) => f.pct === 0).length,
    );
  });

  it('a missing PER store leaves scientific validity, the PER and PMPF unread', async () => {
    h.failing = { match: /ivdr_per_documents/, code: '42P01' };
    const res = await board(OWN);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.unread).toEqual(['valid', 'per', 'pmpf']);
    for (const id of ['valid', 'per', 'pmpf']) expect(family(res.body, id)).toMatchObject({ pct: null, items: [] });
    expect(res.body.data.overall).toBeNull();
  });
});
