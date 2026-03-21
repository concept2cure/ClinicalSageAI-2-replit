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
  serverTimestamp,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CursorPresence {
  userId: string;
  userName: string;
  color: string;
  /** JSON cursor position from TipTap */
  cursorPos: number | null;
  /** Selection anchor/head */
  selectionFrom?: number;
  selectionTo?: number;
  /** Timestamp of last activity */
  lastActive: number;
  /** Currently editing section */
  activeSection?: string;
}

export interface LiveComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  /** Position in document (character offset) */
  anchorPos: number;
  /** Thread parent ID (null for top-level) */
  parentId: string | null;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SectionLock {
  sectionId: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: number;
  /** Auto-expires after this timestamp */
  expiresAt: number;
}

// ── Cursor colors for collaborators ──────────────────────────────────────────

const CURSOR_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#14B8A6',
];

function getCursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseRealtimeCollaborationOptions {
  documentId: string;
  userId: string;
  userName: string;
  /** Enable cursor presence tracking */
  presence?: boolean;
  /** Enable live comments */
  comments?: boolean;
  /** Enable section locking */
  locking?: boolean;
}

export function useRealtimeCollaboration({
  documentId,
  userId,
  userName,
  presence: enablePresence = true,
  comments: enableComments = true,
  locking: enableLocking = true,
}: UseRealtimeCollaborationOptions) {
  const [collaborators, setCollaborators] = useState<CursorPresence[]>([]);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [sectionLocks, setSectionLocks] = useState<SectionLock[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();

  // ── Connect to Firestore listeners ────────────────────────────────────────

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
        snapshot.forEach((doc) => {
          const data = doc.data() as CursorPresence;
          // Filter out stale presences (>30s old) and self
          if (data.userId !== userId && now - data.lastActive < 30000) {
            presences.push(data);
          }
        });
        setCollaborators(presences);
      });
      unsubs.push(unsub);

      // Register own presence
      const myPresenceRef = doc(db, 'documents', documentId, 'presence', userId);
      setDoc(myPresenceRef, {
        userId,
        userName,
        color: getCursorColor(userId),
        cursorPos: null,
        lastActive: Date.now(),
      });

      // Heartbeat every 10s
      heartbeatRef.current = setInterval(() => {
        setDoc(myPresenceRef, { lastActive: Date.now() }, { merge: true });
      }, 10000);
    }

    // Comments listener
    if (enableComments) {
      const commentsRef = collection(db, 'documents', documentId, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'asc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const comments: LiveComment[] = [];
        snapshot.forEach((doc) => {
          comments.push({ id: doc.id, ...doc.data() } as LiveComment);
        });
        setLiveComments(comments);
      });
      unsubs.push(unsub);
    }

    // Section locks listener
    if (enableLocking) {
      const locksRef = collection(db, 'documents', documentId, 'locks');
      const unsub = onSnapshot(locksRef, (snapshot) => {
        const now = Date.now();
        const locks: SectionLock[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as SectionLock;
          // Only show non-expired locks
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
        deleteDoc(myPresenceRef).catch(() => {});
      }

      setIsConnected(false);
    };
  }, [documentId, userId, userName, enablePresence, enableComments, enableLocking]);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Update own cursor position */
  const updateCursor = useCallback(
    (cursorPos: number | null, selectionFrom?: number, selectionTo?: number) => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const myPresenceRef = doc(db, 'documents', documentId, 'presence', userId);
      setDoc(
        myPresenceRef,
        { cursorPos, selectionFrom, selectionTo, lastActive: Date.now() },
        { merge: true },
      );
    },
    [documentId, userId],
  );

  /** Add a comment at a document position */
  const addComment = useCallback(
    async (content: string, anchorPos: number, parentId?: string) => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const commentsRef = collection(db, 'documents', documentId, 'comments');
      const commentDoc = doc(commentsRef);
      await setDoc(commentDoc, {
        userId,
        userName,
        content,
        anchorPos,
        parentId: parentId || null,
        resolved: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
    [documentId, userId, userName],
  );

  /** Resolve a comment thread */
  const resolveComment = useCallback(
    async (commentId: string) => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const commentRef = doc(db, 'documents', documentId, 'comments', commentId);
      await setDoc(commentRef, { resolved: true, updatedAt: Date.now() }, { merge: true });
    },
    [documentId],
  );

  /** Lock a section for editing (5-minute auto-expire) */
  const lockSection = useCallback(
    async (sectionId: string) => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const lockRef = doc(db, 'documents', documentId, 'locks', sectionId);
      await setDoc(lockRef, {
        sectionId,
        lockedBy: userId,
        lockedByName: userName,
        lockedAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });
    },
    [documentId, userId, userName],
  );

  /** Release a section lock */
  const unlockSection = useCallback(
    async (sectionId: string) => {
      if (!isFirebaseConfigured() || !documentId) return;
      const db = getFirestoreDb();
      if (!db) return;

      const lockRef = doc(db, 'documents', documentId, 'locks', sectionId);
      await deleteDoc(lockRef);
    },
    [documentId],
  );

  /** Check if a section is locked by someone else */
  const isSectionLocked = useCallback(
    (sectionId: string): SectionLock | null => {
      const lock = sectionLocks.find(
        (l) => l.sectionId === sectionId && l.lockedBy !== userId,
      );
      return lock || null;
    },
    [sectionLocks, userId],
  );

  return {
    /** Other users' cursors and presence */
    collaborators,
    /** Live comment threads */
    liveComments,
    /** Active section locks */
    sectionLocks,
    /** Whether Firestore connection is active */
    isConnected,
    /** Whether Firebase is configured at all */
    isAvailable: isFirebaseConfigured(),
    // Actions
    updateCursor,
    addComment,
    resolveComment,
    lockSection,
    unlockSection,
    isSectionLocked,
  };
}
