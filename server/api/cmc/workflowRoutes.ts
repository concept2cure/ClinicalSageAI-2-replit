/**
 * Smart Workflows API Routes for CMC Module
 * Comprehensive workflow management system for Chemistry, Manufacturing, and Controls
 */

import express from 'express';
import { z } from 'zod';
import { db, getPool } from '../../db';
import { projectWorkflows, workflowTasks } from '../../../shared/cmc-schema';
import { eq, desc, and } from 'drizzle-orm';
import { getGateway } from '../../services/ai-gateway/index.js';

const router = express.Router();

function getOrganizationId(req: express.Request): number {
  const orgId = parseInt(
    String((req as any).tenantId || (req as any).tenantContext?.organizationId || 0),
    10
  );
  if (!orgId || Number.isNaN(orgId)) {
    throw new Error('Organization context required');
  }
  return orgId;
}

// Types for workflow data
interface WorkflowTask {
  id: number;
  name: string;
  status: 'pending' | 'in-progress' | 'completed';
  duration: string;
  owner: string;
  requirements: string[];
  notes?: string;
  updatedAt?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
  priority: 'low' | 'medium' | 'high';
  tasks: WorkflowTask[];
  regulations: string[];
  deliverables: string[];
}

interface AICommandConfig {
  category: string;
  estimatedTime: string;
  requiredInputs: string[];
  outputs: string[];
}

// Workflow data models and validation schemas
const WorkflowCreateSchema = z.object({
  template: z.string().min(1),
  drugName: z.string().min(1),
  structuredInputs: z
    .object({
      molecularWeight: z.string().optional(),
      synthesisRoute: z.string().optional(),
      drugSubstance: z.string().optional(),
      dosageForm: z.string().optional(),
      excipients: z.string().optional(),
      manufacturingSite: z.string().optional(),
    })
    .optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assignedTeam: z.array(z.string()).default([]),
});

const TaskUpdateSchema = z.object({
  taskId: z.number(),
  status: z.enum(['pending', 'in-progress', 'completed']),
  notes: z.string().optional(),
  owner: z.string().optional(),
});

const AICommandSchema = z.object({
  command: z.string().min(1),
  drugName: z.string().min(1),
  structuredInputs: z.object({}).optional(),
  category: z.string().optional(),
});

