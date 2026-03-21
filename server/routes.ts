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
import intelligentReportsRoutes from './routes/intelligent-reports';

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

// Submission center status endpoint - queries actual DB counts
router.get('/submission-status', async (req, res) => {
  try {
    const { pool } = require('./db');
    if (!pool) {
      return res.json({
        ind: { complete: 0, total: 7, status: 'pending' },
        cmc: { complete: 0, total: 6, status: 'pending' },
        csr: { complete: 0, total: 5, status: 'pending' },
        ectd: { complete: 0, total: 8, status: 'pending' },
        vault: { documents: 0, status: 'pending' },
        compliance: { score: 0, status: 'pending' },
      });
    }

    // Query actual counts from DB tables, falling back to 0 on error
    const safeCount = async (query: string): Promise<number> => {
      try {
        const r = await pool.query(query);
        return parseInt(r.rows[0]?.count ?? '0', 10);
      } catch { return 0; }
    };

    const [indComplete, cmcComplete, csrComplete, ectdComplete, vaultDocs] = await Promise.all([
      safeCount("SELECT COUNT(*) AS count FROM ind_sections WHERE status = 'completed'"),
      safeCount("SELECT COUNT(*) AS count FROM ind_sections WHERE module = 'cmc' AND status = 'completed'"),
      safeCount("SELECT COUNT(*) AS count FROM cer_reports WHERE status IN ('completed','approved')"),
      safeCount("SELECT COUNT(*) AS count FROM ectd_submissions WHERE status = 'completed'"),
      safeCount("SELECT COUNT(*) AS count FROM documents"),
    ]);

    const deriveStatus = (complete: number): string =>
      complete === 0 ? 'pending' : 'in-progress';

    res.json({
      ind: { complete: indComplete, total: 7, status: deriveStatus(indComplete) },
      cmc: { complete: cmcComplete, total: 6, status: deriveStatus(cmcComplete) },
      csr: { complete: csrComplete, total: 5, status: deriveStatus(csrComplete) },
      ectd: { complete: ectdComplete, total: 8, status: deriveStatus(ectdComplete) },
      vault: { documents: vaultDocs, status: vaultDocs > 0 ? 'active' : 'pending' },
      compliance: { score: 0, status: 'pending' },
    });
  } catch (error) {
    console.error('Error fetching submission status:', error);
    res.status(500).json({ error: 'Failed to fetch submission status' });
  }
});

// Audit log endpoint for tracking user actions
router.post('/audit-log', (req, res) => {
  console.log('Audit log entry:', req.body);
  res.status(200).json({ success: true });
});

