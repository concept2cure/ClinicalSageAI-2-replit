/** Regional biotech starts use the existing JWT/HTTP editor route. Local SQL
 * proof does not qualify agency completeness, deployment RLS or transmission. */
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { GLOBAL_REGISTRY } from '../../../shared/regulatory/global-document-registry';
import { DOCUMENT_TEMPLATES, componentTemplateIdForRegistry, getRegistryDocumentTemplate, type DocumentTemplateStructure } from '../../services/market-specs/document-template-library';
import * as builtinTemplates from '../../services/authoring/builtin-authoring-templates';
import { buildDocumentPreparation } from '../../services/market-specs/document-preparation';
import { critiqueSavedDocument } from '../../services/ana/saved-document-critique';
import { documentTemplateTool } from '../../services/ana/document-template-tool';
import type { IndAuthoringTemplate } from '../../services/authoring/ind-template-types';
import { AUTHOR, ORG, OTHER_PROGRAM, PROGRAM } from './_authoring-canvas-fixture';
import { app, author, counts, create, db, sections, templateEditorFixture } from './_template-editor-fixture';

// The migration-closure gate reads these literal paths in each actual test harness.
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

const regions = ['US', 'CA', 'EU', 'JP', 'GLOBAL'];
const filings = GLOBAL_REGISTRY.filter(entry => entry.active && entry.segment === 'pharma_biotech' && regions.includes(entry.region));
const components = DOCUMENT_TEMPLATES.filter(outline => outline.families.some(family => family === 'ectd' || family === 'ctis'));
interface ListedTemplate extends IndAuthoringTemplate {
  category: string;
  filingContext: { registryId: string | null; region: string; agency: string };
  families: string[];
}
async function listed() {
  const response = await author(request(app).get('/api/authoring/templates'));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.templates as ListedTemplate[];
}
async function selected(entryId: string) {
  const row = (await listed()).find(template => template.entryId === entryId);
  expect(row, `${entryId} must be loadable from the one existing template picker`).toBeDefined();
  return row!;
}

async function verifySavedReview(documentId: string, savedCount: number, recordedSource: Record<string, unknown>) {
  const read = async (input: Record<string, unknown>) => {
    const raw = await critiqueSavedDocument({ document_id: documentId, ...input },
      { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM }, async (options, fn) => {
        expect(options.tenantId).toBe(ORG);
        return fn({ query: async (sql, params) => db.pglite.query<Record<string, unknown>>(sql, params) });
      });
    expect(raw.length).toBeLessThanOrEqual(5000);
    const result = JSON.parse(raw);
    expect(result.error, raw).toBeUndefined();
    expect(result).toMatchObject({ documentId, complete: true,
      template: { id: recordedSource.id, sourceState: 'recorded', kind: recordedSource.kind, aiDraftable: recordedSource.aiDraftable },
      coverage: { sectionCount: savedCount, textChars: 0, emptySections: savedCount } });
    return result;
  };
  const first = await read({});
  const items: Array<Record<string, unknown>> = [...first.items];
  let nextOffset = first.pagination.nextOffset;
  for (let page = 1; nextOffset !== null && page < 600; page++) {
    const next = await read({ offset: nextOffset, expected_snapshot: first.snapshotSha256 });
    expect(next.snapshotSha256).toBe(first.snapshotSha256);
    expect(next.documentScore).toBe(first.documentScore);
    expect(next.pagination.offset).toBe(nextOffset);
    items.push(...next.items);
    nextOffset = next.pagination.nextOffset;
  }
  expect(nextOffset).toBeNull();
  expect(items).toHaveLength(first.pagination.total);
  expect(items.filter(item => item.kind === 'section')).toHaveLength(savedCount);
  const { limitations, ...identity } = recordedSource;
  expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', source: identity,
    limitationCount: (limitations as string[]).length }));
  for (const [itemIndex, limitation] of (limitations as string[]).entries()) {
    expect(items.filter(item => item.kind === 'template-reference' && item.field === 'limitations' && item.itemIndex === itemIndex)
      .map(item => item.text).join('')).toBe(limitation);
  }
}

