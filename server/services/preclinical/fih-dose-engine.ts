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
 * Parse one explicit NOAEL dose in mg/kg/day (or mg/kg), optionally prefixed
 * with "NOAEL =" or "NOAEL:". Accept decimal, thousands-grouped and scientific
 * notation as whole numbers, never a numeric fragment inside prose. Ranges,
 * inequalities, negative doses and unsupported units require human resolution;
 * this parser does not infer a NOAEL or guess a mg→mg/kg conversion.
 */
export function parseDoseMgPerKg(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^(?:NOAEL\s*[:=]\s*)?(\+?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?)\s*mg\s*\/\s*kg(?:\s*\/\s*day)?$/i);
  if (!match) return null;
  const numericText = match[1].replaceAll(',', '');
  const value = Number(numericText);
  if (!Number.isFinite(value)) return null;
  // A nonzero coefficient may underflow to zero (e.g. 1e-999). That is a
  // numeric-range failure, not a reported zero NOAEL.
  if (value === 0 && /[1-9]/.test(numericText.split(/e/i)[0])) return null;
  return value;
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

function requireFiniteNonNegative(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function requireFinitePositive(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw new Error(`${name} must be > 0 and finite.`);
  }
}

/** A positive derivation that underflows to zero is not a usable result. */
function checkedResult(value: number, name: string, positiveExpected: boolean): number {
  if (!Number.isFinite(value) || value < 0 || (positiveExpected && value === 0)) {
    throw new Error(`${name} must be a finite ${positiveExpected ? 'positive' : 'non-negative'} representable number; inputs exceed the numeric range.`);
  }
  return value;
}

/** HED (mg/kg) = animal NOAEL (mg/kg) × (animal Km / human Km). */
export function computeHED(noaelMgPerKg: number, animalKm: number): number {
  requireFiniteNonNegative(noaelMgPerKg, 'computeHED: NOAEL');
  requireFinitePositive(animalKm, 'computeHED: Km');
  return checkedResult(noaelMgPerKg * (animalKm / HUMAN_KM), 'computeHED: HED', noaelMgPerKg > 0);
}

interface DoseParameters {
  humanWeight: number;
  safetyFactor: number;
}

/** Validate the request before any species or dose derivation. */
function validateDoseInput(input: FihDoseInput): DoseParameters {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('computeFirstInHumanDose: input must be an object');
  }
  // Only omission selects a default. An explicit null or other invalid input
  // must not silently become a different calculation.
  const humanWeight = input.humanReferenceWeightKg === undefined
    ? HUMAN_REFERENCE_WEIGHT_KG : input.humanReferenceWeightKg;
  requireFinitePositive(humanWeight, 'computeFirstInHumanDose: humanReferenceWeightKg');
  const safetyFactor = input.safetyFactor === undefined ? 10 : input.safetyFactor;
  requireFinitePositive(safetyFactor, 'computeFirstInHumanDose: safetyFactor');

  if (input.mostAppropriateSpecies !== undefined &&
      (typeof input.mostAppropriateSpecies !== 'string' || !input.mostAppropriateSpecies.trim())) {
    throw new Error('computeFirstInHumanDose: mostAppropriateSpecies must be a non-empty species name');
  }

  if (!Array.isArray(input.speciesNoaels) || input.speciesNoaels.length === 0) {
    throw new Error('computeFirstInHumanDose: at least one species NOAEL is required');
  }
  return { humanWeight, safetyFactor };
}

/** Preserve each usable study and report unresolved species explicitly. */
function deriveSpeciesHeds(speciesNoaels: SpeciesNoael[], warnings: string[]): HedResult[] {
  const hedBySpecies: HedResult[] = [];
  for (const s of speciesNoaels) {
    if (!s || typeof s.species !== 'string' || !s.species.trim()) {
      throw new Error('computeFirstInHumanDose: each species NOAEL must have a non-empty species name');
    }
    requireFiniteNonNegative(s.noaelMgPerKg, 'computeFirstInHumanDose: NOAEL');
    const km = s.km === undefined ? kmForSpecies(s.species) : s.km;
    if (km === null && s.km === undefined) {
      warnings.push(`Skipped "${s.species}" — no Km factor could be resolved; supply km explicitly.`);
      continue;
    }
    // An invalid explicit Km is refused; never use a species
    // default or drop that study in response to a bad override.
    requireFinitePositive(km, 'computeFirstInHumanDose: Km');
    const hedMgPerKg = computeHED(s.noaelMgPerKg, km);
    hedBySpecies.push({
      species: s.species,
      studyRef: s.studyRef,
      noaelMgPerKg: s.noaelMgPerKg,
      km,
      hedMgPerKg,
    });
  }

  if (hedBySpecies.length === 0) {
    throw new Error('computeFirstInHumanDose: no species produced a usable HED');
  }

  // Most sensitive first.
  hedBySpecies.sort((a, b) => a.hedMgPerKg - b.hedMgPerKg);
  return hedBySpecies;
}

/** An explicit species choice cannot fall back to another study. */
function selectSpeciesHed(hedBySpecies: HedResult[], mostAppropriateSpecies?: string): HedResult {
  if (mostAppropriateSpecies === undefined) return hedBySpecies[0];
  const requestedSpecies = mostAppropriateSpecies.trim().toLowerCase();
  const forced = hedBySpecies.find(
    h => h.species.trim().toLowerCase() === requestedSpecies,
  );
  if (!forced) {
    throw new Error(
      `computeFirstInHumanDose: mostAppropriateSpecies must be the name of a species with a usable HED; "${mostAppropriateSpecies}" was not found.`,
    );
  }
  return forced;
}

