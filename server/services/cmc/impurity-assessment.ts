/**
 * What a RECORDED impurity is, against the threshold that governs it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The impurity register (shared/schema.ts `cmcImpurityProfiles`) captures an
 * observed level; ICH Q3A(R2)/Q3B(R2) say what must happen at that level. The
 * comparison between the two is the whole content of §3.2.S.3.2 and §3.2.P.5.5,
 * and it is a comparison a person should not be doing by hand against a
 * sentence that reads "0.10% or 1.0 mg/day intake (whichever is lower)".
 *
 * One implementation, two callers: the composed Module 3 section and the AnA
 * recorded-assessment tool. The thresholds themselves are NOT restated here —
 * they come from services/global-ri/impurities-thresholds, which owns the
 * ICH tables.
 *
 * ── What it will not do ──────────────────────────────────────────────────────
 * It refuses rather than guessing. No maximum daily dose means no threshold, so
 * no verdict; an unrecorded unit means the number is not comparable to a
 * percentage; an impurity class ICH Q3A/Q3B does not cover is routed to the
 * guideline that does. A refusal carries its reason, and callers are required
 * to relay it rather than reporting an impurity as unassessed-and-therefore-fine.
 */
import {
  resolveImpurityThresholds,
  type ImpurityClass,
  type ResolvedThreshold,
} from '../global-ri/impurities-thresholds';

/** The verdict for one impurity against the thresholds that govern it. */
export type ImpurityDisposition =
  /** At or above the qualification threshold — a qualification basis is required. */
  | 'above-qualification'
  /** At or above identification, below qualification — the structure must be known. */
  | 'above-identification'
  /** At or above reporting, below identification — reported, no further action implied. */
  | 'reportable'
  /** Below the reporting threshold — not reported, not counted, not totalled. */
  | 'below-reporting';

export interface ImpurityAssessment {
  ok: true;
  impurityName: string;
  disposition: ImpurityDisposition;
  /** The observed level normalised to a percentage of the drug substance/product. */
  observedPercent: number;
  /** The level as recorded, with its unit, for display. */
  observedAsRecorded: string;
  thresholds: {
    reporting: ResolvedThreshold;
    identification: ResolvedThreshold;
    qualification: ResolvedThreshold;
  };
  citation: string;
  boundaryExact: boolean;
  /** True when the record itself states a threshold that differs from the guideline's. */
  recordedThresholdDiffers: boolean;
  /**
   * What the record still owes, given the disposition. Empty when nothing is
   * outstanding. These are the sentences §3.2.S.3.2 / §3.2.P.5.5 must carry.
   */
  outstanding: string[];
}

export interface ImpurityAssessmentRefusal {
  ok: false;
  impurityName: string;
  code:
    | 'LEVEL_MISSING'
    | 'LEVEL_UNPARSEABLE'
    | 'LEVEL_UNIT_UNRECORDED'
    | 'LEVEL_UNIT_NOT_CONVERTIBLE'
    | 'MDD_MISSING'
    | 'MDD_UNPARSEABLE'
    | 'MDD_NON_POSITIVE'
    | 'CLASS_OUT_OF_SCOPE'
    | 'CLASS_UNRESOLVED';
  message: string;
  routeTo?: string;
}

export type ImpurityAssessmentResult = ImpurityAssessment | ImpurityAssessmentRefusal;

/**
 * Can this record actually be compared to a threshold?
 *
 * The write-through mapper decides whether an impurity completes §3.2.S.3 /
 * §3.2.P.5, and it used to decide with a field-presence proxy — a name, a
 * level, a unit, a dose, a class that is not 'unresolved'. The proxy is weaker
 * than the engine: an unparseable dose, a unit that does not convert, a class
 * ICH does not govern, and a comparator-prefixed level all pass it and are then
 * REFUSED here — so a section reported itself complete over impurities the same
 * section rendered as "not assessable". One rule, asked once.
 */
export function isAssessableImpurity(
  record: Record<string, any>,
  matrix: 'drug_substance' | 'drug_product',
): boolean {
  return assessRecordedImpurity(record, matrix).ok;
}

