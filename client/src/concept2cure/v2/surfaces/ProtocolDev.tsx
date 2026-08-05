/* ------------------------------------------------------------------ *
 *  ProtocolDev.tsx -- protocol development hub (C2C-17 + C2C-18..22)
 *  Ported from protocol-dev.jsx IIFE to typed React module.
 * ------------------------------------------------------------------ */
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { I } from '../icons';
import * as PG from './ProtocolGov';
import type { PdevDoc } from '../fixtures/protocol-data';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { ProtocolRegisterForm, type RegisterKind } from './ProtocolRegisterForms';
import type { SurfaceViewProps } from '../surfaceViews';
import { isClinicalRegulatoryGraphEnabled } from '../clinicalRegulatoryGraphFlag';
import {
  VERIFICATION_LABEL,
  withDenominator,
  type DesignEvidencePanelView,
} from '../fixtures/clinical-regulatory-evidence';

const Ic = PG.Ic;

/** Next major protocol version (kit PDEV_nextMajor). */
const pdevNextMajor = (v: string) => { const m = /^(\d+)\./.exec(v || ''); return m ? ((+m[1]) + 1) + '.0' : '1.0'; };

const TABS = [
  { id: 'document',    label: 'Document',                icon: 'fileText' },
  { id: 'objectives',  label: 'Objectives',              icon: 'clipboardList' },
  { id: 'eligibility', label: 'Eligibility',             icon: 'checkSquare' },
  { id: 'soa',         label: 'Schedule of assessments', icon: 'grid' },
  { id: 'risks',       label: 'Risk register',           icon: 'alertTriangle' },
  { id: 'milestones',  label: 'Milestones',              icon: 'gitBranch' },
  { id: 'budget',      label: 'Budget',                  icon: 'barChart' },
  { id: 'amendments',  label: 'Amendments',              icon: 'gitBranch' },
  { id: 'deviations',  label: 'Deviations & CAPA',       icon: 'shieldAlert' },
  { id: 'reviews',     label: 'Reviews',                 icon: 'checkCircle' },
  { id: 'consent',     label: 'Consent',                 icon: 'scroll' },
];

/* ---- Interfaces ---- */
interface PaneHeadProps { title: string; sub?: string; action?: string; onAction?: () => void }
interface KVProps { k: string; v: string }
interface OutlineProps { doc: any; activeSec: string; onSec: (s: any) => void; onFinalize: () => void }
interface DocumentTabProps { doc: any; sec: any; onGenerate: ((s: any) => void) | null }
interface ListTabProps { doc: any; onAdd: () => void }
interface DocOnlyProps { doc: any }
interface ConsentTabProps { doc: any; onToggle?: () => void }
interface PIAccProps { id: string; title: string; badge?: any; open: boolean; onToggle: () => void; children?: React.ReactNode }
/**
 * The intel dock's props. It is NOT a registered surface — it is exported and
 * hung on `window.ProtocolIntelPanel`, which nothing in the repository reads —
 * so it keeps the loose optional-`onAsk` shape it was written with. See the
 * note at the bridge exports at the foot of this file.
 */
interface WorkspaceProps { onAsk?: (msg: string) => void }

/* ---- Helpers ---- */
export function PaneHead({ title, sub, action, onAction }: PaneHeadProps) {
  return (
    <div className="pd-pane-h">
      <div><h2 className="pd-pane-t">{title}</h2>{sub && <div className="pd-pane-s">{sub}</div>}</div>
      {action && <PG.Btn icon="penLine" variant="outline" onClick={onAction}>{action}</PG.Btn>}
    </div>
  );
}
export function KV({ k, v }: KVProps) {
  return <div className="pd-kv"><span className="pd-kv-k">{k}</span><span className="pd-kv-v pg-mono">{v}</span></div>;
}

/* ---- Outline ---- */
export function Outline({ doc, activeSec, onSec, onFinalize }: OutlineProps) {
  const counts = useMemo(() => ({
    complete: doc.sections.filter((s: any) => s.status === 'complete').length,
    total: doc.sections.length,
    reqTotal: doc.sections.filter((s: any) => s.required).length,
    reqComplete: doc.sections.filter((s: any) => s.required && s.status === 'complete').length,
  }), [doc]);
  const findings = doc.completenessFindings;
  const ready = !findings.some((f: any) => ['critical', 'blocking'].includes(f.sev));
  return (
    <div className="pd-outline">
      <div className="pd-outline-h"><span>Sections</span><span className="pd-outline-c">{counts.complete}/{counts.total}</span></div>
      <div className="pd-tree">
        {doc.sections.map((s: any) => (
          <button key={s.id} className={'pd-tree-row' + (activeSec === s.id ? ' on' : '')} onClick={() => onSec(s)}>
            <span className="pd-tree-dot" data-status={s.status} />
            <span className="pd-tree-num">{s.num}</span>
            <span className="pd-tree-t">{s.title}</span>
            {!s.required && <span className="pd-tree-opt">opt</span>}
          </button>))}
      </div>
      <div className="pd-outline-gate">
        <PG.CompletenessGate pct={doc.completeness} complete={counts.reqComplete} total={counts.reqTotal}
          findings={findings} ready={ready} readyLabel="Finalization readiness"
          actionLabel="Finalize protocol" onAction={onFinalize} />
      </div>
    </div>);
}

