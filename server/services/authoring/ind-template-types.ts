import type { CTDModule } from '../../../services/regulatory/ind-ectd-sections';

/** Working outlines; guidance is reference material, never prefilled study facts. */
export interface IndTemplateOutlineSection {
  code: string;
  title: string;
  content: '';
  ordering: number;
  guidance: {
    guidance_text: string;
    regulatory_references: string[];
    compliance_checklist: string[];
    common_pitfalls: string[];
    source_reference: string;
  };
}

export interface IndAuthoringTemplate {
  id: string;
  entryId: string;
  name: string;
  module: CTDModule | null;
  kind: 'narrative' | 'preparation';
  aiDraftable: boolean;
  authoringMode: string;
  originalFormat: string;
  description: string;
  limitations: string[];
  version: 1;
  sections: IndTemplateOutlineSection[];
}
