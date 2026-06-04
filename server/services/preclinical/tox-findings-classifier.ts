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

// Adverse correlates that escalate an otherwise-adaptive finding.
const ADVERSE_CORRELATES =
  /necrosis|degener|inflammat|fibrosis|hyperplasia|neoplas|tumou?r|single[-\s]?cell death|apoptosis|vacuolation with|impair|dysfunction|increased\s+(alt|ast|alp|alkaline|bilirubin|ggt|creatinine|bun)|elevated\s+(alt|ast|alp|bilirubin)|mortality|moribund/i;

const SEVERE_GRADE = /moderate|marked|severe|grade\s*[4-5]/i;

// Curated knowledge base of well-established toxicologic-pathology calls.
const KB: KbEntry[] = [
  {
    pattern: /hepatocellular hypertrophy|hepatocyte hypertrophy|centrilobular hypertrophy|liver.*hypertrophy/,
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
    pattern: /thyroid.*(follicular|hypertrophy|hyperplasia)/,
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
    pattern: /hyperplasia|neoplas|tumou?r|carcinoma|adenoma/,
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

/** Classify a single target-organ finding. */
export function classifyToxFinding(input: ToxFindingInput): ClassifiedFinding {
  const haystack = `${input.organ} ${input.finding}`.toLowerCase();
  const correlatesText = (input.correlates ?? []).join(' ');
  const hasAdverseCorrelate =
    ADVERSE_CORRELATES.test(correlatesText) || ADVERSE_CORRELATES.test(haystack.replace(input.finding.toLowerCase(), ''));
  const isSevere = SEVERE_GRADE.test(normalizeSeverity(input.severity));

  const entry = KB.find(k => k.pattern.test(haystack));

  if (!entry) {
    return {
      organ: input.organ,
      finding: input.finding,
      adversity: 'indeterminate',
      reversibility: input.reversible == null ? 'unknown' : input.reversible ? 'reversible' : 'not_reversible',
      humanRelevance: 'unknown',
      rationale:
        'No established adaptive/adverse pattern matched; classification requires pathologist judgement in study context.',
      overviewFraming: `${input.finding} in the ${input.organ} requires case-by-case adversity assessment.`,
      references: ['STP adversity framework (Kerlin 2016)'],
      escalated: false,
    };
  }

  let adversity = entry.baseAdversity;
  let escalated = false;
  let rationale: string;

  if (entry.escalable && entry.baseAdversity !== 'adverse' && (hasAdverseCorrelate || isSevere)) {
    adversity = 'adverse';
    escalated = true;
    rationale = `Normally ${entry.baseAdversity.replace(/_/g, ' ')}, but escalated to adverse due to ${
      hasAdverseCorrelate ? 'adverse correlates' : 'moderate-or-greater severity'
    }.`;
  } else {
    rationale = `Classified ${adversity.replace(/_/g, ' ')} — ${entry.framing}.`;
  }

  // Reversibility: explicit recovery-cohort data overrides the default.
  let reversibility: Reversibility = entry.reversibility;
  if (input.reversible === true) reversibility = 'reversible';
  else if (input.reversible === false) reversibility = adversity === 'adverse' ? 'not_reversible' : reversibility;

  const framing = escalated
    ? `${capitalize(input.finding)} in the ${input.organ}, with adverse correlates, is considered adverse.`
    : `${capitalize(input.finding)} in the ${input.organ} is ${entry.framing}.`;

  return {
    organ: input.organ,
    finding: input.finding,
    adversity,
    reversibility,
    humanRelevance: entry.humanRelevance,
    rationale,
    overviewFraming: framing,
    references: entry.references,
    escalated,
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
