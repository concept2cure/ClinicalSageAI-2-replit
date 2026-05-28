// Batch records — live rows from GET /api/cmc/batch-records/:projectId.

import * as React from 'react';
import { useProjectBatchRecords } from '../../hooks/useCMC';
import type { CmcBatchRow } from '../../services/cmcService';
import { Loading, ErrorState, Empty, NoProject, StatusChip } from './state';

function pick(row: CmcBatchRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== '') return String(v);
  }
  return '—';
}

function statusTone(s: string): 'ok' | 'warn' | 'err' | 'dim' {
  const v = s.toLowerCase();
  if (v.includes('released')) return 'ok';
  if (v.includes('investigation') || v.includes('pending')) return 'warn';
  if (v.includes('reject')) return 'err';
  return 'dim';
}

export function CmcBatch({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const batches = useProjectBatchRecords(projectId);
  const rows = batches.data ?? [];

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Batch records</h1>
          <div className="bp-meta">Manufacturing batches with deviations and disposition</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Summarize deviations across the last 10 batches')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Batches</span>
          <span className="bp-meta">{rows.length} records</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : batches.isLoading ? (
          <Loading label="Loading batch records…" />
        ) : batches.isError ? (
          <ErrorState message="Could not load batch records." />
        ) : rows.length === 0 ? (
          <Empty>No batch records recorded for this project yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Stage</th>
                <th>Manufacture date</th>
                <th>Deviations</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const status = pick(row, ['status', 'disposition', 'state']);
                const dev = pick(row, ['deviations', 'deviation_count', 'devs']);
                return (
                  <tr key={(row.id as string) ?? i}>
                    <td style={{ fontWeight: 600 }}>{pick(row, ['batch_number', 'batch', 'batch_id', 'lot_number'])}</td>
                    <td>{pick(row, ['stage', 'batch_stage', 'material_type', 'type'])}</td>
                    <td>{pick(row, ['manufacture_date', 'manufacturing_date', 'created_at'])}</td>
                    <td>{dev}</td>
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
