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
  compliant: boolean;
  score: number;
  checklist: FDAChecklistItem[];
  lastChecked: Date;
}

export interface FDAChecklistItem {
  id: string;
  requirement: string;
  status: 'met' | 'not_met' | 'partial' | 'not_applicable';
  evidence?: string;
  cfr?: string;
}

export interface FDAFormData {
  formNumber: string;
  fields: Record<string, unknown>;
  generatedAt: Date;
  validUntil?: Date;
}

/**
 * Unified FDA Service
 * Provides FDA submission, compliance, and form generation
 */
export class UnifiedFDAService {
  constructor(private config: FDASubmissionConfig) {}

  async checkCompliance(): Promise<FDAComplianceStatus> {
    const mod = (await import('../FDAComplianceTracker')) as any;
    const Ctor = mod.FDAComplianceTracker ?? mod.default;
    const tracker = typeof Ctor === 'function' ? new Ctor() : Ctor;
    return tracker.check(this.config);
  }

  async generateForm(formNumber: string): Promise<FDAFormData> {
    const { default: FDAFormGenerator } = await import('../FDAFormGenerator');
    const generator = new FDAFormGenerator();
    return (generator as any).generate?.(formNumber, this.config);
  }

  async searchDatabase(query: string): Promise<unknown[]> {
    const mod = (await import('../fdaIntegrationService')) as any;
    const Ctor = mod.FDAIntegrationService ?? mod.default;
    const service = typeof Ctor === 'function' ? new Ctor() : Ctor;
    return service.search(query);
  }
}

export default UnifiedFDAService;
