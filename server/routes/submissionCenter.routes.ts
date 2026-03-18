import { Router, Request, Response } from 'express';
import { pool, query } from '../db';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Project creation schema for unified IND + eCTD workflow
const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  submissionType: z.enum(['NDA', 'ANDA', 'BLA', '510k', 'IND', 'PMR', 'PMC', 'IVDR']),
  targetAgency: z.string().optional(),
  targetDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  modules: z.array(z.string()).optional(), // IND Wizard, eCTD Co-Author, etc.
});

// Task schema
const createTaskSchema = z.object({
  project_id: z.number().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'in-progress', 'completed', 'blocked']).default('pending'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  module_type: z.string().optional(), // IND, eCTD, CMC, etc.
  category: z.string().optional(),
  type: z.string().optional(),
  assigned_to: z.string().optional(),
  assigned_email: z.string().optional(),
  due_date: z.string().optional(),
  estimated_hours: z.number().optional(),
});

// Get all projects
router.get('/projects', asyncHandler(async (req: Request, res: Response) => {
    const result = await query(`
      SELECT
        p.id, p.name, p.description, p.submission_type, p.status, p.stage,
        p.target_agency, p.target_date, p.priority, p.completion_percentage,
        p.created_by, p.created_at, p.updated_at,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'in-progress' THEN t.id END) as in_progress_tasks
      FROM submission_projects p
      LEFT JOIN submission_tasks t ON p.id = t.project_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    const projects = result.rows.map(p => ({
      ...p,
      taskMetrics: {
        total: parseInt(p.total_tasks) || 0,
        completed: parseInt(p.completed_tasks) || 0,
        inProgress: parseInt(p.in_progress_tasks) || 0,
      },
      completionPercentage: p.completion_percentage || 0,
    }));

    res.json({
      success: true,
      data: projects,
    });
}));

// Create new project
router.post('/projects', asyncHandler(async (req: Request, res: Response) => {
    const validatedData = createProjectSchema.parse(req.body);

    const result = await query(
      `INSERT INTO submission_projects (name, description, submission_type, status, stage, target_agency, target_date, priority, created_by)
       VALUES ($1, $2, $3, 'planning', 'planning', $4, $5, $6, 'User')
       RETURNING *`,
      [
        validatedData.name,
        validatedData.description || '',
        validatedData.submissionType,
        validatedData.targetAgency || 'FDA',
        validatedData.targetDate || null,
        validatedData.priority,
      ]
    );

    const newProject = result.rows[0];

    // Auto-create initial tasks based on submission type
    if (newProject) {
      const initialTasks = getInitialTasksForProject(newProject.submission_type);

      for (const task of initialTasks) {
        await query(
          `INSERT INTO submission_tasks (project_id, title, description, status, priority, module_type, category, type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newProject.id,
            task.title,
            task.description,
            'pending',
            task.priority || 'medium',
            task.module,
            task.category,
            task.type || 'task',
          ]
        );
      }
    }

    res.json({
      success: true,
      data: newProject,
    });
}));

// Get tasks for a project or all tasks
router.get('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.query.projectId;

    let queryText = `
      SELECT t.id, t.project_id, t.title, t.description, t.status, t.priority,
             t.module_type, t.category, t.type, t.assigned_to, t.assigned_email,
             t.due_date, t.estimated_hours, t.completion_percentage, t.created_at, t.updated_at,
             p.name as project_name, p.submission_type
      FROM submission_tasks t
      LEFT JOIN submission_projects p ON t.project_id = p.id
    `;

    const params: any[] = [];
    if (projectId) {
      queryText += ' WHERE t.project_id = $1';
      params.push(projectId);
    }

    queryText += ' ORDER BY t.due_date ASC NULLS LAST, t.priority DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows,
    });
}));

