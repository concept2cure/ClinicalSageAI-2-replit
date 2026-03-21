/**
 * useRealtimeCollaboration — Firestore-powered real-time collaboration
 *
 * Provides cursor presence, live comments, and document locking
 * via Cloud Firestore real-time listeners. Falls back gracefully
 * when Firebase is not configured.
 *
 * Firestore collections:
 *   documents/{docId}/presence/{userId}  — cursor position, selection, user info
 *   documents/{docId}/comments/{commentId} — threaded inline comments
 *   documents/{docId}/locks/{sectionId}   — section-level edit locks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getFirestoreDb, isFirebaseConfigured } from '../config/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Presence entries older than this are treated as stale and filtered out */
const PRESENCE_STALE_MS = 30_000;

/** How often to refresh own heartbeat timestamp */
const HEARTBEAT_INTERVAL_MS = 10_000;

/** Section locks auto-expire after this duration */
const LOCK_DURATION_MS = 5 * 60 * 1_000; // 5 minutes

/** Deterministic palette for collaborator cursors */
const CURSOR_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#14B8A6',
] as const satisfies readonly string[];

// ── Types ─────────────────────────────────────────────────────────────────────

/** Ephemeral cursor/selection data broadcast to other collaborators */
export interface CursorPresence {
  readonly userId: string;
  readonly userName: string;
  readonly color: string;
  /** TipTap cursor position (character offset), null when blurred */
  readonly cursorPos: number | null;
  /** Selection anchor (start) — present only when text is selected */
  readonly selectionFrom?: number;
  /** Selection head (end) — present only when text is selected */
  readonly selectionTo?: number;
  /** Unix-ms timestamp of last activity */
  readonly lastActive: number;
  /** CTD/document section the user is currently working in */
  readonly activeSection?: string;
}

/** A comment anchored to a document position, optionally threaded */
export interface LiveComment {
  readonly id: string;
  readonly userId: string;
  readonly userName: string;
  readonly content: string;
  /** Character offset in the document where this comment is anchored */
  readonly anchorPos: number;
  /** ID of the parent comment (null for top-level/root comments) */
  readonly parentId: string | null;
  readonly resolved: boolean;
  /** Unix-ms creation timestamp */
  readonly createdAt: number;
  /** Unix-ms last update timestamp */
  readonly updatedAt: number;
}

/** A section-level edit lock with auto-expiration */
export interface SectionLock {
  readonly sectionId: string;
  readonly lockedBy: string;
  readonly lockedByName: string;
  /** Unix-ms when the lock was acquired */
  readonly lockedAt: number;
  /** Unix-ms after which the lock is considered expired */
  readonly expiresAt: number;
}

/** Configuration for the collaboration hook */
interface UseRealtimeCollaborationOptions {
  readonly documentId: string;
  readonly userId: string;
  readonly userName: string;
  /** Enable cursor presence tracking (default: true) */
  readonly presence?: boolean;
  /** Enable live comments (default: true) */
  readonly comments?: boolean;
  /** Enable section locking (default: true) */
  readonly locking?: boolean;
}

