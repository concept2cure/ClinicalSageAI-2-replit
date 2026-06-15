/**
 * Pre-approval / GMP / clinical inspection readiness expert — per market.
 *
 * Before (and around) approval, health authorities inspect the manufacturing
 * facility (GMP) and the clinical/bioresearch data (GCP) that support the
 * application. This service encodes, per market, the inspection types a sponsor
 * should expect and a readiness-DOMAIN checklist (facility GMP, data integrity,
 * application conformance, batch records, process validation, QMS/CAPA, clinical
 * GCP, supplier qualification). It assesses a sponsor's prepared domains against
 * that checklist — surfacing exactly which readiness areas are not yet covered.
 *
 * Markets: FDA (US PAI under Compliance Program 7346.832 + BIMO GCP), EMA/EU
 * (national-competent-authority GMP inspection issuing the EudraGMDP/GMP
 * certificate + EMA-coordinated GCP inspections; data integrity per PIC/S),
 * PMDA (GMP conformity inspection 適合性調査 + GCP on-site reliability survey),
 * Health Canada (Drug Establishment Licence + Division 2 GMP on-site evaluation).
 *
 * Pure / deterministic — no DB, no IO. This is a readiness aid; the agency's
 * actual inspection scope is authoritative and may exceed what is modeled here.
 *
 * Reference: FDA Compliance Program 7346.832 (Pre-Approval Inspections); FDA
 * BIMO Compliance Programs 7348.811 (clinical investigators) / 7348.810
 * (sponsors-monitors-CROs); FDA Data Integrity & cGMP guidance (Dec 2018);
 * 21 CFR Parts 210/211 + 312; EU GMP (EudraLex Vol 4, incl. Annex 11/15) +
 * Dir 2003/94/EC; PIC/S PI 041 (Good Practices for Data Management & Integrity);
 * Japan PMD Act + MHLW GMP Ministerial Ordinance No. 179 (2004); Canada Food and
 * Drug Regulations Division 2 (cGMP) + Drug Establishment Licences (C.01A).
 *
 * @module server/services/global-ri/inspection-readiness
 */

export type InspectionMarket = 'FDA' | 'EMA' | 'PMDA' | 'HEALTH_CANADA';

export const INSPECTION_MARKETS: InspectionMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'];

export interface InspectionType {
  /** The inspection name (e.g. 'Pre-Approval Inspection (PAI)'). */
  name: string;
  /** What the inspection covers. */
  scope: string;
  /** Governing citation. */
  citation: string;
}

export interface ReadinessDomain {
  /** Stable domain id (e.g. 'data_integrity'). */
  id: string;
  /** Human label. */
  title: string;
  /** What the sponsor must have ready in this domain. */
  description: string;
  /** Governing citation. */
  citation: string;
}

export interface InspectionProfile {
  market: InspectionMarket;
  inspectionTypes: InspectionType[];
  readinessDomains: ReadinessDomain[];
}

/**
 * Shared readiness-domain checklist. The eight domains apply across all modeled
 * markets; only the citations differ per market (see READINESS_CITATIONS).
 */
const DOMAIN_IDS = [
  'facility_gmp',
  'data_integrity',
  'application_conformance',
  'batch_records',
  'process_validation',
  'qms_capa',
  'bimo_gcp',
  'supplier_qualification',
] as const;

type DomainId = (typeof DOMAIN_IDS)[number];

interface DomainTemplate {
  id: DomainId;
  title: string;
  description: string;
}

