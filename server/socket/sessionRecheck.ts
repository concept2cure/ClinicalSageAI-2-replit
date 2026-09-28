/**
 * Session re-verification for an open socket — the one implementation, used by
 * every socket.io namespace (the main namespace in server/socketServer.ts and
 * the AnA duplex namespace `/ana` in server/services/ana/ana-realtime.ts).
 *
 * A socket is admitted on a verified token, a live membership and an active
 * tenant, and then stays open for as long as the transport lives. Until
 * 2026-09-25 nothing looked again on the main namespace (IAM-12 / P1-9), and
 * until 2026-09-28 nothing looked again on `/ana` (IAM-19 / P1-33), so a member
 * removed from the organisation, an account taken out of use, a revoked or
 * password-change-ended session and a suspended tenant all kept a live channel
 * — on `/ana`, one into the tool loop — for the token's remaining lifetime.
 * Every open socket now re-runs the same three checks on a timer and, when one
 * fails, is told why and disconnected. The interval is generous (the HTTP paths
 * re-check on every request; membership is cached 60 s there too) and never
 * keeps the process alive.
 *
 * This lived as a private function in socketServer.ts; `/ana` needed the same
 * thing, so it moved here rather than being copied (zero duplication).
 */
import type { Socket } from 'socket.io';
import { createScopedLogger } from '../utils/logger.js';
import { verifyLiveToken } from '../services/token-revocation';
import { checkOrgMembership } from '../middleware/orgMembership';
import { shouldProcessTenantInBackground } from '../services/tenant/tenant-lifecycle.js';

const log = createScopedLogger('socket-session-recheck');

export const SOCKET_SESSION_RECHECK_MS = Math.max(5_000, Number(process.env.SOCKET_SESSION_RECHECK_MS) || 60_000);

/** The fields a namespace's handshake sets on an admitted socket. */
export interface RecheckableSocket extends Socket {
  orgId?: string;
  authUserId?: string;
  /** The handshake token, kept so the session can be re-verified while connected. */
  sessionToken?: string;
  /** The re-verification timer, cleared on disconnect. */
  sessionRecheck?: NodeJS.Timeout;
}

export type SessionEndReason = 'session_ended' | 'membership_revoked' | 'tenant_inactive';

/** Why this socket's session may no longer stay open, or null while it may. */
export async function sessionEndReason(socket: RecheckableSocket): Promise<SessionEndReason | null> {
  const userId = Number(socket.authUserId);
  const organizationId = Number(socket.orgId);
  try {
    // Signature, revocation, account standing, the password-change rule and
    // the session's inactivity, exactly as the handshake verified them. The
    // re-check is not the user acting, so it is not the session's activity
    // (P1-1): an open tab does not keep an unattended session alive.
    await verifyLiveToken(socket.sessionToken ?? '', undefined, { activity: false });
  } catch {
    return 'session_ended';
  }
  // Anything but a confirmed membership ends it, including a membership that
  // could not be read (fail closed, as the handshake does).
  if ((await checkOrgMembership(userId, organizationId)) !== 'member') return 'membership_revoked';
  if (!(await shouldProcessTenantInBackground(organizationId))) return 'tenant_inactive';
  return null;
}

/**
 * Re-check the socket's session every SOCKET_SESSION_RECHECK_MS; when it ends,
 * emit `session:ended` with the reason and disconnect. `label` names the
 * namespace in the log line.
 */
export function startSessionRecheck(socket: RecheckableSocket, label: string): void {
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void sessionEndReason(socket)
      .catch(() => 'session_ended' as const)
      .then(reason => {
        inFlight = false;
        if (!reason) return;
        log.warn(`[${label}] Ending socket ${socket.id} (org ${socket.orgId}, user ${socket.authUserId}): ${reason}`);
        clearInterval(timer);
        socket.emit('session:ended', { reason });
        socket.disconnect(true);
      });
  }, SOCKET_SESSION_RECHECK_MS);
  timer.unref?.();
  socket.sessionRecheck = timer;
  socket.on('disconnect', () => {
    clearInterval(timer);
    socket.sessionRecheck = undefined;
  });
}
