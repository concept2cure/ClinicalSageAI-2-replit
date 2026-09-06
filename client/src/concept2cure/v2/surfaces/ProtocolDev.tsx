/* ------------------------------------------------------------------ *
 *  ProtocolDev.tsx -- protocol development hub (C2C-17 + C2C-18..22)
 *  Ported from protocol-dev.jsx IIFE to typed React module.
 * ------------------------------------------------------------------ */
import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import * as PG from './ProtocolGov';
import type { PdevDoc } from '../fixtures/protocol-data';
import { useLiveRows, EmptyState } from '../dataConnect';
import { ProtocolRegisterForm, type RegisterKind } from './ProtocolRegisterForms';
import { apiRequest } from '@/lib/queryClient';
import { downloadBlob, downloadText, safeFileName } from '../download';
import { C2CForm } from '../C2CForm';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CToast, useToast } from '../toast';

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

/* ---- Absent collections ----

   `PdevDoc` types every register (`sections`, `risks`, `budget`, …) as required,
   but the document is assembled from protocol_documents plus a dozen optional
   child tables (pdev-view-assembler), and each register is its own JSONB column.
   A protocol authored before a register existed, or one the assembler found no
   child rows for, arrives with that key null — the envelope is a perfectly good
   list of objects, so no boundary guard sees anything wrong, and the first
   `.map`/`.filter`/`.reduce` on it throws through SurfaceBoundary and takes the
   whole protocol off screen over one column.

   So every register is normalised to an empty collection at the single point
   where the tab reads it off `doc` — most tabs already alias it to a local for
   other reasons. An empty register renders as an empty register, which is the
   truth. Leaf fields are left alone: an absent `o.text` or `r.hazard` renders as
   nothing, which is also the truth, and only the few that are dereferenced
   (`.toLocaleString()`, an index built from them) are guarded below. */

