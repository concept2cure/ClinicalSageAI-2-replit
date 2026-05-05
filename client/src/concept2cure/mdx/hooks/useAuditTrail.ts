/**
 * useAuditTrail — fetches the live audit trail for a program / section,
 * adapts the server's audit_events row shape to the kit's `AuditEvent`
 * type so the kit's pathway audit pane reads real chain data.
 *
 * Endpoint: `GET /api/audit/logs` (server/routes/audit-trail-routes.ts).
 * The endpoint exposes hash chain fields (record_hash, previous_hash,
 * sequence_number) directly — perfect for the kit's `hash` / `prev`.
 *
 * Filters supported by the endpoint: `org_id`, `event_type`, `user_id`,
 * `entity_id`, `entity_type`, `start_date`, `end_date`, `search`.
 * Section-scoped queries push the filter to the WHERE clause via
 * `entity_id`; previously the hook filtered client-side.
 *
 * Returns the kit's seed data shape (AuditEvent[]) so panes can drop
 * fixtures and consume this directly.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AuditEvent, AuditKind } from '../types';

interface ServerAuditLogRow {
  id: string;
  userId: string;
  user_id: string;
  userName: string;
  userRole: string;
  action: string;
  actionType: string;
  event_type: string;
  severity: 'info' | 'warning';
  component: string;
  entityId: string | null;
  entityType: string | null;
  details: string;
  description: string;
  ipAddress: string;
  region: string;
  org_id: string;
  project_id: string;
  timestamp: string | null;
  metadata: Record<string, unknown> | null;
  hash: string | null;
  sequenceNumber: number | null;
  previousHash: string | null;
}

interface AuditLogsPayload {
  logs: ServerAuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

const KIT_KINDS = new Set<AuditKind>([
  'section.edit',
  'section.lock',
  'section.unlock',
  'review.start',
  'review.complete',
  'sign',
  'comment',
  'attach',
  'export',
  'access',
]);

function toKitKind(eventType: string): AuditKind {
  if (KIT_KINDS.has(eventType as AuditKind)) {
    return eventType as AuditKind;
  }
  /* Backend uses dot-namespaced event_type strings; common ones map here.
     Anything unrecognized falls back to 'access' so the row still renders. */
  if (eventType.startsWith('section.edit') || eventType.endsWith('.update')) return 'section.edit';
  if (eventType.endsWith('.lock'))                                            return 'section.lock';
  if (eventType.endsWith('.unlock'))                                          return 'section.unlock';
  if (eventType.includes('review.start'))                                     return 'review.start';
  if (eventType.includes('review.complete') || eventType.endsWith('.verify')) return 'review.complete';
  if (eventType.includes('sign'))                                             return 'sign';
  if (eventType.includes('comment'))                                          return 'comment';
  if (eventType.includes('attach') || eventType.includes('upload'))           return 'attach';
  if (eventType.includes('export') || eventType.includes('download'))        return 'export';
  return 'access';
}

function rowToKit(row: ServerAuditLogRow): AuditEvent {
  const meta = row.metadata ?? {};
  const pickString = (key: string): string | undefined => {
    const v = (meta as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
  };
  return {
    id:        row.id,
    when:      row.timestamp ?? new Date().toISOString(),
    kind:      toKitKind(row.event_type),
    actor:     row.userName,
    role:      row.userRole || row.actionType,
    target:    row.description || row.details || row.component,
    target_id: row.entityId ?? row.project_id ?? undefined,
    ip:        row.ipAddress,
    hash:      row.hash ?? '',
    prev:      row.previousHash ?? '',
    /* Optional payload fields lifted from metadata if the writer set them. */
    sig:       pickString('sig'),
    body:      pickString('body') ?? (row.details && toKitKind(row.event_type) === 'comment' ? row.details : undefined),
    file:      pickString('file'),
    diff:      pickString('diff'),
    reason:    pickString('reason') ?? (toKitKind(row.event_type) === 'section.unlock' ? row.details : undefined),
  };
}

export interface UseAuditTrailOptions {
  /** Filter to events whose `entity_id` equals this value (server-side WHERE). */
  sectionId?: string | number;
  /** Filter to a specific entity_type (e.g. 'section', 'submission'). */
  entityType?: string;
  /** Filter to a specific event kind (e.g. only `sign` events). */
  kind?: AuditKind;
  /** Maximum events to return. Default 200. */
  limit?: number;
}

export interface UseAuditTrailResult {
  events: AuditEvent[] | null;
  total: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programIdent  used as a free-text `search` term; typically the program code
 *                      (e.g. "BX-204") which the audit row's description / details
 *                      will mention. Pass `null` to skip the fetch.
 */
export function useAuditTrail(
  programIdent: string | null,
  opts: UseAuditTrailOptions = {},
): UseAuditTrailResult {
  const [state, setState] = useState<{
    events: AuditEvent[] | null;
    total: number | null;
    loading: boolean;
    error: string | null;
  }>({ events: null, total: null, loading: false, error: null });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t: number) => t + 1), []);

  const { sectionId, entityType, kind, limit = 200 } = opts;

  useEffect(() => {
    if (!programIdent) {
      setState({ events: null, total: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const params = new URLSearchParams();
    params.set('search', programIdent);
    params.set('limit', String(limit));
    if (kind) params.set('event_type', kind);
    if (sectionId !== undefined) params.set('entity_id', String(sectionId));
    if (entityType) params.set('entity_type', entityType);

    fetch(`/api/audit/logs?${params}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        return (await res.json()) as AuditLogsPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        const events = payload.logs.map(rowToKit);
        setState({ events, total: payload.total, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load audit trail',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [programIdent, sectionId, kind, limit, tick]);

  return { ...state, refresh };
}
