/**
 * Protocol development — the risk register and the budget.
 *
 * Split out of ProtocolDev.tsx when both stopped being read-only.
 *
 * RISK: the heat map and the list are unchanged; what is new is the residual
 * rating. `PATCH /api/protocol-risks/risks/:id` sets residual likelihood and
 * impact, the owner, the mitigation and the status, and had no caller here —
 * so every risk on the map read "Residual L0×I0" for as long as the register
 * existed. The control is in the pane head and acts on the selected risk,
 * rather than inside the row: the row is itself a control (role="button", it
 * reveals the mitigation), and a button inside a button is not operable.
 *
 * BUDGET: every derived figure is the budget engine's. `computeProtocolBudget`
 * runs server-side and arrives as `budget.summary` — the same summary
 * `/api/protocol-budget/documents/:id/summary` returns — so the direct cost,
 * the F&A, the totals, the margin and the feasibility verdict are read, never
 * recomputed on screen. This pane used to sum the line items itself and derive
 * F&A, the totals and the margin in the render; that is a second
 * implementation of a governed calculation, and it is gone.
 *
 * The verdict is drawn only when the engine reached one: `feasibility:
 * 'unknown'` means enrollment or the sponsor payment is not set, and the pane
 * says which is missing instead of printing "Under-funded" over a contract
 * nobody entered.
 */
import React, { useMemo, useState } from 'react';
import * as PG from './ProtocolGov';
import { KV, PaneHead, type PaneAction } from './ProtocolDevShared';
import type { PdevFormKind, PdevFormTarget } from './ProtocolDevForms';

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (v == null ? '' : String(v));
const usd = (n: number): string => '$' + Math.round(n).toLocaleString();

export interface RegisterTabProps {
  doc: Record<string, unknown>;
  onAdd?: () => void;
  onEdit?: (kind: PdevFormKind, target?: PdevFormTarget) => void;
}

/* ── Risk register ─────────────────────────────────────────────────────── */

const cellTone = (l: number, i: number): string => {
  const s = l * i;
  if (s >= 15) return 'err';
  if (s >= 8) return 'warn';
  if (s >= 4) return 'ai';
  return 'ok';
};

const LIKELIHOOD_WORD = ['', 'rare', 'unlikely', 'possible', 'likely', 'almost_certain'];
const IMPACT_WORD = ['', 'negligible', 'minor', 'moderate', 'major', 'severe'];

function RiskHeatMap({ grid, onPick }: { grid: Record<string, Row[]>; onPick: (r: Row) => void }) {
  return (
    <div className="pd-heat">
      <div className="pd-heat-yl">{'Likelihood →'}</div>
      <div className="pd-heat-grid">{[5, 4, 3, 2, 1].map((l) => (
        <div key={l} className="pd-heat-row"><span className="pd-heat-axis">{l}</span>
          {[1, 2, 3, 4, 5].map((i) => {
            const items = grid[l + '-' + i];
            const n = items.length;
            return (
              <button
                key={i}
                type="button"
                className="pd-heat-cell"
                data-tone={cellTone(l, i)}
                disabled={!n}
                aria-label={`Likelihood ${l}, impact ${i} — score ${l * i}, ${n} risk${n === 1 ? '' : 's'}`}
                onClick={() => n && onPick(items[0])}
              >
                {n ? <span className="pd-heat-n">{n}</span> : null}
              </button>
            );
          })}
        </div>))}
      </div>
      <div className="pd-heat-xl">{[1, 2, 3, 4, 5].map((i) => <span key={i}>{i}</span>)}<span className="pd-heat-xt">{'Impact →'}</span></div>
    </div>
  );
}

function RiskRow({ r, open, onPick }: { r: Row; open: boolean; onPick: () => void }) {
  const l = Number(r.l) || 0;
  const i = Number(r.i) || 0;
  const rl = Number(r.rl) || 0;
  const ri = Number(r.ri) || 0;
  return (
    <div
      className={'pd-risk' + (open ? ' on' : '')}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
      }}
    >
      <div className="pd-risk-top">
        <span className="pd-risk-score" data-tone={cellTone(l, i)}>{l * i}</span>
        <span className="pd-risk-haz">{str(r.hazard)}</span><PG.StatusBadge status={str(r.status)} />
      </div>
      <div className="pd-risk-meta">
        <span className="pd-chip">{str(r.cat)}</span><span>{`Inherent L${l}×I${i}`}</span>
        <span className="pd-risk-arrow">{'→'}</span>
        <span className="pd-risk-resid">{rl && ri ? `Residual L${rl}×I${ri}` : 'Residual not rated'}</span>
      </div>
      {open && (
        <div className="pd-risk-mit">
          <b>Mitigation: </b>{str(r.mitigation) || 'Not recorded.'}
          <div className="pde-risk-owner">{str(r.owner) ? 'Owner: ' + str(r.owner) : 'No owner recorded.'}</div>
        </div>
      )}
    </div>
  );
}

