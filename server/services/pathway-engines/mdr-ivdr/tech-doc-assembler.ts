/**
 * MDR / IVDR technical-documentation engine (EU MedTech device & IVD)
 *
 * Projects the canonical submission content onto the EU technical-documentation
 * structure required by Regulation (EU) 2017/745 (MDR, Annex II/III) or
 * 2017/746 (IVDR, Annex II/III), and reports completeness — which required
 * tech-doc sections (incl. the GSPR / Performance Evaluation evidence) are
 * present vs missing — so a manufacturer sees Notified-Body readiness before
 * compiling EUDAMED.
 *
 * MDR/IVDR is NOT eCTD (spec §3) — this is the "one canonical core, many
 * projections" principle applied to the device/IVD pathway. It maps and
 * gap-checks; it does not submit to EUDAMED or a Notified Body.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * section with no matching source leaf is a gap, never invented.
 *
 * @module server/services/pathway-engines/mdr-ivdr/tech-doc-assembler
 */

export type EuRegulation = 'mdr' | 'ivdr';

/** A canonical leaf as tech-doc input (device docs are keyed by documentType). */
export interface TechDocInputLeaf {
  /** CTD section code or a device tech-doc code (free text). */
  sectionCode: string;
  title: string;
  /** Document-type hint, e.g. 'device_description', 'risk_management', 'cer', 'per'. */
  documentType?: string;
}

export interface TechDocSlot {
  id: string;
  label: string;
  /** The MDR/IVDR annex reference for this section. */
  annex: string;
  required: boolean;
}

export interface TechDocSlotStatus extends TechDocSlot {
  present: boolean;
  sources: string[];
}

export interface TechDocResult {
  regulation: EuRegulation;
  sections: TechDocSlotStatus[];
  summary: {
    missingRequired: string[];
    /** True when every required tech-doc section has a source leaf. */
    ready: boolean;
  };
}

type Matcher = (l: TechDocInputLeaf) => boolean;
const docType = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const titleHas = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const codeStarts = (...p: string[]): Matcher => (l) => p.some((x) => l.sectionCode.startsWith(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));
const all = (...m: Matcher[]): Matcher => (l) => m.every((f) => f(l));
const not = (m: Matcher): Matcher => (l) => !m(l);

/**
 * Rule-pack section keys — the codes the GOVERNED authoring store carries for
 * an EU technical file. These are the `key` values of the eu-mdr-2017-745 /
 * eu-ivdr-2017-746 outlines seeded by
 * migrations/20260810b_eu_mdr_ivdr_outlines.sql (Annex II §1–6, Annex III
 * PMS, and the conformity group IV). Without these matchers an authored
 * Annex II section reached the packager with no slot and was dropped.
 *
 * `annexKey('II.1')` claims the key itself and every dotted descendant
 * ('II.1.a', 'II.1.b', …) — and nothing else: 'II.10' is not under 'II.1'.
 */
const annexKey = (...keys: string[]): Matcher => (l) =>
  keys.some((k) => l.sectionCode === k || l.sectionCode.startsWith(`${k}.`));
const exactKey = (...keys: string[]): Matcher => (l) => keys.includes(l.sectionCode);

