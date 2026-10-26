import { describe, expect, it } from 'vitest';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';

describe('blank CRF design and annotation in the existing template library', () => {
  it.each(['blank_crf', 'crf_annotation_worksheet'])('resolves %s to an empty editable working outline', async id => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`component:${id}`));
    expect(template).toBeDefined();
    expect(template!.module).toBeNull();
    expect(template!.aiDraftable).toBe(true);
    expect(template!.filingContext?.region).toBe('GLOBAL');
    expect(template!.sections.length).toBeGreaterThan(5);
    expect(template!.sections.every(section => section.content === '')).toBe(true);
    expect(template!.limitations.join(' ')).toMatch(/completed.*patient.*original/i);
    expect(template!.limitations.join(' ')).toMatch(/EDC/i);
  });

  it('carries the essential CRF specification and distinct annotation work', async () => {
    const blank = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('component:blank_crf'));
    const annotation = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('component:crf_annotation_worksheet'));
    const text = blank?.sections.map(section => section.guidance.guidance_text).join(' ');
    for (const detail of ['visit', 'codelist', 'repeat', 'edit check', 'specimen', 'adverse', 'version']) expect(text).toContain(detail);
    expect(annotation?.sections.map(section => section.guidance.guidance_text).join(' ')).toMatch(/SDTM.*mapping/);
    expect(blank?.id).not.toBe(annotation?.id);
  });
});
