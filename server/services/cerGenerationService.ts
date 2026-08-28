/**
 * CER Generation Service
 *
 * Clinical Evaluation Report generation with deterministic templates
 * MDR 2017/745 and IVDR 2017/746 compliant
 *
 * Features:
 * - Deterministic template-based generation
 * - Version control and change tracking
 * - Clinical evidence integration
 * - Essential requirements mapping (evidence-derived, fail-closed)
 *
 * Export lives elsewhere: the governed CER export surface is
 * server/routes/cerv2-export-routes.ts + server/export/renderers.ts. The
 * unreachable exportCer/generatePdf/generateDocx/generateXml family this file
 * once carried was deleted in the D11c dead-path purge.
 */

import { db } from '../db';
import {
  cerReports,
  cerClinicalEvidence,
  cerTemplates,
  cerVersionHistory,
  deviceProfiles,
  CerReport,
  CerTemplate,
  CerClinicalEvidence,
} from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import auditService from './auditService';

interface CerGenerationOptions {
  deviceId: number;
  templateId?: string;
  organizationId: number;
  userId: number;
  regulatoryFramework: 'MDR_2017_745' | 'IVDR_2017_746' | 'UK_MDR_2002' | 'Swiss_MedDO';
  notifiedBodyId?: string;
}

interface CerSection {
  title: string;
  content: string | any;
  subsections?: CerSection[];
  metadata?: any;
}

interface ClinicalEvidenceSource {
  type: 'clinical_investigation' | 'literature' | 'post_market' | 'registry' | 'real_world';
  title: string;
  authors?: string;
  year?: number;
  patients?: number;
  findings: string;
  relevance: number;
  quality: number;
}

/**
 * Conformity vocabulary for essential-requirement assessments.
 *
 * Aligned with the honest, evidence-first stance of
 * server/services/cer/cerConformanceValidator.ts and the free-text `status`
 * column of shared/schema.ts cer_essential_requirements: a requirement is
 * NEVER marked as conforming without evidence recorded for the report. The
 * strongest evidence-derived status is "evidence linked, assessment pending" —
 * an actual conformity verdict requires expert clinical judgement and is never
 * auto-asserted by this service.
 */
export const CONFORMITY_NOT_ASSESSED = 'Not assessed — no linked evidence';
export const CONFORMITY_EVIDENCE_LINKED =
  'Evidence linked — conformity assessment pending expert review';

/** Minimal shape of a cer_clinical_evidence row used for evidence derivation. */
interface LinkedEvidenceLike {
  title?: string | null;
}

/** One evidence-derived essential-requirement assessment row. */
interface EssentialRequirementAssessment {
  requirement: string;
  description: string;
  conformity: string;
  /** What documentation WOULD demonstrate conformity (informational, not a claim). */
  expectedEvidence: string;
  /** Titles of evidence rows actually recorded for this report. Empty = none. */
  linkedEvidence: string[];
}

class CerGenerationService {
  private readonly templateEngine: Map<string, Function>;
  
  constructor() {
    this.templateEngine = this.initializeTemplateEngine();
  }

