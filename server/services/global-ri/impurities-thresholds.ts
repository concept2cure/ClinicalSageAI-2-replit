/**
 * Impurities & limits expert — ICH Q3 series thresholds and limits.
 *
 * Setting and justifying impurity, residual-solvent, and elemental-impurity
 * limits is a core RA CMC task: it drives the drug-substance and drug-product
 * specifications, the qualification strategy, and the safety justification for
 * any observed impurity. This service encodes the ICH Q3A(R2)/Q3B(R2) reporting,
 * identification, and qualification thresholds (keyed to the maximum daily dose,
 * MDD), the Q3C(R8) residual-solvent classes/limits, and the Q3D(R2) Class 1
 * elemental-impurity permitted daily exposures (PDEs) by route of administration.
 *
 * Pure / deterministic — no DB, no IO. The encoded tables are a reference aid;
 * the applicable thresholds/limits must be confirmed against the in-force
 * revision of the cited guideline, and may be lowered by safety/genotoxic
 * (e.g. ICH M7) considerations not modeled here.
 *
 * References:
 *   - ICH Q3A(R2) — Impurities in New Drug Substances
 *     (reporting/identification/qualification thresholds by maximum daily dose).
 *   - ICH Q3B(R2) — Impurities in New Drug Products
 *     (degradation-product reporting/identification/qualification thresholds).
 *   - ICH Q3C(R8) — Impurities: Guideline for Residual Solvents
 *     (Class 1 solvents to avoid; Class 2 PDE-limited; Class 3 low-toxic).
 *   - ICH Q3D(R2) — Guideline for Elemental Impurities
 *     (permitted daily exposures by route of administration; Class 1 elements).
 *   - ICH M7(R2) — Assessment and Control of DNA Reactive (Mutagenic) Impurities
 *     (genotoxic impurities; may impose lower limits than Q3A/Q3B).
 *
 * @module server/services/global-ri/impurities-thresholds
 */

const ICH_Q3A = 'ICH Q3A(R2)';
const ICH_Q3B = 'ICH Q3B(R2)';
const ICH_Q3C = 'ICH Q3C(R8)';
const ICH_Q3D = 'ICH Q3D(R2)';

/** Two grams expressed in milligrams — the Q3A drug-substance MDD split point. */
const TWO_GRAMS_MG = 2000;

/**
 * Honest caveat appended to every output: encoded values are per the cited
 * current ICH guideline and must be confirmed against the in-force revision;
 * thresholds may be lowered by safety/genotoxic (e.g. ICH M7) considerations.
 */
const GUIDELINE_CAVEAT =
  'Values are per the cited current ICH guideline and must be confirmed against the in-force revision; thresholds may be lowered by safety/genotoxic (e.g. ICH M7) considerations.';

/* ------------------------------------------------------------------------- *
 * A) ICH Q3A(R2) — drug-substance impurity thresholds (by MDD)
 * ------------------------------------------------------------------------- */

/** ICH Q3A(R2)/Q3B(R2) impurity thresholds for a given maximum daily dose. */
export interface ImpurityThresholds {
  /** The maximum daily dose used to key the thresholds, in milligrams. */
  maxDailyDoseMg: number;
  /** Reporting threshold. */
  reporting: string;
  /** Identification threshold. */
  identification: string;
  /** Qualification threshold. */
  qualification: string;
  /** Governing citation. */
  citation: string;
  /** Honest caveats. */
  notes: string[];
}

function assertValidDose(maxDailyDoseMg: number): void {
  if (!Number.isFinite(maxDailyDoseMg) || maxDailyDoseMg < 0) {
    throw new Error(
      `Invalid maximum daily dose "${maxDailyDoseMg}" — expected a finite, non-negative number of milligrams.`,
    );
  }
}

/**
 * Get the ICH Q3A(R2) drug-substance impurity thresholds for a maximum daily
 * dose (MDD). The MDD ≤ 2 g/day vs > 2 g/day split is applied at 2000 mg.
 *
 * Pure / deterministic. Throws for a non-finite or negative dose.
 */
export function getDrugSubstanceThresholds(maxDailyDoseMg: number): ImpurityThresholds {
  assertValidDose(maxDailyDoseMg);
  if (maxDailyDoseMg <= TWO_GRAMS_MG) {
    return {
      maxDailyDoseMg,
      reporting: '0.05%',
      identification: '0.10% or 1.0 mg/day intake (whichever is lower)',
      qualification: '0.15% or 1.0 mg/day intake (whichever is lower)',
      citation: ICH_Q3A,
      notes: [
        'Applies to a maximum daily dose ≤ 2 g/day.',
        GUIDELINE_CAVEAT,
      ],
    };
  }
  return {
    maxDailyDoseMg,
    reporting: '0.03%',
    identification: '0.05%',
    qualification: '0.05%',
    citation: ICH_Q3A,
    notes: [
      'Applies to a maximum daily dose > 2 g/day.',
      GUIDELINE_CAVEAT,
    ],
  };
}

/* ------------------------------------------------------------------------- *
 * B) ICH Q3B(R2) — drug-product degradation-product thresholds (by MDD)
 * ------------------------------------------------------------------------- */

/** A tiered band: applies when MDD is in (lowerExclusiveMg, upperInclusiveMg]. */
interface DoseBand {
  /** Lower bound in mg, exclusive (use -Infinity for an open lower bound). */
  lowerExclusiveMg: number;
  /** Upper bound in mg, inclusive (use Infinity for an open upper bound). */
  upperInclusiveMg: number;
  /** The threshold value for the band. */
  value: string;
}

