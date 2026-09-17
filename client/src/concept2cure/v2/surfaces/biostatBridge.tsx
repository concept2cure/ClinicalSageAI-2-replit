/**
 * Biostatistics bridge — the client half of server/services/biostatistics-bridge.
 *
 * ── What this connects ───────────────────────────────────────────────────────
 * Until this module the Biostatistics designer took its study from four
 * hard-coded presets, the protocol workspace had no statistics view at all,
 * and nothing a biostatistician computed reached the design record, the task
 * board or a filing. The bridge API (`/api/biostat-bridge`) joins those, and
 * these components are its one client rendering, shared by:
 *
 *   • `Biostatistics.tsx` — the study picker, the gap/verdict panel, the
 *     filing-placement note, the governed write-back and task-raising forms;
 *   • `ProtocolDev.tsx`   — the Statistics tab (readiness per design, with the
 *     deep link into the designer).
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * Every read renders real rows, an honest empty state, or an honest failure.
 * A design the server could not size shows its blocking gaps and no numbers.
 * Both writes are governed: a reason is required, the toast follows the
 * server's confirmation, and a refusal is shown as the refusal it is.
 *
 * @module client/src/concept2cure/v2/surfaces/biostatBridge
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState, isRowsWith, useLiveRows, type ListState } from '../dataConnect';
import { C2CForm } from '../C2CForm';
import { readShellProject } from '../shellProject';
import { stashNavParamsForTarget } from '../navParams';

// ─── Wire shapes (mirror server/services/biostatistics-bridge) ───────────────

export interface ReadinessCheck { key: string; label: string; ok: boolean; hint?: string }
export interface StatisticalReadiness {
  percent: number;
  checks: ReadinessCheck[];
  plannedSampleSize: number | null;
  power: number | null;
  alpha: number | null;
  primaryEndpoint: string | null;
}
export interface BridgeDesignRow {
  studyId: string;
  programId: string | null;
  title: string;
  phase: string;
  indication: string;
  status: string;
  updatedAt: string | null;
  readiness: StatisticalReadiness;
}
export interface DesignGap {
  field: string;
  message: string;
  severity: 'blocking' | 'defaulted' | 'note';
  designPath: string;
}
export interface BridgePlacement {
  deliverable: string;
  applicationType: string;
  backbone: 'ectd' | 'estar' | 'ctis';
  required: 'required' | 'expected' | 'conditional' | 'not_applicable';
  code: string | null;
  heading: string;
  module: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | null;
  note: string;
}
export interface BridgeTaskBlueprint {
  key: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  trigger: string;
  deliverable?: string;
}
export interface ReviewRow {
  element: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  finding: string;
  action: string;
  codes: string[];
}
export interface StatisticalReview {
  rows: ReviewRow[];
  verdict: { challengeLikelihood: 'low' | 'moderate' | 'high'; mostVulnerable: string | null; recommendedActions: string[] };
  standardsChecked: string[];
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
}
export interface DesignAssessment {
  studyId: string;
  title: string;
  readiness: StatisticalReadiness;
  /** The design gates' report (ICH E9 / E9(R1) / E10 / E3), as /api/study-design returns it. */
  validation?: { riskLevel: string; summary: string; counts: Record<string, number> };
  /** The reviewer's risk table and defensibility verdict. */
  review?: StatisticalReview;
  adapter: { input: Record<string, unknown> | null; gaps: DesignGap[]; mapped: string[] };
  computation: { method: string; sampleSize: { total: number; perGroup: number }; adjustedTotal?: number; power: number } | null;
  judgment: { overallVerdict: string; overallRisk: string; actionRecommendation: string } | null;
  provenance: { engine: string; engineVersion: string; inputsSha256: string | null };
  filing: { programId: string | null; programType: string | null; applicationType: string | null; projectId: number | null };
  placements: BridgePlacement[];
  existingDeliverables: string[];
  proposedTasks: BridgeTaskBlueprint[];
  existingTaskKeys: string[];
}

export const APP_LABELS: Record<string, string> = {
  ind: 'IND', nda: 'NDA', bla: 'BLA', anda: 'ANDA', maa: 'MAA', '510k': '510(k)', de_novo: 'De Novo', pma: 'PMA', cta: 'CTA',
};

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The design list, narrowed to the open program when one is open. */
export function bridgeDesignsPath(): string {
  const p = readShellProject();
  return p ? `/api/biostat-bridge/designs?program_id=${encodeURIComponent(String(p.id))}` : '/api/biostat-bridge/designs';
}

