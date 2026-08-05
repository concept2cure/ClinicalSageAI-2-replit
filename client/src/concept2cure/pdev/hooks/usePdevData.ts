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

import { useCallback, useMemo, useState } from 'react';
import { useFetchJson } from '../../mdx/hooks/useFetchJson';
import type { PdevActivityState, PdevWorkstream } from '../data/enums';
import type {
  PdevActivityView,
  PdevAiDraftResult,
  PdevContradiction,
  PdevContradictionsPayload,
  PdevEvidenceLinkType,
  PdevEvidencePayload,
  PdevEvidenceStrength,
  PdevFdaInteraction,
  PdevFdaInteractionKind,
  PdevFdaProposalsPayload,
  PdevFdaStreamPayload,
  PdevIndAssemblyPayload,
  PdevProgramView,
  PdevProvenancePayload,
  PdevReadinessReport,
  PdevReadinessSnapshotRow,
  PdevRegistryPayload,
  PdevWorkstreamRollup,
  PdevWorkflowPayload,
  PdevWorkstreamPayload,
} from '../data/types';

/** Server `ok()` wraps payloads as `{ data: ... }`. Mirrors the MDX
 *  hook pattern. */
interface Envelope<T> {
  data: T;
}

/**
 * `x ?? []` defends against a MISSING value, not against a value of the wrong
 * TYPE — and the wrong type is what a version-skewed route actually sends. A
 * 200 carrying `{ data: {} }` unwraps to `{}`, `{} ?? []` is `{}`, and the very
 * next `.filter` / `.map` / `.length` throws mid-render, so the whole PDEV
 * surface unwinds and the shell says "this surface didn't finish loading"
 * instead of "we couldn't load this". Every adapter below therefore asks what
 * the value IS before spreading, mapping or indexing it.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The `{ data: ... }` payload, or `undefined` when the body is not an
 *  envelope at all. `'data' in rec` rather than a truthiness test, because a
 *  payload of `null` is real ("nothing here yet") and must not read the same
 *  as a proxy that replaced the body wholesale. */
function payloadOf(body: unknown): unknown {
  const rec = asRecord(body);
  return rec && 'data' in rec ? rec.data : undefined;
}

/** An OPTIONAL list member: absent means empty, but present-and-not-a-list
 *  means the payload is not what it claims and is reported, never coerced.
 *  `(x ?? []).map` coerces, which is how `{}` reached `.map`. */
function optionalArray<T>(value: unknown): T[] | null {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as T[]) : null;
}

/** A REQUIRED list member. Absence is not emptiness here: these routes always
 *  send the key, so a body without it is a different payload wearing the same
 *  content-type — reporting it as "0 activities" would invent a fact. */
function requiredArray<T>(rec: Record<string, unknown>, key: string): T[] | null {
  const value = rec[key];
  return Array.isArray(value) ? (value as T[]) : null;
}

/** Lands in the caller's existing error branch, next to HTTP/network errors —
 *  the point is that the user is told the load failed, not shown a blank
 *  surface or a spinner that never resolves. */
function shapeError(path: string): string {
  return `unexpected response shape for ${path}`;
}

/** A body arrived but no adapter could make sense of it. `data === null` while
 *  the request is still in flight, which must NOT read as a bad shape. */
