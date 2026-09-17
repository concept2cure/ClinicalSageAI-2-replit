/**
 * eCTD Compile & Export — the cross-document "assemble the submission" surface.
 *
 * Registry id: `ectd-compile`.
 *
 * Wired to the real persisting compiler (server/routes/ectd-compile.ts, mounted
 * /api/ectd-compile), keyed on the open program's identifier — the server
 * resolves a legacy numeric project id, a regulatory_programs UUID, or a program
 * code, org-scoped (the same 3-way ident contract as the eSTAR export routes):
 *   • GET  /:projectIdent/status    — module-by-module readiness (required-section
 *                                     completion, overall %), the go/no-go picture
 *   • POST /:projectIdent/validate  — pre-compile validation findings (missing /
 *                                     unapproved / empty required sections), by rule
 *   • POST /:projectIdent/compile   — compiles the submission: a program linked to
 *                                     the canonical submission spine (placed
 *                                     submission_leaves) assembles the REAL package
 *                                     server-side (rendered PDF leaves, ICH v3.2.2
 *                                     index.xml, MD5s) and returns its actual
 *                                     backbone; otherwise the honest draft backbone
 *                                     over authored section text, with blockers
 *                                     saying exactly why no leaf files exist
 *   • GET  /:projectIdent/history   — prior compilations
 *
 * HONESTY: every panel renders live server data, an honest empty, or an honest
 * error — never a fixture. Compile/validate are real awaited writes; the
 * downloadable backbone is the exact XML the server returned. No project open,
 * or a missing org, are surfaced honestly rather than sending a doomed request
 * or fabricating readiness. (The old client-side "no numeric project id"
 * dead-end is gone: window.C2C_PROJECT.id is a program UUID and the SERVER now
 * resolves it; a program with no linked section store gets the server's own
 * blocker text, not a silent 0%.)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob, downloadText, safeFileName } from '../download';

interface ModuleReadiness {
  moduleCode: string;
  moduleName: string;
  totalSections: number;
  requiredSections: number;
  completedRequired: number;
  completionPct: number;
  ready: boolean;
}
/** Where the required-section set came from: the program's live rule pack,
 *  or the labelled ICH baseline when no pack applies (with the reason). */
interface RequiredSectionSource {
  source: 'rule_pack' | 'fallback';
  docType?: string;
  agency?: string;
  packVersion?: string;
  reason?: string;
}
interface StatusView {
  /** Legacy numeric project id, or null when the ident named a program. */
  projectId: number | null;
  projectIdent?: string;
  programId?: string | null;
  overallReadiness: number;
  /** Every required section approved/locked/final. Not the same as submittable. */
  contentComplete?: boolean;
  submissionReady: boolean;
  /** Why the package cannot be transmitted. Empty exactly when submissionReady. */
  submissionBlockers?: string[];
  modules: ModuleReadiness[];
  requiredSectionSource?: RequiredSectionSource;
  totalSections: number;
  totalRequired: number;
  totalCompleted: number;
  lastUpdated: string | null;
}
interface ValidationResult {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sectionCode?: string;
  fix?: string;
}
interface CompileResult {
  id: string;
  projectId: number | null;
  projectIdent?: string;
  programId?: string | null;
  status: 'completed' | 'failed';
  modules: Array<{ moduleCode: string; moduleName: string; status: string; requiredCompleted: number; requiredSections: number }>;
  xmlBackbone: string;
  validationResults: ValidationResult[];
  contentValidationPassed?: boolean;
  submissionReady: boolean;
  submissionBlockers?: string[];
  leafFilesRendered?: number;
  /** The governed submission a spine-backed compile ran against — the handle
   *  the package-download endpoint needs. Absent on draft-backbone compiles. */
  submissionId?: number;
  sequenceNumber?: string;
  errors: string[];
  warnings: string[];
}
interface CompilationRow {
  id: number | string;
  compilation_name: string;
  compilation_type: string;
  status: string;
  version: string;
  compiled_at: string | null;
  created_at: string | null;
}

async function readJson<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

function sevTone(s: string) { return s === 'error' ? 'err' : s === 'warning' ? 'warn' : 'ok'; }

/**
 * Like `readJson`, but PRESERVES the failure. `apiRequest` throws
 * `ApiRequestError` for every non-OK status except 401, and `readJson`'s catch
 * discards it — every failure comes back `{ok:false, status:0, body:null}`,
 * indistinguishable from a transport error and carrying no server payload.
 *
 * That is fatal for the signed-package panel specifically. Its whole job is to
 * tell `digest-drift` (the package changed after signing — an integrity alarm)
 * apart from `not-signed` (an ordinary workflow state), and the server sends
 * that discrimination in the error BODY with a 422 or 409. Through `readJson`
 * both arrive as "could not read", which is the collapse the panel exists to
 * prevent.
 *
 * Kept separate rather than changing `readJson`: the compile-side panels above
 * are written against its current shape, and widening it is a change to their
 * behavior that belongs in its own commit.
 */
async function readJsonKeepingError<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    const payload = (err as { payload?: unknown } | null)?.payload;
    return {
      ok: false,
      status: typeof status === 'number' ? status : 0,
      body: (payload ?? null) as T | null,
    };
  }
}

