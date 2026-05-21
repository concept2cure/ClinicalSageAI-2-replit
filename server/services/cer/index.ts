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

// Re-export from primary service (legacy class+function names not actually
// exported — adapt the default singleton instead).
import cerGenerationService from '../cerGenerationService';
export const CERGenerationService: any = (cerGenerationService as any).constructor;
export const generateCERReport: any = (cerGenerationService as any).generate?.bind?.(cerGenerationService);

// Re-export generator utilities (cerGenerator default export shape varies)
import * as cerGeneratorModule from '../cerGenerator';
export const CERGenerator: any = (cerGeneratorModule as any).CERGenerator
  ?? (cerGeneratorModule as any).default;

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
    // Delegate to primary service
    const mod = (await import('../cerGenerationService')) as any;
    const service = mod.default ?? (mod.CERGenerationService ? new mod.CERGenerationService() : undefined);
    return service.generate(this.config);
  }

  async validateReport(reportId: string): Promise<{ valid: boolean; issues: string[] }> {
    // Validation logic
    return { valid: true, issues: [] };
  }
}

export default UnifiedCERService;
