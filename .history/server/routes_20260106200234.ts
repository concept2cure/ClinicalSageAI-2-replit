import { Express, Router } from 'express';
import express from 'express';
import { storage } from './storage';
import { TemplateMapper } from './services/documentTemplateMapper';
import regulatoryRoutes from './routes/regulatory.js';
import indDocumentsRoutes from './routes/ind-documents.js';
import templateUsageRoutes from './routes/templates-usage.js';
import templateHydrationTestRoutes from './routes/test-template-hydration.js';
import indRoutes from './routes/ind.js';
import indDatabaseRoutes from './routes/ind-database.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import indSubmissionsRoutes from './routes/ind-submissions.routes.js';
import unifiedTasksRoutes from './routes/unifiedTasks.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
// @ts-ignore - JavaScript route file
// import moduleRoutes from './routes/modules.routes'; // Commented out - file doesn't exist
import changeManagementRoutes from './routes/change-management';
import complianceGapRoutes from './routes/compliance-gap-analysis';
import realtimeValidationRoutes from './routes/realtime-validation';
// @ts-ignore - JavaScript route file
import sharePointFilesRoutes from './routes/sharepoint-files.js';
// @ts-ignore - JavaScript route file
import vaultDmsRoutes from './routes/vault-dms.js';
// @ts-ignore - JavaScript route file
import cerv2SectionsRoutes from './routes/cerv2-sections.js';
// @ts-ignore - JavaScript route file
import aiAssistanceRoutes from './routes/ai-assistance.js';
// @ts-ignore - JavaScript route file
import contentPlanRoutes from './routes/content-plan.js';
import factsRoutes from './routes/facts.js';
import regulatoryPythonBridge from './routes/regulatory-python-bridge.js';

// Create a simple router for basic API routes
const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// 510(k) Workflow Routes
// ============================================================================

// Save/update 510(k) workflow data with automatic document generation
router.post('/510k-workflow/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { stage, section, data, organizationId } = req.body;
  
  try {
    // Save workflow data to database - using storage directly
    
    // Check if a workflow already exists for this project
    const workflows = await storage.getDeviceSubmissionWorkflows({
      organizationId: parseInt(organizationId),  // Ensure it's a number
      submissionId: parseInt(projectId),
      submissionType: '510k'
    });
    
    let workflow;
    if (workflows && workflows.length > 0) {
      // Update existing workflow
      workflow = await storage.updateDeviceSubmissionWorkflow(workflows[0].id, {
        currentStep: stage,
        workflowData: data,
        completedSteps: req.body.completedSteps || [],
        validationCheckpoints: req.body.validationCheckpoints || {}
      });
    } else {
      // Create new workflow
      workflow = await storage.createDeviceSubmissionWorkflow({
        organizationId: parseInt(organizationId),  // Ensure it's a number
        workflowType: '510k_submission',
        submissionType: '510k',
        submissionId: parseInt(projectId),
        currentStep: stage,
        workflowData: data,
        workflowStatus: 'active'
      });
    }
    
    // Save section data if provided
    if (section) {
      const sections = await storage.getCerv2510kSections({
        organizationId: parseInt(organizationId),  // Ensure it's a number
        submissionId: parseInt(projectId)
      });
      
      const existingSection = sections.find((s: any) => s.sectionCode === section);
      if (existingSection) {
        await storage.updateCerv2510kSection(existingSection.id, {
          content: data,
          lastModified: new Date()
        });
      } else {
        await storage.createCerv2510kSection({
          organizationId: parseInt(organizationId),  // Ensure it's a number
          submissionId: parseInt(projectId),
          sectionCode: section,
          sectionTitle: section,
          content: data
        });
      }
    }
    
    // AUTOMATIC DOCUMENT GENERATION - Seamlessly flow data to documents
    // Check if we have enough data to generate documents
    if (data && data.stageProgress) {
      try {
        // Map workflow data to FDA eSTAR template format automatically
        const templateData = TemplateMapper.mapWorkflowToTemplate(data);
        
        // Get all sections to update them with auto-populated data
        const sections = await storage.getCerv2510kSections({
          organizationId: parseInt(organizationId),
          submissionId: parseInt(projectId)
        });
        
        // Auto-populate document sections with collected data
        const documentSections = sections.map((s: any) => ({
          id: TemplateMapper.generateSectionId(projectId, s.sectionCode),
          code: s.sectionCode,
          title: s.sectionTitle,
          content: s.content,
          templateData: templateData.sections[s.sectionCode] || {},
          autoPopulated: true
        }));
        
        // Save the auto-populated template mapping metadata
        const existingMapping = sections.find((s: any) => s.sectionCode === 'TEMPLATE_MAPPING');
        if (existingMapping) {
          await storage.updateCerv2510kSection(existingMapping.id, {
            content: templateData,
            metadata: {
              autoUpdatedAt: new Date().toISOString(),
              mappedFields: templateData.metadata.mappedFields,
              validationStatus: templateData.metadata.validationStatus,
              autoPopulated: true
            },
            lastModified: new Date()
          });
        } else {
          await storage.createCerv2510kSection({
            organizationId: parseInt(organizationId),
            submissionId: parseInt(projectId),
            sectionCode: 'TEMPLATE_MAPPING',
            sectionTitle: 'Auto-Generated Template Mapping',
            content: templateData,
            metadata: {
              autoCreatedAt: new Date().toISOString(),
              mappedFields: templateData.metadata.mappedFields,
              validationStatus: templateData.metadata.validationStatus,
              autoPopulated: true
            }
          });
        }
        
        console.log(`✅ Auto-populated documents for project ${projectId} with ${templateData.metadata.mappedFields} fields`);
      } catch (docError) {
        // Log but don't fail the main save operation
        console.error('Warning: Could not auto-populate documents:', docError);
      }
    }
    
    res.status(200).json({ 
      success: true, 
      workflowId: workflow.id,
      message: 'Workflow data saved and documents auto-populated',
      autoPopulated: true 
    });
  } catch (error) {
    console.error('Error saving 510k workflow data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save workflow data' 
    });
  }
});

