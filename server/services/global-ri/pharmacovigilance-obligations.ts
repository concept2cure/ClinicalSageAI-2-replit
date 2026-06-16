/**
 * Post-approval pharmacovigilance (PV) obligations expert — per market.
 *
 * Once a product is on the market, the marketing authorisation holder / sponsor
 * carries a standing pharmacovigilance burden: individual case (ICSR) reporting,
 * periodic safety reporting, risk management, and a responsible person /
 * organisational accountability. The required system differs materially by
 * health authority. This service encodes the core post-approval PV obligations
 * per market and assesses a sponsor's PV system against them — surfacing exactly
 * which PV elements are missing before/while the product is marketed.
 *
 * Markets: FDA (US), EMA (EU centralised), PMDA (JP). The element lists capture
 * the major standing obligations; the governing legislation/guidance remains the
 * authority for edge cases and triggering conditions (this is a readiness aid,
 * honest-by-construction — e.g. REMS only where required, EPPV is time-limited).
 *
 * Pure / deterministic — no DB, no IO.
 *
 * References:
 *  - EMA/EU: Directive 2001/83/EC, Title IX; Regulation (EU) 726/2004; the Good
 *    Pharmacovigilance Practices (GVP) modules (esp. I, V, VI, VII, IX, X) and
 *    the EURD list for PSUR/PBRER cadence; EudraVigilance for ICSR (E2B).
 *  - FDA/US: 21 CFR 314.80 (drugs) / 600.80 (biologics) expedited & periodic
 *    safety reporting; 21 CFR 314.81(b)(2) NDA annual report; FDAAA §505-1
 *    (REMS, PMRs/PMCs); FAERS (E2B) submission.
 *  - PMDA/JP: the Pharmaceutical and Medical Device (PMD) Act; GVP and GPSP
 *    ministerial ordinances (post-marketing surveillance, EPPV, re-examination).
 *
 * @module server/services/global-ri/pharmacovigilance-obligations
 */

export type PvMarket = 'FDA' | 'EMA' | 'PMDA';

/** The set of modeled PV markets. */
export const PV_MARKETS: PvMarket[] = ['FDA', 'EMA', 'PMDA'];

export interface PvElement {
  /** Stable element id (e.g. 'qppv', 'expedited_icsr', 'eppv'). */
  id: string;
  /** Human title. */
  title: string;
  /** What the obligation requires of the sponsor / MAH. */
  requirement: string;
  /** Governing citation. */
  citation: string;
}

