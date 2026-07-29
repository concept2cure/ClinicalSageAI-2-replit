// Risk register — live table of risk items from GET /api/mdx/risk-items,
// program-scoped. Hazard → hazardous situation → harm, with initial vs residual
// score, acceptability band, and status. Every score carries its numeric value
// so it never depends on color alone.
//
// Authoring: "Add hazard" creates a risk item (useCreateRiskItem → POST
// /api/mdx/risk-items); per-item "Re-score" edits severity / probability,
// residual severity / probability, acceptability and the benefit-risk rationale
// (useUpdateRiskItem → PATCH /api/mdx/risk-items/:id). Both forms preview the
// computed risk product live, mirroring the server formula (severity ×
// probability), before the user commits.

import * as React from 'react';
import { useRiskItems, useCreateRiskItem, useUpdateRiskItem } from '../../hooks/useRisk';
import type { RiskItem, RiskItemCreate, RiskItemPatch, RiskScale } from '../../services/riskService';
import { riskBand, RISK_STATUS_LABEL, RISK_SEVERITY, RISK_PROBABILITY } from '../data/nav';
import { RiskIcon } from '../icons';
import { RiskDialog } from './RiskDialog';
import {
  Loading, ErrorState, Empty, NoProject, StatusChip, BandPill, ScoreChip, ScorePreview, itemStatusTone,
} from './state';

interface RegisterProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

const asScale = (v: string): RiskScale => Number(v) as RiskScale;

/** Severity / probability select — proper labeled control, value paired with
 *  the descriptive word so meaning never depends on position alone. */
function ScaleSelect({
  id, value, onChange, scale,
}: {
  id: string;
  value: RiskScale;
  onChange: (v: RiskScale) => void;
  scale: { id: number; label: string }[];
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(asScale(e.target.value))}>
      {scale.map((s) => (
        <option key={s.id} value={s.id}>{s.id} · {s.label}</option>
      ))}
    </select>
  );
}

// ── Add hazard ──────────────────────────────────────────────────────────────

interface AddState {
  hazard: string;
  hazardousSituation: string;
  harm: string;
  severity: RiskScale;
  probability: RiskScale;
}

function AddHazardDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateRiskItem();
  const [form, setForm] = React.useState<AddState>({
    hazard: '', hazardousSituation: '', harm: '', severity: 3, probability: 3,
  });
  const errId = React.useId();
  const set = <K extends keyof AddState>(k: K, v: AddState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const valid = form.hazard.trim().length > 0 && form.harm.trim().length > 0;
  const pending = create.isPending;
  const error = create.error as Error | null;
  const formId = 'risk-add-form';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: RiskItemCreate = {
      programId: projectId,
      hazard: form.hazard.trim(),
      hazardousSituation: form.hazardousSituation.trim() || null,
      harm: form.harm.trim(),
      severity: form.severity,
      probability: form.probability,
    };
    await create.mutateAsync(body);
    onClose();
  };

  return (
    <RiskDialog
      open
      busy={pending}
      title="Add hazard"
      subtitle="Hazard, hazardous situation, harm, and the initial severity × probability score"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Adding…' : 'Add hazard'}
          </button>
        </>
      }
    >
      <form id={formId} className="risk-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="risk-field">
          <label htmlFor="risk-hazard">Hazard<span className="risk-req" aria-hidden="true">*</span></label>
          <input id="risk-hazard" required value={form.hazard}
                 onChange={(e) => set('hazard', e.target.value)}
                 placeholder="e.g. Sharp edge on enclosure" />
        </div>
        <div className="risk-field">
          <label htmlFor="risk-situation">Hazardous situation</label>
          <input id="risk-situation" value={form.hazardousSituation}
                 onChange={(e) => set('hazardousSituation', e.target.value)}
                 placeholder="e.g. User handles enclosure during cleaning" />
        </div>
        <div className="risk-field">
          <label htmlFor="risk-harm">Harm<span className="risk-req" aria-hidden="true">*</span></label>
          <input id="risk-harm" required value={form.harm}
                 onChange={(e) => set('harm', e.target.value)}
                 placeholder="e.g. Laceration requiring intervention" />
        </div>
        <div className="risk-field-row">
          <div className="risk-field">
            <label htmlFor="risk-sev">Severity (1–5)<span className="risk-req" aria-hidden="true">*</span></label>
            <ScaleSelect id="risk-sev" value={form.severity} onChange={(v) => set('severity', v)} scale={RISK_SEVERITY} />
          </div>
          <div className="risk-field">
            <label htmlFor="risk-prob">Probability (1–5)<span className="risk-req" aria-hidden="true">*</span></label>
            <ScaleSelect id="risk-prob" value={form.probability} onChange={(v) => set('probability', v)} scale={RISK_PROBABILITY} />
          </div>
        </div>
        <ScorePreview label="Initial risk" severity={form.severity} probability={form.probability} />
        {error && (
          <div id={errId} className="risk-form-error" role="alert">
            <RiskIcon name="alertCircle" size={14} />
            Could not add the hazard. {error.message}
          </div>
        )}
      </form>
    </RiskDialog>
  );
}

// ── Re-score ──────────────────────────────────────────────────────────────

interface RescoreState {
  severity: RiskScale;
  probability: RiskScale;
  hasResidual: boolean;
  residualSeverity: RiskScale;
  residualProbability: RiskScale;
  acceptable: boolean;
  benefitRiskRationale: string;
}

