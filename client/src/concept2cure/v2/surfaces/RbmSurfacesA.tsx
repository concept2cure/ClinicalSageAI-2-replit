/**
 * RBM surfaces 1-5: Overview, Risk review report, Risk assessment (RACT),
 * Key risk indicators, Quality tolerance limits.
 *
 * Every surface reads its slice from the live board
 * (GET /api/mdx-rbm/rbm-board/:programId) passed as `board`. The in-surface edit
 * flows (add CtQ factor, configure KRI, document breach, approve) remain an
 * un-persisted sample layer — flagged by the shell's SampleTag — until the write
 * path is wired; the read data they seed from is real, org-scoped RBQM data.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import {
  kriStatusOf, qtlStatusOf,
  type RbmRiskItem, type RbmKri, type RbmQtl, type RbmAssessment,
} from '../fixtures/rbm-data';
import type { RbmBoard, RbmBoardItem, RbmBoardKri, RbmBoardQtl } from './rbmBoard';
import {
  RbmChip, RbmScore, RiskMatrix, Sparkline, ThresholdGauge, TrendTable,
  RbmFormModal, GovernedApprovalDialog, type FormField,
} from './RbmSurfaces';
import '../styles/rbm-v2.css';

interface SubProps {
  board: RbmBoard;
  onTab?: (id: string) => void;
  onAsk?: (t: string) => void;
  onNav?: (id: string) => void;
}

const RACT_CATS = ['Safety', 'Endpoint', 'Data integrity', 'Enrollment', 'Site operations', 'IP handling'];
const KRI_SOURCES = ['EDC', 'CTMS', 'EDC + safety DB', 'IRT/RTSM', 'Lab', 'Central review'];

/* ── Board-row → editable view-model coercions ──
   The board is the source of truth; these map its rows into the surfaces' view
   types, stringifying numeric ids and coercing not-yet-scored nullables so the
   read layer never renders a fabricated value. Client-only fields the board does
   not carry (risk category, control, per-site drilldown) are left undefined. */
type QtlView = RbmQtl & { breachAction?: string };

function itemView(it: RbmBoardItem): RbmRiskItem {
  return {
    id: String(it.id), category: it.category, factor: it.factor,
    l: it.l, i: it.i, det: it.det ?? undefined, critical: it.critical,
    mitigation: it.mitigation, residual: it.residual ?? it.l * it.i,
    status: it.status, owner: it.owner ?? undefined,
  };
}
function kriView(k: RbmBoardKri): RbmKri {
  return {
    id: String(k.id), name: k.name, metric: k.metric, source: k.source, unit: k.unit,
    dir: k.dir, amber: k.amber ?? 0, red: k.red ?? 0, current: k.current ?? 0,
    status: k.status, at: k.at ?? '', spark: k.spark,
  };
}
function qtlView(q: RbmBoardQtl): QtlView {
  return {
    id: String(q.id), parameter: q.parameter, rationale: q.rationale, unit: q.unit ?? '',
    secondary: q.secondary ?? 0, threshold: q.threshold ?? 0, current: q.current ?? 0,
    status: q.status, breachAction: q.breachActionTaken ?? undefined,
  };
}

