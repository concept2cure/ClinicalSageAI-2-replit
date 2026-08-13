/**
 * POST /api/ivdr/submission-package/:projectId — project scoping + job durability.
 *
 * The package gather read ivdr_classifications, ivdr_analytical_validations,
 * ivdr_clinical_evidence and ivdr_cdx_workflows ORG-WIDE while the response
 * claimed to be "the project's" package: project A's manifest silently
 * bundled every project's classifications, LoDs and sensitivity numbers.
 * The fix scopes classifications by program_id and the other sections
 * through their classification join (mirroring the scoped list endpoints),
 * verifies programme ownership before gathering anything, and counts —
 * rather than silently including or silently dropping — legacy rows that
 * carry no programme assignment.
 *
 * Job tracking remains an in-memory Map until the Phase-2 rebuild; every
 * response now declares jobDurability: 'ephemeral' so callers cannot
 * mistake it for a durable queue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* The router factory takes an injected pool, so no module mock is needed —
   a stub pool is enough to emulate the scoped SQL each handler emits. */
const query = vi.fn();
const stubPool = { query: (...a: unknown[]) => query(...a) } as unknown as import('pg').Pool;

import createIVDRRoutes from '../../server/routes/ivdr-routes';

const ORG = 5;
const OTHER_ORG = 9;
const PROJECT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROJECT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function app(org: number = ORG) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = org;
    (req as any).userId = 42;
    (req as any).user = { id: 42, organizationId: org, role: 'admin' };
    (req as any).tenantContext = { organizationId: org };
    next();
  });
  a.use('/api/ivdr', createIVDRRoutes(stubPool));
  return a;
}

/* Mini-DB: every row is tagged with the programme it reaches — directly for
   classifications, via its classification for the joined tables. null means
   an unassigned legacy (001-shape) row. */
type ProgramRow = Record<string, unknown> & { program_id: string | null };
const db = {
  programOwner: {} as Record<string, number>,
  classifications: [] as ProgramRow[],
  validations: [] as ProgramRow[],
  evidence: [] as ProgramRow[],
  cdx: [] as ProgramRow[],
  countsFail: false,
};

/* Apply the programme predicate only when the SQL actually carries it. A
   regression that drops the predicate gets every project's rows back, and
   the content assertions below catch the leak. */
function scoped(rows: ProgramRow[], sql: string, args: unknown[]) {
  if (/AND (?:[a-z]\.)?program_id = \$2/.test(sql)) {
    return rows.filter((r) => r.program_id === args[1]);
  }
  return rows;
}

function unassignedCount(rows: ProgramRow[]) {
  return rows.filter((r) => r.program_id === null).length;
}

/** First query whose whitespace-normalised SQL contains `fragment`. */
function callFor(fragment: string) {
  const c = query.mock.calls.find((x) => String(x[0]).replace(/\s+/g, ' ').includes(fragment));
  if (!c) throw new Error(`no query issued matching ${fragment}`);
  return { sql: String(c[0]).replace(/\s+/g, ' '), args: (c[1] ?? []) as unknown[] };
}

beforeEach(() => {
  query.mockReset();
  db.programOwner = { [PROJECT_A]: ORG, [PROJECT_B]: ORG };
  db.classifications = [];
  db.validations = [];
  db.evidence = [];
  db.cdx = [];
  db.countsFail = false;

  query.mockImplementation(async (sqlRaw: unknown, argsRaw?: unknown) => {
    const sql = String(sqlRaw).replace(/\s+/g, ' ');
    const args = (argsRaw ?? []) as unknown[];
    if (sql.includes('FROM regulatory_programs')) {
      const owned = db.programOwner[String(args[0])] === args[1];
      return { rows: owned ? [{ ok: 1 }] : [] };
    }
    // The unassigned-counts aggregate (checked before the gathers because it
    // also mentions the same table names).
    if (sql.includes(') AS classifications')) {
      if (db.countsFail) throw new Error('counts unavailable');
      return {
        rows: [
          {
            classifications: unassignedCount(db.classifications),
            validations: unassignedCount(db.validations),
            evidence: unassignedCount(db.evidence),
            cdx: unassignedCount(db.cdx),
          },
        ],
      };
    }
    if (sql.includes('FROM ivdr_classifications')) return { rows: scoped(db.classifications, sql, args) };
    if (sql.includes('FROM ivdr_analytical_validations')) return { rows: scoped(db.validations, sql, args) };
    if (sql.includes('FROM ivdr_clinical_evidence')) return { rows: scoped(db.evidence, sql, args) };
    if (sql.includes('FROM ivdr_cdx_workflows')) return { rows: scoped(db.cdx, sql, args) };
    if (sql.includes('FROM ivdr_gspr_assessments')) return { rows: [] };
    return { rows: [] };
  });
});