function shapeErrorIf(bodyArrived: boolean, adapted: unknown, path: string): string | null {
  return bodyArrived && adapted === null ? shapeError(path) : null;
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

/** One row of the IND program selector list (`GET /api/regulatory-programs`). */
export interface PdevIndProgramRow {
  id: string;
  code: string;
  productName: string;
  name: string;
  programType: string;
  status: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * The IND programs this org can track, already narrowed to live INDs.
 *
 * This lived in App.tsx as `(programsList?.data ?? []).filter(...)`, which is
 * the line every PDEV surface came down on: the envelope's payload only has to
 * arrive as an object rather than an array — one route returning `{ data: {} }`
 * where it used to return a list — and `?? []` passes the object straight
 * through to `.filter`. The list drives program selection, so every downstream
 * fetch on the surface died with it. A body that is not a list is reported as
 * a load failure, not silently rendered as "no IND programs yet".
 */
export function usePdevIndPrograms() {
  const path = '/api/regulatory-programs';
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevIndProgramRow[]>>(path);
  const body = data === null ? undefined : payloadOf(data);
  const rows: PdevIndProgramRow[] | null = Array.isArray(body)
    ? (body as PdevIndProgramRow[])
    : null;
  /* Memoized because App.tsx keys an effect off this list — a fresh array
     every render would loop. */
  const programs = useMemo(
    () =>
      (rows ?? []).filter(
        (p) => !!p && p.programType === 'IND' && p.status !== 'archived',
      ),
    [rows],
  );
  return {
    programs,
    loading,
    error: error ?? shapeErrorIf(data !== null, rows, path),
    refresh,
  };
}

/** Program-level unified view: program row + workstream rollups +
 *  per-activity state + latest readiness snapshots + correspondence
 *  counts. Pass `null` to disable the fetch (idle state) while parent
 *  values are unresolved. */
function adaptProgramView(server: unknown): PdevProgramView | null {
  // `data?.data ?? null` handed this straight to the surfaces, and every one of
  // App.tsx's `program.view?.program.code` reads is guarded on the CONTAINER,
  // not the member — `{}` is a perfectly good `view`, and `{}.program.code`
  // throws. Same for `view.latestSnapshots.length` and Overview's
  // `for (const r of workstreams)`. Prove the program row and the three lists
  // exist before any surface is told this is a program view.
  const rec = asRecord(server);
  if (!rec || !asRecord(rec.program)) return null;
  const workstreams = requiredArray<PdevWorkstreamRollup>(rec, 'workstreams');
  const activities = requiredArray<PdevActivityView>(rec, 'activities');
  const latestSnapshots = requiredArray<PdevReadinessSnapshotRow>(rec, 'latestSnapshots');
  if (!workstreams || !activities || !latestSnapshots) return null;
  return {
    ...(rec as unknown as PdevProgramView),
    workstreams,
    activities,
    latestSnapshots,
  };
}

export function usePdevProgram(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevProgramView>>(url);
  const view = useMemo(
    () => (data === null ? null : adaptProgramView(payloadOf(data))),
    [data],
  );
  return {
    view,
    loading,
    // App.tsx already renders `pdev-page-error` for this — a bad shape is a
    // failed load, and saying so beats a spinner that never resolves.
    error: error ?? shapeErrorIf(data !== null, view, url ?? 'program'),
    refresh,
  };
}

/** Server payload from /readiness. `workstreams` carries per-workstream
 *  rollups, `overall` carries the aggregate as the same rollup shape
 *  (with workstream: 'overall' or similar). adaptReadiness() bridges
 *  it to the PdevReadinessReport shape the surface consumes. */
interface ServerReadinessPayload {
  workstreams: PdevWorkstreamRollup[];
  overall: PdevWorkstreamRollup;
  findings?: unknown[];
}

function adaptReadiness(
  server: ServerReadinessPayload | null,
  programId: string | null,
): PdevReadinessReport | null {
  // Null-checked AND shape-checked. `if (!server) return null` alone left
  // `server.overall.readinessScore` to throw on any 200 whose body is not
  // exactly the expected object — and the throw happens during render, so the
  // whole PDEV surface comes down and shows nothing at all instead of the
  // `pdev-page-error` branch App.tsx already has for precisely this.
  //
  // Third instance of the same pattern in the converged kits (see
  // mdx/hooks/usePresub.ts, twice). An adapter that trusts the server's shape
  // turns a bad payload into a blank screen with no message.
  if (!server || typeof server !== 'object' || !server.overall) return null;
  return {
    programId: programId ?? '',
    overall: {
      readinessScore: server.overall.readinessScore,
      completedActivities: server.overall.completedActivities,
      totalActivities: server.overall.totalActivities,
      blockingActivities: server.overall.blockingActivities,
      blockingResolved: server.overall.blockingResolved,
    },
    byWorkstream: Array.isArray(server.workstreams) ? server.workstreams : [],
    computedAt: new Date().toISOString(),
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
    useFetchJson<Envelope<ServerReadinessPayload>>(url);
  return {
    report: adaptReadiness(data?.data ?? null, programId),
    loading,
    error,
    refresh,
  };
}

/** Workstream drill payload — rollup metrics for the chosen workstream
 *  plus its activities (registry def + per-program state). */
function adaptWorkstreamPayload(server: unknown): PdevWorkstreamPayload | null {
  // Workstream.tsx reads `payload.activities` and immediately calls `.length`
  // and `.filter` on it. Nothing between the socket and that call checked it
  // was a list.
  const rec = asRecord(server);
  if (!rec) return null;
  const activities = requiredArray<PdevActivityView>(rec, 'activities');
  if (!activities) return null;
  return { ...(rec as unknown as PdevWorkstreamPayload), activities };
}

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
  const payload = useMemo(
    () => (data === null ? null : adaptWorkstreamPayload(payloadOf(data))),
    [data],
  );
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'workstream'),
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
  // ActivityDetail writes `evidence.payload?.links.length` — the `?.` covers
  // the payload and not `links`, so a payload without a list of links throws
  // on the tab that is supposed to say "No evidence attached yet."
  const payload = useMemo(() => {
    if (data === null) return null;
    const rec = asRecord(payloadOf(data));
    const links = rec ? requiredArray<PdevEvidencePayload['links'][number]>(rec, 'links') : null;
    return links ? { ...(rec as unknown as PdevEvidencePayload), links } : null;
  }, [data]);
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'evidence'),
    refresh,
  };
}

