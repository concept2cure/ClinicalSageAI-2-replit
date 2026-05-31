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

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

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
// TYPES - WORKSTREAM SHELL (Phase 10 CMC · Module 3)
// ═══════════════════════════════════════════════════════════════════════════════

/** One row per submission from GET /api/cmc/blueprint/portfolio/overview. */
export interface CmcPortfolioRow {
  sub_id: string;
  product_id: string;
  region: string | null;
  app_type: string | null;
  rpi: number;
  components: Record<string, unknown>;
  ir_open: number;
  ir_overdue: number;
  obligations_open: number;
  obligations_overdue: number;
  stability_cov_m: number;
  m3_missing: number;
  preflight_critical: number;
  qc_alerts: number;
  playbook_open: number;
}

/** GET /api/cmc/module3-os/readiness/:projectId → data. */
export interface CmcModule3Readiness {
  totalSections: number;
  approvedSections: number;
  staleSections: number;
  openCriticalContradictions: number;
  exportReady: boolean;
  canonicalGovernedState?: Record<string, unknown> | null;
}

/** Project-scoped specification row (quality_specifications table). */
export interface CmcSpecRow {
  id: string;
  project_id: string | null;
  [key: string]: unknown;
}

/** Project-scoped stability study row. */
export interface CmcStabilityRow {
  id: string;
  project_id: string | null;
  [key: string]: unknown;
}

/** Project-scoped batch record row. */
export interface CmcBatchRow {
  id: string;
  project_id: string | null;
  [key: string]: unknown;
}

/** POST /api/cmc/ich-compliance → data (deterministic Q-series rollup). */
export interface CmcIchCheckResult {
  overallStatus?: string;
  score?: number;
  guidelines?: Array<{
    guideline: string;
    status: string;
    findings?: Array<{ description: string; reference?: string }>;
  }>;
  [key: string]: unknown;
}

/** GET /api/cmc/quality/qbd/:projectId → data. */
export interface CmcQbdResult {
  cqas?: Array<Record<string, unknown>>;
  cpps?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// ─── Authoring input shapes — match the live server zod schemas exactly ───────
// These are the bodies the create/update handlers actually read; the legacy
// domain types (Specification, StabilityProtocol, BatchRecord) describe a
// different model and are kept only for the older product-scoped reads.

/** Body for POST /api/cmc/specifications (createSpecSchema). */
export interface SpecificationInput {
  projectId?: string;
  materialType: string;
  materialName: string;
  testParameters?: string | null;
  acceptanceCriteria?: string | null;
  testMethods?: string | null;
  justification?: string | null;
  regulatoryBasis?: string | null;
  approvalStatus?: string;
}

/** Body for PUT /api/cmc/specifications/:id (updateSpecSchema). */
export type SpecificationPatch = Partial<Omit<SpecificationInput, 'projectId'>>;

/** Body for POST /api/cmc/stability (createStudySchema). */
export interface StabilityStudyInput {
  projectId?: string;
  studyName: string;
  studyType?: string;
  storageCondition?: string;
  duration?: string;
  timePoints?: string;
  containerClosure?: string;
  testParameters?: string;
  status?: string;
  startedDate?: string;
  completedDate?: string;
  results?: unknown;
}

/** One time-point result appended to a stability study's `results` array. */
export interface StabilityResultEntry {
  timePoint: string;
  parameter: string;
  value: string;
  recordedAt: string;
}

/** Body for POST /api/cmc/batch-records (createBatchSchema). */
export interface BatchRecordInput {
  projectId?: string;
  batchNumber: string;
  productName: string;
  batchSize?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  manufacturingSite?: string;
  status?: string;
}

/** A Module 3 section row from GET /api/cmc/module3-os/sections/:projectId. */
export interface CmcModule3Section {
  sectionKey: string;
  sectionPath: string | null;
  stale: boolean;
  staleReason: string | null;
  approvalState: string;
  updatedAt: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class CMCService {
  private baseUrl = '/api/cmc';

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.success === false) {
      throw new Error(payload?.error?.message || payload?.error || 'CMC request failed');
    }
    return payload?.data ?? payload;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SPECIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create specification — POST /api/cmc/specifications.
   * The handler returns the inserted row as `data`, which `request()` already
   * unwraps, so we return that object directly.
   */
  async createSpecification(data: SpecificationInput): Promise<CmcSpecRow> {
    try {
      return await this.request<CmcSpecRow>('POST', `${this.baseUrl}/specifications`, data);
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
      const response = await this.request<{ specification?: Specification }>(
        'GET',
        `${this.baseUrl}/specifications/${id}`
      );
      return response.specification || null;
    } catch (error) {
      console.error('[CMC] Get specification failed:', error);
      return null;
    }
  }

