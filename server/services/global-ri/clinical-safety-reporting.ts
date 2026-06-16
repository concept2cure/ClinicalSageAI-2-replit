/**
 * Investigational (clinical-trial) expedited safety reporting expert — per region.
 *
 * During a clinical trial, the sponsor carries an investigational safety
 * reporting burden that is DISTINCT from post-approval pharmacovigilance: an
 * individual case from a trial must be assessed against the ICH E2A expedited
 * criteria (SERIOUS + UNEXPECTED + SUSPECTED causal relationship) and, if it
 * qualifies, reported to the authority within a short calendar-day clock from
 * sponsor awareness. This service encodes those expedited timelines per region
 * and classifies a single case into its reporting vehicle and timeline — the
 * judgement a clinical safety / drug-safety physician makes on every inbound SAE.
 *
 * This is INVESTIGATIONAL / IND-phase reporting (FDA IND safety reports; EU CTR
 * SUSARs to EudraVigilance), NOT the post-approval ICSR/PSUR obligations of a
 * marketed product (see pharmacovigilance-obligations.ts).
 *
 * Pure / deterministic — no DB, no IO. A reference aid; the binding determination
 * is made against the governing regulation and the protocol-specified safety plan
 * (which may define additional or expedited reporting not modeled here).
 *
 * References:
 *  - ICH E2A: Clinical Safety Data Management — Definitions and Standards for
 *    Expedited Reporting (the SERIOUS + UNEXPECTED + SUSPECTED triad; 7- and
 *    15-day expedited clocks).
 *  - ICH E2B(R3): the electronic ICSR standard used to transmit cases.
 *  - ICH E2F: the Development Safety Update Report (DSUR) — annual investigational
 *    aggregate safety report.
 *  - FDA: 21 CFR 312.32 (IND safety reporting) and 312.33 (IND annual report).
 *  - EU: Regulation (EU) 536/2014 (Clinical Trials Regulation) Art. 42 (reporting
 *    of SUSARs to EudraVigilance) and Art. 43 (annual safety reporting / DSUR).
 *
 * @module server/services/global-ri/clinical-safety-reporting
 */

export type SafetyRegion = 'FDA' | 'EU';

/** The set of modeled investigational safety-reporting regions. */
export const SAFETY_REGIONS: SafetyRegion[] = ['FDA', 'EU'];

export interface ExpeditedCategory {
  /** Stable category id (e.g. 'serious_unexpected_15day'). */
  category: string;
  /** The triggering case profile in plain language. */
  trigger: string;
  /** Reporting clock, in calendar days from sponsor awareness. */
  timelineDays: number;
  /** Governing citation. */
  citation: string;
}

