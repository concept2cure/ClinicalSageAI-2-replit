import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The defect this file pins: the v2 shell passes the regulatory_programs UUID
 * as the CMC project id, but concept2cure_artifacts.project_id is an INTEGER
 * FK. Before the spine resolver, build-state compared the uuid against the
 * integer column — Postgres aborts that statement with 22P02, the abort took
 * the whole Promise.all down, and the endpoint 500'd for every wizard-created
 * program.
 *
 * The pool mock below encodes that real Postgres behavior: any query against
 * concept2cure_artifacts whose project parameter is not an integer THROWS
 * 22P02, exactly as the database would. A regression back to passing the raw
 * TEXT id fails these tests the same way it failed in production.
 */

const resolveCmcArtifactProject = vi.fn();
vi.mock('../../../services/cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: (...args: unknown[]) => resolveCmcArtifactProject(...args),
}));

const queries: Array<{ sql: string; params: unknown[] }> = [];
/** Rows the grouped cmc_source_objects read returns ({sourceType, count}). */
const sourceObjectRows: Array<{ sourceType: string; count: string }> = [];
vi.mock('../../../db', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('concept2cure_artifacts')) {
        const projectParam = params[1];
        if (!Number.isInteger(projectParam)) {
          const err = new Error(
            `invalid input syntax for type integer: "${String(projectParam)}"`,
          ) as Error & { code: string };
          err.code = '22P02';
          throw err;
        }
      }
      if (sql.includes('FROM cmc_source_objects')) {
        return { rows: sourceObjectRows };
      }
      return { rows: [] };
    },
  }),
}));

import router from '../module3BuildStateRoutes';

const PROGRAM_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.tenantId = 101;
    req.tenantContext = { organizationId: 101 };
    next();
  });
  app.use('/api/cmc/module3-os', router);
  return app;
}

describe('GET /build-state/:projectId — artifact spine resolution', () => {
  beforeEach(() => {
    resolveCmcArtifactProject.mockReset();
    queries.length = 0;
  });

  it('returns 200 with honest unanchored state for a uuid program with no PM anchor', async () => {
    resolveCmcArtifactProject.mockResolvedValue({
      state: 'unanchored',
      artifactProjectId: null,
      detail: 'This program has no PM-spine anchor.',
    });

    const res = await request(makeApp()).get(`/api/cmc/module3-os/build-state/${PROGRAM_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // The registry facts are absent BECAUSE the spine is unresolved, and the
    // response says so — never a bare empty that reads as "no artifacts".
    expect(res.body.data.artifactRegistry.state).toBe('unanchored');
    expect(res.body.data.artifactRegistry.detail).toMatch(/anchor/i);
    expect(res.body.data.sections.length).toBeGreaterThan(0);
    // And the artifact table was never queried with the raw uuid — the mock
    // would have thrown 22P02 (the old 500) if it had been.
    const artifactQueries = queries.filter((q) => q.sql.includes('concept2cure_artifacts'));
    expect(artifactQueries).toHaveLength(0);
  });

  it('queries the registry with the anchored integer id for a linked program', async () => {
    resolveCmcArtifactProject.mockResolvedValue({
      state: 'linked',
      artifactProjectId: 1234,
      via: 'program-anchor',
    });

    const res = await request(makeApp()).get(`/api/cmc/module3-os/build-state/${PROGRAM_UUID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.artifactRegistry).toEqual({ state: 'linked' });
    const artifactQueries = queries.filter((q) => q.sql.includes('concept2cure_artifacts'));
    expect(artifactQueries.length).toBeGreaterThan(0);
    for (const q of artifactQueries) {
      expect(q.params[1]).toBe(1234);
    }
  });

  it('uploaded-sources takes the same translation and degrades honestly', async () => {
    resolveCmcArtifactProject.mockResolvedValue({
      state: 'unanchored',
      artifactProjectId: null,
      detail: 'This program has no PM-spine anchor.',
    });

    const res = await request(makeApp()).get(
      `/api/cmc/module3-os/uploaded-sources/${PROGRAM_UUID}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.artifactRegistry.state).toBe('unanchored');
    expect(queries.filter((q) => q.sql.includes('concept2cure_artifacts'))).toHaveLength(0);
  });
});

describe('build-state derives its source rules from the composer (anti-drift)', () => {
  beforeEach(() => {
    resolveCmcArtifactProject.mockReset();
    queries.length = 0;
    sourceObjectRows.length = 0;
  });

  it('counts qc_result sources toward 3.2.S.4 and 3.2.P.5 — the drift the copied map had', async () => {
    // The route used to carry its own copy of the section→source-type rules,
    // and the copy lacked `qc_result` on S.4/P.5 while the composer counts it —
    // so the build screen undercounted exactly the sections QC feeds. The map
    // is imported from MODULE3_SECTION_RULES now; this pins the reunion.
    resolveCmcArtifactProject.mockResolvedValue({
      state: 'unanchored',
      artifactProjectId: null,
      detail: 'This program has no PM-spine anchor.',
    });
    sourceObjectRows.push({ sourceType: 'qc_result', count: '2' });

    const res = await request(makeApp()).get(`/api/cmc/module3-os/build-state/${PROGRAM_UUID}`);

    expect(res.status).toBe(200);
    const s4 = res.body.data.sections.find((s: any) => s.sectionKey === '3.2.S.4');
    expect(s4.sourceTypes).toContain('qc_result');
    expect(s4.sourceObjectCount).toBe(2);
    const p5 = res.body.data.sections.find((s: any) => s.sectionKey === '3.2.P.5');
    expect(p5.sourceTypes).toContain('qc_result');
    expect(p5.sourceObjectCount).toBeGreaterThanOrEqual(2);
  });
});
