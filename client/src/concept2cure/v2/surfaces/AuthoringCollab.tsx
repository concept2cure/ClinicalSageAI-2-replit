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
import { apiCall, apiErrorText } from '../apiCall';
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
  /* BP-W0-6: same erased tone as AuthoringFilingBar — a failed lock acquire or
     takeover announced itself with the success tick. Lower stakes (editorial
     concurrency, not a regulated state change) but the same defect. */
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
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
    const res = await apiCall<{ data?: SectionLock[] }>('GET', `/api/realtime-collab/locks/${encodeURIComponent(documentId)}`);
    // Lock roster stays as-is on failure; actions report their own errors.
    if (res.ok && Array.isArray(res.body?.data)) setLocks(res.body.data);
  }, [documentId]);

  // Join the section room; leave on unmount / section change. Without a
  // project or an authenticated identity there is nothing honest to join with.
  useEffect(() => {
    if (!projectId || !userId) { setJoined(false); setPeers([]); return; }
    let cancelled = false;
    void (async () => {
      const res = await apiCall<{ success?: boolean; data?: { room?: { connectedUsers?: RoomUser[] } } }>(
        'POST', '/api/realtime-collab/rooms',
        { documentId, projectId, sectionId: sectionId || undefined },
      );
      if (cancelled) return;
      if (res.ok && res.body?.success) {
        setJoined(true);
        setPeers(Array.isArray(res.body.data?.room?.connectedUsers) ? res.body.data!.room!.connectedUsers! : []);
      } else {
        setJoined(false);
      }
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
        void apiCall('DELETE', `/api/realtime-collab/rooms/${encodeURIComponent(documentId)}/users/me${sectionParam}`);
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
      const res = await apiCall<{ connectedUsers?: RoomUser[] }>(
        'PUT', `/api/realtime-collab/rooms/${encodeURIComponent(documentId)}/awareness`,
        { sectionId: sectionId || undefined, focusedField: sectionId || null, isTyping: false },
      );
      // Roster keeps its last server value on failure.
      if (!cancelled && res.ok && Array.isArray(res.body?.connectedUsers)) {
        setPeers(res.body.connectedUsers);
      }
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

  // Two-step takeover of another author's lock (server audits it and notifies
  // them). First click arms; second click within the window commits.
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  // The reason the USER gives for taking someone else's lock. This was
  // previously the constant 'Took over a stale section lock from the authoring
  // canvas'. The server genuinely enforces this control —
  // realtime-collab.ts rejects a takeover whose reason is under 3 characters,
  // because it is recorded in the audit trail and the displaced author is shown
  // it. Satisfying that check with the same canned sentence every time defeated
  // a control the backend was correctly insisting on, and left every takeover
  // in the ledger reading identically.
  const [takeoverReason, setTakeoverReason] = useState('');
  const takeoverReasonOk = takeoverReason.trim().length >= 3;
  // No auto-disarm timer here any more: it would wipe a part-written reason.

  const takeover = useCallback(async () => {
    if (!confirmTakeover) { setConfirmTakeover(true); return; }
    if (!takeoverReasonOk) return;
    setConfirmTakeover(false);
    const res = await apiCall<{ success?: boolean }>('POST', '/api/realtime-collab/locks', {
      documentId, sectionId: sectionId || undefined,
      lockType: 'section-edit', takeover: true,
      reason: takeoverReason.trim(),
    });
    if (!res.ok || !res.body?.success) {
      fireToast('Couldn’t take over the lock — ' + apiErrorText(res, `HTTP ${res.status}`) + '.', 'error');
      return;
    }
    fireToast('Lock taken over — the previous holder has been notified.');
    void loadLocks();
  }, [confirmTakeover, documentId, sectionId, loadLocks, fireToast]);

  /** Minutes until a lock expires — the chip's honesty about staleness. */
  const expiresIn = (iso?: string): string => {
    if (!iso) return '';
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return ' (expired)';
    const min = Math.ceil(ms / 60000);
    return ` · ${min} min left`;
  };

  const acquire = useCallback(async () => {
    if (!userId) return;
    const res = await apiCall<{ success?: boolean }>('POST', '/api/realtime-collab/locks', {
      documentId, sectionId: sectionId || undefined,
      lockType: 'section-edit', reason: 'Editing in the authoring canvas',
    });
    if (res.status === 409) {
      fireToast('Section is locked — ' + apiErrorText(res, 'another author holds the lock') + '.', 'error');
      void loadLocks();
      return;
    }
    if (!res.ok || !res.body?.success) {
      fireToast('Couldn’t acquire the lock — ' + apiErrorText(res, `HTTP ${res.status}`) + '.', 'error');
      return;
    }
    fireToast('Section locked for your edit.');
    void loadLocks();
  }, [documentId, sectionId, userId, loadLocks, fireToast]);

  const release = useCallback(async () => {
    if (!userId) return;
    const res = await apiCall<{ released?: boolean }>('DELETE', `/api/realtime-collab/locks/${encodeURIComponent(documentId)}`, {
      sectionId: sectionId || undefined,
    });
    if (!res.ok) { fireToast(apiErrorText(res, `Couldn’t release the lock (HTTP ${res.status}).`), 'error'); return; }
    fireToast(res.body?.released ? 'Lock released.' : 'No lock of yours to release.');
    void loadLocks();
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
        <>
          <span className="rd-chip tone-warn" title={otherLock.reason || ''}>
            {I.lock} locked by {otherLock.lockedByLabel || 'another author'}{expiresIn(otherLock.expiresAt)}
          </span>
          {confirmTakeover && (
            <input
              className="rd-input"
              style={{ height: 30, minWidth: 240 }}
              autoFocus
              value={takeoverReason}
              onChange={(e) => setTakeoverReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && takeoverReasonOk) void takeover(); }}
              aria-label="Reason for taking over the lock"
              aria-required="true"
              placeholder={`Why are you taking this from ${otherLock.lockedByLabel || 'them'}?`}
            />
          )}
          <button
            className="btn ghost"
            style={{ height: 30, ...(confirmTakeover ? { color: 'var(--error)', borderColor: 'var(--error)' } : {}) }}
            onClick={takeover}
            disabled={confirmTakeover && !takeoverReasonOk}
            title={
              confirmTakeover && !takeoverReasonOk
                ? 'Give a reason — the holder is shown it and it is written to the audit trail'
                : 'Take over this lock — the holder is notified and the takeover is audited'
            }
            aria-label={confirmTakeover ? 'Confirm lock takeover' : 'Take over the section lock'}
          >
            {confirmTakeover ? 'Confirm takeover' : 'Take over'}
          </button>
          {confirmTakeover && (
            <button
              className="btn ghost"
              style={{ height: 30 }}
              onClick={() => { setConfirmTakeover(false); setTakeoverReason(''); }}
            >Cancel</button>
          )}
        </>
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