interface ServerWorkflowPayload {
  workflowRunId: string | null;
  checkpoints: Array<{
    id: string;
    stepIndex: number;
    name: string;
    status: string;
    requiredRoles?: string[];
    approvals?: Array<{
      id: string;
      approverUserId: number | null;
      approverDisplay?: string;
      role?: string;
      decidedAt?: string;
      decision?: 'approve' | 'reject';
      comment?: string | null;
    }>;
  }>;
  workflowType?: string;
  targetState?: string;
  status?: string;
  createdAt?: string;
}

function adaptWorkflow(
  server: ServerWorkflowPayload | null,
  activityKey: string | null,
  programId: string | null,
): PdevWorkflowPayload | null {
  // `if (!server)` let any object through, and `(server.checkpoints ?? []).map`
  // below defends against a checkpoints field that is MISSING, not one that
  // came back as an object — `{} ?? []` is `{}`, and `{}.map` throws. Same for
  // each checkpoint's `approvals`.
  if (!asRecord(server)) return null;
  const run = server as ServerWorkflowPayload;
  if (!run.workflowRunId) return { run: null };
  const checkpoints = optionalArray<ServerWorkflowPayload['checkpoints'][number]>(
    run.checkpoints,
  );
  if (!checkpoints) return null;
  const adaptedCheckpoints = [];
  for (const cp of checkpoints) {
    const approvals = optionalArray<NonNullable<typeof cp.approvals>[number]>(cp.approvals);
    if (!approvals) return null;
    adaptedCheckpoints.push({
      id: cp.id,
      stepIndex: cp.stepIndex,
      name: cp.name,
      status: cp.status as never,
      requiredRoles: optionalArray<string>(cp.requiredRoles) ?? [],
      approvals: approvals.map((a) => ({
        id: a.id,
        approverUserId: a.approverUserId ?? null,
        approverDisplay: a.approverDisplay ?? String(a.approverUserId ?? 'unknown'),
        role: a.role ?? '',
        decidedAt: a.decidedAt ?? '',
        decision: a.decision ?? 'approve',
        comment: a.comment ?? null,
      })),
    });
  }
  return {
    run: {
      runId: run.workflowRunId,
      workflowType: run.workflowType ?? 'state_promotion',
      activityKey: activityKey ?? '',
      programId: programId ?? '',
      targetState: (run.targetState ?? 'approved') as PdevWorkflowPayload['run'] extends infer R
        ? R extends { targetState: infer T }
          ? T
          : never
        : never,
      status: (run.status ?? 'awaiting_approval') as never,
      checkpoints: adaptedCheckpoints,
      createdAt: run.createdAt ?? new Date().toISOString(),
    },
  };
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
    useFetchJson<Envelope<ServerWorkflowPayload>>(url);
  const payload = useMemo(
    () =>
      data === null
        ? null
        : adaptWorkflow(payloadOf(data) as ServerWorkflowPayload | null, activityKey, programId),
    [data, activityKey, programId],
  );
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'workflow'),
    refresh,
  };
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
  // The Provenance and Audit tabs read `payload.artifacts.length`,
  // `.evidence.length`, `.lineage.length` and `.audit.length` off a payload
  // whose only check was `payload &&` — four members, one container guard.
  const payload = useMemo(() => {
    if (data === null) return null;
    const rec = asRecord(payloadOf(data));
    if (!rec) return null;
    const artifacts = requiredArray<PdevProvenancePayload['artifacts'][number]>(rec, 'artifacts');
    const evidence = requiredArray<PdevProvenancePayload['evidence'][number]>(rec, 'evidence');
    const lineage = requiredArray<PdevProvenancePayload['lineage'][number]>(rec, 'lineage');
    const audit = requiredArray<PdevProvenancePayload['audit'][number]>(rec, 'audit');
    if (!artifacts || !evidence || !lineage || !audit) return null;
    return {
      ...(rec as unknown as PdevProvenancePayload),
      artifacts,
      evidence,
      lineage,
      audit,
    };
  }, [data]);
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'provenance'),
    refresh,
  };
}

