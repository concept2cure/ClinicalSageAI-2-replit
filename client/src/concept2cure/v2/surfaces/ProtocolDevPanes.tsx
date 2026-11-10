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
import { hasKeys, useLiveData } from '../dataConnect';
import { assessmentState } from '../assessmentState';

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
  const terminal = terminalState(str(doc.status));
  return (
    <div className="pd-outline">
      <div className="pd-outline-h"><span>Sections</span><span className="pd-outline-c">{counts.complete}/{counts.total}</span></div>
      <div className="pd-tree">
        {sections.map((s) => (
          /* The open section was `.on` alone; `aria-current` exposes it
             (periodic review 2026-09-28, A-C-2). */
          <button key={str(s.id)} className={'pd-tree-row' + (activeSec === s.id ? ' on' : '')}
            aria-current={activeSec === s.id ? 'true' : undefined} onClick={() => onSec(s)}>
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
        {terminal
          ? <TerminalGate state={terminal} version={str(doc.version)} findings={findings} />
          : <PG.CompletenessGate pct={Number(doc.completeness ?? 0)} complete={counts.reqComplete} total={counts.reqTotal}
              findings={findings as never} ready={ready} readyLabel="Finalization readiness"
              actionLabel="Finalize protocol" onAction={onFinalize} />}
      </div>
    </div>);
}

interface TerminalState { label: string; why: string }

/**
 * The two statuses the server refuses to finalize (`finalizeProtocolTx`), and
 * what the outline says instead of offering the action.
 *
 * The gate was gated on completeness alone, and a finalized protocol still
 * passes the check it passed to be finalized: it read "Ready to finalize" with
 * a live button, and the signer spent a password, an authenticator code and a
 * signing attempt before the server refused (periodic review 2026-09-28,
 * editor family, P11-C-4).
 */
function terminalState(status: string): TerminalState | null {
  if (status === 'finalized') {
    return { label: 'Finalized', why: 'This version was finalized under an electronic signature, so there is nothing left to finalize.' };
  }
  if (status === 'superseded') {
    return { label: 'Superseded', why: 'A later version replaces this one, so it cannot be finalized.' };
  }
  return null;
}

function TerminalGate({ state, version, findings }: { state: TerminalState; version: string; findings: Row[] }) {
  return (
    <div className="pg-gate">
      <div className="pg-gate-meta">
        <div className="pg-gate-title">{state.label + (version ? ' — v' + version : '')}</div>
        <div className="pg-gate-sub">{state.why}</div>
      </div>
      <PG.FindingsList findings={findings as never} dense />
    </div>
  );
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
/** The timeline engine's buckets (protocol-milestones-logic.ts milestoneBucket). */
const URG: Record<string, { l: string; t: string }> = {
  done: { l: 'Done', t: 'ok' }, overdue: { l: 'Overdue', t: 'err' },
  due_30: { l: 'Due ≤30d', t: 'warn' }, due_90: { l: 'Due ≤90d', t: 'idle' },
  upcoming: { l: 'Upcoming', t: 'idle' }, undated: { l: 'No target date', t: 'idle' },
};
/** The node's existing style hooks: met is done, in progress is active. */
const NODE: Record<string, string> = { met: 'done', in_progress: 'active' };

export function MilestonesTab({ doc, onAdd, onEdit }: ListPaneProps & {
  onEdit?: (kind: 'milestone-status', target: { id: number; label: string; defaults?: Record<string, string> }) => void;
}) {
  const ms = asRows(doc.milestones);
  return (
    <div className="pd-pane">
      <PaneHead title="Milestones & timeline" sub={ms.length + ' milestones'} action="Add milestone" onAction={onAdd} />
      {ms.length === 0 && <div className="pde-note">No milestone has been recorded for this protocol.</div>}
      <div className="pd-timeline">{ms.map((m, idx) => (
        <div key={str(m.id)} className="pd-tl-row" data-status={str(m.status)}>
          <div className="pd-tl-rail">
            <span className="pd-tl-node" data-status={NODE[str(m.status)] ?? str(m.status)}>{m.status === 'met' ? '✓' : ''}</span>
            {idx < ms.length - 1 ? <span className="pd-tl-line" /> : null}
          </div>
          <div className="pd-tl-card">
            <div className="pd-tl-date">{str(m.date)}</div><div className="pd-tl-label">{str(m.label)}</div>
            <span className="pg-badge" data-tone={(URG[str(m.urgency)] || URG.upcoming).t}>{(URG[str(m.urgency)] || URG.upcoming).l}</span>
            <PG.StatusBadge status={str(m.status)} />
            {onEdit && (
              <button type="button" className="pde-rowbtn" aria-label={'Update status: ' + str(m.label)}
                onClick={() => onEdit('milestone-status', { id: Number(m.id), label: str(m.label), defaults: { status: str(m.status) } })}>
                Update status
              </button>
            )}
          </div>
        </div>))}</div>
    </div>);
}

/* ---- Amendments ---- */
export function AmendmentsTab({ doc, onAdd, onEdit }: ListPaneProps & {
  onEdit?: (kind: 'amendment-change' | 'amendment-status', target: { id: number; label: string; options?: string[] }) => void;
}) {
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
          {onEdit && <AmendmentActions a={a} onEdit={onEdit} />}
          <AmendmentSubstantiality amendmentId={str(a.id)} />
          {/* The changeset is its own child table — an amendment recorded before
              its diff was itemised carries a summary and no changes. */}
          <div className="pd-changeset">{asRows(a.changes).map((c, i) => (
            <div key={i} className="pd-change"><span className="pd-change-sec">{str(c.sec)}</span><span className="pd-change-from">{str(c.from)}</span>
              <span className="pd-change-arrow">{'→'}</span><span className="pd-change-to">{str(c.to)}</span></div>))}</div>
        </div>))}
    </div>);
}

