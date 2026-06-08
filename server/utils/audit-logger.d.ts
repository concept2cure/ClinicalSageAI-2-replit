/**
 * Type declarations for the plain-JS audit logger (audit-logger.js).
 *
 * Lets TypeScript callers import the named exports with real signatures instead
 * of falling back to the ambient `declare module '*.js'` (default-only) shim.
 */

export interface AuditActionOptions {
  action: string;
  userId?: string;
  username?: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface SecurityEventOptions {
  event: string;
  userId?: string;
  username?: string;
  severity?: 'info' | 'warning' | 'critical' | 'error';
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface SystemEventOptions {
  event: string;
  component: string;
  severity?: 'info' | 'warning' | 'critical' | 'error';
  details?: Record<string, unknown>;
}

export function logAction(options: AuditActionOptions): void;
export function logSecurityEvent(options: SecurityEventOptions): void;
export function logSystemEvent(options: SystemEventOptions): void;

declare const _default: {
  logAction: typeof logAction;
  logSecurityEvent: typeof logSecurityEvent;
  logSystemEvent: typeof logSystemEvent;
};
export default _default;
