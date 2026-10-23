/**
 * POST /api/authoring-actions/harmonize-sections reads only the caller's
 * organization's project, takes the submission track from the project's
 * regulatory program (or the request) and never assumes one, and reports a
 * failed read as a failure.
 *
 * What the route used to do (until 2026-10-15):
 *   - it read each section's latest artifact by project id alone, with no
 *     organization — so a caller naming another organization's project id had
 *     that organization's section text compared and its section codes echoed;
 *     it ran with no organization context at all;
 *   - with no submissionType in the request it assumed 'IND';
 *   - a failed artifact read was swallowed (`.catch(() => null)`) and answered
 *     200 "insufficient_content … Only 0 section(s) have content".
 *
 * Real tables on PGlite (drizzle over PGlite for the artifact read, the pg
 * shape for the project and program reads); the harmonize engine and the
 * decision ledger are doubles.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { concept2cureArtifacts, projects } from '../../../shared/schema';

const H = vi.hoisted(() => ({
  pg: null as any,
  db: null as any,
  engineInputs: [] as Array<{ sections: Record<string, string>; submissionType: string }>,
  recordGovernedActionDecision: vi.fn(),
}));

const poolDouble = {
  query: async (text: string, params?: unknown[]) => {
    const r = await H.pg.query(text, params ?? []);
    return { rows: r.rows, rowCount: r.rows.length };
  },
};
vi.mock('../../db.js', () => ({
  get db() { return H.db; },
  pool: poolDouble,
  getPool: () => poolDouble,
}));
vi.mock('../../db', () => ({
  get db() { return H.db; },
  pool: poolDouble,
  getPool: () => poolDouble,
}));
vi.mock('../../services/harmonize-engine.js', () => ({
  HarmonizeEngine: class {
    async check(input: { sections: Record<string, string>; submissionType: string }) {
      H.engineInputs.push(input);
      return {
        issues: [], consistencyScore: 100, totalIssues: 0, criticalCount: 0, errorCount: 0, warningCount: 0,
        checkedDimensions: ['terminology'], skippedDimensions: [],
      };
    }
  },
}));
vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: { recordGovernedActionDecision: H.recordGovernedActionDecision },
}));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: () => ({ validation: { valid: true, errors: [], warnings: [] } }),
}));

import authoringActionsRouter from '../authoring-actions';

const ALPHA = 1;
const BETA = 2;
/** Alpha's project, anchored to an NDA program filed with the FDA. */
const ALPHA_NDA = 101;
/** Alpha's project with no regulatory program: no recorded track. */
const ALPHA_UNANCHORED = 103;
const BETA_PROJECT = 202;
const NDA_PROGRAM = '0a000000-0000-4000-8000-00000000000a';
const BETA_PROGRAM = '0b000000-0000-4000-8000-00000000000b';
const BETA_SECRET = 'BX-990 hepatotoxicity signal in study 004';

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

async function artifact(org: number, projectId: number, section: string, content: string) {
  await H.pg.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, ctd_section, status, version, created_at, updated_at)
     VALUES ($1, $2, $3, 'markdown', 'document', $4, $5, $4, 'draft', 1, NOW(), NOW())`,
    [`artifact_${org}_${projectId}_${section}`, projectId, org, section, content],
  );
}

beforeAll(async () => {
  H.pg = new PGlite();
  H.db = drizzle(H.pg, { schema: { concept2cureArtifacts } });
  for (const t of [projects, concept2cureArtifacts]) await H.pg.exec(ddlOf(t as PgTable));
  await H.pg.exec(`CREATE TABLE regulatory_programs (
    id uuid PRIMARY KEY, organization_id integer NOT NULL, program_type text NOT NULL,
    primary_agency text NOT NULL, metadata json, deleted_at timestamp)`);
  await H.pg.query(
    `INSERT INTO regulatory_programs (id, organization_id, program_type, primary_agency, metadata) VALUES
       ($1, $2, 'nda', 'FDA', '{}'), ($3, $4, 'ind', 'FDA', '{}')`,
    [NDA_PROGRAM, ALPHA, BETA_PROGRAM, BETA],
  );
  await H.pg.query(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, regulatory_program_id) VALUES
       ($1, $2, 1, 'Alpha NDA', 'regulatory', 'active', $3),
       ($4, $2, 1, 'Alpha unanchored', 'regulatory', 'active', NULL),
       ($5, $6, 2, 'Beta IND', 'regulatory', 'active', $7)`,
    [ALPHA_NDA, ALPHA, NDA_PROGRAM, ALPHA_UNANCHORED, BETA_PROJECT, BETA, BETA_PROGRAM],
  );
  for (const p of [ALPHA_NDA, ALPHA_UNANCHORED]) {
    await artifact(ALPHA, p, '2.5', '<p>The clinical overview cites 120 subjects.</p>');
    await artifact(ALPHA, p, '5.3', '<p>The study enrolled 120 subjects.</p>');
  }
  await artifact(BETA, BETA_PROJECT, '2.5', `<p>${BETA_SECRET}</p>`);
  await artifact(BETA, BETA_PROJECT, '5.3', `<p>${BETA_SECRET} — full report</p>`);
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

