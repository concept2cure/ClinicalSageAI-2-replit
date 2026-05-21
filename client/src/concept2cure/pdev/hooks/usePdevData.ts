/**
 * PDEV data hooks — read + governed mutations.
 *
 * Bound to the endpoints in the merged PDEV backend
 * (server/routes/pdev/pdev-routes.ts). Each mutation hook accepts a
 * `reason` string and forwards it to the route — the existing audit
 * middleware writes the SHA-256 chain entry with that reason.
 *
 * Wraps the existing useFetchJson primitive (MDX module) — fetch infra
 * (cancellation, refresh, error narrowing) stays in one place.
 */

import { useCallback, useState } from 'react';
import { useFetchJson } from '../../mdx/hooks/useFetchJson';
import type { PdevActivityState, PdevWorkstream } from '../data/enums';
import type {
  PdevAiDraftResult,
  PdevContradictionsPayload,
  PdevEvidenceLinkType,
  PdevEvidencePayload,
  PdevEvidenceStrength,
  PdevFdaProposalsPayload,
  PdevFdaStreamPayload,
  PdevIndAssemblyPayload,
  PdevProgramView,
  PdevProvenancePayload,
  PdevReadinessReport,
  PdevRegistryPayload,
  PdevWorkflowPayload,
  PdevWorkstreamPayload,
} from '../data/types';

/** Server `ok()` wraps payloads as `{ data: ... }`. Mirrors the MDX
 *  hook pattern. */
interface Envelope<T> {
  data: T;
}

/** Cached at app boot per PHASE_7_INSTALL.md §2 — every surface reads
 *  closed enums from the same response. */
