const express = require('express');
const OpenAI = require('openai');
const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Task and Document Lifecycle Management System
let taskRegistry = new Map();
let documentHistory = new Map();
let reviewComments = new Map();
let approvalWorkflows = new Map();

// Task status tracking
const TASK_STATUSES = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PENDING_REVIEW: 'pending_review',
  IN_REVIEW: 'in_review',
  REVISIONS_REQUESTED: 'revisions_requested',
  APPROVED: 'approved',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
};

// Reviewer roles and permissions
const REVIEWER_ROLES = {
  MEDICAL_WRITER: 'medical_writer',
  REGULATORY_AFFAIRS: 'regulatory_affairs',
  CLINICAL_LEAD: 'clinical_lead',
  QUALITY_ASSURANCE: 'quality_assurance',
  LEGAL_REVIEW: 'legal_review',
  FINAL_APPROVER: 'final_approver',
};

// Create task with due dates and reviewer assignments
router.post('/create-task', async (req, res) => {
  try {
    const {
      taskId,
      documentId,
      moduleId,
      sectionId,
      title,
      description,
      dueDate,
      priority,
      assignedReviewers,
      approvalWorkflow,
      submissionType,
      therapeuticArea,
    } = req.body;

    if (!taskId || !documentId || !title || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Task ID, document ID, title, and due date are required',
      });
    }

    const task = {
      id: taskId,
      documentId,
      moduleId,
      sectionId,
      title,
      description,
      status: TASK_STATUSES.NOT_STARTED,
      priority: priority || 'medium',
      dueDate: new Date(dueDate),
      createdAt: new Date(),
      lastUpdated: new Date(),
      assignedReviewers: assignedReviewers || [],
      approvalWorkflow: approvalWorkflow || [],
      submissionType,
      therapeuticArea,
      currentReviewer: null,
      completionPercentage: 0,
      estimatedHours: calculateEstimatedHours(moduleId, sectionId),
      actualHours: 0,
    };

    // Initialize document history
    if (!documentHistory.has(documentId)) {
      documentHistory.set(documentId, {
        documentId,
        versions: [],
        currentVersion: 0,
        lifecycle: [],
        metadata: {
          moduleId,
          sectionId,
          submissionType,
          therapeuticArea,
          createdAt: new Date(),
        },
      });
    }

    // Initialize review comments tracking
    if (!reviewComments.has(documentId)) {
      reviewComments.set(documentId, []);
    }

    taskRegistry.set(taskId, task);

    // Add lifecycle event
    addLifecycleEvent(documentId, 'TASK_CREATED', {
      taskId,
      title,
      dueDate,
      assignedReviewers,
    });

    res.json({
      success: true,
      task,
      message: 'Task created with reviewer assignments and due date tracking',
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
    });
  }
});

// Update task status and progress
router.post('/update-task-status', async (req, res) => {
  try {
    const { taskId, status, progress, actualHours, reviewerNotes } = req.body;

    const task = taskRegistry.get(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    const previousStatus = task.status;
    task.status = status;
    task.lastUpdated = new Date();

    if (progress !== undefined) {
      task.completionPercentage = Math.min(100, Math.max(0, progress));
    }

    if (actualHours !== undefined) {
      task.actualHours = actualHours;
    }

    // Check for overdue status
    if (new Date() > task.dueDate && status !== TASK_STATUSES.COMPLETED) {
      task.status = TASK_STATUSES.OVERDUE;
    }

    // Add lifecycle event
    addLifecycleEvent(task.documentId, 'STATUS_CHANGED', {
      taskId,
      previousStatus,
      newStatus: task.status,
      progress: task.completionPercentage,
      reviewerNotes,
      timestamp: new Date(),
    });

    // Auto-assign next reviewer if status changed to pending review
    if (status === TASK_STATUSES.PENDING_REVIEW) {
      assignNextReviewer(task);
    }

    res.json({
      success: true,
      task,
      statusChange: {
        from: previousStatus,
        to: task.status,
        timestamp: task.lastUpdated,
      },
    });
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update task status',
    });
  }
});

