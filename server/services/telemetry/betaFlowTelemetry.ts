type FlowKey = 'onboarding' | 'project_creation' | 'authoring' | 'exports' | 'route_errors' | 'other';

interface FlowCounters {
  requests: number;
  errors: number;
  totalDurationMs: number;
}

interface ErrorEvent {
  at: string;
  method: string;
  path: string;
  statusCode: number;
  flow: FlowKey;
  durationMs: number;
}

interface ResetEvent {
  at: string;
  actorId: string;
  actorRole: string;
  reason: string;
}

const counters = new Map<FlowKey, FlowCounters>();
const errorEvents: ErrorEvent[] = [];
const resetEvents: ResetEvent[] = [];
const MAX_ERROR_EVENTS = 200;
const MAX_RESET_EVENTS = 50;
const MAX_TELEMETRY_PATH_LENGTH = 512;

const FLOW_ORDER: FlowKey[] = [
  'onboarding',
  'project_creation',
  'authoring',
  'exports',
  'route_errors',
  'other',
];

for (const flow of FLOW_ORDER) {
  counters.set(flow, { requests: 0, errors: 0, totalDurationMs: 0 });
}

/** Keep beta telemetry free of query-string credentials and unbounded URLs. */
export function normalizeBetaTelemetryPath(url: string): string {
  const rawPath = String(url || '').split(/[?#]/, 1)[0] || '/';
  return rawPath.slice(0, MAX_TELEMETRY_PATH_LENGTH);
}

function matchesPathFamily(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function classifyBetaFlow(method: string, url: string): FlowKey {
  const path = normalizeBetaTelemetryPath(url).toLowerCase();
  const verb = method.toUpperCase();

  if (
    path.includes('/onboarding') ||
    path.includes('/auth/dev-login') ||
    path.includes('/concept2cure/login')
  ) {
    return 'onboarding';
  }

  if (
    matchesPathFamily(path, '/api/projects') ||
    matchesPathFamily(path, '/api/device-projects') ||
    (verb === 'POST' && /^\/api\/concept2cure\/projects\/?$/.test(path)) ||
    path.includes('/project-bootstrap') ||
    path.includes('/bootstrap')
  ) {
    return 'project_creation';
  }

  // Export is checked before authoring because many export endpoints are
  // nested below document/artifact route families.
  if (path.includes('/export') || matchesPathFamily(path, '/api/submit')) {
    return 'exports';
  }

  if (
    matchesPathFamily(path, '/api/documents') ||
    matchesPathFamily(path, '/api/authoring') ||
    matchesPathFamily(path, '/api/coauthor') ||
    matchesPathFamily(path, '/api/authoring-actions') ||
    /^\/api\/concept2cure\/projects\/[^/]+\/artifacts(?:\/|$)/.test(path)
  ) {
    return 'authoring';
  }

  if (verb === 'GET' && matchesPathFamily(path, '/api/ops/beta-telemetry')) {
    return 'other';
  }

  return 'other';
}

export function recordBetaFlowEvent(
  flow: FlowKey,
  statusCode: number,
  durationMs: number,
  context?: { method?: string; path?: string }
) {
  const target = counters.get(flow) || { requests: 0, errors: 0, totalDurationMs: 0 };
  target.requests += 1;
  target.totalDurationMs += Math.max(0, durationMs);
  if (statusCode >= 500) {
    target.errors += 1;
    if (flow !== 'route_errors') {
      const errorBucket = counters.get('route_errors')!;
      errorBucket.requests += 1;
      errorBucket.errors += 1;
      errorBucket.totalDurationMs += Math.max(0, durationMs);
    }

    errorEvents.push({
      at: new Date().toISOString(),
      method: String(context?.method || 'UNKNOWN').toUpperCase(),
      path: normalizeBetaTelemetryPath(String(context?.path || '')),
      statusCode,
      flow,
      durationMs: Math.max(0, durationMs),
    });
    if (errorEvents.length > MAX_ERROR_EVENTS) {
      errorEvents.splice(0, errorEvents.length - MAX_ERROR_EVENTS);
    }
  }
  counters.set(flow, target);
}

export function getBetaFlowTelemetrySnapshot(options?: { includeErrorEvents?: boolean; includeResetEvents?: boolean }) {
  const telemetry = FLOW_ORDER.map(flow => {
    const bucket = counters.get(flow)!;
    const errorRate = bucket.requests > 0 ? Number((bucket.errors / bucket.requests).toFixed(4)) : 0;
    const avgDurationMs =
      bucket.requests > 0 ? Number((bucket.totalDurationMs / bucket.requests).toFixed(2)) : 0;
    return {
      flow,
      requests: bucket.requests,
      errors: bucket.errors,
      errorRate,
      avgDurationMs,
    };
  });

  if (!options?.includeErrorEvents && !options?.includeResetEvents) return { telemetry };
  return {
    telemetry,
    ...(options?.includeErrorEvents ? { recentErrorEvents: [...errorEvents] } : {}),
    ...(options?.includeResetEvents ? { recentResetEvents: [...resetEvents] } : {}),
  };
}

export function resetBetaFlowTelemetry(context?: { actorId?: string; actorRole?: string; reason?: string }) {
  for (const flow of FLOW_ORDER) {
    counters.set(flow, { requests: 0, errors: 0, totalDurationMs: 0 });
  }
  errorEvents.splice(0, errorEvents.length);

  const reason = String(context?.reason || '').trim();
  if (reason) {
    resetEvents.push({
      at: new Date().toISOString(),
      actorId: String(context?.actorId || 'unknown'),
      actorRole: String(context?.actorRole || 'unknown'),
      reason,
    });
    if (resetEvents.length > MAX_RESET_EVENTS) {
      resetEvents.splice(0, resetEvents.length - MAX_RESET_EVENTS);
    }
  }
}