// ─── Workspace reads (IND assembly · FDA stream · Contradictions) ──────────

/** Server shape from the IND assembly service. The kit surface expects a
 *  different shape — see adaptIndAssembly() below for the field map. */
interface ServerIndAssemblyModule {
  module: 'm1' | 'm2' | 'm3' | 'm4' | 'm5';
  totalDocuments: number;
  mandatoryDocuments: number;
  presentDocuments: number;
  presentMandatoryDocuments: number;
  moduleReadiness: number;
  documents: Array<{
    code: string;
    title: string;
    ectdModule: string;
    ectdSection?: string;
    mandatoryForInd: boolean;
    activityKey: string;
    activityState: string;
    isPresent: boolean;
  }>;
}

interface ServerIndAssemblyPayload {
  programId: string;
  modules: ServerIndAssemblyModule[];
  overallReadiness: number;
  blockers?: string[];
}

const MODULE_LABELS: Record<ServerIndAssemblyModule['module'], string> = {
  m1: 'Module 1',
  m2: 'Module 2',
  m3: 'Module 3',
  m4: 'Module 4',
  m5: 'Module 5',
};

const IND_READINESS_THRESHOLD = 85;

function adaptIndAssembly(
  server: ServerIndAssemblyPayload | null,
): PdevIndAssemblyPayload | null {
  // Shape-checked, not just null-checked — see adaptReadiness above. The
  // top-level `modules` check was there; `m.documents.filter` one line down
  // was not, so a module row without a document list still threw.
  const rec = asRecord(server);
  if (!rec || !Array.isArray(rec.modules)) return null;
  const modules: PdevIndAssemblyPayload['modules'] = [];
  for (const raw of rec.modules as unknown[]) {
    const m = asRecord(raw) as unknown as ServerIndAssemblyModule | null;
    if (!m) return null;
    const documents = requiredArray<ServerIndAssemblyModule['documents'][number]>(
      m as unknown as Record<string, unknown>,
      'documents',
    );
    if (!documents) return null;
    /* Per-module blockers — surface missing mandatory docs as blocker
       strings so the kit's blockers feed renders something useful. */
    const moduleBlockers = documents
      .filter((d) => d && d.mandatoryForInd && !d.isPresent)
      .map((d) => `${d.title} (${d.activityState})`);
    modules.push({
      id: m.module,
      label: MODULE_LABELS[m.module],
      readiness: m.moduleReadiness,
      mandatory: {
        present: m.presentMandatoryDocuments,
        total: m.mandatoryDocuments,
      },
      total: {
        present: m.presentDocuments,
        total: m.totalDocuments,
      },
      blockers: moduleBlockers,
    });
  }
  return {
    overallReadiness: (server as ServerIndAssemblyPayload).overallReadiness,
    threshold: IND_READINESS_THRESHOLD,
    modules,
  };
}

