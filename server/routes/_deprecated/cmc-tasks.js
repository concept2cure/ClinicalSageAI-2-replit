import express from 'express';
const router = express.Router();

// AI-powered task management endpoints for CMC processes

// Task suggestions based on process stage and AI analysis
router.post('/ai/task-suggestions', async (req, res) => {
  try {
    const { processId, stage, existingTasks } = req.body;

    // Intelligent task suggestions based on process stage
    const stageBasedSuggestions = {
      development: [
        {
          id: `ai-${Date.now()}-001`,
          title: 'Design Characterization Studies',
          description:
            'Establish analytical methods for critical quality attributes (CQAs) and critical process parameters (CPPs) to support process understanding and control strategy development.',
          priority: 'high',
          estimatedHours: 40,
          assignmentSuggestion: 'Analytical Method Specialist',
          regulatoryRequirement: true,
          tags: ['CQA', 'CPP', 'Method Development', 'ICH Q8'],
          aiRationale:
            'Essential for establishing process understanding per ICH Q8. Critical quality attributes must be defined early to guide development activities and ensure product quality.',
          aiConfidence: 95,
          businessImpact: 'high',
          regulatoryStandards: ['ICH Q8', 'ICH Q2'],
        },
        {
          id: `ai-${Date.now()}-002`,
          title: 'Process Risk Assessment (FMEA)',
          description:
            'Conduct comprehensive Failure Mode and Effects Analysis to identify potential failure modes, assess risks, and establish appropriate control strategies.',
          priority: 'high',
          estimatedHours: 24,
          assignmentSuggestion: 'Quality Assurance Lead',
          regulatoryRequirement: true,
          tags: ['FMEA', 'Risk Assessment', 'ICH Q9', 'Control Strategy'],
          aiRationale:
            'Required for establishing robust control strategy per ICH Q9. Risk assessment identifies critical process steps and informs control strategy development.',
          aiConfidence: 92,
          businessImpact: 'high',
          regulatoryStandards: ['ICH Q9', 'ICH Q10'],
        },
        {
          id: `ai-${Date.now()}-003`,
          title: 'Design Space Definition',
          description:
            'Define multidimensional combination and interaction of input variables and process parameters that have been demonstrated to provide assurance of quality.',
          priority: 'medium',
          estimatedHours: 32,
          assignmentSuggestion: 'Formulation Scientist',
          regulatoryRequirement: true,
          tags: ['Design Space', 'DoE', 'Process Understanding'],
          aiRationale:
            'Enables enhanced regulatory flexibility and supports continuous improvement within approved design space boundaries.',
          aiConfidence: 88,
          businessImpact: 'medium',
          regulatoryStandards: ['ICH Q8'],
        },
      ],
      validation: [
        {
          id: `ai-${Date.now()}-004`,
          title: 'Process Performance Qualification Protocol',
          description:
            'Develop comprehensive PPQ protocol including acceptance criteria, sampling plans, and statistical evaluation methods to demonstrate process capability.',
          priority: 'urgent',
          estimatedHours: 32,
          assignmentSuggestion: 'Regulatory Affairs Manager',
          regulatoryRequirement: true,
          tags: ['PPQ', 'Protocol', 'Validation', 'Statistics'],
          aiRationale:
            'Critical for demonstrating process capability before commercial manufacturing. PPQ must prove the process consistently produces product meeting specifications.',
          aiConfidence: 97,
          businessImpact: 'critical',
          regulatoryStandards: ['FDA Guidance', 'EMA Guideline'],
        },
        {
          id: `ai-${Date.now()}-005`,
          title: 'Cleaning Validation Protocol',
          description:
            'Develop and execute cleaning validation protocols to demonstrate effective removal of product residues, cleaning agents, and potential contaminants.',
          priority: 'high',
          estimatedHours: 28,
          assignmentSuggestion: 'Quality Assurance Lead',
          regulatoryRequirement: true,
          tags: ['Cleaning Validation', 'Cross-contamination', 'Residue Limits'],
          aiRationale:
            'Essential for multi-product facilities to prevent cross-contamination and ensure patient safety.',
          aiConfidence: 90,
          businessImpact: 'high',
          regulatoryStandards: ['FDA Guidance', '21 CFR 211'],
        },
      ],
      commercial: [
        {
          id: `ai-${Date.now()}-006`,
          title: 'Continued Process Verification Plan',
          description:
            'Establish comprehensive CPV plan for ongoing process monitoring, control, and continuous improvement throughout commercial manufacturing.',
          priority: 'medium',
          estimatedHours: 16,
          assignmentSuggestion: 'Quality Assurance Lead',
          regulatoryRequirement: true,
          tags: ['CPV', 'Monitoring', 'ICH Q10', 'Continuous Improvement'],
          aiRationale:
            'Ensures ongoing process control per ICH Q10. CPV maintains process understanding and identifies optimization opportunities.',
          aiConfidence: 85,
          businessImpact: 'medium',
          regulatoryStandards: ['ICH Q10', 'FDA Guidance'],
        },
        {
          id: `ai-${Date.now()}-007`,
          title: 'Annual Product Review Template',
          description:
            'Develop comprehensive APR template covering manufacturing performance, quality issues, returns, and continuous improvement initiatives.',
          priority: 'low',
          estimatedHours: 12,
          assignmentSuggestion: 'Regulatory Affairs Manager',
          regulatoryRequirement: true,
          tags: ['APR', 'Regulatory Reporting', 'Quality Review'],
          aiRationale:
            'Required for annual regulatory reporting and demonstrates ongoing product and process monitoring.',
          aiConfidence: 80,
          businessImpact: 'low',
          regulatoryStandards: ['21 CFR 211', 'ICH Q10'],
        },
      ],
    };

    // Filter out tasks that already exist
    const existingTaskTitles = existingTasks.map(t => t.title.toLowerCase());
    const suggestions = stageBasedSuggestions[stage] || stageBasedSuggestions.development;
    const filteredSuggestions = suggestions.filter(
      suggestion => !existingTaskTitles.includes(suggestion.title.toLowerCase())
    );

    res.json({
      success: true,
      tasks: filteredSuggestions,
      processId,
      stage,
      generatedAt: new Date().toISOString(),
      aiEngine: 'CMC Process Intelligence',
      confidence: 'high',
    });
  } catch (error) {
    console.error('Error generating AI task suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate task suggestions',
      details: error.message,
    });
  }
});