const DOMAIN_TEMPLATES: Record<DomainId, DomainTemplate> = {
  facility_gmp: {
    id: 'facility_gmp',
    title: 'Facility & GMP state of control',
    description:
      'The manufacturing facility, utilities, equipment and personnel demonstrate a current state of GMP control and readiness for commercial manufacturing.',
  },
  data_integrity: {
    id: 'data_integrity',
    title: 'Data integrity (ALCOA+)',
    description:
      'Records — paper and electronic — meet ALCOA+ principles: Attributable, Legible, Contemporaneous, Original, Accurate, plus Complete, Consistent, Enduring and Available; audit trails are enabled and reviewed.',
  },
  application_conformance: {
    id: 'application_conformance',
    title: 'Conformance to the application',
    description:
      'The facility, process, controls and specifications as actually operated match the commitments and data filed in the marketing application.',
  },
  batch_records: {
    id: 'batch_records',
    title: 'Batch records & manufacturing documentation',
    description:
      'Master and executed batch records, deviations and investigations are complete, contemporaneous and traceable for the application batches.',
  },
  process_validation: {
    id: 'process_validation',
    title: 'Process validation',
    description:
      'Process validation (and ongoing process verification) demonstrates the commercial process is capable, reproducible and under control.',
  },
  qms_capa: {
    id: 'qms_capa',
    title: 'Quality management system & CAPA',
    description:
      'The pharmaceutical quality system — change control, deviation/OOS handling, complaints and a closed-loop CAPA program — is effective and documented.',
  },
  bimo_gcp: {
    id: 'bimo_gcp',
    title: 'Clinical / bioresearch monitoring (GCP)',
    description:
      'Clinical investigator sites and the sponsor are inspection-ready for GCP: informed consent, source data, monitoring, safety reporting and trial conduct support the application data.',
  },
  supplier_qualification: {
    id: 'supplier_qualification',
    title: 'Supplier & material qualification',
    description:
      'Suppliers of APIs, excipients and critical materials, and contract manufacturers/testing labs, are qualified and under quality agreements with appropriate oversight.',
  },
};

const READINESS_CITATIONS: Record<InspectionMarket, Record<DomainId, string>> = {
  FDA: {
    facility_gmp: '21 CFR Parts 210/211; Compliance Program 7346.832 (Objective 1)',
    data_integrity: 'FDA Data Integrity & cGMP guidance (2018); 21 CFR 211.68/211.194; CP 7346.832 (Objective 3)',
    application_conformance: 'Compliance Program 7346.832 (Objective 2)',
    batch_records: '21 CFR 211.188/211.192',
    process_validation: 'FDA Process Validation guidance (2011); 21 CFR 211.100',
    qms_capa: '21 CFR 211.22/211.192; ICH Q10',
    bimo_gcp: 'BIMO Compliance Programs 7348.811 / 7348.810; 21 CFR Part 312',
    supplier_qualification: '21 CFR 211.84; ICH Q7 (API suppliers)',
  },
  EMA: {
    facility_gmp: 'EU GMP (EudraLex Vol 4) Part I; Dir 2003/94/EC; EudraGMDP GMP certificate',
    data_integrity: 'PIC/S PI 041; EU GMP Annex 11 (computerised systems); Chapter 4 (documentation)',
    application_conformance: 'EU GMP Vol 4 Part I Ch. 1; assessment against the dossier',
    batch_records: 'EU GMP Vol 4 Part I Ch. 4 (documentation)',
    process_validation: 'EU GMP Annex 15 (Qualification and Validation)',
    qms_capa: 'EU GMP Vol 4 Part I Ch. 1 (Pharmaceutical Quality System); ICH Q10',
    bimo_gcp: 'EMA-coordinated GCP inspections; ICH E6(R2) GCP; Dir 2005/28/EC',
    supplier_qualification: 'EU GMP Vol 4 Part I Ch. 5 & Ch. 7 (outsourced activities)',
  },
  PMDA: {
    facility_gmp: 'PMD Act; MHLW GMP Ministerial Ordinance No. 179 (2004); GMP conformity inspection (適合性調査)',
    data_integrity: 'PMDA/MHLW data integrity expectations; PIC/S PI 041 (Japan is a PIC/S member)',
    application_conformance: 'PMD Act Art. 14; GMP conformity inspection against the application',
    batch_records: 'MHLW GMP Ministerial Ordinance No. 179 (manufacturing/testing records)',
    process_validation: 'MHLW GMP Ministerial Ordinance No. 179 (validation); ICH Q8/Q9/Q10',
    qms_capa: 'MHLW GMP Ministerial Ordinance No. 179 (quality system, deviations, CAPA)',
    bimo_gcp: 'PMDA GCP on-site inspection / reliability survey (信頼性調査); J-GCP',
    supplier_qualification: 'MHLW GMP Ministerial Ordinance No. 179 (suppliers/outsourcing); ICH Q7',
  },
  HEALTH_CANADA: {
    facility_gmp: 'Food and Drug Regulations Division 2 (GMP); Drug Establishment Licence (C.01A)',
    data_integrity: 'Health Canada GUI-0001 (GMP guide) data integrity expectations; PIC/S PI 041',
    application_conformance: 'Food and Drug Regulations Division 2; on-site evaluation against the submission',
    batch_records: 'Food and Drug Regulations Division 2 (records C.02.020 et seq.)',
    process_validation: 'Health Canada validation guidance; Food and Drug Regulations Division 2',
    qms_capa: 'Food and Drug Regulations Division 2 (quality control); GUI-0001',
    bimo_gcp: 'Food and Drug Regulations Division 5 (clinical trials); ICH E6 GCP',
    supplier_qualification: 'Food and Drug Regulations Division 2 (raw material testing C.02.009); GUI-0001',
  },
};

