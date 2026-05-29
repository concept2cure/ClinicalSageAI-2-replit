// ISO 15223-1 symbols — live symbol glossary for a selected document.
// Rows from GET /api/mdx/labeling/:id/symbols.

import * as React from 'react';
import { useLabelingSymbols } from '../../hooks/useLabeling';
import { DocPicker } from './DocPicker';
import { Loading, ErrorState, Empty, NoProject } from './state';

interface SymbolsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

export function LabelingSymbols({ projectId, onAskAna }: SymbolsProps) {
  const [docId, setDocId] = React.useState<number | null>(null);
  const symbols = useLabelingSymbols(docId);
  const rows = symbols.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Labeling · ISO 15223-1</div>
          <h1 className="bp-title">ISO 15223-1 symbols</h1>
          <div className="bp-meta">Symbols declared on the selected label, with the standard that requires each</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Verify the symbol set against ISO 15223-1 for this label')}>
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
              <span>Symbols</span>
              <span className="bp-meta">{rows.length} on this label</span>
            </div>
            {docId == null ? (
              <Empty>Select a document to view its symbols.</Empty>
            ) : symbols.isLoading ? (
              <Loading label="Loading symbols…" />
            ) : symbols.isError ? (
              <ErrorState message="Could not load symbols." />
            ) : rows.length === 0 ? (
              <Empty>No symbols recorded for this document yet.</Empty>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Symbol</th>
                    <th>Required by</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.id}>
                      <td className="lb-mono">{s.symbol_code}</td>
                      <td style={{ fontWeight: 500 }}>{s.symbol_name}</td>
                      <td className="lb-mut">
                        {s.required_by && s.required_by.length > 0 ? s.required_by.join(', ') : '—'}
                      </td>
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
