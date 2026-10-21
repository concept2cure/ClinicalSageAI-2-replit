/** Whole-document oversight follows each saved assembly receipt, not its parent template. */
import { describe, expect, it } from 'vitest';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../authoring/builtin-authoring-templates';
import { builtinTemplateSource, builtinTemplateSectionMetadata } from '../../authoring/authoring-template-sections';
import { pg, DOCUMENT, PROGRAM, OTHER_PROGRAM, OTHER_DOCUMENT, sectionId, COHERENT, statements, review, denied,
  replaceSections, walkPages, type ReviewItem } from './_saved-document-critique-fixture';

const PARENT = 'registry:EU_IVDR';
const ASSEMBLED = 'component:performance_evaluation_report';
const MANUAL = 'component:ivdr_gspr_checklist';
type Metadata = Awaited<ReturnType<typeof assemblyMetadata>>;
interface TemplateReviewItem extends ReviewItem {
  templateId?: string;
  field?: string;
  itemIndex?: number;
  text?: string;
  partOffset?: number;
  nextPartOffset?: number | null;
}
const references = (items: ReviewItem[]): TemplateReviewItem[] => items.filter(item => item.kind === 'template-reference');

async function assemblyMetadata(entryId = ASSEMBLED) {
  const template = (await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(entryId)))!;
  const source = builtinTemplateSource(template)!;
  const metadata = builtinTemplateSectionMetadata(template, source, template.sections[0].code);
  return { ...metadata, templateGuidance: { ...metadata.templateGuidance! }, assembly: {
    version: 1, docId: DOCUMENT, programId: PROGRAM, templateId: template.id,
    templateSnapshot: source.sha256, fingerprint: 'a'.repeat(64),
  }, templateSource: source };
}