describe('IVDR submission package project scoping', () => {
  it("packages only the requested project's rows — project B's never appear", async () => {
    db.classifications = [
      { id: 1, device_name: 'Assay A', program_id: PROJECT_A },
      { id: 2, device_name: 'Assay B', program_id: PROJECT_B },
    ];
    db.validations = [
      { id: 11, analyte_name: 'TROP-A', program_id: PROJECT_A },
      { id: 12, analyte_name: 'TROP-B', program_id: PROJECT_B },
    ];
    db.evidence = [
      { id: 21, study_title: 'Study A', program_id: PROJECT_A },
      { id: 22, study_title: 'Study B', program_id: PROJECT_B },
    ];
    // Project B is the only one with a CDx workflow — A's package must show 0.
    db.cdx = [{ id: 31, biomarker: 'HER2', program_id: PROJECT_B }];

    const res = await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const sections = res.body.manifest.sections;
    expect(sections.classification.count).toBe(1);
    expect(sections.classification.records.map((r: any) => r.device_name)).toEqual(['Assay A']);
    expect(sections.analyticalValidation.count).toBe(1);
    expect(sections.analyticalValidation.records.map((r: any) => r.analyte_name)).toEqual(['TROP-A']);
    expect(sections.clinicalEvidence.count).toBe(1);
    expect(sections.clinicalEvidence.records.map((r: any) => r.study_title)).toEqual(['Study A']);
    expect(sections.companionDiagnostics.count).toBe(0);

    // Nothing of project B leaks anywhere in the response.
    const serialized = JSON.stringify(res.body);
    for (const leak of ['Assay B', 'TROP-B', 'Study B', 'HER2']) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('scopes every gather by org AND programme in the SQL itself', async () => {
    await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);

    const cls = callFor('SELECT * FROM ivdr_classifications');
    expect(cls.sql).toMatch(/WHERE organization_id = \$1 AND program_id = \$2/);
    expect(cls.args).toEqual([ORG, PROJECT_A]);

    /* Validations, evidence and CDx carry no programme column — they reach
       one via their classification, so the predicate must sit on the join. */
    const val = callFor('FROM ivdr_analytical_validations v');
    expect(val.sql).toMatch(/v\.organization_id = \$1 AND c\.program_id = \$2/);
    expect(val.args).toEqual([ORG, PROJECT_A]);

    const ev = callFor('FROM ivdr_clinical_evidence e');
    expect(ev.sql).toMatch(/e\.organization_id = \$1 AND c\.program_id = \$2/);
    expect(ev.args).toEqual([ORG, PROJECT_A]);

    const cdx = callFor('FROM ivdr_cdx_workflows w');
    expect(cdx.sql).toMatch(/w\.organization_id = \$1 AND c\.program_id = \$2/);
    expect(cdx.args).toEqual([ORG, PROJECT_A]);

    const gspr = callFor('FROM ivdr_gspr_assessments');
    expect(gspr.args).toEqual([PROJECT_A, ORG]);
  });

  it('excludes unassigned legacy rows and counts them visibly', async () => {
    db.classifications = [
      { id: 1, device_name: 'Assay A', program_id: PROJECT_A },
      { id: 2, device_name: 'Legacy assay', program_id: null },
    ];
    db.validations = [
      { id: 11, analyte_name: 'TROP-A', program_id: PROJECT_A },
      { id: 12, analyte_name: 'Legacy LoD 1', program_id: null },
      { id: 13, analyte_name: 'Legacy LoD 2', program_id: null },
    ];
    db.evidence = [{ id: 21, study_title: 'Legacy study', program_id: null }];

    const res = await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const sections = res.body.manifest.sections;
    expect(sections.classification.count).toBe(1);
    expect(sections.analyticalValidation.count).toBe(1);
    expect(sections.clinicalEvidence.count).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain('Legacy');

    expect(res.body.unassignedRecordsExcluded).toBe(4);
    expect(res.body.manifest.exclusions).toMatchObject({
      unassignedRecordsExcluded: 4,
      message: '4 unassigned records excluded (no program assignment)',
      bySection: {
        classifications: 1,
        analyticalValidations: 2,
        clinicalEvidence: 1,
        companionDiagnostics: 0,
      },
    });
  });

  it('does not fabricate a zero when exclusion counts are unavailable', async () => {
    db.countsFail = true;
    const res = await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.unassignedRecordsExcluded).toBeNull();
    expect(res.body.manifest.exclusions).toMatchObject({
      unassignedRecordsExcluded: null,
      bySection: null,
      message: 'Unassigned-record counts unavailable',
    });
  });
});

describe('IVDR submission package ownership + input validation', () => {
  it('404s a programme owned by another org before gathering anything', async () => {
    db.programOwner[PROJECT_A] = OTHER_ORG;
    db.classifications = [{ id: 1, device_name: 'Assay A', program_id: PROJECT_A }];

    const res = await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IVDR_SUBMISSION_PROJECT_NOT_FOUND');

    // Only the ownership probe ran — no IVDR data was touched.
    expect(query).toHaveBeenCalledTimes(1);
    const own = callFor('FROM regulatory_programs');
    expect(own.args).toEqual([PROJECT_A, ORG]);
  });

  it('404s a programme that does not exist', async () => {
    delete db.programOwner[PROJECT_A];
    const res = await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('422s a non-UUID projectId before touching the database', async () => {
    const res = await request(app()).post('/api/ivdr/submission-package/all');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('IVDR_SUBMISSION_BAD_PROJECT');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('IVDR submission package job durability', () => {
  it('declares ephemeral job tracking on the package response', async () => {
    const res = await request(app()).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    expect(res.status).toBe(201);
    expect(res.body.jobDurability).toBe('ephemeral');
  });

  it('status endpoint reports the completed job and its durability', async () => {
    const a = app();
    await request(a).post(`/api/ivdr/submission-package/${PROJECT_A}`);
    const res = await request(a).get(`/api/ivdr/submission-package/${PROJECT_A}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.hasManifest).toBe(true);
    expect(res.body.jobDurability).toBe('ephemeral');
  });

  it('a restart forgets jobs — the 404 says so instead of hiding it', async () => {
    const before = app();
    await request(before).post(`/api/ivdr/submission-package/${PROJECT_A}`);

    // A fresh router instance = a restarted process: the Map starts empty.
    const after = app();
    const res = await request(after).get(`/api/ivdr/submission-package/${PROJECT_A}/status`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('IVDR_SUBMISSION_NOT_FOUND');
    expect(res.body.jobDurability).toBe('ephemeral');
  });
});