/** Resolve the band whose (lowerExclusive, upperInclusive] range contains the dose. */
function resolveBand(bands: DoseBand[], maxDailyDoseMg: number): string {
  for (const band of bands) {
    if (maxDailyDoseMg > band.lowerExclusiveMg && maxDailyDoseMg <= band.upperInclusiveMg) {
      return band.value;
    }
  }
  // Bands are exhaustive over [0, Infinity]; this is unreachable for a valid dose.
  throw new Error(`No threshold band matched maximum daily dose "${maxDailyDoseMg}".`);
}

// Q3B(R2) reporting thresholds: MDD ≤ 1 g → 0.1%; > 1 g → 0.05%.
const Q3B_REPORTING: DoseBand[] = [
  { lowerExclusiveMg: -Infinity, upperInclusiveMg: 1000, value: '0.1%' },
  { lowerExclusiveMg: 1000, upperInclusiveMg: Infinity, value: '0.05%' },
];

// Q3B(R2) identification thresholds.
const Q3B_IDENTIFICATION: DoseBand[] = [
  { lowerExclusiveMg: -Infinity, upperInclusiveMg: 1, value: '1.0% or 5 µg TDI (whichever is lower)' },
  { lowerExclusiveMg: 1, upperInclusiveMg: 10, value: '0.5% or 20 µg TDI (whichever is lower)' },
  { lowerExclusiveMg: 10, upperInclusiveMg: 2000, value: '0.2% or 2 mg TDI (whichever is lower)' },
  { lowerExclusiveMg: 2000, upperInclusiveMg: Infinity, value: '0.10%' },
];

// Q3B(R2) qualification thresholds.
const Q3B_QUALIFICATION: DoseBand[] = [
  { lowerExclusiveMg: -Infinity, upperInclusiveMg: 10, value: '1.0% or 50 µg TDI (whichever is lower)' },
  { lowerExclusiveMg: 10, upperInclusiveMg: 100, value: '0.5% or 200 µg TDI (whichever is lower)' },
  { lowerExclusiveMg: 100, upperInclusiveMg: 2000, value: '0.2% or 3 mg TDI (whichever is lower)' },
  { lowerExclusiveMg: 2000, upperInclusiveMg: Infinity, value: '0.15%' },
];

/**
 * Get the ICH Q3B(R2) drug-product degradation-product thresholds for a maximum
 * daily dose (MDD), using the tiered reporting/identification/qualification
 * tables. Note: the identification "1 mg" tier is treated as the boundary
 * between the < 1 mg and the 1 mg–10 mg bands (1 mg falls in the 1 mg–10 mg band).
 *
 * Pure / deterministic. Throws for a non-finite or negative dose.
 */
export function getDrugProductThresholds(maxDailyDoseMg: number): ImpurityThresholds {
  assertValidDose(maxDailyDoseMg);
  return {
    maxDailyDoseMg,
    reporting: resolveBand(Q3B_REPORTING, maxDailyDoseMg),
    identification: resolveBand(Q3B_IDENTIFICATION, maxDailyDoseMg),
    qualification: resolveBand(Q3B_QUALIFICATION, maxDailyDoseMg),
    citation: ICH_Q3B,
    notes: [
      'Thresholds are keyed to the maximum daily dose; "TDI" is the total daily intake of the degradation product.',
      'Where a percentage and an absolute (TDI) limit are both given, the lower of the two applies.',
      GUIDELINE_CAVEAT,
    ],
  };
}


/* ------------------------------------------------------------------------- *
 * A2) The SAME bands, resolved to numbers
 *
 * `getDrugSubstanceThresholds` / `getDrugProductThresholds` above return the
 * guideline's own wording ("0.10% or 1.0 mg/day intake (whichever is lower)"),
 * which is right for a citation and useless for a comparison: a caller that
 * wants to know whether an observed 0.08% is above the identification threshold
 * has to parse that sentence, and the obvious parse — take the percentage —
 * over-permits by up to twofold at a maximum daily dose above 1 g, in the
 * direction of NOT reporting an impurity that should be reported.
 *
 * These functions evaluate the "whichever is lower" rule once, here, against the
 * dose. One band table, two views of it: the strings above for the page, the
 * numbers below for the comparison.
 * ------------------------------------------------------------------------- */

/** A threshold with its "whichever is lower" rule already evaluated. */
export interface ResolvedThreshold {
  /** The band's percentage, e.g. 0.10 for 0.10%. */
  percent: number;
  /** The band's absolute daily-intake alternative in mg/day, or null when the band gives none. */
  absoluteMgPerDay: number | null;
  /** Which of the two actually governs at this dose. */
  governing: 'percent' | 'absolute';
  /** The operative limit as a percentage of the dose. */
  effectivePercent: number;
  /** The operative limit as a daily intake in mg/day. */
  effectiveMgPerDay: number;
  /** The guideline's own wording — for display and citation, never parsed. */
  expression: string;
}

function resolveThreshold(
  percent: number,
  absoluteMgPerDay: number | null,
  maxDailyDoseMg: number,
  expression: string,
): ResolvedThreshold {
  if (absoluteMgPerDay === null) {
    return {
      percent,
      absoluteMgPerDay: null,
      governing: 'percent',
      effectivePercent: percent,
      effectiveMgPerDay: (percent / 100) * maxDailyDoseMg,
      expression,
    };
  }
  const absoluteAsPercent = (absoluteMgPerDay / maxDailyDoseMg) * 100;
  // A tie resolves to the percentage: the two are the same number there, and
  // naming the percentage keeps the citation the one a reviewer expects.
  const governing = percent <= absoluteAsPercent ? 'percent' : 'absolute';
  const effectivePercent = Math.min(percent, absoluteAsPercent);
  return {
    percent,
    absoluteMgPerDay,
    governing,
    effectivePercent,
    effectiveMgPerDay: (effectivePercent / 100) * maxDailyDoseMg,
    expression,
  };
}

/** The impurity classes ICH Q3A/Q3B thresholds actually govern. */
export type ImpurityClass =
  | 'organic'
  | 'degradation'
  | 'inorganic'
  | 'residual-solvent'
  | 'elemental'
  | 'mutagenic'
  | 'enantiomeric'
  | 'polymorphic'
  | 'unresolved';

