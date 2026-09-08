/**
 * `POST /build-section/:projectId/:sectionKey` must be able to build every
 * section the project can compose — and must go through the one canonical
 * compose+persist implementation.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * This route carried its own copy of the compose+persist body: source read,
 * compose, upsert, lineage rewrite, provenance event. That copy called
 * `composeModule3FromCanonicalSources` directly — the CORE §3.2.S / §3.2.P /
 * 3.1 / 3.3 rules and nothing else.
 *
 * `services/cmc/module3-compile.ts` (`composeProjectModule3`) is the canonical
 * composition, and it is a strict superset: core, PLUS the emittable 3.2.A
 * appendices, PLUS 3.2.R for the region the linked submission records. So a
 * request for a regional or appendix section — both of which the project can
 * genuinely compose — came back
 *
 *     404 "Section 3.2.R.1 not found in composition rules"
 *
 * which is not true. The rule exists; this route just could not reach the pass
 * that emits it. 3.2.R is a REQUIRED region-specific module in every CTD
 * filing, so "cannot be built through the single-section API" is a filing gap,
 * not a cosmetic one.
 *
 * The second fault is the same 404 for a project with NO canonical sources:
 * "not found in composition rules" describes the wrong thing entirely, and
 * sends the user to look for a missing rule instead of missing data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const composeProjectModule3 = vi.fn();
const persistComposedSection = vi.fn();

vi.mock('../../../services/cmc/module3-compile', () => ({
  composeProjectModule3: (...a: unknown[]) => composeProjectModule3(...a),
  persistComposedSection: (...a: unknown[]) => persistComposedSection(...a),
  loadCanonicalSources: vi.fn(),
  compiledRecordOf: (s: any) => s.structuredPayload,
}));

const clientQuery = vi.fn();
vi.mock('../../../db', () => ({
  db: {},
  getDb: () => ({}),
  getPool: () => ({
    connect: async () => ({ query: (...a: unknown[]) => clientQuery(...a), release: () => undefined }),
    query: (...a: unknown[]) => clientQuery(...a),
  }),
  pool: { query: (...a: unknown[]) => clientQuery(...a) },
}));
vi.mock('../../../services/module3-convergence-service', () => ({
  bridgeCompileToArtifact: async () => ({ bridged: false }),
  classifyAndMapArtifactToSource: vi.fn(),
  reclassifyArtifact: vi.fn(),
  getModule3BuildStatus: vi.fn(),
}));

import convergenceRouter from '../module3ConvergenceRoutes';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 42, organizationId: 7 };
  (req as any).tenantId = 7;
  next();
});
app.use('/api/cmc', convergenceRouter);

const PROJECT = '11111111-1111-4111-8111-111111111111';

const section = (sectionKey: string) => ({
  sectionKey,
  sectionPath: `m3.${sectionKey}`,
  structuredPayload: { sectionKey },
  narrativeDraft: `Narrative for ${sectionKey}`,
  completeness: 80,
  missingInputs: [],
  lineage: [{ sourceObjectId: 'src-1', sourceHashAtCompile: 'h1' }],
  tables: [],
});

beforeEach(() => {
  composeProjectModule3.mockReset();
  persistComposedSection.mockReset();
  clientQuery.mockReset();
  clientQuery.mockResolvedValue({ rows: [] });
  persistComposedSection.mockResolvedValue('section-id-1');
});

describe('build-section builds every composable section, through the canonical path', () => {
  it('builds a 3.2.R regional section — a required module, previously a false 404', async () => {
    composeProjectModule3.mockResolvedValue({
      sources: [{ id: 'src-1' }],
      sections: [section('3.2.S.1'), section('3.2.R.1')],
    });

    const res = await request(app).post(`/api/cmc/build-section/${PROJECT}/3.2.R.1`).send({});

    expect(res.status, 'a composable regional section was reported as having no rule').toBe(200);
    expect(persistComposedSection).toHaveBeenCalled();
    expect(persistComposedSection.mock.calls[0][3].sectionKey).toBe('3.2.R.1');
  });

  it('builds a 3.2.A appendix section', async () => {
    composeProjectModule3.mockResolvedValue({
      sources: [{ id: 'src-1' }],
      sections: [section('3.2.A.1')],
    });

    const res = await request(app).post(`/api/cmc/build-section/${PROJECT}/3.2.A.1`).send({});
    expect(res.status).toBe(200);
  });

  it('still builds a core section — the fix is not "accept everything"', async () => {
    composeProjectModule3.mockResolvedValue({
      sources: [{ id: 'src-1' }],
      sections: [section('3.2.S.1')],
    });
    const res = await request(app).post(`/api/cmc/build-section/${PROJECT}/3.2.S.1`).send({});
    expect(res.status).toBe(200);
  });

  it('still 404s a section this project genuinely cannot compose', async () => {
    composeProjectModule3.mockResolvedValue({
      sources: [{ id: 'src-1' }],
      sections: [section('3.2.S.1')],
    });
    const res = await request(app).post(`/api/cmc/build-section/${PROJECT}/9.9.9`).send({});
    expect(res.status).toBe(404);
  });

  it('says "no canonical sources" for an empty project, not "no composition rule"', async () => {
    composeProjectModule3.mockResolvedValue({ sources: [], sections: [] });

    const res = await request(app).post(`/api/cmc/build-section/${PROJECT}/3.2.S.1`).send({});
    expect(res.status).toBe(400);
    expect(
      JSON.stringify(res.body).toLowerCase(),
      'an empty project was reported as a missing composition rule',
    ).toMatch(/source/);
    expect(persistComposedSection, 'nothing may be written for an empty project').not.toHaveBeenCalled();
  });

  it('writes through the canonical persist, not a private copy of the upsert', async () => {
    composeProjectModule3.mockResolvedValue({
      sources: [{ id: 'src-1' }],
      sections: [section('3.2.S.1')],
    });
    await request(app).post(`/api/cmc/build-section/${PROJECT}/3.2.S.1`).send({});

    expect(persistComposedSection).toHaveBeenCalledTimes(1);
    // A private INSERT into cmc_module3_sections is the duplication this closes.
    const ownUpserts = clientQuery.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((sql) => /INSERT INTO cmc_module3_sections/i.test(sql));
    expect(ownUpserts, 'the route still writes the section row itself').toHaveLength(0);
  });
});
