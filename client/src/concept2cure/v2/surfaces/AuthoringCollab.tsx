/**
 * AuthoringCollab — presence + section locking for the authoring canvas.
 *
 * Wired to the real collaboration service (server/routes/realtime-collab.ts,
 * mounted /api/realtime-collab):
 *   • POST   /rooms                       — join the section's room; the server
 *                                           returns the live connectedUsers roster
 *   • DELETE /rooms/:roomKey/users/:uid   — leave on unmount/section change
 *   • GET    /locks/:documentId           — active locks for the document
 *   • POST   /locks                       — acquire a section lock (409 when
 *                                           another user holds it — surfaced
 *                                           with the server's reason)
 *   • DELETE /locks/:documentId           — release own lock
 *
 * This is the service's REST layer — presence roster and Part 11 section
 * locking. The Yjs CRDT socket sync (y-websocket live co-editing) rides the
 * same rooms and is a follow-on editor-infrastructure build; nothing here
 * pretends live cursors exist. No project/user → the component renders nothing
 * rather than joining with fabricated identity.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { I } from '../icons';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/services/portal/authService';

interface RoomUser { userId: string; displayName?: string; email?: string; }
interface SectionLock { documentId?: string; sectionId?: string | null; userId?: string; lockType?: string; reason?: string; expiresAt?: string; }

export interface AuthoringCollabProps {
  documentId: string;
  sectionId: string | null;
  fireToast: (m: string) => void;
}

function initials(name: string): string {
  return name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase() || '·';
}

export function AuthoringCollab({ documentId, sectionId, fireToast }: AuthoringCollabProps) {
  const { user } = useAuth();
  const userId = user?.email || null;
  const displayName = user?.displayName || user?.email || '';
  const projectId = (() => {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p?.id != null ? String(p.id) : null;
  })();

  const [peers, setPeers] = useState<RoomUser[]>([]);
  const [locks, setLocks] = useState<SectionLock[]>([]);
  const [joined, setJoined] = useState(false);

  const roomKey = sectionId ? `${documentId}:${sectionId}` : documentId;

  const loadLocks = useCallback(async () => {
    try {
      const res = await apiRequest('GET', `/api/realtime-collab/locks/${encodeURIComponent(documentId)}`);
      const body = await res.json().catch(() => null);
      if (res.ok && Array.isArray(body?.data)) setLocks(body.data as SectionLock[]);
    } catch { /* lock roster stays as-is; actions report their own errors */ }
  }, [documentId]);

  // Join the section room; leave on unmount / section change. Without a
  // project or an authenticated identity there is nothing honest to join with.
  useEffect(() => {
    if (!projectId || !userId) { setJoined(false); setPeers([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiRequest('POST', '/api/realtime-collab/rooms', {
          documentId, projectId, sectionId: sectionId || undefined,
          userId, displayName, email: user?.email || '',
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && body?.success) {
          setJoined(true);
          setPeers(Array.isArray(body?.data?.room?.connectedUsers) ? body.data.room.connectedUsers : []);
        } else {
          setJoined(false);
        }
      } catch { if (!cancelled) setJoined(false); }
      void loadLocks();
    })();
    return () => {
      cancelled = true;
      // Best-effort leave; the server also expires idle members.
      void apiRequest('DELETE', `/api/realtime-collab/rooms/${encodeURIComponent(roomKey)}/users/${encodeURIComponent(userId)}`).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, sectionId, projectId, userId]);

  const myLock = locks.find((l) => l.userId === userId && (l.sectionId ?? null) === (sectionId ?? null));
  const otherLock = locks.find((l) => l.userId !== userId && (l.sectionId ?? null) === (sectionId ?? null));

  const acquire = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest('POST', '/api/realtime-collab/locks', {
        documentId, sectionId: sectionId || undefined, userId,
        lockType: 'section-edit', reason: 'Editing in the authoring canvas',
      });
      const body = await res.json().catch(() => null);
      if (res.status === 409) { fireToast('Section is locked — ' + (body?.error ?? 'another author holds the lock') + '.'); void loadLocks(); return; }
      if (!res.ok || !body?.success) { fireToast('Couldn’t acquire the lock — ' + (body?.error ?? `HTTP ${res.status}`) + '.'); return; }
      fireToast('Section locked for your edit.');
      void loadLocks();
    } catch (e) {
      fireToast('Couldn’t acquire the lock — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  }, [documentId, sectionId, userId, loadLocks, fireToast]);

  const release = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest('DELETE', `/api/realtime-collab/locks/${encodeURIComponent(documentId)}`, {
        userId, sectionId: sectionId || undefined,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { fireToast(`Couldn’t release the lock (HTTP ${res.status}).`); return; }
      fireToast(body?.released ? 'Lock released.' : 'No lock of yours to release.');
      void loadLocks();
    } catch (e) {
      fireToast('Couldn’t release — ' + (e instanceof Error ? e.message : String(e)) + '.');
    }
  }, [documentId, sectionId, userId, loadLocks, fireToast]);

  if (!projectId || !userId) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Presence roster — the server's live connectedUsers, never fabricated. */}
      {joined && peers.length > 0 && (
        <div style={{ display: 'flex', gap: 2 }} title={peers.map((p) => p.displayName || p.userId).join(', ')}>
          {peers.slice(0, 4).map((p) => (
            <span key={p.userId} className="cmt-av" style={{ width: 22, height: 22, fontSize: 10 }}
              data-me={p.userId === userId || undefined}>
              {initials(p.displayName || p.userId)}
            </span>
          ))}
          {peers.length > 4 && <span style={{ fontSize: 11, color: 'var(--c2c-dim,#667085)' }}>+{peers.length - 4}</span>}
        </div>
      )}
      {otherLock ? (
        <span className="rd-chip tone-warn" title={otherLock.reason || ''}>{I.lock} locked by {otherLock.userId}</span>
      ) : myLock ? (
        <button className="btn ghost" style={{ height: 30 }} onClick={release} title="Release your section lock">
          {I.lock} Unlock
        </button>
      ) : (
        <button className="btn ghost" style={{ height: 30 }} onClick={acquire} disabled={!sectionId}
          title={sectionId ? 'Lock this section while you edit' : 'Select a section to lock'}>
          {I.lock} Lock section
        </button>
      )}
    </div>
  );
}