  /**
   * Initialize deterministic template engine
   */
  private initializeTemplateEngine(): Map<string, Function> {
    const engine = new Map<string, Function>();
    
    // Executive Summary Template
    engine.set('executive_summary', (data: any) => ({
      title: 'Executive Summary',
      content: {
        deviceName: data.deviceName,
        deviceClass: data.deviceClass,
        intendedPurpose: data.intendedPurpose,
        clinicalEvaluation: `This Clinical Evaluation Report (CER) for ${data.deviceName} has been prepared in accordance with ${data.regulatoryFramework} requirements.`,
        // Draft-honest: a benefit-risk verdict must be derived from the
        // documented benefit-risk analysis and linked clinical evidence — it is
        // never asserted at generation time, when no evidence is linked yet.
        conclusion: `Draft — the benefit-risk conclusion for ${data.deviceName} has not yet been established. It must be supported by the documented benefit-risk analysis and the clinical evidence linked to this report.`,
        date: new Date().toISOString().split('T')[0]
      }
    }));

    // Device Description Template
    engine.set('device_description', (data: any) => ({
      title: 'Device Description',
      content: {
        generalDescription: data.description,
        intendedUse: data.intendedUse,
        indications: data.indications,
        contraindications: data.contraindications || 'None identified',
        targetPopulation: data.targetPopulation,
        principlesOfOperation: data.operationPrinciples,
        materials: data.materials,
        specifications: data.specifications
      }
    }));

    // Essential Requirements Template — evidence-derived and fail-closed:
    // when no linked evidence is supplied (the default), every requirement is
    // reported as "Not assessed", never as conforming.
    engine.set('essential_requirements', (data: any) => ({
      title: 'Essential Requirements',
      content: this.buildEssentialRequirementsContent(
        Array.isArray(data?.linkedEvidence) ? data.linkedEvidence : []
      )
    }));

    // Clinical Background Template
    engine.set('clinical_background', (data: any) => ({
      title: 'Clinical Background',
      content: {
        medicalCondition: data.medicalCondition,
        currentTreatmentOptions: data.currentTreatments,
        clinicalBenefits: data.expectedBenefits,
        targetPopulation: data.targetPopulation,
        epidemiology: data.epidemiology
      }
    }));

    // Risk-Benefit Analysis Template
    engine.set('risk_benefit_analysis', (data: any) => ({
      title: 'Risk-Benefit Analysis',
      content: {
        identifiedRisks: data.risks || [],
        riskMitigation: data.mitigationMeasures || [],
        clinicalBenefits: data.benefits || [],
        benefitRiskRatio: this.calculateBenefitRiskRatio(data),
        conclusion: this.generateRiskBenefitConclusion(data)
      }
    }));

    return engine;
  }

  /**
   * Generate a new CER report
   */
  async generateCER(options: CerGenerationOptions): Promise<CerReport> {
    try {
      // Get device information
      const [device] = await db
        .select()
        .from(deviceProfiles)
        .where(eq(deviceProfiles.id, options.deviceId))
        .limit(1);

      if (!device) {
        throw new Error('Device not found');
      }

      // Get or create template
      const template = await this.getOrCreateTemplate(
        options.templateId || 'default_cer_template',
        options.organizationId,
        options.userId
      );

      // Generate CER number
      const cerNumber = await this.generateCerNumber(options.organizationId);

      // Create CER structure using templates
      const cerStructure = await this.buildCerStructure(device, template, options);

      // Create CER report
      const [newCer] = await db
        .insert(cerReports)
        .values({
          organizationId: options.organizationId,
          reportId: cerNumber,
          deviceId: options.deviceId,
          deviceName: device.deviceName ?? '',
          deviceClass: device.classification,
          cerNumber,
          cerVersion: '1.0',
          cerStatus: 'draft',
          regulatoryFramework: options.regulatoryFramework,
          notifiedBodyId: options.notifiedBodyId,
          executiveSummary: cerStructure.executiveSummary,
          deviceDescription: cerStructure.deviceDescription,
          essentialRequirements: cerStructure.essentialRequirements,
          clinicalBackground: cerStructure.clinicalBackground,
          clinicalEvidence: cerStructure.clinicalEvidence,
          literatureReview: cerStructure.literatureReview,
          riskBenefitAnalysis: cerStructure.riskBenefitAnalysis,
          conclusions: cerStructure.conclusions,
          templateId: template.templateId,
          templateVersion: template.version,
          templateChecksum: this.calculateChecksum(template),
          createdBy: options.userId,
          updatedBy: options.userId,
          changeLog: [{
            version: '1.0',
            date: new Date().toISOString(),
            author: options.userId,
            changes: 'Initial CER creation'
          }]
        })
        .returning();

      // Log audit trail
      await auditService.logAction({
        organizationId: options.organizationId,
        userId: options.userId,
        action: 'CREATE',
        resourceType: 'CER_REPORT',
        resourceId: newCer.id.toString(),
        details: {
          cerNumber,
          deviceId: options.deviceId,
          regulatoryFramework: options.regulatoryFramework
        }
      });

      return newCer;
    } catch (error) {
      console.error('Error generating CER:', error);
      throw error;
    }
  }

