/**
 * THE LEXICON: the one curated table of labelled figures, and how each label's
 * written value becomes a number.
 *
 * ## Why it is its own module
 *
 * Seven services read figures through it — the truth engine's figure
 * consistency, the harmonize engine, the mined-figure and device-document
 * reconcilers, terminology consistency, and the living record's binder and
 * citations. Whatever it cannot see, none of them can compare. It was a block
 * inside `cross-artifact-consistency.ts`, which is a *consumer* of it (it
 * compares a draft against a project's artifacts); the vocabulary being
 * buried inside one of its callers is part of why its narrowness was easy to
 * miss. It is split out here, unchanged, so the vocabulary is a thing you can
 * open, read and extend — `cross-artifact-consistency` re-exports every name,
 * so no caller moves.
 *
 * ## The rule this table keeps
 *
 * ONLY labelled cases are extracted, never every integer in the text:
 * regulatory prose attaches its figures to recognisable keys, and a
 * free-standing number carries too much false-positive risk for a comparison
 * that a reviewer will act on. Two of these services reconcile documents
 * AGAINST each other, so a phantom figure does not merely add noise — it
 * manufactures a conflict between two texts that agree. The negative cases in
 * `__tests__/cross-artifact-consistency-ordinary-prose.test.ts` are what hold
 * that line.
 *
 * ## What it reads, measured
 *
 * On 2026-11-01, over fifteen phase-III randomised-trial abstracts from
 * PubMed: of 123 sentences stating a figure a reviewer reconciles, it read 24
 * — 20%. Widened the same day to the ordinary shapes it was missing (a comma
 * between a figure's name and its number, a qualifier between them, the count
 * before its verb, and six figures with no label at all), it reads 56 — 46%.
 *
 * Most of what it still does not read, it should not: the remaining misses
 * are overwhelmingly arm- or event-qualified ("neutropenia in 32.3%, 46.1%
 * and 43.2% in the three groups"), and a label with no arm and no event in it
 * would compare one arm's neutropenia against another's and call the
 * difference a conflict. Carrying that qualifier is a design change, not a
 * pattern, and is recorded as open rather than bodged in.
 *
 * @module server/services/intelligence/labelled-figures
 */

