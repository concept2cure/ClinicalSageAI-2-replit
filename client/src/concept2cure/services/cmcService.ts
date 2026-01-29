/**
 * @fileoverview CMC Intelligence Service
 * @module concept2cure/services/cmcService
 * @version 1.0.0
 *
 * @description
 * Enterprise-grade service for Chemistry, Manufacturing, and Controls (CMC).
 * THE EQUIPMENT MANAGER - Specs, Stability, Validation
 *
 * Features:
 * - ICH Guardrail checking against Q guidelines
 * - Specification management with historical trends
 * - Stability protocol generation
 * - Impurity profiling and justification
 * - Batch record integration
 *
 * @compliance
 * - ICH Q1-Q14 Guidelines
 * - FDA 21 CFR 211 (cGMP)
 * - USP/EP/JP Standards
 */

import { apiRequest } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - SPECIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export type SpecificationType = 
  | 'DRUG_SUBSTANCE'
  | 'DRUG_PRODUCT'
  | 'EXCIPIENT'
  | 'INTERMEDIATE'
  | 'STARTING_MATERIAL'
  | 'CONTAINER_CLOSURE'
  | 'IN_PROCESS';

export type TestCategory =
  | 'IDENTIFICATION'
  | 'ASSAY'
  | 'IMPURITIES'
  | 'PHYSICAL'
  | 'MICROBIOLOGICAL'
  | 'DISSOLUTION'
  | 'STABILITY_INDICATING';

export interface Specification {
  id: string;
  name: string;
  type: SpecificationType;
  version: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'EFFECTIVE' | 'SUPERSEDED';
  effectiveDate?: string;
  productId: string;
  
  tests: SpecificationTest[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  
  // ICH Compliance
  ichCompliance?: ICHComplianceResult;
}

export interface SpecificationTest {
  id: string;
  testName: string;
  category: TestCategory;
  method: string;
  methodReference?: string; // e.g., USP <621>, EP 2.2.29
  
  acceptance: {
    type: 'LIMIT' | 'RANGE' | 'CONFORMS' | 'REPORT';
    limitType?: 'NMT' | 'NLT' | 'BETWEEN';
    value?: string;
    unit?: string;
    lowerLimit?: number;
    upperLimit?: number;
    referenceStandard?: string;
  };
  
  // Justification
  justification?: string;
  regulatoryBasis?: string; // ICH reference
  
  // Validation
  isValidated: boolean;
  validationReference?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - IMPURITIES
// ═══════════════════════════════════════════════════════════════════════════════

export type ImpurityType = 
  | 'ORGANIC'
  | 'INORGANIC'
  | 'RESIDUAL_SOLVENT'
  | 'ELEMENTAL'
  | 'DEGRADATION'
  | 'GENOTOXIC'
  | 'NITROSAMINE';

export type ImpurityOrigin = 
  | 'SYNTHESIS'
  | 'DEGRADATION'
  | 'PROCESS'
  | 'STARTING_MATERIAL'
  | 'EXCIPIENT'
  | 'CONTAINER';

export interface Impurity {
  id: string;
  name: string;
  type: ImpurityType;
  origin: ImpurityOrigin;
  structureKnown: boolean;
  structureSmiles?: string;
  casNumber?: string;
  
  limits: {
    identification: number; // ICH Q3A/B threshold
    qualification: number;
    specificationLimit: number;
    unit: 'PERCENT' | 'PPM' | 'NG_PER_DAY';
  };
  
  // Qualification status
  qualification: {
    status: 'NOT_REQUIRED' | 'REQUIRED' | 'QUALIFIED' | 'IN_PROGRESS';
    basis?: string;
    studies?: string[];
    ttcApplicable?: boolean;
  };
  
  // Toxicology
  toxicology?: {
    noael?: number;
    noaelUnit?: string;
    pde?: number;
    pdeUnit?: string;
    references?: string[];
  };
  
