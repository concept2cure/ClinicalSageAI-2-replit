// Translation glossary — the do-not-translate (DNT) identifier set plus mandated
// term translations. Rows from GET /api/translation/glossary; POST adds a term,
// PATCH /glossary/:id edits it.
//
// A DNT term (doNotTranslate=true) is a regulatory citation, agency name, code,
// JSON key, etc. that must be masked before MT and restored verbatim after — its
// target rendering is irrelevant, so it shows as a locked/identifier chip rather
// than a translated string. A non-DNT term carries a mandated target rendering
// enforced during post-edit and review.
//
// Reuses the labeling surface conventions (bp-*/lb-* classes, shared state
// helpers, LabelingDialog) rather than introducing a parallel styling system.
// A later design-review/accessibility pass should confirm the locked-chip
// affordance and category labels read clearly with assistive tech.

import * as React from 'react';
import {
  useGlossary,
  useUpsertGlossaryTerm,
} from '../hooks/useTranslation';
import type { UpsertGlossaryTermRequest } from '../services/translationService';
import type { GlossaryTerm, GlossaryCategory, TargetLanguage } from '@shared/types/translation';
import { LabelingIcon } from '../../labeling/icons';
import { LabelingDialog } from '../../labeling/surfaces/LabelingDialog';
import { Loading, ErrorState, Empty, StatusChip } from '../../labeling/surfaces/state';

interface GlossaryPanelProps {
  onAskAna?: (t: string) => void;
}

const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  'regulatory_citation',
  'agency_name',
  'evidence_label',
  'slash_command',
  'json_block',
  'inn_drug_name',
  'meddra_term',
  'code',
  'preferred_term',
];

const CATEGORY_LABEL: Record<GlossaryCategory, string> = {
  regulatory_citation: 'Regulatory citation',
  agency_name: 'Agency name',
  evidence_label: 'Evidence label',
  slash_command: 'Slash command',
  json_block: 'JSON block',
  inn_drug_name: 'INN / drug name',
  meddra_term: 'MedDRA term',
  code: 'Code',
  preferred_term: 'Preferred term',
};

// The 18-code language set (TargetLanguage = LanguageCode minus 'en').
const TARGET_LANGS: TargetLanguage[] = [
  'fr', 'de', 'ja', 'zh', 'ko', 'es', 'pt', 'it', 'nl', 'pl', 'sv', 'da', 'fi', 'cs', 'el', 'hu', 'ro',
];

function categoryLabel(c: GlossaryCategory): string {
  return CATEGORY_LABEL[c] ?? c.replace(/_/g, ' ');
}

interface GlossaryFormState {
  sourceTerm: string;
  targetTerm: string;
  doNotTranslate: boolean;
  category: GlossaryCategory;
  targetLang: '' | TargetLanguage;
}

function rowToForm(row: GlossaryTerm | null): GlossaryFormState {
  return {
    sourceTerm: row?.sourceTerm ?? '',
    targetTerm: row?.targetTerm ?? '',
    doNotTranslate: row?.doNotTranslate ?? false,
    category: row?.category ?? 'preferred_term',
    targetLang: (row?.targetLang as TargetLanguage) ?? '',
  };
}

