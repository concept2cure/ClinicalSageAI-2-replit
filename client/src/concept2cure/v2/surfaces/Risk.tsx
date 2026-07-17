import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { RISK_ROWS as INITIAL_ROWS, RISK_ENUMS, SEV_LABELS, PROB_LABELS } from '../fixtures/risk-data';
import type { RiskRow, RiskControl } from '../fixtures/risk-data';

/* ---- Risk management (ISO 14971) ---- */

/**
 * Map the raw `risk_items` rows the backend returns (GET /api/mdx/risk-items —
 * DB columns, numeric severity/probability 1..5) onto the RiskRow display
 * contract the surface renders. This is the read-side inverse of addHazard's
 * write path (`severity = SEV_LABELS.indexOf(sev) + 1`), so a label written by
 * the surface round-trips back to the same label. Residual acceptability is
 * taken from the server's authoritative `acceptable` boolean — never inferred
 * from the risk product — so the surface never overstates that a hazard is
 * Acceptable.
 *
 * Fail-closed (returns null → the surface keeps its Sample fixture) unless the
 * payload is a non-empty list of rows that actually carry the risk_items
 * signature (hazard + harm strings, severity/probability integers in 1..5). The
 * display fixture itself (string `sev`/`prob`, no numeric `severity`) maps to
 * null, so a raw-shape mismatch keeps the honest sample rather than rendering
 * half-mapped safety data. Exported for unit coverage.
 */
export function mapRiskItems(payload: unknown): RiskRow[] | null {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : null;
  if (!Array.isArray(list) || list.length === 0) return null;

  const inScale = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;
  const str = (v: unknown, fallback = ''): string =>
    typeof v === 'string' && v ? v : fallback;

  const out: RiskRow[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    // Signature gate — a risk_items row, not the display fixture or some other
    // envelope. Any row that fails fails the whole batch (all-or-nothing so the
    // surface never shows a partially-adopted risk file).
    if (!str(r.hazard) || !str(r.harm)) return null;
    if (!inScale(r.severity) || !inScale(r.probability)) return null;

    const sev = SEV_LABELS[r.severity - 1];
    const prob = PROB_LABELS[r.probability - 1];
    const status = str(r.status, 'open');
    out.push({
      id: str(r.ref_code) || 'HZ-' + String(r.id ?? out.length + 1).padStart(2, '0'),
      hazard: str(r.hazard),
      situation: str(r.hazardous_situation),
      harm: str(r.harm),
      seq: str(r.sequence_of_events),
      sev,
      prob,
      probR: inScale(r.residual_probability) ? PROB_LABELS[r.residual_probability - 1] : prob,
      det: inScale(r.detectability) ? r.detectability : 3,
      strategy: str(r.control_strategy, 'design_reduce'),
      source: str(r.source, 'other'),
      status,
      ctrl: '',
      ver: '',
      res: r.acceptable === true ? 'Acceptable' : 'Investigation',
      open: status === 'open' || status === 'mitigating',
      controls: [],
    });
  }
  return out.length ? out : null;
}

