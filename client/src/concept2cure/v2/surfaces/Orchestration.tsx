import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState, connected, liveGetOrNull, unwrapList, useLiveData } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { assessmentState } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import '../styles/project-home-v2.css';

/* ── Display-contract types (mapped from the real orchestration backends) ── */

interface OrchFinding {
  rule: string;
  type: string;
  sev: string;
  status: string;
  detail: string;
}

interface OrchReadiness {
  overallScore: number;
  blockerCount: number;
  isReady: boolean;
  evaluatedAt: string;
  findings: {
    rules: OrchFinding[];
    validation: OrchFinding[];
    ai: OrchFinding[];
  };
  /**
   * Positive evidence, taken from the assessment's OWN document inventory,
   * that each findings class below had something to be computed from.
   *
   * The two groups are a partition of one blocker list, not the output of two
   * checks that each ran, so the size of a group carries no information about
   * whether its subject was examined. These do, and neither is derived from
   * that size — deriving it would be the defect (assessmentState.ts).
   *
   * `documentsInventoried` — documents the assessment inventoried for this
   * program. `documentsValidated` — of those, how many carry a recorded
   * validation result.
   */
  documentsInventoried: number;
  documentsValidated: number;
}

interface OrchStep {
  s: string;
  st: string;
}

interface OrchRun {
  id: string;
  /** The template this run executed. Carried so "Retry"/"Replay" can start the
   *  same workflow again — without it neither button could name what to run,
   *  which is why both were `noop`. */
  templateId: string | null;
  title: string;
  status: string;
  started: string;
  by: string;
  pct: number;
  steps: OrchStep[];
  touched: string[];
  outputs: string[];
  blockers: string[];
  recs: string[];
  gate?: string;
}

interface OrchApprover {
  who: string;
  role: string;
  decision: string;
  when?: string;
}

interface OrchCheckpoint {
  id: string;
  label: string;
  gateType: string;
  run: string | null;
  required: string;
  approvers: OrchApprover[];
  /** Persisted gate status from the store (proposed / awaiting_review /
   *  approved / executed / failed / skipped). Optional for render-safety. */
  status?: string;
}

/* ── Canonical display config (status / gate / severity → tone / label) ── */

const ORCH_TONE: Record<string, string> = {
  running: 'ai', awaiting_approval: 'warn', paused: 'warn', pending: 'idle',
  completed: 'ok', failed: 'err', cancelled: 'idle', blocked: 'err', approved: 'ok',
};

const ORCH_SLABEL: Record<string, string> = {
  running: 'Running', awaiting_approval: 'Awaiting approval', paused: 'Paused',
  pending: 'Pending', completed: 'Completed', failed: 'Failed',
  cancelled: 'Cancelled', blocked: 'Blocked', approved: 'Approved',
};

const GATE_LABEL: Record<string, string> = {
  manual: 'Manual', role_based: 'Role-based', quorum: 'Quorum', auto_on_pass: 'Auto on pass',
};

const SEV_TONE: Record<string, string> = {
  blocker: 'err', warning: 'warn', advisory: 'idle',
};

/* ── Live adoption — fixture-free (real → honest empty → honest error) ──────
 *
 * Every DATA slice on this surface is re-anchored to a REAL orchestration
 * backend; there is no fixture fallback and no "Sample data" pill. Each panel
 * renders real persisted/computed data, an honest empty state, or an honest
 * error state.
 *
 * Program — GET /api/report-os/portfolio/org (DB-backed OrgPortfolioSummary)
 * yields attentionRanked[0].projectId, the integer projects.id the other
 * endpoints operate on. No program identified ⇒ pid stays null and every panel
 * shows its honest empty state.
 *
 * Readiness — GET /api/orchestration/projects/:pid/readiness returns the
 * computed ReadinessAssessment (shared/types/orchestration.ts, produced by
 * server/services/orchestration/readiness-engine.ts): { overallScore, status,
 * blockers[{ severity critical|major|minor, category, message,
 * suggestedResolution }], assessedAt, … }. Honest field mapping:
 *   overallScore → overallScore        (same 0-100 readiness semantic)
 *   isReady      → status === 'ready'  (deriveStatus: 90+ score, no criticals)
 *   blockerCount → count of severity==='critical' — the exact class that
 *                  blocks readiness server-side (majors/minors do not), shown
 *                  in the rows below as warning/advisory so nothing is hidden
 *   evaluatedAt  → assessedAt (formatted for display)
 *   findings.rules      → blockers with category !== 'validation_failure'
 *   findings.validation → blockers with category === 'validation_failure'
 *   findings.ai         → [] — BACKEND GAP: the readiness engine computes NO
 *                         ai-inferred class, so this group is rendered as an
 *                         honest "not yet available" panel, never a fixture.
 *
 * Runs — GET /api/orchestration/project/:pid returns { workflows:
 * WorkflowExecution[] } from the in-process execution engine (rows exist once
 * workflows have been executed via POST /api/orchestration/execute); empty ⇒
 * honest "no runs yet" empty state.
 *
 * Checkpoints — GET /api/orchestration/checkpoints reads the persisted
 * approval_checkpoints × workflow_runs store (written by real approval chains,
 * e.g. the PDEV workflow bridge); empty ⇒ honest "no gates yet" empty state.
 */

function fmtWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface LiveBlocker {
  severity?: string;
  category?: string;
  message?: string;
  targetTitle?: string;
  suggestedResolution?: string;
}

export function mapReadiness(payload: unknown): OrchReadiness | null {
  const d = payload as {
    overallScore?: unknown; status?: unknown; blockers?: unknown; assessedAt?: unknown;
  } | null;
  if (
    !d || typeof d.overallScore !== 'number' || typeof d.status !== 'string' ||
    !Array.isArray(d.blockers) || typeof d.assessedAt !== 'string'
  ) return null;
  const blockers = d.blockers as LiveBlocker[];
  /* `documentInventory` is part of every ReadinessAssessment the engine
     returns, and it is what tells "this class was evaluated and produced
     nothing" apart from "there was nothing for it to evaluate". Read
     defensively: it is not one of the four fields this mapper fails closed on,
     so a payload without it yields zero evidence — which makes the view
     decline to claim clearance, the correct outcome rather than a limitation. */
  const inventory = Array.isArray((d as { documentInventory?: unknown }).documentInventory)
    ? ((d as { documentInventory?: unknown }).documentInventory as Array<{ isValidated?: unknown }>)
    : [];
  const toFinding = (b: LiveBlocker): OrchFinding => ({
    rule: String(b.message ?? ''),
    type: String(b.category ?? 'finding'),
    sev: b.severity === 'critical' ? 'blocker' : b.severity === 'major' ? 'warning' : 'advisory',
    status: b.severity === 'critical' ? 'fail' : 'warn',
    detail: String(b.suggestedResolution ?? b.targetTitle ?? ''),
  });
  return {
    overallScore: d.overallScore,
    blockerCount: blockers.filter((b) => b.severity === 'critical').length,
    isReady: d.status === 'ready',
    evaluatedAt: fmtWhen(d.assessedAt),
    findings: {
      rules: blockers.filter((b) => b.category !== 'validation_failure').map(toFinding),
      validation: blockers.filter((b) => b.category === 'validation_failure').map(toFinding),
      // BACKEND GAP: the readiness engine computes no ai-inferred class, so this
      // is honestly empty — the view renders a "not yet available" panel here,
      // never a fabricated finding.
      ai: [],
    },
    documentsInventoried: inventory.length,
    documentsValidated: inventory.filter((x) => x != null && x.isValidated === true).length,
  };
}

