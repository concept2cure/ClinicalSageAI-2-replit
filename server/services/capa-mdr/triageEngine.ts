/**
 * Triage engine — preliminary classification on complaint intake.
 *
 * On every new complaint we run a deterministic rules pass that flags whether
 * the event is likely to require:
 *   - FDA MDR report (21 CFR 803)
 *   - EU MDR vigilance report (Article 87)
 *   - 21 CFR 806 corrections-and-removals notice
 *
 * This is "preliminary" — final reportability determination is a regulated
 * decision made by the safety/RA team via the triage workflow. The engine
 * exists to produce a triage hint and seed the reportability clocks so the
 * UI can show aging immediately on intake (rather than only after a human
 * touches the record).
 *
 * Rules are intentionally conservative: when in doubt, flag reportable. The
 * RA team can demote during triage with a recorded rationale.
 */

import type {
  EuMdrSeverity,
  FdaMdrReportType,
  HarmLevel,
  MdrJurisdiction,
} from '@shared/schema/capa-mdr';

export interface TriageInput {
  patientHarm: HarmLevel;
  /** Whether the device behaved outside its specifications. */
  isMalfunction?: boolean;
  /** Country of event — drives EU MDR applicability. */
  eventLocationCountry?: string | null;
  /** Whether a corrective action affecting distributed product is anticipated. */
  anticipatesCorrection?: boolean;
  /** Free-text narrative — reserved for future NLP rules; ignored today. */
  eventNarrative?: string | null;
  /**
   * If a recent identical event has occurred (trend signal), the EU clock
   * may shift to the 2-day public-health threat class (Article 87(4)).
   */
  trendThresholdCrossed?: boolean;
}

export interface PreliminaryClassification {
  fdaReportable: boolean;
  mdrEuReportable: boolean;
  requires806Notice: boolean;
  /** Suggested jurisdiction for the MDR if one is opened. */
  suggestedJurisdiction: MdrJurisdiction;
  /** Suggested FDA report type — null when not reportable. */
  suggestedFdaReportType: FdaMdrReportType | null;
  /** Suggested EU MDR severity class — null when not reportable. */
  suggestedEuSeverity: EuMdrSeverity | null;
  /** Human-readable rationale; logged on the audit trail. */
  rationale: string;
  /** Always true for the rules-based engine; false when a human overrode. */
  autoComputed: boolean;
  computedAt: string; // ISO
}

const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  // EEA + Switzerland (aligned with the medical-device acquis)
  'IS', 'LI', 'NO', 'CH',
]);

function isEUEvent(country: string | null | undefined): boolean {
  if (!country) return false;
  return EU_COUNTRY_CODES.has(country.toUpperCase());
}

/**
 * Preliminary classification per 21 CFR 803 + EU MDR Article 87.
 *
 * Decision tree (conservative side):
 *   - Death               → FDA reportable (initial_30day baseline; 5-day
 *                           if anticipatesCorrection); EU 10-day class.
 *   - Serious injury      → FDA reportable (initial_30day; escalate to
 *                           5-day if anticipatesCorrection).
 *                           EU 10-day class baseline; 2-day if trend.
 *   - Injury (non-serious) → not FDA-reportable by default; EU 15-day if
 *                            the regulator considers it a serious incident.
 *   - Malfunction         → FDA-reportable IF "would be likely to cause
 *                            or contribute to a death or serious injury
 *                            were it to recur" — caller signals this via
 *                            isMalfunction; default to reportable.
 *   - None / minor        → not reportable.
 *
 * 21 CFR 806 trigger: anticipatesCorrection AND patientHarm in
 *   { injury, serious_injury, death }.
 */
