/**
 * Golden journey — DEVICE 510(k): program intake → authored sections → eSTAR
 * assembly → draft content package → the official-eSTAR refusal.
 *
 * Replaces the browser-level `tests/e2e/510k-founder-path.e2e.spec.ts` deleted in
 * Phase 0 (it drove a UI that no longer exists) at the API/service level: the
 * REAL routers (`/api/c2c/projects`, `/api/cerv2-sections`, `/api/510k/estar/*`)
 * over HTTP, with the REAL services behind them, against the REAL canonical DDL
 * on in-process Postgres (PGlite). Nothing about intake, assembly, rendering,
 * artifact registration or auditing is stubbed.
 *
 * WHAT IT ASSERTS, IN ORDER (every refusal is a first-class outcome):
 *
 *   1. Intake creates the program AND its PM-spine anchor
 *      (`projects.regulatory_program_id`, Document Identity Contract slice C1)
 *      in ONE transaction, and creates NO submissions spine for a device
 *      program — the honest absence, not a fabricated eCTD filing.
 *   2. Intake REFUSES TO GUESS a client workspace: in an org with two
 *      workspaces the anchor is skipped with AMBIGUOUS_CLIENT_WORKSPACE, and
 *      the reason travels in the 201 body AND the sealed audit payload.
 *   3. Authored content drives readiness: with the substantial-equivalence
 *      section missing, /assemble names it as a missing required eSTAR section;
 *      authoring it clears exactly that gap. Nothing is invented from an empty
 *      section (only content-bearing sections become leaves).
 *   4. /assemble reports artifactKind 'content-package-draft' — content exists,
 *      but the official FDA eSTAR template is not vendored, so only the loose
 *      section-PDF package is producible. canProduceOfficialEstar is false.
 *   5. In PRODUCTION with ESTAR_REQUIRE_TEMPLATE the same input carries a hard
 *      blocker naming the missing template file (the fail-closed posture the
 *      staging default reports without blocking).
 *   6. /build produces the draft ZIP (six FDA-named section PDFs, rendered from
 *      the authored sections) and a governed export consequence whose persisted
 *      metadata is labelled officialEstarPdf:false.
 *   7. The same /build against the program's UUID is delivered AUDITED-UNPLACED
 *      with a SHA-256 — even though the C1 anchor for that program EXISTS (see
 *      the observations: the route resolves its anchor from fda_510k_projects
 *      only and never calls resolveProgramProjectAnchor).
 *   8. /official REFUSES 422 ESTAR_NOT_PRODUCIBLE with blockers naming the
 *      un-vendored template AND the unpopulated canonical→AcroForm field map,
 *      and writes NO artifact and NO export audit row.
 *   9. Tenant isolation: another org cannot export this org's program.
 *
 * Output: tests/golden-journeys/__reports__/device-510k-estar.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import {
  createJourneyDb,
  extractTableDdl,
  makeRequestDbClient,
  JourneyRecorder,
  type JourneyDb,
  assertNoSchemaGaps,
  assertNoDegradedTenantEnrichment,
} from './harness';

const T = 180_000;

// The audit chain's HMAC seal (§11.70) is best-effort without a key; give the
// journey a real one so the sealed intake audit row can be asserted.
process.env.AUDIT_HMAC_KEY = 'journey-device-510k-audit-hmac-key-0000000000';

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
vi.mock('../../server/db.js', () => ({
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
// The routers' own authentication middleware verifies a platform JWT; token
// ISSUANCE and verification are Journey A's subject (ind-authoring), so this
// journey installs the verified-principal middleware below in its place. Every
// authorization decision under test (role gate, org scoping, tenant isolation)
// still runs in the real routers against that principal.
vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const ORG = 1;
const OTHER_ORG = 2;
const USER = 1;
const OTHER_USER = 2;

let jdb: JourneyDb;
let app: express.Express;

const R = new JourneyRecorder(
  'Device 510(k) — program intake to the official-eSTAR refusal',
  'The device path over HTTP against real canonical DDL: intake writes the program and its C1 PM-spine anchor in one transaction (and refuses to guess an ambiguous workspace), authored cerv2_510k_sections drive eSTAR readiness, /assemble reports the honest artifactKind, /build emits a draft ZIP labelled officialEstarPdf:false with a governed export consequence, the UUID-program export is delivered audited-unplaced, and /official refuses 422 ESTAR_NOT_PRODUCIBLE naming the missing FDA template and field map.',
  [
    'migrations/0000_sweet_joseph.sql (extractTableDdl)',
    'migrations/20260527_mutation_primitives.sql',
    'migrations/20260609_audit_hmac_seal.sql',
    'migrations/20260524_program_workbench_schema.sql',
    'migrations/20260528_phase9_document_schema.sql',
    'migrations/20260814_projects_regulatory_program_anchor.sql',
    'migrations/20260817_reconcile_declared_updated_at_columns.sql',
  ],
);

/** The verified principal + request-scoped DB client the app's middleware sets. */
function asPrincipal(orgId: number, userId: number, role = 'admin') {
  return (req: request.Test) =>
    req.set('x-journey-org', String(orgId)).set('x-journey-user', String(userId)).set('x-journey-role', role);
}

