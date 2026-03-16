/**
 * Claude Services — Public API
 *
 * All Claude/Anthropic AI integrations exported from a single entry point.
 */

export {
  ClaudeDocumentDraftingService,
  getClaudeDraftingService,
  type DocumentDraftRequest,
  type DocumentDraftResponse,
  type VisionAnalysisRequest,
  type BatchDocumentRequest,
  type RegulatoryFramework,
} from './ClaudeDocumentDraftingService';

export {
  DOCUMENT_DRAFTING_TOOLS,
  COMPLIANCE_REVIEW_TOOLS,
  GAP_ANALYSIS_TOOLS,
  ALL_CLAUDE_TOOLS,
  SEARCH_CLINICAL_EVIDENCE,
  SEARCH_LITERATURE,
  LOOKUP_FDA_GUIDANCE,
  LOOKUP_ICH_GUIDELINE,
  CHECK_REGULATORY_COMPLIANCE,
  VALIDATE_CROSS_REFERENCES,
  GENERATE_CITATION,
  ANALYZE_PREDICATE_DEVICE,
  EXTRACT_DOCUMENT_STRUCTURE,
} from './ClaudeToolDefinitions';