async function verifyCopy(template: ListedTemplate, outline: DocumentTemplateStructure | undefined) {
  const created = await create(template, { title: 'Renamed regional working document' });
  expect(created.status, `${template.entryId}: ${JSON.stringify(created.body)}`).toBe(201);
  const doc = created.body.document;
  const expectedSource = { id: template.id, entryId: template.entryId, version: 1,
    kind: template.kind, aiDraftable: template.aiDraftable, authoringMode: template.authoringMode,
    originalFormat: template.originalFormat, limitations: template.limitations, filingContext: template.filingContext };
  expect(doc).toMatchObject({ title: 'Renamed regional working document', template_id: template.id,
    module: template.module, client_program_id: PROGRAM, c2c_document_id: null, status: 'draft', tenant_id: ORG,
    provenance: { source: 'template', governedWrite: 'unverified', templateSource: expectedSource } });
  expect(doc.provenance.templateSource.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(created.body.governance.bound).toBe(false);
  const saved = await sections(doc.id);
  expect(saved.length).toBeGreaterThan(0);
  expect(created.body.sections_seeded).toBe(saved.length);
  if (outline) expect(saved.map(section => [section.code, section.title]))
    .toEqual(outline.sections.map(section => [section.number, section.heading]));
  expect(saved.every(section => section.content === '' && section.doc_id === doc.id && section.tenant_id === ORG)).toBe(true);
  const audits = (await db.pglite.query<{ section_id: string; metadata: { templateSource: unknown; templateGuidance: { guidance_text: string } } }>(
    "SELECT section_id,metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='CREATE'", [doc.id, ORG])).rows;
  expect(audits).toHaveLength(saved.length);
  for (const section of saved) {
    const audit = audits.find(record => record.section_id === section.id)!;
    expect(audit.metadata.templateSource).toEqual(doc.provenance.templateSource);
    expect(audit.metadata.templateGuidance.guidance_text).toBeTypeOf('string');
    if (outline) expect(audit.metadata.templateGuidance.guidance_text)
      .toContain(outline.sections.find(row => row.number === section.code)!.purpose);
    const guidance = await author(request(app).get(`/api/authoring/guidance/${section.id}`));
    expect(guidance.status, JSON.stringify(guidance.body)).toBe(200);
    expect(guidance.body.template_guidance).toContainEqual(expect.objectContaining(audit.metadata.templateGuidance));
  }
  const reopened = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
  expect(reopened.status).toBe(200);
  expect(reopened.body.document.title).toBe('Renamed regional working document');
  expect(reopened.body.document.provenance.templateSource).toEqual(doc.provenance.templateSource);
  await verifySavedReview(doc.id, saved.length, doc.provenance.templateSource);
  return saved.length;
}

describe('every supported active biotech filing and component reaches the one editor', () => {
  it('lists exact registry and component identities with explicit regional scope, without writes', async () => {
    const before = await counts();
    const rows = await listed();
    for (const filing of filings) expect(rows).toContainEqual(expect.objectContaining({
      entryId: `registry:${filing.id}`, category: 'Regulatory reference',
      filingContext: { registryId: filing.id, region: filing.region, agency: filing.agency },
    }));
    for (const component of components) expect(rows).toContainEqual(expect.objectContaining({ entryId: `component:${component.id}` }));
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
    expect(await counts()).toEqual(before);
  });

  it('creates and reopens all registry filings and existing biotech components with exact saved evidence', async () => {
    const before = await counts();
    const rows = await listed();
    let sectionCount = 0;
    for (const filing of filings) {
      const row = rows.find(template => template.entryId === `registry:${filing.id}`);
      expect(row, filing.id).toBeDefined();
      const outline = await getRegistryDocumentTemplate(filing.id);
      const module = outline?.ctdSection?.match(/^([1-5])(?:\.|$)/)?.[1];
      expect(row!.module).toBe(module ? `M${module}` : null);
      if (!componentTemplateIdForRegistry(filing.id)) expect(row).toMatchObject({ kind: 'preparation', aiDraftable: false });
      sectionCount += await verifyCopy(row!, outline);
    }
    for (const component of components) {
      const row = rows.find(template => template.entryId === `component:${component.id}`);
      expect(row, component.id).toBeDefined();
      sectionCount += await verifyCopy(row!, component);
    }
    const after = await counts();
    expect(after).toEqual({ docs: before.docs + filings.length + components.length,
      sections: before.sections + sectionCount, revisions: before.revisions + sectionCount,
      audits: before.audits + sectionCount, signatures: before.signatures });
    console.info('Global biotech editor HTTP probe', { filings: filings.length, components: components.length, sections: sectionCount });
  }, 180_000);


  it('loads missing-outline leaflet metadata as an explicitly limited empty preparation worksheet', async () => {
    const row = await selected('component:pil');
    expect(row).toMatchObject({ kind: 'preparation', aiDraftable: false, module: null,
      filingContext: { registryId: null, region: 'EU', agency: 'EMA' } });
    expect(row.limitations.join(' ')).toMatch(/no indexed canonical PIL outline/i);
    const created = await create(row);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const saved = await sections(created.body.document.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ code: 'preparation', content: '' });
    expect(saved[0].title).not.toMatch(/qualitative|quantitative|pharmaceutical|particulars/i);
    expect(created.body.document.provenance.templateSource.filingContext).toEqual(row.filingContext);
    await verifySavedReview(created.body.document.id, saved.length, created.body.document.provenance.templateSource);
  });

  it('retains null module for ordinal documents and exact Module 3 for explicit CTD components', async () => {
    expect(await selected('component:protocol')).toMatchObject({ module: null, filingContext: { registryId: null, region: 'GLOBAL', agency: 'ICH' } });
    expect(await selected('component:drug_substance')).toMatchObject({ module: 'M3', filingContext: { registryId: null, region: 'GLOBAL', agency: 'ICH' } });
    expect(await selected('registry:EU_CTA')).toMatchObject({ module: null, filingContext: { registryId: 'EU_CTA', region: 'EU', agency: 'EMA' } });
  });
});