export function mapRuns(payload: unknown, tplNames: Record<string, string>): OrchRun[] | null {
  const w = (payload as { workflows?: unknown } | null)?.workflows;
  if (!Array.isArray(w) || w.length === 0) return null;
  const ok = w.every((x) => {
    const e = x as { executionId?: unknown; status?: unknown; steps?: unknown } | null;
    return e && typeof e.executionId === 'string' && typeof e.status === 'string' && Array.isArray(e.steps);
  });
  if (!ok) return null;
  type LiveExec = {
    executionId: string; templateId?: string; status: string; startedAt?: string;
    progressPercent?: number; requestedBy?: { userName?: string };
    steps: Array<{ stepId?: string; name?: string; status?: string }>;
    result?: {
      blockers?: Array<{ message?: string }>;
      recommendations?: Array<{ suggestedAction?: string; reason?: string }>;
      createdObjects?: Array<{ type?: string; id?: string | number; title?: string }>;
      updatedObjects?: Array<{ type?: string; id?: string | number; title?: string }>;
    };
  };
  const objLabel = (o: { type?: string; id?: string | number; title?: string }) =>
    String(o.title || [o.type, o.id].filter(Boolean).join(' ') || 'object');
  return [...(w as LiveExec[])]
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')))
    .map((x): OrchRun => ({
      id: x.executionId,
      templateId: typeof x.templateId === 'string' && x.templateId ? x.templateId : null,
      title: tplNames[String(x.templateId)] || String(x.templateId || 'workflow').replace(/_/g, ' '),
      status: x.status,
      started: fmtWhen(x.startedAt),
      by: String(x.requestedBy?.userName ?? '—'),
      pct: typeof x.progressPercent === 'number' ? x.progressPercent : 0,
      steps: x.steps.map((s) => ({
        s: String(s.name ?? s.stepId ?? 'step'),
        st: s.status === 'completed' ? 'done' : String(s.status ?? 'pending'),
      })),
      touched: (x.result?.updatedObjects ?? []).map(objLabel),
      outputs: (x.result?.createdObjects ?? []).map(objLabel),
      blockers: (x.result?.blockers ?? []).map((b) => String(b.message ?? '')),
      recs: (x.result?.recommendations ?? []).map((c) => String(c.suggestedAction || c.reason || '')),
    }));
}

export function mapCps(payload: unknown): OrchCheckpoint[] | null {
  const list = unwrapList(payload);
  if (!Array.isArray(list) || list.length === 0) return null;
  const ok = list.every((x) => {
    const c = x as { id?: unknown; stepName?: unknown; gateType?: unknown; status?: unknown } | null;
    return c && typeof c.id === 'string' && typeof c.stepName === 'string' &&
      typeof c.gateType === 'string' && typeof c.status === 'string';
  });
  if (!ok) return null;
  type LiveCp = {
    id: string; stepName: string; gateType: string; status: string;
    runName?: string | null; requiredApproverRoles?: unknown; requiredApproverCount?: unknown;
    approvals?: Array<{ approverId?: string; approverName?: string; approverRole?: string; decision?: string; decidedAt?: string }> | null;
  };
  return (list as LiveCp[]).map((c): OrchCheckpoint => {
    const roles = Array.isArray(c.requiredApproverRoles) ? c.requiredApproverRoles.map(String) : [];
    const count = typeof c.requiredApproverCount === 'number' ? c.requiredApproverCount : 1;
    return {
      id: c.id,
      label: c.stepName,
      gateType: c.gateType,
      run: c.runName ? String(c.runName) : null,
      required: roles.length
        ? `${count} × ${roles.join(' / ')}`
        : `${count} approver${count === 1 ? '' : 's'}`,
      status: c.status,
      approvers: (Array.isArray(c.approvals) ? c.approvals : []).map((a): OrchApprover => ({
        who: String(a.approverName || a.approverId || '—'),
        role: String(a.approverRole || '—'),
        decision: String(a.decision || 'pending'),
        when: a.decidedAt ? fmtWhen(a.decidedAt) : undefined,
      })),
    };
  });
}

/** Discover the org's lead program the same way AnaCommand.tsx does —
 *  GET /api/report-os/portfolio/org → attentionRanked[0].projectId is the
 *  integer projects.id the orchestration endpoints operate on. Fails closed
 *  to null (pid stays null and every panel shows its honest empty state). */
function useOrchProgram(): { pid: number; label: string } | null {
  const [prog, setProg] = useState<{ pid: number; label: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!connected()) return undefined;
    liveGetOrNull<any>('/api/report-os/portfolio/org').then((res) => {
      if (cancelled || res.error || !res.data) return;
      const data = res.data as any;
      const rows = (data.attentionRanked || (data.data && data.data.attentionRanked)) || [];
      const first = Array.isArray(rows) ? rows[0] : null;
      if (first && typeof first.projectId === 'number') {
        setProg({
          pid: first.projectId,
          label: String(first.code || first.name || 'Project ' + first.projectId),
        });
      }
    });
    return () => { cancelled = true; };
  }, []);
  return prog;
}

/* ── Helpers ── */

/** A run control. `why` is the reason it cannot act: a control that carries one
 *  is rendered disabled AND visually disabled (`.orch-ctrl:disabled`), and says
 *  why on hover, rather than looking live and doing nothing on click.
 *  `busyLabel` is the copy shown while its own write is in flight — every
 *  control used to share the single string "Cancelling…", so pressing Retry
 *  told the user their run was being cancelled while a new one was starting. */
interface RunCtrl {
  label: string;
  icon: string;
  onClick: () => void;
  primary: boolean;
  busy?: boolean;
  busyLabel?: string;
  why?: string;
}

/* ════ Orchestration -- workflow runs & readiness ════ */