  /**
   * Update specification — PUT /api/cmc/specifications/:id (server uses PUT,
   * not PATCH). Returns the updated row. Approval cannot happen here; use
   * approveSpecification, which routes through the governed ledger.
   */
  async updateSpecification(id: string, data: SpecificationPatch): Promise<CmcSpecRow> {
    try {
      return await this.request<CmcSpecRow>('PUT', `${this.baseUrl}/specifications/${id}`, data);
    } catch (error) {
      console.error('[CMC] Update specification failed:', error);
      throw error;
    }
  }

  /**
   * Approve a specification — POST /api/cmc/specifications/:id/approve.
   * High-risk governed sign: the server re-verifies the signer (`reauth`) and
   * writes the audit_logs + c2c_ana_actions ledger pair in one transaction.
   * The only path to approval; the ungoverned PUT no longer accepts it.
   */
  async approveSpecification(
    id: string,
    payload: { reason: string; reauth: { password: string; totp?: string } },
  ): Promise<CmcSpecRow> {
    try {
      return await this.request<CmcSpecRow>(
        'POST',
        `${this.baseUrl}/specifications/${id}/approve`,
        payload,
      );
    } catch (error) {
      console.error('[CMC] Approve specification failed:', error);
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
      const response = await this.request<{ specifications?: Specification[] }>(
        'GET',
        `${this.baseUrl}/specifications?${queryParams}`
      );
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
      const response = await this.request<{ compliance: ICHComplianceResult }>(
        'GET',
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
      const response = await this.request<{ justification?: string }>(
        'POST',
        `${this.baseUrl}/specifications/${specificationId}/tests/${testId}/justify`
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
      const response = await this.request<{ profile?: ImpurityProfile }>(
        'GET',
        `${this.baseUrl}/impurities/${productId}`
      );
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
      const response = await this.request<{ impurity: Impurity }>(
        'PATCH',
        `${this.baseUrl}/impurities/${profileId}/${impurityId}`,
        data
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
      const response = await this.request<{ impurity: Impurity }>(
        'POST',
        `${this.baseUrl}/impurities/${profileId}`,
        impurity
      );
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
      const response = await this.request<{ thresholds: { identification: number; qualification: number; unit: string } }>(
        'POST',
        `${this.baseUrl}/impurities/thresholds`,
        params
      );
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
      const response = await this.request<{ justification?: string }>(
        'POST',
        `${this.baseUrl}/impurities/${profileId}/${impurityId}/justify`
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
   * Create stability study — POST /api/cmc/stability (createStudySchema).
   * The server route is `/stability`, not `/stability/protocols`.
   */
  async createStabilityProtocol(data: StabilityStudyInput): Promise<CmcStabilityRow> {
    try {
      return await this.request<CmcStabilityRow>('POST', `${this.baseUrl}/stability`, data);
    } catch (error) {
      console.error('[CMC] Create stability study failed:', error);
      throw error;
    }
  }

  /**
   * Get stability protocol
   */
  async getStabilityProtocol(id: string): Promise<StabilityProtocol | null> {
    try {
      const response = await this.request<{ protocol?: StabilityProtocol }>(
        'GET',
        `${this.baseUrl}/stability/protocols/${id}`
      );
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
      const response = await this.request<{ protocols?: StabilityProtocol[] }>(
        'GET',
        `${this.baseUrl}/stability/protocols?productId=${productId}`
      );
      return response.protocols || [];
    } catch (error) {
      console.error('[CMC] List stability protocols failed:', error);
      return [];
    }
  }

  /**
   * Append a time-point result to a stability study. The server stores results
   * as a JSON field on the study row (there is no per-result route), so this
   * PUTs the merged results array to /api/cmc/stability/:id.
   */
  async addStabilityResult(
    studyId: string,
    nextResults: StabilityResultEntry[],
  ): Promise<CmcStabilityRow> {
    try {
      return await this.request<CmcStabilityRow>('PUT', `${this.baseUrl}/stability/${studyId}`, {
        results: nextResults,
      });
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
      return await this.request(
        'GET',
        `${this.baseUrl}/stability/protocols/${protocolId}/project`
      );
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
      const response = await this.request<{ batch?: BatchRecord }>(
        'GET',
        `${this.baseUrl}/batches/${batchNumber}`
      );
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
      const response = await this.request<{ batches?: BatchRecord[] }>(
        'GET',
        `${this.baseUrl}/batches?${queryParams}`
      );
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
      const response = await this.request<{ trends?: Array<{ batchNumber: string; manufactureDate: string; value: number; specification: { lower: number; upper: number } }> }>(
        'GET',
        `${this.baseUrl}/batches/trends?${queryParams}`
      );
      return response.trends || [];
    } catch (error) {
      console.error('[CMC] Get batch trends failed:', error);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WORKSTREAM SHELL (Phase 10 CMC · Module 3) — live, project-scoped reads
  // ─────────────────────────────────────────────────────────────────────────────

  /** Portfolio overview — one RPI row per submission. */
  async getPortfolioOverview(): Promise<CmcPortfolioRow[]> {
    const rows = await this.request<CmcPortfolioRow[] | { data?: CmcPortfolioRow[] }>(
      'GET',
      `${this.baseUrl}/blueprint/portfolio/overview`,
    );
    return Array.isArray(rows) ? rows : rows?.data ?? [];
  }

  /** Module 3 build-state readiness for a project. */
  async getModule3Readiness(projectId: string): Promise<CmcModule3Readiness | null> {
    const res = await this.request<{ data?: CmcModule3Readiness }>(
      'GET',
      `${this.baseUrl}/module3-os/readiness/${encodeURIComponent(projectId)}`,
    );
    return (res as any)?.data ?? (res as unknown as CmcModule3Readiness) ?? null;
  }

  /** Specifications for a project (quality_specifications). */
  async getSpecificationsByProject(projectId: string): Promise<CmcSpecRow[]> {
    const res = await this.request<{ data?: CmcSpecRow[] } | CmcSpecRow[]>(
      'GET',
      `${this.baseUrl}/specifications/${encodeURIComponent(projectId)}`,
    );
    return Array.isArray(res) ? res : res?.data ?? [];
  }

  /** Stability studies for a project. */
  async getStabilityByProject(projectId: string): Promise<CmcStabilityRow[]> {
    const res = await this.request<{ data?: CmcStabilityRow[] } | CmcStabilityRow[]>(
      'GET',
      `${this.baseUrl}/stability/${encodeURIComponent(projectId)}`,
    );
    return Array.isArray(res) ? res : res?.data ?? [];
  }

  /** Batch records for a project. */
  async getBatchRecordsByProject(projectId: string): Promise<CmcBatchRow[]> {
    const res = await this.request<{ data?: CmcBatchRow[] } | CmcBatchRow[]>(
      'GET',
      `${this.baseUrl}/batch-records/${encodeURIComponent(projectId)}`,
    );
    return Array.isArray(res) ? res : res?.data ?? [];
  }

  /** Create a batch record — POST /api/cmc/batch-records (createBatchSchema). */
  async createBatchRecord(data: BatchRecordInput): Promise<CmcBatchRow> {
    return this.request<CmcBatchRow>('POST', `${this.baseUrl}/batch-records`, data);
  }

  /** Module 3 sections for a project — GET /api/cmc/module3-os/sections/:projectId. */
  async getModule3Sections(projectId: string): Promise<CmcModule3Section[]> {
    const res = await this.request<{ data?: CmcModule3Section[] } | CmcModule3Section[]>(
      'GET',
      `${this.baseUrl}/module3-os/sections/${encodeURIComponent(projectId)}`,
    );
    return Array.isArray(res) ? res : res?.data ?? [];
  }

  /**
   * Approve a Module 3 section — POST
   * /api/cmc/module3-os/sections/:projectId/:sectionKey/approve.
   * The handler is path-driven and reads no body; the e-signature reason is
   * captured client-side via EsignModal and persisted in the signature ledger.
   */
  async approveModule3Section(
    projectId: string,
    sectionKey: string,
  ): Promise<{ sectionKey: string; versionNumber: number; approvedVersionId: string }> {
    return this.request(
      'POST',
      `${this.baseUrl}/module3-os/sections/${encodeURIComponent(projectId)}/${encodeURIComponent(sectionKey)}/approve`,
    );
  }

  /** Release a batch record — POST /api/cmc/batch-records/:id/release.
   *  High-risk governed sign: the server re-verifies the signer (`reauth`) and
   *  writes the audit_logs + c2c_ana_actions ledger pair in one transaction.
   *  `decision` is required by the server schema; `reason` is the
   *  reason-for-change recorded verbatim in the ledger. */
  async releaseBatch(
    id: string,
    payload: {
      releaseTesting: unknown;
      releasedBy: string;
      decision: 'approved' | 'rejected' | 'conditional';
      comments?: string;
      reason: string;
      reauth: { password: string; totp?: string };
    },
  ): Promise<unknown> {
    return this.request('POST', `${this.baseUrl}/batch-records/${encodeURIComponent(id)}/release`, payload);
  }

  /** Deterministic ICH compliance check for a project. */
  async runICHComplianceCheck(projectId: string): Promise<CmcIchCheckResult | null> {
    const res = await this.request<{ data?: CmcIchCheckResult } | CmcIchCheckResult>(
      'POST',
      `${this.baseUrl}/ich-compliance`,
      { projectId },
    );
    return (res as any)?.data ?? (res as CmcIchCheckResult) ?? null;
  }

  /** Change-impact simulation. Returns the filing path / impact analysis. */
  async simulateChangeImpact(payload: Record<string, unknown>): Promise<unknown> {
    const res = await this.request<{ data?: unknown }>(
      'POST',
      `${this.baseUrl}/change-impact-simulator/simulate`,
      payload,
    );
    return (res as any)?.data ?? res;
  }

  /** QbD analysis (CQAs / CPPs) for a project. */
  async analyzeQbd(projectId: string): Promise<CmcQbdResult | null> {
    const res = await this.request<{ data?: CmcQbdResult } | CmcQbdResult>(
      'GET',
      `${this.baseUrl}/quality/qbd/${encodeURIComponent(projectId)}`,
    );
    return (res as any)?.data ?? (res as CmcQbdResult) ?? null;
  }

  /** Generate a §3.2 blueprint. */
  async generateBlueprint(payload: Record<string, unknown>): Promise<unknown> {
    const res = await this.request<{ data?: unknown }>(
      'POST',
      `${this.baseUrl}/blueprint/generate-blueprint`,
      payload,
    );
    return (res as any)?.data ?? res;
  }

  /** Global (per-market) compliance transform. */
  async checkGlobalCompliance(payload: Record<string, unknown>): Promise<unknown> {
    const res = await this.request<{ data?: unknown }>(
      'POST',
      `${this.baseUrl}/global-compliance/transform`,
      payload,
    );
    return (res as any)?.data ?? res;
  }

  /** CMC copilot chat turn. */
  async cmcCopilotChat(query: string, context?: Record<string, unknown>): Promise<{ response?: string; [key: string]: unknown }> {
    const res = await this.request<{ data?: any } | any>(
      'POST',
      `${this.baseUrl}/cmc-copilot/query`,
      { query, context },
    );
    return (res as any)?.data ?? res ?? {};
  }
}

export const cmcService = new CMCService();
export default cmcService;
