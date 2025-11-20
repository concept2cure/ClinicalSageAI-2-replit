import { apiRequest } from '@/lib/queryClient';

// Task Management Service
// Central service for task operations across all modules
class TaskManagementService {
  constructor() {
    this.baseUrl = '/api/task-management';
    this.listeners = new Set();
    this.taskCache = new Map();
  }

  // Create a single task
  async createTask(taskData, moduleContext = {}) {
    const enrichedData = {
      ...taskData,
      moduleSource: moduleContext.module || 'general',
      moduleData: moduleContext.data || {},
      createdAt: new Date().toISOString(),
      // AI-powered duration estimation (mock for now, integrate with AI service later)
      estimatedDurationAI: this.estimateTaskDuration(taskData),
      // Risk scoring
      riskScore: this.calculateRiskScore(taskData),
      // Workload scoring
      workloadScore: this.calculateWorkloadScore(taskData),
    };

    const response = await apiRequest(`${this.baseUrl}/tasks`, 'POST', enrichedData);
    this.notifyListeners('task-created', response.data);
    return response.data;
  }

  // Create multiple tasks at once
  async createBulkTasks(tasks, options = { linkDependencies: true }) {
    const response = await apiRequest(`${this.baseUrl}/tasks/bulk-create`, 'POST', {
      tasks,
      ...options
    });
    this.notifyListeners('bulk-tasks-created', response.data);
    return response.data;
  }

  // Create tasks from a template
  async createFromTemplate(templateId, projectData) {
    const response = await apiRequest(
      `${this.baseUrl}/tasks/from-template/${templateId}`,
      'POST',
      projectData
    );
    this.notifyListeners('tasks-created-from-template', response.data);
    return response.data;
  }

  // Module-specific task creation methods
  async createECTDTask(documentData, taskType) {
    const taskConfig = {
      'document-review': {
        title: `Review ${documentData.title}`,
        description: `Review and approve document: ${documentData.title}`,
        category: 'review',
        priority: documentData.priority || 'medium',
        estimatedHours: 4,
        tags: ['eCTD', 'document', 'review'],
      },
      'document-approval': {
        title: `Approve ${documentData.title}`,
        description: `Final approval required for: ${documentData.title}`,
        category: 'approval',
        priority: 'high',
        estimatedHours: 2,
        tags: ['eCTD', 'document', 'approval'],
      },
      'formatting-check': {
        title: `Format Check: ${documentData.title}`,
        description: `Verify eCTD formatting compliance for: ${documentData.title}`,
        category: 'validation',
        priority: 'medium',
        estimatedHours: 3,
        tags: ['eCTD', 'formatting', 'compliance'],
      },
    };

    const taskData = taskConfig[taskType] || {
      title: `Task for ${documentData.title}`,
      description: `Task related to document: ${documentData.title}`,
      category: 'general',
      priority: 'medium',
      estimatedHours: 4,
    };

    return this.createTask(
      {
        ...taskData,
        moduleType: 'eCTD',
        dueDate: this.calculateDueDate(taskData.estimatedHours),
      },
      {
        module: 'eCTD',
        data: { documentId: documentData.id, documentTitle: documentData.title }
      }
    );
  }

  async createCMCTask(issueData, taskType) {
    const taskConfig = {
      'quality-issue': {
        title: `Resolve Quality Issue: ${issueData.title}`,
        description: `Quality issue detected: ${issueData.description}`,
        category: 'quality',
        priority: issueData.severity === 'critical' ? 'critical' : 'high',
        estimatedHours: 8,
        tags: ['CMC', 'quality', 'issue'],
      },
      'batch-release': {
        title: `Batch Release Review: ${issueData.batchNumber}`,
        description: `Review and approve batch release for: ${issueData.batchNumber}`,
        category: 'approval',
        priority: 'high',
        estimatedHours: 6,
        tags: ['CMC', 'batch', 'release'],
      },
      'stability-review': {
        title: `Stability Data Review: ${issueData.product}`,
        description: `Review stability data for: ${issueData.product}`,
        category: 'analysis',
        priority: 'medium',
        estimatedHours: 12,
        tags: ['CMC', 'stability', 'analysis'],
      },
    };

    const taskData = taskConfig[taskType] || {
      title: `CMC Task: ${issueData.title}`,
      description: issueData.description,
      category: 'general',
      priority: 'medium',
      estimatedHours: 6,
    };

    return this.createTask(
      {
        ...taskData,
        moduleType: 'CMC',
        dueDate: this.calculateDueDate(taskData.estimatedHours),
      },
      {
        module: 'CMC',
        data: issueData
      }
    );
  }

