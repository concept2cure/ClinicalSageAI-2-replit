/**
 * Promotional-language / claims compliance screener for AnA.
 *
 * Deterministic lexicon scan that flags language at risk under FDA OPDP and EU
 * advertising rules and good scientific-writing practice — superiority/
 * superlatives, absolutes, unqualified safety claims, causal overreach, and
 * unsupported comparatives — with the offending phrase, a category, a severity,
 * and a remediation suggestion. A QC pass before any externally-facing or
 * regulatory text goes out.
 *
 * Lexicon-based (not a substitute for regulatory/legal review) — high precision
 * on the listed patterns, conservative on false positives via word boundaries.
 *
 * Two registers. 'promotional' (the default, used by screen_promotional_language)
 * flags every lexicon hit. 'submission' (the Writing Precision Gate default) drops
 * a hit only when it lies inside a named regulatory term of art — the ICH E3 §5.3
 * consent statement, the statutory Breakthrough Therapy designation, FDA endpoint
 * names such as "clinical cure at the test-of-cure visit" — each with its basis.
 * That is a post-match filter over the same lexicon, not a second lexicon.
 *
 * @module server/services/ana/promotional-screening
 */

import type { E3Basis } from '../ind/ctd/types';

export type ClaimCategory =
  | 'superiority'
  | 'absolute'
  | 'unqualified_safety'
  | 'causal_overreach'
  | 'unsupported_comparative'
  | 'promotional_tone'
  /** An approval/success prediction; raised by the gate's submission register. */
  | 'regulatory_outcome';

/** 'promotional' = advertising copy (every hit); 'submission' = regulatory prose. */
export type ClaimRegister = 'promotional' | 'submission';

export type ClaimSeverity = 'high' | 'medium' | 'low';

export interface ClaimFlag {
  phrase: string;
  category: ClaimCategory;
  severity: ClaimSeverity;
  index: number;
  context: string;
  suggestion: string;
}

/** A lexicon hit the submission register dropped as a regulatory term of art. */
export interface ExemptedTerm {
  phrase: string;
  category: ClaimCategory;
  index: number;
  basis: E3Basis;
}

export interface PromotionalScreenResult {
  register: ClaimRegister;
  flags: ClaimFlag[];
  /** Always empty in the promotional register. */
  exempted: ExemptedTerm[];
  total: number;
  byCategory: Record<string, number>;
  highSeverityCount: number;
  verdict: string;
}

interface Rule {
  pattern: RegExp; // must be global; matched case-insensitively
  category: ClaimCategory;
  severity: ClaimSeverity;
  suggestion: string;
}

