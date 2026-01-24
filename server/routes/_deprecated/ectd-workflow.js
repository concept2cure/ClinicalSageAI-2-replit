const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// eCTD Module Dependency Configuration
const MODULE_DEPENDENCIES = {
  module_2: {
    depends_on: ['module_5'],
    sections: {
      2.1: { depends_on: [], description: 'Table of Contents' },
      2.2: { depends_on: [], description: 'Introduction' },
      2.3: { depends_on: ['module_3'], description: 'Quality Overall Summary (QoS)' },
      2.4: { depends_on: ['module_4'], description: 'Nonclinical Overall Summary' },
      2.5: { depends_on: ['module_5'], description: 'Clinical Overall Summary' },
      2.6: { depends_on: ['module_4'], description: 'Nonclinical Written and Tabulated Summaries' },
      '2.6.1': { depends_on: ['module_4'], description: 'Introduction' },
      '2.6.2': { depends_on: ['module_4'], description: 'Pharmacology' },
      '2.6.3': { depends_on: ['module_4'], description: 'Pharmacokinetics' },
      '2.6.4': { depends_on: ['module_4'], description: 'Toxicology' },
      '2.6.5': { depends_on: ['module_4'], description: 'Integrated Summary and Risk Assessment' },
      '2.6.6': { depends_on: ['module_4'], description: 'Other Studies' },
    },
  },
  module_3: {
    depends_on: [],
    description: 'Quality (Chemistry, Manufacturing, and Controls)',
  },
  module_4: {
    depends_on: [],
    description: 'Nonclinical Study Reports',
  },
  module_5: {
    depends_on: ['module_4'],
    description: 'Clinical Study Reports',
  },
};

// Workflow state tracking
let workflowStates = new Map();

// Create eCTD workflow with dependencies
router.post('/create-workflow', async (req, res) => {
  try {
    const { workflowId, submissionType, therapeuticArea, indication, targetModules } = req.body;

    if (!workflowId || !submissionType || !targetModules) {
      return res.status(400).json({
        success: false,
        error: 'Workflow ID, submission type, and target modules are required',
      });
    }

    // Initialize workflow state
    const workflow = {
      id: workflowId,
      submissionType,
      therapeuticArea,
      indication,
      targetModules,
      moduleStatus: {},
      dependencies: {},
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    // Calculate dependencies for target modules
    targetModules.forEach(moduleId => {
      workflow.moduleStatus[moduleId] = 'pending';
      workflow.dependencies[moduleId] = MODULE_DEPENDENCIES[moduleId] || { depends_on: [] };
    });

    workflowStates.set(workflowId, workflow);

    res.json({
      success: true,
      workflow,
      dependencyGraph: calculateDependencyOrder(targetModules),
      nextActions: getNextAvailableActions(workflow),
    });
  } catch (error) {
    console.error('Error creating eCTD workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create workflow',
    });
  }
});

// Start module draft with dependency validation
router.post('/start-module-draft', async (req, res) => {
  try {
    const {
      workflowId,
      moduleId,
      sectionId = null,
      draftType = 'initial', // 'initial' or 'revision'
    } = req.body;

    const workflow = workflowStates.get(workflowId);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    // Validate dependencies
    const dependencyValidation = validateModuleDependencies(workflow, moduleId, sectionId);
    if (!dependencyValidation.canProceed) {
      return res.status(400).json({
        success: false,
        error: 'Dependencies not met',
        missingDependencies: dependencyValidation.missing,
        blockedBy: dependencyValidation.blockedBy,
      });
    }

    // Generate AI-powered draft
    const draftContent = await generateModuleDraft(
      workflow,
      moduleId,
      sectionId,
      draftType,
      dependencyValidation.availableData
    );

    // Update workflow status
    const statusKey = sectionId ? `${moduleId}.${sectionId}` : moduleId;
    workflow.moduleStatus[statusKey] =
      draftType === 'initial' ? 'draft_created' : 'revision_created';
    workflow.lastUpdated = new Date().toISOString();

    // Store draft
    if (!workflow.drafts) workflow.drafts = {};
    workflow.drafts[statusKey] = {
      content: draftContent,
      type: draftType,
      createdAt: new Date().toISOString(),
      dependencies: dependencyValidation.usedDependencies,
    };

    res.json({
      success: true,
      draft: {
        moduleId,
        sectionId,
        content: draftContent,
        type: draftType,
        dependencies: dependencyValidation.usedDependencies,
      },
      workflow: {
        status: workflow.moduleStatus,
        nextActions: getNextAvailableActions(workflow),
      },
    });
  } catch (error) {
    console.error('Error starting module draft:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start module draft',
    });
  }
});

