/**
 * useWorkflowStream — Firebase real-time projection for orchestration engine
 *
 * Streams workflow run updates, validation results, readiness status, and
 * approval gate state via Firestore real-time listeners.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FIREBASE USAGE CONSTRAINT                                         ║
 * ║                                                                    ║
 * ║  Firebase is a DELIVERY LAYER, not a data store.                   ║
 * ║  - Source of truth: PostgreSQL (workflow_runs, approval_checkpoints)║
 * ║  - Firebase: read-only projection for UI, written by backend only  ║
 * ║  - All mutations go through backend APIs, never through Firebase   ║
 * ║  - If Firebase is unavailable, the UI polls the REST API instead   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Firestore paths use the tenant-scoped canonical builders from
 * shared/types/firebase-events.ts (FirestorePaths) for consistency
 * between server publisher and client subscribers.
 *
 * @module client/src/concept2cure/hooks/useWorkflowStream
 */

import { useState, useEffect, useRef } from 'react';
import { getFirestoreDb, isFirebaseConfigured } from '../config/firebase';
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { FirestorePaths } from '../../../../shared/types/firebase-events';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — Read-only projections of backend state
// ═══════════════════════════════════════════════════════════════════════════════

/** Projected workflow run status (mirrors workflow_runs table) */
export interface WorkflowRunProjection {
  readonly runId: string;
  readonly workflowType: string;
  readonly displayName: string;
  readonly status: 'pending' | 'running' | 'paused' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly triggeredBy: string;
  readonly startedAt: string | null;
  readonly updatedAt: string;
  readonly errorMessage?: string;
  readonly blockerCount: number;
  readonly outputCount: number;
}

/** Projected step status */
export interface WorkflowStepProjection {
  readonly stepIndex: number;
  readonly stepName: string;
  readonly stepType: 'deterministic' | 'ai_reasoning';
  readonly status: 'proposed' | 'awaiting_review' | 'approved' | 'executed' | 'failed' | 'skipped' | 'running';
  readonly durationMs?: number;
  readonly error?: string;
}

/** Projected approval gate */
export interface ApprovalGateProjection {
  readonly gateId: string;
  readonly stepIndex: number;
  readonly stepName: string;
  readonly gateType: 'manual' | 'role_based' | 'quorum' | 'auto_on_pass';
  readonly status: 'proposed' | 'awaiting_review' | 'approved' | 'failed' | 'skipped';
  readonly protectedAction: string;
  readonly requiredApproverRoles: readonly string[];
  readonly approvalsReceived: number;
  readonly approvalsRequired: number;
}

/** Projected readiness snapshot */
export interface ReadinessProjection {
  readonly overallScore: number;
  readonly isReady: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly advisoryCount: number;
  readonly passedCount: number;
  readonly evaluatedAt: string;
  readonly evaluationId: string;
}

