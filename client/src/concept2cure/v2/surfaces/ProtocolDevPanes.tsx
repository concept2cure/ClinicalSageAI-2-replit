/**
 * Protocol development — the outline and the register panes that already
 * wrote through `ProtocolRegisterForms` (objectives, eligibility, milestones,
 * amendments, deviations).
 *
 * Split out of ProtocolDev.tsx unchanged, so that file could stay inside the
 * repo's per-file limit once the read-only registers gained their editors.
 * Nothing here changed behaviour in the move.
 *
 * ── Absent collections ───────────────────────────────────────────────────────
 * `PdevDoc` types every register as required, but the document is assembled
 * from a dozen optional child tables and each register is its own key. A
 * protocol authored before a register existed arrives with that key null — the
 * envelope is a perfectly good list of objects, so no boundary guard sees
 * anything wrong, and the first `.map`/`.filter` on it throws through
 * SurfaceBoundary and takes the whole protocol off screen over one column. So
 * every register is normalised to an empty collection where the pane reads it.
 * An empty register renders as an empty register, which is the truth.
 */
import React, { useMemo } from 'react';
import * as PG from './ProtocolGov';
import { PaneHead } from './ProtocolDevShared';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (v == null ? '' : String(v));

export interface ListPaneProps { doc: Record<string, unknown>; onAdd: () => void }

/* ---- Outline ---- */
export interface OutlineProps {
  doc: Record<string, unknown>;
  activeSec: string;
  onSec: (s: Row) => void;
  onFinalize: () => void;
}

export function Outline({ doc, activeSec, onSec, onFinalize }: OutlineProps) {
  const sections = asRows(doc.sections);
  const findings = asRows(doc.completenessFindings);
  const counts = useMemo(() => ({
    complete: sections.filter((s) => s.status === 'complete').length,
    total: sections.length,
    reqTotal: sections.filter((s) => s.required).length,
    reqComplete: sections.filter((s) => s.required && s.status === 'complete').length,
  }), [sections]);
  const ready = !findings.some((f) => ['critical', 'blocking'].includes(str(f.sev)));
  return (
    <div className="pd-outline">
      <div className="pd-outline-h"><span>Sections</span><span className="pd-outline-c">{counts.complete}/{counts.total}</span></div>
      <div className="pd-tree">
        {sections.map((s) => (
          <button key={str(s.id)} className={'pd-tree-row' + (activeSec === s.id ? ' on' : '')} onClick={() => onSec(s)}>
            {/* Section completion was this dot's colour alone, in the outline
                a protocol author navigates by. */}
            <span className="pd-tree-dot" data-status={str(s.status)} aria-hidden="true" />
            <span className="sr-only">{str(s.status)}</span>
            <span className="pd-tree-num">{str(s.num)}</span>
            <span className="pd-tree-t">{str(s.title)}</span>
            {!s.required && <span className="pd-tree-opt">opt</span>}
          </button>))}
      </div>
      <div className="pd-outline-gate">
        <PG.CompletenessGate pct={Number(doc.completeness ?? 0)} complete={counts.reqComplete} total={counts.reqTotal}
          findings={findings as never} ready={ready} readyLabel="Finalization readiness"
          actionLabel="Finalize protocol" onAction={onFinalize} />
      </div>
    </div>);
}

/* ---- Objectives ---- */
export function ObjectivesTab({ doc, onAdd }: ListPaneProps) {
  const groups = ['primary', 'secondary', 'exploratory'];
  const objectives = asRows(doc.objectives);
  return (
    <div className="pd-pane">
      <PaneHead title="Objectives & endpoints" sub={objectives.length + ' defined'} action="Add objective" onAction={onAdd} />
      {objectives.length === 0 && <div className="pde-note">No objective has been recorded for this protocol.</div>}
      {groups.map((g) => {
        const items = objectives.filter((o) => o.type === g);
        if (!items.length) return null;
        return (<div key={g} className="pd-obj-group"><div className="pd-obj-gh">{g}</div>
          {items.map((o) => (<div key={str(o.id)} className="pd-obj">
            <div className="pd-obj-t">{str(o.text)}</div>
            <div className="pd-obj-ep"><span className="pd-obj-ep-l">Endpoint</span>{str(o.endpoint)}</div>
          </div>))}</div>);
      })}
    </div>);
}

/* ---- Eligibility ---- */
export function EligibilityTab({ doc, onAdd }: ListPaneProps) {
  const col = (title: string, items: Row[], tone: string) => (
    <div className="pd-elig-col">
      <div className="pd-elig-h" data-tone={tone}>{title}<span className="pd-elig-n">{items.length}</span></div>
      {items.map((c) => (<div key={str(c.id)} className="pd-elig-row">
        <span className="pd-elig-mk" data-tone={tone}>{tone === 'ok' ? '✓' : '✕'}</span><span>{str(c.text)}</span>
      </div>))}
    </div>);
  // The two arms are separate child tables, so either can be absent on its own.
  const elig = (doc.eligibility ?? {}) as Record<string, unknown>;
  const inclusion = asRows(elig.inclusion);
  const exclusion = asRows(elig.exclusion);
  return (
    <div className="pd-pane">
      <PaneHead title="Eligibility criteria" sub={(inclusion.length + exclusion.length) + ' criteria'} action="Add criterion" onAction={onAdd} />
      <div className="pd-elig">{col('Inclusion', inclusion, 'ok')}{col('Exclusion', exclusion, 'err')}</div>
    </div>);
}