// Add review comment with change tracking
router.post('/add-review-comment', async (req, res) => {
  try {
    const {
      documentId,
      taskId,
      reviewerId,
      reviewerName,
      reviewerRole,
      comment,
      commentType, // 'suggestion', 'required_change', 'approval', 'question'
      sectionReference,
      severity, // 'low', 'medium', 'high', 'critical'
      suggestedChange,
    } = req.body;

    if (!documentId || !reviewerId || !comment) {
      return res.status(400).json({
        success: false,
        error: 'Document ID, reviewer ID, and comment are required',
      });
    }

    const reviewComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      taskId,
      reviewerId,
      reviewerName,
      reviewerRole,
      comment,
      commentType: commentType || 'suggestion',
      sectionReference,
      severity: severity || 'medium',
      suggestedChange,
      timestamp: new Date(),
      status: 'open', // 'open', 'resolved', 'acknowledged'
      responses: [],
    };

    // Get existing comments or initialize
    let comments = reviewComments.get(documentId) || [];
    comments.push(reviewComment);
    reviewComments.set(documentId, comments);

    // Add lifecycle event
    addLifecycleEvent(documentId, 'COMMENT_ADDED', {
      commentId: reviewComment.id,
      reviewerId,
      reviewerName,
      reviewerRole,
      commentType,
      severity,
      sectionReference,
    });

    // Update task if needed
    if (taskId) {
      const task = taskRegistry.get(taskId);
      if (task && commentType === 'required_change') {
        task.status = TASK_STATUSES.REVISIONS_REQUESTED;
        task.lastUpdated = new Date();
      }
    }

    res.json({
      success: true,
      comment: reviewComment,
      message: 'Review comment added successfully',
    });
  } catch (error) {
    console.error('Error adding review comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add review comment',
    });
  }
});

// Get task dashboard with due dates and statuses
router.get('/dashboard', (req, res) => {
  try {
    const { filterBy, sortBy, userId } = req.query;

    let tasks = Array.from(taskRegistry.values());

    // Filter tasks if user specified
    if (userId) {
      tasks = tasks.filter(
        task =>
          task.assignedReviewers.some(reviewer => reviewer.userId === userId) ||
          task.currentReviewer === userId
      );
    }

    // Filter by status if specified
    if (filterBy) {
      tasks = tasks.filter(task => task.status === filterBy);
    }

    // Sort tasks
    if (sortBy === 'dueDate') {
      tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    } else if (sortBy === 'priority') {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      tasks.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    } else {
      tasks.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    }

    // Calculate dashboard metrics
    const metrics = {
      totalTasks: tasks.length,
      overdue: tasks.filter(t => t.status === TASK_STATUSES.OVERDUE).length,
      dueToday: tasks.filter(t => {
        const today = new Date().toDateString();
        return new Date(t.dueDate).toDateString() === today;
      }).length,
      inReview: tasks.filter(t => t.status === TASK_STATUSES.IN_REVIEW).length,
      completed: tasks.filter(t => t.status === TASK_STATUSES.COMPLETED).length,
      avgCompletionTime: calculateAverageCompletionTime(tasks),
    };

    res.json({
      success: true,
      tasks,
      metrics,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
    });
  }
});

// Get document history and lifecycle
router.get('/document/:documentId/history', (req, res) => {
  try {
    const { documentId } = req.params;

    const history = documentHistory.get(documentId);
    const comments = reviewComments.get(documentId) || [];

    if (!history) {
      return res.status(404).json({
        success: false,
        error: 'Document history not found',
      });
    }

    // Get associated tasks
    const associatedTasks = Array.from(taskRegistry.values()).filter(
      task => task.documentId === documentId
    );

    res.json({
      success: true,
      history,
      comments,
      tasks: associatedTasks,
      timeline: generateDocumentTimeline(history, comments, associatedTasks),
    });
  } catch (error) {
    console.error('Error fetching document history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document history',
    });
  }
});