  /**
   * Add clinical evidence to CER
   */
  async addClinicalEvidence(
    cerReportId: number,
    evidence: ClinicalEvidenceSource,
    userId: number,
    organizationId: number
  ): Promise<CerClinicalEvidence> {
    try {
      // Verify CER belongs to the organization
      const [cer] = await db
        .select()
        .from(cerReports)
        .where(and(
          eq(cerReports.id, cerReportId),
          eq(cerReports.organizationId, organizationId)
        ))
        .limit(1);

      if (!cer) {
        throw new Error('CER report not found or access denied');
      }

      const [newEvidence] = await db
        .insert(cerClinicalEvidence)
        .values({
          cerReportId,
          evidenceType: evidence.type,
          title: evidence.title,
          authors: evidence.authors,
          year: evidence.year,
          patients: evidence.patients,
          findings: evidence.findings,
          relevance: evidence.relevance,
          quality: evidence.quality,
          metadata: { includeInReport: true, addedBy: userId },
        })
        .returning();

      // Update CER report statistics
      await this.updateCerStatistics(cerReportId);

      // Re-derive the evidence-linked sections from the rows actually recorded
      // so the report never claims more (or less) evidence than the DB holds.
      await this.refreshEvidenceDerivedSections(cerReportId, cer);

      return newEvidence;
    } catch (error) {
      console.error('Error adding clinical evidence:', error);
      throw error;
    }
  }

  /**
   * Update CER version
   */
  async updateCerVersion(
    cerReportId: number,
    changes: Partial<CerReport>,
    userId: number,
    changeSummary: string,
    organizationId: number
  ): Promise<CerReport> {
    try {
      // Get current CER and verify organization
      const [currentCer] = await db
        .select()
        .from(cerReports)
        .where(and(
          eq(cerReports.id, cerReportId),
          eq(cerReports.organizationId, organizationId)
        ))
        .limit(1);

      if (!currentCer) {
        throw new Error('CER report not found or access denied');
      }

      // Create version history entry
      const currentVersion = currentCer.cerVersion ?? '1.0';
      const newVersion = this.incrementVersion(currentVersion);

      await db.insert(cerVersionHistory).values({
        cerReportId,
        version: currentVersion,
        changeLog: {
          versionType: this.getVersionType(currentVersion, newVersion),
          changeSummary,
          changedSections: Object.keys(changes),
          reportSnapshot: currentCer,
          reviewStatus: 'pending',
        },
        createdBy: userId,
      });

      // Update CER with new version
      const updatedChanges = {
        ...changes,
        cerVersion: newVersion,
        updatedBy: userId,
        updatedAt: new Date(),
        changeLog: [
          ...(currentCer.changeLog as any[] || []),
          {
            version: newVersion,
            date: new Date().toISOString(),
            author: userId,
            changes: changeSummary
          }
        ]
      };

      const [updatedCer] = await db
        .update(cerReports)
        .set(updatedChanges)
        .where(eq(cerReports.id, cerReportId))
        .returning();

      // Log audit trail
      await auditService.logAction({
        organizationId: updatedCer.organizationId,
        userId,
        action: 'UPDATE',
        resourceType: 'CER_REPORT',
        resourceId: cerReportId.toString(),
        details: {
          version: newVersion,
          changeSummary,
          changedSections: Object.keys(changes)
        }
      });

      return updatedCer;
    } catch (error) {
      console.error('Error updating CER version:', error);
      throw error;
    }
  }

  // NOTE (D11c): the exportCer/generatePdf/generateDocx/generateXml family
  // that lived here was unreachable — no route or service ever called
  // exportCer, and the canonical CER export surface is
  // server/routes/cerv2-export-routes.ts + server/export/renderers.ts
  // (governed, human-review-gated). Deleted rather than kept as a rival
  // export path.

  // Helper methods

  private async generateCerNumber(organizationId: number): Promise<string> {
    const year = new Date().getFullYear();
    const [lastCer] = await db
      .select({ cerNumber: cerReports.cerNumber })
      .from(cerReports)
      .where(eq(cerReports.organizationId, organizationId))
      .orderBy(desc(cerReports.createdAt))
      .limit(1);

    let sequence = 1;
    if (lastCer?.cerNumber && lastCer.cerNumber.startsWith(`CER-${year}`)) {
      const parts = lastCer.cerNumber.split('-');
      sequence = parseInt(parts[2]) + 1;
    }

    return `CER-${year}-${String(sequence).padStart(4, '0')}`;
  }