/** Projected project intelligence summary */
export interface IntelligenceProjection {
  readonly blockerCount: number;
  readonly unresolvedRiskCount: number;
  readonly lastWorkflowStatus: string | null;
  readonly lastWorkflowAt: string | null;
  readonly nextActionCount: number;
  readonly version: number;
  readonly updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK: useWorkflowRunStream — stream a single workflow run
// ═══════════════════════════════════════════════════════════════════════════════

interface UseWorkflowRunStreamOptions {
  readonly tenantId: number;
  readonly projectId: number;
  readonly runId: string | null;
  /** Polling interval in ms when Firebase is unavailable (default: 5000) */
  readonly pollIntervalMs?: number;
}

export interface UseWorkflowRunStreamReturn {
  readonly run: WorkflowRunProjection | null;
  readonly steps: readonly WorkflowStepProjection[];
  readonly approvalGates: readonly ApprovalGateProjection[];
  readonly isStreaming: boolean;
  readonly isFirebaseActive: boolean;
}

export function useWorkflowRunStream({
  tenantId,
  projectId,
  runId,
  pollIntervalMs = 5_000,
}: UseWorkflowRunStreamOptions): UseWorkflowRunStreamReturn {
  const [run, setRun] = useState<WorkflowRunProjection | null>(null);
  const [steps, setSteps] = useState<WorkflowStepProjection[]>([]);
  const [approvalGates, setApprovalGates] = useState<ApprovalGateProjection[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setSteps([]);
      setApprovalGates([]);
      return;
    }

    // ── Firebase path: real-time streaming (tenant-scoped) ──────────────
    if (isFirebaseConfigured()) {
      const db = getFirestoreDb();
      if (!db) return;

      const unsubs: Unsubscribe[] = [];

      // Stream workflow run projection doc using canonical path
      const currentPath = FirestorePaths.workflowRunCurrent(tenantId, projectId, runId);
      const runRef = doc(db, currentPath);
      unsubs.push(
        onSnapshot(runRef, (snap) => {
          if (snap.exists()) {
            setRun(snap.data() as WorkflowRunProjection);
          }
        })
      );

      // Stream workflow run events (ordered by time) for step/approval state
      const eventsPath = FirestorePaths.workflowRunEventsCollection(tenantId, projectId, runId);
      const eventsRef = collection(db, eventsPath);
      const eventsQuery = query(eventsRef, orderBy('occurredAt', 'asc'));
      unsubs.push(
        onSnapshot(eventsQuery, (snap) => {
          const stepMap = new Map<number, WorkflowStepProjection>();
          const gateMap = new Map<string, ApprovalGateProjection>();

          snap.forEach((d) => {
            const data = d.data();
            const eventType = data.eventType as string;

            // Build step projections from step events
            if (eventType.startsWith('workflow.step.') && data.payload) {
              const p = data.payload as Record<string, unknown>;
              const idx = p.stepIndex as number;
              stepMap.set(idx, {
                stepIndex: idx,
                stepName: (p.stepName as string) ?? '',
                stepType: (p.stepType as 'deterministic' | 'ai_reasoning') ?? 'deterministic',
                status: (p.status as WorkflowStepProjection['status']) ?? 'proposed',
                durationMs: p.durationMs as number | undefined,
                error: p.error as string | undefined,
              });
            }

            // Build approval gate projections from awaiting_approval events
            if (eventType === 'workflow.step.awaiting_approval' && data.payload) {
              const p = data.payload as Record<string, unknown>;
              const gateId = `gate-${p.stepIndex}`;
              gateMap.set(gateId, {
                gateId,
                stepIndex: p.stepIndex as number,
                stepName: (p.stepName as string) ?? '',
                gateType: 'manual',
                status: 'awaiting_review',
                protectedAction: '',
                requiredApproverRoles: [],
                approvalsReceived: 0,
                approvalsRequired: 1,
              });
            }
          });

          setSteps(Array.from(stepMap.values()).sort((a, b) => a.stepIndex - b.stepIndex));
          setApprovalGates(Array.from(gateMap.values()));
        })
      );

      unsubscribesRef.current = unsubs;
      setIsStreaming(true);

      return () => {
        unsubs.forEach((u) => u());
        setIsStreaming(false);
      };
    }

    // ── Fallback path: REST API polling ───────────────────────────────
    const poll = async () => {
      try {
        const res = await fetch(`/api/orchestration/runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          setRun(data.run ?? null);
          setSteps(data.steps ?? []);
          setApprovalGates(data.approvalGates ?? []);
        }
      } catch {
        // Silently retry on next interval
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), pollIntervalMs);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tenantId, projectId, runId, pollIntervalMs]);

  return {
    run,
    steps,
    approvalGates,
    isStreaming,
    isFirebaseActive: isFirebaseConfigured(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK: useReadinessStream — stream project readiness updates
// ═══════════════════════════════════════════════════════════════════════════════

interface UseReadinessStreamOptions {
  readonly tenantId: number;
  readonly projectId: number | null;
  readonly pollIntervalMs?: number;
}

export interface UseReadinessStreamReturn {
  readonly readiness: ReadinessProjection | null;
  readonly isStreaming: boolean;
}

export function useReadinessStream({
  tenantId,
  projectId,
  pollIntervalMs = 10_000,
}: UseReadinessStreamOptions): UseReadinessStreamReturn {
  const [readiness, setReadiness] = useState<ReadinessProjection | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (projectId == null) {
      setReadiness(null);
      return;
    }

    if (isFirebaseConfigured()) {
      const db = getFirestoreDb();
      if (!db) return;

      // Use canonical tenant-scoped path from FirestorePaths
      const readinessPath = FirestorePaths.readinessCurrent(tenantId, projectId);
      const readinessRef = doc(db, readinessPath);
      const unsub = onSnapshot(readinessRef, (snap) => {
        if (snap.exists()) {
          setReadiness(snap.data() as ReadinessProjection);
        }
      });
      setIsStreaming(true);

      return () => {
        unsub();
        setIsStreaming(false);
      };
    }

    // Fallback: poll
    let interval: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/orchestration/projects/${projectId}/readiness`);
        if (res.ok) {
          setReadiness(await res.json());
        }
      } catch {
        // retry next interval
      }
    };
    void poll();
    interval = setInterval(() => void poll(), pollIntervalMs);

    return () => { if (interval) clearInterval(interval); };
  }, [tenantId, projectId, pollIntervalMs]);

  return { readiness, isStreaming };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK: useProjectIntelligenceStream — stream project intelligence updates
// ═══════════════════════════════════════════════════════════════════════════════

interface UseProjectIntelligenceStreamOptions {
  readonly tenantId: number;
  readonly projectId: number | null;
  readonly pollIntervalMs?: number;
}

export interface UseProjectIntelligenceStreamReturn {
  readonly intelligence: IntelligenceProjection | null;
  readonly isStreaming: boolean;
}

export function useProjectIntelligenceStream({
  tenantId,
  projectId,
  pollIntervalMs = 15_000,
}: UseProjectIntelligenceStreamOptions): UseProjectIntelligenceStreamReturn {
  const [intelligence, setIntelligence] = useState<IntelligenceProjection | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (projectId == null) {
      setIntelligence(null);
      return;
    }

    if (isFirebaseConfigured()) {
      const db = getFirestoreDb();
      if (!db) return;

      // Intelligence uses tenant-scoped path — currently no canonical path in FirestorePaths
      // so we construct it following the same pattern
      const intelPath = `tenants/${tenantId}/projects/${projectId}/intelligence/summary`;
      const intelRef = doc(db, intelPath);
      const unsub = onSnapshot(intelRef, (snap) => {
        if (snap.exists()) {
          setIntelligence(snap.data() as IntelligenceProjection);
        }
      });
      setIsStreaming(true);

      return () => {
        unsub();
        setIsStreaming(false);
      };
    }

    // Fallback: poll
    let interval: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/orchestration/projects/${projectId}/intelligence`);
        if (res.ok) {
          setIntelligence(await res.json());
        }
      } catch {
        // retry next interval
      }
    };
    void poll();
    interval = setInterval(() => void poll(), pollIntervalMs);

    return () => { if (interval) clearInterval(interval); };
  }, [tenantId, projectId, pollIntervalMs]);

  return { intelligence, isStreaming };
}
