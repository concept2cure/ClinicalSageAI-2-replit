/**
 * Delta Verification Engine
 * 
 * Detects divergence between expected compliance state and actual system state.
 */

import crypto from 'crypto';

export interface SystemStateSnapshot {
  timestamp: number;
  merkleRoot: string;
  complianceGraphHash: string;
  activeTransitions: string[];
  workflowRunId?: string;
}

export interface DeltaViolation {
  path: string;
  expected: string;
  actual: string;
  isViolation: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface DeltaReport {
  divergence: number;
  violations: DeltaViolation[];
  timestamp: number;
  expectedHash?: string;
  actualHash?: string;
}

export class DeltaVerificationEngine {
  private expectedState: SystemStateSnapshot | null = null;
  private intervalId?: ReturnType<typeof setInterval>;
  private readonly CHECK_INTERVAL_MS = 5000;

  async startContinuousVerification(): Promise<void> {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      const actualState = await this.captureSystemState();
      if (!this.expectedState) {
        this.expectedState = actualState;
        return;
      }
      const delta = await this.computeDelta(this.expectedState, actualState);
      if (delta.divergence > 0) {
        await this.handleComplianceDrift(delta);
      }
      this.expectedState = actualState;
    }, this.CHECK_INTERVAL_MS);
  }

  stopContinuousVerification(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  setExpectedState(snapshot: SystemStateSnapshot): void {
    this.expectedState = snapshot;
  }

  async verifySnapshot(actual: SystemStateSnapshot): Promise<DeltaReport> {
    if (!this.expectedState) {
      this.expectedState = actual;
      return { divergence: 0, violations: [], timestamp: Date.now() };
    }
    const delta = await this.computeDelta(this.expectedState, actual);
    this.expectedState = actual;
    return delta;
  }

  private async captureSystemState(
    activeTransitions: string[] = [],
    complianceGraphHash = 'compliance-graph',
    workflowRunId?: string
  ): Promise<SystemStateSnapshot> {
    return this.createSnapshot(activeTransitions, complianceGraphHash, workflowRunId);
  }

  createSnapshot(
    activeTransitions: string[] = [],
    complianceGraphHash = 'compliance-graph',
    workflowRunId?: string
  ): SystemStateSnapshot {
    const normalizedTransitions = [...activeTransitions].sort();
    return {
      timestamp: Date.now(),
      merkleRoot: this.hash(this.stableStringify(normalizedTransitions)),
      complianceGraphHash: this.hash(complianceGraphHash),
      activeTransitions: normalizedTransitions,
      workflowRunId,
    };
  }

  private async computeDelta(
    expected: SystemStateSnapshot,
    actual: SystemStateSnapshot
  ): Promise<DeltaReport> {
    const violations: DeltaViolation[] = [];

    if (expected.merkleRoot !== actual.merkleRoot) {
      violations.push({
        path: 'merkle-root',
        expected: expected.merkleRoot,
        actual: actual.merkleRoot,
        isViolation: true,
        severity: 'HIGH',
      });
    }

    if (expected.complianceGraphHash !== actual.complianceGraphHash) {
      violations.push({
        path: 'compliance-graph-hash',
        expected: expected.complianceGraphHash,
        actual: actual.complianceGraphHash,
        isViolation: true,
        severity: 'CRITICAL',
      });
    }

    const expectedTransitions = new Set(expected.activeTransitions);
    const actualTransitions = new Set(actual.activeTransitions);
    const missing = Array.from(expectedTransitions).filter(t => !actualTransitions.has(t));
    const extra = Array.from(actualTransitions).filter(t => !expectedTransitions.has(t));
    if (missing.length || extra.length) {
      violations.push({
        path: 'active-transitions',
        expected: missing.join(',') || 'none',
        actual: extra.join(',') || 'none',
        isViolation: true,
        severity: 'MEDIUM',
      });
    }

    if (violations.length === 0) {
      return { divergence: 0, violations: [], timestamp: Date.now() };
    }

    const expectedHash = this.hash(this.stableStringify(expected));
    const actualHash = this.hash(this.stableStringify(actual));

    return {
      divergence: violations.length,
      violations,
      timestamp: Date.now(),
      expectedHash,
      actualHash,
    };
  }

  private async handleComplianceDrift(delta: DeltaReport): Promise<void> {
    if (delta.divergence > 5) {
      await this.initiateEmergencyShutdown(delta);
    } else {
      await this.quarantineDivergentWorkflows(delta.violations);
    }
  }

  private async initiateEmergencyShutdown(delta: DeltaReport): Promise<void> {
    console.error('[ProofSystem] Emergency shutdown initiated', delta);
  }

  private async quarantineDivergentWorkflows(violations: DeltaViolation[]): Promise<void> {
    console.warn('[ProofSystem] Quarantining workflows', { count: violations.length });
  }

  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map(v => this.stableStringify(v)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${this.stableStringify(val)}`);
    return `{${entries.join(',')}}`;
  }
}

export default DeltaVerificationEngine;
