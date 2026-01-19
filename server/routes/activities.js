/**
 * Activity Feed & Notifications API Routes
 * Handles all activity tracking, notifications, and user presence
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import {
  activityFeed,
  notifications,
  userFollowing,
  notificationPreferences,
  userPresence,
  activityReactions,
  insertActivityFeedSchema,
  insertNotificationSchema,
  insertUserFollowingSchema,
  insertNotificationPreferencesSchema,
  insertUserPresenceSchema,
  insertActivityReactionSchema,
  auditEvents,
  users,
  organizations,
  projects,
  clientWorkspaces,
  cerv2Sections,
  cerv2Evidence,
  regulatoryClaims,
  organizationUsers,
} from '../../shared/schema.ts';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createServer } from 'http';
import { Server } from 'socket.io';

const router = express.Router();
const pool = getPool();
const db = drizzle(pool);

// WebSocket server instance (will be initialized in server/index.ts)
let io = null;

/**
 * Initialize WebSocket server for real-time updates
 */
export function initializeSocketIO(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle user authentication and presence
    socket.on('authenticate', async (data) => {
      const { userId, organizationId } = data;
      socket.userId = userId;
      socket.organizationId = organizationId;
      
      // Join organization and user rooms
      socket.join(`org-${organizationId}`);
      socket.join(`user-${userId}`);
      
      // Update user presence
      await updateUserPresence(userId, 'online', socket.id);
      
      // Notify others in organization
      socket.to(`org-${organizationId}`).emit('user_presence_changed', {
        userId,
        status: 'online',
      });
    });

    // Handle heartbeat for presence tracking
    socket.on('heartbeat', async () => {
      if (socket.userId) {
        await updateUserPresence(socket.userId, 'online', socket.id);
      }
    });

    // Handle user going away
    socket.on('user_away', async () => {
      if (socket.userId) {
        await updateUserPresence(socket.userId, 'away', socket.id);
        socket.to(`org-${socket.organizationId}`).emit('user_presence_changed', {
          userId: socket.userId,
          status: 'away',
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      if (socket.userId) {
        await updateUserPresence(socket.userId, 'offline', null);
        socket.to(`org-${socket.organizationId}`).emit('user_presence_changed', {
          userId: socket.userId,
          status: 'offline',
        });
      }
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

/**
 * Helper function to update user presence
 */
async function updateUserPresence(userId, status, socketId) {
  try {
    await db
      .insert(userPresence)
      .values({
        userId,
        status,
        socketId,
        lastHeartbeatAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPresence.userId,
        set: {
          status,
          socketId,
          lastHeartbeatAt: new Date(),
          lastActivityAt: status === 'online' ? new Date() : undefined,
        },
      });
  } catch (error) {
    console.error('Error updating user presence:', error);
  }
}

/**
 * Broadcast activity to relevant users
 */
export function broadcastActivity(activity, organizationId, affectedUserIds = []) {
  if (!io) return;
  
  // Broadcast to organization
  io.to(`org-${organizationId}`).emit('new_activity', activity);
  
  // Send notifications to specific users if needed
  affectedUserIds.forEach(userId => {
    io.to(`user-${userId}`).emit('new_notification', {
      type: 'activity',
      activity,
    });
  });
}

/**
 * Send notification to specific user
 */
export function sendNotificationToUser(notification, userId) {
  if (!io) return;
  io.to(`user-${userId}`).emit('new_notification', notification);
}

// ============================================================================
// ACTIVITY FEED ENDPOINTS
// ============================================================================

/**
 * Get activity feed for organization
 */
router.get('/activities', async (req, res) => {
  try {
    const { organizationId } = req.headers;
    const { 
      limit = 50, 
      offset = 0, 
      activityType,
      userId,
      entityType,
      entityId,
      dateFrom,
      dateTo,
    } = req.query;

    let query = db
      .select()
      .from(activityFeed)
      .where(eq(activityFeed.organizationId, parseInt(organizationId)));

    // Apply filters
    const conditions = [];
    if (activityType) conditions.push(eq(activityFeed.activityType, activityType));
    if (userId) conditions.push(eq(activityFeed.userId, parseInt(userId)));
    if (entityType) conditions.push(eq(activityFeed.entityType, entityType));
    if (entityId) conditions.push(eq(activityFeed.entityId, entityId));
    if (dateFrom) conditions.push(gte(activityFeed.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(activityFeed.createdAt, new Date(dateTo)));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const activities = await query
      .orderBy(desc(activityFeed.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    res.json(activities);
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

/**
 * Create new activity
 */
router.post('/activities', async (req, res) => {
  try {
    const { organizationId, 'x-user-id': userId } = req.headers;
    const activityData = insertActivityFeedSchema.parse({
      ...req.body,
      activityId: `act_${uuidv4()}`,
      organizationId: parseInt(organizationId),
      userId: parseInt(userId),
    });

    const [activity] = await db.insert(activityFeed).values(activityData).returning();
    
    // Broadcast to real-time subscribers
    broadcastActivity(activity, organizationId);
    
    // Create notifications for affected users
    await createNotificationsForActivity(activity);
    
    res.json(activity);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

/**
 * Add reaction to activity
 */
router.post('/activities/:activityId/reactions', async (req, res) => {
  try {
    const { activityId } = req.params;
    const { 'x-user-id': userId } = req.headers;
    const { reactionType } = req.body;

    const [reaction] = await db
      .insert(activityReactions)
      .values({
        activityId,
        userId: parseInt(userId),
        reactionType,
      })
      .onConflictDoNothing()
      .returning();

    // Update activity reaction count
    await db
      .update(activityFeed)
      .set({
        likes: sql`${activityFeed.likes} + 1`,
        reactions: sql`
          CASE 
            WHEN reactions IS NULL THEN jsonb_build_object('${reactionType}', 1)
            WHEN reactions->'${reactionType}' IS NULL THEN reactions || jsonb_build_object('${reactionType}', 1)
            ELSE jsonb_set(reactions, '{${reactionType}}', to_jsonb((reactions->>'${reactionType}')::int + 1))
          END
        `,
      })
      .where(eq(activityFeed.activityId, activityId));

    res.json(reaction);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

/**
 * Remove reaction from activity
 */
router.delete('/activities/:activityId/reactions/:reactionType', async (req, res) => {
  try {
    const { activityId, reactionType } = req.params;
    const { 'x-user-id': userId } = req.headers;

    await db
      .delete(activityReactions)
      .where(
        and(
          eq(activityReactions.activityId, activityId),
          eq(activityReactions.userId, parseInt(userId)),
          eq(activityReactions.reactionType, reactionType)
        )
      );

    // Update activity reaction count
    await db
      .update(activityFeed)
      .set({
        likes: sql`GREATEST(${activityFeed.likes} - 1, 0)`,
        reactions: sql`
          CASE 
            WHEN reactions->'${reactionType}' IS NOT NULL AND (reactions->>'${reactionType}')::int > 1
            THEN jsonb_set(reactions, '{${reactionType}}', to_jsonb((reactions->>'${reactionType}')::int - 1))
            ELSE reactions - '${reactionType}'
          END
        `,
      })
      .where(eq(activityFeed.activityId, activityId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// ============================================================================
// NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * Get notifications for user
 */
router.get('/notifications', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;
    const { 
      limit = 20, 
      offset = 0,
      unreadOnly = false,
      category,
      priority,
    } = req.query;

    let query = db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, parseInt(userId)));

    // Apply filters
    const conditions = [];
    if (unreadOnly === 'true') conditions.push(eq(notifications.isRead, false));
    if (category) conditions.push(eq(notifications.category, category));
    if (priority) conditions.push(eq(notifications.priority, priority));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const userNotifications = await query
      .orderBy(desc(notifications.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    // Get unread count
    const [{ count }] = await db
      .select({ count: sql`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, parseInt(userId)),
          eq(notifications.isRead, false)
        )
      );

    res.json({
      notifications: userNotifications,
      unreadCount: count,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * Mark notification as read
 */
router.put('/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { 'x-user-id': userId } = req.headers;

    const [notification] = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.notificationId, notificationId),
          eq(notifications.recipientId, parseInt(userId))
        )
      )
      .returning();

    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * Mark all notifications as read
 */
router.put('/notifications/read-all', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;

    await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.recipientId, parseInt(userId)),
          eq(notifications.isRead, false)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * Clear all notifications
 */
router.delete('/notifications/clear-all', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;

    await db
      .update(notifications)
      .set({
        isDismissed: true,
        dismissedAt: new Date(),
      })
      .where(eq(notifications.recipientId, parseInt(userId)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// ============================================================================
// FOLLOWING SYSTEM ENDPOINTS
// ============================================================================

/**
 * Get user's following list
 */
router.get('/following', async (req, res) => {
  try {
    const { 'x-user-id': userId, organizationId } = req.headers;

    const following = await db
      .select()
      .from(userFollowing)
      .where(
        and(
          eq(userFollowing.userId, parseInt(userId)),
          eq(userFollowing.organizationId, parseInt(organizationId))
        )
      )
      .orderBy(desc(userFollowing.followedAt));

    res.json(following);
  } catch (error) {
    console.error('Error fetching following list:', error);
    res.status(500).json({ error: 'Failed to fetch following list' });
  }
});

/**
 * Follow entity
 */
router.post('/follow', async (req, res) => {
  try {
    const { 'x-user-id': userId, organizationId } = req.headers;
    const { entityType, entityId, entityName, autoFollowed = false } = req.body;

    const [following] = await db
      .insert(userFollowing)
      .values({
        userId: parseInt(userId),
        organizationId: parseInt(organizationId),
        entityType,
        entityId,
        entityName,
        autoFollowed,
        notifyOnActivity: true,
      })
      .onConflictDoNothing()
      .returning();

    res.json(following);
  } catch (error) {
    console.error('Error following entity:', error);
    res.status(500).json({ error: 'Failed to follow entity' });
  }
});

/**
 * Unfollow entity
 */
router.delete('/follow', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;
    const { entityType, entityId } = req.body;

    await db
      .delete(userFollowing)
      .where(
        and(
          eq(userFollowing.userId, parseInt(userId)),
          eq(userFollowing.entityType, entityType),
          eq(userFollowing.entityId, entityId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error unfollowing entity:', error);
    res.status(500).json({ error: 'Failed to unfollow entity' });
  }
});

// ============================================================================
// NOTIFICATION PREFERENCES ENDPOINTS
// ============================================================================

/**
 * Get user notification preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;

    let [preferences] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, parseInt(userId)));

    // Create default preferences if not exists
    if (!preferences) {
      [preferences] = await db
        .insert(notificationPreferences)
        .values({
          userId: parseInt(userId),
        })
        .returning();
    }

    res.json(preferences);
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * Update notification preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;

    const [preferences] = await db
      .insert(notificationPreferences)
      .values({
        userId: parseInt(userId),
        ...req.body,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          ...req.body,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json(preferences);
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ============================================================================
// USER PRESENCE ENDPOINTS
// ============================================================================

/**
 * Get online users in organization
 */
router.get('/presence', async (req, res) => {
  try {
    const { organizationId } = req.headers;

    // Get users in organization
    const orgUsers = await db
      .select({
        userId: organizationUsers.userId,
      })
      .from(organizationUsers)
      .where(eq(organizationUsers.organizationId, parseInt(organizationId)));

    const userIds = orgUsers.map(u => u.userId);

    // Get presence for these users
    const presence = await db
      .select()
      .from(userPresence)
      .where(inArray(userPresence.userId, userIds));

    res.json(presence);
  } catch (error) {
    console.error('Error fetching presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence' });
  }
});

/**
 * Update current viewing context
 */
router.put('/presence/context', async (req, res) => {
  try {
    const { 'x-user-id': userId } = req.headers;
    const { documentId, componentId, pageUrl } = req.body;

    const [presence] = await db
      .update(userPresence)
      .set({
        currentDocumentId: documentId,
        currentComponentId: componentId,
        currentPageUrl: pageUrl,
        lastActivityAt: new Date(),
      })
      .where(eq(userPresence.userId, parseInt(userId)))
      .returning();

    res.json(presence);
  } catch (error) {
    console.error('Error updating presence context:', error);
    res.status(500).json({ error: 'Failed to update presence context' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create notifications for activity based on following and mentions
 */
async function createNotificationsForActivity(activity) {
  try {
    const notificationsToCreate = [];

    // Get users following this entity
    const followers = await db
      .select()
      .from(userFollowing)
      .where(
        and(
          eq(userFollowing.entityType, activity.entityType),
          eq(userFollowing.entityId, activity.entityId),
          eq(userFollowing.notifyOnActivity, true)
        )
      );

    // Create notifications for followers
    for (const follower of followers) {
      if (follower.userId !== activity.userId) { // Don't notify the actor
        notificationsToCreate.push({
          notificationId: `notif_${uuidv4()}`,
          organizationId: activity.organizationId,
          recipientId: follower.userId,
          type: 'activity',
          category: 'collaboration',
          priority: 'normal',
          title: `${activity.userName} ${activity.action} ${activity.entityType}`,
          message: activity.description || `${activity.entityName} was ${activity.action}`,
          actionUrl: `/entity/${activity.entityType}/${activity.entityId}`,
          activityId: activity.activityId,
        });
      }
    }

    // Check for mentions in activity description
    const mentionRegex = /@(\w+)/g;
    const mentions = activity.description?.match(mentionRegex) || [];
    
    for (const mention of mentions) {
      const username = mention.substring(1);
      // Look up user by username (would need to add username to users table)
      // For now, we'll skip this part
    }

    // Insert all notifications
    if (notificationsToCreate.length > 0) {
      const created = await db.insert(notifications).values(notificationsToCreate).returning();
      
      // Send real-time notifications
      created.forEach(notification => {
        sendNotificationToUser(notification, notification.recipientId);
      });
    }
  } catch (error) {
    console.error('Error creating notifications for activity:', error);
  }
}

export default router;