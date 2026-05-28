// Stability program — live rows from GET /api/cmc/stability/:projectId.

import * as React from 'react';
import { useProjectStability } from '../../hooks/useCMC';
import type { CmcStabilityRow } from '../../services/cmcService';
import { Loading, ErrorState, Empty, NoProject } from './state';

function pick(row: CmcStabilityRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') return String(v);
  }
  return '—';
}

export function CmcStability({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const stability = useProjectStability(projectId);
  const rows = stability.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Stability program</h1>
          <div className="bp-meta">Studies, conditions and time points · ICH Q1A / Q1E</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Project shelf life from the long-term data with an ICH Q1E fit')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Stability studies</span>
          <span className="bp-meta">{rows.length} studies</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : stability.isLoading ? (
          <Loading label="Loading stability studies…" />
        ) : stability.isError ? (
          <ErrorState message="Could not load stability studies." />
        ) : rows.length === 0 ? (
          <Empty>No stability studies recorded for this project yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Study</th>
                <th>Material</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Proposed shelf life</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={(row.id as string) ?? i}>
                  <td style={{ fontWeight: 600 }}>{pick(row, ['study', 'study_id', 'name', 'protocol_name'])}</td>
                  <td>{pick(row, ['material', 'material_type', 'type'])}</td>
                  <td>{pick(row, ['condition', 'storage_condition', 'conditions'])}</td>
                  <td>{pick(row, ['status', 'state'])}</td>
                  <td>{pick(row, ['proposed_shelf_life', 'shelf_life', 'projected_shelf_life'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
