/**
 * Proof Audit Service
 *
 * Provides audit logging for all proof system operations.
 * Required for Phase 4.1 M1-M5 acceptance criteria compliance.
 */

import * as crypto from 'crypto';
import type {
  ExecutionContext,
  RegulatorySubmissionCertificate,
  TransitionProof,
  ZKProof,
} from './types';
import type { DeltaReport, DeltaViolation } from './DeltaVerificationEngine';

export type ProofEventType =
  | 'GRAPH_COMPILE'
  | 'GRAPH_TRANSITION'
  | 'GRAPH_INVARIANT_CHECK'
  | 'ZK_PROOF_GENERATED'
  | 'ZK_VERIFICATION_SUCCESS'
  | 'ZK_VERIFICATION_FAILED'
  | 'DELTA_BASELINE_SET'
  | 'DELTA_DRIFT_DETECTED'
  | 'DELTA_TAMPER_DETECTED'
  | 'CERTIFICATE_GENERATED'
  | 'CERTIFICATE_VERIFIED'
  | 'CERTIFICATE_VERIFICATION_FAILED'
  | 'UI_PROOF_VIEW'
  | 'UI_VERIFICATION_REQUEST';

export interface ProofAuditEntry {
  id: string;
  timestamp: string;
  eventType: ProofEventType;
  organizationId?: string;
  workflowRunId?: string;
  actorId?: string;
  actorRole?: string;
  details: Record<string, unknown>;
  hashChain: string;
  previousHash?: string;
}

type AuditCallback = (entry: ProofAuditEntry) => void | Promise<void>;
type DatabasePersister = (entry: ProofAuditEntry) => Promise<void>;

export class ProofAuditService {
  private static instance: ProofAuditService;
  private static instancesByTenant = new Map<string, ProofAuditService>();
  private entries: ProofAuditEntry[] = [];
  private lastHash: string | undefined;
  private callbacks: AuditCallback[] = [];
  private readonly maxEntries = 10000;
  private dbPersister: DatabasePersister | null = null;
  private readonly tenantId: string | null;

  /**
   * Private constructor - use getInstance() or getInstanceForTenant()
   */
  private constructor(tenantId: string | null = null) {
    this.tenantId = tenantId;
  }

  /**
   * Get singleton instance (for backward compatibility).
   * For multi-tenant isolation, use getInstanceForTenant().
   */
  static getInstance(): ProofAuditService {
    if (!ProofAuditService.instance) {
      ProofAuditService.instance = new ProofAuditService();
    }
    return ProofAuditService.instance;
  }

  /**
   * Get tenant-isolated instance for multi-tenant environments.
   * Each tenant has its own audit service instance to prevent data leakage.
   */
  static getInstanceForTenant(tenantId: string): ProofAuditService {
    if (!ProofAuditService.instancesByTenant.has(tenantId)) {
      ProofAuditService.instancesByTenant.set(tenantId, new ProofAuditService(tenantId));
    }
    return ProofAuditService.instancesByTenant.get(tenantId)!;
  }

  /**
   * Reset all instances (for testing only).
   */
  static resetForTesting(): void {
    ProofAuditService.instance = undefined as unknown as ProofAuditService;
    ProofAuditService.instancesByTenant.clear();
  }

  /**
   * Configure database persistence.
   * This MUST be called during application startup for 21 CFR Part 11 compliance.
   */
  setDatabasePersister(persister: DatabasePersister): void {
    this.dbPersister = persister;
  }

