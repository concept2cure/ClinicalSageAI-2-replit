/**
 * Who may read, export and record the audit trail over HTTP, and what a
 * client-recorded event may be (security audit 2026-09-24, DP-18; plan P1-20).
 *
 * The audit routes (server/routes/audit-trail-routes.ts) admitted any member
 * of the organisation to every read and export, and wrote whatever event_type
 * and metadata a body carried into audit_events. Here:
 *
 *   · a reader is an organisation owner, admin or manager (the roles that run
 *     QA and administration), or a platform administrator; every other role,
 *     viewer and member included, is refused (GDPR 5(1)(f): every user's name,
 *     role and address are in those rows);
 *   · a recorder is the same set: recording an audit event by hand is an
 *     administrative act, not something a session does in passing;
 *   · a client-recorded event names a type from AUDIT_EVENT_TYPES, the closed
 *     list of the dotted `domain.action` types the server's own writers use,
 *     and its metadata is a JSON object of bounded size. The list grows only
 *     with a server writer, never to admit a body.
 *
 * @module server/services/audit/audit-api-authority
 */
import type { Request, Response } from 'express';
import { isPlatformAdmin } from '../../middleware/requirePlatformAdmin.js';

/** Organisation roles that may read, export and record the audit trail. */
export const AUDIT_READER_ROLES = ['owner', 'admin', 'manager'] as const;

/** The dotted `domain.action` types the server's own writers put in audit_events. */
export const AUDIT_EVENT_TYPES = [
  'artifact.created',
  'artifact.reviewed',
  'artifact.updated',
  'artifact.versioned',
  'audit.chain_integrity_failure',
  'coauthor_document.deleted',
  'coauthor_document.retaken',
  'orchestration.gate_decision',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(AUDIT_EVENT_TYPES);
export const AUDIT_METADATA_MAX_BYTES = 8 * 1024;

export function isAuditEventType(value: unknown): value is AuditEventType {
  return typeof value === 'string' && EVENT_TYPE_SET.has(value);
}

function rolesOf(req: Request): string[] {
  const user = req.user as { role?: unknown; roles?: unknown } | undefined;
  const declared = Array.isArray(user?.roles) ? user!.roles : [];
  const single = typeof user?.role === 'string' ? [user.role] : [];
  return [...declared, ...single].map((r) => String(r).toLowerCase());
}

/** True when the session may read or export the audit trail. */
export function canReadAuditTrail(req: Request): boolean {
  if (!req.user) return false;
  if (isPlatformAdmin(req)) return true;
  const roles = rolesOf(req);
  return AUDIT_READER_ROLES.some((r) => roles.includes(r));
}

/**
 * Answers 403 and returns false when the session may not read the audit
 * trail. Runs after the tenant guard, so the refusal is about the role.
 */
export function requireAuditReader(req: Request, res: Response): boolean {
  if (canReadAuditTrail(req)) return true;
  res.status(403).json({
    error: 'AUDIT_READ_RESTRICTED',
    message: 'The audit trail is read by organisation administrators and managers.',
  });
  return false;
}

/** The same set may record an event by hand. */
export function requireAuditRecorder(req: Request, res: Response): boolean {
  if (canReadAuditTrail(req)) return true;
  res.status(403).json({
    error: 'AUDIT_WRITE_RESTRICTED',
    message: 'Audit events are recorded by organisation administrators and managers.',
  });
  return false;
}

/** Why the body's event type may not be recorded, or null. */
function eventTypeRefusal(body: Record<string, unknown> | null | undefined): string | null {
  const type = body?.eventType ?? body?.event_type ?? body?.action;
  if (typeof type !== 'string' || type.length === 0) {
    return `eventType is required and must be one of the server's audit event types (${AUDIT_EVENT_TYPES.join(', ')})`;
  }
  if (!isAuditEventType(type)) {
    return `"${type.slice(0, 64)}" is not a recognised event type; the vocabulary is ${AUDIT_EVENT_TYPES.join(', ')}`;
  }
  return null;
}

/** Why the body's metadata may not be recorded, or null. */
function metadataRefusal(body: Record<string, unknown> | null | undefined): string | null {
  const metadata = body?.metadata ?? body?.payload;
  if (metadata === undefined || metadata === null) return null;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return 'metadata must be a JSON object';
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > AUDIT_METADATA_MAX_BYTES) {
    return `metadata exceeds ${AUDIT_METADATA_MAX_BYTES} bytes`;
  }
  return null;
}

/**
 * Why a client-supplied event body may not be recorded, or null when it may.
 * The type must be in the vocabulary; metadata (or payload) must be a plain
 * object under AUDIT_METADATA_MAX_BYTES once serialised.
 */
export function clientEventRefusal(body: Record<string, unknown> | null | undefined): string | null {
  return eventTypeRefusal(body) ?? metadataRefusal(body);
}
