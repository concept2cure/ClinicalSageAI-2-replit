/**
 * Module Integration Routes
 *
 * This file defines the API routes for the unified document workflow system
 * that integrates all module-specific documents into a centralized workflow.
 */

import { Router } from 'express';
import { db } from '../db';
import {
  ModuleIntegrationService,
  DocumentNotFoundException,
} from '../services/ModuleIntegrationService';
import { WorkflowService } from '../services/WorkflowService';
import { cacheResponse } from '../middleware/enterprise-performance';

const router = Router();
const moduleIntegrationService = new ModuleIntegrationService(db);
const workflowService = new WorkflowService(db);

// Middleware to handle tenant context
const setTenantContext = (req, res, next) => {
  // Extract organization ID from query params or headers
  const organizationId = req.query.organizationId || req.headers['x-organization-id'];
  req.tenantContext = { organizationId };
  next();
};

// Apply tenant context middleware to all routes
router.use(setTenantContext);

/**
 * Register a document in the unified system
 * POST /api/module-integration/register-document
 */
router.post('/register-document', async (req, res) => {
  try {
    const document = await moduleIntegrationService.registerDocument(req.body);
    res.status(201).json(document);
  } catch (error) {
    console.error('Error registering document:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Check if a document exists
 * GET /api/module-integration/document-exists
 */
router.get('/document-exists', async (req, res) => {
  try {
    const { moduleType, originalId, organizationId } = req.query;
    const exists = await moduleIntegrationService.documentExists(
      moduleType as string,
      originalId as string,
      organizationId as string
    );
    res.json({ exists });
  } catch (error) {
    console.error('Error checking document existence:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get documents by module type
 * GET /api/module-integration/documents/:moduleType
 */
router.get('/documents/:moduleType', async (req, res) => {
  try {
    const { moduleType } = req.params;
    const { organizationId } = req.query;
    const documents = await moduleIntegrationService.getDocumentsByModule(
      moduleType,
      organizationId as string
    );
    res.json(documents);
  } catch (error) {
    console.error('Error fetching module documents:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get a specific document
 * GET /api/module-integration/documents/:id
 */
router.get('/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await moduleIntegrationService.getDocument(parseInt(id));

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);

    if (error instanceof DocumentNotFoundException) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Update a document
 * PATCH /api/module-integration/documents/:id
 */
router.patch('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await moduleIntegrationService.updateDocument(parseInt(id), req.body);
    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);

    if (error instanceof DocumentNotFoundException) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get workflow templates for a module
 * GET /api/module-integration/templates/:moduleType
 */
router.get('/templates/:moduleType', cacheResponse({ ttl: 60_000 }), async (req, res) => {
  try {
    const { moduleType } = req.params;
    const { organizationId } = req.query;
    const templates = await workflowService.getWorkflowTemplatesByModule(
      moduleType,
      organizationId as string
    );
    res.json(templates);
  } catch (error) {
    console.error('Error fetching workflow templates:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Create a workflow template
 * POST /api/module-integration/templates
 */
router.post('/templates', async (req, res) => {
  try {
    const template = await workflowService.createWorkflowTemplate(req.body);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating workflow template:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get a specific workflow template
 * GET /api/module-integration/templates/:id
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await workflowService.getWorkflowTemplate(parseInt(id));

    if (!template) {
      return res.status(404).json({ error: 'Workflow template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching workflow template:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Start a workflow
 * POST /api/module-integration/workflows
 */
router.post('/workflows', async (req, res) => {
  try {
    const { documentId, templateId, startedBy, metadata } = req.body;
    const workflow = await workflowService.startWorkflow(
      documentId,
      templateId,
      startedBy,
      metadata
    );
    res.status(201).json(workflow);
  } catch (error) {
    console.error('Error starting workflow:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Approve a workflow step
 * POST /api/module-integration/approve-step
 */
router.post('/approve-step', async (req, res) => {
  try {
    const { approvalId, userId, comments } = req.body;
    const result = await workflowService.approveWorkflowStep(approvalId, userId, comments);
    res.json(result);
  } catch (error) {
    console.error('Error approving workflow step:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Reject a workflow step
 * POST /api/module-integration/reject-step
 */
router.post('/reject-step', async (req, res) => {
  try {
    const { approvalId, userId, comments } = req.body;
    const result = await workflowService.rejectWorkflowStep(approvalId, userId, comments);
    res.json(result);
  } catch (error) {
    console.error('Error rejecting workflow step:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get documents with active workflows
 * GET /api/module-integration/documents-in-review
 */
router.get('/documents-in-review', async (req, res) => {
  try {
    const { organizationId } = req.query;
    const documents = await moduleIntegrationService.getDocumentsInReview(organizationId as string);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents in review:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get active workflows
 * GET /api/module-integration/active-workflows
 */
router.get('/active-workflows', async (req, res) => {
  try {
    const { organizationId, page, pageSize } = req.query;
    const workflows = await workflowService.getActiveWorkflows(
      organizationId as string,
      parseInt(page as string, 10) || 1,
      Math.min(parseInt(pageSize as string, 10) || 50, 200)
    );
    res.json(workflows);
  } catch (error) {
    console.error('Error fetching active workflows:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get completed workflows
 * GET /api/module-integration/completed-workflows
 */
router.get('/completed-workflows', async (req, res) => {
  try {
    const { organizationId, page, pageSize } = req.query;
    const workflows = await workflowService.getCompletedWorkflows(
      organizationId as string,
      parseInt(page as string, 10) || 1,
      Math.min(parseInt(pageSize as string, 10) || 50, 200)
    );
    res.json(workflows);
  } catch (error) {
    console.error('Error fetching completed workflows:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get workflows pending approval
 * GET /api/module-integration/pending-approvals
 */
router.get('/pending-approvals', async (req, res) => {
  try {
    const { organizationId, userId } = req.query;
    const approvals = await workflowService.getPendingApprovals(
      organizationId as string,
      userId as string
    );
    res.json(approvals);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Get workflow history
 * GET /api/module-integration/workflow-history/:id
 */
router.get('/workflow-history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await workflowService.getWorkflowHistory(parseInt(id));
    res.json(history);
  } catch (error) {
    console.error('Error fetching workflow history:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
