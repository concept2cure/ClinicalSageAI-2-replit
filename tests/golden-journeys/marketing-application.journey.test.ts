/**
 * Golden Journey B (WO-01): dossier readiness → pre-compile validation → eCTD
 * compilation → compilation history.
 *
 * Route-level traversal of the marketing-application spine: the REAL
 * project-dossier and ectd-compile routers mounted in an express app and
 * driven over HTTP, against the REAL canonical DDL for `project_sections`,
 * `ectd_compilations` and `concept2cure_artifacts`.
 *
 * Both routers source the organization from request context rather than from a
 * JWT they verify themselves (unlike Journey A's authoring router), so this
 * journey installs a tenant middleware that sets it — and then proves the
 * scoping actually holds by driving a second organization through the same
 * endpoints and asserting it sees none of the first one's data.
 *
 * WHAT THIS JOURNEY FOUND (ledger C-16) — every step below failed before the
 * accompanying fixes:
 *
 *   · project_sections never had `content`, `word_count` or `required`, but all
 *     three compile endpoints select them. The compile SELECT is unguarded, so
 *     POST /compile returned 500 every time; /status and /validate swallow the
 *     error and reported an empty dossier no matter how much work existed.
 *   · the compilation INSERT bound six values to five placeholders with a
 *     duplicated orgId, shifting every column one to the left and dropping the
 *     XML backbone entirely — and could not execute regardless, because
 *     module_id and compiled_by were NOT NULL and unsupplied.
 *   · GET /history filtered on the compilation NAME alone, so one tenant could
 *     read another tenant's submission history.
 *
 * Output: tests/golden-journeys/__reports__/marketing-application.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJourneyDb, JourneyRecorder, type JourneyDb, extractTableDdl, assertNoSchemaGaps, assertNoDegradedTenantEnrichment } from './harness';

const T = 180_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
// The project dossier imports '../db.js'; vitest resolves that to the same module
// only if mocked under both specifiers.
vi.mock('../../server/db.js', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
}));

const ORG = 1;
const OTHER_ORG = 2;
const PROJECT = 101;
const OTHER_PROJECT = 202;
const PROGRAM = '11111111-1111-4111-8111-111111111111';

// The current-access service has its own native SQL admission coverage. This
// journey seats the actor and exact canonical anchor, then proves the real
// dossier/compile reads over canonical DDL. It does not claim JWT admission.
vi.mock('../../server/services/c2c/current-program-access', async original => {
  const real = await original<typeof import('../../server/services/c2c/current-program-access')>();
  return { ...real, ...(await import('../../server/routes/c2c/__tests__/support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
import { clearSeats, seatMember, seatProgram } from '../../server/routes/c2c/__tests__/support/current-member';

/**
 * FK prerequisites. project_sections references organizations, projects and
 * users; concept2cure_artifacts carries the dossier rollup the readiness
 * endpoint aggregates.
 */
const PREREQ = `
  -- \`uuid\` as db/migrations/20260129_add_org_uuid_alignment.sql adds it; the
  -- org-membership middleware LEFT JOINs it on every request and, without it,
  -- degrades to a membership-only decision with orgUuid = null (ledger L148).
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT, uuid UUID NOT NULL DEFAULT gen_random_uuid());
  CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
  ${extractTableDdl('migrations/0000_sweet_joseph.sql', ['projects'])}
  CREATE TABLE ectd_modules (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE concept2cure_artifacts (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    project_id INTEGER,
    ctd_section TEXT,
    status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  INSERT INTO organizations (id, name) VALUES (${ORG}, 'journey-b-org'), (${OTHER_ORG}, 'other-org');
  INSERT INTO users (id, email) VALUES (1, 'regops@journey.example');
  INSERT INTO projects (id, organization_id, client_workspace_id, type, name) VALUES
    (${PROJECT}, ${ORG}, 1, 'regulatory', 'NDA 210001'),
    (${OTHER_PROJECT}, ${OTHER_ORG}, 2, 'regulatory', 'Other tenant NDA');
`;

