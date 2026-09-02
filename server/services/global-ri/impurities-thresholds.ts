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

/** A residual solvent with its ICH Q3C class and limit. */
export interface ResidualSolvent {
  /** Solvent name (display form). */
  name: string;
  /** ICH Q3C class: 1 (avoid), 2 (limit by PDE), 3 (low toxic). */
  class: ResidualSolventClass;
  /** The concentration limit (or PDE/concentration) for the solvent. */
  limit: string;
  /** Governing citation. */
  citation: string;
}

/**
 * ICH Q3C(R8) residual-solvent catalog. Class 1 solvents should be avoided;
 * Class 2 are limited by their permitted daily exposure (PDE); Class 3 are of
 * low toxic potential (limit ≤ 50 mg/day / 5000 ppm by the option-1 default).
 */
export const RESIDUAL_SOLVENTS: ResidualSolvent[] = [
  // Class 1 — solvents to be avoided.
  { name: 'Benzene', class: 1, limit: '2 ppm', citation: ICH_Q3C },
  { name: 'Carbon tetrachloride', class: 1, limit: '4 ppm', citation: ICH_Q3C },
  { name: '1,2-Dichloroethane', class: 1, limit: '5 ppm', citation: ICH_Q3C },
  { name: '1,1-Dichloroethene', class: 1, limit: '8 ppm', citation: ICH_Q3C },
  { name: '1,1,1-Trichloroethane', class: 1, limit: '1500 ppm', citation: ICH_Q3C },
  // Class 2 — solvents to be limited (PDE / concentration limit, option 1).
  { name: 'Acetonitrile', class: 2, limit: 'PDE 4.1 mg/day (410 ppm)', citation: ICH_Q3C },
  { name: 'Methanol', class: 2, limit: 'PDE 30 mg/day (3000 ppm)', citation: ICH_Q3C },
  { name: 'Methylene chloride', class: 2, limit: 'PDE 6.0 mg/day (600 ppm)', citation: ICH_Q3C },
  { name: 'Toluene', class: 2, limit: 'PDE 8.9 mg/day (890 ppm)', citation: ICH_Q3C },
  { name: 'n-Hexane', class: 2, limit: 'PDE 2.9 mg/day (290 ppm)', citation: ICH_Q3C },
  // Class 3 — solvents of low toxic potential (≤ 50 mg/day / 5000 ppm).
  { name: 'Ethanol', class: 3, limit: '≤ 50 mg/day (5000 ppm)', citation: ICH_Q3C },
  { name: 'Acetone', class: 3, limit: '≤ 50 mg/day (5000 ppm)', citation: ICH_Q3C },
  { name: 'Ethyl acetate', class: 3, limit: '≤ 50 mg/day (5000 ppm)', citation: ICH_Q3C },
  { name: '2-Propanol (isopropanol)', class: 3, limit: '≤ 50 mg/day (5000 ppm)', citation: ICH_Q3C },
  { name: '1-Butanol', class: 3, limit: '≤ 50 mg/day (5000 ppm)', citation: ICH_Q3C },
];

// Case-insensitive lookup keyed on the lower-cased display name plus a few aliases.
const RESIDUAL_SOLVENT_BY_NAME: Record<string, ResidualSolvent> = (() => {
  const map: Record<string, ResidualSolvent> = {};
  for (const solvent of RESIDUAL_SOLVENTS) {
    map[solvent.name.toLowerCase()] = solvent;
  }
  // Common aliases.
  map['isopropanol'] = map['2-propanol (isopropanol)'];
  map['2-propanol'] = map['2-propanol (isopropanol)'];
  map['isopropyl alcohol'] = map['2-propanol (isopropanol)'];
  map['dichloromethane'] = map['methylene chloride'];
  map['hexane'] = map['n-hexane'];
  return map;
})();

/**
 * Look up an ICH Q3C(R8) residual solvent by name (case-insensitive; a few
 * common aliases are supported). Pure / deterministic. Returns null when the
 * solvent is not in the modeled catalog.
 */
export function getResidualSolvent(name: string): ResidualSolvent | null {
  if (typeof name !== 'string') return null;
  return RESIDUAL_SOLVENT_BY_NAME[name.trim().toLowerCase()] ?? null;
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
  { symbol: 'Pb', name: 'Lead', class: 'Class 1', pdeMicrogramsPerDay: { oral: 5, parenteral: 5, inhalation: 5 }, citation: ICH_Q3D },
  { symbol: 'As', name: 'Arsenic', class: 'Class 1', pdeMicrogramsPerDay: { oral: 15, parenteral: 15, inhalation: 2 }, citation: ICH_Q3D },
  { symbol: 'Cd', name: 'Cadmium', class: 'Class 1', pdeMicrogramsPerDay: { oral: 5, parenteral: 2, inhalation: 3 }, citation: ICH_Q3D },
  { symbol: 'Hg', name: 'Mercury', class: 'Class 1', pdeMicrogramsPerDay: { oral: 30, parenteral: 3, inhalation: 1 }, citation: ICH_Q3D },
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