  /**
   * Register a callback to be invoked on each audit event.
   * Useful for persisting to database or external audit system.
   */
  onAuditEvent(callback: AuditCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Log a proof system event with hash-chain integrity.
   */
  async logEvent(
    eventType: ProofEventType,
    details: Record<string, unknown>,
    context?: {
      organizationId?: string;
      workflowRunId?: string;
      actorId?: string;
      actorRole?: string;
    }
  ): Promise<ProofAuditEntry> {
    const timestamp = new Date().toISOString();
    const entryId = this.generateId(eventType, timestamp);

    const entry: ProofAuditEntry = {
      id: entryId,
      timestamp,
      eventType,
      organizationId: context?.organizationId,
      workflowRunId: context?.workflowRunId,
      actorId: context?.actorId,
      actorRole: context?.actorRole,
      details: this.redactSensitive(details),
      previousHash: this.lastHash,
      hashChain: '', // computed below
    };

    entry.hashChain = this.computeEntryHash(entry);
    this.lastHash = entry.hashChain;

    // CRITICAL: Persist to database FIRST (21 CFR Part 11 compliance)
    if (this.dbPersister) {
      try {
        await this.dbPersister(entry);
      } catch (dbErr) {
        // Log but don't throw - allow graceful degradation with warning
        console.error('[ProofAuditService] CRITICAL: Database persistence failed:', dbErr);
        // Mark entry as not persisted for retry
        (entry as ProofAuditEntry & { _persisted?: boolean })._persisted = false;
      }
    } else {
      console.warn(
        '[ProofAuditService] WARNING: No database persister configured. Audit trail not persisted to database.'
      );
    }

    // Keep in-memory for quick access (secondary, not primary storage)
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Invoke callbacks asynchronously
    for (const cb of this.callbacks) {
      try {
        await cb(entry);
      } catch (err) {
        console.error('[ProofAuditService] Callback error:', err);
      }
    }

    return entry;
  }

  /**
   * Get entries that failed to persist and need retry.
   */
  getUnpersistedEntries(): ProofAuditEntry[] {
    return this.entries.filter(
      e => (e as ProofAuditEntry & { _persisted?: boolean })._persisted === false
    );
  }

  /**
   * Retry persisting failed entries.
   */
  async retryPersistence(): Promise<{ success: number; failed: number }> {
    if (!this.dbPersister) {
      return { success: 0, failed: this.getUnpersistedEntries().length };
    }

    const unpersisted = this.getUnpersistedEntries();
    let success = 0;
    let failed = 0;

    for (const entry of unpersisted) {
      try {
        await this.dbPersister(entry);
        (entry as ProofAuditEntry & { _persisted?: boolean })._persisted = true;
        success++;
      } catch {
        failed++;
      }
    }

    return { success, failed };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Graph Events (M1)
  // ─────────────────────────────────────────────────────────────────────────────

  async logGraphCompile(
    graphHash: string,
    nodeCount: number,
    edgeCount: number,
    context?: { organizationId?: string; workflowRunId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent('GRAPH_COMPILE', { graphHash, nodeCount, edgeCount }, context);
  }

  async logGraphTransition(
    proof: TransitionProof,
    context: ExecutionContext
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      'GRAPH_TRANSITION',
      {
        fromState: proof.fromState,
        toState: proof.toState,
        guardsPassed: proof.guardSatisfaction.filter(g => g.valid).length,
        guardsFailed: proof.guardSatisfaction.filter(g => !g.valid).length,
        zkProofCount: proof.zeroKnowledge.length,
      },
      {
        workflowRunId: context.workflowRunId,
        actorId: context.actor.userId,
        actorRole: context.actor.role,
      }
    );
  }

  async logInvariantCheck(
    nodeId: string,
    valid: boolean,
    reason?: string,
    context?: ExecutionContext
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      'GRAPH_INVARIANT_CHECK',
      { nodeId, valid, reason },
      context ? { workflowRunId: context.workflowRunId, actorId: context.actor.userId } : undefined
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZK Events (M2)
  // ─────────────────────────────────────────────────────────────────────────────

  async logZKProofGenerated(
    proof: ZKProof,
    context?: { workflowRunId?: string; actorId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      'ZK_PROOF_GENERATED',
      { proofType: proof.type, proofId: proof.proofId },
      context
    );
  }

  async logZKVerificationResult(
    proof: ZKProof,
    valid: boolean,
    reason?: string,
    context?: { workflowRunId?: string; actorId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      valid ? 'ZK_VERIFICATION_SUCCESS' : 'ZK_VERIFICATION_FAILED',
      { proofType: proof.type, proofId: proof.proofId, reason },
      context
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Delta Events (M3)
  // ─────────────────────────────────────────────────────────────────────────────

  async logDeltaBaselineSet(
    snapshotHash: string,
    context?: { organizationId?: string; workflowRunId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent('DELTA_BASELINE_SET', { snapshotHash }, context);
  }

  async logDeltaDriftDetected(
    report: DeltaReport,
    context?: { organizationId?: string; workflowRunId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      'DELTA_DRIFT_DETECTED',
      {
        divergence: report.divergence,
        violations: report.violations.map(v => ({ path: v.path, severity: v.severity })),
        expectedHash: report.expectedHash,
        actualHash: report.actualHash,
      },
      context
    );
  }

  async logTamperDetected(
    violations: DeltaViolation[],
    context?: { organizationId?: string; workflowRunId?: string }
  ): Promise<ProofAuditEntry> {
    const critical = violations.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH');
    return this.logEvent(
      'DELTA_TAMPER_DETECTED',
      {
        violationCount: violations.length,
        criticalCount: critical.length,
        paths: violations.map(v => v.path),
      },
      context
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Certificate Events (M4)
  // ─────────────────────────────────────────────────────────────────────────────

  async logCertificateGenerated(
    certificate: RegulatorySubmissionCertificate,
    context?: { organizationId?: string; actorId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      'CERTIFICATE_GENERATED',
      {
        certificateId: certificate.certificateId,
        workflowRunId: certificate.workflowRunId,
        submissionType: certificate.submissionType,
        proofCount:
          (certificate.proof.authorizationProofs?.length || 0) +
          (certificate.proof.temporalProofs?.length || 0) +
          (certificate.proof.pathProof ? 1 : 0),
      },
      { ...context, workflowRunId: certificate.workflowRunId }
    );
  }

  async logCertificateVerified(
    certificateId: string,
    valid: boolean,
    verificationTimeMs: number,
    failureCount: number,
    context?: { organizationId?: string; actorId?: string; workflowRunId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      valid ? 'CERTIFICATE_VERIFIED' : 'CERTIFICATE_VERIFICATION_FAILED',
      { certificateId, valid, verificationTimeMs, failureCount },
      context
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI Events (M5)
  // ─────────────────────────────────────────────────────────────────────────────

  async logUIProofView(
    workflowRunId: string,
    context?: { organizationId?: string; actorId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent('UI_PROOF_VIEW', { workflowRunId }, { ...context, workflowRunId });
  }

  async logUIVerificationRequest(
    workflowRunId: string,
    context?: { organizationId?: string; actorId?: string }
  ): Promise<ProofAuditEntry> {
    return this.logEvent(
      'UI_VERIFICATION_REQUEST',
      { workflowRunId },
      { ...context, workflowRunId }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Querying
  // ─────────────────────────────────────────────────────────────────────────────

  getEntries(filter?: {
    eventType?: ProofEventType;
    workflowRunId?: string;
    organizationId?: string;
    since?: string;
    limit?: number;
  }): ProofAuditEntry[] {
    let result = [...this.entries];

    if (filter?.eventType) {
      result = result.filter(e => e.eventType === filter.eventType);
    }
    if (filter?.workflowRunId) {
      result = result.filter(e => e.workflowRunId === filter.workflowRunId);
    }
    if (filter?.organizationId) {
      result = result.filter(e => e.organizationId === filter.organizationId);
    }
    const since = filter?.since;
    if (since) {
      result = result.filter(e => e.timestamp >= since);
    }
    if (filter?.limit) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  verifyHashChain(): { valid: boolean; brokenAt?: string } {
    let prevHash: string | undefined;
    for (const entry of this.entries) {
      if (entry.previousHash !== prevHash) {
        return { valid: false, brokenAt: entry.id };
      }
      const recomputed = this.computeEntryHash({ ...entry, hashChain: '' });
      if (recomputed !== entry.hashChain) {
        return { valid: false, brokenAt: entry.id };
      }
      prevHash = entry.hashChain;
    }
    return { valid: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private generateId(eventType: ProofEventType, timestamp: string): string {
    return this.hash(`${eventType}:${timestamp}:${Math.random()}`).slice(0, 16);
  }

  private computeEntryHash(entry: ProofAuditEntry): string {
    const payload = this.stableStringify({
      id: entry.id,
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      organizationId: entry.organizationId,
      workflowRunId: entry.workflowRunId,
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      details: entry.details,
      previousHash: entry.previousHash,
    });
    return this.hash(payload);
  }

  private redactSensitive(details: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ['password', 'secret', 'token', 'apikey', 'privatekey', 'key'];
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
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

export default ProofAuditService;
