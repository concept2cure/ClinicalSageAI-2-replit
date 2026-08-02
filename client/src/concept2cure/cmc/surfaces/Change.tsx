// Change simulator — describe a CMC change, submit, render the live filing
// path / impact returned by POST /api/cmc/change-impact-simulator/simulate.

import * as React from 'react';
import { useChangeImpactSimulation, useVariationClassification } from '../../hooks/useCMC';
import type { CmcDosageFormFamily, CmcChangeCategory } from '../../services/cmcService';
import { ErrorState, ResultView } from './state';

const CHANGE_TYPES: Array<{ id: string; label: string }> = [
  { id: 'api_supplier_change', label: 'API supplier change' },
  { id: 'process_scale_up', label: 'Process scale-up' },
  { id: 'excipient_replacement', label: 'Excipient replacement' },
  { id: 'analytical_method_change', label: 'Analytical method change' },
  { id: 'facility_change', label: 'Facility change' },
  { id: 'equipment_change', label: 'Equipment change' },
  { id: 'process_parameter_change', label: 'Process parameter change' },
  { id: 'specification_change', label: 'Specification change' },
  { id: 'packaging_change', label: 'Packaging change' },
  { id: 'stability_protocol_change', label: 'Stability protocol change' },
  { id: 'other', label: 'Other' },
];

const MARKETS: Array<{ id: string; label: string }> = [
  { id: 'fda', label: 'FDA' },
  { id: 'ema', label: 'EMA' },
  { id: 'pmda', label: 'PMDA' },
  { id: 'nmpa', label: 'NMPA' },
  { id: 'health_canada', label: 'Health Canada' },
  { id: 'uk_mhra', label: 'UK MHRA' },
];

const DOSAGE_FORMS: Array<{ id: CmcDosageFormFamily; label: string }> = [
  { id: 'immediate_release_oral_solid', label: 'IR oral solid (SUPAC-IR)' },
  { id: 'modified_release_oral_solid', label: 'MR oral solid (SUPAC-MR)' },
  { id: 'nonsterile_semisolid', label: 'Nonsterile semisolid (SUPAC-SS)' },
  { id: 'sterile_injectable', label: 'Sterile injectable' },
  { id: 'biologic', label: 'Biologic' },
  { id: 'inhalation', label: 'Inhalation' },
  { id: 'transdermal', label: 'Transdermal' },
  { id: 'other', label: 'Other' },
];

const CHANGE_CATEGORIES: Array<{ id: CmcChangeCategory; label: string }> = [
  { id: 'components_composition', label: 'Components / composition' },
  { id: 'manufacturing_site', label: 'Manufacturing site' },
  { id: 'scale_up', label: 'Scale-up / scale-down' },
  { id: 'manufacturing_process', label: 'Manufacturing process' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'container_closure', label: 'Container / closure' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'analytical_method', label: 'Analytical method' },
  { id: 'stability_protocol', label: 'Stability protocol' },
];

function supacTierClass(tier: string): string {
  if (tier === 'level_3') return 'cmc-supac cmc-supac-high';
  if (tier === 'level_2') return 'cmc-supac cmc-supac-med';
  return 'cmc-supac';
}