  // Batch data
  batchData: Array<{
    batchNumber: string;
    value: number;
    testDate: string;
    method: string;
  }>;
}

export interface ImpurityProfile {
  id: string;
  productId: string;
  type: 'DRUG_SUBSTANCE' | 'DRUG_PRODUCT';
  version: string;
  
  impurities: Impurity[];
  
  // Summary
  summary: {
    totalIdentified: number;
    totalUnidentified: number;
    aboveIdentificationThreshold: number;
    aboveQualificationThreshold: number;
    requiresQualification: number;
  };
  
  // ICH Compliance
  ichQ3Compliant: boolean;
  complianceIssues: string[];
  
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - STABILITY
// ═══════════════════════════════════════════════════════════════════════════════

export type StorageCondition = 
  | 'LONG_TERM'
  | 'INTERMEDIATE'
  | 'ACCELERATED'
  | 'STRESS'
  | 'PHOTOSTABILITY'
  | 'IN_USE';

export interface StabilityCondition {
  code: StorageCondition;
  temperature: string;
  humidity?: string;
  description: string;
  ichReference: string;
}

export interface StabilityProtocol {
  id: string;
  name: string;
  productId: string;
  type: 'DRUG_SUBSTANCE' | 'DRUG_PRODUCT';
  version: string;
  status: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'COMPLETED';
  
  conditions: StabilityCondition[];
  timePoints: number[]; // months
  testsPerTimePoint: string[];
  
  batches: StabilityBatch[];
  
  // Shelf life
  proposedShelfLife?: number; // months
  justification?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface StabilityBatch {
  id: string;
  protocolId: string;
  batchNumber: string;
  manufacturingSite: string;
  manufactureDate: string;
  packagingConfiguration: string;
  
  results: StabilityResult[];
  
  // Status
  status: 'ONGOING' | 'COMPLETED' | 'FAILED';
  deviations: string[];
}

export interface StabilityResult {
  id: string;
  batchId: string;
  condition: StorageCondition;
  timePoint: number;
  testName: string;
  result: string | number;
  specification: string;
  passOrFail: 'PASS' | 'FAIL' | 'PENDING';
  testDate: string;
  analyst?: string;
  
  // Trend
  trend?: 'STABLE' | 'INCREASING' | 'DECREASING';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - ICH COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

export type ICHGuideline = 
  | 'Q1A' | 'Q1B' | 'Q1C' | 'Q1D' | 'Q1E' | 'Q1F'
  | 'Q2'
  | 'Q3A' | 'Q3B' | 'Q3C' | 'Q3D'
  | 'Q4' | 'Q4A' | 'Q4B'
  | 'Q5A' | 'Q5B' | 'Q5C' | 'Q5D' | 'Q5E'
  | 'Q6A' | 'Q6B'
  | 'Q7'
  | 'Q8' | 'Q9' | 'Q10' | 'Q11' | 'Q12' | 'Q13' | 'Q14';

export interface ICHComplianceResult {
  overall: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT';
  score: number; // 0-100
  checkedAt: string;
  
  guidelines: Array<{
    guideline: ICHGuideline;
    status: 'COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | 'REVIEW_REQUIRED';
    issues: ICHIssue[];
  }>;
}

export interface ICHIssue {
  id: string;
  guideline: ICHGuideline;
  section: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  description: string;
  requirement: string;
  currentState: string;
  recommendation: string;
  references: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - BATCH RECORDS
// ═══════════════════════════════════════════════════════════════════════════════

export interface BatchRecord {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  batchSize: string;
  manufacturingSite: string;
  
  dates: {
    manufacture: string;
    packaging?: string;
    release?: string;
    expiry: string;
  };
  
  components: Array<{
    name: string;
    lotNumber: string;
    quantity: string;
    manufacturer: string;
  }>;
  
  inProcessControls: Array<{
    step: string;
    test: string;
    result: string;
    specification: string;
    passOrFail: 'PASS' | 'FAIL';
  }>;
  