export function RiskTab({ doc, onAdd, onEdit }: RegisterTabProps) {
  const risks = asRows(doc.risks);
  const [sel, setSel] = useState<Row | null>(null);
  const grid = useMemo(() => {
    const g: Record<string, Row[]> = {};
    for (let l = 5; l >= 1; l--) for (let i = 1; i <= 5; i++) g[l + '-' + i] = [];
    // A risk scored on neither axis addresses no cell of a 5×5 heat map, so it
    // is left off the map rather than plotted somewhere it does not belong.
    risks.forEach((r) => { const cell = g[str(r.l) + '-' + str(r.i)]; if (cell) cell.push(r); });
    return g;
  }, [risks]);

  const actions: PaneAction[] = [];
  if (onAdd) actions.push({ label: 'Add risk', icon: 'plus', onAct: onAdd, variant: 'outline' });
  if (onEdit) {
    actions.push({
      label: sel ? 'Rate residual risk — ' + str(sel.hazard) : 'Rate residual risk',
      icon: 'penLine',
      variant: 'outline',
      disabled: !sel,
      onAct: () => sel && onEdit('risk-residual', {
        id: Number(sel.id),
        label: str(sel.hazard),
        defaults: {
          residualLikelihood: LIKELIHOOD_WORD[Number(sel.rl) || 0] ?? '',
          residualImpact: IMPACT_WORD[Number(sel.ri) || 0] ?? '',
          owner: str(sel.owner),
          mitigation: str(sel.mitigation),
          status: str(sel.status),
        },
      }),
    });
  }

  const extreme = risks.filter((r) => (Number(r.l) || 0) * (Number(r.i) || 0) >= 15).length;
  return (
    <div className="pd-pane">
      <PaneHead title="Risk register" sub={risks.length + ' risks · ' + extreme + ' extreme'} actions={actions.length ? actions : undefined} />
      {onEdit && !sel && risks.length > 0 && (
        <div className="pde-note">Select a risk to record the rating that remains once its mitigation is in place.</div>
      )}
      <div className="pd-risk-split">
        <RiskHeatMap grid={grid} onPick={setSel} />
        <div className="pd-risk-list">{risks.map((r) => (
          <RiskRow key={str(r.id)} r={r} open={Boolean(sel && sel.id === r.id)} onPick={() => setSel(r)} />
        ))}</div>
      </div>
    </div>
  );
}

/* ── Budget ────────────────────────────────────────────────────────────── */

interface BudgetSummary {
  categories?: { category: string; perSubject: number }[];
  directPerSubject?: number;
  indirectPerSubject?: number;
  totalPerSubject?: number;
  targetEnrollment?: number;
  totalStudyCost?: number;
  sponsorRevenue?: number | null;
  margin?: number | null;
  feasibility?: string;
  basis?: string;
}

/** Which side of the feasibility contract the engine is still missing. */
function missingInputs(summary: BudgetSummary, params: Row | null): string[] {
  const gaps: string[] = [];
  if (!Number(summary.targetEnrollment)) gaps.push('the target enrollment');
  if (summary.sponsorRevenue == null) gaps.push('the sponsor payment per subject');
  if (params && params.faRate == null) gaps.push('the indirect (F&A) rate');
  return gaps;
}

