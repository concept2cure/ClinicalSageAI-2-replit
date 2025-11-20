/**
 * Advanced Validation Routes - Sprint 3
 * Multi-Agency Validation: Advanced Features & Cross-Module Integration
 *
 * API endpoints for granular rule validation, proactive compliance monitoring,
 * deep DMS integration, and CSR/Study Design validation.
 */

import express from 'express';
import advancedValidationService from '../services/advancedValidationService.js';
import proactiveComplianceService from '../services/proactiveComplianceService.js';
import deepDMSIntegrationService from '../services/deepDMSIntegrationService.js';
import csrStudyIntegrationService from '../services/csrStudyIntegrationService.js';
import { db } from '../db/index.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// Custom tenant context extraction for advanced validation
const extractTenantContext = (req, res, next) => {
  const tenantId =
    req.headers['x-tenant-id'] ||
    req.headers['x-organization-id'] ||
    req.query.tenantId ||
    'default';

  const clientWorkspaceId = req.headers['x-client-workspace-id'] || null;
  const module = req.headers['x-module'] || null;

  req.tenantContext = {
    tenantId,
    clientWorkspaceId,
    module,
  };

  next();
};

// Apply tenant context middleware
router.use(extractTenantContext);

/**
 * Advanced Validation Endpoints
 */

// Granular ICH M4 compliance validation
router.post('/validation/ich-m4-compliance', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { documentContent, documentMetadata } = req.body;

    if (!documentContent) {
      return res.status(400).json({
        success: false,
        error: 'Document content is required for ICH M4 validation',
      });
    }

    const validationIssues = await advancedValidationService.validateICHM4Compliance(
      documentContent,
      documentMetadata || {},
      tenantId
    );

    res.json({
      success: true,
      data: {
        validationType: 'ICH_M4_COMPLIANCE',
        tenantId,
        issuesFound: validationIssues.length,
        issues: validationIssues,
        validationMetadata: {
          timestamp: new Date(),
          validationRules: Object.keys(advancedValidationService.validationRules.ICH_M4),
          complianceLevel: validationIssues.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
        },
      },
    });
  } catch (error) {
    console.error('ICH M4 validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform ICH M4 validation',
      details: error.message,
    });
  }
});

// Cross-reference validation
router.post('/validation/cross-references', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { documentContent, documentId } = req.body;

    if (!documentContent || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'Document content and ID are required for cross-reference validation',
      });
    }

    const validationIssues = await advancedValidationService.validateCrossReferences(
      documentContent,
      documentId,
      tenantId
    );

    res.json({
      success: true,
      data: {
        validationType: 'CROSS_REFERENCE_VALIDATION',
        documentId,
        tenantId,
        issuesFound: validationIssues.length,
        issues: validationIssues,
        validationMetadata: {
          timestamp: new Date(),
          referenceTypes: ['internal', 'external'],
          validationCompleted: true,
        },
      },
    });
  } catch (error) {
    console.error('Cross-reference validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform cross-reference validation',
      details: error.message,
    });
  }
});

// Submission consistency validation
router.post('/validation/submission-consistency', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { documentId } = req.body;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: 'Document ID is required for submission consistency validation',
      });
    }

    const validationIssues = await advancedValidationService.validateSubmissionConsistency(
      documentId,
      tenantId
    );

    res.json({
      success: true,
      data: {
        validationType: 'SUBMISSION_CONSISTENCY',
        documentId,
        tenantId,
        issuesFound: validationIssues.length,
        issues: validationIssues,
        validationMetadata: {
          timestamp: new Date(),
          consistencyChecks: advancedValidationService.validationRules.consistencyChecks,
          crossDocumentValidation: true,
        },
      },
    });
  } catch (error) {
    console.error('Submission consistency validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform submission consistency validation',
      details: error.message,
    });
  }
});

