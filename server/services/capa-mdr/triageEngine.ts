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
 *
 * An event fact nobody stated is not doubt resolved to "no". Until 2026-10-26
 * classify read an omitted isMalfunction, anticipatesCorrection and
 * trendThresholdCrossed as false and an omitted country as outside the EU, so
 * { patientHarm: 'serious_injury' } was a 30-day FDA report with no EU report
 * and no 806 notice, and intake stored that as the complaint's classification.
 * Now what an unstated fact decides is null, missingFacts names the fact and
 * determinationComplete is false (Rule 2 audit S3).
 */

import type {
  EuMdrSeverity,
  FdaMdrReportType,
  HarmLevel,
  MdrJurisdiction,
} from '@shared/schema/capa-mdr';
import { HARM_LEVELS } from '@shared/schema/capa-mdr';

/**
 * An event fact the caller does not state (omitted or null), or a country it
 * states as 'unknown', is unknown: never false, never "outside the EU".
 */
export interface TriageInput {
  patientHarm: HarmLevel;
  /** Whether a malfunction would likely cause death or serious injury if it recurred. */
  isMalfunction?: boolean | null;
  /** Country of event (ISO 3166-1 alpha-2, or 'unknown') — drives EU MDR applicability. */
  eventLocationCountry?: string | null;
  /** Whether a corrective action affecting distributed product is anticipated. */
  anticipatesCorrection?: boolean | null;
  /** Free-text narrative — reserved for future NLP rules; ignored today. */
  eventNarrative?: string | null;
  /**
   * If a recent identical event has occurred (trend signal), the EU clock
   * may shift to the 2-day public-health threat class (Article 87(4)).
   */
  trendThresholdCrossed?: boolean | null;
}

/** The event facts, besides the harm, that the classification turns on. */
export const TRIAGE_FACTS = ['isMalfunction', 'eventLocationCountry', 'anticipatesCorrection', 'trendThresholdCrossed'] as const;
export type TriageFact = (typeof TRIAGE_FACTS)[number];

/** The facts as stated; null is not stated (a country stated as 'unknown' is null). */
export interface TriageFacts {
  isMalfunction: boolean | null;
  eventLocationCountry: string | null;
  anticipatesCorrection: boolean | null;
  trendThresholdCrossed: boolean | null;
}

/** What a caller states for each fact. A country nobody knows is stated as 'unknown'. */
export const TRIAGE_FACT_VALUES: Record<TriageFact, readonly string[]> = {
  isMalfunction: ['true', 'false'],
  eventLocationCountry: ['an ISO 3166-1 alpha-2 country code', 'unknown'],
  anticipatesCorrection: ['true', 'false'],
  trendThresholdCrossed: ['true', 'false'],
};

