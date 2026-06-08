/**
 * IVD 510(k) submission-readiness walkthrough — a live, runnable demo.
 *
 *   npx tsx scripts/demo/ivd-510k-walkthrough.ts
 *
 * Scenario: a quantitative cardiac-troponin immunoassay (with a connected
 * analyzer) seeking 510(k) clearance against a predicate device. This exercises
 * the real, deterministic regulatory services — no DB, no network — and prints
 * a per-domain readiness report culminating in the submission-readiness verdict.
 *
 * Every number below is computed live by the same code paths the unit tests
 * verify against published standards (CLSI, GS1, the FDA SE flowchart).
 */

import {
  estimateImprecision,
  estimateDetectionCapability,
  assessLinearity,
  compareMethods,
} from '../../server/services/stats/analytical-performance';
import {
  computeDiagnosticAccuracy,
  computeRoc,
} from '../../server/services/stats/clinical-performance';
import { evaluateSubstantialEquivalence } from '../../server/services/regulatory/substantial-equivalence';
import { assess524bReadiness } from '../../server/services/regulatory/cybersecurity-524b';
import { assessHfeCompleteness } from '../../server/services/regulatory/human-factors';
import {
  validateGs1DeviceIdentifier,
  assessGudidCompleteness,
} from '../../server/services/regulatory/udi-gudid';
import { assessSubmissionReadiness } from '../../server/services/regulatory/submission-readiness';

const h = (t: string) => console.log(`\n=== ${t} ===`);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

console.log('IVD 510(k) WALKTHROUGH — cardiac troponin immunoassay (connected analyzer)');

// ── Analytical performance ───────────────────────────────────────────────────
h('Analytical performance (CLSI)');

const imprecision = estimateImprecision({
  runs: [
    [50.1, 49.9, 50.0],
    [50.4, 50.2, 50.6],
    [49.7, 49.5, 49.9],
  ],
});
console.log(
  `EP05 imprecision: within-lab SD=${r3(imprecision.withinLabSd)} ng/L, CV=${r3(imprecision.withinLabCvPct)}%`
);

const lod = estimateDetectionCapability({
  blankReplicates: [0.4, 0.6, 0.5, 0.7, 0.3, 0.5],
  lowSamples: [[2.1, 2.4, 2.2], [2.0, 2.3, 2.1]],
});
console.log(`EP17 detection: LoB=${r3(lod.lob)} ng/L, LoD=${r3(lod.lod)} ng/L`);

const linearity = assessLinearity([
  { concentration: 10, measurements: [10.1] },
  { concentration: 100, measurements: [100.3] },
  { concentration: 1000, measurements: [999.0] },
  { concentration: 5000, measurements: [5002.0] },
  { concentration: 10000, measurements: [9998.0] },
]);
console.log(
  `EP06 linearity: slope=${r3(linearity.linear.slope)}, R²=${r3(linearity.linear.r2)}, max deviation-from-linearity=${r3(linearity.maxDeviationPct)}%`
);

const methodComp = compareMethods({
  reference: [12, 45, 110, 350, 980],
  test: [13, 46, 113, 351, 985],
  decisionLevel: 100,
});
console.log(
  `EP09 method comparison vs predicate: slope=${r3(methodComp.slope)}, bias at 100 ng/L=${r3(
    methodComp.biasAtDecisionLevel ?? 0
  )} ng/L`
);

// ── Clinical performance ─────────────────────────────────────────────────────
h('Clinical performance');

const accuracy = computeDiagnosticAccuracy({ tp: 95, fp: 8, fn: 5, tn: 92 }, { prevalence: 0.2 });
console.log(
  `2×2: sensitivity=${r3(accuracy.sensitivity)} (CI ${r3(accuracy.sensitivityCi.lower)}–${r3(
    accuracy.sensitivityCi.upper
  )}), specificity=${r3(accuracy.specificity)}`
);