beforeEach(() => {
  H.engineInputs.length = 0;
  H.recordGovernedActionDecision.mockReset().mockResolvedValue({ id: 'dec-1', authority: {} });
});

function app(tenantId: number | null = ALPHA) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (tenantId != null) (req as any).tenantId = tenantId;
    (req as any).user = { id: 7, organizationId: tenantId };
    next();
  });
  a.use('/api/authoring-actions', authoringActionsRouter);
  return a;
}
const harmonize = (body: Record<string, unknown>, tenantId?: number | null) =>
  request(app(tenantId)).post('/api/authoring-actions/harmonize-sections').send(body);

describe("harmonize-sections reads only the caller's organization", () => {
  it("answers another organization's project 404 and never reads its sections", async () => {
    const res = await harmonize({ projectId: BETA_PROJECT, sectionCodes: ['2.5', '5.3'], submissionType: 'IND' });

    expect(res.status, `another organization's project was harmonized: ${JSON.stringify(res.body)}`).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('BX-990');
    expect(H.engineInputs, "Beta's section text reached the engine").toEqual([]);
    expect(H.recordGovernedActionDecision).not.toHaveBeenCalled();
  });

  it("does not read another organization's artifact filed against the caller's project id", async () => {
    await artifact(BETA, ALPHA_NDA, '3.2', `<p>${BETA_SECRET}</p>`);
    const res = await harmonize({ projectId: ALPHA_NDA, sectionCodes: ['2.5', '3.2'], submissionType: 'NDA' });

    expect(JSON.stringify(res.body), "Beta's artifact was read into Alpha's comparison").not.toContain('3.2');
    expect(res.body).toMatchObject({ status: 'insufficient_content', sectionsFound: ['2.5'] });
    expect(H.engineInputs).toEqual([]);
  });

  it('refuses a request with no organization context', async () => {
    const res = await harmonize({ projectId: ALPHA_NDA, sectionCodes: ['2.5', '5.3'], submissionType: 'NDA' }, null);
    expect(res.status).toBe(401);
    expect(H.engineInputs).toEqual([]);
  });
});

describe('the submission track is recorded or stated, never assumed', () => {
  it("uses the track the project's regulatory program records when the request names none", async () => {
    const res = await harmonize({ projectId: ALPHA_NDA, sectionCodes: ['2.5', '5.3'] });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(H.engineInputs[0]?.submissionType, "the route assumed a track instead of reading the program's").toBe('US_NDA');
    expect(res.body.submissionType).toBe('US_NDA');
    expect(res.body.sectionsCompared).toEqual(['2.5', '5.3']);
  });

  it('refuses 422, naming the missing fact, when neither the request nor the program records a track', async () => {
    const res = await harmonize({ projectId: ALPHA_UNANCHORED, sectionCodes: ['2.5', '5.3'] });

    expect(res.status, `ran with an assumed track: ${JSON.stringify(res.body)}`).toBe(422);
    expect(res.body.error).toBe('SUBMISSION_TRACK_UNRECORDED');
    expect(res.body.message).toMatch(/submission track/i);
    expect(H.engineInputs).toEqual([]);
  });

  it('uses a track the request states', async () => {
    const res = await harmonize({ projectId: ALPHA_UNANCHORED, sectionCodes: ['2.5', '5.3'], submissionType: 'NDA' });

    expect(res.status).toBe(200);
    expect(H.engineInputs[0]?.submissionType).toBe('NDA');
  });
});

describe('a failed read is a failure', () => {
  it('answers a failed artifact read as an error, not "insufficient_content"', async () => {
    const spy = vi.spyOn(H.db.query.concept2cureArtifacts, 'findFirst')
      .mockRejectedValueOnce(new Error('SENTINEL connection terminated'));
    try {
      const res = await harmonize({ projectId: ALPHA_NDA, sectionCodes: ['2.5', '5.3'], submissionType: 'NDA' });

      expect(res.body.status, 'a failed read was reported as missing content').not.toBe('insufficient_content');
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
      expect(H.engineInputs).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