function itemToRescore(item: RiskItem): RescoreState {
  const hasResidual = item.residual_severity != null && item.residual_probability != null;
  return {
    severity: (item.severity as RiskScale) ?? 3,
    probability: (item.probability as RiskScale) ?? 3,
    hasResidual,
    residualSeverity: ((item.residual_severity ?? item.severity) as RiskScale) ?? 3,
    residualProbability: ((item.residual_probability ?? item.probability) as RiskScale) ?? 3,
    acceptable: item.acceptable ?? false,
    benefitRiskRationale: item.benefit_risk_rationale ?? '',
  };
}

function RescoreDialog({ item, onClose }: { item: RiskItem; onClose: () => void }) {
  const update = useUpdateRiskItem();
  const [form, setForm] = React.useState<RescoreState>(() => itemToRescore(item));
  const errId = React.useId();
  const set = <K extends keyof RescoreState>(k: K, v: RescoreState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pending = update.isPending;
  const error = update.error as Error | null;
  const formId = 'risk-rescore-form';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const patch: RiskItemPatch = {
      severity: form.severity,
      probability: form.probability,
      acceptable: form.acceptable,
      benefitRiskRationale: form.benefitRiskRationale.trim() || null,
    };
    if (form.hasResidual) {
      patch.residualSeverity = form.residualSeverity;
      patch.residualProbability = form.residualProbability;
    } else {
      patch.residualSeverity = null;
      patch.residualProbability = null;
    }
    await update.mutateAsync({ id: item.id, patch });
    onClose();
  };

  return (
    <RiskDialog
      open
      busy={pending}
      title="Re-score risk"
      subtitle={`${item.ref_code ?? `#${item.id}`} · ${item.hazard}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save score'}
          </button>
        </>
      }
    >
      <form id={formId} className="risk-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="risk-field-row">
          <div className="risk-field">
            <label htmlFor="rescore-sev">Severity (1–5)</label>
            <ScaleSelect id="rescore-sev" value={form.severity} onChange={(v) => set('severity', v)} scale={RISK_SEVERITY} />
          </div>
          <div className="risk-field">
            <label htmlFor="rescore-prob">Probability (1–5)</label>
            <ScaleSelect id="rescore-prob" value={form.probability} onChange={(v) => set('probability', v)} scale={RISK_PROBABILITY} />
          </div>
        </div>
        <ScorePreview label="Initial risk" severity={form.severity} probability={form.probability} />

        <div className="risk-field risk-field-check">
          <input id="rescore-hasres" type="checkbox" checked={form.hasResidual}
                 onChange={(e) => set('hasResidual', e.target.checked)} />
          <label htmlFor="rescore-hasres">Record residual risk after controls</label>
        </div>
        {form.hasResidual && (
          <>
            <div className="risk-field-row">
              <div className="risk-field">
                <label htmlFor="rescore-rsev">Residual severity (1–5)</label>
                <ScaleSelect id="rescore-rsev" value={form.residualSeverity} onChange={(v) => set('residualSeverity', v)} scale={RISK_SEVERITY} />
              </div>
              <div className="risk-field">
                <label htmlFor="rescore-rprob">Residual probability (1–5)</label>
                <ScaleSelect id="rescore-rprob" value={form.residualProbability} onChange={(v) => set('residualProbability', v)} scale={RISK_PROBABILITY} />
              </div>
            </div>
            <ScorePreview label="Residual risk" severity={form.residualSeverity} probability={form.residualProbability} />
          </>
        )}

        <div className="risk-field risk-field-check">
          <input id="rescore-acceptable" type="checkbox" checked={form.acceptable}
                 onChange={(e) => set('acceptable', e.target.checked)} />
          <label htmlFor="rescore-acceptable">Residual risk is acceptable</label>
        </div>
        <div className="risk-field">
          <label htmlFor="rescore-rationale">Benefit-risk rationale</label>
          <textarea id="rescore-rationale" value={form.benefitRiskRationale}
                    onChange={(e) => set('benefitRiskRationale', e.target.value)}
                    placeholder="Why the residual risk is outweighed by the clinical benefit" />
        </div>

        {error && (
          <div id={errId} className="risk-form-error" role="alert">
            <RiskIcon name="alertCircle" size={14} />
            Could not save the score. {error.message}
          </div>
        )}
      </form>
    </RiskDialog>
  );
}

// ── Surface ──────────────────────────────────────────────────────────────

export function RiskRegister({ projectId, onAskAna }: RegisterProps) {
  const itemsQuery = useRiskItems(projectId ? { programId: projectId } : {});
  const rows = itemsQuery.data ?? [];
  const [adding, setAdding] = React.useState(false);
  const [rescoring, setRescoring] = React.useState<RiskItem | null>(null);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Risk management · ISO 14971</div>
          <h1 className="bp-title">Risk register</h1>
          <div className="bp-meta">Hazard, hazardous situation, harm, with initial and residual risk</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-tert" type="button" disabled={!projectId} onClick={() => setAdding(true)}>
            <RiskIcon name="plus" /> Add hazard
          </button>
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
                <th>Action</th>
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
                    <td>
                      <button className="bp-btn-tert" type="button" onClick={() => setRescoring(it)}>
                        <RiskIcon name="pen" size={14} /> Re-score
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding && projectId && (
        <AddHazardDialog projectId={projectId} onClose={() => setAdding(false)} />
      )}
      {rescoring && (
        <RescoreDialog item={rescoring} onClose={() => setRescoring(null)} />
      )}
    </div>
  );
}
