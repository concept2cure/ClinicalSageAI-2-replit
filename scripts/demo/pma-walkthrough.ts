/**
 * PMA (Class III device) walkthrough — runnable demo.
 *
 *   npx tsx scripts/demo/pma-walkthrough.ts
 *
 * Scenario: a next-generation implantable continuous glucose monitor (CGM) with
 * a connected mobile app, seeking Premarket Approval. The capstone scores only the
 * domains an assessor below computes; the others are reported not assessed.
 */

import { computeDiagnosticAccuracy, computeRoc } from '../../server/services/stats/clinical-performance';
import { assess524bArtifacts } from '../../server/services/regulatory/cybersecurity-524b';
import { assessHfeCompleteness } from '../../server/services/regulatory/human-factors';
import { validateGs1DeviceIdentifier } from '../../server/services/regulatory/udi-gudid';
import { assessSplCompleteness } from '../../server/services/regulatory/spl-fhir';
import { assessSubmissionReadiness } from '../../server/services/regulatory/submission-readiness';

const h = (t: string) => console.log(`\n=== ${t} ===`);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

console.log('PMA WALKTHROUGH — implantable CGM with connected app (Class III)');

h('Clinical performance (pivotal trial)');
const acc = computeDiagnosticAccuracy({ tp: 240, fp: 12, fn: 10, tn: 238 }, { prevalence: 0.3 });
console.log(`Sensitivity=${r3(acc.sensitivity)}, specificity=${r3(acc.specificity)}, accuracy=${r3(acc.accuracy)}`);
const roc = computeRoc([
  { score: 0.95, positive: true }, { score: 0.88, positive: true }, { score: 0.7, positive: true },
  { score: 0.4, positive: false }, { score: 0.2, positive: false }, { score: 0.1, positive: false },
]);
console.log(`AUC=${r3(roc.auc)} (DeLong CI ${r3(roc.aucCi.lower)}–${r3(roc.aucCi.upper)})`);

h('§524B cybersecurity (connected device)');
// The connected app makes this a cyber device in the scenario, so §524B applies.
const cyber = assess524bArtifacts({ cyberDevice: true }, [
  'sbom', 'threat_model', 'cybersecurity_risk_assessment', 'cybersecurity_testing', 'cybersecurity_management_plan',
]);
if (cyber.status !== 'required') throw new Error(`§524B not assessed: ${cyber.rationale}`);
console.log(`§524B artifacts recorded present: ${(cyber.completeness * 100).toFixed(0)}% (${cyber.allPresent ? 'all present' : 'missing: ' + cyber.gaps.join(', ')})`);

h('Human factors & UDI & labeling');
const hfe = assessHfeCompleteness({
  useSpecification: true, userProfiles: true, useEnvironments: true,
  userInterfaceCharacteristics: true, knownUseProblems: true,
  hazardRelatedUseScenarios: true, criticalTasks: true, formativeEvaluation: true,
  summativeEvaluation: true, hfeUeReport: true,
});
console.log(`HFE (IEC 62366-1): ${(hfe.completenessScore * 100).toFixed(0)}% complete`);
const di = validateGs1DeviceIdentifier('00012345678905');
console.log(`UDI DI ${di.deviceIdentifier}: ${di.valid ? 'valid' : 'INVALID'}`);
const spl = assessSplCompleteness({
  indicationsAndUsage: true, dosageAndAdministration: true, contraindications: true,
  warningsAndPrecautions: true, adverseReactions: true, drugInteractions: true,
  useInSpecificPopulations: true, description: true, clinicalPharmacology: true,
  howSupplied: true,
});
console.log(`SPL labeling: ${(spl.completenessScore * 100).toFixed(0)}% complete`);

h('Submission-readiness capstone — pathway: pma');
// 2026-10-15: clinicalPerformance and postMarketPlan were typed in as 1 and a valid DI
// check digit stood for UDI/GUDID at 1; nothing here computes those domains, so they
// are left out and reported not assessed.
const readiness = assessSubmissionReadiness({
  pathway: 'pma',
  domainScores: {
    cybersecurity: cyber.completeness, // share of the §524B artifacts recorded present
    humanFactors: hfe.completenessScore,
    labelingSpl: spl.completenessScore,
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