// Complete module and trigger dependent updates
router.post('/complete-module', async (req, res) => {
  try {
    const { workflowId, moduleId, sectionId = null } = req.body;

    const workflow = workflowStates.get(workflowId);
    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    const statusKey = sectionId ? `${moduleId}.${sectionId}` : moduleId;
    workflow.moduleStatus[statusKey] = 'completed';
    workflow.lastUpdated = new Date().toISOString();

    // Find dependent modules that can now proceed
    const dependentModules = findDependentModules(workflow, moduleId);
    const triggerUpdates = [];

    for (const depModule of dependentModules) {
      const validation = validateModuleDependencies(
        workflow,
        depModule.moduleId,
        depModule.sectionId
      );
      if (validation.canProceed && workflow.moduleStatus[depModule.key] === 'draft_created') {
        // Trigger revision for dependent modules
        triggerUpdates.push({
          moduleId: depModule.moduleId,
          sectionId: depModule.sectionId,
          action: 'revision_needed',
          reason: `${moduleId} completed with new data`,
        });
      }
    }

    res.json({
      success: true,
      completedModule: statusKey,
      triggeredUpdates: triggerUpdates,
      workflow: {
        status: workflow.moduleStatus,
        nextActions: getNextAvailableActions(workflow),
      },
    });
  } catch (error) {
    console.error('Error completing module:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete module',
    });
  }
});

// Get workflow status and next actions
router.get('/workflow/:workflowId/status', (req, res) => {
  try {
    const { workflowId } = req.params;
    const workflow = workflowStates.get(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
      });
    }

    res.json({
      success: true,
      workflow: {
        ...workflow,
        nextActions: getNextAvailableActions(workflow),
        dependencyGraph: calculateDependencyOrder(workflow.targetModules),
        progress: calculateWorkflowProgress(workflow),
      },
    });
  } catch (error) {
    console.error('Error getting workflow status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow status',
    });
  }
});

// Helper Functions

function validateModuleDependencies(workflow, moduleId, sectionId = null) {
  const dependencies = sectionId
    ? MODULE_DEPENDENCIES[moduleId]?.sections?.[sectionId]?.depends_on || []
    : MODULE_DEPENDENCIES[moduleId]?.depends_on || [];

  const missing = [];
  const available = [];
  const usedDependencies = [];

  dependencies.forEach(depModuleId => {
    const depStatus = workflow.moduleStatus[depModuleId];
    if (depStatus === 'completed') {
      available.push(depModuleId);
      usedDependencies.push({
        moduleId: depModuleId,
        data: workflow.drafts?.[depModuleId]?.content || null,
      });
    } else {
      missing.push(depModuleId);
    }
  });

  return {
    canProceed: missing.length === 0,
    missing,
    blockedBy: missing,
    availableData: available,
    usedDependencies,
  };
}

function findDependentModules(workflow, completedModuleId) {
  const dependents = [];

  // Check direct module dependencies
  Object.keys(MODULE_DEPENDENCIES).forEach(moduleId => {
    if (MODULE_DEPENDENCIES[moduleId].depends_on?.includes(completedModuleId)) {
      dependents.push({
        moduleId,
        sectionId: null,
        key: moduleId,
      });
    }

    // Check section dependencies
    const sections = MODULE_DEPENDENCIES[moduleId].sections || {};
    Object.keys(sections).forEach(sectionId => {
      if (sections[sectionId].depends_on?.includes(completedModuleId)) {
        dependents.push({
          moduleId,
          sectionId,
          key: `${moduleId}.${sectionId}`,
        });
      }
    });
  });

  return dependents;
}