/** ectd_compilations lives in the drizzle baseline; this is that shape. */
const ECTD_COMPILATIONS_DDL = `
  CREATE TABLE ectd_compilations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    compilation_name TEXT NOT NULL,
    compilation_type TEXT NOT NULL,
    included_granules JSON,
    compiled_file_path TEXT,
    sharepoint_url TEXT,
    xml_backbone TEXT,
    cross_references JSON,
    status TEXT NOT NULL DEFAULT 'pending',
    compiled_by INTEGER NOT NULL,
    compiled_at TIMESTAMP,
    version TEXT DEFAULT '1.0',
    change_log JSON,
    validation_results JSON,
    lock_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

let jdb: JourneyDb;
let app: express.Express;

const R = new JourneyRecorder(
  'Journey B — marketing application: dossier readiness to eCTD compilation',
  'The submission spine over HTTP against canonical DDL: roll dossier readiness up from live artifacts, run pre-compile validation, compile an eCTD package with an XML backbone, persist the compilation, and read it back from history — with cross-tenant isolation asserted on every read.',
);

/** Both routers read the org from request context; this stands in for the app's tenant middleware. */
function asOrg(orgId: number) {
  return (req: request.Test) => req.set('x-journey-org', String(orgId));
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    // The baseline table is a prerequisite, so the REAL migrations that alter
    // it run over it below. It used to be created last, as test-only DDL, which
    // meant none of them could run: the journey hand-copied two of their
    // statements and silently lacked the rest, and GET /history — which selects
    // sequence_number and leaf_manifest — answered from a swallowed error.
    prereqSql: PREREQ + ECTD_COMPILATIONS_DDL + extractTableDdl('migrations/20260524_program_workbench_schema.sql', ['regulatory_programs'])
      + extractTableDdl('migrations/20260528_phase9_document_schema.sql', ['c2c_rule_packs', 'c2c_documents', 'c2c_document_sections']),
    migrations: [
      // Numeric projects now read the real nullable program bridge for filing applicability.
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      // The Part 11 tamper-evident store (ledger L145) — cross-cutting.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260220_ind_section_tracking.sql',
      'db/migrations/20260725_project_sections_content_columns.sql',
      'db/migrations/20260725_ectd_compilations_project_level.sql',
      'db/migrations/20260730_ectd_compilations_sequence_columns.sql',
      'db/migrations/20260730_ectd_compilations_leaf_manifest.sql',
      'db/migrations/20260923_ectd_compilations_external_validation.sql',
      'db/migrations/20260828_ectd_compilations_submission_id.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  await jdb.pool.query(`INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
    VALUES ($1,$2,'NDA 210001','JOURNEY-B','ind','drug','FDA','Journey product')`, [PROGRAM, ORG]);
  await jdb.pool.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=$2', [PROGRAM, PROJECT]);
  clearSeats();
  seatMember(ORG, 1, 'member');
  seatMember(OTHER_ORG, 1, 'member');
  seatProgram(ORG, PROGRAM, { projectId: PROJECT, clientWorkspaceId: 1 });

  const { default: projectRouter } = await import('../../server/routes/c2c/projects');
  const { default: ectdCompileRouter } = await import('../../server/routes/ectd-compile');

  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    const raw = req.headers['x-journey-org'];
    if (raw) (req as unknown as { tenantId: number }).tenantId = Number(raw);
    (req as any).userId = 1;
    (req as any).dbClient = jdb.pool;
    next();
  });
  app.use('/api/c2c/projects', projectRouter);
  app.use('/api/ectd-compile', ectdCompileRouter);
}, T);

afterAll(async () => {
  // A journey that ran against a database missing a table its subject writes
  // to proves less than it claims (ledger L145).
  // Ordered BEFORE the schema-gap check on purpose: a degraded membership is
  // usually CAUSED by a missing column, and the gap check would otherwise
  // throw first and report the symptom while hiding which claims were
  // proven without an org context (ledger L148).
  await assertNoDegradedTenantEnrichment();
  assertNoSchemaGaps(jdb);
  const { jsonPath, mdPath } = R.write('marketing-application');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

/** Seed one section of the dossier. */
async function seedSection(
  projectId: number,
  orgId: number,
  s: { code: string; module: string; title: string; status: string; content?: string; required?: boolean },
) {
  const words = s.content ? s.content.trim().split(/\s+/).length : 0;
  await jdb.pool.query(
    `INSERT INTO project_sections
       (organization_id, project_id, section_code, module, title, status, content, word_count, required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [orgId, projectId, s.code, s.module, s.title, s.status, s.content ?? null, words, s.required ?? false],
  );
}

