/**
 * @fileoverview Medical Device Regulatory Service
 * @module concept2cure/services/medicalDeviceService
 * @version 1.0.0
 *
 * @description
 * Enterprise-grade service for medical device regulatory pathways.
 * Supports 510(k), PMA, De Novo, and EU MDR submissions.
 *
 * Key Features:
 * - Predicate Device Search & Analysis
 * - MAUDE Integration for Hazard Monitoring
 * - eSTAR Package Management
 * - CER/PMCF Support for EU MDR
 *
 * @compliance
 * - FDA 21 CFR Part 820 (QSR)
 * - FDA 21 CFR Part 11 (Electronic Records)
 * - EU MDR 2017/745
 */

import { apiRequest } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - DEVICE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

export type DeviceClass = 'I' | 'II' | 'III';
export type SubmissionType = '510K' | 'PMA' | 'DENOVO' | 'HDE';
export type RegulationRegion = 'FDA' | 'EU_MDR' | 'UKCA' | 'TGA' | 'PMDA';

export interface DeviceProfile {
  id: string;
  productName: string;
  deviceClass: DeviceClass;
  productCode: string;
  regulationNumber: string;
  intendedUse: string;
  indications: string[];
  technology: string;
  primarySubmissionType: SubmissionType;
  regions: RegulationRegion[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - PREDICATE SEARCH
// ═══════════════════════════════════════════════════════════════════════════════

export interface PredicateDevice {
  id: string;
  kNumber: string;
  deviceName: string;
  applicant: string;
  decisionDate: string;
  decisionType: 'SE' | 'NSE'; // Substantially Equivalent or Not
  productCode: string;
  regulationNumber: string;
  deviceClass: DeviceClass;
  intendedUse: string;
  statementUrl?: string;
  summaryUrl?: string;
  
  // AI Analysis Fields
  similarityScore?: number;
  technologicalCharacteristics?: string[];
  performanceData?: string[];
  matchingIndications?: string[];
  risks?: string[];
}

export interface PredicateSearchParams {
  productCode?: string;
  regulationNumber?: string;
  deviceName?: string;
  applicant?: string;
  dateFrom?: string;
  dateTo?: string;
  intendedUse?: string;
  limit?: number;
}

export interface PredicateComparison {
  subjectDevice: DeviceProfile;
  predicateDevice: PredicateDevice;
  equivalenceAnalysis: {
    intendedUse: {
      equivalent: boolean;
      notes: string;
    };
    technologicalCharacteristics: {
      equivalent: boolean;
      notes: string;
      differences: string[];
    };
    performance: {
      equivalent: boolean;
      notes: string;
      testingRequired: string[];
    };
  };
  overallScore: number;
  recommendation: 'STRONG_MATCH' | 'ACCEPTABLE' | 'WEAK_MATCH' | 'NOT_RECOMMENDED';
  justificationDraft: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - 510(k) SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════════

export type SubmissionStatus = 
  | 'DRAFT'
  | 'INTERNAL_REVIEW'
  | 'READY_FOR_SUBMISSION'
  | 'SUBMITTED'
  | 'RTA_HOLD'
  | 'SUBSTANTIVE_REVIEW'
  | 'AI_REQUEST'
  | 'SE_DETERMINATION'
  | 'NSE_DETERMINATION';

export interface Submission510k {
  id: string;
  kNumber?: string;
  deviceName: string;
  applicant: string;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  deviceProfile: DeviceProfile;
  predicates: PredicateDevice[];
  primaryPredicate?: PredicateDevice;
  status: SubmissionStatus;
  submissionDate?: string;
  targetDate?: string;
  reviewDivision?: string;
  
  // eSTAR Sections
  sections: Record<string, EstarSection>;
  
  // Timeline & Audit
  history: SubmissionEvent[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface EstarSection {
  sectionId: string;
  sectionName: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'NEEDS_REVISION';
  completionPercentage: number;
  documents: EstarDocument[];
  validationErrors: string[];
  aiGeneratedContent?: string;
}

export interface EstarDocument {
  id: string;
  fileName: string;
  fileType: string;
  sectionId: string;
  version: number;
  uploadedAt: string;
  uploadedBy: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED';
  validationResults?: DocumentValidation;
}

export interface DocumentValidation {
  isValid: boolean;
  errors: Array<{ code: string; message: string; location?: string }>;
  warnings: Array<{ code: string; message: string; location?: string }>;
  metadata?: Record<string, unknown>;
}

export interface SubmissionEvent {
  id: string;
  timestamp: string;
  eventType: string;
  description: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - MAUDE & SAFETY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MAUDEReport {
  id: string;
  reportNumber: string;
  reportDate: string;
  eventDate?: string;
  eventType: 'malfunction' | 'injury' | 'death';
  
  device: {
    brandName: string;
    genericName: string;
    manufacturer: string;
    modelNumber?: string;
    catalogNumber?: string;
    productCode: string;
  };
  
  event: {
    description: string;
    deviceProblem?: string[];
    patientProblem?: string[];
    outcome?: string;
  };
  
  reporter: {
    type: 'manufacturer' | 'distributor' | 'user_facility' | 'other';
    occupation?: string;
  };
  
  // AI Analysis
  riskSignal?: {
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    trend: 'STABLE' | 'INCREASING' | 'DECREASING';
    relatedReports: number;
    recommendedAction?: string;
  };
}

export interface HazardAnalysis {
  productCode: string;
  productName: string;
  analysisDate: string;
  
  summary: {
    totalReports: number;
    malfunctions: number;
    injuries: number;
    deaths: number;
    trendDirection: 'UP' | 'DOWN' | 'STABLE';
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  
  topIssues: Array<{
    issue: string;
    count: number;
    percentage: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
  }>;
  
  timeline: Array<{
    period: string;
    malfunctions: number;
    injuries: number;
    deaths: number;
  }>;
  
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - CER & EU MDR
// ═══════════════════════════════════════════════════════════════════════════════

export interface ClinicalEvaluationReport {
  id: string;
  deviceId: string;
  version: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SUBMITTED';
  
  sections: {
    scope: CERSection;
    clinicalBackground: CERSection;
    stateOfArt: CERSection;
    equivalenceAssessment: CERSection;
    clinicalData: CERSection;
    postMarketData: CERSection;
    riskBenefitAnalysis: CERSection;
    conclusions: CERSection;
  };
  
  literature: {
    totalSources: number;
    includedSources: number;
    excludedSources: number;
    searchStrategy: string;
  };
  
  approvals: ApprovalRecord[];
  
  createdAt: string;
  updatedAt: string;
}

export interface CERSection {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'NEEDS_REVISION';
  content: string;
  aiSuggestedContent?: string;
  citations: string[];
  validationIssues: string[];
  lastModified: string;
}

export interface ApprovalRecord {
  id: string;
  role: string;
  userId: string;
  userName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  comments?: string;
  timestamp: string;
  signature?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class MedicalDeviceService {
  private baseUrl = '/api/medical-device';

  // ─────────────────────────────────────────────────────────────────────────────
  // PREDICATE SEARCH
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Search FDA 510(k) database for predicate devices
   */
  async searchPredicates(params: PredicateSearchParams): Promise<PredicateDevice[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, String(value));
      }
    });

    try {
      const response = await apiRequest(`${this.baseUrl}/predicates/search?${queryParams}`);
      return response.predicates || [];
    } catch (error) {
      console.error('[MedicalDevice] Predicate search failed:', error);
      throw error;
    }
  }

  /**
   * Get detailed predicate device information
   */
  async getPredicateDetails(kNumber: string): Promise<PredicateDevice | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/predicates/${kNumber}`);
      return response.predicate || null;
    } catch (error) {
      console.error('[MedicalDevice] Predicate details failed:', error);
      return null;
    }
  }

  /**
   * AI-powered predicate comparison analysis
   */
  async analyzePredicateEquivalence(
    subjectDevice: DeviceProfile,
    predicateDevice: PredicateDevice
  ): Promise<PredicateComparison> {
    try {
      const response = await apiRequest(`${this.baseUrl}/predicates/analyze`, {
        method: 'POST',
        body: JSON.stringify({ subjectDevice, predicateDevice }),
      });
      return response;
    } catch (error) {
      console.error('[MedicalDevice] Equivalence analysis failed:', error);
      throw error;
    }
  }

  /**
   * AI-recommended predicates based on device profile
   */
  async getRecommendedPredicates(deviceProfile: DeviceProfile): Promise<PredicateDevice[]> {
    try {
      const response = await apiRequest(`${this.baseUrl}/predicates/recommend`, {
        method: 'POST',
        body: JSON.stringify({ deviceProfile }),
      });
      return response.recommendations || [];
    } catch (error) {
      console.error('[MedicalDevice] Predicate recommendation failed:', error);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 510(k) SUBMISSIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create new 510(k) submission
   */
  async createSubmission(data: Partial<Submission510k>): Promise<Submission510k> {
    try {
      const response = await apiRequest(`${this.baseUrl}/submissions`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.submission;
    } catch (error) {
      console.error('[MedicalDevice] Create submission failed:', error);
      throw error;
    }
  }

  /**
   * Get submission by ID
   */
  async getSubmission(id: string): Promise<Submission510k | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/submissions/${id}`);
      return response.submission || null;
    } catch (error) {
      console.error('[MedicalDevice] Get submission failed:', error);
      return null;
    }
  }

  /**
   * Update submission
   */
  async updateSubmission(id: string, data: Partial<Submission510k>): Promise<Submission510k> {
    try {
      const response = await apiRequest(`${this.baseUrl}/submissions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return response.submission;
    } catch (error) {
      console.error('[MedicalDevice] Update submission failed:', error);
      throw error;
    }
  }

  /**
   * List all submissions
   */
  async listSubmissions(params?: {
    status?: SubmissionStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ submissions: Submission510k[]; total: number }> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit) queryParams.set('limit', String(params.limit));
    if (params?.offset) queryParams.set('offset', String(params.offset));

    try {
      const response = await apiRequest(`${this.baseUrl}/submissions?${queryParams}`);
      return {
        submissions: response.submissions || [],
        total: response.total || 0,
      };
    } catch (error) {
      console.error('[MedicalDevice] List submissions failed:', error);
      return { submissions: [], total: 0 };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // eSTAR MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get eSTAR section status
   */
  async getEstarSections(submissionId: string): Promise<Record<string, EstarSection>> {
    try {
      const response = await apiRequest(`${this.baseUrl}/submissions/${submissionId}/estar`);
      return response.sections || {};
    } catch (error) {
      console.error('[MedicalDevice] Get eSTAR sections failed:', error);
      return {};
    }
  }

  /**
   * Update eSTAR section
   */
  async updateEstarSection(
    submissionId: string,
    sectionId: string,
    data: Partial<EstarSection>
  ): Promise<EstarSection> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/submissions/${submissionId}/estar/${sectionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
      return response.section;
    } catch (error) {
      console.error('[MedicalDevice] Update eSTAR section failed:', error);
      throw error;
    }
  }

  /**
   * AI-generate eSTAR section content
   */
  async generateEstarContent(
    submissionId: string,
    sectionId: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/submissions/${submissionId}/estar/${sectionId}/generate`,
        {
          method: 'POST',
          body: JSON.stringify({ context }),
        }
      );
      return response.content || '';
    } catch (error) {
      console.error('[MedicalDevice] Generate eSTAR content failed:', error);
      throw error;
    }
  }

  /**
   * Validate eSTAR package
   */
  async validateEstar(submissionId: string): Promise<{
    isValid: boolean;
    sections: Record<string, { isValid: boolean; errors: string[] }>;
    overallErrors: string[];
  }> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/submissions/${submissionId}/estar/validate`
      );
      return response;
    } catch (error) {
      console.error('[MedicalDevice] Validate eSTAR failed:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAUDE & SAFETY MONITORING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Search MAUDE database
   */
  async searchMAUDE(params: {
    productCode?: string;
    brandName?: string;
    manufacturer?: string;
    eventType?: 'malfunction' | 'injury' | 'death';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<MAUDEReport[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, String(value));
      }
    });

    try {
      const response = await apiRequest(`${this.baseUrl}/maude/search?${queryParams}`);
      return response.reports || [];
    } catch (error) {
      console.error('[MedicalDevice] MAUDE search failed:', error);
      return [];
    }
  }

  /**
   * Get hazard analysis for product code
   */
  async getHazardAnalysis(productCode: string): Promise<HazardAnalysis | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/maude/hazard/${productCode}`);
      return response.analysis || null;
    } catch (error) {
      console.error('[MedicalDevice] Hazard analysis failed:', error);
      return null;
    }
  }

  /**
   * Subscribe to MAUDE alerts for product codes
   */
  subscribeToMAUDEAlerts(
    productCodes: string[],
    onAlert: (report: MAUDEReport) => void
  ): () => void {
    const eventSource = new EventSource(
      `${this.baseUrl}/maude/subscribe?codes=${productCodes.join(',')}`
    );

    eventSource.onmessage = (event) => {
      try {
        const report = JSON.parse(event.data) as MAUDEReport;
        onAlert(report);
      } catch (error) {
        console.error('[MedicalDevice] MAUDE alert parse error:', error);
      }
    };

    return () => eventSource.close();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CER & EU MDR
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create new Clinical Evaluation Report
   */
  async createCER(deviceId: string): Promise<ClinicalEvaluationReport> {
    try {
      const response = await apiRequest(`${this.baseUrl}/cer`, {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      return response.cer;
    } catch (error) {
      console.error('[MedicalDevice] Create CER failed:', error);
      throw error;
    }
  }

  /**
   * Get CER by ID
   */
  async getCER(id: string): Promise<ClinicalEvaluationReport | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/cer/${id}`);
      return response.cer || null;
    } catch (error) {
      console.error('[MedicalDevice] Get CER failed:', error);
      return null;
    }
  }

  /**
   * Update CER section
   */
  async updateCERSection(
    cerId: string,
    sectionName: string,
    content: string
  ): Promise<CERSection> {
    try {
      const response = await apiRequest(`${this.baseUrl}/cer/${cerId}/sections/${sectionName}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      return response.section;
    } catch (error) {
      console.error('[MedicalDevice] Update CER section failed:', error);
      throw error;
    }
  }

  /**
   * AI-generate CER section content
   */
  async generateCERContent(
    cerId: string,
    sectionName: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/cer/${cerId}/sections/${sectionName}/generate`,
        {
          method: 'POST',
          body: JSON.stringify({ context }),
        }
      );
      return response.content || '';
    } catch (error) {
      console.error('[MedicalDevice] Generate CER content failed:', error);
      throw error;
    }
  }
}

export const medicalDeviceService = new MedicalDeviceService();
export default medicalDeviceService;
