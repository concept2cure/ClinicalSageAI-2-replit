// Specifications — live rows from GET /api/cmc/specifications/:projectId, with
// create and edit authoring. The route returns raw quality_specifications rows;
// columns vary, so we surface the recognised CMC columns and fall back
// gracefully. The form writes the exact columns the server reads
// (material_type, material_name, test_parameters, acceptance_criteria,
// test_methods, justification, regulatory_basis, approval_status).

import * as React from 'react';
import {
  useProjectSpecifications,
  useCreateSpecification,
  useUpdateSpecification,
  useApproveSpecification,
} from '../../hooks/useCMC';
import type { CmcSpecRow, SpecificationInput, SpecificationPatch } from '../../services/cmcService';
import { CmcIcon } from '../icons';
import { CmcDialog } from './CmcDialog';
import { EsignModal, type EsigSignedManifest } from '../../_shared/components';
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

// Editable statuses exclude 'approved'/'effective': approval is a governed
// e-signature action reached only via "Approve specification" (POST
// /specifications/:id/approve), never through this edit form.
const APPROVAL_STATES = ['draft', 'review', 'superseded'] as const;

interface SpecFormState {
  materialName: string;
  materialType: string;
  testMethods: string;
  acceptanceCriteria: string;
  testParameters: string;
  regulatoryBasis: string;
  justification: string;
  approvalStatus: string;
}

function rowToForm(row: CmcSpecRow | null): SpecFormState {
  return {
    materialName: row ? String(row.material_name ?? row.name ?? '') : '',
    materialType: row ? String(row.material_type ?? '') : '',
    testMethods: row ? String(row.test_methods ?? '') : '',
    acceptanceCriteria: row ? String(row.acceptance_criteria ?? '') : '',
    testParameters: row ? String(row.test_parameters ?? '') : '',
    regulatoryBasis: row ? String(row.regulatory_basis ?? '') : '',
    justification: row ? String(row.justification ?? '') : '',
    approvalStatus: row ? String(row.approval_status ?? row.status ?? 'draft') : 'draft',
  };
}

function SpecificationDialog({
  projectId,
  editing,
  onClose,
}: {
  projectId: string;
  editing: CmcSpecRow | null;
  onClose: () => void;
}) {
  const create = useCreateSpecification();
  const update = useUpdateSpecification();
  const isEdit = !!editing;
  const [form, setForm] = React.useState<SpecFormState>(() => rowToForm(editing));
  const errId = React.useId();

  const set = <K extends keyof SpecFormState>(k: K, v: SpecFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.materialName.trim().length > 0 && form.materialType.trim().length > 0;
  const pending = create.isPending || update.isPending;
  const error = (create.error || update.error) as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    if (isEdit && editing) {
      const patch: SpecificationPatch = {
        materialName: form.materialName.trim(),
        materialType: form.materialType.trim(),
        testMethods: form.testMethods.trim() || null,
        acceptanceCriteria: form.acceptanceCriteria.trim() || null,
        testParameters: form.testParameters.trim() || null,
        regulatoryBasis: form.regulatoryBasis.trim() || null,
        justification: form.justification.trim() || null,
        approvalStatus: form.approvalStatus,
      };
      await update.mutateAsync({ id: String(editing.id), data: patch, projectId });
    } else {
      const body: SpecificationInput = {
        projectId,
        materialName: form.materialName.trim(),
        materialType: form.materialType.trim(),
        testMethods: form.testMethods.trim() || null,
        acceptanceCriteria: form.acceptanceCriteria.trim() || null,
        testParameters: form.testParameters.trim() || null,
        regulatoryBasis: form.regulatoryBasis.trim() || null,
        justification: form.justification.trim() || null,
        approvalStatus: form.approvalStatus,
      };
      await create.mutateAsync(body);
    }
    onClose();
  };

  const formId = 'cmc-spec-form';

  return (
    <CmcDialog
      open
      busy={pending}
      title={isEdit ? 'Edit specification' : 'New specification'}
      subtitle="Release and shelf-life limits for a drug substance or drug product"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create specification'}
          </button>
        </>
      }
    >
      <form id={formId} className="cmc-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="spec-name">Material name<span className="cmc-req" aria-hidden="true">*</span></label>
            <input
              id="spec-name"
              required
              value={form.materialName}
              onChange={(e) => set('materialName', e.target.value)}
              placeholder="e.g. Drug substance API"
            />
          </div>
          <div className="cmc-field">
            <label htmlFor="spec-type">Material type<span className="cmc-req" aria-hidden="true">*</span></label>
            <input
              id="spec-type"
              required
              value={form.materialType}
              onChange={(e) => set('materialType', e.target.value)}
              placeholder="e.g. drug substance, drug product"
            />
          </div>
        </div>

        <div className="cmc-field">
          <label htmlFor="spec-methods">Analytical method</label>
          <input
            id="spec-methods"
            value={form.testMethods}
            onChange={(e) => set('testMethods', e.target.value)}
            placeholder="e.g. HPLC, USP 621"
          />
        </div>

        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="spec-criteria">Acceptance criteria</label>
            <input
              id="spec-criteria"
              value={form.acceptanceCriteria}
              onChange={(e) => set('acceptanceCriteria', e.target.value)}
              placeholder="e.g. 95.0 to 105.0 percent"
            />
          </div>
          <div className="cmc-field">
            <label htmlFor="spec-params">Test parameters</label>
            <input
              id="spec-params"
              value={form.testParameters}
              onChange={(e) => set('testParameters', e.target.value)}
              placeholder="e.g. assay, related substances"
            />
          </div>
        </div>

        <div className="cmc-field-row">
          <div className="cmc-field">
            <label htmlFor="spec-ich">ICH reference</label>
            <input
              id="spec-ich"
              value={form.regulatoryBasis}
              onChange={(e) => set('regulatoryBasis', e.target.value)}
              placeholder="e.g. ICH Q6A"
            />
          </div>
          <div className="cmc-field">
            <label htmlFor="spec-status">Status</label>
            <select id="spec-status" value={form.approvalStatus} onChange={(e) => set('approvalStatus', e.target.value)}>
              {APPROVAL_STATES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="cmc-field">
          <label htmlFor="spec-just">Justification</label>
          <textarea
            id="spec-just"
            value={form.justification}
            onChange={(e) => set('justification', e.target.value)}
            placeholder="Rationale for the limits and method"
          />
        </div>

        {error && (
          <div id={errId} className="cmc-form-error" role="alert">
            <CmcIcon name="alertCircle" size={14} />
            Could not save the specification. {error.message}
          </div>
        )}
      </form>
    </CmcDialog>
  );
}