export interface NumericalFact {
  /** The label or key this number is attached to (e.g. "sample size", "LSM difference"). */
  readonly label: string;
  /** The raw numeric value as it appears in text. */
  readonly value: string;
  /**
   * The upper bound of a two-number fact (confidence interval, age range);
   * `value` is then the lower bound. Undefined for single-number facts.
   */
  readonly upper?: string;
  /** Optional unit if detected (%, mg, kg, etc.). */
  readonly unit?: string;
  /** The surrounding sentence or phrase for the reviewer to inspect. */
  readonly context: string;
  /** Position in the source text, useful for diffs. */
  readonly offset: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// NUMERIC FACT EXTRACTION
//
// Regulatory prose tends to attach numbers to recognizable keys: n=, N=,
// sample size, LSM, mean, median, p=, CI, dose, NOAEL, LOAEL, MRSD, etc.
// We extract ONLY the labelled cases, not every integer in the text, because
// free-standing numbers have too much false-positive risk for comparison.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What may sit between a figure's NAME and its number in ordinary prose.
 *
 * Every pattern below used to allow `of`, `was`, `is`, `=` and `:` — and no
 * comma. Measured on 2026-11-01 over fifteen phase-III randomised-trial
 * abstracts from PubMed, that one omission was the largest single cause of the
 * lexicon reading 24 of 123 governed sentences (20%): "hazard ratio, 0.65",
 * "95% CI, 0.53 to 0.79" and "the response rate, 42.1%" are how a journal, a
 * CSR and a Module 2.5 overwhelmingly write them.
 *
 * The qualifier branch is the second shape: "hazard ratio FOR DEATH, 0.64",
 * "hazard ratio for recurrence or death, 0.68". Bounded to 28 characters of
 * letters, spaces and hyphens, so it cannot run across a clause.
 *
 * It stays ANCHORED, which is the module's rule: the connector is optional but
 * the number must follow it immediately, so "The power, which the agency
 * agreed, was revisited after 3 sites opened" still reads no power — the comma
 * is a connector only when a number comes next.
 */
const TO_NUMBER = String.raw`(?:\s+for\s+[A-Za-z][A-Za-z\s-]{0,28}?)?\s*(?:of|was|were|is|are|at|=|:|,)?\s*`;

/** A figure's number may be parenthesised away from its unit: "7.1 (95% CI, 5.9-8.7) months". */
const ASIDE = String.raw`(?:\s*\([^)]{0,48}\))?`;

const anchored = (name: string, number: string, flags = 'gi'): RegExp =>
  new RegExp(name + TO_NUMBER + number, flags);

const LABELLED_NUMERIC_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'sample_size',     pattern: /\b(?:N|n|sample\s+size|enrolled|randomi[sz]ed)\s*[=:]\s*([0-9,]+)/gi },
  { label: 'p_value',         pattern: /\bp\s*[<=]\s*(0?\.[0-9]+|[0-9]+(?:\.[0-9]+)?[eE]-?[0-9]+)/gi },
  { label: 'confidence_interval', pattern: anchored(String.raw`\b(?:95|99)\s*%?\s*CI`, String.raw`([-−]?[0-9.]+)\s*(?:to|,|-|–|—)\s*([-−]?[0-9.]+)`) },
  { label: 'lsm_difference',  pattern: /\bLSM\s+difference[:\s]*[-−]?([0-9.]+)\s*%?/gi },
  { label: 'mean_change',     pattern: /\bmean\s+change\s+(?:from\s+baseline\s+)?(?:of\s+|[=:]\s*)[-−]?([0-9.]+)/gi },
  { label: 'hba1c_reduction', pattern: /\bHbA1[cC]\s+reduction\s*(?:of\s+|[=:]\s*)[-−]?([0-9.]+)\s*%/gi },
  { label: 'dose_mg',         pattern: /\b([0-9]+(?:\.[0-9]+)?)\s*mg\s+(?:once|twice|dose|daily|QD|BID|TID|QID)/gi },
  { label: 'dose_kg',         pattern: /\b([0-9]+(?:\.[0-9]+)?)\s*mg\/kg\b/gi },
  { label: 'noael',           pattern: /\bNOAEL\s*(?:of\s+|[=:]\s*)([0-9]+(?:\.[0-9]+)?)\s*(mg\/kg\/day|mg\/kg|mg|ug\/kg\/day)?/gi },
  { label: 'mrsd',            pattern: /\bMRSD\s*(?:of\s+|[=:]\s*)([0-9]+(?:\.[0-9]+)?)\s*(mg|mg\/kg|ug)?/gi },
  { label: 'shelf_life',      pattern: /\b([0-9]+)\s*[-‒–—]\s*month\s+shelf[- ]life\b/gi },
  { label: 'duration_weeks',  pattern: /\b(?:at\s+week|week\s+|through\s+week\s+)([0-9]+)\b/gi },
  { label: 'age_range',       pattern: /\bages?\s+([0-9]+)\s*(?:to|-|–)\s*([0-9]+)\s*(?:years?|yrs?)?/gi },
  { label: 'batches',         pattern: /\b([0-9]+)\s+(?:of\s+[0-9]+\s+)?(?:pivotal\s+|registration\s+|validation\s+)?batches?\b/gi },
  // ── Medical device / IVD quantities ──────────────────────────────────────
  // Anchored on an explicit label + connector so a bare percentage is never
  // captured. Clinical performance, analytical performance, submission
  // identifiers, and risk metrics — the governed values device/IVD documents
  // cite across the technical documentation, SE discussion, CER, and IFU.
  { label: 'sensitivity',      pattern: anchored(String.raw`\b(?:clinical\s+)?sensitivity(?:\s*\([^)]*\))?`, String.raw`([0-9]{1,3}(?:\.[0-9]+)?)\s*%`) },
  { label: 'specificity',      pattern: anchored(String.raw`\b(?:clinical\s+)?specificity(?:\s*\([^)]*\))?`, String.raw`([0-9]{1,3}(?:\.[0-9]+)?)\s*%`) },
  { label: 'ppa',              pattern: anchored(String.raw`\b(?:positive\s+percent\s+agreement|PPA)(?:\s*\([^)]*\))?`, String.raw`([0-9]{1,3}(?:\.[0-9]+)?)\s*%`) },
  { label: 'npa',              pattern: anchored(String.raw`\b(?:negative\s+percent\s+agreement|NPA)(?:\s*\([^)]*\))?`, String.raw`([0-9]{1,3}(?:\.[0-9]+)?)\s*%`) },
  { label: 'lod',              pattern: anchored(String.raw`\b(?:LoD|limit\s+of\s+detection)`, String.raw`([0-9]+(?:\.[0-9]+)?)\s*(copies\/mL|IU\/mL|ng\/mL|pg\/mL|cfu\/mL|mg\/L|%)?`) },
  { label: 'lob',              pattern: anchored(String.raw`\b(?:LoB|limit\s+of\s+blank)`, String.raw`([0-9]+(?:\.[0-9]+)?)`) },
  { label: 'loq',              pattern: anchored(String.raw`\b(?:LoQ|limit\s+of\s+quantitation)`, String.raw`([0-9]+(?:\.[0-9]+)?)`) },
  { label: 'precision_cv',     pattern: anchored(String.raw`\b(?:CV|coefficient\s+of\s+variation)(?:\s*\([^)]*\))?`, String.raw`([0-9]+(?:\.[0-9]+)?)\s*%`) },
  { label: 'predicate_knumber', pattern: /\b(K[0-9]{6})\b/g },
  { label: 'de_novo_number',   pattern: /\b(DEN[0-9]{6})\b/g },
  { label: 'pma_number',       pattern: /\b(P[0-9]{6})\b/g },
  { label: 'rpn',              pattern: anchored(String.raw`\bRPN`, String.raw`([0-9]+(?:\.[0-9]+)?)`) },
  // ── Trial-design and statistical-plan quantities ─────────────────────────
  // Folded in from server/services/ana/dossierReconciliation.ts (deleted 2026-10-19),
  // which mined the same kind of figure out of the same prose for the same reviewer
  // finding. Its five labels had no counterpart here, and its enrolled-N prose form read
  // what `sample_size` above could not: that pattern required an `=`, so "randomized 240
  // patients" was invisible to it. The patterns are that module's, unchanged.
  { label: 'sample_size',      pattern: /(?:enroll(?:ed|ment of)|randomi[sz]ed|accrued)\s+(?:a\s+total\s+of\s+)?([\d,]{1,9})\s+(?:patients|subjects|participants)/gi },
  { label: 'sample_size',      pattern: /(?:sample\s+size|target\s+(?:enrol+ment|N)|total\s+N)\s*(?:of|=|:|\bis\b)?\s*([\d,]{1,9})\b/gi },
  { label: 'sites',            pattern: /([\d,]{1,6})\s+(?:investigational\s+)?(?:sites|centers|centres)\b/gi },
  { label: 'events',           pattern: /([\d,]{1,7})\s+(?:primary\s+)?(?:events|deaths)\b/gi },
  { label: 'alpha',            pattern: anchored(String.raw`(?:alpha|type\s*I\s*error(?:\s*rate)?|significance\s+level)`, String.raw`(0?\.\d{1,4})`) },
  { label: 'power',            pattern: anchored(String.raw`power`, String.raw`((?:0?\.\d{1,4})|(?:\d{1,3})\s*%)`) },
  // From harmonize-engine.ts's inline copy (migrated 2026-10-19), which held these two.
  //
  // ── Why the abbreviations are matched case-SENSITIVELY ──────────────────
  // `\bOR\b` sat inside a /gi/ pattern, so it matched the English word "or".
  // Measured live on 2026-11-01: "Subjects received either the 0.3 or 0.5 mg
  // dose" stated an odds ratio of 0.5, and so did "a Type II variation or 0.25
  // of the annual fee". Seven services read figures through this lexicon and
  // two of them reconcile documents against each other, so a phantom OR does
  // not merely add noise — it manufactures a conflict between two texts whose
  // only crime is the word "or" before a decimal. The spelled-out name keeps
  // the /i/ flag; the abbreviation does not. `HR` is split the same way: it is
  // never written "hr" for a hazard ratio, and `Hr`/`hr` before a decimal is
  // someone's heart rate or an hour.
  { label: 'hazard_ratio',     pattern: anchored(String.raw`hazard\s+ratio`, String.raw`(\d?\.\d{1,4})`) },
  { label: 'hazard_ratio',     pattern: anchored(String.raw`\bHR\b`, String.raw`(\d?\.\d{1,4})`, 'g') },
  { label: 'odds_ratio',       pattern: anchored(String.raw`odds\s+ratio`, String.raw`(\d?\.\d{1,4})`) },
  { label: 'odds_ratio',       pattern: anchored(String.raw`\bOR\b`, String.raw`(\d?\.\d{1,4})`, 'g') },
  { label: 'response_rate',    pattern: anchored(String.raw`(?:\bORR\b|response\s+rate|\bCR\s+rate)`, String.raw`(\d+(?:\.\d+)?)\s*%`) },

  // ── The patient count written BEFORE its verb ────────────────────────────
  // "A total of 994 patients were randomly assigned", "Of 994 patients who
  // underwent randomization", "In total 251 subjects were randomised". Both
  // `sample_size` patterns above require the keyword FIRST — one wants
  // `N = 248`, the other `randomised 248 patients` — so the passive voice,
  // which is how a CSR states its own enrolment, was invisible to all seven
  // consumers. This is the change figure-consistency's header asked for by
  // name on 2026-10-26, having measured the route answering `200 []` over
  // "A total of 248 subjects were randomised" against "In total 251 subjects
  // were randomised to treatment".
  //
  // A count read this way may be ARM-level ("496 patients were randomly
  // assigned to receive pembrolizumab, and 498 to receive placebo").
  // figure-consistency's `ARM_LEVEL` guard is widened in the same change to
  // refuse a verdict on those, because reading one arm as the total is a
  // worse failure than reading nothing.
  { label: 'sample_size',      pattern: /\b(?:a\s+total\s+of\s+|in\s+total[,\s]+|of\s+)?([\d,]{1,9})\s+(?:patients|subjects|participants)\s+(?:who\s+)?(?:were|was|underwent|had\s+been)\s+(?:randomly\s+|successfully\s+|subsequently\s+)?(?:randomi[sz]ed|randomi[sz]ation|assigned|allocated|enroll?ed|recruited|screened)\b/gi },

  // ── Figures that had no label at all ─────────────────────────────────────
  // Each is reconciled between the protocol, the SAP, the CSR and Module 2.5,
  // and each was simply absent from the lexicon.
  //
  // The three medians are DISTINCT labels on purpose. One `median_survival`
  // would compare a protocol's median OS against a CSR's median PFS and call
  // the difference a conflict — a fabricated finding, which is precisely what
  // this engine exists to prevent.
  { label: 'median_pfs_months', pattern: anchored(String.raw`median\s+progression[-\s]free\s+survival`, String.raw`([\d.]+)` + ASIDE + String.raw`\s*(months?|years?)`) },
  { label: 'median_os_months',  pattern: anchored(String.raw`median\s+overall\s+survival`, String.raw`([\d.]+)` + ASIDE + String.raw`\s*(months?|years?)`) },
  { label: 'median_dfs_months', pattern: anchored(String.raw`median\s+(?:disease|event|recurrence)[-\s]free\s+survival`, String.raw`([\d.]+)` + ASIDE + String.raw`\s*(months?|years?)`) },
  { label: 'median_followup_months', pattern: anchored(String.raw`median\s+(?:duration\s+of\s+)?follow[-\s]?up(?:\s+time)?`, String.raw`([\d.]+)` + ASIDE + String.raw`\s*(months?|years?)`) },
  // "mean [SD] age, 36.1 [9.1] years" — the bracketed SD sits on either side.
  // Mean and median age are separate figures and a baseline table may state
  // either, so they are separate labels: comparing one document's mean against
  // another's median would be a conflict nobody disagreed about.
  { label: 'mean_age_years',   pattern: anchored(String.raw`mean\s+(?:\[[^\]]{0,12}\]\s+)?age(?:\s+of\s+(?:the\s+)?(?:patients|subjects|participants))?`, String.raw`([\d.]+)\s*(?:\[[^\]]{0,12}\]\s*)?years?`) },
  { label: 'median_age_years', pattern: anchored(String.raw`median\s+age(?:\s+of\s+(?:the\s+)?(?:patients|subjects|participants))?`, String.raw`([\d.]+)\s*(?:\[[^\]]{0,12}\]\s*)?years?`) },
];

