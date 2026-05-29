// Risk matrix — ISO 14971 severity (1–5) × probability (1–5) heatmap, bound to
// the live risk items. Pre-control uses each item's initial severity ×
// probability; post-control uses residual where present. The aggregate summary
// panel reads GET /api/mdx/risk-summary/:programId (useRiskSummary).
//
// A11y (WCAG 2.2 AA): the matrix never relies on color alone. Each cell is a
// labelled button carrying the band word, the severity × probability score, and
// the count of risks; the axes carry both the numeric level and its name.

import * as React from 'react';
import { useRiskItems, useRiskSummary } from '../../hooks/useRisk';
import { riskBand, RISK_BAND_LABEL, RISK_SEVERITY, RISK_PROBABILITY, type RiskBand } from '../data/nav';
import { Loading, ErrorState, Empty, NoProject } from './state';
import type { RiskItem } from '../../services/riskService';

interface MatrixProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

type Mode = 'pre' | 'post';

const SEV_LEVELS = [5, 4, 3, 2, 1]; // rows, high → low
const PROB_LEVELS = [1, 2, 3, 4, 5]; // cols, low → high

function sevOf(it: RiskItem, mode: Mode): number {
  return mode === 'post' ? (it.residual_severity ?? it.severity) : it.severity;
}
function probOf(it: RiskItem, mode: Mode): number {
  return mode === 'post' ? (it.residual_probability ?? it.probability) : it.probability;
}

export function RiskMatrix({ projectId, onAskAna }: MatrixProps) {
  const itemsQuery = useRiskItems(projectId ? { programId: projectId } : {});
  const summaryQuery = useRiskSummary(projectId);
  const items = itemsQuery.data ?? [];
  const summary = summaryQuery.data;
  const [mode, setMode] = React.useState<Mode>('post');

  const cellItems = (sev: number, prob: number) =>
    items.filter(it => sevOf(it, mode) === sev && probOf(it, mode) === prob);

  const sevLabel = (id: number) => RISK_SEVERITY.find(s => s.id === id)?.label ?? '';
  const probLabel = (id: number) => RISK_PROBABILITY.find(p => p.id === id)?.label ?? '';

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Risk management · ISO 14971</div>
          <h1 className="bp-title">Risk matrix</h1>
          <div className="bp-meta">
            Severity × probability ·{' '}
            {summary
              ? `${summary.total} hazards · avg initial ${summary.avgInitial ?? '—'} · avg residual ${summary.avgResidual ?? '—'}`
              : `${items.length} hazards`}
          </div>
        </div>
        <div className="bp-page-actions">
          <div className="risk-toggle" role="tablist" aria-label="Matrix mode">
            <button type="button" role="tab" aria-selected={mode === 'pre'}
                    data-active={mode === 'pre' || undefined} onClick={() => setMode('pre')}>
              Pre-control
            </button>
            <button type="button" role="tab" aria-selected={mode === 'post'}
                    data-active={mode === 'post' || undefined} onClick={() => setMode('post')}>
              Post-control
            </button>
          </div>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>{mode === 'post' ? 'Residual risk' : 'Initial risk'} distribution</span>
          <span className="bp-meta">5 × 5 · count of hazards per cell</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : itemsQuery.isLoading ? (
          <Loading label="Loading risk matrix…" />
        ) : itemsQuery.isError ? (
          <ErrorState message="Could not load risk items." />
        ) : items.length === 0 ? (
          <Empty>No risk items recorded for this project yet.</Empty>
        ) : (
          <div className="risk-matrix-wrap">
            <table className="risk-matrix" aria-label="Risk matrix: severity by probability">
              <caption className="risk-sr-only">
                Count of hazards by severity (rows, 1 negligible to 5 catastrophic) and
                probability (columns, 1 improbable to 5 frequent). Each cell states its
                acceptability band and score.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="risk-matrix-corner">
                    <span className="risk-sr-only">Severity over probability</span>
                  </th>
                  {PROB_LEVELS.map(p => (
                    <th key={p} scope="col" className="risk-matrix-axis">
                      <span className="risk-matrix-axis-num">{p}</span>
                      <span className="risk-matrix-axis-lbl">{probLabel(p)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEV_LEVELS.map(s => (
                  <tr key={s}>
                    <th scope="row" className="risk-matrix-axis risk-matrix-axis-row">
                      <span className="risk-matrix-axis-num">{s}</span>
                      <span className="risk-matrix-axis-lbl">{sevLabel(s)}</span>
                    </th>
                    {PROB_LEVELS.map(p => {
                      const band: RiskBand = riskBand(s, p);
                      const cell = cellItems(s, p);
                      const score = s * p;
                      const label = `${cell.length} hazard${cell.length === 1 ? '' : 's'} · severity ${s} × probability ${p} = ${score} · ${RISK_BAND_LABEL[band]}`;
                      return (
                        <td key={p} className="risk-matrix-td">
                          <button
                            type="button"
                            className={`risk-cell risk-cell-${band}`}
                            aria-label={label}
                            title={label}
                            disabled={cell.length === 0}
                            onClick={() => cell.length && onAskAna(
                              `Show the ${cell.length} risk(s) at severity ${s} × probability ${p}: ${cell.map(c => c.ref_code ?? `#${c.id}`).join(', ')} and the controls that apply`,
                            )}>
                            <span className="risk-cell-count">{cell.length > 0 ? cell.length : ''}</span>
                            <span className="risk-cell-score">{score}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="risk-legend" aria-hidden="false">
              <div className="risk-legend-head">Acceptability bands</div>
              <div className="risk-legend-row">
                <span className="risk-band risk-band-acceptable">Acceptable</span>
                <span className="risk-mut">Score &lt; 8 · no further action</span>
              </div>
              <div className="risk-legend-row">
                <span className="risk-band risk-band-alarp">ALARP</span>
                <span className="risk-mut">Score 8–14 · reduce as far as practicable</span>
              </div>
              <div className="risk-legend-row">
                <span className="risk-band risk-band-unacceptable">Unacceptable</span>
                <span className="risk-mut">Score ≥ 15 · must add controls</span>
              </div>
              <div className="risk-legend-axes">
                Rows: severity 1–5. Columns: probability 1–5.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