export function Risk({ onAsk }: SurfaceViewProps) {
  // The backend returns raw risk_items rows (numeric severity/probability); the
  // surface renders labelled RiskRows. useLiveList's structural guard would
  // reject that shape outright, so adopt via mapRiskItems instead — it maps the
  // rows and fails closed to the fixture on anything it can't map. Same
  // fail-closed contract, but the org's real risk file can now actually load.
  const raw = useLive<unknown>('/api/mdx/risk-items', null);
  const liveRows = useMemo(
    () => (!raw.loading && !raw.sample ? mapRiskItems(raw.data) : null),
    [raw.loading, raw.sample, raw.data],
  );
  const live = {
    data: liveRows ?? INITIAL_ROWS,
    sample: liveRows == null,
    loading: raw.loading,
  };
  const [rows, setRows] = useState<RiskRow[]>(live.data);
  const [sel, setSel] = useState(INITIAL_ROWS[0].id);
  // Adopt the live risk file once the backend responds (fail-closed to the
  // fixture until then; user-added hazards before that are optimistic).
  const seededRef = React.useRef<RiskRow[]>(live.data);
  useEffect(() => {
    if (live.data !== seededRef.current) {
      seededRef.current = live.data;
      setRows(live.data);
      if (live.data[0]) setSel(live.data[0].id);
    }
  }, [live.data]);
  const [view, setView] = useState<'initial' | 'residual'>('initial');
  const [form, setForm] = useState(false);
  const [ctrlForm, setCtrlForm] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  useEffect(() => {
    try {
      const r = rows.find(x => x.id === sel);
      const c2c = (window as any).C2C;
      if (c2c && r) c2c.setContext({ entityType: 'risk', entityId: r.id, entityLabel: r.id + ' -- ' + (r.hazard || 'risk') });
    } catch (_e) { /* swallow */ }
  }, [sel, rows]);

  const EN = RISK_ENUMS;
  const sevI = (s: string) => Math.max(0, SEV_LABELS.indexOf(s as any));
  const probI = (p: string) => Math.max(0, PROB_LABELS.indexOf(p as any));
  const rowProb = (r: RiskRow) => view === 'residual' ? (r.probR || r.prob) : r.prob;
  const zone = (si: number, pi: number) => { const score = (si + 1) * (pi + 1); return score >= 15 ? 'err' : score >= 8 ? 'warn' : 'ok'; };
  const row = rows.find(r => r.id === sel) || rows[0];

  const summary = useMemo(() => {
    const prod = (r: RiskRow, resid: boolean) => { const si = sevI(r.sev) + 1; const pi = (probI(resid ? (r.probR || r.prob) : r.prob)) + 1; return si * pi; };
    const total = rows.length;
    const open = rows.filter(r => r.status === 'open' || r.status === 'mitigating').length;
    const accepted = rows.filter(r => r.status === 'accepted' || r.res === 'Acceptable').length;
    const highResidual = rows.filter(r => prod(r, true) >= 15).length;
    const avgInitial = (rows.reduce((s, r) => s + prod(r, false), 0) / (total || 1)).toFixed(1);
    const avgResidual = (rows.reduce((s, r) => s + prod(r, true), 0) / (total || 1)).toFixed(1);
    return { total, open, accepted, highResidual, avgInitial, avgResidual };
  }, [rows, view]);

  const addHazard = (v: Record<string, string>) => {
    const n = rows.length + 1;
    const id = 'HZ-' + String(n).padStart(2, '0');
    const nr: RiskRow = {
      id, hazard: v.hazard, situation: v.situation || '', harm: v.harm,
      seq: v.seq || '', sev: v.sev || 'Serious', prob: v.prob || 'Occasional',
      probR: v.prob || 'Occasional', det: Number(v.det) || 3,
      strategy: v.strategy || 'design_reduce', source: v.source || 'other',
      status: 'open', ctrl: '', ver: 'V&V record pending', res: 'Investigation',
      open: true, controls: [], _new: true,
    };
    setRows(rs => [nr, ...rs]); setSel(id); setForm(false);
    const api = (window as any).C2C_API;
    if (api && api.connected()) {
      api.post('/api/mdx/risk-items', {
        hazard: nr.hazard, hazardousSituation: nr.situation, harm: nr.harm,
        sequenceOfEvents: nr.seq, severity: sevI(nr.sev) + 1, probability: probI(nr.prob) + 1,
        detectability: nr.det, controlStrategy: nr.strategy, source: nr.source,
      }).catch(() => {});
    }
    fire('Hazard ' + id + ' added / status Open');
  };

  const addControl = (v: Record<string, string>) => {
    const cid = 'RC-' + row.id.replace('HZ-', '') + String.fromCharCode(97 + (row.controls ? row.controls.length : 0));
    const nc: RiskControl = { id: cid, desc: v.desc, type: v.type || 'protective_measure', status: v.status || 'proposed' };
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, controls: [...(r.controls || []), nc] } : r)); setCtrlForm(false);
    const api = (window as any).C2C_API;
    if (api && api.connected()) { api.post('/api/mdx/risk-items/' + row.id + '/controls', { description: nc.desc, controlType: nc.type, status: nc.status }).catch(() => {}); }
    fire('Risk control ' + cid + ' added to ' + row.id);
  };

  const setStatus = (id: string, st: string) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, status: st, open: st === 'open' || st === 'mitigating', res: (st === 'accepted' || st === 'verified') ? 'Acceptable' : r.res } : r));
    const api = (window as any).C2C_API;
    if (api && api.connected()) { api.patch('/api/mdx/risk-items/' + id, { status: st }).catch(() => {}); }
    fire(id + ' -- ' + st);
  };

  const ctrlTone: Record<string, string> = { proposed: 'idle', implemented: 'ai', verified: 'warn', effective: 'ok' };
  const stTone: Record<string, string> = { open: 'err', mitigating: 'warn', verified: 'ai', accepted: 'ok', closed: 'idle' };

  const hazardFormConfig: C2CFormConfig = {
    eyebrow: 'ISO 14971 / risk item', title: 'New hazard',
    sub: 'Adds a hazard -- hazardous situation -- harm row and computes initial risk (severity x probability).',
    governed: 'Written to the risk file; audit-logged. Initial risk is the severity x probability product per ISO 14971.',
    submitLabel: 'Add hazard',
    fields: [
      { key: 'hazard', label: 'Hazard', type: 'text', placeholder: 'e.g. Inaccurate glucose reading', required: true },
      { key: 'situation', label: 'Hazardous situation', type: 'text', placeholder: 'The circumstance that exposes the user to the hazard' },
      { key: 'harm', label: 'Harm', type: 'text', placeholder: 'e.g. Mis-dosing of insulin', required: true },
      { key: 'seq', label: 'Sequence of events', type: 'text', placeholder: 'Cause -- situation -- harm' },
      { key: 'sev', label: 'Severity', type: 'select', options: SEV_LABELS.map((s, i) => ({ value: s, label: s + ' (' + (i + 1) + ')' })), required: true },
      { key: 'prob', label: 'Probability', type: 'select', options: PROB_LABELS.map((p, i) => ({ value: p, label: p + ' (' + (i + 1) + ')' })), required: true },
      { key: 'strategy', label: 'Control strategy', type: 'select', options: EN.strategy.map(s => ({ value: s[0], label: s[1] })) },
      { key: 'source', label: 'Source', type: 'select', options: EN.source.map(s => ({ value: s[0], label: s[1] })) },
    ],
  };

  const ctrlFormConfig: C2CFormConfig = {
    eyebrow: 'Risk control / ' + row.id, title: 'Add risk control',
    sub: 'Mitigation applied to ' + row.hazard + '.',
    governed: 'Controls follow the ISO 14971 hierarchy: inherent safety -- protective measure -- information for safety.',
    submitLabel: 'Add control',
    fields: [
      { key: 'desc', label: 'Control description', type: 'text', placeholder: 'e.g. Dual-sensor cross-check rejects disagreeing readings', required: true },
      { key: 'type', label: 'Control type', type: 'select', options: EN.ctrlType.map(t => ({ value: t[0], label: t[1] })), required: true },
      { key: 'status', label: 'Status', type: 'select', options: EN.ctrlStatus.map(s => ({ value: s[0], label: s[1] })) },
    ],
  };

  return (
    <div className="page-inner">
      <SampleTag sample={live.sample} />
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Specialist / device</div>
          <h1 className="ph-title">Risk management</h1>
          <div className="ph-sub">ISO 14971 risk file — hazard analysis, 5x5 risk matrix, risk controls, residual risk and benefit-risk.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Summarize the open risk evaluations')}>{I.sparkles} Ask AnA</button>
          <button className="btn primary" onClick={() => setForm(true)}>{I.plus} New hazard</button>
        </div>
      </div>

      <AnswerLead
        tone={summary.highResidual > 0 || summary.open > 0 ? 'urgent' : 'calm'}
        eyebrow="Where the risk file stands right now"
        headline={summary.highResidual > 0
          ? <><b>{summary.highResidual}</b> residual risk{summary.highResidual === 1 ? '' : 's'} sit{summary.highResidual === 1 ? 's' : ''} in the <b>unacceptable</b> band and {summary.open > 0 ? <><b>{summary.open}</b> evaluation{summary.open === 1 ? '' : 's'} {summary.open === 1 ? 'is' : 'are'} still open.</> : 'must be reduced before the RMF can conclude.'}</>
          : summary.open > 0
            ? <><b>{summary.open}</b> risk evaluation{summary.open === 1 ? '' : 's'} {summary.open === 1 ? 'is' : 'are'} still open — everything else is controlled to an acceptable level.</>
            : <>All <b>{summary.total}</b> hazards are controlled to an acceptable residual risk. The benefit-risk conclusion can proceed.</>}
        body={<>Average risk dropped from <b>{summary.avgInitial}</b> initial to <b>{summary.avgResidual}</b> residual across {summary.total} hazards; {summary.accepted} accepted. Each hazard carries its control chain and V&amp;V evidence for the design history file.</>}
        reassure="I will draft the benefit-risk rationale and the RMF section 8 conclusion from the controlled residual risks — you approve the judgment."
        action={summary.open > 0
          ? { label: 'Open the ' + (rows.find(r => r.status === 'open') || row).id + ' evaluation', onClick: () => setSel((rows.find(r => r.status === 'open') || row).id) }
          : { label: 'Draft RMF conclusion', onClick: () => onAsk('Draft the ISO 14971 section 8 overall benefit-risk conclusion for the RMF') }}
        secondary="Or work the matrix and hazards below."
      />

      <div className="metrics">
        <div className="metric"><div className="metric-l">Hazards identified</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.total}</div></div>
        <div className="metric" data-tone="ok"><div className="metric-l">Residual acceptable</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.accepted} / {summary.total}</div></div>
        <div className="metric" data-tone={summary.open ? 'warn' : ''}><div className="metric-l">Open evaluations</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.open}</div></div>
        <div className="metric" data-tone={summary.highResidual ? 'err' : 'ok'}><div className="metric-l">High residual (&gt;=15)</div><div className="metric-n" style={{ fontSize: 22 }}>{summary.highResidual}</div></div>
      </div>

      <div className="risk-split">
        <div className="sec">
          <div className="sec-hdr">
            <div className="sec-title">Risk matrix</div>
            <div className="seg" style={{ marginLeft: 'auto' }}>
              <button className={`seg-b${view === 'initial' ? ' on' : ''}`} onClick={() => setView('initial')}>Initial</button>
              <button className={`seg-b${view === 'residual' ? ' on' : ''}`} onClick={() => setView('residual')}>Residual</button>
            </div>
          </div>
          <div className="sec-sub" style={{ marginTop: -6, marginBottom: 10 }}>severity x probability / {view === 'residual' ? 'after risk controls (ISO 14971 section 7)' : 'pre-mitigation'}</div>
          <div className="riskmx">
            <div className="riskmx-corner" />
            {SEV_LABELS.map((s) => (<div key={s} className="riskmx-col">{s}</div>))}
            {[...PROB_LABELS].reverse().map((p) => {
              const pi = PROB_LABELS.indexOf(p);
              return (
                <React.Fragment key={p}>
                  <div className="riskmx-row">{p}</div>
                  {SEV_LABELS.map((s, si) => {
                    const hz = rows.filter(r => sevI(r.sev) === si && probI(rowProb(r)) === pi);
                    return (
                      <div key={s} className={`riskmx-cell tone-${zone(si, pi)}`}>
                        {hz.map(h => (
                          <button key={h.id} className="riskmx-dot" data-on={sel === h.id || undefined} data-moved={(view === 'residual' && h.probR && h.probR !== h.prob) || undefined} title={h.id + ' / ' + h.hazard} onClick={() => setSel(h.id)}>{h.id.replace('HZ-', '')}</button>
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
          <div className="riskmx-legend"><span><i className="z ok" />Acceptable</span><span><i className="z warn" />ALARP</span><span><i className="z err" />Unacceptable</span></div>
          <div className="risk-br">
            {I.shieldCheck}
            <span><b>Benefit-risk: {summary.highResidual ? 'gated' : 'favorable'}</b> — {summary.accepted} of {summary.total} residual risks Acceptable; {summary.open} open evaluation{summary.open === 1 ? '' : 's'} gate{summary.open === 1 ? 's' : ''} the RMF conclusion (ISO 14971 section 8).</span>
            <button className="risk-br-cta" onClick={() => onAsk('Draft the ISO 14971 section 8 overall benefit-risk conclusion for the RMF')}>{I.sparkles} Draft RMF conclusion</button>
          </div>
        </div>
        <aside className="risk-drawer">
          <div className="dr-eyebrow">{row.id} / hazard<span className={`rd-chip tone-${stTone[row.status] || 'idle'}`} style={{ marginLeft: 8 }}>{(EN.status.find(s => s[0] === row.status) || [])[1] || row.status}</span></div>
          <div className="dr-title">{row.hazard}</div>
          <div className="risk-chain">
            <div className="rc-row"><span className="rc-k">Hazardous situation</span><span className="rc-v">{row.situation || '—'}</span></div>
            <div className="rc-row"><span className="rc-k">Harm</span><span className="rc-v">{row.harm}</span></div>
            {row.seq && <div className="rc-row"><span className="rc-k">Sequence of events</span><span className="rc-v">{row.seq}</span></div>}
            <div className="rc-row"><span className="rc-k">Severity</span><span className="rc-v"><span className={`rd-chip tone-${row.sev === 'Critical' || row.sev === 'Catastrophic' ? 'err' : row.sev === 'Serious' ? 'warn' : 'idle'}`}>{row.sev} ({sevI(row.sev) + 1})</span></span></div>
            <div className="rc-row"><span className="rc-k">Probability</span><span className="rc-v">{row.prob} ({probI(row.prob) + 1}){row.probR && row.probR !== row.prob && <span className="rc-move"> -- {row.probR} <span className="rc-move-tag">after controls</span></span>}</span></div>
            <div className="rc-row"><span className="rc-k">Strategy</span><span className="rc-v">{(EN.strategy.find(s => s[0] === row.strategy) || [])[1] || row.strategy} / {(EN.source.find(s => s[0] === row.source) || [])[1] || row.source}</span></div>
            <div className="rc-row"><span className="rc-k">Residual risk</span><span className="rc-v"><span className={`rd-chip tone-${row.res === 'Acceptable' ? 'ok' : 'warn'}`}>{row.res}</span></span></div>
            <div className="rc-row"><span className="rc-k">Verification (DHF)</span><span className="rc-v">{row.ver || 'V&V record linked / ' + row.id}</span></div>
          </div>

          <div className="pj-seclbl" style={{ margin: '14px 0 8px' }}>Risk controls <span className="s">/ ISO 14971 section 7</span></div>
          <div className="risk-ctrls">
            {(row.controls || []).map(c => (
              <div key={c.id} className="risk-ctrl">
                <span className="risk-ctrl-t">{c.desc}</span>
                <span className="risk-ctrl-m"><span className="mono">{(EN.ctrlType.find(t => t[0] === c.type) || [])[1] || c.type}</span><span className={`rd-chip tone-${ctrlTone[c.status] || 'idle'}`}>{(EN.ctrlStatus.find(s => s[0] === c.status) || [])[1] || c.status}</span></span>
              </div>
            ))}
            {(!row.controls || !row.controls.length) && <div className="sp-q-s" style={{ padding: '6px 0' }}>No controls yet — add the first risk control.</div>}
          </div>
          <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => setCtrlForm(true)}>{I.plus} Add risk control</button>

          {row.open && <div className="risk-flag" style={{ marginTop: 10 }}>{I.alertTriangle} Open evaluation — residual risk not yet accepted. Benefit-risk justification required before section 2.3.</div>}
          <div className="cm-pushbar" style={{ marginTop: 10 }}>
            {row.status !== 'accepted' && <button className="btn ghost" onClick={() => setStatus(row.id, 'accepted')}>{I.check} Accept residual</button>}
            <button className="btn ghost" onClick={() => onAsk('Draft the benefit-risk rationale for ' + row.id)}>{I.sparkles} Draft benefit-risk</button>
          </div>
        </aside>
      </div>

      {form && <C2CForm config={hazardFormConfig} onCancel={() => setForm(false)} onSubmit={addHazard} />}
      {ctrlForm && <C2CForm config={ctrlFormConfig} onCancel={() => setCtrlForm(false)} onSubmit={addControl} />}
      {toast && <div className="pdev-toast">{I.check} {toast}</div>}
    </div>
  );
}
