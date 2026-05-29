// Risk controls — ISO 14971 §7 control hierarchy for a selected risk item.
// Controls come nested on GET /api/mdx/risk-items/:id (useRiskItem). Each row
// shows the control type, status, and the evidence references.
//
// Authoring: "Add control" creates a control on the selected item
// (useAddRiskControl → POST /api/mdx/risk-items/:id/controls); each row carries
// an inline status select that advances the control through the ISO 14971 §7
// lifecycle proposed → implemented → verified → effective (useUpdateRiskControl
// → PATCH /api/mdx/risk-controls/:controlId).

import * as React from 'react';
import { useRiskItem, useAddRiskControl, useUpdateRiskControl } from '../../hooks/useRisk';
import type {
  RiskControl, RiskControlCreate, RiskControlType, RiskControlStatus,
} from '../../services/riskService';
import { ItemPicker } from './ItemPicker';
import {
  RISK_CONTROL_TYPE_LABEL, RISK_CONTROL_STATUS_LABEL, riskBand,
} from '../data/nav';
import { RiskIcon } from '../icons';
import { RiskDialog } from './RiskDialog';
import {
  Loading, ErrorState, Empty, NoProject, StatusChip, BandPill, ScoreChip, controlStatusTone,
} from './state';

interface ControlsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

const CONTROL_TYPES: RiskControlType[] = ['inherent_safety', 'protective_measure', 'information_safety'];
const CONTROL_STATUSES: RiskControlStatus[] = ['proposed', 'implemented', 'verified', 'effective'];

// ── Add control ────────────────────────────────────────────────────────────

function AddControlDialog({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const add = useAddRiskControl();
  const [description, setDescription] = React.useState('');
  const [controlType, setControlType] = React.useState<RiskControlType>('inherent_safety');
  const errId = React.useId();

  const valid = description.trim().length > 0;
  const pending = add.isPending;
  const error = add.error as Error | null;
  const formId = 'risk-control-form';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const data: RiskControlCreate = { description: description.trim(), controlType };
    await add.mutateAsync({ itemId, data });
    onClose();
  };

  return (
    <RiskDialog
      open
      busy={pending}
      title="Add control"
      subtitle="ISO 14971 §7 — inherent safety, protective measure, or information for safety"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Adding…' : 'Add control'}
          </button>
        </>
      }
    >
      <form id={formId} className="risk-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="risk-field">
          <label htmlFor="ctrl-desc">Control description<span className="risk-req" aria-hidden="true">*</span></label>
          <textarea id="ctrl-desc" required value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Round all accessible edges to a 2 mm radius" />
        </div>
        <div className="risk-field">
          <label htmlFor="ctrl-type">Hierarchy level<span className="risk-req" aria-hidden="true">*</span></label>
          <select id="ctrl-type" value={controlType} onChange={(e) => setControlType(e.target.value as RiskControlType)}>
            {CONTROL_TYPES.map((t) => (
              <option key={t} value={t}>{RISK_CONTROL_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <span className="risk-field-hint">Prefer inherent safety over protective measures over information for safety.</span>
        </div>
        {error && (
          <div id={errId} className="risk-form-error" role="alert">
            <RiskIcon name="alertCircle" size={14} />
            Could not add the control. {error.message}
          </div>
        )}
      </form>
    </RiskDialog>
  );
}

// ── Inline status update ─────────────────────────────────────────────────────

function ControlStatusSelect({ control }: { control: RiskControl }) {
  const update = useUpdateRiskControl();
  const selectId = `ctrl-status-${control.id}`;

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const status = e.target.value as RiskControlStatus;
    if (status === control.status) return;
    update.mutate({ controlId: control.id, itemId: control.risk_item_id, patch: { status } });
  };

  return (
    <div className="risk-ctrl-status">
      <StatusChip tone={controlStatusTone(control.status)}
                  label={RISK_CONTROL_STATUS_LABEL[control.status] ?? control.status} />
      <label className="risk-sr-only" htmlFor={selectId}>Update control status</label>
      <select id={selectId} value={control.status} onChange={onChange} disabled={update.isPending}>
        {CONTROL_STATUSES.map((s) => (
          <option key={s} value={s}>{RISK_CONTROL_STATUS_LABEL[s]}</option>
        ))}
      </select>
      {update.isError && (
        <span className="risk-form-error" role="alert">
          <RiskIcon name="alertCircle" size={13} /> Update failed
        </span>
      )}
    </div>
  );
}

// ── Surface ──────────────────────────────────────────────────────────────

export function RiskControls({ projectId, onAskAna }: ControlsProps) {
  const [itemId, setItemId] = React.useState<number | null>(null);
  const itemQuery = useRiskItem(itemId);
  const item = itemQuery.data ?? null;
  const controls = item?.controls ?? [];
  const [adding, setAdding] = React.useState(false);

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
          <button className="bp-btn-tert" type="button" disabled={itemId == null} onClick={() => setAdding(true)}>
            <RiskIcon name="plus" /> Add control
          </button>
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
                        <td><ControlStatusSelect control={c} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {adding && itemId != null && (
        <AddControlDialog itemId={itemId} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
