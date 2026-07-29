// Global compliance — transform Module 3 content for target markets and show
// the live per-market readiness returned by POST /api/cmc/global-compliance/transform.

import * as React from 'react';
import { useGlobalCompliance } from '../../hooks/useCMC';
import { ErrorState, ResultView } from './state';

const TARGETS: Array<{ id: string; label: string }> = [
  { id: 'fda', label: 'FDA' },
  { id: 'ema', label: 'EMA' },
  { id: 'pmda', label: 'PMDA' },
  { id: 'nmpa', label: 'NMPA' },
  { id: 'health_canada', label: 'Health Canada' },
  { id: 'uk_mhra', label: 'UK MHRA' },
];

export function CmcGlobal({ onAskAna }: { onAskAna: (t: string) => void }) {
  const compliance = useGlobalCompliance();
  const [documentType, setDocumentType] = React.useState('module_3');
  const [content, setContent] = React.useState('');
  const [baseRegion, setBaseRegion] = React.useState('ich');
  const [targets, setTargets] = React.useState<string[]>(['fda', 'ema']);

  const toggle = (id: string) =>
    setTargets(prev => (prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || targets.length === 0) return;
    compliance.mutate({
      documentType,
      content: content.trim(),
      baseRegion,
      targetRegions: targets,
    });
  };

  const result = compliance.data as Record<string, unknown> | undefined;
  const transformed = result?.transformedContent as Record<string, { content?: string; note?: string }> | undefined;

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Global compliance</h1>
          <div className="bp-meta">Transform Module 3 content across markets and surface regional gaps</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Compare FDA, EMA and PMDA readiness for this dossier')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card" style={{ padding: 16 }}>
        <form className="cmc-form" onSubmit={onSubmit}>
          <div className="cmc-field">
            <label htmlFor="cmc-gc-type">Document type</label>
            <input id="cmc-gc-type" value={documentType} onChange={e => setDocumentType(e.target.value)} />
          </div>
          <div className="cmc-field">
            <label htmlFor="cmc-gc-base">Base region</label>
            <select id="cmc-gc-base" value={baseRegion} onChange={e => setBaseRegion(e.target.value)}>
              {['ich', 'fda', 'ema', 'pmda', 'other'].map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="cmc-field">
            <label htmlFor="cmc-gc-content">Content to transform</label>
            <textarea id="cmc-gc-content" value={content} required
                      placeholder="Paste the Module 3 section content to assess across markets…"
                      onChange={e => setContent(e.target.value)} />
          </div>
          <fieldset className="cmc-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-300)', padding: 0 }}>Target markets</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {TARGETS.map(t => (
                <label key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={targets.includes(t.id)} onChange={() => toggle(t.id)} />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button className="bp-btn-primary" type="submit"
                    disabled={compliance.isPending || !content.trim() || targets.length === 0}>
              {compliance.isPending ? 'Checking…' : 'Check global compliance'}
            </button>
          </div>
        </form>
      </div>

      {compliance.isError && <div style={{ marginTop: 14 }}><ErrorState message={compliance.error?.message ?? 'Compliance check failed. Check that the global-compliance service is available.'} /></div>}

      {result && (
        <div className="bp-card" style={{ marginTop: 14 }}>
          <div className="bp-card-head"><span>Per-market transformation</span></div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {transformed ? (
              Object.entries(transformed).map(([region, val]) => (
                <section key={region}>
                  <h2 className="cmc-result-region">{region.toUpperCase()}</h2>
                  <ResultView value={val?.content ?? val} />
                  {val?.note && <div className="bp-meta" style={{ marginTop: 6 }}>{val.note}</div>}
                </section>
              ))
            ) : (
              <ResultView value={result} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