// Shared tech-doc spine (MDR Annex II & IVDR Annex II are structurally parallel).
const commonSlots = (annexPrefix: string): Array<TechDocSlot & { match: Matcher }> => [
  { id: 'device-description', label: 'Device description & specification', annex: `${annexPrefix} 1`, required: true, match: any(docType('device_description', 'device_specification'), titleHas('device description', 'intended purpose'), annexKey('II.1')) },
  { id: 'manufacturer-information', label: 'Information supplied by the manufacturer (labelling/IFU)', annex: `${annexPrefix} 2`, required: true, match: any(docType('ifu', 'labelling', 'label'), titleHas('instructions for use', 'ifu', 'labelling'), annexKey('II.2')) },
  { id: 'design-manufacturing', label: 'Design & manufacturing information', annex: `${annexPrefix} 3`, required: true, match: any(docType('design_manufacturing', 'manufacturing'), titleHas('design and manufacturing', 'manufacturing process'), annexKey('II.3')) },
  { id: 'gspr', label: 'General safety & performance requirements (GSPR) checklist', annex: 'Annex I', required: true, match: any(docType('gspr', 'gspr_checklist'), titleHas('general safety and performance', 'gspr'), annexKey('II.4')) },
  { id: 'risk-management', label: 'Benefit-risk analysis & risk management', annex: `${annexPrefix} 5`, required: true, match: any(docType('risk_management', 'benefit_risk'), titleHas('risk management', 'benefit-risk', 'benefit risk'), annexKey('II.5')) },
];

const MDR_SECTIONS: Array<TechDocSlot & { match: Matcher }> = [
  ...commonSlots('Annex II'),
  { id: 'preclinical-clinical', label: 'Product verification & validation (preclinical + clinical)', annex: 'Annex II 6', required: true, match: any(docType('preclinical', 'verification_validation'), codeStarts('4', '5'), titleHas('preclinical', 'verification and validation'), all(annexKey('II.6'), not(exactKey('II.6.1.g')))) },
  { id: 'clinical-evaluation', label: 'Clinical Evaluation Report (CER)', annex: 'Annex XIV', required: true, match: any(docType('cer', 'clinical_evaluation'), titleHas('clinical evaluation'), exactKey('II.6.1.g')) },
  { id: 'pms-plan', label: 'Post-market surveillance plan', annex: 'Annex III', required: true, match: any(docType('pms_plan', 'pms'), titleHas('post-market surveillance', 'pms plan'), annexKey('III')) },
];

const IVDR_SECTIONS: Array<TechDocSlot & { match: Matcher }> = [
  ...commonSlots('Annex II'),
  { id: 'analytical-performance', label: 'Analytical performance', annex: 'Annex II 6.1', required: true, match: any(docType('analytical_performance'), titleHas('analytical performance'), annexKey('II.6.1')) },
  { id: 'clinical-performance', label: 'Clinical performance', annex: 'Annex II 6.2', required: true, match: any(docType('clinical_performance'), titleHas('clinical performance'), all(annexKey('II.6.2'), not(exactKey('II.6.2.c')))) },
  { id: 'performance-evaluation', label: 'Performance Evaluation Report (PER) & scientific validity', annex: 'Annex XIII', required: true, match: any(docType('per', 'performance_evaluation', 'scientific_validity'), titleHas('performance evaluation', 'scientific validity'), exactKey('II.6.2.c')) },
  { id: 'pms-plan', label: 'Post-market performance follow-up plan', annex: 'Annex III', required: true, match: any(docType('pmpf_plan', 'pms_plan', 'pms'), titleHas('post-market performance follow-up', 'pms plan'), annexKey('III')) },
];

function evalSlot(slot: TechDocSlot & { match: Matcher }, leaves: TechDocInputLeaf[]): TechDocSlotStatus {
  const sources = leaves.filter((l) => slot.match(l)).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present: sources.length > 0, sources };
}

export interface AssembleTechDocInput {
  leaves: TechDocInputLeaf[];
  regulation: EuRegulation;
}

/** Assemble the MDR/IVDR technical-documentation structure + completeness report. */
export function assembleTechDoc(input: AssembleTechDocInput): TechDocResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const registry = input.regulation === 'ivdr' ? IVDR_SECTIONS : MDR_SECTIONS;
  const sections = registry.map((s) => evalSlot(s, leaves));
  const missingRequired = sections.filter((s) => s.required && !s.present).map((s) => s.id);
  return {
    regulation: input.regulation,
    sections,
    summary: { missingRequired, ready: missingRequired.length === 0 },
  };
}

export default { assembleTechDoc };