// Get reviewer workload and assignments
router.get('/reviewers/workload', (req, res) => {
  try {
    const reviewerWorkload = new Map();

    // Calculate workload for each reviewer
    Array.from(taskRegistry.values()).forEach(task => {
      task.assignedReviewers.forEach(reviewer => {
        if (!reviewerWorkload.has(reviewer.userId)) {
          reviewerWorkload.set(reviewer.userId, {
            userId: reviewer.userId,
            name: reviewer.name,
            role: reviewer.role,
            activeTasks: 0,
            overdueTasks: 0,
            avgReviewTime: 0,
            currentLoad: 'light', // light, medium, heavy
          });
        }

        const workload = reviewerWorkload.get(reviewer.userId);
        workload.activeTasks++;

        if (task.status === TASK_STATUSES.OVERDUE) {
          workload.overdueTasks++;
        }
      });
    });

    // Calculate load levels
    reviewerWorkload.forEach(workload => {
      if (workload.activeTasks > 10) {
        workload.currentLoad = 'heavy';
      } else if (workload.activeTasks > 5) {
        workload.currentLoad = 'medium';
      }
    });

    res.json({
      success: true,
      reviewers: Array.from(reviewerWorkload.values()),
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error fetching reviewer workload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviewer workload',
    });
  }
});

// Helper Functions

function calculateEstimatedHours(moduleId, sectionId) {
  const estimates = {
    module_1: 8,
    module_2: 16,
    'module_2.3': 12,
    'module_2.4': 14,
    'module_2.5': 18,
    'module_2.6': 10,
    module_3: 24,
    module_4: 20,
    module_5: 32,
  };

  const key = sectionId ? `${moduleId}.${sectionId}` : moduleId;
  return estimates[key] || 12;
}

function assignNextReviewer(task) {
  if (task.approvalWorkflow && task.approvalWorkflow.length > 0) {
    const nextReviewer = task.approvalWorkflow.find(reviewer => !reviewer.completed);

    if (nextReviewer) {
      task.currentReviewer = nextReviewer.userId;
      task.status = TASK_STATUSES.IN_REVIEW;
    }
  }
}

function addLifecycleEvent(documentId, eventType, eventData) {
  const history = documentHistory.get(documentId);
  if (history) {
    history.lifecycle.push({
      eventType,
      timestamp: new Date(),
      data: eventData,
    });
  }
}

function calculateAverageCompletionTime(tasks) {
  const completedTasks = tasks.filter(t => t.status === TASK_STATUSES.COMPLETED);
  if (completedTasks.length === 0) return 0;

  const totalTime = completedTasks.reduce((sum, task) => sum + task.actualHours, 0);
  return Math.round(totalTime / completedTasks.length);
}

function generateDocumentTimeline(history, comments, tasks) {
  const timeline = [];

  // Add lifecycle events
  history.lifecycle.forEach(event => {
    timeline.push({
      type: 'lifecycle',
      timestamp: event.timestamp,
      description: formatLifecycleEvent(event),
      data: event,
    });
  });

  // Add comment events
  comments.forEach(comment => {
    timeline.push({
      type: 'comment',
      timestamp: comment.timestamp,
      description: `${comment.reviewerName} added ${comment.commentType} comment`,
      data: comment,
    });
  });

  // Add task events
  tasks.forEach(task => {
    timeline.push({
      type: 'task',
      timestamp: task.createdAt,
      description: `Task "${task.title}" created`,
      data: task,
    });
  });

  // Sort by timestamp
  timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return timeline;
}

function formatLifecycleEvent(event) {
  switch (event.eventType) {
    case 'TASK_CREATED':
      return `Task created: ${event.data.title}`;
    case 'STATUS_CHANGED':
      return `Status changed from ${event.data.previousStatus} to ${event.data.newStatus}`;
    case 'COMMENT_ADDED':
      return `${event.data.reviewerName} added ${event.data.commentType} comment`;
    default:
      return event.eventType;
  }
}

module.exports = router;
