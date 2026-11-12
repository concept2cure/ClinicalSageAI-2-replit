/**
 * @fileoverview Toxicologic-pathology adversity classifier.
 * @module server/services/preclinical/tox-findings-classifier
 *
 * Classifies nonclinical target-organ findings as adverse, adaptive
 * (non-adverse), or an effect to monitor, with a default reversibility and
 * human-relevance call and an overview-ready framing sentence. The point is to
 * give the M2.4 Nonclinical Overview a defensible, consistent treatment of
 * common findings — e.g. hepatocellular hypertrophy framed as adaptive enzyme
 * induction, drug-induced phospholipidosis framed as a monitorable effect —
 * rather than leaving each finding to free-form interpretation.
 *
 * The classification is a *proposed* call grounded in standard toxicologic
 * pathology references (STP "adversity" framework; INHAND nomenclature). It is
 * deliberately conservative: a normally-adaptive finding is escalated to
 * adverse when adverse correlates are present (degeneration, necrosis,
 * inflammation, fibrosis, functional/clin-path change), and unknown findings
 * are returned as indeterminate rather than assumed benign.
 *
 * Pure module — no database, no network. Callable by ANA and the M2.4 builder.
 *
 * @compliance ICH M3(R2); STP "Recommended ('Best') Practices for Determining,
 *   Communicating, and Using Adverse Effect Data" (Kerlin et al., 2016).
 */

export type Adversity = 'adverse' | 'adaptive_non_adverse' | 'monitor' | 'indeterminate';
export type Reversibility = 'reversible' | 'partially_reversible' | 'not_reversible' | 'unknown';
export type HumanRelevance = 'likely' | 'uncertain' | 'low' | 'rodent_specific' | 'unknown';

export interface ToxFindingInput {
  /** Target organ (e.g. "liver"). */
  organ: string;
  /** Finding text (e.g. "hepatocellular hypertrophy"). */
  finding: string;
  /** Severity grade if reported (minimal/mild/moderate/marked/severe). */
  severity?: string | null;
  /** Dose level at which the finding occurred. */
  doseLevel?: string | null;
  /** Reversibility from a recovery cohort, when known. */
  reversible?: boolean | null;
  /** Concurrent correlates that can escalate adversity (e.g. "increased ALT"). */
  correlates?: string[];
}

export interface ClassifiedFinding {
  organ: string;
  finding: string;
  adversity: Adversity;
  reversibility: Reversibility;
  humanRelevance: HumanRelevance;
  /** Why this classification was assigned. */
  rationale: string;
  /** A sentence framed for the M2.4 overview. */
  overviewFraming: string;
  references: string[];
  /** True when an otherwise-adaptive finding was escalated by correlates/severity. */
  escalated: boolean;
  /** Set when an adverse word stands beside a word of negation, which this classifier does not read. */
  negationUnread?: true;
}

export interface ToxFindingsSummary {
  classified: ClassifiedFinding[];
  adverseFindings: ClassifiedFinding[];
  adaptiveFindings: ClassifiedFinding[];
  monitorFindings: ClassifiedFinding[];
  indeterminateFindings: ClassifiedFinding[];
  /** Overview paragraph framing the target-organ profile. */
  overviewParagraph: string;
}

interface KbEntry {
  /** Matches against `${organ} ${finding}` lowercased. */
  pattern: RegExp;
  baseAdversity: Adversity;
  reversibility: Reversibility;
  humanRelevance: HumanRelevance;
  framing: string;
  references: string[];
  /** When true, adverse correlates can escalate this to adverse. */
  escalable: boolean;
}