/**
 * Parse a recorded dose into milligrams per day.
 *
 * Accepts what a CMC staffer types: "500 mg", "2 g/day", "0.5g", "250". A bare
 * number is read as milligrams because that is the register's stated unit; a
 * unit that is not a mass (mg/kg, IU, mL) is REFUSED rather than coerced — a
 * weight-normalised dose is not a maximum daily dose and the thresholds do not
 * apply to it without the patient weight the record does not carry.
 */
export function parseDoseMg(raw: unknown): { ok: true; mg: number } | { ok: false; code: 'MDD_MISSING' | 'MDD_UNPARSEABLE' | 'MDD_NON_POSITIVE'; message: string } {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { ok: false, code: 'MDD_MISSING', message: 'No maximum daily dose is recorded.' };
  }
  const text = String(raw).trim().toLowerCase().replace(/\s*\/\s*day$/, '').replace(/\s*per day$/, '');
  const m = text.match(/^([0-9]*\.?[0-9]+)\s*(mg|g|µg|ug|mcg)?$/);
  if (!m) {
    return {
      ok: false,
      code: 'MDD_UNPARSEABLE',
      message: `The recorded maximum daily dose "${String(raw)}" is not a plain mass per day, so no ICH threshold can be keyed to it.`,
    };
  }
  const value = Number(m[1]);
  if (!Number.isFinite(value)) {
    return { ok: false, code: 'MDD_UNPARSEABLE', message: `The recorded maximum daily dose "${String(raw)}" is not a number.` };
  }
  const unit = m[2] || 'mg';
  const mg = unit === 'g' ? value * 1000 : unit === 'mg' ? value : value / 1000;
  if (mg <= 0) {
    return { ok: false, code: 'MDD_NON_POSITIVE', message: `A maximum daily dose of ${String(raw)} cannot key a threshold.` };
  }
  return { ok: true, mg };
}

/**
 * Normalise a recorded level to a percentage of the material.
 *
 * `%` passes through; `ppm` and `ppb` convert; `mg/day`, `µg/day` and `mg`
 * convert only against the maximum daily dose, which is what makes them a
 * percentage of the material at all. A MISSING unit is refused: the register's
 * column default is '%', but a number typed with the unit field cleared is not
 * a percentage just because the column has a default, and rendering a ppm
 * figure as a percentage overstates it twenty-thousand-fold.
 */
export function normaliseLevelToPercent(
  rawLevel: unknown,
  rawUnit: unknown,
  maxDailyDoseMg: number,
):
  | { ok: true; percent: number; asRecorded: string }
  | { ok: false; code: 'LEVEL_MISSING' | 'LEVEL_UNPARSEABLE' | 'LEVEL_UNIT_UNRECORDED' | 'LEVEL_UNIT_NOT_CONVERTIBLE'; message: string } {
  if (rawLevel === null || rawLevel === undefined || String(rawLevel).trim() === '') {
    return { ok: false, code: 'LEVEL_MISSING', message: 'No level is recorded for this impurity.' };
  }
  const levelText = String(rawLevel).trim();
  /* A comparator is not decoration. "<0.15" means the assay did not measure a
     value; stripping the operator and comparing 0.15 against a 0.15% threshold
     reported an impurity as sitting ON the threshold — a deficiency statement
     over a result that says the opposite. A comparator-prefixed level is
     refused rather than read as an exact value. */
  if (/^[<>≤≥]/.test(levelText)) {
    return {
      ok: false,
      code: 'LEVEL_UNPARSEABLE',
      message: `The level "${levelText}" is recorded as a limit rather than a measured value, so it cannot be placed against a threshold. Record the measured level, or record the impurity as below the reporting threshold.`,
    };
  }
  const numeric = Number(levelText.replace(/[%\s]/g, ''));
  if (!Number.isFinite(numeric) || levelText.replace(/[%\s]/g, '') === '') {
    return { ok: false, code: 'LEVEL_UNPARSEABLE', message: `The recorded level "${levelText}" is not a number.` };
  }
  const unit = String(rawUnit ?? '').trim().toLowerCase();
  const asRecorded = unit ? `${levelText} ${unit}` : levelText;
  if (!unit) {
    return {
      ok: false,
      code: 'LEVEL_UNIT_UNRECORDED',
      message: `The level "${levelText}" is recorded without a unit, so it cannot be compared to a threshold.`,
    };
  }
  if (unit === '%' || unit === 'percent' || unit === '% w/w' || unit === '% area') {
    return { ok: true, percent: numeric, asRecorded };
  }
  if (unit === 'ppm') return { ok: true, percent: numeric / 10_000, asRecorded };
  if (unit === 'ppb') return { ok: true, percent: numeric / 10_000_000, asRecorded };
  if (unit === 'mg/day' || unit === 'mg') {
    return { ok: true, percent: (numeric / maxDailyDoseMg) * 100, asRecorded };
  }
  if (unit === 'µg/day' || unit === 'ug/day' || unit === 'mcg/day' || unit === 'µg' || unit === 'ug') {
    return { ok: true, percent: (numeric / 1000 / maxDailyDoseMg) * 100, asRecorded };
  }
  return {
    ok: false,
    code: 'LEVEL_UNIT_NOT_CONVERTIBLE',
    message: `The unit "${unit}" cannot be converted to a proportion of the material, so this level cannot be compared to an ICH threshold.`,
  };
}