function GlossaryDialog({
  editing,
  onClose,
}: {
  editing: GlossaryTerm | null;
  onClose: () => void;
}) {
  const upsert = useUpsertGlossaryTerm();
  const isEdit = !!editing;
  const [form, setForm] = React.useState<GlossaryFormState>(() => rowToForm(editing));
  const errId = React.useId();

  const set = <K extends keyof GlossaryFormState>(k: K, v: GlossaryFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // A DNT term needs no target rendering; a non-DNT term must carry one.
  const valid =
    form.sourceTerm.trim().length >= 1 &&
    (form.doNotTranslate || form.targetTerm.trim().length >= 1);
  const pending = upsert.isPending;
  const error = upsert.error as Error | null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body: UpsertGlossaryTermRequest = {
      ...(isEdit && editing ? { id: editing.id } : {}),
      sourceTerm: form.sourceTerm.trim(),
      // DNT terms restore verbatim, so the target rendering is dropped.
      targetTerm: form.doNotTranslate ? null : form.targetTerm.trim() || null,
      doNotTranslate: form.doNotTranslate,
      category: form.category,
      targetLang: form.targetLang || null,
    };
    await upsert.mutateAsync(body);
    onClose();
  };

  const formId = 'tr-glossary-form';

  return (
    <LabelingDialog
      open
      busy={pending}
      title={isEdit ? 'Edit glossary term' : 'Add glossary term'}
      subtitle="Do-not-translate identifiers and mandated term translations"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="bp-btn-tert" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" form={formId} className="bp-btn-primary" disabled={!valid || pending}>
            {pending ? (isEdit ? 'Saving…' : 'Adding…') : isEdit ? 'Save changes' : 'Add term'}
          </button>
        </>
      }
    >
      <form id={formId} className="lb-form" onSubmit={onSubmit} aria-describedby={error ? errId : undefined}>
        <div className="lb-field">
          <label htmlFor="gl-source">Source term<span className="lb-req" aria-hidden="true">*</span></label>
          <input
            id="gl-source"
            required
            value={form.sourceTerm}
            onChange={(e) => set('sourceTerm', e.target.value)}
            placeholder="e.g. 21 CFR 312.23"
          />
        </div>

        <div className="lb-field lb-field-check">
          <input
            id="gl-dnt"
            type="checkbox"
            checked={form.doNotTranslate}
            onChange={(e) => set('doNotTranslate', e.target.checked)}
            aria-describedby="gl-dnt-hint"
          />
          <label htmlFor="gl-dnt">Do not translate (mask and restore verbatim)</label>
        </div>
        <p id="gl-dnt-hint" className="lb-form-note">
          When set, the source term is masked before machine translation and restored
          unchanged. No target rendering is stored.
        </p>

        {!form.doNotTranslate && (
          <div className="lb-field">
            <label htmlFor="gl-target">
              Mandated target term<span className="lb-req" aria-hidden="true">*</span>
            </label>
            <input
              id="gl-target"
              required={!form.doNotTranslate}
              value={form.targetTerm}
              onChange={(e) => set('targetTerm', e.target.value)}
              placeholder="Preferred rendering enforced at review"
            />
          </div>
        )}

        <div className="lb-field-row">
          <div className="lb-field">
            <label htmlFor="gl-category">Category</label>
            <select
              id="gl-category"
              value={form.category}
              onChange={(e) => set('category', e.target.value as GlossaryCategory)}
            >
              {GLOSSARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </div>
          <div className="lb-field">
            <label htmlFor="gl-lang">Target language</label>
            <select
              id="gl-lang"
              value={form.targetLang}
              onChange={(e) => set('targetLang', e.target.value as GlossaryFormState['targetLang'])}
            >
              <option value="">All languages</option>
              {TARGET_LANGS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div id={errId} className="lb-form-error" role="alert">
            <LabelingIcon name="alertCircle" size={14} />
            Could not save the term. {error.message}
          </div>
        )}
      </form>
    </LabelingDialog>
  );
}

/** A DNT term renders its identifier as a locked chip (text + lock affordance,
 *  never color alone); a non-DNT term shows its mandated target rendering. */
function TargetCell({ term }: { term: GlossaryTerm }) {
  if (term.doNotTranslate) {
    return (
      <span className="lb-chip lb-chip-dim" title="Do not translate — restored verbatim">
        <LabelingIcon name="tag" size={12} />
        Locked · {term.sourceTerm}
      </span>
    );
  }
  if (term.targetTerm) {
    return <span style={{ fontWeight: 600 }}>{term.targetTerm}</span>;
  }
  return <span className="lb-mut">Not set</span>;
}

export function GlossaryPanel({ onAskAna }: GlossaryPanelProps) {
  const glossary = useGlossary();
  const rows = glossary.data ?? [];
  const [dialog, setDialog] = React.useState<{ editing: GlossaryTerm | null } | null>(null);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Translation</div>
          <h1 className="bp-title">Glossary</h1>
          <div className="bp-meta">Do-not-translate identifiers and mandated term translations</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-tert" type="button" onClick={() => setDialog({ editing: null })}>
            <LabelingIcon name="plus" /> Add term
          </button>
          {onAskAna && (
            <button
              className="bp-btn-primary"
              type="button"
              onClick={() => onAskAna('List do-not-translate terms missing a category or language scope')}
            >
              Ask AnA
            </button>
          )}
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Terms</span>
          <span className="bp-meta">{rows.length}</span>
        </div>
        {glossary.isLoading ? (
          <Loading label="Loading glossary…" />
        ) : glossary.isError ? (
          <ErrorState message="Could not load the glossary." />
        ) : rows.length === 0 ? (
          <Empty>No glossary terms yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th scope="col">Source term</th>
                <th scope="col">Target / status</th>
                <th scope="col">Category</th>
                <th scope="col">Language</th>
                <th scope="col">Verification</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((term) => (
                <tr key={term.id}>
                  <td style={{ fontWeight: 600 }}>{term.sourceTerm}</td>
                  <td><TargetCell term={term} /></td>
                  <td className="lb-mut">{categoryLabel(term.category)}</td>
                  <td className="lb-mut">{term.targetLang ?? 'all'}</td>
                  <td>
                    {term.doNotTranslate ? (
                      <StatusChip tone="ok" label="Locked" />
                    ) : (
                      <StatusChip tone="review" label="Mandated" />
                    )}
                  </td>
                  <td>
                    <button className="bp-btn-tert" type="button" onClick={() => setDialog({ editing: term })}>
                      <LabelingIcon name="pen" size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && <GlossaryDialog editing={dialog.editing} onClose={() => setDialog(null)} />}
    </div>
  );
}

export default GlossaryPanel;
