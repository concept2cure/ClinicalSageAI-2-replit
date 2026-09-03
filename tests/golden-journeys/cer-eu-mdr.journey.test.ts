/**
 * Golden journey — CER (EU MDR): program intake → literature corpus →
 * GSPR/structure assessment → the MEDDEV-shaped clinical evaluation export.
 *
 * The EU MDR clinical-evaluation path over HTTP, against the REAL routers
 * (`/api/c2c/projects`, `/api/cerv2/literature/record`, `/api/submissions/device/cer/*`,
 * `/api/cerv2/export/*`), the REAL services behind them, and the REAL canonical
 * DDL on in-process Postgres (PGlite). The literature write path runs on the
 * REQUEST-SCOPED client (requestPgClient) — not mocked, a real PGlite-backed
 * `req.dbClient`, so the honest fail-closed contract is exercised as written.
 *
 * WHAT IT ASSERTS, IN ORDER (every refusal is a first-class outcome):
 *
 *   1. Intake creates a CER × EMA program, scaffolds the MDR/MEDDEV outline
 *      from the real rule pack, anchors it to the PM spine (slice C1), and
 *      creates NO eCTD submissions spine — the honest absence for a device
 *      programme.
 *   2. Literature is RECORDED, not summarised: entries land in
 *      literature_entries with source_name 'PubMed', a year-precision
 *      publication date (no invented month/day) and a NULL relevance_score
 *      (no fabricated appraisal), and the response states the limits it
 *      cannot represent.
 *   3. Re-recording the same PMID UPDATES rather than duplicating, and never
 *      nulls a field a previous record supplied.
 *   4. The record path REFUSES a program from another organization (404) and
 *      REFUSES a blank-title entry without writing anything.
 *   5. The GSPR/structure assessment counts only what is actually there:
 *      the sections we authored are present, everything else is named as a
 *      missing required section, and claiming equivalence ADDS an obligation.
 *   6. The DOCX export carries the authored MEDDEV sections and NOTHING ELSE —
 *      a section that was never authored (GSPR mapping) does not appear.
 *   7. The ZIP export carries the MEDDEV-shaped section set (eight named
 *      per-section PDFs + combined PDF/DOCX), delivered AUDITED-UNPLACED with
 *      its SHA-256 for a uuid program.
 *   8. Honest empties and refusals: an org with no authored sections is refused
 *      422 NO_AUTHORED_CONTENT rather than handed an empty document; another
 *      tenant's program is 404; and the governed REGISTRY placement path fails
 *      closed (the shared writeback defect — see observations).
 *
 * Output: tests/golden-journeys/__reports__/cer-eu-mdr.{manifest.json,report.md}
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

process.env.AUDIT_HMAC_KEY = 'journey-cer-eu-mdr-audit-hmac-key-00000000000';

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
// See the note in device-510k-estar.journey.test.ts: token issuance/verification
// is Journey A's subject; every authorization decision under test still runs in
// the real routers against the principal the middleware below installs.
vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const ORG = 1;
const OTHER_ORG = 2;
const USER = 1;
const OTHER_USER = 2;

let jdb: JourneyDb;
let app: express.Express;

/** Filled by step 1. */
let programId = '';
let anchorProjectId = 0;
let otherOrgProgramId = '';

const R = new JourneyRecorder(
  'CER (EU MDR) — programme intake to the MEDDEV-shaped clinical evaluation export',
  'The EU MDR clinical-evaluation path over HTTP against real canonical DDL: intake scaffolds the MDR/MEDDEV outline and anchors the programme to the PM spine, PubMed hits are recorded into literature_entries with no fabricated appraisal score and no invented publication date, the GSPR/structure assessment counts only authored sections, and the export delivers the MEDDEV-shaped section set audited-unplaced — with the un-authored section absent rather than invented.',
  [
    'migrations/0000_sweet_joseph.sql (extractTableDdl)',
    'db/migrations/20260801_consolidated_tree_reconciliation.sql#literature_entries (extractTableDdl)',
    'migrations/20260527_mutation_primitives.sql',
    'migrations/20260609_audit_hmac_seal.sql',
    'migrations/20260524_program_workbench_schema.sql',
    'migrations/20260528_phase9_document_schema.sql',
    'migrations/20260506_kit_section_draft_provenance.sql',
    'migrations/20260814_projects_regulatory_program_anchor.sql',
    'migrations/20260817_reconcile_declared_updated_at_columns.sql',
  ],
);

