/**
 * Risk management file structure (ISO 14971:2019) — the risk-management process
 * sections, with reviewer questions and a deterministic completeness assessment.
 *
 * WHY THIS EXISTS (audit gap): risk management (MDR Annex II §5; an FDA 510(k)/PMA
 * expectation) was referenced but never structured. This models the ISO 14971
 * Risk Management File (RMF): plan → analysis → evaluation → control → overall
 * residual risk → review → report → production/post-production, each with the
 * questions an assessor asks.
 *
 * HONESTY: reflects the ISO 14971:2019 process structure. It is the regulated
 * structure + reviewer questions, NOT the risk assessment itself and not the
 * assessor's decision — the manufacturer performs the analysis.
 *
 * RISK ACCEPTABILITY (2026-10-05, g-rmf-afap-policy): `riskAcceptabilityPolicy`
 * is the one place the jurisdiction's acceptability principle is stated, and
 * `checkRmfAcceptabilityLanguage` the one check of RMF text against it. The
 * risk-management intelligence flow and its war-game auditor read both from
 * here. ISO 14971:2019 itself leaves the criteria to the manufacturer (clause
 * 4.2 policy, clause 4.4 plan). It does not require ALARP: clause 4.2 NOTE 1
 * lists ALARP, ALARA and AFAP as approaches the manufacturer's policy can
 * define (recall). The EU requires risks to be reduced as far as possible
 * (AFAP) with no economic stopping rule.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/risk-management-structure
 */

import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';

export interface RmfSection {
  id: string;
  number: string;
  title: string;
  purpose: string;
  required: boolean;
  reviewerQuestions: string[];
}

/** The ISO 14971:2019 risk-management-file sections. */
export const RMF_SECTIONS: RmfSection[] = [
  {
    id: 'plan',
    number: '1',
    title: 'Risk Management Plan',
    purpose: 'Define the scope, responsibilities, the criteria for risk acceptability, verification activities, and the method for collecting/reviewing production and post-production information.',
    required: true,
    reviewerQuestions: [
      'Are the risk-acceptability criteria defined BEFORE the analysis (not reverse-engineered from the results)?',
      'Does the plan assign responsibilities and cover the full device lifecycle?',
    ],
  },
  {
    id: 'analysis',
    number: '2',
    title: 'Risk Analysis',
    purpose: 'Document the intended use and reasonably foreseeable misuse, identify safety-related characteristics, identify hazards and hazardous situations, and estimate the associated risk(s).',
    required: true,
    reviewerQuestions: [
      'Is reasonably foreseeable MISUSE analysed, not just intended use?',
      'Are hazards traced to hazardous situations and to harm (sequence of events), with severity and probability estimated?',
      'Are use-related hazards (use error) included (linking to IEC 62366-1)?',
    ],
  },
  {
    id: 'evaluation',
    number: '3',
    title: 'Risk Evaluation',
    purpose: 'Evaluate each estimated risk against the acceptability criteria from the plan.',
    required: true,
    reviewerQuestions: [
      'Is every estimated risk evaluated against the pre-defined acceptability criteria?',
    ],
  },
  {
    id: 'control',
    number: '4',
    title: 'Risk Control',
    purpose: 'Analyse and implement control options (in priority: inherently safe design → protective measures → information for safety), evaluate residual risk, and check for risks introduced by the controls themselves.',
    required: true,
    reviewerQuestions: [
      'Are control options applied in the ISO 14971 priority order (design first, information for safety last)?',
      'Is residual risk re-evaluated after each control, and are any NEW risks introduced by the controls assessed?',
      'Is the effectiveness of each risk-control measure verified?',
    ],
  },
  {
    id: 'overall_residual_risk',
    number: '5',
    title: 'Evaluation of Overall Residual Risk',
    purpose: 'Evaluate the overall residual risk against the acceptability criteria and the benefits, and ensure significant residual risks are disclosed.',
    required: true,
    reviewerQuestions: [
      'Is the OVERALL residual risk (not just individual risks) judged acceptable against the benefits?',
      'Are significant residual risks disclosed in the accompanying information (IFU)?',
    ],
  },
  {
    id: 'review',
    number: '6',
    title: 'Risk Management Review',
    purpose: 'Review, before release, that the risk management plan was executed and the risk management file is appropriate.',
    required: true,
    reviewerQuestions: [
      'Was a pre-release review performed confirming the plan was implemented and the RMF is complete?',
    ],
  },
  {
    id: 'report',
    number: '7',
    title: 'Risk Management Report',
    purpose: 'Summarise the results of the risk management process and the conclusion on overall residual risk acceptability.',
    required: true,
    reviewerQuestions: [
      'Does the report conclude on overall residual-risk acceptability and reference the supporting RMF records?',
    ],
  },
  {
    id: 'post_production',
    number: '8',
    title: 'Production and Post-Production Activities',
    purpose: 'Define the system to collect and review production and post-production information and to feed it back into the risk management process.',
    required: true,
    reviewerQuestions: [
      'Is there a defined system to feed production/post-production (complaints, PMS/PMCF) data back into the risk analysis?',
      'Are triggers defined for revisiting risk acceptability when new information arrives?',
    ],
  },
];

