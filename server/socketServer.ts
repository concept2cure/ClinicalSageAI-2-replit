import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';

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

// Store active document rooms and collaborators
const documentRooms = new Map<string, Map<string, CollaboratorInfo>>();
const socketToUser = new Map<string, { userId: string; documentId: string }>();
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
      origin: "*",
      methods: ["GET", "POST"],
    },
    path: '/socket.io/',
  });
  const ioInstance = io;
  if (!ioInstance) {
    return;
  }

  ioInstance.on('connection', (socket: Socket) => {
    console.log('New WebSocket connection:', socket.id);

    // Join room based on organization/project
    socket.on('join-room', (data: { room: string }) => {
      console.log(`Socket ${socket.id} joining room: ${data.room}`);
      socket.join(data.room);
      socket.emit('room-joined', { room: data.room });
    });

    // ========== Collaboration Events for eCTD Co-Author ==========

    // Join document collaboration room
    socket.on('join-document', (data: {
      documentId: string;
      user: { id: string; name: string; email?: string; avatar?: string }
    }) => {
      const { documentId, user } = data;
      const roomName = `doc_${documentId}`;

      // Leave any previous document rooms
      const previousRoom = socketToUser.get(socket.id);
      if (previousRoom) {
        socket.leave(`doc_${previousRoom.documentId}`);
        handleUserLeaveDocument(socket, previousRoom.documentId, previousRoom.userId);
      }

      // Join new document room
      socket.join(roomName);

      // Get or create collaborators map for this document
      if (!documentRooms.has(documentId)) {
        documentRooms.set(documentId, new Map());
      }

      const collaborators = documentRooms.get(documentId)!;
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
      socketToUser.set(socket.id, { userId: user.id, documentId });

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

      if (!documentActivities.has(documentId)) {
        documentActivities.set(documentId, []);
      }
      documentActivities.get(documentId)!.push(activity);

      // Notify other collaborators
      socket.to(roomName).emit('collaborator-joined', {
        collaborator,
        activity,
        collaborators: Array.from(collaborators.values())
      });

      // Send current state to the joining user
      socket.emit('document-state', {
        collaborators: Array.from(collaborators.values()),
        activities: documentActivities.get(documentId) || [],
        comments: documentComments.get(documentId) || [],
        locks: Array.from(sectionLocks.entries())
          .filter(([key]) => key.startsWith(`${documentId}_`))
          .map(([, lock]) => lock)
      });

      console.log(`User ${user.name} joined document ${documentId}`);
    });

    // Handle cursor movement
    socket.on('cursor-move', (data: { documentId: string; position: Omit<CursorPosition, 'timestamp'> }) => {
      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

      const cursor: CursorPosition = {
        ...data.position,
        timestamp: Date.now()
      };

      socket.to(`doc_${data.documentId}`).emit('cursor-update', cursor);
    });

    // Handle text selection
    socket.on('selection-change', (data: { documentId: string; selection: Omit<SelectionRange, 'timestamp'> }) => {
      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

      const selection: SelectionRange = {
        ...data.selection,
        timestamp: Date.now()
      };

      socket.to(`doc_${data.documentId}`).emit('selection-update', selection);
    });

    // Handle document changes (for real-time sync)
    socket.on('document-change', (data: DocumentChange) => {
      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

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

      if (!documentActivities.has(data.documentId)) {
        documentActivities.set(data.documentId, []);
      }
      documentActivities.get(data.documentId)!.push(activity);

      // Broadcast change to other collaborators
      socket.to(`doc_${data.documentId}`).emit('document-updated', {
        change: data,
        activity
      });

      // Update user's last activity
      const collaborators = documentRooms.get(data.documentId);
      if (collaborators && collaborators.has(data.userId)) {
        const collaborator = collaborators.get(data.userId)!;
        collaborator.lastActivity = new Date();
        collaborator.status = 'editing';
        collaborator.currentSection = data.section;
      }
    });

    // Handle typing indicator
    socket.on('typing-start', (data: { documentId: string; userId: string; userName: string; section?: string }) => {
      socket.to(`doc_${data.documentId}`).emit('user-typing', {
        userId: data.userId,
        userName: data.userName,
        section: data.section,
        isTyping: true
      });
    });

    socket.on('typing-stop', (data: { documentId: string; userId: string }) => {
      socket.to(`doc_${data.documentId}`).emit('user-typing', {
        userId: data.userId,
        isTyping: false
      });
    });

    // Handle section locking
    socket.on('lock-section', (data: { documentId: string; sectionId: string; userId: string; userName: string }) => {
      const lockKey = `${data.documentId}_${data.sectionId}`;

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

      if (!documentActivities.has(data.documentId)) {
        documentActivities.set(data.documentId, []);
      }
      documentActivities.get(data.documentId)!.push(activity);

      // Notify all collaborators
      ioInstance.to(`doc_${data.documentId}`).emit('section-locked', {
        lock,
        activity
      });
    });

    socket.on('unlock-section', (data: { documentId: string; sectionId: string; userId: string; userName: string }) => {
      const lockKey = `${data.documentId}_${data.sectionId}`;

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

          if (!documentActivities.has(data.documentId)) {
            documentActivities.set(data.documentId, []);
          }
          documentActivities.get(data.documentId)!.push(activity);

          // Notify all collaborators
          ioInstance.to(`doc_${data.documentId}`).emit('section-unlocked', {
            sectionId: data.sectionId,
            activity
          });
        }
      }
    });

    // Handle comments
    socket.on('add-comment', (data: { documentId: string; comment: Omit<Comment, 'id' | 'timestamp'> }) => {
      const comment: Comment = {
        ...data.comment,
        id: generateCommentId(),
        timestamp: new Date()
      };

      if (!documentComments.has(data.documentId)) {
        documentComments.set(data.documentId, []);
      }
      documentComments.get(data.documentId)!.push(comment);

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

      if (!documentActivities.has(data.documentId)) {
        documentActivities.set(data.documentId, []);
      }
      documentActivities.get(data.documentId)!.push(activity);

      // Notify all collaborators
      ioInstance.to(`doc_${data.documentId}`).emit('comment-added', {
        comment,
        activity
      });

      // Send notifications to mentioned users
      if (comment.mentions && comment.mentions.length > 0) {
        comment.mentions.forEach(mentionedUserId => {
          const collaborators = documentRooms.get(data.documentId);
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
      const comments = documentComments.get(data.documentId);
      if (comments) {
        const comment = comments.find(c => c.id === data.commentId);
        if (comment) {
          comment.resolved = true;

          ioInstance.to(`doc_${data.documentId}`).emit('comment-resolved', {
            commentId: data.commentId,
            resolvedBy: data.userName
          });
        }
      }
    });

    // Handle document status changes
    socket.on('document-status-change', (data: {
      documentId: string;
      userId: string;
      userName: string;
      oldStatus: string;
      newStatus: string;
    }) => {
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

      if (!documentActivities.has(data.documentId)) {
        documentActivities.set(data.documentId, []);
      }
      documentActivities.get(data.documentId)!.push(activity);

      // Notify all collaborators
      ioInstance.to(`doc_${data.documentId}`).emit('status-changed', {
        newStatus: data.newStatus,
        activity
      });
    });

    // Handle user presence updates
    socket.on('presence-update', (data: { documentId: string; userId: string; status: 'online' | 'idle' | 'editing' }) => {
      const collaborators = documentRooms.get(data.documentId);
      if (collaborators && collaborators.has(data.userId)) {
        const collaborator = collaborators.get(data.userId)!;
        collaborator.status = data.status;
        collaborator.lastActivity = new Date();

        socket.to(`doc_${data.documentId}`).emit('collaborator-status-update', {
          userId: data.userId,
          status: data.status
        });
      }
    });

    // ========== Original Task Management Events ==========

    // Handle task events
    socket.on('task-created', (task: TaskData) => {
      console.log('Broadcasting task-created:', task);
      socket.broadcast.emit('task-created', task);
    });

    socket.on('task-updated', (task: TaskData) => {
      console.log('Broadcasting task-updated:', task);
      socket.broadcast.emit('task-updated', task);
    });

    socket.on('task-deleted', (taskId: string) => {
      console.log('Broadcasting task-deleted:', taskId);
      socket.broadcast.emit('task-deleted', taskId);
    });

    socket.on('task-escalated', (task: TaskData) => {
      console.log('Broadcasting task-escalated:', task);
      socket.broadcast.emit('task-escalated', task);
    });

    // Handle batch operations
    socket.on('batch-update', (data: BatchUpdateData) => {
      console.log('Broadcasting batch-update:', data);
      socket.broadcast.emit('batch-update', data);
    });

    // Handle user presence
    socket.on('user-active', (user: UserData) => {
      socket.broadcast.emit('user-active', user);
    });

    // Handle notification events
    socket.on('notification-sent', (notification: any) => {
      console.log('Broadcasting notification:', notification);
      socket.broadcast.emit('notification-received', notification);
    });

    // Handle recurring task events
    socket.on('recurring-task-created', (task: TaskData) => {
      console.log('Broadcasting recurring task:', task);
      socket.broadcast.emit('recurring-task-created', task);
    });

    // Handle compliance events
    socket.on('compliance-check', (data: any) => {
      console.log('Broadcasting compliance check:', data);
      socket.broadcast.emit('compliance-update', data);
    });

    // Handle time tracking events
    socket.on('timer-started', (data: { taskId: string; userId: string }) => {
      console.log('Broadcasting timer started:', data);
      socket.broadcast.emit('timer-started', data);
    });

    socket.on('timer-stopped', (data: { taskId: string; userId: string; duration: number }) => {
      console.log('Broadcasting timer stopped:', data);
      socket.broadcast.emit('timer-stopped', data);
    });

    // ========== Field Synchronization Events for FDA 510(k) ==========

    // Subscribe to field updates for a project
    socket.on('subscribe-fields', (data: { projectId: string; userId: string; userName?: string; fields?: string[] }) => {
      const { projectId, userId, userName, fields } = data;
      const roomName = `project_fields_${projectId}`;

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

      console.log(`User ${userName || userId} subscribed to fields for project ${projectId}`);
      socket.emit('field-subscription-confirmed', { projectId, fields });
    });

    // Handle field update
    socket.on('update-field', async (data: FieldUpdate) => {
      const { projectId, source, field, value, previousValue, userId, userName } = data;
      const roomName = `project_fields_${projectId}`;

      // Log the field update
      console.log(`Field update: ${field} in project ${projectId} by ${userName || userId}`);

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
        console.error('Field update error:', error);
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
        console.error('Error checking field completeness:', error);
        socket.emit('field-completeness-error', {
          projectId,
          error: error instanceof Error ? error.message : 'Failed to check completeness'
        });
      }
    });

    // Unsubscribe from field updates
    socket.on('unsubscribe-fields', (data: { projectId: string }) => {
      const { projectId } = data;
      const roomName = `project_fields_${projectId}`;

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
      console.log(`Socket ${socket.id} unsubscribed from project ${projectId} fields`);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected:', socket.id);

      // Handle document collaboration cleanup
      const userInfo = socketToUser.get(socket.id);
      if (userInfo) {
        handleUserLeaveDocument(socket, userInfo.documentId, userInfo.userId);
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
      console.error('Socket error:', error);
    });
  });

  console.log('✅ Socket.io server initialized with collaboration features');
  return io;
}

