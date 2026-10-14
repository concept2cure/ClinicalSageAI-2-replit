/** Display projections of the canonical IND pyramid and section tree, never
 * an independent document registry or a declaration of filing readiness. */
export interface IndDocumentCatalogPhase { id: string; name: string; order: number }
export interface IndAuthoringTemplateRef {
  id: string; title: string; module: string | null; sectionCount: number;
  kind: 'narrative' | 'preparation'; aiDraftable: boolean; authoringMode: string;
  originalFormat: string; limitations: string[];
}
export interface IndDocumentCatalogSection {
  id: string; code: string; title: string; module: string; parentCode: string | null;
  taskId: string | null; phaseId: string | null; required: boolean; aiDraftable: boolean;
  authoringMode: string; description: string; regulatoryRef: string;
  template?: IndAuthoringTemplateRef;
}
export interface IndDocumentCatalogDeliverable {
  id: string; title: string; phaseId: string; phaseName: string; taskId: string; taskName: string;
  module: string | null; sectionCodes: string[]; artifactTypes: string[]; description: string | null;
  /** Canonical form/data/manual limits, plus official signed/receipt outputs,
   * apply to the narrative-draft offer. All types remain available for intake. */
  aiDraftable: boolean;
  template?: IndAuthoringTemplateRef;
  guidance: { fdaGuidanceRef?: string; ichGuideline?: string; cfrReference?: string; keyConsiderations?: string[] } | null;
}
export interface IndDocumentCatalog {
  submissionType: 'IND'; phases: IndDocumentCatalogPhase[];
  sections: IndDocumentCatalogSection[]; deliverables: IndDocumentCatalogDeliverable[];
  moduleTemplates?: IndAuthoringTemplateRef[];
}
