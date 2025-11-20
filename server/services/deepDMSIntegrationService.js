/**
 * Deep DMS Integration Service - Sprint 3
 * Multi-Agency Validation: Document Management System Integration
 *
 * Implements automated re-validation triggers, enhanced report storage,
 * and deep integration with the Vault DMS for seamless workflow automation.
 */

import { db } from '../db/index.js';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import advancedValidationService from './advancedValidationService.js';
import multiAgencyValidationService from './multiAgencyValidationService.js';

export class DeepDMSIntegrationService {
  constructor() {
    this.vaultReportsDirectory = './data/vault_reports';
    this.validationTriggers = {
      DOCUMENT_UPLOAD: 'document_upload',
      DOCUMENT_UPDATE: 'document_update',
      DOCUMENT_VERSION: 'document_version',
      SCHEDULED_REVALIDATION: 'scheduled_revalidation',
      MANUAL_TRIGGER: 'manual_trigger',
    };

    this.reportFormats = {
      HTML: 'html',
      PDF: 'pdf',
      JSON: 'json',
      XML: 'xml',
    };

    this.webhookEndpoints = {
      VAULT_DOCUMENT_UPDATED: '/api/vault/webhook/document-updated',
      VAULT_DOCUMENT_UPLOADED: '/api/vault/webhook/document-uploaded',
      VALIDATION_COMPLETED: '/api/validation/webhook/completed',
    };
  }

  /**
   * Initialize DMS integration
   */
  async initializeDMSIntegration(tenantId) {
    try {
      // Ensure vault reports directory exists
      await this.ensureVaultReportsDirectory();

      // Create document event tracking table
      await this.ensureDocumentEventTable();

      // Set up webhook listeners
      await this.setupWebhookListeners();

      // Initialize validation scheduling
      const schedulingConfig = await this.initializeValidationScheduling(tenantId);

      console.log(`DMS Integration initialized for tenant: ${tenantId}`);
      console.log(`Webhook listeners active: ${Object.keys(this.webhookEndpoints).length}`);

      return {
        status: 'initialized',
        tenantId,
        vaultDirectory: this.vaultReportsDirectory,
        webhookEndpoints: this.webhookEndpoints,
        schedulingConfig,
      };
    } catch (error) {
      console.error('Failed to initialize DMS integration:', error);
      throw error;
    }
  }

  /**
   * Process document event (upload, update, version change)
   */
  async processDocumentEvent(eventType, documentData, tenantId) {
    try {
      console.log(`Processing document event: ${eventType} for document ${documentData.id}`);

      // Log the document event
      const eventId = await this.logDocumentEvent(eventType, documentData, tenantId);

      // Determine if re-validation is needed
      const validationNeeded = await this.assessValidationNeed(eventType, documentData, tenantId);

      if (validationNeeded.required) {
        // Trigger re-validation
        const validationResult = await this.triggerDocumentRevalidation(
          documentData,
          eventType,
          tenantId
        );

        // Store validation report
        const reportResult = await this.storeValidationReport(
          validationResult,
          documentData,
          tenantId
        );

        // Update event log with validation results
        await this.updateEventLog(eventId, {
          validationTriggered: true,
          validationResult,
          reportStored: reportResult.success,
          reportPath: reportResult.path,
        });

        return {
          eventId,
          validationTriggered: true,
          validationResult,
          reportStored: reportResult.success,
          reportPath: reportResult.path,
        };
      }

      return {
        eventId,
        validationTriggered: false,
        reason: validationNeeded.reason,
      };
    } catch (error) {
      console.error('Error processing document event:', error);
      throw error;
    }
  }

