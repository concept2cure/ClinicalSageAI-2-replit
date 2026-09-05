/**
 * Regional Module 1 requirements expert — global marketing-application admin.
 *
 * eCTD Module 1 (the regional/administrative module) differs by health
 * authority: each market mandates its own application form, cover letter,
 * product information / labeling, and region-specific declarations. This service
 * encodes the required Module 1 components for an initial marketing application
 * per market and assesses a sponsor's dossier against them — surfacing exactly
 * which regional administrative documents are missing before submission.
 *
 * Markets: FDA (US), EMA (EU centralised), PMDA (JP), HEALTH_CANADA (CA),
 * MHRA (UK), TGA (AU), SWISSMEDIC (CH), NMPA (CN). The component lists capture
 * the major mandatory administrative pieces; sponsor SOPs/agency checklists
 * remain the authority for edge cases (this is a readiness aid,
 * honest-by-construction).
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: FDA eCTD US regional + 21 CFR 314.50; EU NtA Vol 2B Module 1 +
 * Reg (EC) 726/2004; PMDA eCTD JP M1; Health Canada CTD Module 1; MHRA UK
 * regional; TGA AU regional; Swissmedic CH eCTD M1; NMPA M4 (2019 No. 17).
 *
 * @module server/services/global-ri/regional-module1-requirements
 */

export type RegulatoryMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA' | 'MHRA' | 'TGA' | 'SWISSMEDIC' | 'NMPA';

export interface Module1Component {
  /** Stable component code (e.g. 'us_356h'). */
  code: string;
  /** Human label. */
  label: string;
  /** eCTD Module 1 section (regional). */
  section: string;
}

