/**
 * Offline grounding / hallucination evaluation harness.
 *
 * Exercises the real, deterministic answer-grounding check
 * (`verifyAnswerGrounding`) against a curated fixture set of (answer, evidence)
 * pairs with known outcomes, and reports quality metrics — most importantly the
 * fabrication-detection precision and recall. This is the artifact that lets us
 * *prove* the platform's anti-hallucination property to a regulated buyer:
 * fabricated registry/literature/FDA identifiers and unsupported quotes must be
 * caught; genuinely grounded claims must not be falsely flagged.
 *
 * Fully offline — no model, no network. Run via `scripts/eval-grounding.ts` or
 * the accompanying test. Add fixtures here to widen coverage; the harness and
 * metrics adapt automatically.
 *
 * @module server/services/evidence/grounding-eval
 */

import { verifyAnswerGrounding } from '../ana/answer-grounding.js';

export interface GroundingEvalCase {
  name: string;
  category: string;
  /** The model answer under test. */
  answer: string;
  /** The evidence corpus the answer must be grounded in (concatenated tool output). */
  evidence: string;
  /** True when this case SHOULD raise at least one unsupported (fabrication) flag. */
  expectFabrication: boolean;
  /** Optional: specific unsupported-claim kinds that must be among those flagged. */
  expectKinds?: string[];
  /** Optional: minimum grounding ratio expected (for should-ground cases). */
  minRatio?: number;
}

export interface GroundingEvalCaseResult {
  name: string;
  category: string;
  passed: boolean;
  expectFabrication: boolean;
  fabricationDetected: boolean;
  checked: number;
  grounded: number;
  ratio: number;
  unsupportedKinds: string[];
  notes: string[];
}

export interface FabricationMetrics {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface GroundingEvalReport {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  fabrication: FabricationMetrics;
  /** Mean grounding ratio across should-ground (non-fabrication) cases. */
  meanGroundingRatio: number;
  cases: GroundingEvalCaseResult[];
}

/** Evaluate one case against the real grounding check. */
export function evaluateCase(c: GroundingEvalCase): GroundingEvalCaseResult {
  const r = verifyAnswerGrounding(c.answer, c.evidence);
  const unsupportedKinds: string[] = [...new Set(r.unsupported.map(u => u.kind as string))];
  const fabricationDetected = r.unsupported.length > 0;
  const notes: string[] = [];

  let passed = true;
  if (fabricationDetected !== c.expectFabrication) {
    passed = false;
    notes.push(
      c.expectFabrication
        ? 'Expected a fabrication flag but none was raised (missed hallucination).'
        : 'Unexpected fabrication flag on a grounded answer (false positive).'
    );
  }
  if (c.expectKinds) {
    for (const k of c.expectKinds) {
      if (!unsupportedKinds.includes(k)) {
        passed = false;
        notes.push(`Expected unsupported kind "${k}" was not flagged.`);
      }
    }
  }
  if (c.minRatio != null && r.ratio < c.minRatio) {
    passed = false;
    notes.push(`Grounding ratio ${r.ratio.toFixed(2)} below expected minimum ${c.minRatio}.`);
  }

  return {
    name: c.name,
    category: c.category,
    passed,
    expectFabrication: c.expectFabrication,
    fabricationDetected,
    checked: r.checked,
    grounded: r.grounded,
    ratio: r.ratio,
    unsupportedKinds,
    notes,
  };
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

/** Run the full evaluation and compute aggregate metrics. */
export function runGroundingEval(cases: GroundingEvalCase[] = GROUNDING_EVAL_FIXTURES): GroundingEvalReport {
  const results = cases.map(evaluateCase);
  const passed = results.filter(r => r.passed).length;

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const r of results) {
    if (r.expectFabrication && r.fabricationDetected) tp++;
    else if (r.expectFabrication && !r.fabricationDetected) fn++;
    else if (!r.expectFabrication && r.fabricationDetected) fp++;
    else tn++;
  }
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = safeDiv(2 * precision * recall, precision + recall);

  const groundCases = results.filter(r => !r.expectFabrication);
  const meanGroundingRatio = groundCases.length
    ? groundCases.reduce((s, r) => s + r.ratio, 0) / groundCases.length
    : 1;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: safeDiv(passed, results.length),
    fabrication: { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn, precision, recall, f1 },
    meanGroundingRatio,
    cases: results,
  };
}

