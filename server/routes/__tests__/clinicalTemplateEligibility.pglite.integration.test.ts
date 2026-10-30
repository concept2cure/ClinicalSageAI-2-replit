/** Actual current create/reopen SQL and canonical saved-section drafting eligibility.
 * No model is called; eligibility is distinct from a generated or approved draft. */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import * as builtin from '../../services/authoring/builtin-authoring-templates';
import { savedSectionDraftTemplate } from '../../services/authoring/authoring-draft-template';
import type { RequestSqlClient } from '../../db/requestDb';
import { ORG, PROGRAM } from './_authoring-canvas-fixture';
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

const cases = [
  ['protocol', '1.1', 'table_of_contents'], ['investigators_brochure', '1', 'table_of_contents'],
  ['statistical_analysis_plan', '1', null], ['informed_consent', '1', '10'],
  ['dsur', '1', '7'], ['pbrer', '1', '6.2'],
] as const;
const sql: RequestSqlClient = { query: async (statement, args) => db.pglite.query<Record<string, unknown>>(statement, args) };

describe('clinical starts use the same persisted editor and reference gate', () => {
  it.each(cases)('admits saved %s narrative and refuses its original record section', async (id, narrativeCode, manualCode) => {
    const template = await builtin.getBuiltinAuthoringTemplate(builtin.builtinAuthoringTemplateId(`component:${id}`));
    const created = await create(template!);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const doc = created.body.document;
    const reopened = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
    expect(reopened.status).toBe(200);
    const header = reopened.body.document;
    const rows = await sections(doc.id);
    expect(rows.every(row => row.content === '')).toBe(true);
    const narrative = rows.find(row => row.code === narrativeCode)!;
    const before = await counts();
    const result = await savedSectionDraftTemplate(sql, { tenantId: ORG, documentId: doc.id, programId: PROGRAM,
      sectionId: narrative.id, code: narrative.code }, header, 'FDA');
    expect(result.region).toBe('FDA');
    expect(result.referenceBlock).toContain(`component:${id}`);
    expect(result.referenceBlock).toContain('"drafting_mode":"narrative"');
    if (manualCode) {
      const original = rows.find(row => row.code === manualCode)!;
      await expect(savedSectionDraftTemplate(sql, { tenantId: ORG, documentId: doc.id, programId: PROGRAM,
        sectionId: original.id, code: original.code }, header, 'FDA')).rejects.toMatchObject({ code: 'TEMPLATE_NOT_DRAFTABLE', status: 409 });
      const guidance = await author(request(app).get(`/api/authoring/guidance/${original.id}`));
      expect(guidance.status).toBe(200);
      expect(guidance.body.template_guidance).toContainEqual(expect.objectContaining({ drafting_mode: 'manual' }));
    }
    expect(await counts()).toEqual(before);
  });

  it('does not silently upgrade a saved manual snapshot when current protocol metadata permits narrative drafting', async () => {
    const current = await builtin.getBuiltinAuthoringTemplate(builtin.builtinAuthoringTemplateId('component:protocol'));
    const old = { ...current!, kind: 'preparation' as const, aiDraftable: false, authoringMode: 'manual' };
    const resolve = builtin.getBuiltinAuthoringTemplate;
    const lookup = vi.spyOn(builtin, 'getBuiltinAuthoringTemplate').mockImplementation(async id => id === old.id ? old : resolve(id));
    let response;
    try { response = await create(old); } finally { lookup.mockRestore(); }
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const doc = response.body.document;
    const row = (await sections(doc.id)).find(section => section.code === '1.1')!;
    const reopened = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
    expect(reopened.body.document.provenance.templateSource).toMatchObject({ aiDraftable: false, authoringMode: 'manual' });
    await expect(savedSectionDraftTemplate(sql, { tenantId: ORG, documentId: doc.id, programId: PROGRAM,
      sectionId: row.id, code: row.code }, reopened.body.document, 'FDA')).rejects.toMatchObject({ code: 'TEMPLATE_NOT_DRAFTABLE' });
  });
});
