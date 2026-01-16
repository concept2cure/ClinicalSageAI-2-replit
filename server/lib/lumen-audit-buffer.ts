type AuditEvent = {
  organizationId: number;
  eventType: string;
  module?: string;
  queryHash?: string;
  createdAt: string;
  actorUserId?: string;
  actorUserName?: string;
  ipAddress?: string;
  userAgent?: string;
  request?: any;
  response?: any;
  metadata?: any;
};

function clampString(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(${s.length - max} more chars)`;
}

function sanitize(value: any, depth: number = 0): any {
  if (depth > 6) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') return clampString(value, 4000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value).slice(0, 80)) {
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export class LumenAuditBuffer {
  private static MAX_EVENTS_PER_TENANT = 500;
  private static events = new Map<number, AuditEvent[]>();

  static append(evt: Omit<AuditEvent, 'createdAt'> & { createdAt?: string }) {
    const createdAt = evt.createdAt || new Date().toISOString();
    const safe: AuditEvent = {
      ...evt,
      createdAt,
      request: sanitize(evt.request),
      response: sanitize(evt.response),
      metadata: sanitize(evt.metadata),
    };

    const list = this.events.get(evt.organizationId) || [];
    list.unshift(safe);
    if (list.length > this.MAX_EVENTS_PER_TENANT) list.length = this.MAX_EVENTS_PER_TENANT;
    this.events.set(evt.organizationId, list);
  }

  static list(organizationId: number, limit: number = 100): AuditEvent[] {
    const list = this.events.get(organizationId) || [];
    return list.slice(0, Math.max(1, Math.min(500, limit)));
  }

  static stats() {
    let total = 0;
    for (const arr of this.events.values()) total += arr.length;
    return { tenants: this.events.size, total, maxPerTenant: this.MAX_EVENTS_PER_TENANT };
  }
}