// Create new task
router.post('/tasks', asyncHandler(async (req: Request, res: Response) => {
    const validatedData = createTaskSchema.parse(req.body);

    const result = await query(
      `INSERT INTO submission_tasks (project_id, title, description, status, priority, module_type, category, type, assigned_to, assigned_email, due_date, estimated_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        validatedData.project_id || null,
        validatedData.title,
        validatedData.description || '',
        validatedData.status,
        validatedData.priority,
        validatedData.module_type || null,
        validatedData.category || null,
        validatedData.type || 'task',
        validatedData.assigned_to || null,
        validatedData.assigned_email || null,
        validatedData.due_date || null,
        validatedData.estimated_hours || null,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
}));

// Update task status
router.put('/tasks/:id', asyncHandler(async (req: Request, res: Response) => {
    const taskId = req.params.id;
    const { status, completion_percentage } = req.body;

    const result = await query(
      `UPDATE submission_tasks
       SET status = $1, completion_percentage = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, completion_percentage || 0, taskId]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
}));

// Get regulatory intelligence feed
router.get('/regulatory-intelligence', asyncHandler(async (req: Request, res: Response) => {
    const result = await query(`
      SELECT id, title, description, category, impact_level, published_date
      FROM regulatory_intelligence
      ORDER BY published_date DESC
      LIMIT 20
    `);

    res.json({
      success: true,
      data: result.rows,
      message: result.rows.length === 0 ? 'No regulatory intelligence entries found. Data will appear here as it is ingested.' : undefined,
    });
}));

// Get pipeline status
router.get('/pipeline', asyncHandler(async (req: Request, res: Response) => {
    const result = await query(`
      SELECT
        stage,
        COUNT(*) as count,
        array_agg(json_build_object(
          'id', id,
          'name', name,
          'type', submission_type,
          'priority', priority,
          'completion', completion_percentage
        )) as projects
      FROM submission_projects
      GROUP BY stage
      ORDER BY
        CASE stage
          WHEN 'planning' THEN 1
          WHEN 'authoring' THEN 2
          WHEN 'review' THEN 3
          WHEN 'approval' THEN 4
          WHEN 'submission' THEN 5
          WHEN 'response' THEN 6
        END
    `);

    const stages = ['planning', 'authoring', 'review', 'approval', 'submission', 'response'];
    const pipeline = stages.map(stage => {
      const stageData = result.rows.find(r => r.stage === stage);
      return {
        stage,
        count: stageData ? parseInt(stageData.count) : 0,
        projects: stageData ? stageData.projects : [],
      };
    });

    res.json({
      success: true,
      data: pipeline,
    });
}));

