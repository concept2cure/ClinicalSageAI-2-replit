/**
 * Submission Orchestrator — the run launcher, step tree, and audit trail.
 *
 * Registry id: `submission-orchestrator`.
 *
 * Until this surface existed the orchestrator was invisible: `grep -r
 * "/api/submission-orchestrator" client/` returned nothing, so an eleven-step
 * pipeline that composes M2/M3, tabulates a CSR, assembles and e-signs an eCTD
 * package could only be driven with curl. Path-to-GA §C.1.
 *
 * Wired to server/routes/submission-orchestrator.ts (org-scoped from the JWT):
 *   • POST /runs                     — start a run (project mode or explicit inputs)
 *   • GET  /runs/:runId              — run state + per-step status
 *   • GET  /runs/:runId/audit        — append-only step event log
 *   • POST /runs/:runId/regenerate   — rebuild stale steps
 * and to the signed-package seam:
 *   • GET  /api/ectd/export/by-run/:runId/signed — the record the signature binds
 *
 * ── HONESTY (CLAUDE.md: fail closed, never fabricate) ────────────────────────
 *
 * Three distinctions this surface refuses to collapse, because collapsing any
 * of them makes a regulated claim nobody verified:
 *
 *  1. A FAILED READ IS NOT AN EMPTY RESULT. Every panel carries its own error
 *     flag. "The audit trail could not be read" never renders as "no events" —
 *     an empty audit trail is a Part 11 assertion about a submission's history.
 *
 *  2. A SKIPPED STEP IS NOT A COMPLETED STEP. The orchestrator emits `skipped`
 *     when inputs are absent or a gate does not apply. Rendering that as done
 *     would report a package as fully built when parts of it were never
 *     attempted, so skipped is styled and labelled distinctly and the header
 *     count says "N of M ran" rather than "complete".
 *
 *  3. AN UNSIGNED PACKAGE IS NOT A SIGNED ONE. The signature panel reports the
 *     verified record, and reports a refusal (digest drift, seal failure) as a
 *     failure — never as "not signed yet".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

// ── Types (mirror the route's response shapes) ──────────────────────────────

type StepStatus =
  | 'pending' | 'running' | 'awaiting-async' | 'awaiting-signature'
  | 'complete' | 'failed' | 'stale' | 'skipped';

interface StepRecord {
  key: string;
  status: StepStatus;
  durationMs?: number;
  outputRef?: string;
  error?: string;
  dependsOn?: string[];
}

interface OrchestratorRun {
  runId: string;
  submissionId: string;
  applicationNumber: string;
  region: string;
  submissionType: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'complete' | 'failed' | 'partial';
  steps: StepRecord[];
  workflowVersion?: string | null;
}

interface AuditEvent {
  stepKey: string;
  eventType: string;
  status: string;
  inputHash: string;
  outputHash: string | null;
  outputRef: string | null;
  error: string | null;
  occurredAt: string;
}

interface SignedPackage {
  runId: string;
  applicationNumber: string;
  sequenceNumber: string;
  totalSizeBytes: number;
  gatewayReady: boolean;
  hardenedScore: number;
  signature: { payloadDigest: string; signatureId: number; sealVerdict: string };
  leaves: Array<{ filePath: string; sectionCode: string; checksum: string; fileSize: number }>;
}

/** A refusal from the signed-package seam. Distinct from "not loaded". */
interface SignatureRefusal { error: string; message: string }

// ── Fetch helper ────────────────────────────────────────────────────────────

/**
 * `status: 0` means the request never landed — the caller can tell a transport
 * failure from a server "no", which is what keeps "couldn't read" separate from
 * "read, and it's empty".
 */
async function read<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed ?? null) as T | null };
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    const payload = (err as { payload?: unknown } | null)?.payload;
    return {
      ok: false,
      status: typeof status === 'number' ? status : 0,
      data: (payload ?? null) as T | null,
    };
  }
}

// ── Step presentation ───────────────────────────────────────────────────────

