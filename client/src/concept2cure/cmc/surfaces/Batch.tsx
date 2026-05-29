// Batch records — live rows from GET /api/cmc/batch-records/:projectId.
// Each releasable batch carries a governed "Release batch" action gated by the
// shared 21 CFR Part 11 e-signature modal (meaning = release). On a signed
// release the row's disposition updates from the invalidated query.

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectBatchRecords, useBatchRelease, useCreateBatchRecord, cmcQueryKeys } from '../../hooks/useCMC';
import { EsignModal, type EsigSignedManifest } from '../../_shared/components';
import type { CmcBatchRow, BatchRecordInput } from '../../services/cmcService';
import { CmcIcon } from '../icons';
import { CmcDialog } from './CmcDialog';
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

interface BatchFormState {
  batchNumber: string;
  productName: string;
  batchSize: string;
  manufacturingSite: string;
  manufacturingDate: string;
  expiryDate: string;
  status: string;
}

const BATCH_STATES = ['in-progress', 'pending-release', 'released', 'rejected'] as const;

function NewBatchDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const create = useCreateBatchRecord();
  const [form, setForm] = React.useState<BatchFormState>({
    batchNumber: '',
    productName: '',
    batchSize: '',
    manufacturingSite: '',
    manufacturingDate: '',
    expiryDate: '',
    status: 'in-progress',
  });
  const errId = React.useId();
  const set = <K extends keyof BatchFormState>(k: K, v: BatchFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.batchNumber.trim().length > 0 && form.productName.trim().length > 0;
  const pending = create.isPending;
  const error = create.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: BatchRecordInput = {
      projectId,
      batchNumber: form.batchNumber.trim(),
      productName: form.productName.trim(),
      batchSize: form.batchSize.trim() || undefined,
      manufacturingSite: form.manufacturingSite.trim() || undefined,
      manufacturingDate: form.manufacturingDate || undefined,
      expiryDate: form.expiryDate || undefined,
      status: form.status,
    };
    await create.mutateAsync(body);
    onClose();
  };

  const formId = 'cmc-batch-form';
  return (
    <CmcDialog
      open
      busy={pending}
      title="New batch record"
      subtitle="Manufacturing batch · disposition is set later via a signed release"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? 'Creating…' : 'Create batch record'}
          </button>
        </>
      }
    >
      <form id={formId} className="cmc-form" onSubmit={onSubmit}>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="batch-num">Batch number<span className="cmc-req" aria-hidden="true">*</span></label>
            <input id="batch-num" required value={form.batchNumber} onChange={(e) => set('batchNumber', e.target.value)} placeholder="e.g. LOT-2026-014" />
          </div>
          <div className="cmc-field">
            <label htmlFor="batch-prod">Product name<span className="cmc-req" aria-hidden="true">*</span></label>
            <input id="batch-prod" required value={form.productName} onChange={(e) => set('productName', e.target.value)} placeholder="e.g. Drug product tablets" />
          </div>
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="batch-size">Batch size</label>
            <input id="batch-size" value={form.batchSize} onChange={(e) => set('batchSize', e.target.value)} placeholder="e.g. 100,000 units" />
          </div>
          <div className="cmc-field">
            <label htmlFor="batch-site">Manufacturing site</label>
            <input id="batch-site" value={form.manufacturingSite} onChange={(e) => set('manufacturingSite', e.target.value)} placeholder="e.g. Site A" />
          </div>
        </div>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="batch-mfg">Manufacturing date</label>
            <input id="batch-mfg" type="date" value={form.manufacturingDate} onChange={(e) => set('manufacturingDate', e.target.value)} />
          </div>
          <div className="cmc-field">
            <label htmlFor="batch-exp">Expiry date</label>
            <input id="batch-exp" type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
          </div>
        </div>
        <div className="cmc-field">
          <label htmlFor="batch-status">Status</label>
          <select id="batch-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {BATCH_STATES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        {error && (
          <div id={errId} className="cmc-form-error" role="alert">
            <CmcIcon name="alertCircle" size={14} />
            Could not create the batch record. {error.message}
          </div>
        )}
      </form>
    </CmcDialog>
  );
}

export function CmcBatch({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const batches = useProjectBatchRecords(projectId);
  const release = useBatchRelease();
  const queryClient = useQueryClient();
  const rows = batches.data ?? [];

  const [signing, setSigning] = React.useState<{ id: string; label: string } | null>(null);
  const [newBatch, setNewBatch] = React.useState(false);

  const onSign = React.useCallback(
    async ({ reason, password, totp }: {
      reason: string;
      password: string;
      totp?: string;
    }): Promise<EsigSignedManifest> => {
      if (!signing) throw new Error('No batch selected for release.');
      // Re-auth credentials are forwarded so the server re-verifies the signer
      // inside the same governed transaction (audit_logs + c2c_ana_actions).
      await release.mutateAsync({
        id: signing.id,
        decision: 'approved',
        releaseTesting: {},
        releasedBy: 'You',
        comments: reason,
        reason,
        reauth: { password, totp },
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
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId}
            onClick={() => setNewBatch(true)}
          >
            <CmcIcon name="plus" /> New batch record
          </button>
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

      {newBatch && projectId && (
        <NewBatchDialog projectId={projectId} onClose={() => setNewBatch(false)} />
      )}

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