export interface SafetyReportingTimelines {
  region: SafetyRegion;
  /** The modeled expedited reporting categories for the region. */
  expedited: ExpeditedCategory[];
  /** The periodic / aggregate investigational safety report for the region. */
  periodicReport: string;
  /** The electronic ICSR transmission standard. */
  electronicStandard: string;
  /** Primary governing citation for the region's framework. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

const FDA_TIMELINES: SafetyReportingTimelines = {
  region: 'FDA',
  expedited: [
    {
      category: 'fatal_or_life_threatening_7day',
      trigger:
        'Fatal or life-threatening suspected, unexpected serious adverse reaction (notify FDA; complete report follows within 15 days).',
      timelineDays: 7,
      citation: '21 CFR 312.32(c)(2)',
    },
    {
      category: 'serious_unexpected_15day',
      trigger:
        'Any suspected adverse reaction that is both serious and unexpected (IND safety report).',
      timelineDays: 15,
      citation: '21 CFR 312.32(c)(1)',
    },
  ],
  periodicReport: 'IND annual report (21 CFR 312.33); Development Safety Update Report (DSUR, ICH E2F).',
  electronicStandard: 'ICH E2B(R3) ICSR',
  citation: '21 CFR 312.32; 21 CFR 312.33; ICH E2A',
  notes: [
    'Timelines are calendar days from the day the sponsor first becomes aware that the case qualifies for expedited reporting.',
    'A 7-day fatal/life-threatening notification must be followed by a complete written IND safety report within 15 calendar days.',
    'Expedited reporting requires the case to be serious AND unexpected AND have a reasonable possibility of causal relationship (suspected) per ICH E2A.',
    'Aggregate (IND annual report / DSUR) and any protocol-specified reporting also apply — confirm against the governing regulation.',
  ],
};

const EU_TIMELINES: SafetyReportingTimelines = {
  region: 'EU',
  expedited: [
    {
      category: 'fatal_or_life_threatening_susar_7day',
      trigger:
        'Fatal or life-threatening SUSAR (Suspected Unexpected Serious Adverse Reaction) reported to EudraVigilance (+8 days for relevant follow-up information).',
      timelineDays: 7,
      citation: 'Reg (EU) 536/2014 Art. 42(2)',
    },
    {
      category: 'other_susar_15day',
      trigger:
        'Any other (non-fatal, non-life-threatening) SUSAR reported to EudraVigilance.',
      timelineDays: 15,
      citation: 'Reg (EU) 536/2014 Art. 42(2)',
    },
  ],
  periodicReport: 'Annual safety report / Development Safety Update Report (DSUR, ICH E2F; Reg (EU) 536/2014 Art. 43).',
  electronicStandard: 'ICH E2B(R3) ICSR',
  citation: 'Reg (EU) 536/2014 Art. 42; ICH E2A',
  notes: [
    'Timelines are calendar days from the day the sponsor first becomes aware that the case qualifies as a reportable SUSAR.',
    'For a fatal/life-threatening SUSAR, any relevant follow-up information is reported within a further 8 calendar days.',
    'A SUSAR requires the case to be serious AND unexpected AND have a suspected (reasonably possible) causal relationship per ICH E2A.',
    'Aggregate annual safety reporting (DSUR) and any protocol-specified reporting also apply — confirm against the governing regulation.',
  ],
};

const SAFETY_TIMELINES: Record<SafetyRegion, SafetyReportingTimelines> = {
  FDA: FDA_TIMELINES,
  EU: EU_TIMELINES,
};

/** The region-specific vehicle for an individually expedited-reportable case. */
const REPORT_VEHICLE: Record<SafetyRegion, string> = {
  FDA: 'IND safety report',
  EU: 'SUSAR report to EudraVigilance',
};

export interface SafetyReportInput {
  region: SafetyRegion;
  /** Whether the case is serious (death, life-threatening, hospitalisation, etc.). */
  serious?: boolean;
  /** Whether the reaction is unexpected (not consistent with the reference safety information). */
  unexpected?: boolean;
  /** Whether there is a suspected (reasonably possible) causal relationship to the product. */
  suspectedCausality?: boolean;
  /** Whether the event was fatal or life-threatening (sets the 7-day clock). */
  fatalOrLifeThreatening?: boolean;
}

export interface SafetyReportClassification {
  region: SafetyRegion;
  /** True iff serious AND unexpected AND suspected causality. */
  reportable: boolean;
  /** The region's reporting vehicle, or 'Not individually expedited-reportable'. */
  reportType: string;
  /** Expedited clock in calendar days, or null when not individually reportable. */
  timelineDays: number | null;
  /** Why the case is / is not reportable, and which criterion failed if not. */
  rationale: string;
  /** Governing citation. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

/**
 * Get the investigational expedited safety reporting timelines for a region.
 * Pure / deterministic. Throws for an unmodeled region.
 */
export function getSafetyReportingTimelines(region: SafetyRegion): SafetyReportingTimelines {
  const timelines = SAFETY_TIMELINES[region];
  if (!timelines) throw new Error(`No safety reporting timelines modeled for region "${region}".`);
  return timelines;
}

/**
 * Classify a single investigational safety case into its expedited reporting
 * vehicle and timeline, applying the ICH E2A triad (serious + unexpected +
 * suspected causality). Pure / deterministic. Throws for an unmodeled region.
 */
export function classifySafetyReport(input: SafetyReportInput): SafetyReportClassification {
  const timelines = SAFETY_TIMELINES[input.region];
  if (!timelines) throw new Error(`No safety reporting timelines modeled for region "${input.region}".`);

  const serious = input.serious === true;
  const unexpected = input.unexpected === true;
  const suspected = input.suspectedCausality === true;
  const reportable = serious && unexpected && suspected;

  if (reportable) {
    const fatalOrLifeThreatening = input.fatalOrLifeThreatening === true;
    const timelineDays = fatalOrLifeThreatening ? 7 : 15;
    return {
      region: input.region,
      reportable: true,
      reportType: REPORT_VEHICLE[input.region],
      timelineDays,
      rationale: fatalOrLifeThreatening
        ? `Serious, unexpected, suspected adverse reaction that is fatal or life-threatening — expedited within ${timelineDays} calendar days.`
        : `Serious, unexpected, suspected adverse reaction — expedited within ${timelineDays} calendar days.`,
      citation: timelines.citation,
      notes: [
        'Timeline is in calendar days from the day the sponsor first becomes aware that the case qualifies for expedited reporting.',
        input.region === 'FDA'
          ? 'A 7-day fatal/life-threatening notification must be followed by a complete IND safety report within 15 calendar days.'
          : 'For a fatal/life-threatening SUSAR, relevant follow-up information is reported within a further 8 calendar days.',
        'Aggregate/periodic (IND annual report / DSUR) and protocol-specified reporting also apply — confirm against the governing regulation.',
      ],
    };
  }

  // Identify which criterion failed (in ICH E2A order) for an honest rationale.
  const failed: string[] = [];
  if (!serious) failed.push('not serious');
  if (!unexpected) failed.push('not unexpected');
  if (!suspected) failed.push('no suspected causal relationship');

  return {
    region: input.region,
    reportable: false,
    reportType: 'Not individually expedited-reportable',
    timelineDays: null,
    rationale:
      `Does not meet the ICH E2A expedited criteria (serious + unexpected + suspected causality): ${failed.join(', ')}.`,
    citation: timelines.citation,
    notes: [
      'Expedited reporting requires the case to be serious AND unexpected AND have a suspected (reasonably possible) causal relationship.',
      'A non-expedited case may still be reportable in aggregate (IND annual report / DSUR) or under the protocol-specified safety plan — confirm against the governing regulation.',
    ],
  };
}
