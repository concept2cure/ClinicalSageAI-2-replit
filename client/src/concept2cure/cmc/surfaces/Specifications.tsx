// Specifications — live rows from GET /api/cmc/specifications/:projectId.
// The route returns raw quality_specifications rows; columns vary, so we
// surface the recognised CMC columns and fall back gracefully.

import * as React from 'react';
import { useProjectSpecifications } from '../../hooks/useCMC';
import type { CmcSpecRow } from '../../services/cmcService';
import { Loading, ErrorState, Empty, NoProject, StatusChip } from './state';

function pick(row: CmcSpecRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') return String(v);
  }
  return '—';
}

function statusTone(s: string): 'ok' | 'warn' | 'err' | 'dim' {
  const v = s.toLowerCase();
  if (v.includes('approv') || v.includes('effective')) return 'ok';
  if (v.includes('review')) return 'warn';
  if (v.includes('reject') || v.includes('fail')) return 'err';
  return 'dim';
}

export function CmcSpecifications({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const specs = useProjectSpecifications(projectId);
  const rows = specs.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Specifications</h1>
          <div className="bp-meta">Release and shelf-life limits · drug substance and drug product</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Flag any specification without a validated method')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Specification table</span>
          <span className="bp-meta">{rows.length} attributes</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : specs.isLoading ? (
          <Loading label="Loading specifications…" />
        ) : specs.isError ? (
          <ErrorState message="Could not load specifications." />
        ) : rows.length === 0 ? (
          <Empty>No specifications recorded for this project yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Material</th>
                <th>Method</th>
                <th>Release</th>
                <th>Shelf life</th>
                <th>ICH</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const status = pick(row, ['status', 'state']);
                return (
                  <tr key={(row.id as string) ?? i}>
                    <td style={{ fontWeight: 600 }}>{pick(row, ['attribute', 'name', 'test_name', 'attribute_name'])}</td>
                    <td>{pick(row, ['material', 'material_type', 'spec_type', 'type'])}</td>
                    <td>{pick(row, ['method', 'analytical_method', 'method_reference'])}</td>
                    <td>{pick(row, ['release', 'release_limit', 'release_acceptance'])}</td>
                    <td>{pick(row, ['shelf', 'shelf_life', 'shelf_life_limit'])}</td>
                    <td className="cmc-mono">{pick(row, ['ich', 'ich_reference', 'regulatory_basis'])}</td>
                    <td>{status === '—' ? '—' : <StatusChip tone={statusTone(status)} label={status} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
