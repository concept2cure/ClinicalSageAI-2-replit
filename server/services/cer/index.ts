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

import cerGen from '../cerGenerationService';

// Re-export from primary service (default singleton instance)
export { default as cerGenerationService } from '../cerGenerationService';

// Re-export generator utilities
export { generateCerSections, assembleHtml, renderPdf, setupWorkers } from '../cerGenerator';

/** Regulatory frameworks supported by the underlying generation service. */
export type CERRegulatoryFramework =
  | 'MDR_2017_745'
  | 'IVDR_2017_746'
  | 'UK_MDR_2002'
  | 'Swiss_MedDO';

// Unified interface for CER operations. These are the inputs the underlying
// cerGenerationService.generateCER actually requires — the facade now carries
// them instead of failing closed.
export interface CERServiceConfig {
  organizationId: number;
  deviceId: number;
  userId: number;
  regulatoryFramework: CERRegulatoryFramework;
  templateId?: string;
  notifiedBodyId?: string;
  deviceName?: string;
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

/** Maps CerReport columns to rendered facade sections, in report order. */
const SECTION_MAP: ReadonlyArray<{ key: string; id: string; title: string }> = [
  { key: 'executiveSummary', id: 'executive_summary', title: 'Executive Summary' },
  { key: 'deviceDescription', id: 'device_description', title: 'Device Description' },
  { key: 'essentialRequirements', id: 'essential_requirements', title: 'Essential Requirements (Annex I GSPR)' },
  { key: 'clinicalBackground', id: 'clinical_background', title: 'Clinical Background' },
  { key: 'clinicalEvidence', id: 'clinical_evidence', title: 'Clinical Evidence' },
  { key: 'literatureReview', id: 'literature_review', title: 'Literature Review' },
  { key: 'riskBenefitAnalysis', id: 'risk_benefit_analysis', title: 'Risk-Benefit Analysis' },
  { key: 'conclusions', id: 'conclusions', title: 'Conclusions' },
];

/**
 * Unified CER service facade. Wires through to the working, DB-backed
 * cerGenerationService (MDR/IVDR template engine with audit trail) rather than
 * returning a fabricated or fail-closed result.
 */
export class UnifiedCERService {
  constructor(private config: CERServiceConfig) {}

  async generateReport(): Promise<CERGenerationResult> {
    const warnings: string[] = [];
    try {
      const cer = await cerGen.generateCER({
        deviceId: this.config.deviceId,
        organizationId: this.config.organizationId,
        userId: this.config.userId,
        regulatoryFramework: this.config.regulatoryFramework,
        templateId: this.config.templateId,
        notifiedBodyId: this.config.notifiedBodyId,
      });

      const sections = this.buildSections(cer as unknown as Record<string, unknown>, warnings);
      const createdAt = (cer as { createdAt?: unknown }).createdAt;
      return {
        reportId: (cer as { reportId?: string; id?: number }).reportId ?? String((cer as { id?: number }).id ?? ''),
        status: sections.length > 0 ? 'success' : 'partial',
        sections,
        generatedAt:
          createdAt instanceof Date ? createdAt : createdAt ? new Date(createdAt as string) : new Date(),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      // Real failure (e.g. device not found, DB error). Fail closed with the
      // reason rather than returning a fabricated or partial success.
      return {
        reportId: '',
        status: 'failed',
        sections: [],
        generatedAt: new Date(),
        warnings: [`CER generation failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  private buildSections(cer: Record<string, unknown>, warnings: string[]): CERSection[] {
    const sections: CERSection[] = [];
    for (const { key, id, title } of SECTION_MAP) {
      const raw = cer[key];
      if (raw == null) {
        warnings.push(`Section "${title}" was not generated.`);
        continue;
      }
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      const trimmed = content.trim();
      sections.push({
        id,
        title,
        content,
        status: 'draft',
        wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
      });
    }
    return sections;
  }

  async validateReport(_reportId: string): Promise<{ valid: boolean; issues: string[] }> {
    // Generation is wired, but conformance validation (MEDDEV 2.7/1 rev 4,
    // Annex I GSPR, Annex XIV) is a separate engine that does not yet exist.
    // Returning { valid: true } would falsely certify an unvalidated regulated
    // report as conformant — a dangerous false positive. Fail closed.
    return {
      valid: false,
      issues: [
        'CER conformance validation is not implemented (MEDDEV 2.7/1 rev 4 / ' +
          'Annex I GSPR / Annex XIV). A generated report cannot be certified valid yet.',
      ],
    };
  }
}

export default UnifiedCERService;