/* ---- Document tab ---- */
export function DocumentTab({ doc, sec, onGenerate }: DocumentTabProps) {
  const blocks = doc.content[sec.id];
  const DocCanvas = (window as any).DocCanvas;
  if (DocCanvas) {
    return (
      <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <DocCanvas sec={{ id: sec.id, num: sec.num || sec.number, title: sec.title, status: sec.status, guidance: sec.ref || sec.guidance }}
          blocks={blocks} code={doc.code || 'ICH M11'} context={doc.shortTitle}
          onAsk={onGenerate ? (_prompt: string) => onGenerate(sec) : null}
          storageKey={'pd::' + (doc.id || 'pdev') + '::' + sec.id} />
      </div>);
  }
  return (
    <div className="pd-doc">
      <div className="pd-doc-head">
        <div><div className="pd-doc-eyebrow">Section {sec.num}</div><h2 className="pd-doc-title">{sec.title}</h2></div>
        <PG.StatusBadge status={sec.status} />
      </div>
      {blocks
        ? <div className="pd-prose">{blocks.map((b: any, i: number) => <div key={i} className="pd-block"><h3>{b.h}</h3><p>{b.p}</p></div>)}</div>
        : <div className="pd-doc-empty">
            <div className="pd-doc-empty-t">This section has not been started</div>
            <PG.Btn icon="sparkles" variant="primary" onClick={() => onGenerate && onGenerate(sec)}>Draft with AnA</PG.Btn>
          </div>}
    </div>);
}

/* ---- Objectives ---- */
export function ObjectivesTab({ doc, onAdd }: ListTabProps) {
  const groups = ['primary', 'secondary', 'exploratory'];
  return (
    <div className="pd-pane">
      <PaneHead title="Objectives & endpoints" sub={doc.objectives.length + ' defined'} action="Add objective" onAction={onAdd} />
      {groups.map(g => {
        const items = doc.objectives.filter((o: any) => o.type === g); if (!items.length) return null;
        return (<div key={g} className="pd-obj-group"><div className="pd-obj-gh">{g}</div>
          {items.map((o: any) => (<div key={o.id} className="pd-obj">
            <div className="pd-obj-t">{o.text}</div>
            <div className="pd-obj-ep"><span className="pd-obj-ep-l">Endpoint</span>{o.endpoint}</div>
          </div>))}</div>);
      })}
    </div>);
}

/* ---- Eligibility ---- */
export function EligibilityTab({ doc, onAdd }: ListTabProps) {
  const col = (title: string, items: any[], tone: string) => (
    <div className="pd-elig-col">
      <div className="pd-elig-h" data-tone={tone}>{title}<span className="pd-elig-n">{items.length}</span></div>
      {items.map((c: any) => (<div key={c.id} className="pd-elig-row">
        <span className="pd-elig-mk" data-tone={tone}>{tone === 'ok' ? '✓' : '✕'}</span><span>{c.text}</span>
      </div>))}
    </div>);
  return (
    <div className="pd-pane">
      <PaneHead title="Eligibility criteria" sub={(doc.eligibility.inclusion.length + doc.eligibility.exclusion.length) + ' criteria'} action="Add criterion" onAction={onAdd} />
      <div className="pd-elig">{col('Inclusion', doc.eligibility.inclusion, 'ok')}{col('Exclusion', doc.eligibility.exclusion, 'err')}</div>
    </div>);
}

/* ---- Schedule of assessments ---- */
export function SoaTab({ doc }: DocOnlyProps) {
  const soa = doc.soa;
  const [cells, setCells] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    soa.assessments.forEach((a: any) => { m[a.id] = new Set(soa.cells[a.id] || []); }); return m;
  });
  const toggle = (aid: string, vid: string) => setCells(prev => {
    const n = { ...prev }; const s = new Set(n[aid]); s.has(vid) ? s.delete(vid) : s.add(vid); n[aid] = s; return n;
  });
  const visitTotal = (vid: string) => soa.assessments.reduce((acc: number, a: any) => acc + (cells[a.id].has(vid) ? 1 : 0), 0);
  return (
    <div className="pd-pane">
      <PaneHead title="Schedule of assessments" sub={soa.assessments.length + ' assessments × ' + soa.visits.length + ' visits'} />
      <div className="pd-soa-wrap">
        <table className="pd-soa">
          <thead><tr>
            <th className="pd-soa-cnr">Assessment</th>
            {soa.visits.map((v: any) => (<th key={v.id} className="pd-soa-vh">
              <span className="pd-soa-vl">{v.label}</span><span className="pd-soa-vd">{v.day}</span>
              {v.window && <span className="pd-soa-vw">{v.window}</span>}
            </th>))}
          </tr></thead>
          <tbody>{soa.assessments.map((a: any) => (
            <tr key={a.id}>
              <th className="pd-soa-rh"><span className="pd-soa-rl">{a.label}</span><span className="pd-soa-rc">{a.cat}</span></th>
              {soa.visits.map((v: any) => { const on = cells[a.id].has(v.id); return (
                <td key={v.id} className={'pd-soa-cell' + (on ? ' on' : '')} onClick={() => toggle(a.id, v.id)} role="checkbox" aria-checked={on} title={a.label + ' · ' + v.label}>
                  {on ? <span className="pd-soa-x">{'✕'}</span> : null}
                </td>); })}
            </tr>))}</tbody>
          <tfoot><tr>
            <th className="pd-soa-rh foot">Per-visit total</th>
            {soa.visits.map((v: any) => <td key={v.id} className={'pd-soa-tot' + (visitTotal(v.id) < 3 ? ' low' : '')}>{visitTotal(v.id)}</td>)}
          </tr></tfoot>
        </table>
      </div>
      <div className="pd-soa-issues"><PG.FindingsList findings={soa.issues} dense={true} /></div>
    </div>);
}

