/**
 * RBM shared kit — status chips, sparklines, gauges, matrices, modals,
 * the AnA resolver + dock, and the cross-surface action store.
 * Sub-surfaces are in RbmSurfacesA (1-5) and RbmSurfacesB (6-10).
 */
import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import {
  RBM_VOCAB, RBM_KRIS, RBM_QTLS, RBM_SIGNALS, RBM_SITES, RBM_PATIENTS,
  RBM_SUMMARY, RBM_ATTENTION, RBM_REPORT,
  rbmBand, kriStatusOf, createRbmStore,
  type RbmAction, type RbmApproval, type RbmNavItem,
} from '../fixtures/rbm-data';
import type { RbmBoard } from './rbmBoard';
import '../styles/rbm-v2.css';

/* Re-export surfaces so Rbm.tsx imports from one place */
export { RbmOverview, RbmReport, RbmRact, RbmKris, RbmQtls } from './RbmSurfacesA';
export { RbmSignals, RbmPatients, RbmSites, RbmOversight, RbmPlan } from './RbmSurfacesB';

/* ── Shared action store (singleton) ── */
export const RBM_STORE = createRbmStore();

/**
 * Seed the cross-surface action store from the live board. Called by the shell
 * when the selected program changes, so the plan board and every surface that
 * raises actions work against the real, org-scoped monitoring actions.
 */
export function seedRbmActionsFromBoard(board: RbmBoard): void {
  RBM_STORE.seed(board.actions.map(a => ({
    id: String(a.id), type: a.type, title: a.title, priority: a.priority,
    owner: a.owner, due: a.due, status: a.status, overdue: a.overdue, origin: a.origin,
  })));
}

export function useRbmActions(): RbmAction[] {
  const [, force] = useState(0);
  useEffect(() => RBM_STORE.subscribe(() => force(n => n + 1)), []);
  return RBM_STORE.getActions();
}

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
export function Sparkline({ values, amber, red, w = 132, h = 34 }: { values: number[]; amber: number; red: number; w?: number; h?: number }) {
  if (!values || values.length < 2) return <span className="rbm-spark-empty">No history -- add the first reading</span>;
  const all = values.concat([amber, red]);
  const mn = Math.min(...all), mx = Math.max(...all), span = (mx - mn) || 1;
  const xp = (i: number) => 2 + i * (w - 4) / (values.length - 1);
  const yp = (v: number) => h - 3 - (v - mn) * (h - 6) / span;
  const pts = values.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');
  return (
    <svg className="rbm-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="2" x2={w - 2} y1={yp(red)} y2={yp(red)} className="g-red" />
      <line x1="2" x2={w - 2} y1={yp(amber)} y2={yp(amber)} className="g-amber" />
      <polyline points={pts} className="ln" />
      <circle cx={xp(values.length - 1)} cy={yp(values[values.length - 1])} r="2.6" className="dot" />
    </svg>
  );
}

/* ── ThresholdGauge ── */
export function ThresholdGauge({ current, secondary, threshold, unit }: { current: number; secondary: number; threshold: number; unit: string }) {
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
      <div className="rbm-gauge-lbl"><span>{current}{unit}</span><span className="mut">warn {secondary}{unit} -- limit {threshold}{unit}</span></div>
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
          const st = kriStatusOf({ dir: kri.dir, amber: kri.amber ?? 0, red: kri.red ?? 0 }, val);
          return <tr key={i}><td>{i + 1}</td><td className="mono">{val}{kri.unit}</td><td><RbmChip vocab="kri" value={st} /></td></tr>;
        })}
      </tbody>
    </table>
  );
}

/* ── Form fields type ── */
export interface FormField { key: string; label: string; type: string; options?: string[]; labels?: Record<string, string>; min?: number; max?: number; optional?: boolean }

