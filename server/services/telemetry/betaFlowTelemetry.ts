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

export function classifyBetaFlow(method: string, url: string): FlowKey {
  const path = (url || '').toLowerCase();
  const verb = method.toUpperCase();

  if (
    path.includes('/onboarding') ||
    path.includes('/auth/dev-login') ||
    path.includes('/concept2cure/login')
  ) {
    return 'onboarding';
  }

  if (
    path.startsWith('/api/projects') ||
    path.startsWith('/api/device-projects') ||
    path.includes('/project-bootstrap') ||
    path.includes('/bootstrap')
  ) {
    return 'project_creation';
  }

  if (
    path.startsWith('/api/documents') ||
    path.startsWith('/api/authoring') ||
    path.startsWith('/api/coauthor') ||
    path.startsWith('/api/authoring-actions')
  ) {
    return 'authoring';
  }

  if (path.includes('/export') || path.startsWith('/api/submit')) {
    return 'exports';
  }

  if (verb === 'GET' && path.startsWith('/api/ops/beta-telemetry')) {
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
    const errorBucket = counters.get('route_errors')!;
    errorBucket.requests += 1;
    errorBucket.errors += 1;
    errorBucket.totalDurationMs += Math.max(0, durationMs);

    errorEvents.push({
      at: new Date().toISOString(),
      method: String(context?.method || 'UNKNOWN').toUpperCase(),
      path: String(context?.path || ''),
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
