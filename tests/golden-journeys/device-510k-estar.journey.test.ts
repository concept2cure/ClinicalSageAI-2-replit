/**
 * Golden journey — DEVICE 510(k): program intake → authored sections → eSTAR
 * assembly → draft content package → the official FDA eSTAR, filled from the
 * program's own governed records.
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
 *   4. /assemble reports artifactKind 'official-estar' — content is complete
 *      AND the official nIVD eSTAR v7.0 template is vendored with a verified
 *      field map, so canProduceOfficialEstar is true.
 *   5. In PRODUCTION with ESTAR_REQUIRE_TEMPLATE, the same content with NO
 *      template present carries a hard blocker naming the template file (the
 *      fail-closed posture the staging default reports without blocking).
 *   6. /build produces the draft ZIP (six FDA-named section PDFs, rendered from
 *      the authored sections) and a governed export consequence whose persisted
 *      metadata is labelled officialEstarPdf:false.
 *   7. The same /build against the program's UUID is delivered AND registry-
 *      placed through the C1 anchor (see the observations for the history:
 *      this step used to assert audited-unplaced delivery).
 *   8. /official-fields previews, per mapped field, the governed value and its
 *      store.column source — the program's product_name, the anchor's client
 *      workspace — and null for what the platform does not hold. Then
 *      /official with useProgramData writes exactly those values into the
 *      REAL FDA eSTAR (read back at their XFA SOM paths), governed winning over
 *      a colliding request value, and answers with a fieldReport that says what
 *      was filled, from where, what was left blank, and which request keys were
 *      ignored. The provenance is persisted on the registry artifact.
 *   8b. With the template drop-point EMPTY the same request REFUSES 422
 *      ESTAR_NOT_PRODUCIBLE naming the template file, and writes NO artifact
 *      and NO EXPORT_GENERATED row in either audit sink: regulatory_audit_logs
 *      (where the governed registry writeback logs an anchored program's
 *      export — step 8 proves that counter moves by exactly one on the 200)
 *      and audit_logs (where the audited-unplaced path logs).
 *   8c. Every administrative field has a governed home (WO-8 Phase 3): a
 *      device-level fact set through PUT /api/510k/device/profile
 *      (regulatory_programs) and an org-level correspondent / Declaration of
 *      Conformity fact set through PUT /api/510k/estar/registration
 *      (estar_registrations) are previewed with their store.column source,
 *      written into the REAL eSTAR at their SOM paths with NO request data,
 *      and persisted in fieldSources — while a fact still unset is reported
 *      blank with its declaredSource naming where it is set. Both governed
 *      writes are editor+ (a viewer in the same org is refused and the row is
 *      untouched) and audited: DEVICE_PROFILE_UPDATED names the real actor, the
 *      program and the fields changed.
 *   9. Tenant isolation: another org cannot export, or preview, this org's program.
 *
 * Output: tests/golden-journeys/__reports__/device-510k-estar.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readXfaDatasetsValues } from '../../server/services/forms/fill-official-pdf';
import { ESTAR_FIELD_MAPS } from '../../server/services/pathway-engines/estar/estar-field-map';
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
  'Device 510(k) — program intake to the official FDA eSTAR',
  'The device path over HTTP against real canonical DDL: intake writes the program and its C1 PM-spine anchor in one transaction (and refuses to guess an ambiguous workspace), authored cerv2_510k_sections drive eSTAR readiness, /assemble reports the honest artifactKind, /build emits a draft ZIP labelled officialEstarPdf:false with a governed export consequence, the UUID-program export is registry-placed, /official-fields previews each mapped field with its governed source, /official fills the REAL vendored FDA eSTAR from the program\'s own governed records (governed wins, request fills gaps, blanks reported) and persists the provenance, and the same request refuses 422 ESTAR_NOT_PRODUCIBLE the moment the template is not vendored.',
  [
    'migrations/0000_sweet_joseph.sql (extractTableDdl)',
    'migrations/20260527_mutation_primitives.sql',
    'migrations/20260609_audit_hmac_seal.sql',
    'migrations/20260524_program_workbench_schema.sql',
    'migrations/20260528_phase9_document_schema.sql',
    'migrations/20260814_projects_regulatory_program_anchor.sql',
    'migrations/20260817_reconcile_declared_updated_at_columns.sql',
    'migrations/20260730_estar_registration.sql',
    'migrations/20260903_regulatory_programs_estar_device_fields.sql',
    'migrations/20260903_estar_registration_correspondent.sql',
    'migrations/20260904_estar_registration_declaration_company_name.sql',
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

/** The tables the journey's first migration expects to already exist. */
const BASELINE_TABLES = [
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
];

