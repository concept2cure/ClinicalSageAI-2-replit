/** Actual JWT/HTTP, current project access, authoring writes and saved references
 * over isolated PGlite. No provider, deployment, agency or regulatory-validation claim. */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { builtinAuthoringTemplateId, type BuiltinAuthoringTemplate } from '../../services/authoring/builtin-authoring-templates';
import { savedSectionDraftTemplate } from '../../services/authoring/authoring-draft-template';
import type { RequestSqlClient } from '../../db/requestDb';
import { AUTHOR, ORG, OTHER_PROGRAM, PROGRAM } from './_authoring-canvas-fixture';
import { app, author, counts, create, db, sections, templateEditorFixture } from './_template-editor-fixture';

templateEditorFixture([
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260813_audit_tamper_proof_log.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260727_authoring_object_permissions.sql',
  'db/migrations/20260803_document_span_lineage.sql',
  'migrations/20260907_span_lineage_accepted_machine_draft.sql',
  'migrations/20260908_span_lineage_machine_draft.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  'migrations/20260727_authoring_document_program_scope.sql',
  'migrations/20260728_authoring_document_governed_binding.sql',
  'migrations/20260814d_document_alias_map.sql',
  'migrations/20260921_audit_logs_chain_seq.sql',
  'migrations/20260921_authoring_document_provenance.sql',
]);

// Independently named source identities, representative content and original-record
// policies. These expectations are not calculated by the projector under test.
const cases = [
  { id: 'pre_ind_meeting', narrative: 'MTG-REQ-CL', manual: ['MTG-ATTEND'],
    required: ['MTG-NONCLIN', 'MTG-CMC', 'MTG-CLIN'], excluded: ['MTG-QUAL'] },
  { id: 'end_of_phase_2_meeting', narrative: 'MTG-STATS', manual: ['MTG-ATTEND'],
    required: ['MTG-EFF', 'MTG-SAFETY', 'MTG-CMC-NC'], excluded: ['MTG-NONCLIN'] },
  { id: 'pre_nda_meeting', narrative: 'MTG-BKGD', manual: ['MTG-ATTEND'],
    required: ['MTG-DATA', 'MTG-PLANS', 'MTG-EFF'], excluded: ['MTG-QUAL', 'MTG-MFG'] },
  { id: 'pre_bla_meeting', narrative: 'MTG-QUAL', manual: ['MTG-ATTEND'],
    required: ['MTG-MFG', 'MTG-DATA-PLANS', 'MTG-SAFETY'], excluded: ['MTG-PLANS'] },
  { id: 'ind_protocol_amendment', narrative: 'PROTOCOL-OR-CHANGE', manual: ['FORM-FDA-1571'],
    required: ['SUPPORTING-INFO'], excluded: ['CMC-CHANGE-SUMMARY', 'POINT-BY-POINT-RESPONSE'] },
  { id: 'ind_information_amendment', narrative: 'INFO-SUMMARY', manual: ['FORM-FDA-1571', 'TECHNICAL-DATA'],
    required: ['TECHNICAL-DATA'], excluded: ['PROTOCOL-OR-CHANGE'] },
  { id: 'ind_cmc_amendment', narrative: 'CMC-CHANGE-SUMMARY', manual: ['FORM-FDA-1571'],
    required: ['MODULE3-UPDATE'], excluded: ['PROTOCOL-OR-CHANGE', 'INFO-SUMMARY'] },
  { id: 'ind_response_to_clinical_hold', narrative: 'POINT-BY-POINT-RESPONSE', manual: ['FORM-FDA-1571', 'REVISED-DOCUMENTS'],
    required: ['REVISED-DOCUMENTS'], excluded: ['INFO-SUMMARY'] },
  { id: 'cbe_30', narrative: 'CBE30-CHANGE', manual: ['CBE30-356H', 'CBE30-LABELING'],
    required: ['CBE30-COVER', 'CBE30-ENV'], excluded: ['CBE0-SAFETY', 'CBE0-356H'] },
  { id: 'cbe_0', narrative: 'CBE0-SAFETY', manual: ['CBE0-356H', 'CBE0-LABELING'],
    required: ['CBE0-CHANGE', 'CBE0-ENV'], excluded: ['CBE30-356H'] },
  { id: 'iss', narrative: 'ISS-POOL', manual: ['ISS-EXP', 'ISS-DEMO'],
    required: ['ISS-AE', 'ISS-LAB', 'ISS-SUBGROUP'], excluded: ['ISE-PRIMARY'] },
  { id: 'ise', narrative: 'ISE-POOL', manual: ['ISE-DEMO'],
    required: ['ISE-POP', 'ISE-PRIMARY', 'ISE-DOSE'], excluded: ['ISS-AE', 'ISS-EXP'] },
];
const key = (id: string) => `component:us_lifecycle_${id}`;
let roster: BuiltinAuthoringTemplate[];
beforeAll(async () => {
  const response = await author(request(app).get('/api/authoring/templates'));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  roster = response.body.templates;
});

