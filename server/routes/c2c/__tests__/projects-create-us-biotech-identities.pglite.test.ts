/**
 * A project created for an exact US biotech filing identity gets that
 * identity's own sections and tasks (2026-10-29, W1/D2,
 * docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md).
 *
 * Before: US_TYPE_D_MEETING, US_EXPANDED_ACCESS_INDIVIDUAL, US_BLA_PAE_REPORT
 * and US_BLA_CBE30 did not exist as filing identities. A BLA report or change
 * started from the wizard matched `id.includes('bla')` and was created as the
 * initial BLA (programTypeFor), and an expanded-access start fell to the IND.
 *
 * Driven end to end on real SQL (PGlite): POST /api/c2c/projects through the
 * real router, the REAL scaffold (scaffold-project-documents.ts) and the real
 * rule-pack migrations in applier order, ending with
 * migrations/20261029_us_biotech_filing_class_packs.sql. Only the licence quota
 * is stubbed. One identity per source family.
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
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';
import { FILING_CLASS_PACKS, filingClassPackSections } from '../../../services/c2c/filing-class-packs';
import { LIFECYCLE_DOCUMENT_TYPES, US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID } from '../../../services/ind/ctd/lifecycle-document-types';
import { getBootstrapPreview } from '../../../services/regulatory/registry/globalDocumentRegistryService';

const h = vi.hoisted(() => ({ pool: null as unknown, db: null as unknown }));
vi.mock('../../../db.js', () => ({
  get pool() { return h.pool; },
  get db() { return h.db; },
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 50, unlimited: false }),
}));

const T = 180_000;
const ORG = 1;
const USER = 11;
let jdb: JourneyDb;
let app: express.Express;

/** The rule-pack files, in the real applier's order (as the pack contract tests read them). */
const PACK_FILES = (C2C_MIGRATION_FILES as string[]).filter(file =>
  /20260528_phase9_document_schema|20260804_phase9_rule_pack_outlines|20260806_cta_ema_ctr536_outline|20260806b_anda_ide_filing_types|20260810_pma_fda_814_20_outline|20260810b_eu_mdr_ivdr_outlines|20260810[cd]_rule_pack_|20260901_ind_fda_m1_v2_3_outline|20260901b_estar_510k_denovo_outlines|20260902_ind_fda_outline_v2_2_initial_ind_flags|20261005_fda_jnda_m1_outline_v2_2|20261005b_pma_fda_outline_v1_1_software_documentation_level|20261005c_k510_denovo_estar_outline_v1_1|20261018_filing_class_rule_packs|20261018c_filing_class_packs_review_corrections|20261019b_filing_class_packs_v1_2_critic_followups|20261020_regional_device_application_packs|20261029_us_biotech_filing_class_packs/.test(file));

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
      'migrations/20260604_submission_core_canonical.sql',
      'migrations/20260925b_submissions_program_anchor.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260903_regulatory_programs_estar_device_fields.sql',
      'migrations/20261012b_regulatory_programs_eu_device_classes.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      'migrations/20261001b_projects_one_anchor_per_program.sql',
      ...PACK_FILES,
    ],
  });
  h.pool = jdb.pool;
  h.db = jdb.db;
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'QA', 'qa', 'standard', 50)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'ra@us-biotech.example', 'RA', 'x')`);
  await jdb.pool.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${USER}, 'manager')`);
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

afterAll(async () => { await jdb?.close(); });

/** [registry id, program type the wizard sends, stated product class ('' = the filing fixes it), exact task plan]. */
const CASES = [
  ['US_TYPE_D_MEETING', 'type_d_meeting', 'drug', 'meeting_package_with_request_tasks'],
  ['US_EXPANDED_ACCESS_INDIVIDUAL', 'expanded_access_individual', 'biologic', 'expanded_access_tasks'],
  ['US_BLA_PAE_REPORT', 'bla_pae_report', '', 'aggregate_safety_tasks'],
  ['US_BLA_CBE30', 'bla_cbe30', '', 'variation_supplement_tasks'],
] as const;

