import { createSourceHash } from './cmc-module3-compiler';

export type CmcSourceType =
  | 'drug_substance'
  | 'drug_product'
  | 'specification'
  | 'method'
  | 'stability'
  | 'batch'
  | 'change_control'
  | 'comparability'
  | 'manufacturing_process'
  | 'characterization'
  | 'reference_standard'
  | 'container_closure'
  | 'excipient';

export interface CanonicalSource {
  id: string;
  sourceType: CmcSourceType;
  sourcePayload: Record<string, any>;
  sourceHash?: string;
}

export interface ComposedSection {
  sectionKey: string;
  sectionPath: string;
  structuredPayload: Record<string, any>;
  narrativeDraft: string;
  completeness: number;
  missingInputs: string[];
  lineage: Array<{ sourceObjectId: string; sourceHashAtCompile: string }>;
}

interface SectionRule {
  sectionKey: string;
  requiredSourceTypes: CmcSourceType[];
  requiredFields: string[];
}

export const MODULE3_SECTION_RULES: SectionRule[] = [
  // --- Drug Substance (S) subsections ---
  { sectionKey: '3.2.S.1', requiredSourceTypes: ['drug_substance'], requiredFields: ['name', 'manufacturer'] },
  { sectionKey: '3.2.S.2', requiredSourceTypes: ['drug_substance', 'manufacturing_process'], requiredFields: ['manufacturingRoute', 'processDescription', 'processControls'] },
  { sectionKey: '3.2.S.3', requiredSourceTypes: ['drug_substance', 'characterization'], requiredFields: ['structuralElucidation', 'physicochemicalProperties', 'biologicalActivity'] },
  { sectionKey: '3.2.S.4', requiredSourceTypes: ['specification', 'method'], requiredFields: ['acceptanceCriteria', 'validationStatus'] },
  { sectionKey: '3.2.S.5', requiredSourceTypes: ['drug_substance', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.S.6', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
  { sectionKey: '3.2.S.7', requiredSourceTypes: ['stability'], requiredFields: ['timePoints', 'storageCondition'] },
  // --- Drug Product (P) subsections ---
  { sectionKey: '3.2.P.1', requiredSourceTypes: ['drug_product'], requiredFields: ['dosageFormDescription', 'composition', 'strength'] },
  { sectionKey: '3.2.P.2', requiredSourceTypes: ['drug_product', 'drug_substance', 'comparability'], requiredFields: ['formulationDevelopment', 'manufacturingProcessDev', 'containerClosureStudies'] },
  { sectionKey: '3.2.P.3', requiredSourceTypes: ['drug_product', 'batch', 'change_control'], requiredFields: ['formulation', 'batchNumber'] },
  { sectionKey: '3.2.P.4', requiredSourceTypes: ['excipient'], requiredFields: ['excipientSpecifications', 'excipientAnalyticalProcedures'] },
  { sectionKey: '3.2.P.5', requiredSourceTypes: ['specification', 'method'], requiredFields: ['releaseCriteria', 'methodName'] },
  { sectionKey: '3.2.P.6', requiredSourceTypes: ['drug_product', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.P.7', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
  { sectionKey: '3.2.P.8', requiredSourceTypes: ['stability', 'comparability'], requiredFields: ['shelfLifeClaim', 'comparabilityStatus'] },
];

export function composeModule3FromCanonicalSources(sourceObjects: CanonicalSource[]): ComposedSection[] {
  return MODULE3_SECTION_RULES.map((rule) => {
    const matched = sourceObjects.filter((s) => rule.requiredSourceTypes.includes(s.sourceType));
    const structuredPayload = {
      sectionKey: rule.sectionKey,
      sourceTypes: rule.requiredSourceTypes,
      sourceObjects: matched.map((m) => ({ type: m.sourceType, payload: m.sourcePayload })),
    };

    const availableFields = new Set(
      matched.flatMap((m) => Object.keys(m.sourcePayload || {}))
    );
    const missingInputs = rule.requiredFields.filter((field) => !availableFields.has(field));
    const completeness = rule.requiredFields.length === 0
      ? 100
      : Math.round(((rule.requiredFields.length - missingInputs.length) / rule.requiredFields.length) * 100);

    const lineage = matched.map((m) => ({
      sourceObjectId: m.id,
      sourceHashAtCompile: m.sourceHash || createSourceHash(m.sourcePayload),
    }));

    const narrativeDraft = `Section ${rule.sectionKey} assembled from ${matched.length} canonical source objects. Missing inputs: ${
      missingInputs.length > 0 ? missingInputs.join(', ') : 'none'
    }.`;

    return {
      sectionKey: rule.sectionKey,
      sectionPath: rule.sectionKey,
      structuredPayload,
      narrativeDraft,
      completeness,
      missingInputs,
      lineage,
    };
  });
}

export function impactedSectionsForSourceType(changedSourceType: CmcSourceType): string[] {
  return MODULE3_SECTION_RULES
    .filter((rule) => rule.requiredSourceTypes.includes(changedSourceType))
    .map((rule) => rule.sectionKey);
}