// Adverse correlates that escalate an otherwise-adaptive finding. The words the
// knowledge base's own adverse rules name are added to these below
// (ADVERSE_WORDS), so this list cannot fall behind them. 2026-11-12: the
// adjectives ("necrotic", "fibrotic") and the reversed order ("ALT increased")
// were not read.
const LAB = String.raw`(?:alt|ast|alp|alkaline phosphatase|alanine aminotransferase|aspartate aminotransferase|gamma[-\s]?glutamyl\w*|ggt|bilirubin|creatinine|bun|urea)`;
const RISE = String.raw`(?:increase[sd]?|elevat\w*|raised|higher)`;
const ADVERSE_CORRELATES = new RegExp(
  [
    String.raw`necro(?:sis|ses|tic|ti[sz]\w*)`, 'degener', 'inflammat', String.raw`fibro(?:sis|tic)`, 'hyperplas', 'neoplas', String.raw`tumou?r`,
    String.raw`single[-\s]?cell death`, 'apoptosis', 'vacuolation with', 'impair', 'dysfunction',
    // "increased ALT", "increases in serum ALT", "elevated alanine aminotransferase"; and the reversed order,
    // "ALT increased", "ALT elevation". Each part is bounded, so a long text cannot make it backtrack.
    String.raw`${RISE}\s+(?:in\s+)?(?:(?:the\s+)?(?:serum|plasma)\s+)?${LAB}`,
    String.raw`\b${LAB}\s+(?:${RISE}|elevation|rise)`,
    'mortality', 'moribund',
  ].join('|'),
  'i',
);

const SEVERE_GRADE = /moderate|marked|severe|grade\s*[4-5]/i;

// Curated knowledge base of well-established toxicologic-pathology calls.
const KB: KbEntry[] = [
  {
    // Hepatocellular only. Until 2026-11-12 the pattern ended in liver.*hypertrophy,
    // which took a Kupffer cell or stellate cell hypertrophy for enzyme induction.
    // INHAND writes the cell type after the change, with qualifiers between: "Hypertrophy, periportal,
    // hepatocellular", "Hypertrophy (hepatocellular)". Up to two words of either kind; each step is bounded.
    pattern: /(?:hepatocellular|hepatocytes?|hepatocytic|centrilobular)(?:[\s,;:()]+[a-z-]+){0,2}[\s,;:()]+hypertrophy|hypertrophy(?:[\s,;:()]+[a-z-]+){0,2}[\s,;:()]+(?:hepatocellular|hepatocytes?|hepatocytic|centrilobular)/,
    baseAdversity: 'adaptive_non_adverse',
    reversibility: 'reversible',
    humanRelevance: 'low',
    framing:
      'consistent with adaptive hepatic enzyme induction and considered non-adverse in the absence of degeneration, necrosis, or hepatic dysfunction',
    references: ['STP adversity framework (Kerlin 2016)', 'Hall et al. 2012, Tox Pathol'],
    escalable: true,
  },
  {
    pattern: /phospholipidosis|foamy macrophage|lamellar bod|myeloid bod/,
    baseAdversity: 'monitor',
    reversibility: 'reversible',
    humanRelevance: 'uncertain',
    framing:
      'drug-induced phospholipidosis, generally reversible and regarded as an effect to monitor rather than frankly adverse unless accompanied by degeneration or functional impairment',
    references: ['FDA phospholipidosis guidance (draft)', 'Reasor 2006'],
    escalable: true,
  },
  {
    // Follicular cell hypertrophy or hyperplasia of the thyroid. Until
    // 2026-11-12 the pattern was thyroid.*(follicular|hypertrophy|hyperplasia):
    // it took a C-cell hyperplasia, a follicular cell carcinoma, a follicular
    // cyst and a parathyroid change for this response.
    // Anchored lookaheads, each read once: the first version of this narrowing,
    // thyroid.*(follicular.*(hypertrophy|…)|…), backtracked in cubic time and
    // took 3 to 5 s on a 20,000-character finding.
    pattern: /^(?=[\s\S]*\bthyroid\b)(?=[\s\S]*\bfollicular\b)(?=[\s\S]*(?:hypertrophy|hyperplasia))/,
    baseAdversity: 'adaptive_non_adverse',
    reversibility: 'reversible',
    humanRelevance: 'rodent_specific',
    framing:
      'a rodent-specific response to hepatic enzyme induction and increased thyroxine clearance, of low relevance to humans',
    references: ['ICH S1B(R1)', 'IARC hepatic enzyme-induction MoA'],
    escalable: true,
  },
  {
    pattern: /alpha.?2u|α2u|hyaline droplet/,
    baseAdversity: 'adaptive_non_adverse',
    reversibility: 'reversible',
    humanRelevance: 'rodent_specific',
    framing:
      'α2u-globulin nephropathy, a male-rat-specific mechanism with no human counterpart',
    references: ['IARC α2u-globulin consensus', 'EPA α2u guidance'],
    escalable: false,
  },
  {
    pattern: /adrenal.*(cortical hypertrophy|vacuolation)/,
    baseAdversity: 'adaptive_non_adverse',
    reversibility: 'reversible',
    humanRelevance: 'uncertain',
    framing:
      'adrenal cortical hypertrophy/vacuolation consistent with a stress or lipid-handling response, non-adverse absent degeneration',
    references: ['STP adversity framework (Kerlin 2016)'],
    escalable: true,
  },
  {
    pattern: /necrosis|degeneration|single[-\s]?cell death/,
    baseAdversity: 'adverse',
    reversibility: 'unknown',
    humanRelevance: 'likely',
    framing: 'a degenerative/necrotic change considered adverse',
    references: ['STP adversity framework (Kerlin 2016)'],
    escalable: false,
  },
  {
    pattern: /inflammation|inflammatory|fibrosis/,
    baseAdversity: 'adverse',
    reversibility: 'partially_reversible',
    humanRelevance: 'likely',
    framing: 'an inflammatory/fibrotic change considered adverse',
    references: ['STP adversity framework (Kerlin 2016)'],
    escalable: false,
  },
  {
    // 2026-11-12: the malignancies a report names were not read, so a sarcoma or
    // a lymphoma beside an adaptive finding left it "not considered to limit the
    // NOAEL". "Mass" and "nodule" are observations, not diagnoses, and are left out.
    pattern: /hyperplasia|neoplas|tumou?r|carcinoma|adenoma|sarcoma|lymphoma|leuka?emia|malignan|metasta|cancer|blastoma|melanoma|mesothelioma/,
    baseAdversity: 'adverse',
    reversibility: 'not_reversible',
    humanRelevance: 'likely',
    framing: 'a proliferative/neoplastic change considered adverse',
    references: ['ICH S1B(R1)', 'STP adversity framework (Kerlin 2016)'],
    escalable: false,
  },
];

