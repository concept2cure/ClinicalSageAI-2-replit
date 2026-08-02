// Stability program — live rows from GET /api/cmc/stability/:projectId, with
// study authoring and per-study result entry. New studies POST to
// /api/cmc/stability; results append to a study's JSON `results` field via PUT
// /api/cmc/stability/:id. The shelf-life projection stays available through
// the Ask AnA Q1E action.

import * as React from 'react';
import {
  useProjectStability,
  useCreateStabilityProtocol,
  useAddStabilityResult,
  useProjectShelfLife,
} from '../../hooks/useCMC';
import type {
  CmcStabilityRow,
  StabilityStudyInput,
  StabilityResultEntry,
} from '../../services/cmcService';
import { CmcIcon } from '../icons';
import { CmcDialog } from './CmcDialog';
import { Loading, ErrorState, Empty, NoProject } from './state';

function pick(row: CmcStabilityRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') return String(v);
  }
  return '—';
}

/** Existing results on a study row, normalised to an array. */
function existingResults(row: CmcStabilityRow): StabilityResultEntry[] {
  const raw = row.results;
  if (Array.isArray(raw)) return raw as StabilityResultEntry[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const STUDY_TYPES = ['Long-term', 'Accelerated', 'Stress', 'Intermediate'] as const;
const STUDY_STATES = ['planned', 'in-progress', 'completed'] as const;

interface StudyFormState {
  studyName: string;
  studyType: string;
  storageCondition: string;
  duration: string;
  timePoints: string;
  containerClosure: string;
  status: string;
}

function NewStudyDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateStabilityProtocol();
  const [form, setForm] = React.useState<StudyFormState>({
    studyName: '',
    studyType: 'Long-term',
    storageCondition: '',
    duration: '',
    timePoints: '',
    containerClosure: '',
    status: 'planned',
  });
  const errId = React.useId();
  const set = <K extends keyof StudyFormState>(k: K, v: StudyFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.studyName.trim().length > 0;
  const pending = create.isPending;
  const error = create.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: StabilityStudyInput = {
      projectId,
      studyName: form.studyName.trim(),
      studyType: form.studyType || undefined,
      storageCondition: form.storageCondition.trim() || undefined,
      duration: form.duration.trim() || undefined,
      timePoints: form.timePoints.trim() || undefined,
      containerClosure: form.containerClosure.trim() || undefined,
      status: form.status,
    };
    await create.mutateAsync(body);
    onClose();
  };

  const formId = 'cmc-study-form';
  return (
    <CmcDialog
      open
      busy={pending}
      title="New stability protocol"
      subtitle="ICH Q1A study definition · conditions and time points"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create protocol'}
          </button>
        </>
      }
    >
      <form id={formId} className="cmc-form" onSubmit={onSubmit}>
        <div className="cmc-field">
          <label htmlFor="study-name">Study name<span className="cmc-req" aria-hidden="true">*</span></label>
          <input id="study-name" required value={form.studyName} onChange={(e) => set('studyName', e.target.value)} placeholder="e.g. Primary long-term stability" />
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="study-type">Study type</label>
            <select id="study-type" value={form.studyType} onChange={(e) => set('studyType', e.target.value)}>
              {STUDY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="cmc-field">
            <label htmlFor="study-status">Status</label>
            <select id="study-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STUDY_STATES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="study-cond">Storage condition</label>
            <input id="study-cond" value={form.storageCondition} onChange={(e) => set('storageCondition', e.target.value)} placeholder="e.g. 25C / 60 percent RH" />
          </div>
          <div className="cmc-field">
            <label htmlFor="study-dur">Duration</label>
            <input id="study-dur" value={form.duration} onChange={(e) => set('duration', e.target.value)} placeholder="e.g. 24 months" />
          </div>
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="study-tp">Time points</label>
            <input id="study-tp" value={form.timePoints} onChange={(e) => set('timePoints', e.target.value)} placeholder="e.g. 0, 3, 6, 9, 12, 18, 24" />
          </div>
          <div className="cmc-field">
            <label htmlFor="study-cc">Container closure</label>
            <input id="study-cc" value={form.containerClosure} onChange={(e) => set('containerClosure', e.target.value)} placeholder="e.g. HDPE bottle" />
          </div>
        </div>
        {error && (
          <div id={errId} className="cmc-form-error" role="alert">
            <CmcIcon name="alertCircle" size={14} />
            Could not create the protocol. {error.message}
          </div>
        )}
      </form>
    </CmcDialog>
  );
}

function AddResultDialog({
  projectId,
  study,
  onClose,
}: {
  projectId: string;
  study: CmcStabilityRow;
  onClose: () => void;
}) {
  const add = useAddStabilityResult();
  const [timePoint, setTimePoint] = React.useState('');
  const [parameter, setParameter] = React.useState('');
  const [value, setValue] = React.useState('');
  const errId = React.useId();

  const valid = timePoint.trim() && parameter.trim() && value.trim();
  const pending = add.isPending;
  const error = add.error as Error | null;
  const priorCount = existingResults(study).length;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const entry: StabilityResultEntry = {
      timePoint: timePoint.trim(),
      parameter: parameter.trim(),
      value: value.trim(),
      recordedAt: new Date().toISOString(),
    };
    const nextResults = [...existingResults(study), entry];
    await add.mutateAsync({ studyId: String(study.id), nextResults, projectId });
    onClose();
  };

  const studyName = pick(study, ['study_name', 'study', 'name', 'protocol_name']);
  const formId = 'cmc-result-form';
  return (
    <CmcDialog
      open
      busy={pending}
      title="Add result"
      subtitle={`${studyName} · ${priorCount} ${priorCount === 1 ? 'result' : 'results'} recorded`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Saving…' : 'Add result'}
          </button>
        </>
      }
    >
      <form id={formId} className="cmc-form" onSubmit={onSubmit}>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="res-tp">Time point<span className="cmc-req" aria-hidden="true">*</span></label>
            <input id="res-tp" required value={timePoint} onChange={(e) => setTimePoint(e.target.value)} placeholder="e.g. 6 months" />
          </div>
          <div className="cmc-field">
            <label htmlFor="res-param">Parameter<span className="cmc-req" aria-hidden="true">*</span></label>
            <input id="res-param" required value={parameter} onChange={(e) => setParameter(e.target.value)} placeholder="e.g. assay" />
          </div>
        </div>
        <div className="cmc-field">
          <label htmlFor="res-val">Value<span className="cmc-req" aria-hidden="true">*</span></label>
          <input id="res-val" required value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 99.2 percent" />
        </div>
        {error && (
          <div id={errId} className="cmc-form-error" role="alert">
            <CmcIcon name="alertCircle" size={14} />
            Could not save the result. {error.message}
          </div>
        )}
      </form>
    </CmcDialog>
  );
}

