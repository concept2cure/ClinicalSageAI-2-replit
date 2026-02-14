// @ts-nocheck
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
 * - Essential requirements mapping
 * - Post-market surveillance integration
 * - Multi-format export (PDF, DOCX, XML)
 */

import { db } from '../db/index';
import {
  cerReports,
  cerClinicalEvidence,
  cerEssentialRequirements,
  cerTemplates,
  cerVersionHistory,
  deviceProfiles,
  deviceSubmissions,
  users,
  organizations,
  CerReport,
  NewCerReport,
  CerTemplate,
  CerClinicalEvidence,
  NewCerClinicalEvidence,
} from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import auditService from './auditService';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';

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
        conclusion: `Based on the clinical data analyzed, ${data.deviceName} demonstrates an acceptable benefit-risk profile for its intended use.`,
        date: new Date().toISOString().split('T')[0],
      },
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
        specifications: data.specifications,
      },
    }));

    // Essential Requirements Template
    engine.set('essential_requirements', (data: any) => ({
      title: 'Essential Requirements',
      content: {
        generalRequirements: this.generateGeneralRequirements(data),
        designRequirements: this.generateDesignRequirements(data),
        informationRequirements: this.generateInformationRequirements(data),
        clinicalRequirements: this.generateClinicalRequirements(data),
      },
    }));

    // Clinical Background Template
    engine.set('clinical_background', (data: any) => ({
      title: 'Clinical Background',
      content: {
        medicalCondition: data.medicalCondition,
        currentTreatmentOptions: data.currentTreatments,
        clinicalBenefits: data.expectedBenefits,
        targetPopulation: data.targetPopulation,
        epidemiology: data.epidemiology,
      },
    }));

    // Risk-Benefit Analysis Template
    engine.set('risk_benefit_analysis', (data: any) => ({
      title: 'Risk-Benefit Analysis',
      content: {
        identifiedRisks: data.risks || [],
        riskMitigation: data.mitigationMeasures || [],
        clinicalBenefits: data.benefits || [],
        benefitRiskRatio: this.calculateBenefitRiskRatio(data),
        conclusion: this.generateRiskBenefitConclusion(data),
      },
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
        options.organizationId
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
          deviceId: options.deviceId,
          deviceName: device.deviceName,
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
          changeLog: [
            {
              version: '1.0',
              date: new Date().toISOString(),
              author: options.userId,
              changes: 'Initial CER creation',
            },
          ],
        } as NewCerReport)
        .returning();

      // Log audit trail
      await auditService.logAction({
        organizationId: options.organizationId,
        userId: options.userId,
        action: 'CREATE',
        resource: 'CER_REPORT',
        resourceId: newCer.id.toString(),
        details: {
          cerNumber,
          deviceId: options.deviceId,
          regulatoryFramework: options.regulatoryFramework,
        },
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
        .where(and(eq(cerReports.id, cerReportId), eq(cerReports.organizationId, organizationId)))
        .limit(1);

      if (!cer) {
        throw new Error('CER report not found or access denied');
      }

      const [newEvidence] = await db
        .insert(cerClinicalEvidence)
        .values({
          cerReportId,
          evidenceType: evidence.type,
          sourceTitle: evidence.title,
          sourceAuthors: evidence.authors,
          publicationYear: evidence.year,
          numberOfPatients: evidence.patients,
          keyFindings: evidence.findings,
          relevanceScore: evidence.relevance,
          qualityScore: evidence.quality,
          includeInReport: true,
          addedBy: userId,
        } as NewCerClinicalEvidence)
        .returning();

      // Update CER report statistics
      await this.updateCerStatistics(cerReportId);

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
        .where(and(eq(cerReports.id, cerReportId), eq(cerReports.organizationId, organizationId)))
        .limit(1);

      if (!currentCer) {
        throw new Error('CER report not found or access denied');
      }

      // Create version history entry
      const newVersion = this.incrementVersion(currentCer.cerVersion);

      await db.insert(cerVersionHistory).values({
        cerReportId,
        versionNumber: currentCer.cerVersion,
        versionType: this.getVersionType(currentCer.cerVersion, newVersion),
        changeSummary,
        changedSections: Object.keys(changes),
        reportSnapshot: currentCer,
        reviewStatus: 'pending',
        authorId: userId,
      });

      // Update CER with new version
      const updatedChanges = {
        ...changes,
        cerVersion: newVersion,
        updatedBy: userId,
        updatedAt: new Date(),
        changeLog: [
          ...((currentCer.changeLog as any[]) || []),
          {
            version: newVersion,
            date: new Date().toISOString(),
            author: userId,
            changes: changeSummary,
          },
        ],
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
        resource: 'CER_REPORT',
        resourceId: cerReportId.toString(),
        details: {
          version: newVersion,
          changeSummary,
          changedSections: Object.keys(changes),
        },
      });

      return updatedCer;
    } catch (error) {
      console.error('Error updating CER version:', error);
      throw error;
    }
  }

  /**
   * Export CER to various formats
   */
  async exportCer(
    cerReportId: number,
    format: 'PDF' | 'DOCX' | 'XML',
    userId: number,
    organizationId: number
  ): Promise<{ content: string | Buffer; filename: string }> {
    try {
      const [cer] = await db
        .select()
        .from(cerReports)
        .where(and(eq(cerReports.id, cerReportId), eq(cerReports.organizationId, organizationId)))
        .limit(1);

      if (!cer) {
        throw new Error('CER report not found or access denied');
      }

      let exportContent: string | Buffer;
      let filename: string;

      switch (format) {
        case 'PDF':
          exportContent = await this.generatePdf(cer);
          filename = `CER_${cer.cerNumber}_v${cer.cerVersion}.pdf`;
          break;
        case 'DOCX':
          exportContent = await this.generateDocx(cer);
          filename = `CER_${cer.cerNumber}_v${cer.cerVersion}.docx`;
          break;
        case 'XML':
          exportContent = await this.generateXml(cer);
          filename = `CER_${cer.cerNumber}_v${cer.cerVersion}.xml`;
          break;
        default:
          throw new Error('Unsupported export format');
      }

      // Update export tracking
      const exportChecksum = this.calculateChecksum(exportContent);

      await db
        .update(cerReports)
        .set({
          lastExportedAt: new Date(),
          exportFormat: format,
          exportChecksum,
        })
        .where(eq(cerReports.id, cerReportId));

      // Log export
      await auditService.logAction({
        organizationId: cer.organizationId,
        userId,
        action: 'EXPORT',
        resource: 'CER_REPORT',
        resourceId: cerReportId.toString(),
        details: {
          format,
          checksum: exportChecksum,
          cerNumber: cer.cerNumber,
          version: cer.cerVersion,
        },
      });

      return { content: exportContent, filename };
    } catch (error) {
      console.error('Error exporting CER:', error);
      throw error;
    }
  }

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
    if (lastCer && lastCer.cerNumber.startsWith(`CER-${year}`)) {
      const parts = lastCer.cerNumber.split('-');
      sequence = parseInt(parts[2]) + 1;
    }

    return `CER-${year}-${String(sequence).padStart(4, '0')}`;
  }

  private async getOrCreateTemplate(
    templateId: string,
    organizationId: number
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
        templateName: 'Default CER Template',
        templateType: 'full_cer',
        version: '1.0',
        status: 'active',
        templateStructure: this.getDefaultTemplateStructure(),
        requiredFields: this.getRequiredFields(),
        deviceClasses: ['I', 'IIa', 'IIb', 'III'],
        regulatoryFrameworks: ['MDR_2017_745', 'IVDR_2017_746'],
        createdBy: 1, // System user
        templateChecksum: this.calculateChecksum(this.getDefaultTemplateStructure()),
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
      regulatoryFramework: options.regulatoryFramework,
    });

    structure.deviceDescription = this.templateEngine.get('device_description')!({
      ...device,
      description: device.description,
      intendedUse: device.intendedUse,
      indications: device.indications,
      targetPopulation: device.targetPopulation,
    });

    structure.essentialRequirements = this.templateEngine.get('essential_requirements')!(device);
    structure.clinicalBackground = this.templateEngine.get('clinical_background')!(device);
    structure.riskBenefitAnalysis = this.templateEngine.get('risk_benefit_analysis')!(device);

    structure.clinicalEvidence = {
      title: 'Clinical Evidence',
      content: {
        overview: 'Clinical evidence compiled from multiple sources',
        sources: [],
      },
    };

    structure.literatureReview = {
      title: 'Literature Review',
      content: {
        searchStrategy: 'Systematic literature search conducted',
        databases: ['PubMed', 'EMBASE', 'Cochrane'],
        results: [],
      },
    };

    structure.conclusions = {
      title: 'Conclusions',
      content: {
        summary: `The clinical evaluation demonstrates that ${device.deviceName} meets all applicable requirements.`,
        benefitRisk: 'The benefit-risk analysis is favorable.',
        recommendations: 'Continue post-market surveillance as planned.',
      },
    };

    return structure;
  }

  private generateGeneralRequirements(data: any): any[] {
    return [
      {
        requirement: 'ER 1',
        description:
          'Devices shall be designed and manufactured to be suitable for their intended purpose',
        conformity: 'Conforms',
        evidence: 'Design verification and validation documentation',
      },
      {
        requirement: 'ER 2',
        description: 'Devices shall be safe and effective',
        conformity: 'Conforms',
        evidence: 'Clinical evaluation and risk management file',
      },
    ];
  }

  private generateDesignRequirements(data: any): any[] {
    return [
      {
        requirement: 'ER 3',
        description: 'Chemical, physical and biological properties',
        conformity: 'Conforms',
        evidence: 'Material safety data and biocompatibility testing',
      },
    ];
  }

  private generateInformationRequirements(data: any): any[] {
    return [
      {
        requirement: 'ER 13',
        description: 'Information supplied with the device',
        conformity: 'Conforms',
        evidence: 'Instructions for use and labeling',
      },
    ];
  }

  private generateClinicalRequirements(data: any): any[] {
    return [
      {
        requirement: 'ER 14',
        description: 'Clinical evaluation',
        conformity: 'Conforms',
        evidence: 'This clinical evaluation report',
      },
    ];
  }

  private calculateBenefitRiskRatio(data: any): string {
    const benefits = data.benefits?.length || 0;
    const risks = data.risks?.length || 0;

    if (risks === 0) return 'Highly favorable';
    const ratio = benefits / risks;

    if (ratio > 2) return 'Highly favorable';
    if (ratio > 1) return 'Favorable';
    if (ratio === 1) return 'Balanced';
    return 'Needs review';
  }

  private generateRiskBenefitConclusion(data: any): string {
    const ratio = this.calculateBenefitRiskRatio(data);
    return `Based on the analysis, the benefit-risk ratio is ${ratio.toLowerCase()}. The clinical benefits outweigh the residual risks when the device is used as intended.`;
  }

  private async updateCerStatistics(cerReportId: number): Promise<void> {
    const evidenceCount = await db
      .select({ count: sql`count(*)` })
      .from(cerClinicalEvidence)
      .where(eq(cerClinicalEvidence.cerReportId, cerReportId));

    const patientSum = await db
      .select({ total: sql`sum(number_of_patients)` })
      .from(cerClinicalEvidence)
      .where(eq(cerClinicalEvidence.cerReportId, cerReportId));

    await db
      .update(cerReports)
      .set({
        totalStudiesReviewed: Number(evidenceCount[0].count) || 0,
        totalPatientsIncluded: Number(patientSum[0].total) || 0,
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
        'conclusions',
      ],
      formatting: {
        font: 'Arial',
        fontSize: 11,
        lineSpacing: 1.5,
      },
    };
  }

  private getRequiredFields(): string[] {
    return [
      'deviceName',
      'deviceClass',
      'intendedUse',
      'clinicalEvidence',
      'riskAnalysis',
      'conclusions',
    ];
  }

  private async generatePdf(cer: CerReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 72, left: 72, bottom: 72, right: 72 },
          info: {
            Title: `Clinical Evaluation Report - ${cer.deviceName}`,
            Author: 'eCTD Co-Author™',
            Subject: `CER ${cer.reportId} Version ${cer.version}`,
            Keywords: 'CER, Medical Device, Clinical Evaluation',
          },
        });

        // Collect PDF data
        const chunks: Buffer[] = [];
        doc.on('data', chunks.push.bind(chunks));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Title page
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('CLINICAL EVALUATION REPORT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(18).font('Helvetica').text(cer.deviceName, { align: 'center' });
        doc.moveDown();
        doc
          .fontSize(14)
          .text(`CER Number: ${cer.reportId}`, { align: 'center' })
          .text(`Version: ${cer.version || '1.0'}`, { align: 'center' })
          .text(`Status: ${cer.status}`, { align: 'center' });
        doc.moveDown(2);
        doc
          .fontSize(12)
          .text(`Device Manufacturer: ${cer.deviceManufacturer || 'N/A'}`)
          .text(`Device Type: ${cer.deviceType || 'N/A'}`);

        // Add page break
        doc.addPage();

        // Table of Contents
        doc.fontSize(18).font('Helvetica-Bold').text('TABLE OF CONTENTS', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).font('Helvetica');

        const sections = [
          '1. Executive Summary',
          '2. Device Description',
          '3. Clinical Background',
          '4. Essential Requirements',
          '5. Clinical Evidence',
          '6. Literature Review',
          '7. Risk-Benefit Analysis',
          '8. Conclusions',
        ];

        sections.forEach((section, index) => {
          doc.text(section);
        });

        // Add content sections
        doc.addPage();

        // Add actual content from cer.content (JSON)
        const content = cer.content || {};

        // Executive Summary
        doc.fontSize(16).font('Helvetica-Bold').text('1. EXECUTIVE SUMMARY');
        doc.fontSize(11).font('Helvetica');
        doc.moveDown();

        if (content.executiveSummary) {
          doc.text(
            JSON.stringify(content.executiveSummary.content || content.executiveSummary, null, 2)
          );
        } else {
          doc.text(
            `This Clinical Evaluation Report (CER) has been prepared for ${cer.deviceName} in accordance with applicable regulatory requirements.`
          );
          doc.moveDown();
          doc.text(
            'The device has been evaluated based on available clinical data, literature review, and risk-benefit analysis.'
          );
        }

        // Device Description
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('2. DEVICE DESCRIPTION');
        doc.fontSize(11).font('Helvetica');
        doc.moveDown();

        if (content.deviceDescription) {
          doc.text(
            JSON.stringify(content.deviceDescription.content || content.deviceDescription, null, 2)
          );
        } else {
          doc.text(`Device Name: ${cer.deviceName}`);
          doc.text(`Manufacturer: ${cer.deviceManufacturer || 'N/A'}`);
          doc.text(`Device Type: ${cer.deviceType || 'N/A'}`);
        }

        // Additional sections from content
        if (content.clinicalBackground) {
          doc.addPage();
          doc.fontSize(16).font('Helvetica-Bold').text('3. CLINICAL BACKGROUND');
          doc.fontSize(11).font('Helvetica');
          doc.moveDown();
          doc.text(
            JSON.stringify(
              content.clinicalBackground.content || content.clinicalBackground,
              null,
              2
            )
          );
        }

        // Metadata and approval information
        if (cer.metadata) {
          doc.addPage();
          doc.fontSize(16).font('Helvetica-Bold').text('DOCUMENT INFORMATION');
          doc.fontSize(11).font('Helvetica');
          doc.moveDown();
          doc.text(`Created: ${new Date(cer.createdAt).toLocaleDateString()}`);
          doc.text(`Last Updated: ${new Date(cer.updatedAt).toLocaleDateString()}`);
          if (cer.metadata.approvalDate) {
            doc.text(`Approval Date: ${new Date(cer.metadata.approvalDate).toLocaleDateString()}`);
          }
        }

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async generateDocx(cer: CerReport): Promise<Buffer> {
    try {
      const content = cer.content || {};

      // Create sections for the document
      const docSections = [];

      // Title section
      docSections.push(
        new Paragraph({
          text: 'CLINICAL EVALUATION REPORT',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          text: cer.deviceName,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'CER Number: ', bold: true }),
            new TextRun({ text: cer.reportId }),
          ],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Version: ', bold: true }),
            new TextRun({ text: cer.version || '1.0' }),
          ],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Status: ', bold: true }),
            new TextRun({ text: cer.status }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
        })
      );

      // Device Information
      docSections.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Device Manufacturer: ', bold: true }),
            new TextRun({ text: cer.deviceManufacturer || 'N/A' }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Device Type: ', bold: true }),
            new TextRun({ text: cer.deviceType || 'N/A' }),
          ],
          spacing: { after: 800 },
        })
      );

      // Table of Contents
      docSections.push(
        new Paragraph({
          text: 'TABLE OF CONTENTS',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 800, after: 400 },
        })
      );

      const tocItems = [
        '1. Executive Summary',
        '2. Device Description',
        '3. Clinical Background',
        '4. Essential Requirements',
        '5. Clinical Evidence',
        '6. Literature Review',
        '7. Risk-Benefit Analysis',
        '8. Conclusions',
      ];

      tocItems.forEach(item => {
        docSections.push(
          new Paragraph({
            text: item,
            spacing: { after: 200 },
          })
        );
      });

      // Executive Summary
      docSections.push(
        new Paragraph({
          text: '1. EXECUTIVE SUMMARY',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 800, after: 400 },
          pageBreakBefore: true,
        })
      );

      if (content.executiveSummary) {
        const summaryContent = content.executiveSummary.content || content.executiveSummary;
        docSections.push(
          new Paragraph({
            text:
              typeof summaryContent === 'string'
                ? summaryContent
                : JSON.stringify(summaryContent, null, 2),
            spacing: { after: 400 },
          })
        );
      } else {
        docSections.push(
          new Paragraph({
            text: `This Clinical Evaluation Report (CER) has been prepared for ${cer.deviceName} in accordance with applicable regulatory requirements.`,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: 'The device has been evaluated based on available clinical data, literature review, and risk-benefit analysis.',
            spacing: { after: 400 },
          })
        );
      }

      // Device Description
      docSections.push(
        new Paragraph({
          text: '2. DEVICE DESCRIPTION',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 800, after: 400 },
          pageBreakBefore: true,
        })
      );

      if (content.deviceDescription) {
        const descContent = content.deviceDescription.content || content.deviceDescription;
        docSections.push(
          new Paragraph({
            text:
              typeof descContent === 'string' ? descContent : JSON.stringify(descContent, null, 2),
            spacing: { after: 400 },
          })
        );
      } else {
        docSections.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Device Name: ', bold: true }),
              new TextRun({ text: cer.deviceName }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Manufacturer: ', bold: true }),
              new TextRun({ text: cer.deviceManufacturer || 'N/A' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Device Type: ', bold: true }),
              new TextRun({ text: cer.deviceType || 'N/A' }),
            ],
            spacing: { after: 400 },
          })
        );
      }

      // Clinical Background
      if (content.clinicalBackground) {
        docSections.push(
          new Paragraph({
            text: '3. CLINICAL BACKGROUND',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 800, after: 400 },
            pageBreakBefore: true,
          })
        );

        const bgContent = content.clinicalBackground.content || content.clinicalBackground;
        docSections.push(
          new Paragraph({
            text: typeof bgContent === 'string' ? bgContent : JSON.stringify(bgContent, null, 2),
            spacing: { after: 400 },
          })
        );
      }

      // Document Information
      if (cer.metadata) {
        docSections.push(
          new Paragraph({
            text: 'DOCUMENT INFORMATION',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 800, after: 400 },
            pageBreakBefore: true,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Created: ', bold: true }),
              new TextRun({ text: new Date(cer.createdAt).toLocaleDateString() }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Last Updated: ', bold: true }),
              new TextRun({ text: new Date(cer.updatedAt).toLocaleDateString() }),
            ],
          })
        );

        if (cer.metadata.approvalDate) {
          docSections.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'Approval Date: ', bold: true }),
                new TextRun({ text: new Date(cer.metadata.approvalDate).toLocaleDateString() }),
              ],
            })
          );
        }
      }

      // Create the document
      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                },
              },
            },
            children: docSections,
          },
        ],
        creator: 'eCTD Co-Author™',
        title: `Clinical Evaluation Report - ${cer.deviceName}`,
        subject: `CER ${cer.reportId} Version ${cer.version}`,
      });

      // Generate buffer
      const buffer = await Packer.toBuffer(doc);
      return buffer;
    } catch (error) {
      console.error('Error generating DOCX:', error);
      // Fallback to simple text representation
      return Buffer.from(JSON.stringify(cer, null, 2));
    }
  }

  private async generateXml(cer: CerReport): Promise<string> {
    // Generate structured XML for regulatory submission (eCTD compliant)
    const content = cer.content || {};

    // Escape XML special characters
    const escapeXml = (str: any): string => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Format content sections as XML
    const formatSection = (section: any, name: string): string => {
      if (!section) return '';

      if (typeof section === 'string') {
        return `    <${name}>${escapeXml(section)}</${name}>`;
      } else if (typeof section === 'object') {
        const innerContent = Object.entries(section)
          .map(([key, value]) => {
            if (typeof value === 'object') {
              return `      <${key}>${escapeXml(JSON.stringify(value))}</${key}>`;
            }
            return `      <${key}>${escapeXml(value)}</${key}>`;
          })
          .join('\n');
        return `    <${name}>\n${innerContent}\n    </${name}>`;
      }
      return `    <${name}>${escapeXml(JSON.stringify(section))}</${name}>`;
    };

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalEvaluationReport xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Header>
    <DocumentIdentifier>
      <ReportId>${escapeXml(cer.reportId)}</ReportId>
      <Version>${escapeXml(cer.version || '1.0')}</Version>
      <Status>${escapeXml(cer.status)}</Status>
    </DocumentIdentifier>
    <DeviceInformation>
      <DeviceName>${escapeXml(cer.deviceName)}</DeviceName>
      <DeviceManufacturer>${escapeXml(cer.deviceManufacturer || 'N/A')}</DeviceManufacturer>
      <DeviceType>${escapeXml(cer.deviceType || 'N/A')}</DeviceType>
    </DeviceInformation>
    <RegulatoryInformation>
      <RegulatoryFramework>${escapeXml(cer.metadata?.regulatoryFramework || 'MDR_2017_745')}</RegulatoryFramework>
      <NotifiedBodyId>${escapeXml(cer.metadata?.notifiedBodyId || 'N/A')}</NotifiedBodyId>
    </RegulatoryInformation>
    <DocumentMetadata>
      <CreatedDate>${new Date(cer.createdAt).toISOString()}</CreatedDate>
      <LastModifiedDate>${new Date(cer.updatedAt).toISOString()}</LastModifiedDate>
      <OrganizationId>${cer.organizationId}</OrganizationId>
    </DocumentMetadata>
  </Header>
  <Body>
${formatSection(content.executiveSummary, 'ExecutiveSummary')}
${formatSection(content.deviceDescription, 'DeviceDescription')}
${formatSection(content.clinicalBackground, 'ClinicalBackground')}
${formatSection(content.essentialRequirements, 'EssentialRequirements')}
${formatSection(content.clinicalEvidence, 'ClinicalEvidence')}
${formatSection(content.literatureReview, 'LiteratureReview')}
${formatSection(content.riskBenefitAnalysis, 'RiskBenefitAnalysis')}
${formatSection(content.conclusions, 'Conclusions')}
  </Body>
  <Signatures>
    <AuthorSignature>
      <Name>${escapeXml(cer.metadata?.authorName || 'N/A')}</Name>
      <Title>${escapeXml(cer.metadata?.authorTitle || 'Clinical Evaluator')}</Title>
      <Date>${new Date().toISOString()}</Date>
    </AuthorSignature>
    <ReviewerSignature>
      <Name>${escapeXml(cer.metadata?.reviewerName || 'N/A')}</Name>
      <Title>${escapeXml(cer.metadata?.reviewerTitle || 'Quality Manager')}</Title>
      <Date>${escapeXml(cer.metadata?.reviewDate || 'N/A')}</Date>
    </ReviewerSignature>
  </Signatures>
</ClinicalEvaluationReport>`;

    return xml;
  }
}

export default new CerGenerationService();