// Enhanced knowledge graph validation
router.post('/validation/knowledge-graph-enhanced', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { issues } = req.body;

    if (!issues || !Array.isArray(issues)) {
      return res.status(400).json({
        success: false,
        error: 'Issues array is required for knowledge graph enhancement',
      });
    }

    const enhancedIssues = await advancedValidationService.enhanceWithKnowledgeGraph(
      issues,
      tenantId
    );

    res.json({
      success: true,
      data: {
        validationType: 'KNOWLEDGE_GRAPH_ENHANCEMENT',
        tenantId,
        originalIssues: issues.length,
        enhancedIssues: enhancedIssues.length,
        issues: enhancedIssues,
        validationMetadata: {
          timestamp: new Date(),
          knowledgeGraphIntegration: true,
          enhancementLevel: 'COMPREHENSIVE',
        },
      },
    });
  } catch (error) {
    console.error('Knowledge graph enhancement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enhance issues with knowledge graph',
      details: error.message,
    });
  }
});

/**
 * Proactive Compliance Monitoring Endpoints
 */

// Initialize compliance monitoring
router.post('/compliance/initialize-monitoring', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;

    const monitoringSchedule =
      await proactiveComplianceService.initializeComplianceMonitoring(tenantId);

    res.json({
      success: true,
      data: {
        tenantId,
        monitoringInitialized: true,
        schedule: monitoringSchedule,
        message: 'Proactive compliance monitoring initialized successfully',
      },
    });
  } catch (error) {
    console.error('Compliance monitoring initialization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize compliance monitoring',
      details: error.message,
    });
  }
});

// Run compliance monitoring
router.post('/compliance/run-monitoring', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;

    const monitoringResults = await proactiveComplianceService.runComplianceMonitoring(tenantId);

    res.json({
      success: true,
      data: {
        tenantId,
        monitoringResults,
        alertsSummary: {
          totalAlerts: monitoringResults.processedCount,
          deadlineAlerts: monitoringResults.deadlineAlerts.length,
          statusAlerts: monitoringResults.statusAlerts.length,
          overdueIssues: monitoringResults.overdueIssues.length,
          priorityEscalations: monitoringResults.priorityEscalations.length,
        },
        timestamp: monitoringResults.timestamp,
      },
    });
  } catch (error) {
    console.error('Compliance monitoring run error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run compliance monitoring',
      details: error.message,
    });
  }
});

// Get compliance notifications
router.get('/compliance/notifications', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { limit = 50, offset = 0, alertLevel, notificationType } = req.query;

    let query = `
      SELECT 
        id, issue_id, notification_type, alert_level, title, message,
        recommended_action, notification_data, created_at, processed_at,
        acknowledged_at, acknowledged_by
      FROM compliance_notifications
      WHERE tenant_id = $1
    `;

    const params = [tenantId];
    let paramIndex = 2;

    if (alertLevel) {
      query += ` AND alert_level = $${paramIndex}`;
      params.push(alertLevel);
      paramIndex++;
    }

    if (notificationType) {
      query += ` AND notification_type = $${paramIndex}`;
      params.push(notificationType);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const notifications = await db.query(query, params);

    res.json({
      success: true,
      data: {
        notifications: notifications.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: notifications.rows.length,
        },
        filters: {
          alertLevel,
          notificationType,
        },
      },
    });
  } catch (error) {
    console.error('Get compliance notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve compliance notifications',
      details: error.message,
    });
  }
});

/**
 * Deep DMS Integration Endpoints
 */

// Initialize DMS integration
router.post('/dms/initialize-integration', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;

    const integrationConfig = await deepDMSIntegrationService.initializeDMSIntegration(tenantId);

    res.json({
      success: true,
      data: {
        tenantId,
        integrationConfig,
        message: 'DMS integration initialized successfully',
      },
    });
  } catch (error) {
    console.error('DMS integration initialization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize DMS integration',
      details: error.message,
    });
  }
});