/** Human labels. The raw keys are dotted machine ids and read badly in a tree. */
const STEP_LABELS: Record<string, string> = {
  'm3.compose': 'Module 3 — compose (S / P)',
  'm3.refine': 'Module 3 — AI refinement',
  'm3.appendices': 'Module 3 — appendices (3.2.A)',
  'm3.regional': 'Module 3 — regional (3.2.R)',
  'csr.tabulate': 'CSR — §10–§12 tabulation',
  'csr.draft-narrative': 'CSR — narrative drafting',
  'm2.3.qos': 'M2.3 — Quality Overall Summary',
  'm2.4.nonclinical': 'M2.4 — Nonclinical Overview',
  'm2.5.clinical': 'M2.5 — Clinical Overview',
  'm2.7.clinical': 'M2.7 — Clinical Summary',
  'm1.admin': 'M1 — administrative',
  'package.assemble': 'Package — assemble',
  'package.validate': 'Package — validate (hardened)',
  'package.sign': 'Package — e-signature (21 CFR 11)',
};

function stepLabel(key: string): string {
  return STEP_LABELS[key] ?? key;
}

/**
 * Tone per status. `skipped` deliberately does NOT share a tone with
 * `complete`: a step that never ran is not a step that succeeded, and the two
 * reading alike is how a partially-built package looks finished.
 */
function statusTone(s: StepStatus): 'ok' | 'warn' | 'err' | 'dim' | 'run' {
  switch (s) {
    case 'complete': return 'ok';
    case 'failed': return 'err';
    case 'stale': return 'warn';
    case 'awaiting-signature':
    case 'awaiting-async': return 'warn';
    case 'running': return 'run';
    case 'skipped':
    case 'pending':
    default: return 'dim';
  }
}

function statusLabel(s: StepStatus): string {
  switch (s) {
    case 'awaiting-signature': return 'awaiting signature';
    case 'awaiting-async': return 'awaiting async';
    default: return s;
  }
}

function statusIcon(s: StepStatus): React.ReactNode {
  switch (s) {
    case 'complete': return I.checkCircle;
    case 'failed': return I.alertTriangle;
    case 'stale': return I.rotateCcw;
    case 'awaiting-signature': return I.lock;
    case 'awaiting-async': return I.clock;
    case 'running': return I.zap;
    case 'skipped': return I.minus;
    default: return I.dot;
  }
}

