// Labeling documents — live table from GET /api/mdx/labeling, program-scoped,
// with create and edit authoring. The form writes the exact camelCase keys the
// server reads (deviceName, docKind, version, status, language, region) and the
// document is scoped to the canonical project id via programId. POST creates,
// PATCH /:id edits.

import * as React from 'react';
import {
  useLabelingDocuments,
  useCreateLabelingDocument,
  useUpdateLabelingDocument,
} from '../../hooks/useLabeling';
import type {
  LabelingDoc,
  LabelingDocCreate,
  LabelingDocKind,
  LabelingDocStatus,
} from '../../services/labelingService';
import { DOC_KIND_LABEL } from '../data/nav';
import { LabelingIcon } from '../icons';
import { LabelingDialog } from './LabelingDialog';
import { Loading, ErrorState, Empty, NoProject, StatusChip, docStatusTone } from './state';

interface DocumentsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

const DOC_KINDS: LabelingDocKind[] = [
  'ifu', 'package_insert', 'patient_label', 'operator_manual', 'service_manual', 'quick_ref', 'box_label',
];
const DOC_STATUSES: LabelingDocStatus[] = ['draft', 'review', 'approved', 'effective', 'superseded'];
const REGIONS = ['us', 'eu', 'jp', 'global'] as const;

interface DocFormState {
  deviceName: string;
  docKind: LabelingDocKind;
  version: string;
  language: string;
  status: LabelingDocStatus;
  region: '' | 'us' | 'eu' | 'jp' | 'global';
}

function rowToForm(row: LabelingDoc | null): DocFormState {
  return {
    deviceName: row ? String(row.device_name ?? '') : '',
    docKind: (row?.doc_kind as LabelingDocKind) ?? 'ifu',
    version: row ? String(row.version ?? '') : '',
    language: row ? String(row.language ?? 'en') : 'en',
    status: (row?.status as LabelingDocStatus) ?? 'draft',
    region: (row?.region as DocFormState['region']) ?? '',
  };
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function DocumentDialog({
  projectId,
  editing,
  onClose,
}: {
  projectId: string;
  editing: LabelingDoc | null;
  onClose: () => void;
}) {
  const create = useCreateLabelingDocument();
  const update = useUpdateLabelingDocument();
  const isEdit = !!editing;
  const [form, setForm] = React.useState<DocFormState>(() => rowToForm(editing));
  const errId = React.useId();

  const set = <K extends keyof DocFormState>(k: K, v: DocFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.deviceName.trim().length > 0 && form.language.trim().length > 0;
  const pending = create.isPending || update.isPending;
  const error = (create.error || update.error) as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const base: Partial<LabelingDocCreate> = {
      deviceName: form.deviceName.trim(),
      docKind: form.docKind,
      version: form.version.trim() || undefined,
      status: form.status,
      language: form.language.trim(),
      region: form.region || null,
    };
    if (isEdit && editing) {
      await update.mutateAsync({ id: editing.id, patch: base });
    } else {
      await create.mutateAsync({ ...base, programId: projectId } as LabelingDocCreate);
    }
    onClose();
  };

  const formId = 'lb-doc-form';

  return (
    <LabelingDialog
      open
      busy={pending}
      title={isEdit ? 'Edit labeling document' : 'New labeling document'}
      subtitle="IFU, package insert, patient label, operator manual"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create document'}
          </button>
        </>
      }
    >
      <form id={formId} className="lb-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="lb-field">
          <label htmlFor="doc-name">Document name<span className="lb-req" aria-hidden="true">*</span></label>
          <input
            id="doc-name"
            required
            value={form.deviceName}
            onChange={(e) => set('deviceName', e.target.value)}
            placeholder="e.g. Acme infusion pump IFU"
          />
        </div>

        <div className="lb-field-row">
          <div className="lb-field">
            <label htmlFor="doc-kind">Document kind</label>
            <select id="doc-kind" value={form.docKind} onChange={(e) => set('docKind', e.target.value as LabelingDocKind)}>
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>{DOC_KIND_LABEL[k] ?? k}</option>
              ))}
            </select>
          </div>
          <div className="lb-field">
            <label htmlFor="doc-lang">Language<span className="lb-req" aria-hidden="true">*</span></label>
            <input
              id="doc-lang"
              required
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
              placeholder="e.g. en, de, ja"
            />
          </div>
        </div>

        <div className="lb-field-row">
          <div className="lb-field">
            <label htmlFor="doc-status">Status</label>
            <select id="doc-status" value={form.status} onChange={(e) => set('status', e.target.value as LabelingDocStatus)}>
              {DOC_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </div>
          <div className="lb-field">
            <label htmlFor="doc-region">Region</label>
            <select id="doc-region" value={form.region} onChange={(e) => set('region', e.target.value as DocFormState['region'])}>
              <option value="">No region</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="lb-field">
          <label htmlFor="doc-version">Version</label>
          <input
            id="doc-version"
            value={form.version}
            onChange={(e) => set('version', e.target.value)}
            placeholder="e.g. 1.0"
          />
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not save the document. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

export function LabelingDocuments({ projectId, onAskAna }: DocumentsProps) {
  const docs = useLabelingDocuments(projectId ? { programId: projectId } : {});
  const rows = docs.data ?? [];
  const [dialog, setDialog] = React.useState<{ editing: LabelingDoc | null } | null>(null);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Labeling</div>
          <h1 className="bp-title">Labeling documents</h1>
          <div className="bp-meta">IFU, package insert, patient label, operator manual</div>
        </div>
        <div className="bp-page-actions">
          <button
            className="bp-btn-tert"
            type="button"
            disabled={!projectId}
            onClick={() => setDialog({ editing: null })}
          >
            <LabelingIcon name="plus" /> New document
          </button>
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
                <th>Action</th>
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
                  <td>
                    <button className="bp-btn-tert" type="button" onClick={() => setDialog({ editing: d })}>
                      <LabelingIcon name="pen" size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && projectId && (
        <DocumentDialog
          projectId={projectId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
