import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getCurrentUser } from '../utils/getCurrentUser';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CollaboratorInfo {
  id: string;
  socketId?: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
  status: 'online' | 'editing' | 'idle';
  lastActivity?: Date;
  currentSection?: string;
}

export interface CursorPosition {
  userId: string;
  userName: string;
  x: number;
  y: number;
  section?: string;
  color: string;
  timestamp: number;
}

export interface UseDocumentCollaborationReturn {
  isConnected: boolean;
  collaborators: CollaboratorInfo[];
  cursors: Map<string, CursorPosition>;
  typingUsers: Set<string>;
  emitCursorMove: (position: { x: number; y: number; section?: string }) => void;
  emitChange: (section: string, content: string, operation: 'insert' | 'delete' | 'replace') => void;
  emitTypingStart: (section?: string) => void;
  emitTypingStop: () => void;
  setPresence: (status: 'online' | 'idle' | 'editing') => void;
}

// Collaborator colors assigned server-side, but we keep a fallback palette
const FALLBACK_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useDocumentCollaboration(documentId: string | null): UseDocumentCollaborationReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  const userRef = useRef(getCurrentUser());

  // ── Connect & join document room ────────────────────────────────────────────

  useEffect(() => {
    if (!documentId) return;

    const user = userRef.current;

    const socket = io(window.location.origin, {
      path: '/socket.io/',
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // -- Connection lifecycle ------------------------------------------------

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-document', {
        documentId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // -- Document state (initial snapshot after joining) ----------------------

    socket.on('document-state', (state: {
      collaborators: CollaboratorInfo[];
      activities?: unknown[];
      comments?: unknown[];
      sectionLocks?: unknown[];
    }) => {
      if (state.collaborators) {
        setCollaborators(state.collaborators);
      }
    });

    // -- Collaborator events -------------------------------------------------

    socket.on('collaborator-joined', (collaborator: CollaboratorInfo) => {
      setCollaborators((prev) => {
        // Avoid duplicates
        if (prev.some((c) => c.id === collaborator.id)) {
          return prev.map((c) => (c.id === collaborator.id ? { ...c, ...collaborator } : c));
        }
        return [...prev, collaborator];
      });
    });

    socket.on('collaborator-left', ({ userId }: { userId: string }) => {
      setCollaborators((prev) => prev.filter((c) => c.id !== userId));
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    socket.on('collaborator-status-update', (update: {
      userId: string;
      status: 'online' | 'idle' | 'editing';
    }) => {
      setCollaborators((prev) =>
        prev.map((c) => (c.id === update.userId ? { ...c, status: update.status } : c)),
      );
    });

    // -- Cursor tracking -----------------------------------------------------

    socket.on('cursor-update', (data: { position: CursorPosition; timestamp: number }) => {
      const pos = data.position;
      if (pos.userId === user.id) return; // ignore own cursor echoes
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(pos.userId, { ...pos, timestamp: data.timestamp ?? pos.timestamp });
        return next;
      });
    });

    // -- Typing indicators ---------------------------------------------------

    socket.on('user-typing', (data: {
      userId: string;
      userName: string;
      section?: string;
      isTyping: boolean;
      timestamp: number;
    }) => {
      if (data.userId === user.id) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (data.isTyping) {
          next.add(data.userId);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    });

    // -- Document changes from others ----------------------------------------

    socket.on('document-updated', (_data: {
      userId: string;
      userName: string;
      section: string;
      content: string;
      operation: string;
      timestamp: number;
    }) => {
      // Consumers can subscribe to this via a separate callback or event bus.
      // For now the hook surfaces collaborator/cursor/typing state;
      // document content merging is left to the editor layer.
    });

    // -- Actually connect ----------------------------------------------------

    socket.connect();

    // -- Cleanup on unmount or documentId change -----------------------------

    return () => {
      if (socket.connected) {
        socket.emit('leave-document', { documentId });
      }
      socket.off();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setCollaborators([]);
      setCursors(new Map());
      setTypingUsers(new Set());
    };
  }, [documentId]);

  // ── Emit helpers ──────────────────────────────────────────────────────────────

  const emitCursorMove = useCallback(
    (position: { x: number; y: number; section?: string }) => {
      const socket = socketRef.current;
      if (!socket?.connected || !documentId) return;
      const user = userRef.current;
      socket.emit('cursor-move', {
        documentId,
        position: {
          userId: user.id,
          userName: user.name,
          x: position.x,
          y: position.y,
          section: position.section,
          color: FALLBACK_COLORS[0],
        },
      });
    },
    [documentId],
  );

  const emitChange = useCallback(
    (section: string, content: string, operation: 'insert' | 'delete' | 'replace') => {
      const socket = socketRef.current;
      if (!socket?.connected || !documentId) return;
      const user = userRef.current;
      socket.emit('document-change', {
        documentId,
        userId: user.id,
        userName: user.name,
        section,
        content,
        operation,
        timestamp: Date.now(),
      });
    },
    [documentId],
  );

  const emitTypingStart = useCallback(
    (section?: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !documentId) return;
      const user = userRef.current;
      socket.emit('typing-start', {
        documentId,
        userId: user.id,
        userName: user.name,
        section,
      });
    },
    [documentId],
  );

  const emitTypingStop = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !documentId) return;
    const user = userRef.current;
    socket.emit('typing-stop', {
      documentId,
      userId: user.id,
    });
  }, [documentId]);

  const setPresence = useCallback(
    (status: 'online' | 'idle' | 'editing') => {
      const socket = socketRef.current;
      if (!socket?.connected || !documentId) return;
      const user = userRef.current;
      socket.emit('presence-update', {
        documentId,
        userId: user.id,
        status,
      });
    },
    [documentId],
  );

  return {
    isConnected,
    collaborators,
    cursors,
    typingUsers,
    emitCursorMove,
    emitChange,
    emitTypingStart,
    emitTypingStop,
    setPresence,
  };
}