/**
 * How a label's written value becomes a number, and at what precision two of them are the
 * same figure.
 *
 * This is the one place per-label numeric normalisation lives. Until 2026-10-19 three
 * modules each had their own, and a `power` of "90%" was 0.9 in one, the string "90" in
 * another, and never compared in the third. `dp` is the decimal places at which two
 * readings count as the same figure: an alpha of 0.0500 and 0.05 agree, and a hazard ratio
 * is reported to three places, so 0.701 and 0.700 are not made to disagree at five.
 */
/**
 * A duration as MONTHS, whichever unit it was written in.
 *
 * A CSR states a median follow-up in months and the publication of the same
 * study states it in years; they are one figure, and leaving them in two units
 * means the reconciler reports "not compared" over a pair that agrees. The
 * unit is the pattern's second capture, which `extractNumericalFacts` puts on
 * the fact as `unit` — so this is a read of what the text said, not a guess.
 */
const durationInMonths = (raw: string, unit?: string): number | null => {
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return /^years?$/i.test(unit ?? '') ? n * 12 : n;
};

const NUMERIC_READING: Readonly<Record<string, { parse?: (raw: string, unit?: string) => number | null; dp: number }>> = {
  sample_size: { dp: 0 },
  sites: { dp: 0 },
  events: { dp: 0 },
  batches: { dp: 0 },
  duration_weeks: { dp: 0 },
  shelf_life: { dp: 0 },
  alpha: { dp: 4 },
  p_value: { dp: 5 },
  hazard_ratio: { dp: 3 },
  odds_ratio: { dp: 3 },
  response_rate: { dp: 2 },
  /* A month, for the medians: two documents rounding 10.35 differently are not
     in conflict about a shelf of months, and a follow-up normalised from 2.1
     years is 25.2, not 25.200000000000003. */
  median_pfs_months: { parse: durationInMonths, dp: 1 },
  median_os_months: { parse: durationInMonths, dp: 1 },
  median_dfs_months: { parse: durationInMonths, dp: 1 },
  median_followup_months: { parse: durationInMonths, dp: 1 },
  mean_age_years: { dp: 1 },
  median_age_years: { dp: 1 },
  power: {
    /* "90%" and "0.90" are the same power. A bare number above 1 is a percentage written
       without its sign, which is how a SAP states it as often as not. */
    parse: (raw) => {
      const pct = raw.includes('%');
      const n = Number(raw.replace(/[%\s,]/g, ''));
      if (!Number.isFinite(n)) return null;
      return pct || n > 1 ? n / 100 : n;
    },
    dp: 3,
  },
};