/* ---- Risk register ---- */
export function RiskTab({ doc, onAdd }: ListTabProps) {
  const risks = doc.risks;
  const grid = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (let l = 5; l >= 1; l--) for (let i = 1; i <= 5; i++) g[l + '-' + i] = [];
    risks.forEach((r: any) => g[r.l + '-' + r.i].push(r)); return g;
  }, [risks]);
  const cellTone = (l: number, i: number) => { const s = l * i; return s >= 15 ? 'err' : s >= 8 ? 'warn' : s >= 4 ? 'ai' : 'ok'; };
  const [sel, setSel] = useState<any>(null);
  return (
    <div className="pd-pane">
      <PaneHead title="Risk register" sub={risks.length + ' risks · ' + risks.filter((r: any) => r.l * r.i >= 15).length + ' extreme'} action="Add risk" onAction={onAdd} />
      <div className="pd-risk-split">
        <div className="pd-heat">
          <div className="pd-heat-yl">{`Likelihood →`}</div>
          <div className="pd-heat-grid">{[5, 4, 3, 2, 1].map(l => (
            <div key={l} className="pd-heat-row"><span className="pd-heat-axis">{l}</span>
              {[1, 2, 3, 4, 5].map(i => { const items = grid[l + '-' + i]; return (
                <div key={i} className="pd-heat-cell" data-tone={cellTone(l, i)} onClick={() => items.length && setSel(items[0])}>
                  {items.length ? <span className="pd-heat-n">{items.length}</span> : null}
                </div>); })}</div>))}
          </div>
          <div className="pd-heat-xl">{[1, 2, 3, 4, 5].map(i => <span key={i}>{i}</span>)}<span className="pd-heat-xt">{`Impact →`}</span></div>
        </div>
        <div className="pd-risk-list">{risks.map((r: any) => (
          <div key={r.id} className={'pd-risk' + (sel && sel.id === r.id ? ' on' : '')} onClick={() => setSel(r)}>
            <div className="pd-risk-top">
              <span className="pd-risk-score" data-tone={cellTone(r.l, r.i)}>{r.l * r.i}</span>
              <span className="pd-risk-haz">{r.hazard}</span><PG.StatusBadge status={r.status} />
            </div>
            <div className="pd-risk-meta">
              <span className="pd-chip">{r.cat}</span><span>Inherent L{r.l}×I{r.i}</span>
              <span className="pd-risk-arrow">{'→'}</span><span className="pd-risk-resid">Residual L{r.rl}×I{r.ri}</span>
            </div>
            {sel && sel.id === r.id && <div className="pd-risk-mit"><b>Mitigation: </b>{r.mitigation}</div>}
          </div>))}</div>
      </div>
    </div>);
}

/* ---- Milestones ---- */
export function MilestonesTab({ doc, onAdd }: ListTabProps) {
  const ms = doc.milestones;
  const URG: Record<string, { l: string; t: string }> = { done: { l: 'Complete', t: 'ok' }, due_30: { l: 'Due ≤30d', t: 'warn' }, due_90: { l: 'Due ≤90d', t: 'ai' }, upcoming: { l: 'Upcoming', t: 'idle' } };
  return (
    <div className="pd-pane">
      <PaneHead title="Milestones & timeline" sub={ms.length + ' milestones'} action="Add milestone" onAction={onAdd} />
      <div className="pd-timeline">{ms.map((m: any, idx: number) => (
        <div key={m.id} className="pd-tl-row" data-status={m.status}>
          <div className="pd-tl-rail">
            <span className="pd-tl-node" data-status={m.status}>{m.status === 'done' ? '✓' : ''}</span>
            {idx < ms.length - 1 ? <span className="pd-tl-line" /> : null}
          </div>
          <div className="pd-tl-card">
            <div className="pd-tl-date">{m.date}</div><div className="pd-tl-label">{m.label}</div>
            <span className="pg-badge" data-tone={(URG[m.urgency] || URG.upcoming).t}>{(URG[m.urgency] || URG.upcoming).l}</span>
          </div>
        </div>))}</div>
    </div>);
}

/* ---- Budget ---- */
export function BudgetTab({ doc }: DocOnlyProps) {
  const b = doc.budget; const p = b.params;
  const perSubjectDirect = b.items.reduce((a: number, i: any) => a + i.perSubject, 0);
  const fa = Math.round(perSubjectDirect * p.faRate);
  const totalPerSubject = perSubjectDirect + fa;
  const totalCost = totalPerSubject * p.enrollment;
  const sponsorRev = p.sponsorPerSubject * p.enrollment;
  const margin = sponsorRev - totalCost;
  const funded = margin >= 0;
  const cats = useMemo(() => { const m: Record<string, number> = {}; b.items.forEach((i: any) => { m[i.cat] = (m[i.cat] || 0) + i.perSubject; }); return m; }, [b]);
  return (
    <div className="pd-pane">
      <PaneHead title="Budget & feasibility" sub={p.enrollment + ' subjects'} />
      <div className="pd-budget">
        <div className="pd-budget-items">
          <table className="pd-bg-table">
            <thead><tr><th>Category</th><th>Line item</th><th className="r">Per subject</th></tr></thead>
            <tbody>{b.items.map((i: any) => (
              <tr key={i.id}><td><span className="pd-chip">{i.cat}</span></td><td>{i.label}</td><td className="r pg-mono">{'$' + i.perSubject.toLocaleString()}</td></tr>
            ))}</tbody>
            <tfoot>
              <tr><td colSpan={2}>Direct cost per subject</td><td className="r pg-mono">{'$' + perSubjectDirect.toLocaleString()}</td></tr>
              <tr><td colSpan={2}>{'F&A (' + Math.round(p.faRate * 100) + '%)'}</td><td className="r pg-mono">{'$' + fa.toLocaleString()}</td></tr>
              <tr className="pd-bg-total"><td colSpan={2}>Total per subject</td><td className="r pg-mono">{'$' + totalPerSubject.toLocaleString()}</td></tr>
            </tfoot>
          </table>
        </div>
        <div className="pd-budget-summary">
          <div className="pd-feas" data-funded={funded}>
            <div className="pd-feas-verdict">{funded ? 'Funded' : 'Under-funded'}</div>
            <div className="pd-feas-margin">{(margin < 0 ? '−$' : '$') + Math.abs(margin).toLocaleString()}</div>
            <div className="pd-feas-sub">{'projected margin across ' + p.enrollment + ' subjects'}</div>
          </div>
          <KV k="Total study cost" v={'$' + totalCost.toLocaleString()} />
          <KV k="Sponsor revenue" v={'$' + sponsorRev.toLocaleString()} />
          <KV k="Sponsor $/subject" v={'$' + p.sponsorPerSubject.toLocaleString()} />
          <div className="pd-cat-bars">{Object.entries(cats).map(([c, v]) => (
            <div key={c} className="pd-cat-bar"><span className="pd-cat-l">{c}</span>
              <span className="pd-cat-track"><span className="pd-cat-fill" style={{ width: Math.round(v / perSubjectDirect * 100) + '%' }} /></span>
              <span className="pd-cat-v pg-mono">{'$' + v.toLocaleString()}</span></div>))}</div>
        </div>
      </div>
    </div>);
}

