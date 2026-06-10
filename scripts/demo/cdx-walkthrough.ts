/**
 * Companion-diagnostic (CDx) co-development walkthrough — runnable demo.
 *
 *   npx tsx scripts/demo/cdx-walkthrough.ts
 *
 * Scenario: a PD-L1 companion diagnostic IVD co-developed with a checkpoint-
 * inhibitor therapeutic — the drug↔Dx pair the platform uniquely spans. Shows
 * the "ready" end of the verdict range.
 */

import {
  estimateImprecision,
  estimateDetectionCapability,
} from '../../server/services/stats/analytical-performance';
import { computeDiagnosticAccuracy } from '../../server/services/stats/clinical-performance';
import { assessCdxReadiness } from '../../server/services/regulatory/companion-diagnostics';
import { assessSubmissionReadiness } from '../../server/services/regulatory/submission-readiness';

const h = (t: string) => console.log(`\n=== ${t} ===`);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

console.log('CDx WALKTHROUGH — PD-L1 companion diagnostic + checkpoint-inhibitor therapeutic');

h('Drug↔Dx co-development linkage');
const cdx = assessCdxReadiness({
  therapeuticProductIdentified: true,
  diagnosticDeviceIdentified: true,
  biomarkerDefined: true,
  intendedUseAlignment: true,
  analyticalValidation: true,
  clinicalValidation: true,
  labelingCrossReference: true,
  contemporaneousReview: true,
});
console.log(`Linkage established: ${cdx.linkageEstablished}; co-development readiness: ${(cdx.readinessScore * 100).toFixed(0)}%`);

h('Analytical performance');
const imp = estimateImprecision({ runs: [[0.82, 0.8, 0.81], [0.79, 0.81, 0.8], [0.83, 0.82, 0.81]] });
console.log(`EP05 imprecision (scoring proportion): CV=${r3(imp.withinLabCvPct)}%`);
const lod = estimateDetectionCapability({ blankReplicates: [0.01, 0.0, 0.02, 0.01], lowSamples: [[0.05, 0.06]] });
console.log(`EP17 LoD=${r3(lod.lod)}`);

h('Clinical performance (concordance with outcome)');
const acc = computeDiagnosticAccuracy({ tp: 88, fp: 9, fn: 7, tn: 96 });
console.log(`Sensitivity=${r3(acc.sensitivity)}, specificity=${r3(acc.specificity)}, AUC-adjacent agreement κ=${r3(acc.cohensKappa)}`);

h('Submission-readiness capstone — pathway: cdx');
const readiness = assessSubmissionReadiness({
  pathway: 'cdx',
  domainScores: {
    companionDiagnostics: cdx.ready ? 1 : cdx.readinessScore,
    analyticalPerformance: 1,
    clinicalPerformance: 1,
    postMarketPlan: 1,
  },
});
console.log(`Overall: ${(readiness.overallScore * 100).toFixed(0)}%  →  VERDICT: ${readiness.verdict.toUpperCase()}`);
readiness.perDomain.forEach(d => console.log(`  ${d.complete ? '✓' : '○'} ${d.domain}: ${(d.score * 100).toFixed(0)}%`));
console.log('');
