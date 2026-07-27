/**
 * RBM shared kit — status chips, sparklines, gauges, matrices, modals,
 * the AnA resolver + dock, and the cross-surface action store.
 * Sub-surfaces are in RbmSurfacesA (1-5) and RbmSurfacesB (6-10).
 */
import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { GovernedActionSignoff } from '../../components/ana/GovernedActionSignoff';
import type { PendingSignoff } from '../../components/ana/useGovernedAction';
import type { AnaChatAction } from '../../components/ana/useAnaChat';
import { RBM_VOCAB, rbmBand, kriStatusOf, type RbmNavItem } from '../fixtures/rbm-data';
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

/* ── RbmFreshness ── */
export function RbmFreshness({ at }: { at: string }) {
  return <span className="rbm-fresh">{I.clock}scored {at}</span>;
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
              title={`Likelihood ${c.l} x impact ${c.i} = ${c.l * c.i} (${c.band}) -- ${c.n} item${c.n === 1 ? '' : 's'}`}
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
  if (!values || values.length < 2) return <span className="rbm-spark-empty">No history -- add the first reading</span>;
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
 *
 * Direction-aware, because the danger band has to sit on the side the limit
 * actually bites. An attainment parameter — "primary endpoint completeness
 * >= 90%" — is breached BELOW its threshold. Drawn as a single upper bound, a
 * study sitting at 40% would render with its needle in clear space and the red
 * band far off to the right: a picture of control at the exact point of losing
 * it. Same defect the engine had, and a gauge that disagrees with the engine is
 * worse than no gauge.
 *
 * `upper` and `lower` fill from the left (the domain starts at zero, so bar
 * length reads as magnitude). `two_sided` shows a needle instead — its domain is
 * a window around the acceptable range, so a bar from the left edge would be
 * measuring from an arbitrary origin.
 */
export type GaugeDirection = 'upper' | 'lower' | 'two_sided';

export function ThresholdGauge({
  current,
  secondary,
  threshold,
  unit,
  direction = 'upper',
  thresholdLower = null,
  secondaryLower = null,
}: {
  current: number;
  secondary: number;
  threshold: number;
  unit: string;
  direction?: GaugeDirection;
  /** two_sided only: the lower bound. Without it the range is not drawable. */
  thresholdLower?: number | null;
  secondaryLower?: number | null;
}) {
  // A two_sided limit missing its lower bound is not a range; fall back to the
  // upper reading rather than inventing the other side.
  const twoSided = direction === 'two_sided' && thresholdLower != null;
  const lower = direction === 'lower';

  let lo = 0;
  let hi = Math.max(threshold * 1.25, secondary * 1.1, current * 1.05, 1e-9);
  if (twoSided) {
    const span = Math.max(threshold - (thresholdLower as number), 1e-9);
    const pad = span * 0.4;
    lo = Math.min((thresholdLower as number) - pad, current);
    hi = Math.max(threshold + pad, current);
    if ((thresholdLower as number) >= 0) lo = Math.max(0, lo);
  }
  const pc = (v: number) => {
    const span = hi - lo || 1;
    return Math.min(100, Math.max(0, ((v - lo) / span) * 100));
  };
  // Band widths are clamped at zero so a misconfigured limit (secondary on the
  // wrong side of the threshold) collapses the band instead of inverting it.
  const band = (from: number, to: number) => ({ left: `${from}%`, width: `${Math.max(0, to - from)}%` });

  // Tone mirrors qtlStatus so the colour never contradicts the stored status.
  const tone = twoSided
    ? current >= threshold || current <= (thresholdLower as number)
      ? 'err'
      : current >= secondary || (secondaryLower != null && current <= secondaryLower)
        ? 'warn'
        : 'ok'
    : lower
      ? current <= threshold ? 'err' : current <= secondary ? 'warn' : 'ok'
      : current >= threshold ? 'err' : current >= secondary ? 'warn' : 'ok';

  const limitText = twoSided
    ? `range ${thresholdLower}${unit} to ${threshold}${unit}`
    : lower
      ? `limit ${threshold}${unit} -- warn below ${secondary}${unit}`
      : `warn ${secondary}${unit} -- limit ${threshold}${unit}`;

  return (
    <div className="rbm-gauge" role="img" aria-label={`Current ${current}${unit} against ${limitText}`}>
      <div className="rbm-gauge-bar">
        {twoSided ? (
          <>
            <div className="rbm-gauge-band err" style={{ left: 0, width: `${pc(thresholdLower as number)}%` }} />
            <div className="rbm-gauge-band err" style={{ left: `${pc(threshold)}%`, right: 0 }} />
            {secondaryLower != null && (
              <div className="rbm-gauge-band warn" style={band(pc(thresholdLower as number), pc(secondaryLower))} />
            )}
            <div className="rbm-gauge-band warn" style={band(pc(secondary), pc(threshold))} />
            <div className="rbm-gauge-tick hard" style={{ left: `${pc(thresholdLower as number)}%` }} title={`Lower tolerance limit ${thresholdLower}${unit}`} />
            <div className="rbm-gauge-tick hard" style={{ left: `${pc(threshold)}%` }} title={`Upper tolerance limit ${threshold}${unit}`} />
            <div className="rbm-gauge-needle" data-tone={tone} style={{ left: `${pc(current)}%` }} title={`Current ${current}${unit}`} />
          </>
        ) : lower ? (
          <>
            <div className="rbm-gauge-band err" style={{ left: 0, width: `${pc(threshold)}%` }} />
            <div className="rbm-gauge-band warn" style={band(pc(threshold), pc(secondary))} />
            <div className="rbm-gauge-fill" data-tone={tone} style={{ width: `${pc(current)}%` }} />
            <div className="rbm-gauge-tick hard" style={{ left: `${pc(threshold)}%` }} title={`Primary threshold ${threshold}${unit}`} />
            <div className="rbm-gauge-tick" style={{ left: `${pc(secondary)}%` }} title={`Secondary (early warning) ${secondary}${unit}`} />
          </>
        ) : (
          <>
            <div className="rbm-gauge-band warn" style={band(pc(secondary), pc(threshold))} />
            <div className="rbm-gauge-band err" style={{ left: `${pc(threshold)}%`, right: 0 }} />
            <div className="rbm-gauge-fill" data-tone={tone} style={{ width: `${pc(current)}%` }} />
            <div className="rbm-gauge-tick" style={{ left: `${pc(secondary)}%` }} title={`Secondary (early warning) ${secondary}${unit}`} />
            <div className="rbm-gauge-tick hard" style={{ left: `${pc(threshold)}%` }} title={`Primary threshold ${threshold}${unit}`} />
          </>
        )}
      </div>
      <div className="rbm-gauge-lbl"><span>{current}{unit}</span><span className="mut">{limitText}</span></div>
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
  return (
    <div className="rbm-modal-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="rbm-modal">
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
        {error && <div className="rbm-modal-note" role="alert" style={{ color: '#e5484d' }}>{error}</div>}
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
  return (
    <div className="rbm-modal-scrim" role="dialog" aria-modal="true" aria-label={`Approve ${what}`}>
      <div className="rbm-modal">
        <div className="rbm-modal-h">{I.lock}<span>Approval requires e-signature</span></div>
        <div className="rbm-modal-what"><b>{what}</b> -- status will move to <b>active</b>. {meaning}</div>
        <label className="rbm-field"><span>Reason for change</span>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="State why this version is being approved" /></label>
        <div className="rbm-field-row">
          <label className="rbm-field"><span>Password</span><input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="off" /></label>
          <label className="rbm-field"><span>Authenticator code</span><input inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="6 digits" /></label>
        </div>
        <div className="rbm-modal-note">Signature meaning: approval (21 CFR 11.50 / 11.200). Your password -- and your authenticator code if MFA is enabled -- are verified server-side before signing; the signer, timestamp and reason are written to the immutable audit trail.</div>
        {err && <div className="rbm-modal-note" style={{ color: '#e5484d' }}>{err}</div>}
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
}

/** The REAL Part 11 sign-off prompts AnA returned for governed RBM commands,
    each resolving through GovernedActionSignoff (POST /api/ana-ri/governed-action)
    to the server's confirmation — never a fabricated result. */
function RbmSignoffs({ signoffs }: { signoffs: PendingSignoff[] }) {
  const [outcomes, setOutcomes] = useState<Record<number, string>>({});
  const [dismissed, setDismissed] = useState<Record<number, boolean>>({});
  return (
    <div className="rbm-ana-signoffs">
      {signoffs.map((s, i) => {
        if (dismissed[i]) return null;
        if (outcomes[i]) {
          return (
            <div key={`${s.command}-${i}`} className="rbm-ana-signoff-done" role="status">
              {I.check} {outcomes[i]}
            </div>
          );
        }
        return (
          <GovernedActionSignoff
            key={`${s.command}-${i}`}
            signoff={s}
            onResolved={(o) => setOutcomes((p) => ({ ...p, [i]: o.message }))}
            onCancel={() => setDismissed((p) => ({ ...p, [i]: true }))}
          />
        );
      })}
    </div>
  );
}

function RbmAnaMsg({ m }: { m: RbmAnaMessage }) {
  if (m.role === 'user') return <div className="rbm-ana-user">{m.text}</div>;
  return (
    <div className="rbm-ana-ai">
      <div className="rbm-ana-who"><span className="mk">{'✻'}</span>AnA</div>
      {m.text && <div className="rbm-ana-text">{m.text}</div>}
      {Array.isArray(m.executedActions) && m.executedActions.length > 0 && (
        <div className="rbm-ana-chips">
          {m.executedActions.map((a, i) => (
            <span
              key={i}
              className="rbm-chip"
              data-tone={a.error ? 'err' : a.executed ? 'ok' : 'ai'}
              title={a.error || a.label}
            >
              {(I as Record<string, React.ReactNode>)[a.error ? 'shieldAlert' : a.executed ? 'check' : 'zap']}
              {a.label}
            </span>
          ))}
        </div>
      )}
      {Array.isArray(m.pendingSignoffs) && m.pendingSignoffs.length > 0 && (
        <RbmSignoffs signoffs={m.pendingSignoffs} />
      )}
    </div>
  );
}

/* ── RbmAnaDock ── */
export function RbmAnaDock({ nav, study, msgs, onAsk, onClose }: {
  nav: RbmNavItem; study: string; msgs: RbmAnaMessage[];
  onAsk: (t: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [msgs]);
  const ask = (text: string) => { if (!text) return; onAsk(text); setDraft(''); };
  return (
    <aside className="rbm-ana" aria-label="AnA -- risk-based monitoring">
      <div className="rbm-ana-hdr">
        <div className="rbm-ana-id"><span className="mk">{'✻'}</span><div><div className="nm">AnA -- RBM co-monitor</div><div className="md">bound to {study} -- {nav.label}</div></div></div>
        <button className="tb-btn" onClick={onClose} title="Collapse">{I.panelRight}</button>
      </div>
      <div className="rbm-ana-ctx">
        <div className="rbm-ana-ctx-k">On this surface</div>
        <div className="rbm-ana-ctx-v">{nav.label} -- tool <code>{nav.tool}</code></div>
        <div className="rbm-ana-ctx-note">{I.info}AnA runs the same 9 RBM tools the buttons run -- ask, and results deep-link into the surface. Advisory outputs (plans, reports) are drafts until approved.</div>
      </div>
      <div className="rbm-ana-scroll" ref={endRef}>
        <div className="rbm-ana-starters">
          <div className="rbm-ana-starters-l">Starters for {nav.label.toLowerCase()}</div>
          {nav.starters.map((s, i) => <button key={i} className="rbm-starter" onClick={() => ask(s)}>{s}</button>)}
        </div>
        {msgs.map((m, i) => <RbmAnaMsg key={i} m={m} />)}
      </div>
      <div className="rbm-ana-composer">
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(draft.trim()); }} placeholder={`Ask AnA about ${study}...`} />
        <button className="rbm-ana-send" disabled={!draft.trim()} onClick={() => ask(draft.trim())}>{I.zap}</button>
      </div>
    </aside>
  );
}