describe('regional starts preserve current actor, project and atomic creation boundaries', () => {

  it('fails listing explicitly when mandatory builtin sources are unavailable, without returning an empty catalogue', async () => {
    const before = await counts();
    const failure = vi.spyOn(builtinTemplates, 'getBuiltinAuthoringTemplates').mockRejectedValueOnce(new Error('Injected mandatory regional source outage'));
    try {
      const response = await author(request(app).get('/api/authoring/templates'));
      expect(response.status).toBe(500);
      expect(response.body.success).not.toBe(true);
      expect(response.body.templates).toBeUndefined();
      expect(await counts()).toEqual(before);
    } finally { failure.mockRestore(); }
  });

  it('refuses creation before writes when the exact mandatory builtin source cannot be resolved', async () => {
    const row = await selected('registry:EU_CTA');
    const before = await counts();
    const failure = vi.spyOn(builtinTemplates, 'getBuiltinAuthoringTemplate').mockRejectedValueOnce(new Error('Injected exact source resolution failure'));
    try {
      const response = await create(row);
      expect(response.status).toBe(500);
      expect(response.body.document).toBeUndefined();
      expect(await counts()).toEqual(before);
    } finally { failure.mockRestore(); }
  });

  it.each(['module', 'foreign-project'] as const)('refuses %s without any authoring evidence', async problem => {
    const row = await selected('component:drug_substance');
    const before = await counts();
    const response = await create(row, problem === 'module' ? { module: 'M1' } : { client_program_id: OTHER_PROGRAM });
    expect(response.status).toBe(problem === 'module' ? 400 : 404);
    expect(await counts()).toEqual(before);
  });

  it.each(['revoked', 'reader'] as const)('refuses a current %s membership despite the old JWT', async mode => {
    const row = await selected('registry:CA_CTA');
    const before = await counts();
    if (mode === 'revoked') await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
    else await db.pool.query("UPDATE organization_users SET role='reader' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
    try {
      expect((await create(row)).status).toBe(403);
      expect(await counts()).toEqual(before);
    } finally {
      await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
      await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]);
    }
  });

  it('rolls back a multi-section regional copy when the second section fails', async () => {
    const row = await selected('registry:JP_CTN');
    await db.pool.query(`CREATE FUNCTION fail_global_template_section() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.order_index=1 AND EXISTS(SELECT 1 FROM authoring_documents WHERE id=NEW.doc_id AND title='Rollback regional template')
      THEN RAISE EXCEPTION 'Injected template section failure'; END IF; RETURN NEW; END $$`);
    await db.pool.query('CREATE TRIGGER fail_global_template_section BEFORE INSERT ON authoring_sections FOR EACH ROW EXECUTE FUNCTION fail_global_template_section()');
    const before = await counts();
    try {
      expect((await create(row, { title: 'Rollback regional template' })).status).toBe(500);
      expect(await counts()).toEqual(before);
    } finally { await db.pool.query('DROP TRIGGER fail_global_template_section ON authoring_sections'); }
  });
});


