/**
 * Intelligent Document System Types
 * 
 * Phase 5: Redesigned with user-centric approach
 * The user never sees hashes, version IDs, or database concepts.
 * Everything is presented in terms they understand.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Document Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IntelligentDocument {
  id: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  content: string;
  
  // Submission context - which workflow is this part of?
  submissionContext?: SubmissionContext;
  
  // Smart metadata - user-friendly, not database IDs
  lastEditedBy: string;
  lastEditedAt: Date;
  completionPercent: number;
  
  // Sherpa guidance
  nextActions: SherpaGuidance[];
  blockers: DocumentBlocker[];
  
  // Compliance state - simple traffic light
  complianceStatus: 'ready' | 'needs-attention' | 'blocked';
  complianceScore: number;
}

export type DocumentType = 
  | 'ind_module2'
  | 'ind_module3'
  | '510k_narrative'
  | '510k_summary'
  | 'cer_clinical_evaluation'
  | 'nda_clinical_overview'
  | 'protocol'
  | 'csr'
  | 'ib'
  | 'briefing_document'
  | 'regulatory_response'
  | 'custom';

export type DocumentStatus =
  | 'draft'
  | 'in-review'
  | 'pending-approval'
  | 'approved'
  | 'published';

export interface SubmissionContext {
  submissionType: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'CER' | 'MAA' | 'DE_NOVO';
  projectId: string;
  projectName: string;
  moduleNumber?: string;
  sectionNumber?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Claim Detection - AI identifies claims automatically
// ─────────────────────────────────────────────────────────────────────────────

export interface SmartClaim {
  id: string;
  text: string;
  position: { from: number; to: number };
  
  // Claim classification - what kind of statement is this?
  claimType: ClaimType;
  
  // Confidence in claim detection (0-100)
  detectionConfidence: number;
  
  // Source status - user-friendly traffic light
  sourceStatus: 'supported' | 'needs-source' | 'unsupported';
  
  // Linked sources (if any)
  linkedSources: SourceSuggestion[];
  
  // Regulatory requirement - why does this need a source?
  regulatoryContext?: string;
}

export type ClaimType = 
  | 'efficacy'       // "The device demonstrated 95% accuracy"
  | 'safety'         // "No adverse events were reported"
  | 'design'         // "The device uses titanium housing"
  | 'regulatory'     // "The predicate device was cleared in 2020"
  | 'clinical'       // "In clinical trials..."
  | 'statistical'    // "P < 0.001"
  | 'manufacturing'  // "Manufactured per GMP standards"
  | 'comparison';    // "Superior to standard of care"

// ─────────────────────────────────────────────────────────────────────────────
// Source Suggestions - AI-powered, zero manual work
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceSuggestion {
  id: string;
  
  // User-friendly source info
  title: string;
  sourceType: SourceType;
  citation: string;           // Pre-formatted citation ready to use
  relevanceScore: number;     // 0-100, how well it supports the claim
  
  // Quick preview - what the user cares about
  keyExcerpt: string;
  pageReference?: string;
  
  // Where this came from - but hidden from user by default
  dataModule: DataModule;
  
  // Is this already linked to this document?
  isLinked: boolean;
  linkConfidence?: number;
}

export type SourceType = 
  | 'clinical_study'
  | 'predicate_device'       // From 510k workflow
  | 'literature'             // From literature search
  | 'test_report'            // From CMC/testing
  | 'regulatory_document'    // FDA guidance, etc.
  | 'internal_data'          // Company data
  | 'manufacturing_record';  // CMC data

// Cross-module data sources - where data flows FROM
export type DataModule = 
  | 'predicate_finder'       // Predicate devices from 510k
  | 'literature_search'      // Literature from search
  | 'cmc_data'               // Manufacturing data
  | 'clinical_trials'        // Trial data
  | 'vault'                  // Uploaded documents
  | 'maude'                  // FDA adverse event data
  | 'faers'                  // Drug adverse event data
  | 'intelligence_feeds';    // Lumen cortex data

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Guardian - Proactive, not reactive
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceGuard {
  id: string;
  type: GuardType;
  severity: 'error' | 'warning' | 'suggestion';
  
  // User-friendly message
  title: string;
  description: string;
  
  // What to do about it - actionable
  action: ComplianceAction;
  
  // Location in document
  position?: { from: number; to: number };
  affectedText?: string;
  
  // Regulatory reference - for those who want details
  regulatoryRef?: string;
}

export type GuardType = 
  | 'unsupported_claim'      // Claim without source
  | 'missing_section'        // Required section not present
  | 'outdated_source'        // Source has been updated
  | 'inconsistent_data'      // Data doesn't match across docs
  | 'formatting_issue'       // Wrong format for submission
  | 'terminology_issue'      // Non-standard terminology used
  | 'length_issue'           // Section too long/short
  | 'missing_signature';     // Needs approval

export interface ComplianceAction {
  type: 'link-source' | 'add-section' | 'update-source' | 'fix-format' | 'review' | 'approve';
  label: string;              // "Link a source"
  autoFixAvailable: boolean;  // Can we fix this automatically?
  targetId?: string;          // What to navigate to
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Sherpa - The AI guide that anticipates needs
// ─────────────────────────────────────────────────────────────────────────────

export interface SherpaGuidance {
  id: string;
  priority: 'high' | 'medium' | 'low';
  
  // Clear, actionable guidance
  title: string;
  description: string;
  
  // What happens if you do this
  expectedOutcome: string;
  
  // How to do it
  actionType: GuidanceActionType;
  actionTarget?: string;      // Where to navigate
  
  // Time estimate
  estimatedTime: string;
  
  // Why is this important?
  rationale: string;
}

export type GuidanceActionType =
  | 'write-section'
  | 'review-claims'
  | 'add-sources'
  | 'update-from-module'      // Pull data from another module
  | 'review'                  // Complete pending reviews assigned to the user
  | 'request-review'
  | 'submit-for-approval'
  | 'export-document';

export interface DocumentBlocker {
  id: string;
  title: string;
  description: string;
  blocker: string;           // What's blocking progress
  resolution: string;        // How to resolve
  severity: 'critical' | 'major' | 'minor';
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Module Data Bridge - Seamless data flow
// ─────────────────────────────────────────────────────────────────────────────

export interface DataBridgeConnection {
  id: string;
  sourceModule: DataModule;
  targetDocumentId: string;
  
  // What data is available
  dataType: BridgeDataType;
  dataLabel: string;
  
  // Status
  status: 'connected' | 'available' | 'needs-update' | 'missing';
  lastSyncedAt?: Date;
  
  // Preview of available data
  preview: string;
  itemCount: number;
}

export type BridgeDataType = 
  | 'predicate_devices'      // From Predicate Finder
  | 'literature_citations'   // From Literature Search
  | 'clinical_endpoints'     // From Clinical Data
  | 'manufacturing_specs'    // From CMC
  | 'testing_results'        // From Test Reports
  | 'regulatory_references'  // From Intelligence Feeds
  | 'safety_data';           // From MAUDE/FAERS

// ─────────────────────────────────────────────────────────────────────────────
// Editor State - What the workspace needs to function
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentWorkspaceState {
  document: IntelligentDocument | null;
  
  // Claims detected in real-time
  detectedClaims: SmartClaim[];
  
  // Sources available from all modules
  availableSources: SourceSuggestion[];
  
  // Active compliance issues
  complianceGuards: ComplianceGuard[];
  
  // Sherpa guidance
  sherpaGuidance: SherpaGuidance[];
  blockers: DocumentBlocker[];
  
  // Data bridges to other modules
  dataBridges: DataBridgeConnection[];
  
  // UI state
  selectedClaim: SmartClaim | null;
  isPanelOpen: boolean;
  activePanel: 'command' | 'sources' | 'compliance' | 'sherpa' | 'bridges' | null;
  
  // Auto-save state
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaimDetectionResponse {
  claims: SmartClaim[];
  processingTimeMs: number;
}

export interface SourceMatchResponse {
  suggestions: SourceSuggestion[];
  matchedFrom: DataModule[];
}

export interface ComplianceCheckResponse {
  guards: ComplianceGuard[];
  overallScore: number;
  overallStatus: 'ready' | 'needs-attention' | 'blocked';
}

export interface SherpaAnalysisResponse {
  guidance: SherpaGuidance[];
  blockers: DocumentBlocker[];
  nextBestAction: SherpaGuidance | null;
}