/**
 * A 200 whose rows lack the bridge's own fields is reported as a shape error,
 * not rendered: the panel reads `readiness.percent` and `studyId` from every
 * row, and a row without them is a broken read, not a design.
 */
const isDesignRows = isRowsWith<BridgeDesignRow>('studyId', 'readiness');

export function useBridgeDesigns(reloadKey = 0): ListState<BridgeDesignRow> {
  const path = bridgeDesignsPath();
  return useLiveRows<BridgeDesignRow>(path, [path, reloadKey], isDesignRows);
}

export interface AssessmentState {
  assessment: DesignAssessment | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** One design's assessment — refetched when the id or the reload nonce changes. */
export function useDesignAssessment(studyId: string | null): AssessmentState {
  const [assessment, setAssessment] = useState<DesignAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!studyId) { setAssessment(null); setError(null); setLoading(false); return undefined; }
    setLoading(true); setError(null);
    (async () => {
      try {
        const res = await apiRequest('GET', `/api/biostat-bridge/designs/${encodeURIComponent(studyId)}/assessment`);
        const body = (await res.json().catch(() => null)) as { data?: DesignAssessment } | null;
        if (cancelled) return;
        if (!res.ok || !body?.data) {
          setAssessment(null);
          setError(res.status === 401 ? 'Sign in to your tenant to load study designs.' : serverMessage(body) ?? `The assessment did not load (HTTP ${res.status}).`);
          return;
        }
        setAssessment(body.data);
      } catch (e) {
        if (cancelled) return;
        setAssessment(null);
        setError(e instanceof Error && e.message ? e.message : 'The assessment did not load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studyId, nonce]);
  return { assessment, loading, error, reload: () => setNonce((n) => n + 1) };
}

/** Where the document being drafted files for this program, or null when the program's filing is unknown. */
export function placementForDoc(assessment: DesignAssessment | null, docType: string): BridgePlacement | null {
  if (!assessment) return null;
  return assessment.placements.find((p) => p.deliverable === docType) ?? null;
}

/** Resolve a person's (or AnA's) name for a design against the live list. */
export function resolveDesign(rows: BridgeDesignRow[], raw: string): { ok: true; row: BridgeDesignRow } | { ok: false; reason: string } {
  const needle = raw.trim().toLowerCase();
  if (!needle) return { ok: false, reason: 'Name a study design to load.' };
  const byId = rows.filter((r) => r.studyId.toLowerCase() === needle);
  const byTitle = rows.filter((r) => r.title.toLowerCase() === needle);
  const hits = byId.length ? byId : byTitle.length ? byTitle : rows.filter((r) => r.title.toLowerCase().includes(needle));
  if (hits.length === 0) return { ok: false, reason: `No study design matching "${raw}" in the listed designs.` };
  if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} designs — name one exactly.` };
  return { ok: true, row: hits[0] };
}

/** Hand a design to the Biostatistics designer: stash the id on the nav channel, then navigate. */
export function openDesignInBiostatistics(studyId: string, onNav: (id: string) => void): void {
  stashNavParamsForTarget('biostatistics', { studyId });
  onNav('biostatistics');
}

// ─── Presentation helpers ────────────────────────────────────────────────────

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const readinessTone = (p: number) => (p >= 80 ? 'ok' : p >= 50 ? 'warn' : 'err');
const riskTone = (r: string) => (r === 'low' ? 'ok' : r === 'medium' ? 'warn' : 'err');
const gradeLabel: Record<BridgePlacement['required'], string> = {
  required: 'required', expected: 'expected', conditional: 'conditional', not_applicable: 'not filed',
};
const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-300,#6b6963)' };

function scopeLabel(): string {
  const p = readShellProject();
  const name = p ? String(p.product ?? p.code ?? p.title ?? '').trim() : '';
  return p ? (name ? `program ${name}` : 'the open program') : 'org-scoped';
}

// ─── Study picker (designer left rail) ───────────────────────────────────────

export function StudyDesignCard({ designs, selectedId, onSelect }: {
  designs: ListState<BridgeDesignRow>;
  selectedId: string | null;
  onSelect: (studyId: string) => void;
}) {
  return (
    <div className="pj-card">
      <div className="pj-card-h"><span className="t">Study design</span><span className="s">{scopeLabel()}</span></div>
      <div className="pj-card-b" style={{ padding: 8 }}>
        {designs.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '12px 10px' }}>Loading study designs…</div>
        ) : designs.error ? (
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load study designs"
            hint="The design store didn't respond. These are the persisted study designs (CDISC PRM) for this organization — sign in and retry." />
        ) : designs.empty ? (
          <EmptyState icon={I.fileText} title="No persisted study design yet"
            hint="Design a study in the study-design spine (or the protocol workspace) and it appears here to load into the engine. The presets below are worked examples, not your study." />
        ) : (
          <div className="sp-list">
            {designs.rows.map((d) => (
              <button key={d.studyId} className="sp-row"
                style={{ width: '100%', textAlign: 'left', ...(selectedId === d.studyId ? { background: 'var(--accent-000)', boxShadow: 'inset 0 0 0 1px var(--accent-muted)' } : {}) }}
                aria-pressed={selectedId === d.studyId}
                onClick={() => onSelect(d.studyId)} title={`Load "${d.title}" into the engine`}>
                <span className="sp-row-b">
                  <span className="sp-row-t">{d.title}</span>
                  <span className="sp-row-s">{[d.phase && 'Phase ' + d.phase, d.indication].filter(Boolean).join(' · ')}{d.readiness.primaryEndpoint ? ' · ' + d.readiness.primaryEndpoint : ''}</span>
                </span>
                <span className={'rd-chip tone-' + readinessTone(d.readiness.percent)} title="Statistical readiness — share of applicable checks that pass">{d.readiness.percent}%</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assessment panel (designer) ─────────────────────────────────────────────

export function DesignBridgePanel({ state, onNav, onApplied, onTasksRaised, fireToast }: {
  state: AssessmentState;
  onNav: (id: string) => void;
  onApplied: () => void;
  onTasksRaised: () => void;
  fireToast: (msg: string, tone?: 'ok' | 'error') => void;
}) {
  const { assessment: a, loading, error } = state;
  const [form, setForm] = useState<'apply' | 'tasks' | null>(null);
  if (loading) return <div className="pj-card"><div className="pj-card-b"><div role="status" className="scaf-note">Assessing the design…</div></div></div>;
  if (error) {
    return <div className="pj-card"><div className="pj-card-b"><EmptyState tone="error" icon={I.alertTriangle} title="Couldn't assess the design" hint={error} /></div></div>;
  }
  if (!a) return null;

  const blocking = a.adapter.gaps.filter((g) => g.severity === 'blocking');
  const defaulted = a.adapter.gaps.filter((g) => g.severity === 'defaulted');
  const notes = a.adapter.gaps.filter((g) => g.severity === 'note');
  const n = a.computation ? (a.computation.adjustedTotal ?? a.computation.sampleSize.total) : null;
  const app = a.filing.applicationType;
  const openTasks = a.proposedTasks.filter((t) => !a.existingTaskKeys.includes(t.key));

  return (
    <div className="pj-card">
      <div className="pj-card-h"><span className="t">Design assessment</span><span className="s">{a.title}</span></div>
      <div className="pj-card-b" style={{ padding: 12, display: 'grid', gap: 10 }}>
        {/* Verdict line — from the server's engines, provenance-stamped. */}
        {a.computation && a.judgment ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
            <span><b>{n}</b> subjects</span>
            <span><b>{pct(a.computation.power)}</b> power</span>
            <span className={'rd-chip tone-' + (a.judgment.overallVerdict === 'adequate' ? 'ok' : a.judgment.overallVerdict === 'marginal' ? 'warn' : 'err')}>{a.judgment.overallVerdict.replace(/_/g, ' ')}</span>
            <span style={muted}>{a.computation.method} · {a.provenance.engine} {a.provenance.engineVersion}{a.provenance.inputsSha256 ? ' · inputs ' + a.provenance.inputsSha256.slice(0, 12) : ''}</span>
          </div>
        ) : (
          <div style={{ fontSize: 12 }}>
            <b>Not sized.</b> The design is missing what the engine needs — resolve the blocking gaps below.
          </div>
        )}

        {/* Readiness */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span className={'rd-chip tone-' + readinessTone(a.readiness.percent)}>{a.readiness.percent}% ready</span>
          <span style={muted}>{a.readiness.checks.filter((c) => c.ok).length} of {a.readiness.checks.length} statistical checks pass</span>
        </div>

        {/* Gaps */}
        {(blocking.length > 0 || defaulted.length > 0 || notes.length > 0) && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 4 }} aria-label="Design gaps">
            {blocking.map((g) => <li key={'b' + g.field}><span className="rd-chip tone-err" style={{ marginRight: 6 }}>blocking</span>{g.message} <span style={muted}>({g.designPath})</span></li>)}
            {defaulted.map((g) => <li key={'d' + g.field}><span className="rd-chip tone-warn" style={{ marginRight: 6 }}>assumed</span>{g.message}</li>)}
            {notes.map((g) => <li key={'n' + g.field + g.message.length}><span className="rd-chip tone-idle" style={{ marginRight: 6 }}>note</span>{g.message}</li>)}
          </ul>
        )}

        {/* Statistical review — the gates' findings and the engine's judgment as
            one risk table with a verdict (biostatistics-engine review format).
            Rows cite the gate codes they rest on. */}
        {a.review && <StatisticalReviewTable review={a.review} />}

        {/* Filing */}
        <div style={{ fontSize: 12 }}>
          {app ? (
            <>Files as a <b>{APP_LABELS[app] ?? app}</b>{a.filing.projectId === null ? <span style={muted}> — the program has no project record, so tasks and documents cannot be bound to it yet</span> : null}.</>
          ) : a.filing.programId ? (
            <span style={muted}>The program's type ({a.filing.programType ?? 'unknown'}) does not map to a filing type, so no placements are shown.</span>
          ) : (
            <span style={muted}>This design is not linked to a program, so filing placements and task binding are unavailable.</span>
          )}
        </div>

        {/* Actions — governed writes open a reason form; nothing fires on the click itself. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" style={{ height: 30 }} disabled={!a.computation} onClick={() => setForm('apply')}
            title={a.computation ? 'Write the computed sample size and power onto the design (governed)' : 'Resolve the blocking gaps first'}>
            {I.penLine} Apply sample size to design
          </button>
          <button className="btn" style={{ height: 30 }} disabled={openTasks.length === 0} onClick={() => setForm('tasks')}
            title={openTasks.length ? `${openTasks.length} proposed task(s) not yet on the board` : a.proposedTasks.length ? 'Every proposed task is already on the board' : 'The assessment proposes no tasks'}>
            {I.clipboardList ?? I.check} Raise tasks{openTasks.length ? ` (${openTasks.length})` : ''}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
          <button className="btn" style={{ height: 26, fontSize: 12 }} onClick={() => onNav('protocol-dev')}>Open protocol workspace</button>
          <button className="btn" style={{ height: 26, fontSize: 12 }} onClick={() => onNav('tasks')}>Open task board</button>
          <button className="btn" style={{ height: 26, fontSize: 12 }} onClick={() => onNav('submission-center')}>Open submission center</button>
        </div>
      </div>

      {form === 'apply' && (
        <ApplySampleSizeForm assessment={a} onCancel={() => setForm(null)}
          onDone={(msg) => { setForm(null); fireToast(msg); onApplied(); }}
          onError={(msg) => fireToast(msg, 'error')} />
      )}
      {form === 'tasks' && (
        <RaiseTasksForm assessment={a} onCancel={() => setForm(null)}
          onDone={(msg) => { setForm(null); fireToast(msg); onTasksRaised(); }}
          onError={(msg) => fireToast(msg, 'error')} />
      )}
    </div>
  );
}

// ─── Statistical review table ────────────────────────────────────────────────

export function StatisticalReviewTable({ review }: { review: StatisticalReview }) {
  const [open, setOpen] = useState(review.overallRisk !== 'low');
  const v = review.verdict;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span className={'rd-chip tone-' + riskTone(review.overallRisk)}>{review.overallRisk} statistical risk</span>
        <span>Regulatory challenge likelihood: <b>{v.challengeLikelihood}</b>{v.mostVulnerable ? <> — most vulnerable: <b>{v.mostVulnerable}</b></> : null}</span>
        <button className="btn" style={{ height: 24, fontSize: 11, marginLeft: 'auto' }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'} review
        </button>
      </div>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table className="reg-tbl" aria-label="Statistical risk summary">
            <thead><tr><th>Element</th><th>Risk</th><th>Finding</th><th>Action</th></tr></thead>
            <tbody>
              {review.rows.map((r) => (
                <tr key={r.element}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.element}{r.codes.length ? <span style={{ ...muted, display: 'block', fontFamily: 'var(--font-mono)' }}>{r.codes.join(' ')}</span> : null}</td>
                  <td><span className={'rd-chip tone-' + riskTone(r.risk)}>{r.risk}</span></td>
                  <td style={{ fontSize: 12 }}>{r.finding}</td>
                  <td style={{ fontSize: 12 }}>{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {review.standardsChecked.length > 0 && <div style={muted}>Standards checked: {review.standardsChecked.join(' · ')}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Governed forms ──────────────────────────────────────────────────────────

function ApplySampleSizeForm({ assessment: a, onCancel, onDone, onError }: {
  assessment: DesignAssessment; onCancel: () => void; onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const n = a.computation ? (a.computation.adjustedTotal ?? a.computation.sampleSize.total) : null;
  const submit = async (v: Record<string, string>) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `/api/biostat-bridge/designs/${encodeURIComponent(a.studyId)}/apply-sample-size`, { reason: v.reason ?? '' });
      const body = (await res.json().catch(() => null)) as { data?: { plannedSampleSize?: number; auditId?: string } } | null;
      if (!res.ok || !body?.data?.auditId) {
        onError('The sample size was not applied — ' + (serverMessage(body) ?? `HTTP ${res.status}`) + '. The design is unchanged.');
        return;
      }
      onDone(`Sample size ${body.data.plannedSampleSize} written to "${a.title}" — the write and its audit record committed together.`);
    } catch (e) {
      onError('The sample size was not applied — ' + (e instanceof Error ? e.message : String(e)) + '. The design is unchanged.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <C2CForm
      config={{
        eyebrow: 'Biostatistics · governed write',
        title: 'Apply sample size to the design',
        sub: `Writes ${n ?? '—'} subjects at ${pct(a.computation?.power ?? null)} power onto the statistical plan of "${a.title}" (currently ${a.readiness.plannedSampleSize ?? 'unset'}). The protocol, SAP and registration projections re-render from it.`,
        governed: true,
        submitLabel: busy ? 'Applying…' : 'Apply and record',
        fields: [{ key: 'reason', label: 'Reason for change', type: 'textarea', required: true, rows: 3, placeholder: 'Why this sample size is being adopted (at least 8 characters)' }],
      }}
      onCancel={onCancel}
      onSubmit={(v) => void submit(v)}
    />
  );
}

function RaiseTasksForm({ assessment: a, onCancel, onDone, onError }: {
  assessment: DesignAssessment; onCancel: () => void; onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const open = useMemo(() => a.proposedTasks.filter((t) => !a.existingTaskKeys.includes(t.key)), [a]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(open.map((t) => t.key)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = useCallback((k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);
  const submit = async () => {
    if (busy || chosen.size === 0) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', `/api/biostat-bridge/designs/${encodeURIComponent(a.studyId)}/tasks`, {
        keys: [...chosen], ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const body = (await res.json().catch(() => null)) as { data?: { created?: unknown[]; skipped?: string[] } } | null;
      if (!res.ok || !Array.isArray(body?.data?.created)) {
        onError('No tasks were raised — ' + (serverMessage(body) ?? `HTTP ${res.status}`) + '.');
        return;
      }
      const c = body!.data!.created!.length;
      const s = body!.data!.skipped?.length ?? 0;
      onDone(`${c} task${c === 1 ? '' : 's'} raised on the board${s ? ` (${s} already open, skipped)` : ''} — each carries the design as its source.`);
    } catch (e) {
      onError('No tasks were raised — ' + (e instanceof Error ? e.message : String(e)) + '.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pj-card-b" style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'grid', gap: 8 }} role="group" aria-label="Raise tasks">
      <div style={{ fontSize: 12, fontWeight: 600 }}>Tasks proposed by the assessment</div>
      {open.length === 0 ? (
        <div style={muted}>Every proposed task is already on the board.</div>
      ) : open.map((t) => (
        <label key={t.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={chosen.has(t.key)} onChange={() => toggle(t.key)} aria-label={t.title} />
          <span>
            <span className={'rd-chip tone-' + (t.priority === 'critical' ? 'err' : t.priority === 'high' ? 'warn' : 'idle')} style={{ marginRight: 6 }}>{t.priority}</span>
            <b>{t.title}</b>
            <span style={{ ...muted, display: 'block' }}>{t.trigger} — {t.description}</span>
          </span>
        </label>
      ))}
      {a.existingTaskKeys.length > 0 && (
        <div style={muted}>{a.existingTaskKeys.length} task{a.existingTaskKeys.length === 1 ? ' is' : 's are'} already open on the board for this design.</div>
      )}
      <label style={{ fontSize: 12, display: 'block' }}>
        Reason (optional)
        <input className="c2c-input" style={{ height: 30, width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why these tasks are being raised" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ height: 30 }} disabled={busy || chosen.size === 0} onClick={() => void submit()}>{busy ? 'Raising…' : `Raise ${chosen.size} task${chosen.size === 1 ? '' : 's'}`}</button>
        <button className="btn" style={{ height: 30 }} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Filing placement note (designer document bar) ───────────────────────────

export function FilingPlacementNote({ placement }: { placement: BridgePlacement | null }) {
  if (!placement) return null;
  const app = APP_LABELS[placement.applicationType] ?? placement.applicationType;
  if (placement.required === 'not_applicable') {
    return <span style={muted} title={placement.note}>Not filed with the {app} — {placement.heading.toLowerCase()}</span>;
  }
  return (
    <span style={muted} title={placement.note}>
      {app}: <span className="mono">{placement.code}</span>{placement.module ? ` (${placement.module})` : ''} · {gradeLabel[placement.required]} — {placement.heading}
    </span>
  );
}

// ─── Statistics tab (protocol workspace) ─────────────────────────────────────

export function StudyDesignStatisticsTab({ onNav }: { onNav: (id: string) => void }) {
  const designs = useBridgeDesigns();
  return (
    <div className="pd-pane">
      <div className="pd-pane-h">
        <div><h2 className="pd-pane-t">Statistics</h2><div className="pd-pane-s">Statistical readiness of the {scopeLabel() === 'org-scoped' ? "organization's" : "program's"} persisted study designs — sample size, power, estimand and analysis plan, as the design record holds them.</div></div>
      </div>
      {designs.loading ? (
        <div role="status" className="scaf-note" style={{ margin: 12 }}>Loading study designs…</div>
      ) : designs.error ? (
        <div style={{ padding: 12 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load study designs" hint="The design store didn't respond. Sign in and retry, or check that the study-design service is reachable." /></div>
      ) : designs.empty ? (
        <div style={{ padding: 12 }}><EmptyState icon={I.fileText} title="No persisted study design for this scope" hint="A protocol's statistics live on its study design (CDISC PRM). Persist a design and its readiness appears here with a link into the Biostatistics designer." /></div>
      ) : (
        <div style={{ display: 'grid', gap: 10, padding: 12 }}>
          {designs.rows.map((d) => {
            const failed = d.readiness.checks.filter((c) => !c.ok);
            return (
              <div key={d.studyId} className="pj-card">
                <div className="pj-card-h">
                  <span className="t">{d.title}</span>
                  <span className="s">{[d.phase && 'Phase ' + d.phase, d.indication, d.status].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="pj-card-b" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
                    <span className={'rd-chip tone-' + readinessTone(d.readiness.percent)}>{d.readiness.percent}% ready</span>
                    <span><b>{d.readiness.plannedSampleSize ?? '—'}</b> planned subjects</span>
                    <span><b>{pct(d.readiness.power)}</b> power</span>
                    <span><b>{d.readiness.alpha ?? '—'}</b> alpha</span>
                    <span style={muted}>{d.readiness.primaryEndpoint ? 'Primary: ' + d.readiness.primaryEndpoint : 'No primary endpoint'}</span>
                  </div>
                  {failed.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 2 }} aria-label={`Open statistical checks for ${d.title}`}>
                      {failed.map((c) => <li key={c.key}>{c.label}{c.hint ? <span style={muted}> — {c.hint}</span> : null}</li>)}
                    </ul>
                  )}
                  <div>
                    <button className="btn primary" style={{ height: 28, fontSize: 12 }} onClick={() => openDesignInBiostatistics(d.studyId, onNav)}>
                      {I.sigma} Open in Biostatistics
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