  releaseTests: Array<{
    test: string;
    method: string;
    result: string;
    specification: string;
    passOrFail: 'PASS' | 'FAIL';
  }>;
  
  status: 'IN_PROGRESS' | 'PENDING_RELEASE' | 'RELEASED' | 'REJECTED';
  deviations: string[];
  capa?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CMCService {
  private baseUrl = '/api/cmc';

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create specification
   */
  async createSpecification(data: Partial<Specification>): Promise<Specification> {
    try {
      const response = await apiRequest(`${this.baseUrl}/specifications`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.specification;
    } catch (error) {
      console.error('[CMC] Create specification failed:', error);
      throw error;
    }
  }

  /**
   * Get specification by ID
   */
  async getSpecification(id: string): Promise<Specification | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/specifications/${id}`);
      return response.specification || null;
    } catch (error) {
      console.error('[CMC] Get specification failed:', error);
      return null;
    }
  }

  /**
   * Update specification
   */
  async updateSpecification(id: string, data: Partial<Specification>): Promise<Specification> {
    try {
      const response = await apiRequest(`${this.baseUrl}/specifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return response.specification;
    } catch (error) {
      console.error('[CMC] Update specification failed:', error);
      throw error;
    }
  }

  /**
   * List specifications for product
   */
  async listSpecifications(params: {
    productId: string;
    type?: SpecificationType;
    status?: Specification['status'];
  }): Promise<Specification[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, String(value));
      }
    });

    try {
      const response = await apiRequest(`${this.baseUrl}/specifications?${queryParams}`);
      return response.specifications || [];
    } catch (error) {
      console.error('[CMC] List specifications failed:', error);
      return [];
    }
  }

  /**
   * Check ICH compliance for specification
   */
  async checkICHCompliance(specificationId: string): Promise<ICHComplianceResult> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/specifications/${specificationId}/ich-compliance`
      );
      return response.compliance;
    } catch (error) {
      console.error('[CMC] ICH compliance check failed:', error);
      throw error;
    }
  }

  /**
   * Generate test justification using AI
   */
  async generateTestJustification(
    specificationId: string,
    testId: string
  ): Promise<string> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/specifications/${specificationId}/tests/${testId}/justify`,
        { method: 'POST' }
      );
      return response.justification || '';
    } catch (error) {
      console.error('[CMC] Generate justification failed:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPURITIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get impurity profile
   */
  async getImpurityProfile(productId: string): Promise<ImpurityProfile | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/impurities/${productId}`);
      return response.profile || null;
    } catch (error) {
      console.error('[CMC] Get impurity profile failed:', error);
      return null;
    }
  }

  /**
   * Update impurity
   */
  async updateImpurity(
    profileId: string,
    impurityId: string,
    data: Partial<Impurity>
  ): Promise<Impurity> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/impurities/${profileId}/${impurityId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
      return response.impurity;
    } catch (error) {
      console.error('[CMC] Update impurity failed:', error);
      throw error;
    }
  }

  /**
   * Add impurity to profile
   */
  async addImpurity(profileId: string, impurity: Partial<Impurity>): Promise<Impurity> {
    try {
      const response = await apiRequest(`${this.baseUrl}/impurities/${profileId}`, {
        method: 'POST',
        body: JSON.stringify(impurity),
      });
      return response.impurity;
    } catch (error) {
      console.error('[CMC] Add impurity failed:', error);
      throw error;
    }
  }

  /**
   * Calculate ICH Q3 thresholds
   */
  async calculateThresholds(params: {
    maxDailyDose: number;
    doseUnit: string;
    type: 'DRUG_SUBSTANCE' | 'DRUG_PRODUCT';
  }): Promise<{
    identification: number;
    qualification: number;
    unit: string;
  }> {
    try {
      const response = await apiRequest(`${this.baseUrl}/impurities/thresholds`, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      return response.thresholds;
    } catch (error) {
      console.error('[CMC] Calculate thresholds failed:', error);
      throw error;
    }
  }

  /**
   * Generate impurity justification
   */
  async generateImpurityJustification(
    profileId: string,
    impurityId: string
  ): Promise<string> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/impurities/${profileId}/${impurityId}/justify`,
        { method: 'POST' }
      );
      return response.justification || '';
    } catch (error) {
      console.error('[CMC] Generate impurity justification failed:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STABILITY
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create stability protocol
   */
  async createStabilityProtocol(data: Partial<StabilityProtocol>): Promise<StabilityProtocol> {
    try {
      const response = await apiRequest(`${this.baseUrl}/stability/protocols`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.protocol;
    } catch (error) {
      console.error('[CMC] Create stability protocol failed:', error);
      throw error;
    }
  }

  /**
   * Get stability protocol
   */
  async getStabilityProtocol(id: string): Promise<StabilityProtocol | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/stability/protocols/${id}`);
      return response.protocol || null;
    } catch (error) {
      console.error('[CMC] Get stability protocol failed:', error);
      return null;
    }
  }

  /**
   * List stability protocols for product
   */
  async listStabilityProtocols(productId: string): Promise<StabilityProtocol[]> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/stability/protocols?productId=${productId}`
      );
      return response.protocols || [];
    } catch (error) {
      console.error('[CMC] List stability protocols failed:', error);
      return [];
    }
  }