const DEFAULT_COMPARE_DP = 3;

/** The decimal places at which two readings of `label` count as the same figure. */
export function compareDecimalsFor(label: string): number {
  return NUMERIC_READING[label]?.dp ?? DEFAULT_COMPARE_DP;
}

/**
 * A fact's value as a number, or null when it is not one.
 *
 * Null is an answer, not a zero: `predicate_knumber` is "K123456". A caller that gets null
 * does not compare the fact, and never coerces it — a NaN or a 0 standing in for a figure
 * nobody read is how a missing number becomes a false agreement.
 */
export function numericValueOf(fact: Pick<NumericalFact, 'label' | 'value' | 'unit'>): number | null {
  const spec = NUMERIC_READING[fact.label];
  /* `unit` is optional on the fact and on `parse`, so a caller that holds only
     a label and a value — several do — still type-checks and still reads every
     label whose number means the same thing in any unit. */
  if (spec?.parse) return spec.parse(fact.value, fact.unit);
  const n = Number(String(fact.value).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Round to `dp` places, so two readings of one figure compare as written. */
export function roundToCompare(n: number, label: string): number {
  const f = 10 ** compareDecimalsFor(label);
  return Math.round(n * f) / f;
}

/** Labels whose second capture is an upper bound, not a unit. */
const TWO_BOUND_LABELS = new Set(['confidence_interval', 'age_range']);

/** A Unicode minus (U+2212) does not parse; normalise it to '-'. */
function normaliseSign(v: string): string {
  return v.replace(/−/g, '-');
}

export function extractNumericalFacts(text: string): NumericalFact[] {
  if (!text || text.length < 20) return [];
  const facts: NumericalFact[] = [];
  const seen = new Set<string>();

  for (const { label, pattern } of LABELLED_NUMERIC_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const twoBound = TWO_BOUND_LABELS.has(label);
      const value = normaliseSign(match[1]);
      const offset = match.index;
      const context = extractSentenceContext(text, offset);
      // Dedup by label+value+offset so a single line isn't double-counted
      const key = `${label}:${value}:${offset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({
        label,
        value,
        context,
        offset,
        upper: twoBound ? normaliseSign(match[2]) : undefined,
        unit: twoBound ? undefined : match[2] || undefined,
      });
    }
  }

  return facts;
}

function extractSentenceContext(text: string, offset: number): string {
  const SEARCH_WINDOW = 160;
  const start = Math.max(0, offset - 80);
  const end = Math.min(text.length, offset + SEARCH_WINDOW);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}