/**
 * Curated fixture set. Each (answer, evidence) pair has a known outcome covering
 * every checkable identifier kind plus quotes and the no-op edge cases. Evidence
 * strings mimic concatenated tool output (identifiers appear as they would in a
 * tool's JSON result).
 */
export const GROUNDING_EVAL_FIXTURES: GroundingEvalCase[] = [
  {
    name: 'grounded NCT id',
    category: 'trial_registry',
    answer: 'The pivotal study NCT04267848 enrolled 1066 participants.',
    evidence: '{"studies":[{"nctId":"NCT04267848","title":"A pivotal study"}]}',
    expectFabrication: false,
    minRatio: 1,
  },
  {
    name: 'fabricated NCT id',
    category: 'trial_registry',
    answer: 'Results from NCT99999999 support the indication.',
    evidence: '{"studies":[{"nctId":"NCT04267848","title":"A different study"}]}',
    expectFabrication: true,
    expectKinds: ['nct'],
  },
  {
    name: 'grounded DOI',
    category: 'literature',
    answer: 'As reported (10.1056/nejmoa2034577), efficacy was demonstrated.',
    evidence: '{"articles":[{"doi":"10.1056/NEJMoa2034577","title":"Efficacy study"}]}',
    expectFabrication: false,
    minRatio: 1,
  },
  {
    name: 'fabricated DOI',
    category: 'literature',
    answer: 'A meta-analysis (10.1001/jama.2021.99999) found no benefit.',
    evidence: '{"articles":[{"doi":"10.1056/NEJMoa2034577"}]}',
    expectFabrication: true,
    expectKinds: ['doi'],
  },
  {
    name: 'fabricated PMID',
    category: 'literature',
    answer: 'See PMID: 33333333 for the safety analysis.',
    evidence: '{"articles":[{"pmid":"34850847","title":"Safety analysis"}]}',
    expectFabrication: true,
    expectKinds: ['pmid'],
  },
  {
    name: 'fabricated 510(k) predicate',
    category: 'fda_submission',
    answer: 'The cleared predicate device is K123456.',
    evidence: '{"predicate":{"kNumber":"K181234","name":"Predicate device"}}',
    expectFabrication: true,
    expectKinds: ['fda_510k'],
  },
  {
    name: 'fabricated PMA number',
    category: 'fda_submission',
    answer: 'Approved under PMA P987654.',
    evidence: '{"approvals":[{"pma":"P150001"}]}',
    expectFabrication: true,
    expectKinds: ['fda_pma'],
  },
  {
    name: 'fabricated NDA number',
    category: 'fda_submission',
    answer: 'The drug was approved under NDA 021436.',
    evidence: '{"approvals":[{"applicationNumber":"NDA050006"}]}',
    expectFabrication: true,
    expectKinds: ['fda_nda'],
  },
  {
    name: 'unsupported quotation',
    category: 'quote',
    answer: 'The label states "the primary endpoint was met with high significance".',
    evidence: '{"labels":[{"indications":"Indicated for treatment of advanced disease."}]}',
    expectFabrication: true,
    expectKinds: ['quote'],
  },
  {
    name: 'grounded quotation',
    category: 'quote',
    answer: 'The label notes "indicated for treatment of advanced disease" in adults.',
    evidence: '{"labels":[{"indications":"Indicated for treatment of advanced disease in adults."}]}',
    expectFabrication: false,
    minRatio: 1,
  },
  {
    name: 'mixed — one grounded, one fabricated NCT',
    category: 'trial_registry',
    answer: 'Both NCT04267848 and NCT12121212 are relevant precedents.',
    evidence: '{"studies":[{"nctId":"NCT04267848"}]}',
    expectFabrication: true,
    expectKinds: ['nct'],
  },
  {
    name: 'no checkable claims (clean narrative)',
    category: 'edge_case',
    answer: 'The submission readiness is improving, with the clinical module nearing completion.',
    evidence: '{"studies":[{"nctId":"NCT04267848"}]}',
    expectFabrication: false,
    minRatio: 1,
  },
  {
    name: 'no evidence — nothing to verify (no-op)',
    category: 'edge_case',
    answer: 'Per NCT04267848 the trial completed enrollment.',
    evidence: '',
    expectFabrication: false,
    minRatio: 1,
  },
];
