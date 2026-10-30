/**
 * A project's CMC data has one home, the CMC / Module 3 register (decision
 * P-62; docs/evidence/CMC-M3-GA/2026-10-29/p62-one-cmc-home/).
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * The task assessment (POST /api/concept2cure/projects/:projectId/tasks/assess,
 * "Check CMC readiness") and the project context (GET …/context) read CMC data
 * from projects.metadata (cmcDrugSubstance, cmcDrugProduct, …). Only
 * PUT …/projects/:projectId/cmc wrote those keys, and no screen called it. The
 * CMC surface records a drug substance in the register (server/api/cmc,
 * written through into cmc_source_objects). So the assessment told every
 * project to "Enter Drug Substance data (CMC Module 3)": a device's, a
 * diagnostic's, a biologic's, a CTA's, and one whose register already held a
 * drug substance. Two CMC answers for one project.
 *
 * ── What runs for real here ──────────────────────────────────────────────────
 * The database is PGlite, a real PostgreSQL. The tables are:
 *   - the ones `drizzle-kit push` creates from shared/schema;
 *   - the CMC Module 3 tables, from their files on disk:
 *     db/migrations/20260401_cmc_convergence_os.sql, which is in the set, and
 *     migrations/0017_module3_project_id_fix.sql, which keys project_id as
 *     TEXT the way the deployed tables are keyed.
 * Policies come from the set's tenant isolation sweep. The runtime role is a
 * NOSUPERUSER NOBYPASSRLS role that owns the tables. The pool is the
 * production primitive (instrumentPool), and RLS_ENFORCE is on.
 *
 * Each drug substance or product is written into the register's canonical
 * layer by the register's own Module 3 link (linkToModule3, then
 * writeThroughDrugSubstance or writeThroughDrugProduct). It is filed under the
 * id the v2 CMC surface sends, which is the open program's regulatory_programs
 * UUID (cmcProjectUuid(), client/src/concept2cure/v2/surfaces/cmcShared.tsx).
 * The register is read by its one per-project reader, getModule3BuildStatus.
 * That reader judges the composition boundary (decision P-28) on these tables.
 *
 * Stubbed: authentication, the rate limiter and the tenant-context middleware
 * pass through, and the request carries a verified session's identity.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { TENANT_ISOLATION_SWEEP } from '../../../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const RUNTIME_ROLE = 'c2c_runtime';
/** The CMC Module 3 tables as deployed: created by the set's file, keyed TEXT by 0017. */
const CMC_TABLE_FILES = ['db/migrations/20260401_cmc_convergence_os.sql', 'migrations/0017_module3_project_id_fix.sql'];

type QueryConfig = string | { text: string; rowMode?: string; values?: unknown[] };

const h = vi.hoisted(() => {
  const state = {
    pg: null as unknown as {
      query: (text: string, params: unknown[], options: unknown) => Promise<{ rows: unknown[]; affectedRows?: number; fields?: unknown[] }>;
      exec: (sql: string) => Promise<unknown>;
    },
    /** A statement the database cannot run, to show a read that failed is said. */
    failOn: null as null | { pattern: RegExp; code: string },
    held: Promise.resolve(),
  };
  // node-postgres hands Drizzle these types as text; PGlite would parse them.
  const identity = (value: string) => value;
  const parsers = { 1082: identity, 1114: identity, 1184: identity, 1186: identity };
  const run = async (config: QueryConfig, values?: unknown[]) => {
    const text = typeof config === 'string' ? config : config.text;
    const rowMode = typeof config === 'string' ? undefined : config.rowMode;
    const params = values ?? (typeof config === 'string' ? [] : config.values ?? []);
    if (state.failOn?.pattern.test(text)) {
      throw Object.assign(new Error('the database could not run this statement'), { code: state.failOn.code });
    }
    const result = await state.pg.query(text, params, { rowMode: rowMode === 'array' ? 'array' : 'object', parsers });
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, fields: result.fields ?? [], command: '' };
  };
  /** One connection at a time (PGlite is one session), as the runtime role. */
  const pool = {
    async connect() {
      let unlock!: () => void;
      const previous = state.held;
      state.held = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      try {
        if (!state.pg) throw new Error('the test database is not open yet');
        await state.pg.exec('SET ROLE c2c_runtime');
      } catch (error) {
        unlock();
        throw error;
      }
      return { query: run, release: () => { void state.pg.exec('RESET ROLE').finally(unlock); } };
    },
    async query(config: QueryConfig, values?: unknown[]) {
      const client = await pool.connect();
      try { return await client.query(config, values); } finally { client.release(); }
    },
    on() { return pool; },
  };
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { state, pool, pass };
});

