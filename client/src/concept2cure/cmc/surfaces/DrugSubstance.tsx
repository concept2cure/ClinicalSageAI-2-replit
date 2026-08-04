// Drug substance (§3.2.S) — live rows from
// GET /api/cmc/projects/:projectId/drug-substances. Create captures the §3.2.S.1
// identity fields; the structured JSONB blocks (characterization, impurities,
// reference materials) are a follow-up sub-editor.

import * as React from 'react';
import { useDrugSubstances, useCreateDrugSubstance } from '../../hooks/useCMC';
import type { DrugSubstanceInput } from '../../services/cmcService';
import { CmcIcon } from '../icons';
import { CmcDialog } from './CmcDialog';
import { Loading, ErrorState, Empty, NoProject } from './state';

interface FormState {
  substanceName: string;
  casNumber: string;
  molecularFormula: string;
  molecularWeight: string;
  structure: string;
  manufacturingRoute: string;
}

function NewSubstanceDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateDrugSubstance(projectId);
  const [form, setForm] = React.useState<FormState>({
    substanceName: '',
    casNumber: '',
    molecularFormula: '',
    molecularWeight: '',
    structure: '',
    manufacturingRoute: '',
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.substanceName.trim().length > 0;
  const pending = create.isPending;
  const error = create.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: DrugSubstanceInput = {
      substanceName: form.substanceName.trim(),
      casNumber: form.casNumber.trim() || undefined,
      molecularFormula: form.molecularFormula.trim() || undefined,
      molecularWeight: form.molecularWeight.trim() || undefined,
      structure: form.structure.trim() || undefined,
      manufacturingRoute: form.manufacturingRoute.trim() || undefined,
    };
    await create.mutateAsync(body);
    onClose();
  };

  const formId = 'cmc-substance-form';
  return (
    <CmcDialog
      open
      busy={pending}
      title="New drug substance"
      subtitle="§3.2.S.1 general information — identity, structure, route"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create drug substance'}
          </button>
        </>
      }
    >
      <form id={formId} className="cmc-form" onSubmit={onSubmit}>
        <div className="cmc-field">
          <label htmlFor="ds-name">Substance name<span className="cmc-req" aria-hidden="true">*</span></label>
          <input id="ds-name" required value={form.substanceName} onChange={(e) => set('substanceName', e.target.value)}
                 placeholder="e.g. Compound X free base" />
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="ds-cas">CAS number</label>
            <input id="ds-cas" value={form.casNumber} onChange={(e) => set('casNumber', e.target.value)}
                   placeholder="e.g. 1234-56-7" />
          </div>
          <div className="cmc-field">
            <label htmlFor="ds-formula">Molecular formula</label>
            <input id="ds-formula" value={form.molecularFormula} onChange={(e) => set('molecularFormula', e.target.value)}
                   placeholder="e.g. C21H23N3O2" />
          </div>
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="ds-mw">Molecular weight</label>
            <input id="ds-mw" value={form.molecularWeight} onChange={(e) => set('molecularWeight', e.target.value)}
                   placeholder="e.g. 365.43" />
          </div>
          <div className="cmc-field">
            <label htmlFor="ds-route">Manufacturing route</label>
            <input id="ds-route" value={form.manufacturingRoute} onChange={(e) => set('manufacturingRoute', e.target.value)}
                   placeholder="e.g. Semi-synthetic" />
          </div>
        </div>
        <div className="cmc-field">
          <label htmlFor="ds-structure">Structure (SMILES / description)</label>
          <input id="ds-structure" value={form.structure} onChange={(e) => set('structure', e.target.value)}
                 placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O" />
        </div>
        {error && (
          <div className="cmc-form-error" role="alert">
            <CmcIcon name="alertCircle" size={14} />
            Could not create the drug substance. {error.message}
          </div>
        )}
      </form>
    </CmcDialog>
  );
}

export function CmcDrugSubstance({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const substances = useDrugSubstances(projectId);
  const rows = substances.data ?? [];
  const [newSubstance, setNewSubstance] = React.useState(false);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3 · §3.2.S</div>
          <h1 className="bp-title">Drug substance</h1>
          <div className="bp-meta">Drug-substance identity, structure and route</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId}
            onClick={() => setNewSubstance(true)}
          >
            <CmcIcon name="plus" /> New drug substance
          </button>
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Summarize the drug-substance control strategy and open §3.2.S gaps')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Drug substances</span>
          <span className="bp-meta">{rows.length} records</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : substances.isLoading ? (
          <Loading label="Loading drug substances…" />
        ) : substances.isError ? (
          <ErrorState message="Could not load drug substances." />
        ) : rows.length === 0 ? (
          <Empty>No drug substances recorded for this project yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Substance</th>
                <th>CAS</th>
                <th>Formula</th>
                <th>MW</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={(r.id as string) ?? i}>
                  <td style={{ fontWeight: 600 }}>{r.substanceName || '—'}</td>
                  <td>{r.cas || '—'}</td>
                  <td>{r.molecularFormula || '—'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {r.molecularWeight != null && r.molecularWeight !== '' ? String(r.molecularWeight) : '—'}
                  </td>
                  <td>{r.manufacturingRoute || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {newSubstance && projectId && (
        <NewSubstanceDialog projectId={projectId} onClose={() => setNewSubstance(false)} />
      )}
    </div>
  );
}