  async createClinicalTask(trialData, taskType) {
    const taskConfig = {
      'protocol-review': {
        title: `Protocol Review: ${trialData.protocolNumber}`,
        description: `Review clinical trial protocol: ${trialData.title}`,
        category: 'review',
        priority: 'high',
        estimatedHours: 16,
        tags: ['Clinical', 'protocol', 'review'],
      },
      'data-analysis': {
        title: `Clinical Data Analysis: ${trialData.studyId}`,
        description: `Analyze clinical trial data for: ${trialData.studyId}`,
        category: 'analysis',
        priority: 'medium',
        estimatedHours: 24,
        tags: ['Clinical', 'data', 'analysis'],
      },
      'safety-assessment': {
        title: `Safety Assessment: ${trialData.studyId}`,
        description: `Conduct safety assessment for: ${trialData.studyId}`,
        category: 'safety',
        priority: 'critical',
        estimatedHours: 12,
        tags: ['Clinical', 'safety', 'assessment'],
      },
    };

    const taskData = taskConfig[taskType] || {
      title: `Clinical Task: ${trialData.title}`,
      description: trialData.description,
      category: 'general',
      priority: 'medium',
      estimatedHours: 8,
    };

    return this.createTask(
      {
        ...taskData,
        moduleType: 'Clinical',
        dueDate: this.calculateDueDate(taskData.estimatedHours),
      },
      {
        module: 'Clinical',
        data: trialData
      }
    );
  }

  // Task automation rules engine
  async applyAutomationRules(event, context) {
    const rules = {
      'document-status-change': async (ctx) => {
        if (ctx.newStatus === 'in-review') {
          await this.createECTDTask(ctx.document, 'document-review');
        } else if (ctx.newStatus === 'ready-for-approval') {
          await this.createECTDTask(ctx.document, 'document-approval');
        }
      },
      'quality-issue-detected': async (ctx) => {
        await this.createCMCTask(ctx.issue, 'quality-issue');
        if (ctx.issue.severity === 'critical') {
          // Create escalation task
          await this.createTask({
            title: `URGENT: Critical Quality Issue - ${ctx.issue.title}`,
            description: `Immediate attention required for critical quality issue`,
            moduleType: 'Quality',
            priority: 'critical',
            estimatedHours: 2,
            dueDate: this.calculateDueDate(2), // 2 hours from now
            escalationPath: ['QA Manager', 'VP Quality', 'CEO'],
          });
        }
      },
      'deadline-approaching': async (ctx) => {
        const daysRemaining = ctx.daysRemaining;
        if (daysRemaining <= 7) {
          await this.createTask({
            title: `Deadline Alert: ${ctx.task.title}`,
            description: `Task deadline in ${daysRemaining} days`,
            moduleType: ctx.task.moduleType,
            priority: 'critical',
            estimatedHours: 1,
            tags: ['deadline', 'reminder'],
          });
        }
      },
      'task-completed': async (ctx) => {
        // Check for follow-up tasks
        const followUpTasks = this.getFollowUpTasks(ctx.task);
        if (followUpTasks.length > 0) {
          await this.createBulkTasks(followUpTasks);
        }
      },
      'risk-identified': async (ctx) => {
        await this.createTask({
          title: `Risk Mitigation: ${ctx.risk.title}`,
          description: `Develop and implement mitigation plan for: ${ctx.risk.description}`,
          moduleType: 'Risk',
          priority: ctx.risk.level === 'high' ? 'critical' : 'high',
          estimatedHours: 16,
          tags: ['risk', 'mitigation'],
        });
      },
    };

    const rule = rules[event];
    if (rule) {
      await rule(context);
    }
  }