describe('the existing AnA template tool resolves exact editor UUIDs with scope and complete pages', () => {
  it.each(['US_BLA', 'CA_CTA', 'EU_CTA', 'JP_CTN'])('reads the same %s heading and reference context through every bounded page', async registryId => {
    const row = await selected(`registry:${registryId}`);
    const filing = filings.find(entry => entry.id === registryId)!;
    const outline = await getRegistryDocumentTemplate(registryId);
    const items: Array<{ kind: string; code?: string; title?: string; text?: string; characterOffset?: number; nextCharacterOffset?: number | null; totalCharacters?: number }> = [];
    let offset = 0;
    for (let page = 0; page < 600; page++) {
      const raw = await documentTemplateTool({ template_id: row.id, market: filing.region, registry_id: filing.id, offset, limit: 30 });
      expect(raw.length).toBeLessThanOrEqual(5000);
      const result = JSON.parse(raw);
      expect(result.error, raw).toBeUndefined();
      expect(result).toMatchObject({ ok: true, template: { id: row.id, entryId: row.entryId, filingContext: row.filingContext } });
      expect(result.items.length).toBeGreaterThan(0);
      items.push(...result.items);
      if (result.nextOffset === null) {
        expect(items).toHaveLength(result.total);
        expect(items.filter(item => item.kind === 'heading').map(item => [item.code, item.title]))
          .toEqual(outline!.sections.map(section => [section.number, section.heading]));
        for (const section of outline!.sections) {
          const guidance = items.filter(item => item.kind === 'guidance' && item.code === section.number);
          expect(guidance.map(item => item.text).join('')).toContain(section.purpose);
          expect(items.filter(item => item.kind === 'reference' && item.code === section.number).map(item => item.text).join(''))
            .toBe(outline!.regulatoryBasis);
        }
        const preparation = items.filter(item => item.kind === 'preparation');
        const completePreparation = preparation.map(item => item.text).join('');
        let characterOffset = 0;
        for (const part of preparation) {
          expect(part.characterOffset).toBe(characterOffset);
          expect(part.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
          characterOffset += part.text!.length;
          expect(part.totalCharacters).toBe(completePreparation.length);
          expect(part.nextCharacterOffset).toBe(characterOffset < completePreparation.length ? characterOffset : null);
        }
        expect(JSON.parse(completePreparation)).toEqual(buildDocumentPreparation({ registryId, market: filing.region as 'US' | 'CA' | 'EU' | 'JP' }));
        return;
      }
      expect(result.nextOffset).toBeGreaterThan(offset);
      offset = result.nextOffset;
    }
    throw new Error('Exact regional UUID reference pagination did not terminate');
  });

  it.each([
    { market: 'US' }, { registry_id: 'JP_CTN' }, { family: 'estar' }, { registry_id: 'US_510K' },
  ])('refuses conflicting regional UUID scope rather than relabeling its source: %j', async conflict => {
    const row = await selected('registry:EU_CTA');
    const result = JSON.parse(await documentTemplateTool({ template_id: row.id, ...conflict }));
    expect(result.error).toBeTypeOf('string');
    expect(result.ok).toBeUndefined();
    expect(result.items).toBeUndefined();
  });

  it('accepts a confirmed market for a shared ICH component while retaining its GLOBAL source identity', async () => {
    const row = await selected('component:drug_substance');
    const result = JSON.parse(await documentTemplateTool({ template_id: row.id, market: 'CA', registry_id: 'CA_NDS' }));
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ ok: true, template: { id: row.id,
      filingContext: { registryId: null, region: 'GLOBAL', agency: 'ICH' } } });
  });
});
