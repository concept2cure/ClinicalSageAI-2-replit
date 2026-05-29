// Translation coverage — live coverage + per-language detail for a selected
// document. Coverage from GET /api/mdx/labeling/:id/coverage; rows from
// GET /api/mdx/labeling/:id/translations.

import * as React from 'react';
import { useLabelingCoverage, useLabelingTranslations } from '../../hooks/useLabeling';
import { DocPicker } from './DocPicker';
import { Loading, ErrorState, Empty, NoProject, StatusChip, transStatusTone } from './state';

interface TranslationsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

function methodLabel(m: string | null): string {
  if (!m) return '—';
  return m.replace(/_/g, ' ');
}

export function LabelingTranslations({ projectId, onAskAna }: TranslationsProps) {
  const [docId, setDocId] = React.useState<number | null>(null);
  const coverage = useLabelingCoverage(docId);
  const translations = useLabelingTranslations(docId);
  const cov = coverage.data;
  const rows = translations.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Labeling</div>
          <h1 className="bp-title">Translation coverage</h1>
          <div className="bp-meta">
            {cov
              ? `${cov.approved}/${cov.totalTranslations} approved · ${cov.backTranslationVerified} back-translation verified`
              : 'Per-language status and back-translation verification'}
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('List every translation not yet approved and what each needs')}>
            Ask AnA
          </button>
        </div>
      </div>

      {!projectId ? (
        <div className="bp-card"><NoProject /></div>
      ) : (
        <>
          <DocPicker projectId={projectId} value={docId} onChange={setDocId} />
          <div className="bp-card">
            <div className="bp-card-head">
              <span>Translations</span>
              <span className="bp-meta">{rows.length} languages</span>
            </div>
            {docId == null ? (
              <Empty>Select a document to view its translations.</Empty>
            ) : translations.isLoading ? (
              <Loading label="Loading translations…" />
            ) : translations.isError ? (
              <ErrorState message="Could not load translations." />
            ) : rows.length === 0 ? (
              <Empty>No translations recorded for this document yet.</Empty>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Language</th>
                    <th>Method</th>
                    <th>Back-translation</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.language}</td>
                      <td className="lb-mut">{methodLabel(t.translation_method)}</td>
                      <td>
                        {t.back_translation_verified
                          ? <StatusChip tone="ok" label="Verified" />
                          : <span className="lb-mut">Not verified</span>}
                      </td>
                      <td><StatusChip tone={transStatusTone(t.status)} label={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
