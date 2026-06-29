/**
 * Pharmacovigilance & Signal Detection — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for individual case safety
 * report (ICSR) expedited-reporting classification, causality assessment
 * (WHO-UMC + Naranjo), aggregate safety report selection and scheduling
 * (PBRER/PSUR, DSUR, PADER), disproportionality-based signal detection
 * (PRR, ROR, EBGM concepts), validated-signal prioritization, and
 * pharmacovigilance system design (QPPV / PSMF / safety database / RMP).
 *
 * NO LLM, NO network, NO database, NO imports from other services. Every
 * function is closed-form and reproducible: identical input always yields
 * identical output.
 *
 * Regulatory citations (verbatim, do not paraphrase into law):
 *   - ICH E2A (1994) — Clinical Safety Data Management: Definitions and
 *     Standards for Expedited Reporting.
 *   - ICH E2B(R3) (2016) — Electronic Transmission of ICSRs / data elements.
 *   - ICH E2C(R2) (2012) — Periodic Benefit-Risk Evaluation Report (PBRER).
 *   - ICH E2D (2003) — Post-Approval Safety Data Management.
 *   - ICH E2E (2004) — Pharmacovigilance Planning.
 *   - ICH E2F (2010) — Development Safety Update Report (DSUR).
 *   - EU GVP Module VI (Rev 2, 2017) — Collection, management and submission
 *     of reports of suspected adverse reactions.
 *   - EU GVP Module IX (Rev 1, 2017) — Signal management.
 *   - EU GVP Module V (Rev 2, 2017) — Risk management systems (RMP).
 *   - EU GVP Module II — Pharmacovigilance system master file (PSMF).
 *   - 21 CFR 314.80 — Postmarketing reporting of adverse drug experiences (NDA).
 *   - 21 CFR 600.80 — Postmarketing reporting of adverse experiences (biologics).
 *   - 21 CFR 314.98 / 21 CFR 314.81 (PADER / NDA periodic reports).
 *   - FDA FAERS (FDA Adverse Event Reporting System).
 *   - EU EVDAS (EudraVigilance Data Analysis System) / EudraVigilance.
 *   - WHO-UMC system for standardised case causality assessment.
 *   - Naranjo CA, et al. Clin Pharmacol Ther. 1981;30(2):239-245 (Naranjo ADR
 *     probability scale).
 *   - Evans SJW, et al. Pharmacoepidemiol Drug Saf. 2001 (PRR methodology).
 *   - Rothman KJ, et al. (ROR methodology). DuMouchel W. Am Stat. 1999 (EBGM).
 *
 * @module server/services/pharmacovigilance/pharmacovigilance-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 0. Shared Types
// ─────────────────────────────────────────────────────────────────────────────

/** Regulatory jurisdiction for reporting-rule application. */
export type PVRegion = 'fda' | 'eu' | 'both';

/** Lifecycle stage of the product generating the case. */
export type ProductStage = 'investigational' | 'marketed' | 'both';

/** A standardized regulatory clock expressed in calendar days. */
export interface ReportingClock {
  calendarDays: number;
  startEvent: string;
  description: string;
}

/** Three-tier yes/no/unknown used widely in PV decision logic. */
export type Trilean = 'yes' | 'no' | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1. Seriousness Criteria (ICH E2A / E2D, GVP Annex I)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ICH E2A "serious" criteria. An adverse event/reaction is serious if it
 * meets ONE OR MORE of these. "Serious" is NOT a synonym for "severe": severity
 * grades intensity, seriousness grades regulatory/clinical consequence.
 */
export type SeriousnessCriterion =
  | 'death'
  | 'life_threatening'
  | 'hospitalization'
  | 'prolonged_hospitalization'
  | 'disability'
  | 'congenital_anomaly'
  | 'medically_important';

export interface SeriousnessCriterionInfo {
  criterion: SeriousnessCriterion;
  label: string;
  definition: string;
  citation: string;
}

const SERIOUSNESS_CRITERIA: SeriousnessCriterionInfo[] = [
  {
    criterion: 'death',
    label: 'Results in death',
    definition:
      'The adverse event resulted in death. The event leading to death, not ' +
      'the fact of death itself, is the reaction term; "death" is an outcome, ' +
      'and the reaction(s) that caused it must be captured as serious.',
    citation: 'ICH E2A Section II.B; ICH E2D Section 3.1; GVP Annex I.',
  },
  {
    criterion: 'life_threatening',
    label: 'Is life-threatening',
    definition:
      'The patient was at substantial risk of death AT THE TIME of the reaction. ' +
      'It does NOT refer to a reaction that hypothetically might have caused ' +
      'death had it been more severe.',
    citation: 'ICH E2A Section II.B; GVP Annex I.',
  },
  {
    criterion: 'hospitalization',
    label: 'Requires inpatient hospitalization',
    definition:
      'The reaction required initial inpatient hospitalization. Emergency-room ' +
      'visits and same-day/outpatient procedures that do not result in admission ' +
      'are not, on this criterion alone, serious.',
    citation: 'ICH E2A Section II.B; 21 CFR 314.80(a).',
  },
  {
    criterion: 'prolonged_hospitalization',
    label: 'Prolongs existing hospitalization',
    definition:
      'The reaction prolonged an existing inpatient hospitalization beyond the ' +
      'expected duration for the condition that prompted admission.',
    citation: 'ICH E2A Section II.B; 21 CFR 314.80(a).',
  },
  {
    criterion: 'disability',
    label: 'Results in persistent/significant disability or incapacity',
    definition:
      'The reaction resulted in a substantial disruption of the ability to ' +
      'conduct normal life functions (persistent or significant disability/incapacity).',
    citation: 'ICH E2A Section II.B; 21 CFR 314.80(a).',
  },
  {
    criterion: 'congenital_anomaly',
    label: 'Is a congenital anomaly / birth defect',
    definition:
      'A congenital anomaly or birth defect in the offspring of a patient exposed ' +
      'to the product (including transplacental exposure).',
    citation: 'ICH E2A Section II.B; 21 CFR 314.80(a).',
  },
  {
    criterion: 'medically_important',
    label: 'Other medically important condition (IME)',
    definition:
      'An important medical event that may not be immediately life-threatening ' +
      'or result in death/hospitalization but may jeopardize the patient and may ' +
      'require intervention to prevent one of the other serious outcomes. Examples: ' +
      'bronchospasm requiring intensive treatment in the ER, blood dyscrasias, ' +
      'convulsions, development of drug dependency or abuse. Judged using the ' +
      'EudraVigilance Important Medical Event (IME) list as an aid.',
    citation: 'ICH E2A Section II.B; GVP Annex I; EMA IME list.',
  },
];

/** Lookup the canonical definition/citation for a seriousness criterion. */
export function getSeriousnessCriterion(
  criterion: SeriousnessCriterion,
): SeriousnessCriterionInfo {
  const found = SERIOUSNESS_CRITERIA.find(
    (c: SeriousnessCriterionInfo) => c.criterion === criterion,
  );
  if (found) return found;
  return {
    criterion: 'medically_important',
    label: 'Other medically important condition (IME)',
    definition: SERIOUSNESS_CRITERIA[SERIOUSNESS_CRITERIA.length - 1].definition,
    citation: 'ICH E2A Section II.B.',
  };
}