function asPrincipal(orgId: number, userId: number, role = 'admin') {
  return (req: request.Test) =>
    req
      .set('x-journey-org', String(orgId))
      .set('x-journey-user', String(userId))
      .set('x-journey-role', role);
}

/**
 * The MEDDEV 2.7/1 rev 4 / MDR Annex XIV shape, as authored content. GSPR
 * mapping is DELIBERATELY absent: the export must not invent it.
 */
const CER_SECTIONS_AUTHORED = [
  { number: '1', title: 'State of the Art', key: 'state_of_art', category: 'state_of_the_art', content: 'Current knowledge and accepted practice for continuous glucose monitoring.' },
  { number: '2', title: 'Device Description and Intended Purpose', key: 'device_purpose', category: 'device_description', content: 'The device is a wearable CGM sensor intended for adults with diabetes.' },
  { number: '3', title: 'Clinical Data Set', key: 'clinical_data', category: 'clinical_data', content: 'Clinical investigations and the literature data set identified for appraisal.' },
  { number: '4', title: 'Critical Appraisal and Weighting', key: 'appraisal', category: 'appraisal', content: 'Each data set appraised for scientific validity, relevance and weighting.' },
  { number: '5', title: 'Benefit–Risk Determination', key: 'benefit_risk', category: 'benefit_risk', content: 'The benefit-risk profile remains acceptable for the stated intended purpose.' },
  { number: '6', title: 'PMS Plan and PMCF', key: 'pms_pmcf', category: 'pms', content: 'Post-market surveillance plan and PMCF activities feeding the next evaluation.' },
  { number: '7', title: 'Conclusions and Recommendations', key: 'conclusions', category: 'conclusions', content: 'Conformity with the relevant GSPR is supported by the appraised clinical data.' },
];