function deriveMrsd(input: FihDoseInput, hedBySpecies: HedResult[], parameters: DoseParameters): MrsdResult {
  const { humanWeight, safetyFactor } = parameters;
  const selected = selectSpeciesHed(hedBySpecies, input.mostAppropriateSpecies);
  const safetyFactorRationale =
    input.safetyFactorRationale ??
    (safetyFactor === 10
      ? 'Default safety factor of 10 per FDA 2005 MRSD guidance.'
      : `Safety factor of ${safetyFactor} (deviation from default 10).`);

  const mrsdMgPerKg = checkedResult(
    selected.hedMgPerKg / safetyFactor, 'computeFirstInHumanDose: MRSD mg/kg', selected.hedMgPerKg > 0,
  );
  const mrsdTotalMg = checkedResult(
    mrsdMgPerKg * humanWeight, 'computeFirstInHumanDose: MRSD total', mrsdMgPerKg > 0,
  );

  return {
    hedBySpecies,
    selectedSpecies: selected.species,
    selectedHedMgPerKg: selected.hedMgPerKg,
    safetyFactor,
    safetyFactorRationale,
    mrsdMgPerKg,
    mrsdTotalMg,
    humanReferenceWeightKg: humanWeight,
  };
}

function deriveMabel(m: MabelInput | undefined): MabelResult | null {
  if (m === undefined) return null;
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    throw new Error('computeFirstInHumanDose: mabel must be an object');
  }
  requireFiniteNonNegative(m.minAnticipatedEffectiveExposure, 'computeFirstInHumanDose: mabel.minAnticipatedEffectiveExposure');
  requireFinitePositive(m.exposurePerMgDose, 'computeFirstInHumanDose: mabel.exposurePerMgDose');
  const mabelSafetyFactor = m.mabelSafetyFactor === undefined ? 1 : m.mabelSafetyFactor;
  requireFinitePositive(mabelSafetyFactor, 'computeFirstInHumanDose: mabel.mabelSafetyFactor');
  const rawDoseMg = checkedResult(
    m.minAnticipatedEffectiveExposure / m.exposurePerMgDose,
    'computeFirstInHumanDose: MABEL raw dose', m.minAnticipatedEffectiveExposure > 0,
  );
  return {
    mabelDoseMg: checkedResult(rawDoseMg / mabelSafetyFactor, 'computeFirstInHumanDose: MABEL dose', rawDoseMg > 0),
    mabelSafetyFactor,
    basis: m.basis ?? 'MABEL from minimum anticipated effective exposure and dose↔exposure factor.',
    minAnticipatedEffectiveExposure: m.minAnticipatedEffectiveExposure,
    exposurePerMgDose: m.exposurePerMgDose,
  };
}

/** Compare the unrounded derivations and explain which one governs. */
function selectStartingDose(
  mrsd: MrsdResult, mabel: MabelResult | null, explicitSpecies: boolean,
): Pick<FihDoseResult, 'recommendedStartingDoseMg' | 'limitedBy' | 'rationale'> {
  let recommendedStartingDoseMg = mrsd.mrsdTotalMg;
  let limitedBy: LimitingApproach = 'MRSD';
  let rationale: string;
  const speciesSelection = explicitSpecies ? 'explicitly selected species' : 'most sensitive species';

  if (mabel && mabel.mabelDoseMg < mrsd.mrsdTotalMg) {
    recommendedStartingDoseMg = mabel.mabelDoseMg;
    limitedBy = 'MABEL';
    rationale =
      `MABEL-limited: the MABEL-derived dose (${mabel.mabelDoseMg} mg) is below the ` +
      `MRSD (${mrsd.mrsdTotalMg} mg), so the more conservative MABEL governs the starting dose ` +
      `per the EMA FIH risk-mitigation approach for pharmacologically high-risk molecules.`;
  } else if (mabel) {
    rationale =
      `MRSD-limited: the MRSD (${mrsd.mrsdTotalMg} mg) from the ${speciesSelection} ` +
      `(${mrsd.selectedSpecies}, HED ${mrsd.selectedHedMgPerKg} mg/kg ÷ SF ${mrsd.safetyFactor}) ` +
      `is at or below the MABEL-derived dose (${mabel.mabelDoseMg} mg).`;
  } else {
    rationale =
      `MRSD-limited: starting dose set by the MRSD (${mrsd.mrsdTotalMg} mg) from the ${speciesSelection} ` +
      `(${mrsd.selectedSpecies}). No MABEL derivation supplied.`;
  }

  return { recommendedStartingDoseMg, limitedBy, rationale };
}

/**
 * Compute the FIH starting dose, returning both the MRSD and MABEL derivations
 * with every intermediate number exposed.
 *
 * Keep numeric results unrounded: rounding before species/approach selection
 * can change the limiting derivation, raise a dose or erase a small dose. This
 * engine does not introduce a clinical dose-rounding policy.
 *
 * @throws if an explicit numeric parameter is invalid, a result is outside the
 * representable range, an explicitly selected species is unusable, or no
 * species NOAEL resolves to a usable HED.
 */
export function computeFirstInHumanDose(input: FihDoseInput): FihDoseResult {
  const parameters = validateDoseInput(input);
  const warnings: string[] = [];
  const hedBySpecies = deriveSpeciesHeds(input.speciesNoaels, warnings);
  const mrsd = deriveMrsd(input, hedBySpecies, parameters);
  const mabel = deriveMabel(input.mabel);
  const selection = selectStartingDose(mrsd, mabel, input.mostAppropriateSpecies !== undefined);
  return { mrsd, mabel, ...selection, warnings };
}