/** All seriousness criteria (read-only copy for callers/UI). */
export function listSeriousnessCriteria(): SeriousnessCriterionInfo[] {
  return SERIOUSNESS_CRITERIA.map((c: SeriousnessCriterionInfo) => ({ ...c }));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2. Expedited Reporting Classification (ICH E2A; 21 CFR 314.80; GVP VI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The four core ICSR attributes that drive expedited-reporting obligations.
 * The decisive cell of the expedited-reporting matrix is:
 *   SERIOUS + UNEXPECTED + has-reasonable-causal-relationship.
 * In the development setting this is the definition of a SUSAR (Suspected
 * Unexpected Serious Adverse Reaction).
 */
export interface ExpeditedReportingParams {
  /** Lifecycle stage. Investigational => SUSAR rules; marketed => 314.80/GVP VI. */
  stage: ProductStage;
  /** Does the case meet >= 1 ICH E2A seriousness criterion? */
  serious: boolean;
  /** Specific seriousness criteria met (drives the 7-day vs 15-day clock). */
  seriousnessCriteria?: SeriousnessCriterion[];
  /**
   * Expectedness vs the reference safety information (RSI: IB Development
   * Reference Safety Information for investigational; CCDS/SmPC/label for
   * marketed). "unexpected" = nature/severity/specificity/outcome not consistent
   * with the RSI.
   */
  expectedness: 'expected' | 'unexpected' | 'unknown';
  /**
   * Causality / relatedness — is there a reasonable possibility of a causal
   * relationship between the product and the event (per investigator and/or
   * sponsor)? In ICH terms a "reaction" requires this; an "event" does not.
   */
  relatedness: 'related' | 'not_related' | 'unknown';
  /** Regulatory region(s) for which to compute the obligation. */
  region: PVRegion;
  /** Whether the source is a clinical trial conducted under an IND/CTA. */
  fromInterventionalStudy?: boolean;
  /** Whether the report originates from the EU (affects EU reporting routing). */
  occurredInEU?: boolean;
}

export interface ExpeditedReportingObligationItem {
  region: 'fda' | 'eu';
  reportable: boolean;
  reportType: string;
  clock: ReportingClock | null;
  destination: string;
  citation: string;
  notes: string[];
}

export interface ExpeditedReportingResult {
  classification: string;
  isSUSAR: boolean;
  serious: boolean;
  expectedness: 'expected' | 'unexpected' | 'unknown';
  relatedness: 'related' | 'not_related' | 'unknown';
  reasonableCausalRelationship: boolean;
  obligations: ExpeditedReportingObligationItem[];
  fastestClockDays: number | null;
  rationale: string[];
  warnings: string[];
  citations: string[];
}

/** True if the case carries a death or life-threatening seriousness flag. */
function hasFatalOrLifeThreatening(
  criteria: SeriousnessCriterion[] | undefined,
): boolean {
  if (!criteria) return false;
  return criteria.some(
    (c: SeriousnessCriterion) => c === 'death' || c === 'life_threatening',
  );
}

/**
 * classifyExpeditedReporting — determine the expedited-reporting obligation and
 * regulatory clock for an individual case, separately for FDA and EU.
 *
 * Clock rules implemented (calendar days from sponsor/MAH first awareness, "Day 0"):
 *   - Development (SUSAR), ICH E2A / EU CT Regulation / FDA IND Safety:
 *       fatal or life-threatening SUSAR ......... 7 calendar days
 *       (followup within an additional 8 days, i.e. complete report by Day 15)
 *       other serious SUSAR ..................... 15 calendar days
 *   - Marketed, 21 CFR 314.80 / 600.80 (FDA):
 *       serious AND unexpected (15-day "Alert"). 15 calendar days
 *       serious-expected / non-serious .......... periodic (PADER / PBRER)
 *   - Marketed, GVP Module VI (EU):
 *       serious ................................. 15 calendar days to EudraVigilance
 *       non-serious (EEA-origin) ................ 90 calendar days to EudraVigilance
 */
export function classifyExpeditedReporting(
  params: ExpeditedReportingParams,
): ExpeditedReportingResult {
  const rationale: string[] = [];
  const warnings: string[] = [];
  const citations: string[] = [];

  const reasonableCausal = params.relatedness === 'related';
  const isUnexpected = params.expectedness === 'unexpected';
  const isDevelopment =
    params.stage === 'investigational' ||
    params.fromInterventionalStudy === true;

  // A SUSAR = Serious + Unexpected + Suspected (reasonable causal relationship).
  const isSUSAR =
    params.serious && isUnexpected && reasonableCausal && isDevelopment;

  if (params.relatedness === 'unknown') {
    warnings.push(
      'Relatedness is UNKNOWN. For reporting purposes, an unknown/missing ' +
        'causality assessment from EITHER the reporter OR the sponsor is treated ' +
        'as a reasonable possibility of causality (i.e., reportable). Resolve the ' +
        'causality before downgrading any obligation.',
    );
  }
  if (params.expectedness === 'unknown') {
    warnings.push(
      'Expectedness is UNKNOWN. Compare the reaction term against the current ' +
        'Reference Safety Information (RSI) — Development RSI in the IB for ' +
        'investigational products, or the approved label/CCDS/SmPC for marketed ' +
        'products. When in doubt, classify as unexpected (more conservative).',
    );
  }

  // Treat unknown causality/expectedness conservatively for the obligation calc.
  const treatAsCausal = params.relatedness !== 'not_related';
  const treatAsUnexpected = params.expectedness !== 'expected';

  let classification: string;
  if (isSUSAR) {
    classification = 'SUSAR (Suspected Unexpected Serious Adverse Reaction)';
    rationale.push(
      'Case is SERIOUS, UNEXPECTED vs the RSI, and has a reasonable possibility ' +
        'of a causal relationship to an investigational product => SUSAR (ICH E2A).',
    );
  } else if (params.serious && treatAsCausal) {
    classification = treatAsUnexpected
      ? 'Serious, unexpected adverse reaction (expedited)'
      : 'Serious, expected adverse reaction';
    rationale.push(
      'Case is a SERIOUS suspected adverse reaction (reasonable causal possibility).',
    );
  } else if (params.serious && !treatAsCausal) {
    classification = 'Serious adverse event (no reasonable causal relationship)';
    rationale.push(
      'Case is SERIOUS but no reasonable possibility of causal relationship was ' +
        'assessed; this is a serious adverse EVENT, not a reaction.',
    );
  } else {
    classification = 'Non-serious adverse event/reaction';
    rationale.push('Case does not meet any ICH E2A seriousness criterion.');
  }

  const fatalOrLT = hasFatalOrLifeThreatening(params.seriousnessCriteria);
  const obligations: ExpeditedReportingObligationItem[] = [];

  // ── FDA obligation ────────────────────────────────────────────────────────
  if (params.region === 'fda' || params.region === 'both') {
    if (isDevelopment) {
      // 21 CFR 312.32 IND Safety Reporting.
      if (params.serious && treatAsUnexpected && treatAsCausal) {
        const clockDays = fatalOrLT ? 7 : 15;
        obligations.push({
          region: 'fda',
          reportable: true,
          reportType: fatalOrLT
            ? 'IND Safety Report — fatal/life-threatening suspected unexpected serious adverse reaction (7-day)'
            : 'IND Safety Report — suspected unexpected serious adverse reaction (15-day)',
          clock: {
            calendarDays: clockDays,
            startEvent:
              'Day 0 = sponsor first becomes aware that the case qualifies (initial receipt of minimum criteria).',
            description: fatalOrLT
              ? 'Notify FDA and all participating investigators within 7 calendar days; submit a complete report within 15 calendar days.'
              : 'Notify FDA and all participating investigators within 15 calendar days.',
          },
          destination:
            'FDA (CDER/CBER) via FDA Safety Reporting Portal / E2B(R3) gateway; and all participating investigators.',
          citation: '21 CFR 312.32(c)(1) — IND safety reports.',
          notes: [
            'Applies to suspected unexpected serious adverse reactions and to ' +
              'findings from other sources that suggest a significant human risk.',
          ],
        });
      } else {
        obligations.push({
          region: 'fda',
          reportable: false,
          reportType:
            'Not individually expedited under 21 CFR 312.32 — capture in the annual IND report / DSUR.',
          clock: null,
          destination: 'Annual report (21 CFR 312.33) / DSUR (ICH E2F).',
          citation: '21 CFR 312.32; 21 CFR 312.33.',
          notes: [
            'Serious-but-expected, or unrelated, or non-serious cases are aggregated, not expedited.',
          ],
        });
      }
    } else {
      // 21 CFR 314.80 / 600.80 postmarketing.
      if (params.serious && treatAsUnexpected) {
        obligations.push({
          region: 'fda',
          reportable: true,
          reportType: '15-day "Alert report" — serious AND unexpected (postmarketing)',
          clock: {
            calendarDays: 15,
            startEvent:
              'Day 0 = the applicant first receives the information (initial receipt).',
            description:
              'Submit to FDA within 15 calendar days of initial receipt; investigate and submit follow-up within 15 days of receiving new information.',
          },
          destination:
            'FDA Adverse Event Reporting System (FAERS) via E2B(R3) / FDA Gateway (ESG).',
          citation:
            '21 CFR 314.80(c)(1) (drugs) / 21 CFR 600.80(c)(1) (biologics) — 15-day Alert reports.',
          notes: [
            'Both seriousness AND unexpectedness are required for the 15-day clock.',
            'A reasonable causal relationship is presumed for postmarketing ' +
              'spontaneous reports (a spontaneous report implies suspicion).',
          ],
        });
      } else {
        obligations.push({
          region: 'fda',
          reportable: false,
          reportType:
            'Periodic — included in the PADER (or PBRER if agreed under FDAAA) (postmarketing)',
          clock: null,
          destination: 'PADER (21 CFR 314.80(c)(2)) / 600.80(c)(2).',
          citation: '21 CFR 314.80(c)(2) — periodic adverse drug experience reports.',
          notes: [
            'Serious-expected and non-serious cases are reported periodically, not as 15-day Alerts.',
          ],
        });
      }
    }
  }

  // ── EU obligation ─────────────────────────────────────────────────────────
  if (params.region === 'eu' || params.region === 'both') {
    if (isDevelopment) {
      // EU Clinical Trial Regulation (EU) No 536/2014 SUSAR reporting.
      if (params.serious && treatAsUnexpected && treatAsCausal) {
        const clockDays = fatalOrLT ? 7 : 15;
        obligations.push({
          region: 'eu',
          reportable: true,
          reportType: fatalOrLT
            ? 'SUSAR — fatal/life-threatening (7-day, EU CT Regulation 536/2014)'
            : 'SUSAR — other serious (15-day, EU CT Regulation 536/2014)',
          clock: {
            calendarDays: clockDays,
            startEvent:
              'Day 0 = the date the sponsor first has knowledge of the minimum criteria for reporting.',
            description: fatalOrLT
              ? 'Report to EudraVigilance (EVCTM) within 7 calendar days; relevant follow-up within an additional 8 days.'
              : 'Report to EudraVigilance (EVCTM) within 15 calendar days.',
          },
          destination:
            'EudraVigilance Clinical Trial Module (EVCTM) via E2B(R3); concerned Member States as required.',
          citation:
            'Regulation (EU) No 536/2014 Article 42; ICH E2A; Detailed guidance CT-3.',
          notes: [
            'Expectedness is assessed against the Reference Safety Information (RSI) section of the IB.',
          ],
        });
      } else {
        obligations.push({
          region: 'eu',
          reportable: false,
          reportType: 'Not an expedited SUSAR — aggregate in the annual DSUR (ICH E2F).',
          clock: null,
          destination: 'DSUR (ICH E2F), submitted annually to concerned authorities.',
          citation: 'ICH E2F; Regulation (EU) No 536/2014 Article 43.',
          notes: ['Serious-expected, unrelated, or non-serious cases are aggregated in the DSUR.'],
        });
      }
    } else {
      // GVP Module VI postmarketing.
      if (params.serious) {
        obligations.push({
          region: 'eu',
          reportable: true,
          reportType: 'Serious ICSR — 15-day report to EudraVigilance (GVP Module VI)',
          clock: {
            calendarDays: 15,
            startEvent:
              'Day 0 = the date of receipt of the minimum information by any personnel of the MAH (or any contractual partner).',
            description:
              'Submit serious valid ICSRs to EudraVigilance within 15 calendar days.',
          },
          destination: 'EudraVigilance (EVPM) via E2B(R3).',
          citation: 'GVP Module VI (Rev 2) VI.C.4; Regulation (EC) No 726/2004.',
          notes: [
            'Under EudraVigilance simplified reporting, MAHs submit to EudraVigilance ' +
              'and the Agency makes reports available to national authorities.',
            'Expectedness no longer changes the EU postmarketing clock — all serious ' +
              'cases are 15-day; expectedness still drives signal/aggregate analysis.',
          ],
        });
      } else {
        obligations.push({
          region: 'eu',
          reportable: params.occurredInEU === true,
          reportType: params.occurredInEU
            ? 'Non-serious EEA-origin ICSR — 90-day report to EudraVigilance (GVP Module VI)'
            : 'Non-serious non-EEA — not individually reportable to EudraVigilance; aggregate in PBRER.',
          clock: params.occurredInEU
            ? {
                calendarDays: 90,
                startEvent: 'Day 0 = date of receipt of the minimum information by the MAH.',
                description:
                  'Submit non-serious ICSRs occurring in the EEA to EudraVigilance within 90 calendar days.',
              }
            : null,
          destination: params.occurredInEU
            ? 'EudraVigilance (EVPM) via E2B(R3).'
            : 'PBRER (ICH E2C(R2)).',
          citation: 'GVP Module VI (Rev 2) VI.C.4.',
          notes: [
            'Only NON-serious cases that occurred in the EEA carry the 90-day individual clock.',
          ],
        });
      }
    }
  }

  // Fastest applicable clock across regions.
  let fastestClockDays: number | null = null;
  for (const o of obligations) {
    if (o.reportable && o.clock) {
      if (fastestClockDays === null || o.clock.calendarDays < fastestClockDays) {
        fastestClockDays = o.clock.calendarDays;
      }
    }
  }

  if (fatalOrLT && isSUSAR) {
    rationale.push(
      'A death or life-threatening seriousness flag is present => the SHORTER ' +
        '7-calendar-day clock applies (with completion of the report by Day 15).',
    );
  } else if (params.serious) {
    rationale.push(
      'No death/life-threatening flag => the standard 15-calendar-day clock applies to expedited cases.',
    );
  }

  citations.push(
    'ICH E2A (1994) — Clinical Safety Data Management: Definitions and Standards for Expedited Reporting.',
    '21 CFR 312.32 — IND safety reporting; 21 CFR 314.80 / 600.80 — postmarketing reporting.',
    'EU GVP Module VI (Rev 2, 2017); Regulation (EU) No 536/2014 Article 42 (SUSAR reporting).',
    'ICH E2D (2003) — Post-Approval Safety Data Management (seriousness/expectedness definitions).',
  );

  return {
    classification,
    isSUSAR,
    serious: params.serious,
    expectedness: params.expectedness,
    relatedness: params.relatedness,
    reasonableCausalRelationship: reasonableCausal,
    obligations,
    fastestClockDays,
    rationale,
    warnings,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3. Causality Assessment — WHO-UMC + Naranjo (Naranjo CA et al., 1981)
// ─────────────────────────────────────────────────────────────────────────────

/** The six WHO-UMC standardized causality categories. */
export type WHOUMCCategory =
  | 'certain'
  | 'probable'
  | 'possible'
  | 'unlikely'
  | 'conditional'
  | 'unassessable';

export interface WHOUMCCategoryInfo {
  category: WHOUMCCategory;
  label: string;
  criteria: string[];
}

const WHO_UMC_CRITERIA: WHOUMCCategoryInfo[] = [
  {
    category: 'certain',
    label: 'Certain',
    criteria: [
      'Plausible time relationship to drug intake',
      'Cannot be explained by disease or other drugs',
      'Plausible response to withdrawal (dechallenge positive)',
      'Pharmacologically/phenomenologically definitive (an objective and specific medical disorder or a recognised pharmacological phenomenon)',
      'Rechallenge satisfactory, if necessary',
    ],
  },
  {
    category: 'probable',
    label: 'Probable / Likely',
    criteria: [
      'Reasonable time relationship to drug intake',
      'Unlikely to be attributed to disease or other drugs',
      'Reasonable response on withdrawal (dechallenge)',
      'Rechallenge not required',
    ],
  },
  {
    category: 'possible',
    label: 'Possible',
    criteria: [
      'Reasonable time relationship to drug intake',
      'Could also be explained by disease or other drugs',
      'Information on drug withdrawal may be lacking or unclear',
    ],
  },
  {
    category: 'unlikely',
    label: 'Unlikely',
    criteria: [
      'Time to event improbable (but not impossible)',
      'Disease or other drugs provide plausible explanations',
    ],
  },
  {
    category: 'conditional',
    label: 'Conditional / Unclassified',
    criteria: [
      'Event or laboratory test abnormality',
      'More data needed for proper assessment, or additional data under examination',
    ],
  },
  {
    category: 'unassessable',
    label: 'Unassessable / Unclassifiable',
    criteria: [
      'Report suggesting an adverse reaction',
      'Cannot be judged because information is insufficient or contradictory',
      'Data cannot be supplemented or verified',
    ],
  },
];

/** Naranjo probability category derived from the total score. */
export type NaranjoCategory = 'definite' | 'probable' | 'possible' | 'doubtful';

/**
 * The 10 Naranjo ADR Probability Scale questions. Each answer maps to a score.
 * The caller supplies one answer per question id; "unknown"/"do_not_know" maps
 * to the scale's "Do not know / not done" column.
 */
export type NaranjoAnswer = 'yes' | 'no' | 'unknown';

export type NaranjoQuestionId =
  | 'q1_previous_reports'
  | 'q2_after_drug'
  | 'q3_dechallenge'
  | 'q4_rechallenge'
  | 'q5_alternative_causes'
  | 'q6_placebo'
  | 'q7_toxic_concentration'
  | 'q8_dose_response'
  | 'q9_previous_exposure'
  | 'q10_objective_evidence';

export interface NaranjoQuestionInfo {
  id: NaranjoQuestionId;
  question: string;
  /** Score awarded for yes / no / unknown respectively. */
  scoreYes: number;
  scoreNo: number;
  scoreUnknown: number;
}

const NARANJO_QUESTIONS: NaranjoQuestionInfo[] = [
  {
    id: 'q1_previous_reports',
    question:
      'Are there previous conclusive reports on this reaction?',
    scoreYes: 1,
    scoreNo: 0,
    scoreUnknown: 0,
  },
  {
    id: 'q2_after_drug',
    question:
      'Did the adverse event appear after the suspected drug was administered?',
    scoreYes: 2,
    scoreNo: -1,
    scoreUnknown: 0,
  },
  {
    id: 'q3_dechallenge',
    question:
      'Did the adverse reaction improve when the drug was discontinued or a specific antagonist was administered? (positive dechallenge)',
    scoreYes: 1,
    scoreNo: 0,
    scoreUnknown: 0,
  },
  {
    id: 'q4_rechallenge',
    question:
      'Did the adverse reaction reappear when the drug was re-administered? (positive rechallenge)',
    scoreYes: 2,
    scoreNo: -1,
    scoreUnknown: 0,
  },
  {
    id: 'q5_alternative_causes',
    question:
      'Are there alternative causes (other than the drug) that could on their own have caused the reaction?',
    scoreYes: -1,
    scoreNo: 2,
    scoreUnknown: 0,
  },
  {
    id: 'q6_placebo',
    question: 'Did the reaction reappear when a placebo was given?',
    scoreYes: -1,
    scoreNo: 1,
    scoreUnknown: 0,
  },
  {
    id: 'q7_toxic_concentration',
    question:
      'Was the drug detected in blood (or other fluids) in concentrations known to be toxic?',
    scoreYes: 1,
    scoreNo: 0,
    scoreUnknown: 0,
  },
  {
    id: 'q8_dose_response',
    question:
      'Was the reaction more severe when the dose was increased, or less severe when the dose was decreased?',
    scoreYes: 1,
    scoreNo: 0,
    scoreUnknown: 0,
  },
  {
    id: 'q9_previous_exposure',
    question:
      'Did the patient have a similar reaction to the same or similar drugs in any previous exposure?',
    scoreYes: 1,
    scoreNo: 0,
    scoreUnknown: 0,
  },
  {
    id: 'q10_objective_evidence',
    question:
      'Was the adverse event confirmed by any objective evidence?',
    scoreYes: 1,
    scoreNo: 0,
    scoreUnknown: 0,
  },
];

export interface CausalityParams {
  /** Naranjo answers keyed by question id. Missing keys default to "unknown". */
  naranjoAnswers?: Partial<Record<NaranjoQuestionId, NaranjoAnswer>>;
  /** Dechallenge outcome (drug withdrawn). */
  dechallenge?: 'positive' | 'negative' | 'not_done' | 'unknown';
  /** Rechallenge outcome (drug re-administered). */
  rechallenge?: 'positive' | 'negative' | 'not_done' | 'unknown';
  /** Is the temporal relationship plausible/reasonable? */
  temporalPlausible?: Trilean;
  /** Can the event be explained by concurrent disease or other drugs? */
  alternativeExplanation?: Trilean;
  /** Is the event a recognised pharmacological/phenomenological effect of the drug? */
  pharmacologicallyKnown?: Trilean;
  /** Is the available information sufficient & non-contradictory to assess at all? */
  informationSufficient?: boolean;
}

export interface NaranjoBreakdownItem {
  id: NaranjoQuestionId;
  question: string;
  answer: NaranjoAnswer;
  score: number;
}

export interface CausalityResult {
  naranjoScore: number;
  naranjoCategory: NaranjoCategory;
  naranjoBreakdown: NaranjoBreakdownItem[];
  whoUmcCategory: WHOUMCCategory;
  whoUmcCriteria: string[];
  dechallenge: 'positive' | 'negative' | 'not_done' | 'unknown';
  rechallenge: 'positive' | 'negative' | 'not_done' | 'unknown';
  agreement: string;
  rationale: string[];
  warnings: string[];
  citations: string[];
}

/** Map the Naranjo total to its probability category (Naranjo et al., 1981). */
function naranjoCategoryFromScore(score: number): NaranjoCategory {
  if (score >= 9) return 'definite';
  if (score >= 5) return 'probable';
  if (score >= 1) return 'possible';
  return 'doubtful';
}

/** Compute the deterministic Naranjo total from per-question answers. */
function computeNaranjo(
  answers: Partial<Record<NaranjoQuestionId, NaranjoAnswer>> | undefined,
): { total: number; breakdown: NaranjoBreakdownItem[] } {
  const breakdown: NaranjoBreakdownItem[] = [];
  let total = 0;
  for (const q of NARANJO_QUESTIONS) {
    const answer: NaranjoAnswer = (answers && answers[q.id]) || 'unknown';
    let score: number;
    if (answer === 'yes') score = q.scoreYes;
    else if (answer === 'no') score = q.scoreNo;
    else score = q.scoreUnknown;
    total += score;
    breakdown.push({ id: q.id, question: q.question, answer, score });
  }
  return { total, breakdown };
}

/**
 * assessCausality — produce a deterministic causality grade for a single case
 * using BOTH the Naranjo ADR Probability Scale (numeric, computed from the
 * answers) AND the WHO-UMC standardized categories, with dechallenge/rechallenge
 * logic. The two systems are reported side-by-side with an agreement note.
 */
export function assessCausality(params: CausalityParams): CausalityResult {
  const rationale: string[] = [];
  const warnings: string[] = [];

  // ── Naranjo ──────────────────────────────────────────────────────────────
  // Derive dechallenge/rechallenge Naranjo answers from explicit fields if the
  // caller did not supply q3/q4 directly (keeps the two inputs consistent).
  const answers: Partial<Record<NaranjoQuestionId, NaranjoAnswer>> = {
    ...(params.naranjoAnswers || {}),
  };
  if (answers.q3_dechallenge === undefined && params.dechallenge) {
    answers.q3_dechallenge =
      params.dechallenge === 'positive'
        ? 'yes'
        : params.dechallenge === 'negative'
          ? 'no'
          : 'unknown';
  }
  if (answers.q4_rechallenge === undefined && params.rechallenge) {
    answers.q4_rechallenge =
      params.rechallenge === 'positive'
        ? 'yes'
        : params.rechallenge === 'negative'
          ? 'no'
          : 'unknown';
  }

  const { total, breakdown } = computeNaranjo(answers);
  const naranjoCategory = naranjoCategoryFromScore(total);
  rationale.push(
    `Naranjo total = ${total} (sum of the 10 weighted answers) => "${naranjoCategory}" ` +
      '(>=9 definite, 5-8 probable, 1-4 possible, <=0 doubtful).',
  );

  // ── Dechallenge / rechallenge resolution ───────────────────────────────────
  const dechallenge = params.dechallenge || 'unknown';
  const rechallenge = params.rechallenge || 'unknown';
  if (rechallenge === 'positive') {
    rationale.push(
      'Positive rechallenge: the reaction recurred on re-administration — the ' +
        'single strongest individual-case evidence of causality.',
    );
  }
  if (dechallenge === 'positive') {
    rationale.push('Positive dechallenge: the reaction abated on withdrawal.');
  }
  if (dechallenge === 'negative') {
    warnings.push(
      'Negative dechallenge (no improvement on withdrawal) weakens a causal ' +
        'inference, but does not exclude it for irreversible reactions.',
    );
  }

  // ── WHO-UMC category ───────────────────────────────────────────────────────
  const temporal = params.temporalPlausible || 'unknown';
  const altExpl = params.alternativeExplanation || 'unknown';
  const pharmKnown = params.pharmacologicallyKnown || 'unknown';
  const infoSufficient = params.informationSufficient !== false;

  let whoUmc: WHOUMCCategory;
  if (!infoSufficient) {
    whoUmc = 'unassessable';
    rationale.push(
      'Information insufficient/contradictory and not verifiable => WHO-UMC "unassessable/unclassifiable".',
    );
  } else if (temporal === 'unknown' && altExpl === 'unknown') {
    whoUmc = 'conditional';
    rationale.push(
      'Temporal relationship and alternative causes are both undetermined and more ' +
        'data are needed => WHO-UMC "conditional/unclassified".',
    );
  } else if (
    temporal === 'yes' &&
    altExpl === 'no' &&
    dechallenge === 'positive' &&
    (rechallenge === 'positive' || pharmKnown === 'yes')
  ) {
    whoUmc = 'certain';
    rationale.push(
      'Plausible timing, no alternative explanation, positive dechallenge, and ' +
        '(positive rechallenge or definitive pharmacology) => WHO-UMC "certain".',
    );
  } else if (
    temporal === 'yes' &&
    (altExpl === 'no' || altExpl === 'unknown') &&
    (dechallenge === 'positive' || dechallenge === 'not_done')
  ) {
    whoUmc = 'probable';
    rationale.push(
      'Reasonable timing, alternative causes unlikely, reasonable dechallenge => WHO-UMC "probable/likely".',
    );
  } else if (temporal === 'yes' && altExpl === 'yes') {
    whoUmc = 'possible';
    rationale.push(
      'Reasonable timing but the event could also be explained by disease/other ' +
        'drugs => WHO-UMC "possible".',
    );
  } else if (temporal === 'no') {
    whoUmc = 'unlikely';
    rationale.push(
      'Temporal relationship improbable and/or other explanations plausible => WHO-UMC "unlikely".',
    );
  } else {
    whoUmc = 'possible';
    rationale.push(
      'Mixed/partial evidence => defaulting to WHO-UMC "possible" (the conservative middle category).',
    );
  }

  const whoInfo =
    WHO_UMC_CRITERIA.find((c: WHOUMCCategoryInfo) => c.category === whoUmc) ||
    WHO_UMC_CRITERIA[2];

  // ── Agreement note ──────────────────────────────────────────────────────────
  const naranjoStrong =
    naranjoCategory === 'definite' || naranjoCategory === 'probable';
  const whoStrong = whoUmc === 'certain' || whoUmc === 'probable';
  let agreement: string;
  if (naranjoStrong === whoStrong) {
    agreement =
      'WHO-UMC and Naranjo are CONCORDANT on the strength of the causal association.';
  } else {
    agreement =
      'WHO-UMC and Naranjo DIVERGE on causal strength — review the divergent ' +
      'criteria (timing, dechallenge/rechallenge, alternative causes) before ' +
      'finalising the case causality.';
    warnings.push(agreement);
  }

  if (rechallenge === 'positive' && naranjoCategory === 'possible') {
    warnings.push(
      'A positive rechallenge with only a "possible" Naranjo result is unusual — ' +
        'verify the other Naranjo answers (timing, alternative causes) are recorded.',
    );
  }

  const citations = [
    'WHO-UMC system for standardised case causality assessment (Uppsala Monitoring Centre).',
    'Naranjo CA, Busto U, Sellers EM, et al. A method for estimating the probability of adverse drug reactions. Clin Pharmacol Ther. 1981;30(2):239-245.',
    'ICH E2A / ICH E2D — definitions of causality, dechallenge and rechallenge.',
  ];

  return {
    naranjoScore: total,
    naranjoCategory,
    naranjoBreakdown: breakdown,
    whoUmcCategory: whoUmc,
    whoUmcCriteria: [...whoInfo.criteria],
    dechallenge,
    rechallenge,
    agreement,
    rationale,
    warnings,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4. Aggregate Safety Report Planning (E2C(R2), E2F; 21 CFR 314.80)
// ─────────────────────────────────────────────────────────────────────────────

/** Supported aggregate report types. */
export type AggregateReportType = 'PBRER' | 'PSUR' | 'DSUR' | 'PADER';

export interface AggregateReportTypeInfo {
  type: AggregateReportType;
  fullName: string;
  basis: string;
  stage: ProductStage;
  purpose: string;
  standardCadence: string;
  dataLockPoint: string;
  modules: string[];
  citation: string;
}

const AGGREGATE_REPORTS: AggregateReportTypeInfo[] = [
  {
    type: 'DSUR',
    fullName: 'Development Safety Update Report',
    basis: 'ICH E2F (2010)',
    stage: 'investigational',
    purpose:
      'Annual review and evaluation of the evolving safety information of an ' +
      'investigational drug across all ongoing clinical trials worldwide, to ' +
      'assure regulators that sponsors are adequately monitoring the developing ' +
      'safety profile and describe new safety issues that could affect subjects.',
    standardCadence:
      'Annually, within 60 calendar days of the Development International Birth Date (DIBD) anniversary.',
    dataLockPoint:
      'Data Lock Point (DLP) = the last day of the one-year reporting interval, anchored to the DIBD (first authorisation of a clinical trial in any country).',
    modules: [
      'Title page and executive summary',
      'Introduction',
      'Worldwide marketing approval status',
      'Actions taken in the reporting period for safety reasons',
      'Changes to reference safety information (RSI / IB)',
      'Inventory of clinical trials ongoing/completed during the period (Appendix)',
      'Estimated cumulative exposure (subjects in trials; patient exposure if marketed)',
      'Line listings and summary tabulations of SAEs (Appendices)',
      'Significant findings from clinical trials, non-interventional studies, other sources',
      'Safety findings from marketing experience (if also marketed)',
      'Nonclinical / literature data',
      'Late-breaking information',
      'Overall safety assessment and integrated benefit-risk evaluation',
      'Summary of important risks; conclusions',
    ],
    citation: 'ICH E2F (2010); 21 CFR 312.33 (US annual report can be a DSUR).',
  },
  {
    type: 'PBRER',
    fullName: 'Periodic Benefit-Risk Evaluation Report',
    basis: 'ICH E2C(R2) (2012)',
    stage: 'marketed',
    purpose:
      'A comprehensive, periodic, cumulative benefit-risk evaluation of a ' +
      'marketed product, presenting new safety information in the context of ' +
      'cumulative experience and assessing impact on the benefit-risk balance. ' +
      'The PBRER replaced the PSUR format under ICH E2C(R2).',
    standardCadence:
      'Per the EU Reference Dates (EURD) list or 6-monthly / annually / 3-yearly based on years since authorisation (default: 6-monthly for the first 2 years, annually for years 3-4, then every 3 years).',
    dataLockPoint:
      'DLP anchored to the International Birth Date (IBD = date of first marketing authorisation of the active substance in any country); harmonised to the EURD list in the EU.',
    modules: [
      '1. Introduction',
      '2. Worldwide marketing authorisation status',
      '3. Actions taken in the reporting interval for safety reasons',
      '4. Changes to reference safety information (CCDS/CCSI)',
      '5. Estimated exposure and use patterns (clinical trial + post-marketing)',
      '6. Data in summary tabulations (cumulative + interval line listings)',
      '7. Summaries of significant findings from clinical trials during the interval',
      '8. Findings from non-interventional studies',
      '9. Information from other clinical trials and sources',
      '10. Non-clinical data',
      '11. Literature',
      '12. Other periodic reports',
      '13. Lack of efficacy in controlled clinical trials',
      '14. Late-breaking information',
      '15. Overview of signals (new, ongoing, closed)',
      '16. Signal and risk evaluation (16.1 summary of safety concerns, 16.2 signal evaluation, 16.3 evaluation of risks and new information, 16.4 characterisation of risks, 16.5 effectiveness of risk minimisation)',
      '17. Benefit evaluation',
      '18. Integrated benefit-risk analysis for approved indications',
      '19. Conclusions and actions',
      'Appendices (CCDS, cumulative tabulations, EURD info)',
    ],
    citation: 'ICH E2C(R2) (2012); GVP Module VII; Commission Implementing Regulation (EU) No 520/2012.',
  },
  {
    type: 'PSUR',
    fullName: 'Periodic Safety Update Report',
    basis: 'ICH E2C(R1) — superseded by E2C(R2)/PBRER in most regions',
    stage: 'marketed',
    purpose:
      'The legacy periodic safety report format. In the EU and ICH regions the ' +
      'PSUR is now prepared in the PBRER format (the EU still uses the term ' +
      '"PSUR" for the submission, but the content follows E2C(R2)).',
    standardCadence:
      'Per the EURD list (commonly 6-monthly initially, then annually, then 3-yearly).',
    dataLockPoint:
      'DLP anchored to the IBD or the EURD-list harmonised date.',
    modules: [
      'Content per ICH E2C(R2) (PBRER format) — see PBRER modules.',
      'In legacy/non-ICH contexts may follow the older E2C(R1) section structure.',
    ],
    citation: 'ICH E2C(R2); GVP Module VII; Directive 2001/83/EC Article 107b.',
  },
  {
    type: 'PADER',
    fullName: 'Periodic Adverse Drug Experience Report',
    basis: '21 CFR 314.80(c)(2) / 600.80(c)(2)',
    stage: 'marketed',
    purpose:
      'The US FDA periodic postmarketing safety report. Aggregates non-expedited ' +
      '(serious-expected and non-serious) ICSRs and provides a narrative summary ' +
      'of the safety experience. FDA may agree to accept a PBRER in lieu of the ' +
      'PADER under FDAAA Section 505(k)(4).',
    standardCadence:
      'Quarterly for the first 3 years after US approval (within 30 days of the close of each quarter), then annually (within 60 days of the anniversary of US approval).',
    dataLockPoint:
      'Anchored to the US approval date (NDA/BLA approval), on a quarterly then annual cycle.',
    modules: [
      'FDA Form 3500A (or E2B equivalent) for each 15-day Alert report submitted during the period',
      'Narrative summary and analysis of the information in the period',
      'Narrative discussion of actions taken for safety reasons',
      'Index line listing of the 15-day Alert reports',
      'History of actions taken since the last report',
    ],
    citation: '21 CFR 314.80(c)(2)(i)-(ii); 21 CFR 600.80(c)(2); FDA Guidance on PBRER acceptance (FDAAA 505(k)(4)).',
  },
];

/** Look up the static reference data for an aggregate report type. */
export function getAggregateReportInfo(
  type: AggregateReportType,
): AggregateReportTypeInfo {
  const found = AGGREGATE_REPORTS.find(
    (r: AggregateReportTypeInfo) => r.type === type,
  );
  if (found) return { ...found, modules: [...found.modules] };
  return { ...AGGREGATE_REPORTS[0], modules: [...AGGREGATE_REPORTS[0].modules] };
}

export interface AggregateReportPlanParams {
  /** Lifecycle stage of the product. */
  stage: ProductStage;
  /** Is the product marketed somewhere in the world? */
  marketed?: boolean;
  /** Is the product still in active clinical development (ongoing trials)? */
  inDevelopment?: boolean;
  /** Region(s) for which to plan submissions. */
  region: PVRegion;
  /** Years since first marketing authorisation (IBD), to set the EU cadence. */
  yearsSinceAuthorization?: number;
  /** Is the product on the EU Reference Dates (EURD) list with a fixed DLP? */
  onEURDList?: boolean;
  /** Within the first 3 years of US approval (sets PADER quarterly cadence)? */
  withinFirstThreeYearsUS?: boolean;
}

export interface PlannedAggregateReport {
  type: AggregateReportType;
  fullName: string;
  applicableRegion: 'fda' | 'eu' | 'ich';
  cadence: string;
  dataLockPoint: string;
  submissionDeadline: string;
  contentModules: string[];
  citation: string;
}

export interface AggregateReportPlanResult {
  reports: PlannedAggregateReport[];
  rationale: string[];
  warnings: string[];
  citations: string[];
}

/**
 * planAggregateReport — select the applicable aggregate safety report types and
 * compute their cadence, data-lock cadence, submission deadline and content
 * modules per ICH E2C(R2) / E2F and 21 CFR 314.80.
 */
export function planAggregateReport(
  params: AggregateReportPlanParams,
): AggregateReportPlanResult {
  const reports: PlannedAggregateReport[] = [];
  const rationale: string[] = [];
  const warnings: string[] = [];

  const inDev =
    params.inDevelopment === true || params.stage === 'investigational' || params.stage === 'both';
  const marketed =
    params.marketed === true || params.stage === 'marketed' || params.stage === 'both';

  // ── DSUR (development) ─────────────────────────────────────────────────────
  if (inDev) {
    const info = getAggregateReportInfo('DSUR');
    reports.push({
      type: 'DSUR',
      fullName: info.fullName,
      applicableRegion: 'ich',
      cadence: 'Annual, anchored to the Development International Birth Date (DIBD).',
      dataLockPoint: info.dataLockPoint,
      submissionDeadline:
        'Within 60 calendar days of the DLP (the DIBD anniversary).',
      contentModules: info.modules,
      citation: info.citation,
    });
    rationale.push(
      'Active clinical development => an annual DSUR (ICH E2F) is required, ' +
        'anchored to the DIBD, submitted within 60 days of the DLP.',
    );
  }

  // ── EU PBRER/PSUR (marketed) ───────────────────────────────────────────────
  if (marketed && (params.region === 'eu' || params.region === 'both')) {
    const info = getAggregateReportInfo('PBRER');
    let cadence: string;
    const yrs = params.yearsSinceAuthorization;
    if (params.onEURDList) {
      cadence =
        'Per the EU Reference Dates (EURD) list — the EURD DLP and frequency override the default schedule.';
    } else if (typeof yrs === 'number') {
      if (yrs <= 2) {
        cadence = 'Every 6 months (first 2 years after authorisation).';
      } else if (yrs <= 4) {
        cadence = 'Annually (years 3-4 after authorisation).';
      } else {
        cadence = 'Every 3 years (from year 5 onward).';
      }
    } else {
      cadence =
        'Default standard schedule: 6-monthly for the first 2 years, annually for years 3-4, then every 3 years (unless the EURD list specifies otherwise).';
    }
    reports.push({
      type: 'PBRER',
      fullName: info.fullName + ' (submitted as the EU PSUR)',
      applicableRegion: 'eu',
      cadence,
      dataLockPoint: info.dataLockPoint,
      submissionDeadline:
        'Within 70 calendar days of the DLP for reporting intervals up to 12 months; within 90 calendar days for intervals longer than 12 months (15 additional days if an Ad-hoc PSUR is requested).',
      contentModules: info.modules,
      citation: info.citation,
    });
    rationale.push(
      'Product is marketed in the EU => a PBRER (ICH E2C(R2)) is submitted as the ' +
        'EU PSUR on the EURD-list / standard cadence, with the 70/90-day submission clock.',
    );
  }

  // ── US PADER (marketed) ────────────────────────────────────────────────────
  if (marketed && (params.region === 'fda' || params.region === 'both')) {
    const info = getAggregateReportInfo('PADER');
    const quarterly = params.withinFirstThreeYearsUS !== false;
    reports.push({
      type: 'PADER',
      fullName: info.fullName,
      applicableRegion: 'fda',
      cadence: quarterly
        ? 'Quarterly for the first 3 years after US approval, then annually.'
        : 'Annually (beyond the first 3 years after US approval).',
      dataLockPoint: info.dataLockPoint,
      submissionDeadline: quarterly
        ? 'Within 30 calendar days of the close of each quarter.'
        : 'Within 60 calendar days of the anniversary of US approval.',
      contentModules: info.modules,
      citation: info.citation,
    });
    rationale.push(
      'Product is marketed in the US => a PADER (21 CFR 314.80(c)(2)) is required ' +
        '(quarterly for 3 years then annually), unless FDA has agreed to accept a ' +
        'PBRER in lieu under FDAAA 505(k)(4).',
    );
    if (params.region === 'both' || params.region === 'fda') {
      warnings.push(
        'Consider requesting FDA agreement to submit the PBRER in lieu of the PADER ' +
          '(FDAAA Section 505(k)(4)) to avoid maintaining two separate periodic formats.',
      );
    }
  }

  if (reports.length === 0) {
    warnings.push(
      'No aggregate report was selected — verify the stage/marketed/region inputs. ' +
        'A product that is neither in development nor marketed has no periodic obligation.',
    );
  }

  const citations = [
    'ICH E2C(R2) (2012) — Periodic Benefit-Risk Evaluation Report (PBRER).',
    'ICH E2F (2010) — Development Safety Update Report (DSUR).',
    '21 CFR 314.80(c)(2) / 600.80(c)(2) — Periodic Adverse Drug Experience Reports (PADER).',
    'GVP Module VII (Periodic safety update report); Commission Implementing Regulation (EU) No 520/2012; EURD list.',
  ];

  return { reports, rationale, warnings, citations };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5. Signal Detection — Disproportionality Analysis (PRR/ROR/EBGM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The 2x2 contingency table for a drug-event pair in a spontaneous-report
 * database (FAERS / EudraVigilance):
 *
 *                       Event of interest   All other events
 *   Drug of interest          a                   b
 *   All other drugs           c                   d
 */
export interface DisproportionalityParams {
  /** a = reports with BOTH the drug of interest AND the event of interest. */
  a: number;
  /** b = reports with the drug of interest but NOT the event of interest. */
  b: number;
  /** c = reports with the event of interest but NOT the drug of interest. */
  c: number;
  /** d = reports with NEITHER the drug nor the event of interest. */
  d: number;
  /** Methods to compute (default: all). */
  methods?: ('PRR' | 'ROR' | 'EBGM')[];
  /** Designated medical event / important medical event flag (lowers thresholds). */
  designatedMedicalEvent?: boolean;
}

export interface DisproportionalityMeasure {
  method: 'PRR' | 'ROR' | 'EBGM';
  pointEstimate: number;
  lower95: number;
  upper95: number;
  chiSquaredYates?: number;
  signalThreshold: string;
  exceedsThreshold: boolean;
  citation: string;
}

export interface SignalDetectionResult {
  table: { a: number; b: number; c: number; d: number };
  totalReports: number;
  measures: DisproportionalityMeasure[];
  signalOfDisproportionateReporting: boolean;
  rationale: string[];
  warnings: string[];
  citations: string[];
}

/** Natural-log helper guarded against non-positive arguments. */
function safeLn(x: number): number {
  if (x <= 0) return 0;
  return Math.log(x);
}

/**
 * detectSafetySignal — perform disproportionality analysis on a 2x2 table and
 * return a Signal of Disproportionate Reporting (SDR) determination.
 *
 * PRR (Proportional Reporting Ratio, Evans 2001):
 *   PRR = [a/(a+b)] / [c/(c+d)]
 *   Signal criterion (Evans/MHRA): PRR >= 2, chi-squared (Yates) >= 4, and a >= 3.
 *
 * ROR (Reporting Odds Ratio, Rothman/van Puijenbroek):
 *   ROR = (a*d)/(b*c); 95% CI via the standard ln-based error.
 *   Signal criterion: lower bound of the 95% CI > 1 (commonly with a >= 3).
 *
 * EBGM (Empirical Bayes Geometric Mean, DuMouchel 1999) — Bayesian shrinkage of
 *   the observed/expected ratio. Here EBGM is approximated by the shrunken RR
 *   point estimate and EB05 (the lower 5% credibility bound) is approximated;
 *   the FDA/MGPS signal criterion is EB05 >= 2. (This is a deterministic
 *   approximation of the MGPS shrinkage, not the full Gamma-Poisson fit.)
 */
export function detectSafetySignal(
  params: DisproportionalityParams,
): SignalDetectionResult {
  const a = params.a;
  const b = params.b;
  const c = params.c;
  const d = params.d;
  const rationale: string[] = [];
  const warnings: string[] = [];
  const methods = params.methods && params.methods.length > 0 ? params.methods : ['PRR', 'ROR', 'EBGM'];
  const total = a + b + c + d;
  const dme = params.designatedMedicalEvent === true;

  if (a < 3) {
    warnings.push(
      `Only ${a} case(s) (a < 3): disproportionality estimates are statistically ` +
        'unstable and generally do not constitute a signal on the count criterion ' +
        '(standard PRR/ROR signalling requires a >= 3). For a Designated Medical ' +
        'Event, as few as 1-2 cases can still warrant qualitative review.',
    );
  }
  if (b === 0 || c === 0 || d === 0) {
    warnings.push(
      'One or more table cells (b, c, or d) is zero. A Haldane-Anscombe 0.5 ' +
        'continuity correction is applied to the ROR/CI computation to avoid ' +
        'division by zero; interpret the corrected estimate cautiously.',
    );
  }

  // Haldane-Anscombe correction for ROR when any cell is zero.
  const corr = b === 0 || c === 0 || a === 0 || d === 0;
  const aC = corr ? a + 0.5 : a;
  const bC = corr ? b + 0.5 : b;
  const cC = corr ? c + 0.5 : c;
  const dC = corr ? d + 0.5 : d;

  const measures: DisproportionalityMeasure[] = [];
  let anySignal = false;

  // ── PRR ────────────────────────────────────────────────────────────────────
  if (methods.includes('PRR')) {
    const p1 = a / (a + b || 1);
    const p2 = c / (c + d || 1);
    const prr = p2 > 0 ? p1 / p2 : 0;
    // 95% CI for ln(PRR): SE = sqrt(1/a - 1/(a+b) + 1/c - 1/(c+d))
    const seLn = Math.sqrt(
      (a > 0 ? 1 / a : 0) -
        (a + b > 0 ? 1 / (a + b) : 0) +
        (c > 0 ? 1 / c : 0) -
        (c + d > 0 ? 1 / (c + d) : 0),
    );
    const lnPrr = safeLn(prr);
    const lower = prr > 0 ? Math.exp(lnPrr - 1.96 * seLn) : 0;
    const upper = prr > 0 ? Math.exp(lnPrr + 1.96 * seLn) : 0;
    // Yates-corrected chi-squared on the 2x2 table.
    const n = total || 1;
    const num = Math.abs(a * d - b * c) - n / 2;
    const denom = (a + b) * (c + d) * (a + c) * (b + d);
    const chi2 =
      denom > 0 && num > 0 ? (n * num * num) / denom : 0;
    const exceeds = prr >= 2 && chi2 >= 4 && a >= (dme ? 1 : 3);
    if (exceeds) anySignal = true;
    measures.push({
      method: 'PRR',
      pointEstimate: round3(prr),
      lower95: round3(lower),
      upper95: round3(upper),
      chiSquaredYates: round3(chi2),
      signalThreshold: dme
        ? 'PRR >= 2 AND chi-squared(Yates) >= 4 AND a >= 1 (DME — lowered count threshold)'
        : 'PRR >= 2 AND chi-squared(Yates) >= 4 AND a >= 3 (Evans 2001 / MHRA criterion)',
      exceedsThreshold: exceeds,
      citation:
        'Evans SJW, Waller PC, Davis S. Pharmacoepidemiol Drug Saf. 2001;10(6):483-486 (PRR signalling criteria).',
    });
    rationale.push(
      `PRR = ${round3(prr)} (95% CI ${round3(lower)}-${round3(upper)}), ` +
        `chi-squared(Yates) = ${round3(chi2)} => ${exceeds ? 'SIGNAL' : 'no signal'} on the PRR criterion.`,
    );
  }

  // ── ROR ────────────────────────────────────────────────────────────────────
  if (methods.includes('ROR')) {
    const ror = (aC * dC) / (bC * cC);
    const seLn = Math.sqrt(1 / aC + 1 / bC + 1 / cC + 1 / dC);
    const lnRor = safeLn(ror);
    const lower = Math.exp(lnRor - 1.96 * seLn);
    const upper = Math.exp(lnRor + 1.96 * seLn);
    const exceeds = lower > 1 && a >= (dme ? 1 : 3);
    if (exceeds) anySignal = true;
    measures.push({
      method: 'ROR',
      pointEstimate: round3(ror),
      lower95: round3(lower),
      upper95: round3(upper),
      signalThreshold: dme
        ? 'Lower bound of 95% CI > 1 AND a >= 1 (DME)'
        : 'Lower bound of 95% CI > 1 AND a >= 3 (van Puijenbroek 2002)',
      exceedsThreshold: exceeds,
      citation:
        'van Puijenbroek EP, et al. Pharmacoepidemiol Drug Saf. 2002;11(1):3-10 (ROR signalling); Rothman KJ, et al. 2004.',
    });
    rationale.push(
      `ROR = ${round3(ror)} (95% CI ${round3(lower)}-${round3(upper)}) => ` +
        `${exceeds ? 'SIGNAL' : 'no signal'} on the ROR criterion (lower bound ${lower > 1 ? '>' : '<='} 1).`,
    );
  }

  // ── EBGM (deterministic MGPS approximation) ─────────────────────────────────
  if (methods.includes('EBGM')) {
    // Expected count under independence: E = (a+b)*(a+c)/N.
    const expected = total > 0 ? ((a + b) * (a + c)) / total : 0;
    const rr = expected > 0 ? a / expected : 0;
    // Empirical-Bayes shrinkage toward 1, stronger when counts are small.
    // Deterministic approximation: shrinkage weight w = a/(a+1).
    const w = a > 0 ? a / (a + 1) : 0;
    const ebgm = Math.exp(w * safeLn(rr));
    // EB05 approximated as EBGM scaled by a count-dependent lower factor.
    const lowerFactor = a > 0 ? Math.exp(-1.96 / Math.sqrt(a)) : 0;
    const eb05 = ebgm * lowerFactor;
    const eb95 = a > 0 ? ebgm * Math.exp(1.96 / Math.sqrt(a)) : ebgm;
    const exceeds = eb05 >= 2 && a >= (dme ? 1 : 3);
    if (exceeds) anySignal = true;
    measures.push({
      method: 'EBGM',
      pointEstimate: round3(ebgm),
      lower95: round3(eb05),
      upper95: round3(eb95),
      signalThreshold:
        'EB05 (lower 5% bound) >= 2 (FDA MGPS criterion; DuMouchel 1999). NOTE: deterministic shrinkage approximation, not a full Gamma-Poisson fit.',
      exceedsThreshold: exceeds,
      citation:
        'DuMouchel W. Bayesian data mining in large frequency tables. Am Stat. 1999;53(3):177-190 (MGPS/EBGM).',
    });
    rationale.push(
      `EBGM ~ ${round3(ebgm)} (EB05 ~ ${round3(eb05)}), expected count = ${round3(expected)} => ` +
        `${exceeds ? 'SIGNAL' : 'no signal'} on the EB05 >= 2 criterion (approximation).`,
    );
  }

  if (anySignal) {
    rationale.push(
      'At least one disproportionality measure crosses its signalling threshold => ' +
        'a Signal of Disproportionate Reporting (SDR) is flagged. An SDR is a ' +
        'statistical signal requiring qualitative validation (GVP Module IX); it is ' +
        'NOT, by itself, a confirmed causal association.',
    );
  } else {
    rationale.push(
      'No disproportionality measure crosses its threshold => no Signal of ' +
        'Disproportionate Reporting on these data. Disproportionality analysis does ' +
        'not rule out a true association (absence of disproportionality is not ' +
        'absence of risk).',
    );
  }

  const citations = [
    'GVP Module IX (Rev 1, 2017) — Signal management (statistical signal detection methods).',
    'Evans SJW, et al. Pharmacoepidemiol Drug Saf. 2001 (PRR). van Puijenbroek EP, et al. 2002 (ROR).',
    'DuMouchel W. Am Stat. 1999 (EBGM/MGPS, as used by FDA on FAERS).',
    'EudraVigilance / EVDAS uses ROR-based statistical signal detection (electronic Reaction Monitoring Reports).',
  ];

  return {
    table: { a, b, c, d },
    totalReports: total,
    measures,
    signalOfDisproportionateReporting: anySignal,
    rationale,
    warnings,
    citations,
  };
}

/** Round to 3 decimals deterministically. */
function round3(x: number): number {
  if (!isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6. Signal Prioritization (GVP Module IX / IX Addendum I)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GVP Module IX prioritises VALIDATED signals using the strength of evidence,
 * the clinical importance/seriousness, novelty, the public-health impact and
 * the potential for preventability of the risk. The five sub-scores below feed a
 * deterministic priority tier and an action timeline.
 */
export interface SignalPriorityParams {
  /** Strength of the evidence (statistical + clinical). */
  strengthOfEvidence: 'strong' | 'moderate' | 'weak';
  /** Clinical seriousness of the reaction. */
  seriousness: 'serious_fatal' | 'serious_non_fatal' | 'non_serious';
  /** Is the association new / not in the current RSI (a "new" signal)? */
  novelty: 'new' | 'known_change' | 'known';
  /** Public-health impact: exposed population size & frequency. */
  publicHealthImpact: 'high' | 'medium' | 'low';
  /** Is the risk preventable (e.g., by labelling, monitoring, dose change)? */
  preventability: 'preventable' | 'partially' | 'not_preventable';
  /** Vulnerable populations affected (children, pregnancy, elderly)? */
  vulnerablePopulation?: boolean;
  /** Designated/important medical event? */
  designatedMedicalEvent?: boolean;
}

export type SignalPriorityTier = 'high' | 'medium' | 'low';

export interface SignalPriorityResult {
  priorityTier: SignalPriorityTier;
  priorityScore: number;
  maxScore: number;
  actionTimeline: string;
  recommendedActions: string[];
  subScores: { factor: string; value: string; points: number }[];
  rationale: string[];
  warnings: string[];
  citations: string[];
}

/**
 * assessSignalPriority — prioritize a validated signal into a high/medium/low
 * tier with an action timeline, per GVP Module IX. The score is a deterministic
 * weighted sum of the five GVP prioritisation criteria plus vulnerable-population
 * and DME modifiers.
 */
export function assessSignalPriority(
  params: SignalPriorityParams,
): SignalPriorityResult {
  const subScores: { factor: string; value: string; points: number }[] = [];
  const rationale: string[] = [];
  const warnings: string[] = [];

  const strengthPts =
    params.strengthOfEvidence === 'strong'
      ? 3
      : params.strengthOfEvidence === 'moderate'
        ? 2
        : 1;
  subScores.push({
    factor: 'Strength of evidence',
    value: params.strengthOfEvidence,
    points: strengthPts,
  });

  const seriousPts =
    params.seriousness === 'serious_fatal'
      ? 4
      : params.seriousness === 'serious_non_fatal'
        ? 3
        : 1;
  subScores.push({
    factor: 'Seriousness / clinical importance',
    value: params.seriousness,
    points: seriousPts,
  });

  const noveltyPts =
    params.novelty === 'new' ? 3 : params.novelty === 'known_change' ? 2 : 1;
  subScores.push({
    factor: 'Novelty',
    value: params.novelty,
    points: noveltyPts,
  });

  const phPts =
    params.publicHealthImpact === 'high'
      ? 3
      : params.publicHealthImpact === 'medium'
        ? 2
        : 1;
  subScores.push({
    factor: 'Public-health impact',
    value: params.publicHealthImpact,
    points: phPts,
  });

  // Preventability: a preventable serious risk is HIGHER priority (it is actionable).
  const preventPts =
    params.preventability === 'preventable'
      ? 3
      : params.preventability === 'partially'
        ? 2
        : 1;
  subScores.push({
    factor: 'Preventability (actionability)',
    value: params.preventability,
    points: preventPts,
  });

  let vulnPts = 0;
  if (params.vulnerablePopulation) {
    vulnPts = 2;
    subScores.push({
      factor: 'Vulnerable population affected',
      value: 'yes',
      points: vulnPts,
    });
    rationale.push(
      'A vulnerable population (paediatric, pregnancy, elderly) is affected => priority is escalated.',
    );
  }

  let dmePts = 0;
  if (params.designatedMedicalEvent) {
    dmePts = 2;
    subScores.push({
      factor: 'Designated/important medical event',
      value: 'yes',
      points: dmePts,
    });
    rationale.push(
      'The reaction is a Designated Medical Event (DME) — these are prioritised ' +
        'irrespective of disproportionality strength.',
    );
  }

  const priorityScore =
    strengthPts + seriousPts + noveltyPts + phPts + preventPts + vulnPts + dmePts;
  // Max = 3+4+3+3+3 + 2 + 2 = 20.
  const maxScore = 20;

  let priorityTier: SignalPriorityTier;
  let actionTimeline: string;
  const recommendedActions: string[] = [];

  const fatal = params.seriousness === 'serious_fatal';
  if (priorityScore >= 14 || fatal) {
    priorityTier = 'high';
    actionTimeline =
      'Emerging safety issue — escalate immediately. For an EU emerging safety ' +
      'issue, notify the competent authorities within 3 working days; otherwise ' +
      'complete the prioritised assessment within ~30 days.';
    recommendedActions.push(
      'Trigger an emerging safety issue / urgent signal assessment',
      'Convene the safety/benefit-risk review (Safety Management Team)',
      'Assess the need for immediate risk-minimisation (DHPC, labelling, RMP update)',
      'Notify the EU PRAC / FDA as applicable',
    );
    if (fatal) {
      rationale.push('A fatal seriousness flag forces the HIGH priority tier regardless of total score.');
    }
  } else if (priorityScore >= 9) {
    priorityTier = 'medium';
    actionTimeline =
      'Routine prioritised assessment — complete the signal evaluation within the ' +
      'standard cycle (target within 90 days; report status in the next PBRER signal section).';
    recommendedActions.push(
      'Schedule a full signal assessment in the routine signal-management cycle',
      'Gather cumulative case review, exposure data, and literature',
      'Document the outcome in the PBRER overview of signals (E2C(R2) Section 15)',
    );
  } else {
    priorityTier = 'low';
    actionTimeline =
      'Lower priority — continue routine monitoring; reassess at the next periodic ' +
      'signal-detection run and in the next aggregate report.';
    recommendedActions.push(
      'Keep under routine surveillance / continued monitoring',
      'Re-evaluate at the next scheduled signal-detection run',
      'Record the rationale for not prioritising (signal-management tracking system)',
    );
  }

  rationale.push(
    `Priority score = ${priorityScore} / ${maxScore} => "${priorityTier}" tier ` +
      '(>=14 or fatal: high; 9-13: medium; <9: low).',
  );

  if (params.strengthOfEvidence === 'weak' && priorityTier === 'high') {
    warnings.push(
      'High priority is being driven by seriousness/public-health impact despite ' +
        'WEAK evidence — ensure the validation step (GVP IX) confirms the signal is real before major action.',
    );
  }

  const citations = [
    'GVP Module IX (Rev 1, 2017) — Signal management: validation, prioritisation, assessment.',
    'GVP Module IX Addendum I — Methodological aspects of signal detection.',
    'GVP Annex I / EMA Important Medical Event (IME) and Designated Medical Event (DME) concepts.',
    'ICH E2C(R2) Section 15-16 — overview and evaluation of signals in the PBRER.',
  ];

  return {
    priorityTier,
    priorityScore,
    maxScore,
    actionTimeline,
    recommendedActions,
    subScores,
    rationale,
    warnings,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7. Pharmacovigilance System Design (GVP Module II/V; ICH E2E)
// ─────────────────────────────────────────────────────────────────────────────

export interface PVSystemParams {
  /** Region(s) the PV system must serve. */
  region: PVRegion;
  /** Product lifecycle stage. */
  stage: ProductStage;
  /** Is the product a new active substance / first-in-class (heavier E2E plan)? */
  newActiveSubstance?: boolean;
  /** Does the product have identified/potential important risks needing an RMP? */
  hasImportantRisks?: boolean;
  /** Estimated annual ICSR volume (sizing the safety database & staffing). */
  estimatedAnnualICSRVolume?: number;
  /** Will the company hold an EU marketing authorisation (mandates a QPPV)? */
  euMarketingAuthorization?: boolean;
  /** Number of products in the portfolio (PSMF scope). */
  portfolioSize?: number;
}

export interface PVSystemComponent {
  component: string;
  required: boolean;
  description: string;
  citation: string;
}

export interface PVSystemDesignResult {
  components: PVSystemComponent[];
  qppvRequired: boolean;
  psmfRequired: boolean;
  rmpRequired: boolean;
  pharmacovigilancePlan: string[];
  safetyDatabaseRequirements: string[];
  rationale: string[];
  warnings: string[];
  citations: string[];
}

/**
 * designPVSystem — assemble the required pharmacovigilance system components
 * (QPPV, PSMF, safety database, PV plan / RMP linkage) for a given region and
 * lifecycle stage, per EU GVP and ICH E2E.
 */
export function designPVSystem(params: PVSystemParams): PVSystemDesignResult {
  const components: PVSystemComponent[] = [];
  const rationale: string[] = [];
  const warnings: string[] = [];

  const isEU = params.region === 'eu' || params.region === 'both';
  const isFDA = params.region === 'fda' || params.region === 'both';
  const qppvRequired = isEU && params.euMarketingAuthorization !== false;
  const psmfRequired = qppvRequired;
  const rmpRequired =
    (isEU && (params.newActiveSubstance === true || params.hasImportantRisks === true)) ||
    params.newActiveSubstance === true;

  // ── QPPV ───────────────────────────────────────────────────────────────────
  components.push({
    component: 'Qualified Person Responsible for Pharmacovigilance (QPPV)',
    required: qppvRequired,
    description:
      'An appropriately qualified person residing and operating in the EU/EEA, ' +
      'available 24/7, with overall responsibility for the establishment and ' +
      'maintenance of the PV system. The QPPV oversees the safety profile and ' +
      'emerging safety concerns, and serves as the single contact point for the ' +
      'competent authorities. (A national-level contact person may also be required.)',
    citation: 'GVP Module I; Directive 2001/83/EC Article 104; Regulation (EC) No 726/2004 Article 23.',
  });

  // ── PSMF ───────────────────────────────────────────────────────────────────
  components.push({
    component: 'Pharmacovigilance System Master File (PSMF)',
    required: psmfRequired,
    description:
      'A detailed description of the PV system used for one or more authorised ' +
      'products, including the QPPV, organisational structure, sources of safety ' +
      'data, computerised systems/databases, processes, quality system, and a ' +
      'logbook/annexes. Must be available for inspection within the EU.',
    citation: 'GVP Module II; Commission Implementing Regulation (EU) No 520/2012.',
  });

  // ── Safety database ────────────────────────────────────────────────────────
  const volume = params.estimatedAnnualICSRVolume || 0;
  components.push({
    component: 'Safety database (ICSR management system)',
    required: true,
    description:
      'A validated electronic safety database capable of E2B(R3) electronic ' +
      'submission to EudraVigilance (EVPM/EVCTM) and/or FAERS (FDA Gateway/ESG), ' +
      'MedDRA coding, duplicate detection, case workflow, and audit trail. ' +
      (volume > 0
        ? `Sized for an estimated ${volume} ICSRs/year.`
        : 'Sized to the expected ICSR volume.'),
    citation: 'ICH E2B(R3); GVP Module VI; 21 CFR Part 11 (electronic records/signatures).',
  });

  // ── MedDRA coding & dictionaries ────────────────────────────────────────────
  components.push({
    component: 'MedDRA coding and dictionary management',
    required: true,
    description:
      'Medical Dictionary for Regulatory Activities (MedDRA) for coding reactions, ' +
      'indications, and medical history; WHODrug for product coding; with a defined ' +
      'MedDRA Term Selection: Points to Consider (MTS:PTC) process and version control.',
    citation: 'ICH M1 (MedDRA); MSSO MTS:PTC; GVP Module VI Appendix.',
  });

  // ── Literature monitoring ───────────────────────────────────────────────────
  components.push({
    component: 'Scientific literature monitoring',
    required: true,
    description:
      'Systematic screening of the worldwide scientific and medical literature for ' +
      'suspected adverse reactions (at least weekly), reconciled against the EMA ' +
      'Medical Literature Monitoring (MLM) service for in-scope substances.',
    citation: 'GVP Module VI VI.C.2.2; EMA Medical Literature Monitoring (MLM).',
  });

  // ── Signal management ───────────────────────────────────────────────────────
  components.push({
    component: 'Signal management process',
    required: true,
    description:
      'A documented signal-management cycle (detection, validation, confirmation, ' +
      'analysis & prioritisation, assessment, recommendation for action) with ' +
      'EudraVigilance/EVDAS (eRMR) monitoring and a signal-tracking system.',
    citation: 'GVP Module IX (Rev 1).',
  });

  // ── PSUR/PBRER & periodic reporting ─────────────────────────────────────────
  components.push({
    component: 'Periodic & expedited reporting process',
    required: true,
    description:
      'SOPs and tooling for 7/15/90-day expedited ICSR submission and for the ' +
      'aggregate reports (DSUR, PBRER/PSUR, PADER) with deadline tracking against ' +
      'the EURD list and US approval anniversaries.',
    citation: 'GVP Modules VI & VII; ICH E2C(R2)/E2F; 21 CFR 314.80.',
  });

  // ── RMP / Risk minimisation ─────────────────────────────────────────────────
  components.push({
    component: 'Risk Management Plan (RMP) and risk minimisation',
    required: rmpRequired,
    description:
      'An RMP characterising the safety specification (important identified/potential ' +
      'risks, missing information), the pharmacovigilance plan (routine + additional ' +
      'PV activities), and routine + additional risk-minimisation measures. Linked to ' +
      'the US REMS where applicable.',
    citation: 'GVP Module V (Rev 2); ICH E2E; FDA REMS (FDAAA Title IX) for the US.',
  });

  // ── Quality system, audits & inspections ────────────────────────────────────
  components.push({
    component: 'PV quality system, training, audit and inspection readiness',
    required: true,
    description:
      'A quality system with documented SOPs, role-based training records, CAPA, ' +
      'risk-based PV audits, and inspection readiness; KPIs and compliance monitoring ' +
      '(e.g., on-time reporting rates).',
    citation: 'GVP Modules I, III (Inspections), IV (Audits); Commission Implementing Regulation (EU) No 520/2012.',
  });

  // ── PV plan (ICH E2E) ───────────────────────────────────────────────────────
  const pharmacovigilancePlan: string[] = [
    'Safety specification: summarise important identified risks, important potential risks, and missing information (ICH E2E).',
    'Routine pharmacovigilance: ICSR collection/processing, signal detection, aggregate reporting.',
  ];
  if (params.newActiveSubstance || params.hasImportantRisks) {
    pharmacovigilancePlan.push(
      'Additional pharmacovigilance activities: PASS (post-authorisation safety study), enhanced/targeted follow-up forms, registries, drug-utilisation studies — proportionate to the identified concerns.',
      'Milestones for evaluation and submission of safety results, tied to the RMP.',
    );
    rationale.push(
      'A new active substance and/or important risks => an RMP with additional ' +
        'pharmacovigilance activities (PASS, registries) and milestones is warranted (ICH E2E / GVP V).',
    );
  } else {
    pharmacovigilancePlan.push(
      'Routine pharmacovigilance is likely sufficient if no important risks/missing information are identified; document the justification.',
    );
  }

  const safetyDatabaseRequirements: string[] = [
    'E2B(R3) electronic ICSR generation and gateway submission (EudraVigilance and/or FDA ESG).',
    'MedDRA-coded reactions/indications with version-controlled re-coding.',
    'Automated duplicate detection and case-versioning with full audit trail (21 CFR Part 11 compliant).',
    'Configurable expedited-reporting clocks (7/15/90-day) and aggregate-report data extraction (line listings, summary tabulations).',
    'Validation documentation (IQ/OQ/PQ) and disaster recovery / business continuity.',
  ];

  if (isFDA && !isEU) {
    rationale.push(
      'US-only scope: a QPPV/PSMF are not US legal requirements, but FAERS E2B ' +
        'submission, a PADER process, and (for products with serious risks) a REMS ' +
        'remain required.',
    );
    warnings.push(
      'QPPV and PSMF are EU constructs. For US-only operations focus on FAERS ' +
        'reporting (21 CFR 314.80/600.80), the PADER, and REMS where mandated.',
    );
  }
  if (isEU && params.euMarketingAuthorization === false) {
    warnings.push(
      'No EU marketing authorisation indicated => QPPV/PSMF may not yet be legally ' +
        'mandated, but they are prerequisites for any EU MA application; establish them before submission.',
    );
  }
  if (params.stage === 'investigational') {
    rationale.push(
      'Investigational stage: prioritise SUSAR reporting (EVCTM / FDA IND), the ' +
        'Reference Safety Information in the IB, and the annual DSUR; a full RMP is ' +
        'typically finalised toward marketing authorisation.',
    );
  }

  const citations = [
    'GVP Module I — Pharmacovigilance systems and their quality systems.',
    'GVP Module II — Pharmacovigilance system master file (PSMF).',
    'GVP Module V (Rev 2) — Risk management systems (RMP).',
    'ICH E2E (2004) — Pharmacovigilance planning (safety specification + PV plan).',
    'Directive 2001/83/EC Article 104; Regulation (EC) No 726/2004; Commission Implementing Regulation (EU) No 520/2012.',
    '21 CFR 314.80 / 600.80 (US postmarketing); FDAAA Title IX (REMS).',
  ];

  return {
    components,
    qppvRequired,
    psmfRequired,
    rmpRequired,
    pharmacovigilancePlan,
    safetyDatabaseRequirements,
    rationale,
    warnings,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8. Reference Tables (exposed for UI / documentation; pure data)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportingClockReference {
  scenario: string;
  region: 'fda' | 'eu' | 'ich';
  setting: 'development' | 'marketed';
  clockDays: number | string;
  citation: string;
}

const REPORTING_CLOCK_REFERENCE: ReportingClockReference[] = [
  {
    scenario: 'Fatal/life-threatening SUSAR',
    region: 'ich',
    setting: 'development',
    clockDays: 7,
    citation: 'ICH E2A; EU Reg 536/2014 Art 42; 21 CFR 312.32',
  },
  {
    scenario: 'Other serious SUSAR',
    region: 'ich',
    setting: 'development',
    clockDays: 15,
    citation: 'ICH E2A; EU Reg 536/2014 Art 42; 21 CFR 312.32',
  },
  {
    scenario: 'Serious + unexpected postmarketing (FDA 15-day Alert)',
    region: 'fda',
    setting: 'marketed',
    clockDays: 15,
    citation: '21 CFR 314.80(c)(1) / 600.80(c)(1)',
  },
  {
    scenario: 'Serious postmarketing ICSR (EU)',
    region: 'eu',
    setting: 'marketed',
    clockDays: 15,
    citation: 'GVP Module VI; Reg (EC) 726/2004',
  },
  {
    scenario: 'Non-serious EEA-origin ICSR (EU)',
    region: 'eu',
    setting: 'marketed',
    clockDays: 90,
    citation: 'GVP Module VI',
  },
  {
    scenario: 'PADER (US) — first 3 years',
    region: 'fda',
    setting: 'marketed',
    clockDays: '30 days after each quarter',
    citation: '21 CFR 314.80(c)(2)(i)',
  },
  {
    scenario: 'PBRER (EU PSUR) <= 12-month interval',
    region: 'eu',
    setting: 'marketed',
    clockDays: 70,
    citation: 'GVP Module VII; Reg (EU) 520/2012',
  },
  {
    scenario: 'DSUR',
    region: 'ich',
    setting: 'development',
    clockDays: 60,
    citation: 'ICH E2F',
  },
];

/** All reporting-clock reference rows (read-only copy). */
export function listReportingClocks(): ReportingClockReference[] {
  return REPORTING_CLOCK_REFERENCE.map((r: ReportingClockReference) => ({ ...r }));
}

/** All WHO-UMC categories with their criteria (read-only copy). */
export function listWHOUMCCategories(): WHOUMCCategoryInfo[] {
  return WHO_UMC_CRITERIA.map((c: WHOUMCCategoryInfo) => ({
    ...c,
    criteria: [...c.criteria],
  }));
}

/** All Naranjo questions with their scoring (read-only copy). */
export function listNaranjoQuestions(): NaranjoQuestionInfo[] {
  return NARANJO_QUESTIONS.map((q: NaranjoQuestionInfo) => ({ ...q }));
}

/** All aggregate report types with their reference data (read-only copy). */
export function listAggregateReportTypes(): AggregateReportTypeInfo[] {
  return AGGREGATE_REPORTS.map((r: AggregateReportTypeInfo) => ({
    ...r,
    modules: [...r.modules],
  }));
}