/** Full return type of the hook — explicitly typed for consumer reference */
export interface UseRealtimeCollaborationReturn {
  readonly collaborators: readonly CursorPresence[];
  readonly liveComments: readonly LiveComment[];
  readonly sectionLocks: readonly SectionLock[];
  readonly isConnected: boolean;
  readonly isAvailable: boolean;
  readonly updateCursor: (cursorPos: number | null, selectionFrom?: number, selectionTo?: number) => void;
  readonly addComment: (content: string, anchorPos: number, parentId?: string) => Promise<void>;
  readonly resolveComment: (commentId: string) => Promise<void>;
  readonly lockSection: (sectionId: string) => Promise<void>;
  readonly unlockSection: (sectionId: string) => Promise<void>;
  readonly isSectionLocked: (sectionId: string) => SectionLock | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Deterministic hash-based color assignment for a user ID */
function getCursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealtimeCollaboration({
  documentId,
  userId,
  userName,
  presence: enablePresence = true,
  comments: enableComments = true,
  locking: enableLocking = true,
}: UseRealtimeCollaborationOptions): UseRealtimeCollaborationReturn {
  const [collaborators, setCollaborators] = useState<CursorPresence[]>([]);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [sectionLocks, setSectionLocks] = useState<SectionLock[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── Connect to Firestore listeners ──────────────────────────────────────

  useEffect(() => {
    if (!isFirebaseConfigured() || !documentId) {
      setIsConnected(false);
      return;
    }

    const db = getFirestoreDb();
    if (!db) return;

    const unsubs: Unsubscribe[] = [];

    // Presence listener
    if (enablePresence) {
      const presenceRef = collection(db, 'documents', documentId, 'presence');
      const unsub = onSnapshot(presenceRef, (snapshot) => {
        const now = Date.now();
        const presences: CursorPresence[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as CursorPresence;
          // Filter out stale presences and self
          if (data.userId !== userId && now - data.lastActive < PRESENCE_STALE_MS) {
            presences.push(data);
          }
        });
        setCollaborators(presences);
      });
      unsubs.push(unsub);

      // Register own presence
      const myPresenceRef = doc(db, 'documents', documentId, 'presence', userId);
      void setDoc(myPresenceRef, {
        userId,
        userName,
        color: getCursorColor(userId),
        cursorPos: null,
        lastActive: Date.now(),
      });

      // Heartbeat
      heartbeatRef.current = setInterval(() => {
        void setDoc(myPresenceRef, { lastActive: Date.now() }, { merge: true });
      }, HEARTBEAT_INTERVAL_MS);
    }

    // Comments listener
    if (enableComments) {
      const commentsRef = collection(db, 'documents', documentId, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'asc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const result: LiveComment[] = [];
        snapshot.forEach((docSnap) => {
          result.push({ id: docSnap.id, ...docSnap.data() } as LiveComment);
        });
        setLiveComments(result);
      });
      unsubs.push(unsub);
    }

    // Section locks listener
    if (enableLocking) {
      const locksRef = collection(db, 'documents', documentId, 'locks');
      const unsub = onSnapshot(locksRef, (snapshot) => {
        const now = Date.now();
        const locks: SectionLock[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as SectionLock;
          if (data.expiresAt > now) {
            locks.push(data);
          }
        });
        setSectionLocks(locks);
      });
      unsubs.push(unsub);
    }

    unsubscribesRef.current = unsubs;
    setIsConnected(true);

    // Cleanup
    return () => {
      unsubs.forEach((unsub) => unsub());
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);

      // Remove own presence on disconnect
      if (enablePresence && db) {
        const myPresenceRef = doc(db, 'documents', documentId, 'presence', userId);
        void deleteDoc(myPresenceRef).catch(() => {});
      }

      setIsConnected(false);
    };
  }, [documentId, userId, userName, enablePresence, enableComments, enableLocking]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const updateCursor = useCallback(
    (cursorPos: number | null, selectionFrom?: number, selectionTo?: number): void => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const myPresenceRef = doc(db, 'documents', documentId, 'presence', userId);
      void setDoc(
        myPresenceRef,
        { cursorPos, selectionFrom, selectionTo, lastActive: Date.now() },
        { merge: true },
      );
    },
    [documentId, userId],
  );

  const addComment = useCallback(
    async (content: string, anchorPos: number, parentId?: string): Promise<void> => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const commentsRef = collection(db, 'documents', documentId, 'comments');
      const commentDoc = doc(commentsRef);
      const now = Date.now();
      await setDoc(commentDoc, {
        userId,
        userName,
        content,
        anchorPos,
        parentId: parentId ?? null,
        resolved: false,
        createdAt: now,
        updatedAt: now,
      });
    },
    [documentId, userId, userName],
  );

  const resolveComment = useCallback(
    async (commentId: string): Promise<void> => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const commentRef = doc(db, 'documents', documentId, 'comments', commentId);
      await setDoc(commentRef, { resolved: true, updatedAt: Date.now() }, { merge: true });
    },
    [documentId],
  );

  const lockSection = useCallback(
    async (sectionId: string): Promise<void> => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const now = Date.now();
      const lockRef = doc(db, 'documents', documentId, 'locks', sectionId);
      await setDoc(lockRef, {
        sectionId,
        lockedBy: userId,
        lockedByName: userName,
        lockedAt: now,
        expiresAt: now + LOCK_DURATION_MS,
      });
    },
    [documentId, userId, userName],
  );

  const unlockSection = useCallback(
    async (sectionId: string): Promise<void> => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const lockRef = doc(db, 'documents', documentId, 'locks', sectionId);
      await deleteDoc(lockRef);
    },
    [documentId],
  );

  const isSectionLocked = useCallback(
    (sectionId: string): SectionLock | null => {
      return sectionLocks.find(
        (l) => l.sectionId === sectionId && l.lockedBy !== userId,
      ) ?? null;
    },
    [sectionLocks, userId],
  );

  return {
    collaborators,
    liveComments,
    sectionLocks,
    isConnected,
    isAvailable: isFirebaseConfigured(),
    updateCursor,
    addComment,
    resolveComment,
    lockSection,
    unlockSection,
    isSectionLocked,
  };
}