/** The EU substantiality read (GET /api/protocol-amendments/amendments/:id/substantiality),
 *  asked for on demand. The engine (substantiality.ts) never returns "non-substantial":
 *  its verdict sentence and the indicators that fired are shown as it gives them, and
 *  the classification stays the sponsor's (EU CTR Article 2(2)(13)). Nothing is read
 *  until it is asked for, and nothing is written. */
function AmendmentSubstantiality({ amendmentId }: { amendmentId: string }) {
  type Indicator = { id: string; scope: string; clause: string; title: string; status: string; message: string };
  type Read = { assessment: { verdictReason: string; indicators: Indicator[]; notComparable: string[]; declarationConflict: string | null; us?: { indicated: number; note: string } } };
  const [asked, setAsked] = React.useState(false);
  const read = useLiveData<Read>(
    asked && /^\d+$/.test(amendmentId) ? `/api/protocol-amendments/amendments/${amendmentId}/substantiality` : null,
    [asked, amendmentId],
    hasKeys<Read>('assessment'),
  );
  if (!asked) {
    return (
      <button type="button" className="pde-rowbtn" onClick={() => setAsked(true)}>
        Check EU substantiality indicators
      </button>
    );
  }
  if (read.loading && !read.data) return <div className="pde-note" role="status">Reading the indicators…</div>;
  if (read.error || !read.data) return <div className="pde-note" role="note">The substantiality indicators could not be read.</div>;
  const a = read.data.assessment;
  // Only Article 2(2)(13) indicators count toward the EU verdict; the US IND view stays apart (substantiality.ts).
  const fired = a.indicators.filter((i) => i.status === 'indicated' && i.scope === 'eu_sm');
  return (
    <div className="pde-note" data-testid="amendment-substantiality">
      <div><strong>EU substantial-modification indicators (Article 2(2)(13)).</strong> The classification is the sponsor&rsquo;s.</div>
      <div>{a.verdictReason}</div>
      {fired.map((i) => <div key={i.id}>{i.title} ({i.clause}): {i.message}</div>)}
      {a.declarationConflict && <div>{a.declarationConflict}</div>}
      {a.notComparable.length > 0 && <div>Not comparable: {a.notComparable.join(', ')}.</div>}
      {a.us && a.us.indicated > 0 && <div>Under a US IND, separately: {a.us.note}</div>}
    </div>
  );
}

/** An amendment's writes: a change while it is a draft, and the next statuses
 *  the server's lifecycle allows (`nextStatuses`, from its transition table). */
function AmendmentActions({ a, onEdit }: {
  a: Row;
  onEdit: (kind: 'amendment-change' | 'amendment-status', target: { id: number; label: string; options?: string[] }) => void;
}) {
  const next = Array.isArray(a.nextStatuses) ? (a.nextStatuses as unknown[]).map(String) : [];
  const label = str(a.num) || str(a.summary);
  if (str(a.status) !== 'draft' && next.length === 0) return null;
  return (
    <div className="pd-card-sum">
      {str(a.status) === 'draft' && (
        <button type="button" className="pde-rowbtn" onClick={() => onEdit('amendment-change', { id: Number(a.id), label })}>
          Add a change
        </button>
      )}
      {next.length > 0 && (
        <button type="button" className="pde-rowbtn" onClick={() => onEdit('amendment-status', { id: Number(a.id), label, options: next })}>
          Change status
        </button>
      )}
    </div>
  );
}

/** Closing a deviation is a signed act behind the server's CAPA-closure gate.
 *  The gate's own reasons are shown while it would refuse, and the button waits. */
function DeviationClose({ d, onClose }: { d: Row; onClose: (target: { id: number; label: string }) => void }) {
  const blockers = Array.isArray(d.closeBlockers) ? (d.closeBlockers as unknown[]).map(String) : [];
  const whyId = 'pd-close-why-' + str(d.id);
  return (
    <div className="pd-card-sum">
      <button type="button" className="pde-rowbtn" disabled={blockers.length > 0}
        aria-describedby={blockers.length > 0 ? whyId : undefined}
        onClick={() => onClose({ id: Number(d.id), label: str(d.title) })}>
        Close deviation
      </button>
      {blockers.length > 0 && <span id={whyId} className="pde-note">{blockers.join(' ')}</span>}
    </div>
  );
}

