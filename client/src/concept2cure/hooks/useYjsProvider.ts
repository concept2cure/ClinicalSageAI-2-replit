/**
 * useYjsProvider — Real-time CRDT collaboration via Y.js + Hocuspocus.
 *
 * Replaces the Socket.io broadcast model with conflict-free replicated
 * data types for true multi-cursor collaborative editing.
 *
 * Usage:
 *   const { ydoc, provider, isConnected, collaborators } = useYjsProvider({
 *     documentId: artifact.id,
 *     userName: user.name,
 *     userColor: '#3B82F6',
 *   });
 *   // Pass ydoc to TipTap Collaboration extension
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { getAuthToken } from '@/utils/authToken';

export interface YjsCollaborator {
  clientId: number;
  name: string;
  color: string;
  cursor?: { anchor: number; head: number } | null;
}

interface UseYjsProviderOptions {
  documentId: string;
  projectId?: string;
  userName: string;
  userColor?: string;
  /** Override WebSocket URL (defaults to current host /collab) */
  wsUrl?: string;
  /** Disable connection (e.g. in readonly mode) */
  enabled?: boolean;
}

interface UseYjsProviderReturn {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isConnected: boolean;
  isSynced: boolean;
  collaborators: YjsCollaborator[];
}

// Deterministic color palette for collaborators
const COLLAB_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#6366F1',
  '#14B8A6',
];

function getCollabColor(index: number): string {
  return COLLAB_COLORS[index % COLLAB_COLORS.length];
}

export function useYjsProvider({
  documentId,
  projectId,
  userName,
  userColor,
  wsUrl,
  enabled = true,
}: UseYjsProviderOptions): UseYjsProviderReturn {
  const ydocRef = useRef<Y.Doc>(new Y.Doc());
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [collaborators, setCollaborators] = useState<YjsCollaborator[]>([]);

  // Stable ydoc instance per documentId
  useEffect(() => {
    ydocRef.current = new Y.Doc();
    return () => {
      ydocRef.current.destroy();
    };
  }, [documentId]);

  useEffect(() => {
    if (!enabled || !documentId) return;

    const ydoc = ydocRef.current;

    // Build WebSocket URL — Hocuspocus connects via WS
    const resolvedWsUrl = wsUrl || buildWsUrl();
    const roomName = projectId ? `${projectId}:${documentId}` : documentId;

    const provider = new HocuspocusProvider({
      url: resolvedWsUrl,
      name: roomName,
      document: ydoc,
      token: getAuthToken(),
      onConnect: () => setIsConnected(true),
      onDisconnect: () => setIsConnected(false),
      onSynced: () => setIsSynced(true),
      onAwarenessUpdate: ({ states }) => {
        const others: YjsCollaborator[] = [];
        states.forEach((state: Record<string, unknown>, clientId: number) => {
          if (clientId === ydoc.clientID) return;
          const user = state.user as { name?: string; color?: string } | undefined;
          if (user?.name) {
            others.push({
              clientId,
              name: user.name,
              color: user.color || getCollabColor(clientId % COLLAB_COLORS.length),
              cursor: state.cursor as { anchor: number; head: number } | null,
            });
          }
        });
        setCollaborators(others);
      },
    });

    // Set local awareness state
    provider.setAwarenessField('user', {
      name: userName,
      color: userColor || getCollabColor(ydoc.clientID % COLLAB_COLORS.length),
    });

    providerRef.current = provider;

    return () => {
      provider.destroy();
      providerRef.current = null;
      setIsConnected(false);
      setIsSynced(false);
      setCollaborators([]);
    };
  }, [documentId, projectId, userName, userColor, wsUrl, enabled]);

  return useMemo(
    () => ({
      ydoc: ydocRef.current,
      provider: providerRef.current,
      isConnected,
      isSynced,
      collaborators,
    }),
    [isConnected, isSynced, collaborators]
  );
}

/** Build WS URL from current page location */
function buildWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/collab`;
}

export default useYjsProvider;