  private async getOrCreateTemplate(
    templateId: string,
    organizationId: number,
    createdBy: number
  ): Promise<CerTemplate> {
    const [existing] = await db
      .select()
      .from(cerTemplates)
      .where(
        and(
          eq(cerTemplates.templateId, templateId),
          eq(cerTemplates.organizationId, organizationId)
        )
      )
      .limit(1);

    if (existing) return existing;

    // Create default template
    const [newTemplate] = await db
      .insert(cerTemplates)
      .values({
        organizationId,
        templateId,
        name: 'Default CER Template',
        version: '1.0',
        content: this.getDefaultTemplateStructure(),
        metadata: {
          templateType: 'full_cer',
          status: 'active',
          requiredFields: this.getRequiredFields(),
          deviceClasses: ['I', 'IIa', 'IIb', 'III'],
          regulatoryFrameworks: ['MDR_2017_745', 'IVDR_2017_746'],
          createdBy,
          templateChecksum: this.calculateChecksum(this.getDefaultTemplateStructure()),
        }
      })
      .returning();

    return newTemplate;
  }

  private async buildCerStructure(
    device: any,
    template: CerTemplate,
    options: CerGenerationOptions
  ): Promise<any> {
    const structure: any = {};

    // Generate each section using templates
    structure.executiveSummary = this.templateEngine.get('executive_summary')!({
      deviceName: device.deviceName,
      deviceClass: device.classification,
      intendedPurpose: device.intendedUse,
      regulatoryFramework: options.regulatoryFramework
    });

    structure.deviceDescription = this.templateEngine.get('device_description')!({
      ...device,
      description: device.description,
      intendedUse: device.intendedUse,
      indications: device.indications,
      targetPopulation: device.targetPopulation
    });

    // A newly generated CER cannot have linked clinical evidence yet: evidence
    // rows in cer_clinical_evidence reference the report id, which does not
    // exist until the insert in generateCER. Every evidence-derived section
    // therefore starts in its honest empty state ("none recorded") and is
    // refreshed from the DB as evidence is added (see addClinicalEvidence).
    structure.essentialRequirements = this.templateEngine.get('essential_requirements')!(device);
    structure.clinicalBackground = this.templateEngine.get('clinical_background')!(device);
    structure.riskBenefitAnalysis = this.templateEngine.get('risk_benefit_analysis')!(device);

    structure.clinicalEvidence = {
      title: 'Clinical Evidence',
      content: {
        overview: 'No clinical evidence has been recorded for this report. Sources appear here as evidence is added.',
        sources: []
      }
    };

    structure.literatureReview = {
      title: 'Literature Review',
      content: {
        searchStrategy: 'No literature search has been recorded for this report.',
        databases: [],
        results: []
      }
    };

    structure.conclusions = {
      title: 'Conclusions',
      content: {
        summary: `Draft conclusions for ${device.deviceName}: essential-requirement conformity has not been assessed and no clinical evidence has been linked yet.`,
        benefitRisk: 'Benefit-risk determination pending — see the Risk-Benefit Analysis section for the evidence-derived verdict.',
        recommendations: 'Record clinical evidence, complete the literature review, and perform the conformity assessment before this CER is finalized.'
      }
    };

    return structure;
  }

  /**
   * Build the evidence-derived essential-requirements section.
   *
   * Fail-closed contract:
   * - Every requirement defaults to "Not assessed — no linked evidence".
   * - The ONLY requirement with a real evidence linkage in the data model is
   *   ER 14 (clinical evaluation): cer_clinical_evidence rows recorded for the
   *   report ARE the clinical data of the evaluation. When such rows exist,
   *   ER 14 is upgraded to "Evidence linked — conformity assessment pending
   *   expert review" — never to an outright conformity claim.
   * - ER 1/2/3/13 have NO evidence-linkage model in the schema (evidence rows
   *   reference the report, not individual requirements, and design/labeling
   *   documentation is not captured). Rather than inventing a linkage, they
   *   always remain "Not assessed" and are surfaced in the gaps list.
   */
  private buildEssentialRequirementsContent(linkedEvidence: LinkedEvidenceLike[]): {
    assessmentBasis: string;
    generalRequirements: EssentialRequirementAssessment[];
    designRequirements: EssentialRequirementAssessment[];
    informationRequirements: EssentialRequirementAssessment[];
    clinicalRequirements: EssentialRequirementAssessment[];
    gaps: string[];
  } {
    const generalRequirements = this.generateGeneralRequirements();
    const designRequirements = this.generateDesignRequirements();
    const informationRequirements = this.generateInformationRequirements();
    const clinicalRequirements = this.generateClinicalRequirements(linkedEvidence);

    const all = [
      ...generalRequirements,
      ...designRequirements,
      ...informationRequirements,
      ...clinicalRequirements
    ];
    const gaps = all
      .filter(r => r.conformity === CONFORMITY_NOT_ASSESSED)
      .map(r => `${r.requirement} (${r.description}): no linked evidence — conformity not assessed`);

    return {
      assessmentBasis:
        'Evidence-derived assessment: a requirement is only marked as supported when evidence ' +
        'recorded for this report is linked to it; all other requirements remain "Not assessed". ' +
        'No conformity is asserted without evidence.',
      generalRequirements,
      designRequirements,
      informationRequirements,
      clinicalRequirements,
      gaps
    };
  }