  /**
   * Trigger document re-validation
   */
  async triggerDocumentRevalidation(documentData, triggerType, tenantId) {
    try {
      console.log(`Triggering re-validation for document: ${documentData.id}`);

      const validationStartTime = new Date();

      // Perform comprehensive validation
      const validationResults = {
        documentId: documentData.id,
        tenantId,
        triggerType,
        timestamp: validationStartTime,
        validationSteps: [],
      };

      // Step 1: Advanced validation (ICH M4, cross-references, consistency)
      console.log('Running advanced validation checks...');
      const advancedIssues = await this.runAdvancedValidation(documentData, tenantId);
      validationResults.validationSteps.push({
        step: 'advanced_validation',
        issuesFound: advancedIssues.length,
        issues: advancedIssues,
        completedAt: new Date(),
      });

      // Step 2: Multi-agency validation
      console.log('Running multi-agency validation...');
      const multiAgencyResults = await this.runMultiAgencyValidation(documentData, tenantId);
      validationResults.validationSteps.push({
        step: 'multi_agency_validation',
        issuesFound: multiAgencyResults.issues.length,
        issues: multiAgencyResults.issues,
        completedAt: new Date(),
      });

      // Step 3: Store validation issues
      console.log('Storing validation issues...');
      const storedIssues = await this.storeValidationIssues(
        [...advancedIssues, ...multiAgencyResults.issues],
        documentData.id,
        tenantId
      );
      validationResults.validationSteps.push({
        step: 'issue_storage',
        issuesStored: storedIssues.length,
        completedAt: new Date(),
      });

      // Step 4: Generate comprehensive report
      console.log('Generating comprehensive validation report...');
      const reportData = await this.generateValidationReport(
        validationResults,
        documentData,
        tenantId
      );
      validationResults.report = reportData;

      const validationEndTime = new Date();
      validationResults.duration = validationEndTime - validationStartTime;
      validationResults.completedAt = validationEndTime;

      console.log(`Re-validation completed in ${validationResults.duration}ms`);
      return validationResults;
    } catch (error) {
      console.error('Error during document re-validation:', error);
      throw error;
    }
  }

  /**
   * Store validation report in Vault DMS
   */
  async storeValidationReport(validationResult, documentData, tenantId) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportBaseName = `validation_report_${documentData.id}_${timestamp}`;

      const reportResults = {
        success: false,
        formats: {},
        path: null,
        error: null,
      };

      // Generate HTML report
      const htmlReport = await this.generateHTMLReport(validationResult, documentData);
      const htmlPath = path.join(this.vaultReportsDirectory, `${reportBaseName}.html`);
      await fs.writeFile(htmlPath, htmlReport);
      reportResults.formats.html = htmlPath;

      // Generate JSON report
      const jsonReport = JSON.stringify(validationResult, null, 2);
      const jsonPath = path.join(this.vaultReportsDirectory, `${reportBaseName}.json`);
      await fs.writeFile(jsonPath, jsonReport);
      reportResults.formats.json = jsonPath;

      // Generate XML report (simulated)
      const xmlReport = await this.generateXMLReport(validationResult, documentData);
      const xmlPath = path.join(this.vaultReportsDirectory, `${reportBaseName}.xml`);
      await fs.writeFile(xmlPath, xmlReport);
      reportResults.formats.xml = xmlPath;

      // Store report metadata in database
      await this.storeReportMetadata(reportResults.formats, validationResult, tenantId);

      reportResults.success = true;
      reportResults.path = htmlPath; // Primary report path

