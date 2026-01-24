/**
 * Innovation Platform Components Index
 * 
 * Exports all 8 innovative platform features for the TrialSage platform.
 */

// Feature 1: Regulatory Delta Radar
// Auto-surface changes vs agency guidance documents
export { RegulatoryDeltaRadar } from './RegulatoryDeltaRadar';
export { default as RegulatoryDeltaRadarDefault } from './RegulatoryDeltaRadar';

// Feature 2: Evidence Confidence Heatmap
// Live scoring showing weak citation areas across submission sections
export { EvidenceConfidenceHeatmap } from './EvidenceConfidenceHeatmap';
export { default as EvidenceConfidenceHeatmapDefault } from './EvidenceConfidenceHeatmap';

// Feature 3: Submission Readiness Twin
// Predictive digital twin for GA readiness scoring
export { SubmissionReadinessTwin } from './SubmissionReadinessTwin';
export { default as SubmissionReadinessTwinDefault } from './SubmissionReadinessTwin';

// Feature 4: Auto-Traceability Panel
// Automatic linking during document drafting with semantic analysis
export { AutoTraceabilityPanel } from './AutoTraceabilityPanel';
export { default as AutoTraceabilityPanelDefault } from './AutoTraceabilityPanel';

// Feature 5: Adaptive Reviewer Workspace
// Role-specific UI presets and personalization
export { AdaptiveReviewerWorkspace } from './AdaptiveReviewerWorkspace';
export { default as AdaptiveReviewerWorkspaceDefault } from './AdaptiveReviewerWorkspace';

// Feature 6: Outcome-Based Template Learning
// Track which templates reduced agency questions
export { OutcomeBasedTemplateLearning } from './OutcomeBasedTemplateLearning';
export { default as OutcomeBasedTemplateLearningDefault } from './OutcomeBasedTemplateLearning';

// Feature 7: Regulatory Negotiation Logbook
// Structured record of agency correspondence and meeting outcomes
export { RegulatoryNegotiationLogbook } from './RegulatoryNegotiationLogbook';
export { default as RegulatoryNegotiationLogbookDefault } from './RegulatoryNegotiationLogbook';

// Feature 8: Compliance Guardrails SDK
// Pre-submission validation API with CI/CD integration
export { ComplianceGuardrailsSDK } from './ComplianceGuardrailsSDK';
export { default as ComplianceGuardrailsSDKDefault } from './ComplianceGuardrailsSDK';

/**
 * All Innovation Components Map
 * Useful for dynamic component loading and routing
 */
export const InnovationComponents = {
  RegulatoryDeltaRadar: 'regulatory-delta-radar',
  EvidenceConfidenceHeatmap: 'evidence-confidence-heatmap',
  SubmissionReadinessTwin: 'submission-readiness-twin',
  AutoTraceabilityPanel: 'auto-traceability-panel',
  AdaptiveReviewerWorkspace: 'adaptive-reviewer-workspace',
  OutcomeBasedTemplateLearning: 'outcome-based-template-learning',
  RegulatoryNegotiationLogbook: 'regulatory-negotiation-logbook',
  ComplianceGuardrailsSDK: 'compliance-guardrails-sdk'
} as const;

export type InnovationComponentKey = keyof typeof InnovationComponents;