/** The deviation trend engine's signals for this protocol (GET
 *  /api/protocol-deviations/deviations/trends, trendDeviations: category spike,
 *  severity rise, aging), in the engine's own sentences. Nothing is computed
 *  here. A failed read is said; no signal is said as no signal. */
function DeviationTrendSignals({ documentId }: { documentId: string }) {
  // The route answers { documentId, trends } (protocol-industry-service.ts deviationTrendsForProtocol).
  type Trends = { trends: { signals: Array<{ code: string; message: string }>; basis?: string } };
  const read = useLiveData<Trends>(
    /^\d+$/.test(documentId) ? `/api/protocol-deviations/deviations/trends?protocolDocumentId=${documentId}` : null,
    [documentId],
    (v: unknown): v is Trends => hasKeys<Trends>('trends')(v) && Array.isArray((v as Trends).trends?.signals),
  );
  if (read.loading && !read.data) return null;
  if (read.error && !read.data) return <div className="pde-note" role="note">The deviation trends could not be read.</div>;
  const signals = read.data?.trends.signals ?? [];
  // "No trend signal" is a finding only because the engine answered: the loading and failed reads returned above,
  // so reaching here with data is the positive evidence the assessment ran (assessmentState.ts).
  const state = assessmentState({ scopeExists: true, findingCount: signals.length, assessmentRan: Boolean(read.data) });
  return (
    <div className="pde-note" data-testid="deviation-trend-signals">
      {state === 'assessed-clear'
        ? 'No trend signal over the window the trend engine reads.'
        : signals.map((s, i) => <div key={s.code + i}><strong>{s.code}</strong> {s.message}</div>)}
    </div>
  );
}

/* ---- Deviations & CAPA ---- */
export function DeviationsTab({ doc, onAdd, onEdit, onCloseDeviation }: ListPaneProps & {
  onEdit?: (kind: 'deviation-assess' | 'capa-add' | 'capa-status', target: { id: number; label: string; defaults?: Record<string, string> }) => void;
  /** Opens the signing ceremony for closing this deviation. */
  onCloseDeviation?: (target: { id: number; label: string }) => void;
}) {
  const deviations = asRows(doc.deviations);
  return (
    <div className="pd-pane">
      <PaneHead title="Deviations & CAPA" sub={deviations.length + ' deviations'} action="Report deviation" onAction={onAdd} />
      {deviations.length > 0 && <DeviationTrendSignals documentId={str(doc.id)} />}
      {deviations.length === 0 && <div className="pde-note">No deviation has been reported against this protocol.</div>}
      {deviations.map((d) => (
        <div key={str(d.id)} className="pd-card">
          <div className="pd-card-h">
            {/* `PG.SEV_TONE` is the canonical severity map. An unassessed deviation
                shows no severity at all — it used to show a defaulted "Minor". */}
            {d.assessed
              ? <span className="pg-badge" data-tone={PG.SEV_TONE[str(d.sev)] || 'warn'}>{PG.labelize(str(d.sev))}</span>
              : <span className="pg-badge" data-tone="warn">Assessment required</span>}
            <span className="pd-card-t">{str(d.title)}</span>
            {d.reportable === true && <span className="pg-badge" data-tone="err">Prompt IRB report indicated</span>}
            <PG.StatusBadge status={str(d.status)} />
          </div>
          <div className="pd-card-sum">
            {str(d.cat) && <span className="pd-chip">{str(d.cat)}</span>}
            {onEdit && d.status !== 'closed' && (
              <button type="button" className="pde-rowbtn"
                onClick={() => onEdit('deviation-assess', { id: Number(d.id), label: str(d.title) })}>
                {d.assessed ? 'Re-assess' : 'Assess'}
              </button>
            )}
          </div>
          {/* CAPA is a child register of the deviation: a deviation logged
              before any corrective action was agreed has none. */}
          <div className="pd-capa"><div className="pd-capa-h">CAPA actions</div>
            {asRows(d.capa).map((c) => (<div key={str(c.id)} className="pd-capa-row">
              <span className="pd-capa-dot" data-status={str(c.status)} /><span>{str(c.action)}</span><PG.StatusBadge status={str(c.status)} />
              {onEdit && d.status !== 'closed' && (
                <button type="button" className="pde-rowbtn" aria-label={'Update status: ' + str(c.action).slice(0, 60)}
                  onClick={() => onEdit('capa-status', { id: Number(c.id), label: str(c.action).slice(0, 80), defaults: { status: str(c.status) } })}>
                  Update status
                </button>
              )}
            </div>))}
            {onEdit && d.status !== 'closed' && (
              <button type="button" className="pde-rowbtn" onClick={() => onEdit('capa-add', { id: Number(d.id), label: str(d.title) })}>
                Add a CAPA action
              </button>
            )}</div>
          {onCloseDeviation && d.status !== 'closed' && <DeviationClose d={d} onClose={onCloseDeviation} />}
        </div>))}
    </div>);
}