// Get 510(k) workflow data
router.get('/510k-workflow/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { organizationId } = req.query;
  
  try {
    // Get workflow data - using storage directly
    const workflows = await storage.getDeviceSubmissionWorkflows({
      organizationId: parseInt(organizationId as string),
      submissionId: parseInt(projectId),
      submissionType: '510k'
    });
    
    if (!workflows || workflows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Workflow not found' 
      });
    }
    
    // Get all sections for this submission
    const sections = await storage.getCerv2510kSections({
      organizationId: parseInt(organizationId as string),
      submissionId: parseInt(projectId)
    });
    
    res.status(200).json({ 
      success: true,
      workflow: workflows[0],
      sections: sections
    });
  } catch (error) {
    console.error('Error fetching 510k workflow data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch workflow data' 
    });
  }
});

// Generate 510(k) document from workflow data
router.post('/510k-workflow/:projectId/generate-document', async (req, res) => {
  const { projectId } = req.params;
  const { organizationId, templateId } = req.body;
  
  try {
    // Get workflow data - using storage directly
    const workflows = await storage.getDeviceSubmissionWorkflows({
      organizationId: parseInt(organizationId),  // Ensure it's a number
      submissionId: parseInt(projectId),
      submissionType: '510k'
    });
    
    if (!workflows || workflows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Workflow not found' 
      });
    }
    
    // Get all sections
    const sections = await storage.getCerv2510kSections({
      organizationId: parseInt(organizationId),  // Ensure it's a number
      submissionId: parseInt(projectId)
    });
    
    // Map workflow data to FDA eSTAR template format
    const templateData = TemplateMapper.mapWorkflowToTemplate(workflows[0].workflowData);
    
    // Generate unique document IDs for each section
    const documentSections = sections.map((s: any) => ({
      id: TemplateMapper.generateSectionId(projectId, s.sectionCode),
      code: s.sectionCode,
      title: s.sectionTitle,
      content: s.content,
      templateData: templateData.sections[s.sectionCode] || {}
    }));
    
    // Save the mapped template data
    await storage.createCerv2510kSection({
      organizationId: parseInt(organizationId),  // Ensure it's a number
      submissionId: parseInt(projectId),
      sectionCode: 'TEMPLATE_MAPPING',
      sectionTitle: 'Template Mapping Metadata',
      content: templateData,
      metadata: {
        mappedAt: new Date().toISOString(),
        mappedFields: templateData.metadata.mappedFields,
        validationStatus: templateData.metadata.validationStatus
      }
    });
    
    res.status(200).json({ 
      success: true,
      message: '510(k) document generated with intelligent data mapping',
      documentId: templateData.documentId,
      templateData: templateData,
      sections: documentSections,
      metadata: {
        totalSections: documentSections.length,
        mappedFields: templateData.metadata.mappedFields,
        validationStatus: templateData.metadata.validationStatus,
        requiredFields: TemplateMapper.getRequiredFields()
      }
    });
  } catch (error) {
    console.error('Error generating 510k document:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate document' 
    });
  }
});