function normalizeSeverity(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

/**
 * Every word that marks a change as adverse: the correlates above, and the
 * words of each rule the knowledge base itself files as adverse, each read to
 * the end of the word as it is written ("degeneration", "neoplasm"). Until
 * 2026-11-12 only the correlates were read, and they named "neoplas" and
 * "tumour" but not "adenoma" or "carcinoma": an adaptive finding with a
 * follicular cell adenoma beside it stayed "adaptive, non-adverse ... not
 * considered to limit the NOAEL".
 */
const ADVERSE_WORDS = new RegExp(
  `(?:${[ADVERSE_CORRELATES.source, ...KB.filter((k) => k.baseAdversity === 'adverse').map((k) => k.pattern.source)].join('|')})\\w*`,
  'gi',
);

/**
 * Words of negation. This classifier does NOT read negation: "no necrosis" is
 * counted as necrosis. Reading it was tried on 2026-11-12 and refused twice in
 * review: every rule tried for where an absence ends ("with or without
 * necrosis", "no necrosis, except at the high dose", "no necrosis in any
 * control animal", "not all animals were free of necrosis") lost adverse
 * changes the input stated, tens of thousands of generated inputs in all, and
 * one version hung on a long list. Counting a stated absence as present is the
 * error this classifier may make; missing a stated adverse change is the one it
 * must not. So the reason says when a negation is there, and a pathologist
 * reads it.
 */
const NEGATION = /\b(?:no|not|without|absence|absent|free\s+of|negative\s+for|lack\s+of|lacking|neither|nor|none|non-|un(?:impaired|remarkable|affected))/i;

/**
 * The whole finding, when it is thyroid follicular hyperplasia and nothing
 * else. Its own name holds "hyperplasia", an adverse word: until 2026-11-12 it
 * came back "escalated to adverse due to adverse correlates" with none stated.
 * It is still adverse (a hyperplastic change is not called adaptive here), and
 * the reason now says why, and that the adaptive reading is a pathologist's.
 */
const MILD = String.raw`(?:diffuse|bilateral|unilateral|minimal|mild|slight|grade\s*[12])`;
const THYROID_FOLLICULAR_HYPERPLASIA_ONLY = new RegExp(
  String.raw`^\s*(?:thyroid(?:\s+gland)?\s*:?\s*)?(?:${MILD}\s+)?(?:hyperplasia,?\s+)?follicular(?:[\s-]+(?:cells?|epithelial|epithelium))?`
    + String.raw`(?:[\s-]+(?:hypertrophy\s*(?:\/|and|or)\s*)?hyperplasia)?(?:,?\s*${MILD}){0,2}\s*$`,
);

/**
 * Classify a single target-organ finding.
 *
 * It states only what the input states. Until 2026-11-12:
 *  - thyroid follicular hyperplasia was "escalated to adverse due to adverse
 *    correlates" with none given, because its own name holds "hyperplasia";
 *  - a tumour named as a correlate (an adenoma, a carcinoma, a sarcoma) did
 *    NOT escalate an adaptive finding;
 *  - an escalation by severity alone was framed "with adverse correlates", and
 *    an escalated finding kept the adaptive rule's "reversible" and its low
 *    human relevance, neither of which the input had said;
 *  - a rule that cannot be escalated (hyaline droplets) stayed "adaptive,
 *    non-adverse" with a necrosis stated beside it.
 * It does not read negation (see NEGATION): a stated absence counts as present.
 */
export function classifyToxFinding(input: ToxFindingInput): ClassifiedFinding {
  const { text, words, inCorrelates, negated } = adverseWordsOf(input);
  const entry = KB.find(k => k.pattern.test(text));
  if (!entry) return unmatched(input, words, negated);
  if (entry.baseAdversity === 'adverse') return asKnown(input, entry, negated);
  // A rule that cannot be escalated, with an adverse change stated beside it.
  if (!entry.escalable) return words.length ? besideAdverseChange(input, entry, words, negated) : asKnown(input, entry);

  const isSevere = SEVERE_GRADE.test(normalizeSeverity(input.severity));
  const onlyItsOwnWord = words.every((w) => /^hyperplasia$/i.test(w));
  if (isThyroidFollicularHyperplasiaOnly(input, entry, inCorrelates.length > 0 || isSevere || !onlyItsOwnWord)) return thyroidFollicularHyperplasia(input, entry);
  if (!words.length && !isSevere) return asKnown(input, entry);

  const finding = `${capitalize(input.finding)} in the ${input.organ}`;
  const why = words.length ? `adverse correlates: ${words.join(', ')}` : 'moderate-or-greater severity';
  return {
    organ: input.organ,
    finding: input.finding,
    adversity: 'adverse',
    // An escalated finding does not inherit the adaptive rule's "reversible", nor its low human relevance: what made
    // it adverse is not that response.
    reversibility: statedReversibility(input, 'adverse') ?? 'unknown',
    humanRelevance: 'uncertain',
    rationale: `Normally ${entry.baseAdversity.replace(/_/g, ' ')}, but escalated to adverse due to ${why}.${negated ? NEGATION_NOTE : ''}`,
    overviewFraming: words.length
      ? `${finding}, with adverse correlates, is considered adverse.`
      : `${finding}, at moderate or greater severity, is considered adverse.`,
    references: entry.references,
    escalated: true,
    ...(negated ? { negationUnread: true as const } : {}),
  };
}

/** The adverse words of a finding and its correlates, whole, and whether a word of negation stands beside them. */
function adverseWordsOf(input: ToxFindingInput): { text: string; words: string[]; inCorrelates: string[]; negated: boolean } {
  const text = `${input.organ} ${input.finding}`.toLowerCase();
  const stated = (input.correlates ?? []).filter((c): c is string => typeof c === 'string').map((c) => c.toLowerCase());
  // Each correlate alone, and all of them together: ["increased", "ALT"] is one statement split in two.
  const inCorrelates = [...stated, stated.join(' ')].flatMap((c) => c.match(ADVERSE_WORDS) ?? []);
  const words = [...new Set([...(text.match(ADVERSE_WORDS) ?? []), ...inCorrelates].map((w) => w.replace(/\s+/g, ' ')))];
  return { text, words, inCorrelates, negated: words.length > 0 && [text, ...stated].some((t) => NEGATION.test(t)) };
}

/** Whether the finding is thyroid follicular hyperplasia and nothing else, with nothing stated beside it. */
function isThyroidFollicularHyperplasiaOnly(input: ToxFindingInput, entry: KbEntry, somethingBeside: boolean): boolean {
  return !somethingBeside && entry.pattern.source.includes('thyroid') && THYROID_FOLLICULAR_HYPERPLASIA_ONLY.test(input.finding.toLowerCase());
}

const NEGATION_NOTE =
  ' The text also holds a word of negation; this classifier does not read negation, so the change is counted as present. A pathologist confirms.';

/** What a recovery cohort showed, when the input says: it overrides a rule's default. "Not reversible" is said only of an adverse finding. */
function statedReversibility(input: ToxFindingInput, adversity: Adversity): Reversibility | null {
  if (input.reversible === true) return 'reversible';
  return input.reversible === false && adversity === 'adverse' ? 'not_reversible' : null;
}

/** The rule's own call, unchanged; with the negation note when an adverse call stands beside a word of negation. */
function asKnown(input: ToxFindingInput, entry: KbEntry, negated = false): ClassifiedFinding {
  const noted = negated && entry.baseAdversity === 'adverse';
  return {
    organ: input.organ,
    finding: input.finding,
    adversity: entry.baseAdversity,
    reversibility: statedReversibility(input, entry.baseAdversity) ?? entry.reversibility,
    humanRelevance: entry.humanRelevance,
    rationale: `Classified ${entry.baseAdversity.replace(/_/g, ' ')} — ${entry.framing}.${noted ? NEGATION_NOTE : ''}`,
    overviewFraming: `${capitalize(input.finding)} in the ${input.organ} is ${entry.framing}.`,
    references: entry.references,
    escalated: false,
    ...(noted ? { negationUnread: true as const } : {}),
  };
}

/**
 * No rule matched the finding. With an adverse change stated in it or beside it,
 * that change is adverse; otherwise it is a pathologist's call. (Until 2026-11-12
 * the adverse words of an unmatched finding were not read at all.)
 */
function unmatched(input: ToxFindingInput, adverseWords: string[], negated: boolean): ClassifiedFinding {
  const reversibility: Reversibility = input.reversible == null ? 'unknown' : input.reversible ? 'reversible' : 'not_reversible';
  const base = { organ: input.organ, finding: input.finding, reversibility, humanRelevance: 'unknown' as HumanRelevance, escalated: false };
  if (adverseWords.length) {
    const words = adverseWords;
    return {
      ...base,
      adversity: 'adverse',
      rationale: `No established pattern matched the finding, but adverse changes are stated with it: ${words.join(', ')}.${negated ? NEGATION_NOTE : ''}`,
      overviewFraming: `${capitalize(input.finding)} in the ${input.organ}, with adverse correlates, is considered adverse.`,
      references: ['STP adversity framework (Kerlin 2016)'],
      ...(negated ? { negationUnread: true as const } : {}),
    };
  }
  return {
    ...base,
    adversity: 'indeterminate',
    rationale:
      'No established adaptive/adverse pattern matched; classification requires pathologist judgement in study context.',
    overviewFraming: `${input.finding} in the ${input.organ} requires case-by-case adversity assessment.`,
    references: ['STP adversity framework (Kerlin 2016)'],
  };
}

/**
 * A rule that cannot be escalated (α2u-globulin), with adverse changes stated beside its finding: adverse, the
 * conservative call. Whether those changes belong to the male-rat mechanism, and so have no human counterpart, is the
 * pathologist's: the rule's human relevance is kept and said.
 */
function besideAdverseChange(input: ToxFindingInput, entry: KbEntry, words: string[], negated: boolean): ClassifiedFinding {
  return {
    organ: input.organ,
    finding: input.finding,
    adversity: 'adverse',
    reversibility: statedReversibility(input, 'adverse') ?? 'unknown',
    humanRelevance: entry.humanRelevance,
    rationale: `Normally ${entry.baseAdversity.replace(/_/g, ' ')} (${entry.framing}), but adverse changes are stated beside it: ${words.join(', ')}. Considered adverse here; whether they belong to that mechanism is a pathologist's judgement.${negated ? NEGATION_NOTE : ''}`,
    overviewFraming: `${capitalize(input.finding)} in the ${input.organ}, with adverse changes beside it, is considered adverse; its human relevance is a pathologist's judgement.`,
    references: entry.references,
    escalated: true,
    ...(negated ? { negationUnread: true as const } : {}),
  };
}

/** Thyroid follicular hyperplasia and nothing else: adverse, and said why. */
function thyroidFollicularHyperplasia(input: ToxFindingInput, entry: KbEntry): ClassifiedFinding {
  return {
    organ: input.organ,
    finding: input.finding,
    adversity: 'adverse',
    reversibility: statedReversibility(input, 'adverse') ?? 'unknown',
    humanRelevance: 'uncertain',
    rationale:
      'Classified adverse: hyperplasia is a proliferative change, and this classifier does not call one adaptive. In rodents, '
      + `thyroid follicular hypertrophy and hyperplasia are often ${entry.framing}; whether this one is, is a pathologist's judgement.`,
    overviewFraming: `${capitalize(input.finding)} in the ${input.organ} is classified adverse; whether it is the adaptive rodent response to hepatic enzyme induction is a pathologist's judgement.`,
    references: entry.references,
    escalated: false,
  };
}

/** Classify a set of findings and assemble an overview-ready summary. */
export function classifyToxFindings(inputs: ToxFindingInput[]): ToxFindingsSummary {
  const classified = inputs.map(classifyToxFinding);
  const adverseFindings = classified.filter(c => c.adversity === 'adverse');
  const adaptiveFindings = classified.filter(c => c.adversity === 'adaptive_non_adverse');
  const monitorFindings = classified.filter(c => c.adversity === 'monitor');
  const indeterminateFindings = classified.filter(c => c.adversity === 'indeterminate');

  const parts: string[] = [];
  if (adverseFindings.length) {
    parts.push(
      `Adverse target-organ findings (${adverseFindings.length}): ${adverseFindings
        .map(f => `${f.finding} (${f.organ})`)
        .join('; ')}. These define the NOAEL.`,
    );
    const negated = adverseFindings.filter(f => f.negationUnread);
    if (negated.length) {
      parts.push(
        `For ${negated.map(f => `${f.finding} (${f.organ})`).join('; ')}, the text also holds a word of negation, which this classification does not read; a pathologist confirms.`,
      );
    }
  } else {
    parts.push('No frankly adverse target-organ findings were identified.');
  }
  if (adaptiveFindings.length) {
    parts.push(
      `Adaptive, non-adverse findings: ${adaptiveFindings
        .map(f => `${f.finding} (${f.organ})`)
        .join('; ')}, not considered to limit the NOAEL.`,
    );
  }
  if (monitorFindings.length) {
    parts.push(
      `Findings to monitor: ${monitorFindings.map(f => `${f.finding} (${f.organ})`).join('; ')}.`,
    );
  }
  if (indeterminateFindings.length) {
    parts.push(
      `Findings requiring case-by-case adversity assessment: ${indeterminateFindings
        .map(f => `${f.finding} (${f.organ})`)
        .join('; ')}.`,
    );
  }

  return {
    classified,
    adverseFindings,
    adaptiveFindings,
    monitorFindings,
    indeterminateFindings,
    overviewParagraph: parts.join(' '),
  };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
