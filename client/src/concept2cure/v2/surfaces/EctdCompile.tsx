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
      },
      availableActions: [
        'Explain what compiling this sequence will and will not produce',
        'Triage the validation findings (blocking vs advisory, and fix order)',
        'Explain why the package is not yet submittable',
        'Validate before compiling',
        'Compile the eCTD backbone',
      ],
    }),
    [ident, region, submissionType, statusState, status, findings, compileResult, history.length],
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
          <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Region</label>
          <select className="c2c-input" style={{ height: 30 }} value={region} onChange={(e) => setRegion(e.target.value as any)}>
            {REGIONS.map((r) => <option key={r} value={r}>{r === 'FDA' ? 'US · FDA' : 'EU · EMA'}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Submission</label>
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
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--c2c-dim,#667085)', borderBottom: '1px solid var(--c2c-line,#eef0f3)' }}>
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
                    <div style={{ background: 'var(--c2c-line,#eef0f3)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: m.completionPct + '%', height: '100%', background: m.ready ? 'var(--c2c-ok,#12b76a)' : 'var(--c2c-warn,#f79009)' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--c2c-dim,#667085)' }}>{m.completionPct}%</span>
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
              <div className="sp-tone-warn" style={{ border: '1px solid var(--c2c-line,#e4e7ec)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12.5 }}>
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
                  <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--c2c-dim,#667085)' }}>
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
                    <td style={{ color: 'var(--c2c-dim,#667085)' }}>{f.fix ?? ''}</td>
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

      <C2CToast msg={toast} />
    </div>
  );
}