// Update project workflow stage (for drag-and-drop)
router.post('/workflow/transition', asyncHandler(async (req: Request, res: Response) => {
    const { projectId, newStage } = req.body;

    const result = await query(
      `UPDATE submission_projects
       SET stage = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [newStage, projectId]
    );

    // Log activity
    await query(
      `INSERT INTO project_activities (project_id, description)
       VALUES ($1, $2)`,
      [projectId, `Project moved to ${newStage} stage`]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
}));

// Helper function to generate initial tasks based on submission type
function getInitialTasksForProject(submissionType: string) {
  const taskTemplates: { [key: string]: any[] } = {
    IND: [
      {
        title: 'Complete Form FDA 1571',
        description: 'Fill out investigational new drug application form',
        module: 'IND',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: "Prepare Investigator's Brochure",
        description: 'Compile all available data on the investigational drug',
        module: 'IND',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Draft Clinical Protocol',
        description: 'Create detailed protocol for clinical trial',
        module: 'IND',
        category: 'authoring',
        priority: 'critical',
      },
      {
        title: 'Compile CMC Information',
        description: 'Chemistry, manufacturing, and controls documentation',
        module: 'CMC',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Prepare eCTD Submission Package',
        description: 'Format documents for electronic submission',
        module: 'eCTD',
        category: 'submission',
        priority: 'medium',
      },
    ],
    NDA: [
      {
        title: 'Complete Module 1 Administrative',
        description: 'Forms, cover letter, and administrative information',
        module: 'eCTD',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Prepare Module 2 Summaries',
        description: 'CTD summaries and overviews',
        module: 'eCTD',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Compile Module 3 Quality',
        description: 'Complete quality documentation',
        module: 'CMC',
        category: 'authoring',
        priority: 'critical',
      },
      {
        title: 'Prepare Module 4 Nonclinical',
        description: 'Nonclinical study reports',
        module: 'eCTD',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Complete Module 5 Clinical',
        description: 'Clinical study reports and data',
        module: 'Clinical',
        category: 'authoring',
        priority: 'critical',
      },
      {
        title: 'eCTD Technical Validation',
        description: 'Validate eCTD package before submission',
        module: 'eCTD',
        category: 'review',
        priority: 'high',
      },
    ],
    BLA: [
      {
        title: 'Prepare Form FDA 356h',
        description: 'Application to market a new biologic',
        module: 'eCTD',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Complete Manufacturing Information',
        description: 'Detailed manufacturing process for biologic',
        module: 'CMC',
        category: 'authoring',
        priority: 'critical',
      },
      {
        title: 'Compile Clinical Data',
        description: 'All clinical trial data and analyses',
        module: 'Clinical',
        category: 'authoring',
        priority: 'critical',
      },
      {
        title: 'Prepare Risk Management Plan',
        description: 'REMS if required',
        module: 'Risk',
        category: 'authoring',
        priority: 'medium',
      },
    ],
    '510k': [
      {
        title: 'Complete 510(k) Summary',
        description: 'Device description and substantial equivalence',
        module: 'Medical Device',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Identify Predicate Device',
        description: 'Find and document predicate device',
        module: 'Medical Device',
        category: 'analysis',
        priority: 'critical',
      },
      {
        title: 'Compile Performance Testing',
        description: 'Bench testing and validation data',
        module: 'Quality',
        category: 'authoring',
        priority: 'high',
      },
      {
        title: 'Prepare Labeling',
        description: 'Device labeling and instructions for use',
        module: 'Medical Device',
        category: 'authoring',
        priority: 'medium',
      },
    ],
    IVDR: [
      {
        title: 'Annex VIII Classification',
        description:
          'Determine IVDR risk class (A/B/C/D) per Annex VIII rules and document classification rationale',
        module: 'IVDR',
        category: 'classification',
        priority: 'critical',
      },
      {
        title: 'Performance Evaluation Plan',
        description:
          'Draft PEP covering scientific validity, analytical performance, and clinical performance per Article 56',
        module: 'IVDR',
        category: 'authoring',
        priority: 'critical',
      },
      {
        title: 'Analytical Performance Studies',
        description:
          'Execute and document analytical sensitivity, specificity, accuracy, precision, LoD/LoQ, interfering substances per IVDR Annex I',
        module: 'IVDR',
        category: 'validation',
        priority: 'high',
      },
      {
        title: 'Clinical Evidence Compilation',
        description:
          'Compile clinical performance data, literature review, and clinical evidence per Article 56(4) and MDCG guidance',
        module: 'IVDR',
        category: 'evidence',
        priority: 'high',
      },
      {
        title: 'CDx Companion Diagnostic Workflow',
        description:
          'If applicable: link biomarker claims to therapeutic product, document intended use, and clinical evidence bridging',
        module: 'IVDR',
        category: 'cdx',
        priority: 'medium',
      },
      {
        title: 'Technical Documentation Assembly',
        description:
          'Assemble Annexes II & III technical documentation package including device description, design, manufacturing, and risk management',
        module: 'IVDR',
        category: 'submission',
        priority: 'high',
      },
      {
        title: 'Notified Body Readiness Review',
        description:
          'Pre-submission gap analysis against NB expectations, ensure conformity assessment route matches risk class',
        module: 'IVDR',
        category: 'review',
        priority: 'high',
      },
    ],
  };

  return taskTemplates[submissionType] || [];
}

// Mock regulatory intelligence removed — returns real DB data or empty array.

export default router;