export interface PvObligations {
  market: PvMarket;
  /** Individual case (ICSR) reporting obligation summary. */
  individualCaseReporting: string;
  /** Periodic aggregate safety report obligation summary. */
  periodicReport: string;
  /** Risk-management obligation summary. */
  riskManagement: string;
  /** Responsible person / accountability summary (QPPV or equivalent). */
  qualifiedPerson: string;
  /** The modeled PV elements for the market. */
  elements: PvElement[];
  /** Primary governing citation for the market's PV framework. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

const EMA_ELEMENTS: PvElement[] = [
  {
    id: 'qppv',
    title: 'Qualified Person for Pharmacovigilance (QPPV)',
    requirement: 'Permanently and continuously available EU-resident QPPV responsible for the establishment and maintenance of the PV system.',
    citation: 'Dir 2001/83/EC Art. 104; Reg (EU) 726/2004 Art. 23; GVP Module I',
  },
  {
    id: 'psmf',
    title: 'Pharmacovigilance System Master File (PSMF)',
    requirement: 'Maintain a PSMF describing the PV system, available to the authorities on request.',
    citation: 'Dir 2001/83/EC Art. 104(3)(b); GVP Module II',
  },
  {
    id: 'rmp',
    title: 'Risk Management Plan (RMP)',
    requirement: 'Maintain an RMP with the safety specification, pharmacovigilance plan, and risk-minimisation measures; update on change.',
    citation: 'Dir 2001/83/EC Art. 104(3)(c); GVP Module V',
  },
  {
    id: 'psur',
    title: 'Periodic Safety Update Report (PSUR/PBRER)',
    requirement: 'Submit PSURs (PBRER format) per the cadence set by the EU reference dates (EURD) list, via the PSUR repository.',
    citation: 'Reg (EU) 726/2004 Art. 28; Dir 2001/83/EC Art. 107b–107c; GVP Module VII',
  },
  {
    id: 'icsr_eudravigilance',
    title: 'ICSR reporting to EudraVigilance',
    requirement: 'Submit individual case safety reports electronically (E2B) to EudraVigilance — serious cases within 15 days, non-serious within 90 days.',
    citation: 'Reg (EU) 726/2004 Art. 28; Dir 2001/83/EC Art. 107; GVP Module VI',
  },
  {
    id: 'signal_management',
    title: 'Signal management & additional monitoring',
    requirement: 'Operate a continuous signal detection/management process; comply with additional-monitoring (black triangle ▼) labelling where listed.',
    citation: 'GVP Module IX; Dir 2001/83/EC Art. 23(1a)/Art. 11; GVP Module X',
  },
];

const FDA_ELEMENTS: PvElement[] = [
  {
    id: 'expedited_icsr',
    title: 'Expedited 15-day ICSR reports',
    requirement: 'Submit expedited reports for serious and unexpected adverse drug experiences within 15 calendar days of receipt.',
    citation: '21 CFR 314.80(c)(1) / 600.80(c)(1)',
  },
  {
    id: 'pader',
    title: 'Periodic adverse drug experience report (PADER/PAQR)',
    requirement: 'Submit periodic safety reports (PADER, or PAQR for biologics) quarterly for the first 3 years post-approval, then annually.',
    citation: '21 CFR 314.80(c)(2) / 600.80(c)(2)',
  },
  {
    id: 'faers',
    title: 'FAERS electronic submission (E2B)',
    requirement: 'Submit ICSRs electronically to the FDA Adverse Event Reporting System (FAERS) in the ICH E2B format.',
    citation: '21 CFR 314.80; FDA E2B(R3) electronic submission guidance',
  },
  {
    id: 'rems_if_required',
    title: 'Risk Evaluation and Mitigation Strategy (REMS), where required',
    requirement: 'Where FDA has required a REMS, implement and maintain it (and any ETASU) and submit REMS assessments on schedule.',
    citation: 'FDAAA §505-1 (21 U.S.C. 355-1)',
  },
  {
    id: 'annual_report',
    title: 'NDA/BLA annual report & postmarketing commitments',
    requirement: 'Submit the application annual report and track/report postmarketing requirements and commitments (PMRs/PMCs).',
    citation: '21 CFR 314.81(b)(2); FDAAA §505-1 (PMRs/PMCs)',
  },
];

const PMDA_ELEMENTS: PvElement[] = [
  {
    id: 'pms',
    title: 'Post-marketing surveillance (PMS)',
    requirement: 'Conduct post-marketing surveillance, including use-results surveys / specified-use-results surveys per the GPSP ordinance.',
    citation: 'PMD Act; GPSP Ministerial Ordinance (MHLW No. 171/2004)',
  },
  {
    id: 'eppv',
    title: 'Early Post-marketing Phase Vigilance (EPPV)',
    requirement: 'Conduct EPPV for the first 6 months after launch — intensive promotion of proper use and rapid collection of adverse reactions.',
    citation: 'PMD Act; GVP Ministerial Ordinance (MHLW No. 135/2004)',
  },
  {
    id: 'periodic_report',
    title: 'Periodic safety reports',
    requirement: 'Submit periodic infection/adverse-reaction safety reports to PMDA/MHLW (PSR), and expedite serious unexpected reactions.',
    citation: 'PMD Act Art. 68-10; enforcement regulations',
  },
  {
    id: 'safety_officer',
    title: 'Safety management supervisor (safety officer)',
    requirement: 'Designate a safety management supervisor responsible for the post-marketing safety operations under the GVP ordinance.',
    citation: 'GVP Ministerial Ordinance (MHLW No. 135/2004)',
  },
  {
    id: 'reexamination',
    title: 'Re-examination data collection',
    requirement: 'Collect and submit the data required for the re-examination (再審査) of the product over its designated re-examination period.',
    citation: 'PMD Act Art. 14-4 (re-examination); GPSP Ordinance',
  },
];

const PV_ELEMENTS_BY_MARKET: Record<PvMarket, PvElement[]> = {
  FDA: FDA_ELEMENTS,
  EMA: EMA_ELEMENTS,
  PMDA: PMDA_ELEMENTS,
};

const PV_OBLIGATIONS: Record<PvMarket, PvObligations> = {
  EMA: {
    market: 'EMA',
    individualCaseReporting: 'Electronic ICSRs (E2B) to EudraVigilance — serious within 15 days, non-serious within 90 days.',
    periodicReport: 'PSUR/PBRER per the EURD list cadence, via the PSUR repository.',
    riskManagement: 'Risk Management Plan (RMP) maintained and updated; risk-minimisation measures.',
    qualifiedPerson: 'EU-resident Qualified Person for Pharmacovigilance (QPPV), permanently and continuously available.',
    elements: EMA_ELEMENTS,
    citation: 'Dir 2001/83/EC Title IX; Reg (EU) 726/2004; GVP modules',
    notes: [
      'Additional-monitoring (black triangle ▼) status applies only to products on the EMA additional-monitoring list.',
      'PSUR cadence is governed by the EURD list and may be waived for certain generics/well-established-use products.',
      'A readiness aid — the governing legislation and GVP guidance remain the authority.',
    ],
  },
  FDA: {
    market: 'FDA',
    individualCaseReporting: 'Expedited 15-day reports for serious & unexpected ADRs; ICSRs submitted to FAERS in E2B format.',
    periodicReport: 'Periodic adverse drug experience report (PADER/PAQR) — quarterly for 3 years, then annually.',
    riskManagement: 'REMS only where FDA has required one; PMRs/PMCs tracked.',
    qualifiedPerson: 'No statutory resident QPPV equivalent — pharmacovigilance is the sponsor\'s responsibility.',
    elements: FDA_ELEMENTS,
    citation: '21 CFR 314.80 / 600.80; 21 CFR 314.81; FDAAA §505-1',
    notes: [
      'REMS is required only for specific products as determined by FDA; absence of a REMS is not a deficiency.',
      'There is no FDA equivalent of an EU-resident QPPV; accountability rests with the sponsor.',
      'A readiness aid — the governing regulations and FDA guidance remain the authority.',
    ],
  },
  PMDA: {
    market: 'PMDA',
    individualCaseReporting: 'Expedited reporting of serious/unexpected adverse reactions to PMDA/MHLW under the PMD Act.',
    periodicReport: 'Periodic safety reports (PSR) submitted to PMDA/MHLW.',
    riskManagement: 'Post-marketing surveillance (PMS), Risk Management Plan (J-RMP), and re-examination data collection.',
    qualifiedPerson: 'Designated safety management supervisor (safety officer) under the GVP ordinance.',
    elements: PMDA_ELEMENTS,
    citation: 'PMD Act; GVP / GPSP Ministerial Ordinances',
    notes: [
      'EPPV is time-limited (first 6 months post-launch) and not a standing obligation thereafter.',
      'The re-examination period is product-specific (designated at approval).',
      'A readiness aid — the PMD Act and ministerial ordinances remain the authority.',
    ],
  },
};

export interface PvReadinessInput {
  market: PvMarket;
  /** PV element ids the sponsor has in place (from getPvElements). */
  providedElements: string[];
}

