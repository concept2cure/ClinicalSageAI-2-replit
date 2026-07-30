/**
 * Tenant-scoped Socket.IO room + publish helpers (C2C-COLLAB-003).
 *
 * The task/notification/compliance/timer handlers in server/socketServer.ts
 * re-published tenant-bearing payloads with the namespace-global primitives
 * (`socket.broadcast` publish / `io` publish). Those ignore room membership
 * entirely, and because the handshake authenticates users from EVERY
 * organization onto the same default namespace, an authenticated user in org A
 * received org B's task titles, assignees, notifications, compliance findings
 * and timer activity.
 *
 * Every tenant-bearing publish now goes through this module, which can only
 * ever address the room derived from the socket's VERIFIED principal
 * (`socket.orgId`, set at handshake from the JWT). There is no code path here
 * that reaches the whole namespace, and no caller-supplied value contributes to
 * the target room. When the principal is missing the helpers refuse to publish
 * (fail closed) rather than degrading to a global send.
 *
 * scripts/check-security-patterns.ts rule `socket-global-broadcast` blocks
 * reintroduction of the namespace-global primitives anywhere under server/.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('socket-tenant-broadcast');

/** A socket whose tenant was established by the handshake middleware. */
export type TenantSocket = Socket & { orgId?: string };

/**
 * The tenant-wide room every authenticated socket joins at connection.
 *
 * Deliberately NOT of the form `org_<id>_<name>` used by `scopedRoom` below, so
 * it cannot be reached by any handler that builds a room from caller input.
 */
export function orgRoom(orgId: string): string {
  return `org_${orgId}`;
}

/** Tenant-prefixed room for a named sub-channel within one organization. */
export function scopedRoom(orgId: string, name: string): string {
  return `org_${orgId}_${name}`;
}

/** Room carrying collaboration traffic for one document within one org. */
export function documentRoom(orgId: string, documentId: string): string {
  return scopedRoom(orgId, `doc_${documentId}`);
}

/** Room carrying 510(k) field-sync traffic for one project within one org. */
export function projectFieldsRoom(orgId: string, projectId: string): string {
  return scopedRoom(orgId, `project_fields_${projectId}`);
}

/**
 * Publish to the sender's organization peers (everyone in the org room except
 * the sender) — the tenant-scoped replacement for a namespace-global broadcast.
 *
 * Returns false without publishing when the socket carries no verified tenant.
 */
export function emitToOrgPeers(
  socket: TenantSocket,
  event: string,
  payload: unknown,
): boolean {
  const orgId = socket.orgId;
  if (!orgId) {
    log.warn(
      `[socket] refusing to publish "${event}" from ${socket.id}: no verified tenant on socket`,
    );
    return false;
  }
  socket.to(orgRoom(orgId)).emit(event, payload);
  return true;
}

/**
 * Server-initiated publish to one organization. Fails closed when the server or
 * the tenant id is missing rather than reaching every connected socket.
 */
export function emitToOrg(
  io: SocketIOServer | null | undefined,
  orgId: string | undefined,
  event: string,
  payload: unknown,
): boolean {
  if (!io) {
    log.warn(`[socket] refusing to publish "${event}": socket server not initialized`);
    return false;
  }
  if (!orgId) {
    log.warn(`[socket] refusing to publish "${event}": no tenant supplied`);
    return false;
  }
  io.to(orgRoom(orgId)).emit(event, payload);
  return true;
}
