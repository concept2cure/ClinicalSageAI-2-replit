import { describe, expect, it } from 'vitest';
import { documentTemplateTool } from '../document-template-tool';
import { getIndAuthoringTemplates } from '../../authoring/ind-authoring-templates';
import { documentSectionRequirements } from '../regulatory-knowledge-tools';

describe('AnA reads the same editor-loadable IND templates', () => {
  it('accepts the exact builtin template UUID discovered in the IND catalogue', async () => {
    const template = getIndAuthoringTemplates().find(t => t.entryId === 'section:m1.1.1')!;
    const page = JSON.parse(await documentTemplateTool({ template_id: template.id }));
    expect(page.outlineAvailable).toBe(true);
    expect(page.template.id).toBe(template.id);
    expect(page.template.kind).toBe('preparation');
  });

  it('pages complete reference requirements and headings without omitting middle entries', async () => {
    const template = getIndAuthoringTemplates().find(t => t.entryId === 'module:M3')!;
    const items: Array<{ kind: string; code: string; text?: string; characterOffset?: number }> = [];
    let offset = 0;
    let total: number;
    do {
      const raw = await documentTemplateTool({ template_id: template.id, offset, limit: 30 });
      expect(raw.length).toBeLessThanOrEqual(5000);
      const page = JSON.parse(raw);
      expect(page.error).toBeUndefined();
      expect(page.template.id).toBe(template.id);
      items.push(...page.items);
      total = page.total;
      if (page.nextOffset === null) break;
      expect(page.nextOffset).toBeGreaterThan(offset);
      offset = page.nextOffset;
    } while (offset < 10000);
    expect(items).toHaveLength(total);
    expect(items.filter(item => item.kind === 'heading').map(item => item.code)).toEqual(template.sections.map(row => row.code));
    for (const row of template.sections) {
      expect(items.filter(item => item.kind === 'guidance' && item.code === row.code).map(item => item.text).join('')).toBe(row.guidance.guidance_text);
      expect(items.filter(item => item.kind === 'source-requirement' && item.code === row.code).map(item => item.text)).toEqual(row.guidance.compliance_checklist);
    }
  });

  it.each([{ market: 'EU' }, { family: 'ctis' }, { registry_id: 'US_NDA' }, { offset: 999999 }])('refuses conflicting scope or invalid page %j', async input => {
    const template = getIndAuthoringTemplates()[0];
    expect(JSON.parse(await documentTemplateTool({ template_id: template.id, ...input })).error).toBeDefined();
  });

  it('makes every section and deliverable template ID discoverable through the existing IND requirement pages', () => {
    const ids: string[] = [];
    let offset = 0;
    do {
      const raw = documentSectionRequirements({ document: 'ind_pyramid', offset, limit: 40 });
      expect(raw.length).toBeLessThanOrEqual(5000);
      const page = JSON.parse(raw);
      ids.push(...page.entries.map((entry: { template_id: string }) => entry.template_id));
      if (page.nextOffset === null) break;
      offset = page.nextOffset;
    } while (offset < 10000);
    expect(new Set(ids)).toEqual(new Set(getIndAuthoringTemplates().filter(t => !t.entryId.startsWith('module:')).map(t => t.id)));
  });
});