describe('Journey B — marketing application spine (canonical DDL)', () => {
  it('runs the submission spine', async () => {
    // ── 1. The dossier starts empty ─────────────────────────────────────────
    await R.step('dossier-readiness-on-an-empty-project', async () => {
      const res = await asOrg(ORG)(request(app).get(`/api/c2c/projects/${PROGRAM}/dossier`));
      expect(res.status).toBe(200);
      expect(res.body.supportingReadiness.artifactReadiness.sections).toEqual([]);
      expect(res.body.supportingReadiness.artifactReadiness.summary.totalSections).toBe(0);
      expect(res.body.home).toEqual({ state: 'no_sections', pct: null });
      return { status: res.status, sections: 0 };
    });

    // ── 2. Build the dossier ────────────────────────────────────────────────
    await R.step('seed-the-dossier-sections', async () => {
      // Section codes are UNPREFIXED in this vocabulary ('2.5', not 'm2.5') —
      // ECTD_MODULE_DEFS.requiredSections and the startsWith match both use that
      // form. Journey C's lesson applied: seed the vocabulary the code reads.
      const body = 'Clinical overview narrative. '.repeat(40);
      await seedSection(PROJECT, ORG, { code: '1.1', module: 'M1', title: 'Forms', status: 'approved', content: body, required: true });
      await seedSection(PROJECT, ORG, { code: '2.5', module: 'M2', title: 'Clinical Overview', status: 'approved', content: body, required: true });
      await seedSection(PROJECT, ORG, { code: '2.7.1', module: 'M2', title: 'Clinical Summary', status: 'drafting', content: body, required: true });
      // Another tenant's project, same section codes — nothing below may see it.
      await seedSection(OTHER_PROJECT, OTHER_ORG, { code: '2.5', module: 'M2', title: 'Other tenant overview', status: 'approved', content: body, required: true });

      // Artifacts drive the dossier-readiness rollup (a different store).
      for (const [section, status] of [['2.5', 'approved'], ['2.5', 'draft'], ['2.7', 'review']] as const) {
        await jdb.pool.query(
          `INSERT INTO concept2cure_artifacts (organization_id, project_id, ctd_section, status)
           VALUES ($1,$2,$3,$4)`,
          [ORG, PROJECT, section, status],
        );
      }
      const n = await jdb.pool.query(`SELECT count(*)::int AS n FROM project_sections`);
      return { projectSections: (n.rows[0] as { n: number }).n };
    });

    // ── 3. Readiness rolls up to the WEAKEST artifact in each section ───────
    await R.step('dossier-readiness-rolls-up-to-the-weakest-artifact', async () => {
      const res = await asOrg(ORG)(request(app).get(`/api/c2c/projects/${PROGRAM}/dossier`));
      expect(res.status).toBe(200);
      const byId = Object.fromEntries(
        (res.body.supportingReadiness.artifactReadiness.sections as { ctdSection: string; status: string; artifactCount: number }[]).map((s) => [s.ctdSection, s]),
      );
      // 2.5 holds one approved and one draft artifact → the section is draft.
      expect(byId['2.5'].status).toBe('draft');
      expect(byId['2.5'].artifactCount).toBe(2);
      expect(byId['2.7'].status).toBe('review');
      expect(res.body.supportingReadiness.sectionTracking.modules).not.toHaveLength(0);
      return res.body.supportingReadiness;
    });

    // ── 4. Pre-compile validation reads real section state ──────────────────
    const validation = await R.step('pre-compile-validation', async () => {
      const res = await asOrg(ORG)(request(app).post(`/api/ectd-compile/${PROJECT}/validate`)).send({ region: 'FDA' });
      expect(res.status).toBe(200);
      const results = res.body.validationResults ?? res.body.results ?? [];
      expect(Array.isArray(results)).toBe(true);
      // Proof the rows were actually read: a section we seeded as `drafting`
      // must be reported incomplete BY NAME. Before the content-columns fix the
      // query threw and this list described an empty dossier instead.
      const incomplete = results.filter((v: { rule: string }) => v.rule === 'REQUIRED_SECTION_INCOMPLETE');
      const ok = results.filter((v: { rule: string }) => v.rule === 'REQUIRED_SECTION_OK');
      expect(ok.some((v: { message: string }) => v.message.includes('Clinical Overview'))).toBe(true);
      expect(incomplete.some((v: { message: string }) => v.message.includes('Clinical Summary'))).toBe(true);
      return { total: results.length, ok: ok.length, incomplete: incomplete.length };
    });

    // ── 5. Compile — the step that returned 500 unconditionally ─────────────
    const compiled = await R.step('compile-the-ectd-package', async () => {
      const res = await asOrg(ORG)(request(app).post(`/api/ectd-compile/${PROJECT}/compile`)).send({
        submissionType: 'initial',
        region: 'FDA',
      });
      expect(res.status).toBe(200);
      expect(res.body.xmlBackbone).toContain('<?xml');
      expect(Array.isArray(res.body.modules)).toBe(true);
      return {
        status: res.body.status,
        submissionReady: res.body.submissionReady,
        moduleCount: res.body.modules.length,
        backboneBytes: String(res.body.xmlBackbone).length,
      };
    });

    // ── 6. The compilation is DURABLE, and every column holds its own value ─
    await R.step('the-compilation-record-is-durable-and-correctly-aligned', async () => {
      const rows = await jdb.pool.query(
        `SELECT organization_id, compilation_name, compilation_type, status,
                xml_backbone, version, compiled_at, validation_results
           FROM ectd_compilations ORDER BY id`,
      );
      expect(rows.rows).toHaveLength(1);
      const rec = rows.rows[0] as {
        organization_id: number; compilation_name: string; compilation_type: string;
        status: string; xml_backbone: string; version: string; compiled_at: string;
      };
      // The off-by-one bug put the org id in compilation_name, the name in
      // compilation_type, the submission type in status and the status in
      // xml_backbone. Each assertion below pins one of those columns.
      expect(rec.organization_id).toBe(ORG);
      expect(rec.compilation_name).toBe(`IND Compilation — Project ${PROJECT}`);
      expect(rec.compilation_type).toBe('initial');
      expect(['completed', 'failed']).toContain(rec.status);
      expect(rec.xml_backbone).toContain('<?xml');
      expect(rec.version).toBe('1.0');
      expect(rec.compiled_at).toBeTruthy();
      return {
        compilationName: rec.compilation_name,
        compilationType: rec.compilation_type,
        status: rec.status,
        backbonePersisted: rec.xml_backbone.includes('<?xml'),
      };
    });

    // ── 7. History returns it ───────────────────────────────────────────────
    await R.step('history-lists-the-compilation', async () => {
      const res = await asOrg(ORG)(request(app).get(`/api/ectd-compile/${PROJECT}/history`));
      expect(res.status).toBe(200);
      expect(res.body.compilations).toHaveLength(1);
      expect(res.body.compilations[0].compilation_name).toContain(`Project ${PROJECT}`);
      return { count: res.body.compilations.length };
    });

    // ── 8. Readiness dashboard reflects the same state ──────────────────────
    await R.step('compile-status-dashboard-sees-the-sections', async () => {
      const res = await asOrg(ORG)(request(app).get(`/api/ectd-compile/${PROJECT}/status`));
      expect(res.status).toBe(200);
      const modules = res.body.moduleReadiness ?? res.body.modules ?? [];
      expect(Array.isArray(modules)).toBe(true);
      // Before the fix this silently reported an empty dossier.
      const m2 = modules.find((m: { moduleCode: string }) => m.moduleCode === 'm2');
      expect(m2).toBeTruthy();
      return { modules: modules.length, m2 };
    });

    // ── KNOWN-BAD: another tenant sees none of it ───────────────────────────
    await R.expectBlocked('cross-tenant-history-is-not-found', async () => {
      const res = await asOrg(OTHER_ORG)(request(app).get(`/api/ectd-compile/${PROJECT}/history`));
      // Numeric anchors now resolve inside the current tenant before history
      // is read, so a foreign project is not found and supplies no rows.
      return {
        blocked: res.status === 404 && (res.body.compilations ?? []).length === 0,
        status: res.status,
        rows: (res.body.compilations ?? []).length,
      };
    });

    await R.expectBlocked('cross-tenant-project-dossier-is-not-found', async () => {
      const res = await asOrg(OTHER_ORG)(request(app).get(`/api/c2c/projects/${PROGRAM}/dossier`));
      return {
        blocked: res.status === 404 && res.body.supportingReadiness === undefined,
        status: res.status,
        sections: (res.body.supportingReadiness?.artifactReadiness?.sections ?? []).length,
      };
    });

    await R.expectBlocked('project-dossier-without-org-context-is-refused', async () => {
      const res = await request(app).get(`/api/c2c/projects/${PROGRAM}/dossier`);
      // Canonical project GET admission conceals denied access as not found.
      return { blocked: res.status === 404, status: res.status };
    });

    await R.expectBlocked('compile-without-org-context-is-401', async () => {
      const res = await request(app).post(`/api/ectd-compile/${PROJECT}/compile`).send({});
      return { blocked: res.status === 401, status: res.status };
    });

    await R.expectBlocked('non-program-project-id-is-rejected', async () => {
      const res = await asOrg(ORG)(request(app).get('/api/c2c/projects/not-a-project/dossier'));
      return { blocked: res.status === 404, status: res.status, code: res.body.error };
    });

    void validation;
    void compiled;

    R.observations.push(
      'Fixed while building this journey: project_sections never had `content`, `word_count` or `required`, yet all three eCTD compile endpoints select them. The compile SELECT is unguarded, so POST /compile returned 500 on every call; /status and /validate swallow the error and reported an empty dossier regardless of the work done (ledger C-16).',
      'Fixed while building this journey: the compilation INSERT bound six values to five placeholders with a duplicated orgId, shifting every value one column left — org id into compilation_name, name into compilation_type, submission type into status, status into xml_backbone — and dropping the XML backbone entirely. It could not execute in any case: module_id and compiled_by were NOT NULL and unsupplied. Both are now nullable, because a project-level compilation spans every module and has no single one to point at.',
      'Fixed while building this journey: GET /:projectId/history filtered on the compilation NAME alone, with no organization filter, so one tenant could read another tenant\'s submission history for the same project number.',
      'The catch around the compilation INSERT blamed a missing table ("table not available, skipping record") for what were really a parameter-count error and two NOT NULL violations. It now reports the actual driver message — a swallowed write that misattributes its own cause is how this survived.',
    );
    R.limitations.push(
      'ectd_compilations is created from the drizzle baseline shape (migrations/0000_sweet_joseph.sql) as prerequisite DDL, and the four real migrations that alter it — project-level nullability, the sequence columns, the leaf manifest and submission_id — then run over it.',
      'Both routers take the organization from request context rather than verifying a JWT themselves. This journey installs tenant middleware and seats the canonical project actor/anchor admission double; current-program-access has native SQL admission coverage and the browser journey covers signed-in project access. This journey proves actual dossier/compile SQL, not JWT or membership admission.',
      'The eCTD ZIP/export path (the canonical assembleSubmissionEctd over the submission spine) and gateway submission are not in this journey; it ends at a persisted compilation with an XML backbone.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(5);
  }, T);
});
