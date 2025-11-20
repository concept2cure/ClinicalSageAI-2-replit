/**
 * Workflow Service
 *
 * This service provides workflow management capabilities for the TrialSage platform,
 * including task tracking, approvals, and process automation.
 */

class WorkflowService {
  constructor() {
    this.isInitialized = false;
    this.workflowTemplates = [];
    this.activeWorkflows = [];
    this.tasks = [];
  }

  /**
   * Initialize the workflow service
   */
  async initialize() {
    try {
      console.log('Initializing Workflow Service');

      // Load workflow templates
      console.log('Loading workflow templates');
      await this.loadWorkflowTemplates();

      // Load active workflows
      console.log('Loading active workflows');
      await this.loadActiveWorkflows();

      // Load tasks
      console.log('Loading tasks');
      await this.loadTasks();

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing Workflow Service:', error);
      throw error;
    }
  }

  /**
   * Load workflow templates
   */
  async loadWorkflowTemplates() {
    try {
      // In production, this would load from an API or database
      // For development, we'll simulate some workflow templates

      // IND Submission Template
      const indTemplate = {
        id: 'wf-template-001',
        name: 'IND Submission Workflow',
        description: 'Process for preparing and submitting an IND application',
        category: 'Regulatory',
        version: 1.0,
        steps: [
          {
            id: 'step-001',
            name: 'Prepare Technical Sections',
            description: 'Prepare CMC, Pharmacology/Toxicology, and Clinical sections',
            estimatedDuration: 15, // days
            approvalRequired: false,
          },
          {
            id: 'step-002',
            name: 'Internal Review',
            description: 'Review by internal stakeholders',
            estimatedDuration: 5, // days
            approvalRequired: true,
          },
          {
            id: 'step-003',
            name: 'Submission',
            description: 'Submit to FDA',
            estimatedDuration: 1, // days
            approvalRequired: true,
          },
        ],
      };

      // CSR Preparation Template
      const csrTemplate = {
        id: 'wf-template-002',
        name: 'CSR Preparation Workflow',
        description: 'Process for preparing a Clinical Study Report',
        category: 'Clinical',
        version: 1.0,
        steps: [
          {
            id: 'step-004',
            name: 'Draft CSR',
            description: 'Draft the CSR according to ICH E3 structure',
            estimatedDuration: 20, // days
            approvalRequired: false,
          },
          {
            id: 'step-005',
            name: 'Medical Review',
            description: 'Review by Medical Director',
            estimatedDuration: 7, // days
            approvalRequired: true,
          },
          {
            id: 'step-006',
            name: 'QC Review',
            description: 'Quality control review',
            estimatedDuration: 5, // days
            approvalRequired: true,
          },
          {
            id: 'step-007',
            name: 'Finalization',
            description: 'Finalize and distribute CSR',
            estimatedDuration: 3, // days
            approvalRequired: true,
          },
        ],
      };

      // Store templates
      this.workflowTemplates = [indTemplate, csrTemplate];

      console.log('Loaded', this.workflowTemplates.length, 'workflow templates');
      return true;
    } catch (error) {
      console.error('Error loading workflow templates:', error);
      throw error;
    }
  }

  /**
   * Load active workflows
   */
  async loadActiveWorkflows() {
    try {
      // In production, this would load from an API or database
      // For development, we'll simulate some active workflows

      // Active IND Workflow
      const activeIndWorkflow = {
        id: 'workflow-001',
        templateId: 'wf-template-001',
        name: 'IND Submission - Project Alpha',
        status: 'In Progress',
        progress: 40, // percentage
        startedAt: '2025-04-10T09:00:00Z',
        currentStep: 'step-002',
        assignedTo: 'John Smith',
        dueDate: '2025-05-15T17:00:00Z',
      };

      // Active CSR Workflow
      const activeCsrWorkflow = {
        id: 'workflow-002',
        templateId: 'wf-template-002',
        name: 'CSR Preparation - Study XYZ-123',
        status: 'In Progress',
        progress: 20, // percentage
        startedAt: '2025-04-15T10:30:00Z',
        currentStep: 'step-004',
        assignedTo: 'Jane Doe',
        dueDate: '2025-06-01T17:00:00Z',
      };

      // Store active workflows
      this.activeWorkflows = [activeIndWorkflow, activeCsrWorkflow];

      console.log('Loaded', this.activeWorkflows.length, 'active workflows');
      return true;
    } catch (error) {
      console.error('Error loading active workflows:', error);
      throw error;
    }
  }

