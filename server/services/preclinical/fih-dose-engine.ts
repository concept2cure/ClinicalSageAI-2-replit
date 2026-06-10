/**
 * @fileoverview First-in-human (FIH) dose-justification engine.
 * @module server/services/preclinical/fih-dose-engine
 *
 * Computes a defensible starting dose for a first-in-human trial from the
 * nonclinical package, showing BOTH standard derivations side by side:
 *
 *   1. NOAEL → HED → safety factor → MRSD
 *      Per FDA Guidance (2005) "Estimating the Maximum Safe Starting Dose
 *      in Initial Clinical Trials for Therapeutics in Adult Healthy
 *      Volunteers". HED is scaled by body-surface-area using the Km factors
 *      from Table 1 of that guidance. The MRSD is taken from the most
 *      appropriate (by default, the most sensitive — lowest HED) species,
 *      divided by a safety factor (default 10).
 *
 *   2. MABEL (Minimum Anticipated Biological Effect Level)
 *      Per EMA "Strategies to identify and mitigate risks for FIH and early
 *      clinical trials" (EMEA/CHMP/SWP/28367/07 Rev.1). Derived from the
 *      pharmacologically active exposure (e.g. the concentration achieving a
 *      target low receptor occupancy) converted to a dose via a linear
 *      dose↔exposure factor, with its own MABEL safety factor.
 *
 * For high-risk molecules (agonists, immunomodulators, novel targets) the
 * recommended starting dose is the LOWER (more conservative) of MRSD and
 * MABEL. This module returns both, flags which is limiting, and exposes every
 * intermediate number so the derivation is fully auditable.
 *
 * This is a pure module — no database, no network — so it is trivially
 * testable and callable by ANA (via an action) or by the M2.4 builder.
 *
 * @compliance FDA MRSD Guidance (2005); ICH M3(R2) §1.1; EMA MABEL guidance.
 */

// ── Km factors (FDA 2005 MRSD Guidance, Table 1) ─────────────────────────────
// Km = body weight (kg) / body surface area (m²). HED scales by the ratio of
// animal Km to human Km. Keys are normalized lowercase species names.

export const HUMAN_KM = 37; // 60 kg adult
export const HUMAN_REFERENCE_WEIGHT_KG = 60;

const KM_FACTORS: Record<string, number> = {
  human: 37,
  'human child': 25,
  mouse: 3,
  hamster: 5,
  rat: 6,
  ferret: 7,
  'guinea pig': 8,
  rabbit: 12,
  dog: 20,
  monkey: 12,
  'cynomolgus monkey': 12,
  'rhesus monkey': 12,
  primate: 12,
  marmoset: 6,
  'squirrel monkey': 7,
  baboon: 20,
  'micro-pig': 27,
  'mini-pig': 35,
  minipig: 35,
};

/**
 * Resolve a Km factor for a species name. Tolerant of strain prefixes and
 * casing (e.g. "Sprague-Dawley Rat" → rat). Returns null when unknown so the
 * caller can fail loudly rather than silently mis-scale a dose.
 */
export function kmForSpecies(species: string | null | undefined): number | null {
  if (!species) return null;
  const s = species.trim().toLowerCase();
  if (KM_FACTORS[s] != null) return KM_FACTORS[s];
  // Substring match on the canonical keys (longest first for specificity).
  const keys = Object.keys(KM_FACTORS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (s.includes(key)) return KM_FACTORS[key];
  }
  // Common synonyms.
  if (/\bnhp\b|non-?human primate|macaque|cyno/.test(s)) return 12;
  if (/\bbeagle\b/.test(s)) return 20;
  if (/\bswine\b|\bpig\b/.test(s)) return 35;
  return null;
}

/**
 * Parse a NOAEL expressed as a dose in mg/kg/day (or mg/kg). Returns null when
 * the value is absent or not expressed per body weight (the engine refuses to
 * guess a mg→mg/kg conversion).
 */