vi.mock('../../../db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { instrumentPool } = await import('../../../db/poolInstrumentation');
  const pool = instrumentPool(h.pool as never);
  return { pool, getPool: () => pool, db: drizzle(pool as never, { schema }) };
});
// resolve-cmc-artifact-project.ts reads the runtime module directly; it is the same pool here.
vi.mock('../../../db/runtime', async () => await import('../../../db'));
vi.mock('../shared', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared')>()),
  concept2cureRateLimiter: h.pass,
}));
vi.mock('../../../auth', () => ({ authMiddleware: h.pass }));
vi.mock('../../../middleware/tenantContext', () => ({ tenantContextMiddleware: h.pass, requireOrganizationContext: h.pass }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined }),
}));

import * as schema from '../../../../shared/schema';
import { regulatoryPrograms } from '../../../../shared/schema/programs';
import { establishRequestTenantScope } from '../../../middleware/establishRequestTenantScope';
import { runWithTenantScope } from '../../../db/tenantStore';
import { linkToModule3 } from '../../../services/cmc/link-to-module3';
import { writeThroughDrugProduct, writeThroughDrugSubstance } from '../../../services/cmc-write-through';
import taskRoutes from '../tasks';
import programTwinRoutes from '../program-twin';

const ORG = 1;
const OWNER = { userId: 10, orgId: ORG, role: 'member' };

/** Each project anchors one program (projects.regulatory_program_id), as intake links them. */
const PROGRAMS = {
  drug: { project: 401, id: 'aaaaaaaa-0000-4000-8000-000000000401', programType: 'IND', productType: 'drug', agency: 'FDA' },
  device: { project: 402, id: 'aaaaaaaa-0000-4000-8000-000000000402', programType: '510K', productType: 'device', agency: 'FDA' },
  diagnostic: { project: 403, id: 'aaaaaaaa-0000-4000-8000-000000000403', programType: '510K', productType: 'ivd', agency: 'FDA' },
  biologic: { project: 404, id: 'aaaaaaaa-0000-4000-8000-000000000404', programType: 'IND', productType: 'biologic', agency: 'FDA' },
  euCta: { project: 405, id: 'aaaaaaaa-0000-4000-8000-000000000405', programType: 'CTA', productType: 'drug', agency: 'EMA' },
  nda: { project: 406, id: 'aaaaaaaa-0000-4000-8000-000000000406', programType: 'NDA', productType: 'drug', agency: 'FDA' },
} as const;
/** A tracking record anchored to no program: what a legacy caller files under. */
const UNANCHORED = 407;

/** What a sponsor records on the CMC surface's drug-substance form (cmcRegisterForms.ts drugSubstanceBody). */
const SUBSTANCE_ROW = {
  substanceName: 'BX-204',
  manufacturingProcess: { manufacturer: 'Acme Synthesis', route: 'Four-step chemical synthesis; isolated by crystallisation' },
  modality: 'small_molecule',
  status: 'development',
};
const PRODUCT_ROW = { productName: 'BX-204 tablets', dosageForm: 'Tablet', strength: '10 mg', status: 'development' };

function app(actor = OWNER) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, {
      user: { id: actor.userId, userId: actor.userId, organizationId: actor.orgId, role: actor.role },
      userId: actor.userId,
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/concept2cure', taskRoutes);
  a.use('/api/concept2cure', programTwinRoutes);
  return a;
}

const url = (projectId: number, tail: string) => `/api/concept2cure/projects/${projectId}/${tail}`;
const assess = (projectId: number) => request(app()).post(url(projectId, 'tasks/assess')).send({});
const context = (projectId: number) => request(app()).get(url(projectId, 'context'));