/** Why a threshold could not be resolved for this input. */
export type ThresholdRefusalCode =
  | 'MDD_MISSING'
  | 'MDD_NON_POSITIVE'
  | 'CLASS_OUT_OF_SCOPE'
  | 'CLASS_UNRESOLVED';

export type ResolvedThresholdSet =
  | {
      ok: true;
      matrix: 'drug_substance' | 'drug_product';
      maxDailyDoseMg: number;
      /** True when the dose sits exactly on a band boundary — visible, not branched on. */
      boundaryExact: boolean;
      reporting: ResolvedThreshold;
      identification: ResolvedThreshold;
      qualification: ResolvedThreshold;
      citation: string;
      caveats: string[];
    }
  | { ok: false; code: ThresholdRefusalCode; message: string; routeTo?: string };

/**
 * The classes Q3A/Q3B do NOT set thresholds for, and where each belongs
 * instead. Applying a Q3A percentage to a residual solvent or an elemental
 * impurity would state a limit the guideline does not give, off by orders of
 * magnitude, so those are refused rather than answered.
 */
const OUT_OF_SCOPE_CLASSES: Record<string, string> = {
  'residual-solvent': 'ICH Q3C(R8) residual-solvent classes and PDE limits',
  elemental: 'ICH Q3D(R2) elemental-impurity permitted daily exposures',
  /* Inorganic impurities — salts, catalysts, filter aids, heavy metals — are
     listed in Q3A §2.3 as a category the guideline explicitly does NOT set
     thresholds for: they are addressed by pharmacopoeial procedures, and the
     metals among them by Q3D. Leaving this class out gave a catalyst residue an
     organic-impurity percentage the guideline never wrote, while the
     synonymous 'elemental' next to it was correctly refused. */
  inorganic: 'ICH Q3D(R2) for elemental species, or the pharmacopoeial procedure for the residue — Q3A/Q3B set no threshold for inorganic impurities',
  mutagenic: 'ICH M7(R2) mutagenic-impurity acceptable intakes',
  enantiomeric: 'the enantiomeric purity specification — Q3A excludes it',
  polymorphic: 'the polymorphic form control — Q3A excludes it',
};

/**
 * Q3B governs DEGRADATION products of a drug product. A process-related
 * impurity carried in with the substance is controlled through the drug
 * substance specification and Q3A, not re-thresholded here (Q3B(R2) §1.2
 * excludes it), so the drug-product matrix answers only for degradation.
 */
function outOfProductScope(impurityClass: ImpurityClass): string | null {
  return impurityClass === 'organic'
    ? 'ICH Q3A(R2) and the drug substance specification — Q3B(R2) covers degradation products of the drug product, not process impurities carried in with the substance'
    : null;
}

/**
 * Resolve the ICH Q3A(R2) / Q3B(R2) thresholds for a dose and an impurity
 * class, with "whichever is lower" evaluated and the out-of-scope classes
 * refused.
 *
 * `matrix` selects the guideline: Q3A governs impurities in a new drug
 * SUBSTANCE, Q3B degradation products in a new drug PRODUCT, and the two ladders
 * are different — Q3A has two dose bands, Q3B has several. Crossing them
 * misstates the threshold.
 */
