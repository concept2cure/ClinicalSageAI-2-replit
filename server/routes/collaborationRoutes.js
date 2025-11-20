/**
 * Collaboration API Routes
 *
 * This module provides the API endpoints for the project collaboration features,
 * including messaging, tasks, milestones, approvals, and AI assistance.
 */

const express = require('express');
const router = express.Router();

// Mock database for demonstration purposes
const mockDb = {
  messages: [],
  tasks: [],
  milestones: [],
  approvals: [],
  teamMembers: [
    { id: '1', name: 'Sarah Johnson', role: 'Regulatory Affairs', avatar: '/avatars/sarah.jpg' },
    { id: '2', name: 'David Chen', role: 'Medical Writer', avatar: '/avatars/david.jpg' },
    { id: '3', name: 'Priya Patel', role: 'Clinical Specialist', avatar: '/avatars/priya.jpg' },
    { id: '4', name: 'James Wilson', role: 'Project Manager', avatar: '/avatars/james.jpg' },
    { id: '5', name: 'Maria Rodriguez', role: 'Quality Assurance', avatar: '/avatars/maria.jpg' },
  ],
};

// Get all messages for a project
router.get('/messages', (req, res) => {
  const { projectId, moduleType } = req.query;

  // In a real implementation, fetch from database filtered by projectId and moduleType
  res.json(
    mockDb.messages.filter(msg => msg.projectId === projectId && msg.moduleType === moduleType)
  );
});

// Send a new message
router.post('/messages', (req, res) => {
  const message = {
    id: `msg-${Date.now()}`,
    ...req.body,
    timestamp: new Date().toISOString(),
  };

  // In a real implementation, save to database
  mockDb.messages.push(message);

  res.status(201).json(message);
});

// Get tasks for a project
router.get('/tasks', (req, res) => {
  const { projectId, moduleType } = req.query;

  // In a real implementation, fetch from database filtered by projectId and moduleType
  res.json(
    mockDb.tasks.filter(task => task.projectId === projectId && task.moduleType === moduleType)
  );
});

// Create a new task
router.post('/tasks', (req, res) => {
  const task = {
    id: `task-${Date.now()}`,
    ...req.body,
    createdAt: new Date().toISOString(),
  };

  // In a real implementation, save to database
  mockDb.tasks.push(task);

  res.status(201).json(task);
});

// Update a task
router.patch('/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;

  // In a real implementation, update in database
  const taskIndex = mockDb.tasks.findIndex(task => task.id === taskId);

  if (taskIndex === -1) {
    return res.status(404).json({ message: 'Task not found' });
  }

  mockDb.tasks[taskIndex] = {
    ...mockDb.tasks[taskIndex],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };

  res.json(mockDb.tasks[taskIndex]);
});

// Get milestones for a project
router.get('/milestones', (req, res) => {
  const { projectId, moduleType } = req.query;

  // In a real implementation, fetch from database filtered by projectId and moduleType
  res.json(
    mockDb.milestones.filter(
      milestone => milestone.projectId === projectId && milestone.moduleType === moduleType
    )
  );
});

// Complete a milestone
router.post('/milestones/:milestoneId/complete', (req, res) => {
  const { milestoneId } = req.params;

  // In a real implementation, update in database
  const milestoneIndex = mockDb.milestones.findIndex(milestone => milestone.id === milestoneId);

  if (milestoneIndex === -1) {
    return res.status(404).json({ message: 'Milestone not found' });
  }

  mockDb.milestones[milestoneIndex] = {
    ...mockDb.milestones[milestoneIndex],
    status: 'completed',
    completedAt: new Date().toISOString(),
    completedBy: req.body.completedBy,
  };

  res.json(mockDb.milestones[milestoneIndex]);
});

// Get approval requests for a project
router.get('/approvals', (req, res) => {
  const { projectId, moduleType } = req.query;

  // In a real implementation, fetch from database filtered by projectId and moduleType
  res.json(
    mockDb.approvals.filter(
      approval => approval.projectId === projectId && approval.moduleType === moduleType
    )
  );
});