  private generateGeneralRequirements(): EssentialRequirementAssessment[] {
    return [
      {
        requirement: 'ER 1',
        description: 'Devices shall be designed and manufactured to be suitable for their intended purpose',
        conformity: CONFORMITY_NOT_ASSESSED,
        expectedEvidence: 'Design verification and validation documentation',
        linkedEvidence: []
      },
      {
        requirement: 'ER 2',
        description: 'Devices shall be safe and effective',
        conformity: CONFORMITY_NOT_ASSESSED,
        expectedEvidence: 'Clinical evaluation and risk management file',
        linkedEvidence: []
      }
    ];
  }

  private generateDesignRequirements(): EssentialRequirementAssessment[] {
    return [
      {
        requirement: 'ER 3',
        description: 'Chemical, physical and biological properties',
        conformity: CONFORMITY_NOT_ASSESSED,
        expectedEvidence: 'Material safety data and biocompatibility testing',
        linkedEvidence: []
      }
    ];
  }

  private generateInformationRequirements(): EssentialRequirementAssessment[] {
    return [
      {
        requirement: 'ER 13',
        description: 'Information supplied with the device',
        conformity: CONFORMITY_NOT_ASSESSED,
        expectedEvidence: 'Instructions for use and labeling',
        linkedEvidence: []
      }
    ];
  }

  private generateClinicalRequirements(
    linkedEvidence: LinkedEvidenceLike[]
  ): EssentialRequirementAssessment[] {
    // Only rows with a real title count as evidence — blank/placeholder rows
    // never upgrade the status (fail closed).
    const titles = linkedEvidence
      .map(e => (typeof e?.title === 'string' ? e.title.trim() : ''))
      .filter(t => t.length > 0);

    return [
      {
        requirement: 'ER 14',
        description: 'Clinical evaluation',
        conformity: titles.length > 0 ? CONFORMITY_EVIDENCE_LINKED : CONFORMITY_NOT_ASSESSED,
        expectedEvidence:
          'Clinical data recorded for this report (clinical investigations, literature, post-market surveillance, registries, real-world evidence)',
        linkedEvidence: titles
      }
    ];
  }

  private calculateBenefitRiskRatio(data: any): string {
    const benefits = data.benefits?.length || 0;
    const risks = data.risks?.length || 0;

    // An empty benefit-risk analysis is INDETERMINATE, not favorable. Under MDR
    // Annex I §1/§8 and MEDDEV 2.7/1 rev 4 the benefit-risk conclusion must be
    // supported by documented clinical benefits; with no benefits AND no risks
    // recorded there is no evidentiary basis for any favorable verdict, so this
    // must fail closed to review rather than auto-certify "Highly favorable".
    if (benefits === 0) return 'Needs review';

    // An empty RISK analysis is not a zero-risk device — it is an unperformed
    // (or not-yet-recorded) assessment. The data model carries no explicit
    // "risk assessment completed" signal that could distinguish "risks assessed
    // and found acceptable/zero" from "no risks recorded yet", so we fail closed:
    // with no documented risks there is no evidentiary basis to assert that
    // benefits outweigh residual risks, and returning "Highly favorable" here
    // would fabricate a favorable benefit-risk verdict from an empty analysis.
    // Mirror the empty-benefits guard above and return the honest review state.
    if (risks === 0) return 'Needs review';
    const ratio = benefits / risks;

    if (ratio > 2) return 'Highly favorable';
    if (ratio > 1) return 'Favorable';
    if (ratio === 1) return 'Balanced';
    return 'Needs review';
  }

