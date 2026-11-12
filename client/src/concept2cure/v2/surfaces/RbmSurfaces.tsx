/**
 * RBM shared kit — status chips, sparklines, gauges, matrices, modals,
 * the AnA resolver + dock, and the cross-surface action store.
 * Sub-surfaces are in RbmSurfacesA (1-5) and RbmSurfacesB (6-10).
 */
import { AnaActionChip } from '../AnaActionChips';
import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import { SignoffList } from '../SignoffList';
import type { PendingSignoff } from '../../components/ana/useGovernedAction';
import type { AnaChatAction, AnaChatMessage, RunControlStatus } from '../../components/ana/useAnaChat';
import { AnaProgressChip, AnaWorkPanel } from '../AnaWorkPanel';
import { AnaActivity, type AnaActivityProps } from '../AnaActivity';
import { RunPolicyDockNote } from '../RunPolicySwitch';
import { AnaOutputCards, type AnaOutput } from '../AnaOutputs';
import { AnaMarkdown } from '../AnaMarkdown';
import { useAgentActivity } from '../useAgentActivity';
import { useProgressDock } from '../workDock';
import { shellProgramName } from '../shellProject';
import { RBM_VOCAB, rbmBand, kriStatusOf, type RbmNavItem } from '../fixtures/rbm-data';
import { useDialog } from '../useDialog';
import '../styles/rbm-v2.css';

/* Re-export surfaces so Rbm.tsx imports from one place */
export { RbmOverview, RbmReport, RbmRact, RbmKris, RbmQtls } from './RbmSurfacesA';
export { RbmSignals, RbmPatients, RbmSites, RbmOversight, RbmPlan } from './RbmSurfacesB';

/* The cross-surface in-memory action store that used to live here is gone.
   Monitoring actions raised anywhere in RBM — signal escalations, oversight
   visits, plan items — are now written to /api/mdx/rbm-monitoring-actions and
   read back off the board, so the plan column counts reflect the database and
   survive a reload instead of a page-local singleton. */

/* ── Tone icons ── */
const TONE_ICON: Record<string, string> = { ok: 'check', warn: 'alertTriangle', err: 'shieldAlert', ai: 'info', neutral: 'info' };

/* ── StatusChip ── */
export function RbmChip({ vocab, value, num }: { vocab: string; value: string; num?: number }) {
  const m = (RBM_VOCAB[vocab] || {})[value] || { l: value, tone: 'neutral' };
  return <span className="rbm-chip" data-tone={m.tone}>{(I as Record<string, React.ReactNode>)[TONE_ICON[m.tone] || 'info']}{m.l}{num !== undefined ? <b>{num}</b> : null}</span>;
}

/* ── RbmScore ── */
export function RbmScore({ v }: { v: number }) {
  return <span className="rbm-score" data-band={rbmBand(v)}>{v}</span>;
}

/* ── RbmWhen, RbmFreshness ── */
/** A recorded time reads as a time, not as the raw ISO string (demo walk, 2026-11-09); '—' and other words pass. */
export function RbmWhen({ at }: { at: string }) {
  return /^\d{4}-\d\d-\d\dT/.test(at) ? <GovernedTimestamp value={at} layout="inline" /> : <>{at}</>;
}
export function RbmFreshness({ at }: { at: string }) {
  return <span className="rbm-fresh">{I.clock}scored <RbmWhen at={at} /></span>;
}

/* ── AskAna ──
   The board's own findings, taken to the conversation. Every sub-surface was handed `onAsk` and only the risk
   report used it, so a monitor looking at a red indicator or a flagged site had to retype what was on screen into
   the dock. The button sends a question that names the item; AnA answers from the same board (her grounding is
   this surface's context, Rbm.tsx) and from the monitoring tools, never from a figure typed here. It is not drawn
   where no conversation is attached. */
export function AskAna({ onAsk, prompt, label = 'Ask AnA', title }: {
  onAsk?: (t: string) => void; prompt: string; label?: string; title?: string;
}) {
  if (!onAsk) return null;
  return (
    <button type="button" className="rbm-linkbtn rbm-ask" title={title ?? 'Sends this question to AnA, beside the board'}
      onClick={e => { e.stopPropagation(); onAsk(prompt); }}>
      <span className="mk" aria-hidden="true">{'✻'}</span>{label}
    </button>
  );
}