/* ── RbmFormModal ── */
export function RbmFormModal({ title, intro, fields, initial, submitLabel, onCancel, onSubmit }: {
  title: string; intro?: string; fields: FormField[]; initial?: Record<string, string> | null; submitLabel?: string;
  onCancel: () => void; onSubmit: (v: Record<string, string>) => void;
}) {
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    fields.forEach(f => { o[f.key] = (initial && initial[f.key] !== undefined) ? initial[f.key] : (f.type === 'select' && f.options ? f.options[0] : ''); });
    return o;
  });
  const set = (k: string, val: string) => setV(s => ({ ...s, [k]: val }));
  const missing = fields.some(f => !f.optional && (v[f.key] === '' || v[f.key] == null));
  return (
    <div className="rbm-modal-scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="rbm-modal">
        <div className="rbm-modal-h">{I.penLine}<span>{title}</span></div>
        {intro && <div className="rbm-modal-what">{intro}</div>}
        {fields.map(f => (
          <label key={f.key} className="rbm-field"><span>{f.label}</span>
            {f.type === 'textarea' ? <textarea rows={2} value={v[f.key]} onChange={e => set(f.key, e.target.value)} />
              : f.type === 'select' && f.options ? <select value={v[f.key]} onChange={e => set(f.key, e.target.value)}>{f.options.map(o => <option key={o} value={o}>{f.labels ? f.labels[o] : o}</option>)}</select>
              : <input type={f.type === 'number' ? 'number' : 'text'} min={f.min} max={f.max} value={v[f.key]} onChange={e => set(f.key, e.target.value)} />}
          </label>
        ))}
        <div className="rbm-modal-acts">
          <button className="rbm-btn" onClick={onCancel}>Cancel</button>
          <button className="rbm-btn pri" disabled={missing} onClick={() => onSubmit(v)}>{submitLabel || 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── GovernedApprovalDialog ── */
let _rbmAud = 9210;
export function GovernedApprovalDialog({ what, meaning, onCancel, onSigned }: {
  what: string; meaning: string; onCancel: () => void; onSigned: (sig: RbmApproval) => void;
}) {
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const [otp, setOtp] = useState('');
  const ok = reason.trim().length >= 8 && pw.length >= 4 && otp.length === 6;
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
        <div className="rbm-modal-note">Signature meaning: approval (21 CFR 11.50). Signer: Jordan Chen. The entry is written to the immutable audit trail.</div>
        <div className="rbm-modal-acts">
          <button className="rbm-btn" onClick={onCancel}>Cancel</button>
          <button className="rbm-btn pri" disabled={!ok} onClick={() => onSigned({ by: 'Jordan Chen', when: '2026-07-02', reason: reason.trim(), audit: `C2C-AUD-${_rbmAud++}` })}>Sign and activate</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════ AnA resolver ═══════ */

export interface AnaResult {
  tool: string; verdict: string; lines: string[]; chips?: { label: string; tone: string }[];
  links?: { label: string; nav: string; app?: boolean }[]; cites?: string[];
}

export function rbmAnaResolve(text: string): AnaResult {
  const t = (text || '').toLowerCase();
  const K = RBM_KRIS, Q = RBM_QTLS, SG = RBM_SIGNALS, ST = RBM_SITES, P = RBM_PATIENTS, S = RBM_SUMMARY;
  const red = K.filter(k => k.status === 'red'), amber = K.filter(k => k.status === 'amber');
  const breached = Q.filter(q => q.status === 'breached'), approaching = Q.filter(q => q.status === 'approaching');

  if (/estimand|power|sample size|biostat|e9|analysis population|itt/.test(t))
    return { tool: 'hand-off -> Biostatistics', verdict: 'Routed to Biostatistics',
      lines: [`The breached QTL (${breached[0] ? breached[0].parameter.toLowerCase() : 'premature discontinuation'}) affects the ITT population and the treatment-policy estimand for the primary ORR analysis.`,
        'Biostatistics owns the estimand framework (ICH E9(R1)) and the power/sample-size re-assessment.'],
      links: [{ label: 'Open Biostatistics', nav: 'biostatistics', app: true }, { label: 'View QTLs', nav: 'qtls' }], cites: ['ICH E9(R1)'] };

  if (/kri|indicator|amber|red lag|reporting lag/.test(t))
    return { tool: 'evaluate_kris_qtls', verdict: `${red.length} red -- ${amber.length} amber`,
      lines: [...red.map(k => `Red -- ${k.name}: ${k.current}${k.unit} vs red ${k.red}${k.unit} (${k.dir === 'higher_worse' ? 'higher worse' : 'lower worse'}).`),
        ...amber.map(k => `Amber -- ${k.name}: ${k.current}${k.unit} vs amber ${k.amber}${k.unit}.`)],
      chips: red.map(k => ({ label: k.name, tone: 'err' })).concat(amber.map(k => ({ label: k.name, tone: 'warn' }))),
      links: [{ label: 'Open KRIs', nav: 'kris' }], cites: ['ICH E6(R3)', 'TransCelerate RBM'] };

  if (/qtl|tolerance|breach|discontinuation/.test(t)) {
    const links: { label: string; nav: string; app?: boolean }[] = [{ label: 'Open QTLs', nav: 'qtls' }];
    if (breached.length) links.push({ label: 'Assess estimand impact', nav: 'biostatistics', app: true });
    return { tool: 'evaluate_kris_qtls', verdict: `${breached.length} breached -- ${approaching.length} approaching`,
      lines: [...breached.map(q => `Breached -- ${q.parameter}: ${q.current}${q.unit === '%' ? '%' : ''} vs threshold ${q.threshold}${q.unit === '%' ? '%' : ''}. Requires CAPA + estimand impact.`),
        ...approaching.map(q => `Approaching -- ${q.parameter}: ${q.current}${q.unit === '%' ? '%' : ''} past early-warning ${q.secondary}${q.unit === '%' ? '%' : ''}.`)],
      chips: breached.map(q => ({ label: q.parameter, tone: 'err' })).concat(approaching.map(q => ({ label: q.parameter, tone: 'warn' }))),
      links, cites: ['ICH E6(R3)', 'ICH E9(R1)'] };
  }

  if (/signal|prioriti|urgent|central monitoring|outlier/.test(t)) {
    const sevOrd: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const open = SG.filter(s => !['resolved', 'dismissed'].includes(s.status)).sort((a, b) => (sevOrd[a.severity] || 3) - (sevOrd[b.severity] || 3));
    return { tool: 'prioritize_monitoring_queries', verdict: `${open.length} open -- ${open.filter(s => s.severity === 'high' || s.severity === 'critical').length} high+`,
      lines: open.slice(0, 4).map(s => `${s.severity[0].toUpperCase() + s.severity.slice(1)} -- ${s.title}`),
      chips: open.slice(0, 4).map(s => ({ label: s.site !== '—' ? `site ${s.site}` : s.type, tone: s.severity === 'critical' || s.severity === 'high' ? 'err' : 'warn' })),
      links: [{ label: 'Open central monitoring', nav: 'signals' }], cites: ['CluePoints SMART', 'ICH E6(R3)'] };
  }

  if (/site|enhanced|tier|oversight|monitor where/.test(t)) {
    const enh = ST.filter(s => s.tier === 'enhanced');
    return { tool: 'assess_site_risk', verdict: `${enh.length} enhanced-tier of ${S.sites.total}`,
      lines: enh.map(s => `Site ${s.n} ${s.name} -- composite ${s.composite}. ${s.drivers[0]}.`),
      chips: enh.map(s => ({ label: `site ${s.n}`, tone: 'err' })),
      links: [{ label: 'Open site risk', nav: 'sites' }, { label: 'Site oversight', nav: 'oversight' }], cites: ['ICH E6(R3) 5.0'] };
  }

  if (/patient|anomal|flag|subject|atypical/.test(t)) {
    const fl = P.filter(p => p.status === 'flagged'), rv = P.filter(p => p.status === 'review');
    return { tool: 'scan_patient_profiles', verdict: `${fl.length} flagged -- ${rv.length} in review`,
      lines: fl.concat(rv).slice(0, 4).map(p => `${p.sid} -- anomaly ${p.anomaly.toFixed(1)}, top dimension ${p.top}.`),
      chips: fl.map(p => ({ label: p.sid, tone: 'err' })).concat(rv.map(p => ({ label: p.sid, tone: 'warn' }))),
      links: [{ label: 'Open patient profiles', nav: 'patients' }], cites: ['Robust modified z-score'] };
  }

  if (/plan|strategy|action|generate/.test(t))
    return { tool: 'generate_rbm_plan', verdict: 'Risk-based strategy -- draft',
      lines: ['Strategy: risk-based, aligned to tier assignments (enhanced/standard/reduced).', 'AnA can draft actions from the open critical CtQ factors -- badged draft, pending Part 11 approval.'],
      links: [{ label: 'Open monitoring plan', nav: 'plan' }], cites: ['ICH E6(R3)'] };

  if (/report|inspection|regulator|review report/.test(t))
    return { tool: 'generate_rbm_report', verdict: 'ICH E6(R3) risk review',
      lines: [RBM_REPORT.headline], links: [{ label: 'Open risk review report', nav: 'report' }], cites: ['ICH E6(R3)'] };

  return { tool: 'get_rbm_attention', verdict: `Overall risk ${S.overallRisk} -- ${RBM_ATTENTION.length} items`,
    lines: RBM_ATTENTION.slice(0, 4).map(a => `${a.kind} -- ${a.t}`),
    chips: [{ label: `${S.riskItems.critical} critical CtQ`, tone: 'warn' }, { label: `${S.kris.red} red KRI`, tone: 'err' }, { label: `${S.qtls.breached} QTL breach`, tone: 'err' }, { label: `${S.sites.enhanced} enhanced sites`, tone: 'warn' }],
    links: [{ label: 'Open overview', nav: 'overview' }], cites: ['ICH E6(R3)'] };
}

/* ── AnA message ── */
function RbmAnaMsg({ m, onTab, onNav }: { m: { role: string; text?: string; r?: AnaResult }; onTab: (id: string) => void; onNav: (id: string) => void }) {
  if (m.role === 'user') return <div className="rbm-ana-user">{m.text}</div>;
  const r = m.r!;
  return (
    <div className="rbm-ana-ai">
      <div className="rbm-ana-who"><span className="mk">{'✻'}</span>AnA <span className="rbm-ana-tool">{r.tool}</span></div>
      <div className="rbm-ana-verdict">{r.verdict}</div>
      {r.chips && r.chips.length > 0 && <div className="rbm-ana-chips">{r.chips.map((c, i) => <span key={i} className="rbm-chip" data-tone={c.tone}>{(I as Record<string, React.ReactNode>)[c.tone === 'err' ? 'shieldAlert' : 'alertTriangle']}{c.label}</span>)}</div>}
      {r.lines && <ul className="rbm-ana-lines">{r.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {r.cites && r.cites.length > 0 && <div className="rbm-ana-cites">{r.cites.map((c, i) => <span key={i} className="rbm-ana-cite">{I.bookOpen || I.fileText}{c}</span>)}</div>}
      {r.links && r.links.length > 0 && <div className="rbm-ana-links">{r.links.map((l, i) => (
        <button key={i} className="rbm-ana-link" data-app={l.app || undefined} onClick={() => l.app ? onNav(l.nav) : onTab(l.nav)}>{l.app ? I.externalLink : I.chevRight}{l.label}</button>
      ))}</div>}
    </div>
  );
}

/* ── RbmAnaDock ── */
export function RbmAnaDock({ nav, study, msgs, onAsk, onTab, onNav, onClose }: {
  nav: RbmNavItem; study: string; msgs: { role: string; text?: string; r?: AnaResult }[];
  onAsk: (t: string) => void; onTab: (id: string) => void; onNav: (id: string) => void; onClose: () => void;
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
        {msgs.map((m, i) => <RbmAnaMsg key={i} m={m} onTab={onTab} onNav={onNav} />)}
      </div>
      <div className="rbm-ana-composer">
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(draft.trim()); }} placeholder={`Ask AnA about ${study}...`} />
        <button className="rbm-ana-send" disabled={!draft.trim()} onClick={() => ask(draft.trim())}>{I.zap}</button>
      </div>
    </aside>
  );
}
