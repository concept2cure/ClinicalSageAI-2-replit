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

  async validateReport(reportId: string): Promise<{ valid: boolean; issues: string[] }> {
    // Validation logic
    return { valid: true, issues: [] };
  }
}

export default UnifiedCERService;
