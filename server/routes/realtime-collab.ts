/**
 * =============================================================================
 * Real-Time Collaboration — presence roster and section locking (REST)
 * =============================================================================
 * The REST half of collaborative authoring: who else is in this section right
 * now, and who holds the edit lock on it. The CRDT sync itself lives on the
 * /collab WebSocket (server/services/hocuspocus-server.ts).
 *
 * WHAT THIS HEADER USED TO SAY
 * "Document-level locking with 21 CFR Part 11 audit trail" and "Persistence to
 * PostgreSQL for offline recovery". Neither was true: every structure below is
 * an in-memory Map that dies with the process, and no lock acquisition or
 * release is written to any audit trail. The claims are removed rather than
 * softened — see the `/ws-config` handler, which was reporting the same two
 * fictions to clients.
 *
 * SECURITY — WHAT WAS WRONG
 * The router was auth-gated at mount, and then every handler took the actor's
 * identity from `req.body.userId` instead of `req.user`, and keyed its rooms
 * and locks on `documentId` alone in process-global Maps. That combination
 * meant any authenticated user could:
 *
 *   - release another user's section lock, by naming them:
 *     `releaseLock` checks `existing.lockedBy === userId`, and `userId` came
 *     from the request body. Part 11 lock theft in one call;
 *   - acquire a lock, join a room, or update awareness AS somebody else;
 *   - join any other tenant's room by document id and read back
 *     `connectedUsers` — display names and email addresses of another
 *     customer's authors;
 *   - list every active room across every tenant via `GET /rooms`.
 *
 * Identity now comes from the authenticated principal only, and every room and
 * lock key is prefixed with the caller's tenant, so two tenants cannot address
 * the same room even when they hold the same document id. Document ownership is
 * verified against `authoring_documents` before a caller may join a room or
 * touch a lock, using the same authorizer the collaboration socket uses.
 * =============================================================================
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { parseFiniteInt } from '../middleware/orgMembership';
import { authorizeResource } from '../services/collab/collab-authorization';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface CollabRoom {
  id: string;
  documentId: string;
  sectionId?: string;
  projectId: number;
  /** Owning tenant. Rooms are addressed per tenant; this is the stored copy. */
  tenantId: number;
  createdAt: Date;
  connectedUsers: CollabUser[];
  yjsStateVector: Buffer | null;
  yjsDocument: Buffer | null;
  lastActivity: Date;
}

export interface CollabUser {
  userId: string;
  displayName: string;
  email: string;
  color: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  connectedAt: Date;
  lastSeen: Date;
}

export interface CursorPosition {
  index: number;
  length: number;
  sectionPath?: string;
}

export interface SelectionRange {
  anchor: number;
  head: number;
  sectionPath?: string;
}

export interface AwarenessUpdate {
  userId: string;
  clientId: number;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  isTyping: boolean;
  focusedField?: string;
}