/** program uuid + its PM-spine anchor, filled by step 1. */
let programId = '';
let anchorProjectId = 0;
/** fda_510k_projects.id — the numeric anchor the eSTAR route resolves. */
let deviceProjectId = 0;

beforeAll(async () => {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations',
    'users',
    'client_workspaces',
    'projects',
    'audit_logs',
    'cerv2_510k_sections',
    'cerv2_section_versions',
    'fda_510k_projects',
    'concept2cure_artifacts',
    'concept2cure_artifact_versions',
    'concept2cure_provenance_events',
    'regulatory_audit_logs',
  ]);

  jdb = await createJourneyDb({
    prereqSql: baseline,
    migrations: [
      // The Part 11 tamper-evident store (ledger L145) — cross-cutting.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      // audit_logs chain columns + the c2c_ana_actions ledger the scaffold's
      // governed action writes to.
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      // regulatory_programs — the uuid program spine intake writes.
      'migrations/20260524_program_workbench_schema.sql',
      // c2c_documents / c2c_document_sections / c2c_rule_packs (13 packs,
      // including k510 × FDA) — the outline intake scaffolds.
      'migrations/20260528_phase9_document_schema.sql',
      // cerv2_510k_sections draft-provenance columns + the (org, section_key)
      // uniqueness the authoring surfaces rely on. shared/schema.ts enumerates
      // these columns, so the section INSERT 42703s without them.
      'migrations/20260506_kit_section_draft_provenance.sql',
      // Slice C1: projects.regulatory_program_id, the program ↔ PM-spine bridge.
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      // cerv2_section_versions.updated_at — the column shared/schema.ts declares
      // and the section INSERT names. Loaded as a REAL migration, not granted as
      // test-only sql, so this journey proves the deploy path provides it.
      'migrations/20260817_reconcile_declared_updated_at_columns.sql',
    ],
    // The REAL referential rule for the governed artifact registry. The drizzle
    // baseline applies it as a separate ALTER (extractTableDdl deliberately does
    // not extract those), and it is exactly the constraint that decides whether
    // a governed export can be placed at all — so this journey carries it.
    testOnlySql: `
      ALTER TABLE concept2cure_artifacts
        ADD CONSTRAINT concept2cure_artifacts_project_id_projects_id_fk
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

      -- The three TEST-ONLY column grants that used to live here are gone,
      -- deliberately, and their absence is now part of what this journey
      -- proves:
      --
      --   cerv2_section_versions.updated_at   → reconciled for real by
      --     migrations/20260817_reconcile_declared_updated_at_columns.sql, which is
      --     in the canonical set below, so the journey gets it the same way a
      --     deployment does.
      --   concept2cure_provenance_events.updated_at
      --   regulatory_audit_logs.created_at/.updated_at
      --     → these columns exist in NO lineage AND in no drizzle declaration;
      --       the raw INSERTs naming them were simply wrong and no longer do.
      --
      -- Granting them here would hide exactly the failure this journey exists to
      -- catch, so the schema the journey runs against is now the migrated one,
      -- unassisted.
    `,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES
       ($1,'journey-org','journey-org','standard',10),
       ($2,'other-org','other-org','standard',10)`,
    [ORG, OTHER_ORG],
  );
  await jdb.pool.query(
    `INSERT INTO users (id, email, name, password_hash) VALUES
       ($1,'regops@journey.example','Robin RegOps','x'),
       ($2,'outsider@other.example','Iris Intruder','x')`,
    [USER, OTHER_USER],
  );
  // ORG has exactly ONE client workspace → the anchor is unambiguous.
  // OTHER_ORG has TWO → intake must refuse to pick one.
  await jdb.pool.query(
    `INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES
       (1,$1,'Journey Workspace','journey-ws'),
       (2,$2,'Alpha','alpha'),
       (3,$2,'Beta','beta')`,
    [ORG, OTHER_ORG],
  );

  const { default: c2cProjectsRouter } = await import('../../server/routes/c2c/projects');
  const { default: cerv2SectionsRouter } = await import('../../server/routes/cerv2-sections');
  const { default: estarRouter } = await import('../../server/routes/510k-estar-routes');

  app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req, _res, next) => {
    const orgId = Number(req.headers['x-journey-org']);
    const userId = Number(req.headers['x-journey-user']);
    if (Number.isFinite(orgId) && orgId > 0) {
      const role = String(req.headers['x-journey-role'] ?? 'admin');
      const r = req as unknown as Record<string, unknown>;
      r.user = { id: userId, userId, organizationId: orgId, role };
      r.userId = userId;
      r.userRole = role;
      r.tenantId = orgId;
      r.tenantContext = { organizationId: orgId };
      // The real request-scoped client requestDb(req)/requestPgClient(req) wrap.
      r.dbClient = makeRequestDbClient(jdb.pglite);
    }
    next();
  });
  app.use('/api/c2c/projects', c2cProjectsRouter);
  app.use('/api/cerv2-sections', cerv2SectionsRouter);
  app.use('/api/510k/estar', estarRouter);
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
  const { jsonPath, mdPath } = R.write('device-510k-estar');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

/** Author one 510(k) section through the REAL section-authoring route. */
async function authorSection(s: {
  number: string;
  title: string;
  key: string;
  category: string;
  content: string;
}) {
  const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2-sections')).send({
    section_number: s.number,
    section_title: s.title,
    section_key: s.key,
    category: s.category,
    content: s.content,
    // 'approved', not 'in_progress': eSTAR readiness counts only FINALIZED
    // content, and "a long draft is still a draft" — an explicitly in-progress
    // section is never substantive no matter how much text it holds. These
    // sections are authored complete, so they say so. The deliberately EMPTY
    // section below still proves its point: an approved status with a blank or
    // placeholder body is not substantive either, so the gap is not invented.
    status: 'approved',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.section;
}

describe('golden journey — device 510(k) eSTAR path', () => {
  it('runs the device 510(k) journey', async () => {
    // ── 1. Intake: program + PM-spine anchor in ONE transaction ─────────────
    const created = await R.step('intake-creates-the-510k-program-and-its-c1-anchor', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/c2c/projects')).send({
        name: 'GlucoTrack CGM 510(k)',
        productName: 'GlucoTrack CGM',
        programType: '510k',
        primaryAgency: 'FDA',
        indication: 'Continuous glucose monitoring in adults',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      programId = res.body.data.id;
      anchorProjectId = res.body.meta.projectAnchorId;
      return {
        programId,
        anchor: res.body.meta.projectAnchorId,
        anchorCreated: res.body.meta.projectAnchorCreated,
        documentId: res.body.meta.documentId,
        scaffoldedSections: res.body.meta.scaffoldedSections,
        submissionId: res.body.meta.submissionId ?? null,
      };
    });
    expect(created.anchorCreated).toBe(true);
    expect(anchorProjectId).toBeGreaterThan(0);
    // A device program files on the device pathway stores — intake must NOT
    // fabricate a canonical eCTD `submissions` spine for it.
    expect(created.submissionId).toBeNull();
    // The k510 × FDA rule pack scaffolded a real outline (nothing drafted).
    expect(created.scaffoldedSections).toBeGreaterThan(0);

    await R.step('the-anchor-row-is-real-and-resolves-through-the-c1-service', async () => {
      const rows = await jdb.pool.query(
        `SELECT id, organization_id, regulatory_program_id, type, client_workspace_id
           FROM projects WHERE id = $1`,
        [anchorProjectId],
      );
      expect(rows.rows).toHaveLength(1);
      const rec = rows.rows[0] as {
        organization_id: number;
        regulatory_program_id: string;
        type: string;
        client_workspace_id: number;
      };
      expect(rec.organization_id).toBe(ORG);
      expect(rec.regulatory_program_id).toBe(programId);
      expect(rec.type).toBe('regulatory');
      expect(rec.client_workspace_id).toBe(1);

      // The C1 resolver — the ONE reader of the anchor — finds it, org-scoped.
      const { resolveProgramProjectAnchor } = await import(
        '../../server/services/c2c/program-project-anchor'
      );
      const { requestDb } = await import('../../server/db/requestDb');
      const req = { dbClient: makeRequestDbClient(jdb.pglite) } as never;
      const resolved = await resolveProgramProjectAnchor(requestDb(req), {
        programId,
        orgId: ORG,
        context: 'journey:device-510k',
      });
      const crossTenant = await resolveProgramProjectAnchor(requestDb(req), {
        programId,
        orgId: OTHER_ORG,
        context: 'journey:device-510k-cross-tenant',
      });
      expect(resolved).toBe(anchorProjectId);
      expect(crossTenant).toBeNull();
      return { resolved, crossTenant, anchoredProject: anchorProjectId };
    });

    await R.step('the-intake-audit-row-is-chained-sealed-and-records-the-anchor', async () => {
      const rows = await jdb.pool.query(
        `SELECT action, target, sha256_chain, hmac_seal, new_values
           FROM audit_logs WHERE action = 'c2c.project.create' AND target = $1`,
        [`regulatory_program:${programId}`],
      );
      expect(rows.rows).toHaveLength(1);
      const rec = rows.rows[0] as {
        sha256_chain: string;
        hmac_seal: string | null;
        new_values: { project_anchor_id: number | null; project_anchor_created?: boolean };
      };
      expect(rec.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
      expect(rec.hmac_seal).toMatch(/^[0-9a-f]{64}$/);
      expect(rec.new_values.project_anchor_id).toBe(anchorProjectId);
      return { chained: true, sealed: true, anchorInAudit: rec.new_values.project_anchor_id };
    });

    // ── 2. KNOWN-BAD: intake refuses to GUESS a client workspace ────────────
    await R.expectBlocked('ambiguous-workspace-anchor-is-skipped-not-guessed', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/c2c/projects'),
      ).send({
        name: 'Other Tenant Device',
        productName: 'Other Device',
        programType: '510k',
        primaryAgency: 'FDA',
      });
      const meta = res.body?.meta ?? {};
      const audit = await jdb.pool.query(
        `SELECT new_values FROM audit_logs
          WHERE action = 'c2c.project.create' AND target = $1`,
        [`regulatory_program:${res.body?.data?.id}`],
      );
      const auditRow = audit.rows[0] as { new_values: { project_anchor_skipped: string | null } };
      return {
        // "Blocked" here means the anchor was NOT invented: the program is
        // created, the anchor is absent, and the reason is stated.
        blocked:
          res.status === 201 &&
          meta.projectAnchorId === null &&
          meta.projectAnchorSkipped === 'AMBIGUOUS_CLIENT_WORKSPACE' &&
          auditRow?.new_values?.project_anchor_skipped === 'AMBIGUOUS_CLIENT_WORKSPACE',
        status: res.status,
        skipped: meta.projectAnchorSkipped,
        detail: meta.projectAnchorDetail,
        recordedInAudit: auditRow?.new_values?.project_anchor_skipped ?? null,
      };
    });

    // ── 3. Author the dossier through the REAL section route ────────────────
    await R.step('author-510k-sections-into-cerv2_510k_sections', async () => {
      // An EMPTY section is authored first: the content→leaf adapter must NOT
      // count it as present (a gap is never invented).
      await authorSection({
        number: 'C2',
        title: 'Substantial Equivalence Discussion',
        key: 'se_discussion',
        category: 'substantial_equivalence',
        content: '   ',
      });
      const authored = [
        { number: 'A2', title: 'Cover Letter', key: 'cover_letter', category: 'cover_letter', content: 'Cover letter to CDRH for the GlucoTrack CGM 510(k).' },
        { number: 'A3', title: 'Indications for Use', key: 'indications_for_use', category: 'indications_for_use', content: 'The device is indicated for continuous glucose monitoring in adults.' },
        { number: 'B1', title: 'Device Description', key: 'device_description', category: 'device_description', content: 'A wearable sensor, transmitter and reader application.' },
        { number: 'E', title: 'Proposed Labeling', key: 'labeling', category: 'labeling', content: 'Instructions for use, warnings and precautions.' },
        { number: 'D3', title: 'Biocompatibility', key: 'biocompatibility', category: 'biocompatibility', content: 'ISO 10993-1 evaluation of the patient-contacting adhesive.' },
        { number: 'D1', title: 'Performance Testing', key: 'performance_testing', category: 'performance_testing', content: 'Bench accuracy testing against the reference method.' },
      ];
      for (const s of authored) await authorSection(s);
      const n = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM cerv2_510k_sections WHERE organization_id = $1`,
        [ORG],
      );
      return { sections: (n.rows[0] as { n: number }).n, authoredWithContent: authored.length };
    });

    // ── 4. Assembly reads REAL content: the empty section is a real gap ─────
    await R.step('assemble-names-the-missing-required-section-from-real-content', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/assemble')).send({
        pathway: '510k',
        variant: 'device',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      // The SE section exists as a row but carries no content, so it is not a
      // leaf — readiness reports it missing rather than inventing coverage.
      expect(res.body.estar.summary.missingRequired).toContain('substantial-equivalence');
      expect(res.body.blockers.join(' ')).toMatch(/required eSTAR section\(s\) missing/i);
      return {
        artifactKind: res.body.artifactKind,
        missingRequired: res.body.estar.summary.missingRequired,
        blockers: res.body.blockers,
      };
    });

    await R.step('authoring-the-missing-section-clears-exactly-that-gap', async () => {
      const [row] = (
        await jdb.pool.query(
          `SELECT id FROM cerv2_510k_sections WHERE organization_id = $1 AND section_key = 'se_discussion'`,
          [ORG],
        )
      ).rows as Array<{ id: number }>;
      const patched = await asPrincipal(ORG, USER)(
        request(app).patch(`/api/cerv2-sections/${row.id}`),
      ).send({
        content:
          'The subject device is substantially equivalent to predicate K123456; ' +
          'technological differences do not raise new questions of safety or effectiveness.',
        // Finishing the section is what closes the gap — writing into a section
        // that stays in progress does not, and should not.
        status: 'approved',
      });
      expect(patched.status, JSON.stringify(patched.body)).toBe(200);

      // Content alone does not make a section substantive: readiness counts a
      // required section as present only when it is APPROVED, so a dossier of
      // in-progress drafts is not a filing-complete dossier no matter how much
      // prose it carries. The journey therefore performs the approval — a
      // governed act with its own audit consequence — rather than asserting a
      // completeness the product is right to withhold from drafts.
      const drafted = (
        await jdb.pool.query(
          `SELECT id FROM cerv2_510k_sections WHERE organization_id = $1 ORDER BY id`,
          [ORG],
        )
      ).rows as Array<{ id: number }>;
      for (const section of drafted) {
        const approved = await asPrincipal(ORG, USER)(
          request(app).patch(`/api/cerv2-sections/${section.id}`),
        ).send({ status: 'approved' });
        expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      }

      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/assemble')).send({
        pathway: '510k',
        variant: 'device',
      });
      expect(res.status).toBe(200);
      expect(res.body.estar.summary.missingRequired).toEqual([]);
      return { approvedSections: drafted.length, missingRequired: res.body.estar.summary.missingRequired };
    });

    // ── 5. The honest artifactKind with a complete content set ──────────────
    const assembled = await R.step('assemble-reports-content-package-draft-not-official-estar', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/assemble')).send({
        pathway: '510k',
        variant: 'device',
        market: 'us',
      });
      expect(res.status).toBe(200);
      // The decisive honesty output: content exists, the official FDA template
      // does not, so only the loose draft package is producible.
      expect(res.body.artifactKind).toBe('content-package-draft');
      expect(res.body.canProduceOfficialEstar).toBe(false);
      expect(res.body.template.available).toBe(false);
      expect(res.body.template.requiredFileName).toBe('eSTAR-510k-non-ivd.pdf');
      expect(res.body.template.descriptor.version).toBe('unset');
      expect(res.body.validationReport.errors).toEqual(res.body.blockers);
      return {
        artifactKind: res.body.artifactKind,
        canProduceOfficialEstar: res.body.canProduceOfficialEstar,
        requiredTemplate: res.body.template.requiredFileName,
        templateAvailable: res.body.template.available,
        blockers: res.body.blockers,
      };
    });
    void assembled;

    // ── 5b. KNOWN-BAD: production + ESTAR_REQUIRE_TEMPLATE blocks outright ──
    // The route computes environment from NODE_ENV, so the production posture is
    // exercised on the same REAL deterministic engine rather than by mutating
    // process-wide state mid-journey.
    await R.expectBlocked('production-with-require-template-blocks-on-the-missing-template', async () => {
      const { assembleDeviceSubmission } = await import(
        '../../server/services/pathway-engines/device-assembly/assemble-device-submission'
      );
      const { loadDeviceContentLeaves } = await import(
        '../../server/services/pathway-engines/estar/estar-content-leaves'
      );
      const result = assembleDeviceSubmission({
        pathway: '510k',
        variant: 'device',
        leaves: await loadDeviceContentLeaves(ORG),
        presentTemplates: [],
        environment: 'production',
        requireTemplate: true,
      });
      const templateBlocker = result.blockers.find((b) => b.includes('eSTAR-510k-non-ivd.pdf'));
      return {
        blocked: !!templateBlocker && result.canProduceOfficialEstar === false,
        artifactKind: result.artifactKind,
        blocker: templateBlocker,
      };
    });

    // ── 6. /build: the draft ZIP + a governed, placed export consequence ────
    // The eSTAR route resolves a numeric anchor from fda_510k_projects, while the
    // artifact registry's FK points at projects.id — so the GA row is created
    // with the anchored project's id (see the observations for the hazard this
    // conflation carries).
    await R.step('seed-the-ga-device-project-row-on-the-anchored-pm-project', async () => {
      await jdb.pool.query(
        `INSERT INTO fda_510k_projects (id, organization_id, project_id, device_name)
         VALUES ($1, $2, $1, 'GlucoTrack CGM')`,
        [anchorProjectId, ORG],
      );
      deviceProjectId = anchorProjectId;
      return { deviceProjectId, anchorProjectId };
    });

    // 6a. Governed registry placement COMPLETES. This step was a known-bad: the
    //     writeback named `updated_at` on concept2cure_provenance_events and
    //     `created_at`/`updated_at` on regulatory_audit_logs — columns no
    //     lineage creates and no drizzle model declares — so every governed
    //     export that reached placement rolled back with 500
    //     GOVERNED_EXPORT_FAILED, on EVERY database. The column lists are now
    //     reconciled against the tables that actually exist, and this asserts
    //     the whole three-row writeback lands atomically.
    await R.step('governed-registry-placement-writes-artifact-version-and-provenance', async () => {
      const before = await jdb.pool.query(
        `SELECT (SELECT count(*)::int FROM concept2cure_artifacts) AS a,
                (SELECT count(*)::int FROM concept2cure_artifact_versions) AS v,
                (SELECT count(*)::int FROM concept2cure_provenance_events) AS p`,
      );
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/build')).send({
        meta: {
          id: 'K-JOURNEY-001',
          projectId: deviceProjectId,
          title: 'GlucoTrack CGM — 510(k) draft package',
        },
        useProjectContent: true,
      });
      const after = await jdb.pool.query(
        `SELECT (SELECT count(*)::int FROM concept2cure_artifacts) AS a,
                (SELECT count(*)::int FROM concept2cure_artifact_versions) AS v,
                (SELECT count(*)::int FROM concept2cure_provenance_events) AS p`,
      );
      const b = before.rows[0] as { a: number; v: number; p: number };
      const a = after.rows[0] as { a: number; v: number; p: number };

      // All three governed rows land together — artifact, its version, and the
      // provenance event. Asserted with `expect` (not folded into a boolean)
      // because this is a normal step: a throw here is a real failure, which is
      // exactly what it should be now that the path is supposed to work.
      expect(res.status).toBe(200);
      expect(a.a).toBe(b.a + 1);
      expect(a.v).toBe(b.v + 1);
      expect(a.p).toBe(b.p + 1);
      return {
        status: res.status,
        artifactId: res.body?.artifact_id ?? null,
        placementState: res.body?.placement_state ?? null,
        artifactsBefore: b.a,
        artifactsAfter: a.a,
        versionsAfter: a.v,
        provenanceAfter: a.p,
      };
    });

    // ── 6b/7. The UUID-program export is REGISTRY-PLACED. This step used to
    //     assert the opposite, and its own observation said why: the route
    //     imported resolveProgramProjectAnchor and never called it, so a
    //     governed export for a program whose C1 anchor demonstrably EXISTS
    //     (asserted in step 1) was still delivered audited-unplaced. The wiring
    //     has landed, so the anchored program now takes the governed path — and
    //     the delivered package is asserted exactly as before, because what the
    //     user receives must not change just because it got registered.
    await R.step('uuid-program-build-is-delivered-and-registry-placed', async () => {
      const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/build')).send({
        meta: { id: 'K-JOURNEY-001', ident: programId },
        useProjectContent: true,
      });
      const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      const zipBytes = Buffer.from(res.body?.downloadable_output_ref?.data ?? '', 'base64');
      const zipSha = createHash('sha256').update(zipBytes).digest('hex');

      // The delivered package: six FDA-named section PDFs rendered from the
      // org's REAL authored sections (not a template, not a placeholder).
      //
      // Computed as BOOLEANS folded into `blocked`, never as `expect` calls: a
      // throw inside expectBlocked is recorded as "blocked as expected", so an
      // assertion here would convert a real failure into a false pass.
      const EXPECTED_PACKAGE = [
        '01_CoverLetter.pdf',
        '02_510kSummary.pdf',
        '03_DeviceDescription.pdf',
        '04_SE_Discussion.pdf',
        '05_PerformanceTesting.pdf',
        '06_Labeling.pdf',
      ];
      let names: string[] = [];
      let everyEntryIsPdf = false;
      if (zipBytes.length > 0) {
        const zip = await JSZip.loadAsync(zipBytes);
        names = Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
        const heads = await Promise.all(
          names.map(async (n) =>
            (await zip.file(n)!.async('nodebuffer')).subarray(0, 5).toString('latin1'),
          ),
        );
        everyEntryIsPdf = heads.length > 0 && heads.every((head) => head === '%PDF-');
      }
      const packageMatches = JSON.stringify(names) === JSON.stringify(EXPECTED_PACKAGE);
      const audit = await jdb.pool.query(
        `SELECT new_values FROM audit_logs
          WHERE action = 'EXPORT_GENERATED' AND record_id = $1
          ORDER BY occurred_at DESC LIMIT 1`,
        [programId],
      );
      const auditRow = audit.rows[0] as
        | { new_values: { artifactRegistry: string; sha256: string; officialEstarPdf: boolean } }
        | undefined;
      // The export is governed and placed: one new artifact row, and the
      // response carries a real artifact id instead of the unplaced reason.
      expect(res.status).toBe(200);
      expect(res.body.governed).toBe(true);
      expect(res.body.artifact_id).toBeTruthy();
      expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n + 1);
      // The DELIVERED package is unchanged — still the six FDA-named section
      // PDFs rendered from the org's real authored sections. Registration must
      // not alter what the user actually receives.
      expect(packageMatches).toBe(true);
      expect(everyEntryIsPdf).toBe(true);
      return {
        status: res.status,
        governed: res.body.governed,
        artifactId: res.body.artifact_id,
        placementState: res.body.placement_state ?? null,
        packageFiles: names,
        everyEntryIsPdf,
        zipSha256: zipSha,
        artifactsBefore: (before.rows[0] as { n: number }).n,
        artifactsAfter: (after.rows[0] as { n: number }).n,
        anchorUsedForThisProgram: anchorProjectId,
        priorUnplacedAudit: auditRow?.new_values?.artifactRegistry ?? null,
      };
    });

    // ── 8. The official eSTAR refusal — the point of the journey ────────────
    await R.expectBlocked('official-estar-refuses-422-estar-not-producible', async () => {
      const artifactsBefore = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM concept2cure_artifacts`,
      );
      const auditBefore = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE table_name = 'estar_official_pdf'`,
      );
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/official')).send({
        meta: { id: 'K-JOURNEY-001', projectId: deviceProjectId },
        type: '510k',
        variant: 'device',
        data: { deviceName: 'GlucoTrack CGM', applicantName: 'Journey Devices Inc.' },
      });
      const artifactsAfter = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM concept2cure_artifacts`,
      );
      const auditAfter = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE table_name = 'estar_official_pdf'`,
      );
      const blockers: string[] = res.body?.blockers ?? [];
      return {
        blocked:
          res.status === 422 &&
          res.body.error === 'ESTAR_NOT_PRODUCIBLE' &&
          res.body.officialEstarPdf === false &&
          res.body.templateAvailable === false &&
          res.body.fieldMapPopulated === false &&
          blockers.some((b) => b.includes('eSTAR-510k-non-ivd.pdf')) &&
          blockers.some((b) => /field map/i.test(b)) &&
          // Nothing was produced, placed or audited as an official eSTAR.
          (artifactsBefore.rows[0] as { n: number }).n ===
            (artifactsAfter.rows[0] as { n: number }).n &&
          (auditBefore.rows[0] as { n: number }).n === (auditAfter.rows[0] as { n: number }).n,
        status: res.status,
        error: res.body?.error,
        descriptorId: res.body?.descriptorId,
        blockers,
      };
    });

    await R.step('the-readiness-probe-tells-the-ui-the-same-thing-without-producing-anything', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).get('/api/510k/estar/readiness?type=510k&variant=device'),
      );
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
      expect(res.body.officialEstarPdf).toBe(false);
      expect(res.body.blockers.length).toBeGreaterThan(0);
      return { ready: res.body.ready, blockers: res.body.blockers.length };
    });

    // ── 9. Tenant isolation on every export entry point ─────────────────────
    await R.expectBlocked('another-tenant-cannot-export-this-program', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/510k/estar/build'),
      ).send({ meta: { id: 'K-JOURNEY-001', ident: programId }, useProjectContent: true });
      return { blocked: res.status === 404, status: res.status, error: res.body?.error };
    });

    await R.expectBlocked('another-tenant-cannot-export-this-ga-device-project', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/510k/estar/official'),
      ).send({
        meta: { id: 'K-JOURNEY-001', projectId: deviceProjectId },
        type: '510k',
        variant: 'device',
        data: {},
      });
      return { blocked: res.status === 404, status: res.status, error: res.body?.error };
    });

    await R.expectBlocked('a-viewer-cannot-build-a-governed-export', async () => {
      const res = await asPrincipal(ORG, USER, 'viewer')(
        request(app).post('/api/510k/estar/build'),
      ).send({ meta: { id: 'K-JOURNEY-001', projectId: deviceProjectId }, useProjectContent: true });
      return { blocked: res.status === 403, status: res.status, error: res.body?.error };
    });

    R.observations.push(
      'RESOLVED — slice C1 is now read by the eSTAR export. This journey previously recorded that ' +
        'server/routes/510k-estar-routes.ts imported resolveProgramProjectAnchor and NEVER CALLED IT, so a ' +
        'governed 510(k) export for a program whose anchor demonstrably exists was still delivered ' +
        'audited-unplaced, and predicted that the "uuid-program-build" step is where the fix would surface. ' +
        'It did: resolveProjectAnchor now asks resolveProgramProjectAnchor for the numeric anchor before ' +
        'degrading, and the step asserts registry placement. The audited-unplaced path is retained and still ' +
        'covered by unit tests, for the genuinely unanchored case (a program created before C1, or an intake ' +
        'that skipped the anchor for one of its stated reasons) — absence of an anchor is a fact about the ' +
        'data, never a failure to look. The same wiring was applied to the CER export and the IND-form ' +
        'artifact route, which had copied the identical degradation.',
      'Two id spaces are conflated at the placement boundary: the eSTAR route resolves its numeric anchor ' +
        'from fda_510k_projects.id, while concept2cure_artifacts.project_id carries a FOREIGN KEY to ' +
        'projects.id (migrations/0000_sweet_joseph.sql:6488, applied in this journey). Placement therefore ' +
        'only succeeds where an fda_510k_projects row happens to share an id with a real projects row — ' +
        'which is what this journey seeds deliberately. Where they diverge the governed export fails at the ' +
        'registry, not at the gate.',
      'FOUND BY THIS JOURNEY, NOW FIXED — the governed artifact registry could not be written on ANY ' +
        'database. ' +
        'server/services/compute/artifactWriteback.ts INSERTs `updated_at` into ' +
        'concept2cure_provenance_events, and that column exists in NO lineage: not in ' +
        'migrations/0000_sweet_joseph.sql, not in db/migrations/20260311_concept2cure_provenance_events.sql, ' +
        'not in db/migrations/20260313_phase11_governed_workflow.sql, and NOT in shared/schema.ts — whose ' +
        'own comment states the table is append-only and deliberately carries no updated_at. The same ' +
        'function also names concept2cure_artifact_versions.updated_at and regulatory_audit_logs' +
        '.created_at/.updated_at, which the SQL lineage does not create either (this journey grants those ' +
        'from the drizzle-push shape so the failure lands on the un-createable one). Every governed export ' +
        'that reached placement — 510(k), CER and IND-form alike — rolled back with 500 ' +
        'GOVERNED_EXPORT_FAILED. Two different defects were tangled here and are fixed differently: the ' +
        'columns named by code but declared NOWHERE (concept2cure_provenance_events.updated_at, ' +
        'regulatory_audit_logs.created_at/.updated_at) were removed from the INSERTs — an append-only ' +
        'provenance row has no updated_at by design; the columns shared/schema.ts DOES declare while the SQL ' +
        'lineage never created them (concept2cure_artifact_versions.updated_at, ' +
        'cerv2_section_versions.updated_at) are created by ' +
        'migrations/20260817_reconcile_declared_updated_at_columns.sql, which this journey now loads as a ' +
        'REAL migration in place of the test-only grants it used to rely on. The step asserts placement ' +
        'completing — artifact, version and provenance rows landing together.',
      'FOUND BY THIS JOURNEY — shared/schema.ts declares cerv2_section_versions.updated_at and the ' +
        'section-create route INSERTs it, but no migration in either lineage creates that column, so ' +
        'POST /api/cerv2-sections answers 500 on a migration-provisioned database. Granted as test-only ' +
        'DDL here (see the beforeAll note) because authoring is a precondition of this journey, not its subject.',
      'The device intake creates no canonical `submissions` row, and that is correct: DRUG_APPLICATION_TYPES ' +
        'maps only concrete drug/biologic application types, so a 510(k) program gets its own pathway stores ' +
        'instead of a fabricated eCTD filing identity. Asserted as an honest absence in step 1.',
    );
    R.limitations.push(
      'The official FDA eSTAR template is a licensed procurement artifact and is not vendored ' +
        '(assets/estar-templates/ holds only its README), and no canonical→AcroForm field map is populated. ' +
        'The official-eSTAR production path therefore CANNOT be exercised end-to-end here — its refusal is ' +
        'what this journey asserts. When the template + verified map land, POST /official returns 200 and the ' +
        '"official-estar-refuses" step is the one that must be revisited.',
      'Section PDFs are the PDFKit text fallback: puppeteer is not installed in this environment, so ' +
        'renderHtmlToPdf takes its documented fallback path. Layout fidelity (and PDF/A conformance) is a ' +
        'separate gate and is not asserted here — only that real authored content is rendered into real PDF bytes.',
      'authMiddleware is replaced by a verified-principal middleware; JWT issuance/verification is Journey A ' +
        '(ind-authoring) — every authorization decision under test still runs in the real routers.',
      'Entitlements ship dark (ENTITLEMENTS_ENFORCE defaults to off), so requireEntitlement is a no-op on the ' +
        'three producing routes here; the entitlement gate itself is not exercised by this journey.',
      'Transmission to CDRH (the eSTAR upload) is not exercised — it needs a live FDA gateway account.',
      "auditService's SECOND sink (the estate-wide audit.tamper_proof_log schema) is not provisioned in " +
        'this journey database, so every audited action logs one non-fatal tamper-proof-write failure. The ' +
        'chained audit_logs row — the queryable Part 11 record this journey asserts — is written first and ' +
        'independently of it.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(6);
  }, T);
});