/* 1 -- Overview */
export function RbmOverview({ board, onTab }: SubProps) {
  const S = board.summary;
  const tiles = [
    { k: 'Overall risk', v: null as string | null, chip: <RbmChip vocab="band" value={S.overallRisk ?? 'unknown'} />, sub: 'rbm-engine -- L x I banding', nav: 'ract' },
    { k: 'Critical CtQ factors', v: String(S.riskItems.critical), chip: null, sub: `${S.riskItems.open} of ${S.riskItems.total} open`, nav: 'ract' },
    { k: 'KRIs red / amber', v: `${S.kris.red} / ${S.kris.amber}`, chip: null, sub: `${S.kris.total} indicators`, nav: 'kris', warn: S.kris.red > 0 },
    { k: 'QTLs breached', v: String(S.qtls.breached), chip: null, sub: `${S.qtls.approaching} approaching`, nav: 'qtls', err: S.qtls.breached > 0 },
    { k: 'Open signals', v: String(S.signals.open), chip: null, sub: `${S.signals.high} high severity`, nav: 'signals', warn: S.signals.high > 0 },
    { k: 'Enhanced-tier sites', v: String(S.sites.enhanced), chip: null, sub: `of ${S.sites.total} sites`, nav: 'sites' },
  ];
  return (
    <div>
      <div className="rbm-tiles">
        {tiles.map((t, i) => (
          <button key={i} className="rbm-tile" data-warn={(t as Record<string, unknown>).warn || undefined} data-err={(t as Record<string, unknown>).err || undefined} onClick={() => onTab?.(t.nav)}>
            <span className="rbm-tile-k">{t.k}</span>
            {t.chip ? <span className="rbm-tile-chip">{t.chip}</span> : <span className="rbm-tile-v">{t.v}</span>}
            <span className="rbm-tile-s">{t.sub}</span>
          </button>
        ))}
      </div>
      <div className="rbm-sec-h"><h2>Needs attention now</h2><span className="rbm-sec-sub">buildAttentionFeed -- ordered by severity -- as of {S.asOf}</span></div>
      <div className="rbm-att">
        {board.attention.map((a, i) => (
          <button key={i} className="rbm-att-row" data-sev={a.sev} onClick={() => onTab?.(a.nav)}>
            <RbmChip vocab="severity" value={a.sev} />
            <span className="rbm-att-kind">{a.kind}</span>
            <span className="rbm-att-body"><b>{a.t}</b><em>{a.d}</em></span>
            <span className="rbm-att-go">{I.chevRight}</span>
          </button>
        ))}
        {board.attention.length === 0 && <div className="rbm-inbox-empty">Nothing needs attention right now for this study.</div>}
      </div>
    </div>
  );
}