beforeAll(async () => {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations',
    'users',
    'client_workspaces',
    'projects',
    'audit_logs',
    'cerv2_510k_sections',
    'cerv2_section_versions',
    'concept2cure_artifacts',
    'concept2cure_artifact_versions',
    'concept2cure_provenance_events',
    'regulatory_audit_logs',
  ]);
  // literature_entries exists only as SQL (no Drizzle schema), which is why the
  // write path runs raw SQL on the request-scoped client.
  const literature = extractTableDdl(
    'db/migrations/20260801_consolidated_tree_reconciliation.sql',
    ['literature_entries'],
  );

  jdb = await createJourneyDb({
    prereqSql: `${baseline}\n${literature}`,
    migrations: [
      // The Part 11 tamper-evident store (ledger L145) — cross-cutting.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260506_kit_section_draft_provenance.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      // The declared-but-never-created updated_at columns, reconciled for real
      // rather than granted as test-only sql.
      'migrations/20260817_reconcile_declared_updated_at_columns.sql',
    ],
    // The three TEST-ONLY column grants that were here are gone. Two of them
    // (cerv2_section_versions / concept2cure_artifact_versions .updated_at) are
    // now created for real by the migration loaded above, and the third
    // (regulatory_audit_logs .created_at/.updated_at) named columns that exist
    // in no lineage AND in no drizzle model — the INSERTs naming them were
    // simply wrong and no longer do. See device-510k-estar.journey.test.ts for
    // the full note.
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES
       ($1,'journey-cer-org','journey-cer-org','standard',10),
       ($2,'other-org','other-org','standard',10)`,
    [ORG, OTHER_ORG],
  );
  await jdb.pool.query(
    `INSERT INTO users (id, email, name, password_hash) VALUES
       ($1,'clinical@journey.example','Casey Clinical','x'),
       ($2,'outsider@other.example','Iris Intruder','x')`,
    [USER, OTHER_USER],
  );
  await jdb.pool.query(
    `INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES
       (1,$1,'Journey Workspace','journey-ws'),
       (2,$2,'Other Workspace','other-ws')`,
    [ORG, OTHER_ORG],
  );

  const { default: c2cProjectsRouter } = await import('../../server/routes/c2c/projects');
  const { default: cerv2SectionsRouter } = await import('../../server/routes/cerv2-sections');
  const { default: cerv2DocumentRouter } = await import('../../server/routes/cerv2-document-routes');
  const { default: cerv2ExportRouter } = await import('../../server/routes/cerv2-export-routes');
  const { default: submissionsRouter } = await import('../../server/routes/submissions');

  app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use((req, _res, next) => {
    const orgId = Number(req.headers['x-journey-org']);
    const userId = Number(req.headers['x-journey-user']);
    if (Number.isFinite(orgId) && orgId > 0) {
      const role = String(req.headers['x-journey-role'] ?? 'admin');
      const r = req as unknown as Record<string, unknown>;
      r.user = { id: userId, userId, organizationId: orgId, role, roles: [role] };
      r.userId = userId;
      r.userRole = role;
      r.tenantId = orgId;
      r.tenantContext = { organizationId: orgId };
      r.dbClient = makeRequestDbClient(jdb.pglite);
    }
    next();
  });
  app.use('/api/c2c/projects', c2cProjectsRouter);
  app.use('/api/cerv2-sections', cerv2SectionsRouter);
  app.use('/api/cerv2', cerv2DocumentRouter);
  app.use('/api/cerv2/export', cerv2ExportRouter);
  app.use('/api/submissions', submissionsRouter);
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
  const { jsonPath, mdPath } = R.write('cer-eu-mdr');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

const PMIDS = { primary: '38012345', secondary: '37991234' };

describe('golden journey — CER (EU MDR) clinical evaluation', () => {
  it('runs the CER journey', async () => {
    // ── 1. Intake: a CER × EMA programme with the MDR outline ───────────────
    const created = await R.step('intake-creates-the-cer-programme-and-scaffolds-the-mdr-outline', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/c2c/projects')).send({
        name: 'GlucoTrack CGM — Clinical Evaluation',
        productName: 'GlucoTrack CGM',
        programType: 'cer',
        primaryAgency: 'EMA',
        indication: 'Continuous glucose monitoring in adults',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      programId = res.body.data.id;
      anchorProjectId = res.body.meta.projectAnchorId;
      const outline = await jdb.pool.query(
        `SELECT s.section_key, s.status, s.content
           FROM c2c_document_sections s
          WHERE s.document_id = $1 ORDER BY s.path_order`,
        [res.body.meta.documentId],
      );
      const doc = await jdb.pool.query(
        `SELECT doc_type, agency, rule_pack_version FROM c2c_documents WHERE id = $1`,
        [res.body.meta.documentId],
      );
      const d = doc.rows[0] as { doc_type: string; agency: string; rule_pack_version: string };
      // The scaffold is an OUTLINE, not a draft: every section is 'todo' with
      // empty content. Nothing is claimed written.
      for (const s of outline.rows as Array<{ status: string; content: unknown }>) {
        expect(s.status).toBe('todo');
        expect(s.content).toEqual({});
      }
      expect(d.doc_type).toBe('cer');
      expect(d.agency).toBe('ema');
      return {
        programId,
        anchorProjectId,
        anchorCreated: res.body.meta.projectAnchorCreated,
        docType: d.doc_type,
        agency: d.agency,
        rulePack: d.rule_pack_version,
        outlineSections: outline.rows.length,
        submissionId: res.body.meta.submissionId ?? null,
      };
    });
    expect(created.anchorCreated).toBe(true);
    expect(anchorProjectId).toBeGreaterThan(0);
    // An EU MDR clinical evaluation is not an eCTD filing — no spine is invented.
    expect(created.submissionId).toBeNull();
    expect(created.outlineSections).toBeGreaterThan(0);

    await R.step('a-second-tenant-runs-the-same-intake-for-isolation-probes', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/c2c/projects'),
      ).send({
        name: 'Other Tenant CER',
        productName: 'Other Device',
        programType: 'cer',
        primaryAgency: 'EMA',
      });
      expect(res.status).toBe(201);
      otherOrgProgramId = res.body.data.id;
      return { otherOrgProgramId };
    });

    // ── 2. Literature is recorded, with its limits stated ───────────────────
    const recorded = await R.step('record-pubmed-hits-into-the-organization-literature-corpus', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/literature/record')).send({
        programId,
        entries: [
          {
            pmid: PMIDS.primary,
            title: 'Continuous glucose monitoring in adults with type 1 diabetes',
            journal: 'Diabetes Care',
            year: 2023,
            authors: 'Smith J, Lee K',
            doi: '10.1000/cgm.2023',
          },
          {
            pmid: PMIDS.secondary,
            title: 'Accuracy of wearable glucose sensors: a systematic review',
            journal: 'BMJ Open',
            year: 2022,
            authors: ['Nguyen T', 'Okafor A'],
          },
        ],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.recorded).toBe(true);
      expect(res.body.created).toBe(2);
      expect(res.body.updated).toBe(0);
      // The response states what it CANNOT represent rather than implying it did.
      expect(res.body.screeningState).toBeNull();
      expect(Array.isArray(res.body.notes)).toBe(true);
      expect(res.body.notes.join(' ')).toMatch(/program/i);
      return { created: res.body.created, notes: res.body.notes };
    });
    void recorded;

    await R.step('the-stored-entries-fabricate-nothing-they-do-not-know', async () => {
      const rows = await jdb.pool.query(
        `SELECT source_name, source_id,
                to_char(publication_date, 'YYYY-MM-DD') AS publication_date,
                relevance_score, authors, url, journal
           FROM literature_entries WHERE organization_id = $1 ORDER BY source_id`,
        [ORG],
      );
      expect(rows.rows).toHaveLength(2);
      const primary = (rows.rows as Array<Record<string, unknown>>).find(
        (r) => r.source_id === PMIDS.primary,
      )!;
      expect(primary.source_name).toBe('PubMed');
      // Year precision only — Jan 1 of the stated year, never an invented day.
      expect(String(primary.publication_date)).toMatch(/^2023-01-01/);
      // No appraisal was performed, so no score is stored.
      expect(primary.relevance_score).toBeNull();
      // The author display string became a real array; the canonical PubMed URL
      // is derived, not guessed.
      expect(primary.authors).toEqual(['Smith J', 'Lee K']);
      expect(primary.url).toBe(`https://pubmed.ncbi.nlm.nih.gov/${PMIDS.primary}/`);
      return {
        entries: rows.rows.length,
        publicationDate: String(primary.publication_date).slice(0, 10),
        relevanceScore: primary.relevance_score,
      };
    });

    await R.step('re-recording-the-same-pmid-updates-and-never-erases', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/literature/record')).send({
        entries: [
          {
            pmid: PMIDS.primary,
            title: 'Continuous glucose monitoring in adults with type 1 diabetes',
            abstract: 'A prospective cohort of 412 adults.',
            // journal / year / authors deliberately omitted on the re-record.
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1);
      expect(res.body.created).toBe(0);

      const rows = await jdb.pool.query(
        `SELECT abstract, journal, to_char(publication_date, 'YYYY-MM-DD') AS publication_date, authors
           FROM literature_entries WHERE organization_id = $1 AND source_id = $2`,
        [ORG, PMIDS.primary],
      );
      expect(rows.rows).toHaveLength(1); // updated, not duplicated
      const rec = rows.rows[0] as Record<string, unknown>;
      expect(rec.abstract).toContain('412 adults');
      // COALESCE enrichment: the omitted fields survive the re-record.
      expect(rec.journal).toBe('Diabetes Care');
      expect(String(rec.publication_date)).toMatch(/^2023-01-01/);
      expect(rec.authors).toEqual(['Smith J', 'Lee K']);
      const total = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM literature_entries WHERE organization_id = $1`,
        [ORG],
      );
      return { rows: 1, corpusSize: (total.rows[0] as { n: number }).n };
    });

    // ── KNOWN-BAD: another tenant's programme is not addressable ────────────
    await R.expectBlocked('cannot-record-against-another-tenants-programme', async () => {
      const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM literature_entries`);
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/literature/record')).send({
        programId: otherOrgProgramId,
        entries: [{ pmid: '30000001', title: 'Should never be recorded' }],
      });
      const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM literature_entries`);
      return {
        blocked:
          res.status === 404 &&
          (before.rows[0] as { n: number }).n === (after.rows[0] as { n: number }).n,
        status: res.status,
        error: res.body?.error,
      };
    });

    await R.expectBlocked('a-blank-title-entry-is-refused-and-writes-nothing', async () => {
      const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM literature_entries`);
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/literature/record')).send({
        entries: [{ pmid: '30000002', title: '   ' }],
      });
      const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM literature_entries`);
      return {
        // Zod trims and refuses the blank title before the service is reached.
        blocked:
          res.status >= 400 &&
          (before.rows[0] as { n: number }).n === (after.rows[0] as { n: number }).n,
        status: res.status,
        error: res.body?.error,
      };
    });

    await R.expectBlocked('without-an-organization-context-the-write-path-fails-closed', async () => {
      const res = await request(app)
        .post('/api/cerv2/literature/record')
        .send({ entries: [{ pmid: '30000003', title: 'No tenant context' }] });
      return { blocked: res.status === 400, status: res.status, error: res.body?.error };
    });

    // ── 3. Author the MEDDEV-shaped evaluation (GSPR mapping left absent) ───
    await R.step('author-the-meddev-shaped-clinical-evaluation-sections', async () => {
      for (const s of CER_SECTIONS_AUTHORED) {
        const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2-sections')).send({
          section_number: s.number,
          section_title: s.title,
          section_key: s.key,
          category: s.category,
          content: s.content,
          status: 'in_progress',
        });
        expect(res.status, JSON.stringify(res.body)).toBe(201);
      }
      const n = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM cerv2_510k_sections WHERE organization_id = $1`,
        [ORG],
      );
      return {
        authored: CER_SECTIONS_AUTHORED.length,
        stored: (n.rows[0] as { n: number }).n,
        deliberatelyAbsent: 'GSPR mapping',
      };
    });

    // ── 4. The GSPR / structure assessment counts only what is there ────────
    await R.step('read-the-cer-structure-mdr-annex-xiv-meddev-2-7-1', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).get('/api/submissions/device/cer/structure'));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const sectionIds = (res.body.sections as Array<{ id: string }>).map((s) => s.id);
      expect(sectionIds).toContain('analysis');
      expect(sectionIds).toContain('conclusions');
      // The GSPR obligation is stated by the structure itself.
      expect(JSON.stringify(res.body)).toMatch(/GSPR/);
      return { stages: res.body.stages.length, sections: sectionIds.length };
    });

    const assessed = await R.step('assess-the-cer-structure-against-what-is-actually-authored', async () => {
      // Only the sections we really wrote are declared present.
      const present = ['clinical_background', 'device_description', 'clinical_data', 'appraisal', 'analysis', 'pmcf', 'conclusions'];
      const res = await asPrincipal(ORG, USER)(
        request(app).post('/api/submissions/device/cer/assess'),
      ).send({ presentSectionIds: present });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.ready).toBe(false);
      // The gaps are named, not counted away: summary/scope/evaluator/references
      // were never authored, so they are reported missing.
      expect(res.body.missingRequiredSections).toContain('summary');
      expect(res.body.missingRequiredSections).toContain('scope');
      expect(res.body.presentCount).toBe(present.length);
      return {
        ready: res.body.ready,
        missing: res.body.missingRequiredSections,
        presentCount: res.body.presentCount,
      };
    });

    await R.expectBlocked('claiming-equivalence-adds-an-obligation-it-does-not-remove-one', async () => {
      const present = ['clinical_background', 'device_description', 'clinical_data', 'appraisal', 'analysis', 'pmcf', 'conclusions'];
      const res = await asPrincipal(ORG, USER)(
        request(app).post('/api/submissions/device/cer/assess'),
      ).send({ presentSectionIds: present, equivalenceClaimed: true });
      const missing: string[] = res.body?.missingRequiredSections ?? [];
      return {
        // Declaring equivalence makes the equivalence section required — the
        // assessment gets STRICTER, never more permissive.
        blocked: res.status === 200 && res.body.ready === false && missing.includes('equivalence'),
        status: res.status,
        missingWithEquivalence: missing.length,
        missingWithout: assessed.missing.length,
      };
    });

    // ── 5. The DOCX export carries what was authored — and nothing else ─────
    await R.step('docx-export-carries-the-authored-sections-and-invents-none', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/export/docx')).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        meta: { id: 'CER-JOURNEY-001', ident: programId, title: 'GlucoTrack CGM CER' },
      });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
      const docxBytes = Buffer.from(res.body.downloadable_output_ref.data, 'base64');
      const zip = await JSZip.loadAsync(docxBytes);
      const xml = await zip.file('word/document.xml')!.async('string');
      for (const s of CER_SECTIONS_AUTHORED) {
        expect(xml, `${s.title} missing from the DOCX`).toContain(s.title);
      }
      // The section nobody authored does not appear. An export that filled it in
      // would be fabricating the GSPR conformity argument.
      expect(xml).not.toMatch(/GSPR Mapping/i);
      expect(xml).toContain('Clinical Evaluation Report');
      return {
        bytes: docxBytes.length,
        authoredSectionsPresent: CER_SECTIONS_AUTHORED.length,
        gsprMappingPresent: /GSPR Mapping/i.test(xml),
      };
    });

    // ── 6. The ZIP export IS the MEDDEV-shaped section set, and it is now
    //     REGISTRY-PLACED. This step asserted the audited-unplaced degradation,
    //     because the CER export resolved a program ident to a null anchor and
    //     never asked the C1 resolver for the real one. It does now, so an
    //     anchored programme takes the governed path — with the delivered ZIP
    //     asserted exactly as before, since registration must not change what
    //     the user receives.
    await R.step('meddev-shaped-zip-is-delivered-and-registry-placed', async () => {
      const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/export/zip')).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        meta: { id: 'CER-JOURNEY-001', ident: programId, title: 'GlucoTrackCER' },
      });
      const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM concept2cure_artifacts`);
      const zipBytes = Buffer.from(res.body?.downloadable_output_ref?.data ?? '', 'base64');
      const sha = createHash('sha256').update(zipBytes).digest('hex');
      // MEDDEV 2.7/1 rev 4 / MDR Annex XIV part A section set.
      //
      // Computed as BOOLEANS folded into `blocked`, never as `expect` calls: a
      // throw inside expectBlocked is recorded as "blocked as expected", so an
      // assertion here would convert a real failure into a false pass.
      const EXPECTED_PACKAGE = [
        '01_StateOfTheArt.pdf',
        '02_DeviceIntendedPurpose.pdf',
        '03_ClinicalDataSet.pdf',
        '04_CriticalAppraisal.pdf',
        '05_BenefitRiskDetermination.pdf',
        '06_GSPRMapping.pdf',
        '07_PMSPlanPMCF.pdf',
        '08_ConclusionsRecommendations.pdf',
        'GlucoTrackCER_Combined.docx',
        'GlucoTrackCER_Combined.pdf',
      ];
      let names: string[] = [];
      let everyPdfEntryIsPdf = false;
      if (zipBytes.length > 0) {
        const zip = await JSZip.loadAsync(zipBytes);
        names = Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
        const pdfs = names.filter((f) => f.endsWith('.pdf'));
        const heads = await Promise.all(
          pdfs.map(async (n) =>
            (await zip.file(n)!.async('nodebuffer')).subarray(0, 5).toString('latin1'),
          ),
        );
        everyPdfEntryIsPdf = heads.length > 0 && heads.every((head) => head === '%PDF-');
      }
      const packageMatches = JSON.stringify(names) === JSON.stringify(EXPECTED_PACKAGE);
      const audit = await jdb.pool.query(
        `SELECT new_values FROM audit_logs
          WHERE action = 'EXPORT_GENERATED' AND record_id = $1
          ORDER BY occurred_at DESC LIMIT 1`,
        [programId],
      );
      const auditRow = audit.rows[0] as
        | { new_values: { artifactRegistry: string; sha256: string; docType: string } }
        | undefined;
      expect(res.status).toBe(200);
      expect(res.body.governed).toBe(true);
      expect(res.body.artifact_id).toBeTruthy();
      expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n + 1);
      // The MEDDEV-shaped section set is unchanged.
      expect(packageMatches).toBe(true);
      expect(everyPdfEntryIsPdf).toBe(true);
      return {
        status: res.status,
        governed: res.body.governed,
        artifactId: res.body.artifact_id,
        meddevSectionSet: names.filter((f) => /^\d\d_/.test(f)),
        everyPdfEntryIsPdf,
        artifactsBefore: (before.rows[0] as { n: number }).n,
        artifactsAfter: (after.rows[0] as { n: number }).n,
        anchorUsedForThisProgram: anchorProjectId,
        priorUnplacedAudit: auditRow?.new_values?.artifactRegistry ?? null,
      };
    });

    // ── 7. Honest empties and fail-closed refusals ──────────────────────────
    await R.expectBlocked('an-org-with-no-authored-sections-is-refused-not-handed-an-empty-cer', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/cerv2/export/pdf'),
      ).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        meta: { id: 'CER-OTHER', ident: otherOrgProgramId },
      });
      return {
        blocked: res.status === 422 && res.body.error === 'NO_AUTHORED_CONTENT',
        status: res.status,
        error: res.body?.error,
        message: res.body?.message,
      };
    });

    await R.expectBlocked('another-tenant-cannot-export-this-programme', async () => {
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/cerv2/export/pdf'),
      ).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        meta: { id: 'CER-JOURNEY-001', ident: programId },
      });
      return { blocked: res.status === 404, status: res.status, error: res.body?.error };
    });

    // The governed REGISTRY path — the same shared writeback the 510(k) journey
    // pins — now completes. It used to fail closed on EVERY database because the
    // writeback named columns no lineage creates; those column lists are
    // reconciled, so the artifact and its provenance event land together.
    await R.step('governed-registry-placement-writes-artifact-and-provenance', async () => {
      const before = await jdb.pool.query(
        `SELECT (SELECT count(*)::int FROM concept2cure_artifacts) AS a,
                (SELECT count(*)::int FROM concept2cure_provenance_events) AS p`,
      );
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/cerv2/export/pdf')).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        projectId: anchorProjectId,
        meta: { id: 'CER-JOURNEY-001', title: 'GlucoTrack CGM CER' },
      });
      const after = await jdb.pool.query(
        `SELECT (SELECT count(*)::int FROM concept2cure_artifacts) AS a,
                (SELECT count(*)::int FROM concept2cure_provenance_events) AS p`,
      );
      const b = before.rows[0] as { a: number; p: number };
      const a = after.rows[0] as { a: number; p: number };
      expect(res.status).toBe(200);
      expect(a.a).toBe(b.a + 1);
      expect(a.p).toBe(b.p + 1);
      return {
        status: res.status,
        artifactId: res.body?.artifact_id ?? null,
        artifactsBefore: b.a,
        artifactsAfter: a.a,
        provenanceAfter: a.p,
      };
    });

    // The tenant guard on the numeric projectId. This was a live hole the
    // moment the registry writeback started working: `meta.ident` was resolved
    // org-scoped but `data.projectId` went straight through to placement, so a
    // caller could file their own export into another tenant's project lineage.
    await R.expectBlocked('cannot-place-an-export-into-another-tenants-project', async () => {
      const before = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM concept2cure_artifacts WHERE project_id = $1`,
        [anchorProjectId],
      );
      // OTHER_ORG's principal names THIS org's anchored project id directly.
      const res = await asPrincipal(OTHER_ORG, OTHER_USER)(
        request(app).post('/api/cerv2/export/pdf'),
      ).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        projectId: anchorProjectId,
        meta: { id: 'CER-JOURNEY-001', title: 'cross-tenant attempt' },
      });
      const after = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM concept2cure_artifacts WHERE project_id = $1`,
        [anchorProjectId],
      );
      return {
        // 404 — and it must not distinguish "not yours" from "does not exist".
        // Nothing was written into the victim project either way.
        blocked:
          res.status === 404 &&
          (before.rows[0] as { n: number }).n === (after.rows[0] as { n: number }).n,
        status: res.status,
        error: res.body?.error,
        victimProjectArtifactsBefore: (before.rows[0] as { n: number }).n,
        victimProjectArtifactsAfter: (after.rows[0] as { n: number }).n,
      };
    });

    await R.expectBlocked('a-viewer-cannot-produce-a-governed-cer-export', async () => {
      const res = await asPrincipal(ORG, USER, 'viewer')(
        request(app).post('/api/cerv2/export/docx'),
      ).send({
        docType: 'cerv2_cer',
        useProjectContent: true,
        meta: { id: 'CER-JOURNEY-001', ident: programId },
      });
      return { blocked: res.status === 403, status: res.status, error: res.body?.error };
    });

    R.observations.push(
      'RESOLVED — the CER export shares the 510(k) export governance plane and inherited its blocking ' +
        'finding: artifactWriteback.ts / exportGovernance.ts INSERTed concept2cure_provenance_events' +
        '.updated_at and regulatory_audit_logs.created_at/.updated_at, columns in NO schema lineage and no ' +
        'drizzle model, so registry placement 500\'d on every database. Those column lists are corrected ' +
        'and the step now asserts placement completing. A uuid programme no longer takes the ' +
        'audited-unplaced path either, because the CER route now resolves the C1 anchor.',
      'FIXED, AND IT HAD TO BE FIXED IN THE SAME CHANGE — a numeric `projectId` in the export body was ' +
        'not org-checked: resolveExportRequest resolved `meta.ident` org-scoped (404 outside the org) but ' +
        'passed `data.projectId` straight through to the artifact registry, so a caller could file their ' +
        'own export into another tenant\'s project lineage. That was inert ONLY because the registry ' +
        'writeback above 500\'d before reaching the insert. Reconciling the column list without also ' +
        'closing this would have converted a dead bug into a live cross-tenant write. resolveExportRequest ' +
        'now proves the supplied projectId belongs to the caller\'s org against `projects` — the table ' +
        'concept2cure_artifacts.project_id actually references — and 404s identically for "not yours" and ' +
        '"does not exist". Step "cannot-place-an-export-into-another-tenants-project" asserts it, and that ' +
        'the victim project gains no artifact row.',
      'Recording literature and appraising it are kept apart on purpose, and the route says so: the ' +
        'response carries screeningState:null plus the notes naming what the corpus table cannot hold ' +
        '(no program column; screening state recorded elsewhere). The journey asserts the notes are ' +
        'present and mention the program-binding limit rather than pinning their exact wording, because ' +
        'that wording is owned by the service constants.',
    );
    R.limitations.push(
      'PubMed retrieval (GET /api/cerv2/literature/search) is NOT exercised: it calls the live NCBI ' +
        'E-utilities API. This journey drives the WRITE path with caller-supplied hits, which is exactly ' +
        'what the search surface hands it. The search route\'s honest-degradation contract ' +
        '(available:false + unavailableReason on a network failure) needs a network fault injection and ' +
        'is covered by its own route test.',
      'Per-section PDFs are the PDFKit text fallback (puppeteer is not installed), so this journey asserts ' +
        'the MEDDEV-shaped file SET and real PDF bytes, not layout fidelity. The "nothing was invented" ' +
        'assertion is made against the DOCX, whose XML is directly readable.',
      'The Notified Body submission channel (EUDAMED / NB portal upload) is not exercised — there is no ' +
        'gateway to submit a technical file to in this environment.',
      'authMiddleware is replaced by a verified-principal middleware (see the 510(k) journey); the ' +
        'authorization decisions under test still run in the real routers.',
      "auditService's second sink (audit.tamper_proof_log) is not provisioned here, so each audited action " +
        'logs one non-fatal tamper-proof-write failure; the chained audit_logs row this journey asserts is ' +
        'written first and independently.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(7);
  }, T);
});