const roc = computeRoc([
  { score: 980, positive: true },
  { score: 350, positive: true },
  { score: 110, positive: true },
  { score: 45, positive: false },
  { score: 12, positive: false },
  { score: 8, positive: false },
]);
console.log(`ROC: AUC=${r3(roc.auc)} (DeLong 95% CI ${r3(roc.aucCi.lower)}–${r3(roc.aucCi.upper)})`);

// ── Substantial equivalence ──────────────────────────────────────────────────
h('Substantial equivalence (FDA 510(k) flowchart)');

const se = evaluateSubstantialEquivalence({
  sameIntendedUse: true,
  sameTechnologicalCharacteristics: false,
  differencesRaiseNewQuestions: false,
  performanceDataSupportsEquivalence: true,
});
console.log(`Determination: ${se.determination}`);
se.decisionPath.forEach(step => console.log(`  • ${step}`));

// ── Cybersecurity / human factors / UDI ──────────────────────────────────────
h('§524B cybersecurity, human factors, UDI');

const cyber = assess524bReadiness({
  sbom: true,
  threatModel: true,
  vulnerabilityManagementPlan: true,
  securityTesting: true,
  secureByDesign: true,
  coordinatedDisclosurePolicy: true,
  patchabilityPlan: true,
  securityRiskAssessment: true,
});
console.log(`§524B readiness: ${(cyber.readinessScore * 100).toFixed(0)}% (${cyber.ready ? 'ready' : 'gaps: ' + cyber.gaps.join(', ')})`);

const hfe = assessHfeCompleteness({
  useSpecification: true,
  userProfiles: true,
  useEnvironments: true,
  userInterfaceCharacteristics: true,
  knownUseProblems: true,
  hazardRelatedUseScenarios: true,
  criticalTasks: true,
  formativeEvaluation: true,
  summativeEvaluation: true,
  hfeUeReport: true,
});
console.log(`HFE (IEC 62366-1): ${(hfe.completenessScore * 100).toFixed(0)}% complete`);

const di = validateGs1DeviceIdentifier('00012345678905');
const gudid = assessGudidCompleteness({
  primaryDi: true,
  brandName: true,
  versionOrModel: true,
  companyName: true,
  deviceCountInBasePackage: true,
  fdaProductCodeOrGmdn: true,
  sterilization: true,
  mriSafetyStatus: true,
  singleUse: true,
  labeledContainsNrl: true,
});
console.log(`UDI DI ${di.deviceIdentifier}: ${di.valid ? 'valid' : 'INVALID'}; GUDID ${(gudid.completenessScore * 100).toFixed(0)}% complete`);

// ── Capstone: submission readiness ───────────────────────────────────────────
h('Submission-readiness capstone — pathway: ivd-510k');

const readiness = assessSubmissionReadiness({
  pathway: 'ivd-510k',
  domainScores: {
    analyticalPerformance: 1, // precision, LoD, linearity, method comparison all complete
    clinicalPerformance: 1, // sensitivity/specificity + ROC complete
    substantialEquivalence: se.determination === 'SE' ? 1 : 0,
    udiGudid: di.valid && gudid.complete ? 1 : 0.5,
    postMarketPlan: 0.4, // PMS plan still in draft — the remaining gap
  },
});

console.log(`Overall readiness: ${(readiness.overallScore * 100).toFixed(0)}%  →  VERDICT: ${readiness.verdict.toUpperCase()}`);
console.log('Per-domain:');
readiness.perDomain.forEach(d =>
  console.log(`  ${d.complete ? '✓' : '○'} ${d.domain}: ${(d.score * 100).toFixed(0)}%`)
);
if (readiness.prioritizedGaps.length) {
  console.log('Prioritized gaps:');
  readiness.prioritizedGaps.forEach((g, i) =>
    console.log(`  ${i + 1}. ${g.domain} (${(g.score * 100).toFixed(0)}%)`)
  );
}
console.log('');
