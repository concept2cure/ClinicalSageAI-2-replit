/** Existing HTTP persistence and exact saved-source admission; no model or agency is called. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { savedSectionDraftTemplate } from '../../services/authoring/authoring-draft-template';
import type { RequestSqlClient } from '../../db/requestDb';
import type { IndAuthoringTemplate } from '../../services/authoring/ind-template-types';
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

const sql: RequestSqlClient = { query: async (statement, args) => db.pglite.query<Record<string, unknown>>(statement, args) };
const targets = [
  ['drug_substance', '3.2.S.1', '3.2.S.4.1'], ['drug_product', '3.2.P.2', '3.2.P.1'],
  ['us_prescribing_information', 'H.3', 'BW'], ['nonclinical_study_report', '2', '7'],
] as const;

describe('medicinal starts persist in the existing editor', () => {
  it.each(targets)('opens %s and admits narrative while preserving original source parts', async (id, narrativeCode, manualCode) => {
    const listed = await author(request(app).get('/api/authoring/templates'));
    expect(listed.status).toBe(200);
    const template = (listed.body.templates as IndAuthoringTemplate[]).find(row => row.entryId === `component:${id}`);
    expect(template, `The existing template roster must expose ${id}`).toBeDefined();
    const created = await create(template!);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const doc = created.body.document;
    const reopened = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
    expect(reopened.status).toBe(200);
    const saved = await sections(doc.id);
    const narrative = saved.find(row => row.code === narrativeCode)!;
    const original = saved.find(row => row.code === manualCode)!;
    const scope = { tenantId: ORG, documentId: doc.id, programId: PROGRAM };
    const before = await counts();
    const admitted = await savedSectionDraftTemplate(sql, { ...scope, sectionId: narrative.id, code: narrative.code }, reopened.body.document, 'FDA');
    expect(admitted.referenceBlock).toContain(`component:${id}`);
    expect(admitted.referenceBlock).toContain('"drafting_mode":"narrative"');
    await expect(savedSectionDraftTemplate(sql, { ...scope, sectionId: original.id, code: original.code }, reopened.body.document, 'FDA'))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_DRAFTABLE' });
    if (id === 'us_prescribing_information') {
      await expect(savedSectionDraftTemplate(sql, { ...scope, sectionId: narrative.id, code: narrative.code }, reopened.body.document, 'PMDA'))
        .rejects.toMatchObject({ code: 'TEMPLATE_REGION_MISMATCH' });
    }
    expect(await counts()).toEqual(before);
    expect(saved.every(row => row.content === '')).toBe(true);
  });
});