/* ---- Amendments ---- */
export function AmendmentsTab({ doc, onAdd }: ListTabProps) {
  return (
    <div className="pd-pane">
      <PaneHead title="Amendments" sub={doc.amendments.length + ' amendments'} action="New amendment" onAction={onAdd} />
      {doc.amendments.map((a: any) => (
        <div key={a.id} className="pd-card">
          <div className="pd-card-h">
            <span className="pd-card-t">{a.num}</span><span className="pd-chip">{a.path}</span>
            {a.reconsent && <span className="pg-badge" data-tone="warn">Re-consent</span>}
            <PG.StatusBadge status={a.status} />
          </div>
          <div className="pd-card-sum">{a.summary}</div>
          <div className="pd-changeset">{a.changes.map((c: any, i: number) => (
            <div key={i} className="pd-change"><span className="pd-change-sec">{c.sec}</span><span className="pd-change-from">{c.from}</span>
              <span className="pd-change-arrow">{'→'}</span><span className="pd-change-to">{c.to}</span></div>))}</div>
        </div>))}
    </div>);
}

/* ---- Deviations & CAPA ---- */
export function DeviationsTab({ doc, onAdd }: ListTabProps) {
  return (
    <div className="pd-pane">
      <PaneHead title="Deviations & CAPA" sub={doc.deviations.length + ' deviations'} action="Report deviation" onAction={onAdd} />
      {doc.deviations.map((d: any) => (
        <div key={d.id} className="pd-card">
          <div className="pd-card-h">
            <span className="pg-badge" data-tone={d.sev === 'major' ? 'err' : 'warn'}>{PG.labelize(d.sev)}</span>
            <span className="pd-card-t">{d.title}</span>
            {d.reportable && <span className="pg-badge" data-tone="err">Reportable</span>}
            <PG.StatusBadge status={d.status} />
          </div>
          <div className="pd-card-sum"><span className="pd-chip">{d.cat}</span></div>
          <div className="pd-capa"><div className="pd-capa-h">CAPA actions</div>
            {d.capa.map((c: any) => (<div key={c.id} className="pd-capa-row">
              <span className="pd-capa-dot" data-status={c.status} /><span>{c.action}</span><PG.StatusBadge status={c.status} />
            </div>))}</div>
        </div>))}
    </div>);
}

/* ---- Reviews ---- */
export function ReviewsTab({ doc }: DocOnlyProps) {
  const allComments = doc.reviews.flatMap((r: any) => r.comments);
  const blocking = allComments.filter((c: any) => c.sev === 'blocking' && !c.resolved).length;
  return (
    <div className="pd-pane">
      <PaneHead title="Review & comments" sub={doc.reviews.length + ' reviewers · ' + blocking + ' blocking open'} />
      <div className="pd-review-sum">{doc.reviews.map((r: any) => (
        <div key={r.id} className="pd-reviewer"><span className="pd-rv-name">{r.reviewer}</span><PG.StatusBadge status={r.status} /></div>))}</div>
      {allComments.length ? (
        <div className="pd-comments">{allComments.map((c: any) => (
          <div key={c.id} className="pd-comment" data-sev={c.sev}>
            <div className="pd-comment-h">
              <span className="pg-badge" data-tone={PG.SEV_TONE[c.sev]}>{PG.labelize(c.sev)}</span>
              <span className="pd-comment-sec">{c.sec}</span><span className="pd-comment-st">{c.resolved ? 'Resolved' : 'Open'}</span>
            </div>
            <div className="pd-comment-t">{c.text}</div>
          </div>))}</div>
      ) : <div className="pg-empty">No open comments.</div>}
    </div>);
}

/* ---- Consent ---- */
export function ConsentTab({ doc, onToggle }: ConsentTabProps) {
  const present = doc.consent.filter((c: any) => c.present).length;
  const pct = Math.round(present / doc.consent.length * 100);
  return (
    <div className="pd-pane">
      <PaneHead title="Informed consent" sub={present + ' of ' + doc.consent.length + ' required elements present'} />
      <div className="pd-consent-meter">
        <div className="pd-consent-bar"><div className="pd-consent-fill" style={{ width: pct + '%' }} /></div>
        <span className="pd-consent-pct">{pct + '% complete'}</span>
        <PG.Citation basis="45 CFR 46.116 — General requirements for informed consent" />
      </div>
      <div className="pd-consent-list">{doc.consent.map((c: any) => (
        <label key={c.id} className={'pd-consent-row' + (c.present ? '' : ' missing')}>
          <span className="pd-consent-ck" data-on={c.present}>{c.present ? '✓' : ''}</span><span>{c.el}</span>
        </label>))}</div>
    </div>);
}