function handleUserLeaveDocument(socket: Socket, documentId: string, userId: string) {
  const collaborators = documentRooms.get(documentId);

  if (collaborators && collaborators.has(userId)) {
    const user = collaborators.get(userId)!;
    collaborators.delete(userId);

    // Remove user's locks
    const userLocks: string[] = [];
    sectionLocks.forEach((lock, key) => {
      if (key.startsWith(`${documentId}_`) && lock.userId === userId) {
        userLocks.push(key);
      }
    });
    userLocks.forEach(key => sectionLocks.delete(key));

    // Add leave activity
    const activity: Activity = {
      id: generateActivityId(),
      documentId,
      userId: userId,
      userName: user.name,
      userAvatar: user.avatar,
      action: 'leave',
      details: { message: `${user.name} left the document` },
      timestamp: new Date()
    };

    if (!documentActivities.has(documentId)) {
      documentActivities.set(documentId, []);
    }
    documentActivities.get(documentId)!.push(activity);

    // Notify other collaborators
    socket.to(`doc_${documentId}`).emit('collaborator-left', {
      userId,
      userName: user.name,
      activity,
      unlockedSections: userLocks.map(key => key.split('_')[1]),
      collaborators: Array.from(collaborators.values())
    });

    // Clean up empty rooms
    if (collaborators.size === 0) {
      documentRooms.delete(documentId);
      // Keep last 50 activities for history
      const activities = documentActivities.get(documentId);
      if (activities && activities.length > 50) {
        documentActivities.set(documentId, activities.slice(-50));
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

// Document collaboration utility functions
export function notifyDocumentChange(documentId: string, change: DocumentChange) {
  if (io) {
    io.to(`doc_${documentId}`).emit('document-updated', { change });
  }
}

export function getActiveCollaborators(documentId: string): CollaboratorInfo[] {
  const collaborators = documentRooms.get(documentId);
  return collaborators ? Array.from(collaborators.values()) : [];
}

export function getDocumentActivities(documentId: string, limit: number = 50): Activity[] {
  const activities = documentActivities.get(documentId) || [];
  return activities.slice(-limit);
}

export function getDocumentComments(documentId: string): Comment[] {
  return documentComments.get(documentId) || [];
}