/** The register's impurity_type column, mapped onto the guideline's classes. */
export function impurityClassOf(raw: unknown): ImpurityClass {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!v) return 'unresolved';
  /* Exact matches first — these are the values the register's own control
     offers, and a substring pass over them misrouted: "process-related residual
     material" matched `residual` before anything else and was sent to Q3C as a
     solvent. Only an unrecognised string falls through to the substring
     vocabulary below, which exists for records written by an integration. */
  const EXACT: Record<string, ImpurityClass> = {
    'process-related': 'organic',
    organic: 'organic',
    degradation: 'degradation',
    'degradation-product': 'degradation',
    inorganic: 'inorganic',
    'residual-solvent': 'residual-solvent',
    elemental: 'elemental',
    mutagenic: 'mutagenic',
    enantiomeric: 'enantiomeric',
    polymorphic: 'polymorphic',
  };
  if (EXACT[v]) return EXACT[v];
  if (v.includes('residual') || v.includes('solvent')) return 'residual-solvent';
  if (v.includes('elemental') || v.includes('metal')) return 'elemental';
  if (v.includes('mutagen') || v.includes('genotox')) return 'mutagenic';
  if (v.includes('degrad')) return 'degradation';
  if (v.includes('enantiom') || v.includes('chiral')) return 'enantiomeric';
  if (v.includes('polymorph')) return 'polymorphic';
  if (v.includes('inorganic')) return 'inorganic';
  if (v.includes('process') || v.includes('organic') || v.includes('related') || v.includes('unspecified')) return 'organic';
  return 'unresolved';
}

/**
 * Assess one recorded impurity against the ICH threshold that governs it.
 *
 * `matrix` decides the guideline — Q3A for an impurity in the drug substance,
 * Q3B for a degradation product in the drug product. The record's own recorded
 * thresholds are not overwritten: where they differ from the guideline's, that
 * disagreement is reported (`recordedThresholdDiffers`) rather than silently
 * resolved in either direction.
 */