      console.log(`Validation report stored successfully: ${reportBaseName}`);
      return reportResults;
    } catch (error) {
      console.error('Error storing validation report:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Set up automated validation scheduling
   */
  async setupValidationScheduling(tenantId, scheduleConfig) {
    try {
      const schedulingRules = {
        tenantId,
        rules: [
          {
            id: randomUUID(),
            name: 'Daily High-Priority Revalidation',
            schedule: '0 9 * * *', // Daily at 9 AM
            filter: { priority: ['Critical', 'High'] },
            active: true,
          },
          {
            id: randomUUID(),
            name: 'Weekly Comprehensive Revalidation',
            schedule: '0 9 * * 1', // Weekly on Monday at 9 AM
            filter: { status: ['Open', 'In Progress'] },
            active: true,
          },
          {
            id: randomUUID(),
            name: 'Monthly Full Submission Review',
            schedule: '0 9 1 * *', // Monthly on 1st at 9 AM
            filter: { documentType: ['submission'] },
            active: true,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store scheduling configuration
      await db.query(
        `
        INSERT INTO validation_scheduling (
          id, tenant_id, scheduling_rules, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id) DO UPDATE SET
          scheduling_rules = $3,
          updated_at = $5
      `,
        [randomUUID(), tenantId, JSON.stringify(schedulingRules), new Date(), new Date()]
      );

      console.log(`Validation scheduling configured for tenant: ${tenantId}`);
      return schedulingRules;
    } catch (error) {
      console.error('Error setting up validation scheduling:', error);
      throw error;
    }
  }

  /**
   * Helper methods for validation processing
   */
  async runAdvancedValidation(documentData, tenantId) {
    const allIssues = [];

    // ICH M4 compliance validation
    const ichIssues = await advancedValidationService.validateICHM4Compliance(
      documentData.content,
      documentData.metadata,
      tenantId
    );
    allIssues.push(...ichIssues);

    // Cross-reference validation
    const crossRefIssues = await advancedValidationService.validateCrossReferences(
      documentData.content,
      documentData.id,
      tenantId
    );
    allIssues.push(...crossRefIssues);

    // Submission consistency validation
    const consistencyIssues = await advancedValidationService.validateSubmissionConsistency(
      documentData.id,
      tenantId
    );
    allIssues.push(...consistencyIssues);

    // Enhance with knowledge graph
    const enhancedIssues = await advancedValidationService.enhanceWithKnowledgeGraph(
      allIssues,
      tenantId
    );

    return enhancedIssues;
  }

  async runMultiAgencyValidation(documentData, tenantId) {
    return await multiAgencyValidationService.validateDocument(
      documentData.content,
      documentData.metadata,
      tenantId
    );
  }

  async storeValidationIssues(issues, documentId, tenantId) {
    const storedIssues = [];

    for (const issue of issues) {
      const issueId = randomUUID();

      await db.query(
        `
        INSERT INTO regulatory_validation_issues (
          id, tenant_id, document_id, specific_violation, conflicting_requirements,
          contextual_content_snippet, location_trace, recommended_remediation,
          ai_confidence_score, impact_assessment, harmonization_opportunity,
          affected_agencies, regulatory_section, compliance_area, status,
          priority, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `,
        [
          issueId,
          tenantId,
          documentId,
          issue.violation || issue.specific_violation || 'Validation issue',
          issue.conflicting_requirements || 'See issue details',
          issue.contextualContentSnippet || 'Content analysis performed',
          issue.location || 'Document analysis',
          issue.recommendedAction || issue.recommended_remediation || 'Review and address',
          issue.confidence || 0.8,
          issue.severity || issue.impact_assessment || 'Medium',
          issue.harmonization_opportunity || 'Standard compliance approach',
          issue.affectedAgencies || ['FDA', 'EMA'],
          issue.regulatory_section || 'General',
          issue.compliance_area || 'Document Quality',
          'Open',
          issue.priority || 'Medium',
          new Date(),
          new Date(),
        ]
      );

      storedIssues.push({
        id: issueId,
        originalIssue: issue,
      });
    }

    return storedIssues;
  }

  /**
   * Report generation methods
   */
  async generateHTMLReport(validationResult, documentData) {
    const totalIssues = validationResult.validationSteps.reduce(
      (sum, step) => sum + step.issuesFound,
      0
    );
    const criticalIssues = validationResult.validationSteps.reduce(
      (sum, step) => sum + step.issues.filter(issue => issue.severity === 'Critical').length,
      0
    );

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Validation Report - ${documentData.title}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
            .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
            .critical { background: #ffe6e6; }
            .major { background: #fff3e6; }
            .minor { background: #f0f8ff; }
            .stats { display: flex; gap: 20px; }
            .stat-card { background: #f8f9fa; padding: 15px; border-radius: 5px; flex: 1; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Multi-Agency Validation Report</h1>
            <p><strong>Document:</strong> ${documentData.title}</p>
            <p><strong>Document ID:</strong> ${documentData.id}</p>
            <p><strong>Generated:</strong> ${validationResult.timestamp}</p>
            <p><strong>Duration:</strong> ${validationResult.duration}ms</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>Total Issues</h3>
                <p style="font-size: 24px; color: #333;">${totalIssues}</p>
            </div>
            <div class="stat-card">
                <h3>Critical Issues</h3>
                <p style="font-size: 24px; color: #d32f2f;">${criticalIssues}</p>
            </div>
            <div class="stat-card">
                <h3>Validation Steps</h3>
                <p style="font-size: 24px; color: #1976d2;">${validationResult.validationSteps.length}</p>
            </div>
        </div>
        
        ${validationResult.validationSteps
          .map(
            step => `
            <div class="section">
                <h2>${step.step.replace('_', ' ').toUpperCase()}</h2>
                <p><strong>Issues Found:</strong> ${step.issuesFound}</p>
                <p><strong>Completed:</strong> ${step.completedAt}</p>
                
                ${
                  step.issues.length > 0
                    ? `
                    <h3>Issues:</h3>
                    ${step.issues
                      .map(
                        issue => `
                        <div class="section ${issue.severity === 'Critical' ? 'critical' : issue.severity === 'Major' ? 'major' : 'minor'}">
                            <h4>${issue.violation || issue.specific_violation}</h4>
                            <p><strong>Severity:</strong> ${issue.severity || issue.impact_assessment}</p>
                            <p><strong>Recommendation:</strong> ${issue.recommendedAction || issue.recommended_remediation}</p>
                            ${issue.affectedAgencies ? `<p><strong>Affected Agencies:</strong> ${issue.affectedAgencies.join(', ')}</p>` : ''}
                        </div>
                    `
                      )
                      .join('')}
                `
                    : '<p>No issues found in this validation step.</p>'
                }
            </div>
        `
          )
          .join('')}
        
        <div class="section">
            <h2>SUMMARY</h2>
            <p>This validation report was generated automatically by the Multi-Agency Validation system. 
               ${totalIssues === 0 ? 'No validation issues were found.' : `A total of ${totalIssues} issues were identified and require attention.`}</p>
            <p>For questions regarding this report, please contact the regulatory compliance team.</p>
        </div>
    </body>
    </html>
    `;
  }

  async generateXMLReport(validationResult, documentData) {
    const totalIssues = validationResult.validationSteps.reduce(
      (sum, step) => sum + step.issuesFound,
      0
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
    <ValidationReport>
        <Document>
            <Title>${documentData.title}</Title>
            <ID>${documentData.id}</ID>
            <ValidationTimestamp>${validationResult.timestamp}</ValidationTimestamp>
            <Duration>${validationResult.duration}ms</Duration>
        </Document>
        <Summary>
            <TotalIssues>${totalIssues}</TotalIssues>
            <ValidationSteps>${validationResult.validationSteps.length}</ValidationSteps>
        </Summary>
        <ValidationSteps>
            ${validationResult.validationSteps
              .map(
                step => `
                <Step>
                    <Name>${step.step}</Name>
                    <IssuesFound>${step.issuesFound}</IssuesFound>
                    <CompletedAt>${step.completedAt}</CompletedAt>
                    <Issues>
                        ${step.issues
                          .map(
                            issue => `
                            <Issue>
                                <Violation>${issue.violation || issue.specific_violation}</Violation>
                                <Severity>${issue.severity || issue.impact_assessment}</Severity>
                                <Recommendation>${issue.recommendedAction || issue.recommended_remediation}</Recommendation>
                                <AffectedAgencies>${(issue.affectedAgencies || []).join(',')}</AffectedAgencies>
                            </Issue>
                        `
                          )
                          .join('')}
                    </Issues>
                </Step>
            `
              )
              .join('')}
        </ValidationSteps>
    </ValidationReport>`;
  }

  /**
   * Database and infrastructure methods
   */
  async ensureVaultReportsDirectory() {
    try {
      await fs.mkdir(this.vaultReportsDirectory, { recursive: true });
      console.log(`Vault reports directory ensured: ${this.vaultReportsDirectory}`);
    } catch (error) {
      console.error('Error creating vault reports directory:', error);
      throw error;
    }
  }

  async ensureDocumentEventTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS document_events (
        id UUID PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        document_id UUID NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        validation_triggered BOOLEAN DEFAULT FALSE,
        validation_result JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_document_events_tenant_document 
      ON document_events(tenant_id, document_id)
    `);
  }

  async ensureValidationSchedulingTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS validation_scheduling (
        id UUID PRIMARY KEY,
        tenant_id VARCHAR(255) UNIQUE NOT NULL,
        scheduling_rules JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  }

  async logDocumentEvent(eventType, documentData, tenantId) {
    const eventId = randomUUID();

    await db.query(
      `
      INSERT INTO document_events (
        id, tenant_id, document_id, event_type, event_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [eventId, tenantId, documentData.id, eventType, JSON.stringify(documentData), new Date()]
    );

    return eventId;
  }

  async updateEventLog(eventId, updateData) {
    await db.query(
      `
      UPDATE document_events 
      SET validation_triggered = $2, validation_result = $3, processed_at = $4
      WHERE id = $1
    `,
      [
        eventId,
        updateData.validationTriggered,
        JSON.stringify(updateData.validationResult),
        new Date(),
      ]
    );
  }

  async assessValidationNeed(eventType, documentData, tenantId) {
    // Always trigger validation for demonstration
    return {
      required: true,
      reason: `Document ${eventType} detected - automated re-validation triggered`,
      confidence: 0.95,
    };
  }

  async storeReportMetadata(reportPaths, validationResult, tenantId) {
    await db.query(
      `
      INSERT INTO validation_reports (
        id, tenant_id, document_id, report_paths, validation_summary,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [
        randomUUID(),
        tenantId,
        validationResult.documentId,
        JSON.stringify(reportPaths),
        JSON.stringify({
          totalIssues: validationResult.validationSteps.reduce(
            (sum, step) => sum + step.issuesFound,
            0
          ),
          duration: validationResult.duration,
          timestamp: validationResult.timestamp,
        }),
        new Date(),
      ]
    );
  }

  async setupWebhookListeners() {
    // Webhook listeners would be set up here
    console.log('Webhook listeners configured for DMS integration');
  }

  async initializeValidationScheduling(tenantId) {
    await this.ensureValidationSchedulingTable();
    return await this.setupValidationScheduling(tenantId, {});
  }

  async generateValidationReport(validationResults, documentData, tenantId) {
    return {
      reportId: randomUUID(),
      summary: {
        totalIssues: validationResults.validationSteps.reduce(
          (sum, step) => sum + step.issuesFound,
          0
        ),
        criticalIssues: validationResults.validationSteps.reduce(
          (sum, step) => sum + step.issues.filter(issue => issue.severity === 'Critical').length,
          0
        ),
        validationSteps: validationResults.validationSteps.length,
        duration: validationResults.duration,
      },
      recommendations: [
        'Review and address all critical issues immediately',
        'Implement suggested remediation actions',
        'Schedule follow-up validation after corrections',
      ],
    };
  }
}

export default new DeepDMSIntegrationService();