function selected(id: string): BuiltinAuthoringTemplate {
  const found = roster.find(row => row.entryId === key(id));
  expect(found, `The existing picker must expose the exact ${id} source`).toBeDefined();
  return found!;
}

const q: RequestSqlClient = { query: async (sql, params) => db.pglite.query<Record<string, unknown>>(sql, params) };
interface DocumentHeader { id: string; template_id: string; provenance: Record<string, unknown> }
interface SavedSection { id: string; code: string; title: string; content: string }
const scope = (doc: DocumentHeader, section: SavedSection) => ({ tenantId: ORG,
  documentId: doc.id, programId: PROGRAM, sectionId: section.id, code: section.code });
const header = (doc: DocumentHeader) => ({ template_id: doc.template_id, provenance: doc.provenance });

async function guidance(section: SavedSection) {
  const response = await author(request(app).get(`/api/authoring/guidance/${section.id}`));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.template_guidance as Array<{ drafting_mode: string; source_reference: string }>;
}

describe('exact US lifecycle working documents reach the existing editor', () => {
  it('offers twelve distinct stable source identities without writing or replacing the generic filing starts', async () => {
    const before = await counts();
    const response = await author(request(app).get('/api/authoring/templates'));
    expect(response.status).toBe(200);
    const rows = response.body.templates as BuiltinAuthoringTemplate[];
    for (const row of cases) expect(selected(row.id)).toMatchObject({
      id: builtinAuthoringTemplateId(key(row.id)), entryId: key(row.id), kind: 'narrative', aiDraftable: true,
      filingContext: { registryId: null, region: 'US', agency: 'FDA' },
    });
    expect(new Set(cases.map(row => selected(row.id).id)).size).toBe(12);
    for (const id of ['US_IND_AMENDMENT', 'US_CBE', 'US_NDA', 'US_BLA']) {
      expect(rows).toContainEqual(expect.objectContaining({ entryId: `registry:${id}` }));
    }
    expect(await counts()).toEqual(before);
  });

  it.each(cases)('creates and reopens $id with its own content and retained manual original-record policy', async row => {
    const template = selected(row.id);
    const before = await counts();
    const made = await create(template, { title: 'Renamed lifecycle working copy' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const doc = made.body.document as DocumentHeader;
    const source = made.body.document.provenance.templateSource;
    expect(source).toMatchObject({ id: template.id, entryId: key(row.id), kind: 'narrative', aiDraftable: true,
      filingContext: { registryId: null, region: 'US', agency: 'FDA' } });
    expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(made.body.document).toMatchObject({ c2c_document_id: null, client_program_id: PROGRAM, status: 'draft' });
    const saved = await sections(doc.id);
    expect(saved.every(section => section.content === '')).toBe(true);
    for (const code of row.required) expect(saved.some(section => section.code === code), code).toBe(true);
    for (const code of row.excluded) expect(saved.some(section => section.code === code), code).toBe(false);
    for (const section of saved) {
      const guides = await guidance(section);
      expect(guides).toContainEqual(expect.objectContaining({
        source_reference: `lifecycle-component:LIFECYCLE_DOCUMENT_TYPES:${row.id}`,
        drafting_mode: row.manual.includes(section.code) ? 'manual' : 'narrative',
      }));
    }
    const narrative = saved.find(section => section.code === row.narrative)!;
    const prepared = await savedSectionDraftTemplate(q, scope(doc, narrative), header(doc), 'FDA');
    expect(prepared.region).toBe('FDA');
    expect(prepared.referenceBlock).toContain(`lifecycle-component:LIFECYCLE_DOCUMENT_TYPES:${row.id}`);
    for (const code of row.manual) await expect(savedSectionDraftTemplate(q,
      scope(doc, saved.find(section => section.code === code)!), header(doc), 'FDA'))
      .rejects.toMatchObject({ status: 409, code: 'TEMPLATE_NOT_DRAFTABLE' });
    const reopened = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
    expect(reopened.status).toBe(200);
    expect(reopened.body.document.provenance.templateSource).toEqual(source);
    expect(await counts()).toMatchObject({ docs: before.docs + 1, sections: before.sections + saved.length,
      revisions: before.revisions + saved.length, signatures: before.signatures });
  }, 60_000);
});

describe('lifecycle editor working copies keep manual work and current boundaries', () => {
  it('edits an independent working section while preserving the precise source and original-form refusal', async () => {
    const made = await create(selected('ind_response_to_clinical_hold'));
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const doc = made.body.document as DocumentHeader;
    const saved = await sections(doc.id);
    const response = saved.find(section => section.code === 'POINT-BY-POINT-RESPONSE')!;
    const body = '<p>Working response requires verification against the actual authority letter and source records.</p>';
    const edited = await author(request(app).patch(`/api/authoring/sections/${response.id}`))
      .send({ content: body, changeReason: 'Prepare an independent working response for review.' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await sections(doc.id)).find(section => section.id === response.id)?.content).toBe(body);
    const original = saved.find(section => section.code === 'FORM-FDA-1571')!;
    const before = await counts();
    const refused = await author(request(app).post(`/api/authoring/sections/${original.id}/ai/draft`)).send({ region: 'FDA' });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.error.code).toBe('TEMPLATE_NOT_DRAFTABLE');
    expect(await counts()).toEqual(before);
    expect((await sections(doc.id)).find(section => section.id === original.id)?.content).toBe('');
  });

  it('rejects a conflicting receiving-region request before any content or evidence write', async () => {
    const made = await create(selected('cbe_0'));
    expect(made.status).toBe(201);
    const doc = made.body.document as DocumentHeader;
    const cover = (await sections(doc.id)).find(section => section.code === 'CBE0-COVER')!;
    const before = await counts();
    const refused = await author(request(app).post(`/api/authoring/sections/${cover.id}/ai/draft`)).send({ region: 'PMDA' });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.error.code).toBe('TEMPLATE_REGION_MISMATCH');
    expect(await counts()).toEqual(before);
  });

  it('refuses another organization’s target and current revoked membership without partial working copies', async () => {
    const template = selected('pre_bla_meeting');
    const before = await counts();
    expect((await create(template, { client_program_id: OTHER_PROGRAM })).status).toBe(404);
    expect(await counts()).toEqual(before);
    await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
    try {
      expect((await create(template)).status).toBe(403);
      expect(await counts()).toEqual(before);
    } finally {
      await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]);
    }
  });

  it('refuses guidance and drafting after current access to the saved project is withdrawn', async () => {
    const made = await create(selected('pre_nda_meeting'));
    expect(made.status).toBe(201);
    const doc = made.body.document as DocumentHeader;
    const cover = (await sections(doc.id)).find(section => section.code === 'MTG-REQ-CL')!;
    await db.pool.query('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=42');
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    const before = await counts();
    try {
      const denied = await author(request(app).get(`/api/authoring/guidance/${cover.id}`));
      expect(denied.status).toBe(403);
      expect(denied.body.template_guidance).toBeUndefined();
      const draft = await author(request(app).post(`/api/authoring/sections/${cover.id}/ai/draft`)).send({ region: 'FDA' });
      expect(draft.status).toBe(403);
      expect(await counts()).toEqual(before);
    } finally {
      await db.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
    }
  });
});
