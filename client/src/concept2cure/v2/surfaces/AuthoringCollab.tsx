/**
 * AuthoringCollab — presence + section locking for the authoring canvas.
 *
 * Wired to the real collaboration service (server/routes/realtime-collab.ts,
 * mounted /api/realtime-collab):
 *   • POST   /rooms                        — join the section's room; the server
 *                                            returns the live connectedUsers roster
 *   • DELETE /rooms/:documentId/users/me   — leave on unmount/section change
 *   • PUT    /rooms/:documentId/awareness  — presence heartbeat
 *   • GET    /locks/:documentId            — active locks for the document
 *   • POST   /locks                        — acquire a section lock (409 when
 *                                            another user holds it — surfaced
 *                                            with the server's reason)
 *   • DELETE /locks/:documentId            — release own lock
 *
 * IDENTITY IS THE SERVER'S. This component used to send its own userId with
 * every call and decide "is this my lock?" by comparing that string to the
 * lock's userId. Both were wrong: the server took the body's userId as the
 * actor (so naming someone else acted as them), and the client cannot know how
 * the server identifies it. Locks now arrive with a server-computed `mine`, the
 * holder is displayed by the server's own label, and no identity is sent.
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
import { getAuthToken } from '@/utils/authToken';
import { useAuth } from '@/services/portal/authService';

interface RoomUser { userId: string; displayName?: string; email?: string; }
interface SectionLock {
  documentId?: string;
  sectionId?: string | null;
  /** Server-computed: does this lock belong to the caller? Never inferred here. */
  mine?: boolean;
  lockedByLabel?: string;
  lockType?: string;
  reason?: string;
  expiresAt?: string;
}

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

  // Section scope travels as an explicit parameter now; the server composes the
  // room key itself, prefixed with the tenant, so a client cannot address
  // another organization's room by constructing its key.
  const sectionParam = sectionId ? `?sectionId=${encodeURIComponent(sectionId)}` : '';

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
      // Best-effort leave with keepalive so a navigation/tab-close actually
      // reaches the server (a plain fetch is usually cancelled mid-unload —
      // assessment D29). The server's idle sweep (90s TTL) is the backstop.
      try {
        const token = getAuthToken();
        void fetch(`/api/realtime-collab/rooms/${encodeURIComponent(documentId)}/users/me${sectionParam}`, {
          method: 'DELETE',
          keepalive: true,
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }).catch(() => {});
      } catch {
        void apiRequest('DELETE', `/api/realtime-collab/rooms/${encodeURIComponent(documentId)}/users/me${sectionParam}`).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, sectionId, projectId, userId]);

  // Awareness heartbeat: while joined, periodically PUT our focus to the room's
  // awareness endpoint and adopt the SERVER's returned connectedUsers as the
  // live roster — real presence refresh over the collab service's own protocol,
  // not a client-side simulation. (Live CRDT cursors remain the Yjs socket
  // follow-on; this is the REST awareness the same rooms serve.)
  useEffect(() => {
    if (!joined || !userId) return;
    let cancelled = false;
    const beat = async () => {
      // A hidden tab does not claim presence — the server's idle sweep then
      // ages it out honestly instead of a background tab looking "present".
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await apiRequest('PUT', `/api/realtime-collab/rooms/${encodeURIComponent(documentId)}/awareness`, {
          sectionId: sectionId || undefined, focusedField: sectionId || null, isTyping: false,
        });
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok && Array.isArray(body?.connectedUsers)) {
          setPeers(body.connectedUsers as RoomUser[]);
        }
      } catch { /* roster keeps its last server value */ }
    };
    void beat();
    const t = setInterval(() => { void beat(); }, 20000);
    // Coming back to the tab re-claims presence immediately (the server
    // re-joins an evicted member on heartbeat).
    const onVis = () => { if (!document.hidden) void beat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [joined, userId, documentId, sectionId]);

  const myLock = locks.find((l) => l.mine === true && (l.sectionId ?? null) === (sectionId ?? null));
  const otherLock = locks.find((l) => l.mine !== true && (l.sectionId ?? null) === (sectionId ?? null));

  const acquire = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiRequest('POST', '/api/realtime-collab/locks', {
        documentId, sectionId: sectionId || undefined,
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
        sectionId: sectionId || undefined,
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
        <span className="rd-chip tone-warn" title={otherLock.reason || ''}>{I.lock} locked by {otherLock.lockedByLabel || 'another author'}</span>
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