/* ---- Main workspace ----

   Registered as `protocol-dev` with NO `ownsConversation`, so the shell draws
   its AnA rail beside this surface and `onAsk` lands somewhere the user can
   see. It used to hide that rail while calling `onAsk` from the header "Ask
   AnA" button and from every section's Generate — the question went into a
   column this screen never rendered, and `ask()` persisted the rail open for
   whichever surface came next.

   The rail is affordable here in a way it is not in the authoring editor:
   `.pd-grid` is two tracks (`268px 1fr`), `.pd-work` sets `overflow-y:auto`
   (which zeroes its automatic minimum size, so the work column shrinks rather
   than overflowing) and `.pd-pane` is capped at 920px anyway. And there is
   nothing in-place for an answer to be written into: the document body here is
   read-only — DocumentTab reaches for `window.DocCanvas`, assigned nowhere in
   the repository, and falls through to a static render.

   Props are the full `SurfaceViewProps` rather than the old optional-only
   `WorkspaceProps`. That shape was a weak type — every property optional — so
   the registry could accept it without ever checking the props it actually
   receives. `onAsk` is required and non-null now, which is what the surface has
   always been handed. */
export function ProtocolWorkspace({ onAsk }: SurfaceViewProps) {
  // GET /api/protocol-dev → the org's in-development protocol(s), already shaped
  // to the PdevDoc render contract (server/routes/protocol-dev.routes.ts reads
  // the real c2c_protocol_dev table via pool, org-scoped, JSONB rehydrated).
  // Real rows, an honest empty state, or an honest failed-load — never a fixture.
  // reloadKey bumps after a successful register write so the JSONB read-model
  // refetches and the register renders the server's row (nothing local).
  const [reloadKey, setReloadKey] = useState(0);
  const { rows, loading, error, empty } = useLiveRows<PdevDoc>('/api/protocol-dev', ['/api/protocol-dev', reloadKey]);
  if (loading) {
    return <div className="pd-wrap"><div className="scaf-note" style={{ margin: 16 }}>Loading protocol…</div></div>;
  }
  if (error) {
    return (
      <div className="pd-wrap" style={{ padding: 16 }}>
        <EmptyState tone="error" icon={I.alertTriangle}
          title="Couldn't load the protocol"
          hint="The protocol authoring store didn't respond. This is the organization's in-development clinical protocol — sign in and retry, or check that the service is reachable." />
      </div>);
  }
  const doc = rows[0];
  if (empty || !doc) {
    return (
      <div className="pd-wrap" style={{ padding: 16 }}>
        <EmptyState icon={I.fileText}
          title="No protocol in development yet"
          hint="Start a clinical protocol to author it here — sections, objectives, schedule of assessments, risk register, budget, amendments, and review threads are all governed on this document." />
      </div>);
  }
  return <ProtocolWorkspaceDoc doc={doc} onAsk={onAsk} onChanged={() => setReloadKey((k) => k + 1)} />;
}

/* ---- Workspace body — a real, loaded protocol document ---- */
function ProtocolWorkspaceDoc({ doc, onAsk, onChanged }: { doc: PdevDoc; onAsk: (msg: string) => void; onChanged?: () => void }) {
  const [tab, setTab] = useState('document');
  const [activeSec, setActiveSec] = useState(doc.openSection);
  const [gov, setGov] = useState<any>(null);
  // Which register create-form is open (risk/milestone/amendment/deviation) —
  // these POST to the real protocol-* routers, replacing the former reason-only
  // governed dialog whose onConfirm was a no-op.
  const [reg, setReg] = useState<RegisterKind | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }, []);
  // The write routers key on the numeric c2c_protocol_dev id.
  const numericDocId = Number(doc.id);
  const canWrite = Number.isInteger(numericDocId) && numericDocId > 0;
  const openReg = (kind: RegisterKind) => {
    if (!canWrite) { fireToast('This protocol row has no numeric document id — register writes need the governed store.'); return; }
    setReg(kind);
  };
  const sec = doc.sections.find((s: any) => s.id === activeSec) || doc.sections[0];
  const onSec = (s: any) => { setActiveSec(s.id); setTab(s.tab || 'document'); };
  const generate = (s: any) => onAsk('Draft ' + s.title + ' for ' + doc.shortTitle + ' from the linked evidence.');
  // Every action routed through here opened a 21 CFR Part 11 e-signature
  // dialog whose onConfirm below is `() => {}`, and the dialog then toasted
  // "<Action> recorded · AUD-9100" from a client-side counter. Nothing was
  // written, and the audit id referred to nothing. The fabricated id is gone
  // (see ProtocolGov.tsx); the dialog is kept because reason-for-change capture
  // is the right shape, but the intent line now states plainly that the action
  // is not persisted, so no one signs believing something was filed.
  const NOT_PERSISTED = ' — NOTE: this action is not yet connected to the record; nothing is written or audited.';
  const govAct = (cfg: any) =>
    setGov({ ...cfg, intent: (cfg?.intent ?? '') + NOT_PERSISTED, esign: false });
  const body = (() => {
    switch (tab) {
      case 'objectives':  return <ObjectivesTab doc={doc} onAdd={() => govAct({ title: 'Add objective', intent: 'Add a study objective and its endpoint.', basis: 'ICH M11 — Objectives & Endpoints' })} />;
      case 'eligibility': return <EligibilityTab doc={doc} onAdd={() => govAct({ title: 'Add eligibility criterion', intent: 'Add an inclusion or exclusion criterion.', basis: 'ICH M11 — Study Population' })} />;
      case 'soa':         return <SoaTab doc={doc} />;
      case 'risks':       return <RiskTab doc={doc} onAdd={() => openReg('risk')} />;
      case 'milestones':  return <MilestonesTab doc={doc} onAdd={() => openReg('milestone')} />;
      case 'budget':      return <BudgetTab doc={doc} />;
      case 'amendments':  return <AmendmentsTab doc={doc} onAdd={() => openReg('amendment')} />;
      case 'deviations':  return <DeviationsTab doc={doc} onAdd={() => openReg('deviation')} />;
      case 'reviews':     return <ReviewsTab doc={doc} />;
      case 'consent':     return <ConsentTab doc={doc} />;
      default:            return sec ? <DocumentTab doc={doc} sec={sec} onGenerate={generate} /> : <div className="pd-pane"><div className="pg-empty">This protocol has no sections yet.</div></div>;
    }
  })();
  return (
    <div className="pd-wrap">
      <div className="pd-head">
        <div className="pd-head-l">
          <span className="pd-kind">{(doc.kind ? PG.labelize(doc.kind) + ' ' : '') + 'protocol'}</span>
          <div className="pd-titrow"><h1 className="pd-title">{doc.title}</h1><span className="pd-short">{doc.shortTitle}</span></div>
          <div className="pd-subrow">
            <span>{doc.sponsor}</span><span className="pd-dot" /><span>PI {doc.pi}</span><span className="pd-dot" /><PG.StatusBadge status={doc.status} />
          </div>
        </div>
        <div className="pd-head-r">
          {/* Was "Autosaved · v{version}". The register forms on this surface do
              persist (POST /api/protocol-{risks,milestones,amendments,deviations}),
              but the section content does not: DocumentTab reaches for
              window.DocCanvas, a global that is assigned nowhere in the
              repository, and falls through to a static render. So the document
              body is read-only and nothing about it is autosaved. The version is
              still worth showing — it is real, from GET /api/protocol-dev. */}
          <span className="pd-autosave">{'v' + (doc.version || '—') + (doc.updated ? ' · updated ' + doc.updated : '')}</span>
          <PG.Btn icon="sparkles" variant="outline" onClick={() => onAsk('Review ' + doc.shortTitle + ' for completeness and list what blocks finalization.')}>Ask AnA</PG.Btn>
          <PG.Btn icon="fileText" variant="outline" onClick={() => govAct({ title: 'Export protocol', intent: 'Render the assembled protocol to DOCX / PDF.', esign: false })}>Export</PG.Btn>
        </div>
      </div>
      <div className="pd-tabs">{TABS.map(t => (
        <button key={t.id} className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
          <Ic n={t.icon} s={14} />{t.label}</button>))}</div>
      <div className="pd-grid">
        <Outline doc={doc} activeSec={activeSec} onSec={onSec} onFinalize={() => govAct({
          title: 'Finalize protocol', intent: 'Finalize this protocol version. Required sections must be complete; bumps to v' + pdevNextMajor(doc.version) + '.',
          basis: 'Deterministic completeness gate · 21 CFR Part 11 e-signature', esign: true })} />
        <div className="pd-work">{body}</div>
      </div>
      <PG.GovernedActionDialog open={!!gov} onClose={() => setGov(null)} onConfirm={() => {}} {...(gov || {})} />
      {reg && canWrite && (
        <ProtocolRegisterForm
          kind={reg}
          protocolDocumentId={numericDocId}
          onCancel={() => setReg(null)}
          onDone={(kind) => {
            setReg(null);
            fireToast('Recorded — the ' + kind + ' was written to the governed register.');
            onChanged?.();
          }}
          onError={(m) => fireToast(m)}
        />
      )}
      {toast && <div className="de-toast"><span className="ico">{I.checkCircle}</span>{toast}</div>}
    </div>);
}