/* 2 -- Report */
export function RbmReport({ board, onAsk }: SubProps) {
  const R = board.report;
  if (!R) {
    return (
      <div className="rbm-report">
        <div className="rbm-note">{I.info}No risk review is available for this study yet — it is generated from the risk assessment, KRIs, QTLs, signals and sites once they exist.</div>
      </div>
    );
  }
  return (
    <div className="rbm-report">
      <div className="rbm-report-h">
        <div>
          <div className="rbm-report-fw">{R.framework}</div>
          <h2 className="rbm-report-t">Risk review</h2>
          <div className="rbm-report-m">As of {R.asOf} -- overall risk <RbmChip vocab="band" value={R.overallRisk} /> -- {R.attentionCount} attention items -- {R.approved ? 'assessment approved' : 'assessment approval pending'}</div>
        </div>
        <div className="rbm-report-acts">
          <button className="rbm-btn" onClick={() => onAsk?.('Export the risk review report as markdown')}>{I.download}Export markdown</button>
          <button className="rbm-btn" onClick={() => window.print()}>{I.fileText}Print</button>
        </div>
      </div>
      <p className="rbm-report-headline">{R.headline}</p>
      {R.sections.map((s, i) => (
        <div key={i} className="rbm-report-sec" data-st={s.status}>
          <div className="rbm-report-sec-h"><span className="t">{s.title}</span><RbmChip vocab="section" value={s.status} /></div>
          <ul>{s.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        </div>
      ))}
      <div className="rbm-note">{I.info}This report renders the same buildRiskReview output AnA returns from generate_rbm_report -- the on-screen and in-chat answers are identical by construction.</div>
    </div>
  );
}

/* 3 -- RACT */
export function RbmRact({ board }: SubProps) {
  const [sel, setSel] = useState<{ l: number; i: number } | null>(null);
  const [asmt, setAsmt] = useState<RbmAssessment | null>(() => {
    const a = board.assessment;
    if (!a) return null;
    return {
      id: String(a.id), framework: a.framework, version: a.version, status: a.status,
      updated: a.updated ?? '', history: [],
      approval: a.approval
        ? { by: a.approval.by ?? '', when: a.approval.when ?? '', reason: a.approval.reason ?? '', audit: '' }
        : undefined,
    };
  });
  const [items, setItems] = useState<RbmRiskItem[]>(() => board.items.map(itemView));
  const [signFor, setSignFor] = useState(false);
  const [edit, setEdit] = useState<{ mode: string; item?: RbmRiskItem } | null>(null);
  const shown = items.filter(it => !sel || (it.l === sel.l && it.i === sel.i));
  const saveItem = (form: Record<string, string>) => {
    const l = +form.l, im = +form.i, score = l * im;
    const rec: Partial<RbmRiskItem> = { category: form.category, riskCat: form.riskCat, factor: form.factor, l, i: im, det: +form.det, critical: score >= 15,
      mitigation: form.mitigation, control: form.control, owner: form.owner, residual: form.residual !== '' ? +form.residual : score, status: form.status };
    if (edit!.mode === 'edit') setItems(xs => xs.map(x => x.id === edit!.item!.id ? { ...x, ...rec } as RbmRiskItem : x));
    else setItems(xs => [...xs, { id: `ctq-${Date.now().toString().slice(-5)}`, ...rec } as RbmRiskItem]);
    setEdit(null);
  };
  const fields: FormField[] = [
    { key: 'riskCat', label: 'Risk category', type: 'select', options: ['Trial-wide', 'Site', 'Subject'] },
    { key: 'category', label: 'Domain', type: 'select', options: RACT_CATS },
    { key: 'factor', label: 'Critical-to-quality factor', type: 'textarea' },
    { key: 'l', label: 'Likelihood (1-5)', type: 'select', options: ['1', '2', '3', '4', '5'] },
    { key: 'i', label: 'Impact (1-5)', type: 'select', options: ['1', '2', '3', '4', '5'] },
    { key: 'det', label: 'Detectability (1 easy - 5 hard)', type: 'select', options: ['1', '2', '3', '4', '5'] },
    { key: 'mitigation', label: 'Mitigation', type: 'textarea' },
    { key: 'control', label: 'Risk control / monitoring method', type: 'textarea', optional: true },
    { key: 'owner', label: 'Risk owner', type: 'text', optional: true },
    { key: 'residual', label: 'Residual score (after mitigation)', type: 'number', min: 1, max: 25, optional: true },
    { key: 'status', label: 'Status', type: 'select', options: ['open', 'mitigating', 'accepted', 'closed'], labels: { open: 'Open', mitigating: 'Mitigating', accepted: 'Accepted', closed: 'Closed' } },
  ];
  return (
    <div>
      {asmt ? (
        <div className="rbm-asmt">
          <div className="rbm-asmt-l">
            <b>{asmt.framework}</b>
            <span>Version {asmt.version} -- <RbmChip vocab={asmt.status === 'active' ? 'action' : 'item'} value={asmt.status === 'active' ? 'done' : 'open'} /> {asmt.status === 'active' ? 'active' : 'draft -- approval pending'} -- {items.length} CtQ factors, {items.filter(x => x.critical).length} critical</span>
            {asmt.approval ? <span className="rbm-audit">{I.check}Approved by {asmt.approval.by} -- {asmt.approval.when} -- &quot;{asmt.approval.reason}&quot;</span> : null}
          </div>
          <div className="rbm-asmt-hist">{asmt.history.map((h, i) => <span key={i} className="rbm-hist-row">v{h.v} -- {h.status} -- {h.by} -- {h.when}</span>)}</div>
          {asmt.status !== 'active' && <button className="rbm-btn pri" onClick={() => setSignFor(true)}>{I.lock}Approve assessment</button>}
        </div>
      ) : (
        <div className="rbm-note">{I.info}No formal risk-assessment record exists for this study yet — the critical-to-quality register below reflects the live risk items; create and approve a framework version to govern it.</div>
      )}
      <div className="rbm-ract-cols">
        <div className="rbm-card">
          <div className="rbm-card-h">Likelihood x impact{sel ? <button className="rbm-clear" onClick={() => setSel(null)}>{I.close}Clear filter L{sel.l} x I{sel.i}</button> : <span className="rbm-card-sub">click a cell to filter</span>}</div>
          <RiskMatrix items={items} sel={sel} onSel={setSel} />
          <div className="rbm-mx-legend"><span><i data-band="low" />Low &lt;8</span><span><i data-band="medium" />Medium 8-14</span><span><i data-band="high" />High 15+</span></div>
        </div>
        <div className="rbm-card grow">
          <div className="rbm-card-h">Critical-to-quality register -- {shown.length} of {items.length}
            <button className="rbm-add" onClick={() => setEdit({ mode: 'new' })}>{I.zap}Add CtQ factor</button></div>
          <table className="rbm-tbl"><thead><tr><th>Category</th><th>CtQ factor</th><th>L x I x D</th><th>Inherent</th><th>Mitigation</th><th>Residual</th><th>Status</th><th></th></tr></thead>
            <tbody>{shown.map(it => (
              <tr key={it.id} data-crit={it.critical || undefined}>
                <td className="cat">{it.category}{it.riskCat && <span className="rbm-riskcat">{it.riskCat}</span>}{it.critical && <span className="rbm-crit" title="Critical CtQ (score 15+)">critical</span>}</td>
                <td className="fac">{it.factor}{it.owner && <span className="rbm-owner">owner: {it.owner}</span>}</td>
                <td className="mono">{it.l}x{it.i}{it.det ? `x${it.det}` : ''}</td>
                <td><RbmScore v={it.l * it.i} /></td>
                <td className="mit">{it.mitigation}{it.control && <span className="rbm-control">{I.shieldCheck}{it.control}</span>}</td>
                <td><RbmScore v={it.residual} /></td>
                <td><RbmChip vocab="item" value={it.status} /></td>
                <td><button className="rbm-rowedit" title="Edit" onClick={() => setEdit({ mode: 'edit', item: it })}>{I.penLine}</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="rbm-col-empty">No critical-to-quality factors for this study yet.</td></tr>}
            </tbody></table>
        </div>
      </div>
      {edit && <RbmFormModal title={edit.mode === 'edit' ? 'Edit CtQ factor' : 'Add CtQ factor'}
        intro="Classify the risk (trial-wide / site / subject), score likelihood x impact x detectability, and record the mitigation, risk control and owner. A score of 15+ is flagged critical."
        fields={fields} initial={edit.item ? { ...edit.item as unknown as Record<string, string>, l: String(edit.item.l), i: String(edit.item.i), det: String(edit.item.det || 3), residual: String(edit.item.residual), riskCat: edit.item.riskCat || 'Trial-wide' } as unknown as Record<string, string> : null}
        submitLabel={edit.mode === 'edit' ? 'Save changes' : 'Add factor'} onCancel={() => setEdit(null)} onSubmit={saveItem} />}
      {signFor && asmt && <GovernedApprovalDialog what={`Risk assessment v${asmt.version}`}
        meaning="The RACT becomes the governing risk basis for monitoring-tier assignment and the risk review report."
        onCancel={() => setSignFor(false)} onSigned={sig => { setAsmt(a => a ? { ...a, status: 'active', approval: sig } : a); setSignFor(false); }} />}
    </div>
  );
}

/* 4 -- KRIs */
export function RbmKris({ board }: SubProps) {
  const [kris, setKris] = useState<RbmKri[]>(() => board.kris.map(kriView));
  const [tableFor, setTableFor] = useState<Record<string, boolean>>({});
  const [drillFor, setDrillFor] = useState<Record<string, boolean>>({});
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const [cfg, setCfg] = useState<{ mode: string; kri?: RbmKri } | null>(null);
  const addReading = (id: string, val: string) => setKris(ks => ks.map(k => {
    if (k.id !== id) return k; const spark = [...k.spark.slice(-9), +val];
    return { ...k, spark, current: +val, status: kriStatusOf(k, +val), at: 'just now' };
  }));
  const saveCfg = (f: Record<string, string>) => {
    const base = { name: f.name, metric: f.metric, source: f.source, unit: f.unit, dir: f.dir, method: f.method, amber: +f.amber, red: +f.red, level: f.level };
    if (cfg!.mode === 'edit') setKris(ks => ks.map(k => k.id === cfg!.kri!.id ? { ...k, ...base, status: kriStatusOf({ ...k, ...base }, k.current) } : k));
    else setKris(ks => [...ks, { id: `kri-${Date.now().toString().slice(-5)}`, ...base, current: +f.amber, status: 'amber', at: 'just now', spark: [+f.amber] } as RbmKri]);
    setCfg(null);
  };
  const cfgFields: FormField[] = [
    { key: 'name', label: 'Indicator name', type: 'text' },
    { key: 'metric', label: 'Metric definition', type: 'textarea' },
    { key: 'source', label: 'Data source', type: 'select', options: KRI_SOURCES },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'dir', label: 'Direction', type: 'select', options: ['higher_worse', 'lower_worse'], labels: { higher_worse: 'Higher is worse', lower_worse: 'Lower is worse' } },
    { key: 'method', label: 'Threshold method', type: 'select', options: ['discrete', 'dynamic'], labels: { discrete: 'Discrete (fixed limits)', dynamic: 'Dynamic (statistical / study-adjusted)' } },
    { key: 'amber', label: 'Amber threshold', type: 'number' },
    { key: 'red', label: 'Red threshold', type: 'number' },
    { key: 'level', label: 'Analysis level', type: 'select', options: ['Site', 'Region', 'Country', 'Patient'] },
  ];
  return (
    <div>
      <div className="rbm-bar">
        <span className="rbm-bar-info">{kris.length} indicators -- seed from the TransCelerate library or define study-specific KRIs</span>
        <button className="rbm-btn pri" onClick={() => setCfg({ mode: 'new' })}>{I.zap}New KRI</button>
      </div>
      <div className="rbm-kri-grid">{kris.map(k => (
        <div key={k.id} className="rbm-kri" data-st={k.status}>
          <div className="rbm-kri-h"><b>{k.name}</b><RbmChip vocab="kri" value={k.status} /></div>
          <div className="rbm-kri-m">{k.metric} -- {k.source} -- {k.dir === 'higher_worse' ? 'higher is worse' : 'lower is worse'}{k.method === 'dynamic' ? ' -- dynamic threshold' : ''}</div>
          <div className="rbm-kri-body">
            <div className="rbm-kri-v" data-st={k.status}>{k.current}<em>{k.unit}</em></div>
            {tableFor[k.id] ? <TrendTable kri={k} /> : <Sparkline values={k.spark} amber={k.amber} red={k.red} />}
          </div>
          <div className="rbm-kri-thr">amber {k.amber}{k.unit} -- red {k.red}{k.unit} -- {k.level || 'Site'} level -- evaluated {k.at || '—'}</div>
          {drillFor[k.id] && k.bySite && (
            <div className="rbm-kri-sub">
              <div className="rbm-kri-sub-h">By site -- {k.level || 'Site'} subgroup</div>
              {k.bySite.slice().sort((a, b) => k.dir === 'lower_worse' ? a[1] - b[1] : b[1] - a[1]).map(([site, val]) => {
                const stt = kriStatusOf(k, val);
                return (
                  <div key={site} className="rbm-kri-sub-row">
                    <span className="mono">site {site}</span>
                    <span className="bar"><span data-st={stt} style={{ width: `${Math.min(100, val / (k.red * 1.4) * 100)}%` }} /></span>
                    <span className="mono v">{val}{k.unit}</span><RbmChip vocab="kri" value={stt} />
                  </div>
                );
              })}
            </div>
          )}
          <div className="rbm-kri-acts">
            <button className="rbm-linkbtn" onClick={() => setEntryFor(k.id)}>{I.zap}Add reading</button>
            <button className="rbm-linkbtn" onClick={() => setCfg({ mode: 'edit', kri: k })}>{I.penLine}Configure</button>
            <button className="rbm-linkbtn" aria-pressed={!!tableFor[k.id]} onClick={() => setTableFor(t => ({ ...t, [k.id]: !t[k.id] }))}>{I.table}{tableFor[k.id] ? 'Trend' : 'Table'}</button>
            {k.bySite && <button className="rbm-linkbtn" aria-pressed={!!drillFor[k.id]} onClick={() => setDrillFor(d => ({ ...d, [k.id]: !d[k.id] }))}>{I.network}By site</button>}
          </div>
        </div>
      ))}
        {kris.length === 0 && <div className="rbm-inbox-empty">No key risk indicators for this study yet.</div>}
      </div>
      <div className="rbm-note">{I.info}KRIs are either seeded from the TransCelerate library or defined per study. Discrete thresholds are fixed; dynamic thresholds are statistically derived from the cohort. Appending a reading recomputes status via kriStatus() -- the UI never bands a value itself. Every trend has a data-table equivalent (WCAG 2.2 AA).</div>
      {entryFor && (() => { const k = kris.find(x => x.id === entryFor)!; return (
        <RbmFormModal title={`Add reading -- ${k.name}`}
          intro={`Current ${k.current}${k.unit}. Amber ${k.amber}${k.unit}, red ${k.red}${k.unit} (${k.dir === 'higher_worse' ? 'higher is worse' : 'lower is worse'}). Status recomputes on save.`}
          fields={[{ key: 'value', label: `New reading (${k.unit})`, type: 'number' }]} submitLabel="Append reading"
          onCancel={() => setEntryFor(null)} onSubmit={v => { addReading(entryFor, v.value); setEntryFor(null); }} />
      ); })()}
      {cfg && <RbmFormModal title={cfg.mode === 'edit' ? 'Configure KRI' : 'New key risk indicator'}
        intro="Define what the indicator measures, its source and direction, the threshold method (discrete or dynamic/statistical), and the amber/red limits. Status is computed from these -- never entered directly."
        fields={cfgFields}
        initial={cfg.kri ? { ...cfg.kri as unknown as Record<string, string>, amber: String(cfg.kri.amber), red: String(cfg.kri.red), level: cfg.kri.level || 'Site', method: cfg.kri.method || 'discrete' } : { dir: 'higher_worse', method: 'discrete', source: 'EDC', level: 'Site', unit: '%' }}
        submitLabel={cfg.mode === 'edit' ? 'Save configuration' : 'Create KRI'} onCancel={() => setCfg(null)} onSubmit={saveCfg} />}
    </div>
  );
}

/* 5 -- QTLs */
export function RbmQtls({ board }: SubProps) {
  const [qtls, setQtls] = useState<QtlView[]>(() => board.qtls.map(qtlView));
  const [cfg, setCfg] = useState<{ mode: string; qtl?: QtlView } | null>(null);
  const [breach, setBreach] = useState<QtlView | null>(null);
  const saveCfg = (f: Record<string, string>) => {
    const base = { parameter: f.parameter, rationale: f.rationale, unit: f.unit, secondary: +f.secondary, threshold: +f.threshold, current: f.current !== '' ? +f.current : 0 };
    const status = qtlStatusOf(base);
    if (cfg!.mode === 'edit') setQtls(qs => qs.map(q => q.id === cfg!.qtl!.id ? { ...q, ...base, status } : q));
    else setQtls(qs => [...qs, { id: `qtl-${Date.now().toString().slice(-5)}`, ...base, status } as QtlView]);
    setCfg(null);
  };
  const saveBreach = (f: Record<string, string>) => {
    setQtls(qs => qs.map(q => q.id === breach!.id ? { ...q, breachDoc: { justification: f.justification, evidence: f.evidence, capa: f.capa, when: 'just now', by: 'Jordan Chen' } } : q));
    setBreach(null);
  };
  const cfgFields: FormField[] = [
    { key: 'parameter', label: 'Parameter', type: 'text' },
    { key: 'rationale', label: 'Rationale (required for a QTL)', type: 'textarea' },
    { key: 'unit', label: 'Unit', type: 'select', options: ['%', 'events', 'count'] },
    { key: 'secondary', label: 'Secondary (early-warning) limit', type: 'number' },
    { key: 'threshold', label: 'Primary tolerance limit', type: 'number' },
    { key: 'current', label: 'Current value', type: 'number', optional: true },
  ];
  return (
    <div>
      <div className="rbm-bar">
        <span className="rbm-bar-info">{qtls.length} tolerance limits -- study-level -- secondary limit is the RBQM early warning</span>
        <button className="rbm-btn pri" onClick={() => setCfg({ mode: 'new' })}>{I.zap}New QTL</button>
      </div>
      <div className="rbm-card">
        <table className="rbm-tbl qtl"><thead><tr><th>Parameter</th><th>Rationale</th><th style={{ width: 260 }}>Current vs limits</th><th>Status</th><th></th></tr></thead>
          <tbody>{qtls.map(q => (
            <tr key={q.id}>
              <td className="fac"><b>{q.parameter}</b></td>
              <td className="mit">{q.rationale}{q.breachDoc
                ? <span className="rbm-control">{I.check}Breach documented -- {q.breachDoc.when}</span>
                : q.breachAction ? <span className="rbm-control">{I.check}Breach action -- {q.breachAction}</span> : null}</td>
              <td><ThresholdGauge current={q.current} secondary={q.secondary} threshold={q.threshold} unit={q.unit === '%' ? '%' : ''} /></td>
              <td><RbmChip vocab="qtl" value={q.status} /></td>
              <td><div className="rbm-qtl-acts">
                <button className="rbm-rowedit" title="Configure" onClick={() => setCfg({ mode: 'edit', qtl: q })}>{I.penLine}</button>
                {q.status === 'breached' && !q.breachDoc && !q.breachAction && <button className="rbm-linkbtn" onClick={() => setBreach(q)}>Document breach</button>}
              </div></td>
            </tr>
          ))}
          {qtls.length === 0 && <tr><td colSpan={5} className="rbm-col-empty">No quality tolerance limits for this study yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="rbm-note">{I.info}The secondary limit (50-75% of threshold) is the RBQM early-warning band: crossing it triggers review before the tolerance itself is at stake. A breached QTL requires a documented justification, evidence and a CAPA, plus an impact assessment on the affected estimand (routed to Biostatistics).</div>
      {cfg && <RbmFormModal title={cfg.mode === 'edit' ? 'Configure QTL' : 'New quality tolerance limit'}
        intro="A QTL governs a study-level parameter. Rationale is mandatory. Status is computed from the current value against the secondary and primary limits."
        fields={cfgFields} initial={cfg.qtl ? { ...cfg.qtl as unknown as Record<string, string>, secondary: String(cfg.qtl.secondary), threshold: String(cfg.qtl.threshold), current: String(cfg.qtl.current) } : { unit: '%' }}
        submitLabel={cfg.mode === 'edit' ? 'Save limit' : 'Create QTL'} onCancel={() => setCfg(null)} onSubmit={saveCfg} />}
      {breach && <RbmFormModal title={`Document breach -- ${breach.parameter}`}
        intro={`${breach.current}${breach.unit === '%' ? '%' : ''} exceeds the ${breach.threshold}${breach.unit === '%' ? '%' : ''} tolerance. Record the root-cause justification, the supporting evidence, and the CAPA. This is the auditable breach record.`}
        fields={[{ key: 'justification', label: 'Root-cause justification', type: 'textarea' }, { key: 'evidence', label: 'Supporting evidence (documents, datasets)', type: 'textarea' }, { key: 'capa', label: 'CAPA / corrective action', type: 'textarea' }]}
        submitLabel="Record breach" onCancel={() => setBreach(null)} onSubmit={saveBreach} />}
    </div>
  );
}