// Create task from AI suggestion
router.post('/tasks', async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      estimatedHours,
      regulatoryRequirement,
      tags,
      processId,
      aiGenerated,
      aiRationale,
      assignee,
    } = req.body;

    const newTask = {
      id: `task-${Date.now()}`,
      title,
      description,
      priority,
      status: 'not_started',
      createdBy: aiGenerated ? 'AI Assistant' : 'User',
      assignee: assignee || '',
      assignedDate: new Date().toISOString(),
      deadline: '', // Will be set by user
      completionPercentage: 0,
      estimatedHours: estimatedHours || 0,
      hoursLogged: 0,
      documents: [],
      workflowId: processId,
      workflowName: 'AI Generated Workflow',
      regulatoryRequirement: regulatoryRequirement || false,
      regulatoryStandards: [],
      comments: [],
      history: [
        {
          action: 'Task Created',
          timestamp: new Date().toISOString(),
          user: aiGenerated ? 'AI Assistant' : 'User',
          details: aiGenerated
            ? `Generated from AI suggestion: ${aiRationale}`
            : 'User created task',
        },
      ],
      tags: tags || [],
      aiGenerated: aiGenerated || false,
      aiRationale: aiRationale || '',
    };

    res.json({
      success: true,
      task: newTask,
      message: 'Task created successfully',
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
      details: error.message,
    });
  }
});

// Assign task to team member
router.post('/tasks/:taskId/assign', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { assigneeId, processId } = req.body;

    // In a real implementation, this would update the database
    // For now, return success with updated task structure
    const updatedTask = {
      id: taskId,
      assignee: assigneeId,
      assignedDate: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      updatedBy: 'System',
    };

    res.json({
      success: true,
      task: updatedTask,
      message: 'Task assigned successfully',
    });
  } catch (error) {
    console.error('Error assigning task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign task',
      details: error.message,
    });
  }
});

// Update task status
router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, processId } = req.body;

    // In a real implementation, this would update the database
    const updatedTask = {
      id: taskId,
      status,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'System',
      completionPercentage: status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0,
    };

    res.json({
      success: true,
      task: updatedTask,
      message: `Task status updated to ${status}`,
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task status',
      details: error.message,
    });
  }
});

// Get task analytics and insights
router.get('/tasks/analytics', async (req, res) => {
  try {
    const { processId, timeframe = '30d' } = req.query;

    const analytics = {
      totalTasks: 12,
      completedTasks: 8,
      overdueTasks: 2,
      avgCompletionTime: 5.2,
      productivityScore: 85,
      topPerformers: [
        { name: 'Sarah Johnson', tasksCompleted: 15, avgTime: 4.8 },
        { name: 'Michael Chen', tasksCompleted: 12, avgTime: 5.1 },
      ],
      riskFactors: ['High workload on regulatory team', 'Potential delay in method validation'],
      recommendations: [
        'Consider redistributing validation tasks',
        'Schedule additional review meetings for critical milestones',
      ],
    };

    res.json({
      success: true,
      analytics,
      timeframe,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating task analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analytics',
      details: error.message,
    });
  }
});

export default router;