// Workflow templates database
const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  'ind-cmc': {
    id: 'ind-cmc',
    name: 'IND CMC Package',
    description: 'Complete Chemistry, Manufacturing, and Controls package for IND submission',
    estimatedTime: '4-6 weeks',
    priority: 'high',
    tasks: [
      {
        id: 1,
        name: 'Drug Substance Characterization',
        status: 'pending',
        duration: '5 days',
        owner: 'CMC Lead',
        requirements: ['Physicochemical properties', 'Structure confirmation', 'Impurity profile'],
      },
      {
        id: 2,
        name: 'Manufacturing Information',
        status: 'pending',
        duration: '7 days',
        owner: 'Process Engineer',
        requirements: ['Process description', 'Equipment specifications', 'In-process controls'],
      },
      {
        id: 3,
        name: 'Container Closure System',
        status: 'pending',
        duration: '3 days',
        owner: 'Packaging Specialist',
        requirements: ['Material description', 'Extractables/leachables', 'Compatibility studies'],
      },
      {
        id: 4,
        name: 'Stability Protocols',
        status: 'pending',
        duration: '4 days',
        owner: 'Stability Scientist',
        requirements: ['Study design', 'Analytical methods', 'Storage conditions'],
      },
      {
        id: 5,
        name: 'Analytical Methods',
        status: 'pending',
        duration: '6 days',
        owner: 'Analytical Lead',
        requirements: ['Method validation', 'Reference standards', 'Assay procedures'],
      },
      {
        id: 6,
        name: 'Quality Specifications',
        status: 'pending',
        duration: '3 days',
        owner: 'QC Manager',
        requirements: ['Release specifications', 'Acceptance criteria', 'Test procedures'],
      },
    ],
    regulations: ['FDA 21 CFR 312.23', 'ICH M4Q', 'ICH Q6A'],
    deliverables: ['Module 3.2.S summary', 'Module 3.2.P summary', 'Analytical data package'],
  },
  'stability-supplement': {
    id: 'stability-supplement',
    name: 'Stability Data Supplement',
    description: 'Comprehensive stability data analysis and shelf-life justification',
    estimatedTime: '2-3 weeks',
    priority: 'medium',
    tasks: [
      {
        id: 1,
        name: 'Study Design Review',
        status: 'pending',
        duration: '2 days',
        owner: 'Stability Scientist',
        requirements: ['Protocol compliance', 'ICH guidelines alignment', 'Storage conditions'],
      },
      {
        id: 2,
        name: 'Data Collection & Analysis',
        status: 'pending',
        duration: '8 days',
        owner: 'Data Analyst',
        requirements: [
          'Statistical analysis',
          'Trend analysis',
          'Out-of-specification investigations',
        ],
      },
      {
        id: 3,
        name: 'Statistical Evaluation',
        status: 'pending',
        duration: '3 days',
        owner: 'Biostatistician',
        requirements: ['Regression analysis', 'Confidence intervals', 'Shelf-life calculation'],
      },
      {
        id: 4,
        name: 'Shelf-life Justification',
        status: 'pending',
        duration: '3 days',
        owner: 'Regulatory Scientist',
        requirements: ['Scientific rationale', 'Regulatory precedent', 'Risk assessment'],
      },
      {
        id: 5,
        name: 'Report Generation',
        status: 'pending',
        duration: '2 days',
        owner: 'Technical Writer',
        requirements: ['Executive summary', 'Data tables', 'Conclusion'],
      },
    ],
    regulations: ['ICH Q1A', 'ICH Q1E', 'FDA Stability Guidelines'],
    deliverables: ['Stability study report', 'Shelf-life justification', 'Label claim support'],
  },
  'method-validation': {
    id: 'method-validation',
    name: 'Analytical Method Validation',
    description: 'Complete validation package for analytical methods per ICH guidelines',
    estimatedTime: '3-4 weeks',
    priority: 'high',
    tasks: [
      {
        id: 1,
        name: 'Protocol Development',
        status: 'pending',
        duration: '3 days',
        owner: 'Analytical Lead',
        requirements: ['Validation parameters', 'Acceptance criteria', 'Statistical methods'],
      },
      {
        id: 2,
        name: 'Specificity Studies',
        status: 'pending',
        duration: '4 days',
        owner: 'Analyst',
        requirements: ['Impurity testing', 'Interference studies', 'Forced degradation'],
      },
      {
        id: 3,
        name: 'Linearity & Range',
        status: 'pending',
        duration: '3 days',
        owner: 'Analyst',
        requirements: ['Calibration curves', 'Statistical analysis', 'Range verification'],
      },
      {
        id: 4,
        name: 'Accuracy Studies',
        status: 'pending',
        duration: '4 days',
        owner: 'Analyst',
        requirements: ['Recovery studies', 'Standard addition', 'Reference material'],
      },
      {
        id: 5,
        name: 'Precision Evaluation',
        status: 'pending',
        duration: '5 days',
        owner: 'Analyst',
        requirements: ['Repeatability', 'Intermediate precision', 'Reproducibility'],
      },
      {
        id: 6,
        name: 'Robustness Testing',
        status: 'pending',
        duration: '3 days',
        owner: 'Analyst',
        requirements: ['Parameter variation', 'System suitability', 'Method resilience'],
      },
      {
        id: 7,
        name: 'Report Compilation',
        status: 'pending',
        duration: '3 days',
        owner: 'Technical Writer',
        requirements: ['Validation summary', 'Statistical analysis', 'Method transfer'],
      },
    ],
    regulations: ['ICH Q2(R1)', 'USP General Chapters', 'FDA Analytical Procedures'],
    deliverables: ['Validation protocol', 'Validation report', 'Analytical method'],
  },
  'qbd-development': {
    id: 'qbd-development',
    name: 'Quality by Design Development',
    description: 'QbD approach for pharmaceutical development with Design Space definition',
    estimatedTime: '6-8 weeks',
    priority: 'medium',
    tasks: [
      {
        id: 1,
        name: 'Quality Target Product Profile',
        status: 'pending',
        duration: '4 days',
        owner: 'Development Lead',
        requirements: ['Clinical performance', 'Quality attributes', 'Patient needs'],
      },
      {
        id: 2,
        name: 'Critical Quality Attributes',
        status: 'pending',
        duration: '5 days',
        owner: 'CMC Team',
        requirements: ['Risk assessment', 'Scientific rationale', 'Specifications'],
      },
      {
        id: 3,
        name: 'Risk Assessment',
        status: 'pending',
        duration: '6 days',
        owner: 'Quality Assurance',
        requirements: ['FMEA analysis', 'Risk ranking', 'Mitigation strategies'],
      },
      {
        id: 4,
        name: 'Design of Experiments',
        status: 'pending',
        duration: '10 days',
        owner: 'Process Engineer',
        requirements: ['Experimental design', 'Factor screening', 'Response surface'],
      },
      {
        id: 5,
        name: 'Design Space Definition',
        status: 'pending',
        duration: '8 days',
        owner: 'Development Team',
        requirements: ['Operating ranges', 'Multivariate analysis', 'Proven acceptable range'],
      },
      {
        id: 6,
        name: 'Control Strategy',
        status: 'pending',
        duration: '5 days',
        owner: 'Quality Control',
        requirements: ['Control points', 'Monitoring strategy', 'Corrective actions'],
      },
    ],
    regulations: ['ICH Q8', 'ICH Q9', 'ICH Q10'],
    deliverables: ['QbD summary', 'Design space report', 'Control strategy'],
  },
};

