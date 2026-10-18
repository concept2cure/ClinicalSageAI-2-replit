/** Large existing IND outlines use append assembly, independently of from-draft limits. */
import { describe, expect, it } from 'vitest';
import { buildAssemblyPlan, type AssemblyDocument, type AssemblyTemplate } from '../authoring-assembly-plan';
import { getIndAuthoringTemplates, indTemplateSnapshot } from '../ind-authoring-templates';
import { getBuiltinAuthoringTemplates } from '../builtin-authoring-templates';

describe('complete existing IND template assembly', () => {
  it('plans the full existing Module 5 outline instead of imposing the unrelated from-draft 200-section cap', () => {
    const existing = getIndAuthoringTemplates().find(template => template.module === 'M5' && template.sections.length > 200)!;
    expect(existing).toBeDefined();
    const doc: AssemblyDocument = { id: 'aaaaaaaa-0000-4000-8000-000000000001', module: 'M5',
      client_program_id: 'bbbbbbbb-0000-4000-8000-000000000001', status: 'draft' };
    const template: AssemblyTemplate = { id: existing.id, name: existing.name, sections: existing.sections,
      snapshot: indTemplateSnapshot(existing), draftRegion: 'FDA', aiDraftable: existing.aiDraftable,
      aiDraftableReason: 'Recorded canonical template', limitations: existing.limitations,
      metadataFor: () => ({}), guidanceFor: code => existing.sections.find(section => section.code === code)?.guidance.guidance_text };
    const planned = buildAssemblyPlan(doc, [], template, { programId: doc.client_program_id, templateId: existing.id, selection: { target: 'document' } });
    expect(planned.rows).toHaveLength(existing.sections.length);
    expect(planned.rows.every((row, index) => row.disposition === 'append' && row.ordering === index && row.content === '')).toBe(true);
    expect(planned.rows.map(row => row.code)).toEqual(existing.sections.map(row => row.code));
  });

  it('can plan every existing universal builtin outline without writing rows or claiming generated content', async () => {
    const templates = await getBuiltinAuthoringTemplates();
    expect(templates.length).toBeGreaterThan(0);
    let sections = 0;
    for (const existing of templates) {
      const doc: AssemblyDocument = { id: 'aaaaaaaa-0000-4000-8000-000000000001', module: existing.module,
        client_program_id: 'bbbbbbbb-0000-4000-8000-000000000001', status: 'draft' };
      const template: AssemblyTemplate = { id: existing.id, name: existing.name, sections: existing.sections,
        snapshot: indTemplateSnapshot(existing), draftRegion: null, aiDraftable: false,
        aiDraftableReason: 'Pure planning test; generation eligibility is tested through HTTP separately.', limitations: existing.limitations,
        metadataFor: () => ({}), guidanceFor: () => undefined };
      const planned = buildAssemblyPlan(doc, [], template, { programId: doc.client_program_id, templateId: existing.id, selection: { target: 'document' } });
      expect(planned.rows.length, existing.name).toBe(existing.sections.length);
      expect(planned.rows.every((row, index) => row.ordering === index && row.disposition === 'append' && row.content === ''), existing.name).toBe(true);
      sections += planned.rows.length;
    }
    console.info('Pure universal assembly plan coverage', { templates: templates.length, sections, maximumOutline: Math.max(...templates.map(row => row.sections.length)) });
  });
});