  // Task templates for common regulatory milestones
  getTemplateForMilestone(milestone) {
    const templates = {
      'pre-ind-meeting': {
        name: 'Pre-IND Meeting Preparation',
        tasks: [
          { title: 'Compile briefing package', estimatedHours: 40, priority: 'high', dependencies: [] },
          { title: 'Draft meeting agenda', estimatedHours: 8, priority: 'high', dependencies: [] },
          { title: 'Prepare slide deck', estimatedHours: 16, priority: 'medium', dependencies: ['Compile briefing package'] },
          { title: 'Internal review meeting', estimatedHours: 4, priority: 'high', dependencies: ['Draft meeting agenda'] },
          { title: 'Regulatory team alignment', estimatedHours: 4, priority: 'high', dependencies: ['Internal review meeting'] },
          { title: 'Submit briefing package to FDA', estimatedHours: 2, priority: 'critical', dependencies: ['Compile briefing package'] },
          { title: 'Prepare Q&A document', estimatedHours: 12, priority: 'medium', dependencies: ['Draft meeting agenda'] },
          { title: 'Mock meeting rehearsal', estimatedHours: 4, priority: 'medium', dependencies: ['Prepare Q&A document', 'Prepare slide deck'] },
          { title: 'Final team briefing', estimatedHours: 2, priority: 'high', dependencies: ['Mock meeting rehearsal'] },
          { title: 'Meeting logistics coordination', estimatedHours: 6, priority: 'medium', dependencies: [] },
        ]
      },
      'ind-submission': {
        name: 'IND Submission Preparation',
        tasks: [
          { title: 'Complete Module 1 - Administrative', estimatedHours: 24, priority: 'high' },
          { title: 'Complete Module 2 - Summaries', estimatedHours: 80, priority: 'critical' },
          { title: 'Complete Module 3 - Quality', estimatedHours: 120, priority: 'critical' },
          { title: 'Complete Module 4 - Nonclinical', estimatedHours: 100, priority: 'critical' },
          { title: 'Complete Module 5 - Clinical', estimatedHours: 60, priority: 'high' },
          { title: 'Internal QC review', estimatedHours: 40, priority: 'critical' },
          { title: 'Address QC comments', estimatedHours: 24, priority: 'high' },
          { title: 'Final regulatory review', estimatedHours: 16, priority: 'critical' },
          { title: 'Generate eCTD package', estimatedHours: 8, priority: 'critical' },
          { title: 'Submit to FDA', estimatedHours: 4, priority: 'critical' },
        ]
      },
      'nda-submission': {
        name: 'NDA Submission Preparation',
        tasks: [
          { title: 'Compile clinical study reports', estimatedHours: 200, priority: 'critical' },
          { title: 'Prepare integrated summaries', estimatedHours: 160, priority: 'critical' },
          { title: 'Draft labeling', estimatedHours: 40, priority: 'high' },
          { title: 'Complete risk management plan', estimatedHours: 60, priority: 'high' },
          { title: 'Manufacturing documentation', estimatedHours: 80, priority: 'critical' },
          { title: 'Environmental assessment', estimatedHours: 24, priority: 'medium' },
          { title: 'Financial disclosure', estimatedHours: 16, priority: 'high' },
          { title: 'Patent certification', estimatedHours: 8, priority: 'high' },
          { title: 'Pediatric plan', estimatedHours: 32, priority: 'medium' },
          { title: 'Pre-submission meeting', estimatedHours: 8, priority: 'high' },
          { title: 'Internal review cycles', estimatedHours: 120, priority: 'critical' },
          { title: 'eCTD compilation', estimatedHours: 40, priority: 'critical' },
          { title: 'Final QC check', estimatedHours: 40, priority: 'critical' },
          { title: 'Electronic submission', estimatedHours: 8, priority: 'critical' },
        ]
      }
    };

    return templates[milestone] || null;
  }

  // Helper methods
  calculateDueDate(estimatedHours) {
    const now = new Date();
    const workingHoursPerDay = 8;
    const daysToAdd = Math.ceil(estimatedHours / workingHoursPerDay);
    now.setDate(now.getDate() + daysToAdd);
    return now.toISOString();
  }

  estimateTaskDuration(taskData) {
    // Mock AI-powered duration estimation
    // In production, this would call an AI service
    const baseEstimates = {
      review: 4,
      approval: 2,
      analysis: 16,
      documentation: 8,
      meeting: 2,
      validation: 6,
      quality: 12,
      safety: 8,
    };
    
    const category = taskData.category || 'general';
    const baseHours = baseEstimates[category] || 8;
    
    // Adjust based on priority
    const priorityMultiplier = {
      critical: 0.75, // Faster for critical
      high: 0.9,
      medium: 1.0,
      low: 1.2,
    };
    
    return Math.round(baseHours * (priorityMultiplier[taskData.priority] || 1.0));
  }