// Inline ICH Q1A(R2)·Q1E shelf-life projection for one study — the real
// deterministic backend (GET /api/cmc/stability/:id/projections) rendered in
// place, not delegated to an AnA prompt.
function ShelfLifePanel({ study, onClose }: { study: CmcStabilityRow; onClose: () => void }) {
  const studyId = (study.id as string) ?? null;
  const proj = useProjectShelfLife(studyId);
  const d = proj.data;
  const name = pick(study, ['study_name', 'study', 'study_id', 'name', 'protocol_name']);
  return (
    <div className="bp-card" style={{ marginTop: 16 }}>
      <div className="bp-card-head">
        <span>Shelf-life projection · {name || 'study'}</span>
        <button className="bp-btn-tert" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {!studyId ? (
        <Empty>This study has no id to project against.</Empty>
      ) : proj.isLoading ? (
        <Loading label="Projecting shelf life…" />
      ) : proj.isError ? (
        <ErrorState message="Could not compute the shelf-life projection." />
      ) : !d ? (
        <Empty>No projection returned for this study.</Empty>
      ) : (
        <div style={{ padding: '4px 4px 8px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginBottom: 14 }}>
            <div>
              <div className="bp-meta">Projected shelf life</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {d.projectedShelfLife.months} mo
              </div>
              <div className="bp-meta">
                {d.projectedShelfLife.confidence} confidence · {d.projectedShelfLife.basis}
              </div>
            </div>
            <div>
              <div className="bp-meta">ICH compliance</div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: d.ichCompliance.projectedMeets ? '#1f8a5b' : '#c53d54',
                }}
              >
                {d.ichCompliance.projectedMeets ? 'Meets minimum' : 'Below minimum'}
              </div>
              <div className="bp-meta">
                ≥ {d.ichCompliance.minimumRequired} mo · {d.ichCompliance.guideline}
              </div>
            </div>
            <div>
              <div className="bp-meta">Arrhenius model</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                ×{d.arrheniusModel.accelerationFactor} @ {d.arrheniusModel.testTemperature}
              </div>
              <div className="bp-meta">
                Ea {d.arrheniusModel.activationEnergy} kJ/mol · ref {d.arrheniusModel.referenceTemperature}
              </div>
            </div>
            <div>
              <div className="bp-meta">Degradation</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {d.degradationProfile.ratePerMonth}%/mo
              </div>
              <div className="bp-meta">{d.degradationProfile.mechanism}</div>
            </div>
          </div>

          {d.degradationProfile.timePointProjections.length > 0 && (
            <table className="bp-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Projected purity</th>
                  <th>Degradation</th>
                  <th>Within spec</th>
                </tr>
              </thead>
              <tbody>
                {d.degradationProfile.timePointProjections.map((tp) => (
                  <tr key={tp.month}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{tp.month}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{tp.projectedPurity}%</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{tp.degradation}%</td>
                    <td style={{ color: tp.withinSpec ? '#1f8a5b' : '#c53d54', fontWeight: 600 }}>
                      {tp.withinSpec ? 'Yes' : 'No'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {d.recommendations.length > 0 && (
            <ul style={{ margin: '14px 0 0', paddingLeft: 18 }}>
              {d.recommendations.map((r, i) => (
                <li key={i} className="bp-meta" style={{ marginBottom: 4 }}>
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function CmcStability({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const stability = useProjectStability(projectId);
  const rows = stability.data ?? [];
  const [newStudy, setNewStudy] = React.useState(false);
  const [addResultFor, setAddResultFor] = React.useState<CmcStabilityRow | null>(null);
  const [projectFor, setProjectFor] = React.useState<CmcStabilityRow | null>(null);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Stability program</h1>
          <div className="bp-meta">Studies, conditions and time points · ICH Q1A / Q1E</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId}
            onClick={() => setNewStudy(true)}
          >
            <CmcIcon name="plus" /> New protocol
          </button>
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Project shelf life from the long-term data with an ICH Q1E fit')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Stability studies</span>
          <span className="bp-meta">{rows.length} studies</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : stability.isLoading ? (
          <Loading label="Loading stability studies…" />
        ) : stability.isError ? (
          <ErrorState message="Could not load stability studies." />
        ) : rows.length === 0 ? (
          <Empty>No stability studies recorded for this project yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Study</th>
                <th>Type</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Results</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row.id as string) ?? i}>
                  <td style={{ fontWeight: 600 }}>{pick(row, ['study_name', 'study', 'study_id', 'name', 'protocol_name'])}</td>
                  <td>{pick(row, ['study_type', 'material', 'material_type', 'type'])}</td>
                  <td>{pick(row, ['storage_condition', 'condition', 'conditions'])}</td>
                  <td>{pick(row, ['status', 'state'])}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{existingResults(row).length}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="bp-btn-tert"
                        type="button"
                        onClick={() => setAddResultFor(row)}
                      >
                        <CmcIcon name="plus" size={14} /> Add result
                      </button>
                      <button
                        className="bp-btn-tert"
                        type="button"
                        onClick={() => setProjectFor(row)}
                        title="Project shelf life (ICH Q1A(R2)·Q1E)"
                      >
                        Shelf-life
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {projectFor && <ShelfLifePanel study={projectFor} onClose={() => setProjectFor(null)} />}

      {newStudy && projectId && (
        <NewStudyDialog projectId={projectId} onClose={() => setNewStudy(false)} />
      )}
      {addResultFor && projectId && (
        <AddResultDialog projectId={projectId} study={addResultFor} onClose={() => setAddResultFor(null)} />
      )}
    </div>
  );
}
