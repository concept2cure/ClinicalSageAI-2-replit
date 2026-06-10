/**
 * CTIS pathway engine (EU clinical-trial applications — CTR 536/2014)
 *
 * Maps the canonical submission's content (leaves) onto the CTIS dossier
 * structure: Part I (assessed jointly by all concerned Member States) and
 * Part II (assessed per Member State). Produces a completeness report —
 * which required slots are present vs missing — so a sponsor sees CTIS-readiness
 * before touching the portal.
 *
 * CTIS is a STRUCTURED PORTAL, not eCTD (spec §3) — this is a projection of the
 * one canonical core into CTIS's field structure, the same "one core, many
 * projections" principle as the eCTD/eSTAR engines. It does NOT submit; it maps
 * and gap-checks.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM. A
 * slot with no matching source leaf is reported as a gap, never invented.
 *
 * @module server/services/pathway-engines/ctis/ctis-mapper
 */

/** A canonical leaf as CTIS-mapping input (subset of the submission leaf). */
export interface CtisInputLeaf {
  sectionCode: string;
  title: string;
  /** Optional document-type hint (e.g. 'protocol', 'investigator_brochure'). */
  documentType?: string;
}

export type CtisPart = 'I' | 'II';

export interface CtisSlot {
  id: string;
  label: string;
  part: CtisPart;
  required: boolean;
}

export interface CtisSlotStatus extends CtisSlot {
  present: boolean;
  /** Section codes / titles of the leaves that satisfied this slot. */
  sources: string[];
}

export interface CtisPartIIByState {
  memberState: string;
  slots: CtisSlotStatus[];
  missingRequired: string[];
}

export interface CtisDossier {
  partI: CtisSlotStatus[];
  partII: CtisPartIIByState[];
  summary: {
    partIMissingRequired: string[];
    partIIMissingByState: Record<string, string[]>;
    /** True only when every required Part I slot and every required Part II slot (per state) is present. */
    ready: boolean;
  };
}

// ── Slot registry (CTR 536/2014 Annex I/II) + deterministic matchers ─────────
type Matcher = (leaf: CtisInputLeaf) => boolean;

const startsWith = (...prefixes: string[]): Matcher => (l) =>
  prefixes.some((p) => l.sectionCode.startsWith(p));
const docType = (...types: string[]): Matcher => (l) =>
  !!l.documentType && types.includes(l.documentType);
const titleHas = (...needles: string[]): Matcher => (l) =>
  needles.some((n) => l.title.toLowerCase().includes(n));
const any = (...ms: Matcher[]): Matcher => (l) => ms.some((m) => m(l));

const PART_I: Array<CtisSlot & { match: Matcher }> = [
  { id: 'cover-letter', label: 'Cover letter', part: 'I', required: true, match: any(startsWith('m1', '1.'), docType('cover_letter'), titleHas('cover letter')) },
  { id: 'eu-application-form', label: 'EU application form', part: 'I', required: true, match: any(docType('eu_application_form'), titleHas('application form')) },
  { id: 'protocol', label: 'Protocol', part: 'I', required: true, match: any(startsWith('5.3.5'), docType('clinical_protocol', 'protocol'), titleHas('protocol')) },
  { id: 'investigators-brochure', label: "Investigator's brochure", part: 'I', required: true, match: any(docType('investigator_brochure'), titleHas("investigator's brochure", 'investigator brochure')) },
  { id: 'impd-quality', label: 'IMPD — quality', part: 'I', required: true, match: any(startsWith('3.2', '3'), docType('quality', 'cmc'), titleHas('quality overall summary')) },
  { id: 'impd-safety-efficacy', label: 'IMPD — safety & efficacy', part: 'I', required: true, match: any(startsWith('2.4', '2.5', '2.6', '2.7', '4', '5'), titleHas('nonclinical overview', 'clinical overview')) },
  { id: 'gmp-manufacturing', label: 'GMP / manufacturing authorisation', part: 'I', required: true, match: any(startsWith('3.2.P'), docType('gmp', 'manufacturing'), titleHas('manufacturing authorisation', 'gmp')) },
  { id: 'labelling', label: 'Labelling / IMP labelling', part: 'I', required: true, match: any(docType('labelling', 'label'), titleHas('labelling', 'label')) },
  // Conditional / optional Part I content
  { id: 'auxiliary-medicinal-products', label: 'Auxiliary medicinal products', part: 'I', required: false, match: any(docType('auxiliary_medicinal_product'), titleHas('auxiliary medicinal')) },
  { id: 'scientific-advice', label: 'Scientific advice', part: 'I', required: false, match: any(docType('scientific_advice'), titleHas('scientific advice')) },
  { id: 'paediatric-investigation-plan', label: 'Paediatric investigation plan', part: 'I', required: false, match: any(docType('pip'), titleHas('paediatric investigation plan', 'pip')) },
];

const PART_II: Array<CtisSlot & { match: Matcher }> = [
  { id: 'subject-information-consent', label: 'Subject information & informed consent', part: 'II', required: true, match: any(docType('informed_consent', 'subject_information'), titleHas('informed consent', 'subject information')) },
  { id: 'investigator-suitability', label: 'Suitability of the investigator', part: 'II', required: true, match: any(docType('investigator_cv', 'investigator_suitability'), titleHas('curriculum vitae', 'investigator cv', 'investigator suitability')) },
  { id: 'facilities-suitability', label: 'Suitability of the facilities', part: 'II', required: true, match: any(docType('facility_suitability'), titleHas('facilit')) },
  { id: 'financial-arrangements', label: 'Financial & compensation arrangements', part: 'II', required: true, match: any(docType('financial_arrangement', 'compensation'), titleHas('financial', 'compensation', 'insurance')) },
  { id: 'data-protection', label: 'Data-protection arrangements', part: 'II', required: false, match: any(docType('data_protection'), titleHas('data protection', 'gdpr')) },
  { id: 'biological-samples', label: 'Biological-sample arrangements', part: 'II', required: false, match: any(docType('biological_samples'), titleHas('biological sample')) },
];

function evalSlot(slot: CtisSlot & { match: Matcher }, leaves: CtisInputLeaf[]): CtisSlotStatus {
  const sources = leaves.filter((l) => slot.match(l)).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present: sources.length > 0, sources };
}

export interface MapToCtisInput {
  leaves: CtisInputLeaf[];
  /** ISO/EU member-state codes the application targets (e.g. ['DE','FR']). */
  memberStates: string[];
}

/** Map canonical leaves onto the CTIS Part I / Part II dossier with a gap report. */
export function mapToCtis(input: MapToCtisInput): CtisDossier {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const memberStates = Array.isArray(input.memberStates) ? input.memberStates : [];

  const partI = PART_I.map((s) => evalSlot(s, leaves));
  const partIMissingRequired = partI.filter((s) => s.required && !s.present).map((s) => s.id);

  const partII: CtisPartIIByState[] = memberStates.map((ms) => {
    const slots = PART_II.map((s) => evalSlot(s, leaves));
    return { memberState: ms, slots, missingRequired: slots.filter((s) => s.required && !s.present).map((s) => s.id) };
  });
  const partIIMissingByState: Record<string, string[]> = {};
  for (const st of partII) partIIMissingByState[st.memberState] = st.missingRequired;

  const ready =
    partIMissingRequired.length === 0 &&
    memberStates.length > 0 &&
    partII.every((st) => st.missingRequired.length === 0);

  return { partI, partII, summary: { partIMissingRequired, partIIMissingByState, ready } };
}

export default { mapToCtis };
