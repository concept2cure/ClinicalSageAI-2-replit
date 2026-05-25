/**
 * Intelligent Document System - Phase 5
 * 
 * Redesigned for the SHERPA metaphor: The platform ANTICIPATES your needs.
 * Zero manual work for traceability, proactive compliance, seamless data flow.
 */

// Main unified workspace
export { DocumentWorkspace } from './DocumentWorkspace';

// Smart components
export {
  ClaimHighlightMark,
  ClaimIndicator,
  ClaimSummaryStrip,
  ClaimTooltip,
} from './SmartClaimHighlighter';
export { SourceSuggestionPanel } from './SourceSuggestionPanel';
export { ComplianceGuardian } from './ComplianceGuardian';
export { DocumentSherpa } from './DocumentSherpa';

// Data flow integration
export { CrossModuleDataBridge } from './CrossModuleDataBridge';
export { AutoTraceabilityEngine } from './AutoTraceabilityEngine';

// Types
export type {
  IntelligentDocument,
  SmartClaim,
  SourceSuggestion,
  ComplianceGuard,
  SherpaGuidance,
  DataBridgeConnection,
} from './types';
