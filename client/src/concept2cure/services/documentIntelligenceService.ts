/**
 * @fileoverview Document Intelligence Service
 * @module concept2cure/services/documentIntelligenceService
 * @version 1.0.0
 *
 * @description
 * Enterprise-grade service for eCTD document authoring and management.
 * THE CAMP MANAGER - Document, Structure, Memory
 *
 * Features:
 * - Smart Tag extraction & linking
 * - Redline tracking with regulatory cross-references
 * - AI-powered content generation
 * - Version control with audit trails
 * - Hyperlink validation
 * - eCTD compliance checking
 *
 * @compliance
 * - ICH M4: eCTD Structure
 * - FDA 21 CFR Part 11: Electronic Signatures
 * - EU Annex 11: Computerized Systems
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - DOCUMENT STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

export type CTDModule = '1' | '2' | '3' | '4' | '5';
export type DocumentStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'LOCKED' | 'SUPERSEDED';
export type ChangeType = 'ADDITION' | 'DELETION' | 'MODIFICATION';

export interface CTDSection {
  module: CTDModule;
  section: string;
  title: string;
  level: number;
  path: string;
  description: string;
  required: boolean;
  region?: 'ICH' | 'FDA' | 'EMA' | 'PMDA';
}

export interface Document {
  id: string;
  title: string;
  fileName: string;
  ctdSection: CTDSection;
  status: DocumentStatus;
  version: string;
  content: string;
  contentHtml?: string;
  wordCount: number;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lockedBy?: string;
  lockedAt?: string;
  
  // AI Analysis
  smartTags: SmartTag[];
  citations: Citation[];
  crossReferences: CrossReference[];
  validationResults?: DocumentValidation;
  
  // Approval workflow
  approvals: ApprovalRecord[];
  currentApprover?: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: string;
  content: string;
  changeDescription: string;
  createdAt: string;
  createdBy: string;
  diff?: DocumentDiff;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - SMART TAGS
// ═══════════════════════════════════════════════════════════════════════════════

export type TagType = 
  | 'STUDY'        // Clinical study reference
  | 'COMPOUND'     // Drug substance/product
  | 'SPECIFICATION'// CMC specification
  | 'GUIDANCE'     // Regulatory guidance
  | 'REGULATION'   // CFR/regulation reference
  | 'DEVICE'       // Device reference
  | 'PREDICATE'    // Predicate device
  | 'ADVERSE_EVENT'// Safety signal
  | 'CROSS_REF'    // Internal cross-reference
  | 'CITATION'     // Literature citation
  | 'DEFINITION';  // Glossary term

export interface SmartTag {
  id: string;
  type: TagType;
  text: string;
  normalizedText: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
  
  // Linked data
  linkedEntity?: {
    type: string;
    id: string;
    name: string;
    url?: string;
  };
  
  // Context
  context: string;
  suggestions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - CITATIONS & REFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Citation {
  id: string;
  type: 'LITERATURE' | 'INTERNAL' | 'REGULATORY';
  reference: string;
  normalizedReference: string;
  startOffset: number;
  endOffset: number;
  
  // Source details
  source?: {
    title: string;
    authors?: string[];
    journal?: string;
    year?: number;
    doi?: string;
    pmid?: string;
    url?: string;
  };
  
  // Validation
  isValid: boolean;
  validationMessage?: string;
}

export interface CrossReference {
  id: string;
  sourceDocumentId: string;
  targetDocumentId?: string;
  targetSection: string;
  text: string;
  startOffset: number;
  endOffset: number;
  
  // Validation
  isValid: boolean;
  isBroken: boolean;
  validationMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - REDLINE & CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentDiff {
  id: string;
  fromVersion: string;
  toVersion: string;
  changes: TextChange[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
  };
}

export interface TextChange {
  id: string;
  type: ChangeType;
  startOffset: number;
  endOffset: number;
  oldText?: string;
  newText?: string;
  reason?: string;
  
  // Regulatory impact
  regulatoryImpact?: {
    level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    affectedGuidances: string[];
    reviewRequired: boolean;
    notes?: string;
  };
}

export interface RedlineAlert {
  id: string;
  documentId: string;
  changeId: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  guidanceReference?: string;
  suggestedAction?: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentValidation {
  isValid: boolean;
  score: number; // 0-100
  checkedAt: string;
  
  structure: {
    isValid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  
  content: {
    isValid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  
  formatting: {
    isValid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
  
  hyperlinks: {
    total: number;
    valid: number;
    broken: number;
    issues: ValidationIssue[];
  };
  
  compliance: {
    ctdCompliant: boolean;
    regionSpecificIssues: ValidationIssue[];
  };
}

export interface ValidationIssue {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  location?: {
    startOffset: number;
    endOffset: number;
    lineNumber?: number;
  };
  guidanceReference?: string;
  autoFixAvailable?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - APPROVAL WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApprovalRecord {
  id: string;
  documentId: string;
  role: 'AUTHOR' | 'REVIEWER' | 'QA' | 'RA_LEAD' | 'MEDICAL_DIRECTOR' | 'SPONSOR';
  userId: string;
  userName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  comments?: string;
  timestamp: string;
  signature?: string;
  signatureReason?: string;
}

export interface ApprovalWorkflow {
  documentId: string;
  currentStep: number;
  totalSteps: number;
  steps: ApprovalStep[];
  status: 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
}

export interface ApprovalStep {
  order: number;
  role: string;
  userId?: string;
  userName?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  dueDate?: string;
  completedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - AI GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface GenerationRequest {
  documentId?: string;
  ctdSection: CTDSection;
  context: {
    projectId: string;
    submissionType: string;
    drugName?: string;
    indication?: string;
    existingContent?: string;
    relatedDocuments?: string[];
  };
  instructions?: string;
  maxLength?: number;
  tone?: 'FORMAL' | 'TECHNICAL' | 'SUMMARY';
}

export interface GenerationResult {
  content: string;
  citations: Citation[];
  smartTags: SmartTag[];
  confidence: number;
  alternativeVersions?: string[];
  suggestedRevisions?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class DocumentIntelligenceService {
  private baseUrl = '/api/documents';
  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      throw new Error(payload?.error?.message || payload?.error || 'Document intelligence request failed');
    }
    return payload?.data ?? payload;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOCUMENT CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create new document
   */
  async createDocument(data: {
    title: string;
    ctdSection: CTDSection;
    content?: string;
    projectId: string;
  }): Promise<Document> {
    try {
      const response = await this.request<{ document?: Document }>('POST', this.baseUrl, data);
      return response.document || (response as any);
    } catch (error) {
      console.error('[DocumentIntelligence] Create document failed:', error);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<Document | null> {
    try {
      const response = await this.request<{ document?: Document }>('GET', `${this.baseUrl}/${id}`);
      return response.document || (response as any) || null;
    } catch (error) {
      console.error('[DocumentIntelligence] Get document failed:', error);
      return null;
    }
  }

  /**
   * Update document content
   */
  async updateDocument(
    id: string,
    data: {
      content?: string;
      title?: string;
      changeDescription?: string;
    }
  ): Promise<Document> {
    try {
      const response = await this.request<{ document?: Document }>(
        'PATCH',
        `${this.baseUrl}/${id}`,
        data
      );
      return response.document || (response as any);
    } catch (error) {
      console.error('[DocumentIntelligence] Update document failed:', error);
      throw error;
    }
  }

  /**
   * List documents for project
   */
  async listDocuments(params: {
    projectId: string;
    ctdModule?: CTDModule;
    status?: DocumentStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ documents: Document[]; total: number }> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, String(value));
      }
    });

    try {
      const response = await this.request<any>('GET', `${this.baseUrl}?${queryParams}`);
      if (Array.isArray(response)) {
        return { documents: response, total: response.length };
      }
      return {
        documents: response.documents || response.data || [],
        total: response.total || response.data?.length || 0,
      };
    } catch (error) {
      console.error('[DocumentIntelligence] List documents failed:', error);
      return { documents: [], total: 0 };
    }
  }

  /**
   * Lock document for editing
   */
  async lockDocument(id: string): Promise<boolean> {
    try {
      await this.request('POST', `${this.baseUrl}/${id}/lock`);
      return true;
    } catch (error) {
      console.error('[DocumentIntelligence] Lock document failed:', error);
      return false;
    }
  }

  /**
   * Unlock document
   */
  async unlockDocument(id: string): Promise<boolean> {
    try {
      await this.request('POST', `${this.baseUrl}/${id}/unlock`);
      return true;
    } catch (error) {
      console.error('[DocumentIntelligence] Unlock document failed:', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SMART TAGS & ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Extract smart tags from content
   */
  async extractSmartTags(content: string): Promise<SmartTag[]> {
    try {
      const response = await this.request<{ tags?: SmartTag[] }>(
        'POST',
        `${this.baseUrl}/analyze/smart-tags`,
        { content }
      );
      return response.tags || [];
    } catch (error) {
      console.error('[DocumentIntelligence] Extract smart tags failed:', error);
      return [];
    }
  }

  /**
   * Link smart tag to entity
   */
  async linkSmartTag(tagId: string, entityType: string, entityId: string): Promise<SmartTag> {
    try {
      const response = await this.request<{ tag: SmartTag }>(
        'POST',
        `${this.baseUrl}/smart-tags/${tagId}/link`,
        { entityType, entityId }
      );
      return response.tag;
    } catch (error) {
      console.error('[DocumentIntelligence] Link smart tag failed:', error);
      throw error;
    }
  }

  /**
   * Extract citations from content
   */
  async extractCitations(content: string): Promise<Citation[]> {
    try {
      const response = await this.request<{ citations?: Citation[] }>(
        'POST',
        `${this.baseUrl}/analyze/citations`,
        { content }
      );
      return response.citations || [];
    } catch (error) {
      console.error('[DocumentIntelligence] Extract citations failed:', error);
      return [];
    }
  }

  /**
   * Validate citations
   */
  async validateCitations(citations: Citation[]): Promise<Citation[]> {
    try {
      const response = await this.request<{ validatedCitations?: Citation[] }>(
        'POST',
        `${this.baseUrl}/analyze/citations/validate`,
        { citations }
      );
      return response.validatedCitations || citations;
    } catch (error) {
      console.error('[DocumentIntelligence] Validate citations failed:', error);
      return citations;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REDLINE & DIFF
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get document versions
   */
  async getVersions(documentId: string): Promise<DocumentVersion[]> {
    try {
      const response = await this.request<{ versions?: DocumentVersion[] }>(
        'GET',
        `${this.baseUrl}/${documentId}/versions`
      );
      return response.versions || [];
    } catch (error) {
      console.error('[DocumentIntelligence] Get versions failed:', error);
      return [];
    }
  }

  /**
   * Get diff between versions
   */
  async getDiff(documentId: string, fromVersion: string, toVersion: string): Promise<DocumentDiff> {
    try {
      const response = await this.request<{ diff: DocumentDiff }>(
        'GET',
        `${this.baseUrl}/${documentId}/diff?from=${fromVersion}&to=${toVersion}`
      );
      return response.diff;
    } catch (error) {
      console.error('[DocumentIntelligence] Get diff failed:', error);
      throw error;
    }
  }

  /**
   * Get redline alerts for changes
   */
  async getRedlineAlerts(documentId: string): Promise<RedlineAlert[]> {
    try {
      const response = await this.request<{ alerts?: RedlineAlert[] }>(
        'GET',
        `${this.baseUrl}/${documentId}/redline-alerts`
      );
      return response.alerts || [];
    } catch (error) {
      console.error('[DocumentIntelligence] Get redline alerts failed:', error);
      return [];
    }
  }

  /**
   * Analyze change for regulatory impact
   */
  async analyzeChangeImpact(
    documentId: string,
    change: TextChange
  ): Promise<TextChange['regulatoryImpact']> {
    try {
      const response = await this.request<{ impact?: TextChange['regulatoryImpact'] }>(
        'POST',
        `${this.baseUrl}/${documentId}/analyze-change`,
        { change }
      );
      return response.impact;
    } catch (error) {
      console.error('[DocumentIntelligence] Analyze change impact failed:', error);
      return undefined;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Validate document
   */
  async validateDocument(documentId: string): Promise<DocumentValidation> {
    try {
      const response = await this.request<{ validation: DocumentValidation }>(
        'GET',
        `${this.baseUrl}/${documentId}/validate`
      );
      return response.validation;
    } catch (error) {
      console.error('[DocumentIntelligence] Validate document failed:', error);
      throw error;
    }
  }

  /**
   * Validate hyperlinks
   */
  async validateHyperlinks(documentId: string): Promise<CrossReference[]> {
    try {
      const response = await this.request<{ crossReferences?: CrossReference[] }>(
        'GET',
        `${this.baseUrl}/${documentId}/validate-hyperlinks`
      );
      return response.crossReferences || [];
    } catch (error) {
      console.error('[DocumentIntelligence] Validate hyperlinks failed:', error);
      return [];
    }
  }

  /**
   * Auto-fix validation issues
   */
  async autoFix(documentId: string, issueCode: string): Promise<boolean> {
    try {
      const response = await this.request<{ success?: boolean }>(
        'POST',
        `${this.baseUrl}/${documentId}/auto-fix`,
        { issueCode }
      );
      return response.success || false;
    } catch (error) {
      console.error('[DocumentIntelligence] Auto-fix failed:', error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AI GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate document content using AI
   */
  async generateContent(request: GenerationRequest): Promise<GenerationResult> {
    try {
      return await this.request('POST', `${this.baseUrl}/generate`, request);
    } catch (error) {
      console.error('[DocumentIntelligence] Generate content failed:', error);
      throw error;
    }
  }

  /**
   * Get AI suggestions for content improvement
   */
  async getSuggestions(documentId: string): Promise<string[]> {
    try {
      const response = await this.request<{ suggestions?: string[] }>(
        'GET',
        `${this.baseUrl}/${documentId}/suggestions`
      );
      return response.suggestions || [];
    } catch (error) {
      console.error('[DocumentIntelligence] Get suggestions failed:', error);
      return [];
    }
  }

  /**
   * Rewrite content with AI
   */
  async rewriteContent(
    content: string,
    instructions: string
  ): Promise<string> {
    try {
      const response = await this.request<{ rewrittenContent?: string }>(
        'POST',
        `${this.baseUrl}/rewrite`,
        { content, instructions }
      );
      return response.rewrittenContent || content;
    } catch (error) {
      console.error('[DocumentIntelligence] Rewrite content failed:', error);
      return content;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // APPROVAL WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get approval workflow for document
   */
  async getApprovalWorkflow(documentId: string): Promise<ApprovalWorkflow | null> {
    try {
      const response = await this.request<{ workflow?: ApprovalWorkflow }>(
        'GET',
        `${this.baseUrl}/${documentId}/workflow`
      );
      return response.workflow || null;
    } catch (error) {
      console.error('[DocumentIntelligence] Get approval workflow failed:', error);
      return null;
    }
  }

  /**
   * Start approval workflow
   */
  async startApprovalWorkflow(
    documentId: string,
    steps: Array<{ role: string; userId?: string; dueDate?: string }>
  ): Promise<ApprovalWorkflow> {
    try {
      const response = await this.request<{ workflow: ApprovalWorkflow }>(
        'POST',
        `${this.baseUrl}/${documentId}/workflow/start`,
        { steps }
      );
      return response.workflow;
    } catch (error) {
      console.error('[DocumentIntelligence] Start approval workflow failed:', error);
      throw error;
    }
  }

  /**
   * Submit approval decision
   */
  async submitApproval(
    documentId: string,
    decision: {
      status: 'APPROVED' | 'REJECTED' | 'RETURNED';
      comments?: string;
      signature?: string;
      signatureReason?: string;
    }
  ): Promise<ApprovalRecord> {
    try {
      const response = await this.request<{ approval: ApprovalRecord }>(
        'POST',
        `${this.baseUrl}/${documentId}/workflow/approve`,
        decision
      );
      return response.approval;
    } catch (error) {
      console.error('[DocumentIntelligence] Submit approval failed:', error);
      throw error;
    }
  }
}

export const documentIntelligenceService = new DocumentIntelligenceService();
export default documentIntelligenceService;