/* ── RiskMatrix ── */
export function RiskMatrix({ items, sel, onSel }: { items: { l: number; i: number }[]; sel: { l: number; i: number } | null; onSel: (c: { l: number; i: number } | null) => void }) {
  const cells: { l: number; i: number; n: number; band: string }[] = [];
  for (let im = 5; im >= 1; im--) for (let l = 1; l <= 5; l++) {
    const n = items.filter(it => it.l === l && it.i === im).length;
    cells.push({ l, i: im, n, band: rbmBand(l * im) });
  }
  return (
    <div className="rbm-mx" role="grid" aria-label="Likelihood by impact risk matrix">
      <div className="rbm-mx-y">Impact</div>
      <div className="rbm-mx-grid">
        {cells.map(c => {
          const on = sel && sel.l === c.l && sel.i === c.i;
          return (
            <button key={`${c.l}-${c.i}`} className="rbm-mx-cell" data-band={c.band} data-on={on || undefined} data-empty={c.n === 0 || undefined}
              title={`Likelihood ${c.l} x impact ${c.i} = ${c.l * c.i} (${c.band}) — ${c.n} item${c.n === 1 ? '' : 's'}`}
              onClick={() => onSel(on ? null : { l: c.l, i: c.i })}>
              <span className="rbm-mx-n">{c.n || ''}</span><span className="rbm-mx-s">{c.l * c.i}</span>
            </button>
          );
        })}
      </div>
      <div className="rbm-mx-x">Likelihood</div>
    </div>
  );
}

/* ── Sparkline ── */
export function Sparkline({ values, amber, red, w = 132, h = 34 }: { values: number[]; amber: number | null; red: number | null; w?: number; h?: number }) {
  if (!values || values.length < 2) return <span className="rbm-spark-empty">No history — add the first reading</span>;
  const refs = [amber, red].filter((n): n is number => n != null);
  const all = values.concat(refs);
  const mn = Math.min(...all), mx = Math.max(...all), span = (mx - mn) || 1;
  const xp = (i: number) => 2 + i * (w - 4) / (values.length - 1);
  const yp = (v: number) => h - 3 - (v - mn) * (h - 6) / span;
  const pts = values.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');
  return (
    <svg className="rbm-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {red != null && <line x1="2" x2={w - 2} y1={yp(red)} y2={yp(red)} className="g-red" />}
      {amber != null && <line x1="2" x2={w - 2} y1={yp(amber)} y2={yp(amber)} className="g-amber" />}
      <polyline points={pts} className="ln" />
      <circle cx={xp(values.length - 1)} cy={yp(values[values.length - 1])} r="2.6" className="dot" />
    </svg>
  );
}

/* ── ThresholdGauge ──
   A tolerance limit and where the value stands against it. `upper` (higher is worse) is drawn as it always was.
   The server has also kept `lower` limits (lower is worse: data completeness, consent documentation) and
   `two_sided` ranges (a randomisation ratio, a dosing band) since 2026-09-30, and the screen could neither set nor
   draw them. For those the bar shows the breach and early-warning zones on the side, or sides, where the limit
   bites, and a mark at the value. The mark's tone is the engine's status: the screen does not band the value. */
const QTL_TONE: Record<string, string> = { breached: 'err', approaching: 'warn', within: 'ok' };

/** The limits in words, for the caption under the bar and for a reader who cannot see it. */
export function toleranceWords(q: { direction?: string; threshold: number; secondary: number | null; thresholdLower?: number | null; secondaryLower?: number | null }, unit = ''): string {
  const n = (v: number) => `${v}${unit}`;
  if (q.direction === 'two_sided' && q.thresholdLower != null) {
    const warn = [q.secondaryLower != null ? `below ${n(q.secondaryLower)}` : null, q.secondary != null ? `above ${n(q.secondary)}` : null].filter(Boolean).join(' or ');
    return `range ${n(q.thresholdLower)} to ${n(q.threshold)}${warn ? ` — warn ${warn}` : ''}`;
  }
  if (q.direction === 'lower') return `limit ${n(q.threshold)} or below${q.secondary != null ? ` — warn at ${n(q.secondary)}` : ''}`;
  return `warn ${n(q.secondary ?? q.threshold)} — limit ${n(q.threshold)}`;
}

