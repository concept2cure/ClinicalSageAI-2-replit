import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { createScopedLogger } from './utils/logger.js';
const log = createScopedLogger('socket-server');

// Define types for socket events
interface TaskData {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  [key: string]: any;
}

interface BatchUpdateData {
  taskIds: string[];
  updates: Partial<TaskData>;
}

interface UserData {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color?: string;
  status: 'active' | 'idle' | 'away';
  [key: string]: any;
}

// Collaboration types for eCTD Co-Author
interface CollaboratorInfo {
  id: string;
  socketId: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
  status: 'online' | 'editing' | 'idle';
  lastActivity: Date;
  currentSection?: string;
}

interface CursorPosition {
  userId: string;
  userName: string;
  x: number;
  y: number;
  section?: string;
  color: string;
  timestamp: number;
}

interface SelectionRange {
  userId: string;
  userName: string;
  start: number;
  end: number;
  section?: string;
  color: string;
  timestamp: number;
}

interface SectionLock {
  sectionId: string;
  userId: string;
  userName: string;
  lockedAt: Date;
  expiresAt: Date;
}

interface Comment {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  mentions?: string[];
  timestamp: Date;
  resolved?: boolean;
  parentId?: string;
  position?: {
    section: string;
    offset: number;
  };
}

interface Activity {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: 'edit' | 'comment' | 'mention' | 'join' | 'leave' | 'lock' | 'unlock' | 'save' | 'status_change';
  details: any;
  timestamp: Date;
}

interface DocumentChange {
  documentId: string;
  userId: string;
  userName: string;
  section: string;
  content: string;
  operation: 'insert' | 'delete' | 'replace';
  timestamp: Date;
}

// Field synchronization types for FDA 510(k) workflow
interface FieldUpdate {
  projectId: string;
  source: 'workflow' | 'document';
  field: string;
  value: any;
  previousValue?: any;
  userId: string;
  userName?: string;
  timestamp: Date;
}

interface FieldSubscription {
  projectId: string;
  userId: string;
  socketId: string;
  fields?: string[]; // Optional specific fields to watch
}

// Extended socket interface with tenant context
interface AuthenticatedSocket extends Socket {
  orgId?: string;
  authUserId?: string;
}

// Store active document rooms and collaborators (keys are now org-scoped: "org_<orgId>_<docId>")
const documentRooms = new Map<string, Map<string, CollaboratorInfo>>();
const socketToUser = new Map<string, { userId: string; documentId: string; orgId: string }>();
const documentActivities = new Map<string, Activity[]>();
const documentComments = new Map<string, Comment[]>();
const sectionLocks = new Map<string, SectionLock>();

// Store field synchronization subscriptions
const fieldSubscriptions = new Map<string, Set<FieldSubscription>>();
const socketToProject = new Map<string, string>();

// Color palette for collaborators
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA3FF', '#74B9FF', '#A29BFE', '#FD79A8', '#FDCB6E',
  '#6C5CE7', '#00B894', '#E17055', '#00CEC9', '#B2BEC3'
];

let io: SocketIOServer | null = null;

// Generate a unique color for a user
function getUserColor(index: number): string {
  return COLORS[index % COLORS.length];
}