// AI CoPilot commands configuration
const AI_COPILOT_COMMANDS: Record<string, AICommandConfig> = {
  'Generate analytical method summary': {
    category: 'Analytical',
    estimatedTime: '15 min',
    requiredInputs: ['drugName', 'analyticalMethod'],
    outputs: ['Method summary', 'Validation parameters', 'System suitability'],
  },
  'Update stability protocol for biologics': {
    category: 'Stability',
    estimatedTime: '20 min',
    requiredInputs: ['drugName', 'productType'],
    outputs: ['Updated protocol', 'ICH compliance check', 'Storage recommendations'],
  },
  'Check nitrosamine risk assessment': {
    category: 'Impurities',
    estimatedTime: '10 min',
    requiredInputs: ['drugName', 'manufacturingRoute'],
    outputs: ['Risk assessment', 'Control measures', 'Testing recommendations'],
  },
  'Generate QbD control strategy': {
    category: 'QbD',
    estimatedTime: '25 min',
    requiredInputs: ['drugName', 'criticalQualityAttributes'],
    outputs: ['Control strategy', 'Monitoring plan', 'Decision trees'],
  },
  'Validate container closure system': {
    category: 'Packaging',
    estimatedTime: '30 min',
    requiredInputs: ['drugName', 'containerType'],
    outputs: ['Validation protocol', 'Test procedures', 'Acceptance criteria'],
  },
  'Create dissolution method': {
    category: 'Analytical',
    estimatedTime: '20 min',
    requiredInputs: ['drugName', 'dosageForm'],
    outputs: ['Dissolution method', 'Conditions', 'Specification'],
  },
};

let commandCounter = 1;

/**
 * @route GET /api/cmc/workflows
 * @description Get all workflows for the current user/tenant
 */
