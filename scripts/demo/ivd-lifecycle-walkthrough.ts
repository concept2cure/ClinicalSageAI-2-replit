/**
 * Full IVD lifecycle walkthrough — runnable demo.
 *
 *   npx tsx scripts/demo/ivd-lifecycle-walkthrough.ts
 *
 * Exercises the engines built to close the lifecycle audit gaps end-to-end:
 * design controls (DHF) → risk management (ISO 14971) → analytical extensions
 * → software (IEC 62304) → manufacturing → change control → surveillance →
 * post-market authoring → registration. Pure functions only; no database.
 */

import { assessDhfCompleteness } from '../../server/services/regulatory/design-controls';
import { summarizeRiskFile, determineBenefitRisk } from '../../server/services/regulatory/iso-14971-risk';
import {
  assessRealTimeStability, assessCarryover, determineCutoff,
} from '../../server/services/stats/analytical-performance-extensions';
import { assessTraceability } from '../../server/services/regulatory/iso-17511-traceability';
import { assessScientificValidity } from '../../server/services/regulatory/scientific-validity';
import { classifySoftware } from '../../server/services/market-specs/software-lifecycle';
import { assess524bArtifacts } from '../../server/services/regulatory/cybersecurity-524b';
import { computeProcessCapability, evaluateLotRelease } from '../../server/services/regulatory/process-validation';
import { assessFdaChange } from '../../server/services/regulatory/change-assessment';
import { computeDisproportionality } from '../../server/services/stats/signal-disproportionality';
import { assessEuRegistration } from '../../server/services/regulatory/registration-listing';

const h = (t: string) => console.log(`\n=== ${t} ===`);

console.log('IVD LIFECYCLE WALKTHROUGH — design → risk → performance → market → post-market');

h('1. Design controls (DHF) — 21 CFR 820.30');
const dhf = assessDhfCompleteness({
  hasDesignPlan: true,
  inputs: [{ id: 'in1', requirement: 'Sensitivity ≥ 95%', category: 'performance' }],
  outputs: [{ id: 'out1', description: 'Assay protocol', satisfiesInputIds: ['in1'], hasAcceptanceCriteria: true }],
  verifications: [{ id: 'v1', description: 'Bench test', verifiesOutputIds: ['out1'], result: 'pass' }],
  validations: [{ id: 'val1', description: 'Clinical performance', validatesInputIds: ['in1'], productionEquivalent: true, result: 'pass' }],
  reviews: [{ id: 'dr1', phase: 'final', independentReviewerPresent: true, actionItemsOpen: 0 }],
  changes: [],
  designTransferDocumented: true,
});
console.log(`DHF completeness: ${(dhf.completenessScore * 100).toFixed(0)}% — audit ready: ${dhf.auditReady}`);

h('2. Risk management — ISO 14971');
const risk = summarizeRiskFile([
  {
    id: 'r1', hazard: 'incorrect result', hazardousSituation: 'false negative', harm: 'delayed treatment',
    initialSeverity: 'serious', initialP1: 'probable', initialP2: 'occasional',
    controls: [{ id: 'c1', option: 'inherent_safety_by_design', description: 'dual-channel check', verified: true }],
    residualSeverity: 'serious', residualP1: 'improbable', residualP2: 'improbable',
  },
]);
const br = determineBenefitRisk({ benefitDocumented: true, overallResidualAcceptable: risk.overallResidualAcceptable, investigateResidualCount: risk.byResidualRegion.investigate });
console.log(`Residual acceptable: ${risk.overallResidualAcceptable}; benefit-risk favorable: ${br.favorable}`);