const RULES: Rule[] = [
  // Superiority / superlatives.
  {
    pattern: /\b(best|safest|strongest|most effective|most powerful|superior|unsurpassed|unmatched|#\s?1|number one|gold standard|breakthrough|miracle|revolutionary|game[- ]chang(?:er|ing)|optimal)\b/gi,
    category: 'superiority',
    severity: 'high',
    suggestion: 'Remove the superlative/superiority claim or restate as a specific, head-to-head, statistically supported comparison.',
  },
  // Absolutes / guarantees.
  {
    pattern: /\b(guarantee[ds]?|always works?|never fails?|100%\s*(?:effective|safe)|all patients|every patient|in all cases|completely|totally)\b/gi,
    category: 'absolute',
    severity: 'high',
    suggestion: 'Replace the absolute with the observed rate and its uncertainty (e.g. "X% of patients (95% CI …)").',
  },
  // Unqualified safety claims.
  {
    pattern: /\b(?:completely\s+safe|perfectly\s+safe|totally\s+safe|no\s+side\s+effects|free\s+of\s+side\s+effects|non[- ]toxic|harmless)\b/gi,
    category: 'unqualified_safety',
    severity: 'high',
    suggestion: 'No drug/device is without risk; report the actual adverse-event profile and avoid blanket safety claims.',
  },
  {
    // "safe" / "well tolerated" as bare claims (word-boundary; not "safety"/"safely").
    pattern: /\b(?:is|was|are|were)\s+(?:safe|well[- ]tolerated)\b/gi,
    category: 'unqualified_safety',
    severity: 'medium',
    suggestion: 'Qualify with the data ("was generally well tolerated, with [most common AEs]…") rather than an unqualified claim.',
  },
  // Causal overreach (esp. from associative/uncontrolled data).
  {
    pattern: /\b(prov(?:es|en|ed)|cures?|eliminat(?:es|ed)|eradicat(?:es|ed)|reverses?|guarantees? (?:a )?(?:cure|response))\b/gi,
    category: 'causal_overreach',
    severity: 'high',
    suggestion: 'Avoid causal/curative language; state the measured effect and the evidence level (e.g. "associated with", "reduced … by").',
  },
  // Unsupported comparatives.
  {
    pattern: /\b(better than|more effective than|safer than|outperforms?|superior to)\b/gi,
    category: 'unsupported_comparative',
    severity: 'medium',
    suggestion: 'A comparative claim needs a direct, adequately-powered head-to-head study; cite it or remove the comparison.',
  },
  // Promotional tone / hype adjectives.
  {
    pattern: /\b(remarkable|dramatic|dramatically|powerful|exciting|impressive|extraordinary|unprecedented|cutting[- ]edge|state[- ]of[- ]the[- ]art)\b/gi,
    category: 'promotional_tone',
    severity: 'low',
    suggestion: 'Replace promotional adjectives with the specific quantitative finding.',
  },
];

interface TermOfArt {
  categories: ClaimCategory[];
  pattern: RegExp; // must be global; spans stay local so a later over-claim in the sentence is not covered
  basis: E3Basis;
}

const CHECKED = '2026-10-04';

/** "All patients" plus at most a short locative ("at participating sites"); no conjunction or relative clause. */
const LOCATIVE_WORD = '(?!(?:and|or|but|who|that|which|were|was|had|have|has)\\b)[\\w-]+';
const CENSUS_SUBJECT =
  '\\b(?:all|every) (?:patients?|subjects?|participants?)' +
  `(?: (?:in|at|from|of) (?:the |each |both )?${LOCATIVE_WORD}(?: ${LOCATIVE_WORD}){0,2}?)?`;

/** The rest of the sentence carries no outcome word; stems, so "improved", "benefited" and "relapse-free" count. */
const NO_OUTCOME_LATER =
  '(?![^.;:]*\\b(?:without (?:any )?(?:relapse|recurrence|progression|disease)|with no\\b|none\\b|successful|' +
  'respon(?:d|se|der)|remission|cur(?:ed|es?)\\b|recover|achiev|improv|benefit|relaps|recurr|healed\\b|survived\\b))';

/** "resolved completely" as an AE outcome is intransitive: the clause ends, or a time point or qualifier follows. */
const AE_OUTCOME_END =
  '(?=\\s*(?:[.;,)]|$)|\\s+(?:(?:without|on|within|after|before|following|at|over|during)\\b|in \\d|' +
  'by (?:(?:study )?(?:day|week|month|visit|cycle)\\b|the (?:end|time|next|final|last)\\b|end of\\b|\\d)))';

/**
 * Submission-register terms of art. A lexicon hit is dropped only when one of
 * these, for the same category, spans the hit — so "the best option … best
 * supportive care" still flags "best option". Facts and URLs:
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b3-writing-gate-register-facts.md
 */
const SUBMISSION_TERMS_OF_ART: TermOfArt[] = [
  {
    categories: ['superiority'],
    pattern: /\bBreakthrough Therapy (?:designat|status)/gi,
    basis: { ref: 'FD&C Act 506(a) (Breakthrough Therapy designation, FDASIA 902)', confidence: 'regulator-text', url: 'https://www.fda.gov/regulatory-information/food-and-drug-administration-safety-and-innovation-act-fdasia/fact-sheet-breakthrough-therapies', checked: CHECKED },
  },
  {
    categories: ['superiority'],
    pattern: /\b(?:best supportive care|best overall response)\b/gi,
    basis: { ref: 'FDA review usage: best supportive care; RECIST 1.1 best overall response', confidence: 'regulator-text', url: 'https://www.fda.gov/media/194468/download', checked: CHECKED },
  },
  {
    categories: ['superiority'],
    pattern: /\bbest[- ]corrected visual acuity\b/gi,
    basis: { ref: 'Ophthalmology efficacy endpoint (BCVA)', confidence: 'recall' },
  },
  {
    categories: ['superiority'],
    pattern: /\boptimal (?:dose|dosage|dosing)\b/gi,
    basis: { ref: 'FDA oncology dosage-optimization guidance (Project Optimus) usage', confidence: 'recall' },
  },
  {
    categories: ['superiority', 'unsupported_comparative'],
    // A hypothesis or objective frame ending just before the comparison. A bare "objective" (response rate) is
    // not one, nor is a stated result ("results continue to demonstrate that").
    pattern: /\b(?:(?:objectives?|aims?|purpose|goal|hypothes[ie]s|designed|powered|intended)(?: (?:was|is|were|are))? to (?:demonstrate|show|establish|test)(?: whether| that)?|tested whether|hypothesi[sz]ed that)\b[^.;:]{0,80}?\bsuperior\b/gi,
    basis: { ref: 'ICH E9 §3.3.1 (trial to show superiority)', confidence: 'recall', url: 'https://www.fda.gov/media/71336/download' },
  },
  {
    categories: ['causal_overreach'],
    // Endpoint usage only; "a clinical cure for hepatitis C" is a claim, not an endpoint.
    pattern: /\b(?:clinical|microbiolog\w*) cure (?:rates?|at|endpoint|visit|assessment|was (?:assessed|defined|evaluated|achieved in))\b|\b(?:rate|proportion) of (?:patients with )?(?:clinical |microbiolog\w* )?cure\b|\bcure rate\b|\btest[- ]of[- ]cure\b/gi,
    basis: { ref: 'FDA cUTI guidance: clinical and microbiological response at the test-of-cure visit', confidence: 'regulator-text', url: 'https://www.fda.gov/files/drugs/published/Complicated-Urinary-Tract-Infections---Developing-Drugs-for-Treatment.pdf', checked: CHECKED },
  },
  {
    categories: ['causal_overreach'],
    pattern: /\b(?:baseline )?(?:pathogens?|organisms?|isolates?|uropathogens?) (?:was|were) (?:\w+ly )?eradicated\b|\bmicrobiolog\w* eradication\b/gi,
    basis: { ref: 'FDA antibacterial microbiology guidance: microbiologic eradication', confidence: 'regulator-text', url: 'https://www.fda.gov/media/77442/download', checked: CHECKED },
  },
  {
    categories: ['causal_overreach'],
    // PK syntax only: "eliminated by/via <route>" or a fixed PK noun phrase, never "eliminates the disease".
    pattern: /\beliminated (?:\w+ly )?(?:unchanged )?(?:by|via|through|in(?: the)?) (?:the )?(?:renal|hepatic|biliary|urin\w*|f(?:a)?ec\w*|metabolism|excretion|kidneys?|liver)\b|\b(?:renal|hepatic|biliary) elimination\b|\belimination (?:half-life|rate|constant)\b/gi,
    basis: { ref: 'Pharmacokinetic elimination (route/clearance)', confidence: 'platform-convention' },
  },
  {
    categories: ['causal_overreach'],
    pattern: /\b(?:biopsy|histolog\w*|patholog\w*|cytolog\w*|culture|radiograph\w*)[- ]proven\b/gi,
    basis: { ref: 'Eligibility criterion (diagnosis confirmed by a named method)', confidence: 'platform-convention' },
  },
  {
    // The consent statement; the verb sits next to the subject (an optional short locative only).
    categories: ['absolute'],
    pattern: new RegExp(`${CENSUS_SUBJECT} (?:provided|gave|signed)(?: (?:written|oral|verbal))? (?:informed )?consent\\b`, 'gi'),
    basis: { ref: 'ICH E3 §5.3 Patient Information and Consent', confidence: 'regulator-text', url: 'https://www.fda.gov/media/84857/download', checked: CHECKED },
  },
  {
    // Disposition census; outcome verbs ("responded", "achieved", "works in") stay flagged, and so does a census
    // verb whose sentence goes on to an outcome ("completed treatment without relapse", "treated successfully").
    categories: ['absolute'],
    pattern: new RegExp(`${CENSUS_SUBJECT} (?:received|completed|were (?:randomi[sz]ed|enrolled|included|dosed|treated|followed)|will be (?:followed|contacted|dosed|treated))\\b${NO_OUTCOME_LATER}`, 'gi'),
    basis: { ref: 'ICH E3 §10.1 Disposition of Patients (accounting for every patient)', confidence: 'recall' },
  },
  {
    categories: ['absolute'],
    // "Drug X completely resolved the disease" has an object and stays flagged; so does "resolved by drug X".
    pattern: new RegExp(`\\b(?:resolved completely|completely resolved)${AE_OUTCOME_END}`, 'gi'),
    basis: { ref: 'Adverse-event outcome term', confidence: 'platform-convention' },
  },
];

interface TermSpan { start: number; end: number }

/**
 * Every term-of-art match in `text`, found once per screen, per term, in
 * ascending order. A lexicon hit is then a lookup, not a re-scan of the whole
 * text with every term pattern (seconds on a CSR-sized document).
 */
function termOfArtSpans(text: string): TermSpan[][] {
  return SUBMISSION_TERMS_OF_ART.map((term) => {
    const spans: TermSpan[] = [];
    term.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = term.pattern.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === term.pattern.lastIndex) term.pattern.lastIndex++; // guard against zero-width
    }
    return spans;
  });
}

