import { Router, Request, Response } from 'express';
import { pool } from '../../db.js';
import OpenAI from 'openai';

const router = Router();

// Type definitions
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  estimatedTime: string;
  tasks: number;
  priority: string;
  steps: string[];
}

interface TaskTemplate {
  name: string;
  order: number;
  estimatedHours: number;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== CMC PLAYBOOK WORKFLOWS =====

// Get all available workflows
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Get workflows from database or return default templates
    const query = `
      SELECT * FROM cmc_workflows 
      WHERE organization_id = $1 OR organization_id = 0
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [organizationId]);

    // If no workflows exist, return default templates
    if (result.rows.length === 0) {
      const defaultWorkflows = [
        {
          id: 'ind-cmc-template',
          name: 'IND CMC Package',
          description: 'Complete Chemistry, Manufacturing, and Controls package for IND submission',
          category: 'submission',
          estimatedTime: '4-6 weeks',
          tasks: 6,
          priority: 'high',
          steps: [
            'Drug Substance Characterization',
            'Manufacturing Process',
            'Container Closure',
            'Stability Protocol',
            'Analytical Methods',
            'Quality Specifications',
          ],
        },
        {
          id: 'nda-cmc-template',
          name: 'NDA/BLA CMC Module 3',
          description: 'Comprehensive Module 3 Quality section for NDA/BLA submission',
          category: 'submission',
          estimatedTime: '12-16 weeks',
          tasks: 24,
          priority: 'critical',
          steps: [
            '3.2.S Drug Substance',
            '3.2.P Drug Product',
            '3.2.A Appendices',
            'Regional Requirements',
          ],
        },
      ];

      return res.json({ success: true, data: defaultWorkflows });
    }

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// Start a new workflow
router.post('/workflows/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { organizationId, projectName, assignedTeam = [] } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Create workflow instance in database
    const insertQuery = `
      INSERT INTO cmc_workflow_instances (
        id, template_id, organization_id, project_name, 
        assigned_team, status, progress, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;

    const workflowInstanceId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await pool.query(insertQuery, [
      workflowInstanceId,
      id,
      organizationId,
      projectName || `Workflow ${id}`,
      JSON.stringify(assignedTeam),
      'active',
      0,
    ]);

    // Create initial tasks for the workflow
    await createWorkflowTasks(workflowInstanceId, id);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Workflow started successfully',
    });
  } catch (error) {
    console.error('Error starting workflow:', error);
    res.status(500).json({ error: 'Failed to start workflow' });
  }
});

// ===== AI-POWERED CMC TOOLS =====

