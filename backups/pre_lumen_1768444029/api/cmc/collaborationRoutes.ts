/**
 * Collaboration API Routes for Smart Workflows
 * Real-time communication and team coordination features
 */

import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const CommentSchema = z.object({
  workflowId: z.string().min(1),
  message: z.string().min(1).max(1000),
  mentions: z.array(z.string()).optional().default([]),
  taskId: z.number().optional(),
  taskName: z.string().optional(),
});

const NotificationSchema = z.object({
  type: z.enum(['task_update', 'mention', 'deadline', 'approval', 'comment']),
  title: z.string().min(1),
  message: z.string().min(1),
  workflowId: z.string().min(1),
  userId: z.string().min(1),
  metadata: z.object({}).optional(),
});

// In-memory storage for real-time features (replace with database/Redis in production)
let comments = new Map();
let notifications = new Map();
let activeUsers = new Map();
let realtimeConnections = new Map();

/**
 * @route GET /api/cmc/collaboration/comments/:workflowId
 * @description Get comments for a specific workflow
 */
router.get('/comments/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const workflowComments = Array.from(comments.values())
      .filter(comment => comment.workflowId === workflowId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      data: {
        comments: workflowComments,
        total: workflowComments.length,
        hasMore: workflowComments.length === Number(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/cmc/collaboration/comments
 * @description Add a new comment to a workflow
 */
router.post('/comments', async (req, res) => {
  try {
    const validatedData = CommentSchema.parse(req.body);
    const { workflowId, message, mentions, taskId, taskName } = validatedData;

    const commentId = `comment-${Date.now()}`;
    const comment = {
      id: commentId,
      workflowId,
      user: req.user?.name || 'Current User', // In production, get from auth context
      userId: req.user?.id || 'current-user-id',
      userRole: req.user?.role || 'Team Member',
      message,
      mentions: mentions || [],
      taskId,
      taskName,
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: [],
    };

    comments.set(commentId, comment);

    // Create notifications for mentioned users
    if (mentions && mentions.length > 0) {
      mentions.forEach(mentionedUser => {
        const notificationId = `notif-${Date.now()}-${Math.random()}`;
        const notification = {
          id: notificationId,
          type: 'mention',
          title: 'You were mentioned',
          message: `${comment.user} mentioned you in a comment`,
          workflowId,
          userId: mentionedUser, // In production, resolve username to userId
          timestamp: new Date().toISOString(),
          read: false,
          metadata: {
            commentId,
            mentionedBy: comment.user,
          },
        };
        notifications.set(notificationId, notification);
      });
    }

    res.json({
      success: true,
      data: comment,
      message: 'Comment added successfully',
    });

    // In production, emit real-time event via WebSocket
    // broadcastToWorkflow(workflowId, 'new_comment', comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.errors,
      });
    }

    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/cmc/collaboration/notifications/:userId
 * @description Get notifications for a specific user
 */
router.get('/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { unreadOnly = false } = req.query;

    let userNotifications = Array.from(notifications.values()).filter(
      notification => notification.userId === userId
    );

    if (unreadOnly === 'true') {
      userNotifications = userNotifications.filter(n => !n.read);
    }

    userNotifications.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.json({
      success: true,
      data: {
        notifications: userNotifications,
        unreadCount: userNotifications.filter(n => !n.read).length,
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route PUT /api/cmc/collaboration/notifications/:notificationId/read
 * @description Mark a notification as read
 */
router.put('/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = notifications.get(notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    notification.read = true;
    notification.readAt = new Date().toISOString();
    notifications.set(notificationId, notification);

    res.json({
      success: true,
      data: notification,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/cmc/collaboration/activity/:workflowId
 * @description Get recent activity for a workflow
 */
router.get('/activity/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { limit = 20 } = req.query;

    // Combine comments and task updates for activity feed
    const workflowComments = Array.from(comments.values())
      .filter(comment => comment.workflowId === workflowId)
      .map(comment => ({
        ...comment,
        type: 'comment',
        action: 'commented',
      }));

    // Sample task updates (in production, fetch from task history)
    const taskUpdates = [
      {
        id: `update-${Date.now()}-1`,
        type: 'task_update',
        workflowId,
        user: 'Emily Rodriguez',
        userId: 'emily-id',
        action: 'completed',
        taskName: 'Quality Specifications',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        details: 'All acceptance criteria defined and approved',
      },
      {
        id: `update-${Date.now()}-2`,
        type: 'task_update',
        workflowId,
        user: 'David Park',
        userId: 'david-id',
        action: 'started',
        taskName: 'Analytical Methods',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
        details: 'Beginning method validation protocol development',
      },
    ];

    const allActivity = [...workflowComments, ...taskUpdates]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Number(limit));

    res.json({
      success: true,
      data: allActivity,
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route GET /api/cmc/collaboration/team/:workflowId
 * @description Get team members assigned to a workflow
 */
router.get('/team/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;

    // Sample team data (in production, fetch from database)
    const teamMembers = [
      {
        id: 'sarah-id',
        name: 'Sarah Chen',
        role: 'CMC Lead',
        email: 'sarah.chen@company.com',
        avatar: '/avatars/sarah.jpg',
        status: 'online',
        lastSeen: new Date().toISOString(),
        permissions: ['read', 'write', 'approve'],
      },
      {
        id: 'mike-id',
        name: 'Mike Johnson',
        role: 'Process Engineer',
        email: 'mike.johnson@company.com',
        avatar: '/avatars/mike.jpg',
        status: 'online',
        lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        permissions: ['read', 'write'],
      },
      {
        id: 'lisa-id',
        name: 'Lisa Wong',
        role: 'Stability Scientist',
        email: 'lisa.wong@company.com',
        avatar: '/avatars/lisa.jpg',
        status: 'away',
        lastSeen: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        permissions: ['read', 'write'],
      },
      {
        id: 'david-id',
        name: 'David Park',
        role: 'Analytical Lead',
        email: 'david.park@company.com',
        avatar: '/avatars/david.jpg',
        status: 'offline',
        lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        permissions: ['read', 'write'],
      },
      {
        id: 'emily-id',
        name: 'Emily Rodriguez',
        role: 'QC Manager',
        email: 'emily.rodriguez@company.com',
        avatar: '/avatars/emily.jpg',
        status: 'online',
        lastSeen: new Date().toISOString(),
        permissions: ['read', 'write', 'approve'],
      },
    ];

    res.json({
      success: true,
      data: {
        members: teamMembers,
        totalMembers: teamMembers.length,
        onlineCount: teamMembers.filter(m => m.status === 'online').length,
      },
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/cmc/collaboration/presence
 * @description Update user presence status
 */
router.post('/presence', async (req, res) => {
  try {
    const { workflowId, status } = req.body;
    const userId = req.user?.id || 'current-user-id';

    const presence = {
      userId,
      workflowId,
      status: status || 'online', // online, away, offline
      lastSeen: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
    };

    activeUsers.set(`${workflowId}-${userId}`, presence);

    res.json({
      success: true,
      data: presence,
      message: 'Presence updated successfully',
    });

    // In production, broadcast presence update via WebSocket
    // broadcastToWorkflow(workflowId, 'presence_update', presence);
  } catch (error) {
    console.error('Error updating presence:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @route POST /api/cmc/collaboration/share
 * @description Share workflow with external stakeholders
 */
router.post('/share', async (req, res) => {
  try {
    const { workflowId, recipients, permissions, message } = req.body;

    // Generate share link
    const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const shareLink = `${req.protocol}://${req.get('host')}/shared/workflow/${shareId}`;

    const shareRecord = {
      id: shareId,
      workflowId,
      sharedBy: req.user?.id || 'current-user-id',
      recipients: recipients || [],
      permissions: permissions || ['read'],
      message: message || '',
      shareLink,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      createdAt: new Date().toISOString(),
      accessCount: 0,
    };

    // In production, save to database and send notification emails

    res.json({
      success: true,
      data: shareRecord,
      message: 'Workflow shared successfully',
    });
  } catch (error) {
    console.error('Error sharing workflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
