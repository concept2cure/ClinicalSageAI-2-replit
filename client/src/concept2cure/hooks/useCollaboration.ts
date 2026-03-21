/**
 * useCollaboration — Unified collaboration hook
 *
 * Bridges Firestore real-time collaboration (when Firebase is configured)
 * with the existing socket.io-based useDocumentCollaboration hook.
 *
 * Returns a unified interface matching UseDocumentCollaborationReturn so
 * consumers don't need to know which transport is active.
 *
 * Transport priority:
 *   1. Socket.io — always active as the primary transport
 *   2. Firestore — supplements with additional presence when configured
 */

import { useMemo, useCallback } from 'react';
import { isFirebaseConfigured } from '../config/firebase';
import { useRealtimeCollaboration, type CursorPresence } from './useRealtimeCollaboration';
import {
  useDocumentCollaboration,
  type CollaboratorInfo,
  type CursorPosition,
  type UseDocumentCollaborationReturn,
} from './useDocumentCollaboration';
import { getCurrentUser } from '../utils/getCurrentUser';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Firestore CursorPresence entry to the socket.io CollaboratorInfo shape */
function presenceToCollaborator(p: CursorPresence): CollaboratorInfo {
  return {
    id: p.userId,
    name: p.userName,
    color: p.color,
    status: p.activeSection ? 'editing' : 'online',
    currentSection: p.activeSection,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCollaboration(documentId: string | null): UseDocumentCollaborationReturn {
  const user = getCurrentUser();
  const firebaseActive = isFirebaseConfigured() && !!documentId;

  // Firestore layer (active when Firebase is configured)
  const firestore = useRealtimeCollaboration({
    documentId: documentId ?? '',
    userId: user.id,
    userName: user.name,
    presence: firebaseActive,
    comments: firebaseActive,
    locking: firebaseActive,
  });

  // Socket.io layer (always active as primary transport)
  const socket = useDocumentCollaboration(documentId);

  // Merge collaborators — socket.io takes precedence for duplicate IDs
  const collaborators = useMemo<CollaboratorInfo[]>(() => {
    const byId = new Map<string, CollaboratorInfo>();

    for (const c of socket.collaborators) {
      byId.set(c.id, c);
    }

    for (const p of firestore.collaborators) {
      if (!byId.has(p.userId)) {
        byId.set(p.userId, presenceToCollaborator(p));
      }
    }

    return Array.from(byId.values());
  }, [socket.collaborators, firestore.collaborators]);

  const isConnected = socket.isConnected || firestore.isConnected;

  // Dual-write cursor moves to both transports
  const emitCursorMove = useCallback(
    (position: { x: number; y: number; section?: string }): void => {
      socket.emitCursorMove(position);
      if (firestore.isConnected) {
        firestore.updateCursor(position.x);
      }
    },
    [socket, firestore],
  );

  return {
    isConnected,
    collaborators,
    cursors: socket.cursors,
    typingUsers: socket.typingUsers,
    emitCursorMove,
    emitChange: socket.emitChange,
    emitTypingStart: socket.emitTypingStart,
    emitTypingStop: socket.emitTypingStop,
    setPresence: socket.setPresence,
  };
}

export type { CollaboratorInfo, CursorPosition, UseDocumentCollaborationReturn };