export function parseDoseMgPerKg(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/([\d.]+)\s*mg\s*\/\s*kg/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpeciesNoael {
  /** Species name (used to resolve the Km factor). */
  species: string;
  /** NOAEL in mg/kg/day. */
  noaelMgPerKg: number;
  /** Optional study reference for provenance (e.g. "13-week rat, study TX-002"). */
  studyRef?: string;
  /**
   * Optional explicit Km override. When omitted the engine resolves it from
   * the species name via {@link kmForSpecies}.
   */
  km?: number;
}

export interface MabelInput {
  /**
   * Minimum anticipated effective exposure — the pharmacologically active
   * concentration to target at the starting dose (e.g. the concentration
   * giving ~10% receptor occupancy), in the same unit as
   * {@link exposurePerMgDose}'s denominator.
   */
  minAnticipatedEffectiveExposure: number;
  /**
   * Linear dose→exposure factor: the exposure produced per 1 mg of total dose
   * (e.g. Cmax in ng/mL per mg, or AUC per mg). MABEL dose (mg) =
   * minAnticipatedEffectiveExposure / exposurePerMgDose.
   */
  exposurePerMgDose: number;
  /** Additional MABEL safety factor applied on top (default 1 = none). */
  mabelSafetyFactor?: number;
  /** Free-text basis for audit (e.g. "10% RO from in vitro Kd + human popPK"). */
  basis?: string;
}

export interface HedResult {
  species: string;
  studyRef?: string;
  noaelMgPerKg: number;
  km: number;
  /** Human equivalent dose in mg/kg. */
  hedMgPerKg: number;
}

export interface MrsdResult {
  /** HED of every species considered, sorted ascending (most sensitive first). */
  hedBySpecies: HedResult[];
  /** The species selected to carry the MRSD (default: lowest HED). */
  selectedSpecies: string;
  selectedHedMgPerKg: number;
  safetyFactor: number;
  safetyFactorRationale: string;
  mrsdMgPerKg: number;
  /** MRSD as a total dose for the human reference weight. */
  mrsdTotalMg: number;
  humanReferenceWeightKg: number;
}

export interface MabelResult {
  mabelDoseMg: number;
  mabelSafetyFactor: number;
  basis: string;
  minAnticipatedEffectiveExposure: number;
  exposurePerMgDose: number;
}

export type LimitingApproach = 'MRSD' | 'MABEL';

export interface FihDoseResult {
  mrsd: MrsdResult;
  mabel: MabelResult | null;
  /** Recommended starting dose (mg, total) — the more conservative derivation. */
  recommendedStartingDoseMg: number;
  limitedBy: LimitingApproach;
  rationale: string;
  /** Non-fatal advisories (e.g. species without a resolvable Km were skipped). */
  warnings: string[];
}

export interface FihDoseInput {
  /** One NOAEL per relevant species. At least one is required. */
  speciesNoaels: SpeciesNoael[];
  /** Safety factor applied to the selected HED. Default 10 (FDA 2005). */
  safetyFactor?: number;
  /** Justification for any deviation from the default safety factor. */
  safetyFactorRationale?: string;
  /**
   * Force a specific species to carry the MRSD (by name). Default behaviour is
   * to use the most sensitive (lowest HED) species per FDA 2005.
   */
  mostAppropriateSpecies?: string;
  /** Human reference body weight (kg). Default 60. */
  humanReferenceWeightKg?: number;
  /** Optional MABEL derivation; when provided it competes with the MRSD. */
  mabel?: MabelInput;
}

// ── Core math ────────────────────────────────────────────────────────────────

/** HED (mg/kg) = animal NOAEL (mg/kg) × (animal Km / human Km). */
export function computeHED(noaelMgPerKg: number, animalKm: number): number {
  return noaelMgPerKg * (animalKm / HUMAN_KM);
}

function round(value: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/**
 * Compute the FIH starting dose, returning both the MRSD and MABEL derivations
 * with every intermediate number exposed.
 *
 * @throws if no species NOAEL resolves to a usable HED.
 */
export function computeFirstInHumanDose(input: FihDoseInput): FihDoseResult {
  const warnings: string[] = [];
  const humanWeight = input.humanReferenceWeightKg ?? HUMAN_REFERENCE_WEIGHT_KG;

  if (!Array.isArray(input.speciesNoaels) || input.speciesNoaels.length === 0) {
    throw new Error('computeFirstInHumanDose: at least one species NOAEL is required');
  }

  const hedBySpecies: HedResult[] = [];
  for (const s of input.speciesNoaels) {
    const km = s.km ?? kmForSpecies(s.species);
    if (km == null) {
      warnings.push(`Skipped "${s.species}" — no Km factor could be resolved; supply km explicitly.`);
      continue;
    }
    if (!(s.noaelMgPerKg >= 0) || !Number.isFinite(s.noaelMgPerKg)) {
      warnings.push(`Skipped "${s.species}" — NOAEL is not a finite non-negative number.`);
      continue;
    }
    hedBySpecies.push({
      species: s.species,
      studyRef: s.studyRef,
      noaelMgPerKg: s.noaelMgPerKg,
      km,
      hedMgPerKg: round(computeHED(s.noaelMgPerKg, km)),
    });
  }

  if (hedBySpecies.length === 0) {
    throw new Error('computeFirstInHumanDose: no species produced a usable HED');
  }

  // Most sensitive first.
  hedBySpecies.sort((a, b) => a.hedMgPerKg - b.hedMgPerKg);

  // Select the species that carries the MRSD.
  let selected = hedBySpecies[0];
  if (input.mostAppropriateSpecies) {
    const forced = hedBySpecies.find(
      h => h.species.toLowerCase() === input.mostAppropriateSpecies!.toLowerCase(),
    );
    if (forced) {
      selected = forced;
    } else {
      warnings.push(
        `Requested most-appropriate species "${input.mostAppropriateSpecies}" not found; using most sensitive (${selected.species}).`,
      );
    }
  }

  const safetyFactor = input.safetyFactor ?? 10;
  if (!(safetyFactor > 0)) {
    throw new Error('computeFirstInHumanDose: safetyFactor must be > 0');
  }
  const safetyFactorRationale =
    input.safetyFactorRationale ??
    (safetyFactor === 10
      ? 'Default safety factor of 10 per FDA 2005 MRSD guidance.'
      : `Safety factor of ${safetyFactor} (deviation from default 10).`);

  const mrsdMgPerKg = round(selected.hedMgPerKg / safetyFactor);
  const mrsdTotalMg = round(mrsdMgPerKg * humanWeight, 3);

  const mrsd: MrsdResult = {
    hedBySpecies,
    selectedSpecies: selected.species,
    selectedHedMgPerKg: selected.hedMgPerKg,
    safetyFactor,
    safetyFactorRationale,
    mrsdMgPerKg,
    mrsdTotalMg,
    humanReferenceWeightKg: humanWeight,
  };

  // MABEL derivation (optional).
  let mabel: MabelResult | null = null;
  if (input.mabel) {
    const m = input.mabel;
    if (!(m.exposurePerMgDose > 0)) {
      throw new Error('computeFirstInHumanDose: mabel.exposurePerMgDose must be > 0');
    }
    const mabelSafetyFactor = m.mabelSafetyFactor ?? 1;
    if (!(mabelSafetyFactor > 0)) {
      throw new Error('computeFirstInHumanDose: mabel.mabelSafetyFactor must be > 0');
    }
    const rawDoseMg = m.minAnticipatedEffectiveExposure / m.exposurePerMgDose;
    mabel = {
      mabelDoseMg: round(rawDoseMg / mabelSafetyFactor, 3),
      mabelSafetyFactor,
      basis: m.basis ?? 'MABEL from minimum anticipated effective exposure and dose↔exposure factor.',
      minAnticipatedEffectiveExposure: m.minAnticipatedEffectiveExposure,
      exposurePerMgDose: m.exposurePerMgDose,
    };
  }

  // Select the more conservative derivation.
  let recommendedStartingDoseMg = mrsd.mrsdTotalMg;
  let limitedBy: LimitingApproach = 'MRSD';
  let rationale: string;

  if (mabel && mabel.mabelDoseMg < mrsd.mrsdTotalMg) {
    recommendedStartingDoseMg = mabel.mabelDoseMg;
    limitedBy = 'MABEL';
    rationale =
      `MABEL-limited: the MABEL-derived dose (${mabel.mabelDoseMg} mg) is below the ` +
      `MRSD (${mrsd.mrsdTotalMg} mg), so the more conservative MABEL governs the starting dose ` +
      `per the EMA FIH risk-mitigation approach for pharmacologically high-risk molecules.`;
  } else if (mabel) {
    rationale =
      `MRSD-limited: the MRSD (${mrsd.mrsdTotalMg} mg) from the most sensitive species ` +
      `(${mrsd.selectedSpecies}, HED ${mrsd.selectedHedMgPerKg} mg/kg ÷ SF ${mrsd.safetyFactor}) ` +
      `is at or below the MABEL-derived dose (${mabel.mabelDoseMg} mg).`;
  } else {
    rationale =
      `MRSD-limited: starting dose set by the MRSD (${mrsd.mrsdTotalMg} mg) from the most ` +
      `sensitive species (${mrsd.selectedSpecies}). No MABEL derivation supplied.`;
  }

  return { mrsd, mabel, recommendedStartingDoseMg, limitedBy, rationale, warnings };
}
