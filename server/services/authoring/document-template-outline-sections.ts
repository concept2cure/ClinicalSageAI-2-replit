/** One pure projection of canonical document headings into saved editor guidance. */
import type { DocumentTemplateStructure } from '../market-specs/document-template-library';
import type { IndTemplateOutlineSection } from './ind-template-types';

const CLINICAL_MANUAL_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  protocol: ['title_page', 'table_of_contents', '1.2', '1.3'],
  investigators_brochure: ['table_of_contents'], statistical_analysis_plan: [],
  informed_consent: ['10'], dsur: ['7', 'appendices'], pbrer: ['6', '6.2', '6.3', '20'],
};

export function isClinicalWorkingComponent(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CLINICAL_MANUAL_SECTIONS, id);
}

/** Exact source identity and source code only; unknown documents gain no eligibility. */
export function clinicalSectionDraftingMode(componentId: string, code: string): 'manual' | 'narrative' {
  const manual = CLINICAL_MANUAL_SECTIONS[componentId];
  return !manual || manual.includes(code) ? 'manual' : 'narrative';
}

function sourceReference(outline: DocumentTemplateStructure): string {
  const source = outline.outlineSource;
  if (!source) return `server/services/market-specs/document-template-library.ts:${outline.id}`;
  if (source.kind === 'lifecycle-component' || source.kind === 'source-component') return `${source.kind}:${source.record}`;
  return 'blueprintId' in source
    ? `${source.kind}:${source.registryId}:${source.blueprintId}`
    : `${source.kind}:${source.registryId}:${source.record}`;
}

/** Front matter, then each section and its subsections, in the recorded order. */
export function documentTemplateOutlineSections(outline: DocumentTemplateStructure): IndTemplateOutlineSection[] {
  const flat: DocumentTemplateStructure['sections'] = [];
  const walk = (list: DocumentTemplateStructure['sections']) => { for (const s of list) { flat.push(s); if (s.subsections?.length) walk(s.subsections); } };
  walk([...(outline.frontMatter ?? []), ...outline.sections]);
  return flat.map((section, ordering) => ({
    code: section.number, title: section.heading, content: '', ordering,
    guidance: {
      ...(section.drafting_mode ? { drafting_mode: section.drafting_mode } : {}),
      guidance_text: `${section.purpose}\n\nExisting scaffold expectation: ${section.required ? 'marked required' : 'not marked required'}. This flag does not determine legal applicability or waive applicable content.`,
      regulatory_references: [outline.regulatoryBasis],
      compliance_checklist: [], common_pitfalls: [], source_reference: sourceReference(outline),
    },
  }));
}