export interface PreliminaryClassification {
  /** null when a fact that decides it was not stated (see missingFacts); so for each field below. */
  fdaReportable: boolean | null;
  mdrEuReportable: boolean | null;
  requires806Notice: boolean | null;
  /** Suggested jurisdiction for the MDR if one is opened; null while FDA or EU reportability is not determined. */
  suggestedJurisdiction: MdrJurisdiction | null;
  /** Suggested FDA report type — null when not reportable or not determined. */
  suggestedFdaReportType: FdaMdrReportType | null;
  /** Suggested EU MDR severity class — null when not reportable or not determined. */
  suggestedEuSeverity: EuMdrSeverity | null;
  /**
   * The event facts it was computed from, as stated. Stored with the
   * classification at intake: the complaints table has no column for the
   * three booleans.
   */
  facts: TriageFacts;
  /** Each unstated fact this harm's determination turns on, and what it decides. */
  missingFacts: string[];
  /** False while missingFacts is not empty (what those facts decide is null), or while a part is not
   *  assessed by this engine: an EU malfunction's serious-incident status (mdrEuReportable null). */
  determinationComplete: boolean;
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

const ALPHA2 = /^[A-Za-z]{2}$/;

/** Each fact as missingFacts names it: the fact, then what it decides. */
const MISSING_FACT: Record<TriageFact, string> = {
  isMalfunction:
    'isMalfunction (whether the malfunction would be likely to cause or contribute to a death or serious injury if it recurred; decides FDA reportability)',
  eventLocationCountry: 'eventLocationCountry (the country of the event; decides EU MDR vigilance reportability)',
  anticipatesCorrection:
    'anticipatesCorrection (whether a correction or removal is anticipated; decides the FDA 5-day or 30-day report and the 21 CFR 806 notice)',
  trendThresholdCrossed: 'trendThresholdCrossed (whether a trend threshold is crossed; decides the EU 2-day class)',
};

/**
 * The facts a caller left unstated: a boolean that is not true or false, or a
 * country that is neither an alpha-2 code nor 'unknown'. Intake and the AnA
 * tools refuse these and ask for them; nothing reads one as false.
 */
export function unstatedTriageFacts(input: Partial<Record<TriageFact, unknown>>): TriageFact[] {
  return TRIAGE_FACTS.filter((fact) => {
    const value = input[fact];
    if (fact !== 'eventLocationCountry') return typeof value !== 'boolean';
    if (typeof value !== 'string') return true;
    return !ALPHA2.test(value.trim()) && value.trim().toLowerCase() !== 'unknown';
  });
}

/** "isMalfunction (true or false); …" — unstated facts, for a refusal that asks for them. */
export function describeTriageFacts(facts: readonly TriageFact[]): string {
  return facts.map((fact) => `${fact} (${TRIAGE_FACT_VALUES[fact].join(' or ')})`).join('; ');
}

function statedFacts(input: TriageInput): TriageFacts {
  const flag = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
  const country = typeof input.eventLocationCountry === 'string' ? input.eventLocationCountry.trim() : '';
  return {
    isMalfunction: flag(input.isMalfunction),
    eventLocationCountry: ALPHA2.test(country) ? country.toUpperCase() : null,
    anticipatesCorrection: flag(input.anticipatesCorrection),
    trendThresholdCrossed: flag(input.trendThresholdCrossed),
  };
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
 *   - Injury (non-serious) → assess FDA malfunction reportability; EU 15-day if
 *                            the regulator considers it a serious incident.
 *   - Malfunction         → FDA-reportable IF "would be likely to cause
 *                            or contribute to a death or serious injury
 *                            were it to recur" — caller signals this via
 *                            isMalfunction; unstated, it is not determined.
 *   - No harm             → still assess malfunction reportability.
 *
 * 21 CFR 806 trigger: anticipatesCorrection AND patientHarm in
 *   { injury, serious_injury, death }.
 *
 * An event fact a branch turns on that was not stated is unknown: what it
 * decides is null, missingFacts names it and determinationComplete is false.
 * A fact no branch for this harm turns on is not reported missing.
 */
export function classify(input: TriageInput): PreliminaryClassification {
  const { patientHarm } = input;
  const facts = statedFacts(input);
  const { isMalfunction, anticipatesCorrection, trendThresholdCrossed } = facts;
  // An unstated country is not "outside the EU": EU applicability is unknown.
  const inEU = facts.eventLocationCountry === null ? null : EU_COUNTRY_CODES.has(facts.eventLocationCountry);

  let fdaReportable: boolean | null = false;
  let mdrEuReportable: boolean | null = false;
  let suggestedFdaReportType: FdaMdrReportType | null = null;
  let suggestedEuSeverity: EuMdrSeverity | null = null;
  const reasons: string[] = [];
  const missing = new Set<TriageFact>();
  /** A part this engine does not model, which no stated fact would decide. */
  let euNotAssessed = false;

  // A reportable malfunction need not have caused actual harm (803.50(a)(2)).
  // Evaluate the recurrence-risk signal for every harm that does not itself
  // establish FDA reportability, including 'none' and non-serious injury.
  const assessFdaMalfunction = () => {
    if (isMalfunction === null) {
      fdaReportable = null;
      missing.add('isMalfunction');
      reasons.push('Malfunction recurrence risk not stated → FDA reportability not determined');
    } else if (isMalfunction) {
      fdaReportable = true;
      suggestedFdaReportType = 'initial_30day';
      reasons.push('Malfunction likely to cause death or serious injury on recurrence → FDA 30-day per 21 CFR 803.50(a)(2)');
    }
  };

  const assessEuMalfunction = () => {
    // EU serious-incident status (Article 2(65), 87) is not modeled here.
    // Only a stated non-EU country settles this part of a malfunction's result.
    if (inEU === null) {
      mdrEuReportable = null;
      missing.add('eventLocationCountry');
    } else if (inEU) {
      mdrEuReportable = null;
      euNotAssessed = true;
      reasons.push('Malfunction in the EU → whether it is a serious incident (EU MDR Article 2(65), 87) is not assessed here');
    }
  };

  switch (patientHarm) {
    case 'death':
    case 'serious_injury': {
      const said = patientHarm === 'death'
        ? {
            event: 'Death',
            fda5: 'Death + anticipated correction → FDA 5-day per 21 CFR 803.53',
            fda30: 'Death → FDA 30-day per 21 CFR 803.50',
            eu2: 'Death + trend threshold → EU MDR Article 87(4) 2-day',
            eu10: 'Death → EU MDR Article 87(3) 10-day',
          }
        : {
            event: 'Serious injury',
            fda5: 'Serious injury + anticipated correction → FDA 5-day',
            fda30: 'Serious injury → FDA 30-day',
            eu2: 'Serious injury + trend → EU MDR 2-day',
            eu10: 'Serious injury → EU MDR 10-day',
          };
      fdaReportable = true;
      if (anticipatesCorrection === null) {
        missing.add('anticipatesCorrection');
        reasons.push(`${said.event} → FDA reportable; 5-day or 30-day not determined`);
      } else {
        suggestedFdaReportType = anticipatesCorrection ? 'initial_5day' : 'initial_30day';
        reasons.push(anticipatesCorrection ? said.fda5 : said.fda30);
      }
      if (inEU === null) {
        mdrEuReportable = null;
        missing.add('eventLocationCountry');
        reasons.push(`${said.event} → EU MDR vigilance not determined`);
      } else if (inEU) {
        mdrEuReportable = true;
      }
      // The EU class turns on the trend whenever the event is, or may be, in the EU.
      if (inEU !== false && trendThresholdCrossed === null) {
        missing.add('trendThresholdCrossed');
      } else if (inEU) {
        suggestedEuSeverity = trendThresholdCrossed ? 'life_threatening_2day' : 'death_or_serious_10day';
        reasons.push(trendThresholdCrossed ? said.eu2 : said.eu10);
      }
      break;
    }

    case 'injury':
      // Not FDA-reportable on its own per 803.3 definition of serious
      // injury, but EU MDR may still require Article 87 reporting as
      // "other serious incident" depending on regulator interpretation.
      assessFdaMalfunction();
      if (inEU === null) {
        mdrEuReportable = null;
        missing.add('eventLocationCountry');
        reasons.push('Injury but non-serious — EU MDR not determined');
      } else if (inEU) {
        mdrEuReportable = true;
        suggestedEuSeverity = 'other_serious_15day';
        reasons.push('Injury in EU → EU MDR Article 87(3) 15-day (other serious)');
      } else {
        reasons.push('Injury but non-serious — document under 820.198');
      }
      break;

    case 'malfunction':
      assessFdaMalfunction();
      if (isMalfunction === false) {
        reasons.push('Malfunction without harm-likelihood signal — review for trend only');
      }
      assessEuMalfunction();
      break;

    case 'none':
      assessFdaMalfunction();
      if (isMalfunction !== false) assessEuMalfunction();
      reasons.push(isMalfunction === false
        ? 'No harm reported and no reportable malfunction — log under 820.198, no MDR'
        : 'No harm reported — malfunction reportability assessed separately');
      break;

    default:
      // An absent or unrecognised harm is not "no harm". This branch used to
      // share the 'none' case, so a caller that omitted patientHarm — or sent
      // "unknown", or a misspelling — got "No harm reported — no MDR", a
      // reportability determination nobody made. Refuse instead; the AnA tool
      // turns this into needs_parameters and the intake requires the field.
      throw new RangeError(
        `patientHarm must be one of: ${HARM_LEVELS.join(', ')} — got ${JSON.stringify(patientHarm)}`,
      );
  }

  // 21 CFR 806 corrections-and-removals notice — tied to corrections that
  // reduce a risk to health or remedy a violation. Conservative trigger: if
  // a correction is anticipated AND there's any non-trivial harm.
  const patientImpact = patientHarm === 'injury' || patientHarm === 'serious_injury' || patientHarm === 'death';
  const requires806Notice = patientImpact ? anticipatesCorrection : false;
  if (requires806Notice === null) {
    missing.add('anticipatesCorrection');
  } else if (requires806Notice) {
    reasons.push('21 CFR 806: anticipated correction with patient impact → 10-business-day notice');
  }

  let suggestedJurisdiction: MdrJurisdiction | null;
  if (fdaReportable === null || mdrEuReportable === null) suggestedJurisdiction = null;
  else if (fdaReportable && mdrEuReportable) suggestedJurisdiction = 'both';
  else if (fdaReportable) suggestedJurisdiction = 'us_fda';
  else if (mdrEuReportable) suggestedJurisdiction = 'eu_mdr';
  else suggestedJurisdiction = 'us_fda'; // default placeholder; not reportable

  const unknownFacts = TRIAGE_FACTS.filter((fact) => missing.has(fact));
  if (unknownFacts.length > 0) {
    reasons.push(`Not determined until stated: ${unknownFacts.join(', ')}`);
  }

  return {
    fdaReportable,
    mdrEuReportable,
    requires806Notice,
    suggestedJurisdiction,
    suggestedFdaReportType,
    suggestedEuSeverity,
    facts,
    missingFacts: unknownFacts.map((fact) => MISSING_FACT[fact]),
    determinationComplete: unknownFacts.length === 0 && !euNotAssessed,
    rationale: reasons.join(' · '),
    autoComputed: true,
    computedAt: new Date().toISOString(),
  };
}
