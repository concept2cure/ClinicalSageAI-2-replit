/**
 * Section preflight's cross-section consistency check reads a linked section
 * with its subsections, and names the linked sections it did not compare.
 *
 * What the check used to do (until 2026-10-15):
 *   - it read each linked section with `eq(ctdSection, code)`, an exact match,
 *     so '5.3' found nothing when the clinical study reports were filed under
 *     5.3.5.x — the comparison it exists to make never ran;
 *   - a failed read was swallowed (`.catch(() => null)`) and became a missing
 *     section;
 *   - a linked section that was absent or unread was dropped without a word, so
 *     'pass' read as "consistent with its linked sections" when some were never
 *     compared.
 *
 * Real tables on PGlite; the engines and the decision ledger are doubles.
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
  recordPreflightDecision: vi.fn(),
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
  decisionLifecycleService: {
    recordGovernedActionDecision: H.recordGovernedActionDecision,
    recordPreflightDecision: H.recordPreflightDecision,
    computeDecisionAwareStatus: vi.fn(() => ({})),
  },
}));
vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: { scanProject: async () => ({ findings: [] }) },
}));
vi.mock('../../services/body-aware-authoring.js', () => ({
  detectBodySpecificGaps: async () => ({ gaps: [], overallCompleteness: 100, requiredLevel: 'required' }),
}));
vi.mock('../../services/orchestration/cross-object-resolver.js', () => ({
  assembleCrossObjectPayload: vi.fn(async () => { throw new Error('not under test'); }),
}));
vi.mock('../../services/orchestration/readiness-engine.js', () => ({ computeReadinessAssessment: vi.fn() }));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
  resolveGovernedContext: () => ({ validation: { valid: true, errors: [], warnings: [] } }),
}));

import authoringActionsRouter from '../authoring-actions';

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

const ORG = 1;
const PROJECT = 301;

async function artifact(section: string, content: string, org = ORG) {
  await H.pg.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content, ctd_section, status, version, created_at, updated_at)
     VALUES ($1, $2, $3, 'markdown', 'document', $4, $5, $4, 'draft', 1, NOW(), NOW())`,
    [`artifact_${org}_${PROJECT}_${section}`, PROJECT, org, section, content],
  );
}

beforeAll(async () => {
  H.pg = new PGlite();
  H.db = drizzle(H.pg, { schema: { concept2cureArtifacts } });
  await H.pg.exec(ddlOf(concept2cureArtifacts as PgTable));
  await artifact('2.5', '<p>The clinical overview cites 120 subjects.</p>');
  await artifact('5.3.5.1', '<p>Study 001 enrolled 80 subjects.</p>');
  await artifact('5.3.5.2', '<p>Study 002 enrolled 40 subjects.</p>');
  // Not under 5.3: the code boundary is a dot, not a string prefix.
  await artifact('5.30', '<p>NOT-UNDER-5.3</p>');
  // Another organization's 5.3 filed against the same project id.
  await artifact('5.3.7', '<p>OTHER-ORG</p>', 2);
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

beforeEach(() => {
  H.engineInputs.length = 0;
  H.recordPreflightDecision.mockReset().mockResolvedValue({ id: 'dec-1', status: 'recommended' });
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).tenantId = ORG; (req as any).userId = 7; next(); });
app.use('/api/authoring-actions', authoringActionsRouter);

const preflight = (linkedSectionCodes: string[]) =>
  request(app).post('/api/authoring-actions/section-preflight').send({
    projectId: PROJECT, sectionCode: '2.5', linkedSectionCodes, regulatorBody: 'FDA', submissionType: 'NDA',
  });

describe("section preflight's consistency check", () => {
  it('reads a linked section with its subsections, on the code boundary, in the caller\'s organization', async () => {
    const res = await preflight(['5.3']);
    const c = res.body.checks.crossSectionConsistency;

    expect(c.status, `5.3 was not compared: ${JSON.stringify(c)}`).toBe('pass');
    expect(c.sectionsCompared).toEqual(['2.5', '5.3']);
    const text = H.engineInputs[0]?.sections['5.3'] ?? '';
    expect(text).toContain('Study 001');
    expect(text).toContain('Study 002');
    expect(text).not.toContain('NOT-UNDER-5.3');
    expect(text).not.toContain('OTHER-ORG');
  });

  it('names a linked section it could not compare because it has no content', async () => {
    const res = await preflight(['5.3', '2.7.3']);
    const c = res.body.checks.crossSectionConsistency;

    expect(c.absentSections, `the absent linked section was dropped silently: ${JSON.stringify(c)}`).toEqual(['2.7.3']);
    expect(c.sectionsCompared).toEqual(['2.5', '5.3']);
  });

  it('reports a failed read as unread sections and a check that did not run, not as missing content', async () => {
    const reject = () => Promise.reject(new Error('SENTINEL connection terminated'));
    const first = vi.spyOn(H.db.query.concept2cureArtifacts, 'findFirst').mockImplementation(reject);
    const many = vi.spyOn(H.db.query.concept2cureArtifacts, 'findMany').mockImplementation(reject);
    try {
      const res = await preflight(['5.3']);
      const c = res.body.checks.crossSectionConsistency;

      expect(c.status).toBe('unknown');
      expect(c.unreadSections, `a failed read was not reported: ${JSON.stringify(c)}`).toEqual(['2.5', '5.3']);
      expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
      expect(res.body.overall).not.toBe('ready');
    } finally {
      first.mockRestore();
      many.mockRestore();
    }
  });
});