// Execute AI tool
router.post('/ai-tools/execute', async (req: Request, res: Response) => {
  try {
    const { command, organizationId, drugName, additionalContext = {} } = req.body;

    if (!command || !organizationId) {
      return res.status(400).json({ error: 'Command and organization ID required' });
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Log the AI tool execution
    const logQuery = `
      INSERT INTO cmc_ai_tool_executions (
        id, organization_id, command, drug_name, context, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;

    const executionId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(logQuery, [
      executionId,
      organizationId,
      command,
      drugName || 'Unknown',
      JSON.stringify(additionalContext),
      'running',
    ]);

    // Execute the AI tool based on command
    let result = await executeAITool(command, drugName, additionalContext);

    // Update execution status
    await pool.query(
      'UPDATE cmc_ai_tool_executions SET status = $1, result = $2, completed_at = NOW() WHERE id = $3',
      ['completed', JSON.stringify(result), executionId]
    );

    res.json({
      success: true,
      data: result,
      executionId: executionId,
      message: `${command} completed successfully`,
    });
  } catch (error) {
    console.error('Error executing AI tool:', error);
    res.status(500).json({ error: 'Failed to execute AI tool' });
  }
});

// ===== CMC CHECKLISTS =====

// Get checklist templates
router.get('/checklists', async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    const checklists = [
      {
        id: 'module-3-2-s',
        name: 'Module 3.2.S Drug Substance',
        category: 'CTD',
        totalItems: 7,
        description: 'ICH CTD Module 3.2.S compliance checklist',
      },
      {
        id: 'module-3-2-p',
        name: 'Module 3.2.P Drug Product',
        category: 'CTD',
        totalItems: 8,
        description: 'ICH CTD Module 3.2.P compliance checklist',
      },
      {
        id: 'process-validation',
        name: 'Process Validation Checklist',
        category: 'Validation',
        totalItems: 8,
        description: 'FDA Process Validation guidance compliance',
      },
    ];

    const filteredChecklists = category
      ? checklists.filter(c => c.category === category)
      : checklists;

    res.json({ success: true, data: filteredChecklists });
  } catch (error) {
    console.error('Error fetching checklists:', error);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

// Create checklist instance
router.post('/checklists/:id/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { organizationId, projectName } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const instanceId = `checklist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const insertQuery = `
      INSERT INTO cmc_checklist_instances (
        id, template_id, organization_id, project_name, 
        status, progress, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      instanceId,
      id,
      organizationId,
      projectName || `Checklist ${id}`,
      'active',
      0,
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Checklist created successfully',
    });
  } catch (error) {
    console.error('Error creating checklist:', error);
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});

// ===== REGULATORY GUIDELINES =====

// Get regulatory guidelines
router.get('/guidelines', async (req: Request, res: Response) => {
  try {
    const { region, category } = req.query;

    const guidelines = [
      {
        id: 'ich-m4q',
        name: 'ICH M4Q Quality',
        category: 'CTD',
        region: 'Global',
        description: 'Common Technical Document for the Registration of Pharmaceuticals',
        url: 'https://database.ich.org/sites/default/files/M4Q%28R1%29%20Guideline.pdf',
      },
      {
        id: 'ich-q2-r1',
        name: 'ICH Q2(R1) Validation',
        category: 'Analytical',
        region: 'Global',
        description: 'Validation of Analytical Procedures: Text and Methodology',
        url: 'https://database.ich.org/sites/default/files/Q2%28R1%29%20Guideline.pdf',
      },
      {
        id: 'fda-process-validation',
        name: 'FDA Process Validation',
        category: 'Manufacturing',
        region: 'FDA',
        description: 'Process Validation: General Principles and Practices',
        url: 'https://www.fda.gov/media/71021/download',
      },
    ];

    let filteredGuidelines = guidelines;

    if (region) {
      filteredGuidelines = filteredGuidelines.filter(
        g => g.region === region || g.region === 'Global'
      );
    }

    if (category) {
      filteredGuidelines = filteredGuidelines.filter(g => g.category === category);
    }

    res.json({ success: true, data: filteredGuidelines });
  } catch (error) {
    console.error('Error fetching guidelines:', error);
    res.status(500).json({ error: 'Failed to fetch guidelines' });
  }
});

// ===== HELPER FUNCTIONS =====

async function createWorkflowTasks(workflowInstanceId: string, templateId: string): Promise<void> {
  if (!pool) {
    throw new Error('Database connection not available');
  }

  // Define tasks based on template
  const taskTemplates: { [key: string]: TaskTemplate[] } = {
    'ind-cmc-template': [
      { name: 'Drug Substance Characterization', order: 1, estimatedHours: 40 },
      { name: 'Manufacturing Process Documentation', order: 2, estimatedHours: 32 },
      { name: 'Container Closure System', order: 3, estimatedHours: 16 },
      { name: 'Stability Protocol Development', order: 4, estimatedHours: 24 },
      { name: 'Analytical Methods', order: 5, estimatedHours: 40 },
      { name: 'Quality Specifications', order: 6, estimatedHours: 16 },
    ],
    'nda-cmc-template': [
      { name: '3.2.S Drug Substance', order: 1, estimatedHours: 80 },
      { name: '3.2.P Drug Product', order: 2, estimatedHours: 80 },
      { name: '3.2.A Appendices', order: 3, estimatedHours: 40 },
      { name: 'Regional Requirements', order: 4, estimatedHours: 24 },
    ],
  };

  const tasks = taskTemplates[templateId] || taskTemplates['ind-cmc-template'];

  for (const task of tasks) {
    await pool.query(
      `
      INSERT INTO cmc_workflow_tasks (
        id, workflow_instance_id, name, task_order, estimated_hours, 
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `,
      [
        `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workflowInstanceId,
        task.name,
        task.order,
        task.estimatedHours,
        'pending',
      ]
    );
  }
}

async function executeAITool(command: string, drugName: string, context: any): Promise<any> {
  try {
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert pharmaceutical regulatory affairs specialist with deep expertise in CMC development and ICH guidelines. Provide detailed, scientifically accurate, and regulatory-compliant guidance. Format your response as structured data that can be used in pharmaceutical workflows.',
        },
        {
          role: 'user',
          content: generateAIPrompt(command, drugName, context),
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const result = completion.choices[0].message.content;

    return {
      command: command,
      drugName: drugName,
      result: result,
      generatedAt: new Date().toISOString(),
      status: 'completed',
    };
  } catch (error) {
    console.error('AI tool execution error:', error);
    return {
      command: command,
      drugName: drugName,
      result: generateFallbackResult(command, drugName),
      generatedAt: new Date().toISOString(),
      status: 'fallback',
    };
  }
}

function generateAIPrompt(command: string, drugName: string, context: any): string {
  const prompts: { [key: string]: string } = {
    'Generate analytical method summary': `Create a comprehensive analytical method validation summary for ${drugName}. Include method overview, validation parameters (specificity, linearity, accuracy, precision, range, robustness), system suitability criteria, and regulatory compliance notes per ICH Q2(R1).`,

    'Update stability protocol for biologics': `Design an updated stability protocol for the biologic drug ${drugName} following ICH Q5C guidelines. Include study design, storage conditions, time points, test parameters, and acceptance criteria.`,

    'Check nitrosamine risk assessment': `Perform a nitrosamine impurity risk assessment for ${drugName} according to ICH M7(R1) guidelines. Include risk evaluation, control measures, and testing strategies.`,

    'Generate QbD control strategy': `Develop a Quality by Design control strategy for ${drugName} following ICH Q8(R2). Include critical quality attributes, critical process parameters, and control mechanisms.`,

    'Validate container closure system': `Create a container closure system validation protocol for ${drugName} per USP <1207>. Include integrity testing methods, extractables/leachables assessment, and compatibility studies.`,

    'Create dissolution method': `Develop a biorelevant dissolution method for ${drugName}. Include media selection, apparatus selection, conditions optimization, and IVIVC considerations.`,
  };

  return prompts[command] || `Provide regulatory guidance for ${command} related to ${drugName}.`;
}

function generateFallbackResult(command: string, drugName: string): string {
  return `Regulatory guidance for ${command} related to ${drugName} - AI service temporarily unavailable. Please consult ICH guidelines and regulatory requirements manually.`;
}

export default router;