export function usePdevIndAssembly(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/ind-assembly`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<ServerIndAssemblyPayload>>(url);
  const payload = useMemo(
    () =>
      data === null
        ? null
        : adaptIndAssembly(payloadOf(data) as ServerIndAssemblyPayload | null),
    [data],
  );
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'ind-assembly'),
    refresh,
  };
}

/** Server payload from /fda-interactions. The service fans out
 *  q_submissions + meetings + questions + commitments + timeline +
 *  fda_communications into a unified `items[]` list, each carrying
 *  source-specific fields in `meta`. The kit surface expects
 *  PdevFdaStreamPayload with derived status/blocker/rolled fields. */
interface ServerFdaInteractionItem {
  kind: PdevFdaInteractionKind;
  sourceId: string | number;
  at: string;
  title: string;
  summary?: string;
  meta: Record<string, unknown>;
}
interface ServerFdaStreamPayload {
  programId: string;
  items: ServerFdaInteractionItem[];
  counts?: Record<string, number>;
}

function deriveStatus(meta: Record<string, unknown>): PdevFdaInteraction['status'] {
  if (meta.rolledIn === true) return 'closed';
  if (typeof meta.fdaResponse === 'string' && meta.fdaResponse.trim()) return 'responded';
  if (typeof meta.status === 'string') {
    const s = meta.status.toLowerCase();
    if (s.includes('closed') || s.includes('resolved')) return 'closed';
    if (s.includes('response') || s.includes('answered')) return 'responded';
    if (s.includes('pending') || s.includes('rollup')) return 'pending-rollup';
  }
  return 'open';
}

function adaptFdaInteractions(
  server: ServerFdaStreamPayload | null,
): PdevFdaStreamPayload | null {
  // Shape-checked, not just null-checked — see adaptReadiness above. `items`
  // was checked; `item.meta.blocker` inside the map was not, and an item
  // without `meta` throws there just as loudly.
  const rec = asRecord(server);
  if (!rec) return null;
  const items = requiredArray<ServerFdaInteractionItem>(rec, 'items');
  if (!items) return null;
  const interactions: PdevFdaStreamPayload['interactions'] = [];
  for (const raw of items) {
    const item = asRecord(raw) as unknown as ServerFdaInteractionItem | null;
    if (!item) return null;
    const meta = item.meta == null ? {} : asRecord(item.meta);
    if (!meta) return null;
    interactions.push({
      id: `${item.kind}:${item.sourceId}`,
      when: item.at,
      kind: item.kind,
      title: item.title,
      summary: item.summary ?? '',
      status: deriveStatus(meta),
      blocker: meta.blocker === true,
      rolled: meta.rolledIn === true,
      proposedKey: null,
      confidence: null,
    });
  }
  return { interactions };
}

export function usePdevFdaInteractions(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/fda-interactions`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<ServerFdaStreamPayload>>(url);
  const payload = useMemo(
    () =>
      data === null
        ? null
        : adaptFdaInteractions(payloadOf(data) as ServerFdaStreamPayload | null),
    [data],
  );
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'fda-interactions'),
    refresh,
  };
}