const SECTION_BY_ID = new Map(RMF_SECTIONS.map((s) => [s.id, s]));

export function getRmfSection(id: string): RmfSection | undefined {
  return SECTION_BY_ID.get(id);
}

export function rmfSectionIds(): string[] {
  return RMF_SECTIONS.map((s) => s.id);
}

export function rmfReviewerQuestions(): Array<{ sectionId: string; question: string }> {
  return RMF_SECTIONS.flatMap((s) => s.reviewerQuestions.map((q) => ({ sectionId: s.id, question: q })));
}

export interface RmfAssessment {
  ready: boolean;
  missingRequiredSections: string[];
  presentCount: number;
  totalRequired: number;
}

export function assessRmfStructure(presentSectionIds: string[]): RmfAssessment {
  const present = new Set(presentSectionIds);
  const required = RMF_SECTIONS.filter((s) => s.required);
  const missingRequiredSections = required.filter((s) => !present.has(s.id)).map((s) => s.id);
  return {
    ready: missingRequiredSections.length === 0,
    missingRequiredSections,
    presentCount: required.length - missingRequiredSections.length,
    totalRequired: required.length,
  };
}

// ── Risk acceptability policy by jurisdiction ───────────────────────────────

export type RmfJurisdiction = 'EU_MDR' | 'EU_IVDR' | 'FDA' | 'OTHER';

export interface RiskAcceptabilityPolicy {
  jurisdiction: RmfJurisdiction;
  /**
   * `AFAP`: reduce risks as far as possible without adversely affecting the
   * benefit-risk ratio. `manufacturer-defined`: the manufacturer's own criteria
   * under ISO 14971:2019 clauses 4.2 and 4.4.
   */
  principle: 'AFAP' | 'manufacturer-defined';
  /** The policy as AnA states it to the client. */
  statement: string;
  /**
   * `false`: the jurisdiction does not permit cost or economic practicability
   * as a reason to stop risk reduction. `true`: no modelled rule of the
   * jurisdiction forbids it; ISO 14971:2019 clause 4.2 NOTE 1 lets the
   * manufacturer's policy adopt ALARP, so its own criteria decide. `null`: the jurisdiction is not modelled, so no
   * permission is asserted either way.
   */
  economicJustificationPermitted: boolean | null;
  /** False when this platform does not model the jurisdiction's own acceptability rules. */
  modelled: boolean;
  basis: RegulatoryBasis[];
}

const ISO_14971_CRITERIA_BASIS: RegulatoryBasis = {
  ref: 'ISO 14971:2019 clauses 4.2 and 4.4',
  confidence: 'recall',
  note: "Clause 4.2: top management defines the policy for establishing criteria for risk acceptability. Clause 4.4: the risk management plan includes those criteria. Clause 7.4 is the benefit-risk analysis for a residual risk not judged acceptable by them. ISO 14971:2019 does not require ALARP: clause 4.2 NOTE 1 lists reducing risk as low as reasonably practicable (ALARP), as low as reasonably achievable (ALARA), or as far as possible without adversely affecting the benefit-risk ratio (AFAP) as approaches the manufacturer's policy can define (recall; secondary sources). The 2007 edition's Annex D material is in ISO/TR 24971:2020. Not checked against the ISO text.",
};

