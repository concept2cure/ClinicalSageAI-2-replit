// Labeling overview — AnA-first composer + document grid, all live.
// Documents come from GET /api/mdx/labeling (program-scoped). Coverage for the
// active document comes from GET /api/mdx/labeling/:id/coverage.

import * as React from 'react';
import { useLabelingDocuments, useLabelingCoverage } from '../../hooks/useLabeling';
import { DOC_KIND_LABEL, LABELING_SUGGESTIONS } from '../data/nav';
import { LabelingIcon } from '../icons';
import { Loading, ErrorState, Empty, NoProject, StatusChip, docStatusTone } from './state';

interface OverviewProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

export function LabelingOverview({ projectId, onAskAna }: OverviewProps) {
  const docs = useLabelingDocuments(projectId ? { programId: projectId } : {});
  const rows = docs.data ?? [];

  // Coverage for the first document — a representative read against the live
  // coverage endpoint.
  const activeId = rows.length > 0 ? rows[0].id : null;
  const coverage = useLabelingCoverage(activeId);
  const cov = coverage.data;

  const [composer, setComposer] = React.useState('');
  const send = (t: string) => {
    const v = t.trim();
    if (v) onAskAna(v);
    setComposer('');
  };

  const approvedCount = cov ? cov.approved : 0;
  const totalCount = cov ? cov.totalTranslations : 0;

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Labeling · IFU · ISO 15223-1</div>
          <h1 className="bp-title">Labeling overview</h1>
          <div className="bp-meta">
            {projectId
              ? `${rows.length} labeling documents`
              : 'Select a project to scope labeling documents'}
            {cov ? ` · ${approvedCount}/${totalCount} translations approved on the lead document` : ''}
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Reconcile the IFU against the cleared indications for use')}>
            Reconcile IFU with AnA
          </button>
        </div>
      </div>

      {/* AnA composer */}
      <form className="lb-composer" onSubmit={e => { e.preventDefault(); send(composer); }}>
        <label htmlFor="lb-composer-input" className="lb-sr-only">Ask AnA about labeling</label>
        <input id="lb-composer-input" type="text"
               placeholder="Ask AnA about an IFU, label or translation…"
               value={composer} onChange={e => setComposer(e.target.value)} />
        <button className="bp-btn-primary" type="submit" disabled={!composer.trim()} aria-label="Send">
          <LabelingIcon name="arrowRight" />
        </button>
      </form>

      <div className="lb-starters">
        {LABELING_SUGGESTIONS.overview.map((s, i) => (
          <button key={i} className="lb-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="lb-starter-ico"><LabelingIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Labeling documents</span>
          <span className="bp-meta">{rows.length} docs</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : docs.isLoading ? (
          <Loading label="Loading labeling documents…" />
        ) : docs.isError ? (
          <ErrorState message="Could not load labeling documents." />
        ) : rows.length === 0 ? (
          <Empty>No labeling documents recorded for this project yet.</Empty>
        ) : (
          <div className="lb-docs">
            {rows.map(d => {
              const kind = DOC_KIND_LABEL[d.doc_kind] ?? d.doc_kind;
              return (
                <button key={d.id} className="lb-doc" type="button"
                        onClick={() => onAskAna(`Open the ${kind} "${d.device_name}" and show translation coverage`)}>
                  <div className="lb-doc-top">
                    <span className="lb-doc-kind">{kind}</span>
                    <StatusChip tone={docStatusTone(d.status)} label={d.status} />
                  </div>
                  <div className="lb-doc-title">{d.device_name}</div>
                  <div className="lb-doc-meta">
                    {d.version} · {d.language}{d.region ? ` · ${d.region.toUpperCase()}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