// Process document event (webhook simulation)
router.post('/dms/process-document-event', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { eventType, documentData } = req.body;

    if (!eventType || !documentData) {
      return res.status(400).json({
        success: false,
        error: 'Event type and document data are required',
      });
    }

    const eventResult = await deepDMSIntegrationService.processDocumentEvent(
      eventType,
      documentData,
      tenantId
    );

    res.json({
      success: true,
      data: {
        tenantId,
        eventType,
        documentId: documentData.id,
        eventResult,
        message: 'Document event processed successfully',
      },
    });
  } catch (error) {
    console.error('Document event processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process document event',
      details: error.message,
    });
  }
});

// Trigger manual re-validation
router.post('/dms/trigger-revalidation', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { documentData } = req.body;

    if (!documentData) {
      return res.status(400).json({
        success: false,
        error: 'Document data is required for re-validation',
      });
    }

    const validationResult = await deepDMSIntegrationService.triggerDocumentRevalidation(
      documentData,
      'MANUAL_TRIGGER',
      tenantId
    );

    res.json({
      success: true,
      data: {
        tenantId,
        documentId: documentData.id,
        validationResult,
        message: 'Manual re-validation completed successfully',
      },
    });
  } catch (error) {
    console.error('Manual re-validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger manual re-validation',
      details: error.message,
    });
  }
});

// Setup validation scheduling
router.post('/dms/setup-validation-scheduling', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { scheduleConfig } = req.body;

    const schedulingRules = await deepDMSIntegrationService.setupValidationScheduling(
      tenantId,
      scheduleConfig || {}
    );

    res.json({
      success: true,
      data: {
        tenantId,
        schedulingRules,
        message: 'Validation scheduling configured successfully',
      },
    });
  } catch (error) {
    console.error('Validation scheduling setup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to setup validation scheduling',
      details: error.message,
    });
  }
});

/**
 * CSR/Study Design Integration Endpoints
 */

// Validate CSR content against study data
router.post('/csr/validate-against-study-data', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { csrDocument } = req.body;

    if (!csrDocument) {
      return res.status(400).json({
        success: false,
        error: 'CSR document is required for validation',
      });
    }

    const validationResults = await csrStudyIntegrationService.validateCSRContent(
      csrDocument,
      tenantId
    );

    res.json({
      success: true,
      data: {
        tenantId,
        documentId: csrDocument.id,
        validationResults,
        summary: validationResults.summary,
        message: 'CSR validation completed successfully',
      },
    });
  } catch (error) {
    console.error('CSR validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate CSR against study data',
      details: error.message,
    });
  }
});