const ANNEX_ZA_BASIS: RegulatoryBasis = {
  ref: 'EN ISO 14971:2019+A11:2021 Annex ZA',
  confidence: 'recall',
  note: 'Understood to require risk reduction as far as possible under MDR/IVDR Annex I, with no room for economic considerations as a reason to stop. Not checked against the CEN/BSI text.',
};

const EU_STATEMENT =
  'For EU devices (MDR/IVDR): reduce every risk as far as possible (AFAP) without adversely affecting the benefit-risk ratio, so that each residual risk and the overall residual risk are acceptable when weighed against the benefits. Cost or economic practicability is not a permitted reason to stop risk reduction.';

function euPolicy(jurisdiction: 'EU_MDR' | 'EU_IVDR'): RiskAcceptabilityPolicy {
  const regulation = jurisdiction === 'EU_MDR' ? { name: 'MDR (EU) 2017/745', eli: 'https://eur-lex.europa.eu/eli/reg/2017/745/oj' } : { name: 'IVDR (EU) 2017/746', eli: 'https://eur-lex.europa.eu/eli/reg/2017/746/oj' };
  return {
    jurisdiction,
    principle: 'AFAP',
    statement: EU_STATEMENT,
    economicJustificationPermitted: false,
    modelled: true,
    basis: [
      {
        ref: `${regulation.name} Annex I §2 and §4`,
        confidence: 'recall',
        url: regulation.eli,
        note: '§2: reducing risks as far as possible means without adversely affecting the benefit-risk ratio. §4: residual risk per hazard and overall residual risk judged acceptable; control measures in priority order. A 2026-10-05 search extract of eur-lex matched the §2 wording; a verbatim read of the eur-lex text is owed before this is regulator-text.',
      },
      ANNEX_ZA_BASIS,
    ],
  };
}

/** The risk-acceptability principle a jurisdiction applies to a device risk management file. */
export function riskAcceptabilityPolicy(jurisdiction: RmfJurisdiction): RiskAcceptabilityPolicy {
  if (jurisdiction === 'EU_MDR' || jurisdiction === 'EU_IVDR') return euPolicy(jurisdiction);
  if (jurisdiction === 'FDA') {
    return {
      jurisdiction,
      principle: 'manufacturer-defined',
      statement:
        'FDA (recall): ISO 14971:2019 is an FDA-recognised consensus standard. Under it the manufacturer defines its risk-acceptability criteria (clause 4.2 policy, clause 4.4 plan) and evaluates residual risk against them, with a benefit-risk analysis (clause 7.4) for any residual risk the criteria do not accept.',
      economicJustificationPermitted: true,
      modelled: true,
      basis: [{ ...ISO_14971_CRITERIA_BASIS, note: `${ISO_14971_CRITERIA_BASIS.note} Because clause 4.2 NOTE 1 lets the manufacturer's policy adopt ALARP, whether practicability or economic considerations count in risk reduction is the manufacturer's choice under its own acceptability criteria. FDA recognises ISO 14971:2019 as a consensus standard and does not mandate it (recall).` }],
    };
  }
  return {
    jurisdiction,
    principle: 'manufacturer-defined',
    statement:
      'This jurisdiction\'s own risk-acceptability rules are not modelled. ISO 14971:2019 leaves the criteria to the manufacturer (clauses 4.2 and 4.4); confirm the regulator\'s expectations before relying on them.',
    economicJustificationPermitted: null,
    modelled: false,
    basis: [ISO_14971_CRITERIA_BASIS],
  };
}

export type RmfAcceptabilityRule = 'alarp' | 'as-low-as-reasonably-practicable' | 'reasonably-practicable' | 'economic-justification';

export interface RmfAcceptabilityFinding {
  rule: RmfAcceptabilityRule;
  /** The matched text. */
  match: string;
  /** Offset of the match in the checked text. */
  index: number;
  message: string;
}

