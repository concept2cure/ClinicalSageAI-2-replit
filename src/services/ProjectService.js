/**
 * Project Service
 *
 * Handles project operations, management, and data retrieval.
 * Uses the RegulatoryProjectMap model as its brain to understand project
 * structures, requirements, and statuses.
 */

import RegulatoryProjectMap from '../models/RegulatoryProjectMap';

class ProjectService {
  constructor() {
    this.projectMap = RegulatoryProjectMap;
  }

  /**
   * Get the user's active projects
   * In a real application, this would fetch from an API endpoint
   */
  async getUserProjects(userId, orgId) {
    // For demo purposes, we'll return mock data
    // In a real app, we would fetch from the server
    console.log(`Fetching projects for user: ${userId}, org: ${orgId}`);

    // This would be an API call in production
    return [
      {
        id: 'IND-2025-034',
        name: 'BTX-331 IND Application',
        type: 'IND',
        phase: 'initial_ind',
        progress: 65,
        dueDate: '2025-05-30',
        issues: 2,
        startDate: '2025-01-15',
        owner: 'Sarah Johnson',
      },
      {
        id: 'CSR-2024-089',
        name: 'Phase I CSR BX-107',
        type: 'CSR',
        phase: 'csr_drafting',
        progress: 42,
        dueDate: '2025-05-10',
        issues: 0,
        startDate: '2024-12-05',
        owner: 'Mark Wilson',
      },
      {
        id: 'PROTOCOL-507',
        name: 'Study Protocol Development',
        type: 'CRC',
        phase: 'study_startup',
        progress: 28,
        dueDate: '2025-07-21',
        issues: 1,
        startDate: '2025-02-10',
        owner: 'John Davis',
      },
    ];
  }

  /**
   * Get a list of required documents for a project with their completion status
   */
  async getProjectDocuments(projectId, projectType) {
    // In production, this would fetch document status from the backend
    console.log(`Fetching documents for project: ${projectId} of type: ${projectType}`);

    // Get the documents required for this project type
    const requiredDocs = this.projectMap.getRequiredDocuments(projectType);

    // For demo, we'll randomize completion statuses
    return requiredDocs.map(doc => ({
      ...doc,
      projectId,
      status: Math.random() > 0.5 ? 'completed' : 'pending',
      lastEdited: new Date(
        Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000)
      ).toISOString(),
    }));
  }

  /**
   * Generate a list of next actions for a user based on their projects
   */
  async getNextActions(userId, orgId) {
    // Get the user's projects
    const projects = await this.getUserProjects(userId, orgId);

    // Array to store all next actions
    const actions = [];

    // For each project, determine appropriate next actions
    for (const project of projects) {
      const documents = await this.getProjectDocuments(project.id, project.type);

      // Find incomplete documents and create actions for them
      const pendingDocs = documents.filter(doc => doc.status === 'pending');

      for (const doc of pendingDocs) {
        actions.push({
          id: `action-${project.id}-${doc.id}`,
          projectId: project.id,
          projectName: project.name,
          projectType: project.type,
          documentId: doc.id,
          documentName: doc.name,
          actionType: 'document',
          description: `Complete ${doc.name} for ${project.name}`,
          dueDate: project.dueDate,
          priority: this.calculatePriority(project.dueDate, doc.required),
        });
      }

      // Add project-level actions based on phase
      const projectType = this.projectMap.getProjectType(project.type);
      if (projectType) {
        const currentPhase = projectType.phases.find(phase => phase.id === project.phase);
        if (currentPhase) {
          actions.push({
            id: `action-${project.id}-phase`,
            projectId: project.id,
            projectName: project.name,
            projectType: project.type,
            actionType: 'phase',
            description: `Advance ${project.name} to next phase after completing ${currentPhase.name}`,
            dueDate: project.dueDate,
            priority: this.calculatePriority(project.dueDate, true),
          });
        }
      }

      // If project has issues, add actions to address them
      if (project.issues > 0) {
        actions.push({
          id: `action-${project.id}-issues`,
          projectId: project.id,
          projectName: project.name,
          projectType: project.type,
          actionType: 'issue',
          description: `Resolve ${project.issues} outstanding issue${project.issues > 1 ? 's' : ''} in ${project.name}`,
          dueDate: project.dueDate,
          priority: this.calculatePriority(project.dueDate, true),
        });
      }
    }

    // Sort actions by priority
    return actions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate a priority score based on due date and whether the document is required
   */
  calculatePriority(dueDateStr, isRequired) {
    const dueDate = new Date(dueDateStr);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    // Base priority calculation
    let priority = 0;

    // Due date factors
    if (daysUntilDue < 0) {
      // Overdue items get highest priority
      priority += 100;
    } else if (daysUntilDue < 7) {
      // Due within a week
      priority += 80;
    } else if (daysUntilDue < 14) {
      // Due within two weeks
      priority += 60;
    } else if (daysUntilDue < 30) {
      // Due within a month
      priority += 40;
    } else {
      // Due later
      priority += 20;
    }

    // Required document factor
    if (isRequired) {
      priority += 20;
    }

    return priority;
  }

  /**
   * Get project module link based on project type
   */
  getProjectModuleLink(projectType) {
    const type = this.projectMap.getProjectType(projectType);
    return type ? type.moduleLink : '/dashboard';
  }
}

export default new ProjectService();
