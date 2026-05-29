// Risk register — live table of risk items from GET /api/mdx/risk-items,
// program-scoped. Hazard → hazardous situation → harm, with initial vs residual
// score, acceptability band, and status. Every score carries its numeric value
// so it never depends on color alone.

import * as React from 'react';
import { useRiskItems } from '../../hooks/useRisk';
import { riskBand, RISK_STATUS_LABEL } from '../data/nav';
import {
  Loading, ErrorState, Empty, NoProject, StatusChip, BandPill, ScoreChip, itemStatusTone,
} from './state';

interface RegisterProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

export function RiskRegister({ projectId, onAskAna }: RegisterProps) {
  const itemsQuery = useRiskItems(projectId ? { programId: projectId } : {});
  const rows = itemsQuery.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Risk management · ISO 14971</div>
          <h1 className="bp-title">Risk register</h1>
          <div className="bp-meta">Hazard, hazardous situation, harm, with initial and residual risk</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('List every open hazard and its residual risk score')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Risk items</span>
          <span className="bp-meta">{rows.length} hazards</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : itemsQuery.isLoading ? (
          <Loading label="Loading risk items…" />
        ) : itemsQuery.isError ? (
          <ErrorState message="Could not load risk items." />
        ) : rows.length === 0 ? (
          <Empty>No risk items recorded for this project yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Hazard and harm</th>
                <th>Initial</th>
                <th>Residual</th>
                <th>Band</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(it => {
                const initialBand = riskBand(it.severity, it.probability);
                const resSev = it.residual_severity ?? it.severity;
                const resProb = it.residual_probability ?? it.probability;
                const resBand = riskBand(resSev, resProb);
                const hasResidual = it.residual_severity != null && it.residual_probability != null;
                return (
                  <tr key={it.id}>
                    <td className="risk-mono">{it.ref_code ?? `#${it.id}`}</td>
                    <td>
                      <button className="risk-haz-link" type="button"
                              onClick={() => onAskAna(`Open risk ${it.ref_code ?? it.id} (${it.hazard}) — show controls, residual risk, and verification status`)}>
                        <span className="risk-haz-t">{it.hazard}</span>
                        <span className="risk-haz-s">{it.harm}</span>
                      </button>
                    </td>
                    <td><ScoreChip severity={it.severity} probability={it.probability} band={initialBand} /></td>
                    <td>
                      {hasResidual
                        ? <ScoreChip severity={resSev} probability={resProb} band={resBand} />
                        : <span className="risk-mut">Not re-scored</span>}
                    </td>
                    <td><BandPill band={resBand} /></td>
                    <td><StatusChip tone={itemStatusTone(it.status)} label={RISK_STATUS_LABEL[it.status] ?? it.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