// ── Orchestrator pipeline view ──────────────────────────────────────────────
//
// These panels were briefly a SEPARATE surface (`submission-orchestrator`).
// That was a duplicate: this file is already "the cross-document assemble the
// submission surface", and a second screen for assembling a submission is
// exactly the parallel path CLAUDE.md's zero-duplication rule forbids. The
// panels are folded in here instead; the surface was deleted in the same
// change.
//
// They read a DIFFERENT server path from the rest of this surface —
// /api/submission-orchestrator (the 11-step pipeline: M2/M3 composition, CSR
// tabulation, assembly, hardened validation, the Part 11 release signature) and
// /api/ectd/export/by-run/:runId/signed — while the panels above read
// /api/ectd-compile.
//
// CORRECTION (prose only — no code below changed). An earlier version of this
// note called that split an unreconciled duplication and "the next thing to fix
// on the server". That was wrong, and checking it is what showed so. The two
// assemblies are different JOBS and both say so in their own headers:
//
//   • orchestrator-real-package.ts is VALIDATION-scoped. It renders the current
//     composition so the hardened validator has a real backbone and real bytes
//     to check, every leaf is `new`, and it deliberately skips PDF/A
//     normalization so the sign-path digest stays deterministic. Its header
//     states that cross-sequence lifecycle (replace/append/delete) "is the
//     canonical core's job ... produced there, not here".
//
//   • assemble-from-core over the submissions spine is DELIVERABLE-scoped: it
//     carries per-leaf lifecycle_op and normalizes to PDF/A.
//
// Both drive the same canonical packager, and composed Module 3 does reach the
// spine — placeModule3IntoSubmission, wired at
// server/api/cmc/module3OperatingSystemRoutes.ts. So this is a deliberate
// separation, not drift, and showing both on one screen is showing two real
// stages of one pipeline rather than papering over a duplicate.

type OrchStepStatus =
  | 'pending' | 'running' | 'awaiting-async' | 'awaiting-signature'
  | 'complete' | 'failed' | 'stale' | 'skipped';

interface OrchStep {
  key: string;
  status: OrchStepStatus;
  durationMs?: number;
  outputRef?: string;
  error?: string;
}

interface OrchRun {
  runId: string;
  submissionId: string;
  applicationNumber: string;
  region: string;
  submissionType: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'complete' | 'failed' | 'partial';
  steps: OrchStep[];
  workflowVersion?: string | null;
}

interface OrchAuditEvent {
  stepKey: string;
  eventType: string;
  status: string;
  occurredAt: string;
}

interface SignedPackageView {
  totalSizeBytes: number;
  gatewayReady: boolean;
  hardenedScore: number;
  signature: { payloadDigest: string; signatureId: number; sealVerdict: string };
  leaves: Array<{ filePath: string }>;
}

/** A refusal from the signed-package seam. Distinct from "not loaded". */
interface SignatureRefusal { error: string; message: string }