export function assessRecordedImpurity(
  record: Record<string, any>,
  matrix: 'drug_substance' | 'drug_product',
): ImpurityAssessmentResult {
  const impurityName = String(record.impurityName || record.impurity_name || 'Unnamed impurity');
  const impurityClass = impurityClassOf(record.impurityType ?? record.impurity_type);

  /* Class FIRST. An impurity ICH Q3A/Q3B does not govern is out of scope
     whatever its dose, and reporting "no maximum daily dose is recorded" for a
     residual solvent sends the reader to fix the wrong thing — the dose would
     not have produced a threshold for it either way. */
  const scoped = resolveImpurityThresholds({ matrix, maxDailyDoseMg: 1, impurityClass });
  if (!scoped.ok && (scoped.code === 'CLASS_OUT_OF_SCOPE' || scoped.code === 'CLASS_UNRESOLVED')) {
    return { ok: false, impurityName, code: scoped.code, message: scoped.message, routeTo: scoped.routeTo };
  }

  const dose = parseDoseMg(record.maximumDailyDose ?? record.maximum_daily_dose);
  if (!dose.ok) return { ok: false, impurityName, code: dose.code, message: dose.message };

  const thresholds = resolveImpurityThresholds({
    matrix,
    maxDailyDoseMg: dose.mg,
    impurityClass,
  });
  if (!thresholds.ok) {
    return {
      ok: false,
      impurityName,
      code: thresholds.code === 'MDD_MISSING' ? 'MDD_MISSING' : thresholds.code === 'MDD_NON_POSITIVE' ? 'MDD_NON_POSITIVE' : thresholds.code,
      message: thresholds.message,
      routeTo: thresholds.routeTo,
    };
  }

  const level = normaliseLevelToPercent(
    record.observedLevel ?? record.observed_level,
    record.levelUnit ?? record.level_unit,
    dose.mg,
  );
  if (!level.ok) return { ok: false, impurityName, code: level.code, message: level.message };

  /* ICH acts on an impurity at a level GREATER THAN a threshold, not at it
     (Q3A(R2) §2.2, §3.3, §3.4 and the Q3B equivalents all read "greater than").
     Using >= manufactured a deficiency statement for an impurity sitting
     exactly on the qualification threshold, which the guideline does not
     require to be qualified. */
  const disposition: ImpurityDisposition =
    level.percent > thresholds.qualification.effectivePercent
      ? 'above-qualification'
      : level.percent > thresholds.identification.effectivePercent
        ? 'above-identification'
        : level.percent > thresholds.reporting.effectivePercent
          ? 'reportable'
          : 'below-reporting';

  const outstanding: string[] = [];
  const hasStructure = Boolean(String(record.structure || record.molecularFormula || record.molecular_formula || '').trim());
  const qualificationBasis = String(record.qualificationBasis || record.qualification_basis || '').trim();
  if (disposition === 'above-identification' || disposition === 'above-qualification') {
    if (!hasStructure) {
      outstanding.push(
        `at or above the identification threshold (${thresholds.identification.expression}) with no structure recorded — reported as an unidentified impurity`,
      );
    }
  }
  if (disposition === 'above-qualification' && !qualificationBasis) {
    outstanding.push(
      `at or above the qualification threshold (${thresholds.qualification.expression}) with no qualification basis recorded — its qualification is not established`,
    );
  }

  /* Does the applicant's own recorded threshold disagree with the guideline's?
     Compared PAIRWISE — reporting against reporting, identification against
     identification — and only where the applicant recorded one. The earlier
     form compacted the recorded array before indexing it, so a record that
     stated only a qualification threshold compared it against the REPORTING
     row; and it accepted a match against any of the three, so a recorded
     "0.05%" qualification threshold was silently taken as agreeing with the
     0.05% reporting threshold. */
  const recordedPairs: Array<[string, string]> = [
    [String(record.reportingThreshold ?? record.reporting_threshold ?? '').trim(), thresholds.reporting.expression],
    [String(record.identificationThreshold ?? record.identification_threshold ?? '').trim(), thresholds.identification.expression],
    [String(record.qualificationThreshold ?? record.qualification_threshold ?? '').trim(), thresholds.qualification.expression],
  ];
  const normalise = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/^(nmt|<=|≤)\s*/, '').trim();
  const recordedThresholdDiffers = recordedPairs.some(
    ([recorded, guideline]) => recorded !== '' && normalise(recorded) !== normalise(guideline) && !normalise(guideline).startsWith(normalise(recorded)),
  );

  return {
    ok: true,
    impurityName,
    disposition,
    observedPercent: level.percent,
    observedAsRecorded: level.asRecorded,
    thresholds: {
      reporting: thresholds.reporting,
      identification: thresholds.identification,
      qualification: thresholds.qualification,
    },
    citation: thresholds.citation,
    boundaryExact: thresholds.boundaryExact,
    recordedThresholdDiffers,
    outstanding,
  };
}