async function storeMetadata(metadata: unknown, n = 1, at = '2026-10-01') {
  await pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,actor_email,metadata,created_at)
    VALUES($1,$2,7,'CREATE','owner@example.test',$3,$4)`, [DOCUMENT, sectionId(n), JSON.stringify(metadata), at]);
}

async function seedAssembly(withParent = false) {
  await replaceSections(2);
  const parent = (await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(PARENT)))!;
  const source = withParent ? builtinTemplateSource(parent)! : null;
  await pg.query('UPDATE authoring_documents SET module=NULL,template_id=$1,provenance=$2 WHERE id=$3',
    [withParent ? parent.id : null, source ? JSON.stringify({ source: 'template', templateSource: source }) : null, DOCUMENT]);
  const metadata = await assemblyMetadata();
  await storeMetadata(metadata);
  return { parent, source, metadata };
}

describe('assembled section references retain their own exact source', () => {
  it.each([false, true])('reviews an assembled component with a missing/different parent template: %s', async withParent => {
    await replaceSections(2);
    const plain = await review();
    const { parent, source, metadata } = await seedAssembly(withParent);
    const { first, items } = await walkPages();
    expect(first.template).toEqual(withParent
      ? { id: parent.id, sourceState: 'recorded', kind: parent.kind, aiDraftable: parent.aiDraftable }
      : { id: null, sourceState: 'not-recorded' });
    const { limitations, ...identity } = metadata.templateSource;
    expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', sectionId: sectionId(1),
      templateId: metadata.templateSource.id, source: identity, limitationCount: limitations.length }));
    expect(references(items)).toContainEqual(expect.objectContaining({ sectionId: sectionId(1),
      templateId: metadata.templateSource.id, authority: 'recorded', sourceVerification: 'full-recorded',
      field: 'guidance_text', text: metadata.templateGuidance!.guidance_text }));
    for (const limit of limitations) expect(references(items)).toContainEqual(expect.objectContaining({
      sectionId: sectionId(1), templateId: metadata.templateSource.id, field: 'limitations', text: limit }));
    expect(first.documentScore).toBe(plain.documentScore);
    expect(first.precisionVerdict).toBe(plain.precisionVerdict);
    expect(first.coverage?.textChars).toBe(COHERENT.length * 2);
    const saved = await pg.query<{ template_id: string | null; provenance: unknown }>(
      'SELECT template_id,provenance FROM authoring_documents WHERE id=$1', [DOCUMENT]);
    expect(saved.rows[0].template_id).toBe(withParent ? parent.id : null);
    expect(saved.rows[0].provenance).toEqual(source ? { source: 'template', templateSource: source } : null);
    expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  });

  it('retains separate narrative/manual component eligibility and regional scope without inferring a parent', async () => {
    const { metadata } = await seedAssembly();
    const manual = await assemblyMetadata(MANUAL);
    await storeMetadata(manual, 2);
    const { first, items } = await walkPages();
    expect(first.template).toEqual({ id: null, sourceState: 'not-recorded' });
    for (const [n, saved] of [[1, metadata], [2, manual]] as const) {
      expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', sectionId: sectionId(n),
        templateId: saved.templateSource.id, source: expect.objectContaining({
          entryId: saved.templateSource.entryId, originalFormat: saved.templateSource.originalFormat,
          aiDraftable: saved.templateSource.aiDraftable, filingContext: saved.templateSource.filingContext,
        }) }));
    }
    expect(metadata.templateSource.aiDraftable).toBe(true);
    expect(manual.templateSource.aiDraftable).toBe(false);
  });

  it('keeps the earliest assembly reference when a later CREATE records another source', async () => {
    const { metadata } = await seedAssembly();
    await storeMetadata(await assemblyMetadata(MANUAL), 1, '2026-10-03');
    const { items } = await walkPages();
    const sources: TemplateReviewItem[] = items.filter(item => item.kind === 'template-source');
    expect(sources).toContainEqual(expect.objectContaining({ sectionId: sectionId(1), templateId: metadata.templateSource.id }));
    expect(sources.some(item => item.templateId === builtinAuthoringTemplateId(MANUAL))).toBe(false);
  });

  it.each(['registry:CA_MDL', 'registry:JP_NINTEI', 'registry:JP_IVD_APPROVAL'])('retains exact regional preparation source %s without a parent template', async entryId => {
    await seedAssembly();
    const metadata = await assemblyMetadata(entryId);
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
    const { first, items } = await walkPages();
    expect(first.template).toEqual({ id: null, sourceState: 'not-recorded' });
    expect(metadata.templateSource.aiDraftable).toBe(false);
    expect(items).toContainEqual(expect.objectContaining({ kind: 'template-source', sectionId: sectionId(1),
      templateId: metadata.templateSource.id, source: expect.objectContaining({ entryId,
        aiDraftable: false, filingContext: metadata.templateSource.filingContext,
        originalFormat: metadata.templateSource.originalFormat, authoringMode: metadata.templateSource.authoringMode }) }));
  });
});

describe('section-scoped limits participate in bounded review and snapshots', () => {
  it.each(['bytes', 'items'] as const)('refuses excessive mandatory section reference %s instead of dropping its limits', async limit => {
    const { metadata } = await seedAssembly();
    metadata.templateSource.limitations = limit === 'bytes' ? ['é'.repeat(4 * 1024 * 1024 + 1)]
      : Array.from({ length: 20001 }, (_, i) => `Retain section original ${i}.`);
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
    await denied();
  });

  it('pages exact long escaped Unicode guidance and limits using the section template identity', async () => {
    const { metadata } = await seedAssembly();
    const long = 'Retain "original" \\ source 👩🏾‍🔬 🧪; worksheet ≠ signed record.\n'.repeat(120);
    metadata.templateSource.limitations = [long];
    metadata.templateGuidance!.guidance_text = long;
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
    const { pages, items } = await walkPages();
    expect(pages.length).toBeGreaterThan(1);
    for (const field of ['limitations', 'guidance_text']) {
      const parts = references(items).filter(item => item.sectionId === sectionId(1) && item.field === field && item.itemIndex === 0);
      expect(parts.map(item => item.text).join('')).toBe(long);
      let offset = 0;
      for (const part of parts) {
        const text = part.text ?? '';
        expect(part.templateId).toBe(metadata.templateSource.id);
        expect(part.partOffset).toBe(offset);
        expect(text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
        offset += text.length;
        expect(part.nextPartOffset).toBe(offset < long.length ? offset : null);
      }
    }
  });

  it.each(['limit', 'identity', 'eligibility', 'format', 'guidance', 'receipt'] as const)(
    'invalidates continuation after section %s drift without an authored-text change', async changed => {
      const { metadata } = await seedAssembly();
      const first = await review();
      expect(first.complete).toBe(true);
      if (changed === 'limit') metadata.templateSource.limitations = ['Changed section original-record limit.'];
      if (changed === 'identity') {
        metadata.templateSource.sha256 = 'b'.repeat(64);
        metadata.assembly.templateSnapshot = metadata.templateSource.sha256;
      }
      if (changed === 'eligibility') metadata.templateSource.aiDraftable = !metadata.templateSource.aiDraftable;
      if (changed === 'format') metadata.templateSource.originalFormat = 'changed-original-format';
      if (changed === 'guidance') metadata.templateGuidance!.guidance_text = 'Changed section-specific requirements.';
      if (changed === 'receipt') metadata.assembly.fingerprint = 'b'.repeat(64);
      await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
      await denied({ offset: 1, expected_snapshot: first.snapshotSha256 });
      expect((await pg.query<{ updated_at: Date }>('SELECT updated_at FROM authoring_documents WHERE id=$1', [DOCUMENT])).rows[0].updated_at)
        .toEqual(new Date('2026-10-02T00:00:00Z'));
    },
  );
});

describe('invalid section assembly provenance does not become a permissive fallback', () => {
  it('refuses a valid different program UUID on the saved section assembly receipt', async () => {
    const { metadata } = await seedAssembly();
    metadata.assembly.programId = OTHER_PROGRAM;
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
    await denied();
  });

  it.each(['document', 'template', 'snapshot', 'program', 'fingerprint', 'guide', 'source', 'scope'] as const)(
    'refuses malformed or contradictory assembly %s with no parent template', async changed => {
      const { metadata } = await seedAssembly();
      const invalid = metadata as Metadata & Record<string, unknown>;
      if (changed === 'document') metadata.assembly.docId = OTHER_DOCUMENT;
      if (changed === 'template') metadata.assembly.templateId = builtinAuthoringTemplateId(MANUAL);
      if (changed === 'snapshot') metadata.assembly.templateSnapshot = 'b'.repeat(64);
      if (changed === 'program') metadata.assembly.programId = 'not-a-program';
      if (changed === 'fingerprint') metadata.assembly.fingerprint = 'not-a-plan';
      if (changed === 'guide') Reflect.deleteProperty(invalid, 'templateGuidance');
      if (changed === 'source') delete (invalid.templateSource as Partial<Metadata['templateSource']>).originalFormat;
      if (changed === 'scope') metadata.templateSource.filingContext!.registryId = 'JP_SHONIN';
      await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(invalid), sectionId(1)]);
      await denied();
    },
  );

  it.each([false, true])('refuses stored-template assembly without recorded source/guidance rather than using the parent: %s', async withParent => {
    const { metadata } = await seedAssembly(withParent);
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify({
      template_id: metadata.assembly.templateId, seeded: true, template_store: 'organization', assembly: metadata.assembly,
    }), sectionId(1)]);
    statements.length = 0;
    await denied();
    expect(statements.some(sql => /FROM template_guidance\b/.test(sql))).toBe(false);
  });

  it('refuses a wrong-document assembly receipt even with a valid unrelated parent source', async () => {
    const { metadata } = await seedAssembly(true);
    metadata.assembly.docId = OTHER_DOCUMENT;
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
    await denied();
  });

  it.each([17, ['malformed'], 'malformed'])('refuses present malformed section provenance metadata: %j', async metadata => {
    await seedAssembly();
    await pg.query('UPDATE authoring_audit_trail SET metadata=$1 WHERE section_id=$2', [JSON.stringify(metadata), sectionId(1)]);
    await denied();
  });

  it('refuses an unavailable earliest CREATE store instead of treating section references as absent', async () => {
    await seedAssembly();
    await pg.exec('ALTER TABLE authoring_audit_trail RENAME TO held_assembly_audit_trail');
    try { await denied(); }
    finally { await pg.exec('ALTER TABLE held_assembly_audit_trail RENAME TO authoring_audit_trail'); }
  });

  it('checks current access before reading null-parent assembly references', async () => {
    await seedAssembly();
    await pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE principal_id='7'");
    statements.length = 0;
    await denied();
    expect(statements.some(sql => /FROM authoring_audit_trail\b/.test(sql))).toBe(false);
  });
});
