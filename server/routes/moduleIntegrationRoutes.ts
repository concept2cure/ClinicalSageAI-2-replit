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
import { asyncHandler } from '../middleware/errorHandler';
import { getSecureOrgId } from '../utils/tenantContext';

const router = Router();
const moduleIntegrationService = new ModuleIntegrationService(db);
const workflowService = new WorkflowService(db);

// Middleware to handle tenant context
const setTenantContext = (req: any, res: any, next: any) => {
  const organizationId = getSecureOrgId(req);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  req.tenantContext = { organizationId };
  next();
};

// Apply tenant context middleware to all routes
router.use(setTenantContext);

/**
 * Register a document in the unified system
 * POST /api/module-integration/register-document
 */
router.post('/register-document', asyncHandler(async (req, res) => {
  const document = await moduleIntegrationService.registerDocument({
    ...req.body,
    organizationId: getSecureOrgId(req),
  });
  res.status(201).json(document);
}));

/**
 * Check if a document exists
 * GET /api/module-integration/document-exists
 */
router.get('/document-exists', asyncHandler(async (req, res) => {
  const { moduleType, originalId } = req.query;
  const organizationId = getSecureOrgId(req);
  const exists = await moduleIntegrationService.documentExists(
    moduleType as string,
    originalId as string,
    organizationId as string
  );
  res.json({ exists });
}));

/**
 * Get documents by module type
 * GET /api/module-integration/documents/:moduleType
 */
router.get('/documents/:moduleType', asyncHandler(async (req, res) => {
  const { moduleType } = req.params;
  const organizationId = getSecureOrgId(req);
  const documents = await moduleIntegrationService.getDocumentsByModule(
    moduleType,
    organizationId as string
  );
  res.json(documents);
}));

/**
 * Get a specific document
 * GET /api/module-integration/documents/:id
 */
router.get('/document/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const document = await moduleIntegrationService.getDocument(parseInt(String(id), 10));

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    if (error instanceof DocumentNotFoundException) {
      return res.status(404).json({ error: error.message });
    }
    throw error;
  }
}));

/**
 * Update a document
 * PATCH /api/module-integration/documents/:id
 */
router.patch('/documents/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const document = await moduleIntegrationService.updateDocument(parseInt(String(id), 10), req.body);
    res.json(document);
  } catch (error) {
    if (error instanceof DocumentNotFoundException) {
      return res.status(404).json({ error: error.message });
    }
    throw error;
  }
}));

/**
 * Get workflow templates for a module
 * GET /api/module-integration/templates/:moduleType
 */
router.get('/templates/:moduleType', cacheResponse({ ttl: 60_000 }), asyncHandler(async (req, res) => {
  const { moduleType } = req.params;
  const organizationId = getSecureOrgId(req);
  const templates = await workflowService.getWorkflowTemplatesByModule(
    moduleType,
    organizationId as string
  );
  res.json(templates);
}));

/**
 * Create a workflow template
 * POST /api/module-integration/templates
 */
router.post('/templates', asyncHandler(async (req, res) => {
  const { moduleType, ...templateData } = req.body;
  const template = await workflowService.createWorkflowTemplate(
    moduleType,
    getSecureOrgId(req),
    req.userId,
    templateData,
  );
  res.status(201).json(template);
}));

/**
 * Get a specific workflow template
 * GET /api/module-integration/templates/:id
 */
router.get('/templates/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const template = await workflowService.getWorkflowTemplate(parseInt(String(id), 10));

  if (!template) {
    return res.status(404).json({ error: 'Workflow template not found' });
  }

  res.json(template);
}));

/**
 * Start a workflow
 * POST /api/module-integration/workflows
 */
router.post('/workflows', asyncHandler(async (req, res) => {
  const { documentId, templateId, metadata } = req.body;
  const startedByUserId = req.userId;
  if (!startedByUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const workflow = await workflowService.startWorkflow(
    documentId,
    templateId,
    startedByUserId,
    {
      ...(metadata || {}),
      organizationId: getSecureOrgId(req),
    }
  );
  res.status(201).json(workflow);
}));

/**
 * Approve a workflow step
 * POST /api/module-integration/approve-step
 */
router.post('/approve-step', asyncHandler(async (req, res) => {
  const { approvalId, comments } = req.body;
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = await workflowService.approveWorkflowStep(approvalId, userId, comments);
  res.json(result);
}));

/**
 * Reject a workflow step
 * POST /api/module-integration/reject-step
 */
router.post('/reject-step', asyncHandler(async (req, res) => {
  const { approvalId, comments } = req.body;
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = await workflowService.rejectWorkflowStep(approvalId, userId, comments);
  res.json(result);
}));

/**
 * Get documents with active workflows
 * GET /api/module-integration/documents-in-review
 */
router.get('/documents-in-review', asyncHandler(async (req, res) => {
  const organizationId = getSecureOrgId(req);
  const documents = await moduleIntegrationService.getDocumentsInReview(organizationId as string);
  res.json(documents);
}));

/**
 * Get active workflows
 * GET /api/module-integration/active-workflows
 */
router.get('/active-workflows', asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const organizationId = getSecureOrgId(req);
  const workflows = await workflowService.getActiveWorkflows(
    organizationId as string,
    parseInt(page as string, 10) || 1,
    Math.min(parseInt(pageSize as string, 10) || 50, 200)
  );
  res.json(workflows);
}));

/**
 * Get completed workflows
 * GET /api/module-integration/completed-workflows
 */
router.get('/completed-workflows', asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const organizationId = getSecureOrgId(req);
  const workflows = await workflowService.getCompletedWorkflows(
    organizationId as string,
    parseInt(page as string, 10) || 1,
    Math.min(parseInt(pageSize as string, 10) || 50, 200)
  );
  res.json(workflows);
}));

/**
 * Get workflows pending approval
 * GET /api/module-integration/pending-approvals
 */
router.get('/pending-approvals', asyncHandler(async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const organizationId = getSecureOrgId(req);
  const approvals = await workflowService.getPendingApprovals(
    organizationId as string,
    userId as string
  );
  res.json(approvals);
}));

/**
 * Get workflow history
 * GET /api/module-integration/workflow-history/:id
 */
router.get('/workflow-history/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const history = await workflowService.getWorkflowHistory(parseInt(String(id), 10));
  res.json(history);
}));

export default router;
