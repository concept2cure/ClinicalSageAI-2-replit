import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import { createScopedLogger } from './utils/logger.js';
import { verifyJwtWithRotation } from './utils/jwtVerify.js';
// Twin-safe imports: tokenType has no `.js` counterpart, and the two socket/*
// modules are `.ts`-only, so every resolver (tsc, vite/vitest, tsx) binds the
// same file. `./middleware/auth` is deliberately NOT imported — it has a stale
// `.js` twin that silently wins under vitest.
import { nonAccessTokenReason } from './middleware/tokenType';
import {
  orgRoom,
  documentRoom,
  projectFieldsRoom,
  emitToOrgPeers,
  emitToOrg,
} from './socket/tenantBroadcast.js';
import { isDocumentInOrg, isProjectInOrg } from './socket/socketAuthz.js';
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

// Field synchronization types for FDA 510(k) workflow.
// `userId` / `userName` are still accepted on the wire for backwards
// compatibility but are IGNORED — attribution comes from the authenticated
// socket only (C2C-COLLAB-002 / C2C-DEVICE-001).
interface FieldUpdate {
  projectId: string;
  source: 'workflow' | 'document';
  field: string;
  value: any;
  previousValue?: any;
  userId?: string;
  userName?: string;
  timestamp?: Date;
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
  authEmail?: string;
}

/**
 * The only identity the collaboration handlers may attribute work to. Built
 * once per connection from the VERIFIED handshake principal; no event payload
 * ever contributes to it.
 */