/** Human labels; the raw keys are dotted machine ids and read badly in a list. */
const ORCH_STEP_LABELS: Record<string, string> = {
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

/**
 * Tone per step status. `skipped` deliberately does NOT share a tone with
 * `complete`: a step that never ran is not a step that succeeded, and the two
 * reading alike is how a partially-built package looks finished.
 */
function orchStepTone(s: OrchStepStatus): string {
  switch (s) {
    case 'complete': return 'ok';
    case 'failed': return 'err';
    case 'stale':
    case 'awaiting-signature':
    case 'awaiting-async': return 'warn';
    default: return 'dim';
  }
}

function orchStatusLabel(s: OrchStepStatus): string {
  return s === 'awaiting-signature' ? 'awaiting signature'
    : s === 'awaiting-async' ? 'awaiting async' : s;
}

function fmtMs(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtWhen(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

/** Title for a signed-package refusal. An integrity failure is not "unsigned". */
function refusalTitle(code: string): string {
  switch (code) {
    case 'digest-drift': return 'Integrity failure — the package changed after signing';
    case 'seal-failed': return 'Integrity failure — the signature seal did not verify';
    case 'awaiting-signature': return 'Awaiting a signer';
    case 'signature-revoked': return 'The signature was superseded or rolled back';
    case 'signature-unverifiable': return 'The signature could not be checked right now — nothing is known about its standing';
    case 'not-signed': return 'No release signature on this run';
    case 'snapshot-missing': return 'Signed before snapshot persistence';
    default: return 'The signed package could not be read';
  }
}

function isIntegrityFailure(code: string): boolean {
  return code === 'digest-drift' || code === 'seal-failed';
}

const downloadXml = (name: string, text: string) => downloadText(name, text, 'application/xml');

/**
 * The open program's identifier — a regulatory_programs UUID, a program code,
 * or a legacy numeric project id. The SERVER resolves whichever it is,
 * org-scoped; this surface never demands a numeric id (that demand was a
 * permanent dead-end: window.C2C_PROJECT.id is a program UUID).
 */
function readProjectIdent(): { ident: string | null; title?: string; code?: string } {
  const p = (window as unknown as { C2C_PROJECT?: { id?: unknown; title?: string; code?: string } }).C2C_PROJECT;
  if (!p || p.id == null) return { ident: null };
  const ident = String(p.id).trim();
  return { ident: ident !== '' ? ident : null, title: p.title, code: p.code };
}

const REGIONS = ['FDA', 'EMA'] as const;
const SUB_TYPES = ['initial', 'amendment'] as const;

export function EctdCompile({ onAsk }: SurfaceViewProps) {
  /* AnA on this surface. It took SurfaceViewProps and discarded it as `_props`,
     so a publisher staring at a validation finding — the moment they most need
     to know what a rule means and whether it blocks the filing — had no way to
     ask. The prompts name the artefact on screen rather than the page. */
  const ask = onAsk;
  const proj = readProjectIdent();
  const ident = proj.ident;
  const identPath = ident != null ? encodeURIComponent(ident) : null;

  const [region, setRegion] = useState<(typeof REGIONS)[number]>('FDA');
  const [submissionType, setSubmissionType] = useState<(typeof SUB_TYPES)[number]>('initial');

  const [status, setStatus] = useState<StatusView | null>(null);
  const [statusState, setStatusState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [findings, setFindings] = useState<ValidationResult[] | null>(null);
  // Distinguishes "validation ran and returned zero findings" (a real clean pass)
  // from "validation did not run" (POST failed). Without this, an errored POST
  // that set findings to [] rendered the same "No findings" panel as a clean
  // pass — a false "validated clean" on the submission surface.
  const [validationFailed, setValidationFailed] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [history, setHistory] = useState<CompilationRow[]>([]);
  // The history read used to discard `ok` and collapse a 401/500/empty body into
  // [] — rendering "No compilations yet" over a failed read, a false negative
  // for a publisher asking whether this sequence was ever compiled. Now the read
  // outcome is kept, exactly like statusState.
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [busy, setBusy] = useState<'validate' | 'compile' | 'export' | null>(null);
  const [toast, fireToast] = useToast();

  // ── Orchestrator pipeline state (folded in from the deleted duplicate) ──
  // Each panel carries its OWN read-outcome flag for the same reason
  // `validationFailed` and `historyState` exist above: a failed read must not
  // render as an empty result. An empty audit trail is a Part 11 assertion
  // about this submission's build history — a network error is not evidence
  // for it.
  const [runIdInput, setRunIdInput] = useState('');
  const [orchRun, setOrchRun] = useState<OrchRun | null>(null);
  const [orchState, setOrchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [orchErrorDetail, setOrchErrorDetail] = useState<string | null>(null);
  const [orchAudit, setOrchAudit] = useState<OrchAuditEvent[]>([]);
  const [orchAuditErr, setOrchAuditErr] = useState(false);
  const [orchAuditLoading, setOrchAuditLoading] = useState(false);
  const [signed, setSigned] = useState<SignedPackageView | null>(null);
  const [signedRefusal, setSignedRefusal] = useState<SignatureRefusal | null>(null);

  const loadOrchRun = useCallback(async (runId: string) => {
    setOrchState('loading');
    setOrchErrorDetail(null);
    const { ok, status, body } = await readJsonKeepingError<OrchRun>('GET', `/api/submission-orchestrator/runs/${encodeURIComponent(runId)}`);
    if (!ok || !body) {
      setOrchRun(null);
      setOrchState('error');
      setOrchErrorDetail(
        status === 404 ? 'No run with that id is visible to your organization.'
          : status === 0 ? 'The request did not reach the server.'
            : `The server returned ${status}.`,
      );
      return;
    }
    setOrchRun(body);
    setOrchState('ready');
  }, []);

  const loadOrchAudit = useCallback(async (runId: string) => {
    setOrchAuditLoading(true);
    const { ok, body } = await readJsonKeepingError<{ events: OrchAuditEvent[] }>('GET', `/api/submission-orchestrator/runs/${encodeURIComponent(runId)}/audit`);
    setOrchAuditLoading(false);
    if (!ok) { setOrchAuditErr(true); setOrchAudit([]); return; }
    setOrchAuditErr(false);
    setOrchAudit(Array.isArray(body?.events) ? body!.events : []);
  }, []);

  const loadSigned = useCallback(async (runId: string) => {
    const { ok, status, body } = await readJsonKeepingError<SignedPackageView & SignatureRefusal>(
      'GET', `/api/ectd/export/by-run/${encodeURIComponent(runId)}/signed`,
    );
    if (ok && body && (body as SignedPackageView).signature) {
      setSigned(body as SignedPackageView);
      setSignedRefusal(null);
      return;
    }
    setSigned(null);
    // Keep the reason. "not signed" and "signed but the digest drifted" are
    // different facts, and the second is an integrity alarm.
    const refusal = body as SignatureRefusal | null;
    setSignedRefusal(
      refusal?.error
        ? { error: refusal.error, message: refusal.message ?? '' }
        : { error: status === 0 ? 'unreachable' : `http_${status}`, message: 'The signed-package read did not complete.' },
    );
  }, []);

  const loadOrchestrator = useCallback(async (runId: string) => {
    await Promise.all([loadOrchRun(runId), loadOrchAudit(runId), loadSigned(runId)]);
  }, [loadOrchRun, loadOrchAudit, loadSigned]);

  /* Step counts. `ran` EXCLUDES skipped on purpose — see orchStepTone. */
  const orchCounts = useMemo(() => {
    const steps = orchRun?.steps ?? [];
    return {
      total: steps.length,
      complete: steps.filter(s => s.status === 'complete').length,
      skipped: steps.filter(s => s.status === 'skipped').length,
      failed: steps.filter(s => s.status === 'failed').length,
      stale: steps.filter(s => s.status === 'stale').length,
    };
  }, [orchRun]);

  const loadStatus = useCallback(async () => {
    if (identPath == null) return;
    setStatusState('loading');
    const { ok, body } = await readJson<StatusView>('GET', `/api/ectd-compile/${identPath}/status`);
    if (!ok || !body) { setStatusState('error'); setStatus(null); return; }
    setStatus(body); setStatusState('ready');
  }, [identPath]);

  const loadHistory = useCallback(async () => {
    if (identPath == null) return;
    setHistoryState('loading');
    const { ok, body } = await readJson<{ compilations?: CompilationRow[] }>('GET', `/api/ectd-compile/${identPath}/history`);
    if (!ok || !body || !Array.isArray(body.compilations)) { setHistoryState('error'); setHistory([]); return; }
    setHistory(body.compilations); setHistoryState('ready');
  }, [identPath]);

  useEffect(() => { void loadStatus(); void loadHistory(); }, [loadStatus, loadHistory]);

  const doValidate = useCallback(async () => {
    if (identPath == null) return;
    setBusy('validate');
    try {
      const { ok, status: st, body } = await readJson<{ valid: boolean; results: ValidationResult[]; summary: { pass: number; warnings: number; errors: number } }>(
        'POST', `/api/ectd-compile/${identPath}/validate`, { region },
      );
      if (!ok || !body) {
        fireToast(st === 401 ? 'Sign in to your tenant to validate.' : `Validation didn’t run (HTTP ${st}).`, 'error');
        // Do NOT collapse a failed run into an empty findings list — that reads
        // as a clean pass. Flag the failure and keep any prior findings visible.
        setValidationFailed(true); return;
      }
      setValidationFailed(false);
      setFindings(body.results ?? []);
      fireToast(`Validation: ${body.summary.errors} error(s), ${body.summary.warnings} warning(s).`);
    } finally { setBusy(null); }
  }, [identPath, region, fireToast]);

  /* The actual deliverable. The compile proves the package exists (leaf
     counts, sha256) — this hands the publisher its BYTES through the governed
     export route, which is fail-closed server-side: a package that fails
     structural validation answers 422 and no zip is returned. Draft-backbone
     compiles carry no submission spine and assemble no package, so the
     button never renders for them. */
  const doExport = useCallback(async () => {
    const subId = compileResult?.submissionId;
    if (subId == null) return;
    setBusy('export');
    try {
      const res = await apiRequest('POST', `/api/ectd/export/${subId}`, { region });
      if (!res.ok) {
        const pj = (await res.json().catch(() => null)) as { error?: string } | null;
        fireToast('The package was not returned — ' + (pj?.error ?? `HTTP ${res.status}`) + '.', 'error');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name =
        /filename="([^"]+)"/.exec(cd)?.[1] ??
        safeFileName(`ectd-${ident}-seq-${compileResult?.sequenceNumber ?? 'package'}`) + '.zip';
      downloadBlob(name, blob);
      fireToast(`eCTD package downloaded — ${name}.`);
    } catch (e) {
      // apiRequest throws on a refused build (422: validation failure or the
      // completeness gate) with the server's own sentence — say it verbatim.
      fireToast('The package was not returned — ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setBusy(null);
    }
  }, [compileResult, region, ident, fireToast]);

  const doCompile = useCallback(async () => {
    if (identPath == null) return;
    setBusy('compile');
    try {
      const { ok, status: st, body } = await readJson<CompileResult>('POST', `/api/ectd-compile/${identPath}/compile`, { submissionType, region });
      if (!ok || !body) {
        fireToast(st === 401 ? 'Sign in to your tenant to compile.' : `Compile failed (HTTP ${st}). Nothing was assembled.`, 'error');
        return;
      }
      setCompileResult(body);
      setValidationFailed(false);
      setFindings(body.validationResults ?? null);
      fireToast(
        body.status === 'completed'
          // The backbone compiled; that is what the toast reports. It does not
          // claim the package can be submitted — that is the blockers panel's job,
          // and saying "submission-ready" in a toast over an unrendered package is
          // the claim this surface got wrong.
          ? `eCTD backbone compiled${body.submissionReady ? '.' : ' — see what is still needed below.'}`
          : `Compile blocked — ${(body.errors ?? []).length} error(s) must be resolved.`,
        // One call, two opposite outcomes: the tone has to follow the same
        // branch the sentence does, or a blocked compile keeps the tick.
        body.status === 'completed' ? 'ok' : 'error',
      );
      void loadStatus(); void loadHistory();
    } finally { setBusy(null); }
  }, [identPath, submissionType, region, fireToast, loadStatus, loadHistory]);

  /* WHAT ANA SEES HERE. Published ABOVE the no-program early return, because
     `usePublishSurfaceContext` is a hook and a hook below a conditional return
     would run on some renders and not others. The no-program case is also the
     one most worth telling AnA about: "open a program first" is the correct
     answer to "why can't I compile?", and she cannot give it if this surface
     goes silent exactly when it has nothing.

     `submissionReady` is reported alongside its blockers on purpose. This
     surface learned once that a compiled backbone is not a submittable package;
     handing the conversation the flag without the reasons would relearn it. */
  const anaContext = useMemo(
    () => ({
      summary: ident == null
        ? 'eCTD compile, with no program open — nothing can be assembled until one is.'
        : `eCTD compile for ${region} (${submissionType}). Readiness is ${statusState}` +
          (status ? `, overall ${status.overallReadiness}%` : '') +
          (findings ? `; ${findings.length} validation finding(s)` : '; not yet validated') + '.',
      facts: {
        programOpen: ident != null,
        region,
        submissionType,
        readinessState: statusState,
        ...(status
          ? {
              overallReadinessPct: status.overallReadiness,
              modulesTotal: status.modules?.length ?? 0,
              sectionsRequired: status.totalRequired,
              sectionsCompleted: status.totalCompleted,
              contentComplete: status.contentComplete ?? null,
              submissionReady: status.submissionReady,
              submissionBlockers: status.submissionBlockers ?? [],
            }
          : {}),
        validationRun: findings !== null,
        ...(findings
          ? {
              findingsTotal: findings.length,
              findingsBlocking: findings.filter((f) => f.severity === 'error').length,
            }
          : {}),
        lastCompileStatus: compileResult?.status ?? null,
        leafFilesRendered: compileResult?.leafFilesRendered ?? null,
        priorCompilations: history.length,
        /* Orchestrator pipeline. The distinctions the panels refuse to collapse
           have to survive into the assistant's view too, or it re-introduces
           exactly the claim the screen avoided making: skipped is NOT complete,
           and an unread audit trail is NOT an empty one. */
        orchestratorRunLoaded: orchState === 'ready',
        ...(orchState === 'error'
          ? { orchestratorRunReadFailed: true, orchestratorRunReadError: orchErrorDetail }
          : {}),
        ...(orchRun
          ? {
              orchestratorRunId: orchRun.runId,
              orchestratorRunStatus: orchRun.status,
              orchestratorStepCounts: orchCounts,
              orchestratorSkippedMeansNeverAttempted: true,
              orchestratorSteps: orchRun.steps.map((s) => ({
                key: s.key, status: s.status, error: s.error ?? null,
              })),
            }
          : {}),
        signedPackage: signed
          ? {
              signatureId: signed.signature.signatureId,
              payloadDigest: signed.signature.payloadDigest,
              sealVerdict: signed.signature.sealVerdict,
              gatewayReady: signed.gatewayReady,
            }
          : null,
        signedPackageRefusal: signedRefusal,
        orchestratorAuditReadFailed: orchAuditErr,
        // null, not 0 — a count nobody has is not a count of zero.
        orchestratorAuditEventCount: orchAuditErr ? null : orchAudit.length,
      },
      availableActions: [
        'Explain what compiling this sequence will and will not produce',
        'Triage the validation findings (blocking vs advisory, and fix order)',
        'Explain why the package is not yet submittable',
        'Validate before compiling',
        'Compile the eCTD backbone',
        'Load an orchestrator run and explain which steps were skipped and why',
        'Explain whether the signed package still verifies',
      ],
    }),
    [
      ident, region, submissionType, statusState, status, findings, compileResult, history.length,
      orchState, orchErrorDetail, orchRun, orchCounts, signed, signedRefusal, orchAuditErr, orchAudit.length,
    ],
  );
  usePublishSurfaceContext('ectd-compile', anaContext);

  // ── No program open ── (the server resolves UUID / code / numeric idents, so
  // the only honest dead-end left is having no program at all)
  if (ident == null) {
    return (
      <div className="cm-body" style={{ padding: 24 }}>
        <EmptyState
          icon={I.layers}
          title="Open a program to compile its eCTD"
          hint="eCTD assembly runs against a program’s authored sections. Open a program, then compile and export its submission here."
        />
      </div>
    );
  }

  // Read the compile result's lists through locals that are always arrays. The
  // response is server data, not a local invariant, so `.length` on it is a
  // render-time throw waiting for the first version skew.
  const compileErrors = Array.isArray(compileResult?.errors) ? compileResult!.errors : [];
  const compileWarnings = Array.isArray(compileResult?.warnings) ? compileResult!.warnings : [];

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Compile &amp; Export eCTD</span>
          <span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {proj.title ?? `Project ${ident}`}{proj.code ? ' · ' + proj.code : ''}
            {ask && (
              <button
                className="reg-cta"
                onClick={() => ask(`Explain what compiling this sequence for ${region} will and will not produce — which module 1 regional requirements apply, what the backbone and checksums cover, and what would still be missing before it could be transmitted.`)}
              >
                {I.sparkles} Explain this compilation
              </button>
            )}
          </span>
        </div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--text-400)' }}>Region</label>
          <select className="c2c-input" style={{ height: 30 }} value={region} onChange={(e) => setRegion(e.target.value as any)}>
            {REGIONS.map((r) => <option key={r} value={r}>{r === 'FDA' ? 'US · FDA' : 'EU · EMA'}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-400)' }}>Submission</label>
          <select className="c2c-input" style={{ height: 30 }} value={submissionType} onChange={(e) => setSubmissionType(e.target.value as any)}>
            {SUB_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="nda-open" onClick={doValidate} disabled={busy != null}>{I.checkCircle} {busy === 'validate' ? 'Validating…' : 'Validate'}</button>
            <button className="btn primary" style={{ height: 32 }} onClick={doCompile} disabled={busy != null}>{I.layers} {busy === 'compile' ? 'Compiling…' : 'Compile eCTD'}</button>
          </div>
        </div>
      </div>

      {/* ── Readiness ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Module readiness</span>
          {/* The chip reports CONTENT completeness, which is what this number
              measures. It used to read "submission-ready" at 100%, over a package
              with no leaf files — see the blockers panel below. */}
          {status && (
            <span className={'rd-chip tone-' + ((status.contentComplete ?? status.overallReadiness === 100) ? 'ok' : 'warn')}>
              {status.overallReadiness}% · {(status.contentComplete ?? status.overallReadiness === 100) ? 'content complete' : 'incomplete'}
            </span>
          )}
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {statusState === 'loading' ? (
            <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading readiness…" /></div>
          ) : statusState === 'error' ? (
            <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load compilation readiness" hint="Compilation readiness didn’t respond. Sign in to your tenant and retry." /></div>
          ) : !status || !Array.isArray(status.modules) || status.modules.length === 0 ? (
            // `status && status.modules.length` reads as guarded and is not —
            // the check covers the container, not the member. A readiness
            // response that arrives without `modules` (version skew, a proxy
            // that dropped a field, an error body served with 200) threw here
            // and unwound the whole surface into "this surface didn't finish
            // loading", when the truthful answer is the empty state below.
            <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No module readiness yet" hint="Readiness is derived from the program’s sections. Draft and approve sections, then readiness appears per CTD module." /></div>
          ) : (
            <>
            {/* Which required set the numbers below are measured against. A
                generic baseline must never pass for the program's own outline. */}
            {status.requiredSectionSource && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-400)', borderBottom: '1px solid var(--border)' }}>
                {status.requiredSectionSource.source === 'rule_pack'
                  ? `Required sections from rule pack ${status.requiredSectionSource.docType ?? ''}:${status.requiredSectionSource.agency ?? ''} ${status.requiredSectionSource.packVersion ?? ''}`.replace(/\s+/g, ' ').trim()
                  : `Required sections are the generic ICH baseline, not this program's outline. ${status.requiredSectionSource.reason ?? ''}`.trim()}
              </div>
            )}
            <table className="reg-tbl"><thead><tr><th>Module</th><th>Required complete</th><th>Sections</th><th>Completion</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>{status.modules.map((m) => (
                <tr key={m.moduleCode}>
                  <td style={{ fontWeight: 600 }}>{m.moduleName}</td>
                  <td>{m.completedRequired}/{m.requiredSections}</td>
                  <td>{m.totalSections}</td>
                  <td style={{ minWidth: 120 }}>
                    <div style={{ background: 'var(--border)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: m.completionPct + '%', height: '100%', background: m.ready ? 'var(--success)' : 'var(--warning)' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{m.completionPct}%</span>
                  </td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + (m.ready ? 'ok' : 'warn')}>{m.ready ? 'ready' : 'partial'}</span></td>
                </tr>))}</tbody></table>
            </>
          )}
        </div>
      </div>

      {/* ── Compile result ──
          `errors` and `warnings` are read through these locals rather than off
          the response, for the same reason as the readiness table above: a
          compile result that arrives without them is a plausible response, and
          it must render as "0 errors", not as a crashed surface. */}
      {compileResult && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Compilation {compileResult.status === 'completed' ? 'complete' : 'blocked'}</span>
            <span className={'rd-chip tone-' + (compileResult.status === 'completed' ? 'ok' : 'err')}>{compileResult.status}</span>
          </div>
          <div className="pj-card-b">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              <div><b>{compileErrors.length}</b> errors · <b>{compileWarnings.length}</b> warnings</div>
              <div>{compileResult.submissionReady ? 'Submission-ready' : 'Not submission-ready'}</div>
            </div>
            {compileErrors.length > 0 && (
              <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>{compileErrors.map((e, i) => <li key={i} className="sp-tone-err" style={{ fontSize: 13 }}>{e}</li>)}</ul>
            )}
            {/* Why it is not submittable, in the server's words. A bare
                "Not submission-ready" left the user to guess, and the previous
                behaviour — reporting READY over a package with no leaf files —
                was worse than either. */}
            {(compileResult.submissionBlockers?.length ?? 0) > 0 && (
              <div className="sp-tone-warn" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12.5 }}>
                <b>Not yet submittable:</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {compileResult.submissionBlockers!.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}
            {/* The deliverable itself — only a spine-backed compile with
                rendered leaves has a package to hand over. */}
            {compileResult.submissionId != null && (compileResult.leafFilesRendered ?? 0) > 0 && (
              <button
                className="btn primary"
                style={{ height: 32, marginRight: 8 }}
                disabled={busy != null}
                onClick={() => void doExport()}
              >
                {I.download} {busy === 'export' ? 'Assembling package…' : 'Download package (.zip)'}
              </button>
            )}
            {compileResult.xmlBackbone && (
              <>
                <button className="btn primary" style={{ height: 32 }} onClick={() => downloadXml(`ectd-backbone-${ident.replace(/[^a-zA-Z0-9._-]/g, '_')}-${region.toLowerCase()}.xml`, compileResult.xmlBackbone)}>
                  {I.download} Download eCTD backbone XML
                </button>
                {/* Draft-backbone compiles (no leaf files rendered) get the
                    working-document caveat. A spine-backed compile returned the
                    package's REAL index.xml — its leaves are rendered files, so
                    this caveat would be false there; the blockers panel above
                    already says what still stands between it and transmission. */}
                {!compileResult.submissionReady && (compileResult.leafFilesRendered ?? 0) === 0 && (
                  <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--text-400)' }}>
                    The backbone describes the authored section content and marks every leaf
                    <span className="mono"> rendered=&quot;false&quot;</span>. It is a working document,
                    not a sequence to transmit.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Validation findings ── */}
      {(findings || validationFailed) && (
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Validation findings</span><span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{validationFailed ? '—' : findings!.length}{ask && !validationFailed && findings && findings.length > 0 && <button className="reg-cta" onClick={() => ask(`Triage these eCTD validation findings for ${region}: which are blocking versus advisory, what each rule actually requires, and the order to fix them in. Do not claim a finding is resolved without evidence.`)}>{I.sparkles} Triage findings</button>}</span></div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            {validationFailed ? (
              <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Validation did not run" hint="The validation service did not return a result, so no findings are shown. This is NOT a clean result — re-run validation before relying on it." /></div>
            ) : findings!.length === 0 ? (
              <div style={{ padding: 16 }}><EmptyState icon={I.checkCircle} title="No findings" hint="No blocking or advisory issues were raised for the selected region." /></div>
            ) : (
              <table className="reg-tbl"><thead><tr><th>Severity</th><th>Section</th><th>Message</th><th>Suggested fix</th></tr></thead>
                <tbody>{findings!.filter((f) => f.severity !== 'info').concat(findings!.filter((f) => f.severity === 'info')).map((f, i) => (
                  <tr key={i}>
                    <td><span className={'rd-chip tone-' + sevTone(f.severity)}>{f.severity}</span></td>
                    <td className="mono">{f.sectionCode ?? '—'}</td>
                    <td>{f.message}</td>
                    <td style={{ color: 'var(--text-400)' }}>{f.fix ?? ''}</td>
                  </tr>))}</tbody></table>
            )}
          </div>
        </div>
      )}

      {/* ── History ── */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Compilation history</span><span className="s">{historyState === 'ready' ? history.length : historyState === 'error' ? 'not loaded' : '…'}</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {historyState === 'loading' || historyState === 'idle' ? (
            <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="Loading compilation history…" busy /></div>
          ) : historyState === 'error' ? (
            <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Compilation history didn’t respond." hint="Whether this sequence has been compiled before is not known until it loads." retry={loadHistory} /></div>
          ) : history.length === 0 ? (
            <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="No compilations yet" hint="Each Compile run is recorded here with its status and version." /></div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Name</th><th>Type</th><th>Version</th><th>Status</th><th style={{ textAlign: 'right' }}>Compiled</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={String(h.id)}>
                  <td>{h.compilation_name}</td><td>{h.compilation_type}</td><td className="mono">{h.version}</td>
                  <td><span className={'rd-chip tone-' + (h.status === 'completed' ? 'ok' : h.status === 'failed' ? 'err' : 'dim')}>{h.status}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{h.compiled_at ? new Date(h.compiled_at).toLocaleString() : '—'}</td>
                </tr>))}</tbody></table>
          )}
        </div>
      </div>

      {/* ── Orchestrator pipeline ─────────────────────────────────────────
          The 11-step run (M2/M3 composition, CSR tabulation, assembly,
          hardened validation, Part 11 signature). Reads a different server
          path from the panels above — see the note by ORCH_STEP_LABELS. */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Orchestrator run</span>
          <span className="s">
            {orchRun ? `${orchRun.applicationNumber} · ${orchRun.submissionType} · ${orchRun.region}` : 'paste a run id'}
          </span>
        </div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="c2c-input" style={{ height: 30, width: 320 }} value={runIdInput}
            onChange={(e) => setRunIdInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && runIdInput.trim()) void loadOrchestrator(runIdInput.trim()); }}
            placeholder="orchestrator run id" aria-label="Orchestrator run id"
          />
          <button className="nda-open" onClick={() => runIdInput.trim() && void loadOrchestrator(runIdInput.trim())} disabled={!runIdInput.trim()}>
            {I.search} Load run
          </button>
        </div>
        <div className="pj-card-b" style={{ paddingTop: 0 }}>
          {orchState === 'idle' ? (
            <EmptyState icon={I.workflow} title="No orchestrator run loaded"
              hint="The orchestrator sequences Module 3 composition, CSR tabulation, the Module 2 summaries, package assembly, hardened validation, and the Part 11 release signature. Paste a run id to see its per-step state." />
          ) : orchState === 'loading' ? (
            <EmptyState icon={I.zap} title="Loading run…" busy />
          ) : orchState === 'error' ? (
            <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load this run"
              hint={orchErrorDetail ?? 'The run read did not complete. This is a failed read, not a run without steps.'}
              retry={() => runIdInput.trim() && void loadOrchRun(runIdInput.trim())} />
          ) : orchRun ? (
            <div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{orchRun.status}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Status</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{orchCounts.complete}/{orchCounts.total}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Steps ran</div>
                </div>
                {orchCounts.skipped > 0 && (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--warning)' }}>{orchCounts.skipped}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Skipped (never ran)</div>
                  </div>
                )}
                {orchCounts.failed > 0 && (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--error)' }}>{orchCounts.failed}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Failed</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-400)' }}>
                Started {fmtWhen(orchRun.startedAt)}
                {orchRun.completedAt ? ` · finished ${fmtWhen(orchRun.completedAt)}` : ' · still running'}
                {orchRun.workflowVersion ? ` · workflow ${orchRun.workflowVersion}` : ''}
              </div>
              {orchCounts.skipped > 0 && (
                <div className="pj-con" style={{ margin: '12px 0 0' }}>
                  <span className="ico">{I.info}</span>
                  <div>
                    <div className="pj-con-t">{orchCounts.skipped} step(s) were skipped, not completed</div>
                    <div className="pj-con-d">
                      A skipped step never ran — its inputs were absent or its gate did not apply. The package is
                      not complete with respect to those steps.
                    </div>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                {orchRun.steps.map((s) => (
                  <div key={s.key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '9px 0', borderTop: '1px solid var(--bg-200)',
                  }}>
                    <span className={`rd-chip tone-${orchStepTone(s.status)}`} style={{ flexShrink: 0 }}>
                      {orchStatusLabel(s.status)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{ORCH_STEP_LABELS[s.key] ?? s.key}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-400)' }} className="mono">{s.key}</div>
                      {s.error && <div style={{ fontSize: 12, color: 'var(--error)', marginTop: 4 }}>{s.error}</div>}
                      {s.status === 'skipped' && !s.error && (
                        <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 4 }}>
                          Never attempted{s.outputRef ? ` — ${s.outputRef}` : '.'}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)', flexShrink: 0 }}>{fmtMs(s.durationMs)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Release signature (21 CFR Part 11 §11.70) ── */}
      {orchState === 'ready' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Release signature</span>
            <span className="s">21 CFR Part 11 §11.70</span>
          </div>
          <div className="pj-card-b">
            {signed ? (
              <div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>#{signed.signature.signatureId}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Signature</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{signed.gatewayReady ? 'ready' : 'not ready'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Gateway</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{signed.leaves?.length ?? 0}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Signed leaves</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{fmtSize(signed.totalSizeBytes)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-400)' }}>Package size</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-400)', wordBreak: 'break-all' }}>
                  Bound digest <span className="mono">{signed.signature.payloadDigest}</span> · seal {signed.signature.sealVerdict}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 6 }}>
                  This is the record the signature binds — verified on read. Exporting or dispatching a package whose
                  content no longer hashes to this digest is refused.
                </div>
              </div>
            ) : signedRefusal ? (
              <EmptyState
                tone={isIntegrityFailure(signedRefusal.error) ? 'error' : 'idle'}
                icon={isIntegrityFailure(signedRefusal.error) ? I.shieldAlert : I.lock}
                title={refusalTitle(signedRefusal.error)}
                hint={signedRefusal.message || undefined} />
            ) : (
              <EmptyState icon={I.lock} title="Signature state not read" />
            )}
          </div>
        </div>
      )}

      {/* ── Orchestrator audit trail ── */}
      {orchState === 'ready' && (
        <div className="pj-card">
          <div className="pj-card-h">
            <span className="t">Orchestrator audit trail</span>
            <span className="s">{orchAuditErr ? 'unavailable' : `${orchAudit.length} event(s)`}</span>
          </div>
          <div className="pj-card-b" style={{ padding: 0 }}>
            {orchAuditLoading ? (
              <div style={{ padding: 16 }}><EmptyState icon={I.clock} title="Loading audit trail…" busy /></div>
            ) : orchAuditErr ? (
              <div style={{ padding: 16 }}>
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t read the audit trail"
                  hint="The append-only step log did not respond. This is not an empty history — an empty audit trail would be a claim about this submission that has not been verified."
                  retry={() => runIdInput.trim() && void loadOrchAudit(runIdInput.trim())} />
              </div>
            ) : orchAudit.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState icon={I.history} title="No audit events recorded"
                  hint="The log read successfully and contains no events for this run." />
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {orchAudit.map((e, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 10, padding: '8px 16px',
                    borderBottom: '1px solid var(--bg-200)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-400)', flexShrink: 0, width: 150 }}>{fmtWhen(e.occurredAt)}</span>
                    <span style={{ flexShrink: 0, width: 80 }}>{e.eventType}</span>
                    <span style={{ flex: 1, minWidth: 0 }} className="mono">{e.stepKey}</span>
                    <span className={`rd-chip tone-${e.status === 'complete' ? 'ok' : e.status === 'failed' ? 'err' : 'dim'}`}>
                      {e.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}
