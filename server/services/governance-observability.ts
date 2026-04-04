/**
 * Governance Observability
 *
 * Metrics counters, health checks, and structured failure tracking
 * for the governed decision system. Replaces console.warn with
 * inspectable, queryable operational state.
 *
 * Usage:
 *   import { governanceMetrics } from './governance-observability';
 *   governanceMetrics.recordDecisionCreated('allow');
 *   governanceMetrics.recordPersistenceFailure('write', error);
 *   const health = governanceMetrics.getHealth();
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('governance-observability');

// ═══════════════════════════════════════════════════════════════════════
// Counters
// ═══════════════════════════════════════════════════════════════════════

interface GovernanceCounters {
  decisionsCreated: number;
  decisionsCreatedByOutcome: Record<string, number>;
  transitionsExecuted: number;
  transitionsByAction: Record<string, number>;
  persistenceWrites: number;
  persistenceFailures: number;
  queryExecuted: number;
  queryFailures: number;
  rimEmissions: number;
  rimEmissionFailures: number;
  startedAt: string;
}

function createCounters(): GovernanceCounters {
  return {
    decisionsCreated: 0,
    decisionsCreatedByOutcome: {},
    transitionsExecuted: 0,
    transitionsByAction: {},
    persistenceWrites: 0,
    persistenceFailures: 0,
    queryExecuted: 0,
    queryFailures: 0,
    rimEmissions: 0,
    rimEmissionFailures: 0,
    startedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Failure Log (bounded ring buffer)
// ═══════════════════════════════════════════════════════════════════════

interface FailureEntry {
  type: 'persistence' | 'query' | 'transition' | 'rim_emission';
  operation: string;
  error: string;
  timestamp: string;
}

const MAX_FAILURE_LOG = 100;

// ═══════════════════════════════════════════════════════════════════════
// Governance Metrics Service
// ═══════════════════════════════════════════════════════════════════════

class GovernanceMetricsService {
  private counters: GovernanceCounters = createCounters();
  private failures: FailureEntry[] = [];
  private dbReachable: boolean | null = null;
  private lastDbCheck: string | null = null;

  // ── Recording ──

  recordDecisionCreated(outcome: string): void {
    this.counters.decisionsCreated++;
    this.counters.decisionsCreatedByOutcome[outcome] =
      (this.counters.decisionsCreatedByOutcome[outcome] || 0) + 1;
  }

  recordTransitionExecuted(action: string): void {
    this.counters.transitionsExecuted++;
    this.counters.transitionsByAction[action] =
      (this.counters.transitionsByAction[action] || 0) + 1;
  }

  recordPersistenceWrite(): void {
    this.counters.persistenceWrites++;
  }

  recordPersistenceFailure(operation: string, error: unknown): void {
    this.counters.persistenceFailures++;
    this.addFailure('persistence', operation, error);
    log.warn('Governance persistence failure', { operation, error: this.errorString(error) });
  }

  recordQueryExecuted(): void {
    this.counters.queryExecuted++;
  }

  recordQueryFailure(operation: string, error: unknown): void {
    this.counters.queryFailures++;
    this.addFailure('query', operation, error);
    log.warn('Governance query failure', { operation, error: this.errorString(error) });
  }

  recordRimEmission(): void {
    this.counters.rimEmissions++;
  }

  recordRimEmissionFailure(error: unknown): void {
    this.counters.rimEmissionFailures++;
    this.addFailure('rim_emission', 'interceptFabricDecision', error);
  }

  // ── Health Check ──

  async checkDatabaseHealth(): Promise<boolean> {
    try {
      const { pool } = await import('../db.js');
      const result = await pool.query('SELECT 1 AS ok');
      this.dbReachable = result.rows.length > 0;
    } catch {
      this.dbReachable = false;
    }
    this.lastDbCheck = new Date().toISOString();
    return this.dbReachable ?? false;
  }

  async checkTransitionTableHealth(): Promise<boolean> {
    try {
      const { pool } = await import('../db.js');
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'governed_decision_transitions'
        ) AS table_exists`
      );
      return result.rows[0]?.table_exists === true;
    } catch {
      return false;
    }
  }

  async checkDecisionRecordTableHealth(): Promise<boolean> {
    try {
      const { pool } = await import('../db.js');
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'decision_records'
        ) AS table_exists`
      );
      return result.rows[0]?.table_exists === true;
    } catch {
      return false;
    }
  }

  recordCorrespondenceGate(): void {
    this.counters.transitionsExecuted++;
    this.counters.transitionsByAction['correspondence_lifecycle_gate'] =
      (this.counters.transitionsByAction['correspondence_lifecycle_gate'] || 0) + 1;
  }

  recordCorrespondenceGateFailure(error: unknown): void {
    this.addFailure('transition', 'correspondence_lifecycle_gate', error);
  }

  // ── Getters ──

  getCounters(): GovernanceCounters {
    return { ...this.counters };
  }

  getRecentFailures(limit = 20): FailureEntry[] {
    return this.failures.slice(-limit);
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    dbReachable: boolean;
    transitionTableReachable: boolean;
    decisionRecordTableReachable: boolean;
    counters: GovernanceCounters;
    recentFailures: FailureEntry[];
    failureRate: number;
    uptimeSeconds: number;
  }> {
    const [dbOk, tableOk, decisionTableOk] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkTransitionTableHealth(),
      this.checkDecisionRecordTableHealth(),
    ]);

    const totalOps = this.counters.persistenceWrites + this.counters.queryExecuted;
    const totalFailures = this.counters.persistenceFailures + this.counters.queryFailures;
    const failureRate = totalOps > 0 ? totalFailures / totalOps : 0;

    const uptimeMs = Date.now() - new Date(this.counters.startedAt).getTime();

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (!dbOk) status = 'unhealthy';
    else if (failureRate > 0.1 || !tableOk || !decisionTableOk) status = 'degraded';
    else status = 'healthy';

    return {
      status,
      dbReachable: dbOk,
      transitionTableReachable: tableOk,
      decisionRecordTableReachable: decisionTableOk,
      counters: this.getCounters(),
      recentFailures: this.getRecentFailures(),
      failureRate: Math.round(failureRate * 1000) / 1000,
      uptimeSeconds: Math.round(uptimeMs / 1000),
    };
  }

  // ── Reset ──

  reset(): void {
    this.counters = createCounters();
    this.failures = [];
  }

  // ── Internals ──

  private addFailure(type: FailureEntry['type'], operation: string, error: unknown): void {
    this.failures.push({
      type,
      operation,
      error: this.errorString(error),
      timestamp: new Date().toISOString(),
    });
    if (this.failures.length > MAX_FAILURE_LOG) {
      this.failures.splice(0, this.failures.length - MAX_FAILURE_LOG);
    }
  }

  private errorString(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Singleton governance metrics service */
export const governanceMetrics = new GovernanceMetricsService();