  calculateRiskScore(taskData) {
    // Calculate risk score (0-100)
    let score = 0;
    
    // Priority impact
    const priorityScores = { critical: 40, high: 30, medium: 20, low: 10 };
    score += priorityScores[taskData.priority] || 20;
    
    // Module impact
    const moduleScores = { 
      Clinical: 30, 
      Quality: 30, 
      CMC: 25, 
      eCTD: 20, 
      Risk: 35,
      general: 15 
    };
    score += moduleScores[taskData.moduleType] || 15;
    
    // Category impact
    const categoryScores = {
      approval: 20,
      safety: 25,
      compliance: 25,
      quality: 20,
      review: 15,
      analysis: 15,
      general: 10,
    };
    score += categoryScores[taskData.category] || 10;
    
    return Math.min(100, score);
  }

  calculateWorkloadScore(taskData) {
    // Calculate workload complexity score (0-100)
    const estimatedHours = taskData.estimatedHours || 8;
    const hourScore = Math.min(50, (estimatedHours / 40) * 50);
    
    const complexityScore = {
      critical: 25,
      high: 20,
      medium: 15,
      low: 10,
    };
    
    return Math.round(hourScore + (complexityScore[taskData.priority] || 15) + Math.random() * 25);
  }

  getFollowUpTasks(completedTask) {
    // Define follow-up task patterns
    const followUpPatterns = {
      'document-review': [
        {
          title: `Archive reviewed document: ${completedTask.title}`,
          category: 'documentation',
          estimatedHours: 1,
          priority: 'low',
        }
      ],
      'quality-issue': [
        {
          title: `Verify resolution: ${completedTask.title}`,
          category: 'validation',
          estimatedHours: 4,
          priority: 'medium',
        },
        {
          title: `Update quality metrics: ${completedTask.title}`,
          category: 'documentation',
          estimatedHours: 2,
          priority: 'low',
        }
      ],
      'protocol-review': [
        {
          title: `Implement protocol changes: ${completedTask.title}`,
          category: 'implementation',
          estimatedHours: 16,
          priority: 'high',
        }
      ],
    };
    
    const taskCategory = completedTask.category || 'general';
    return followUpPatterns[taskCategory] || [];
  }

  // Event listener management
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback({ event, data, timestamp: new Date().toISOString() });
      } catch (error) {
        console.error('Error notifying task listener:', error);
      }
    });
  }

  // Batch operations
  async updateTaskStatus(taskIds, newStatus) {
    const response = await apiRequest(`${this.baseUrl}/tasks/batch-update`, 'POST', {
      taskIds,
      updates: { status: newStatus }
    });
    this.notifyListeners('tasks-status-updated', response.data);
    return response.data;
  }

  async autoAssignTasks(taskIds) {
    const response = await apiRequest(`${this.baseUrl}/tasks/auto-assign`, 'POST', {
      taskIds
    });
    this.notifyListeners('tasks-auto-assigned', response.data);
    return response.data;
  }

  // Analytics and reporting
  async getTaskAnalytics(filters = {}) {
    const response = await apiRequest(`${this.baseUrl}/tasks/analytics`, 'GET', null, filters);
    return response.data;
  }

  async getCriticalPath(projectId) {
    const response = await apiRequest(`${this.baseUrl}/tasks/critical-path/${projectId}`, 'GET');
    return response.data;
  }

  async getWorkloadDistribution(organizationId) {
    const response = await apiRequest(`${this.baseUrl}/tasks/workload/${organizationId}`, 'GET');
    return response.data;
  }
}

// Create singleton instance
const taskManagementService = new TaskManagementService();

// Export service
export default taskManagementService;

// Export specific methods for convenience
export {
  taskManagementService as TaskService,
};

// Export task creation helpers for modules
export const createECTDTask = (documentData, taskType) => 
  taskManagementService.createECTDTask(documentData, taskType);

export const createCMCTask = (issueData, taskType) => 
  taskManagementService.createCMCTask(issueData, taskType);

export const createClinicalTask = (trialData, taskType) => 
  taskManagementService.createClinicalTask(trialData, taskType);

export const applyAutomationRules = (event, context) => 
  taskManagementService.applyAutomationRules(event, context);

export const getTemplateForMilestone = (milestone) => 
  taskManagementService.getTemplateForMilestone(milestone);