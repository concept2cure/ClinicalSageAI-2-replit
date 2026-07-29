// Blueprint generator — surfaces live QbD analysis (CQAs / CPPs) for the
// selected project and a generate action wired to the blueprint endpoint.

import * as React from 'react';
import { useQbdAnalysis, useGenerateBlueprint } from '../../hooks/useCMC';
import { Loading, ErrorState, Empty, NoProject, DataTable, ResultView } from './state';

// §3.2 sections that the blueprint generator can compose.
const SECTIONS: Array<{ key: string; label: string }> = [
  { key: 's.2.2', label: 'Description of manufacturing process' },
  { key: 's.4.1', label: 'Specification (drug substance)' },
  { key: 's.7.1', label: 'Stability summary (drug substance)' },
  { key: 'p.5.1', label: 'Specification (drug product)' },
  { key: 'p.8.1', label: 'Stability summary and conclusion' },
];

export function CmcBlueprint({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const qbd = useQbdAnalysis(projectId);
  const gen = useGenerateBlueprint();
  const [selected, setSelected] = React.useState<string[]>([]);

  const toggle = (k: string) =>
    setSelected(prev => (prev.includes(k) ? prev.filter(s => s !== k) : [...prev, k]));

  const cqas = (qbd.data?.cqas as Array<Record<string, unknown>> | undefined) ?? [];
  const cpps = (qbd.data?.cpps as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Blueprint generator</h1>
          <div className="bp-meta">Compose §3.2 sections from your quality data</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Show which section 3.2 sections are ready to generate')}>
            Ask AnA
          </button>
        </div>
      </div>

      {/* Sections to compose */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Sections to compose</span>
          <span className="bp-meta">{selected.length} selected</span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SECTIONS.map(s => (
            <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <input type="checkbox" checked={selected.includes(s.key)} onChange={() => toggle(s.key)} />
              <span className="cmc-sec-key">§3.2.{s.key.toUpperCase()}</span>
              <span>{s.label}</span>
            </label>
          ))}
          <div>
            <button className="bp-btn-primary" type="button"
                    disabled={!projectId || selected.length === 0 || gen.isPending}
                    onClick={() => projectId && gen.mutate({ projectId, sections: selected })}>
              {gen.isPending ? 'Generating…' : 'Generate blueprint'}
            </button>
          </div>
          {gen.isError && <ErrorState message={gen.error?.message ?? 'Blueprint generation failed.'} />}
          {gen.data != null && (
            <div style={{ marginTop: 4 }}>
              <div className="bp-meta" style={{ marginBottom: 8 }}>Blueprint generated.</div>
              <ResultView value={gen.data} />
            </div>
          )}
        </div>
      </div>

      {/* QbD analysis */}
      <div className="bp-card" style={{ marginTop: 14 }}>
        <div className="bp-card-head">
          <span>Quality by design</span>
          <span className="bp-meta">{cqas.length} CQAs · {cpps.length} CPPs</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : qbd.isLoading ? (
          <Loading label="Analysing quality data…" />
        ) : qbd.isError ? (
          <ErrorState message="Could not analyse the project's quality data." />
        ) : cqas.length === 0 && cpps.length === 0 ? (
          <Empty>No critical quality attributes or process parameters derived yet.</Empty>
        ) : (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {cqas.length > 0 && (
              <div>
                <div className="bp-meta" style={{ marginBottom: 6 }}>Critical quality attributes</div>
                <DataTable rows={cqas} />
              </div>
            )}
            {cpps.length > 0 && (
              <div>
                <div className="bp-meta" style={{ marginBottom: 6 }}>Critical process parameters</div>
                <DataTable rows={cpps} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