export function resolveImpurityThresholds(input: {
  matrix: 'drug_substance' | 'drug_product';
  maxDailyDoseMg: number | null | undefined;
  impurityClass: ImpurityClass;
}): ResolvedThresholdSet {
  const { matrix, impurityClass } = input;
  if (impurityClass === 'unresolved') {
    return {
      ok: false,
      code: 'CLASS_UNRESOLVED',
      message:
        'The impurity class is not recorded, so no ICH threshold can be applied. Record whether this is an organic impurity, a degradation product, a residual solvent, an elemental impurity or a mutagenic impurity.',
    };
  }
  const routeTo = OUT_OF_SCOPE_CLASSES[impurityClass]
    || (matrix === 'drug_product' ? outOfProductScope(impurityClass) : null);
  if (routeTo) {
    return {
      ok: false,
      code: 'CLASS_OUT_OF_SCOPE',
      message: `ICH ${matrix === 'drug_product' ? 'Q3B(R2)' : 'Q3A(R2)'} does not set thresholds for this impurity class.`,
      routeTo,
    };
  }
  const mdd = input.maxDailyDoseMg;
  if (mdd === null || mdd === undefined || !Number.isFinite(mdd)) {
    return {
      ok: false,
      code: 'MDD_MISSING',
      message:
        'The maximum daily dose is not recorded. Every ICH Q3A/Q3B threshold is keyed to it, so no threshold can be stated for this impurity.',
    };
  }
  if (mdd <= 0) {
    return {
      ok: false,
      code: 'MDD_NON_POSITIVE',
      message: `A maximum daily dose of ${mdd} mg/day cannot key a threshold.`,
    };
  }

  if (matrix === 'drug_substance') {
    /* Q3A(R2) Attachment 1 does NOT split the dose axis the same way for all
       three thresholds, and the difference bites at exactly 2 g/day:
         Reporting        <= 2 g/day  vs  > 2 g/day
         Identification    < 2 g/day  vs  >= 2 g/day
         Qualification     < 2 g/day  vs  >= 2 g/day
       The EFFECTIVE limit happens to agree at the boundary either way, because
       1.0 mg/day at a 2000 mg dose is 0.05% and the "whichever is lower" rule
       picks it. The CITATION does not: reading the identification row as the
       low band at exactly 2 g would print "0.10% or 1.0 mg/day (whichever is
       lower)" where the guideline's own row says 0.05%. Each threshold uses its
       own inequality. */
    const lowReporting = mdd <= TWO_GRAMS_MG;
    const lowIdentification = mdd < TWO_GRAMS_MG;
    return {
      ok: true,
      matrix,
      maxDailyDoseMg: mdd,
      boundaryExact: mdd === TWO_GRAMS_MG,
      reporting: resolveThreshold(lowReporting ? 0.05 : 0.03, null, mdd, lowReporting ? '0.05%' : '0.03%'),
      identification: resolveThreshold(
        lowIdentification ? 0.1 : 0.05,
        lowIdentification ? 1.0 : null,
        mdd,
        lowIdentification ? '0.10% or 1.0 mg/day intake (whichever is lower)' : '0.05%',
      ),
      qualification: resolveThreshold(
        lowIdentification ? 0.15 : 0.05,
        lowIdentification ? 1.0 : null,
        mdd,
        lowIdentification ? '0.15% or 1.0 mg/day intake (whichever is lower)' : '0.05%',
      ),
      citation: `${ICH_Q3A} Attachment 1`,
      caveats: [GUIDELINE_CAVEAT],
    };
  }

  /* Q3B(R2) Attachment 1. The bands below mirror Q3B_REPORTING /
     Q3B_IDENTIFICATION / Q3B_QUALIFICATION above — the same numbers, carrying
     their absolute alternative separately so the min rule can be evaluated. */
  const reporting = mdd <= 1000
    ? resolveThreshold(0.1, null, mdd, '0.1%')
    : resolveThreshold(0.05, null, mdd, '0.05%');
  /* Q3B(R2) Attachment 1 writes its identification and qualification bands with
     STRICT lower bounds — "<1 mg", "1 mg - 10 mg", ">10 mg" and "<10 mg",
     "10 mg - 100 mg", ">100 mg" — so a dose sitting exactly on 1 mg, 10 mg or
     100 mg belongs to the HIGHER band, not the lower one. Reading them as
     inclusive-upper quoted the wrong Attachment 1 row at exactly those doses. */
  const identification =
    mdd < 1
      ? resolveThreshold(1.0, 0.005, mdd, '1.0% or 5 µg TDI (whichever is lower)')
      : mdd <= 10
        ? resolveThreshold(0.5, 0.02, mdd, '0.5% or 20 µg TDI (whichever is lower)')
        : mdd <= 2000
          ? resolveThreshold(0.2, 2.0, mdd, '0.2% or 2 mg TDI (whichever is lower)')
          : resolveThreshold(0.1, null, mdd, '0.10%');
  const qualification =
    mdd < 10
      ? resolveThreshold(1.0, 0.05, mdd, '1.0% or 50 µg TDI (whichever is lower)')
      : mdd <= 100
        ? resolveThreshold(0.5, 0.2, mdd, '0.5% or 200 µg TDI (whichever is lower)')
        : mdd <= 2000
          ? resolveThreshold(0.2, 3.0, mdd, '0.2% or 3 mg TDI (whichever is lower)')
          : resolveThreshold(0.15, null, mdd, '0.15%');
  return {
    ok: true,
    matrix,
    maxDailyDoseMg: mdd,
    boundaryExact: [1, 10, 100, 1000, 2000].includes(mdd),
    reporting,
    identification,
    qualification,
    citation: `${ICH_Q3B} Attachment 1`,
    caveats: [
      '"TDI" is the total daily intake of the degradation product.',
      GUIDELINE_CAVEAT,
    ],
  };
}

/* ------------------------------------------------------------------------- *
 * C) ICH Q3C(R8) — residual solvents (class + limit)
 * ------------------------------------------------------------------------- */

export type ResidualSolventClass = 1 | 2 | 3;

/** A residual solvent with its ICH Q3C class and limits. */
export interface ResidualSolvent {
  /** Solvent name (display form, as Q3C prints it). */
  name: string;
  /** ICH Q3C class: 1 (avoid), 2 (limit by PDE), 3 (low toxic). */
  class: ResidualSolventClass;
  /**
   * Permitted daily exposure in mg/day. Q3C gives this for Class 2; Class 1
   * solvents are limited by concentration alone and Class 3 share the 50 mg/day
   * default, both recorded here so a caller never has to supply a number the
   * table already holds.
   */
  pdeMgPerDay: number | null;
  /**
   * The Option 1 concentration limit in ppm — the number a recorded ppm result
   * is compared against. Held as a NUMBER: a limit that exists only as prose
   * cannot be compared to a measurement, which is why the earlier catalog's
   * `limit: 'PDE 4.1 mg/day (410 ppm)'` string could not assess anything.
   */
  concentrationLimitPpm: number;
  /** Governing citation. */
  citation: string;
}

/**
 * ICH Q3C(R8) residual-solvent catalog.
 *
 * Class 1 solvents should be AVOIDED and carry concentration limits in ppm.
 * Class 2 are limited by their permitted daily exposure; the ppm figure is the
 * Q3C Option 1 concentration limit, computed by the guideline itself as
 * PDE x 1000 / 10 g daily dose. Class 3 are of low toxic potential and share
 * the 50 mg/day (5000 ppm) default.
 *
 * This is the ONE copy. A private second catalog lived in
 * server/services/cmc-quality/cmc-quality-knowledge.ts, disagreed with this one
 * on membership, and — the reason it mattered — answered "5000 ppm (Class 3
 * default)" for anything it did not recognise. A partial catalog with a
 * permissive default is worse than no catalog: benzene misspelt returned a
 * limit 2500x too high with an ICH citation attached.
 */