/* ---- Milestones ---- */
const URG: Record<string, { l: string; t: string }> = {
  done: { l: 'Complete', t: 'ok' }, overdue: { l: 'Overdue', t: 'err' },
  soon: { l: 'Due ≤30d', t: 'warn' }, normal: { l: 'Upcoming', t: 'idle' },
};

export function MilestonesTab({ doc, onAdd }: ListPaneProps) {
  const ms = asRows(doc.milestones);
  return (
    <div className="pd-pane">
      <PaneHead title="Milestones & timeline" sub={ms.length + ' milestones'} action="Add milestone" onAction={onAdd} />
      {ms.length === 0 && <div className="pde-note">No milestone has been recorded for this protocol.</div>}
      <div className="pd-timeline">{ms.map((m, idx) => (
        <div key={str(m.id)} className="pd-tl-row" data-status={str(m.status)}>
          <div className="pd-tl-rail">
            <span className="pd-tl-node" data-status={str(m.status)}>{m.status === 'complete' ? '✓' : ''}</span>
            {idx < ms.length - 1 ? <span className="pd-tl-line" /> : null}
          </div>
          <div className="pd-tl-card">
            <div className="pd-tl-date">{str(m.date)}</div><div className="pd-tl-label">{str(m.label)}</div>
            <span className="pg-badge" data-tone={(URG[str(m.urgency)] || URG.normal).t}>{(URG[str(m.urgency)] || URG.normal).l}</span>
          </div>
        </div>))}</div>
    </div>);
}

/* ---- Amendments ---- */
export function AmendmentsTab({ doc, onAdd }: ListPaneProps) {
  const amendments = asRows(doc.amendments);
  return (
    <div className="pd-pane">
      <PaneHead title="Amendments" sub={amendments.length + ' amendments'} action="New amendment" onAction={onAdd} />
      {amendments.length === 0 && <div className="pde-note">This protocol has not been amended.</div>}
      {amendments.map((a) => (
        <div key={str(a.id)} className="pd-card">
          <div className="pd-card-h">
            <span className="pd-card-t">{str(a.num)}</span><span className="pd-chip">{str(a.path)}</span>
            {/* The IRB decides re-consent (45 CFR 46.109(b); 21 CFR 56.109(b)); the badge says a decision is
                needed, never that re-consent is required. Not declared is not "no". */}
            {a.reconsent === true && <span className="pg-badge" data-tone="warn">IRB re-consent determination needed</span>}
            {a.reconsent === null && <span className="pg-badge" data-tone="idle">Consent / risk impact not declared</span>}
            <PG.StatusBadge status={str(a.status)} />
          </div>
          <div className="pd-card-sum">{str(a.summary)}</div>
          {/* The changeset is its own child table — an amendment recorded before
              its diff was itemised carries a summary and no changes. */}
          <div className="pd-changeset">{asRows(a.changes).map((c, i) => (
            <div key={i} className="pd-change"><span className="pd-change-sec">{str(c.sec)}</span><span className="pd-change-from">{str(c.from)}</span>
              <span className="pd-change-arrow">{'→'}</span><span className="pd-change-to">{str(c.to)}</span></div>))}</div>
        </div>))}
    </div>);
}

/* ---- Deviations & CAPA ---- */
export function DeviationsTab({ doc, onAdd }: ListPaneProps) {
  const deviations = asRows(doc.deviations);
  return (
    <div className="pd-pane">
      <PaneHead title="Deviations & CAPA" sub={deviations.length + ' deviations'} action="Report deviation" onAction={onAdd} />
      {deviations.length === 0 && <div className="pde-note">No deviation has been reported against this protocol.</div>}
      {deviations.map((d) => (
        <div key={str(d.id)} className="pd-card">
          <div className="pd-card-h">
            {/* `PG.SEV_TONE` is the canonical severity map — a hand-rolled one
                here once put CRITICAL in the amber bucket and major in red,
                inverting the 3-day / 10-day reporting distinction. */}
            <span className="pg-badge" data-tone={PG.SEV_TONE[str(d.sev)] || 'warn'}>{PG.labelize(str(d.sev))}</span>
            <span className="pd-card-t">{str(d.title)}</span>
            {Boolean(d.reportable) && <span className="pg-badge" data-tone="err">Reportable</span>}
            <PG.StatusBadge status={str(d.status)} />
          </div>
          <div className="pd-card-sum"><span className="pd-chip">{str(d.cat)}</span></div>
          {/* CAPA is a child register of the deviation: a deviation logged
              before any corrective action was agreed has none. */}
          <div className="pd-capa"><div className="pd-capa-h">CAPA actions</div>
            {asRows(d.capa).map((c, i) => (<div key={i} className="pd-capa-row">
              <span className="pd-capa-dot" data-status={str(c.status)} /><span>{str(c.action)}</span><PG.StatusBadge status={str(c.status)} />
            </div>))}</div>
        </div>))}
    </div>);
}
