/**
 * QA LAYER — NUMERIC + UNIT integrity checks (pure, deterministic QaChecks).
 *
 * The single most dangerous machine-translation failure mode in a regulated
 * dossier is a SILENTLY ALTERED NUMBER or UNIT: "10 mg" rendered as "100 mg",
 * a dropped "%" turning a percentage into a bare count, an inclusion criterion
 * "≥ 18 years" mistranslated as "≥ 80 years". These never trip a glossary/DNT
 * check (they aren't named identifiers) yet they corrupt dose, strength, and
 * eligibility — so they are ERRORS that block auto-advance, leaving the human
 * reviewer to adjudicate (QA gates the machine, not the reviewer; see
 * ./types.ts severity semantics and server/services/translation/glossary.ts).
 *
 * Three checks, each a QaCheck (input -> QaFinding[]), all PURE: no I/O, no LLM,
 * no clock. Robust to Japanese full-width digits / punctuation (normalized to
 * ASCII before extraction) because the JA target side routinely carries them.
 *
 *  - numberConsistencyCheck — every numeric VALUE present in source must survive
 *    verbatim in target; a source number missing or count-reduced in target is an
 *    error (dose/strength/criteria drift). Order-independent multiset comparison.
 *  - unitConsistencyCheck — units (mg, mL, kg, %, mmHg, IU, ...) added, dropped,
 *    or count-changed between source and target are an error.
 *  - lengthSanityCheck — JA-vs-EN length-ratio heuristic; extreme outliers (near-
 *    empty target, or runaway expansion) surface as info/warning, never an error
 *    (length alone is advisory — truncation/runaway is for the human to confirm).
 *
 * @module server/services/translation/qa/numeric-checks
 */

import type { QaCheck, QaCheckInput, QaFinding } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Normalization — fold full-width (JA) digits + punctuation to ASCII
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of full-width / CJK numeric-adjacent characters to their ASCII forms.
 * Covers full-width digits (０-９, U+FF10–FF19), the full-width decimal point and
 * comma, full-width percent, and the JA range dash "〜"/"～" — all of which appear
 * in PMDA-bound target text and would otherwise hide numbers from the extractor.
 */
const FULLWIDTH_TO_ASCII: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '．': '.', '，': ',', '％': '%',
  '～': '~', '〜': '~', // wave-dash range markers → ASCII tilde range
  '・': '.', // middle dot occasionally used as a decimal point in JA
};

/**
 * Fold full-width digits/punctuation to ASCII so the same numeric/unit regexes
 * work on both EN source and JA target. Pure string transform — leaves all other
 * characters (Kanji, Latin words, real identifiers) untouched.
 */