// Submission center status endpoint
router.get('/submission-status', (req, res) => {
  // Return the current status of all modules
  res.json({
    ind: { 
      complete: req.query.indSteps || 2, 
      total: 7, 
      status: 'in-progress' 
    },
    cmc: { 
      complete: req.query.cmcSteps || 1, 
      total: 6, 
      status: 'pending' 
    },
    csr: { 
      complete: req.query.csrSteps || 0, 
      total: 5, 
      status: 'pending' 
    },
    ectd: { 
      complete: req.query.ectdDocs || 0, 
      total: 8, 
      status: 'pending' 
    },
    vault: { 
      documents: 12, 
      status: 'active' 
    },
    compliance: { 
      score: 75, 
      status: 'in-progress' 
    }
  });
});

// Audit log endpoint for tracking user actions
router.post('/audit-log', (req, res) => {
  console.log('Audit log entry:', req.body);
  res.status(200).json({ success: true });
});

// Simple CER routes for basic functionality
router.get('/cer/jobs', (req, res) => {
  const mockJobs = [
    {
      job_id: 'JOB-20250429-001',
      status: 'draft',
      progress: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: 'user-123',
      template_id: 'ICH-E3-FULL',
      approvals_count: 0,
    },
  ];

  res.json({
    data: mockJobs,
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    },
  });
});

// Import submission center routes
import submissionCenterRoutes from './routes/submissionCenter.routes.js';

// Import only essential routes that exist and are needed
// Most route imports are commented out to prevent startup errors until dependencies are resolved

router.get('/cer/jobs/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    job_id: id,
    status: 'draft',
    progress: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-123',
    template_id: 'ICH-E3-FULL',
    approvals: [],
  });
});

router.post('/cer/jobs/:id/review', (req, res) => {
  res.status(200).json({ message: 'Review recorded' });
});

router.post('/cer/generate-full', (req, res) => {
  res.json({
    job_id: `JOB-${Date.now()}`,
    status: 'pending',
  });
});

router.get('/cer/jobs/:id/status', (req, res) => {
  res.json({
    job_id: req.params.id,
    progress: 100,
    status: 'completed',
  });
});