export function CmcChange() {
  const sim = useChangeImpactSimulation();
  const [changeType, setChangeType] = React.useState('api_supplier_change');
  const [description, setDescription] = React.useState('');
  const [markets, setMarkets] = React.useState<string[]>(['fda']);
  const [currentState, setCurrentState] = React.useState('');
  const [proposedState, setProposedState] = React.useState('');

  const cls = useVariationClassification();
  const [dosageForm, setDosageForm] = React.useState<CmcDosageFormFamily>('immediate_release_oral_solid');
  const [changeCat, setChangeCat] = React.useState<CmcChangeCategory>('components_composition');
  const [criticalStep, setCriticalStep] = React.useState(false);
  const classification = cls.data;

  const toggleMarket = (id: string) =>
    setMarkets(prev => (prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || markets.length === 0) return;
    sim.mutate({
      changeType,
      description: description.trim(),
      markets,
      currentState: currentState.trim() || undefined,
      proposedState: proposedState.trim() || undefined,
    });
  };

  const result = sim.data as Record<string, unknown> | undefined;

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Change simulator</h1>
          <div className="bp-meta">Model a CMC change and get the filing path across markets · SUPAC and ICH Q12</div>
        </div>
      </div>

      <div className="bp-card" style={{ padding: 16 }}>
        <form className="cmc-form" onSubmit={onSubmit}>
          <div className="cmc-field">
            <label htmlFor="cmc-change-type">Change type</label>
            <select id="cmc-change-type" value={changeType} onChange={e => setChangeType(e.target.value)}>
              {CHANGE_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="cmc-field">
            <label htmlFor="cmc-change-desc">Describe the change</label>
            <textarea id="cmc-change-desc" value={description} required
                      placeholder="e.g. switch the active ingredient supplier from supplier A to supplier B"
                      onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="cmc-field">
            <label htmlFor="cmc-change-current">Current state (optional)</label>
            <input id="cmc-change-current" value={currentState}
                   onChange={e => setCurrentState(e.target.value)} />
          </div>
          <div className="cmc-field">
            <label htmlFor="cmc-change-proposed">Proposed state (optional)</label>
            <input id="cmc-change-proposed" value={proposedState}
                   onChange={e => setProposedState(e.target.value)} />
          </div>
          <fieldset className="cmc-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-300)', padding: 0 }}>Markets</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {MARKETS.map(m => (
                <label key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={markets.includes(m.id)} onChange={() => toggleMarket(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button className="bp-btn-primary" type="submit"
                    disabled={sim.isPending || !description.trim() || markets.length === 0}>
              {sim.isPending ? 'Simulating…' : 'Simulate change'}
            </button>
          </div>
        </form>
      </div>

      {sim.isError && <div style={{ marginTop: 14 }}><ErrorState message={sim.error?.message ?? 'Simulation failed. Check that the change service is available.'} /></div>}

      {result && (
        <div className="bp-card" style={{ marginTop: 14 }}>
          <div className="bp-card-head">
            <span>Impact analysis</span>
            <span className="bp-meta">
              {CHANGE_TYPES.find(c => c.id === changeType)?.label} · {markets.map(m => m.toUpperCase()).join(', ')}
            </span>
          </div>
          <div style={{ padding: 14 }}>
            <ResultView value={result.impactAnalysis ?? result} />
          </div>
        </div>
      )}

      {/* Deterministic SUPAC / variations classification — the citable companion
          to the AI narrative above (21 CFR 314.70 · SUPAC-IR/MR/SS · EC 1234/2008 · ICH Q12). */}
      <div className="bp-card" style={{ marginTop: 14, padding: 16 }}>
        <div className="bp-card-head" style={{ padding: 0, marginBottom: 12, border: 0 }}>
          <span>SUPAC / variations classifier</span>
          <span className="bp-meta">Deterministic · citable · no AI</span>
        </div>
        <div className="cmc-form">
          <div className="cmc-field">
            <label htmlFor="cmc-dosage-form">Dosage form family</label>
            <select
              id="cmc-dosage-form"
              value={dosageForm}
              onChange={e => setDosageForm(e.target.value as CmcDosageFormFamily)}
            >
              {DOSAGE_FORMS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div className="cmc-field">
            <label htmlFor="cmc-change-cat">Change category</label>
            <select
              id="cmc-change-cat"
              value={changeCat}
              onChange={e => setChangeCat(e.target.value as CmcChangeCategory)}
            >
              {CHANGE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={criticalStep} onChange={() => setCriticalStep(v => !v)} />
            Touches a critical step (release, sterilisation, …)
          </label>
          <div>
            <button
              className="bp-btn-tert"
              type="button"
              disabled={cls.isPending}
              onClick={() =>
                cls.mutate({
                  dosageFormFamily: dosageForm,
                  changeCategory: changeCat,
                  description: description.trim() || undefined,
                  touchesCriticalStep: criticalStep,
                })
              }
            >
              {cls.isPending ? 'Classifying…' : 'Classify (deterministic)'}
            </button>
          </div>
        </div>
      </div>

      {cls.isError && (
        <div style={{ marginTop: 14 }}>
          <ErrorState message="Classification failed. Check that the CMC service is available." />
        </div>
      )}

      {classification && (
        <div className="bp-card" style={{ marginTop: 14 }}>
          <div className="bp-card-head">
            <span>Variation classification</span>
            <span className="bp-meta">
              confidence {(classification.confidence * 100).toFixed(0)}% · ~{classification.estimatedTimelineDays} days
            </span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginBottom: 14 }}>
              <div>
                <div className="bp-meta">FDA reporting</div>
                <div style={{ fontWeight: 600 }}>{classification.fdaReportingCategory}</div>
              </div>
              <div>
                <div className="bp-meta">EMA variation</div>
                <div style={{ fontWeight: 600 }}>{classification.emaVariationCategory}</div>
              </div>
              <div>
                <div className="bp-meta">SUPAC tier</div>
                <div><span className={supacTierClass(classification.supacTier)}>{classification.supacTier}</span></div>
              </div>
              <div>
                <div className="bp-meta">Bioequivalence</div>
                <div style={{ fontWeight: 600 }}>{classification.bioequivalence}</div>
              </div>
            </div>

            {classification.impactedCtdSections.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="bp-meta" style={{ marginBottom: 4 }}>Impacted CTD sections</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {classification.impactedCtdSections.map((s, i) => <span key={i} className="bp-pill">{s}</span>)}
                </div>
              </div>
            )}

            {classification.validationRequirements.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="bp-meta" style={{ marginBottom: 4 }}>Validation / studies triggered</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {classification.validationRequirements.map((v, i) => <li key={i} className="bp-meta">{v}</li>)}
                </ul>
              </div>
            )}

            {classification.rationale.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="bp-meta" style={{ marginBottom: 4 }}>Rationale</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {classification.rationale.map((r, i) => <li key={i} className="bp-meta">{r}</li>)}
                </ul>
              </div>
            )}

            {classification.citations.length > 0 && (
              <div className="bp-meta" style={{ fontStyle: 'italic' }}>
                {classification.citations.join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