beforeAll(async () => {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', BASELINE_TABLES);

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
      // The lineage gate on the kit's PATCH (ledger L157) writes the section's
      // span lineage in the same transaction as its content; without this
      // store the route fails closed and the journey's authoring step 500s.
      'db/migrations/20260803_document_span_lineage.sql',
      // The org's eSTAR registration row — the governed home of the official
      // form's correspondent / Declaration of Conformity facts (step 8c).
      'migrations/20260730_estar_registration.sql',
      // WO-8 Phase 3: the device-level eSTAR facts on regulatory_programs and
      // the org-level ones on estar_registrations. Loaded as REAL migrations
      // (both in C2C_MIGRATION_FILES) so the journey proves the deploy path
      // provides every column the projection reads. Order matters: the
      // registration ALTER needs the table above.
      'migrations/20260903_regulatory_programs_estar_device_fields.sql',
      'migrations/20260903_estar_registration_correspondent.sql',
      // The Declaration of Conformity NAME joins its address on this row, so
      // the DoC block names one legal entity. Without it the projection's
      // SELECT asks for a column the journey's database does not have, and the
      // harness refuses the run rather than letting it prove less than it says.
      'migrations/20260904_estar_registration_declaration_company_name.sql',
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
  // The device-profile intake — the writer of the program's eSTAR facts (step 8c).
  const { default: deviceRouter } = await import('../../server/routes/510k-device-routes');

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
  app.use('/api/510k/device', deviceRouter);
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
        /*
         * The seven device questions, answered at intake exactly as the
         * new-project wizard sends them. They are not decoration: each one
         * decides whether a statutory eSTAR section is owed, and until they are
         * answered `mapToEstar` reports every conditional section — sterilization,
         * software, cybersecurity, CLIA waiver, implant labelling, combination
         * product, financial disclosure — as of UNDETERMINED applicability. A
         * package with undetermined sections is honestly not producible, so a
         * journey that skipped these questions could never reach
         * artifactKind 'official-estar' no matter how complete its content was.
         *
         * This CGM is a non-sterile, non-implantable software device that
         * submits clinical data, so three of the seven are answered yes and the
         * rest resolve to not-applicable.
         */
        deviceClassification: {
          /* Flags ONLY. The classification facts (product code, regulation
             number, device class) are asserted ABSENT further down, where the
             governed-source preview proves a blank field still names its home —
             supplying them here would quietly satisfy those rows and retire the
             assertion this journey exists to make. */
          flags: ['softwareAiMl', 'cyberDevice', 'clinicalData'],
        },
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
        // The five statutory administrative / technical slots W1-5 made
        // always-required (estar-mapper.ts): each category is a documentType
        // its slot's `match` rule names (dt()), so readiness counts it from the
        // content. The titles are deliberately NEUTRAL — none satisfies any
        // slot's title alternate (ti()) — so only the documentType rule can
        // satisfy the slot: a regression in that path surfaces here as a
        // missing required section instead of being masked by a title match.
        { number: 'A1', title: 'Section A1', key: 'cdrh_cover_sheet', category: 'cdrh_cover_sheet', content: 'Form FDA 3514 completed for the GlucoTrack CGM traditional 510(k).' },
        { number: 'A1a', title: 'Section A2', key: 'user_fee_cover_sheet', category: 'user_fee', content: 'Form FDA 3601 with the MDUFA payment identification number for this submission.' },
        { number: 'A4', title: 'Section A3', key: 'truthful_accurate_statement', category: 'truthful_accurate', content: 'Truthful and Accurate Statement per 21 CFR 807.87(k), signed by the responsible official.' },
        { number: 'A5', title: 'Section A4', key: 'k510_summary', category: '510k_summary', content: '510(k) Summary per 21 CFR 807.92 describing the device, its indications and the predicate comparison.' },
        { number: 'D4', title: 'Section A5', key: 'risk_management', category: 'risk_management', content: 'ISO 14971 risk management file: hazard analysis, risk controls and residual risk acceptability.' },
        /*
         * The three sections the intake ANSWERS make required. This device was
         * declared software, cyber-connected and clinical-data-bearing at
         * intake, so FDA's premarket software guidance, FD&C Act §524B and
         * 21 CFR Part 54 each owe a section. Before the device flags were read
         * back these three sat in `undetermined` and the package could never be
         * called producible; now they are REQUIRED, and a required section that
         * is not authored is honestly missing. Authoring them is what closes
         * the loop the journey exists to prove: the client answered, the answer
         * decided the required set, the content satisfied it.
         *
         * Neutral titles again — only the documentType rule can satisfy these
         * slots, so a regression in that path surfaces here.
         */
        { number: 'D5', title: 'Section A6', key: 'software', category: 'software', content: 'Documentation Level assessment, software architecture, SRS/SDS, verification and validation records, and the SBOM for the GlucoTrack reader application.' },
        { number: 'D6', title: 'Section A7', key: 'cybersecurity', category: 'cybersecurity', content: 'Threat model, security architecture views, vulnerability management plan and the postmarket update process for the connected transmitter.' },
        { number: 'D7', title: 'Section A8', key: 'financial_disclosure', category: 'financial_disclosure', content: 'Form FDA 3454 certification for each clinical investigator in the accuracy study, with disclosure statements where certification was not available.' },
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
    const assembled = await R.step('assemble-reports-official-estar-producible-from-real-content', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/assemble')).send({
        pathway: '510k',
        variant: 'device',
        market: 'us',
        /* Program-scoped, because the verdict below is about THIS filing. The
           device flags answered at intake live on the program, so an org-wide
           call cannot resolve which conditional sections are owed and honestly
           reports the package as a draft. */
        programId,
      });
      expect(res.status).toBe(200);
      // The decisive honesty output: every required section is authored AND the
      // official nIVD eSTAR v7.0 is vendored with a verified field map, so the
      // real official eSTAR is producible — asserted from the same deterministic
      // engine that used to (rightly) report 'content-package-draft'.
      expect(res.body.artifactKind).toBe('official-estar');
      expect(res.body.canProduceOfficialEstar).toBe(true);
      expect(res.body.template.available).toBe(true);
      expect(res.body.template.requiredFileName).toBe('eSTAR-510k-non-ivd.pdf');
      expect(res.body.template.descriptor.version).toBe('7.0');
      expect(res.body.validationReport.errors).toEqual(res.body.blockers);
      return {
        artifactKind: res.body.artifactKind,
        canProduceOfficialEstar: res.body.canProduceOfficialEstar,
        requiredTemplate: res.body.template.requiredFileName,
        templateAvailable: res.body.template.available,
        templateVersion: res.body.template.descriptor.version,
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

      // The persisted metadata on the placed artifact says what this is: a
      // draft ZIP, NOT the official eSTAR (officialEstarPdf:false, ESTAR-06) —
      // read back from the registry row the response names, so no downstream
      // surface can present the draft package as a submittable eSTAR.
      const stored = await jdb.pool.query(
        `SELECT metadata FROM concept2cure_artifacts WHERE organization_id = $1 AND artifact_id = $2`,
        [ORG, res.body.artifact_id],
      );
      expect(stored.rows).toHaveLength(1);
      const raw = (stored.rows[0] as { metadata: unknown }).metadata;
      const metadata = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        officialEstarPdf: boolean;
        package: string;
      };
      expect(metadata.officialEstarPdf).toBe(false);
      expect(metadata.package).toBe('content package draft (not an eSTAR)');
      return {
        status: res.status,
        artifactId: res.body?.artifact_id ?? null,
        placementState: res.body?.placement_state ?? null,
        persistedOfficialEstarPdf: metadata.officialEstarPdf,
        persistedPackage: metadata.package,
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

    // ── 8. The official eSTAR — the point of the journey ────────────────────
    // What the form WILL say, before anything is produced: one row per mapped
    // field, its governed value and the store.column it came from. The
    // program's own product_name and the anchor project's client workspace are
    // the sources; the keys the platform does not hold are null, not guessed.
    const preview = await R.step('official-fields-previews-each-mapped-field-with-its-governed-source', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).get(`/api/510k/estar/official-fields?ident=${programId}&type=510k&variant=device`),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const byKey = Object.fromEntries(
        (res.body.fields as Array<{ key: string; value: string | null; source: string | null; declaredSource: string | null }>).map((f) => [f.key, f]),
      );
      expect(res.body.mappedCount).toBe(Object.keys(ESTAR_FIELD_MAPS['510k-device']).length);
      expect(byKey.deviceTradeName).toMatchObject({ value: 'GlucoTrack CGM', source: 'regulatory_programs.product_name' });
      expect(byKey.declarationDeviceTradeName).toMatchObject({ value: 'GlucoTrack CGM', source: 'regulatory_programs.product_name' });
      expect(byKey.applicantCompanyName).toMatchObject({ value: 'Journey Workspace', source: 'client_workspaces.name' });
      expect(byKey.declarationCompanyName).toMatchObject({ value: 'Journey Workspace', source: 'client_workspaces.name' });
      // No contact on the workspace, no regulation number on the program or
      // the GA row, no predicate on the program, no common name yet: absent,
      // never invented — but every blank row names the governed home where
      // it IS set, so the surface can point there instead of offering a value.
      for (const k of ['applicantContactEmail', 'regulationNumber', 'predicateSubmissionNumber', 'deviceCommonName']) {
        expect(byKey[k], k).toMatchObject({ value: null, source: null });
        expect(byKey[k].declaredSource, `${k} names its home`).toMatch(/^[a-z_0-9]+\.[a-zA-Z_0-9[\].]+$/);
      }
      expect(byKey.deviceCommonName.declaredSource).toBe('regulatory_programs.common_name');
      expect(byKey.correspondentCompanyName).toMatchObject({ value: null, source: null, declaredSource: 'estar_registrations.correspondent_company_name' });
      // Since WO-8 Phase 3 no mapped key is user-supplied-only.
      expect((res.body.fields as Array<{ declaredSource: string | null }>).filter((f) => f.declaredSource === null)).toEqual([]);
      expect(res.body.sourcedCount).toBe(4);
      return {
        mappedCount: res.body.mappedCount,
        sourcedCount: res.body.sourcedCount,
        sources: Object.fromEntries(
          Object.values(byKey).filter((f) => f.source).map((f) => [f.key, f.source]),
        ),
      };
    });
    void preview;

    const official = await R.step('official-estar-is-filled-from-governed-records-with-a-field-report', async () => {
      const artifactsBefore = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      // The governed registry writeback logs EXPORT_GENERATED in
      // regulatory_audit_logs (server/services/compute/artifactWriteback.ts) —
      // NOT in audit_logs, which is the audited-unplaced path's sink. This
      // counter is the one step 8b's "no audit row" guard reads, so its moving
      // by exactly one here is what makes that guard live rather than vacuous.
      const exportAuditBefore = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM regulatory_audit_logs
          WHERE organization_id = $1 AND action = 'EXPORT_GENERATED'`,
        [ORG],
      );
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/official')).send({
        meta: { id: 'K-JOURNEY-001', projectId: deviceProjectId, title: 'GlucoTrack CGM — official eSTAR' },
        type: '510k',
        variant: 'device',
        useProgramData: true,
        // deviceCommonName fills a gap the platform does not hold; the
        // deviceTradeName the client typed collides with the governed value
        // and must NOT be written.
        data: { deviceCommonName: 'Continuous glucose monitoring system', deviceTradeName: 'Name the client typed' },
      });
      const artifactsAfter = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      const exportAuditAfter = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM regulatory_audit_logs
          WHERE organization_id = $1 AND action = 'EXPORT_GENERATED'`,
        [ORG],
      );

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.governed).toBe(true);
      expect(res.body.artifact_id).toBeTruthy();
      expect((artifactsAfter.rows[0] as { n: number }).n).toBe((artifactsBefore.rows[0] as { n: number }).n + 1);
      // Exactly one EXPORT_GENERATED row landed in the governed sink.
      expect((exportAuditAfter.rows[0] as { n: number }).n).toBe((exportAuditBefore.rows[0] as { n: number }).n + 1);

      const report = res.body.fieldReport;
      expect(report.mappedCount).toBe(Object.keys(ESTAR_FIELD_MAPS['510k-device']).length);
      expect(report.filledCount).toBe(5);
      expect(report.blankCount).toBe(report.mappedCount - 5);
      const fieldByKey = Object.fromEntries(
        (report.fields as Array<{ key: string; filled: boolean; source: string | null }>).map((f) => [f.key, f]),
      );
      expect(fieldByKey.deviceTradeName).toMatchObject({ filled: true, source: 'regulatory_programs.product_name' });
      expect(fieldByKey.applicantCompanyName).toMatchObject({ filled: true, source: 'client_workspaces.name' });
      expect(fieldByKey.deviceCommonName).toMatchObject({ filled: true, source: 'request' });
      expect(fieldByKey.regulationNumber).toMatchObject({ filled: false, source: null });
      expect(report.blankKeys).toContain('regulationNumber');
      expect(report.ignoredRequestKeys).toEqual(['deviceTradeName']);

      // The delivered file is the REAL FDA form with the values at their XFA
      // SOM paths — the governed product name, not what the client typed.
      const pdf = Buffer.from(res.body.downloadable_output_ref?.data ?? '', 'base64');
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const map = ESTAR_FIELD_MAPS['510k-device'];
      const back = await readXfaDatasetsValues(pdf, [
        map.deviceTradeName.xfaSomPath!,
        map.deviceCommonName.xfaSomPath!,
        map.applicantCompanyName.xfaSomPath!,
        map.regulationNumber.xfaSomPath!,
      ]);
      expect(back[map.deviceTradeName.xfaSomPath!]).toBe('GlucoTrack CGM');
      expect(back[map.deviceCommonName.xfaSomPath!]).toBe('Continuous glucose monitoring system');
      expect(back[map.applicantCompanyName.xfaSomPath!]).toBe('Journey Workspace');
      expect(back[map.regulationNumber.xfaSomPath!] ?? '').toBe('');

      // The provenance travelled into the governed registry row.
      const stored = await jdb.pool.query(
        `SELECT metadata FROM concept2cure_artifacts WHERE organization_id = $1 ORDER BY id DESC LIMIT 1`,
        [ORG],
      );
      const raw = (stored.rows[0] as { metadata: unknown }).metadata;
      const metadata = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        officialEstarPdf: boolean;
        fieldSources: Record<string, string>;
      };
      expect(metadata.officialEstarPdf).toBe(true);
      expect(metadata.fieldSources.deviceTradeName).toBe('regulatory_programs.product_name');
      expect(metadata.fieldSources.deviceCommonName).toBe('request');
      return {
        status: res.status,
        artifactId: res.body.artifact_id,
        filledCount: report.filledCount,
        blankCount: report.blankCount,
        blankKeys: report.blankKeys,
        ignoredRequestKeys: report.ignoredRequestKeys,
        fieldSources: metadata.fieldSources,
        exportAuditRowsAdded:
          (exportAuditAfter.rows[0] as { n: number }).n - (exportAuditBefore.rows[0] as { n: number }).n,
        exportAuditSink: 'regulatory_audit_logs',
        pdfSha256: createHash('sha256').update(pdf).digest('hex'),
      };
    });
    void official;

    // ── 8c. Every administrative field has a governed home (WO-8 Phase 3) ──
    // The keys step 8 reported blank are not user-supplied-only any more. A
    // device-level fact is set on the program through the device-profile
    // intake, an org-level fact on the eSTAR registration, and both reach the
    // official form at their SOM paths with store.column provenance — with NO
    // request data at all this time. deviceCommonName is deliberately left
    // unset so the "still blank, home named" posture is asserted on a real row.
    const governedHomes = await R.step('device-profile-and-registration-facts-reach-the-official-estar', async () => {
      // The device profile is a governed FDA-submission write: editor+ only.
      // A viewer in the SAME org is refused and the row is untouched.
      const refused = await asPrincipal(ORG, USER, 'viewer')(
        request(app).put(`/api/510k/device/profile?ident=${programId}`),
      ).send({ classificationName: 'Set by a read-only viewer' });
      expect(refused.status, JSON.stringify(refused.body)).toBe(403);
      const untouched = await jdb.pool.query(
        `SELECT classification_name FROM regulatory_programs WHERE id = $1`,
        [programId],
      );
      expect((untouched.rows[0] as { classification_name: string | null }).classification_name).toBeNull();

      const profile = await asPrincipal(ORG, USER)(
        request(app).put(`/api/510k/device/profile?ident=${programId}`),
      ).send({ classificationName: '  Continuous glucose monitor system ', regulationNumber: '21 CFR 862.1355' });
      expect(profile.status, JSON.stringify(profile.body)).toBe(200);
      // Trimmed on the way in; the response is the fresh row.
      expect(profile.body.profile.classificationName).toBe('Continuous glucose monitor system');
      expect(profile.body.profile.regulationNumber).toBe('21 CFR 862.1355');
      expect(profile.body.profile.commonName).toBeNull();
      // ...and it is audited: WHO set the device facts that reach the filed
      // form, and WHICH ones — one row, no row for the refused viewer write.
      const profileAudit = await jdb.pool.query(
        `SELECT user_id, record_id, new_values FROM audit_logs WHERE action = 'DEVICE_PROFILE_UPDATED'`,
      );
      expect(profileAudit.rows).toHaveLength(1);
      const auditRow = profileAudit.rows[0] as { user_id: number; record_id: string; new_values: unknown };
      expect(Number(auditRow.user_id)).toBe(USER);
      expect(auditRow.record_id).toBe(programId);
      const auditDetails =
        typeof auditRow.new_values === 'string' ? JSON.parse(auditRow.new_values) : auditRow.new_values;
      expect((auditDetails as { fields: string[] }).fields).toEqual(['classificationName', 'regulationNumber']);

      // Both halves of the Declaration of Conformity are set on the one
      // registration row: the address is projected only when the NAME came off
      // that same row (an address alone would otherwise land beside the client
      // workspace's name — two legal entities on one signed declaration).
      const reg = await asPrincipal(ORG, USER)(request(app).put('/api/510k/estar/registration')).send({
        correspondentCompanyName: 'Journey Regulatory Partners',
        declarationCompanyName: 'Journey Declaring Entity, Inc.',
        declarationCompanyAddress: '1 Journey Way, Boston, MA 02110',
      });
      expect(reg.status, JSON.stringify(reg.body)).toBe(200);
      expect(reg.body.registration.correspondentCompanyName).toBe('Journey Regulatory Partners');
      expect(reg.body.registration.declarationCompanyName).toBe('Journey Declaring Entity, Inc.');
      expect(reg.body.registration.declarationCompanyAddress).toBe('1 Journey Way, Boston, MA 02110');
      // The registration write is audited like every other change to the row.
      const regAudit = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ESTAR_REGISTRATION_CREATED'`,
      );
      expect((regAudit.rows[0] as { n: number }).n).toBe(1);

      // The preview now sources both, naming the store.column each came from.
      const preview = await asPrincipal(ORG, USER)(
        request(app).get(`/api/510k/estar/official-fields?ident=${programId}&type=510k&variant=device`),
      );
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      const previewByKey = Object.fromEntries(
        (preview.body.fields as Array<{ key: string; value: string | null; source: string | null; declaredSource: string | null }>).map((f) => [f.key, f]),
      );
      expect(previewByKey.deviceClassificationName).toEqual(
        expect.objectContaining({
          value: 'Continuous glucose monitor system',
          source: 'regulatory_programs.classification_name',
          declaredSource: 'regulatory_programs.classification_name',
        }),
      );
      expect(previewByKey.regulationNumber).toMatchObject({ value: '21 CFR 862.1355', source: 'regulatory_programs.regulation_number' });
      expect(previewByKey.correspondentCompanyName).toMatchObject({
        value: 'Journey Regulatory Partners',
        source: 'estar_registrations.correspondent_company_name',
        declaredSource: 'estar_registrations.correspondent_company_name',
      });
      expect(previewByKey.declarationCompanyName).toMatchObject({ value: 'Journey Declaring Entity, Inc.', source: 'estar_registrations.declaration_company_name' });
      expect(previewByKey.declarationCompanyAddress).toMatchObject({ value: '1 Journey Way, Boston, MA 02110', source: 'estar_registrations.declaration_company_address' });
      // Still unset: blank, and its home is named.
      expect(previewByKey.deviceCommonName).toMatchObject({ value: null, source: null, declaredSource: 'regulatory_programs.common_name' });
      expect(preview.body.sourcedCount).toBe(8);

      // The official form, from governed records only.
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/official')).send({
        meta: { id: 'K-JOURNEY-001', projectId: deviceProjectId, title: 'GlucoTrack CGM — official eSTAR (Phase 3)' },
        type: '510k',
        variant: 'device',
        useProgramData: true,
        data: {},
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const report = res.body.fieldReport;
      expect(report.filledCount).toBe(8);
      expect(report.ignoredRequestKeys).toEqual([]);
      const fieldByKey = Object.fromEntries(
        (report.fields as Array<{ key: string; filled: boolean; source: string | null; declaredSource: string | null }>).map((f) => [f.key, f]),
      );
      expect(fieldByKey.deviceClassificationName).toMatchObject({ filled: true, source: 'regulatory_programs.classification_name' });
      expect(fieldByKey.correspondentCompanyName).toMatchObject({ filled: true, source: 'estar_registrations.correspondent_company_name' });
      expect(fieldByKey.deviceCommonName).toMatchObject({ filled: false, source: null, declaredSource: 'regulatory_programs.common_name' });

      const pdf = Buffer.from(res.body.downloadable_output_ref?.data ?? '', 'base64');
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const map = ESTAR_FIELD_MAPS['510k-device'];
      const back = await readXfaDatasetsValues(pdf, [
        map.deviceClassificationName.xfaSomPath!,
        map.regulationNumber.xfaSomPath!,
        map.correspondentCompanyName.xfaSomPath!,
        map.declarationCompanyName.xfaSomPath!,
        map.declarationCompanyAddress.xfaSomPath!,
        map.deviceCommonName.xfaSomPath!,
      ]);
      expect(back[map.deviceClassificationName.xfaSomPath!]).toBe('Continuous glucose monitor system');
      expect(back[map.regulationNumber.xfaSomPath!]).toBe('21 CFR 862.1355');
      expect(back[map.correspondentCompanyName.xfaSomPath!]).toBe('Journey Regulatory Partners');
      expect(back[map.declarationCompanyName.xfaSomPath!]).toBe('Journey Declaring Entity, Inc.');
      expect(back[map.declarationCompanyAddress.xfaSomPath!]).toBe('1 Journey Way, Boston, MA 02110');
      expect(back[map.deviceCommonName.xfaSomPath!] ?? '').toBe('');

      // The provenance of both homes travelled into the governed registry row.
      const stored = await jdb.pool.query(
        `SELECT metadata FROM concept2cure_artifacts WHERE organization_id = $1 ORDER BY id DESC LIMIT 1`,
        [ORG],
      );
      const raw = (stored.rows[0] as { metadata: unknown }).metadata;
      const metadata = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { fieldSources: Record<string, string> };
      expect(metadata.fieldSources.deviceClassificationName).toBe('regulatory_programs.classification_name');
      expect(metadata.fieldSources.regulationNumber).toBe('regulatory_programs.regulation_number');
      expect(metadata.fieldSources.correspondentCompanyName).toBe('estar_registrations.correspondent_company_name');
      expect(metadata.fieldSources.declarationCompanyAddress).toBe('estar_registrations.declaration_company_address');
      expect(metadata.fieldSources).not.toHaveProperty('deviceCommonName');
      return {
        status: res.status,
        artifactId: res.body.artifact_id,
        filledCount: report.filledCount,
        blankCount: report.blankCount,
        fieldSources: metadata.fieldSources,
        stillBlankWithHome: { key: 'deviceCommonName', declaredSource: fieldByKey.deviceCommonName.declaredSource },
        pdfSha256: createHash('sha256').update(pdf).digest('hex'),
      };
    });
    void governedHomes;

    // ── 8b. KNOWN-BAD: the same request with NO template vendored ──────────
    // The drop-point is pointed at an empty directory for this one call and
    // restored after, so the refusal is asserted on the same real route.
    await R.expectBlocked('official-estar-refuses-422-when-the-template-is-not-vendored', async () => {
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'journey-estar-empty-'));
      const priorDir = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = emptyDir;
      // BOTH export audit sinks. This program has a numeric anchor, so a
      // successful /official takes the governed branch, whose writeback logs
      // EXPORT_GENERATED in regulatory_audit_logs (step 8 proves that counter
      // moves on the 200); audit_logs is where the audited-unplaced branch
      // logs. Counting only audit_logs here was vacuous for this program.
      const exportAuditRows = async () => {
        const [governed, unplaced] = await Promise.all([
          jdb.pool.query(
            `SELECT count(*)::int AS n FROM regulatory_audit_logs
              WHERE organization_id = $1 AND action = 'EXPORT_GENERATED'`,
            [ORG],
          ),
          jdb.pool.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'EXPORT_GENERATED'`),
        ]);
        return {
          regulatory_audit_logs: (governed.rows[0] as { n: number }).n,
          audit_logs: (unplaced.rows[0] as { n: number }).n,
        };
      };
      try {
        const artifactsBefore = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
        const auditBefore = await exportAuditRows();
        const res = await asPrincipal(ORG, USER)(request(app).post('/api/510k/estar/official')).send({
          meta: { id: 'K-JOURNEY-001', projectId: deviceProjectId },
          type: '510k',
          variant: 'device',
          useProgramData: true,
          data: {},
        });
        const artifactsAfter = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
        const auditAfter = await exportAuditRows();
        const blockers: string[] = res.body?.blockers ?? [];
        return {
          blocked:
            res.status === 422 &&
            res.body.error === 'ESTAR_NOT_PRODUCIBLE' &&
            res.body.officialEstarPdf === false &&
            res.body.templateAvailable === false &&
            // The map IS populated now — only the template is missing here.
            res.body.fieldMapPopulated === true &&
            blockers.some((b) => b.includes('eSTAR-510k-non-ivd.pdf')) &&
            // Nothing was produced, placed or audited as an official eSTAR —
            // in either sink.
            (artifactsBefore.rows[0] as { n: number }).n === (artifactsAfter.rows[0] as { n: number }).n &&
            auditBefore.regulatory_audit_logs === auditAfter.regulatory_audit_logs &&
            auditBefore.audit_logs === auditAfter.audit_logs,
          status: res.status,
          error: res.body?.error,
          descriptorId: res.body?.descriptorId,
          blockers,
          exportAuditRowsBefore: auditBefore,
          exportAuditRowsAfter: auditAfter,
        };
      } finally {
        if (priorDir === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
        else process.env.ESTAR_TEMPLATE_DIR = priorDir;
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    });

    await R.step('the-readiness-probe-tells-the-ui-the-same-thing-without-producing-anything', async () => {
      const artifactsBefore = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      const res = await asPrincipal(ORG, USER)(
        request(app).get('/api/510k/estar/readiness?type=510k&variant=device'),
      );
      const artifactsAfter = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.officialEstarPdf).toBe(true);
      expect(res.body.templateAvailable).toBe(true);
      expect(res.body.fieldMapPopulated).toBe(true);
      expect(res.body.blockers).toEqual([]);
      expect((artifactsAfter.rows[0] as { n: number }).n).toBe((artifactsBefore.rows[0] as { n: number }).n);
      return { ready: res.body.ready, blockers: res.body.blockers.length };
    });

    // ── 9. Tenant isolation on every export entry point ─────────────────────
    await R.expectBlocked('another-tenant-cannot-export-this-program', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/510k/estar/build'),
      ).send({ meta: { id: 'K-JOURNEY-001', ident: programId }, useProjectContent: true });
      return { blocked: res.status === 404, status: res.status, error: res.body?.error };
    });

    await R.expectBlocked('another-tenant-cannot-preview-this-programs-official-fields', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).get(`/api/510k/estar/official-fields?ident=${programId}&type=510k&variant=device`),
      );
      // 404, and no field row of another tenant's program leaks in the body.
      return {
        blocked: res.status === 404 && res.body?.fields === undefined,
        status: res.status,
        error: res.body?.error,
      };
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
      'The official nIVD eSTAR v7.0 template IS vendored (assets/estar-templates/eSTAR-510k-non-ivd.pdf) and ' +
        'its canonical→XFA field map is verified, so the official-eSTAR production path is exercised end-to-end ' +
        'here. What is asserted is the datasets packet read back at the mapped SOM paths — that Acrobat/LiveCycle ' +
        'RENDERS those values in the form is not verifiable without the viewer. 20 canonical keys are mapped and ' +
        'every one has a governed home (estar-administrative-data.ts); this journey\'s fixture holds 4 of them at ' +
        'step 8 (product name, workspace name) and 8 after step 8c sets two device-profile and two registration ' +
        'facts — the rest are honestly reported blank with their declared home named, which is the point.',
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
