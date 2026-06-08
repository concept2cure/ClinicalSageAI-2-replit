/**
 * eSTAR readiness mapper (FDA 510(k) / De Novo — MedTech & IVD)
 *
 * Projects the canonical submission content onto the FDA eSTAR section structure
 * and reports completeness — which required eSTAR sections are present vs missing
 * — so a manufacturer sees CDRH-acceptance readiness (the RTA-style administrative
 * gate) before filling the eSTAR PDF.
 *
 * This is a READINESS / gap mapper. The actual eSTAR PDF-form fill lives in the
 * existing 510k-estar route; this complements it (the "is it complete?" check),
 * it does not duplicate the form rendering.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * section with no matching source leaf is a gap, never invented.
 *
 * @module server/services/pathway-engines/estar/estar-mapper
 */

export type EstarType = '510k' | 'de_novo';

export interface EstarInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
}

export interface EstarSlot {
  id: string;
  label: string;
  required: boolean;
}

export interface EstarSlotStatus extends EstarSlot {
  present: boolean;
  sources: string[];
}

export interface EstarResult {
  type: EstarType;
  sections: EstarSlotStatus[];
  summary: { missingRequired: string[]; ready: boolean };
}

type Matcher = (l: EstarInputLeaf) => boolean;
const dt = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const ti = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));

// Shared eSTAR administrative + technical spine (FDA eSTAR template).
const baseSlots: Array<EstarSlot & { match: Matcher }> = [
  { id: 'cover-letter', label: 'Cover letter / submission cover sheet', required: true, match: any(dt('cover_letter', 'cover_sheet'), ti('cover letter', 'cover sheet')) },
  { id: 'indications-for-use', label: 'Indications for use', required: true, match: any(dt('indications_for_use', 'ifu_statement'), ti('indications for use')) },
  { id: 'device-description', label: 'Device description', required: true, match: any(dt('device_description'), ti('device description')) },
  { id: 'proposed-labeling', label: 'Proposed labeling', required: true, match: any(dt('labeling', 'labelling', 'label', 'ifu'), ti('labeling', 'instructions for use')) },
  { id: 'biocompatibility', label: 'Biocompatibility', required: true, match: any(dt('biocompatibility'), ti('biocompatibilit')) },
  { id: 'sterilization', label: 'Sterilization / shelf life', required: false, match: any(dt('sterilization'), ti('steriliz', 'shelf life')) },
  { id: 'software', label: 'Software / firmware documentation', required: false, match: any(dt('software', 'firmware'), ti('software', 'firmware')) },
  { id: 'emc-electrical', label: 'EMC & electrical safety', required: false, match: any(dt('emc', 'electrical_safety'), ti('electromagnetic', 'electrical safety', 'emc')) },
  { id: 'performance-testing', label: 'Performance testing (bench / animal / clinical)', required: true, match: any(dt('performance_testing', 'bench_testing', 'clinical_testing'), ti('performance testing', 'bench test', 'clinical data')) },
  { id: 'standards-conformance', label: 'Declarations of conformity to standards', required: false, match: any(dt('standards_conformance', 'declaration_of_conformity'), ti('conformity', 'consensus standard')) },
];

const SLOTS_510K: Array<EstarSlot & { match: Matcher }> = [
  ...baseSlots,
  { id: 'substantial-equivalence', label: 'Substantial equivalence comparison (predicate)', required: true, match: any(dt('substantial_equivalence', 'predicate_comparison', '510k_predicate'), ti('substantial equivalence', 'predicate')) },
];

const SLOTS_DE_NOVO: Array<EstarSlot & { match: Matcher }> = [
  ...baseSlots,
  { id: 'classification-request', label: 'De Novo classification request & risk-to-benefit', required: true, match: any(dt('de_novo_request', 'classification_request'), ti('de novo', 'classification request')) },
  { id: 'special-controls', label: 'Proposed special controls', required: true, match: any(dt('special_controls'), ti('special controls')) },
];

function evalSlot(slot: EstarSlot & { match: Matcher }, leaves: EstarInputLeaf[]): EstarSlotStatus {
  const sources = leaves.filter((l) => slot.match(l)).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present: sources.length > 0, sources };
}

export interface MapToEstarInput {
  leaves: EstarInputLeaf[];
  type: EstarType;
}

/** Map canonical leaves onto the FDA eSTAR sections + completeness report. */
export function mapToEstar(input: MapToEstarInput): EstarResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const registry = input.type === 'de_novo' ? SLOTS_DE_NOVO : SLOTS_510K;
  const sections = registry.map((s) => evalSlot(s, leaves));
  const missingRequired = sections.filter((s) => s.required && !s.present).map((s) => s.id);
  return { type: input.type, sections, summary: { missingRequired, ready: missingRequired.length === 0 } };
}

export default { mapToEstar };
