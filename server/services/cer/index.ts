/**
 * Unified CER (Clinical Evaluation Report) Services
 *
 * Consolidates CER-related services into a single module.
 *
 * Consolidated from:
 * - cerGenerationService.ts
 * - cerGenerator.ts
 *
 * @version 2.0.0
 * @module server/services/cer/index
 */

// Re-export from primary service (default singleton instance)
export { default as cerGenerationService } from '../cerGenerationService';

// Re-export generator utilities
export { generateCerSections, assembleHtml, renderPdf, setupWorkers } from '../cerGenerator';

// Unified interface for CER operations
export interface CERServiceConfig {
  organizationId: string;
  deviceName: string;
  manufacturer?: string;
  templateVersion?: string;
}

export interface CERGenerationResult {
  reportId: string;
  status: 'success' | 'partial' | 'failed';
  sections: CERSection[];
  generatedAt: Date;
  warnings?: string[];
}

export interface CERSection {
  id: string;
  title: string;
  content: string;
  status: 'complete' | 'draft' | 'needs_review';
  wordCount: number;
}

/**
 * Unified CER service facade
 */
export class UnifiedCERService {
  constructor(private config: CERServiceConfig) {}

  async generateReport(): Promise<CERGenerationResult> {
    // The primary service (cerGenerationService.generateCER) requires a numeric
    // deviceId, userId and regulatoryFramework which this facade config does not
    // carry. Until the facade is wired to those inputs, surface a failed result
    // rather than a partial/fabricated report.
    return {
      reportId: '',
      status: 'failed',
      sections: [],
      generatedAt: new Date(),
      warnings: [
        'UnifiedCERService is not wired to the CER generation service; ' +
          'deviceId, userId and regulatoryFramework are required.',
      ],
    };
  }

  async validateReport(_reportId: string): Promise<{ valid: boolean; issues: string[] }> {
    // No real CER validation (MEDDEV 2.7/1 rev 4, Annex I GSPR, Annex XIV
    // conformity) is implemented, and this facade is not wired to a validation
    // engine. Returning { valid: true } would falsely certify an unvalidated
    // regulated report as conformant — a dangerous false positive. Fail closed:
    // report invalid with an explicit reason until real validation exists.
    return {
      valid: false,
      issues: [
        'CER validation is not implemented. UnifiedCERService is not wired to a ' +
          'validation engine (MEDDEV 2.7/1 rev 4 / Annex I GSPR / Annex XIV), so ' +
          'this report cannot be certified valid.',
      ],
    };
  }
}

export default UnifiedCERService;
