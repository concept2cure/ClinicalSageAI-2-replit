// Translation coverage — live coverage + per-language detail for a selected
// document, with add + edit authoring. Coverage from
// GET /api/mdx/labeling/:id/coverage; rows from
// GET /api/mdx/labeling/:id/translations. POST adds a translation,
// PATCH /translations/:transId edits status, method, translator, and
// back-translation verification.

import * as React from 'react';
import {
  useLabelingCoverage,
  useLabelingTranslations,
  useAddTranslation,
  useUpdateTranslation,
} from '../../hooks/useLabeling';
import type {
  LabelingTranslation,
  LabelingTransCreate,
  LabelingTransPatch,
  LabelingTransMethod,
  LabelingTransStatus,
} from '../../services/labelingService';
import { DocPicker } from './DocPicker';
import { LabelingIcon } from '../icons';
import { LabelingDialog } from './LabelingDialog';
import { Loading, ErrorState, Empty, NoProject, StatusChip, transStatusTone } from './state';

interface TranslationsProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

const TRANS_METHODS: LabelingTransMethod[] = ['human', 'mt_postedited', 'machine'];
const TRANS_STATUSES: LabelingTransStatus[] = ['pending', 'in_progress', 'review', 'approved', 'rejected'];

function methodLabel(m: string | null): string {
  if (!m) return '—';
  return m.replace(/_/g, ' ');
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

interface TransFormState {
  language: string;
  translator: string;
  translationMethod: '' | LabelingTransMethod;
  status: LabelingTransStatus;
  backTranslationVerified: boolean;
}

function rowToForm(row: LabelingTranslation | null): TransFormState {
  return {
    language: row ? String(row.language ?? '') : '',
    translator: row ? String(row.translator ?? '') : '',
    translationMethod: (row?.translation_method as LabelingTransMethod) ?? '',
    status: (row?.status as LabelingTransStatus) ?? 'pending',
    backTranslationVerified: row?.back_translation_verified === true,
  };
}

function TranslationDialog({
  docId,
  editing,
  onClose,
}: {
  docId: number;
  editing: LabelingTranslation | null;
  onClose: () => void;
}) {
  const add = useAddTranslation();
  const update = useUpdateTranslation();
  const isEdit = !!editing;
  const [form, setForm] = React.useState<TransFormState>(() => rowToForm(editing));
  const errId = React.useId();

  const set = <K extends keyof TransFormState>(k: K, v: TransFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.language.trim().length >= 2;
  const pending = add.isPending || update.isPending;
  const error = (add.error || update.error) as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    if (isEdit && editing) {
      const patch: LabelingTransPatch = {
        translator: form.translator.trim() || null,
        translationMethod: form.translationMethod || null,
        status: form.status,
        backTranslationVerified: form.backTranslationVerified,
      };
      await update.mutateAsync({ transId: editing.id, docId, patch });
    } else {
      const data: LabelingTransCreate = {
        language: form.language.trim(),
        translator: form.translator.trim() || null,
        translationMethod: form.translationMethod || null,
        status: form.status,
        backTranslationVerified: form.backTranslationVerified,
      };
      await add.mutateAsync({ id: docId, data });
    }
    onClose();
  };

  const formId = 'lb-trans-form';

  return (
    <LabelingDialog
      open
      busy={pending}
      title={isEdit ? 'Edit translation' : 'Add translation'}
      subtitle="Per-language status and back-translation verification"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? (isEdit ? 'Saving…' : 'Adding…') : isEdit ? 'Save changes' : 'Add translation'}
          </button>
        </>
      }
    >
      <form id={formId} className="lb-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="lb-field-row">
          <div className="lb-field">
            <label htmlFor="trans-lang">Language<span className="lb-req" aria-hidden="true">*</span></label>
            <input
              id="trans-lang"
              required
              minLength={2}
              value={form.language}
              onChange={(e) => set('language', e.target.value)}
              disabled={isEdit}
              placeholder="e.g. de, ja, fr"
            />
          </div>
          <div className="lb-field">
            <label htmlFor="trans-method">Method</label>
            <select id="trans-method" value={form.translationMethod} onChange={(e) => set('translationMethod', e.target.value as TransFormState['translationMethod'])}>
              <option value="">Not set</option>
              {TRANS_METHODS.map((m) => (
                <option key={m} value={m}>{methodLabel(m)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="lb-field">
          <label htmlFor="trans-translator">Translator</label>
          <input
            id="trans-translator"
            value={form.translator}
            onChange={(e) => set('translator', e.target.value)}
            placeholder="e.g. vendor or person"
          />
        </div>

        <div className="lb-field">
          <label htmlFor="trans-status">Status</label>
          <select id="trans-status" value={form.status} onChange={(e) => set('status', e.target.value as LabelingTransStatus)}>
            {TRANS_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>

        <div className="lb-field lb-field-check">
          <input
            id="trans-btv"
            type="checkbox"
            checked={form.backTranslationVerified}
            onChange={(e) => set('backTranslationVerified', e.target.checked)}
          />
          <label htmlFor="trans-btv">Back-translation verified</label>
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not save the translation. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

export function LabelingTranslations({ projectId, onAskAna }: TranslationsProps) {
  const [docId, setDocId] = React.useState<number | null>(null);
  const coverage = useLabelingCoverage(docId);
  const translations = useLabelingTranslations(docId);
  const cov = coverage.data;
  const rows = translations.data ?? [];
  const [dialog, setDialog] = React.useState<{ editing: LabelingTranslation | null } | null>(null);

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
          <button
            className="bp-btn-tert"
            type="button"
            disabled={docId == null}
            onClick={() => setDialog({ editing: null })}
          >
            <LabelingIcon name="plus" /> Add translation
          </button>
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
                    <th>Action</th>
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
                      <td>
                        <button className="bp-btn-tert" type="button" onClick={() => setDialog({ editing: t })}>
                          <LabelingIcon name="pen" size={14} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {dialog && docId != null && (
        <TranslationDialog
          docId={docId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
