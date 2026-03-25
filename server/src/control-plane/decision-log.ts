import type { KernelDecision, KernelEvaluation } from './kernel';

export interface KernelDecisionLogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  requestId: string;
  tenantId?: string;
  actorId?: string;
  kernel: KernelEvaluation;
}

export interface KernelDecisionSummary {
  total: number;
  byFinalDecision: Record<KernelDecision, number>;
  byEnforcedDecision: Record<KernelDecision, number>;
}

const MAX_DECISION_LOG_ENTRIES = Number(process.env.ANA_KERNEL_LOG_CAP || 5000);
const decisionLog: KernelDecisionLogEntry[] = [];

export function recordKernelDecision(entry: KernelDecisionLogEntry) {
  decisionLog.push(entry);
  if (decisionLog.length > MAX_DECISION_LOG_ENTRIES) {
    decisionLog.splice(0, decisionLog.length - MAX_DECISION_LOG_ENTRIES);
  }
}

export function getRecentKernelDecisions(limit = 200): KernelDecisionLogEntry[] {
  const clamped = Math.max(1, Math.min(limit, 2000));
  return decisionLog.slice(-clamped);
}

export function getKernelDecisionSummary(): KernelDecisionSummary {
  const summary: KernelDecisionSummary = {
    total: decisionLog.length,
    byFinalDecision: { allow: 0, review: 0, deny: 0 },
    byEnforcedDecision: { allow: 0, review: 0, deny: 0 },
  };

  for (const entry of decisionLog) {
    summary.byFinalDecision[entry.kernel.finalDecision] += 1;
    summary.byEnforcedDecision[entry.kernel.enforcedDecision] += 1;
  }

  return summary;
}

export function clearKernelDecisionLog() {
  decisionLog.length = 0;
}