function buildDomains(market: InspectionMarket): ReadinessDomain[] {
  const citations = READINESS_CITATIONS[market];
  return DOMAIN_IDS.map((id) => ({
    id: DOMAIN_TEMPLATES[id].id,
    title: DOMAIN_TEMPLATES[id].title,
    description: DOMAIN_TEMPLATES[id].description,
    citation: citations[id],
  }));
}

const INSPECTION_TYPES: Record<InspectionMarket, InspectionType[]> = {
  FDA: [
    {
      name: 'Pre-Approval Inspection (PAI)',
      scope:
        'Three objectives: (1) readiness for commercial manufacturing, (2) conformance to the application, and (3) a data integrity audit.',
      citation: 'Compliance Program 7346.832',
    },
    {
      name: 'Bioresearch Monitoring (BIMO) inspection',
      scope:
        'GCP inspection of clinical investigator sites and of the sponsor/monitor/CRO supporting the application data.',
      citation: 'BIMO Compliance Programs 7348.811 / 7348.810; 21 CFR Part 312',
    },
  ],
  EMA: [
    {
      name: 'GMP inspection (national competent authority)',
      scope:
        'On-site GMP inspection by an EU member-state competent authority; a satisfactory outcome yields the GMP certificate / EudraGMDP entry.',
      citation: 'EU GMP (EudraLex Vol 4); Dir 2003/94/EC; EudraGMDP',
    },
    {
      name: 'GCP inspection (EMA-coordinated)',
      scope:
        'Good Clinical Practice inspection of investigator sites and sponsors, coordinated by EMA and conducted by member-state inspectors.',
      citation: 'ICH E6(R2) GCP; Dir 2005/28/EC',
    },
  ],
  PMDA: [
    {
      name: 'GMP conformity inspection (適合性調査)',
      scope: 'Pre-approval GMP conformity assessment of the manufacturing site(s) against Japanese GMP requirements.',
      citation: 'PMD Act; MHLW GMP Ministerial Ordinance No. 179 (2004)',
    },
    {
      name: 'GCP on-site inspection / reliability survey (信頼性調査)',
      scope: 'On-site GCP inspection and a reliability survey of the clinical data submitted in the application.',
      citation: 'PMD Act Art. 14; J-GCP',
    },
  ],
  HEALTH_CANADA: [
    {
      name: 'GMP on-site evaluation (Drug Establishment Licence)',
      scope:
        'On-site GMP evaluation supporting the Drug Establishment Licence and Division 2 compliance for the manufacturing site(s).',
      citation: 'Food and Drug Regulations Division 2; Drug Establishment Licence (C.01A)',
    },
    {
      name: 'GCP inspection',
      scope: 'Good Clinical Practice inspection of clinical trial sites/sponsor supporting the submission.',
      citation: 'Food and Drug Regulations Division 5; ICH E6 GCP',
    },
  ],
};

