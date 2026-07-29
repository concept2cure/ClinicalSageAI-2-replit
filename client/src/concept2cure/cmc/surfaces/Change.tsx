// Change simulator — describe a CMC change, submit, render the live filing
// path / impact returned by POST /api/cmc/change-impact-simulator/simulate.

import * as React from 'react';
import { useChangeImpactSimulation } from '../../hooks/useCMC';
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

export function CmcChange() {
  const sim = useChangeImpactSimulation();
  const [changeType, setChangeType] = React.useState('api_supplier_change');
  const [description, setDescription] = React.useState('');
  const [markets, setMarkets] = React.useState<string[]>(['fda']);
  const [currentState, setCurrentState] = React.useState('');
  const [proposedState, setProposedState] = React.useState('');

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
    </div>
  );
}