const ALARP_RULES: Array<{ rule: RmfAcceptabilityRule; re: RegExp; message: string }> = [
  { rule: 'as-low-as-reasonably-practicable', re: /\bas\s+low\s+as\s+reasonably\s+practicable\b/gi, message: 'States the ALARP principle. The EU requires risks to be reduced as far as possible (AFAP), not as low as reasonably practicable.' },
  { rule: 'alarp', re: /\bALARP\b/gi, message: 'States the ALARP principle. The EU requires risks to be reduced as far as possible (AFAP), not as low as reasonably practicable.' },
  { rule: 'reasonably-practicable', re: /\breasonably\s+practicable\b/gi, message: '"Reasonably practicable" is a practicability stopping rule. The EU requires risks to be reduced as far as possible (AFAP).' },
];

const COST_TERM = /\b(?:cost|costs|costly|economic|economical|economically|economics|financial|financially|disproportionate|disproportionately|expense|expensive|budget|budgetary|funds|funding|money|affordable|affordability)\b/gi;
const RISK_TERM = /\b(?:risk|risks|residual|control|controls|mitigation|mitigations|mitigate|reduction|reduce|reduced|redesign|measure|measures)\b/i;
/**
 * A negator directly before an ALARP match ("not ALARP", "rather than the
 * ALARP principle"). Only an article or a verb of use may sit between them, so
 * "not acceptable unless ALARP" is not read as a negation.
 */
const NEGATED_BEFORE_ALARP = /\b(?:not|no|never|without|rather\s+than|instead\s+of|regardless\s+of|irrespective\s+of)\s+(?:(?:the|an?|using|use|applying|apply|based\s+on|via|through)\s+)?$/i;
/** An ALARP match followed by a statement that it was not applied ("ALARP was not applied", "the ALARP principle is not used"). */
const NEGATED_AFTER_ALARP = /^\s*(?:\(\s*\w+\s*\)\s*)?(?:principle\s+|approach\s+|criterion\s+|criteria\s+)?(?:is|are|was|were|has\s+been|have\s+been)\s+(?:not|never)\s+(?:been\s+)?(?:applied|used|adopted|followed|relied\s+(?:on|upon)|accepted|permitted|the\s+(?:criterion|principle|policy))\b/i;
const NEGATORS_COST = /\b(?:no|never|without|regardless of|irrespective of|excluding)\b/i;
/**
 * A cost term counts only in a sentence that uses it to stop or justify: a
 * causal or evaluative cue ("because", "judged", "would", "too", "not
 * feasible", "outweigh", "disproportionate"). "Implemented at a cost of USD
 * 2,000" states a fact and is not flagged.
 */
const COST_STOPPING_CUE = /\b(?:because|since|due\s+to|owing\s+to|judged|deemed|would|too|prohibitive|prohibitively|infeasible|feasible|impracticable|practicable|not\s+warranted|unwarranted|not\s+justified|unjustified|disproportionate|disproportionately|outweigh|outweighs|outweighed|exceed|exceeds|exceeded|justify|justified|justifies|justification|considering|in\s+view\s+of|weigh|weighed|weighing|balance|balanced|balancing|trade-?off|no\s+further|not\s+further|stop|stopped|halted|ceased?|not\s+(?:implemented|pursued|undertaken|introduced)|(?:cost|economic|economical|financial|budget|budgetary|commercial)\s+(?:reasons?|grounds)|cost-?effective(?:ness)?|not\s+effective|not\s+affordable|unaffordable)\b/i;
/**
 * An absent resource given as the reason to stop ("stopped as there was no
 * budget"). "No budget" here is the reason, not an exclusion of cost, so the
 * negator does not drop the hit when the sentence also states that risk
 * reduction stopped or a control was not implemented.
 */
