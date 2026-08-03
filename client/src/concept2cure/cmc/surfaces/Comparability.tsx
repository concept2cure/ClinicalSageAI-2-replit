// Comparability assessments — live rows from GET /api/cmc/comparability-studies
// (org-scoped). Biologics-critical §3.2 comparability per ICH Q5E: a change, the
// affected attributes/methods, and the assessed outcome. Create is project-scoped.

import * as React from 'react';
import { useComparabilityStudies, useCreateComparabilityStudy } from '../../hooks/useCMC';
import type { ComparabilityInput } from '../../services/cmcService';
import { CmcIcon } from '../icons';
import { CmcDialog } from './CmcDialog';
import { Loading, ErrorState, Empty, NoProject, StatusChip } from './state';

function statusTone(s: string): 'ok' | 'warn' | 'err' | 'dim' {
  const v = (s || '').toLowerCase();
  if (v.includes('complete') || v.includes('comparable') || v.includes('approved')) return 'ok';
  if (v.includes('progress') || v.includes('pending') || v.includes('draft')) return 'warn';
  if (v.includes('not comparable') || v.includes('reject') || v.includes('fail')) return 'err';
  return 'dim';
}

interface FormState {
  title: string;
  type: string;
  product: string;
  methods: string;
  outcome: string;
  owner: string;
  status: string;
}

const STATES = ['draft', 'in-progress', 'complete'] as const;

function NewComparabilityDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateComparabilityStudy();
  const [form, setForm] = React.useState<FormState>({
    title: '',
    type: '',
    product: '',
    methods: '',
    outcome: '',
    owner: '',
    status: 'draft',
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title.trim().length > 0;
  const pending = create.isPending;
  const error = create.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: ComparabilityInput = {
      projectId,
      title: form.title.trim(),
      type: form.type.trim() || undefined,
      product: form.product.trim() || undefined,
      methods: form.methods
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      outcome: form.outcome.trim() || undefined,
      owner: form.owner.trim() || undefined,
      status: form.status,
    };
    await create.mutateAsync(body);
    onClose();
  };

  const formId = 'cmc-comparability-form';
  return (
    <CmcDialog
      open
      busy={pending}
      title="New comparability assessment"
      subtitle="ICH Q5E — the change, affected attributes/methods, and assessed outcome"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create assessment'}
          </button>
        </>
      }
    >
      <form id={formId} className="cmc-form" onSubmit={onSubmit}>
        <div className="cmc-field">
          <label htmlFor="cmp-title">Assessment name<span className="cmc-req" aria-hidden="true">*</span></label>
          <input id="cmp-title" required value={form.title} onChange={(e) => set('title', e.target.value)}
                 placeholder="e.g. Cell-line change comparability" />
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="cmp-type">Change type</label>
            <input id="cmp-type" value={form.type} onChange={(e) => set('type', e.target.value)}
                   placeholder="e.g. Process change" />
          </div>
          <div className="cmc-field">
            <label htmlFor="cmp-product">Changed element</label>
            <input id="cmp-product" value={form.product} onChange={(e) => set('product', e.target.value)}
                   placeholder="e.g. Drug substance" />
          </div>
        </div>
        <div className="cmc-field">
          <label htmlFor="cmp-methods">Affected attributes / methods</label>
          <input id="cmp-methods" value={form.methods} onChange={(e) => set('methods', e.target.value)}
                 placeholder="Comma-separated, e.g. charge variants, glycan map, potency" />
        </div>
        <div className="cmc-field">
          <label htmlFor="cmp-outcome">Assessed outcome / justification</label>
          <textarea id="cmp-outcome" value={form.outcome} onChange={(e) => set('outcome', e.target.value)}
                    placeholder="Summary of the comparability conclusion" />
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="cmp-owner">Reviewed by</label>
            <input id="cmp-owner" value={form.owner} onChange={(e) => set('owner', e.target.value)} />
          </div>
          <div className="cmc-field">
            <label htmlFor="cmp-status">Status</label>
            <select id="cmp-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        {error && (
          <div className="cmc-form-error" role="alert">
            <CmcIcon name="alertCircle" size={14} />
            Could not create the assessment. {error.message}
          </div>
        )}
      </form>
    </CmcDialog>
  );
}

export function CmcComparability({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const studies = useComparabilityStudies();
  const rows = studies.data ?? [];
  const [newStudy, setNewStudy] = React.useState(false);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Comparability</h1>
          <div className="bp-meta">Post-change comparability assessments · ICH Q5E</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId}
            onClick={() => setNewStudy(true)}
          >
            <CmcIcon name="plus" /> New assessment
          </button>
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Summarize the comparability risk across my change assessments')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Comparability assessments</span>
          <span className="bp-meta">{rows.length} records</span>
        </div>
        {studies.isLoading ? (
          <Loading label="Loading comparability assessments…" />
        ) : studies.isError ? (
          <ErrorState message="Could not load comparability assessments." />
        ) : rows.length === 0 ? (
          !projectId ? (
            <NoProject />
          ) : (
            <Empty>No comparability assessments recorded yet. Create one to track a post-change comparability conclusion.</Empty>
          )
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Change type</th>
                <th>Changed element</th>
                <th>Attributes / methods</th>
                <th>Reviewed by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const status = r.status ?? '';
                return (
                  <tr key={(r.id as string) ?? i}>
                    <td style={{ fontWeight: 600 }}>{r.title || '—'}</td>
                    <td>{r.type || '—'}</td>
                    <td>{r.product || '—'}</td>
                    <td className="bp-meta">{(r.methods ?? []).join(', ') || '—'}</td>
                    <td>{r.owner || '—'}</td>
                    <td>{status ? <StatusChip tone={statusTone(status)} label={status} /> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {newStudy && projectId && (
        <NewComparabilityDialog projectId={projectId} onClose={() => setNewStudy(false)} />
      )}
    </div>
  );
}
