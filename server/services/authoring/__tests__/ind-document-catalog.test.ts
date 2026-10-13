import { describe, it, expect } from 'vitest';
import { buildIndDocumentCatalog } from '../ind-document-catalog';
import { buildIndPyramid } from '../../../../services/regulatory/pyramids/ind-pyramid';
import { getAllINDSections } from '../../../../services/regulatory/ind-ectd-sections';

describe('the editor catalogue derives the entire canonical IND work pyramid', () => {
  it('includes every phase and every task deliverable, including pre-IND work', () => {
    const canonical = buildIndPyramid();
    const catalogue = buildIndDocumentCatalog();
    expect(catalogue.phases).toEqual(canonical.phases.map(({ id, name, order }) => ({ id, name, order })));
    for (const task of canonical.tasks) {
      expect(catalogue.deliverables.filter(item => item.taskId === task.id && item.id.includes(':deliverable:')).map(item => item.title))
        .toEqual(task.deliverables ?? []);
      for (const subtask of task.subTasks ?? []) {
        const title = subtask.deliverable ?? subtask.documentBinding?.sectionTitle;
        if (title) expect(catalogue.deliverables).toContainEqual(expect.objectContaining({ title, taskId: task.id, id: `${task.id}:subtask:${subtask.id}` }));
      }
    }
    expect(catalogue.deliverables).toContainEqual(expect.objectContaining({ title: 'Target Product Profile', phaseId: 'phase1' }));
    expect(catalogue.deliverables.some(item => item.phaseId === 'phase2')).toBe(true);
  });

  it('includes every canonical IND section and preserves form/manual drafting limits', () => {
    const catalogue = buildIndDocumentCatalog();
    expect(catalogue.sections.map(item => item.code)).toEqual(getAllINDSections().filter(item => item.depth > 0).map(item => item.code));
    expect(new Set(catalogue.sections.map(item => item.module))).toEqual(new Set(['M1', 'M2', 'M3', 'M4', 'M5']));
    expect(catalogue.sections.find(item => item.title === 'Form FDA 1571')).toMatchObject({ aiDraftable: false, authoringMode: 'form' });
    expect(new Set(catalogue.deliverables.map(item => item.id)).size).toBe(catalogue.deliverables.length);
    expect(new Set(catalogue.sections.map(item => item.id)).size).toBe(catalogue.sections.length);
  });

  it('keeps official forms, signatures, datasets and agency receipts out of narrative-draft offers', () => {
    const catalogue = buildIndDocumentCatalog();
    const officialForms = catalogue.deliverables.filter(item => /1571|1572|3674/.test(item.title));
    expect(officialForms.length).toBeGreaterThanOrEqual(5);
    for (const item of officialForms) expect(item.aiDraftable, item.title).toBe(false);
    expect(catalogue.deliverables.find(item => item.title === 'FDA ESG submission acknowledgment')?.aiDraftable).toBe(false);
    expect(catalogue.deliverables.find(item => item.title === 'Stability protocols and data tables')?.aiDraftable).toBe(false);
    expect(catalogue.deliverables.find(item => item.title === 'Clinical Overview (2.5)')?.aiDraftable).toBe(true);
    expect(catalogue.deliverables.find(item => item.title === 'Target Product Profile')?.aiDraftable).toBe(true);
  });
});
