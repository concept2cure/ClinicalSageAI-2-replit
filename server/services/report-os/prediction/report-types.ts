/**
 * Report-type definitions for the three advisory prediction reports surfaced by
 * the Insights API.
 *
 * These mirror the `REPORT_TYPE_SEED` shape exactly (see `../taxonomy`) so they
 * can be registered alongside the base + global seeds without collision. Every
 * prediction type is advisory: its `truthfulnessRules` permit a partial report
 * and require an explicit confidence, but never assert a validated/final
 * probability — the assembler always emits a `'partial'` status with a mandatory
 * disclosure block.
 *
 * typeIds are unique within the `prediction.*` family and do not overlap any
 * existing base or global-market seed.
 */

import type { ReportTypeDefinition } from '../taxonomy';

export const PREDICTION_REPORT_TYPES: ReportTypeDefinition[] = [
  {
    typeId: 'prediction.deficiency_risk',
    label: 'Deficiency Risk Prediction (RTF / CRL / First-Cycle Approval)',
    family: 'prediction',
    allowedScopes: ['project', 'submission'],
    allowedPersonas: ['ra_lead', 'executive', 'biostatistician'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['submission_readiness', 'risk_model', 'network_prior'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['submission_ops'],
    anaModules: ['ana-ri', 'foresight_risk_synthesis'],
    exportTemplate: 'prediction-advisory-pack',
    governanceRequirements: { part11: true, auditTrail: true },
    truthfulnessRules: { allowPartial: true, requireConfidence: true },
  },
  {
    typeId: 'prediction.readiness_trajectory',
    label: 'Readiness Trajectory Prediction',
    family: 'prediction',
    allowedScopes: ['project', 'submission'],
    allowedPersonas: ['ra_lead', 'executive', 'biostatistician'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['submission_readiness', 'section_status', 'gap_score'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['submission_ops', 'project_sections'],
    anaModules: ['ana-ri', 'foresight_risk_synthesis'],
    exportTemplate: 'prediction-advisory-pack',
    governanceRequirements: { part11: true, auditTrail: true },
    truthfulnessRules: { allowPartial: true, requireConfidence: true },
  },
  {
    typeId: 'prediction.trial_pos',
    label: 'Trial Probability of Success Prediction',
    family: 'prediction',
    allowedScopes: ['project', 'submission', 'study'],
    allowedPersonas: ['ra_lead', 'executive', 'biostatistician'],
    allowedClientSegments: ['pharma', 'device', 'biotech'],
    dataDependencies: ['trial_design', 'evidence_prior', 'monte_carlo_simulation'],
    artifactDependencies: ['concept2cure_artifacts'],
    workflowDependencies: ['study_design'],
    anaModules: ['ana-ri', 'foresight_risk_synthesis'],
    exportTemplate: 'prediction-advisory-pack',
    governanceRequirements: { part11: true, auditTrail: true },
    truthfulnessRules: { allowPartial: true, requireConfidence: true },
  },
];