h('3. Analytical performance extensions');
const stab = assessRealTimeStability({ points: [{ time: 0, value: 100 }, { time: 90, value: 97 }], initialValue: 100, maxPercentChange: 10 });
console.log(`Shelf-life (real-time): ${stab.shelfLife} days`);
const co = assessCarryover({ lowAfterHigh: [1.05], lowBaseline: [1.0], highSample: [100] });
console.log(`Carryover: ${co.carryoverPct}% — pass: ${co.pass}`);
const cut = determineCutoff([
  { score: 1, positive: false }, { score: 2, positive: false }, { score: 8, positive: true }, { score: 9, positive: true },
]);
console.log(`Cut-off: ${cut.cutoff} (Youden J=${cut.youdenJ})`);
const trace = assessTraceability({ tier: 'si_unit', certifiedReferenceMaterial: true, referenceMeasurementProcedure: true, commutabilityDemonstrated: true, uncertaintyBudgetDocumented: true, unbrokenChain: true });
console.log(`ISO 17511 traceability valid: ${trace.valid}`);

h('4. Scientific validity — IVDR Annex XIII');
const sv = assessScientificValidity({
  analyte: 'PD-L1', clinicalCondition: 'NSCLC', intendedPurpose: 'patient selection',
  evidence: [
    { source: 'guidelines_consensus', reference: 'NCCN', directlyOnTarget: true },
    { source: 'peer_reviewed_studies', reference: 'doi:1', directlyOnTarget: true },
  ],
});
console.log(`Scientific validity: ${sv.verdict} (${(sv.validityScore * 100).toFixed(0)}%)`);

h('5. Software lifecycle — IEC 62304 + cybersecurity');
const sc = classifySoftware({ canContributeToDeathOrSeriousInjury: true });
// The scenario does not say whether the device is a cyber device, so §524B is undetermined.
const cyber = assess524bArtifacts({}, ['threat_model', 'cybersecurity_risk_assessment', 'sbom', 'cybersecurity_management_plan']);
const cyberLine = cyber.status === 'required'
  ? `§524B artifacts missing: ${cyber.gaps.join(', ') || 'none'}`
  : `§524B: ${cyber.status} — ${cyber.rationale}`;
console.log(`Software safety class: ${sc.class}; ${cyberLine}`);

h('6. Manufacturing — capability + lot release');
const cap = computeProcessCapability({ measurements: [10, 10.01, 9.99, 10.0, 10.02, 9.98], lowerSpecLimit: 9, upperSpecLimit: 11 });
const lot = evaluateLotRelease({ lotId: 'L1', tests: [{ parameter: 'potency', result: 98, lowerLimit: 90, upperLimit: 110 }], deviceHistoryRecordComplete: true });
console.log(`Cpk: ${cap.cpk} (capable: ${cap.capable}); lot disposition: ${lot.disposition}`);

h('7. Change control — FDA 510(k) decision');
const change = assessFdaChange({
  affectsIndicationsForUse: false, couldSignificantlyAffectSafetyOrEffectiveness: false,
  changesControlMechanismOrOperatingPrinciple: false, changesPatientContactingMaterials: true,
  softwareChangeAffectsRisk: false, riskAssessmentShowsNewOrModifiedRisk: false, verificationDemonstratesEquivalence: true,
});
console.log(`Change decision: ${change.decision}`);

h('8. Surveillance — disproportionality signal');
const signal = computeDisproportionality({ a: 30, b: 100, c: 10, d: 10000 });
console.log(`PRR=${signal.prr} χ²=${signal.chiSquaredYates} — signal: ${signal.signal}`);

h('9. Post-market authoring — PSUR');
// 2026-10-15: this called report-authoring.ts buildPsur, retired 2026-10-05, so the
// script failed at import. The one PSUR builder persists a program document, which
// this database-free walkthrough does not do, so the step names it and runs nothing.
console.log(
  'Not run here: a PSUR is authored as the program\'s post-market document — ' +
    'POST /api/post-market/programs/:programId/documents/psur/generate ' +
    '(gspr-postmarket/post-market-authoring.ts authorPostMarketDocument, validated by validatePsur).',
);

h('10. EU market access — IVDR registration');
const reg = assessEuRegistration({
  srnAssigned: true, basicUdiDiAssigned: true, udiDiAssigned: true, authorisedRepresentativeDesignated: true,
  isNonEuManufacturer: true, deviceRegisteredInEudamed: true, riskClass: 'C', notifiedBodyCertificateInPlace: true,
});
console.log(`EU registration compliant: ${reg.compliant} (notified body required: ${reg.notifiedBodyRequired})`);
console.log('');