// Create a new approval request
router.post('/approvals', (req, res) => {
  const request = {
    id: `approval-${Date.now()}`,
    ...req.body,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };

  // In a real implementation, save to database
  mockDb.approvals.push(request);

  res.status(201).json(request);
});

// Process an approval request
router.post('/approvals/:requestId/process', (req, res) => {
  const { requestId } = req.params;
  const { isApproved, note, processedBy } = req.body;

  // In a real implementation, update in database
  const requestIndex = mockDb.approvals.findIndex(request => request.id === requestId);

  if (requestIndex === -1) {
    return res.status(404).json({ message: 'Approval request not found' });
  }

  mockDb.approvals[requestIndex] = {
    ...mockDb.approvals[requestIndex],
    status: isApproved ? 'approved' : 'rejected',
    processedAt: new Date().toISOString(),
    processedBy,
    note,
  };

  res.json(mockDb.approvals[requestIndex]);
});

// Get AI suggestions for a project
router.post('/ai-suggestions', async (req, res) => {
  const { projectId, moduleType, context } = req.body;

  try {
    // In a real implementation, this would call a GPT model via an AI service
    // For demonstration, return mock suggestions
    const suggestions = [
      {
        id: `suggestion-${Date.now()}-1`,
        type: 'ai-suggestion',
        content:
          'Based on your submission timeline, I recommend prioritizing the substantial equivalence comparison section. Recent FDA guidance emphasizes detailed technical specifications for Class II devices.',
        confidence: 0.92,
        actions: [
          { id: 'action-1', label: 'View FDA Guidance', action: 'view-guidance' },
          { id: 'action-2', label: 'Create Task', action: 'create-task' },
          { id: 'action-3', label: 'Dismiss', action: 'dismiss' },
        ],
      },
      {
        id: `suggestion-${Date.now()}-2`,
        type: 'ai-suggestion',
        content:
          'I noticed your project timeline has the performance testing scheduled after the equivalence comparison. Based on best practices, conducting performance testing before finalizing the comparison could provide valuable supporting data.',
        confidence: 0.85,
        actions: [
          { id: 'action-4', label: 'Update Timeline', action: 'update-timeline' },
          { id: 'action-5', label: 'Dismiss', action: 'dismiss' },
        ],
      },
    ];

    res.json(suggestions);
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    res.status(500).json({ message: 'Error generating AI suggestions' });
  }
});

// Get project team members
router.get('/team', (req, res) => {
  const { projectId } = req.query;

  // In a real implementation, fetch from database filtered by projectId
  // For demonstration, return mock team members
  res.json(mockDb.teamMembers);
});

// Get AI assistance for a specific task or milestone
router.post('/ai-assistance', async (req, res) => {
  const { itemId, itemType, context } = req.body;

  try {
    // In a real implementation, this would call a GPT model via an AI service
    // For demonstration, return mock assistance
    let assistance;

    if (itemType === 'task') {
      assistance = {
        id: `assistance-${Date.now()}`,
        itemId,
        itemType,
        recommendations: [
          'Break this down into smaller subtasks for better tracking',
          'Consider assigning this to someone with FDA submission experience',
          'Related FDA guidance documents: [FDA 510(k) #K123456](https://www.fda.gov)',
        ],
        suggestedResources: [
          {
            title: 'FDA Guidance for Industry and FDA Staff',
            url: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
          },
          {
            title: 'IMDRF Technical Document',
            url: 'https://www.imdrf.org/documents/documents.asp',
          },
        ],
      };
    } else if (itemType === 'milestone') {
      assistance = {
        id: `assistance-${Date.now()}`,
        itemId,
        itemType,
        recommendations: [
          'Review the complete milestone checklist before marking as complete',
          'Ensure all stakeholders have provided input before proceeding',
          'Consider milestone dependencies in your project timeline',
        ],
        requiredArtifacts: [
          'Finalized technical specifications document',
          'Completed risk assessment',
          'Quality assurance sign-off',
        ],
      };
    }

    res.json(assistance);
  } catch (error) {
    console.error('Error generating AI assistance:', error);
    res.status(500).json({ message: 'Error generating AI assistance' });
  }
});

module.exports = router;
