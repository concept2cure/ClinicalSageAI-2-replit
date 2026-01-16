import { Router, Request, Response } from 'express';
import { db } from '../db';
import { fda510kProjects, fda510kStageProgress, projects } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireTenant } from '../middleware/tenant.js';

const router = Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

// Get available project templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = await db.execute(sql`
      SELECT * FROM fda_510k_project_templates 
      WHERE is_active = true
      ORDER BY device_classification, template_name
    `);

    res.json(templates.rows);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch project templates' });
  }
});

// Create a new project with wizard data
router.post('/create', async (req: Request, res: Response) => {
  const organizationId = Number((req as any).organizationId);
  const workspaceHeader = req.headers['x-client-workspace-id'] as string | undefined;
  const clientWorkspaceId = workspaceHeader ? Number.parseInt(String(workspaceHeader), 10) : 1;
  const {
    projectName,
    deviceName,
    templateId,
    deviceClassification,
    deviceType,
    intendedUse,
    indications,
    productCode,
    regulationNumber,
    hasSoftware,
    hasCybersecurity,
    hasSterility,
    hasBiocompatibility,
    hasClinicalData,
    hasAI,
    projectLead,
    regulatoryLead,
    qualityLead,
    teamMembers,
    targetSubmissionDate,
    estimatedTimelineDays
  } = req.body;

  // Validate required fields
  if (!projectName || !deviceName) {
    return res.status(400).json({ 
      error: 'Project name and device name are required' 
    });
  }
  
  if (!intendedUse || !indications) {
    return res.status(400).json({ 
      error: 'Intended use and indications for use are required' 
    });
  }

  try {
    // 1. First create the base project in projects table
    const [baseProject] = await db
      .insert(projects)
      .values({
        organizationId: organizationId,
        clientWorkspaceId: Number.isFinite(clientWorkspaceId) ? clientWorkspaceId : 1,
        name: projectName,
        description: `FDA 510(k) submission project for ${deviceName}`,
        type: 'regulatory',
        status: 'planning',
        priority: 'high',
        startDate: new Date(),
        targetEndDate: targetSubmissionDate ? new Date(targetSubmissionDate) : null
      })
      .returning();
    
    // 2. Create the FDA 510k specific project details
    const [project] = await db
      .insert(fda510kProjects)
      .values({
        organizationId: organizationId,
        projectId: baseProject.id,
        deviceName: deviceName,
        deviceClassification: deviceClassification,
        productCode: productCode,
        regulationNumber: regulationNumber,
        hasSoftware: hasSoftware,
        hasCybersecurity: hasCybersecurity,
        hasSterility: hasSterility,
        hasBiocompatibility: hasBiocompatibility,
        hasClinicalData: hasClinicalData,
        hasAi: hasAI,
        projectLead: projectLead && projectLead !== '' && !isNaN(parseInt(projectLead)) ? parseInt(projectLead) : null,
        regulatoryLead: regulatoryLead && regulatoryLead !== '' && !isNaN(parseInt(regulatoryLead)) ? parseInt(regulatoryLead) : null,
        qualityLead: qualityLead && qualityLead !== '' && !isNaN(parseInt(qualityLead)) ? parseInt(qualityLead) : null,
        teamMembers: teamMembers || [],
        targetSubmissionDate: targetSubmissionDate || null,
        currentStage: 'setup',
        overallProgress: 0,
        status: 'active',
        metadata: {
          projectName,
          templateId,
          estimatedTimelineDays,
          createdViaWizard: true
        }
      })
      .returning();

    // 3. Create initial data forms using SQL
    await db.execute(sql`
      INSERT INTO fda_510k_initial_data_forms (project_id, form_type, form_data, is_complete, completed_at)
      VALUES (
        ${project.id},
        'device_specs',
        ${JSON.stringify({
          deviceName,
          deviceClassification,
          deviceType,
          productCode,
          regulationNumber,
          features: {
            hasSoftware,
            hasCybersecurity,
            hasSterility,
            hasBiocompatibility,
            hasClinicalData,
            hasAI
          }
        })},
        true,
        NOW()
      )
    `);

    await db.execute(sql`
      INSERT INTO fda_510k_initial_data_forms (project_id, form_type, form_data, is_complete, completed_at)
      VALUES (
        ${project.id},
        'intended_use',
        ${JSON.stringify({
          intendedUse,
          indications
        })},
        ${!!intendedUse && !!indications},
        ${(intendedUse && indications) ? sql`NOW()` : null}
      )
    `);

    // 4. Create team assignments using SQL
    if (projectLead && projectLead !== '' && !isNaN(parseInt(projectLead))) {
      await db.execute(sql`
        INSERT INTO fda_510k_team_assignments (project_id, user_id, role, permissions, assigned_sections)
        VALUES (
          ${project.id},
          ${parseInt(projectLead)},
          'project_lead',
          ${JSON.stringify({ canEdit: true, canApprove: true, canSubmit: true })},
          ${JSON.stringify(['all'])}
        )
      `);
    }

    if (regulatoryLead && regulatoryLead !== '' && !isNaN(parseInt(regulatoryLead))) {
      await db.execute(sql`
        INSERT INTO fda_510k_team_assignments (project_id, user_id, role, permissions, assigned_sections)
        VALUES (
          ${project.id},
          ${parseInt(regulatoryLead)},
          'regulatory_lead',
          ${JSON.stringify({ canEdit: true, canApprove: true, canSubmit: false })},
          ${JSON.stringify(['regulatory', 'submission', 'compliance'])}
        )
      `);
    }

    if (qualityLead && qualityLead !== '' && !isNaN(parseInt(qualityLead))) {
      await db.execute(sql`
        INSERT INTO fda_510k_team_assignments (project_id, user_id, role, permissions, assigned_sections)
        VALUES (
          ${project.id},
          ${parseInt(qualityLead)},
          'quality_lead',
          ${JSON.stringify({ canEdit: true, canApprove: true, canSubmit: false })},
          ${JSON.stringify(['quality', 'testing', 'validation'])}
        )
      `);
    }

    // 5. Create initial stage progress entry
    await db
      .insert(fda510kStageProgress)
      .values({
        projectId: project.id,
        stageName: 'setup',
        sectionName: 'project_initialization',
        collectedData: {
          projectName,
          deviceName,
          templateId,
          intendedUse,
          indications,
          deviceClassification,
          initializationComplete: true,
          wizardData: req.body
        },
        status: 'completed',
        progress: 100,
        isRequired: true,
        validationStatus: 'validated'
      });

    // 5. If template was selected, populate initial data from template
    if (templateId && templateId !== '' && !isNaN(parseInt(templateId))) {
      const templateResult = await db.execute(sql`
        SELECT * FROM fda_510k_project_templates
        WHERE id = ${parseInt(templateId)}
      `);

      if (templateResult.rows && templateResult.rows.length > 0) {
        const template = templateResult.rows[0] as any;
        
        // Apply template settings
        await db
          .insert(fda510kStageProgress)
          .values({
            projectId: project.id,
            stageName: 'setup',
            sectionName: 'template_application',
            collectedData: {
              templateName: template.template_name,
              requiredSections: template.required_sections,
              optionalSections: template.optional_sections,
              testingRequirements: template.testing_requirements,
              documentationChecklist: template.documentation_checklist,
              defaultSettings: template.default_settings
            },
            status: 'completed',
            progress: 100,
            isRequired: false,
            validationStatus: 'validated'
          });
      }
    }

    res.json({
      success: true,
      projectId: baseProject.id,
      message: 'Project created successfully'
    });

  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get project stage data
router.get('/:projectId/stage', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = Number((req as any).organizationId);

  try {
    // If the FDA 510k project row doesn't exist yet (projects created via /api/projects),
    // auto-create a minimal record so workflow state can be persisted.
    const ensureBaseProject = await db.execute(sql`
      SELECT id, name
      FROM projects
      WHERE id = ${parseInt(projectId)}
      AND organization_id = ${organizationId}
      LIMIT 1
    `);

    if (!ensureBaseProject.rows || ensureBaseProject.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get FDA 510k project stage information
    const projectResult = await db.execute(sql`
      SELECT 
        p.id,
        p.project_id,
        p.device_name,
        p.current_stage,
        p.current_stage_progress,
        p.overall_progress,
        p.status,
        p.has_software,
        p.has_biocompatibility,
        p.has_clinical_data,
        p.metadata
      FROM fda_510k_projects p
      WHERE p.project_id = ${parseInt(projectId)}
      AND p.organization_id = ${organizationId}
      LIMIT 1
    `);

    if (!projectResult.rows || projectResult.rows.length === 0) {
      const baseProject = ensureBaseProject.rows[0] as any;

      await db.execute(sql`
        INSERT INTO fda_510k_projects (
          organization_id,
          project_id,
          device_name,
          current_stage,
          current_stage_progress,
          overall_progress,
          status,
          has_software,
          has_biocompatibility,
          has_clinical_data,
          metadata
        ) VALUES (
          ${organizationId},
          ${parseInt(projectId)},
          ${baseProject.name},
          1,
          0,
          0,
          'active',
          false,
          true,
          false,
          ${JSON.stringify({ autoCreated: true, source: '510k-project:stage' })}::jsonb
        )
      `);

      // Re-run fetch after initialization
      const reloaded = await db.execute(sql`
        SELECT 
          p.id,
          p.project_id,
          p.device_name,
          p.current_stage,
          p.current_stage_progress,
          p.overall_progress,
          p.status,
          p.has_software,
          p.has_biocompatibility,
          p.has_clinical_data,
          p.metadata
        FROM fda_510k_projects p
        WHERE p.project_id = ${parseInt(projectId)}
        AND p.organization_id = ${organizationId}
        LIMIT 1
      `);

      projectResult.rows = reloaded.rows;
    }

    const project = projectResult.rows[0] as any;
    
    // Check for eSTAR and RTA status in metadata or settings
    let estarStatus = 'not_started';
    let rtaStatus = 'not_started';
    
    // Check if this is the AeroSpire project (Stage 5)
    const stageNumber = Number.parseInt(String(project.current_stage), 10);
    if (Number.isFinite(stageNumber) && stageNumber === 5) {
      estarStatus = 'in_progress';
      rtaStatus = 'ready';
    }
    
    // Check project settings for eSTAR/RTA status
    const settingsResult = await db.execute(sql`
      SELECT settings
      FROM projects
      WHERE id = ${parseInt(projectId)}
    `);
    
    if (settingsResult.rows && settingsResult.rows.length > 0) {
      const settings = (settingsResult.rows[0] as any).settings;
      if (settings && typeof settings === 'object') {
        estarStatus = settings.eSTARStatus || estarStatus;
        rtaStatus = settings.rtaStatus || rtaStatus;
      }
    }

    res.json({
      id: project.id,
      project_id: project.project_id,
      device_name: project.device_name,
      current_stage: project.current_stage,
      current_stage_progress: project.current_stage_progress,
      overall_progress: project.overall_progress,
      status: project.status,
      estar_status: estarStatus,
      rta_status: rtaStatus,
      has_software: project.has_software,
      has_biocompatibility: project.has_biocompatibility,
      has_clinical_data: project.has_clinical_data
    });

  } catch (error) {
    console.error('Error fetching project stage:', error);
    res.status(500).json({ error: 'Failed to fetch project stage data' });
  }
});

// PUT project stage data (persist workflow state)
router.put('/:projectId/stage', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = Number((req as any).organizationId);

  const rawStage = (req.body?.current_stage ?? req.body?.stage ?? req.body?.currentStage);
  const current_stage = rawStage === undefined || rawStage === null ? '' : String(rawStage).trim();
  const current_stage_progress = Number.parseInt(String(req.body?.current_stage_progress ?? 0), 10);
  const overall_progress = Number.parseInt(String(req.body?.overall_progress ?? 0), 10);
  const estar_status = req.body?.estar_status;
  const rta_status = req.body?.rta_status;

  if (!current_stage) {
    return res.status(400).json({ error: 'current_stage is required' });
  }

  const clamp = (val: number) => Math.max(0, Math.min(100, Number.isFinite(val) ? val : 0));

  try {
    // Ensure base project exists and belongs to tenant
    const baseProject = await db.execute(sql`
      SELECT id
      FROM projects
      WHERE id = ${parseInt(projectId)}
      AND organization_id = ${organizationId}
      LIMIT 1
    `);

    if (!baseProject.rows || baseProject.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Ensure 510k project row exists
    await db.execute(sql`
      INSERT INTO fda_510k_projects (
        organization_id,
        project_id,
        device_name,
        current_stage,
        current_stage_progress,
        overall_progress,
        status,
        has_software,
        has_biocompatibility,
        has_clinical_data,
        metadata
      )
      SELECT
        ${organizationId},
        ${parseInt(projectId)},
        (SELECT name FROM projects WHERE id = ${parseInt(projectId)}),
        1,
        0,
        0,
        'active',
        false,
        true,
        false,
        ${JSON.stringify({ autoCreated: true, source: '510k-project:stage:put' })}::jsonb
      WHERE NOT EXISTS (
        SELECT 1
        FROM fda_510k_projects p
        WHERE p.project_id = ${parseInt(projectId)}
        AND p.organization_id = ${organizationId}
      )
    `);

    // Update stage fields
    await db.execute(sql`
      UPDATE fda_510k_projects
      SET
        current_stage = ${current_stage},
        current_stage_progress = ${clamp(current_stage_progress)},
        overall_progress = ${clamp(overall_progress)}
      WHERE project_id = ${parseInt(projectId)}
      AND organization_id = ${organizationId}
    `);

    // Store eSTAR/RTA status on the base project settings (if provided)
    if (estar_status !== undefined || rta_status !== undefined) {
      await db.execute(sql`
        UPDATE projects
        SET settings = COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object(
            'eSTARStatus', CAST(${estar_status ?? null} AS TEXT),
            'rtaStatus', CAST(${rta_status ?? null} AS TEXT)
          )
        WHERE id = ${parseInt(projectId)}
        AND organization_id = ${organizationId}
      `);
    }

    // Return the current stage snapshot
    const response = await db.execute(sql`
      SELECT 
        p.id,
        p.project_id,
        p.device_name,
        p.current_stage,
        p.current_stage_progress,
        p.overall_progress,
        p.status,
        p.has_software,
        p.has_biocompatibility,
        p.has_clinical_data
      FROM fda_510k_projects p
      WHERE p.project_id = ${parseInt(projectId)}
      AND p.organization_id = ${organizationId}
      LIMIT 1
    `);

    const row = response.rows?.[0] as any;
    res.json({
      id: row?.id,
      project_id: row?.project_id,
      device_name: row?.device_name,
      current_stage: row?.current_stage,
      current_stage_progress: row?.current_stage_progress,
      overall_progress: row?.overall_progress,
      status: row?.status,
      estar_status: estar_status ?? null,
      rta_status: rta_status ?? null,
      has_software: row?.has_software,
      has_biocompatibility: row?.has_biocompatibility,
      has_clinical_data: row?.has_clinical_data,
    });
  } catch (error) {
    console.error('Error updating project stage:', error);
    res.status(500).json({ error: 'Failed to update project stage data' });
  }
});

// Get project details
router.get('/:projectId', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = Number((req as any).organizationId);

  try {
    const [project] = await db
      .select()
      .from(fda510kProjects)
      .where(
        and(
          eq(fda510kProjects.id, parseInt(projectId)),
          eq(fda510kProjects.organizationId, organizationId)
        )
      );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get team assignments using SQL
    const teamAssignments = await db.execute(sql`
      SELECT * FROM fda_510k_team_assignments
      WHERE project_id = ${parseInt(projectId)}
    `);

    // Get initial data forms using SQL
    const dataForms = await db.execute(sql`
      SELECT * FROM fda_510k_initial_data_forms
      WHERE project_id = ${parseInt(projectId)}
    `);

    res.json({
      project,
      teamAssignments: teamAssignments.rows,
      dataForms: dataForms.rows
    });

  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
});

// Update project team assignments
router.post('/:projectId/team', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { assignments } = req.body;

  try {
    // Delete existing assignments using SQL
    await db.execute(sql`
      DELETE FROM fda_510k_team_assignments
      WHERE project_id = ${parseInt(projectId)}
    `);

    // Insert new assignments
    if (assignments && assignments.length > 0) {
      for (const assignment of assignments) {
        await db.execute(sql`
          INSERT INTO fda_510k_team_assignments (project_id, user_id, role, permissions, assigned_sections)
          VALUES (
            ${parseInt(projectId)},
            ${assignment.userId},
            ${assignment.role},
            ${JSON.stringify(assignment.permissions || {})},
            ${JSON.stringify(assignment.assignedSections || [])}
          )
        `);
      }
    }

    res.json({ success: true, message: 'Team assignments updated' });

  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team assignments' });
  }
});

export default router;