export function Orchestration({ onAsk, onNav }: SurfaceViewProps) {
  const [view, setView] = useState('runs');
  const [runs, setRuns] = useState<OrchRun[]>([]);
  const [cps, setCps] = useState<OrchCheckpoint[]>([]);
  const [selId, setSel] = useState<string | null>(null);

  /* ── Live adoption — every panel fixture-free (real → empty → error) ── */
  const prog = useOrchProgram();
  const pid = prog ? prog.pid : null;
  const [newRunOpen, setNewRunOpen] = useState(false);
  /** Bumped by "Re-evaluate" — the readiness read recomputes on every call. */
  const [rdEpoch, setRdEpoch] = useState(0);
  /** Bumped after a run is created, so the board is re-read from the engine. */
  const [runsEpoch, setRunsEpoch] = useState(0);
  const progLabel = prog ? prog.label : null;

  // Template names give live runs their registered display titles (real
  // registry read, used only to title the runs below).
  const tplState = useLiveData<unknown>(pid == null ? null : '/api/orchestration/templates', [pid]);
  const tplNames = useMemo(() => {
    const t = (tplState.data as { templates?: Array<{ templateId?: string; name?: string }> } | null)?.templates;
    const m: Record<string, string> = {};
    if (Array.isArray(t)) for (const x of t) if (x?.templateId && x?.name) m[x.templateId] = x.name;
    return m;
  }, [tplState.data]);
  /* `loading` is false for one render after `pid` arrives — useLiveData set it
     false while the path was null, and only the effect turns it back on. In
     that window `templates` is empty for the same reason a 500 leaves it empty,
     and the CTA claimed "No workflow templates are registered in this
     deployment": a fact about the deployment, asserted from a read that had not
     happened. Settled means the payload actually came back. */
  const tplSettled = Boolean(tplState.data) && !tplState.loading && !tplState.error;
  /** The registered templates a new run can be started from, in registry order. */
  const templates = useMemo(() => {
    const t = (tplState.data as { templates?: Array<{ templateId?: string; name?: string; description?: string }> } | null)?.templates;
    return Array.isArray(t)
      ? t.filter((x): x is { templateId: string; name: string; description?: string } =>
          typeof x?.templateId === 'string' && typeof x?.name === 'string')
      : [];
  }, [tplState.data]);

  // Readiness — the computed ReadinessAssessment (real object / honest empty /
  // honest error). Null while loading, on error, when no program is identified,
  // or when the payload shape is rejected by mapReadiness.
  const rdState = useLiveData<unknown>(
    pid == null ? null : `/api/orchestration/projects/${pid}/readiness`,
    [pid, rdEpoch],
  );
  const r = useMemo(
    () => (!rdState.loading && !rdState.error ? mapReadiness(rdState.data) : null),
    [rdState.loading, rdState.error, rdState.data],
  );
  /* ── `!r` alone used to select the "No readiness evaluation yet" panel ──────
     `mapReadiness` returns null for two unrelated facts. It returns null when
     there is no assessment to map (no program in scope, a 204, an unwrapped
     `data: null`), and it returns null when a body DID arrive and failed the
     four type checks at the top of the mapper — a changed envelope, a proxy's
     page, a truncated response. The render below had one branch for both, so
     the second was reported as the first: on a submission-readiness surface a
     rejected payload told a regulatory director that nothing had been assessed,
     which is a positive claim about the program that no read established.
     assessmentState.ts states the rule outright — a failed read is never
     rendered as an empty result — so the mapper's refusal is `unreadable`, and
     only a genuine absence stays `not-assessed`. */
  const rdShapeRejected =
    !rdState.loading && !rdState.error && rdState.data != null && r == null;
  const rdRead = assessmentState({
    loading: rdState.loading,
    // The two ways the evaluation fails to arrive: the read itself failed, or
    // it succeeded and returned something that is not an evaluation.
    unreadable: Boolean(rdState.error) || rdShapeRejected,
    scopeExists: pid != null,
    findingCount: 0,
    // Positive evidence, never inferred from emptiness: a mapped assessment.
    assessmentRan: r != null,
  });

  // Runs — the project's real workflow executions. Held in local state so the
  // run controls can update optimistically (FLAGGED mock actions, see below);
  // seeded from the mapped live rows and re-seeded only when their identity
  // changes, so the seed effect can't loop on useLiveData's fresh null/[].
  const runsState = useLiveData<unknown>(
    pid == null ? null : `/api/orchestration/project/${pid}`,
    [pid, runsEpoch],
  );
  const runsMapped = useMemo(
    () => (!runsState.loading && !runsState.error ? mapRuns(runsState.data, tplNames) : null),
    [runsState.loading, runsState.error, runsState.data, tplNames],
  );
  const runsSeedRef = useRef<OrchRun[] | null>(null);
  useEffect(() => {
    if (runsMapped && runsMapped !== runsSeedRef.current) {
      runsSeedRef.current = runsMapped;
      setRuns(runsMapped);
      setSel((prev) => (prev && runsMapped.some((m) => m.id === prev) ? prev : runsMapped[0].id));
    }
  }, [runsMapped]);

  // Approval gates — persisted approval_checkpoints. Bumped after a decision is
  // recorded so the gate is RE-READ from the server rather than patched locally:
  // quorum and status are the server's to decide.
  const [cpsReloadKey, setCpsReloadKey] = useState(0);
  const cpsState = useLiveData<unknown>(
    connected() ? '/api/orchestration/checkpoints' : null,
    [cpsReloadKey],
  );
  const cpsMapped = useMemo(
    () => (!cpsState.loading && !cpsState.error ? mapCps(cpsState.data) : null),
    [cpsState.loading, cpsState.error, cpsState.data],
  );
  const cpsSeedRef = useRef<OrchCheckpoint[] | null>(null);
  useEffect(() => {
    if (cpsMapped && cpsMapped !== cpsSeedRef.current) {
      cpsSeedRef.current = cpsMapped;
      setCps(cpsMapped);
    }
  }, [cpsMapped]);

  const sel = runs.find((x) => x.id === selId) || runs[0];

  const [runErr, setRunErr] = useState('');
  const [busyRun, setBusyRun] = useState('');

  const setRunStatus = (id: string, st: string) =>
    setRuns((rs) => rs.map((x) => (x.id === id ? { ...x, status: st } : x)));

  /**
   * Cancel — a REAL, awaited write. POST /api/orchestration/cancel/:id
   * (server/routes/orchestration.ts:187, mounted at register-inline-routes.ts:1067)
   * cancels the workflow in the execution engine and returns { success: true },
   * or 404 when the run is not cancellable.
   *
   * This used to be `setRunStatus(id, 'cancelled')` — a local relabel while the
   * run carried on executing server-side. Showing a regulated workflow as
   * "cancelled" when it is still running is worse than showing it as running,
   * so the local state only changes after the server confirms.
   */
  const cancelRun = async (id: string) => {
    if (busyRun) return;
    setBusyRun(id);
    setRunErr('');
    try {
      const res = await apiRequest('POST', `/api/orchestration/cancel/${encodeURIComponent(id)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // This read `json.error` directly, so an envelope shaped
        // { error: 'RUN_NOT_CANCELLABLE', message: '<a real sentence>' } put the
        // enum token into the sentence. serverMessage takes the sentence and
        // returns null for codes and for infrastructure text, in which case the
        // sentence stands on its own.
        const detail = serverMessage(json);
        setRunErr(
          res.status === 404
            ? `Run ${id} is no longer cancellable — it may have already finished.`
            : `Couldn’t cancel run ${id}${detail ? ` — ${detail}` : ''}. Nothing changed.`,
        );
        return;
      }
      setRunStatus(id, 'cancelled');
    } catch (e) {
      // Only ApiRequestError carries a message that has already been reduced to
      // safe copy. Any other throw here is the browser's own ("Failed to fetch",
      // "Load failed"), which was previously rendered verbatim.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setRunErr(
        known && (e as Error).message
          ? (e as Error).message
          : `Couldn’t reach the orchestration service. Run ${id} was not cancelled.`,
      );
    } finally {
      setBusyRun('');
    }
  };

  /**
   * Start a workflow run — POST /api/orchestration/execute.
   *
   * This is what "New run", "Retry" and "Replay" all are. The header CTA was
   * hardcoded `disabled` with no onClick at all, on the surface whose entire
   * purpose is workflow runs; Retry and Replay were `noop` behind a disabled
   * flag because the display row did not carry the templateId they would need.
   *
   * Retry and Replay are stated as what they ARE: a NEW run of the same
   * template against the same project. The engine keeps no resumable state for
   * a finished run, so calling either of them "resuming" would be a claim about
   * the record that is not true — the new run gets its own id and its own
   * audit chain, and the failed or completed one stays exactly as it is.
   */
  const startRun = async (templateId: string, label: string) => {
    if (busyRun || pid == null) return;
    setBusyRun('new:' + templateId);
    setRunErr('');
    try {
      const res = await apiRequest('POST', '/api/orchestration/execute', {
        templateId,
        projectId: pid,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = serverMessage(json);
        setRunErr(`Couldn’t start ${label}${detail ? ` — ${detail}` : ` (HTTP ${res.status})`}. No run was created.`);
        return;
      }
      setNewRunOpen(false);
      // Re-read rather than appending a client-built row: the run that appears
      // is the one the engine actually created, with its real id and status.
      setRunsEpoch((n) => n + 1);
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setRunErr(
        known && (e as Error).message
          ? (e as Error).message
          : `Couldn’t reach the orchestration service. ${label} was not started.`,
      );
    } finally {
      setBusyRun('');
    }
  };

  /* The run controls used to call setRunStatus, relabelling a server-side run
     locally: "Pause" left it executing, "Resume" un-paused something never
     paused, and "Replay" silently re-labelled a completed, audited run as
     running.
     - `decide` is WIRED to POST /api/orchestration/checkpoints/:id/decision.
       It used to write the decision into local state with `when: 'just now'`, a
       FABRICATED timestamp, and the row then rendered "✓ Approved" while the
       checkpoint store was read-only — a completed, timestamped approval that
       existed nowhere. That was the most dangerous affordance on this surface,
       because the gate is what stands between a proposal and a protected action.
       The server now owns the decision: tenant re-checked through the owning
       workflow_run, required_approver_roles enforced, quorum counted, a second
       decision from the same approver refused, decidedAt taken from the database
       clock, and an audit_events row written in the same transaction. It is NOT
       a §11.50 signature and the on-screen copy says so.
     - "New run", "Retry" and "Replay" are WIRED, to POST
       /api/orchestration/execute. All three mean the one thing the engine can
       actually do: run a template against a project.
     - Pause and Resume genuinely have no path. executeWorkflow() runs a
       template's steps through one loop inside a single awaited call and keeps
       no resumable state — /execute does not even answer until the run has
       finished — so there is nothing for a pause to hold or a resume to pick
       up, and /api/orchestration exposes no pause/resume route. Both controls
       stay VISIBLE (the run state they belong to is real, and hiding them would
       hide that no pause exists), disabled, carrying that reason on hover, and
       — the part that was missing — visually disabled: see
       `.orch-ctrl:disabled` / `.orch-ctrl.pri:disabled` in app-v2.css, without
       which a permanently-dead control was pixel-identical to a live one, and
       "Resume" rendered as a full accent-filled primary CTA. */
  const NO_PAUSE = 'The workflow engine has no pause: a run executes its steps in one pass and keeps no resumable state. Cancel it and start a new run instead.';
  const NO_TEMPLATE = 'This run does not record which template it executed, so it cannot be run again from here.';

  /**
   * Record this user's decision on a gate — POST /api/orchestration/checkpoints/:id/decision.
   *
   * `c.id` IS approval_checkpoints.id: the list this surface renders comes from
   * GET /api/orchestration/checkpoints, which selects that column directly.
   *
   * The server owns every part of this that matters — it re-checks the tenant
   * through the owning workflow_run, enforces required_approver_roles, counts
   * the quorum, refuses a second decision from the same approver, and stamps
   * decidedAt from the database clock. Nothing here is optimistic: the gate is
   * re-read from the server after a successful write, so the decision the user
   * sees is the decision that was stored.
   *
   * NOT a 21 CFR §11.50 electronic signature, and the copy below says so.
   */
  const [gateBusy, setGateBusy] = useState<string | null>(null);
  const [gateErr, setGateErr] = useState<Record<string, string>>({});
  const [rejectingGate, setRejectingGate] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const decide = async (checkpointId: string, decision: 'approved' | 'rejected', comment?: string) => {
    if (gateBusy) return;
    setGateBusy(checkpointId);
    setGateErr((e) => ({ ...e, [checkpointId]: '' }));
    try {
      const res = await apiRequest(
        'POST',
        '/api/orchestration/checkpoints/' + encodeURIComponent(checkpointId) + '/decision',
        { decision, ...(comment ? { comment } : {}) },
      );
      const body = await res.json().catch(() => null);
      const payload = body as { data?: { statusChanged?: boolean }; error?: string } | null;
      if (!res.ok || !payload?.data) {
        // `payload.error` was read first, so a refusal shaped
        // { error: 'SEPARATION_OF_DUTIES', message: 'You may not sign your own
        // work.' } showed the enum instead of the reason. serverMessage prefers
        // the sentence; the domain fallback below is kept because it says more
        // than a generic one would.
        setGateErr((e) => ({
          ...e,
          [checkpointId]:
            serverMessage(body) ?? 'Could not record the decision (HTTP ' + res.status + ').',
        }));
        return;
      }
      setRejectingGate(null);
      setRejectReason('');
      // Re-read rather than patching local state: quorum and status are the
      // server's to decide, and this surface has been wrong about them before.
      setCpsReloadKey((k) => k + 1);
      cpsSeedRef.current = null;
    } catch (err) {
      // Only ApiRequestError has been through the envelope reduction; anything
      // else is a browser-native throw whose message is "Failed to fetch".
      const known = (err as { name?: unknown })?.name === 'ApiRequestError';
      setGateErr((e) => ({
        ...e,
        [checkpointId]:
          known && (err as Error).message
            ? (err as Error).message
            : 'Could not reach the orchestration service.',
      }));
    } finally {
      setGateBusy(null);
    }
  };

  const pendingGates = cps.filter((c) => {
    // Live rows carry the persisted gate status; older rows without one infer
    // from the approver decisions.
    if (c.status) return c.status === 'awaiting_review' || c.status === 'proposed';
    const dec = c.approvers.map((a) => a.decision);
    return dec.indexOf('pending') > -1 || dec.indexOf('blocked') > -1;
  });

  /* The metrics strip speaks from the reads that feed it.
     `runs` and `cps` are local state seeded ONLY when their mapped value is
     non-null, and both mappers return null while loading or on error — so both
     stay `[]` and every metric resolved to a settled 0. On a failed
     `/api/orchestration/checkpoints` read the surface told a reviewer that zero
     human-in-the-loop Part 11 approval gates were awaiting them. Approval
     checkpoints are the gate before dispatch: a reviewer who trusts
     "Awaiting approval: 0" walks away from signatures that are actually
     pending. The readiness tile two over already did this correctly
     (`r ? r.overallScore + '%' : '—'`), so the strip disagreed with itself. */
  const runsReady = !runsState.loading && !runsState.error;
  const gatesReady = !cpsState.loading && !cpsState.error;
  const kvRuns = (n: number) => (runsReady ? String(n) : '—');
  const kvGates = (n: number) => (gatesReady ? String(n) : '—');

  /* WHAT ANA SEES HERE. Four independent reads stay independent — runs, gates,
     readiness and templates each report their own loading/error/empty, and a
     failed gates read is never published as zero pending approvals. */
  const activeRunCount = runs.filter((x) => ['running', 'paused', 'awaiting_approval'].indexOf(x.status) > -1).length;
  const pendingGateCount = pendingGates.length;
  const anaContext = useMemo(() => {
    const parts: string[] = [];
    if (pid == null) {
      parts.push('Orchestration — no lead program identified, so no runs, readiness or templates are being read.');
    } else {
      parts.push(`Orchestration for ${progLabel}, ${view} view.`);
      if (runsState.loading) parts.push('Workflow runs are still loading.');
      else if (runsState.error) parts.push('The execution engine did not respond — a failed read, not a project with no runs.');
      else if (runs.length === 0) parts.push('No workflow runs yet for this program.');
      else parts.push(`${activeRunCount} active run(s) of ${runs.length} total.`);
    }
    // The gates read is not program-scoped, so it is reported even with no program.
    if (cpsState.loading) {
      parts.push('The approval-gate store is still loading.');
    } else if (cpsState.error) {
      parts.push(
        'The approval-checkpoint store could not be read, so the Awaiting-approval count reads "—". ' +
          'This is NOT a report that zero human-in-the-loop gates are pending — a reviewer must not treat it as one.',
      );
    } else if (cps.length === 0) {
      parts.push('No human-in-the-loop approval gates exist for this organization yet.');
    } else {
      parts.push(`${pendingGateCount} of ${cps.length} approval gate(s) awaiting a human decision.`);
    }
    if (pid != null) {
      if (rdState.loading) parts.push('Readiness is being evaluated.');
      else if (rdState.error) parts.push('The readiness engine did not respond — the score is unknown, not zero.');
      else if (!r) parts.push('No readiness assessment yet — the engine has nothing to score for this program.');
      else
        parts.push(
          `Readiness ${r.overallScore}%, ${r.blockerCount} critical blocker(s), ` +
            `${r.isReady ? 'Ready' : 'Not ready'} (Ready requires 90+ and zero critical blockers), evaluated ${r.evaluatedAt}.`,
        );
      if (tplState.error) parts.push('The template registry could not be read — whether templates are registered is unknown.');
      else if (!tplSettled) parts.push('The template registry has not answered yet.');
      else parts.push(`${templates.length} workflow template(s) registered.`);
    }
    const facts: Record<string, unknown> = {
      program: progLabel,
      projectId: pid,
      openView: view,
      activeRuns: runsReady ? activeRunCount : null,
      totalRuns: runsReady ? runs.length : null,
      ...(runsState.error ? { runsUnavailable: runsState.error } : {}),
      pendingGateCount: gatesReady ? pendingGateCount : null,
      totalGates: gatesReady ? cps.length : null,
      ...(cpsState.error ? { gatesUnavailable: cpsState.error } : {}),
      readinessScore: r ? r.overallScore : null,
      blockerCount: r ? r.blockerCount : null,
      isReady: r ? r.isReady : null,
      evaluatedAt: r ? r.evaluatedAt : null,
      ...(rdState.error ? { readinessUnavailable: rdState.error } : {}),
      templatesRegistered: tplSettled ? templates.length : null,
      ...(sel
        ? {
            selectedRun: {
              id: sel.id, title: sel.title, status: sel.status, pct: sel.pct,
              blockers: sel.blockers.slice(0, 5),
            },
          }
        : {}),
    };
    return {
      summary: parts.join(' '),
      facts,
      // Pause/resume are not offered: the engine has no pause path.
      availableActions: [
        'Switch view: Runs, Approvals or Readiness; select a run to inspect its steps, outputs and blockers',
        'approving or rejecting a gate (separation-of-duties enforced), starting/retrying/cancelling runs, and re-evaluating readiness are human acts — AnA proposes them in conversation only',
      ],
    };
  }, [
    pid, progLabel, view, runsState.loading, runsState.error, runsReady, runs, activeRunCount,
    cpsState.loading, cpsState.error, gatesReady, cps, pendingGateCount,
    rdState.loading, rdState.error, r, tplState.error, tplSettled, templates, sel,
  ]);
  /* View state only. Approving or rejecting a gate is a separation-of-duties
     decision, and starting, retrying or cancelling a run is a metered spend —
     none is reachable from here. */
  useSurfaceActionHandlers('orchestration', {
    'orchestration.set-view': (params) => {
      const target = String(params.view ?? '');
      if (!['runs', 'approvals', 'readiness'].includes(target)) {
        return { ok: false, reason: `No orchestration view named "${params.view}".` };
      }
      if (view === target) return { ok: true, detail: `Already on the ${target} view` };
      setView(target);
      return { ok: true, detail: `Opened the ${target} view` };
    },
    'orchestration.select-run': (params) => {
      const raw = String(params.run ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a run to select.' };
      if (runsState.loading) {
        return { ok: false, reason: 'The workflow runs are still loading.', retry: true };
      }
      if (runsState.error) {
        return { ok: false, reason: 'The orchestration execution engine did not respond, so no runs are listed to select from.' };
      }
      const needle = raw.toLowerCase();
      const exact = runs.filter((r) => r.id.toLowerCase() === needle || r.title.toLowerCase() === needle);
      const hits = exact.length ? exact : runs.filter((r) => r.title.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No workflow run named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} runs — name one exactly.` };
      const run = hits[0];
      const switched = view !== 'runs';
      if (switched) setView('runs');
      setSel(run.id);
      return {
        ok: true,
        detail: `Selected ${run.title} (${run.status})` + (switched ? ' on the runs view' : ''),
      };
    },
  });
  useEffect(() => {
    if (!runsState.loading && !runsState.error) notifySurfaceActionReady('orchestration');
  }, [runsState.loading, runsState.error]);

  usePublishSurfaceContext('orchestration', anaContext);

  /* Cancel, Retry, Replay and "Open gate" all reach a real endpoint. The two
     that cannot — Pause and Resume — stay visible (the run state they belong to
     is real) but are disabled, visually disabled, and carry the reason on
     hover, instead of silently relabelling a run that is still executing on the
     server. */
  const noop = () => undefined;
  const ctrlsFor = (x: OrchRun): RunCtrl[] => {
    const cancel: RunCtrl = {
      label: 'Cancel', icon: 'close', primary: false,
      onClick: () => void cancelRun(x.id),
      busy: busyRun === x.id, busyLabel: 'Cancelling…',
    };
    /* Retry / Replay = a NEW run of the same template, which is what the engine
       can do and what the label is now understood to mean. Disabled only when
       the run does not record its template, with that stated. */
    const again = (label: string, primary: boolean): RunCtrl =>
      x.templateId
        ? {
            label, icon: 'rotateCw', primary,
            onClick: () => void startRun(x.templateId as string, `${label} of ${x.title}`),
            busy: busyRun === 'new:' + x.templateId, busyLabel: 'Starting…',
          }
        : { label, icon: 'rotateCw', primary, onClick: noop, why: NO_TEMPLATE };
    if (x.status === 'running') return [{ label: 'Pause', icon: 'pause', primary: false, onClick: noop, why: NO_PAUSE }, cancel];
    if (x.status === 'paused') return [{ label: 'Resume', icon: 'play', primary: true, onClick: noop, why: NO_PAUSE }, cancel];
    if (x.status === 'failed') return [again('Retry', true)];
    if (x.status === 'awaiting_approval') return [{ label: 'Open gate', icon: 'shieldCheck', primary: true, onClick: () => setView('approvals') }];
    if (x.status === 'completed') return [again('Replay', false)];
    if (x.status === 'cancelled') return [again('Retry', true)];
    return [];
  };

  const stepIc = (st: string): React.ReactElement | null =>
    st === 'done' ? I.check : st === 'failed' ? I.close : st === 'awaiting' ? I.clock : st === 'paused' ? I.pause : null;

  /* ── An empty class is not a clean class ──────────────────────────────────
     This read `list.length === 0 ? "No findings in this class." : null`, and
     the sentence was chosen BY the emptiness. The two groups below are a
     PARTITION of the one blocker list the assessment returned, not the output
     of two checks that each ran, so an empty group has two causes and this said
     the same thing about both.

     On "Validation findings — eCTD · CDISC · hyperlink integrity" that
     difference is the entire claim. The readiness engine raises a
     validation-class blocker only for a document that CARRIES a recorded
     validation result; a program in which nothing has ever been validated
     therefore produces zero of them, and the group read as a clean validation
     pass over documents no validator had ever opened.

     `assessed` is the positive evidence, from the assessment's own inventory
     rather than from the size of `list`: documents inventoried for the rules
     class, documents carrying a validation result for the validation class.
     'assessed-clear' stays reachable — a program whose documents are validated
     and raise nothing still reads "No findings in this class." */
  const findGroup = (
    label: string,
    sub: string,
    list: OrchFinding[],
    assessed: boolean,
    notAssessed: string,
  ) => {
    const state = assessmentState({
      scopeExists: true,
      findingCount: list.length,
      assessmentRan: assessed,
    });
    return (
      <div style={{ marginBottom: 18 }}>
        <div className="orch-sec-l">{label} <span style={{ color: 'var(--text-500)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{I.dot} {sub}</span></div>
        {state === 'assessed-clear' ? (
          <div className="orch-run-m" style={{ marginBottom: 6 }}>No findings in this class.</div>
        ) : null}
        {state === 'not-assessed' ? (
          <div className="orch-run-m" style={{ marginBottom: 6 }}>{notAssessed}</div>
        ) : null}
        {list.map((f, i) => (
          <div key={i} className="orch-find">
            <span className={'orch-find-dot ' + (SEV_TONE[f.sev] || 'idle')} />
            <div className="orch-find-b">
              <div className="orch-find-r">{f.rule}</div>
              <div className="orch-find-d">{f.detail}</div>
            </div>
            <div className="orch-find-meta">
              <span className="rd-chip tone-idle">{f.type.replace(/_/g, ' ')}</span>
              <span className={'rd-chip tone-' + (f.status === 'fail' ? ORCH_TONE.failed : f.status === 'warn' ? ORCH_TONE.paused : ORCH_TONE.completed)}>
                {f.status === 'fail' ? 'Fail' : f.status === 'warn' ? 'Warn' : 'Pass'}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="page-inner">
      {newRunOpen && (
        <div className="orch-newrun-bd" onClick={() => setNewRunOpen(false)}>
          <div
            className="orch-newrun"
            role="dialog"
            aria-modal="true"
            aria-label="Start a workflow run"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="orch-newrun-h">Start a workflow run</div>
            <p className="orch-newrun-sub">
              Runs against {progLabel || 'the open program'}. Every step, object touched and output
              is recorded for Part 11 traceability.
            </p>
            <div className="orch-newrun-list">
              {templates.map((t) => (
                <button
                  key={t.templateId}
                  className="orch-newrun-t"
                  disabled={Boolean(busyRun)}
                  onClick={() => void startRun(t.templateId, t.name)}
                >
                  <span className="orch-newrun-tn">{t.name}</span>
                  {t.description && <span className="orch-newrun-td">{t.description}</span>}
                  <span className="orch-newrun-go">
                    {busyRun === 'new:' + t.templateId ? 'Starting…' : I.right}
                  </span>
                </button>
              ))}
            </div>
            <div className="orch-newrun-f">
              <button className="btn ghost" onClick={() => setNewRunOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Orchestration{progLabel ? <> {I.dot} {progLabel}</> : null}</div>
          <h1 className="ph-title">Workflow runs &amp; readiness</h1>
          <div className="ph-sub">The persisted execution engine -- <code>workflowRuns</code> (versioned, pausable, replayable), human-in-the-loop <code>approvalCheckpoints</code>, and deterministic <code>readinessEvaluations</code>. Every step, object touched and output is recorded for Part-11 traceability.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk && onAsk('Run a pre-dispatch readiness evaluation for ' + (progLabel || 'this program'))}>{I.sparkles} Ask AnA</button>
          {/* ── The primary CTA of the whole surface was hardcoded disabled ──
              `disabled` with no onClick at all, on the screen whose entire
              purpose is workflow runs. Its title said starting one "needs a
              workflow template to be chosen first" — which is true, and is a
              picker, not a reason to have no button.
              POST /api/orchestration/execute and GET /api/orchestration/templates
              both existed; the surface already READ the templates, to title the
              runs. */}
          <button
            className="btn primary"
            onClick={() => setNewRunOpen(true)}
            disabled={pid == null || !tplSettled || templates.length === 0 || Boolean(busyRun)}
            title={
              pid == null
                ? 'Open a program to start a workflow run against it.'
                : tplState.error
                  // An unreachable registry is NOT an empty registry. Saying
                  // "none are registered" here would render a failed read as a
                  // settled fact about the deployment.
                  ? 'Couldn’t load the workflow templates — the orchestration service didn’t respond.'
                  : !tplSettled
                    ? 'Loading the registered workflow templates…'
                    : templates.length === 0
                      ? 'No workflow templates are registered in this deployment.'
                      : undefined
            }
          >
            {I.workflow} New run
          </button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-l">Active runs</div>
          <div className="metric-n">{kvRuns(runs.filter((x) => ['running', 'paused', 'awaiting_approval'].indexOf(x.status) > -1).length)}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-300)' }}>{runsReady ? `of ${runs.length} total` : 'not read'}</div>
        </div>
        <div className="metric" data-tone={gatesReady && pendingGates.length ? 'warn' : undefined}>
          <div className="metric-l">Awaiting approval</div>
          <div className="metric-n">{kvGates(pendingGates.length)}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-300)' }}>HITL gates</div>
        </div>
        <div className="metric" data-tone={r ? (r.isReady ? '' : 'err') : ''}>
          <div className="metric-l">Readiness score</div>
          <div className="metric-n">{r ? r.overallScore + '%' : '—'}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-300)' }}>{r ? r.blockerCount + ' blockers' : 'not evaluated'}</div>
        </div>
        <div className="metric" data-tone={r ? (r.isReady ? 'ok' : 'err') : ''}>
          <div className="metric-l">Dispatch</div>
          <div className="metric-n">{r ? (r.isReady ? 'Ready' : 'Blocked') : '—'}</div>
          <div className="dmod-chip" style={{ marginTop: 6, background: 'transparent', padding: 0, color: 'var(--text-300)' }}>readinessEvaluations</div>
        </div>
      </div>

      <div className="seg orch-views" style={{ marginBottom: 16 }}>
        {([['runs', 'Runs'], ['approvals', 'Approvals'], ['readiness', 'Readiness']] as [string, string][]).map(([k, l]) => (
          <button key={k} className={'seg-b' + (view === k ? ' on' : '')} onClick={() => setView(k)}>
            {l}
            {k === 'approvals' && pendingGates.length ? <span className="seg-badge">{pendingGates.length}</span> : null}
          </button>
        ))}
      </div>

      {view === 'runs' && (
        runsState.loading && runs.length === 0 ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading workflow runs…</div>
        ) : runsState.error && runs.length === 0 ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load workflow runs"
            hint="The orchestration execution engine didn't respond. These are the project's real workflow runs — retry, or check the service is reachable."
            retry={() => setRunsEpoch((n) => n + 1)}
            retryLabel="Retry"
            busy={runsState.loading}
          />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={I.workflow}
            title="No workflow runs yet"
            hint={pid == null
              ? 'No lead program is identified for this organization yet. Once a program is in scope, its executed workflow runs appear here.'
              : 'Runs appear here once a workflow is executed for this program (readiness review, draft-validate-route, blocker scan). Ask AnA to run a pre-dispatch readiness evaluation to create the first one.'}
          />
        ) : (
        <div className="orch-split">
          <div className="orch-runs">
            {runs.map((x) => (
              <button key={x.id} className="orch-run" data-on={x.id === selId || undefined} onClick={() => setSel(x.id)}>
                <div className="orch-run-top">
                  <span className={'rd-chip tone-' + (ORCH_TONE[x.status] || 'idle')}>{ORCH_SLABEL[x.status]}</span>
                  <span style={{ flex: 1 }} />
                  <span className="orch-run-m">{x.id}</span>
                </div>
                <div className="orch-run-t">{x.title}</div>
                <div className="orch-run-m">{x.by} {I.dot} {x.started}</div>
                <div className="orch-bar"><span style={{ width: x.pct + '%' }} /></div>
              </button>
            ))}
          </div>
          <div className="orch-detail">
            <div className="orch-detail-h">
              <div>
                <div className="orch-detail-t">{sel.title}</div>
                <div className="orch-detail-m">{sel.id} {I.dot} {ORCH_SLABEL[sel.status]} {I.dot} started {sel.started} {I.dot} by {sel.by}</div>
              </div>
              <div className="orch-ctrls">
                {ctrlsFor(sel).map((c, i) => (
                  <button
                    key={i}
                    className={'orch-ctrl' + (c.primary ? ' pri' : '')}
                    onClick={c.onClick}
                    disabled={Boolean(c.why) || Boolean(c.busy)}
                    title={c.why || undefined}
                  >
                    {I[c.icon]}{c.busy ? (c.busyLabel ?? c.label) : c.label}
                  </button>
                ))}
              </div>
              {runErr && <div className="orch-note" role="alert">{I.alertTriangle} {runErr}</div>}
            </div>
            <div className="orch-sec-l">Steps</div>
            <div className="orch-steps">
              {sel.steps.map((s, i) => (
                <div key={i} className="orch-step" data-st={s.st}>
                  <span className="orch-step-dot">{stepIc(s.st)}</span>
                  <span className="orch-step-l">{s.s}</span>
                  <span style={{ flex: 1 }} />
                  <span className="orch-run-m">{s.st}</span>
                </div>
              ))}
            </div>
            <div className="orch-sec-l">Objects touched</div>
            <div className="orch-chips">
              {sel.touched.map((t, i) => (
                <span key={i} className="orch-chip" onClick={() => onNav && onNav('document-authoring')} style={{ cursor: 'pointer' }}>{t}</span>
              ))}
            </div>
            <div className="orch-sec-l">Outputs created</div>
            <div className="orch-chips">
              {sel.outputs.length
                ? sel.outputs.map((t, i) => <span key={i} className="orch-chip">{I.fileCheck} {t}</span>)
                : <span className="orch-run-m">None yet</span>}
            </div>
            {sel.blockers.length > 0 && (
              <>
                <div className="orch-sec-l">Blockers</div>
                {sel.blockers.map((b, i) => (
                  <div key={i} className="orch-note" style={{ color: 'var(--error)' }}>{I.alertTriangle}<span>{b}</span></div>
                ))}
              </>
            )}
            {sel.recs.length > 0 && (
              <>
                <div className="orch-sec-l">Recommendations</div>
                {sel.recs.map((b, i) => (
                  <div key={i} className="orch-note">{I.sparkles}<span>{b}</span></div>
                ))}
              </>
            )}
          </div>
        </div>
        )
      )}

      {view === 'approvals' && (
        cpsState.loading && cps.length === 0 ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading approval gates…</div>
        ) : cpsState.error && cps.length === 0 ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load approval gates"
            hint="The approval-checkpoint store didn't respond. These are the organization's real human-in-the-loop approval gates — retry, or check the service is reachable."
            retry={() => setCpsReloadKey((n) => n + 1)}
            retryLabel="Retry"
            busy={cpsState.loading}
          />
        ) : cps.length === 0 ? (
          <EmptyState
            icon={I.shieldCheck}
            title="No approval gates yet"
            hint="Human-in-the-loop approval gates appear here once a workflow proposes one — for example a reviewer sign-off before a protected action. None are pending for this organization."
          />
        ) : (
        <div>
          {cps.map((c) => {
            const approved = c.approvers.filter((a) => a.decision === 'approved').length;
            const need = c.gateType === 'quorum' ? Math.ceil(c.approvers.length * 2 / 3) : c.approvers.length;
            return (
              <div key={c.id} className="orch-cp">
                <div className="orch-cp-top">
                  <span className="rd-chip tone-ai">{I.shieldCheck} {GATE_LABEL[c.gateType]}</span>
                  <span className="orch-cp-t">{c.label}</span>
                  <span className="orch-cp-req">
                    {c.required}{c.gateType === 'quorum' ? ' · ' + approved + '/' + need + ' met' : ''}{c.run ? ' · ' + c.run : ''}
                  </span>
                </div>
                {c.gateType === 'auto_on_pass' ? (
                  <div className="orch-note">{I.zap}<span>Gate fires automatically when its run reports zero validation errors.{c.run ? <> Linked run: <b>{c.run}</b>.</> : null}</span></div>
                ) : c.approvers.length === 0 ? (
                  <div className="orch-note">{I.clock}<span>No decisions recorded yet{c.status ? <> -- gate is <b>{c.status.replace(/_/g, ' ')}</b></> : null}.</span></div>
                ) : c.approvers.map((a, i) => (
                  <div key={i} className="orch-appr">
                    <span className="orch-appr-av">{a.who.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                    <div className="orch-appr-b">
                      <div className="orch-appr-n">{a.who}</div>
                      <div className="orch-appr-r">{a.role}{a.when ? ' · ' + a.when : ''}</div>
                    </div>
                    {a.decision === 'approved' ? (
                      <span className="orch-mini ok">{I.check} Approved</span>
                    ) : a.decision === 'rejected' ? (
                      <span className="orch-mini no">{I.close} Rejected</span>
                    ) : (
                      <span className="orch-mini">{String(a.decision).replace(/_/g, ' ')}</span>
                    )}
                  </div>
                ))}

                {/* The decision control belongs to the GATE, not to a row.
                    It used to render inside the approver loop, which meant a
                    gate with no decisions yet showed no way to act at all —
                    `approvers` is derived from the `approvals` array, i.e. from
                    decisions ALREADY recorded, not from who still owes one. */}
                {c.gateType !== 'auto_on_pass' && (c.status === 'proposed' || c.status === 'awaiting_review') && (
                  <div className="orch-gate-act">
                    {rejectingGate === c.id ? (
                      <>
                        <input
                          className="orch-gate-reason"
                          placeholder="Why is this gate being rejected?"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          autoFocus
                        />
                        <button
                          className="orch-mini"
                          disabled={gateBusy === c.id}
                          onClick={() => { setRejectingGate(null); setRejectReason(''); }}
                        >
                          Cancel
                        </button>
                        <button
                          className="orch-mini no"
                          disabled={!rejectReason.trim() || gateBusy === c.id}
                          onClick={() => { void decide(c.id, 'rejected', rejectReason.trim()); }}
                        >
                          {gateBusy === c.id ? 'Recording…' : 'Record rejection'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="orch-mini ok"
                          disabled={gateBusy === c.id}
                          onClick={() => { void decide(c.id, 'approved'); }}
                        >
                          {gateBusy === c.id ? 'Recording…' : 'Approve'}
                        </button>
                        <button
                          className="orch-mini no"
                          disabled={gateBusy === c.id}
                          onClick={() => { setRejectingGate(c.id); setRejectReason(''); }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                )}
                {gateErr[c.id] && (
                  <div className="orch-note err" role="alert">
                    {I.alertTriangle}<span>Not recorded — {gateErr[c.id]}</span>
                  </div>
                )}
                {c.gateType !== 'auto_on_pass' && (c.status === 'proposed' || c.status === 'awaiting_review') && (
                  <div className="orch-note">
                    {I.shieldCheck}
                    <span>
                      Your decision is recorded against this gate, attributed to you and written to
                      the audit trail. It is <b>not</b> a 21 CFR §11.50 electronic signature.
                      {c.gateType === 'quorum' ? ' The gate closes only once the required number of approvals is reached.' : ''}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )
      )}

      {view === 'readiness' && (
        rdRead === 'loading' ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading readiness…</div>
        ) : rdState.error ? (
          /* UI standards §8: a failure always offers a way out. Each of these
             three hints ENDED with "sign in and retry" while offering nothing to
             retry with, so the instruction named an action the screen did not
             provide. Every reload mechanism already existed and was simply never
             wired to the failure that needs it. */
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the readiness evaluation"
            hint="The readiness engine didn't respond. The score is computed on demand from this program's governed objects — retry, or check the service is reachable."
            retry={() => setRdEpoch((n) => n + 1)}
            retryLabel="Retry"
            busy={rdState.loading}
          />
        ) : rdRead === 'unreadable' ? (
          /* The branch that did not exist. Copy carries no parse detail and no
             payload text — same guardrail as everywhere else on this surface —
             and it deliberately does NOT say the program has not been
             evaluated, because this state is the one in which that is unknown. */
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't read the readiness evaluation"
            hint="The readiness engine answered, but its response could not be read as an evaluation. No readiness result is being reported for this program either way — re-evaluate, and tell your administrator if it repeats."
            retry={() => setRdEpoch((n) => n + 1)}
            retryLabel="Re-evaluate"
            busy={rdState.loading}
          />
        ) : !r ? (
          <EmptyState
            icon={I.fileText}
            title="No readiness evaluation yet"
            hint={pid == null
              ? 'No lead program is identified for this organization yet. Once a program is in scope, its readiness is computed here.'
              : 'The readiness engine has nothing to score for this program yet. Add governed documents / CMC objects, then re-evaluate.'}
          />
        ) : (
        <div>
          <div className="orch-score">
            <div>
              <div className="orch-score-n" style={{ color: r.isReady ? 'var(--success)' : 'var(--error)' }}>{r.overallScore}%</div>
              <div className="orch-run-m">evaluated {r.evaluatedAt}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span className={'rd-chip tone-' + (r.isReady ? 'ok' : 'err')}>{r.isReady ? 'Ready to dispatch' : 'Not ready'}</span>
                <span className="rd-chip tone-err">{r.blockerCount} blockers</span>
              </div>
              <div className="ph-sub" style={{ margin: 0 }}>
                Deterministic gate computed by the readiness engine: ready requires a 90+ score with zero critical blockers.
              </div>
            </div>
            {/* ── "Re-evaluate" asked the assistant to re-evaluate ──────────
                It sat on the readiness score, with a refresh icon, and typed
                'Re-run the readiness evaluation…' into the chat — nothing was
                recomputed and the score on screen never moved.

                GET /api/orchestration/projects/:id/readiness is not a cached
                row: it assembles the cross-object payload and runs
                computeReadinessAssessment on every call. So re-reading it IS
                the re-evaluation, and the score that comes back is the engine's
                current answer. */}
            <button
              className="btn ghost"
              onClick={() => setRdEpoch((n) => n + 1)}
              disabled={rdState.loading}
            >
              {I.rotateCw} {rdState.loading ? 'Evaluating…' : 'Re-evaluate'}
            </button>
          </div>
          {findGroup(
            'Rules-based findings',
            'readinessRules · required_item / quality_gate',
            r.findings.rules,
            r.documentsInventoried > 0,
            'This evaluation inventoried no documents for the program, so the readiness rules had nothing to examine. That is not a clean rules pass.',
          )}
          {findGroup(
            'Validation findings',
            'eCTD · CDISC · hyperlink integrity',
            r.findings.validation,
            r.documentsValidated > 0,
            'No document in this program carries a recorded validation result, so no validation finding could be produced. That is not a clean validation pass.',
          )}
          <div style={{ marginBottom: 18 }}>
            <div className="orch-sec-l">AI-inferred findings <span style={{ color: 'var(--text-500)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{I.dot} cross-reference · claim-evidence</span></div>
            <div className="orch-run-m" style={{ marginBottom: 6 }}>Not yet available — the readiness engine does not compute an AI-inferred findings class. Cross-document consistency and claim-evidence findings will appear here once that capability ships.</div>
          </div>
        </div>
        )
      )}
    </div>
  );
}