/* ---- Intel accordion + panel ---- */
export function PIAcc({ id, title, badge, open, onToggle, children }: PIAccProps) {
  return (
    <div className="pi-acc" data-open={open || undefined}>
      <button className="pi-acc-h" onClick={onToggle}>
        <span className="pi-acc-mk"><Ic n="right" s={13} /></span><span className="pi-acc-t">{title}</span>
        {badge != null && <span className="pi-acc-b">{badge}</span>}
      </button>
      {open && <div className="pi-acc-body">{children}</div>}
    </div>);
}

export function ProtocolIntelPanel({ onAsk }: WorkspaceProps) {
  // Same real protocol document as the workspace (GET /api/protocol-dev, the
  // c2c_protocol_dev store via pool). Honest loading / empty / error — never a
  // fixture.
  const { rows, loading, error, empty } = useLiveRows<PdevDoc>('/api/protocol-dev');
  if (loading) {
    return <div className="pi-dock"><div className="scaf-note" style={{ margin: 12 }}>Loading…</div></div>;
  }
  if (error) {
    return (
      <div className="pi-dock">
        <EmptyState tone="error" icon={I.alertTriangle}
          title="Couldn't load the protocol"
          hint="The protocol store didn't respond. Sign in and retry, or check that the service is reachable." />
      </div>);
  }
  const doc = rows[0];
  if (empty || !doc) {
    return (
      <div className="pi-dock">
        <EmptyState icon={I.fileText}
          title="No protocol in development yet"
          hint="Start a protocol to see finalization readiness, objectives, eligibility, risks, and milestones here." />
      </div>);
  }
  return <ProtocolIntelDock doc={doc} onAsk={onAsk} />;
}