// Generate activity ID
function generateActivityId(): string {
  return `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate comment ID
function generateCommentId(): string {
  return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function initializeSocketServer(server: Server) {
  io = new SocketIOServer(server, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean),
      methods: ["GET", "POST"],
    },
    path: '/socket.io/',
  });
  const ioInstance = io;
  if (!ioInstance) {
    return;
  }

  // TODO: Add @socket.io/redis-adapter for horizontal scaling when the package is available
  // Install: npm install @socket.io/redis-adapter
  // Then: import { createAdapter } from '@socket.io/redis-adapter';
  //       const { getRedisClient } = await import('./services/ai-actions/redis-manager.js');
  //       const client = getRedisClient();
  //       if (client) io.adapter(createAdapter(client, client.duplicate()));

  // Authentication middleware — extract orgId from JWT for tenant isolation
  ioInstance.use((socket: AuthenticatedSocket, next) => {
    try {
      if (!process.env.JWT_SECRET) {
        return next(new Error('WebSocket auth unavailable'));
      }
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Missing bearer token'));
      }

      const decoded = jwt.verify(token as string, process.env.JWT_SECRET) as any;
      if (!decoded.organizationId || !decoded.userId) {
        return next(new Error('Invalid token claims'));
      }

      socket.orgId = String(decoded.organizationId);
      socket.authUserId = String(decoded.userId);
      next();
    } catch (err: any) {
      log.warn(`[Socket.io] Auth failed for ${socket.id}: ${err?.message}`);
      next(new Error('Invalid token'));
    }
  });

  ioInstance.on('connection', (socket: AuthenticatedSocket) => {
    const orgId = socket.orgId;
    if (!orgId) {
      socket.disconnect(true);
      return;
    }
    log.debug(`New WebSocket connection: ${socket.id} (org: ${orgId})`);

    // Helper to build tenant-scoped room names
    const scopedRoom = (roomName: string) => `org_${orgId}_${roomName}`;

    // Join room based on organization/project (tenant-scoped)
    socket.on('join-room', (data: { room: string }) => {
      const room = scopedRoom(data.room);
      log.debug(`Socket ${socket.id} joining room: ${room}`);
      socket.join(room);
      socket.emit('room-joined', { room: data.room });
    });

    // ========== Collaboration Events for eCTD Co-Author ==========

    // Join document collaboration room (tenant-scoped)
    socket.on('join-document', (data: {
      documentId: string;
      user: { id: string; name: string; email?: string; avatar?: string }
    }) => {
      const { documentId, user } = data;
      const roomName = scopedRoom(`doc_${documentId}`);
      const docKey = `${orgId}_${documentId}`;

      // Leave any previous document rooms
      const previousRoom = socketToUser.get(socket.id);
      if (previousRoom) {
        socket.leave(scopedRoom(`doc_${previousRoom.documentId}`));
        handleUserLeaveDocument(socket, `${previousRoom.orgId}_${previousRoom.documentId}`, previousRoom.userId, previousRoom.orgId);
      }

      // Join new document room
      socket.join(roomName);

      // Get or create collaborators map for this document (org-scoped key)
      if (!documentRooms.has(docKey)) {
        documentRooms.set(docKey, new Map());
      }

      const collaborators = documentRooms.get(docKey)!;
      const userIndex = collaborators.size;

      // Create collaborator info
      const collaborator: CollaboratorInfo = {
        id: user.id,
        socketId: socket.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        color: getUserColor(userIndex),
        status: 'online',
        lastActivity: new Date()
      };

      collaborators.set(user.id, collaborator);
      socketToUser.set(socket.id, { userId: user.id, documentId, orgId });

      // Add join activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        action: 'join',
        details: { message: `${user.name} joined the document` },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify other collaborators
      socket.to(roomName).emit('collaborator-joined', {
        collaborator,
        activity,
        collaborators: Array.from(collaborators.values())
      });

      // Send current state to the joining user
      socket.emit('document-state', {
        collaborators: Array.from(collaborators.values()),
        activities: documentActivities.get(docKey) || [],
        comments: documentComments.get(docKey) || [],
        locks: Array.from(sectionLocks.entries())
          .filter(([key]) => key.startsWith(`${docKey}_`))
          .map(([, lock]) => lock)
      });

      log.debug(`User ${user.name} joined document ${documentId} (org: ${orgId})`);
    });

    // Handle cursor movement
    socket.on('cursor-move', (data: { documentId: string; position: Omit<CursorPosition, 'timestamp'> }) => {
      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

      const cursor: CursorPosition = {
        ...data.position,
        timestamp: Date.now()
      };

      socket.to(scopedRoom(`doc_${data.documentId}`)).emit('cursor-update', cursor);
    });

    // Handle text selection
    socket.on('selection-change', (data: { documentId: string; selection: Omit<SelectionRange, 'timestamp'> }) => {
      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

      const selection: SelectionRange = {
        ...data.selection,
        timestamp: Date.now()
      };

      socket.to(scopedRoom(`doc_${data.documentId}`)).emit('selection-update', selection);
    });

    // Handle document changes (for real-time sync)
    socket.on('document-change', (data: DocumentChange) => {
      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

      const docKey = `${orgId}_${data.documentId}`;

      // Add edit activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId: data.documentId,
        userId: data.userId,
        userName: data.userName,
        action: 'edit',
        details: { section: data.section, operation: data.operation },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Broadcast change to other collaborators (tenant-scoped room)
      socket.to(scopedRoom(`doc_${data.documentId}`)).emit('document-updated', {
        change: data,
        activity
      });

      // Update user's last activity
      const collaborators = documentRooms.get(docKey);
      if (collaborators && collaborators.has(data.userId)) {
        const collaborator = collaborators.get(data.userId)!;
        collaborator.lastActivity = new Date();
        collaborator.status = 'editing';
        collaborator.currentSection = data.section;
      }
    });

    // Handle typing indicator (tenant-scoped)
    socket.on('typing-start', (data: { documentId: string; userId: string; userName: string; section?: string }) => {
      socket.to(scopedRoom(`doc_${data.documentId}`)).emit('user-typing', {
        userId: data.userId,
        userName: data.userName,
        section: data.section,
        isTyping: true
      });
    });

    socket.on('typing-stop', (data: { documentId: string; userId: string }) => {
      socket.to(scopedRoom(`doc_${data.documentId}`)).emit('user-typing', {
        userId: data.userId,
        isTyping: false
      });
    });

    // Handle section locking (tenant-scoped)
    socket.on('lock-section', (data: { documentId: string; sectionId: string; userId: string; userName: string }) => {
      const docKey = `${orgId}_${data.documentId}`;
      const lockKey = `${docKey}_${data.sectionId}`;

      // Check if section is already locked
      if (sectionLocks.has(lockKey)) {
        const existingLock = sectionLocks.get(lockKey)!;
        if (existingLock.userId !== data.userId) {
          socket.emit('lock-denied', {
            sectionId: data.sectionId,
            lockedBy: existingLock.userName,
            message: `Section is already locked by ${existingLock.userName}`
          });
          return;
        }
      }

      // Create lock
      const lock: SectionLock = {
        sectionId: data.sectionId,
        userId: data.userId,
        userName: data.userName,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minute expiry
      };

      sectionLocks.set(lockKey, lock);

      // Add lock activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId: data.documentId,
        userId: data.userId,
        userName: data.userName,
        action: 'lock',
        details: { section: data.sectionId },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify all collaborators (tenant-scoped room)
      ioInstance.to(scopedRoom(`doc_${data.documentId}`)).emit('section-locked', {
        lock,
        activity
      });
    });

    socket.on('unlock-section', (data: { documentId: string; sectionId: string; userId: string; userName: string }) => {
      const docKey = `${orgId}_${data.documentId}`;
      const lockKey = `${docKey}_${data.sectionId}`;

      if (sectionLocks.has(lockKey)) {
        const lock = sectionLocks.get(lockKey)!;
        if (lock.userId === data.userId) {
          sectionLocks.delete(lockKey);

          // Add unlock activity
          const activity: Activity = {
            id: generateActivityId(),
            documentId: data.documentId,
            userId: data.userId,
            userName: data.userName,
            action: 'unlock',
            details: { section: data.sectionId },
            timestamp: new Date()
          };

          if (!documentActivities.has(docKey)) {
            documentActivities.set(docKey, []);
          }
          documentActivities.get(docKey)!.push(activity);

          // Notify all collaborators (tenant-scoped room)
          ioInstance.to(scopedRoom(`doc_${data.documentId}`)).emit('section-unlocked', {
            sectionId: data.sectionId,
            activity
          });
        }
      }
    });

    // Handle comments (tenant-scoped)
    socket.on('add-comment', (data: { documentId: string; comment: Omit<Comment, 'id' | 'timestamp'> }) => {
      const docKey = `${orgId}_${data.documentId}`;
      const comment: Comment = {
        ...data.comment,
        id: generateCommentId(),
        timestamp: new Date()
      };

      if (!documentComments.has(docKey)) {
        documentComments.set(docKey, []);
      }
      documentComments.get(docKey)!.push(comment);

      // Add comment activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId: data.documentId,
        userId: comment.userId,
        userName: comment.userName,
        userAvatar: comment.userAvatar,
        action: 'comment',
        details: {
          commentId: comment.id,
          content: comment.content.substring(0, 100),
          mentions: comment.mentions
        },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify all collaborators (tenant-scoped room)
      ioInstance.to(scopedRoom(`doc_${data.documentId}`)).emit('comment-added', {
        comment,
        activity
      });

      // Send notifications to mentioned users
      if (comment.mentions && comment.mentions.length > 0) {
        comment.mentions.forEach(mentionedUserId => {
          const collaborators = documentRooms.get(docKey);
          if (collaborators && collaborators.has(mentionedUserId)) {
            const mentionedUser = collaborators.get(mentionedUserId)!;
            ioInstance.to(mentionedUser.socketId).emit('mention-notification', {
              comment,
              mentionedBy: comment.userName
            });
          }
        });
      }
    });

    socket.on('resolve-comment', (data: { documentId: string; commentId: string; userId: string; userName: string }) => {
      const docKey = `${orgId}_${data.documentId}`;
      const comments = documentComments.get(docKey);
      if (comments) {
        const comment = comments.find(c => c.id === data.commentId);
        if (comment) {
          comment.resolved = true;

          ioInstance.to(scopedRoom(`doc_${data.documentId}`)).emit('comment-resolved', {
            commentId: data.commentId,
            resolvedBy: data.userName
          });
        }
      }
    });

    // Handle document status changes (tenant-scoped)
    socket.on('document-status-change', (data: {
      documentId: string;
      userId: string;
      userName: string;
      oldStatus: string;
      newStatus: string;
    }) => {
      const docKey = `${orgId}_${data.documentId}`;
      const activity: Activity = {
        id: generateActivityId(),
        documentId: data.documentId,
        userId: data.userId,
        userName: data.userName,
        action: 'status_change',
        details: {
          from: data.oldStatus,
          to: data.newStatus
        },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify all collaborators (tenant-scoped room)
      ioInstance.to(scopedRoom(`doc_${data.documentId}`)).emit('status-changed', {
        newStatus: data.newStatus,
        activity
      });
    });

    // Handle user presence updates (tenant-scoped)
    socket.on('presence-update', (data: { documentId: string; userId: string; status: 'online' | 'idle' | 'editing' }) => {
      const docKey = `${orgId}_${data.documentId}`;
      const collaborators = documentRooms.get(docKey);
      if (collaborators && collaborators.has(data.userId)) {
        const collaborator = collaborators.get(data.userId)!;
        collaborator.status = data.status;
        collaborator.lastActivity = new Date();

        socket.to(scopedRoom(`doc_${data.documentId}`)).emit('collaborator-status-update', {
          userId: data.userId,
          status: data.status
        });
      }
    });

    // ========== Original Task Management Events ==========

    // Handle task events
    socket.on('task-created', (task: TaskData) => {
      log.debug('Broadcasting task-created:', task);
      socket.broadcast.emit('task-created', task);
    });

    socket.on('task-updated', (task: TaskData) => {
      log.debug('Broadcasting task-updated:', task);
      socket.broadcast.emit('task-updated', task);
    });

    socket.on('task-deleted', (taskId: string) => {
      log.debug('Broadcasting task-deleted:', taskId);
      socket.broadcast.emit('task-deleted', taskId);
    });

    socket.on('task-escalated', (task: TaskData) => {
      log.debug('Broadcasting task-escalated:', task);
      socket.broadcast.emit('task-escalated', task);
    });

    // Handle batch operations
    socket.on('batch-update', (data: BatchUpdateData) => {
      log.debug('Broadcasting batch-update:', data);
      socket.broadcast.emit('batch-update', data);
    });

    // Handle user presence
    socket.on('user-active', (user: UserData) => {
      socket.broadcast.emit('user-active', user);
    });

    // Handle notification events
    socket.on('notification-sent', (notification: any) => {
      log.debug('Broadcasting notification:', notification);
      socket.broadcast.emit('notification-received', notification);
    });

    // Handle recurring task events
    socket.on('recurring-task-created', (task: TaskData) => {
      log.debug('Broadcasting recurring task:', task);
      socket.broadcast.emit('recurring-task-created', task);
    });

    // Handle compliance events
    socket.on('compliance-check', (data: any) => {
      log.debug('Broadcasting compliance check:', data);
      socket.broadcast.emit('compliance-update', data);
    });

    // Handle time tracking events
    socket.on('timer-started', (data: { taskId: string; userId: string }) => {
      log.debug('Broadcasting timer started:', data);
      socket.broadcast.emit('timer-started', data);
    });

    socket.on('timer-stopped', (data: { taskId: string; userId: string; duration: number }) => {
      log.debug('Broadcasting timer stopped:', data);
      socket.broadcast.emit('timer-stopped', data);
    });

    // ========== Field Synchronization Events for FDA 510(k) ==========

    // Subscribe to field updates for a project (tenant-scoped)
    socket.on('subscribe-fields', (data: { projectId: string; userId: string; userName?: string; fields?: string[] }) => {
      const { projectId, userId, userName, fields } = data;
      const roomName = scopedRoom(`project_fields_${projectId}`);

      // Join project field room
      socket.join(roomName);

      // Store subscription
      if (!fieldSubscriptions.has(projectId)) {
        fieldSubscriptions.set(projectId, new Set());
      }

      const subscription: FieldSubscription = {
        projectId,
        userId,
        socketId: socket.id,
        fields
      };

      fieldSubscriptions.get(projectId)!.add(subscription);
      socketToProject.set(socket.id, projectId);

      log.debug(`User ${userName || userId} subscribed to fields for project ${projectId}`);
      socket.emit('field-subscription-confirmed', { projectId, fields });
    });

    // Handle field update (tenant-scoped)
    socket.on('update-field', async (data: FieldUpdate) => {
      const { projectId, source, field, value, previousValue, userId, userName } = data;
      const roomName = scopedRoom(`project_fields_${projectId}`);

      // Log the field update
      log.debug(`Field update: ${field} in project ${projectId} by ${userName || userId}`);

      // Import SmartFieldLinking service
      const { smartFieldLinking } = await import('./services/SmartFieldLinking.js');

      // Process field update through SmartFieldLinking
      try {
        const numericUserId = Number(userId);
        await smartFieldLinking.updateField({
          source,
          field,
          value,
          previousValue,
          userId: Number.isFinite(numericUserId) ? numericUserId : undefined,
          timestamp: new Date(),
          metadata: { projectId }
        });

        // Broadcast field update to all subscribers in the project
        io?.to(roomName).emit('field-updated', {
          projectId,
          source,
          field,
          value,
          previousValue,
          userId,
          userName,
          timestamp: new Date()
        });

        // Send confirmation to the sender
        socket.emit('field-update-success', { field, value });
      } catch (error) {
        log.error('Field update error:', error);
        socket.emit('field-update-error', {
          field,
          error: error instanceof Error ? error.message : 'Failed to update field'
        });
      }
    });

    // Get field completeness
    socket.on('get-field-completeness', async (data: { projectId: string }) => {
      const { projectId } = data;

      try {
        const { smartFieldLinking } = await import('./services/SmartFieldLinking.js');
        const completeness = await smartFieldLinking.checkFieldCompleteness(parseInt(projectId));

        socket.emit('field-completeness', {
          projectId,
          ...completeness
        });
      } catch (error) {
        log.error('Error checking field completeness:', error);
        socket.emit('field-completeness-error', {
          projectId,
          error: error instanceof Error ? error.message : 'Failed to check completeness'
        });
      }
    });

    // Unsubscribe from field updates (tenant-scoped)
    socket.on('unsubscribe-fields', (data: { projectId: string }) => {
      const { projectId } = data;
      const roomName = scopedRoom(`project_fields_${projectId}`);

      socket.leave(roomName);

      // Remove subscription
      const subscriptions = fieldSubscriptions.get(projectId);
      if (subscriptions) {
        subscriptions.forEach(sub => {
          if (sub.socketId === socket.id) {
            subscriptions.delete(sub);
          }
        });
      }

      socketToProject.delete(socket.id);
      log.debug(`Socket ${socket.id} unsubscribed from project ${projectId} fields`);
    });

    socket.on('disconnect', () => {
      log.debug('WebSocket disconnected:', socket.id);

      // Handle document collaboration cleanup
      const userInfo = socketToUser.get(socket.id);
      if (userInfo) {
        const disconnectOrgId = userInfo.orgId || orgId;
        handleUserLeaveDocument(socket, `${disconnectOrgId}_${userInfo.documentId}`, userInfo.userId, disconnectOrgId);
        socketToUser.delete(socket.id);
      }

      // Handle field subscription cleanup
      const projectId = socketToProject.get(socket.id);
      if (projectId) {
        const subscriptions = fieldSubscriptions.get(projectId);
        if (subscriptions) {
          subscriptions.forEach(sub => {
            if (sub.socketId === socket.id) {
              subscriptions.delete(sub);
            }
          });
        }
        socketToProject.delete(socket.id);
      }
    });

    // Error handling
    socket.on('error', (error: Error) => {
      log.error('Socket error:', error);
    });
  });

  log.debug('✅ Socket.io server initialized with collaboration features');
  return io;
}

function handleUserLeaveDocument(socket: Socket, docKey: string, userId: string, orgId?: string) {
  const collaborators = documentRooms.get(docKey);

  if (collaborators && collaborators.has(userId)) {
    const user = collaborators.get(userId)!;
    collaborators.delete(userId);

    // Extract raw documentId from the org-scoped key (format: "orgId_documentId")
    const parts = docKey.split('_');
    const rawDocumentId = parts.length > 1 ? parts.slice(1).join('_') : docKey;
    const resolvedOrgId = orgId || (parts.length > 1 ? parts[0] : 'default');

    // Remove user's locks
    const userLocks: string[] = [];
    sectionLocks.forEach((lock, key) => {
      if (key.startsWith(`${docKey}_`) && lock.userId === userId) {
        userLocks.push(key);
      }
    });
    userLocks.forEach(key => sectionLocks.delete(key));

    // Add leave activity
    const activity: Activity = {
      id: generateActivityId(),
      documentId: rawDocumentId,
      userId: userId,
      userName: user.name,
      userAvatar: user.avatar,
      action: 'leave',
      details: { message: `${user.name} left the document` },
      timestamp: new Date()
    };

    if (!documentActivities.has(docKey)) {
      documentActivities.set(docKey, []);
    }
    documentActivities.get(docKey)!.push(activity);

    // Notify other collaborators (tenant-scoped room)
    const roomName = `org_${resolvedOrgId}_doc_${rawDocumentId}`;
    socket.to(roomName).emit('collaborator-left', {
      userId,
      userName: user.name,
      activity,
      unlockedSections: userLocks.map(key => {
        // Lock keys are "orgId_docId_sectionId" — extract sectionId
        const lockParts = key.split('_');
        return lockParts[lockParts.length - 1];
      }),
      collaborators: Array.from(collaborators.values())
    });

    // Clean up empty rooms
    if (collaborators.size === 0) {
      documentRooms.delete(docKey);
      // Keep last 50 activities for history
      const activities = documentActivities.get(docKey);
      if (activities && activities.length > 50) {
        documentActivities.set(docKey, activities.slice(-50));
      }
    }
  }
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export function broadcastToRoom(room: string, event: string, data: any) {
  if (io) {
    io.to(room).emit(event, data);
  }
}

export function broadcastToAll(event: string, data: any) {
  if (io) {
    io.emit(event, data);
  }
}

// New utility functions for specific broadcasts
export function notifyTaskChange(taskId: string, changeType: 'created' | 'updated' | 'deleted', task?: TaskData) {
  if (io) {
    io.emit(`task-${changeType}`, task || taskId);
  }
}

export function notifyComplianceStatus(taskId: string, status: 'compliant' | 'non-compliant' | 'pending', details: any) {
  if (io) {
    io.emit('compliance-status', { taskId, status, details });
  }
}

export function notifyTimeTracking(taskId: string, userId: string, action: 'start' | 'stop' | 'update', duration?: number) {
  if (io) {
    io.emit('time-tracking', { taskId, userId, action, duration });
  }
}

// Document collaboration utility functions (tenant-scoped)
// orgId is required for tenant isolation; callers must provide it
export function notifyDocumentChange(orgId: string, documentId: string, change: DocumentChange) {
  if (io) {
    io.to(`org_${orgId}_doc_${documentId}`).emit('document-updated', { change });
  }
}

export function getActiveCollaborators(orgId: string, documentId: string): CollaboratorInfo[] {
  const docKey = `${orgId}_${documentId}`;
  const collaborators = documentRooms.get(docKey);
  return collaborators ? Array.from(collaborators.values()) : [];
}

export function getDocumentActivities(orgId: string, documentId: string, limit: number = 50): Activity[] {
  const docKey = `${orgId}_${documentId}`;
  const activities = documentActivities.get(docKey) || [];
  return activities.slice(-limit);
}

export function getDocumentComments(orgId: string, documentId: string): Comment[] {
  const docKey = `${orgId}_${documentId}`;
  return documentComments.get(docKey) || [];
}
