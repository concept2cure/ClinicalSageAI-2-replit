/**
 * 510(k) Project Routes (DEPRECATED)
 *
 * @deprecated This route file is deprecated as of 2026-01-26.
 * Please migrate to /api/fda510k-unified/projects
 * Sunset date: 2026-06-30
 *
 * @see /api/fda510k-unified/docs for migration guide
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { fda510kProjects, fda510kStageProgress, projects } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { create510kDeprecationNotice } from '../middleware/deprecation';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Apply deprecation notice to all routes in this file
router.use(create510kDeprecationNotice('/projects'));

// Get available project templates
router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
  const templates = await db.execute(sql`
    SELECT id, template_name, device_classification, required_sections, optional_sections, testing_requirements, documentation_checklist, default_settings, is_active, created_at, updated_at FROM fda_510k_project_templates
    WHERE is_active = true
    ORDER BY device_classification, template_name
  `);

  res.json(templates.rows);
}));

// Create a new project with wizard data
router.post('/create', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
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
    estimatedTimelineDays,
  } = req.body;

  // Validate required fields
  if (!projectName || !deviceName) {
    return res.status(400).json({
      error: 'Project name and device name are required',
    });
  }

  if (!intendedUse || !indications) {
    return res.status(400).json({
      error: 'Intended use and indications for use are required',
    });
  }

  // 1. First create the base project in projects table
  const [baseProject] = await db
      .insert(projects)
      .values({
        organizationId: organizationId,
        clientWorkspaceId: 1, // Default to first workspace
        name: projectName,
        description: `FDA 510(k) submission project for ${deviceName}`,
        type: 'regulatory',
        status: 'planning',
        priority: 'high',
        startDate: new Date(),
        targetEndDate: targetSubmissionDate ? new Date(targetSubmissionDate) : null,
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
        projectLead:
          projectLead && projectLead !== '' && !isNaN(parseInt(projectLead))
            ? parseInt(projectLead)
            : null,
        regulatoryLead:
          regulatoryLead && regulatoryLead !== '' && !isNaN(parseInt(regulatoryLead))
            ? parseInt(regulatoryLead)
            : null,
        qualityLead:
          qualityLead && qualityLead !== '' && !isNaN(parseInt(qualityLead))
            ? parseInt(qualityLead)
            : null,
        teamMembers: teamMembers || [],
        targetSubmissionDate: targetSubmissionDate || null,
        currentStage: 'setup',
        overallProgress: 0,
        status: 'active',
        metadata: {
          projectName,
          templateId,
          estimatedTimelineDays,
          createdViaWizard: true,
        },
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
            hasAI,
          },
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
          indications,
        })},
        ${!!intendedUse && !!indications},
        ${intendedUse && indications ? sql`NOW()` : null}
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
    await db.insert(fda510kStageProgress).values({
      projectId: project.id,
      organizationId: organizationId,
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
        wizardData: req.body,
      },
      status: 'completed',
      progress: 100,
      isRequired: true,
      validationStatus: 'validated',
    });

    // 5. If template was selected, populate initial data from template
    if (templateId && templateId !== '' && !isNaN(parseInt(templateId))) {
      const templateResult = await db.execute(sql`
        SELECT id, template_name, required_sections, optional_sections, testing_requirements, documentation_checklist, default_settings FROM fda_510k_project_templates
        WHERE id = ${parseInt(templateId)}
      `);

      if (templateResult.rows && templateResult.rows.length > 0) {
        const template = templateResult.rows[0] as any;

        // Apply template settings
        await db.insert(fda510kStageProgress).values({
          projectId: project.id,
          organizationId: organizationId,
          stageName: 'setup',
          sectionName: 'template_application',
          collectedData: {
            templateName: template.template_name,
            requiredSections: template.required_sections,
            optionalSections: template.optional_sections,
            testingRequirements: template.testing_requirements,
            documentationChecklist: template.documentation_checklist,
            defaultSettings: template.default_settings,
          },
          status: 'completed',
          progress: 100,
          isRequired: false,
          validationStatus: 'validated',
        });
      }
    }

  res.json({
    success: true,
    projectId: baseProject.id,
    message: 'Project created successfully',
  });
}));

// Get project stage data
router.get('/:projectId/stage', asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
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
    return res.status(404).json({ error: 'FDA 510(k) project not found' });
  }

  const project = projectResult.rows[0] as any;

  // Check for eSTAR and RTA status in metadata or settings
  let estarStatus = 'not_started';
  let rtaStatus = 'not_started';

  // Check if this is the AeroSpire project (Stage 5)
  if (project.current_stage === 5) {
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
    has_clinical_data: project.has_clinical_data,
  });
}));

// Get project details
router.get('/:projectId', asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

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
    SELECT id, project_id, user_id, role, permissions, assigned_sections, created_at, updated_at FROM fda_510k_team_assignments
    WHERE project_id = ${parseInt(projectId)}
  `);

  // Get initial data forms using SQL
  const dataForms = await db.execute(sql`
    SELECT id, project_id, form_type, form_data, is_complete, completed_at, created_at, updated_at FROM fda_510k_initial_data_forms
    WHERE project_id = ${parseInt(projectId)}
  `);

  res.json({
    project,
    teamAssignments: teamAssignments.rows,
    dataForms: dataForms.rows,
  });
}));

// Update project team assignments
router.post('/:projectId/team', asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { assignments } = req.body;

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
}));

export default router;