function ProtocolIntelDock({ doc, onAsk }: { doc: PdevDoc; onAsk?: (msg: string) => void }) {
  const [open, setOpen] = useState<string | null>('readiness');
  const tog = (k: string) => setOpen(open === k ? null : k);
  const ask = (m: string) => onAsk && onAsk(m);
  const reqTotal = doc.sections.filter((s: any) => s.required).length;
  const reqDone  = doc.sections.filter((s: any) => s.required && s.status === 'complete').length;
  const ready    = !doc.completenessFindings.some((f: any) => ['critical', 'blocking'].includes(f.sev));
  const objGroups = ['primary', 'secondary', 'exploratory'];
  const topRisks = [...doc.risks].sort((a: any, b: any) => (b.l * b.i) - (a.l * a.i)).slice(0, 4);
  const riskTone = (l: number, i: number) => { const s = l * i; return s >= 15 ? 'err' : s >= 8 ? 'warn' : s >= 4 ? 'ai' : 'ok'; };
  const msNext = doc.milestones.filter((m: any) => m.status !== 'done').slice(0, 4);
  return (
    <div className="pi-dock">
      <PIAcc id="readiness" title="Finalization readiness" badge={doc.completeness + '%'} open={open === 'readiness'} onToggle={() => tog('readiness')}>
        <PG.CompletenessGate pct={doc.completeness} complete={reqDone} total={reqTotal} findings={doc.completenessFindings} ready={ready} readyLabel="Finalization readiness" />
      </PIAcc>
      <PIAcc id="objectives" title="Objectives & endpoints" badge={doc.objectives.length} open={open === 'objectives'} onToggle={() => tog('objectives')}>
        {objGroups.map(g => { const items = doc.objectives.filter((o: any) => o.type === g); if (!items.length) return null;
          return (<div key={g} className="pi-grp"><div className="pi-grp-h">{g}</div>
            {items.map((o: any) => (<div key={o.id} className="pi-row">
              <p className="pi-row-t">{o.text}</p><p className="pi-row-s">{'Endpoint · ' + o.endpoint}</p></div>))}</div>); })}
      </PIAcc>
      <PIAcc id="eligibility" title="Eligibility" badge={doc.eligibility.inclusion.length + doc.eligibility.exclusion.length} open={open === 'eligibility'} onToggle={() => tog('eligibility')}>
        <div className="pi-elig">
          <div className="pi-elig-col">
            <div className="pi-elig-h" data-tone="ok">Inclusion <span>{doc.eligibility.inclusion.length}</span></div>
            {doc.eligibility.inclusion.map((c: any) => <div key={c.id} className="pi-elig-row">{c.text}</div>)}
          </div>
          <div className="pi-elig-col">
            <div className="pi-elig-h" data-tone="err">Exclusion <span>{doc.eligibility.exclusion.length}</span></div>
            {doc.eligibility.exclusion.map((c: any) => <div key={c.id} className="pi-elig-row">{c.text}</div>)}
          </div>
        </div>
      </PIAcc>
      <PIAcc id="risks" title="Risk register" badge={doc.risks.length} open={open === 'risks'} onToggle={() => tog('risks')}>
        {topRisks.map((r: any) => (<div key={r.id} className="pi-risk">
          <span className="pi-risk-score" data-tone={riskTone(r.l, r.i)}>{r.l * r.i}</span>
          <div className="pi-risk-body"><p className="pi-row-t">{r.hazard}</p>
            <p className="pi-row-s">{r.cat + ' · L' + r.l + '×I' + r.i + (r.status ? ' · ' + r.status : '')}</p></div>
        </div>))}
      </PIAcc>
      <PIAcc id="milestones" title="Milestones" badge={msNext.length + ' upcoming'} open={open === 'milestones'} onToggle={() => tog('milestones')}>
        {msNext.map((m: any) => (<div key={m.id} className="pi-ms">
          <span className="pi-ms-dot" data-urg={m.urgency} /><span className="pi-ms-l">{m.label}</span><span className="pi-ms-d">{m.date}</span>
        </div>))}
      </PIAcc>
      <DesignEvidenceAccordions designNodeId={doc.id != null ? String(doc.id) : null} onAsk={onAsk} />
      <button className="pi-ask" onClick={() => ask('Review the protocol for finalization gaps and draft the missing required sections.')}>
        <Ic n="sparkles" s={13} />Ask AnA to close gaps
      </button>
    </div>);
}

/**
 * The seven §13 evidence accordions, appended to the existing intel dock under
 * an "Evidence" divider. The existing five accordions, the outline, the SoA grid
 * and the register forms are untouched.
 *
 * ONE fetch (`design-evidence?designNodeId=`) answers all seven questions, so
 * the dock can never show supporting evidence that has arrived beside
 * contradictions that have not — a half-loaded evidence picture reads as a
 * one-sided one.
 *
 * Flag off ⇒ renders nothing at all, and the dock is byte-identical to before.
 */
