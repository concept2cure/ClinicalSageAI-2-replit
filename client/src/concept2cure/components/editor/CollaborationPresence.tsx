/**
 * CollaborationPresence — Live collaborator avatars and cursor indicators.
 *
 * Shows who's currently viewing/editing the document with colored avatars,
 * typing indicators, and connection status. Sits in the editor toolbar.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, PenLine } from 'lucide-react';
import type { CollaboratorInfo } from '../../hooks/useDocumentCollaboration';

// ── Types ──────────────────────────────────────────────────────────────────

interface CollaborationPresenceProps {
  isConnected: boolean;
  collaborators: CollaboratorInfo[];
  typingUsers: Set<string>;
  currentUserId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────────────

export function CollaborationPresence({
  isConnected,
  collaborators,
  typingUsers,
  currentUserId,
}: CollaborationPresenceProps) {
  // Filter out current user
  const others = collaborators.filter(c => c.id !== currentUserId);

  if (others.length === 0 && isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-stone-400">
        <Wifi className="w-3 h-3 text-emerald-500" />
        <span>Live</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-stone-400">
        <WifiOff className="w-3 h-3 text-stone-400" />
        <span>Offline</span>
      </div>
    );
  }

  // Show up to 4 avatars, then +N overflow
  const visible = others.slice(0, 4);
  const overflow = others.length - 4;

  return (
    <div className="flex items-center gap-2">
      {/* Connection indicator */}
      <Wifi className="w-3 h-3 text-emerald-500 shrink-0" />

      {/* Avatar stack */}
      <div className="flex items-center -space-x-1.5">
        {visible.map(collab => {
          const isTyping = typingUsers.has(collab.id);
          const isEditing = collab.status === 'editing';

          return (
            <div
              key={collab.id}
              className="relative group"
              title={`${collab.name}${isTyping ? ' (typing...)' : isEditing ? ' (editing)' : ''}`}
            >
              {/* Avatar circle */}
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold ring-2 ring-white transition-all duration-150',
                  isTyping && 'ring-amber-400 animate-pulse',
                )}
                style={{ backgroundColor: collab.color }}
              >
                {getInitials(collab.name)}
              </div>

              {/* Status dot */}
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white',
                  collab.status === 'editing' ? 'bg-blue-500' :
                  collab.status === 'idle' ? 'bg-amber-400' :
                  'bg-emerald-500',
                )}
              />

              {/* Typing indicator */}
              {isTyping && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-3 h-3 bg-amber-500 rounded-full">
                  <PenLine className="w-1.5 h-1.5 text-white" />
                </span>
              )}

              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-stone-800 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {collab.name}
                {isTyping && ' — typing...'}
                {isEditing && !isTyping && ' — editing'}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-stone-800" />
              </div>
            </div>
          );
        })}

        {/* Overflow count */}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-[9px] font-semibold text-stone-600 ring-2 ring-white">
            +{overflow}
          </div>
        )}
      </div>

      {/* Collaborator count */}
      <span className="text-[10px] text-stone-400 font-medium tabular-nums">
        {others.length + 1} editing
      </span>
    </div>
  );
}

/**
 * CollaborationCursors — Renders remote cursors as colored labels in the editor.
 * This would be overlaid on the TipTap editor content area.
 */
export function CollaborationCursors({
  cursors,
  currentUserId,
}: {
  cursors: Map<string, { userId: string; userName: string; x: number; y: number; color: string; timestamp: number }>;
  currentUserId?: string;
}) {
  const entries = Array.from(cursors.values()).filter(c => c.userId !== currentUserId);

  if (entries.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
      {entries.map(cursor => {
        // Only show cursors from last 30 seconds
        if (Date.now() - cursor.timestamp > 30000) return null;

        return (
          <div
            key={cursor.userId}
            className="absolute transition-all duration-150"
            style={{ left: cursor.x, top: cursor.y }}
          >
            {/* Cursor line */}
            <div
              className="w-0.5 h-5 rounded-full"
              style={{ backgroundColor: cursor.color }}
            />
            {/* Name label */}
            <div
              className="absolute top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-medium text-white whitespace-nowrap shadow-sm"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName.split(' ')[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CollaborationPresence;