/** Required Module 1 components for an initial marketing application, by market. */
export const REGIONAL_MODULE1_REQUIREMENTS: Record<RegulatoryMarket, Module1Component[]> = {
  FDA: [
    { code: 'us_356h', label: 'FDA Form 356h (Application to Market a New or Abbreviated New Drug or Biologic)', section: 'm1.1' },
    { code: 'us_cover_letter', label: 'Cover letter', section: 'm1.2' },
    { code: 'us_admin', label: 'Administrative information (applicant, US agent, contact)', section: 'm1.3.1' },
    { code: 'us_debarment', label: 'Debarment certification (FD&C Act 306(k)(1))', section: 'm1.3.3' },
    { code: 'us_labeling', label: 'Labeling — draft Prescribing Information + container/carton labels', section: 'm1.14' },
    { code: 'us_financial_disclosure', label: 'Financial disclosure (FDA 3454/3455)', section: 'm1.3.4' },
    { code: 'us_3674', label: 'Certification of compliance with ClinicalTrials.gov (FDA 3674)', section: 'm1.1' },
    { code: 'us_user_fee', label: 'User fee cover sheet (FDA 3397, PDUFA)', section: 'm1.1' },
  ],
  EMA: [
    { code: 'eu_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'eu_eaf', label: 'Application form (electronic Application Form, eAF)', section: 'm1.2' },
    { code: 'eu_product_information', label: 'Product information — SmPC, labelling, package leaflet (Annexes)', section: 'm1.3' },
    { code: 'eu_expert_declarations', label: "Information about the experts (expert declarations)", section: 'm1.4' },
    { code: 'eu_era', label: 'Environmental risk assessment', section: 'm1.6' },
    { code: 'eu_rmp', label: 'Risk Management Plan + PSMF summary', section: 'm1.8.2' },
  ],
  PMDA: [
    { code: 'jp_application_form', label: 'Application form (承認申請書)', section: 'm1.2' },
    { code: 'jp_product_information', label: 'Japanese product information / package insert (添付文書)', section: 'm1.3' },
    { code: 'jp_gmp', label: 'GMP compliance documentation', section: 'm1.13' },
    { code: 'jp_manufacturer_certificate', label: 'Certificate of the (foreign) manufacturer / accreditation', section: 'm1.2' },
  ],
  HEALTH_CANADA: [
    { code: 'ca_hc3011', label: 'Drug Submission Application Form (HC/SC 3011)', section: 'm1.2' },
    { code: 'ca_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'ca_product_monograph', label: 'Draft Product Monograph (labeling)', section: 'm1.3' },
    { code: 'ca_cpid', label: 'Certified Product Information Document (CPID)', section: 'm1.2' },
  ],
  MHRA: [
    { code: 'uk_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'uk_application_form', label: 'Application form (UK MA)', section: 'm1.2' },
    { code: 'uk_product_information', label: 'Product information — SmPC, PIL, labelling', section: 'm1.3' },
    { code: 'uk_rmp', label: 'UK Risk Management Plan', section: 'm1.8.2' },
  ],
  TGA: [
    { code: 'au_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'au_application_form', label: 'Application form', section: 'm1.2' },
    { code: 'au_product_information', label: 'Australian Product Information (PI)', section: 'm1.3.1' },
    { code: 'au_cmi', label: 'Consumer Medicines Information (CMI)', section: 'm1.3.2' },
    { code: 'au_labels', label: 'Draft Australian labels', section: 'm1.3.3' },
  ],
  SWISSMEDIC: [
    { code: 'ch_cover_letter', label: 'Cover letter', section: 'm1.0' },
    { code: 'ch_application_form', label: 'Application form (Swissmedic Gesuchsformular)', section: 'm1.2' },
    { code: 'ch_product_information', label: 'Product information — Fachinformation, Patienteninformation and labelling (DE/FR/IT)', section: 'm1.3' },
    { code: 'ch_gmp', label: 'GMP evidence / establishment licence', section: 'm1.6' },
  ],
  NMPA: [
    { code: 'cn_application_form', label: 'Application form (申请表)', section: 'm1.2' },
    { code: 'cn_product_information', label: 'Chinese product information / labeling (说明书)', section: 'm1.3' },
    { code: 'cn_certificates', label: 'Certificates (manufacturing, GMP, CPP)', section: 'm1.2' },
  ],
};

export type Module1FindingSeverity = 'error' | 'warning';

export interface Module1Finding {
  severity: Module1FindingSeverity;
  /** MISSING_COMPONENT / UNKNOWN_MARKET / EXTRA_COMPONENT. */
  code: string;
  message: string;
  /** The component code the finding concerns, when applicable. */
  component?: string;
}

export interface RegionalModule1Result {
  market: RegulatoryMarket;
  ready: boolean;
  /** All required component codes for the market. */
  required: Module1Component[];
  /** Required component codes the sponsor has not provided. */
  missing: string[];
  findings: Module1Finding[];
  counts: { errors: number; warnings: number };
}

export interface RegionalModule1Input {
  market: RegulatoryMarket;
  /** Component codes the sponsor has assembled (from REGIONAL_MODULE1_REQUIREMENTS). */
  providedComponents: string[];
}

/**
 * Assess a sponsor's Module 1 components against the market's required set.
 * A missing required component is a blocking error; an unrecognized provided
 * code is an informational warning. ready ⇔ no missing required components.
 * Pure / deterministic; findings ordered by component code then severity.
 */
export function assessRegionalModule1(input: RegionalModule1Input): RegionalModule1Result {
  const required = REGIONAL_MODULE1_REQUIREMENTS[input.market];
  const findings: Module1Finding[] = [];

  if (!required) {
    return {
      market: input.market,
      ready: false,
      required: [],
      missing: [],
      findings: [{ severity: 'error', code: 'UNKNOWN_MARKET', message: `No Module 1 requirements modeled for market "${input.market}".` }],
      counts: { errors: 1, warnings: 0 },
    };
  }

  const provided = new Set((input.providedComponents ?? []).map((c) => String(c)));
  const requiredCodes = new Set(required.map((r) => r.code));

  const missing: string[] = [];
  for (const comp of required) {
    if (!provided.has(comp.code)) {
      missing.push(comp.code);
      findings.push({ severity: 'error', code: 'MISSING_COMPONENT', message: `Missing required Module 1 component: ${comp.label} (${comp.section}).`, component: comp.code });
    }
  }

  for (const code of provided) {
    if (!requiredCodes.has(code)) {
      findings.push({ severity: 'warning', code: 'EXTRA_COMPONENT', message: `Provided component "${code}" is not in the ${input.market} required Module 1 set; confirm placement.`, component: code });
    }
  }

  findings.sort((a, b) => {
    const ca = a.component ?? '';
    const cb = b.component ?? '';
    if (ca !== cb) return ca.localeCompare(cb);
    return a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1;
  });

  const errors = findings.filter((f) => f.severity === 'error').length;

  return {
    market: input.market,
    ready: errors === 0,
    required,
    missing,
    findings,
    counts: { errors, warnings: findings.length - errors },
  };
}

/** List the required Module 1 components for a market (for a checklist UI). */
export function getRegionalModule1Requirements(market: RegulatoryMarket): Module1Component[] {
  return REGIONAL_MODULE1_REQUIREMENTS[market] ?? [];
}