  private generateRiskBenefitConclusion(data: any): string {
    const ratio = this.calculateBenefitRiskRatio(data);
    const base = `Based on the analysis, the benefit-risk ratio is ${ratio.toLowerCase()}.`;
    // The "benefits outweigh the risks" claim is only made when the
    // evidence-derived ratio actually supports it — never for an
    // indeterminate ("needs review") or balanced analysis.
    if (ratio === 'Highly favorable' || ratio === 'Favorable') {
      return `${base} The documented clinical benefits outweigh the residual risks when the device is used as intended.`;
    }
    return `${base} A favorable benefit-risk conclusion cannot be drawn from the documented benefits and risks at this time.`;
  }

  /**
   * Rebuild the evidence-derived report sections (clinical evidence sources and
   * the essential-requirements assessment) from the cer_clinical_evidence rows
   * actually stored for the report.
   *
   * The essential-requirements section is only regenerated while it is still
   * the machine-generated, evidence-derived assessment (identified by its
   * `assessmentBasis` marker) — a manually authored section is never
   * overwritten.
   */
  private async refreshEvidenceDerivedSections(
    cerReportId: number,
    currentCer: CerReport
  ): Promise<void> {
    const evidenceRows = await db
      .select()
      .from(cerClinicalEvidence)
      .where(eq(cerClinicalEvidence.cerReportId, cerReportId));

    const sources = evidenceRows.map(row => ({
      type: row.evidenceType,
      title: row.title,
      authors: row.authors,
      year: row.year,
      patients: row.patients,
      findings: row.findings,
      relevance: row.relevance,
      quality: row.quality
    }));

    const currentEr = currentCer.essentialRequirements as
      | { content?: { assessmentBasis?: unknown } }
      | null;
    const erIsMachineGenerated = currentEr == null || currentEr?.content?.assessmentBasis != null;

    await db
      .update(cerReports)
      .set({
        clinicalEvidence: {
          title: 'Clinical Evidence',
          content: {
            overview:
              sources.length > 0
                ? `${sources.length} clinical evidence source(s) recorded for this report.`
                : 'No clinical evidence has been recorded for this report. Sources appear here as evidence is added.',
            sources
          }
        },
        ...(erIsMachineGenerated
          ? {
              essentialRequirements: {
                title: 'Essential Requirements',
                content: this.buildEssentialRequirementsContent(evidenceRows)
              }
            }
          : {}),
        updatedAt: new Date()
      })
      .where(eq(cerReports.id, cerReportId));
  }

  private async updateCerStatistics(cerReportId: number): Promise<void> {
    const evidenceCount = await db
      .select({ count: sql`count(*)` })
      .from(cerClinicalEvidence)
      .where(eq(cerClinicalEvidence.cerReportId, cerReportId));

    const patientSum = await db
      .select({ total: sql`sum(${cerClinicalEvidence.patients})` })
      .from(cerClinicalEvidence)
      .where(eq(cerClinicalEvidence.cerReportId, cerReportId));

    await db
      .update(cerReports)
      .set({
        metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${sql.raw(
          `'${JSON.stringify({
            totalStudiesReviewed: Number(evidenceCount[0].count) || 0,
            totalPatientsIncluded: Number(patientSum[0].total) || 0,
          })}'::jsonb`
        )}`,
      })
      .where(eq(cerReports.id, cerReportId));
  }

  private incrementVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    const patch = parseInt(parts[1]) + 1;
    return `${parts[0]}.${patch}`;
  }

  private getVersionType(oldVersion: string, newVersion: string): string {
    const oldParts = oldVersion.split('.');
    const newParts = newVersion.split('.');
    
    if (oldParts[0] !== newParts[0]) return 'major';
    if (oldParts[1] !== newParts[1]) return 'minor';
    return 'patch';
  }

  private calculateChecksum(data: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  private getDefaultTemplateStructure(): any {
    return {
      sections: [
        'executiveSummary',
        'deviceDescription',
        'essentialRequirements',
        'clinicalBackground',
        'clinicalEvidence',
        'literatureReview',
        'riskBenefitAnalysis',
        'conclusions'
      ],
      formatting: {
        font: 'Arial',
        fontSize: 11,
        lineSpacing: 1.5
      }
    };
  }

  private getRequiredFields(): string[] {
    return [
      'deviceName',
      'deviceClass',
      'intendedUse',
      'clinicalEvidence',
      'riskAnalysis',
      'conclusions'
    ];
  }

}

export default new CerGenerationService();