  /**
   * Add stability result
   */
  async addStabilityResult(batchId: string, result: Partial<StabilityResult>): Promise<StabilityResult> {
    try {
      const response = await apiRequest(`${this.baseUrl}/stability/batches/${batchId}/results`, {
        method: 'POST',
        body: JSON.stringify(result),
      });
      return response.result;
    } catch (error) {
      console.error('[CMC] Add stability result failed:', error);
      throw error;
    }
  }

  /**
   * Generate ICH Q1E shelf life projection
   */
  async projectShelfLife(protocolId: string): Promise<{
    projectedShelfLife: number;
    confidence: number;
    degradationRate: number;
    recommendation: string;
    charts: Array<{ condition: string; data: Array<{ timePoint: number; value: number }> }>;
  }> {
    try {
      const response = await apiRequest(
        `${this.baseUrl}/stability/protocols/${protocolId}/project`
      );
      return response;
    } catch (error) {
      console.error('[CMC] Project shelf life failed:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BATCH RECORDS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get batch record
   */
  async getBatchRecord(batchNumber: string): Promise<BatchRecord | null> {
    try {
      const response = await apiRequest(`${this.baseUrl}/batches/${batchNumber}`);
      return response.batch || null;
    } catch (error) {
      console.error('[CMC] Get batch record failed:', error);
      return null;
    }
  }

  /**
   * List batch records for product
   */
  async listBatchRecords(params: {
    productId: string;
    status?: BatchRecord['status'];
    limit?: number;
  }): Promise<BatchRecord[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, String(value));
      }
    });

    try {
      const response = await apiRequest(`${this.baseUrl}/batches?${queryParams}`);
      return response.batches || [];
    } catch (error) {
      console.error('[CMC] List batch records failed:', error);
      return [];
    }
  }

  /**
   * Get batch trending data
   */
  async getBatchTrends(params: {
    productId: string;
    testName: string;
    limit?: number;
  }): Promise<Array<{
    batchNumber: string;
    manufactureDate: string;
    value: number;
    specification: { lower: number; upper: number };
  }>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.set(key, String(value));
      }
    });

    try {
      const response = await apiRequest(`${this.baseUrl}/batches/trends?${queryParams}`);
      return response.trends || [];
    } catch (error) {
      console.error('[CMC] Get batch trends failed:', error);
      return [];
    }
  }
}

export const cmcService = new CMCService();
export default cmcService;