async function documentOf(programId: string) {
  const docs = await jdb.pool.query(
    'SELECT id, doc_type, agency, rule_pack_version, status, readiness FROM c2c_documents WHERE project_id = $1 AND org_id = $2',
    [programId, ORG]);
  expect(docs.rows).toHaveLength(1);
  const doc = docs.rows[0] as { id: string; doc_type: string; agency: string; rule_pack_version: string; status: string; readiness: number };
  const sections = await jdb.pool.query(
    'SELECT section_key, label, status, draft_source FROM c2c_document_sections WHERE document_id = $1 ORDER BY path_order',
    [doc.id]);
  return { doc, sections: sections.rows as { section_key: string; label: string; status: string; draft_source: string }[] };
}

describe('POST /api/c2c/projects creates each exact US biotech identity with its own outline', () => {
  it.each(CASES)('%s scaffolds its own lifecycle record and its own task plan', async (registryId, programType, productType, taskPlan) => {
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${registryId} working project`, productName: 'BX-101', programType,
      ...(productType ? { productType } : {}), primaryAgency: 'FDA', submissionTypeId: registryId.toLowerCase(),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const programId = String(res.body.program?.id ?? res.body.data?.id);

    // The governed document is the identity's class and its exact pack.
    const { doc, sections } = await documentOf(programId);
    const spec = FILING_CLASS_PACKS.find(p => p.docType === programType)!;
    expect(doc).toMatchObject({ doc_type: programType, agency: 'fda', rule_pack_version: spec.version, status: 'draft', readiness: 0 });

    // Its sections are its own lifecycle record's parts, node for node, scaffolded
    // empty — not the IND, BLA or NDA outline of a parent or neighbour.
    const record = LIFECYCLE_DOCUMENT_TYPES.find(r => r.id === US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID[registryId])!;
    expect(record.registryId).toBe(registryId);
    // A supplement's record also names the CTD sections the change updates
    // (lifecycle-record-outlines.ts "Updated CTD Sections"); nothing else is added.
    const updated = (record.ctdSectionCodes ?? []).filter(code => /^[2-5]/.test(code));
    expect(sections.map(s => s.section_key)).toEqual([
      ...record.components.map(c => c.code), ...(updated.length ? ['CTD', ...updated] : []),
    ]);
    expect(sections.map(s => s.section_key)).toEqual((await filingClassPackSections(programType)).map(r => r.key));
    expect(sections.every(s => s.status === 'todo' && s.draft_source === 'template')).toBe(true);

    // A document class creates no submission spine: it is never the initial application.
    const spine = await jdb.pool.query('SELECT id FROM submissions WHERE program_id = $1', [programId]);
    expect(spine.rows).toHaveLength(0);

    // The project record names the exact identity, and the bootstrap preview for
    // that identity gives the same parts and its own task plan.
    const project = await jdb.pool.query('SELECT metadata FROM projects WHERE regulatory_program_id = $1', [programId]);
    expect((project.rows[0] as { metadata: { registryId?: string } }).metadata.registryId).toBe(registryId);
    const preview = (await getBootstrapPreview(registryId))!;
    expect(preview.sections.map(s => s.code)).toEqual(record.components.map(c => c.code));
    expect(preview.milestones.length).toBeGreaterThan(0);
    const { getTaskBlueprint } = await import('../../../services/regulatory/taskBlueprintCatalog');
    expect((await getTaskBlueprint(registryId)).id).toBe(taskPlan);
  }, T);

  it.each([
    ['US_TYPE_D_MEETING', 'briefing', 'drug'],
    ['US_EXPANDED_ACCESS_INDIVIDUAL', 'ind', 'biologic'],
    ['US_BLA_PAE_REPORT', 'pader', 'biologic'],
    ['US_BLA_CBE30', 'bla', 'biologic'],
  ])('%s sent as its parent or neighbour (%s) is refused and nothing is written', async (registryId, programType, productType) => {
    const before = await jdb.pool.query('SELECT count(*)::int AS n FROM regulatory_programs');
    const res = await request(app).post('/api/c2c/projects').send({
      name: `${registryId} as ${programType}`, productName: 'BX-102', programType, productType,
      primaryAgency: 'FDA', submissionTypeId: registryId.toLowerCase(),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/create it as that filing/);
    const after = await jdb.pool.query('SELECT count(*)::int AS n FROM regulatory_programs');
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  }, T);
});
