/**
 * EU IVDR (CE marking) walkthrough — runnable demo.
 *
 *   npx tsx scripts/demo/eu-ivdr-walkthrough.ts
 *
 * Scenario: an in-vitro diagnostic seeking CE marking under EU IVDR 2017/746,
 * built on the Annex XIII performance-evaluation pillars — a fully-prepared
 * submission across all pillars.
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
  clinicalEvidence: true,
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
// 2026-10-15: analytical and clinical performance were typed in as 1 and a valid DI
// check digit stood for UDI at 1; nothing here computes those domains, so they are
// reported not assessed.
const readiness = assessSubmissionReadiness({
  pathway: 'eu-ivdr',
  domainScores: {
    ivdrPerformanceEvaluation: per.completenessScore,
  },
});
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
console.log(
  readiness.assessedDomainCompleteness === null
    ? 'Completeness of the assessed domains: none assessed'
    : `Completeness of the assessed domains: ${pct(readiness.assessedDomainCompleteness)} (${readiness.perDomain.length} of ${readiness.requiredDomains.length} required domains)  →  verdict: ${readiness.verdict}`,
);
readiness.perDomain.forEach(d => console.log(`  ${d.complete ? '✓' : '○'} ${d.domain}: ${pct(d.score)}`));
if (readiness.notAssessedDomains.length) console.log(`Not assessed: ${readiness.notAssessedDomains.join(', ')}`);
if (readiness.prioritizedGaps.length) {
  console.log('Prioritized gaps:');
  readiness.prioritizedGaps.forEach((g, i) => console.log(`  ${i + 1}. ${g.domain} (${(g.score * 100).toFixed(0)}%)`));
}
console.log('');