export const RESIDUAL_SOLVENTS: ResidualSolvent[] = [
  // ── Class 1 — solvents to be avoided (Q3C Table 1) ──
  { name: 'Benzene', class: 1, pdeMgPerDay: null, concentrationLimitPpm: 2, citation: ICH_Q3C },
  { name: 'Carbon tetrachloride', class: 1, pdeMgPerDay: null, concentrationLimitPpm: 4, citation: ICH_Q3C },
  { name: '1,2-Dichloroethane', class: 1, pdeMgPerDay: null, concentrationLimitPpm: 5, citation: ICH_Q3C },
  { name: '1,1-Dichloroethene', class: 1, pdeMgPerDay: null, concentrationLimitPpm: 8, citation: ICH_Q3C },
  { name: '1,1,1-Trichloroethane', class: 1, pdeMgPerDay: null, concentrationLimitPpm: 1500, citation: ICH_Q3C },

  // ── Class 2 — solvents to be limited (Q3C Table 2) ──
  { name: 'Acetonitrile', class: 2, pdeMgPerDay: 4.1, concentrationLimitPpm: 410, citation: ICH_Q3C },
  { name: 'Anisole', class: 2, pdeMgPerDay: 10, concentrationLimitPpm: 1000, citation: ICH_Q3C },
  { name: 'Chlorobenzene', class: 2, pdeMgPerDay: 3.6, concentrationLimitPpm: 360, citation: ICH_Q3C },
  { name: 'Chloroform', class: 2, pdeMgPerDay: 0.6, concentrationLimitPpm: 60, citation: ICH_Q3C },
  { name: 'Cumene', class: 2, pdeMgPerDay: 0.7, concentrationLimitPpm: 70, citation: ICH_Q3C },
  { name: 'Cyclohexane', class: 2, pdeMgPerDay: 38.8, concentrationLimitPpm: 3880, citation: ICH_Q3C },
  { name: 'Cyclopentyl methyl ether', class: 2, pdeMgPerDay: 15, concentrationLimitPpm: 1500, citation: ICH_Q3C },
  { name: '1,2-Dichloroethene', class: 2, pdeMgPerDay: 18.7, concentrationLimitPpm: 1870, citation: ICH_Q3C },
  { name: '1,2-Dimethoxyethane', class: 2, pdeMgPerDay: 1.0, concentrationLimitPpm: 100, citation: ICH_Q3C },
  { name: 'N,N-Dimethylacetamide', class: 2, pdeMgPerDay: 10.9, concentrationLimitPpm: 1090, citation: ICH_Q3C },
  { name: 'N,N-Dimethylformamide', class: 2, pdeMgPerDay: 8.8, concentrationLimitPpm: 880, citation: ICH_Q3C },
  { name: '1,4-Dioxane', class: 2, pdeMgPerDay: 3.8, concentrationLimitPpm: 380, citation: ICH_Q3C },
  { name: '2-Ethoxyethanol', class: 2, pdeMgPerDay: 1.6, concentrationLimitPpm: 160, citation: ICH_Q3C },
  { name: 'Ethyleneglycol', class: 2, pdeMgPerDay: 6.2, concentrationLimitPpm: 620, citation: ICH_Q3C },
  { name: 'Formamide', class: 2, pdeMgPerDay: 2.2, concentrationLimitPpm: 220, citation: ICH_Q3C },
  { name: 'Hexane', class: 2, pdeMgPerDay: 2.9, concentrationLimitPpm: 290, citation: ICH_Q3C },
  { name: 'Methanol', class: 2, pdeMgPerDay: 30, concentrationLimitPpm: 3000, citation: ICH_Q3C },
  { name: '2-Methoxyethanol', class: 2, pdeMgPerDay: 0.5, concentrationLimitPpm: 50, citation: ICH_Q3C },
  { name: 'Methylbutyl ketone', class: 2, pdeMgPerDay: 0.5, concentrationLimitPpm: 50, citation: ICH_Q3C },
  { name: 'Methylcyclohexane', class: 2, pdeMgPerDay: 11.8, concentrationLimitPpm: 1180, citation: ICH_Q3C },
  { name: 'Methyl isobutyl ketone', class: 2, pdeMgPerDay: 45, concentrationLimitPpm: 4500, citation: ICH_Q3C },
  { name: 'Methylene chloride', class: 2, pdeMgPerDay: 6.0, concentrationLimitPpm: 600, citation: ICH_Q3C },
  { name: '2-Methyltetrahydrofuran', class: 2, pdeMgPerDay: 5.0, concentrationLimitPpm: 500, citation: ICH_Q3C },
  { name: 'N-Methylpyrrolidone', class: 2, pdeMgPerDay: 5.3, concentrationLimitPpm: 530, citation: ICH_Q3C },
  { name: 'Nitromethane', class: 2, pdeMgPerDay: 0.5, concentrationLimitPpm: 50, citation: ICH_Q3C },
  { name: 'Pyridine', class: 2, pdeMgPerDay: 2.0, concentrationLimitPpm: 200, citation: ICH_Q3C },
  { name: 'Sulfolane', class: 2, pdeMgPerDay: 1.6, concentrationLimitPpm: 160, citation: ICH_Q3C },
  { name: 'Tetrahydrofuran', class: 2, pdeMgPerDay: 7.2, concentrationLimitPpm: 720, citation: ICH_Q3C },
  { name: 'Tetralin', class: 2, pdeMgPerDay: 1.0, concentrationLimitPpm: 100, citation: ICH_Q3C },
  { name: 'Toluene', class: 2, pdeMgPerDay: 8.9, concentrationLimitPpm: 890, citation: ICH_Q3C },
  { name: 'Trichloroethylene', class: 2, pdeMgPerDay: 0.8, concentrationLimitPpm: 80, citation: ICH_Q3C },
  { name: 'Xylene', class: 2, pdeMgPerDay: 21.7, concentrationLimitPpm: 2170, citation: ICH_Q3C },

  // ── Class 3 — low toxic potential; 50 mg/day (5000 ppm) unless justified higher (Q3C Table 3) ──
  { name: 'Acetic acid', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Acetone', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Anisole (Class 3 listing)', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '1-Butanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '2-Butanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Butyl acetate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'tert-Butylmethyl ether', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Dimethyl sulfoxide', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Ethanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Ethyl acetate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Ethyl ether', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Ethyl formate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Formic acid', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Heptane', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Isobutyl acetate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Isopropyl acetate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Methyl acetate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '3-Methyl-1-butanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Methyl ethyl ketone', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Methylisopropyl ketone', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '2-Methyl-1-propanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Pentane', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '1-Pentanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '1-Propanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: '2-Propanol', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Propyl acetate', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
  { name: 'Triethylamine', class: 3, pdeMgPerDay: 50, concentrationLimitPpm: 5000, citation: ICH_Q3C },
];

/**
 * The names a staffer actually types, mapped to the guideline's own spelling.
 * Trade abbreviations (IPA, DMSO, THF) and the two names Q3C gives the same
 * solvent (dichloromethane / methylene chloride) resolve to one entry each.
 */
const RESIDUAL_SOLVENT_ALIASES: Record<string, string> = {
  'isopropanol': '2-Propanol',
  'iso-propanol': '2-Propanol',
  'isopropyl alcohol': '2-Propanol',
  'ipa': '2-Propanol',
  'n-hexane': 'Hexane',
  'n-heptane': 'Heptane',
  'n-pentane': 'Pentane',
  'n-butanol': '1-Butanol',
  'n-propanol': '1-Propanol',
  'dmso': 'Dimethyl sulfoxide',
  'dmf': 'N,N-Dimethylformamide',
  'dma': 'N,N-Dimethylacetamide',
  'nmp': 'N-Methylpyrrolidone',
  'thf': 'Tetrahydrofuran',
  '2-metthf': '2-Methyltetrahydrofuran',
  '2-methf': '2-Methyltetrahydrofuran',
  'me-thf': '2-Methyltetrahydrofuran',
  'mek': 'Methyl ethyl ketone',
  'mibk': 'Methyl isobutyl ketone',
  'mtbe': 'tert-Butylmethyl ether',
  'tbme': 'tert-Butylmethyl ether',
  'methyl tert-butyl ether': 'tert-Butylmethyl ether',
  'dcm': 'Methylene chloride',
  'dichloromethane': 'Methylene chloride',
  'cpme': 'Cyclopentyl methyl ether',
  'dme': '1,2-Dimethoxyethane',
  'etoac': 'Ethyl acetate',
  'etoh': 'Ethanol',
  'meoh': 'Methanol',
  'acn': 'Acetonitrile',
  'mecn': 'Acetonitrile',
  'tea': 'Triethylamine',
  'diethyl ether': 'Ethyl ether',
};

const RESIDUAL_SOLVENT_BY_NAME: Record<string, ResidualSolvent> = (() => {
  const map: Record<string, ResidualSolvent> = {};
  for (const solvent of RESIDUAL_SOLVENTS) {
    map[solvent.name.toLowerCase()] = solvent;
  }
  /* Anisole appears in Q3C's Class 2 table and again in its Class 3 list; the
     Class 2 limit is the binding one, so the bare name resolves there and the
     Class 3 listing is carried under its own explicit key. */
  for (const [alias, canonical] of Object.entries(RESIDUAL_SOLVENT_ALIASES)) {
    const target = map[canonical.toLowerCase()];
    if (target) map[alias] = target;
  }
  return map;
})();

/**
 * Look up an ICH Q3C(R8) residual solvent by name or common abbreviation.
 * Case-insensitive, whitespace-tolerant, deterministic.
 *
 * Returns NULL when the solvent is not in the catalog. It does not guess: the
 * previous private copy answered Class 3 / 5000 ppm for an unknown name, which
 * is the most permissive band in the guideline, so an unrecognised Class 1
 * solvent was reported as one of the safest.
 */
export function getResidualSolvent(name: string): ResidualSolvent | null {
  if (typeof name !== 'string') return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return RESIDUAL_SOLVENT_BY_NAME[key] ?? null;
}

export type ResidualSolventDisposition = 'within-limit' | 'above-limit' | 'class-1-avoid';

export type ResidualSolventAssessment =
  | {
      ok: true;
      solventName: string;
      solventClass: ResidualSolventClass;
      /** The Option 1 concentration limit the result was compared against. */
      limitPpm: number;
      pdeMgPerDay: number | null;
      observedPpm: number;
      withinLimit: boolean;
      disposition: ResidualSolventDisposition;
      citation: string;
    }
  | {
      ok: false;
      code: 'SOLVENT_NOT_RECORDED' | 'SOLVENT_NOT_IN_CATALOG' | 'LEVEL_NOT_RECORDED';
      message: string;
    };

/**
 * Compare a recorded residual-solvent level (ppm) against ICH Q3C(R8).
 *
 * Refuses rather than guessing in all three ways a record can be short: no
 * solvent named, a solvent outside the catalog, or no numeric level. A refusal
 * names what is missing, so the section can say why the impurity is not
 * assessed instead of printing a threshold nobody derived.
 */
export function assessResidualSolvent(input: {
  solventName: string | null | undefined;
  observedPpm: number;
}): ResidualSolventAssessment {
  const name = String(input.solventName ?? '').trim();
  if (!name) {
    return {
      ok: false,
      code: 'SOLVENT_NOT_RECORDED',
      message: 'No solvent is named, so no ICH Q3C class or limit applies to this record.',
    };
  }
  const solvent = getResidualSolvent(name);
  if (!solvent) {
    return {
      ok: false,
      code: 'SOLVENT_NOT_IN_CATALOG',
      message:
        `"${name}" is not in the ICH Q3C(R8) catalog, so its class and limit are not established. ` +
        `Q3C requires a solvent outside its tables to be justified on its own toxicological data — ` +
        `record the solvent under its guideline name, or supply the justified limit.`,
    };
  }
  if (!Number.isFinite(input.observedPpm)) {
    return {
      ok: false,
      code: 'LEVEL_NOT_RECORDED',
      message: `A level in ppm is not recorded for ${solvent.name}, so it cannot be compared to its ${solvent.concentrationLimitPpm} ppm limit.`,
    };
  }
  const withinLimit = input.observedPpm <= solvent.concentrationLimitPpm;
  return {
    ok: true,
    solventName: solvent.name,
    solventClass: solvent.class,
    limitPpm: solvent.concentrationLimitPpm,
    pdeMgPerDay: solvent.pdeMgPerDay,
    observedPpm: input.observedPpm,
    withinLimit,
    /* A Class 1 solvent is not "within limit" in the sense the other classes
       are: Q3C says it should not be used, and a level below the concentration
       limit still requires justification for its presence at all. */
    disposition: solvent.class === 1 ? 'class-1-avoid' : withinLimit ? 'within-limit' : 'above-limit',
    citation: solvent.citation,
  };
}

/* ------------------------------------------------------------------------- *
 * D) ICH Q3D(R2) — Class 1 elemental-impurity PDEs by route
 * ------------------------------------------------------------------------- */

export type AdministrationRoute = 'oral' | 'parenteral' | 'inhalation';

/** A Class 1 elemental impurity with per-route permitted daily exposures (µg/day). */
export interface ElementalImpurity {
  /** Element symbol (e.g. 'Pb'). */
  symbol: string;
  /** Element name (e.g. 'Lead'). */
  name: string;
  /** ICH Q3D class designation. */
  class: string;
  /** Permitted daily exposure (µg/day) keyed by route of administration. */
  pdeMicrogramsPerDay: Record<AdministrationRoute, number>;
  /** Governing citation. */
  citation: string;
}

/**
 * ICH Q3D(R2) Class 1 elemental-impurity catalog. Class 1 elements (Pb, As, Cd,
 * Hg) are human toxicants with limited or no use in pharmaceutical manufacture;
 * their presence must be evaluated for all routes. PDEs are in µg/day.
 */
export const ELEMENTAL_IMPURITIES: ElementalImpurity[] = [
  // ── Class 1 — human toxicants, evaluate for all routes (Q3D Table A.2.1) ──
  { symbol: 'Pb', name: 'Lead', class: 'Class 1', pdeMicrogramsPerDay: { oral: 5, parenteral: 5, inhalation: 5 }, citation: ICH_Q3D },
  { symbol: 'As', name: 'Arsenic', class: 'Class 1', pdeMicrogramsPerDay: { oral: 15, parenteral: 15, inhalation: 2 }, citation: ICH_Q3D },
  { symbol: 'Cd', name: 'Cadmium', class: 'Class 1', pdeMicrogramsPerDay: { oral: 5, parenteral: 2, inhalation: 3 }, citation: ICH_Q3D },
  { symbol: 'Hg', name: 'Mercury', class: 'Class 1', pdeMicrogramsPerDay: { oral: 30, parenteral: 3, inhalation: 1 }, citation: ICH_Q3D },

  // ── Class 2A — route-independent human toxicants, high probability of
  //    occurrence; evaluate for all routes (Q3D Table A.2.1) ──
  { symbol: 'Co', name: 'Cobalt', class: 'Class 2A', pdeMicrogramsPerDay: { oral: 50, parenteral: 5, inhalation: 3 }, citation: ICH_Q3D },
  { symbol: 'V', name: 'Vanadium', class: 'Class 2A', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Ni', name: 'Nickel', class: 'Class 2A', pdeMicrogramsPerDay: { oral: 200, parenteral: 20, inhalation: 5 }, citation: ICH_Q3D },

  // ── Class 2B — lower probability of occurrence; evaluated only when
  //    intentionally added (Q3D §4.2), so a record naming one is exactly the
  //    case that must be assessed ──
  { symbol: 'Tl', name: 'Thallium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 8, parenteral: 8, inhalation: 8 }, citation: ICH_Q3D },
  { symbol: 'Au', name: 'Gold', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 100, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Pd', name: 'Palladium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Ir', name: 'Iridium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Os', name: 'Osmium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Rh', name: 'Rhodium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Ru', name: 'Ruthenium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },
  { symbol: 'Se', name: 'Selenium', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 150, parenteral: 80, inhalation: 130 }, citation: ICH_Q3D },
  { symbol: 'Ag', name: 'Silver', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 150, parenteral: 15, inhalation: 7 }, citation: ICH_Q3D },
  { symbol: 'Pt', name: 'Platinum', class: 'Class 2B', pdeMicrogramsPerDay: { oral: 100, parenteral: 10, inhalation: 1 }, citation: ICH_Q3D },

  // ── Class 3 — relatively low oral toxicity; evaluated for parenteral and
  //    inhalation routes when the PDE is below 500 µg/day (Q3D §4.3) ──
  { symbol: 'Li', name: 'Lithium', class: 'Class 3', pdeMicrogramsPerDay: { oral: 550, parenteral: 250, inhalation: 25 }, citation: ICH_Q3D },
  { symbol: 'Sb', name: 'Antimony', class: 'Class 3', pdeMicrogramsPerDay: { oral: 1200, parenteral: 90, inhalation: 20 }, citation: ICH_Q3D },
  { symbol: 'Ba', name: 'Barium', class: 'Class 3', pdeMicrogramsPerDay: { oral: 1400, parenteral: 700, inhalation: 300 }, citation: ICH_Q3D },
  { symbol: 'Mo', name: 'Molybdenum', class: 'Class 3', pdeMicrogramsPerDay: { oral: 3000, parenteral: 1500, inhalation: 10 }, citation: ICH_Q3D },
  { symbol: 'Cu', name: 'Copper', class: 'Class 3', pdeMicrogramsPerDay: { oral: 3000, parenteral: 300, inhalation: 30 }, citation: ICH_Q3D },
  { symbol: 'Sn', name: 'Tin', class: 'Class 3', pdeMicrogramsPerDay: { oral: 6000, parenteral: 600, inhalation: 60 }, citation: ICH_Q3D },
  { symbol: 'Cr', name: 'Chromium', class: 'Class 3', pdeMicrogramsPerDay: { oral: 11000, parenteral: 1100, inhalation: 3 }, citation: ICH_Q3D },
];

// Case-insensitive lookup keyed on symbol and name.
const ELEMENTAL_IMPURITY_BY_KEY: Record<string, ElementalImpurity> = (() => {
  const map: Record<string, ElementalImpurity> = {};
  for (const element of ELEMENTAL_IMPURITIES) {
    map[element.symbol.toLowerCase()] = element;
    map[element.name.toLowerCase()] = element;
  }
  return map;
})();

const ROUTES: AdministrationRoute[] = ['oral', 'parenteral', 'inhalation'];

/** The resolved PDE for one elemental impurity at one route of administration. */
export interface ElementalImpurityPDE {
  /** Element symbol (canonical form, e.g. 'Pb'). */
  element: string;
  /** Route of administration. */
  route: AdministrationRoute;
  /** Permitted daily exposure in µg/day. */
  pdeMicrogramsPerDay: number;
  /** ICH Q3D class designation. */
  class: string;
  /** Honest caveat. */
  caveat: string;
  /** Governing citation. */
  citation: string;
}

/**
 * Get the ICH Q3D(R2) permitted daily exposure (µg/day) for a Class 1 elemental
 * impurity at a route of administration. Element is matched case-insensitively
 * by symbol or name. Pure / deterministic. Returns null when the element is not
 * in the modeled Class 1 catalog. Throws for an unmodeled route.
 */
export function getElementalImpurityPDE(
  element: string,
  route: AdministrationRoute,
): ElementalImpurityPDE | null {
  if (!ROUTES.includes(route)) {
    throw new Error(`Unmodeled route of administration "${route}" — expected oral, parenteral, or inhalation.`);
  }
  if (typeof element !== 'string') return null;
  const match = ELEMENTAL_IMPURITY_BY_KEY[element.trim().toLowerCase()];
  if (!match) return null;
  return {
    element: match.symbol,
    route,
    pdeMicrogramsPerDay: match.pdeMicrogramsPerDay[route],
    class: match.class,
    caveat: GUIDELINE_CAVEAT,
    citation: match.citation,
  };
}

export type ElementalImpurityAssessment =
  | {
      ok: true;
      element: string;
      elementName: string;
      elementClass: string;
      route: AdministrationRoute;
      pdeMicrogramsPerDay: number;
      observedMicrogramsPerDay: number;
      withinLimit: boolean;
      citation: string;
    }
  | {
      ok: false;
      code: 'ELEMENT_NOT_RECORDED' | 'ELEMENT_NOT_IN_CATALOG' | 'ROUTE_NOT_RECORDED' | 'LEVEL_NOT_RECORDED';
      message: string;
    };

/**
 * Compare a recorded elemental-impurity exposure (µg/day) against ICH Q3D(R2).
 *
 * The route of administration is REQUIRED and is never defaulted. Q3D sets a
 * different PDE per route and the differences are large — cadmium is 5 µg/day
 * oral against 2 parenteral, cobalt 50 against 5, vanadium 100 against 1 by
 * inhalation. Assuming oral, as the private copy of this table did, is assuming
 * the most permissive answer for most elements, which is the wrong direction to
 * guess in and not a guess the record supports.
 */
export function assessElementalImpurity(input: {
  element: string | null | undefined;
  observedMicrogramsPerDay: number;
  route: AdministrationRoute | null | undefined;
}): ElementalImpurityAssessment {
  const symbol = String(input.element ?? '').trim();
  if (!symbol) {
    return {
      ok: false,
      code: 'ELEMENT_NOT_RECORDED',
      message: 'No element is named, so no ICH Q3D permitted daily exposure applies to this record.',
    };
  }
  const element = ELEMENTAL_IMPURITY_BY_KEY[symbol.toLowerCase()];
  if (!element) {
    return {
      ok: false,
      code: 'ELEMENT_NOT_IN_CATALOG',
      message:
        `"${symbol}" is not in the ICH Q3D(R2) catalog, so its permitted daily exposure is not established. ` +
        `Q3D covers the elements in its Table A.2.1; anything outside it needs a PDE derived and justified on its own data.`,
    };
  }
  if (!input.route || !ROUTES.includes(input.route)) {
    return {
      ok: false,
      code: 'ROUTE_NOT_RECORDED',
      message:
        `The route of administration is not recorded, so no ICH Q3D permitted daily exposure can be selected for ${element.name}. ` +
        `Q3D sets a different limit per route — ${element.name} is ${element.pdeMicrogramsPerDay.oral} µg/day oral, ` +
        `${element.pdeMicrogramsPerDay.parenteral} parenteral and ${element.pdeMicrogramsPerDay.inhalation} by inhalation — ` +
        `and defaulting to oral would take the most permissive of the three.`,
    };
  }
  if (!Number.isFinite(input.observedMicrogramsPerDay)) {
    return {
      ok: false,
      code: 'LEVEL_NOT_RECORDED',
      message: `A daily exposure in µg/day is not recorded for ${element.name}, so it cannot be compared to its PDE.`,
    };
  }
  const pde = element.pdeMicrogramsPerDay[input.route];
  return {
    ok: true,
    element: element.symbol,
    elementName: element.name,
    elementClass: element.class,
    route: input.route,
    pdeMicrogramsPerDay: pde,
    observedMicrogramsPerDay: input.observedMicrogramsPerDay,
    withinLimit: input.observedMicrogramsPerDay <= pde,
    citation: element.citation,
  };
}
