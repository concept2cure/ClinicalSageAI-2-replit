// Risk controls — ISO 14971 §7 control hierarchy for a selected risk item.
// Controls come nested on GET /api/mdx/risk-items/:id (useRiskItem). Each row
// shows the control type, status, and the evidence references.

import * as React from 'react';
import { useRiskItem } from '../../hooks/useRisk';
import { ItemPicker } from './ItemPicker';
import {
  RISK_CONTROL_TYPE_LABEL, RISK_CONTROL_STATUS_LABEL, riskBand,
} from '../data/nav';
import {
  Loading, ErrorState, Empty, NoProject, StatusChip, BandPill, ScoreChip, controlStatusTone,
} from './state';

interface ControlsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

export function RiskControls({ projectId, onAskAna }: ControlsProps) {
  const [itemId, setItemId] = React.useState<number | null>(null);
  const itemQuery = useRiskItem(itemId);
  const item = itemQuery.data ?? null;
  const controls = item?.controls ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Risk management · ISO 14971 §7</div>
          <h1 className="bp-title">Risk controls</h1>
          <div className="bp-meta">
            {item
              ? `${controls.length} controls on ${item.ref_code ?? `#${item.id}`} · ${item.hazard}`
              : 'Inherent safety, protective measure, information for safety'}
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('List every control still pending verification with its evidence')}>
            Ask AnA
          </button>
        </div>
      </div>

      {!projectId ? (
        <div className="bp-card"><NoProject /></div>
      ) : (
        <>
          <ItemPicker projectId={projectId} value={itemId} onChange={setItemId} />

          {/* Risk context for the selected item — initial vs residual band. */}
          {item && (
            <div className="risk-context">
              <span className="risk-context-lbl">Initial</span>
              <ScoreChip severity={item.severity} probability={item.probability}
                         band={riskBand(item.severity, item.probability)} />
              <span className="risk-context-sep">→</span>
              <span className="risk-context-lbl">Residual</span>
              {item.residual_severity != null && item.residual_probability != null ? (
                <>
                  <ScoreChip severity={item.residual_severity} probability={item.residual_probability}
                             band={riskBand(item.residual_severity, item.residual_probability)} />
                  <BandPill band={riskBand(item.residual_severity, item.residual_probability)} />
                </>
              ) : (
                <span className="risk-mut">Not re-scored yet</span>
              )}
            </div>
          )}

          <div className="bp-card">
            <div className="bp-card-head">
              <span>Controls</span>
              <span className="bp-meta">{controls.length} on this item</span>
            </div>
            {itemId == null ? (
              <Empty>Select a risk item to view its controls.</Empty>
            ) : itemQuery.isLoading ? (
              <Loading label="Loading risk controls…" />
            ) : itemQuery.isError ? (
              <ErrorState message="Could not load risk controls." />
            ) : controls.length === 0 ? (
              <Empty>No controls recorded on this risk item yet.</Empty>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Control</th>
                    <th>Hierarchy level</th>
                    <th>Evidence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {controls.map(c => {
                    const evidence = c.effectiveness_evidence
                      ?? c.verification_evidence
                      ?? c.implementation_evidence;
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="risk-ctrl-desc">{c.description}</div>
                          {c.introduces_new_risk && (
                            <div className="risk-ctrl-note">Introduces a new risk — track as its own item</div>
                          )}
                        </td>
                        <td className="risk-mut">{RISK_CONTROL_TYPE_LABEL[c.control_type] ?? c.control_type}</td>
                        <td className="risk-mut">{evidence ?? '—'}</td>
                        <td>
                          <StatusChip tone={controlStatusTone(c.status)}
                                      label={RISK_CONTROL_STATUS_LABEL[c.status] ?? c.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