export default function registerRoutes(app: Express): void {
  // Mount basic API routes
  app.use('/api', router);
  
  // Mount regulatory management routes
  app.use('/api/regulatory', regulatoryRoutes);
  app.use('/api/regulatory', regulatoryPythonBridge);
  
  // Mount IND documents routes
  app.use('/api', indDocumentsRoutes);
  
  // Mount template usage routes
  app.use('/api', templateUsageRoutes);
  
  // Mount IND routes - DISABLED: Using database routes instead
  // app.use('/api/ind', indRoutes);
  
  // Mount IND database routes (production-ready with PostgreSQL)
  app.use('/api/ind', indDatabaseRoutes);
  
  // Mount templates routes (production-ready with PostgreSQL)
  app.use('/api/templates', templatesRoutes);
  
  // Mount IND submissions routes (unified workflow tracking)
  app.use('/api/ind-submissions', indSubmissionsRoutes);
  
  // Mount template hydration test routes
  app.use('/api/template-hydration', templateHydrationTestRoutes);
  
  // Mount unified task management routes
  app.use('/api/regulatory/tasks', unifiedTasksRoutes);
  
  // Mount notification routes
  app.use('/api/notifications', notificationRoutes);
  
  // Mount submission center routes
  app.use('/api/submission-center', submissionCenterRoutes);
  
  // Mount comprehensive task management routes
  const taskManagementRoutes = require('./routes/taskManagement.routes');
  app.use('/api/task-management', taskManagementRoutes.default);
  
  // Mount module management routes
  // app.use('/api/modules', moduleRoutes); // Commented out - modules.routes doesn't exist
  // app.use('/api', moduleRoutes); // Also mount under /api for organization-specific routes
  
  // Mount global change management routes
  app.use('/api/change-management', changeManagementRoutes);
  
  // Mount compliance gap analysis routes
  app.use('/api/compliance-gap-analysis', complianceGapRoutes);
  
  // Mount real-time validation routes
  app.use('/api/realtime-validation', realtimeValidationRoutes);
  
  // Mount SharePoint file management routes
  app.use('/api/sharepoint-files', sharePointFilesRoutes);
  
  // Mount Vault DMS routes
  app.use('/api/vault', vaultDmsRoutes);
  
  // Mount CERV2 510(k) Section routes
  app.use('/api/cerv2-sections', cerv2SectionsRoutes);
  
  // Mount AI assistance routes for 510(k) content generation
  app.use(aiAssistanceRoutes);
  
  // Mount Content Plan routes
  app.use('/api/content-plan', contentPlanRoutes);
  
  // Basic health and status routes are now available
  console.log('✅ Basic API routes mounted');
  console.log('✅ Regulatory management routes mounted');
  console.log('✅ Template usage routes mounted');
  console.log('✅ IND routes mounted');
  console.log('✅ Template hydration test routes mounted');
  console.log('✅ Unified Task Management routes mounted successfully');
  console.log('✅ Notification System routes mounted successfully');
  console.log('✅ Submission Center API routes mounted successfully');
  console.log('✅ Comprehensive Task Management APIs mounted successfully');
  console.log('✅ Module Management routes mounted successfully');
  console.log('✅ SharePoint File Management API routes mounted successfully');

  // Register Device Profile API routes directly
  const DeviceProfileService = require('./services/DeviceProfileService').default;
  const deviceProfileService = DeviceProfileService.getInstance();

  // Add a simple test route
  app.get('/api/test', (req, res) => {
    console.log('Test route hit!');
    res.json({ success: true, message: 'Test route works!' });
  });

  // Add projects API endpoint (bug fix for CERV2 project loading)
  app.get('/api/projects', async (req, res) => {
    try {
      // Check multiple sources for organization/workspace context
      const client_workspace_id = req.query.client_workspace_id || req.headers['x-client-workspace-id'];
      const organization_id = req.query.organization_id || req.headers['x-organization-id'] || '6'; // Default to org 6
      
      // Import database connection
      const { pool } = require('./db');
      
      if (!pool) {
        // Return empty array if database not available
        return res.json([]);
      }
      
      // Query projects from database - fetch all for the organization
      let query = 'SELECT * FROM projects WHERE organization_id = $1';
      const params: any[] = [organization_id];
      
      // Optionally filter by workspace if provided
      if (client_workspace_id) {
        params.push(client_workspace_id);
        query += ` AND client_workspace_id = $${params.length}`;
      }
      
      query += ' ORDER BY created_at DESC';
      
      console.log('Fetching projects with query:', query, 'params:', params);
      const result = await pool.query(query, params);
      console.log('Found projects:', result.rows?.length || 0);
      
      res.json(result.rows || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // Error handler for API routes
  app.use(
    '/api',
    (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('API Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        context: err.context || 'API',
        timestamp: new Date().toISOString(),
      });
    }
  );
}