  /**
   * Load tasks
   */
  async loadTasks() {
    try {
      // In production, this would load from an API or database
      // For development, we'll simulate some tasks

      // Tasks for IND Workflow
      const indTask1 = {
        id: 'task-001',
        workflowId: 'workflow-001',
        stepId: 'step-002',
        name: 'Review CMC Section',
        description: 'Review Chemistry, Manufacturing, and Controls section',
        status: 'In Progress',
        priority: 'High',
        assignedTo: 'John Smith',
        dueDate: '2025-04-30T17:00:00Z',
        createdAt: '2025-04-20T09:30:00Z',
      };

      const indTask2 = {
        id: 'task-002',
        workflowId: 'workflow-001',
        stepId: 'step-002',
        name: 'Review Pharmacology/Toxicology Section',
        description: 'Review Pharmacology and Toxicology data',
        status: 'Pending',
        priority: 'Medium',
        assignedTo: 'Robert Chen',
        dueDate: '2025-05-02T17:00:00Z',
        createdAt: '2025-04-20T09:30:00Z',
      };

      // Task for CSR Workflow
      const csrTask1 = {
        id: 'task-003',
        workflowId: 'workflow-002',
        stepId: 'step-004',
        name: 'Draft Methods Section',
        description: 'Draft the Methods section of the CSR',
        status: 'In Progress',
        priority: 'High',
        assignedTo: 'Jane Doe',
        dueDate: '2025-04-28T17:00:00Z',
        createdAt: '2025-04-16T11:00:00Z',
      };

      // Store tasks
      this.tasks = [indTask1, indTask2, csrTask1];

      console.log('Loaded', this.tasks.length, 'tasks');
      return true;
    } catch (error) {
      console.error('Error loading tasks:', error);
      throw error;
    }
  }

  /**
   * Get all workflow templates
   */
  getWorkflowTemplates() {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    return this.workflowTemplates;
  }

  /**
   * Get workflow template by ID
   */
  getWorkflowTemplate(templateId) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    return this.workflowTemplates.find(template => template.id === templateId);
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows() {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    return this.activeWorkflows;
  }