type Action = { action: string; priority: string; reason: string };
/** Every next action that speaks about CMC, Module 3, a drug substance or a drug product. */
const cmcActions = (body: { data?: { nextActions?: Action[] } }) =>
  (body.data?.nextActions ?? []).filter(a => /drug substance|drug product|\bCMC\b|Module 3|3\.2\.[SP]/i.test(`${a.action} ${a.reason}`));

/**
 * Record a register row and link it into Module 3 exactly as the register's
 * create does once the row is saved: the row carries the program it was filed
 * under, which is the id the CMC surface sent.
 */
async function recordInRegister(kind: 'substance' | 'product', programId: string, id: number) {
  const row = { id, projectId: programId, ...(kind === 'substance' ? SUBSTANCE_ROW : PRODUCT_ROW) };
  const linkage = await runWithTenantScope({ tenantId: String(ORG), role: 'member', source: 'test' }, () =>
    kind === 'substance'
      ? linkToModule3('write_through_drug_substance', ORG, row, writeThroughDrugSubstance)
      : linkToModule3('write_through_drug_product', ORG, row, writeThroughDrugProduct));
  expect(linkage).toEqual({ module3Linked: true });
}

async function seed(): Promise<void> {
  await h.state.pg.exec(`
    TRUNCATE organizations, users, organization_users, client_workspaces, projects, project_visibility_settings,
      project_members, project_tasks, regulatory_programs, submissions, cmc_source_objects, cmc_provenance_events,
      cmc_module3_sections, cmc_contradictions RESTART IDENTITY CASCADE;
    INSERT INTO organizations (id, name, slug) VALUES (${ORG}, 'Org A', 'org-a');
    INSERT INTO users (id, name, email, password_hash) VALUES (10, 'A owner', 'a-owner@example.test', 'x');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, 10, 'member');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (100, ${ORG}, 'A workspace', 'a-ws');
    ${Object.entries(PROGRAMS).map(([name, p]) => `
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
      VALUES ('${p.id}', ${ORG}, '${name} program', 'P${p.project}', '${p.programType}', '${p.productType}', '${p.agency}', 'Product ${p.project}');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, metadata, regulatory_program_id)
      VALUES (${p.project}, ${ORG}, 100, '${name} program', 'regulatory', 'active', 10, 10, '{}', '${p.id}');`).join('')}
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, metadata)
      VALUES (${UNANCHORED}, ${ORG}, 100, 'Legacy tracking record', 'regulatory', 'active', 10, 10, '{}');
  `);
}

let previousEnforcement: string | undefined;

beforeAll(async () => {
  previousEnforcement = process.env.RLS_ENFORCE;
  const pg = new PGlite();
  h.state.pg = pg as unknown as typeof h.state.pg;
  const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
  const declared = kit.generateDrizzleJson({
    organizations: schema.organizations, users: schema.users, organizationUsers: schema.organizationUsers,
    clientWorkspaces: schema.clientWorkspaces, projects: schema.projects,
    projectVisibilitySettings: schema.projectVisibilitySettings, projectMembers: schema.projectMembers,
    projectTasks: schema.projectTasks, concept2cureArtifacts: schema.concept2cureArtifacts,
    concept2cureProvenanceEvents: schema.concept2cureProvenanceEvents,
    concept2cureSignatures: schema.concept2cureSignatures,
    concept2cureReviewComments: schema.concept2cureReviewComments,
    concept2cureReviewAssignments: schema.concept2cureReviewAssignments,
    regulatoryPrograms, submissions: schema.submissions, ectdSequences: schema.ectdSequences,
    submissionLeaves: schema.submissionLeaves,
  });
  for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), declared)) {
    try {
      await pg.exec(statement);
    } catch (error) {
      // Only a foreign key to a table outside this fixture may be left out.
      if (!/FOREIGN KEY/.test(statement)) throw error;
    }
  }
  for (const file of CMC_TABLE_FILES) await pg.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(ROOT, TENANT_ISOLATION_SWEEP), 'utf8'));
  await pg.exec(`CREATE ROLE ${RUNTIME_ROLE} NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE};`);
  const { rows } = await pg.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  for (const { tablename } of rows) await pg.exec(`ALTER TABLE "${tablename}" OWNER TO ${RUNTIME_ROLE}`);
}, 120_000);