// CER routes - backed by cer_reports table
router.get('/cer/jobs', async (req, res) => {
  try {
    const { pool } = require('./db');
    if (!pool) {
      return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query('SELECT COUNT(*) AS count FROM cer_reports');
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await pool.query(
      `SELECT id, report_id AS job_id, status, cer_status AS progress_status,
              device_name, template_id, created_by AS user_id,
              created_at, updated_at
       FROM cer_reports
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    // Table may not exist yet - return empty
    if (error.code === '42P01') {
      return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }
    console.error('Error fetching CER jobs:', error);
    res.status(500).json({ error: 'Failed to fetch CER jobs' });
  }
});

// Import submission center routes
import submissionCenterRoutes from './routes/submissionCenter.routes.js';

// Import only essential routes that exist and are needed
// Most route imports are commented out to prevent startup errors until dependencies are resolved

router.get('/cer/jobs/:id', async (req, res) => {
  try {
    const { pool } = require('./db');
    const { id } = req.params;
    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // Look up by report_id (text) or numeric id
    const isNumeric = /^\d+$/.test(id);
    const query = isNumeric
      ? `SELECT r.*, COALESCE(json_agg(a.*) FILTER (WHERE a.id IS NOT NULL), '[]') AS approvals
         FROM cer_reports r
         LEFT JOIN cer_approvals a ON a.project_id = r.cer_project_id
         WHERE r.id = $1
         GROUP BY r.id`
      : `SELECT r.*, COALESCE(json_agg(a.*) FILTER (WHERE a.id IS NOT NULL), '[]') AS approvals
         FROM cer_reports r
         LEFT JOIN cer_approvals a ON a.project_id = r.cer_project_id
         WHERE r.report_id = $1
         GROUP BY r.id`;

    const result = await pool.query(query, [isNumeric ? parseInt(id, 10) : id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CER job not found' });
    }

    const row = result.rows[0];
    res.json({
      job_id: row.report_id,
      status: row.status,
      progress_status: row.cer_status,
      device_name: row.device_name,
      template_id: row.template_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_id: row.created_by,
      approvals: row.approvals,
    });
  } catch (error: any) {
    if (error.code === '42P01') {
      return res.status(404).json({ error: 'CER job not found' });
    }
    console.error('Error fetching CER job:', error);
    res.status(500).json({ error: 'Failed to fetch CER job' });
  }
});

router.post('/cer/jobs/:id/review', async (req, res) => {
  try {
    const { pool } = require('./db');
    const { id } = req.params;
    const { status, comments, reviewer_id, organization_id } = req.body;

    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    // Find the report to get its project id
    const isNumeric = /^\d+$/.test(id);
    const reportQuery = isNumeric
      ? 'SELECT id, cer_project_id, organization_id FROM cer_reports WHERE id = $1'
      : 'SELECT id, cer_project_id, organization_id FROM cer_reports WHERE report_id = $1';
    const reportResult = await pool.query(reportQuery, [isNumeric ? parseInt(id, 10) : id]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'CER job not found' });
    }

    const report = reportResult.rows[0];
    const orgId = organization_id || report.organization_id;

    // Insert approval/review record
    const insertResult = await pool.query(
      `INSERT INTO cer_approvals (organization_id, project_id, approval_type, status, comments, requested_by_id, created_at, updated_at)
       VALUES ($1, $2, 'document', $3, $4, $5, NOW(), NOW())
       RETURNING id, status, comments, created_at`,
      [orgId, report.cer_project_id, status || 'pending', comments || null, reviewer_id || null]
    );

    // Update the report status if review approved/rejected
    if (status === 'approved' || status === 'rejected') {
      await pool.query(
        'UPDATE cer_reports SET status = $1, updated_at = NOW() WHERE id = $2',
        [status === 'approved' ? 'approved' : 'rejected', report.id]
      );
    }

    res.status(201).json({
      message: 'Review recorded',
      review: insertResult.rows[0],
    });
  } catch (error: any) {
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Required tables not yet created' });
    }
    console.error('Error recording CER review:', error);
    res.status(500).json({ error: 'Failed to record review' });
  }
});

router.post('/cer/generate-full', async (req, res) => {
  try {
    const { pool } = require('./db');
    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const {
      device_name,
      device_manufacturer,
      device_type,
      device_class,
      template_id,
      organization_id,
      cer_project_id,
      user_id,
    } = req.body;

    if (!organization_id) {
      return res.status(401).json({ error: 'Organization context required (organization_id)' });
    }

    const reportId = `CER-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const result = await pool.query(
      `INSERT INTO cer_reports (
         organization_id, cer_project_id, report_id, device_name,
         device_manufacturer, device_type, device_class, template_id,
         status, cer_status, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'pending', $9, NOW(), NOW())
       RETURNING id, report_id, status, created_at`,
      [
        organization_id,
        cer_project_id || null,
        reportId,
        device_name || 'Unnamed Device',
        device_manufacturer || null,
        device_type || null,
        device_class || null,
        template_id || null,
        user_id || null,
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      job_id: row.report_id,
      id: row.id,
      status: row.status,
      created_at: row.created_at,
    });
  } catch (error: any) {
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'cer_reports table not yet created' });
    }
    console.error('Error creating CER job:', error);
    res.status(500).json({ error: 'Failed to create CER job' });
  }
});

router.get('/cer/jobs/:id/status', async (req, res) => {
  try {
    const { pool } = require('./db');
    const { id } = req.params;
    if (!pool) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const isNumeric = /^\d+$/.test(id);
    const query = isNumeric
      ? 'SELECT report_id, status, cer_status, updated_at FROM cer_reports WHERE id = $1'
      : 'SELECT report_id, status, cer_status, updated_at FROM cer_reports WHERE report_id = $1';

    const result = await pool.query(query, [isNumeric ? parseInt(id, 10) : id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CER job not found' });
    }

    const row = result.rows[0];
    // Derive progress percentage from status
    const progressMap: Record<string, number> = {
      pending: 0,
      draft: 10,
      'in-progress': 50,
      review: 80,
      approved: 100,
      completed: 100,
      published: 100,
      rejected: 0,
    };

    res.json({
      job_id: row.report_id,
      status: row.status,
      progress_status: row.cer_status,
      progress: progressMap[row.status] ?? 0,
      updated_at: row.updated_at,
    });
  } catch (error: any) {
    if (error.code === '42P01') {
      return res.status(404).json({ error: 'CER job not found' });
    }
    console.error('Error fetching CER job status:', error);
    res.status(500).json({ error: 'Failed to fetch CER job status' });
  }
});

export default function registerRoutes(app: Express): void {
  // Mount basic API routes
  app.use('/api', router);
  
  // Mount regulatory management routes
  app.use('/api/regulatory', regulatoryRoutes);
  
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

  // Mount Intelligent Report Engine routes (immutable records, quasi-indemnification, atom provenance)
  app.use('/api/intelligent-reports', intelligentReportsRoutes);

  // Mount Claude Intelligence routes (document drafting, vision, batch, streaming)
  const claudeIntelligenceRoutes = require('./routes/claude-intelligence').default;
  app.use('/api/claude', claudeIntelligenceRoutes);
  
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
  console.log('✅ Claude Intelligence API routes mounted (draft, stream, review, vision, batch)');

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
      const organization_id = req.query.organization_id || req.headers['x-organization-id'];
      if (!organization_id) {
        return res.status(401).json({ error: 'Organization context required' });
      }
      
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