// Get CSR validation summary
router.get('/csr/validation-summary/:documentId', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { documentId } = req.params;

    // Get recent CSR validation results
    const validationHistory = await db.query(
      `
      SELECT 
        id, specific_violation, impact_assessment, status, created_at,
        recommended_remediation, regulatory_section, compliance_area
      FROM regulatory_validation_issues
      WHERE tenant_id = $1 AND document_id = $2
      AND compliance_area IN ('CSR Validation', 'Study Design Validation')
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [tenantId, documentId]
    );

    const summary = {
      documentId,
      totalCSRIssues: validationHistory.rows.length,
      criticalIssues: validationHistory.rows.filter(issue => issue.impact_assessment === 'Critical')
        .length,
      majorIssues: validationHistory.rows.filter(issue => issue.impact_assessment === 'Major')
        .length,
      minorIssues: validationHistory.rows.filter(issue => issue.impact_assessment === 'Minor')
        .length,
      resolvedIssues: validationHistory.rows.filter(issue => issue.status === 'Resolved').length,
      recentIssues: validationHistory.rows.slice(0, 5),
    };

    res.json({
      success: true,
      data: {
        tenantId,
        documentId,
        summary,
        validationHistory: validationHistory.rows,
      },
    });
  } catch (error) {
    console.error('CSR validation summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSR validation summary',
      details: error.message,
    });
  }
});

/**
 * Comprehensive Advanced Validation Endpoint
 */

// Run comprehensive advanced validation
router.post('/comprehensive-validation', extractTenantContext, async (req, res) => {
  try {
    const { tenantId } = req.tenantContext;
    const { documentContent, documentMetadata, documentId } = req.body;

    if (!documentContent || !documentId) {
      return res.status(400).json({
        success: false,
        error: 'Document content and ID are required for comprehensive validation',
      });
    }

    const validationResults = {
      tenantId,
      documentId,
      timestamp: new Date(),
      validationSteps: [],
    };

    // Step 1: ICH M4 Compliance
    console.log('Running ICH M4 compliance validation...');
    const ichIssues = await advancedValidationService.validateICHM4Compliance(
      documentContent,
      documentMetadata,
      tenantId
    );
    validationResults.validationSteps.push({
      step: 'ICH_M4_COMPLIANCE',
      issues: ichIssues,
      issueCount: ichIssues.length,
    });

    // Step 2: Cross-Reference Validation
    console.log('Running cross-reference validation...');
    const crossRefIssues = await advancedValidationService.validateCrossReferences(
      documentContent,
      documentId,
      tenantId
    );
    validationResults.validationSteps.push({
      step: 'CROSS_REFERENCE_VALIDATION',
      issues: crossRefIssues,
      issueCount: crossRefIssues.length,
    });

    // Step 3: Submission Consistency
    console.log('Running submission consistency validation...');
    const consistencyIssues = await advancedValidationService.validateSubmissionConsistency(
      documentId,
      tenantId
    );
    validationResults.validationSteps.push({
      step: 'SUBMISSION_CONSISTENCY',
      issues: consistencyIssues,
      issueCount: consistencyIssues.length,
    });

    // Step 4: Knowledge Graph Enhancement
    console.log('Enhancing with knowledge graph...');
    const allIssues = [...ichIssues, ...crossRefIssues, ...consistencyIssues];
    const enhancedIssues = await advancedValidationService.enhanceWithKnowledgeGraph(
      allIssues,
      tenantId
    );
    validationResults.validationSteps.push({
      step: 'KNOWLEDGE_GRAPH_ENHANCEMENT',
      issues: enhancedIssues,
      issueCount: enhancedIssues.length,
    });

    // Step 5: CSR Validation (if applicable)
    if (
      documentMetadata?.document_type === 'CSR' ||
      documentMetadata?.title?.includes('Clinical Study Report')
    ) {
      console.log('Running CSR validation...');
      const csrResults = await csrStudyIntegrationService.validateCSRContent(
        { id: documentId, content: documentContent, metadata: documentMetadata },
        tenantId
      );
      validationResults.validationSteps.push({
        step: 'CSR_STUDY_VALIDATION',
        issues: csrResults.validationSteps.reduce((acc, step) => acc.concat(step.issues), []),
        issueCount: csrResults.summary.totalIssues,
        csrSummary: csrResults.summary,
      });
    }

    // Generate final summary
    const allValidationIssues = validationResults.validationSteps.reduce(
      (acc, step) => acc.concat(step.issues),
      []
    );
    validationResults.summary = {
      totalIssues: allValidationIssues.length,
      criticalIssues: allValidationIssues.filter(issue => issue.severity === 'Critical').length,
      majorIssues: allValidationIssues.filter(issue => issue.severity === 'Major').length,
      minorIssues: allValidationIssues.filter(issue => issue.severity === 'Minor').length,
      validationSteps: validationResults.validationSteps.length,
      complianceLevel:
        allValidationIssues.length === 0
          ? 'FULLY_COMPLIANT'
          : allValidationIssues.filter(issue => issue.severity === 'Critical').length === 0
            ? 'ACCEPTABLE'
            : 'NON_COMPLIANT',
    };

    res.json({
      success: true,
      data: validationResults,
    });
  } catch (error) {
    console.error('Comprehensive validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform comprehensive validation',
      details: error.message,
    });
  }
});

export default router;