afterAll(async () => {
  if (previousEnforcement === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = previousEnforcement;
  await (h.state.pg as unknown as PGlite | null)?.close();
});

beforeEach(async () => {
  h.state.failOn = null;
  process.env.RLS_ENFORCE = 'on';
  await seed();
});

describe('the fixture is the deployed shape', () => {
  it('the register keys project_id as TEXT and is policied, and the runtime role is not exempt', async () => {
    const { rows } = await h.state.pg.query(
      `SELECT c.relname, c.relforcerowsecurity, a.atttypid::regtype::text AS project_id_type,
              (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation_policy') AS policies
         FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'project_id'
        WHERE c.relname IN ('cmc_source_objects', 'cmc_module3_sections') ORDER BY c.relname`, [], {});
    expect(rows).toEqual(['cmc_module3_sections', 'cmc_source_objects'].map(relname => ({
      relname, relforcerowsecurity: true, project_id_type: 'text', policies: 1,
    })));
  });

  it('a recorded drug substance lands under the program UUID the CMC surface sends', async () => {
    await recordInRegister('substance', PROGRAMS.drug.id, 9001);
    const { rows } = await h.state.pg.query(`SELECT project_id, source_type FROM cmc_source_objects`, [], {});
    expect(rows).toEqual([{ project_id: PROGRAMS.drug.id, source_type: 'drug_substance' }]);
  });
});

describe('the task assessment reads CMC readiness from the register', () => {
  it.each([
    ['a device program', 'device', 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE'],
    ['a diagnostic (IVD) program', 'diagnostic', 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE'],
    ['a biologic program', 'biologic', 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE'],
    ['a drug program filing an EU CTA', 'euCta', 'CMC_APPLICATION_OUT_OF_SCOPE'],
    ['a drug program filing an NDA', 'nda', 'CMC_APPLICATION_OUT_OF_SCOPE'],
  ] as const)('%s is given no CMC action, and the boundary’s refusal says why', async (_label, program, code) => {
    const res = await assess(PROGRAMS[program].project);
    // The actions first, so a failure shows what the program was told.
    expect(cmcActions(res.body), JSON.stringify(res.body.data?.nextActions)).toEqual([]);
    expect(res.status).toBe(200);
    expect(res.body.data.cmc).toMatchObject({ state: 'outside_composition_scope', cmcProjectId: PROGRAMS[program].id, code });
    expect(res.body.data.cmc.reason).toMatch(/Module 3 is composed here only for/);
  });

  it('a drug-substance record in the register is read as recorded, and only the drug product is asked for', async () => {
    await recordInRegister('substance', PROGRAMS.drug.id, 9001);
    const res = await assess(PROGRAMS.drug.project);
    expect(cmcActions(res.body).map(a => a.action), JSON.stringify(res.body.data?.nextActions))
      .toEqual(['Record the drug product in the CMC / Module 3 register']);
    expect(res.body.data.cmc).toMatchObject({
      state: 'read', cmcProjectId: PROGRAMS.drug.id,
      drugSubstance: { family: '3.2.S', recorded: true }, drugProduct: { family: '3.2.P', recorded: false },
    });
    expect(cmcActions(res.body)[0].reason).toMatch(/§3\.2\.P/);
  });

  it('a register that holds both gives no CMC action', async () => {
    await recordInRegister('substance', PROGRAMS.drug.id, 9001);
    await recordInRegister('product', PROGRAMS.drug.id, 9101);
    const res = await assess(PROGRAMS.drug.project);
    expect(cmcActions(res.body), JSON.stringify(res.body.data?.nextActions)).toEqual([]);
    expect(res.body.data.cmc).toMatchObject({
      state: 'read', drugSubstance: { recorded: true }, drugProduct: { recorded: true },
    });
    // What the composer still scores incomplete is stated, section by section, not hidden.
    for (const family of [res.body.data.cmc.drugSubstance, res.body.data.cmc.drugProduct]) {
      expect(family.sections).toBeGreaterThan(0);
      for (const s of family.incomplete) expect(s.missingInputs.length).toBeGreaterThan(0);
    }
  });

  it('an empty register on a US IND drug program asks for both, naming what each feeds', async () => {
    const res = await assess(PROGRAMS.drug.project);
    const actions = cmcActions(res.body);
    expect(actions.map(a => a.action), JSON.stringify(res.body.data?.nextActions)).toEqual([
      'Record the drug substance in the CMC / Module 3 register',
      'Record the drug product in the CMC / Module 3 register',
    ]);
    expect(actions[0].reason).toMatch(/§3\.2\.S/);
    expect(actions[1].reason).toMatch(/§3\.2\.P/);
    expect(res.body.data.cmc).toMatchObject({ state: 'read', drugSubstance: { recorded: false }, drugProduct: { recorded: false } });
  });

  it('a drug substance kept only in project metadata is not read as recorded', async () => {
    await h.state.pg.exec(`UPDATE projects SET metadata = '{"cmcDrugSubstance":{"substanceName":"Metadata-only API"}}' WHERE id = ${PROGRAMS.drug.project}`);
    const res = await assess(PROGRAMS.drug.project);
    expect(cmcActions(res.body).map(a => a.action), JSON.stringify(res.body.data?.nextActions))
      .toContain('Record the drug substance in the CMC / Module 3 register');
    expect(JSON.stringify(res.body)).not.toContain('Metadata-only API');
  });

  it('a tracking record anchored to no program is answered by the boundary, with no CMC action', async () => {
    const res = await assess(UNANCHORED);
    expect(cmcActions(res.body), JSON.stringify(res.body.data?.nextActions)).toEqual([]);
    expect(res.body.data.cmc).toMatchObject({
      state: 'outside_composition_scope', cmcProjectId: String(UNANCHORED), code: 'CMC_PROGRAM_NOT_RECORDED',
    });
  });

  it.each([
    ['the register read', /FROM cmc_source_objects/i],
    ['the program read the boundary judges (CMC_APPLICATION_NOT_READABLE)', /FROM regulatory_programs/i],
  ])('when %s fails, readiness is said to be unreadable: neither complete nor missing', async (_label, pattern) => {
    await recordInRegister('substance', PROGRAMS.drug.id, 9001);
    h.state.failOn = { pattern, code: '57014' };
    const res = await assess(PROGRAMS.drug.project);
    h.state.failOn = null;
    expect(res.status).toBe(200);
    expect(cmcActions(res.body), JSON.stringify(res.body.data?.nextActions)).toEqual([]);
    expect(res.body.data.cmc.state).toBe('unreadable');
    expect(res.body.data.cmc).not.toHaveProperty('drugSubstance');
    expect(res.body.data.risks).toContain(res.body.data.cmc.reason);
    expect(res.body.data.cmc.reason).toMatch(/could not be read/);
  });
});

describe('the project context reads CMC readiness from the register', () => {
  it('states what the register holds, and not what project metadata says', async () => {
    await recordInRegister('substance', PROGRAMS.drug.id, 9001);
    await h.state.pg.exec(`UPDATE projects SET metadata = '{"cmcDrugProduct":{"productName":"Metadata-only tablet"}}' WHERE id = ${PROGRAMS.drug.project}`);
    const res = await context(PROGRAMS.drug.project);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.data.cmc)).not.toContain('Metadata-only tablet');
    expect(res.body.data.cmc).toMatchObject({
      state: 'read', cmcProjectId: PROGRAMS.drug.id, drugSubstance: { recorded: true }, drugProduct: { recorded: false },
    });
  });

  it('states the boundary’s refusal for a device program', async () => {
    const res = await context(PROGRAMS.device.project);
    expect(res.status).toBe(200);
    expect(res.body.data.cmc).toMatchObject({ state: 'outside_composition_scope', code: 'CMC_PRODUCT_CLASS_OUT_OF_SCOPE' });
  });
});

describe('the project-metadata CMC routes are retired', () => {
  it.each(['get', 'put'] as const)('%s …/cmc is not served, and the project record is untouched', async method => {
    const before = (await h.state.pg.query(`SELECT metadata FROM projects WHERE id = $1`, [PROGRAMS.drug.project], {})).rows;
    const call = request(app())[method](url(PROGRAMS.drug.project, 'cmc'));
    const res = method === 'put' ? await call.send({ drugSubstance: { substanceName: 'Written through the retired route' } }) : await call;
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect((await h.state.pg.query(`SELECT metadata FROM projects WHERE id = $1`, [PROGRAMS.drug.project], {})).rows).toEqual(before);
  });
});
