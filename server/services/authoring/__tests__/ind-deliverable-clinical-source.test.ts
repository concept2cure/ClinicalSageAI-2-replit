import { describe, expect, it } from 'vitest';
import { getIndAuthoringTemplate, getIndAuthoringTemplates, indTemplateId } from '../ind-authoring-templates';

function selected(entry: string) {
  const template = getIndAuthoringTemplate(indTemplateId(entry));
  if (!template) throw new Error(`Missing existing IND start ${entry}`);
  return template;
}

describe('exact IND clinical deliverable source selection', () => {
  it('uses the protocol structure for the early protocol rather than the broad CSR filing container', () => {
    const early = selected('phase5.protocol_outline:deliverable:0');
    const final = selected('phase5.protocol_finalize:deliverable:0');
    expect(early.sections.some(row => row.title === '1.1 Protocol Synopsis')).toBe(true);
    expect(early.sections.some(row => row.title === '8.7 Immunogenicity Assessments')).toBe(true);
    expect(early.sections.slice(1).map(row => row.title)).toEqual(final.sections.slice(1).map(row => row.title));
    expect(early.sections.some(row => row.guidance.source_reference.includes('csr-e3-guidance'))).toBe(false);
    expect(early.id).toBe('500e2c6c-1f4f-5402-91ae-4f1d8595a1de');
    expect(early.module).toBe('M5');
  });

  it.each(['phase5.protocol_outline:deliverable:0', 'phase5.protocol_finalize:deliverable:0'])(
    'retains original title/approval records and generated index policy in %s', id => {
      const protocol = selected(id);
      for (const code of ['title_page', 'table_of_contents']) {
        const row = protocol.sections.find(section => section.guidance.source_reference.endsWith(`#${code}`));
        expect(row?.guidance.drafting_mode).toBe('manual');
      }
      expect(protocol.sections.find(row => row.title === '1.1 Protocol Synopsis')?.guidance.drafting_mode).toBe('narrative');
    },
  );

  it('reaches the existing full SAP planning structure without inventing a CTD placement', () => {
    const sap = selected('phase5.design:deliverable:1');
    expect(sap.sections).toHaveLength(10);
    expect(sap.sections.map(row => row.title)).toContain('Analysis Populations');
    expect(sap.sections.map(row => row.title)).toContain('Handling of Missing Data');
    expect(sap.sections.map(row => row.title)).toContain('Sensitivity and Supplementary Analyses');
    expect(sap.module).toBeNull();
    expect(sap.sections.every(row => row.code.startsWith('work:sap:') && row.content === '')).toBe(true);
    expect(sap.sections.every(row => row.guidance.source_reference === 'project-blueprint:ICH_SAP:ich_sap_sections')).toBe(true);
  });

  it('preserves the actual broad study-report container and every existing IND identity', () => {
    const broad = selected('section:m5.3.5');
    expect(broad.sections.some(row => row.guidance.source_reference.includes('csr-e3-guidance'))).toBe(true);
    const templates = getIndAuthoringTemplates();
    expect(templates).toHaveLength(200);
    expect(new Set(templates.map(row => row.id)).size).toBe(200);
  });
});
