/**
 * Immunogenicity Intelligence — shared reference tables and input helpers
 * =======================================================================
 *
 * The types, score bands, citations and stated-input helpers that every
 * immunogenicity tool uses. Deterministic: no LLM, no network, no database.
 * Split out of immunogenicity-knowledge.ts on 2026-10-15 when that file
 * crossed the repository size ceiling; it re-exports the public names, so
 * importers of the knowledge module are unchanged.
 *
 * @module server/services/immunogenicity/immunogenicity-reference
 */

import { ComputationRefusal } from '../ana-biostats/computation-engine';

/* ════════════════════════════════════════════════════════════════════════
 * SECTION 0 — SHARED TYPES, ENUMS, AND REFERENCE TABLES
 * ════════════════════════════════════════════════════════════════════════ */

/** Ordinal risk tiers used across the engine. */
export type RiskTier = 'low' | 'moderate' | 'high';

/** Severity scale for clinical-impact classification. */
export type SeverityLevel = 'none' | 'low' | 'moderate' | 'high' | 'critical';

/** A regulatory citation with the issuing body and a specific locator. */
export interface Citation {
  authority: string;
  document: string;
  locator: string;
}

/** Numeric → tier mapping descriptor (documentation of thresholds). */
export interface ScoreBand {
  tier: RiskTier;
  minScore: number;
  maxScore: number;
  label: string;
}

/**
 * Risk score is normalized 0–100. Bands are inclusive of min, exclusive of
 * max except the top band. These bands are an internal deterministic scale;
 * they are NOT a regulatory threshold but a structured way of aggregating the
 * qualitative risk factors enumerated in FDA 2014 Section III and EMA 2017.
 */
export const RISK_SCORE_BANDS: ScoreBand[] = [
  { tier: 'low', minScore: 0, maxScore: 34, label: 'Low immunogenicity concern' },
  { tier: 'moderate', minScore: 34, maxScore: 67, label: 'Moderate immunogenicity concern' },
  { tier: 'high', minScore: 67, maxScore: 101, label: 'High immunogenicity concern' },
];

/** Resolve a normalized 0–100 score to a risk tier deterministically. */
export function scoreToTier(score: number): RiskTier {
  const clamped = score < 0 ? 0 : score > 100 ? 100 : score;
  for (const band of RISK_SCORE_BANDS) {
    if (clamped >= band.minScore && clamped < band.maxScore) {
      return band.tier;
    }
  }
  return 'high';
}

/** Combine two severities, returning the more severe of the two. */
export function maxSeverity(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
  const order: SeverityLevel[] = ['none', 'low', 'moderate', 'high', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** Round to a fixed number of decimals deterministically. */
export function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function shown(value: unknown): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

/**
 * A stated enum input, or undefined when it was not stated (null counts as not
 * stated). A value outside the vocabulary is refused, never scored as a guess.
 */
export function statedOneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new ComputationRefusal(
    'invalid_input',
    `${field} must be one of ${allowed.join(', ')} (got ${shown(value)}). Leave it out if it is not known.`,
    field,
  );
}

/** A stated boolean input, or undefined when it was not stated. Absent is not false. */
export function statedBoolean(field: string, value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  throw new ComputationRefusal(
    'invalid_input',
    `${field} must be true or false (got ${shown(value)}). Leave it out if it is not known.`,
    field,
  );
}

/** A stated finite number that satisfies `ok`, or undefined when it was not stated. */
export function statedNumber(field: string, value: unknown, ok: (n: number) => boolean, rule: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && ok(value)) return value;
  throw new ComputationRefusal('invalid_input', `${field} must be ${rule} (got ${shown(value)}).`, field);
}

/** Canonical citations reused across the engine. */
export const CITATIONS: Record<string, Citation> = {
  FDA_2019: {
    authority: 'FDA',
    document:
      'Immunogenicity Testing of Therapeutic Protein Products — Developing and Validating Assays for Anti-Drug Antibody Detection (Jan 2019)',
    locator: 'Guidance for Industry',
  },
  FDA_2019_TIERS: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section IV — Tiered Approach (Screening, Confirmatory, Titer, NAb)',
  },
  FDA_2019_CUTPOINT: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section V.A — Screening Cut Point (5% false-positive rate)',
  },
  FDA_2019_SENSITIVITY: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section V.C — Assay Sensitivity (target ≤ 100 ng/mL)',
  },
  FDA_2019_DRUGTOL: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section V.D — Drug Tolerance',
  },
  FDA_2019_NAB: {
    authority: 'FDA',
    document: 'Immunogenicity Testing of Therapeutic Protein Products (Jan 2019)',
    locator: 'Section VI — Neutralizing Antibody Assays',
  },
  FDA_2014: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Guidance for Industry',
  },
  FDA_2014_FACTORS: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Section III — Factors That Can Affect Immunogenicity',
  },
  FDA_2014_CONSEQUENCES: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Section II — Clinical Consequences of Immune Responses',
  },
  FDA_2014_RISKBASED: {
    authority: 'FDA',
    document: 'Immunogenicity Assessment for Therapeutic Protein Products (Aug 2014)',
    locator: 'Section IV — Risk-Based Approach to Immunogenicity Evaluation',
  },
  EMA_2017: {
    authority: 'EMA',
    document:
      'Guideline on Immunogenicity Assessment of Therapeutic Proteins (EMEA/CHMP/BMWP/14327/2006 Rev 1, 2017)',
    locator: 'Risk-based immunogenicity programme',
  },
  EMA_MABS: {
    authority: 'EMA',
    document:
      'Guideline on Immunogenicity Assessment of Monoclonal Antibodies for In Vivo Clinical Use (EMA/CHMP/BMWP/86289/2010)',
    locator: 'Monoclonal antibody-specific considerations',
  },
  USP_1106: {
    authority: 'USP',
    document: 'General Chapter <1106> Immunogenicity Assays — Design and Validation (ADA detection)',
    locator: 'Cut-point, sensitivity, specificity, precision',
  },
  USP_1106_1: {
    authority: 'USP',
    document: 'General Chapter <1106.1> Neutralizing Antibody Assay Design and Validation',
    locator: 'Cell-based vs competitive ligand-binding NAb assays',
  },
  ICH_S6R1: {
    authority: 'ICH',
    document: 'ICH S6(R1) Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals (2011)',
    locator: 'Immunogenicity and limitations of animal immunogenicity data',
  },
  ICH_Q5E: {
    authority: 'ICH',
    document: 'ICH Q5E Comparability of Biotechnological/Biological Products (2004)',
    locator: 'Comparability after manufacturing changes',
  },
  FDA_BIOSIM: {
    authority: 'FDA',
    document: 'Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)',
    locator: 'Immunogenicity comparison for biosimilars',
  },
  SHANKAR_2008: {
    authority: 'Shankar et al.',
    document: 'Recommendations for the validation of immunoassays used for ADA detection (J Pharm Biomed Anal 2008)',
    locator: 'Cut-point statistics (mean + 1.645·SD)',
  },
  SHANKAR_2014: {
    authority: 'Shankar et al.',
    document: 'Assessment and reporting of clinical immunogenicity — NAb assay recommendations (AAPS J 2014)',
    locator: 'Neutralizing antibody assay format selection',
  },
};

/** The citations in first-seen order, without repeats. */
export function dedupeCitations(list: Citation[]): Citation[] {
  const seen: Record<string, boolean> = {};
  const out: Citation[] = [];
  for (const c of list) {
    const key = `${c.authority}|${c.document}|${c.locator}`;
    if (!seen[key]) {
      seen[key] = true;
      out.push(c);
    }
  }
  return out;
}
