/** Recorded per-section assembly guidance must not inherit a different parent template. */
import { describe, expect, it } from 'vitest';
import { templateGuidanceAfterAccess } from '../authoring-template-guidance';
import { getIndAuthoringTemplates } from '../ind-authoring-templates';
import { builtinTemplateSource, builtinTemplateSectionMetadata } from '../authoring-template-sections';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000001';
const SECTION = 'cccccccc-0000-4000-8000-000000000001';
const template = getIndAuthoringTemplates().find(row => row.module === 'M2' && row.aiDraftable)!;
const source = builtinTemplateSource(template)!;
const metadata = () => ({ ...builtinTemplateSectionMetadata(template, source, template.sections[0].code), assembly: {
  version: 1, docId: DOC, programId: PROGRAM, templateId: template.id, templateSnapshot: source.sha256, fingerprint: 'a'.repeat(64),
} });
const q = { query: async () => { throw new Error('Recorded guidance must not query current-reference stores'); } };
const identity = { tenantId: 1, docId: DOC, sectionId: SECTION, templateId: null, code: template.sections[0].code };

describe('exact assembly template guidance receipts', () => {
  it('returns selected-section guidance while preserving the absent/different parent template', async () => {
    const result = await templateGuidanceAfterAccess(q, identity, { metadata: metadata() });
    expect(result.authority).toBe('recorded');
    expect(result.rows[0].template_id).toBe(template.id);
    expect(result.rows[0].template_source).toEqual(source);
    expect(identity.templateId).toBeNull();
  });

  it.each(['docId', 'programId', 'templateId', 'templateSnapshot', 'fingerprint'])('refuses an invalid recorded %s instead of falling back to another template', async key => {
    const invalid = metadata();
    Object.assign(invalid.assembly, { [key]: 'invalid' });
    await expect(templateGuidanceAfterAccess(q, identity, { metadata: invalid })).rejects.toMatchObject({ status: 503 });
  });

  it('refuses a different otherwise valid document identity', async () => {
    const invalid = metadata(); invalid.assembly.docId = PROGRAM;
    await expect(templateGuidanceAfterAccess(q, identity, { metadata: invalid })).rejects.toMatchObject({ status: 503 });
  });

  it('refuses a different otherwise valid snapshot', async () => {
    const invalid = metadata(); invalid.assembly.templateSnapshot = 'b'.repeat(64);
    await expect(templateGuidanceAfterAccess(q, identity, { metadata: invalid })).rejects.toMatchObject({ status: 503 });
  });
});