/** The term of art (same category, first in list order) whose span covers a lexicon hit, if any. */
function termOfArtCovering(spans: TermSpan[][], category: ClaimCategory, index: number): E3Basis | null {
  for (let t = 0; t < SUBMISSION_TERMS_OF_ART.length; t++) {
    const term = SUBMISSION_TERMS_OF_ART[t];
    if (!term.categories.includes(category)) continue;
    // A global regex's matches do not overlap, so only the last span starting at or before `index` can cover it.
    const list = spans[t];
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].start <= index) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (found >= 0 && index < list[found].end) return term.basis;
  }
  return null;
}

const SEVERITY_RANK: Record<ClaimSeverity, number> = { high: 3, medium: 2, low: 1 };

/** Scan text for promotional / non-compliant claim language. */
export function screenPromotionalLanguage(
  text: string,
  opts: { register?: ClaimRegister } = {}
): PromotionalScreenResult {
  const register: ClaimRegister = opts.register ?? 'promotional';
  const flags: ClaimFlag[] = [];
  const exempted: ExemptedTerm[] = [];
  const byCategory: Record<string, number> = {};
  const spans = register === 'submission' ? termOfArtSpans(text) : null;

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const phrase = m[0];
      const index = m.index;
      const basis = spans ? termOfArtCovering(spans, rule.category, index) : null;
      if (basis) {
        exempted.push({ phrase, category: rule.category, index, basis });
      } else {
        const start = Math.max(0, index - 40);
        const end = Math.min(text.length, index + phrase.length + 40);
        const context = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
        flags.push({ phrase, category: rule.category, severity: rule.severity, index, context, suggestion: rule.suggestion });
        byCategory[rule.category] = (byCategory[rule.category] ?? 0) + 1;
      }
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++; // guard against zero-width
    }
  }

  flags.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.index - b.index);
  const highSeverityCount = flags.filter(f => f.severity === 'high').length;
  const verdict =
    flags.length === 0
      ? 'No promotional/non-compliant claim language detected.'
      : highSeverityCount > 0
        ? `${flags.length} flag(s), including ${highSeverityCount} high-severity — revise before release (FDA OPDP / EU advertising risk).`
        : `${flags.length} flag(s) to review for tone/claims compliance.`;

  return { register, flags, exempted, total: flags.length, byCategory, highSeverityCount, verdict };
}