function fmtDuration(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

const REGIONS = ['US', 'EU', 'JP', 'CA', 'UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG'] as const;
const SUBMISSION_TYPES = ['IND', 'NDA', 'BLA', 'MAA', '510k', 'PMA', 'JNDA'] as const;

/** Types that require a release signature before transmit — mirrors the server gate. */
const SIGNATURE_REQUIRED = new Set(['IND', 'NDA', 'BLA', 'MAA']);

// ── Surface ─────────────────────────────────────────────────────────────────

export function SubmissionOrchestrator(_props: SurfaceViewProps) {
  // Launcher inputs
  const [submissionId, setSubmissionId] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');
  const [region, setRegion] = useState<string>('US');
  const [submissionType, setSubmissionType] = useState<string>('IND');
  const [projectId, setProjectId] = useState('');

  // Run state
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<OrchestratorRun | null>(null);
  const [runState, setRunState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [runErrorDetail, setRunErrorDetail] = useState<string | null>(null);

  // Audit — its own error flag, so a failed read never reads as "no events".
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditErr, setAuditErr] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  // Signed package — three states: verified, refused (with reason), not-loaded.
  const [signed, setSigned] = useState<SignedPackage | null>(null);
  const [signedRefusal, setSignedRefusal] = useState<SignatureRefusal | null>(null);
  const [signedLoading, setSignedLoading] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, fireToast] = useToast();

  const loadRun = useCallback(async (id: string) => {
    setRunState('loading');
    setRunErrorDetail(null);
    const r = await read<OrchestratorRun>('GET', `/api/submission-orchestrator/runs/${id}`);
    if (!r.ok || !r.data) {
      setRun(null);
      setRunState('error');
      setRunErrorDetail(
        r.status === 404
          ? 'No run with that id is visible to your organization.'
          : r.status === 0
            ? 'The request did not reach the server.'
            : `The server returned ${r.status}.`,
      );
      return;
    }
    setRun(r.data);
    setRunState('ready');
  }, []);

  const loadAudit = useCallback(async (id: string) => {
    setAuditLoading(true);
    const r = await read<{ events: AuditEvent[] }>('GET', `/api/submission-orchestrator/runs/${id}/audit`);
    setAuditLoading(false);
    if (!r.ok) { setAuditErr(true); setAudit([]); return; }
    setAuditErr(false);
    setAudit(Array.isArray(r.data?.events) ? r.data!.events : []);
  }, []);

  const loadSigned = useCallback(async (id: string) => {
    setSignedLoading(true);
    const r = await read<SignedPackage & SignatureRefusal>('GET', `/api/ectd/export/by-run/${id}/signed`);
    setSignedLoading(false);
    if (r.ok && r.data && (r.data as SignedPackage).signature) {
      setSigned(r.data as SignedPackage);
      setSignedRefusal(null);
      return;
    }
    setSigned(null);
    // A refusal carries a reason. Keep it — "not signed" and "signed but the
    // digest drifted" are different facts and the second is an integrity alarm.
    const body = r.data as SignatureRefusal | null;
    setSignedRefusal(
      body?.error
        ? { error: body.error, message: body.message ?? '' }
        : { error: r.status === 0 ? 'unreachable' : `http_${r.status}`, message: 'The signed-package read did not complete.' },
    );
  }, []);

  const refreshAll = useCallback(async (id: string) => {
    await Promise.all([loadRun(id), loadAudit(id), loadSigned(id)]);
  }, [loadRun, loadAudit, loadSigned]);

  useEffect(() => {
    if (runId) void refreshAll(runId);
  }, [runId, refreshAll]);

  const launch = useCallback(async () => {
    if (!submissionId.trim() || !applicationNumber.trim()) return;
    setBusy('launch');
    const body: Record<string, unknown> = {
      submissionId: submissionId.trim(),
      applicationNumber: applicationNumber.trim(),
      region,
      submissionType,
    };
    const pid = Number(projectId);
    if (Number.isInteger(pid) && pid > 0) body.projectId = pid;

    const r = await read<{ runId: string }>('POST', '/api/submission-orchestrator/runs', body);
    setBusy(null);
    if (!r.ok || !r.data?.runId) {
      fireToast(
        r.status === 0 ? 'The request did not reach the server.' : `Couldn’t start the run (${r.status}).`,
        'error',
      );
      return;
    }
    setRunId(r.data.runId);
    fireToast('Run started.');
  }, [submissionId, applicationNumber, region, submissionType, projectId, fireToast]);

  const regenerate = useCallback(async () => {
    if (!runId || !run) return;
    setBusy('regen');
    const r = await read<{ regenerated: string[] }>(
      'POST',
      `/api/submission-orchestrator/runs/${runId}/regenerate`,
      {
        submissionId: run.submissionId,
        applicationNumber: run.applicationNumber,
        region: run.region,
        submissionType: run.submissionType,
      },
    );
    setBusy(null);
    if (!r.ok) { fireToast(`Couldn’t regenerate (${r.status || 'no response'}).`, 'error'); return; }
    const n = r.data?.regenerated?.length ?? 0;
    fireToast(n > 0 ? `Regenerated ${n} stale step(s).` : 'Nothing was stale; nothing regenerated.');
    void refreshAll(runId);
  }, [runId, run, refreshAll, fireToast]);

  // ── Derived counts. "ran" excludes skipped on purpose (honesty note 2). ──
  const counts = useMemo(() => {
    const steps = run?.steps ?? [];
    return {
      total: steps.length,
      complete: steps.filter(s => s.status === 'complete').length,
      skipped: steps.filter(s => s.status === 'skipped').length,
      failed: steps.filter(s => s.status === 'failed').length,
      stale: steps.filter(s => s.status === 'stale').length,
      awaiting: steps.filter(s => s.status === 'awaiting-signature' || s.status === 'awaiting-async').length,
    };
  }, [run]);

  const signatureRequired = run ? SIGNATURE_REQUIRED.has(run.submissionType) : false;

  /* What AnA can see of this screen. The distinctions the UI refuses to
     collapse have to survive into the assistant's view too — otherwise the
     assistant re-introduces exactly the claim the screen avoided making. */
  const anaContext = useMemo(() => {
    if (!runId) {
      return {
        summary:
          'Submission Orchestrator has no run loaded. Nothing on screen describes any submission — this is a ' +
          'missing selection, not a clean or empty pipeline.',
        availableActions: ['Start a new orchestrator run', 'Load an existing run by id'],
      };
    }
    if (runState === 'loading') {
      return { summary: `Orchestrator run ${runId} is still loading.`, facts: { runId } };
    }
    if (runState === 'error' || !run) {
      return {
        summary:
          `Orchestrator run ${runId} could not be read (${runErrorDetail ?? 'unknown reason'}), so no step status ` +
          'is on screen — a failed read, not a run with no steps.',
        facts: { runId },
        availableActions: ['Retry loading the run'],
      };
    }
    return {
      summary:
        `Orchestrator run ${runId} (${run.submissionType}, ${run.region}, application ${run.applicationNumber}): ` +
        `status ${run.status}. ${counts.complete} of ${counts.total} steps completed, ${counts.skipped} SKIPPED ` +
        `(skipped means never attempted, not succeeded), ${counts.failed} failed, ${counts.stale} stale, ` +
        `${counts.awaiting} awaiting. ` +
        (signed
          ? `A verified release signature (id ${signed.signature.signatureId}) binds this package.`
          : signedRefusal
            ? `No verified signed package: ${signedRefusal.error} — ${signedRefusal.message}`
            : 'The signed-package state has not been read.') +
        (auditErr ? ' The audit trail could not be read, so its events are unknown — not absent.' : ''),
      facts: {
        runId,
        submissionType: run.submissionType,
        region: run.region,
        applicationNumber: run.applicationNumber,
        runStatus: run.status,
        stepCounts: counts,
        steps: run.steps.map(s => ({
          key: s.key, status: s.status, durationMs: s.durationMs, error: s.error,
        })),
        signatureRequiredForThisType: signatureRequired,
        signedPackage: signed
          ? {
              signatureId: signed.signature.signatureId,
              payloadDigest: signed.signature.payloadDigest,
              sealVerdict: signed.signature.sealVerdict,
              gatewayReady: signed.gatewayReady,
              leafCount: signed.leaves?.length ?? 0,
            }
          : null,
        signedPackageRefusal: signedRefusal,
        auditReadFailed: auditErr,
        auditEventCount: auditErr ? null : audit.length,
      },
      availableActions: [
        'Regenerate stale steps',
        'Refresh run status, audit trail, and signed package',
        'Start a different run',
      ],
    };
  }, [runId, runState, run, runErrorDetail, counts, signed, signedRefusal, auditErr, audit.length, signatureRequired]);
  usePublishSurfaceContext('submission-orchestrator', anaContext);

  return (
    <div className="cm-body">
      {/* ── Launcher ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Submission orchestrator</span>
          <span className="s">Compose · assemble · validate · sign</span>
        </div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Submission id">
            <input className="c2c-input" style={{ height: 30, width: 150 }} value={submissionId}
              onChange={e => setSubmissionId(e.target.value)} placeholder="e.g. sub-001" aria-label="Submission id" />
          </Field>
          <Field label="Application number">
            <input className="c2c-input" style={{ height: 30, width: 150 }} value={applicationNumber}
              onChange={e => setApplicationNumber(e.target.value)} placeholder="e.g. IND123456" aria-label="Application number" />
          </Field>
          <Field label="Region">
            <select className="c2c-input" style={{ height: 30 }} value={region}
              onChange={e => setRegion(e.target.value)} aria-label="Region">
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className="c2c-input" style={{ height: 30 }} value={submissionType}
              onChange={e => setSubmissionType(e.target.value)} aria-label="Submission type">
              {SUBMISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Project id (optional)">
            <input className="c2c-input" style={{ height: 30, width: 110 }} inputMode="numeric" value={projectId}
              onChange={e => setProjectId(e.target.value.replace(/\D/g, ''))}
              placeholder="loads CMC/CSR" aria-label="Project id" />
          </Field>
          <button className="btn primary" style={{ height: 32 }} onClick={launch}
            disabled={busy != null || !submissionId.trim() || !applicationNumber.trim()}>
            {I.play} {busy === 'launch' ? 'Starting…' : 'Start run'}
          </button>
        </div>
        {SIGNATURE_REQUIRED.has(submissionType) && (
          <div className="pj-card-b" style={{ paddingTop: 0, fontSize: 12, color: 'var(--text-400)' }}>
            {I.lock} {submissionType} requires a 21 CFR Part 11 release signature before the package can be
            dispatched. The run will pause at the signing step until a signer completes the ceremony.
          </div>
        )}
      </div>

      {/* ── Load an existing run ── */}
      <div className="pj-card">
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-400)' }}>Run id</label>
          <input className="c2c-input" style={{ height: 30, width: 320 }} value={runId ?? ''}
            onChange={e => setRunId(e.target.value.trim() || null)}
            placeholder="paste a run id to load it" aria-label="Run id" />
          <button className="nda-open" onClick={() => runId && void refreshAll(runId)} disabled={!runId}>
            {I.rotateCw} Refresh
          </button>
          {run && (run.status === 'partial' || counts.stale > 0) && (
            <button className="nda-open" style={{ marginLeft: 'auto' }} onClick={regenerate} disabled={busy != null}>
              {I.rotateCcw} {busy === 'regen' ? 'Regenerating…' : 'Regenerate stale steps'}
            </button>
          )}
        </div>
      </div>

      {!runId ? (
        <div className="pj-card"><div className="pj-card-b">
          <EmptyState icon={I.workflow} title="No run loaded"
            hint="Start a run above, or paste an existing run id. The orchestrator sequences Module 3 composition, CSR tabulation, the Module 2 summaries, package assembly, hardened validation, and the Part 11 release signature." />
        </div></div>
      ) : (
        <>
          {/* ── Run header ── */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Run</span>
              {run && <span className="s">{run.applicationNumber} · {run.submissionType} · {run.region}</span>}
            </div>
            <div className="pj-card-b">
              {runState === 'loading' ? <EmptyState icon={I.zap} title="Loading run…" />
                : runState === 'error' ? (
                  <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load this run"
                    hint={runErrorDetail ?? 'The run read did not complete. This is a failed read, not a run without steps.'}
                    retry={() => void loadRun(runId)} />
                ) : !run ? <EmptyState icon={I.workflow} title="No run data" />
                  : (
                    <div>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                        <Stat value={run.status} label="Status"
                          tone={run.status === 'complete' ? 'ok' : run.status === 'failed' ? 'err' : run.status === 'partial' ? 'warn' : 'dim'} />
                        <Stat value={`${counts.complete}/${counts.total}`} label="Steps ran" />
                        {counts.skipped > 0 && <Stat value={String(counts.skipped)} label="Skipped (never ran)" tone="warn" />}
                        {counts.failed > 0 && <Stat value={String(counts.failed)} label="Failed" tone="err" />}
                        {counts.stale > 0 && <Stat value={String(counts.stale)} label="Stale" tone="warn" />}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-400)' }}>
                        Started {fmtTime(run.startedAt)}
                        {run.completedAt ? ` · finished ${fmtTime(run.completedAt)}` : ' · still running'}
                        {run.workflowVersion ? ` · workflow ${run.workflowVersion}` : ''}
                      </div>
                      {counts.skipped > 0 && (
                        <div className="pj-con" style={{ margin: '12px 0 0' }}>
                          <span className="ico">{I.info}</span>
                          <div>
                            <div className="pj-con-t">{counts.skipped} step(s) were skipped, not completed</div>
                            <div className="pj-con-d">
                              A skipped step never ran — its inputs were absent or its gate did not apply. The package
                              is not complete with respect to those steps.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
            </div>
          </div>

          {/* ── Step list ── */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Pipeline</span>
              <span className="s">{run ? `${run.steps.length} steps` : ''}</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {runState === 'error' ? (
                <div style={{ padding: 16 }}>
                  <EmptyState tone="error" icon={I.alertTriangle} title="Step status unavailable"
                    hint="The run could not be read, so no step is shown. This is not a run with zero steps." />
                </div>
              ) : !run ? <div style={{ padding: 16 }}><EmptyState icon={I.list} title="No steps" /></div>
                : (
                  <div>
                    {run.steps.map(s => (
                      <div key={s.key} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 16px', borderBottom: '1px solid var(--border)',
                      }}>
                        <span className={`rd-chip tone-${statusTone(s.status)}`} style={{ minWidth: 0, flexShrink: 0 }}>
                          {statusIcon(s.status)} {statusLabel(s.status)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{stepLabel(s.key)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-400)', fontFamily: 'var(--font-mono, monospace)' }}>
                            {s.key}
                          </div>
                          {s.error && (
                            <div style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }}>{s.error}</div>
                          )}
                          {s.status === 'skipped' && !s.error && (
                            <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 4 }}>
                              Never attempted{s.outputRef ? ` — ${s.outputRef}` : '.'}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-400)', flexShrink: 0 }}>
                          {fmtDuration(s.durationMs)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* ── Release signature / signed package ── */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Release signature</span>
              <span className="s">21 CFR Part 11 §11.70</span>
            </div>
            <div className="pj-card-b">
              {signedLoading ? <EmptyState icon={I.zap} title="Checking the signed package…" />
                : signed ? (
                  <div>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                      <Stat value={I.shieldCheck as any} label={`Signature ${signed.signature.signatureId}`} tone="ok" />
                      <Stat value={signed.gatewayReady ? 'ready' : 'not ready'} label="Gateway"
                        tone={signed.gatewayReady ? 'ok' : 'warn'} />
                      <Stat value={String(signed.hardenedScore)} label="Hardened score" />
                      <Stat value={String(signed.leaves?.length ?? 0)} label="Signed leaves" />
                      <Stat value={fmtBytes(signed.totalSizeBytes)} label="Package size" />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)', wordBreak: 'break-all' }}>
                      Bound digest <code>{signed.signature.payloadDigest}</code> · seal {signed.signature.sealVerdict}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 6 }}>
                      This is the record the signature binds — verified on read. Exporting or dispatching a package
                      whose content no longer hashes to this digest is refused.
                    </div>
                  </div>
                ) : signedRefusal ? (
                  <EmptyState
                    tone={signedRefusal.error === 'digest-drift' || signedRefusal.error === 'seal-failed' ? 'error' : 'idle'}
                    icon={signedRefusal.error === 'digest-drift' || signedRefusal.error === 'seal-failed' ? I.shieldAlert : I.lock}
                    title={
                      signedRefusal.error === 'digest-drift' ? 'Integrity failure — the package changed after signing'
                        : signedRefusal.error === 'seal-failed' ? 'Integrity failure — the signature seal did not verify'
                          : signedRefusal.error === 'awaiting-signature' ? 'Awaiting a signer'
                            : signedRefusal.error === 'signature-revoked' ? 'The signature was superseded or rolled back'
                              : signedRefusal.error === 'not-signed' ? 'No release signature on this run'
                                : signedRefusal.error === 'snapshot-missing' ? 'Signed before snapshot persistence'
                                  : 'The signed package could not be read'
                    }
                    hint={signedRefusal.message || undefined} />
                ) : <EmptyState icon={I.lock} title="Signature state not read" />}
            </div>
          </div>

          {/* ── Audit trail ── */}
          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Audit trail</span>
              <span className="s">{auditErr ? 'unavailable' : `${audit.length} event(s)`}</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {auditLoading ? <div style={{ padding: 16 }}><EmptyState icon={I.zap} title="Loading audit trail…" /></div>
                : auditErr ? (
                  <div style={{ padding: 16 }}>
                    <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t read the audit trail"
                      hint="The append-only step log did not respond. This is not an empty history — an empty audit trail would be a claim about this submission that has not been verified."
                      retry={() => void loadAudit(runId)} />
                  </div>
                ) : audit.length === 0 ? (
                  <div style={{ padding: 16 }}>
                    <EmptyState icon={I.history} title="No audit events recorded"
                      hint="The log read successfully and contains no events for this run." />
                  </div>
                ) : (
                  <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                    {audit.map((e, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '8px 16px',
                        borderBottom: '1px solid var(--border)', fontSize: 12,
                      }}>
                        <span style={{ color: 'var(--text-400)', flexShrink: 0, width: 150 }}>
                          {fmtTime(e.occurredAt)}
                        </span>
                        <span style={{ flexShrink: 0, width: 80 }}>{e.eventType}</span>
                        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono, monospace)' }}>
                          {e.stepKey}
                        </span>
                        <span className={`rd-chip tone-${e.status === 'complete' ? 'ok' : e.status === 'failed' ? 'err' : 'dim'}`}>
                          {e.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{label}</span>
      {children}
    </div>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'ok' | 'warn' | 'err' | 'dim' }) {
  const color = tone === 'err' ? 'var(--error)' : tone === 'warn' ? 'var(--warning, #b45309)' : undefined;
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-400)' }}>{label}</div>
    </div>
  );
}

export default SubmissionOrchestrator;