/* ---- Interfaces ---- */
interface PaneHeadProps { title: string; sub?: string; action?: string; onAction?: () => void }
interface KVProps { k: string; v: string }
interface OutlineProps { doc: any; activeSec: string; onSec: (s: any) => void; onFinalize: () => void }
interface DocumentTabProps { doc: any; sec: any; onGenerate: ((s: any) => void) | null }
interface ListTabProps { doc: any; onAdd: () => void }
interface DocOnlyProps { doc: any }
interface ConsentTabProps { doc: any; onToggle?: () => void }

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
  // Both are read as arrays six times between here and the gate; a protocol with
  // neither is a real row, not a broken one.
  const sections = doc.sections || [];
  const findings = doc.completenessFindings || [];
  const counts = useMemo(() => ({
    complete: sections.filter((s: any) => s.status === 'complete').length,
    total: sections.length,
    reqTotal: sections.filter((s: any) => s.required).length,
    reqComplete: sections.filter((s: any) => s.required && s.status === 'complete').length,
  }), [doc]);
  const ready = !findings.some((f: any) => ['critical', 'blocking'].includes(f.sev));
  return (
    <div className="pd-outline">
      <div className="pd-outline-h"><span>Sections</span><span className="pd-outline-c">{counts.complete}/{counts.total}</span></div>
      <div className="pd-tree">
        {sections.map((s: any) => (
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

/* ---- Document tab ----

   Read-only, and the only render this tab has ever produced.

   It used to open with `const DocCanvas = (window as any).DocCanvas` and, when
   that global was truthy, render an editable canvas instead of the prose below.
   Nothing in the repository ever assigned `window.DocCanvas` — measured across
   the whole tree, one read and zero writes — so the branch could not be taken
   and the static render was always what shipped. The branch is gone rather than
   fixed, because there was nothing to fix it to.

   `DocCanvas` was later a different thing that happened to share the name: a
   real React component in `surfaces/EditorCanvas.tsx`, rendered by
   `DocumentAuthoring` behind the ENABLE_RICH_SECTION_EDITOR flag and never
   reachable from this surface. Both are gone now — the one section editor is
   `v2/editor/RichSectionEditor`, and this tab remains a read-only render. */
export function DocumentTab({ doc, sec, onGenerate }: DocumentTabProps) {
  // `content` is absent on a protocol whose sections exist but whose body has
  // never been drafted; the not-started branch below is already that state.
  const blocks = doc.content?.[sec.id];
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
  const objectives = doc.objectives || []; // absent until the first objective is registered
  return (
    <div className="pd-pane">
      <PaneHead title="Objectives & endpoints" sub={objectives.length + ' defined'} action="Add objective" onAction={onAdd} />
      {groups.map(g => {
        const items = objectives.filter((o: any) => o.type === g); if (!items.length) return null;
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
  // The two arms are separate child tables, so either can be absent on its own —
  // and so can the whole `eligibility` object before any criterion is written.
  const elig = doc.eligibility || {};
  const inclusion = elig.inclusion || [];
  const exclusion = elig.exclusion || [];
  return (
    <div className="pd-pane">
      <PaneHead title="Eligibility criteria" sub={(inclusion.length + exclusion.length) + ' criteria'} action="Add criterion" onAction={onAdd} />
      <div className="pd-elig">{col('Inclusion', inclusion, 'ok')}{col('Exclusion', exclusion, 'err')}</div>
    </div>);
}

/* ---- Schedule of assessments ---- */

/* Every tick used to be local-only: the grid and the per-visit totals updated,
   the schedule of assessments looked authored, and a reload lost all of it with
   no warning. POST /api/protocol-soa/cells and /cells/clear existed the entire
   time and had no caller.

   The governed router requires a reason of at least 8 characters on every cell
   write, and prompting per tick would be unusable — so the reason is stated
   ONCE for the editing session and the grid stays read-only until it is given.
   Each cell still writes its own audited row carrying that reason, which is
   what the regulation asks for; what it does not ask for is the same sentence
   retyped forty times.

   A tick is applied optimistically and REVERTED if the server refuses, so the
   grid never shows a cell the record does not have. */
export function SoaTab({ doc, canWrite, onError }: DocOnlyProps & { canWrite?: boolean; onError?: (m: string) => void }) {
  // The whole SoA, and each of its three parts, is absent until a schedule is
  // built — an empty grid is the honest render of a protocol that has no visits.
  const soa = doc.soa || {};
  const assessments = soa.assessments || [];
  const visits = soa.visits || [];
  const [cells, setCells] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {}; const seeded = soa.cells || {};
    assessments.forEach((a: any) => { m[a.id] = new Set(seeded[a.id] || []); }); return m;
  });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const editable = Boolean(canWrite) && reason.trim().length >= 8;

  const flip = (aid: string, vid: string) => setCells(prev => {
    const n = { ...prev }; const set = new Set(n[aid]); set.has(vid) ? set.delete(vid) : set.add(vid); n[aid] = set; return n;
  });

  const toggle = async (aid: string, vid: string) => {
    if (!editable || saving) return;
    const wasOn = cells[aid]?.has(vid) ?? false;
    const assessmentId = Number(aid);
    const visitId = Number(vid);
    if (!Number.isInteger(assessmentId) || !Number.isInteger(visitId)) {
      onError?.('This row has no governed id, so the cell cannot be written.');
      return;
    }
    const key = aid + ':' + vid;
    setSaving(key);
    flip(aid, vid); // optimistic
    try {
      const res = await apiRequest(
        'POST',
        wasOn ? '/api/protocol-soa/cells/clear' : '/api/protocol-soa/cells',
        wasOn
          ? { assessmentId, visitId, reason: reason.trim() }
          : { assessmentId, visitId, required: true, reason: reason.trim() },
      );
      if (!res.ok) {
        flip(aid, vid); // the record did not change, so neither does the grid
        const j = await res.json().catch(() => null);
        onError?.(
          'The cell was not saved — ' +
            ((j as any)?.error?.message ?? (j as any)?.error?.code ?? `HTTP ${res.status}`) +
            '. The schedule is unchanged.',
        );
      }
    } catch (e) {
      flip(aid, vid);
      onError?.('The cell was not saved — ' + (e instanceof Error ? e.message : String(e)) + '. The schedule is unchanged.');
    } finally {
      setSaving(null);
    }
  };

  const visitTotal = (vid: string) => assessments.reduce((acc: number, a: any) => acc + (cells[a.id]?.has(vid) ? 1 : 0), 0);
  return (
    <div className="pd-pane">
      <PaneHead title="Schedule of assessments" sub={assessments.length + ' assessments × ' + visits.length + ' visits'} />
      {canWrite ? (
        <label className="pd-soa-reason">
          <span>Reason for change (governed) — required before the grid can be edited</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why the schedule is being changed — written to the audit trail with every cell"
            aria-label="Reason for change, required before editing the schedule of assessments"
          />
        </label>
      ) : (
        <div className="scaf-note" style={{ margin: '0 0 10px' }}>
          This protocol has no governed document id, so the schedule is read-only here.
        </div>
      )}
      <div className="pd-soa-wrap">
        <table className="pd-soa">
          <thead><tr>
            <th className="pd-soa-cnr">Assessment</th>
            {visits.map((v: any) => (<th key={v.id} className="pd-soa-vh">
              <span className="pd-soa-vl">{v.label}</span><span className="pd-soa-vd">{v.day}</span>
              {v.window && <span className="pd-soa-vw">{v.window}</span>}
            </th>))}
          </tr></thead>
          <tbody>{assessments.map((a: any) => (
            <tr key={a.id}>
              <th className="pd-soa-rh"><span className="pd-soa-rl">{a.label}</span><span className="pd-soa-rc">{a.cat}</span></th>
              {visits.map((v: any) => { const on = cells[a.id]?.has(v.id) ?? false; return (
                <td
                  key={v.id}
                  className={'pd-soa-cell' + (on ? ' on' : '') + (editable ? '' : ' ro')}
                  onClick={() => toggle(a.id, v.id)}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(a.id, v.id); } }}
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={!editable}
                  aria-busy={saving === a.id + ':' + v.id}
                  tabIndex={editable ? 0 : -1}
                  title={a.label + ' · ' + v.label + (editable ? '' : ' — enter a reason for change to edit')}
                >
                  {on ? <span className="pd-soa-x">{'✕'}</span> : null}
                </td>); })}
            </tr>))}</tbody>
          <tfoot><tr>
            <th className="pd-soa-rh foot">Per-visit total</th>
            {visits.map((v: any) => <td key={v.id} className={'pd-soa-tot' + (visitTotal(v.id) < 3 ? ' low' : '')}>{visitTotal(v.id)}</td>)}
          </tr></tfoot>
        </table>
      </div>
      <div className="pd-soa-issues"><PG.FindingsList findings={soa.issues} dense={true} /></div>
    </div>);
}

/* ---- Risk register ---- */
export function RiskTab({ doc, onAdd }: ListTabProps) {
  const risks = doc.risks || []; // absent until the first risk is registered
  const grid = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (let l = 5; l >= 1; l--) for (let i = 1; i <= 5; i++) g[l + '-' + i] = [];
    // A risk scored on neither axis addresses no cell of a 5×5 heat map, so it
    // is left off the map rather than plotted somewhere it does not belong. It
    // still appears in the list beside it, which is where it can be scored.
    risks.forEach((r: any) => { const cell = g[r.l + '-' + r.i]; if (cell) cell.push(r); }); return g;
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
  const ms = doc.milestones || []; // absent until the first milestone is registered
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
  // The budget is one column with two halves that go absent independently: the
  // line items and the feasibility parameters. Either is missing on a protocol
  // nobody has costed yet.
  const b = doc.budget || {}; const p = b.params || {}; const items = b.items || [];
  // An un-costed line contributes nothing to the roll-up rather than turning
  // every total below it into NaN — the sum is of what the register holds.
  const perSubjectDirect = items.reduce((a: number, i: any) => a + (i.perSubject || 0), 0);
  // F&A, and every total downstream of it, is uncomputable without the rate —
  // those rows are omitted rather than printed as "$NaN".
  const rated = p.faRate != null;
  const fa = Math.round(perSubjectDirect * p.faRate);
  const totalPerSubject = perSubjectDirect + fa;
  const totalCost = totalPerSubject * p.enrollment;
  const sponsorRev = p.sponsorPerSubject * p.enrollment;
  const margin = sponsorRev - totalCost;
  const funded = margin >= 0;
  // Without both sides of the contract there is no margin to compute, and
  // "Under-funded" is a verdict this screen would be inventing.
  const priced = rated && p.sponsorPerSubject != null && p.enrollment != null;
  const cats = useMemo(() => { const m: Record<string, number> = {}; items.forEach((i: any) => { m[i.cat] = (m[i.cat] || 0) + (i.perSubject || 0); }); return m; }, [b]);
  return (
    <div className="pd-pane">
      <PaneHead title="Budget & feasibility" sub={p.enrollment != null ? p.enrollment + ' subjects' : undefined} />
      <div className="pd-budget">
        <div className="pd-budget-items">
          <table className="pd-bg-table">
            <thead><tr><th>Category</th><th>Line item</th><th className="r">Per subject</th></tr></thead>
            {/* An un-costed line still belongs in the table; its cost column stays blank. */}
            <tbody>{items.map((i: any) => (
              <tr key={i.id}><td><span className="pd-chip">{i.cat}</span></td><td>{i.label}</td><td className="r pg-mono">{i.perSubject != null ? '$' + i.perSubject.toLocaleString() : ''}</td></tr>
            ))}</tbody>
            <tfoot>
              <tr><td colSpan={2}>Direct cost per subject</td><td className="r pg-mono">{'$' + perSubjectDirect.toLocaleString()}</td></tr>
              {rated && (<>
                <tr><td colSpan={2}>{'F&A (' + Math.round(p.faRate * 100) + '%)'}</td><td className="r pg-mono">{'$' + fa.toLocaleString()}</td></tr>
                <tr className="pd-bg-total"><td colSpan={2}>Total per subject</td><td className="r pg-mono">{'$' + totalPerSubject.toLocaleString()}</td></tr>
              </>)}
            </tfoot>
          </table>
        </div>
        <div className="pd-budget-summary">
          {priced && (<>
            <div className="pd-feas" data-funded={funded}>
              <div className="pd-feas-verdict">{funded ? 'Funded' : 'Under-funded'}</div>
              <div className="pd-feas-margin">{(margin < 0 ? '−$' : '$') + Math.abs(margin).toLocaleString()}</div>
              <div className="pd-feas-sub">{'projected margin across ' + p.enrollment + ' subjects'}</div>
            </div>
            <KV k="Total study cost" v={'$' + totalCost.toLocaleString()} />
            <KV k="Sponsor revenue" v={'$' + sponsorRev.toLocaleString()} />
            <KV k="Sponsor $/subject" v={'$' + p.sponsorPerSubject.toLocaleString()} />
          </>)}
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
  const amendments = doc.amendments || []; // absent on a protocol never amended
  return (
    <div className="pd-pane">
      <PaneHead title="Amendments" sub={amendments.length + ' amendments'} action="New amendment" onAction={onAdd} />
      {amendments.map((a: any) => (
        <div key={a.id} className="pd-card">
          <div className="pd-card-h">
            <span className="pd-card-t">{a.num}</span><span className="pd-chip">{a.path}</span>
            {a.reconsent && <span className="pg-badge" data-tone="warn">Re-consent</span>}
            <PG.StatusBadge status={a.status} />
          </div>
          <div className="pd-card-sum">{a.summary}</div>
          {/* The changeset is its own child table — an amendment recorded before
              its diff was itemised carries a summary and no changes. */}
          <div className="pd-changeset">{(a.changes || []).map((c: any, i: number) => (
            <div key={i} className="pd-change"><span className="pd-change-sec">{c.sec}</span><span className="pd-change-from">{c.from}</span>
              <span className="pd-change-arrow">{'→'}</span><span className="pd-change-to">{c.to}</span></div>))}</div>
        </div>))}
    </div>);
}

/* ---- Deviations & CAPA ---- */
export function DeviationsTab({ doc, onAdd }: ListTabProps) {
  const deviations = doc.deviations || []; // absent until the first deviation is reported
  return (
    <div className="pd-pane">
      <PaneHead title="Deviations & CAPA" sub={deviations.length + ' deviations'} action="Report deviation" onAction={onAdd} />
      {deviations.map((d: any) => (
        <div key={d.id} className="pd-card">
          <div className="pd-card-h">
            {/* Was `d.sev === 'major' ? 'err' : 'warn'`, which put CRITICAL — the
                most severe value the column allows — into the amber bucket while
                major got red, inverting the two grades that decide 3-day versus
                10-day reporting. `PG.SEV_TONE` is the canonical map, already
                correct (`critical: 'err'`), and already used by the comment
                badge thirty lines below; this one hand-rolled its own. */}
            <span className="pg-badge" data-tone={PG.SEV_TONE[d.sev] || 'warn'}>{PG.labelize(d.sev)}</span>
            <span className="pd-card-t">{d.title}</span>
            {d.reportable && <span className="pg-badge" data-tone="err">Reportable</span>}
            <PG.StatusBadge status={d.status} />
          </div>
          <div className="pd-card-sum"><span className="pd-chip">{d.cat}</span></div>
          {/* CAPA is a child register of the deviation: a deviation logged before
              any corrective action was agreed has none. */}
          <div className="pd-capa"><div className="pd-capa-h">CAPA actions</div>
            {(d.capa || []).map((c: any) => (<div key={c.id} className="pd-capa-row">
              <span className="pd-capa-dot" data-status={c.status} /><span>{c.action}</span><PG.StatusBadge status={c.status} />
            </div>))}</div>
        </div>))}
    </div>);
}

/* ---- Reviews ---- */
export function ReviewsTab({ doc }: DocOnlyProps) {
  // Absent on an unreviewed protocol; and a reviewer assigned but not yet
  // returned has no `comments` — flatMap would fold that undefined straight
  // into the list and the filter below would dereference it.
  const reviews = doc.reviews || [];
  const allComments = reviews.flatMap((r: any) => r.comments || []);
  const blocking = allComments.filter((c: any) => c.sev === 'blocking' && !c.resolved).length;
  return (
    <div className="pd-pane">
      <PaneHead title="Review & comments" sub={reviews.length + ' reviewers · ' + blocking + ' blocking open'} />
      <div className="pd-review-sum">{reviews.map((r: any) => (
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
  // Absent until the consent checklist is instantiated; with no elements there
  // is no percentage to report, so the meter reads 0 rather than NaN.
  const consent = doc.consent || [];
  const present = consent.filter((c: any) => c.present).length;
  const pct = consent.length ? Math.round(present / consent.length * 100) : 0;
  return (
    <div className="pd-pane">
      <PaneHead title="Informed consent" sub={present + ' of ' + consent.length + ' required elements present'} />
      <div className="pd-consent-meter">
        <div className="pd-consent-bar"><div className="pd-consent-fill" style={{ width: pct + '%' }} /></div>
        <span className="pd-consent-pct">{pct + '% complete'}</span>
        <PG.Citation basis="45 CFR 46.116 — General requirements for informed consent" />
      </div>
      <div className="pd-consent-list">{consent.map((c: any) => (
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
   read-only — DocumentTab renders static prose, and this surface carries no
   editor at all.

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

  /* What AnA can see of this screen. Published from the OUTER component, above
     the three honest-state early returns, because a hook after an early return
     is a conditional hook — and because two of those states ("no protocol in
     development" and "the store did not answer") are exactly what a user would
     ask about. Its two live asks are "review this protocol for completeness"
     and "draft <section> from the linked evidence", neither answerable without
     the section list and the completeness findings. */
  const protoDoc = rows[0];
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'The protocol is still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The protocol authoring store could not be read, so no protocol is on screen because of a ' +
          'failure, not because none is in development.',
        availableActions: ['Retry the protocol read'],
      };
    }
    if (empty || !protoDoc) {
      return {
        summary: 'Protocol development: this organisation has no protocol in development yet, so there is nothing to author here.',
        availableActions: ['Start a clinical protocol'],
      };
    }
    const secs = Array.isArray(protoDoc.sections) ? protoDoc.sections : [];
    const objs = Array.isArray(protoDoc.objectives) ? protoDoc.objectives : [];
    const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    const done = secs.filter((sec) => sec.status === 'complete').length;
    return {
      summary:
        `Protocol development: "${protoDoc.shortTitle}" (${protoDoc.title}) v${protoDoc.version}, status ` +
        `${protoDoc.status}, ${protoDoc.completeness}% complete — ${done} of ${secs.length} ` +
        `section(s) complete. ${len(protoDoc.risks)} risk(s), ${len(protoDoc.amendments)} amendment(s), ` +
        `${len(protoDoc.deviations)} deviation(s), ${len(protoDoc.completenessFindings)} completeness finding(s).`,
      facts: {
        protocolId: protoDoc.id,
        shortTitle: protoDoc.shortTitle,
        title: protoDoc.title,
        kind: protoDoc.kind,
        version: protoDoc.version,
        status: protoDoc.status,
        sponsor: protoDoc.sponsor,
        principalInvestigator: protoDoc.pi,
        completenessPercent: protoDoc.completeness,
        openSection: protoDoc.openSection,
        sections: secs.map((sec) => ({
          number: sec.num, title: sec.title, status: sec.status, required: sec.required,
        })),
        objectives: objs.map((o) => ({ type: o.type, text: o.text, endpoint: o.endpoint })),
        completenessFindings: Array.isArray(protoDoc.completenessFindings) ? protoDoc.completenessFindings : [],
        registerCounts: {
          risks: len(protoDoc.risks),
          milestones: len(protoDoc.milestones),
          amendments: len(protoDoc.amendments),
          deviations: len(protoDoc.deviations),
          reviews: len(protoDoc.reviews),
        },
      },
      availableActions: [
        'Open a protocol section to read or draft it',
        'Add a risk, milestone, amendment or deviation to the governed registers (a real persisted write)',
        'Review the protocol for completeness against its recorded findings',
      ],
    };
  }, [loading, error, empty, protoDoc]);
  usePublishSurfaceContext('protocol-dev', anaContext);

  if (loading) {
    return <div className="pd-wrap"><div role="status" className="scaf-note" style={{ margin: 16 }}>Loading protocol…</div></div>;
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
  // Which governed form is open — the four registers plus the three actions
  // that used to route through a dialog whose onConfirm was `() => {}`.
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Which register create-form is open (risk/milestone/amendment/deviation) —
  // these POST to the real protocol-* routers, replacing the former reason-only
  // governed dialog whose onConfirm was a no-op.
  const [reg, setReg] = useState<RegisterKind | null>(null);
  const [toast, fireToast] = useToast();
  // The write routers key on the numeric c2c_protocol_dev id.
  const numericDocId = Number(doc.id);
  const canWrite = Number.isInteger(numericDocId) && numericDocId > 0;
  const openReg = (kind: RegisterKind) => {
    if (!canWrite) { fireToast('This protocol row has no numeric document id — governed writes need the governed store.', 'error'); return; }
    setReg(kind);
  };
  // A protocol row whose `sections` column is null is a well-formed row of a
  // well-formed list — nothing upstream of here sees anything wrong with it, so
  // this was the read that took the whole surface down. The `sec ?` branch in
  // the tab body below has always drawn the no-sections state; it just never
  // got the chance.
  const sections = doc.sections || [];
  const sec = sections.find((s: any) => s.id === activeSec) || sections[0];
  const onSec = (s: any) => { setActiveSec(s.id); setTab(s.tab || 'document'); };
  const generate = (s: any) => onAsk('Draft ' + s.title + ' for ' + doc.shortTitle + ' from the linked evidence.');
  /* ── Export: the assembled protocol, rendered ─────────────────────────────
     The header's Export button opened the same dead dialog. The assembly has
     always existed — GET /api/protocol-export/:id returns the governed document
     plus its Markdown — and had no caller on this surface. What downloads is
     that assembly: Markdown straight through, or handed to the DOCX/PDF
     renderer. Nothing is re-derived on the client and nothing AnA wrote is
     substituted for the record. */
  const runExport = async (v: Record<string, string>) => {
    const format = (v.format || 'docx') as 'docx' | 'pdf' | 'markdown';
    if (!canWrite) { fireToast('This protocol row has no numeric document id, so it cannot be assembled for export.', 'error'); return; }
    setExporting(true);
    try {
      const res = await apiRequest('GET', `/api/protocol-export/${numericDocId}`);
      const j = (await res.json().catch(() => null)) as { markdown?: string } | null;
      if (!res.ok || !j?.markdown) {
        fireToast(
          'The protocol was not exported — ' +
            ((j as any)?.error?.message ?? (j as any)?.error?.code ?? `HTTP ${res.status}`) +
            '. No file was produced.',
          'error',
        );
        return;
      }
      const base = safeFileName(doc.shortTitle || doc.title || 'protocol', 'protocol') + '-v' + (doc.version || '0');
      if (format === 'markdown') {
        const ok = downloadText(base + '.md', j.markdown, 'text/markdown;charset=utf-8');
        fireToast(ok ? 'Markdown downloaded — the assembled protocol as the server rendered it.' : 'The browser refused the download.', ok ? 'ok' : 'error');
        setExportOpen(false);
        return;
      }
      const r2 = await apiRequest('POST', `/api/concept2cure/artifacts/export-${format}`, {
        title: doc.title || doc.shortTitle || 'Protocol',
        content: j.markdown,
      });
      if (!r2.ok) {
        const b = await r2.json().catch(() => null);
        fireToast(
          'The protocol was not exported — ' +
            ((b as any)?.error?.message ?? (b as any)?.error ?? `HTTP ${r2.status}`) +
            '. No file was produced.',
          'error',
        );
        return;
      }
      const ok = downloadBlob(base + '.' + format, await r2.blob());
      fireToast(ok ? format.toUpperCase() + ' downloaded — the assembled protocol.' : 'The file was produced but the browser refused the download.', ok ? 'ok' : 'error');
      setExportOpen(false);
    } catch (e) {
      fireToast('The protocol was not exported — ' + (e instanceof Error ? e.message : String(e)) + '. No file was produced.', 'error');
    } finally {
      setExporting(false);
    }
  };
  const body = (() => {
    switch (tab) {
      case 'objectives':  return <ObjectivesTab doc={doc} onAdd={() => openReg('objective')} />;
      case 'eligibility': return <EligibilityTab doc={doc} onAdd={() => openReg('eligibility')} />;
      case 'soa':         return <SoaTab doc={doc} canWrite={canWrite} onError={(m) => fireToast(m, 'error')} />;
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
              but the section content does not: DocumentTab renders static prose
              and there is no editor on this surface to save from. So the
              document body is read-only and nothing about it is autosaved. The
              version is still worth showing — it is real, from GET
              /api/protocol-dev. */}
          <span className="pd-autosave">{'v' + (doc.version || '—') + (doc.updated ? ' · updated ' + doc.updated : '')}</span>
          <PG.Btn icon="sparkles" variant="outline" onClick={() => onAsk('Review ' + doc.shortTitle + ' for completeness and list what blocks finalization.')}>Ask AnA</PG.Btn>
          <PG.Btn icon="fileText" variant="outline" onClick={() => setExportOpen(true)}>{exporting ? 'Exporting…' : 'Export'}</PG.Btn>
        </div>
      </div>
      <div className="pd-tabs">{TABS.map(t => (
        <button key={t.id} className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
          <Ic n={t.icon} s={14} />{t.label}</button>))}</div>
      <div className="pd-grid">
        <Outline doc={doc} activeSec={activeSec} onSec={onSec} onFinalize={() => openReg('finalize')} />
        <div className="pd-work">{body}</div>
      </div>
      {exportOpen && (
        <C2CForm
          config={{
            eyebrow: 'Protocol · export',
            title: 'Export protocol',
            sub: 'Assembled server-side from the governed document. Read-only — nothing about the protocol changes.',
            submitLabel: exporting ? 'Exporting…' : 'Export',
            fields: [
              { key: 'format', label: 'Format', type: 'seg', options: ['docx', 'pdf', 'markdown'], default: 'docx' },
            ],
          }}
          onCancel={() => setExportOpen(false)}
          onSubmit={runExport}
        />
      )}
      {reg && canWrite && (
        <ProtocolRegisterForm
          kind={reg}
          protocolDocumentId={numericDocId}
          onCancel={() => setReg(null)}
          onDone={(kind, result) => {
            setReg(null);
            fireToast(
              kind === 'finalize'
                ? 'Protocol finalized' +
                    ((result as { version?: string } | null)?.version ? ' — now v' + (result as { version?: string }).version : '') +
                    '. The completeness gate passed and the action is in the audit trail.'
                : 'Recorded — the ' + kind + ' was written to the governed register.',
            );
            onChanged?.();
          }}
          onError={(m) => fireToast(m, 'error')}
        />
      )}
      <C2CToast msg={toast} />
    </div>);
}

/* ---- Bridge exports ----

   The kit's module-scope globals, kept because something still depends on them:
   `SURFACE_VIEWS` is the registry object the kit merges into, and this file's
   `PDEV_nextMajor` write is the import-time side effect that
   tests/ui/surface-registry-coverage.test.ts cites as its reason for parsing
   surfaceViews.ts rather than importing it.

   `window.ProtocolIntelPanel` used to be assigned here too, and the note in its
   place said the panel was "imported by nothing and read off `window` by
   nothing … unreachable UI", left intact because deleting a component was a
   separate decision. That decision is now made: the panel, its dock, and the
   seven study-design evidence accordions hung off it are deleted, so the
   assignment has nothing to publish and the `.pi-*` rules that dressed it are
   gone from styles/research-v2.css. */
(window as any).PDEV_nextMajor = pdevNextMajor;
(window as any).ProtocolWorkspace = ProtocolWorkspace;
(window as any).SURFACE_VIEWS = (window as any).SURFACE_VIEWS || {};
