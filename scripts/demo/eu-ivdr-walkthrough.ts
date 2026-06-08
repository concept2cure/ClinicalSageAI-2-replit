/**
 * EU IVDR (CE marking) walkthrough — runnable demo.
 *
 *   npx tsx scripts/demo/eu-ivdr-walkthrough.ts
 *
 * Scenario: an in-vitro diagnostic seeking CE marking under EU IVDR 2017/746,
 * built on the Annex XIII performance-evaluation pillars. Shows a "nearly-ready"
 * verdict with a single prioritized gap.
 */

import {
  estimateImprecision,
  estimateDetectionCapability,
  assessLinearity,
} from '../../server/services/stats/analytical-performance';
import { computeDiagnosticAccuracy } from '../../server/services/stats/clinical-performance';
import { assessPerformanceEvaluationReport } from '../../server/services/regulatory/ivdr-performance-evaluation';
import { validateGs1DeviceIdentifier } from '../../server/services/regulatory/udi-gudid';
import { assessSubmissionReadiness } from '../../server/services/regulatory/submission-readiness';

const h = (t: string) => console.log(`\n=== ${t} ===`);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

console.log('EU IVDR WALKTHROUGH — in-vitro diagnostic, CE marking (2017/746)');

h('Performance Evaluation Report (Annex XIII pillars)');
const per = assessPerformanceEvaluationReport({
  scientificValidityReport: true,
  analyticalSensitivity: true,
  analyticalSpecificity: true,
  trueness: true,
  precision: true,
  limitOfDetection: true,
  measuringRange: true,
  diagnosticSensitivity: true,
  diagnosticSpecificity: true,
  // missing: clinicalEvidence
});
console.log(`PER completeness: ${(per.completenessScore * 100).toFixed(0)}%`);
per.pillars.forEach(p => console.log(`  ${p.complete ? '✓' : '○'} ${p.pillar}${p.gaps.length ? ' — gaps: ' + p.gaps.join(', ') : ''}`));

h('Analytical + clinical performance');
const imp = estimateImprecision({ runs: [[5.0, 5.1, 4.9], [5.2, 5.0, 5.1], [4.8, 5.0, 4.9]] });
console.log(`EP05 imprecision: CV=${r3(imp.withinLabCvPct)}%`);
const lod = estimateDetectionCapability({ blankReplicates: [0.1, 0.0, 0.2, 0.1, 0.05], lowSamples: [[0.5, 0.6], [0.55, 0.5]] });
console.log(`EP17 LoB=${r3(lod.lob)}, LoD=${r3(lod.lod)}`);
const lin = assessLinearity([
  { concentration: 1, measurements: [1.02] }, { concentration: 10, measurements: [9.9] },
  { concentration: 100, measurements: [100.4] }, { concentration: 1000, measurements: [998] },
]);
console.log(`EP06 linearity: slope=${r3(lin.linear.slope)}, max deviation=${r3(lin.maxDeviationPct)}%`);
const acc = computeDiagnosticAccuracy({ tp: 91, fp: 6, fn: 9, tn: 94 });
console.log(`Clinical: sensitivity=${r3(acc.sensitivity)}, specificity=${r3(acc.specificity)}`);

h('UDI');
const di = validateGs1DeviceIdentifier('00012345678905');
console.log(`UDI DI ${di.deviceIdentifier}: ${di.valid ? 'valid' : 'INVALID'}`);

h('Submission-readiness capstone — pathway: eu-ivdr');
const readiness = assessSubmissionReadiness({
  pathway: 'eu-ivdr',
  domainScores: {
    ivdrPerformanceEvaluation: per.completenessScore,
    analyticalPerformance: 1,
    clinicalPerformance: 1,
    udiGudid: di.valid ? 1 : 0,
  },
});
console.log(`Overall: ${(readiness.overallScore * 100).toFixed(0)}%  →  VERDICT: ${readiness.verdict.toUpperCase()}`);
readiness.perDomain.forEach(d => console.log(`  ${d.complete ? '✓' : '○'} ${d.domain}: ${(d.score * 100).toFixed(0)}%`));
if (readiness.prioritizedGaps.length) {
  console.log('Prioritized gaps:');
  readiness.prioritizedGaps.forEach((g, i) => console.log(`  ${i + 1}. ${g.domain} (${(g.score * 100).toFixed(0)}%)`));
}
console.log('');
