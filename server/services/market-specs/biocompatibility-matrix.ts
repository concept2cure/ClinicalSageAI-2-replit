/**
 * Biocompatibility evaluation matrix (ISO 10993-1:2018) — the device contact
 * categorisation and the biological-evaluation endpoints to be addressed for a
 * given nature and duration of body contact.
 *
 * WHY THIS EXISTS (audit gap): biocompatibility gaps are a frequent 510(k)/MDR
 * deficiency, yet the platform modelled none of the ISO 10993-1 endpoint logic.
 * Given a device's contact category, this returns the set of biological endpoints
 * a reviewer expects to see addressed (by test or justified risk assessment).
 *
 * HONESTY: this reflects the PRINCIPAL endpoint assignments of ISO 10993-1:2018
 * Annex A (Table A.1) by contact nature × duration. The Biological Evaluation Plan
 * and risk assessment determine the actual tests vs. justifications for any device —
 * this is the starting endpoint set a reviewer expects, NOT a test plan and NOT a
 * substitute for ISO 10993-1 / the FDA biocompatibility guidance.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/biocompatibility-matrix
 */

/** Contact nature per ISO 10993-1 (surface / external-communicating / implant). */
export type ContactNature =
  | 'skin'
  | 'mucosal_membrane'
  | 'breached_surface'
  | 'blood_path_indirect'
  | 'tissue_bone_dentin'
  | 'circulating_blood'
  | 'implant_tissue_bone'
  | 'implant_blood';

/** Contact duration: limited ≤24h, prolonged >24h–30d, long-term >30d. */
export type ContactDuration = 'limited' | 'prolonged' | 'long_term';

export interface BiocompEndpoint {
  id: string;
  label: string;
}

export const BIOCOMP_ENDPOINTS: BiocompEndpoint[] = [
  { id: 'cytotoxicity', label: 'Cytotoxicity' },
  { id: 'sensitization', label: 'Sensitization' },
  { id: 'irritation', label: 'Irritation / intracutaneous reactivity' },
  { id: 'pyrogenicity', label: 'Material-mediated pyrogenicity' },
  { id: 'acute_systemic_toxicity', label: 'Acute systemic toxicity' },
  { id: 'subacute_subchronic_toxicity', label: 'Subacute / subchronic (repeated-dose) toxicity' },
  { id: 'genotoxicity', label: 'Genotoxicity' },
  { id: 'implantation', label: 'Implantation effects' },
  { id: 'hemocompatibility', label: 'Haemocompatibility' },
  { id: 'chronic_toxicity', label: 'Chronic toxicity' },
  { id: 'carcinogenicity', label: 'Carcinogenicity' },
];

const ENDPOINT_LABEL = new Map(BIOCOMP_ENDPOINTS.map((e) => [e.id, e.label]));

const BLOOD_CONTACT: ContactNature[] = ['blood_path_indirect', 'circulating_blood', 'implant_blood'];
const TISSUE_OR_IMPLANT: ContactNature[] = ['tissue_bone_dentin', 'implant_tissue_bone', 'implant_blood'];
const COMMUNICATING_OR_IMPLANT: ContactNature[] = [
  'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood',
];

const DURATION_LABEL: Record<ContactDuration, string> = {
  limited: 'Limited (≤ 24 h)',
  prolonged: 'Prolonged (> 24 h to 30 days)',
  long_term: 'Long-term / permanent (> 30 days)',
};

export interface BiocompEvaluation {
  nature: ContactNature;
  duration: ContactDuration;
  durationLabel: string;
  /** Endpoint ids to be addressed (by test or justified risk assessment). */
  endpoints: Array<{ id: string; label: string }>;
  caveat: string;
}

const CAVEAT =
  'Principal endpoint set per ISO 10993-1:2018 Annex A (Table A.1) for the contact category. The Biological Evaluation Plan and risk assessment determine the actual tests vs. justifications; confirm against ISO 10993-1 and the FDA biocompatibility guidance.';

/**
 * The biological endpoints to address for a device's contact category. Deterministic:
 * base endpoints for all contact, plus blood/implantation/systemic/genotoxicity/
 * chronic/carcinogenicity additions driven by nature and duration.
 */
export function requiredBiocompEndpoints(nature: ContactNature, duration: ContactDuration): BiocompEvaluation {
  const ids = new Set<string>();

  // Base — applicable to essentially all body contact.
  ids.add('cytotoxicity');
  ids.add('sensitization');
  ids.add('irritation');

  // Material-mediated pyrogenicity — all except intact-skin contact.
  if (nature !== 'skin') ids.add('pyrogenicity');

  // Haemocompatibility — any blood-contacting device.
  if (BLOOD_CONTACT.includes(nature)) ids.add('hemocompatibility');

  // Implantation effects — tissue/bone and implant contact, for prolonged/permanent.
  if (TISSUE_OR_IMPLANT.includes(nature) && duration !== 'limited') ids.add('implantation');

  // Systemic toxicity — external-communicating & implant devices.
  if (COMMUNICATING_OR_IMPLANT.includes(nature)) {
    ids.add('acute_systemic_toxicity');
    if (duration !== 'limited') ids.add('subacute_subchronic_toxicity');
  } else if (duration !== 'limited' && nature !== 'skin') {
    // Prolonged/permanent mucosal or breached surface contact also considers acute systemic toxicity.
    ids.add('acute_systemic_toxicity');
  }

  // Genotoxicity — prolonged/permanent contact (communicating/implant, and breached/mucosal long-term).
  if (duration !== 'limited' && (COMMUNICATING_OR_IMPLANT.includes(nature) || nature === 'breached_surface' || nature === 'mucosal_membrane')) {
    ids.add('genotoxicity');
  }

  // Chronic toxicity & carcinogenicity — permanent (>30d) communicating/implant contact.
  if (duration === 'long_term' && COMMUNICATING_OR_IMPLANT.includes(nature)) {
    ids.add('chronic_toxicity');
    ids.add('carcinogenicity');
  }

  // Emit in the canonical endpoint order.
  const endpoints = BIOCOMP_ENDPOINTS.filter((e) => ids.has(e.id)).map((e) => ({ id: e.id, label: ENDPOINT_LABEL.get(e.id)! }));

  return { nature, duration, durationLabel: DURATION_LABEL[duration], endpoints, caveat: CAVEAT };
}

export function contactNatures(): ContactNature[] {
  return ['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood'];
}

export default { BIOCOMP_ENDPOINTS, requiredBiocompEndpoints, contactNatures };