const RESOURCE_TERM = /^(?:budget|funds|funding|money)$/i;
const LACK_BEFORE = /\b(?:no|without)\s+(?:any\s+)?$/i;
/** "No budget limit" excludes cost; "no budget" alone is the reason. */
const RESOURCE_LIMIT_AFTER = /^\s*(?:limits?|constraints?|restrictions?|caps?|ceilings?)\b/i;
const STOPPED_CUE = /\b(?:stopped|halted|ceased|not\s+(?:implemented|pursued|undertaken|introduced)|as\s+there\s+(?:was|were|is|are)|because\s+there\s+(?:was|were|is|are))\b/i;
/** A cost term followed by a statement that cost is not a reason (e.g. "Cost is not a permitted reason to stop"). */
const COST_RULED_OUT_AFTER = /^\W*(?:\w+\W+){0,4}?(?:is|are|was|were|be)\s+(?:not|never)\s+(?:(?:a|an)\s+)?(?:(?:permitted|valid|acceptable|allowed)\s+)?(?:reason|justification|ground|grounds|factor|consideration|considered|used|taken into account)\b/i;

/** True when a negator is among the (at most three) words before `at` in `sentence`. */
function negated(sentence: string, at: number, negators: RegExp): boolean {
  return negators.test(sentence.slice(0, at).trimEnd().split(/\s+/).slice(-3).join(' '));
}

/**
 * True when the cost term `term` at `at` is excluded as a reason ("without any
 * economic consideration", "cost is not a reason"). An absent budget given as
 * the reason to stop ("stopped as there was no budget") is not an exclusion.
 */
function costRuledOut(sentence: string, at: number, term: string): boolean {
  const after = sentence.slice(at + term.length);
  if (RESOURCE_TERM.test(term) && LACK_BEFORE.test(sentence.slice(0, at)) && !RESOURCE_LIMIT_AFTER.test(after) && STOPPED_CUE.test(sentence)) return false;
  return negated(sentence, at, NEGATORS_COST) || COST_RULED_OUT_AFTER.test(after);
}

/** True when the ALARP match at [start, end) is stated as not applied, before or after. */
function alarpNegated(sentence: string, start: number, end: number): boolean {
  return NEGATED_BEFORE_ALARP.test(sentence.slice(0, start)) || NEGATED_AFTER_ALARP.test(sentence.slice(end));
}

/**
 * Check RMF acceptability text (a policy, a threshold, a residual-risk
 * justification) against the jurisdiction's principle. For the EU it flags
 * ALARP wording not stated as unapplied, and a cost or economic term in a
 * sentence about risk that also carries a stopping or justification cue; ISO 14971:2019 leaves the criteria to the manufacturer, so FDA
 * and unmodelled jurisdictions return [].
 */
export function checkRmfAcceptabilityLanguage(text: string, jurisdiction: RmfJurisdiction): RmfAcceptabilityFinding[] {
  if (riskAcceptabilityPolicy(jurisdiction).principle !== 'AFAP' || !text) return [];
  const findings: RmfAcceptabilityFinding[] = [];
  const sentenceRe = /[^.!?;\n]+[.!?;]?/g;
  for (let m = sentenceRe.exec(text); m; m = sentenceRe.exec(text)) {
    const sentence = m[0];
    const taken: Array<[number, number]> = [];
    for (const { rule, re, message } of ALARP_RULES) {
      re.lastIndex = 0;
      for (let a = re.exec(sentence); a; a = re.exec(sentence)) {
        const start = a.index;
        const end = start + a[0].length;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        if (alarpNegated(sentence, start, end)) continue;
        findings.push({ rule, match: a[0], index: m.index + start, message });
      }
    }
    if (!RISK_TERM.test(sentence) || !COST_STOPPING_CUE.test(sentence)) continue;
    COST_TERM.lastIndex = 0;
    for (let c = COST_TERM.exec(sentence); c; c = COST_TERM.exec(sentence)) {
      if (costRuledOut(sentence, c.index, c[0])) continue;
      findings.push({
        rule: 'economic-justification',
        match: c[0],
        index: m.index + c.index,
        message: 'Cites cost or economic practicability in a statement about risk. The EU does not permit economic considerations as a reason to stop risk reduction.',
      });
      break;
    }
  }
  return findings.sort((x, y) => x.index - y.index);
}

export default { RMF_SECTIONS, getRmfSection, rmfSectionIds, rmfReviewerQuestions, assessRmfStructure, riskAcceptabilityPolicy, checkRmfAcceptabilityLanguage };