router.get('/', async (req, res) => {
  try {
    const orgId = getOrganizationId(req);
    const rows = await db
      .select()
      .from(projectWorkflows)
      .where(eq((projectWorkflows as any).organizationId, orgId as any))
      .orderBy(desc(projectWorkflows.createdAt))
      .limit(100);

    // Enrich with tasks
    const enriched = await Promise.all(
      rows.map(async (wf) => {
        const tasks = await db
          .select()
          .from(workflowTasks)
          .where(eq(workflowTasks.workflowId, wf.id));
        const completed = tasks.filter(t => t.status === 'completed').length;
        return {
          ...wf,
          tasks,
          currentProgress: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

/**
 * @route POST /api/cmc/workflows
 * @description Create a new workflow from template
 */
router.post('/', async (req, res) => {
  try {
    const validatedData = WorkflowCreateSchema.parse(req.body);
    const { template, drugName, structuredInputs, name, description, priority, assignedTeam } =
      validatedData;

    const templateData = WORKFLOW_TEMPLATES[template];

    // Insert workflow into database
    const [newWorkflow] = await db
      .insert(projectWorkflows)
      .values({
        projectId: req.body.projectId || null,
        workflowName: name || templateData?.name || template,
        workflowData: {
          templateId: template,
          drugContext: drugName,
          structuredData: structuredInputs || {},
          assignedTeam: assignedTeam.length > 0 ? assignedTeam : [],
          regulations: templateData?.regulations || [],
          deliverables: templateData?.deliverables || [],
        },
        status: 'active',
        progress: 0,
        startDate: new Date(),
        assignedTo: assignedTeam[0] || null,
      })
      .returning();

    // Create tasks from template
    if (templateData?.tasks) {
      for (const task of templateData.tasks) {
        await db.insert(workflowTasks).values({
          workflowId: newWorkflow.id,
          taskName: task.name,
          description: task.requirements?.join('; ') || '',
          taskType: 'document',
          priority: priority,
          status: 'pending',
          assignedTo: task.owner,
          estimatedHours: parseInt(task.duration) || null,
        });
      }
    }

    // Fetch back with tasks
    const tasks = await db
      .select()
      .from(workflowTasks)
      .where(eq(workflowTasks.workflowId, newWorkflow.id));

    res.json({
      success: true,
      data: { ...newWorkflow, tasks },
      message: `${newWorkflow.workflowName} workflow created successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.errors,
      });
    }

    console.error('Error creating workflow:', error);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

/**
 * @route GET /api/cmc/workflows/:id
 * @description Get specific workflow by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrganizationId(req);
    const [workflow] = await db
      .select()
      .from(projectWorkflows)
      .where(and(eq(projectWorkflows.id, id), eq((projectWorkflows as any).organizationId, orgId as any)));

    if (!workflow) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    const tasks = await db
      .select()
      .from(workflowTasks)
      .where(eq(workflowTasks.workflowId, id));

    const completed = tasks.filter(t => t.status === 'completed').length;

    res.json({
      success: true,
      data: {
        ...workflow,
        tasks,
        currentProgress: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

/**
 * @route PUT /api/cmc/workflows/:id/tasks/:taskId
 * @description Update task status within a workflow
 */
router.put('/:id/tasks/:taskId', async (req, res) => {
  try {
    const { id, taskId } = req.params;
    const validatedData = TaskUpdateSchema.parse({ taskId: parseInt(taskId), ...req.body });

    // Update the task in database
    const updateData: Record<string, any> = {
      status: validatedData.status,
      updatedAt: new Date(),
    };
    if (validatedData.notes) updateData.description = validatedData.notes;
    if (validatedData.owner) updateData.assignedTo = validatedData.owner;
    if (validatedData.status === 'completed') updateData.completedDate = new Date();

    const [updatedTask] = await db
      .update(workflowTasks)
      .set(updateData)
      .where(eq(workflowTasks.id, taskId))
      .returning();

    if (!updatedTask) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Recalculate workflow progress
    const allTasks = await db
      .select()
      .from(workflowTasks)
      .where(eq(workflowTasks.workflowId, id));

    const completed = allTasks.filter(t => t.status === 'completed').length;
    const progress = allTasks.length > 0 ? Math.round((completed / allTasks.length) * 100) : 0;

    await db
      .update(projectWorkflows)
      .set({ progress, updatedAt: new Date() })
      .where(eq(projectWorkflows.id, id));

    // Fetch updated workflow
    const [workflow] = await db
      .select()
      .from(projectWorkflows)
      .where(eq(projectWorkflows.id, id));

    res.json({
      success: true,
      data: { ...workflow, tasks: allTasks, currentProgress: progress },
      message: 'Task updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input data', details: error.errors });
    }
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

/**
 * @route POST /api/cmc/ai-command
 * @description Execute AI CoPilot command
 */
router.post('/ai-command', async (req, res) => {
  try {
    const validatedData = AICommandSchema.parse(req.body);
    const { command, drugName, structuredInputs, category } = validatedData;

    if (!AI_COPILOT_COMMANDS[command]) {
      return res.status(400).json({
        success: false,
        error: 'Unknown AI command',
      });
    }

    const commandConfig = AI_COPILOT_COMMANDS[command];
    const resultId = `cmd-${commandCounter++}`;

    // Build prompts and call AI gateway for real content generation
    let generatedContent = '';

    const systemPrompt = [
      `You are a senior CMC (Chemistry, Manufacturing, and Controls) regulatory expert.`,
      `You are executing the following command: "${command}"`,
      `Category: ${commandConfig.category}`,
      `Expected outputs: ${commandConfig.outputs.join(', ')}`,
      `Produce a professional, regulatory-compliant markdown document.`,
      `Use proper markdown headings, bullet points, and tables where appropriate.`,
      `Be specific and technically accurate. Reference relevant ICH/FDA guidelines.`,
    ].join('\n');

    const inputSummary = structuredInputs
      ? Object.entries(structuredInputs)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n')
      : '(no additional structured inputs provided)';

    const userPrompt = [
      `Drug Name: ${drugName}`,
      `Command: ${command}`,
      `Structured Inputs:`,
      inputSummary,
      ``,
      `Generate a complete, professional CMC document for this command.`,
    ].join('\n');

    try {
      const gateway = getGateway();
      const gatewayResponse = await gateway.route({
        taskType: 'document_drafting',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        maxTokens: 4000,
        callerModule: 'cmc-workflow-ai-command',
        metadata: { command, drugName, category: commandConfig.category },
      });
      generatedContent = gatewayResponse.content;
    } catch (aiError: any) {
      console.error('AI gateway error for CMC command:', aiError?.message || aiError);
      return res.status(503).json({
        success: false,
        error: 'AI gateway unavailable — unable to generate content. Please try again later.',
      });
    }

    const result = {
      id: resultId,
      command,
      drugName,
      category: category || commandConfig.category,
      status: 'completed',
      timestamp: new Date().toISOString(),
      estimatedTime: commandConfig.estimatedTime,
      result: generatedContent.trim(),
      downloadUrl: `/api/cmc/download/${resultId}`,
      metadata: {
        wordCount: generatedContent.split(' ').length,
        sections: generatedContent.split('#').length - 1,
        generatedAt: new Date().toISOString(),
      },
    };

    const orgId = getOrganizationId(req);
    const pool = getPool();
    await pool.query(
      `INSERT INTO cmc_ai_command_results (
        id, organization_id, project_id, command, drug_name, category, status, estimated_time, result, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        result.id,
        orgId,
        (req.body.projectId as string) || null,
        result.command,
        result.drugName,
        result.category,
        result.status,
        result.estimatedTime,
        result.result,
        JSON.stringify(result.metadata || {}),
      ]
    );

    res.json({
      success: true,
      data: result,
      message: `${command} executed successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.errors,
      });
    }

    console.error('Error executing AI command:', error);
    res.status(500).json({
      success: false,
      error: 'Operation failed',
    });
  }
});

/**
 * @route GET /api/cmc/ai-commands
 * @description Get list of available AI commands
 */
router.get('/ai-commands', async (req, res) => {
  try {
    const commands = Object.entries(AI_COPILOT_COMMANDS).map(([command, config]) => ({
      command,
      ...config,
    }));

    res.json({
      success: true,
      data: commands,
    });
  } catch (error) {
    console.error('Error fetching AI commands:', error);
    res.status(500).json({
      success: false,
      error: 'Operation failed',
    });
  }
});

/**
 * @route GET /api/cmc/ai-commands/results
 * @description Get AI command execution results
 */
router.get('/ai-commands/results', async (req, res) => {
  try {
    const orgId = getOrganizationId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, command, drug_name as "drugName", category, status, estimated_time as "estimatedTime",
              result, metadata, created_at as "timestamp"
       FROM cmc_ai_command_results
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    const results = rows;

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error fetching command results:', error);
    res.status(500).json({
      success: false,
      error: 'Operation failed',
    });
  }
});

/**
 * @route GET /api/cmc/download/:id
 * @description Download generated content
 */
router.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrganizationId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT command, drug_name as "drugName", result
       FROM cmc_ai_command_results
       WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    const result = rows[0];
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Download not found',
      });
    }

    const filename = `${result.command.replace(/\s+/g, '_')}_${result.drugName}_${new Date().toISOString().split('T')[0]}.md`;

    res.set({
      'Content-Type': 'text/markdown',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    res.send(result.result);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: 'Operation failed',
    });
  }
});

/**
 * @route GET /api/cmc/analytics/performance
 * @description Get workflow performance analytics
 */
router.get('/analytics/performance', async (req, res) => {
  try {
    const allWorkflows = await db.select().from(projectWorkflows);
    const pool = getPool();
    const commandRes = await pool.query(`SELECT category, status, command FROM cmc_ai_command_results`);
    const allCommands = commandRes.rows;

    // Compute real metrics from workflow data
    const completedWorkflows = allWorkflows.filter(w => (w.progress || 0) === 100);
    const activeWorkflows = allWorkflows.filter(w => w.status === 'active');

    // Average completion time: diff between createdAt and updatedAt for completed workflows
    let averageCompletionTime = 'N/A';
    if (completedWorkflows.length > 0) {
      const totalDays = completedWorkflows.reduce((sum, w) => {
        const created = new Date(w.createdAt).getTime();
        const updated = new Date(w.updatedAt).getTime();
        return sum + (updated - created) / (1000 * 60 * 60 * 24);
      }, 0);
      const avgDays = totalDays / completedWorkflows.length;
      if (avgDays < 7) {
        averageCompletionTime = `${Math.round(avgDays)} days`;
      } else {
        averageCompletionTime = `${(avgDays / 7).toFixed(1)} weeks`;
      }
    }

    // On-time delivery: completed workflows that finished before their endDate
    let onTimeDeliveryRate = 0;
    const completedWithEndDate = completedWorkflows.filter(w => w.endDate);
    if (completedWithEndDate.length > 0) {
      const onTime = completedWithEndDate.filter(w => {
        const finished = new Date(w.updatedAt).getTime();
        const deadline = new Date(w.endDate!).getTime();
        return finished <= deadline;
      }).length;
      onTimeDeliveryRate = Math.round((onTime / completedWithEndDate.length) * 100);
    }

    // Success rate: completed / total
    const successRate = allWorkflows.length > 0
      ? Math.round((completedWorkflows.length / allWorkflows.length) * 100)
      : 0;

    // AI command metrics from actual data
    const completedCommands = allCommands.filter((c: any) => c.status === 'completed').length;
    const commandSuccessRate = allCommands.length > 0
      ? Math.round((completedCommands / allCommands.length) * 100)
      : 0;

    // Most used command from actual data
    const commandCounts: Record<string, number> = {};
    for (const cmd of allCommands as any[]) {
      if (cmd.command) {
        commandCounts[cmd.command] = (commandCounts[cmd.command] || 0) + 1;
      }
    }
    const mostUsedCommand = Object.keys(commandCounts).length > 0
      ? Object.entries(commandCounts).sort(([, a], [, b]) => b - a)[0][0]
      : 'N/A';

    const analytics = {
      workflows: {
        total: allWorkflows.length,
        active: activeWorkflows.length,
        completed: completedWorkflows.length,
        averageProgress:
          allWorkflows.length > 0
            ? Math.round(
                allWorkflows.reduce((sum, w) => sum + (w.progress || 0), 0) / allWorkflows.length
              )
            : 0,
        averageCompletionTime,
        onTimeDeliveryRate,
        successRate,
      },
      aiCommands: {
        total: allCommands.length,
        successRate: commandSuccessRate,
        mostUsedCommand,
        categoryCounts: {
          Analytical: allCommands.filter((c: any) => c.category === 'Analytical').length,
          Stability: allCommands.filter((c: any) => c.category === 'Stability').length,
          QbD: allCommands.filter((c: any) => c.category === 'QbD').length,
          Packaging: allCommands.filter((c: any) => c.category === 'Packaging').length,
          Impurities: allCommands.filter((c: any) => c.category === 'Impurities').length,
        },
      },
      insights: [],
    };

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Operation failed',
    });
  }
});

/**
 * @route GET /api/cmc/templates
 * @description Get available workflow templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = Object.values(WORKFLOW_TEMPLATES);

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Operation failed',
    });
  }
});

export default router;