export interface CollabEvent {
  id: string;
  roomId: string;
  userId: string;
  eventType:
    | 'join'
    | 'leave'
    | 'edit'
    | 'cursor_move'
    | 'selection'
    | 'lock'
    | 'unlock'
    | 'conflict_resolved';
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface DocumentLock {
  id: string;
  documentId: string;
  sectionId?: string;
  /** Server-side identity of the holder. Never accepted from a request body. */
  lockedBy: string;
  /** Human label for the holder, so a lock chip need not render a raw id. */
  lockedByLabel: string;
  lockedAt: Date;
  expiresAt: Date;
  lockType: 'exclusive' | 'shared' | 'advisory';
  reason?: string;
}

export interface MergeConflict {
  id: string;
  roomId: string;
  conflictType: 'concurrent_edit' | 'structure_change' | 'deletion_conflict';
  baseVersion: number;
  localChanges: Record<string, unknown>;
  remoteChanges: Record<string, unknown>;
  resolvedBy?: string;
  resolution?: 'accept_local' | 'accept_remote' | 'manual_merge';
  timestamp: Date;
}

// Awareness color palette for multi-user cursors
const CURSOR_COLORS = [
  '#E53E3E',
  '#DD6B20',
  '#D69E2E',
  '#38A169',
  '#3182CE',
  '#805AD5',
  '#D53F8C',
  '#00B5D8',
  '#319795',
  '#718096',
];

// ---------------------------------------------------------------------------
// IDENTITY AND ACCESS
// ---------------------------------------------------------------------------

/**
 * The authenticated actor. Everything downstream keys off this and never off a
 * request body field — a body-supplied `userId` is exactly what let one user
 * release another user's lock.
 */
interface Principal {
  /** Stable server-side identity. Never accepted from the client. */
  userId: string;
  tenantId: number;
  /** Human label for rosters and lock chips. */
  label: string;
  email: string;
}

function principal(req: Request): Principal | null {
  const subject = req.user?.userId ?? req.user?.id;
  const tenantId = parseFiniteInt(req.user?.organizationId);
  if (subject === undefined || subject === null || subject === '' || tenantId === null) {
    return null;
  }
  const email = typeof req.user?.email === 'string' ? req.user.email : '';
  return { userId: String(subject), tenantId, label: email || String(subject), email };
}

/** Rooms and locks are addressed per tenant, so ids cannot collide across them. */
function scopedKey(tenantId: number, documentId: string, sectionId?: string | null): string {
  return sectionId ? `t${tenantId}:${documentId}:${sectionId}` : `t${tenantId}:${documentId}`;
}

/**
 * Confirm the caller's tenant owns the document before letting them into its
 * room or near its locks. Reuses the collaboration socket's authorizer so both
 * halves of the collaboration layer answer "may this tenant touch this
 * document?" the same way.
 *
 * Returns an HTTP status to send, or null when access is granted. Fails closed:
 * an unverifiable answer is 503, not an allow.
 */
async function denyDocumentAccess(
  documentId: string,
  sectionId: string | null,
  tenantId: number,
  res: Response
): Promise<boolean> {
  const result = await authorizeResource(
    { kind: 'authoring-document', documentId, sectionId },
    tenantId
  );
  if (result === 'authorized') return false;
  if (result === 'unavailable') {
    res.status(503).json({
      success: false,
      error: { code: 'COLLAB_AUTHZ_UNAVAILABLE', message: 'Document ownership could not be verified' },
    });
    return true;
  }
  res.status(403).json({
    success: false,
    error: { code: 'COLLAB_FORBIDDEN', message: 'Document not available to this organization' },
  });
  return true;
}

/** 401 when the request carried no usable principal. */
function requirePrincipal(req: Request, res: Response): Principal | null {
  const actor = principal(req);
  if (!actor) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_001', message: 'Authenticated identity with an organization is required' },
    });
    return null;
  }
  return actor;
}

/** A UUID check so a malformed document id never reaches Postgres. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// ROOM MANAGER — In-memory Yjs room tracking
// ---------------------------------------------------------------------------

/**
 * Presence TTL. The heartbeat PUTs awareness every 20s; a member not heard
 * from in this window is evicted from the roster. Without this, `lastSeen`
 * was written and never read — a closed laptop stayed in every roster
 * forever (assessment D26), and the client comment claiming "the server also
 * expires idle members" was wrong. Now it is true.
 */
const PRESENCE_TTL_MS = 90 * 1000;

class YjsRoomManager {
  private rooms: Map<string, CollabRoom> = new Map();
  private userColors: Map<string, string> = new Map();
  private colorIndex = 0;

  /** Drop members whose lastSeen exceeds the TTL. Runs on every read path. */
  private pruneIdle(room: CollabRoom): void {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const before = room.connectedUsers.length;
    room.connectedUsers = room.connectedUsers.filter(u => u.lastSeen.getTime() >= cutoff);
    if (room.connectedUsers.length !== before) {
      room.lastActivity = new Date();
    }
  }

  getOrCreateRoom(
    roomKey: string,
    documentId: string,
    projectId: number,
    tenantId: number,
    sectionId?: string
  ): CollabRoom {
    let room = this.rooms.get(roomKey);
    if (!room) {
      room = {
        id: uuidv4(),
        documentId,
        sectionId,
        projectId,
        tenantId,
        createdAt: new Date(),
        connectedUsers: [],
        yjsStateVector: null,
        yjsDocument: null,
        lastActivity: new Date(),
      };
      this.rooms.set(roomKey, room);
    }
    return room;
  }

