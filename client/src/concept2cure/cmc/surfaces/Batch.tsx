// Batch records — live rows from GET /api/cmc/batch-records/:projectId.
// Each releasable batch carries a governed "Release batch" action gated by the
// shared 21 CFR Part 11 e-signature modal (meaning = release). On a signed
// release the row's disposition updates from the invalidated query.

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectBatchRecords, useBatchRelease, cmcQueryKeys } from '../../hooks/useCMC';
import { EsignModal, type EsigSignedManifest } from '../../_shared/components';
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
  if (v.includes('released') || v.includes('completed')) return 'ok';
  if (v.includes('investigation') || v.includes('pending') || v.includes('conditional')) return 'warn';
  if (v.includes('reject')) return 'err';
  return 'dim';
}

/** A batch is releasable until it has already reached a released/rejected state. */
function isReleasable(status: string): boolean {
  const v = status.toLowerCase();
  return !(v.includes('released') || v.includes('completed') || v.includes('reject'));
}

export function CmcBatch({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const batches = useProjectBatchRecords(projectId);
  const release = useBatchRelease();
  const queryClient = useQueryClient();
  const rows = batches.data ?? [];

  const [signing, setSigning] = React.useState<{ id: string; label: string } | null>(null);

  const onSign = React.useCallback(
    async ({ reason }: { reason: string }): Promise<EsigSignedManifest> => {
      if (!signing) throw new Error('No batch selected for release.');
      // Re-auth has already passed in the modal. Run the real governed mutation.
      await release.mutateAsync({
        id: signing.id,
        decision: 'approved',
        releaseTesting: {},
        releasedBy: 'You',
        comments: reason,
      });
      // Reflect the new disposition on this project's batch list.
      if (projectId) {
        await queryClient.invalidateQueries({ queryKey: cmcQueryKeys.projectBatches(projectId) });
      }
      return { meaning: 'release', reason, signedAt: new Date().toISOString() };
    },
    [signing, release, projectId, queryClient],
  );

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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const status = pick(row, ['status', 'disposition', 'state', 'release_status']);
                const dev = pick(row, ['deviations', 'deviation_count', 'devs']);
                const batchLabel = pick(row, ['batch_number', 'batch', 'batch_id', 'lot_number']);
                const id = (row.id as string) ?? String(i);
                const releasable = status !== '—' ? isReleasable(status) : true;
                return (
                  <tr key={id}>
                    <td style={{ fontWeight: 600 }}>{batchLabel}</td>
                    <td>{pick(row, ['stage', 'batch_stage', 'material_type', 'type'])}</td>
                    <td>{pick(row, ['manufacture_date', 'manufacturing_date', 'created_at'])}</td>
                    <td>{dev}</td>
                    <td>{status === '—' ? '—' : <StatusChip tone={statusTone(status)} label={status} />}</td>
                    <td>
                      {releasable ? (
                        <button
                          className="bp-btn-tert"
                          type="button"
                          onClick={() => setSigning({ id, label: batchLabel })}
                        >
                          Release batch
                        </button>
                      ) : (
                        <span className="bp-meta">Disposition set</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <EsignModal
        open={!!signing}
        action="Release batch"
        target={signing ? `Batch ${signing.label}` : ''}
        targetMeta="Records the disposition and signs the release per 21 CFR Part 11"
        defaultMeaning="release"
        onClose={() => setSigning(null)}
        onSign={onSign}
      />
    </div>
  );
}