function BudgetVerdict({ summary, params }: { summary: BudgetSummary; params: Row | null }) {
  const margin = summary.margin;
  if (summary.feasibility === 'funded' || summary.feasibility === 'under_funded') {
    const funded = summary.feasibility === 'funded';
    const m = Number(margin ?? 0);
    return (
      <>
        <div className="pd-feas" data-funded={funded}>
          <div className="pd-feas-verdict">{funded ? 'Funded' : 'Under-funded'}</div>
          <div className="pd-feas-margin">{(m < 0 ? '−' : '') + usd(Math.abs(m))}</div>
          <div className="pd-feas-sub">{'projected margin across ' + Number(summary.targetEnrollment ?? 0) + ' subjects'}</div>
        </div>
        <KV k="Total study cost" v={usd(Number(summary.totalStudyCost ?? 0))} />
        <KV k="Sponsor revenue" v={usd(Number(summary.sponsorRevenue ?? 0))} />
      </>
    );
  }
  const gaps = missingInputs(summary, params);
  return (
    <div className="pde-note">
      No feasibility verdict: the budget engine needs {gaps.length ? gaps.join(' and ') : 'both sides of the contract'}.
      Enter the feasibility parameters and the verdict is computed from them.
    </div>
  );
}

function BudgetTable({ items, summary }: { items: Row[]; summary: BudgetSummary }) {
  const rated = Number(summary.indirectPerSubject ?? 0) > 0;
  return (
    <table className="pd-bg-table">
      <thead><tr><th>Category</th><th>Line item</th><th className="r">Per subject</th></tr></thead>
      <tbody>{items.map((i) => (
        <tr key={str(i.id)}>
          <td><span className="pd-chip">{str(i.cat)}</span></td>
          <td>{str(i.label)}</td>
          <td className="r pg-mono">{i.perSubject != null ? usd(Number(i.perSubject)) : ''}</td>
        </tr>
      ))}</tbody>
      <tfoot>
        <tr><td colSpan={2}>Direct cost per subject</td><td className="r pg-mono">{usd(Number(summary.directPerSubject ?? 0))}</td></tr>
        {rated && (
          <tr><td colSpan={2}>Indirect (F&amp;A) per subject</td><td className="r pg-mono">{usd(Number(summary.indirectPerSubject ?? 0))}</td></tr>
        )}
        <tr className="pd-bg-total"><td colSpan={2}>Total per subject</td><td className="r pg-mono">{usd(Number(summary.totalPerSubject ?? 0))}</td></tr>
      </tfoot>
    </table>
  );
}

export function BudgetTab({ doc, onEdit }: RegisterTabProps) {
  const b = (doc.budget ?? {}) as Record<string, unknown>;
  const params = (b.params ?? null) as Row | null;
  const items = asRows(b.items);
  const summary = (b.summary ?? {}) as BudgetSummary;
  const categories = Array.isArray(summary.categories) ? summary.categories : [];
  const topCategory = categories.reduce((max, c) => Math.max(max, Number(c.perSubject) || 0), 0);

  const actions: PaneAction[] | undefined = onEdit
    ? [
        { label: 'Add budget line', icon: 'plus', onAct: () => onEdit('budget-item'), variant: 'outline' },
        { label: 'Feasibility parameters', icon: 'penLine', onAct: () => onEdit('budget-params'), variant: 'outline' },
      ]
    : undefined;

  const nothingEntered = items.length === 0 && !params;
  return (
    <div className="pd-pane">
      <PaneHead
        title="Budget & feasibility"
        sub={params ? Number(summary.targetEnrollment ?? 0) + ' subjects' : undefined}
        actions={actions}
      />
      {nothingEntered ? (
        <div className="pde-note">
          <strong>No budget has been entered for this protocol.</strong> Add the per-subject cost
          lines and the feasibility parameters; every figure below them is the budget engine&rsquo;s,
          not this screen&rsquo;s.
        </div>
      ) : (
        <div className="pd-budget">
          <div className="pd-budget-items">
            <BudgetTable items={items} summary={summary} />
          </div>
          <div className="pd-budget-summary">
            <BudgetVerdict summary={summary} params={params} />
            <div className="pd-cat-bars">{categories.map((c) => (
              <div key={c.category} className="pd-cat-bar"><span className="pd-cat-l">{c.category}</span>
                <span className="pd-cat-track">
                  <span className="pd-cat-fill" style={{ width: (topCategory ? Math.round((Number(c.perSubject) / topCategory) * 100) : 0) + '%' }} />
                </span>
                <span className="pd-cat-v pg-mono">{usd(Number(c.perSubject))}</span></div>))}</div>
            {summary.basis && <div className="pde-basis">{summary.basis}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