  addUser(
    roomKey: string,
    user: Omit<CollabUser, 'color' | 'connectedAt' | 'lastSeen'>
  ): CollabUser | null {
    const room = this.rooms.get(roomKey);
    if (!room) return null;
    this.pruneIdle(room);

    // Assign a persistent color
    if (!this.userColors.has(user.userId)) {
      this.userColors.set(user.userId, CURSOR_COLORS[this.colorIndex % CURSOR_COLORS.length]);
      this.colorIndex++;
    }

    const collabUser: CollabUser = {
      ...user,
      color: this.userColors.get(user.userId)!,
      connectedAt: new Date(),
      lastSeen: new Date(),
    };

    // Remove duplicate if reconnecting
    room.connectedUsers = room.connectedUsers.filter(u => u.userId !== user.userId);
    room.connectedUsers.push(collabUser);
    room.lastActivity = new Date();
    return collabUser;
  }

  removeUser(roomKey: string, userId: string): boolean {
    const room = this.rooms.get(roomKey);
    if (!room) return false;
    const prevLen = room.connectedUsers.length;
    room.connectedUsers = room.connectedUsers.filter(u => u.userId !== userId);
    room.lastActivity = new Date();

    // Clean up empty rooms after 5 minutes
    if (room.connectedUsers.length === 0) {
      setTimeout(
        () => {
          const current = this.rooms.get(roomKey);
          if (current && current.connectedUsers.length === 0) {
            this.rooms.delete(roomKey);
          }
        },
        5 * 60 * 1000
      );
    }
    return room.connectedUsers.length < prevLen;
  }

  getRoom(roomKey: string): CollabRoom | undefined {
    const room = this.rooms.get(roomKey);
    if (room) this.pruneIdle(room);
    return room;
  }

  getAllRooms(): CollabRoom[] {
    const rooms = Array.from(this.rooms.values());
    rooms.forEach(room => this.pruneIdle(room));
    return rooms;
  }

  updateAwareness(roomKey: string, userId: string, update: Partial<AwarenessUpdate>): void {
    const room = this.rooms.get(roomKey);
    if (!room) return;
    this.pruneIdle(room);
    const user = room.connectedUsers.find(u => u.userId === userId);
    if (user) {
      if (update.cursor) user.cursor = update.cursor;
      if (update.selection) user.selection = update.selection;
      user.lastSeen = new Date();
      room.lastActivity = new Date();
    }
  }

  storeYjsState(roomKey: string, stateVector: Buffer, document: Buffer): void {
    const room = this.rooms.get(roomKey);
    if (room) {
      room.yjsStateVector = stateVector;
      room.yjsDocument = document;
    }
  }

  /**
   * Room statistics for ONE tenant. The unscoped version of this method backed
   * `GET /rooms`, which listed every active room across every customer —
   * document ids and head counts — to any authenticated caller.
   */
  getRoomStats(tenantId: number): {
    totalRooms: number;
    totalUsers: number;
    rooms: Array<{ roomId: string; documentId: string; userCount: number }>;
  } {
    const rooms = this.getAllRooms().filter(r => r.tenantId === tenantId);
    return {
      totalRooms: rooms.length,
      totalUsers: rooms.reduce((sum, r) => sum + r.connectedUsers.length, 0),
      rooms: rooms.map(r => ({
        roomId: r.id,
        documentId: r.documentId,
        userCount: r.connectedUsers.length,
      })),
    };
  }
}

const roomManager = new YjsRoomManager();

// ---------------------------------------------------------------------------
// LOCK MANAGER — Document section-level locking
// ---------------------------------------------------------------------------

class DocumentLockManager {
  private locks: Map<string, DocumentLock> = new Map();

