// Labeling documents — live table from GET /api/mdx/labeling, program-scoped.

import * as React from 'react';
import { useLabelingDocuments } from '../../hooks/useLabeling';
import { DOC_KIND_LABEL } from '../data/nav';
import { Loading, ErrorState, Empty, NoProject, StatusChip, docStatusTone } from './state';

interface DocumentsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

export function LabelingDocuments({ projectId, onAskAna }: DocumentsProps) {
  const docs = useLabelingDocuments(projectId ? { programId: projectId } : {});
  const rows = docs.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Labeling</div>
          <h1 className="bp-title">Labeling documents</h1>
          <div className="bp-meta">IFU, package insert, patient label, operator manual</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('List every labeling document still in draft')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Documents</span>
          <span className="bp-meta">{rows.length} documents</span>
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
          <table className="bp-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Kind</th>
                <th>Version</th>
                <th>Language</th>
                <th>Region</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.device_name}</td>
                  <td>{DOC_KIND_LABEL[d.doc_kind] ?? d.doc_kind}</td>
                  <td className="lb-mono">{d.version}</td>
                  <td>{d.language}</td>
                  <td>{d.region ? d.region.toUpperCase() : '—'}</td>
                  <td><StatusChip tone={docStatusTone(d.status)} label={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