interface GaugeProps {
  current: number; secondary: number; threshold: number; unit: string;
  /** `lower` or `two_sided`; absent or `upper` keeps the original drawing. */
  direction?: string; thresholdLower?: number | null; secondaryLower?: number | null;
  /** The engine's status for the value, which sets the mark's tone for a lower limit or a range. */
  status?: string;
}

/** A lower limit or a range: the zones where the limit bites, and a mark at the value. */
function BoundedGauge({ current, secondary, threshold, unit, direction, thresholdLower, secondaryLower, status }: GaugeProps) {
  const lower = direction === 'two_sided' && thresholdLower != null ? thresholdLower : null;
  const warnUpper = secondary === threshold ? null : secondary;
  const warnLower = lower != null ? secondaryLower ?? null : null;
  const words = toleranceWords({ direction, threshold, secondary: warnUpper, thresholdLower, secondaryLower }, unit);
  const points = [current, threshold, warnUpper, lower, warnLower].filter((v): v is number => v != null && Number.isFinite(v));
  const lo = Math.min(...points), hi = Math.max(...points), pad = ((hi - lo) || Math.abs(hi) || 1) * 0.12;
  const pc = (v: number) => Math.max(0, Math.min(100, (v - (lo - pad)) / ((hi + pad) - (lo - pad)) * 100));
  // [from, to, kind] in percent of the bar: a range has a breach zone at each end, a lower limit at the low end.
  const zones: [number, number, string][] = lower != null
    ? [[0, pc(lower), 'err'], [pc(threshold), 100, 'err']]
    : [[0, pc(threshold), 'err']];
  if (lower != null && warnLower != null) zones.push([pc(lower), pc(warnLower), 'warn']);
  if (warnUpper != null) zones.push(lower != null ? [pc(warnUpper), pc(threshold), 'warn'] : [pc(threshold), pc(warnUpper), 'warn']);
  return (
    <div className="rbm-gauge" role="img" aria-label={`Current ${current}${unit}; ${words}`}>
      <div className="rbm-gauge-bar">
        {zones.map(([from, to, kind], i) => <div key={i} className={`rbm-gauge-band ${kind}`} style={{ left: `${from}%`, width: `${Math.max(0, to - from)}%` }} />)}
        <div className="rbm-gauge-mark" data-tone={QTL_TONE[status ?? ''] ?? 'neutral'} style={{ left: `${pc(current)}%` }} />
      </div>
      <div className="rbm-gauge-lbl"><span>{current}{unit}</span><span className="mut">{words}</span></div>
    </div>
  );
}

export function ThresholdGauge(props: GaugeProps) {
  if (props.direction === 'lower' || props.direction === 'two_sided') return <BoundedGauge {...props} />;
  const { current, secondary, threshold, unit } = props;
  const max = Math.max(threshold * 1.25, current * 1.05);
  const pc = (v: number) => Math.min(100, v / max * 100);
  const tone = current >= threshold ? 'err' : current >= secondary ? 'warn' : 'ok';
  return (
    <div className="rbm-gauge" role="img" aria-label={`Current ${current}${unit} against early-warning limit ${secondary}${unit} and threshold ${threshold}${unit}`}>
      <div className="rbm-gauge-bar">
        <div className="rbm-gauge-band warn" style={{ left: `${pc(secondary)}%`, width: `${pc(threshold) - pc(secondary)}%` }} />
        <div className="rbm-gauge-band err" style={{ left: `${pc(threshold)}%`, right: 0 }} />
        <div className="rbm-gauge-fill" data-tone={tone} style={{ width: `${pc(current)}%` }} />
        <div className="rbm-gauge-tick" style={{ left: `${pc(secondary)}%` }} title={`Secondary (early warning) ${secondary}${unit}`} />
        <div className="rbm-gauge-tick hard" style={{ left: `${pc(threshold)}%` }} title={`Primary threshold ${threshold}${unit}`} />
      </div>
      <div className="rbm-gauge-lbl"><span>{current}{unit}</span><span className="mut">warn {secondary}{unit} — limit {threshold}{unit}</span></div>
    </div>
  );
}

