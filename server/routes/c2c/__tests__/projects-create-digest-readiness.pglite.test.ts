/**
 * A program created through the product can have its readiness computed by the
 * Executive Readiness Digest (QA 2026-10-08, second walk, j8).
 *
 * The walk created PLR-606 through New project with submissionTypeId 'us_ind'
 * and generated its digest the same day: "Submission readiness not computed:
 * the project records no registry context (registryId or submissionType)". The
 * digest (report-os computeInitialRun) reads the context from the program's
 * project record — projects.metadata — and intake wrote the record with none:
 * it put the wizard's choice on regulatory_programs.metadata only.
 *
 * Driven end to end on real SQL (PGlite): POST /api/c2c/projects through the
 * real router, then the real orchestrator over the project record intake wrote.
 * Only the scaffold and the licence quota are stubbed (each has its own
 * contract and neither touches the project record).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createJourneyDb,
  extractTableDdl,
  makeRequestDbClient,
  type JourneyDb,
} from '../../../../tests/golden-journeys/harness';

const h = vi.hoisted(() => ({ pool: null as unknown, db: null as unknown }));
vi.mock('../../../db.js', () => ({
  get pool() {
    return h.pool;
  },
  get db() {
    return h.db;
  },
}));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: async () => ({ documentId: null, sectionCount: 0 }),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));

const T = 120_000;
const ORG = 1;
const USER = 11;
let jdb: JourneyDb;
let app: express.Express;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', [
      'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs',
      'sections', 'concept2cure_artifacts',
    ]),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      // A drug intake writes its submission spine in the same transaction.
      'migrations/20260604_submission_core_canonical.sql',
      'migrations/20260925b_submissions_program_anchor.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260903_regulatory_programs_estar_device_fields.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      'migrations/20261001b_projects_one_anchor_per_program.sql',
    ],
  });
  h.pool = jdb.pool;
  h.db = jdb.db;
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'QA', 'qa', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'raj@j8.example', 'Raj', 'x')`);
  await jdb.pool.query(`INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (1, ${ORG}, 'Default', 'default')`);

  const { default: router } = await import('../projects');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.user = { id: USER, userId: USER, organizationId: ORG, role: 'manager' };
    r.userId = USER;
    r.userRole = 'manager';
    r.tenantId = ORG;
    r.dbClient = makeRequestDbClient(jdb.pglite);
    next();
  });
  app.use('/api/c2c/projects', router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

async function digestReadinessFor(body: Record<string, unknown>) {
  const res = await request(app).post('/api/c2c/projects').send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const projectId = Number(res.body.meta.projectAnchorId);
  expect(Number.isInteger(projectId)).toBe(true);
  const { computeInitialRun } = await import('../../../services/report-os/orchestrator');
  const run = await computeInitialRun(ORG, 'project', String(projectId));
  return { run, readiness: run.providers.filter((p) => p.provider === 'submission_readiness') };
}

describe('the digest computes readiness for a program the wizard created', () => {
  it('an IND created with submissionTypeId us_ind is evaluated against US_IND', async () => {
    const { run, readiness } = await digestReadinessFor({
      name: 'QA-W2J6 Pelorant · platinum-resistant ovarian cancer (IND)',
      productName: 'PLR-606',
      programType: 'ind',
      productType: 'drug',
      primaryAgency: 'FDA',
      submissionTypeId: 'us_ind',
    });
    expect(readiness).toHaveLength(1);
    expect(readiness[0].blocker ?? '').not.toMatch(/records no registry context/);
    expect((run.summary.regulatory as { registryId?: string } | undefined)?.registryId).toBe('US_IND');
  });

  it('a 510(k) created with submissionTypeId us_510k is evaluated against US_510K', async () => {
    const { run, readiness } = await digestReadinessFor({
      name: 'CGM Sensor 510(k)',
      productName: 'CGM-1',
      programType: '510k',
      primaryAgency: 'FDA',
      submissionTypeId: 'us_510k',
    });
    expect(readiness[0].blocker ?? '').not.toMatch(/records no registry context/);
    expect((run.summary.regulatory as { registryId?: string } | undefined)?.registryId).toBe('US_510K');
  });
});