function DesignEvidenceAccordions({
  designNodeId,
  onAsk,
}: {
  designNodeId: string | null;
  onAsk?: (msg: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const graphOn = isClinicalRegulatoryGraphEnabled();
  const path =
    graphOn && designNodeId
      ? `/api/clinical-regulatory-evidence/design-evidence?designNodeId=${encodeURIComponent(designNodeId)}`
      : null;
  const res = useLiveData<DesignEvidencePanelView>(path);

  if (!graphOn) return null;

  const tog = (k: string) => setOpen(open === k ? null : k);
  const d = res.data;
  const cov = d?.coverage ?? null;

  /** Honest per-accordion empty text — never a blank body that reads as "none". */
  const none = (what: string) => <div className="crl-ev-empty">No {what} in the evidence graph yet.</div>;

  return (
    <>
      <div className="crl-ev-divider">
        <span>Evidence</span>
      </div>

      {res.error && (
        <div className="crl-ev-empty">
          Couldn&apos;t reach the evidence graph. Nothing is shown from a cached sample.
        </div>
      )}

      <PIAcc
        id="ev-comparable"
        title="Comparable studies"
        badge={d?.comparableStudies.length ?? 0}
        open={open === 'ev-comparable'}
        onToggle={() => tog('ev-comparable')}
      >
        {!d || d.comparableStudies.length === 0
          ? none('comparable studies')
          : (() => {
              const usable = d.comparableStudies.filter((s) => s.machineReadable).length;
              return (
                <>
                  {d.comparableStudies.slice(0, 6).map((s, i) => (
                    <div key={s.nctId ?? s.sponsorStudyId ?? i} className="pi-row">
                      <p className="pi-row-t">
                        {s.nctId ?? s.sponsorStudyId ?? 'unidentified study'}
                        {s.phase ? ` · ${s.phase}` : ''}
                        {s.indication ? ` · ${s.indication}` : ''}
                      </p>
                      <p className="pi-row-s">
                        {s.designSummary}
                        {s.machineReadable ? '' : ' · not machine-readable — excluded from every prior'}
                      </p>
                    </div>
                  ))}
                  <div className="crl-ev-empty">
                    {withDenominator(usable, d.comparableStudies.length)} carry a machine-readable
                    effect with uncertainty. The rest are listed but excluded from any prior.
                  </div>
                </>
              );
            })()}
      </PIAcc>

      <PIAcc
        id="ev-observed"
        title="Observed results"
        badge={d?.observations.length ?? 0}
        open={open === 'ev-observed'}
        onToggle={() => tog('ev-observed')}
      >
        {!d || d.observations.length === 0 ? (
          none('structured observations')
        ) : (
          <>
            {d.pooled && (
              <div className="pi-row">
                <p className="pi-row-t">
                  {d.pooled.measure} {d.pooled.value} (95% CI {d.pooled.ci[0]}–{d.pooled.ci[1]})
                </p>
                <p className="pi-row-s">Pooled n {d.pooled.n}</p>
              </div>
            )}
            <div className="crl-ev-empty">
              Benefit direction normalised; the transformation is recorded on each observation.
            </div>
          </>
        )}
      </PIAcc>

      <PIAcc
        id="ev-objections"
        title="FDA objections"
        badge={d?.findings.length ?? 0}
        open={open === 'ev-objections'}
        onToggle={() => tog('ev-objections')}
      >
        {!d || d.findings.length === 0
          ? none('FDA findings mapped to this design node')
          : d.findings.slice(0, 6).map((f) => (
              <div key={f.findingId} className="pi-row">
                <p className="pi-row-t">{f.finding}</p>
                <p className="pi-row-s">
                  {f.source.applicationType} {f.source.applicationNumber}
                  {f.source.page != null ? ` · p. ${f.source.page}` : ''} ·{' '}
                  {f.epistemicStatus === 'explicit' ? 'explicit' : 'inferred'} ·{' '}
                  {VERIFICATION_LABEL[f.verification]}
                </p>
              </div>
            ))}
      </PIAcc>

      <PIAcc
        id="ev-stress"
        title="Stress tests"
        badge={d ? `${d.stressScenarios.length} selected` : 0}
        open={open === 'ev-stress'}
        onToggle={() => tog('ev-stress')}
      >
        {!d || d.stressScenarios.length === 0 ? (
          none('selected stress scenarios')
        ) : (
          <>
            {d.stressScenarios.map((s) => (
              <div key={s.scenarioId} className="pi-row">
                <p className="pi-row-t">{s.label}</p>
                <p className="pi-row-s">
                  {s.parameterSource === 'none' ? 'No numeric parameter — scenario only' : s.parameterNote}
                </p>
              </div>
            ))}
            <div className="crl-ev-empty">
              Scenarios are selected by CRL pattern. The letters justify why each matters; they do
              not supply the numbers.
            </div>
          </>
        )}
      </PIAcc>

      <PIAcc
        id="ev-assumptions"
        title="Assumptions"
        badge={d?.assumptions.length ?? 0}
        open={open === 'ev-assumptions'}
        onToggle={() => tog('ev-assumptions')}
      >
        {!d || d.assumptions.length === 0
          ? none('recorded assumptions')
          : d.assumptions.map((a, i) => (
              <div key={i} className="pi-row">
                <p className="pi-row-t">
                  {a.label} · {a.value}
                </p>
                <p className="pi-row-s">Source: {a.source}</p>
              </div>
            ))}
      </PIAcc>

      <PIAcc
        id="ev-contradictions"
        title="Contradictory evidence"
        badge={d?.contradictions.length ?? 0}
        open={open === 'ev-contradictions'}
        onToggle={() => tog('ev-contradictions')}
      >
        {/* Retrieved separately and shown separately — never averaged into support. */}
        {!d || d.contradictions.length === 0
          ? none('contradictory evidence')
          : d.contradictions.map((c, i) => (
              <div key={i} className="pi-row">
                <p className="pi-row-t">{c.text}</p>
                {c.source && (
                  <p className="pi-row-s">
                    {c.source.applicationType} {c.source.applicationNumber}
                    {c.source.page != null ? ` · p. ${c.source.page}` : ''}
                  </p>
                )}
              </div>
            ))}
      </PIAcc>

      <PIAcc
        id="ev-sources"
        title="Sources"
        badge={cov ? `${cov.cited} cited` : 0}
        open={open === 'ev-sources'}
        onToggle={() => tog('ev-sources')}
      >
        {!cov ? (
          none('coverage')
        ) : (
          <div className="crl-ev-empty">
            {cov.scanned} scanned · {withDenominator(cov.eligible, cov.scanned)} eligible ·{' '}
            {withDenominator(cov.structured, cov.eligible)} structured ·{' '}
            {withDenominator(cov.verified, cov.structured)} verified · {cov.cited} cited.
            {cov.exclusionNote ? ` ${cov.exclusionNote}` : ''}
          </div>
        )}
      </PIAcc>

      <button
        className="crl-trace-btn"
        onClick={() =>
          onAsk &&
          onAsk(
            'Trace this recommendation: show the sources, transformations, calculations, assumptions and contradictions behind it.',
          )
        }
      >
        <Ic n="sparkles" s={13} />Trace this recommendation
      </button>
    </>
  );
}

/* ---- Bridge exports ----

   NOT AUDITED HERE, and worth saying so plainly: `ProtocolIntelPanel` is
   imported by nothing and read off `window` by nothing, so the dock below it —
   including its own "Ask AnA" and "Trace this recommendation" buttons — is
   unreachable UI. It is left intact because deleting a component is a separate
   decision from fixing where a question goes, but it is dead, and its `onAsk`
   calls describe an affordance no user can press. Same for `window.DocCanvas`,
   which DocumentTab still tests for (see the note there) and which is assigned
   nowhere in the repository. */
(window as any).PDEV_nextMajor = pdevNextMajor;
(window as any).ProtocolWorkspace = ProtocolWorkspace;
(window as any).ProtocolIntelPanel = ProtocolIntelPanel;
(window as any).SURFACE_VIEWS = (window as any).SURFACE_VIEWS || {};