const INSPECTION_PROFILES: Record<InspectionMarket, InspectionProfile> = {
  FDA: { market: 'FDA', inspectionTypes: INSPECTION_TYPES.FDA, readinessDomains: buildDomains('FDA') },
  EMA: { market: 'EMA', inspectionTypes: INSPECTION_TYPES.EMA, readinessDomains: buildDomains('EMA') },
  PMDA: { market: 'PMDA', inspectionTypes: INSPECTION_TYPES.PMDA, readinessDomains: buildDomains('PMDA') },
  HEALTH_CANADA: {
    market: 'HEALTH_CANADA',
    inspectionTypes: INSPECTION_TYPES.HEALTH_CANADA,
    readinessDomains: buildDomains('HEALTH_CANADA'),
  },
};

/**
 * Get the inspection profile for a market: the inspection types to expect and
 * the readiness-domain checklist. Pure / deterministic. Throws for an unmodeled
 * market.
 */
export function getInspectionProfile(market: InspectionMarket): InspectionProfile {
  const profile = INSPECTION_PROFILES[market];
  if (!profile) throw new Error(`No inspection profile modeled for market "${market}".`);
  return profile;
}

/**
 * List the readiness-domain ids for a market (for a checklist UI). Returns an
 * empty array for an unmodeled market (graceful, like the Module 1 lister).
 */
export function getReadinessDomains(market: InspectionMarket): string[] {
  const profile = INSPECTION_PROFILES[market];
  if (!profile) return [];
  return profile.readinessDomains.map((d) => d.id);
}

export interface InspectionReadinessInput {
  market: InspectionMarket;
  /** Readiness-domain ids the sponsor has prepared (from getReadinessDomains). */
  providedDomains: string[];
}

export interface InspectionReadinessResult {
  market: InspectionMarket;
  /** ready ⇔ no required readiness domain is missing. */
  ready: boolean;
  /** The required readiness-domain ids the sponsor has provided. */
  provided: string[];
  /** The required readiness-domain ids the sponsor has not provided. */
  missing: string[];
  /** Fraction of required domains covered, 0..1, rounded to 2 decimals. */
  coverage: number;
  notes: string[];
}

/**
 * Assess a sponsor's prepared readiness domains against the market's required
 * checklist. ready ⇔ no missing domains. Pure / deterministic. Throws for an
 * unmodeled market.
 */
export function assessInspectionReadiness(input: InspectionReadinessInput): InspectionReadinessResult {
  const profile = INSPECTION_PROFILES[input.market];
  if (!profile) throw new Error(`No inspection profile modeled for market "${input.market}".`);

  const requiredIds = profile.readinessDomains.map((d) => d.id);
  const providedSet = new Set((input.providedDomains ?? []).map((d) => String(d)));

  const provided: string[] = [];
  const missing: string[] = [];
  for (const id of requiredIds) {
    if (providedSet.has(id)) provided.push(id);
    else missing.push(id);
  }

  const coverage =
    requiredIds.length === 0 ? 0 : Math.round((provided.length / requiredIds.length) * 100) / 100;

  const notes: string[] = [
    'This is a readiness aid; the agency inspection scope is authoritative and may exceed the modeled domains.',
    missing.length === 0
      ? 'All modeled readiness domains are covered — proceed to evidence/mock-inspection verification.'
      : `Address ${missing.length} uncovered readiness domain(s) before the inspection.`,
  ];

  return {
    market: input.market,
    ready: missing.length === 0,
    provided,
    missing,
    coverage,
    notes,
  };
}