export function usePdevFdaProposals(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/fda-feedback/proposals`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<PdevFdaProposalsPayload>>(url);
  // FdaStream.tsx writes `proposals?.proposals.filter(…) ?? []`, which reads as
  // doubly guarded and is not: the `?.` covers the payload, the `?? []` covers
  // the whole expression, and neither covers a `proposals` member that came
  // back as something other than a list.
  const payload = useMemo(() => {
    if (data === null) return null;
    const rec = asRecord(payloadOf(data));
    const proposals = rec
      ? requiredArray<PdevFdaProposalsPayload['proposals'][number]>(rec, 'proposals')
      : null;
    return proposals ? { ...(rec as unknown as PdevFdaProposalsPayload), proposals } : null;
  }, [data]);
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'fda-proposals'),
    refresh,
  };
}

/** Server payload from /contradictions. The engine returns `findings`
 *  with structured objectA/objectB sub-objects and a `contradictionType`
 *  field; the kit surface expects `contradictions` with flat string
 *  object labels and a `type`/`when`/`desc` shape. adaptContradictions()
 *  bridges them — without it the surface reads `payload.contradictions[0]`
 *  on an undefined array and crashes. */
interface ServerContradictionFinding {
  id: string;
  title?: string;
  description?: string;
  contradictionType: string;
  severity: PdevContradiction['severity'];
  authorityState: PdevContradiction['authorityState'];
  reviewState: PdevContradiction['reviewState'];
  objectA?: { type?: string; id?: string; label?: string | null };
  objectB?: { type?: string; id?: string; label?: string | null };
  regulatorBody?: string | null;
  createdAt?: string;
}
interface ServerContradictionsPayload {
  programId: string;
  findings: ServerContradictionFinding[];
  counts?: Record<string, unknown>;
}

function objectLabel(o?: { id?: string; label?: string | null }): string {
  return o?.label ?? o?.id ?? '';
}

function adaptContradictions(
  server: ServerContradictionsPayload | null,
): PdevContradictionsPayload | null {
  // `(server.findings ?? []).map` — the `?? []` reads as a guard and only
  // covers an ABSENT findings field. A body that arrived as `{}` or as a
  // findings object rather than a list walked straight into `.map`, and the
  // Contradictions surface then indexes `payload.contradictions[0]`.
  const rec = asRecord(server);
  if (!rec) return null;
  const findings = requiredArray<ServerContradictionFinding>(rec, 'findings');
  if (!findings) return null;
  if (findings.some((f) => !asRecord(f))) return null;
  return {
    contradictions: findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      type: f.contradictionType,
      objectA: objectLabel(f.objectA),
      objectB: objectLabel(f.objectB),
      authorityState: f.authorityState,
      reviewState: f.reviewState,
      when: f.createdAt ?? '',
      desc: f.description ?? f.title ?? '',
      regulatoryBody: f.regulatorBody ?? '',
    })),
  };
}

export function usePdevContradictions(programId: string | null) {
  const url = programId
    ? `/api/pdev/programs/${encodeURIComponent(programId)}/contradictions`
    : null;
  const { data, loading, error, refresh } =
    useFetchJson<Envelope<ServerContradictionsPayload>>(url);
  const payload = useMemo(
    () =>
      data === null
        ? null
        : adaptContradictions(payloadOf(data) as ServerContradictionsPayload | null),
    [data],
  );
  return {
    payload,
    loading,
    error: error ?? shapeErrorIf(data !== null, payload, url ?? 'contradictions'),
    refresh,
  };
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
