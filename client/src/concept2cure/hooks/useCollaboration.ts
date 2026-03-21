/**
 * useCollaboration — Unified collaboration hook
 *
 * Bridges Firestore real-time collaboration (when Firebase is configured)
 * with the existing socket.io-based useDocumentCollaboration hook.
 *
 * Returns a unified interface matching UseDocumentCollaborationReturn so
 * consumers don't need to know which transport is active.
 */

import { useMemo } from 'react';
import { isFirebaseConfigured } from '../config/firebase';
import { useRealtimeCollaboration } from './useRealtimeCollaboration';
import { useDocumentCollaboration, type CollaboratorInfo, type UseDocumentCollaborationReturn } from './useDocumentCollaboration';
import { getCurrentUser } from '../utils/getCurrentUser';

export function useCollaboration(documentId: string | null): UseDocumentCollaborationReturn {
  const user = getCurrentUser();

  // ── Firestore layer (active when Firebase is configured) ──────────────
  const firestore = useRealtimeCollaboration({
    documentId: documentId || '',
    userId: user.id,
    userName: user.name,
    presence: isFirebaseConfigured() && !!documentId,
    comments: isFirebaseConfigured() && !!documentId,
    locking: isFirebaseConfigured() && !!documentId,
  });

  // ── Socket.io layer (always active as primary transport) ──────────────
  const socket = useDocumentCollaboration(documentId);

  // ── Merge collaborators from both sources ─────────────────────────────
  const collaborators = useMemo<CollaboratorInfo[]>(() => {
    const byId = new Map<string, CollaboratorInfo>();

    // Socket.io collaborators first
    for (const c of socket.collaborators) {
      byId.set(c.id, c);
    }

    // Merge Firestore presence — add users not already in socket.io list
    for (const p of firestore.collaborators) {
      if (!byId.has(p.userId)) {
        byId.set(p.userId, {
          id: p.userId,
          name: p.userName,
          color: p.color,
          status: p.activeSection ? 'editing' : 'online',
          currentSection: p.activeSection,
        });
      }
    }

    return Array.from(byId.values());
  }, [socket.collaborators, firestore.collaborators]);

  // Connected if either transport is active
  const isConnected = socket.isConnected || firestore.isConnected;

  return {
    isConnected,
    collaborators,
    cursors: socket.cursors,
    typingUsers: socket.typingUsers,
    emitCursorMove: (position) => {
      socket.emitCursorMove(position);
      // Also update Firestore cursor
      if (firestore.isConnected) {
        firestore.updateCursor(position.x);
      }
    },
    emitChange: socket.emitChange,
    emitTypingStart: socket.emitTypingStart,
    emitTypingStop: socket.emitTypingStop,
    setPresence: socket.setPresence,
  };
}

export type { CollaboratorInfo, UseDocumentCollaborationReturn };
