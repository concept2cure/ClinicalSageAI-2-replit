/**
 * Unified FDA Services
 *
 * Consolidates all FDA-related services.
 *
 * Consolidated from:
 * - fdaIntegrationService.ts
 * - FDAComplianceTracker.ts
 * - FDAFormGenerator.ts
 * - FDA510kTemplateServiceBackend.ts
 * - 510kComplianceTracker.ts
 *
 * @version 2.0.0
 * @module server/services/fda/index
 */

// Re-export primary services
export * from '../fdaIntegrationService';
export * from '../FDAComplianceTracker';
export * from '../FDAFormGenerator';

// Unified interface
export interface FDASubmissionConfig {
  submissionType: '510k' | 'PMA' | 'De_Novo' | 'IND' | 'NDA' | 'BLA';
  deviceClass?: 'I' | 'II' | 'III';
  productCode?: string;
  predicateDevice?: string;
}

export interface FDAComplianceStatus {
  steps: { total: number; completed: number; percentage: number };
  validationRules: { total: number; implemented: number; percentage: number };
  overallPercentage: number;
  lastUpdated: Date;
}

export interface FDAChecklistItem {
  id: string;
  requirement: string;
  status: 'met' | 'not_met' | 'partial' | 'not_applicable';
  evidence?: string;
  cfr?: string;
}

export interface FDAFormData {
  name: string;
  formData: Record<string, unknown>;
  htmlContent: string;
  completeness: number;
  formId: string;
  version: string;
}

/**
 * Unified FDA Service
 * Provides FDA submission, compliance, and form generation
 */
export class UnifiedFDAService {
  constructor(private config: FDASubmissionConfig) {}

  async checkCompliance(): Promise<FDAComplianceStatus> {
    const { default: FDAComplianceTracker } = await import('../FDAComplianceTracker');
    const tracker = new FDAComplianceTracker();
    return tracker.getProgressSummary();
  }

  async generateForm(formNumber: string): Promise<FDAFormData> {
    const { default: FDAFormGenerator } = await import('../FDAFormGenerator');
    const generator = new FDAFormGenerator();
    return generator.generateSmartForm(formNumber, this.config);
  }

  async searchDatabase(query: string): Promise<unknown> {
    const fdaIntegrationService = (await import('../fdaIntegrationService')).default;
    return fdaIntegrationService.searchDevice(query);
  }
}

export default UnifiedFDAService;