export function classify(input: TriageInput): PreliminaryClassification {
  const {
    patientHarm,
    isMalfunction = false,
    eventLocationCountry = null,
    anticipatesCorrection = false,
    trendThresholdCrossed = false,
  } = input;

  const inEU = isEUEvent(eventLocationCountry);

  let fdaReportable = false;
  let mdrEuReportable = false;
  let suggestedFdaReportType: FdaMdrReportType | null = null;
  let suggestedEuSeverity: EuMdrSeverity | null = null;
  const reasons: string[] = [];

  switch (patientHarm) {
    case 'death':
      fdaReportable = true;
      suggestedFdaReportType = anticipatesCorrection ? 'initial_5day' : 'initial_30day';
      reasons.push(
        anticipatesCorrection
          ? 'Death + anticipated correction → FDA 5-day per 21 CFR 803.53'
          : 'Death → FDA 30-day per 21 CFR 803.50',
      );
      if (inEU) {
        mdrEuReportable = true;
        suggestedEuSeverity = trendThresholdCrossed
          ? 'life_threatening_2day'
          : 'death_or_serious_10day';
        reasons.push(
          trendThresholdCrossed
            ? 'Death + trend threshold → EU MDR Article 87(4) 2-day'
            : 'Death → EU MDR Article 87(3) 10-day',
        );
      }
      break;

    case 'serious_injury':
      fdaReportable = true;
      suggestedFdaReportType = anticipatesCorrection ? 'initial_5day' : 'initial_30day';
      reasons.push(
        anticipatesCorrection
          ? 'Serious injury + anticipated correction → FDA 5-day'
          : 'Serious injury → FDA 30-day',
      );
      if (inEU) {
        mdrEuReportable = true;
        suggestedEuSeverity = trendThresholdCrossed
          ? 'life_threatening_2day'
          : 'death_or_serious_10day';
        reasons.push(
          trendThresholdCrossed
            ? 'Serious injury + trend → EU MDR 2-day'
            : 'Serious injury → EU MDR 10-day',
        );
      }
      break;

    case 'injury':
      // Not FDA-reportable on its own per 803.3 definition of serious
      // injury, but EU MDR may still require Article 87 reporting as
      // "other serious incident" depending on regulator interpretation.
      if (inEU) {
        mdrEuReportable = true;
        suggestedEuSeverity = 'other_serious_15day';
        reasons.push('Injury in EU → EU MDR Article 87(3) 15-day (other serious)');
      } else {
        reasons.push('Injury but non-serious — no FDA MDR; document under 820.198 only');
      }
      break;

    case 'malfunction':
      if (isMalfunction) {
        // Malfunction reportability depends on whether recurrence would
        // likely cause death or serious injury. Default to flagging.
        fdaReportable = true;
        suggestedFdaReportType = 'initial_30day';
        reasons.push('Malfunction likely to cause harm on recurrence → FDA 30-day');
      } else {
        reasons.push('Malfunction without harm-likelihood signal — review for trend only');
      }
      break;

    case 'none':
    default:
      reasons.push('No harm reported — log under 820.198, no MDR');
      break;
  }

  // 21 CFR 806 corrections-and-removals notice — tied to corrections that
  // reduce a risk to health or remedy a violation. Conservative trigger: if
  // a correction is anticipated AND there's any non-trivial harm.
  const requires806Notice =
    anticipatesCorrection && (patientHarm === 'injury'
      || patientHarm === 'serious_injury'
      || patientHarm === 'death');
  if (requires806Notice) {
    reasons.push('21 CFR 806: anticipated correction with patient impact → 10-business-day notice');
  }

  let suggestedJurisdiction: MdrJurisdiction;
  if (fdaReportable && mdrEuReportable) suggestedJurisdiction = 'both';
  else if (fdaReportable) suggestedJurisdiction = 'us_fda';
  else if (mdrEuReportable) suggestedJurisdiction = 'eu_mdr';
  else suggestedJurisdiction = 'us_fda'; // default placeholder; not reportable

  return {
    fdaReportable,
    mdrEuReportable,
    requires806Notice,
    suggestedJurisdiction,
    suggestedFdaReportType,
    suggestedEuSeverity,
    rationale: reasons.join(' · '),
    autoComputed: true,
    computedAt: new Date().toISOString(),
  };
}