/* ── DimBars ── */
export function DimBars({ enr, qual, ops }: { enr: number; qual: number; ops: number }) {
  const dims: [string, number][] = [['Enr', enr], ['Qual', qual], ['Ops', ops]];
  return (
    <div className="rbm-dims">
      {dims.map(([k, v]) => (
        <div key={k} className="rbm-dim" title={`${k === 'Enr' ? 'Enrollment' : k === 'Qual' ? 'Quality' : 'Operational'} risk ${v}/25`}>
          <span className="k">{k}</span>
          <span className="bar"><span data-band={rbmBand(v)} style={{ width: `${v / 25 * 100}%` }} /></span>
          <span className="v">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ── SeedEmpty ── */
export function SeedEmpty({ title, body, actions, onRun }: { title: string; body: string; actions: string[]; onRun?: (a: string) => void }) {
  return (
    <div className="rbm-empty">
      <div className="rbm-empty-ic">{I.clipboardList}</div>
      <h3>{title}</h3><p>{body}</p>
      <div className="rbm-empty-acts">
        {actions.map((a, i) => <button key={i} className={`rbm-btn${i === 0 ? ' pri' : ''}`} onClick={() => onRun && onRun(a)}>{a}</button>)}
      </div>
    </div>
  );
}

/* ── TrendTable ── */
export function TrendTable({ kri }: { kri: { name: string; unit: string; spark: number[]; dir: string; amber: number | null; red: number | null } }) {
  return (
    <table className="rbm-trend-tbl">
      <caption className="rbm-sr">Reading history for {kri.name}, in {kri.unit}</caption>
      <thead><tr><th>#</th><th>Value</th><th>Status</th></tr></thead>
      <tbody>
        {kri.spark.map((val, i) => {
          const st = (kri.amber != null && kri.red != null) ? kriStatusOf({ dir: kri.dir, amber: kri.amber, red: kri.red }, val) : null;
          return <tr key={i}><td>{i + 1}</td><td className="mono">{val}{kri.unit}</td><td>{st ? <RbmChip vocab="kri" value={st} /> : <span className="mut">—</span>}</td></tr>;
        })}
      </tbody>
    </table>
  );
}

/* ── Form fields type ── */
export interface FormField { key: string; label: string; type: string; options?: string[]; labels?: Record<string, string>; min?: number; max?: number; optional?: boolean; hint?: string }

/* ── RbmFormModal ──
   Every RBM form writes to the server. `busy` disables the dialog while the
   write is in flight, and `error` shows the server's own rejection in place —
   the dialog stays open with the operator's input intact, because closing it on
   a failed save would imply the change was accepted. The caller closes the
   dialog only after the write actually lands. */
export function RbmFormModal({ title, intro, fields, initial, submitLabel, busy, error, onCancel, onSubmit }: {
  title: string; intro?: string; fields: FormField[]; initial?: Record<string, string> | null; submitLabel?: string;
  busy?: boolean; error?: string | null;
  onCancel: () => void; onSubmit: (v: Record<string, string>) => void;
}) {
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    fields.forEach(f => { o[f.key] = (initial && initial[f.key] !== undefined) ? initial[f.key] : (f.type === 'select' && f.options ? f.options[0] : ''); });
    return o;
  });
  const set = (k: string, val: string) => setV(s => ({ ...s, [k]: val }));
  const missing = fields.some(f => !f.optional && (v[f.key] === '' || v[f.key] == null));
  const inputType = (t: string) => (t === 'number' ? 'number' : t === 'date' ? 'date' : 'text');
  /* Escape + focus-on-open + focus-return, and the dialog semantics moved from
     the scrim onto the panel they describe. */
  const dialogRef = useDialog(onCancel);

  return (
    <div className="rbm-modal-scrim">
      <div
        className="rbm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="rbm-modal-h">{I.penLine}<span>{title}</span></div>
        {intro && <div className="rbm-modal-what">{intro}</div>}
        {fields.map(f => (
          <label key={f.key} className="rbm-field"><span>{f.label}</span>
            {f.type === 'textarea' ? <textarea rows={2} value={v[f.key]} disabled={busy} onChange={e => set(f.key, e.target.value)} />
              : f.type === 'select' && f.options ? <select value={v[f.key]} disabled={busy} onChange={e => set(f.key, e.target.value)}>{f.options.map(o => <option key={o} value={o}>{f.labels ? f.labels[o] : o}</option>)}</select>
              : <input type={inputType(f.type)} min={f.min} max={f.max} disabled={busy} value={v[f.key]} onChange={e => set(f.key, e.target.value)} />}
            {f.hint && <em className="rbm-field-hint">{f.hint}</em>}
          </label>
        ))}
        {error && <div className="rbm-modal-note" role="alert" style={{ color: 'var(--error)' }}>{error}</div>}
        <div className="rbm-modal-acts">
          <button className="rbm-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="rbm-btn pri" disabled={missing || busy} onClick={() => onSubmit(v)}>{busy ? 'Saving…' : (submitLabel || 'Save')}</button>
        </div>
      </div>
    </div>
  );
}

/* ── GovernedApprovalDialog — real audited approval ──
   The signer identity, timestamp and audit entry are written server-side by the
   RBM approve endpoints (approved_by = the authenticated user, approved_at =
   NOW, reason captured in metadata), never fabricated client-side. onSigned
   performs the real POST and returns an error string on failure so the dialog
   can surface it honestly. */
export function GovernedApprovalDialog({ what, meaning, onCancel, onSigned }: {
  what: string; meaning: string; onCancel: () => void;
  onSigned: (sig: { reason: string; password: string; mfaToken: string }) => Promise<string | void>;
}) {
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The server verifies the password always and the TOTP only when the signer
  // has MFA enabled, so the authenticator code is optional here (a wrong/absent
  // code is rejected server-side, never waved through).
  const ok = reason.trim().length >= 8 && pw.length >= 4 && (otp.length === 0 || otp.length === 6) && !busy;
  const submit = async () => {
    setBusy(true); setErr(null);
    const e = await onSigned({ reason: reason.trim(), password: pw, mfaToken: otp });
    if (e) { setErr(e); setBusy(false); }
  };
  /* The e-signature panel: it had the role but no Escape and no focus hand-off,
     so a keyboard user could reach the approval ceremony and not leave it. */
  const dialogRef = useDialog(onCancel);

  return (
    <div className="rbm-modal-scrim">
      <div
        className="rbm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Approve ${what}`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="rbm-modal-h">{I.lock}<span>Approval requires e-signature</span></div>
        <div className="rbm-modal-what"><b>{what}</b> — status will move to <b>active</b>. {meaning}</div>
        <label className="rbm-field"><span>Reason for change</span>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="State why this version is being approved" /></label>
        <div className="rbm-field-row">
          <label className="rbm-field"><span>Password</span><input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="off" /></label>
          <label className="rbm-field"><span>Authenticator code</span><input inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="6 digits" /></label>
        </div>
        <div className="rbm-modal-note">Signature meaning: approval (21 CFR 11.50 / 11.200). Your password — and your authenticator code if MFA is enabled — are verified server-side before signing; the signer, timestamp and reason are written to the immutable audit trail.</div>
        {err && <div className="rbm-modal-note" role="alert" style={{ color: 'var(--error)' }}>{err}</div>}
        <div className="rbm-modal-acts">
          <button className="rbm-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="rbm-btn pri" disabled={!ok} onClick={submit}>{busy ? 'Signing…' : 'Sign and activate'}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════ AnA — real streaming (no local resolver) ═══════
   The RBM dock streams the REAL assistant (useAnaChat → /api/ana-ri/stream).
   The former rbmAnaResolve() heuristic — which fabricated structured "AnA"
   cards from in-file fixture constants — is removed. Messages are the real
   turn: streamed text, the actions AnA actually executed, and, for a governed
   command, the real Part 11 sign-off. */

export interface RbmAnaMessage {
  role: string;
  text?: string;
  executedActions?: AnaChatAction[];
  pendingSignoffs?: PendingSignoff[];
  /** The shared record of her work this turn (AnaActivity.activityPropsFor). */
  activity?: AnaActivityProps;
  /** The draft this turn produced, for its output card. */
  output?: AnaOutput;
}

/** The REAL Part 11 sign-off prompts AnA returned for governed RBM commands,
    each resolving through GovernedActionSignoff (POST /api/ana-ri/governed-action)
    to the server's confirmation — never a fabricated result. */
function RbmSignoffs({ signoffs }: { signoffs: PendingSignoff[] }) {
  return (
    <SignoffList
      signoffs={signoffs}
      className="rbm-ana-signoffs"
      doneClassName="rbm-ana-signoff-done"
    />
  );
}

function RbmAnaMsg({
  m,
  onNav,
  onStartDemo,
}: {
  m: RbmAnaMessage;
  onNav?: (id: string) => void;
  onStartDemo?: (demoId: string, title: string) => void;
}) {
  if (m.role === 'user') return <div className="rbm-ana-user">{m.text}</div>;
  return (
    <div className="rbm-ana-ai">
      <div className="rbm-ana-who"><span className="mk">{'✻'}</span>AnA</div>
      {/* The same record, answer and output card, in the same order, every
          host renders. This pane used to drop the tools, rounds and drafts and
          show "Thinking…". */}
      {m.activity && <AnaActivity {...m.activity} />}
      {/* Her answer is prose: headings, lists and emphasis reached this pane as `##`, `-` and `**`. AnaMarkdown is
          the one renderer every other host uses. */}
      {m.text && <AnaMarkdown text={m.text} className="rbm-ana-text ana-md" />}
      {m.output && <AnaOutputCards message={m.output} />}
      {Array.isArray(m.executedActions) && m.executedActions.length > 0 && (
        <div className="rbm-ana-chips">
          {m.executedActions.map((a, i) =>
            onNav &&
            ((a.actionType === 'navigate' && a.targetId) ||
              (a.actionType === 'surface_action' && a.actionId) ||
              (a.actionType === 'start_demo' && a.demoId && onStartDemo)) ? (
              <AnaActionChip key={i} action={a} onNav={onNav} onStartDemo={onStartDemo} />
            ) : (
              <span
                key={i}
                className="rbm-chip"
                data-tone={a.error ? 'err' : a.executed ? 'ok' : 'ai'}
                title={a.error || a.label}
              >
                {(I as Record<string, React.ReactNode>)[a.error ? 'shieldAlert' : a.executed ? 'check' : 'zap']}
                {a.label}
              </span>
            ),
          )}
        </div>
      )}
      {Array.isArray(m.pendingSignoffs) && m.pendingSignoffs.length > 0 && (
        <RbmSignoffs signoffs={m.pendingSignoffs} />
      )}
    </div>
  );
}

/* ── RbmAnaDock ── */
/** The raw turns the live work dock reads — the pane's own chat instance. */
export interface RbmAnaWork {
  messages: AnaChatMessage[];
  streaming: boolean;
  runStatus: RunControlStatus;
  pendingSteers: string[];
}

/** The one composer AnA's conversation has on this screen: at the foot of the dock while it is open, under the
    page's title while it is closed (Rbm.tsx). Enter sends; Shift+Enter starts a new line. The run-policy note
    travels with it, because the chat it sends to is the same one in either place. */
export function RbmAnaComposer({ study, onSend }: { study: string; onSend: (t: string) => void }) {
  const [draft, setDraft] = useState('');
  const send = () => { const text = draft.trim(); if (!text) return; onSend(text); setDraft(''); };
  return (
    <>
      <div className="rbm-ana-composer">
        <textarea rows={1} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          aria-label="Ask AnA about this study" placeholder={study ? `Ask AnA about ${study}` : 'Ask AnA about this study'} />
        <button type="button" className="rbm-ana-send" aria-label="Send message to AnA" disabled={!draft.trim()} onClick={send}>{I.arrowUp}</button>
      </div>
      {/* This chat sends no run policy: Manual does not reach it (row 74). */}
      <RunPolicyDockNote />
    </>
  );
}

/** A tab's suggested questions, as the chips every work area uses (`.sp-starter`). */
export function RbmStarters({ nav, onAsk, layout }: { nav: RbmNavItem; onAsk: (t: string) => void; layout?: 'row' }) {
  return (
    <div className="sp-starters rbm-ana-starters" data-layout={layout} role="group" aria-label={`Suggestions for ${nav.label.toLowerCase()}`}>
      {nav.starters.map((s, i) => (
        <button key={i} type="button" className="sp-starter" onClick={() => onAsk(s)}>
          <span className="sk" aria-hidden="true">{I.sparkles}</span><span>{s}</span>
        </button>
      ))}
    </div>
  );
}

/** The conversation before its first turn: one question, what she is looking at, and what to ask. */
function RbmAnaHello({ nav, study, onAsk }: { nav: RbmNavItem; study: string; onAsk: (t: string) => void }) {
  return (
    <div className="rbm-ana-hello">
      <p className="rbm-ana-hello-t">{study ? `What should we look at in ${study}?` : 'What should we look at?'}</p>
      <div className="rbm-ana-ctx">
        <span className="rbm-ana-ctx-k">On this surface</span>
        <span className="rbm-ana-ctx-v">{nav.label}</span>
        <p className="rbm-ana-ctx-note">AnA reads the figures on this board and runs the same monitoring tools the buttons run. A plan or report she drafts stays a draft until it is approved.</p>
      </div>
      <RbmStarters nav={nav} onAsk={onAsk} />
    </div>
  );
}

export function RbmAnaDock({ nav, study, msgs, onAsk, onClose, work, onNav, onStartDemo, drawer }: {
  nav: RbmNavItem; study: string; msgs: RbmAnaMessage[];
  onAsk: (t: string) => void; onClose: () => void;
  work?: RbmAnaWork;
  /** The shell's navigation, so AnA's navigation and screen-action chips work. */
  onNav?: (id: string) => void;
  onStartDemo?: (demoId: string, title: string) => void;
  /** Below the docked width the conversation is a drawer over the board: a scrim, and Escape closes it. */
  drawer?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  /* The same progress panel every host mounts, under the one shared show/hide
     choice (workDock.ts); the chip in the header toggles it. */
  const dock = useProgressDock();
  const empty = msgs.length === 0;
  /* The record of her work has nothing to record before the first turn: its card said "AnA has not started a turn
     in this conversation" over a third of the panel. It and its chip appear with the first turn. */
  const hasWork = Boolean(work) && !empty;
  const showWork = hasWork && dock.open;
  const anaWorkQueue = useAgentActivity(showWork, work?.streaming);
  // Follow the newest turn. An empty conversation stays at its top, where the question is.
  useEffect(() => { if (endRef.current && msgs.length > 0) endRef.current.scrollTop = endRef.current.scrollHeight; }, [msgs]);
  const drawerRef = useDialog(onClose, Boolean(drawer));
  // Docked, it is a panel beside the board; as a drawer it is a dialog that takes focus.
  const frame = drawer
    ? { role: 'dialog', 'aria-modal': true, tabIndex: -1, ref: drawerRef as React.RefObject<HTMLElement> }
    : { 'data-docked': '' };
  const panel = (
    <aside className="rbm-ana de" aria-label="AnA — risk-based monitoring" {...frame}>
      <div className="de-h">
        <div>
          <div className="de-h-t"><span className="rbm-ana-mk" aria-hidden="true">{'✻'}</span>AnA</div>
          {/* Where the conversation is bound: the study and the tab open beside it. */}
          <div className="de-h-s">{[study, nav.label].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="rbm-ana-hdr-acts">
          {hasWork && work && (
            <AnaProgressChip
              ref={dock.chipRef}
              messages={work.messages}
              streaming={work.streaming}
              open={dock.open}
              onToggle={dock.toggle}
              controls={dock.panelId}
            />
          )}
          <button type="button" className="de-x" onClick={onClose} aria-label="Close AnA" title="Close AnA">{I.close}</button>
        </span>
      </div>
      {showWork && work && (
        <div className="ana-work-host">
          <AnaWorkPanel
            id={dock.panelId}
            messages={work.messages}
            streaming={work.streaming}
            runStatus={work.runStatus}
            pendingSteers={work.pendingSteers}
            queue={anaWorkQueue}
            context={{ project: shellProgramName(), module: 'Risk-based monitoring', surface: nav.label }}
          />
        </div>
      )}
      <div className="rbm-ana-scroll" ref={endRef}>
        {empty && <RbmAnaHello nav={nav} study={study} onAsk={onAsk} />}
        {msgs.map((m, i) => <RbmAnaMsg key={i} m={m} onNav={onNav} onStartDemo={onStartDemo} />)}
      </div>
      {/* With a conversation under way the open tab's suggestions stay one tap away, in one quiet row. */}
      {!empty && <RbmStarters nav={nav} onAsk={onAsk} layout="row" />}
      <RbmAnaComposer study={study} onSend={onAsk} />
    </aside>
  );
  if (!drawer) return panel;
  return <div className="de-bd" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>{panel}</div>;
}