export function usePdevRegistry() {
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevRegistryPayload>>('/api/pdev/registry');
  return {
    registry: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

/** Program-level unified view: program row + workstream rollups +
 *  per-activity state + latest readiness snapshots + correspondence
 *  counts. Pass `null` to disable the fetch (idle state) while parent
 *  values are unresolved. */
export function usePdevProgram(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevProgramView>>(url);
  return {
    view: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

/** Standalone readiness report (live recompute). The program view
 *  already carries `latestSnapshots`; this hook exists for surfaces
 *  that want the freshly-computed score without re-fetching everything. */
export function usePdevReadiness(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/readiness`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevReadinessReport>>(url);
  return {
    report: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

/** Workstream drill payload — rollup metrics for the chosen workstream
 *  plus its activities (registry def + per-program state). */
export function usePdevWorkstream(
  programId: string | null,
  workstream: PdevWorkstream | null,
) {
  const url =
    programId && workstream
      ? `/api/pdev/programs/${encodeURIComponent(programId)}/workstreams/${workstream}`
      : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevWorkstreamPayload>>(url);
  return {
    payload: data?.data ?? null,
    loading,
    error,
    refresh,
  };
}

// ─── Per-activity reads (Documents / Evidence / Workflow / Provenance / Audit tabs) ─────────────────────

export function usePdevActivityEvidence(
  programId: string | null,
  activityKey: string | null,
) {
  const url =
    programId && activityKey
      ? `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/evidence`
      : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevEvidencePayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

export function usePdevActivityWorkflow(
  programId: string | null,
  activityKey: string | null,
) {
  const url =
    programId && activityKey
      ? `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/workflow`
      : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevWorkflowPayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

export function usePdevActivityProvenance(
  programId: string | null,
  activityKey: string | null,
) {
  const url =
    programId && activityKey
      ? `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/provenance`
      : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevProvenancePayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

// ─── Workspace reads (IND assembly · FDA stream · Contradictions) ──────────

export function usePdevIndAssembly(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/ind-assembly`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevIndAssemblyPayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

export function usePdevFdaInteractions(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/fda-interactions`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevFdaStreamPayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

export function usePdevFdaProposals(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/fda-feedback/proposals`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevFdaProposalsPayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

export function usePdevContradictions(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/contradictions`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevContradictionsPayload>>(url);
  return { payload: data?.data ?? null, loading, error, refresh };
}

// ─── Governed mutations ────────────────────────────────────────────────────
//
// Each mutation hook accepts a `reason` and forwards it to the route as
// the `notes` field (server's audit middleware writes the SHA-256 chain
// entry with that text). Hooks return `{ run, loading, error, lastResult }`
// — call `run(args)` and await the promise; on success the result is also
// stashed in `lastResult` so the caller can read it without awaiting.

interface MutationState<T> {
  loading: boolean;
  error: string | null;
  lastResult: T | null;
}

function useMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
): {
  run: (args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: string | null;
  lastResult: TResult | null;
} {
  const [state, setState] = useState<MutationState<TResult>>({
    loading: false,
    error: null,
    lastResult: null,
  });
  const run = useCallback(
    async (args: TArgs): Promise<TResult> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await fn(args);
        setState({ loading: false, error: null, lastResult: result });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Mutation failed';
        setState({ loading: false, error: msg, lastResult: null });
        throw err;
      }
    },
    [fn],
  );
  return { run, ...state };
}

async function postJson<TBody, TResult>(
  url: string,
  body: TBody,
  method: 'POST' | 'DELETE' = 'POST',
): Promise<TResult> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    );
  }
  return (await res.json()) as TResult;
}

export interface ActivityStateChangeArgs {
  programId: string;
  activityKey: string;
  state: PdevActivityState;
  /** Captured verbatim in the audit log. */
  reason: string;
  /** Override the dependency gate. Audit-flagged. */
  force?: boolean;
}

/** POST /api/pdev/programs/:programId/activities/:activityKey/state */
export function usePdevActivityStateChange() {
  return useMutation<ActivityStateChangeArgs, Envelope<unknown>>(
    ({ programId, activityKey, state, reason, force }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/state`,
        { state, notes: reason, force },
      ),
  );
}

export interface EvidenceAttachArgs {
  programId: string;
  activityKey: string;
  evidenceObjectId: string;
  linkType: PdevEvidenceLinkType;
  strength: PdevEvidenceStrength;
  rationale: string;
}

/** POST /api/pdev/programs/:programId/activities/:activityKey/evidence */
export function usePdevEvidenceAttach() {
  return useMutation<EvidenceAttachArgs, Envelope<unknown>>(
    ({ programId, activityKey, evidenceObjectId, linkType, strength, rationale }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/evidence`,
        { evidenceObjectId, linkType, strength, rationale },
      ),
  );
}

export interface EvidenceDetachArgs {
  programId: string;
  activityKey: string;
  evidenceLinkId: string;
  reason: string;
}

/** DELETE /api/pdev/programs/:programId/activities/:activityKey/evidence/:evId */
export function usePdevEvidenceDetach() {
  return useMutation<EvidenceDetachArgs, Envelope<unknown>>(
    ({ programId, activityKey, evidenceLinkId, reason }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/evidence/${encodeURIComponent(evidenceLinkId)}`,
        { reason },
        'DELETE',
      ),
  );
}

export interface AiDraftArgs {
  programId: string;
  activityKey: string;
  projectId: number;
  documentCode?: string;
  userPrompt?: string;
  evidenceObjectIds?: string[];
}

/** POST /api/pdev/programs/:programId/activities/:activityKey/ai-draft */
export function usePdevAiDraft() {
  return useMutation<AiDraftArgs, Envelope<PdevAiDraftResult>>(
    ({ programId, activityKey, ...body }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/ai-draft`,
        body,
      ),
  );
}

export interface ReadinessSnapshotArgs {
  programId: string;
  reason: string;
}

/** POST /api/pdev/programs/:programId/readiness/snapshot */
export function usePdevReadinessSnapshot() {
  return useMutation<ReadinessSnapshotArgs, Envelope<unknown>>(
    ({ programId, reason }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/readiness/snapshot`,
        { notes: reason },
      ),
  );
}

export interface CompileIndArgs {
  programId: string;
  submissionId: number;
  region?: string;
  submissionType?: string;
  readinessThreshold?: number;
  force?: boolean;
  reason: string;
}

/** POST /api/pdev/programs/:programId/ind-assembly/compile */
export function usePdevCompileInd() {
  return useMutation<CompileIndArgs, Envelope<unknown>>(
    ({ programId, reason, ...body }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/ind-assembly/compile`,
        { ...body, notes: reason },
      ),
  );
}

export interface FdaFeedbackApplyArgs {
  programId: string;
  interactionId: string;
  proposedActivityKey: string;
  reason: string;
}

/** POST /api/pdev/programs/:programId/fda-feedback/apply */
export function usePdevFdaFeedbackApply() {
  return useMutation<FdaFeedbackApplyArgs, Envelope<unknown>>(
    ({ programId, interactionId, proposedActivityKey, reason }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/fda-feedback/apply`,
        { interactionId, proposedActivityKey, notes: reason },
      ),
  );
}

export interface WorkflowKickoffArgs {
  programId: string;
  activityKey: string;
  targetState: PdevActivityState;
  reason: string;
}

/** POST /api/pdev/programs/:programId/activities/:activityKey/workflow/kickoff */
export function usePdevWorkflowKickoff() {
  return useMutation<WorkflowKickoffArgs, Envelope<unknown>>(
    ({ programId, activityKey, targetState, reason }) =>
      postJson(
        `/api/pdev/programs/${encodeURIComponent(programId)}/activities/${encodeURIComponent(activityKey)}/workflow/kickoff`,
        { targetState, notes: reason },
      ),
  );
}

export interface WorkflowDecisionArgs {
  runId: string;
  checkpointId: string;
  decision: 'approve' | 'reject';
  reason: string;
}

/** POST /api/pdev/workflow-runs/:runId/checkpoints/:cpId/decision */
export function usePdevWorkflowDecision() {
  return useMutation<WorkflowDecisionArgs, Envelope<unknown>>(
    ({ runId, checkpointId, decision, reason }) =>
      postJson(
        `/api/pdev/workflow-runs/${encodeURIComponent(runId)}/checkpoints/${encodeURIComponent(checkpointId)}/decision`,
        { decision, comment: reason },
      ),
  );
}