  /**
   * Get active workflow by ID
   */
  getActiveWorkflow(workflowId) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    return this.activeWorkflows.find(workflow => workflow.id === workflowId);
  }

  /**
   * Get tasks
   */
  getTasks(options = {}) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    let filteredTasks = [...this.tasks];

    // Filter by workflow ID
    if (options.workflowId) {
      filteredTasks = filteredTasks.filter(task => task.workflowId === options.workflowId);
    }

    // Filter by status
    if (options.status) {
      filteredTasks = filteredTasks.filter(task => task.status === options.status);
    }

    // Filter by assigned user
    if (options.assignedTo) {
      filteredTasks = filteredTasks.filter(task => task.assignedTo === options.assignedTo);
    }

    return filteredTasks;
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    return this.tasks.find(task => task.id === taskId);
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(templateId, data) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    try {
      // Find the template
      const template = this.getWorkflowTemplate(templateId);

      if (!template) {
        throw new Error(`Workflow template not found: ${templateId}`);
      }

      // Generate workflow ID
      const workflowId = `workflow-${Date.now()}`;

      // Create workflow
      const workflow = {
        id: workflowId,
        templateId,
        name: data.name,
        status: 'Not Started',
        progress: 0,
        startedAt: data.startDate || new Date().toISOString(),
        currentStep: template.steps[0].id,
        assignedTo: data.assignedTo,
        dueDate: data.dueDate,
      };

      // Store workflow
      this.activeWorkflows.push(workflow);

      // Create initial tasks
      const initialStep = template.steps[0];

      const task = {
        id: `task-${Date.now()}`,
        workflowId,
        stepId: initialStep.id,
        name: `${initialStep.name}`,
        description: initialStep.description,
        status: 'Not Started',
        priority: data.priority || 'Medium',
        assignedTo: data.assignedTo,
        dueDate: data.dueDate,
        createdAt: new Date().toISOString(),
      };

      // Store task
      this.tasks.push(task);

      return workflow;
    } catch (error) {
      console.error('Error creating workflow:', error);
      throw error;
    }
  }

  /**
   * Start a workflow
   */
  async startWorkflow(workflowId) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    try {
      // Find the workflow
      const workflowIndex = this.activeWorkflows.findIndex(wf => wf.id === workflowId);

      if (workflowIndex === -1) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Update workflow status
      const workflow = { ...this.activeWorkflows[workflowIndex] };
      workflow.status = 'In Progress';
      workflow.startedAt = new Date().toISOString();

      // Update in array
      this.activeWorkflows[workflowIndex] = workflow;

      // Update associated tasks
      const tasks = this.getTasks({ workflowId });

      tasks.forEach(task => {
        if (task.status === 'Not Started' && task.stepId === workflow.currentStep) {
          task.status = 'In Progress';
        }
      });

      return workflow;
    } catch (error) {
      console.error('Error starting workflow:', error);
      throw error;
    }
  }

  /**
   * Complete a task
   */
  async completeTask(taskId) {
    if (!this.isInitialized) {
      throw new Error('Workflow Service not initialized');
    }

    try {
      // Find the task
      const taskIndex = this.tasks.findIndex(task => task.id === taskId);

      if (taskIndex === -1) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Update task status
      const task = { ...this.tasks[taskIndex] };
      task.status = 'Completed';
      task.completedAt = new Date().toISOString();

      // Update in array
      this.tasks[taskIndex] = task;

      // Update workflow progress
      const { workflowId, stepId } = task;
      const workflow = this.getActiveWorkflow(workflowId);

      if (workflow) {
        const template = this.getWorkflowTemplate(workflow.templateId);
        const allTasksInStep = this.getTasks({ workflowId, stepId });
        const completedTasksInStep = allTasksInStep.filter(t => t.status === 'Completed');

        // If all tasks in the step are completed, move to the next step
        if (allTasksInStep.length === completedTasksInStep.length) {
          const currentStepIndex = template.steps.findIndex(step => step.id === stepId);

          if (currentStepIndex < template.steps.length - 1) {
            // Move to next step
            const nextStep = template.steps[currentStepIndex + 1];
            workflow.currentStep = nextStep.id;

            // Create task for next step
            const newTask = {
              id: `task-${Date.now()}`,
              workflowId,
              stepId: nextStep.id,
              name: `${nextStep.name}`,
              description: nextStep.description,
              status: 'Not Started',
              priority: 'Medium',
              assignedTo: workflow.assignedTo,
              dueDate: workflow.dueDate,
              createdAt: new Date().toISOString(),
            };

            // Store task
            this.tasks.push(newTask);
          } else {
            // Last step completed
            workflow.status = 'Completed';
            workflow.completedAt = new Date().toISOString();
            workflow.progress = 100;
          }
        }

        // Update progress
        if (workflow.status !== 'Completed') {
          const totalSteps = template.steps.length;
          const currentStepIndex = template.steps.findIndex(
            step => step.id === workflow.currentStep
          );
          const previousStepsCount = currentStepIndex;
          const currentStepProgress = completedTasksInStep.length / allTasksInStep.length;

          workflow.progress = Math.round(
            ((previousStepsCount + currentStepProgress) / totalSteps) * 100
          );
        }
      }

      return task;
    } catch (error) {
      console.error('Error completing task:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.isInitialized = false;
    console.log('Workflow Service cleaned up');
  }
}

export default WorkflowService;