interface SpecSigningTarget {
  id: string;
  label: string;
  trigger: HTMLButtonElement | null;
}

export function CmcSpecifications({ projectId, onAskAna }: { projectId: string | null; onAskAna: (t: string) => void }) {
  const specs = useProjectSpecifications(projectId);
  const approve = useApproveSpecification();
  const rows = specs.data ?? [];
  const [dialog, setDialog] = React.useState<{ editing: CmcSpecRow | null } | null>(null);

  // Governed approval — routes through the mutation-primitives ledger via
  // POST /api/cmc/specifications/:id/approve (high-risk sign). The server
  // re-verifies the signer and writes audit_logs + c2c_ana_actions.
  const [signing, setSigning] = React.useState<SpecSigningTarget | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  const onSign = React.useCallback(
    async ({ reason, meaning, password, totp }: {
      reason: string;
      meaning: EsigSignedManifest['meaning'];
      password: string;
      totp?: string;
    }): Promise<EsigSignedManifest> => {
      if (!signing) throw new Error('No specification selected for approval.');
      await approve.mutateAsync({
        id: signing.id,
        reason,
        reauth: { password, totp },
        projectId: projectId ?? undefined,
      });
      restoreFocusRef.current = null;
      return { meaning, reason, signedAt: new Date().toISOString() };
    },
    [signing, approve, projectId],
  );

  const closeSigning = () => {
    const trigger = signing?.trigger ?? null;
    setSigning(null);
    const target = trigger && document.body.contains(trigger) ? trigger : restoreFocusRef.current;
    restoreFocusRef.current = null;
    window.setTimeout(() => target?.focus?.(), 0);
  };

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">CMC · Module 3</div>
          <h1 className="bp-title">Specifications</h1>
          <div className="bp-meta">Release and shelf-life limits · drug substance and drug product</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId}
            onClick={() => setDialog({ editing: null })}
          >
            <CmcIcon name="plus" /> New specification
          </button>
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const status = pick(row, ['approval_status', 'status', 'state']);
                const approved = status.toLowerCase().includes('approv') || status.toLowerCase().includes('effective');
                const name = pick(row, ['material_name', 'attribute', 'name', 'test_name', 'attribute_name']);
                const specId = String(row.id ?? '');
                return (
                  <tr key={(row.id as string) ?? i}>
                    <td style={{ fontWeight: 600 }}>{name}</td>
                    <td>{pick(row, ['material_type', 'material', 'spec_type', 'type'])}</td>
                    <td>{pick(row, ['test_methods', 'method', 'analytical_method', 'method_reference'])}</td>
                    <td>{pick(row, ['acceptance_criteria', 'release', 'release_limit', 'release_acceptance'])}</td>
                    <td>{pick(row, ['shelf', 'shelf_life', 'shelf_life_limit'])}</td>
                    <td className="cmc-mono">{pick(row, ['regulatory_basis', 'ich', 'ich_reference'])}</td>
                    <td>{status === '—' ? '—' : <StatusChip tone={statusTone(status)} label={status} />}</td>
                    <td>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          className="bp-btn-tert"
                          type="button"
                          aria-label={`Edit specification — ${name}`}
                          onClick={() => setDialog({ editing: row })}
                        >
                          <CmcIcon name="pen" size={14} /> Edit
                        </button>
                        {!approved && specId !== '' && (
                          <button
                            className="bp-btn-tert"
                            type="button"
                            aria-label={`Approve specification — ${name}`}
                            onClick={(e) =>
                              setSigning({ id: specId, label: name === '—' ? `Specification ${specId}` : name, trigger: e.currentTarget })
                            }
                          >
                            <CmcIcon name="shield" size={14} /> Approve specification
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialog && projectId && (
        <SpecificationDialog
          projectId={projectId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
        />
      )}

      <EsignModal
        open={!!signing}
        action="Approve specification"
        target={signing?.label ?? ''}
        targetMeta="Signs the specification approval per 21 CFR Part 11 and sets its status to approved"
        defaultMeaning="approval"
        onClose={closeSigning}
        onSign={onSign}
      />
    </div>
  );
}