function getNextAvailableActions(workflow) {
  const actions = [];

  workflow.targetModules.forEach(moduleId => {
    const moduleStatus = workflow.moduleStatus[moduleId];

    if (moduleStatus === 'pending') {
      const validation = validateModuleDependencies(workflow, moduleId);
      if (validation.canProceed) {
        actions.push({
          type: 'start_initial_draft',
          moduleId,
          description: `Start initial draft of ${moduleId}`,
          priority: 'high',
        });
      } else {
        actions.push({
          type: 'blocked',
          moduleId,
          description: `${moduleId} blocked by: ${validation.missing.join(', ')}`,
          priority: 'low',
        });
      }
    }

    // Check sections for Module 2
    if (moduleId === 'module_2' && MODULE_DEPENDENCIES.module_2.sections) {
      Object.keys(MODULE_DEPENDENCIES.module_2.sections).forEach(sectionId => {
        const sectionKey = `${moduleId}.${sectionId}`;
        const sectionStatus = workflow.moduleStatus[sectionKey];

        if (!sectionStatus || sectionStatus === 'pending') {
          const validation = validateModuleDependencies(workflow, moduleId, sectionId);
          if (validation.canProceed) {
            actions.push({
              type: 'start_section_draft',
              moduleId,
              sectionId,
              description: `Start draft of ${sectionId}: ${MODULE_DEPENDENCIES.module_2.sections[sectionId].description}`,
              priority: sectionId.startsWith('2.6') ? 'medium' : 'high',
            });
          }
        }
      });
    }
  });

  return actions.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

function calculateDependencyOrder(targetModules) {
  const graph = {};
  const visited = new Set();
  const order = [];

  // Build dependency graph
  targetModules.forEach(moduleId => {
    graph[moduleId] = MODULE_DEPENDENCIES[moduleId]?.depends_on || [];
  });

  // Topological sort
  function visit(moduleId) {
    if (visited.has(moduleId)) return;
    visited.add(moduleId);

    (graph[moduleId] || []).forEach(dep => {
      if (targetModules.includes(dep)) {
        visit(dep);
      }
    });

    order.push(moduleId);
  }

  targetModules.forEach(visit);
  return order;
}

function calculateWorkflowProgress(workflow) {
  const total = workflow.targetModules.length;
  const completed = workflow.targetModules.filter(
    moduleId => workflow.moduleStatus[moduleId] === 'completed'
  ).length;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
  };
}

async function generateModuleDraft(workflow, moduleId, sectionId, draftType, availableData) {
  const isRevision = draftType === 'revision';
  const sectionInfo = sectionId
    ? MODULE_DEPENDENCIES[moduleId]?.sections?.[sectionId]
    : MODULE_DEPENDENCIES[moduleId];

  const dependencyData = availableData
    .map(depId => {
      const depDraft = workflow.drafts?.[depId];
      return depDraft ? `${depId} Data:\n${depDraft.content}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  const prompt = `Generate ${isRevision ? 'a revised' : 'an initial'} draft for eCTD ${moduleId}${sectionId ? `.${sectionId}` : ''}.

SUBMISSION DETAILS:
- Type: ${workflow.submissionType}
- Therapeutic Area: ${workflow.therapeuticArea}
- Indication: ${workflow.indication}

MODULE INFORMATION:
- Module: ${moduleId}${sectionId ? `.${sectionId}` : ''}
- Description: ${sectionInfo?.description}
- Draft Type: ${draftType}

${
  dependencyData
    ? `DEPENDENCY DATA AVAILABLE:
${dependencyData}

Use the above dependency data to inform your draft. ${isRevision ? 'Revise the previous content based on this new information.' : 'Create initial content that can be refined once dependencies are complete.'}`
    : ''
}

${
  moduleId === 'module_2'
    ? `
For Module 2 sections:
- Section 2.5 (Clinical Overall Summary): Must integrate data from Module 5 (Clinical Study Reports)
- Sections 2.6-2.6.6 (Nonclinical Summaries): Must integrate data from Module 4 (Nonclinical Study Reports)
- Include placeholders for missing dependency data if this is an initial draft
`
    : ''
}

Generate a comprehensive, ICH-compliant document draft that follows regulatory standards and includes:
1. Proper regulatory structure and formatting
2. Integration of available dependency data
3. ${isRevision ? 'Updates based on new dependency information' : 'Placeholders for pending dependency data'}
4. Compliance with ICH M4 guidelines

Return only the document content without meta-commentary.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory affairs expert specializing in eCTD document preparation. Generate comprehensive, ICH-compliant regulatory documents that properly integrate dependency data and follow established regulatory standards.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating module draft:', error);
    return `[Error generating draft for ${moduleId}${sectionId ? `.${sectionId}` : ''}. Please try again.]`;
  }
}

module.exports = router;