interface SocketActor {
  userId: string;
  name: string;
  email?: string;
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
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Missing bearer token'));
      }

      const decoded = verifyJwtWithRotation(token as string) as any;
      if (!decoded.organizationId || !decoded.userId) {
        return next(new Error('Invalid token claims'));
      }
      // Refresh / MFA-challenge / MFA-partial tokens are signed with the SAME
      // secret as access tokens; the access path must reject them explicitly or
      // a half-authenticated session can open a collaboration socket.
      const nonAccess = nonAccessTokenReason(decoded);
      if (nonAccess) {
        log.warn(`[Socket.io] Rejected non-access token (${nonAccess}) for ${socket.id}`);
        return next(new Error('Invalid token claims'));
      }

      socket.orgId = String(decoded.organizationId);
      socket.authUserId = String(decoded.userId);
      socket.authEmail = decoded.email != null ? String(decoded.email) : undefined;
      next();
    } catch (err: any) {
      log.warn(`[Socket.io] Auth failed for ${socket.id}: ${err?.message}`);
      next(new Error('Invalid token'));
    }
  });

  ioInstance.on('connection', (socket: AuthenticatedSocket) => {
    const orgId = socket.orgId;
    if (!orgId || !socket.authUserId) {
      socket.disconnect(true);
      return;
    }
    log.debug(`New WebSocket connection: ${socket.id} (org: ${orgId})`);

    // Every authenticated socket belongs to exactly one tenant room, joined
    // from the VERIFIED principal. Every tenant-bearing publish below addresses
    // that room (server/socket/tenantBroadcast.ts) instead of the namespace.
    socket.join(orgRoom(orgId));

    // ── Actor binding (C2C-COLLAB-002) ────────────────────────────────────────
    // The ONLY identity these handlers attribute work to. Derived from the JWT
    // at handshake; no event payload contributes to it. Handlers below read
    // `actor.*` and deliberately ignore any client-supplied userId / userName /
    // user object.
    const actor: SocketActor = {
      userId: String(socket.authUserId),
      name: socket.authEmail || `user:${socket.authUserId}`,
      email: socket.authEmail,
    };

    /** Refuse an event, fail-closed, and tell the caller why. */
    const refuse = (event: string, code: string, details?: Record<string, unknown>) => {
      log.warn(
        `[socket] refused ${event} from ${socket.id} (org ${orgId}, user ${actor.userId}): ${code}`,
      );
      socket.emit('collab-error', { event, code, ...(details ?? {}) });
    };

    /**
     * Resolve the document this socket is authorized to act on.
     *
     * Before this fix every handler routed to the room for the CLIENT-supplied
     * `data.documentId`, so a socket joined to document A could drive edits,
     * comments, locks and status changes into document B. The socket is now
     * bound to exactly one document at join time (after an org-scoped access
     * check) and any event naming a different document is refused.
     */
    const boundDocument = (event: string, clientDocumentId: unknown): string | null => {
      const info = socketToUser.get(socket.id);
      if (!info || info.orgId !== orgId) {
        refuse(event, 'NOT_JOINED');
        return null;
      }
      if (clientDocumentId !== undefined && String(clientDocumentId) !== info.documentId) {
        refuse(event, 'WRONG_DOCUMENT', { documentId: String(clientDocumentId) });
        return null;
      }
      return info.documentId;
    };

    // C2C-COLLAB-002: the free-form 'join-room' handler joined ANY room the
    // caller named (org-prefixed), which DEFEATED the join-document
    // authorization below — a caller could simply name the target document's
    // room. There is no room a client is allowed to name, so the allow-list is
    // empty and the handler refuses.
    socket.on('join-room', (data: { room?: string }) => {
      refuse('join-room', 'DISABLED', { room: data?.room == null ? null : String(data.room) });
    });

    // ========== Collaboration Events for eCTD Co-Author ==========

    // Join document collaboration room. Authorization is proved against the
    // socket's organization; the client's `user` object is ignored entirely.
    socket.on('join-document', async (data: { documentId: string }) => {
      const requestedId = data?.documentId;
      if (!(await isDocumentInOrg(orgId, requestedId))) {
        refuse('join-document', 'FORBIDDEN', {
          documentId: requestedId == null ? null : String(requestedId),
        });
        return;
      }
      const documentId = String(requestedId);
      const roomName = documentRoom(orgId, documentId);
      const docKey = `${orgId}_${documentId}`;

      // Leave any previous document rooms
      const previousRoom = socketToUser.get(socket.id);
      if (previousRoom) {
        socket.leave(documentRoom(previousRoom.orgId, previousRoom.documentId));
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

      // Collaborator identity comes from the verified principal, never the payload.
      const collaborator: CollaboratorInfo = {
        id: actor.userId,
        socketId: socket.id,
        name: actor.name,
        email: actor.email,
        color: getUserColor(userIndex),
        status: 'online',
        lastActivity: new Date()
      };

      collaborators.set(actor.userId, collaborator);
      socketToUser.set(socket.id, { userId: actor.userId, documentId, orgId });

      // Add join activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId,
        userId: actor.userId,
        userName: actor.name,
        action: 'join',
        details: { message: `${actor.name} joined the document` },
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
        documentId,
        collaborators: Array.from(collaborators.values()),
        activities: documentActivities.get(docKey) || [],
        comments: documentComments.get(docKey) || [],
        locks: Array.from(sectionLocks.entries())
          .filter(([key]) => key.startsWith(`${docKey}_`))
          .map(([, lock]) => lock)
      });

      log.debug(`User ${actor.userId} joined document ${documentId} (org: ${orgId})`);
    });

    // Handle cursor movement
    socket.on('cursor-move', (data: { documentId: string; position: Omit<CursorPosition, 'timestamp'> }) => {
      const documentId = boundDocument('cursor-move', data?.documentId);
      if (!documentId) return;

      const cursor: CursorPosition = {
        ...data.position,
        userId: actor.userId,
        userName: actor.name,
        timestamp: Date.now()
      };

      socket.to(documentRoom(orgId, documentId)).emit('cursor-update', cursor);
    });

    // Handle text selection
    socket.on('selection-change', (data: { documentId: string; selection: Omit<SelectionRange, 'timestamp'> }) => {
      const documentId = boundDocument('selection-change', data?.documentId);
      if (!documentId) return;

      const selection: SelectionRange = {
        ...data.selection,
        userId: actor.userId,
        userName: actor.name,
        timestamp: Date.now()
      };

      socket.to(documentRoom(orgId, documentId)).emit('selection-update', selection);
    });

    // Handle document changes (for real-time sync)
    socket.on('document-change', (data: DocumentChange) => {
      const documentId = boundDocument('document-change', data?.documentId);
      if (!documentId) return;

      const docKey = `${orgId}_${documentId}`;

      // Add edit activity — attributed to the authenticated actor
      const activity: Activity = {
        id: generateActivityId(),
        documentId,
        userId: actor.userId,
        userName: actor.name,
        action: 'edit',
        details: { section: data.section, operation: data.operation },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Broadcast change to other collaborators (tenant + document scoped room)
      socket.to(documentRoom(orgId, documentId)).emit('document-updated', {
        change: {
          ...data,
          documentId,
          userId: actor.userId,
          userName: actor.name
        },
        activity
      });

      // Update user's last activity
      const collaborators = documentRooms.get(docKey);
      if (collaborators && collaborators.has(actor.userId)) {
        const collaborator = collaborators.get(actor.userId)!;
        collaborator.lastActivity = new Date();
        collaborator.status = 'editing';
        collaborator.currentSection = data.section;
      }
    });

    // Handle typing indicator (tenant + document scoped)
    socket.on('typing-start', (data: { documentId: string; section?: string }) => {
      const documentId = boundDocument('typing-start', data?.documentId);
      if (!documentId) return;
      socket.to(documentRoom(orgId, documentId)).emit('user-typing', {
        userId: actor.userId,
        userName: actor.name,
        section: data.section,
        isTyping: true
      });
    });

    socket.on('typing-stop', (data: { documentId: string }) => {
      const documentId = boundDocument('typing-stop', data?.documentId);
      if (!documentId) return;
      socket.to(documentRoom(orgId, documentId)).emit('user-typing', {
        userId: actor.userId,
        isTyping: false
      });
    });

    // Handle section locking. Part 11 lock ownership is the AUTHENTICATED
    // actor — previously it was whatever userId the payload claimed, so any
    // socket could take or release another user's lock.
    socket.on('lock-section', (data: { documentId: string; sectionId: string }) => {
      const documentId = boundDocument('lock-section', data?.documentId);
      if (!documentId) return;
      const docKey = `${orgId}_${documentId}`;
      const lockKey = `${docKey}_${data.sectionId}`;

      // Check if section is already locked
      if (sectionLocks.has(lockKey)) {
        const existingLock = sectionLocks.get(lockKey)!;
        if (existingLock.userId !== actor.userId) {
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
        userId: actor.userId,
        userName: actor.name,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minute expiry
      };

      sectionLocks.set(lockKey, lock);

      // Add lock activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId,
        userId: actor.userId,
        userName: actor.name,
        action: 'lock',
        details: { section: data.sectionId },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify all collaborators (tenant + document scoped room)
      ioInstance.to(documentRoom(orgId, documentId)).emit('section-locked', {
        lock,
        activity
      });
    });

    socket.on('unlock-section', (data: { documentId: string; sectionId: string }) => {
      const documentId = boundDocument('unlock-section', data?.documentId);
      if (!documentId) return;
      const docKey = `${orgId}_${documentId}`;
      const lockKey = `${docKey}_${data.sectionId}`;

      const lock = sectionLocks.get(lockKey);
      if (!lock) return;
      // Only the lock HOLDER may release it, proved against the authenticated
      // actor rather than a client-supplied userId (lock-theft fix).
      if (lock.userId !== actor.userId) {
        refuse('unlock-section', 'NOT_LOCK_OWNER', { sectionId: data.sectionId });
        return;
      }

      sectionLocks.delete(lockKey);

      // Add unlock activity
      const activity: Activity = {
        id: generateActivityId(),
        documentId,
        userId: actor.userId,
        userName: actor.name,
        action: 'unlock',
        details: { section: data.sectionId },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify all collaborators (tenant + document scoped room)
      ioInstance.to(documentRoom(orgId, documentId)).emit('section-unlocked', {
        sectionId: data.sectionId,
        activity
      });
    });

    // Handle comments (tenant + document scoped)
    socket.on('add-comment', (data: { documentId: string; comment: Omit<Comment, 'id' | 'timestamp'> }) => {
      const documentId = boundDocument('add-comment', data?.documentId);
      if (!documentId) return;
      const docKey = `${orgId}_${documentId}`;
      const comment: Comment = {
        ...data.comment,
        documentId,
        // Authorship is the verified principal — never the payload.
        userId: actor.userId,
        userName: actor.name,
        userAvatar: undefined,
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
        documentId,
        userId: actor.userId,
        userName: actor.name,
        action: 'comment',
        details: {
          commentId: comment.id,
          content: (comment.content ?? '').substring(0, 100),
          mentions: comment.mentions
        },
        timestamp: new Date()
      };

      if (!documentActivities.has(docKey)) {
        documentActivities.set(docKey, []);
      }
      documentActivities.get(docKey)!.push(activity);

      // Notify all collaborators (tenant + document scoped room)
      ioInstance.to(documentRoom(orgId, documentId)).emit('comment-added', {
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

    socket.on('resolve-comment', (data: { documentId: string; commentId: string }) => {
      const documentId = boundDocument('resolve-comment', data?.documentId);
      if (!documentId) return;
      const docKey = `${orgId}_${documentId}`;
      const comments = documentComments.get(docKey);
      if (comments) {
        const comment = comments.find(c => c.id === data.commentId);
        if (comment) {
          comment.resolved = true;

          ioInstance.to(documentRoom(orgId, documentId)).emit('comment-resolved', {
            commentId: data.commentId,
            resolvedBy: actor.name
          });
        }
      }
    });

    // Handle document status changes (tenant + document scoped)
    socket.on('document-status-change', (data: {
      documentId: string;
      oldStatus: string;
      newStatus: string;
    }) => {
      const documentId = boundDocument('document-status-change', data?.documentId);
      if (!documentId) return;
      const docKey = `${orgId}_${documentId}`;
      const activity: Activity = {
        id: generateActivityId(),
        documentId,
        userId: actor.userId,
        userName: actor.name,
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

      // Notify all collaborators (tenant + document scoped room)
      ioInstance.to(documentRoom(orgId, documentId)).emit('status-changed', {
        newStatus: data.newStatus,
        activity
      });
    });

    // Handle user presence updates (tenant + document scoped)
    socket.on('presence-update', (data: { documentId: string; status: 'online' | 'idle' | 'editing' }) => {
      const documentId = boundDocument('presence-update', data?.documentId);
      if (!documentId) return;
      const docKey = `${orgId}_${documentId}`;
      const collaborators = documentRooms.get(docKey);
      if (collaborators && collaborators.has(actor.userId)) {
        const collaborator = collaborators.get(actor.userId)!;
        collaborator.status = data.status;
        collaborator.lastActivity = new Date();

        socket.to(documentRoom(orgId, documentId)).emit('collaborator-status-update', {
          userId: actor.userId,
          status: data.status
        });
      }
    });

    // ========== Original Task Management Events ==========
    //
    // C2C-COLLAB-003: these eleven families used to be re-published with the
    // namespace-global broadcast primitive, which ignores rooms and therefore
    // reached EVERY authenticated socket in EVERY organization. They now
    // publish to the sender's org room only, derived from the verified
    // principal. Intra-tenant delivery is unchanged; only cross-tenant receipt
    // is removed.

    // Handle task events
    socket.on('task-created', (task: TaskData) => {
      log.debug('Broadcasting task-created to org peers');
      emitToOrgPeers(socket, 'task-created', task);
    });

    socket.on('task-updated', (task: TaskData) => {
      log.debug('Broadcasting task-updated to org peers');
      emitToOrgPeers(socket, 'task-updated', task);
    });

    socket.on('task-deleted', (taskId: string) => {
      log.debug('Broadcasting task-deleted to org peers');
      emitToOrgPeers(socket, 'task-deleted', taskId);
    });

    socket.on('task-escalated', (task: TaskData) => {
      log.debug('Broadcasting task-escalated to org peers');
      emitToOrgPeers(socket, 'task-escalated', task);
    });

    // Handle batch operations
    socket.on('batch-update', (data: BatchUpdateData) => {
      log.debug('Broadcasting batch-update to org peers');
      emitToOrgPeers(socket, 'batch-update', data);
    });

    // Handle user presence
    socket.on('user-active', (user: UserData) => {
      emitToOrgPeers(socket, 'user-active', user);
    });

    // Handle notification events
    socket.on('notification-sent', (notification: any) => {
      log.debug('Broadcasting notification to org peers');
      emitToOrgPeers(socket, 'notification-received', notification);
    });

    // Handle recurring task events
    socket.on('recurring-task-created', (task: TaskData) => {
      log.debug('Broadcasting recurring task to org peers');
      emitToOrgPeers(socket, 'recurring-task-created', task);
    });

    // Handle compliance events
    socket.on('compliance-check', (data: any) => {
      log.debug('Broadcasting compliance check to org peers');
      emitToOrgPeers(socket, 'compliance-update', data);
    });

    // Handle time tracking events
    socket.on('timer-started', (data: { taskId: string; userId: string }) => {
      log.debug('Broadcasting timer started to org peers');
      emitToOrgPeers(socket, 'timer-started', data);
    });

    socket.on('timer-stopped', (data: { taskId: string; userId: string; duration: number }) => {
      log.debug('Broadcasting timer stopped to org peers');
      emitToOrgPeers(socket, 'timer-stopped', data);
    });

    // ========== Field Synchronization Events for FDA 510(k) ==========

    // Subscribe to field updates for a project (tenant-scoped). The subscriber
    // is recorded under the authenticated actor, not a payload userId.
    socket.on('subscribe-fields', async (data: { projectId: string; fields?: string[] }) => {
      const projectId = String(data?.projectId ?? '');
      if (!projectId) {
        refuse('subscribe-fields', 'INVALID_PROJECT');
        return;
      }
      // Prove the caller's organization owns this project before joining its
      // field room. The room name is already org-scoped, so this is not a
      // cross-tenant hole — but without it any member of the org can subscribe
      // to any project in the org, while the HTTP SSE route
      // (server/routes/fieldSync.routes.ts) verifies ownership. Same object,
      // two transports: they must agree, and isProjectInOrg fails closed.
      if (!(await isProjectInOrg(orgId, projectId))) {
        refuse('subscribe-fields', 'FORBIDDEN_PROJECT');
        return;
      }
      const roomName = projectFieldsRoom(orgId, projectId);

      // Join project field room
      socket.join(roomName);

      // Store subscription (key is org-scoped so two tenants sharing a project
      // id cannot collide in this map)
      const subscriptionKey = `${orgId}_${projectId}`;
      if (!fieldSubscriptions.has(subscriptionKey)) {
        fieldSubscriptions.set(subscriptionKey, new Set());
      }

      const subscription: FieldSubscription = {
        projectId,
        userId: actor.userId,
        socketId: socket.id,
        fields: data?.fields
      };

      fieldSubscriptions.get(subscriptionKey)!.add(subscription);
      socketToProject.set(socket.id, subscriptionKey);

      log.debug(`User ${actor.userId} subscribed to fields for project ${projectId} (org ${orgId})`);
      socket.emit('field-subscription-confirmed', { projectId, fields: data?.fields });
    });

    // Handle field update (tenant-scoped). Organization and actor come from the
    // verified socket; the client may only choose which project inside its own
    // organization to target, and the service re-proves that ownership.
    socket.on('update-field', async (data: FieldUpdate) => {
      const field = data?.field;
      const source = data?.source;
      const organizationId = Number(orgId);
      const projectId = Number(data?.projectId);
      const actorUserId = Number(actor.userId);

      if (!Number.isInteger(organizationId) || organizationId <= 0) {
        socket.emit('field-update-error', { field, error: 'Invalid tenant context' });
        return;
      }
      if (!Number.isInteger(projectId) || projectId <= 0) {
        socket.emit('field-update-error', { field, error: 'Invalid project context' });
        return;
      }
      if (source !== 'workflow' && source !== 'document') {
        socket.emit('field-update-error', { field, error: 'Invalid source' });
        return;
      }
      if (typeof field !== 'string' || field.length === 0) {
        socket.emit('field-update-error', { field, error: 'Invalid field' });
        return;
      }

      const roomName = projectFieldsRoom(orgId, String(projectId));
      log.debug(`Field update: ${field} in project ${projectId} by user ${actor.userId} (org ${orgId})`);

      // Import SmartFieldLinking service
      const { smartFieldLinking } = await import('./services/SmartFieldLinking.js');

      // Process field update through SmartFieldLinking
      try {
        await smartFieldLinking.updateField({
          organizationId,
          projectId,
          source,
          field,
          value: data.value,
          previousValue: data.previousValue,
          userId: Number.isInteger(actorUserId) ? actorUserId : undefined,
          timestamp: new Date(),
          metadata: { projectId, organizationId }
        });

        // Broadcast field update to subscribers of this project in THIS org
        io?.to(roomName).emit('field-updated', {
          projectId: String(projectId),
          source,
          field,
          value: data.value,
          previousValue: data.previousValue,
          userId: actor.userId,
          userName: actor.name,
          timestamp: new Date()
        });

        // Send confirmation to the sender
        socket.emit('field-update-success', { field, value: data.value });
      } catch (error) {
        log.error('Field update error:', error);
        socket.emit('field-update-error', {
          field,
          error: error instanceof Error ? error.message : 'Failed to update field'
        });
      }
    });

    // Get field completeness for a project the caller's organization owns.
    socket.on('get-field-completeness', async (data: { projectId: string }) => {
      const projectId = Number(data?.projectId);
      const organizationId = Number(orgId);

      if (!Number.isInteger(organizationId) || organizationId <= 0 || !Number.isInteger(projectId) || projectId <= 0) {
        socket.emit('field-completeness-error', {
          projectId: data?.projectId,
          error: 'Invalid tenant or project context'
        });
        return;
      }

      // Prove tenancy before doing any project-scoped read.
      if (!(await isProjectInOrg(orgId, projectId))) {
        socket.emit('field-completeness-error', {
          projectId: String(projectId),
          error: 'Project not found'
        });
        return;
      }

      try {
        const { smartFieldLinking } = await import('./services/SmartFieldLinking.js');
        const completeness = await smartFieldLinking.checkFieldCompleteness(projectId, organizationId);

        socket.emit('field-completeness', {
          projectId: String(projectId),
          ...completeness
        });
      } catch (error) {
        log.error('Error checking field completeness:', error);
        socket.emit('field-completeness-error', {
          projectId: String(projectId),
          error: error instanceof Error ? error.message : 'Failed to check completeness'
        });
      }
    });

    // Unsubscribe from field updates (tenant-scoped)
    socket.on('unsubscribe-fields', (data: { projectId: string }) => {
      const projectId = String(data?.projectId ?? '');
      if (!projectId) return;
      const roomName = projectFieldsRoom(orgId, projectId);

      socket.leave(roomName);

      // Remove subscription
      const subscriptionKey = `${orgId}_${projectId}`;
      const subscriptions = fieldSubscriptions.get(subscriptionKey);
      if (subscriptions) {
        subscriptions.forEach(sub => {
          if (sub.socketId === socket.id) {
            subscriptions.delete(sub);
          }
        });
      }

      socketToProject.delete(socket.id);
      log.debug(`Socket ${socket.id} unsubscribed from project ${projectId} fields (org ${orgId})`);
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
      const subscriptionKey = socketToProject.get(socket.id);
      if (subscriptionKey) {
        const subscriptions = fieldSubscriptions.get(subscriptionKey);
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

  // Attach ANA's real-time duplex chat namespace (/ana). Lazy import keeps the
  // heavy agentic-loop graph off the socket-server load path; non-blocking.
  void import('./services/ana/ana-realtime.js')
    .then(m => m.registerAnaRealtime(ioInstance))
    .catch(err => log.warn(`[ana-realtime] namespace registration failed (non-blocking): ${err?.message}`));

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
    const roomName = documentRoom(resolvedOrgId, rawDocumentId);
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

// `broadcastToRoom(room, event, data)` was removed with the other unscoped
// publish primitives (C2C-COLLAB-003). It took a caller-chosen room STRING with
// no tenant in it, so any future caller could publish into another
// organization's room — the same class of defect as the deleted
// `broadcastToAll` / `notifyTaskChange` helpers, and it had zero callers
// repo-wide. Use `emitToOrg` below, which requires an organization id.

/**
 * Server-initiated publish to ONE organization (C2C-COLLAB-003).
 *
 * Replaces the deleted `broadcastToAll` / `notifyTaskChange` /
 * `notifyComplianceStatus` / `notifyTimeTracking` helpers, which published
 * task, compliance and timer payloads namespace-wide (every tenant). Those four
 * had zero callers repo-wide but were a global-broadcast primitive a future
 * caller would have reintroduced the leak through. Anything that needs to push
 * one of those families must now name the organization it is pushing to.
 */
export function broadcastToOrg(orgId: string, event: string, data: any) {
  emitToOrg(io, orgId, event, data);
}

// Document collaboration utility functions (tenant-scoped)
// orgId is required for tenant isolation; callers must provide it
export function notifyDocumentChange(orgId: string, documentId: string, change: DocumentChange) {
  if (io) {
    io.to(documentRoom(orgId, documentId)).emit('document-updated', { change });
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