  acquireLock(
    lockKey: string,
    documentId: string,
    userId: string,
    sectionId?: string,
    opts?: {
      lockType?: DocumentLock['lockType'];
      durationMs?: number;
      reason?: string;
      lockedByLabel?: string;
    }
  ): DocumentLock | { error: string } {
    const existing = this.locks.get(lockKey);

    // Check if there's an active, unexpired lock by someone else
    if (existing && existing.lockedBy !== userId && existing.expiresAt > new Date()) {
      return {
        error: `Section is locked by another user until ${existing.expiresAt.toISOString()}`,
      };
    }

    const lock: DocumentLock = {
      id: uuidv4(),
      documentId,
      sectionId,
      lockedBy: userId,
      lockedByLabel: opts?.lockedByLabel ?? userId,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + (opts?.durationMs ?? 30 * 60 * 1000)), // 30 min default
      lockType: opts?.lockType ?? 'advisory',
      reason: opts?.reason,
    };
    this.locks.set(lockKey, lock);
    return lock;
  }

  /**
   * Release a lock the caller actually holds.
   *
   * `userId` is the authenticated principal, which is the whole fix: the
   * ownership test below was previously comparing the stored holder against a
   * value the requester supplied, so naming the holder was sufficient to steal
   * their lock.
   */
  releaseLock(lockKey: string, userId: string): boolean {
    const existing = this.locks.get(lockKey);
    if (existing && existing.lockedBy === userId) {
      this.locks.delete(lockKey);
      return true;
    }
    return false;
  }

  getLock(lockKey: string): DocumentLock | null {
    const lock = this.locks.get(lockKey);
    if (lock && lock.expiresAt <= new Date()) {
      this.locks.delete(lockKey);
      return null;
    }
    return lock ?? null;
  }

  /**
   * Active locks for one document within one tenant. Scanning by documentId
   * alone — the previous behaviour — returned another tenant's locks, and with
   * them the identity of the author holding each one.
   */
  getDocumentLocks(tenantId: number, documentId: string): DocumentLock[] {
    const result: DocumentLock[] = [];
    const prefix = `t${tenantId}:${documentId}`;
    const now = new Date();
    for (const [key, lock] of this.locks) {
      if ((key === prefix || key.startsWith(`${prefix}:`)) && lock.expiresAt > now) {
        result.push(lock);
      }
    }
    return result;
  }
}

const lockManager = new DocumentLockManager();

// ---------------------------------------------------------------------------
// EXPRESS ROUTES
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET /rooms
 * Active collaboration rooms for the caller's organization.
 */
router.get('/rooms', (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;
  res.json({ success: true, data: roomManager.getRoomStats(actor.tenantId) });
});

/**
 * POST /rooms
 * Join the room for a document (or one of its sections).
 *
 * `userId`, `displayName` and `email` are no longer read from the body. They
 * were the actor's whole identity, which meant joining a roster as somebody
 * else was a matter of typing their name. Clients may still send them; they are
 * ignored.
 */
router.post('/rooms', async (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;

  const { documentId, projectId, sectionId } = req.body ?? {};
  if (!documentId || !projectId) {
    return res.status(400).json({ success: false, error: 'documentId and projectId required' });
  }
  if (!UUID_RE.test(String(documentId))) {
    return res.status(400).json({ success: false, error: 'documentId must be a UUID' });
  }
  const section = sectionId ? String(sectionId) : null;
  if (section && !UUID_RE.test(section)) {
    return res.status(400).json({ success: false, error: 'sectionId must be a UUID' });
  }
  if (await denyDocumentAccess(String(documentId), section, actor.tenantId, res)) return;

  const roomKey = scopedKey(actor.tenantId, String(documentId), section);
  const room = roomManager.getOrCreateRoom(
    roomKey,
    String(documentId),
    Number(projectId),
    actor.tenantId,
    section ?? undefined
  );
  const user = roomManager.addUser(roomKey, {
    userId: actor.userId,
    displayName: actor.label,
    email: actor.email,
  });

  res.json({
    success: true,
    data: {
      room: {
        id: room.id,
        documentId: room.documentId,
        sectionId: room.sectionId,
        connectedUsers: room.connectedUsers,
      },
      user,
    },
  });
});

/**
 * DELETE /rooms/:documentId/users/me
 * Leave the room for a document (or one of its sections).
 *
 * The room and the departing member are both derived from the authenticated
 * principal. The previous shape — `/rooms/:roomKey/users/:userId` — let a
 * caller evict any other user from any room by naming both in the path.
 */
router.delete('/rooms/:documentId/users/me', (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;
  const documentId = String(req.params.documentId);
  const section = req.query.sectionId ? String(req.query.sectionId) : null;
  const removed = roomManager.removeUser(
    scopedKey(actor.tenantId, documentId, section),
    actor.userId
  );
  res.json({ success: true, removed });
});

/**
 * PUT /rooms/:documentId/awareness
 * Publish the caller's own presence and read back the room roster.
 */
