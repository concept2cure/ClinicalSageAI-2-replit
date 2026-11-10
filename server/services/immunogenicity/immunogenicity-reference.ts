/**
 * Immunogenicity Intelligence — shared reference tables and input helpers
 * =======================================================================
 *
 * The types, score bands, citations and stated-input helpers that every
 * immunogenicity tool uses. Deterministic: no LLM, no network, no database.
 *
 * It is also the one home of the stated-input helpers that EVERY Rule 2 S5
 * engine uses, not only immunogenicity's: the readers (statedBoolean,
 * booleanInputStates, statedNumber, statedOneOf, and since S5d statedText
 * and statedList) and, since S5d-0
 * (2026-11-09), the three-valued helpers (unstated, anyOf, allOf), the
 * every-answer search (everyAnswer, conclusions, decidingFacts) and the input
 * adapters (oneOfInput, textInput, listed; S5d-0b). Import them from here;
 * do not copy them into an engine or move them back.
 * s5-three-valued-helpers-have-one-home.test.ts fails if an engine does.
 * Split out of immunogenicity-knowledge.ts on 2026-10-15 when that file
 * crossed the repository size ceiling; it re-exports the public names, so
 * importers of the knowledge module are unchanged.
 *
 * @module server/services/immunogenicity/immunogenicity-reference
 */

import { ComputationRefusal, type RequiredInputCheck } from '../ana-biostats/computation-engine';

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

/** The tier vocabulary, low to high. */
export const RISK_TIERS: RiskTier[] = RISK_SCORE_BANDS.map((b: ScoreBand) => b.tier);

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

/** Serialize the stated boolean answers without turning unanswered questions into false. */
export function booleanInputStates(params: object, fields: readonly string[]): Record<string, boolean | 'not_stated'> {
  const values = params as Record<string, unknown>;
  return Object.fromEntries(fields.map(field => [field, statedBoolean(field, values[field]) ?? 'not_stated']));
}

/** A stated finite number that satisfies `ok`, or undefined when it was not stated. */
export function statedNumber(field: string, value: unknown, ok: (n: number) => boolean, rule: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && ok(value)) return value;
  throw new ComputationRefusal('invalid_input', `${field} must be ${rule} (got ${shown(value)}).`, field);
}

/* ── Three-valued facts (S5d-0, 2026-11-09) ─────────────────────────────────
   One home for the helpers every S5 engine uses to keep an unstated fact
   unstated: moved here verbatim from biomarker-knowledge.ts (the answer
   search) and from the GCP and GMP engines (unstated / anyOf / allOf), which
   carried identical copies. */

/** True when a value was left out or given as null: it was not stated. */
export function unstated(value: unknown): boolean {
  return value === undefined || value === null;
}

/** Three-valued OR: true if any fact is true, false only when every one is stated, else undefined (not assessed). */
export function anyOf(...facts: Array<boolean | null | undefined>): boolean | undefined {
  if (facts.some((f) => f === true)) return true;
  return facts.some(unstated) ? undefined : false;
}

/** Three-valued AND: false if any stated fact is not true, true only when every one is true, else undefined. */
export function allOf(...facts: Array<boolean | null | undefined>): boolean | undefined {
  if (facts.some((f) => !unstated(f) && f !== true)) return false;
  return facts.some(unstated) ? undefined : true;
}

/** The distinct items, in first-seen order. */
export function uniqueStrings(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/** Every answer the unstated facts could take: each stated fact kept, each undefined one both true and false. */
export function everyAnswer<K extends string>(stated: Record<K, boolean | undefined>): Array<Record<K, boolean>> {
  let answers: Array<Record<K, boolean>> = [{} as Record<K, boolean>];
  for (const key of Object.keys(stated) as K[]) {
    const fact = stated[key];
    const values = fact === undefined ? [true, false] : [fact];
    answers = answers.flatMap((a: Record<K, boolean>) => values.map((v: boolean) => ({ ...a, [key]: v })));
  }
  return answers;
}

/** The distinct conclusions those answers give, in first-seen order: one means the stated facts decide it. */
export function conclusions<K extends string, T extends string>(
  stated: Record<K, boolean | undefined>,
  conclude: (answer: Record<K, boolean>) => T,
): T[] {
  return uniqueStrings(everyAnswer(stated).map(conclude)) as T[];
}

/** The unstated facts whose answer can change the conclusion. */
export function decidingFacts<K extends string, T>(
  stated: Record<K, boolean | undefined>,
  conclude: (answer: Record<K, boolean>) => T,
): K[] {
  return (Object.keys(stated) as K[]).filter(
    (key: K): boolean =>
      stated[key] === undefined &&
      everyAnswer({ ...stated, [key]: false }).some(
        (a: Record<K, boolean>): boolean => conclude({ ...a, [key]: true }) !== conclude(a),
      ),
  );
}

/* ── Input adapters (S5d-0b, 2026-11-09) ──────────────────────────────────────
   The refuseUnlessStated checks and the prose list every S5 engine uses:
   moved here verbatim from biomarker-knowledge.ts, whose oneOfInput the
   digital-health engine also carried byte for byte. */

/** A required non-empty text, for refuseUnlessStated. */
export function textInput(field: string, value: unknown): RequiredInputCheck {
  return { field, value, ok: typeof value === 'string' && value.trim().length > 0, expected: 'non-empty text' };
}

/** A required value from a fixed vocabulary, for refuseUnlessStated. */
export function oneOfInput(field: string, value: unknown, allowed: readonly string[]): RequiredInputCheck {
  return {
    field,
    value,
    ok: typeof value === 'string' && allowed.includes(value),
    expected: `one of ${allowed.join(', ')}`,
  };
}

/** "a", "a and b", "a, b and c". */
export function listed(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ── Text and list readers (Rule 2 S5d, 2026-11-09) ───────────────────────────
   statedBoolean's twins for text and for a list, landed with their first
   callers (the benefit-risk engine, then post-approval and regulatory
   strategy), which had each written its own. */

/** A stated text input, or undefined when it was not stated. Absent is not empty; anything else is refused. */
export function statedText(field: string, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  throw new ComputationRefusal(
    'invalid_input',
    `${field} must be text (got ${shown(value)}). Leave it out if it is not known.`,
    field,
  );
}

/** A stated list input, or undefined when it was not stated. Absent is not empty; anything else is refused. */
export function statedList(field: string, value: unknown): readonly unknown[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value;
  throw new ComputationRefusal(
    'invalid_input',
    `${field} must be a list (got ${shown(value)}). Leave it out if it is not known.`,
    field,
  );
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