export interface PvReadinessResult {
  market: PvMarket;
  /** True iff no required elements are missing. */
  ready: boolean;
  /** Provided element ids that match the market's modeled set. */
  provided: string[];
  /** Required element ids the sponsor has not provided. */
  missing: string[];
  /** Fraction of required elements provided, 0..1, rounded to 2 dp. */
  coverage: number;
  /** Honest caveats. */
  notes: string[];
}

/**
 * Get the full post-approval PV obligations for a market.
 * Pure / deterministic. Throws for an unmodeled market.
 */
export function getPvObligations(market: PvMarket): PvObligations {
  const obligations = PV_OBLIGATIONS[market];
  if (!obligations) throw new Error(`No pharmacovigilance obligations modeled for market "${market}".`);
  return obligations;
}

/**
 * List the modeled PV element ids for a market (for a checklist UI).
 * Returns [] for an unmodeled market (mirrors getRegionalModule1Requirements).
 */
export function getPvElements(market: PvMarket): string[] {
  return (PV_ELEMENTS_BY_MARKET[market] ?? []).map((e) => e.id);
}

/**
 * Assess a sponsor's PV system against the market's modeled element set.
 * ready ⇔ no missing required elements. Pure / deterministic.
 * Throws for an unmodeled market.
 */
export function assessPvReadiness(input: PvReadinessInput): PvReadinessResult {
  const required = PV_ELEMENTS_BY_MARKET[input.market];
  if (!required) throw new Error(`No pharmacovigilance obligations modeled for market "${input.market}".`);

  const requiredIds = required.map((e) => e.id);
  const requiredSet = new Set(requiredIds);
  const providedSet = new Set((input.providedElements ?? []).map((c) => String(c)));

  const provided = requiredIds.filter((id) => providedSet.has(id));
  const missing = requiredIds.filter((id) => !providedSet.has(id));
  const coverage = requiredIds.length === 0
    ? 0
    : Math.round((provided.length / requiredIds.length) * 100) / 100;

  return {
    market: input.market,
    ready: missing.length === 0,
    provided,
    missing,
    coverage,
    notes: [
      'Coverage reflects the modeled PV elements only; the governing legislation/guidance remains the authority for edge cases and triggering conditions.',
      missing.length === 0
        ? 'All modeled PV elements are in place.'
        : `Missing ${missing.length} of ${requiredSet.size} modeled PV elements.`,
    ],
  };
}