router.put('/rooms/:documentId/awareness', (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;
  const documentId = String(req.params.documentId);
  const { cursor, selection, isTyping, focusedField, sectionId } = req.body ?? {};
  const roomKey = scopedKey(actor.tenantId, documentId, sectionId ? String(sectionId) : null);

  // Awareness is published for the caller and nobody else — a body `userId`
  // previously let one client move another client's cursor.
  roomManager.updateAwareness(roomKey, actor.userId, {
    userId: actor.userId,
    clientId: 0,
    cursor,
    selection,
    isTyping,
    focusedField,
  });
  const room = roomManager.getRoom(roomKey);
  // A heartbeat from a member the idle sweep evicted (laptop slept, tab
  // resumed) re-joins them rather than leaving their own roster without them.
  if (room && !room.connectedUsers.some(u => u.userId === actor.userId)) {
    roomManager.addUser(roomKey, {
      userId: actor.userId,
      displayName: actor.label,
      email: actor.email,
    });
  }
  res.json({ success: true, connectedUsers: room?.connectedUsers || [] });
});

// ---------------------------------------------------------------------------
// LOCK ENDPOINTS — section-level edit locking
//
// These are advisory coordination locks, not a Part 11 control. They live in
// process memory, they are lost on restart, and no acquisition or release is
// written to an audit trail. The section header used to say "21 CFR Part 11
// section-level document locking", and /ws-config reported
// `part11Compliant: true` to clients. Signed, audited authoring actions are
// authoring_signatures and authoring_audit_trail; this is a soft lock that
// keeps two authors from typing over each other.
// ---------------------------------------------------------------------------

/**
 * POST /locks
 * Acquire the edit lock on a document or one of its sections.
 */
router.post('/locks', async (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;

  const { documentId, sectionId, lockType, durationMs, reason } = req.body ?? {};
  if (!documentId) return res.status(400).json({ success: false, error: 'documentId required' });
  if (!UUID_RE.test(String(documentId))) {
    return res.status(400).json({ success: false, error: 'documentId must be a UUID' });
  }
  const section = sectionId ? String(sectionId) : null;
  if (section && !UUID_RE.test(section)) {
    return res.status(400).json({ success: false, error: 'sectionId must be a UUID' });
  }
  if (await denyDocumentAccess(String(documentId), section, actor.tenantId, res)) return;

  const result = lockManager.acquireLock(
    scopedKey(actor.tenantId, String(documentId), section),
    String(documentId),
    actor.userId,
    section ?? undefined,
    { lockType, durationMs, reason, lockedByLabel: actor.label }
  );
  if ('error' in result) {
    return res.status(409).json({ success: false, error: result.error });
  }
  res.json({ success: true, data: { ...result, mine: true } });
});

/**
 * DELETE /locks/:documentId
 * Release the caller's own lock. A caller can only ever release their own:
 * both the key and the ownership test come from the authenticated principal.
 */
router.delete('/locks/:documentId', (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;
  const documentId = String(req.params.documentId);
  const section = req.body?.sectionId ? String(req.body.sectionId) : null;
  const released = lockManager.releaseLock(
    scopedKey(actor.tenantId, documentId, section),
    actor.userId
  );
  res.json({ success: true, released });
});

/**
 * GET /locks/:documentId
 * Active locks on a document, within the caller's organization only.
 *
 * `mine` is computed here rather than left to the client to infer by comparing
 * id strings — the server is the only party that knows which principal the
 * request came from.
 */
router.get('/locks/:documentId', (req: Request, res: Response) => {
  const actor = requirePrincipal(req, res);
  if (!actor) return;
  const locks = lockManager
    .getDocumentLocks(actor.tenantId, String(req.params.documentId))
    .map(lock => ({ ...lock, mine: lock.lockedBy === actor.userId }));
  res.json({ success: true, data: locks });
});

/**
 * GET /health
 * Health check for the collaboration presence/locking service.
 */
router.get('/health', (req: Request, res: Response) => {
  const actor = principal(req);
  const stats = actor ? roomManager.getRoomStats(actor.tenantId) : null;
  res.json({
    status: 'healthy',
    service: 'realtime-collab',
    scope: 'presence-and-locking',
    // Reported as what it is. This handler used to advertise
    // `part11AuditTrail: true`, `offlineSync: true` and
    // `conflictResolution: 'automatic-crdt'` from a router that does none of
    // those things.
    storage: 'in-memory (per process; not durable across restarts)',
    activeRooms: stats?.totalRooms ?? null,
    connectedUsers: stats?.totalUsers ?? null,
  });
});

export default router;