export function normalizeWidth(text: string): string {
  let out = '';
  for (const ch of text) {
    out += FULLWIDTH_TO_ASCII[ch] ?? ch;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Matches a numeric token: optional sign, integer part with optional thousands
 * separators, optional decimal fraction. We canonicalize each match (strip
 * grouping commas) before comparison so "1,000" and "1000" are the same value —
 * the *value* must survive translation, not its grouping style. Ranges like
 * "10-20" / "10~20" are captured as two numbers (10 and 20), which is exactly the
 * multiset we want preserved.
 */
// The leading `(?<![\d.])` makes a sign count only when it is NOT glued to a
// preceding digit/decimal, so a range hyphen ("18-65") splits into 18 and 65
// rather than 18 and -65, while a true negative ("-5", after space/paren) still
// keeps its sign.
const NUMBER_RE = /(?<![\d.])(?:[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+-]?\d+(?:\.\d+)?)/g;

/**
 * Canonical numeric key: drop thousands-grouping commas and a redundant leading
 * "+" so "1,000" === "1000" and "+5" === "5", while a real sign/decimal that
 * changes the value ("-5", "5.0" vs "5") is preserved. We DON'T numerically
 * re-format (no parseFloat round-trip) — "5.0" and "5" are intentionally distinct
 * because a dropped decimal place is itself a translation defect worth flagging.
 */
function canonicalNumber(raw: string): string {
  let n = raw.replace(/,/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  return n;
}

/** Extract canonical numeric values (multiset, order preserved) from text. */
export function extractNumbers(text: string): string[] {
  const normalized = normalizeWidth(text);
  const matches = normalized.match(NUMBER_RE) ?? [];
  return matches.map(canonicalNumber);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clinical / pharmacometric units we treat as semantically load-bearing. Ordered
 * longest-first within the alternation so "mg/mL" wins over "mg" (regex
 * alternation is leftmost-eager, not longest-match). Word/symbol boundaries are
 * enforced at match time, not here, so "kg" inside "skgoal" never matches.
 *
 * Percent ("%") is included as a unit because dropping it changes meaning (a rate
 * vs a raw count) even though it also reads as punctuation.
 */
const UNIT_ALTERNATION = [
  // compound/ratio units first (longest tokens)
  'mg/kg', 'mg/mL', 'mg/dL', 'mcg/mL', 'µg/mL', 'mmol/L', 'mol/L',
  'mL/min', 'IU/mL', 'U/mL', 'ng/mL', 'pg/mL', 'g/L', 'mg/L',
  // pressure / single-token units
  'mmHg', 'cmH2O',
  // mass
  'mcg', 'µg', 'ng', 'pg', 'kg', 'mg', 'g',
  // volume
  'mL', 'µL', 'uL', 'dL', 'L',
  // activity / count
  'mmol', 'mol', 'mEq', 'IU', 'U',
  // misc clinical
  'bpm', 'kcal', 'mph',
  // percentage
  '%',
];

/**
 * A unit is matched when it is preceded by a digit or whitespace (so it reads as
 * a measurement, not a random substring) and is NOT immediately followed by an
 * ASCII letter (so "mg" in "magnesium" or "L" in "Levels" can't match). Built
 * once from UNIT_ALTERNATION. Note `%` needs no leading-boundary nicety — we want
 * any "%" since dropping it is meaningful — so it is handled by a separate scan.
 */
const NON_PERCENT_UNITS = UNIT_ALTERNATION.filter((u) => u !== '%');

// Escape regex metacharacters in the (mostly alphanumeric + '/') unit tokens.
function escapeUnit(u: string): string {
  return u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * (?<=[\d\s(]) — unit must follow a digit, whitespace, or "(" (e.g. "(mg)").
 * (?![A-Za-z]) — and must not be glued to a following ASCII letter.
 * Case-sensitive on purpose: "mg" ≠ "MG", "IU" ≠ "iu" — clinical units are
 * case-significant and we'd rather flag a case change than silently fold it.
 */
const UNIT_RE = new RegExp(
  `(?<=[\\d\\s(])(?:${NON_PERCENT_UNITS.map(escapeUnit).join('|')})(?![A-Za-z])`,
  'g',
);

/**
 * Extract unit tokens (multiset, order preserved). Percent is counted separately
 * via a raw "%" scan (post width-normalization "％" → "%"), then merged in, so a
 * dropped percentage is caught regardless of spacing.
 */
export function extractUnits(text: string): string[] {
  const normalized = normalizeWidth(text);
  const units = normalized.match(UNIT_RE) ?? [];
  const percents = normalized.match(/%/g) ?? [];
  return [...units, ...percents];
}

// ─────────────────────────────────────────────────────────────────────────────
// Multiset diff helper
// ─────────────────────────────────────────────────────────────────────────────

/** Count occurrences of each token in a list (multiset as a Map). */
function toMultiset(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/**
 * Tokens whose count in `source` exceeds their count in `target` — i.e. values
 * that were dropped or reduced going into the translation. Returns each missing
 * token once per missing occurrence so "10 mg ... 10 mg" → "10 mg" reports the
 * second "10" as missing. (We deliberately DON'T report target-only additions as
 * errors for numbers — an extra number in target is a warning-grade event the
 * runner can layer on; the hard gate is source→target preservation.)
 */
function missingFromTarget(source: string[], target: string[]): string[] {
  const tgt = toMultiset(target);
  const missing: string[] = [];
  for (const tok of source) {
    const have = tgt.get(tok) ?? 0;
    if (have > 0) {
      tgt.set(tok, have - 1);
    } else {
      missing.push(tok);
    }
  }
  return missing;
}

/** Tokens present in `target` but not accounted for by `source` (additions). */
function addedInTarget(source: string[], target: string[]): string[] {
  return missingFromTarget(target, source);
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 1 — numberConsistencyCheck
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every numeric value in the source must appear (verbatim, same count) in the
 * target. A source number missing or count-reduced in the target is an ERROR —
 * this is the dose/strength/criteria guard (e.g. source "10 mg" → target "100 mg"
 * leaves "10" missing AND introduces "100", both flagged). A target-only number
 * with no source origin is surfaced as a WARNING (possible inserted/altered
 * value) — advisory, since legitimate JA renderings occasionally restate a value.
 */
export const numberConsistencyCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const srcNums = extractNumbers(input.source);
  const tgtNums = extractNumbers(input.target);

  const findings: QaFinding[] = [];

  // Dropped/changed source numbers → hard error (blocks auto-advance).
  const missing = missingFromTarget(srcNums, tgtNums);
  for (const m of missing) {
    findings.push({
      checkId: 'numeric-number-consistency',
      severity: 'error',
      message:
        `Source number "${m}" is missing or altered in the target. ` +
        `Numeric values (dose, strength, criteria) must be preserved verbatim.`,
      sourceExcerpt: m,
    });
  }

  // Numbers that exist only in target → advisory warning, but ONLY when a source
  // number was also dropped (a substitution signal, e.g. 10→100). A target-only
  // number with every source value intact is almost always a legitimate Japanese
  // counter ("once daily" → "1日1回"), not an insertion — flagging those is noise.
  if (missing.length > 0) {
    for (const added of addedInTarget(srcNums, tgtNums)) {
      findings.push({
        checkId: 'numeric-number-consistency',
        severity: 'warning',
        message:
          `Target number "${added}" has no matching value in the source ` +
          `(possible inserted or altered number).`,
        targetExcerpt: added,
      });
    }
  }

  return findings;
};

// ─────────────────────────────────────────────────────────────────────────────
// Check 2 — unitConsistencyCheck
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Units must match as a multiset between source and target. A dropped or
 * count-reduced unit (e.g. "%" lost, one of two "mg" gone) is an ERROR, as is an
 * added/changed unit (e.g. "mg" → "mcg" drops "mg" and adds "mcg"). Unit identity
 * is part of dose meaning, so both directions gate — unlike numbers, a spurious
 * extra unit is also treated as an error because it implies a fabricated
 * measurement.
 */
export const unitConsistencyCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const srcUnits = extractUnits(input.source);
  const tgtUnits = extractUnits(input.target);

  const findings: QaFinding[] = [];

  for (const missing of missingFromTarget(srcUnits, tgtUnits)) {
    findings.push({
      checkId: 'numeric-unit-consistency',
      severity: 'error',
      message:
        `Source unit "${missing}" is missing or altered in the target. ` +
        `Units of measure must be preserved verbatim.`,
      sourceExcerpt: missing,
    });
  }

  for (const added of addedInTarget(srcUnits, tgtUnits)) {
    findings.push({
      checkId: 'numeric-unit-consistency',
      severity: 'error',
      message:
        `Target unit "${added}" has no matching unit in the source ` +
        `(added or changed unit of measure).`,
      targetExcerpt: added,
    });
  }

  return findings;
};

// ─────────────────────────────────────────────────────────────────────────────
// Check 3 — lengthSanityCheck (advisory only — never gates)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heuristic bounds for a JA(target)/EN(source) character-count ratio. Japanese
 * is typically MORE compact than English (one kanji can carry a multi-word
 * concept), so a healthy EN→JA translation usually lands roughly in [0.25, 1.5]×
 * the source length. We widen to advisory thresholds:
 *   - ratio < LOW_WARN  → likely TRUNCATION (target too short / near-empty)
 *   - ratio > HIGH_WARN → likely RUNAWAY (untranslated bleed-through, doubling)
 * These are intentionally loose; length is a weak signal, so it's info/warning,
 * never an error. The number/unit checks above carry the hard gate.
 */
const LOW_WARN = 0.2; // target < 20% of source chars → probable truncation
const LOW_INFO = 0.4; // 20–40% → just worth noting
const HIGH_INFO = 2.0; // 2–3× → noting (JA can legitimately expand)
const HIGH_WARN = 3.0; // > 3× → probable runaway / duplication

/**
 * Compare normalized character lengths of source vs target. Emits at most one
 * finding (info or warning), or none when the ratio is unremarkable. Width is
 * normalized first so full-width JA characters count the same as their ASCII
 * equivalents (they're each one "character" for ratio purposes either way, but
 * normalization keeps the count stable across encodings). Empty source short-
 * circuits: with no source there's no ratio to judge, so we stay silent.
 */
export const lengthSanityCheck: QaCheck = (input: QaCheckInput): QaFinding[] => {
  const src = normalizeWidth(input.source).trim();
  const tgt = normalizeWidth(input.target).trim();

  // A non-empty source translated to an EMPTY target is a strong truncation
  // signal — surface as a warning (still advisory; the human confirms).
  if (src.length === 0) return [];
  if (tgt.length === 0) {
    return [
      {
        checkId: 'numeric-length-sanity',
        severity: 'warning',
        message:
          'Target is empty while source is non-empty (possible dropped/truncated translation).',
        sourceExcerpt: input.source.slice(0, 60),
      },
    ];
  }

  const ratio = tgt.length / src.length;

  if (ratio < LOW_WARN) {
    return [
      {
        checkId: 'numeric-length-sanity',
        severity: 'warning',
        message:
          `Target is far shorter than source (length ratio ${ratio.toFixed(2)}); ` +
          `possible truncation.`,
      },
    ];
  }
  if (ratio < LOW_INFO) {
    return [
      {
        checkId: 'numeric-length-sanity',
        severity: 'info',
        message:
          `Target is noticeably shorter than source (length ratio ${ratio.toFixed(2)}).`,
      },
    ];
  }
  if (ratio > HIGH_WARN) {
    return [
      {
        checkId: 'numeric-length-sanity',
        severity: 'warning',
        message:
          `Target is far longer than source (length ratio ${ratio.toFixed(2)}); ` +
          `possible runaway translation or duplicated content.`,
      },
    ];
  }
  if (ratio > HIGH_INFO) {
    return [
      {
        checkId: 'numeric-length-sanity',
        severity: 'info',
        message:
          `Target is noticeably longer than source (length ratio ${ratio.toFixed(2)}).`,
      },
    ];
  }

  return [];
};

/**
 * The numeric/unit QaChecks, registration-ordered. The QA runner folds these
 * (and other check modules) into one QaReport, deriving passed/summary there.
 */
export const numericChecks: QaCheck[] = [
  numberConsistencyCheck,
  unitConsistencyCheck,
  lengthSanityCheck,
];
