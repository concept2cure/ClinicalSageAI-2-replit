/**
 * Edit details: a Vault version's title, type and classification, changed by
 * a person with a reason for change (VR-05, 21 CFR 11.10(e)).
 *
 * POSTs to /api/c2c/project-vault/:id/documents/:documentId/details. The server
 * checks the role, the reason and the vocabularies, and records each changed
 * field's before and after with the reason in the document's audit trail. The
 * values shown are only ever what the server last stored: a refusal leaves
 * them as they were and says why, and success is claimed only once the
 * response says the change was recorded.
 */
import React, { useState } from 'react';
import {
  VAULT_CLASSIFICATIONS,
  VAULT_INGEST_DOCUMENT_TYPES,
  vaultIngestTypeLabel,
} from '@shared/constants/domain/vault-taxonomy';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';

export interface RecordedDetails {
  documentTitle: string | null;
  documentType: string | null;
  classification: string | null;
}

interface Props {
  projectId: string;
  documentId: string;
  details: RecordedDetails;
  /** Called after a recorded change, so the surface re-reads the Vault and its history. */
  onSaved: () => void;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  CONFIDENTIAL: 'Confidential',
  INTERNAL: 'Internal',
  CONTROLLED: 'Controlled',
  PUBLIC: 'Public',
};
const classificationLabel = (c: string | null) => (c ? CLASSIFICATION_LABEL[c] ?? c : '—');

type Note = { tone: 'ok' | 'error'; text: string } | null;
interface Draft { title: string; type: string; classification: string; reason: string }

const draftOf = (d: RecordedDetails): Draft => ({
  title: d.documentTitle ?? '',
  type: d.documentType ?? '',
  classification: d.classification ?? '',
  reason: '',
});

/** Only the fields the person actually changed are sent. */
function changedFields(draft: Draft, d: RecordedDetails): Record<string, string> {
  const out: Record<string, string> = {};
  const title = draft.title.trim();
  if (title && title !== (d.documentTitle ?? '')) out.documentTitle = title;
  if (draft.type && draft.type !== d.documentType) out.documentType = draft.type;
  if (draft.classification && draft.classification !== d.classification) out.classification = draft.classification;
  return out;
}

const refusalNote = (body: unknown, status: number): Note => ({
  tone: 'error',
  text: `The details were not changed — ${serverMessage(body) ?? `the Vault refused it (HTTP ${status})`}`,
});
const savedNote = (unchanged: boolean): Note => ({
  tone: 'ok',
  text: unchanged
    ? 'Nothing changed: those values are already recorded.'
    : "Saved. The change and your reason are recorded in this document's history.",
});

function useDetailsEditor({ projectId, documentId, details, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(details));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const changed = changedFields(draft, details);
  const canSave = !saving && Object.keys(changed).length > 0 && draft.reason.trim().length >= GOVERNED_REASON_MIN;

  const open = () => {
    setDraft(draftOf(details));
    setNote(null);
    setEditing(true);
  };
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await apiRequest(
        'POST',
        `/api/c2c/project-vault/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/details`,
        { ...changed, reason: draft.reason.trim() },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) return setNote(refusalNote(body, res.status));
      setNote(savedNote(Boolean(body?.unchanged)));
      setEditing(false);
      if (!body?.unchanged) onSaved();
    } catch (e) {
      setNote({ tone: 'error', text: redactInternals(e instanceof Error ? e.message : String(e), 'The details were not changed.') });
    } finally {
      setSaving(false);
    }
  };
  return { editing, setEditing, draft, setDraft, saving, note, canSave, open, save };
}

function DetailsView({ details, onEdit }: { details: RecordedDetails; onEdit: () => void }) {
  return (
    <div className="vd-d-filing">
      <div className="vd-d-filing-row">
        <span className="k">Title</span>
        <span className="v">{details.documentTitle || '—'}</span>
      </div>
      <div className="vd-d-filing-row">
        <span className="k">Type</span>
        <span className="v">{details.documentType ? vaultIngestTypeLabel(details.documentType) : '—'}</span>
      </div>
      <div className="vd-d-filing-row">
        <span className="k">Classification</span>
        <span className="v">{classificationLabel(details.classification)}</span>
      </div>
      <div className="vd-d-filing-acts">
        <button className="sp-ask" onClick={onEdit} data-testid="vault-edit-details-open">
          Edit details
        </button>
      </div>
    </div>
  );
}

function DetailsForm({ ed }: { ed: ReturnType<typeof useDetailsEditor> }) {
  const { draft, saving } = ed;
  const set = (patch: Partial<Draft>) => ed.setDraft({ ...draft, ...patch });
  return (
    <div className="vd-d-filing">
      <label className="vd-d-filing-row">
        <span className="k">Title</span>
        <input className="vd-d-filing-reason" value={draft.title} maxLength={500} disabled={saving}
          onChange={(e) => set({ title: e.target.value })} data-testid="vault-edit-details-title" />
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Type</span>
        <select className="vd-d-move-sel" value={draft.type} disabled={saving}
          onChange={(e) => set({ type: e.target.value })} data-testid="vault-edit-details-type">
          {!draft.type && <option value="">Choose a type</option>}
          {VAULT_INGEST_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{vaultIngestTypeLabel(t)}</option>)}
        </select>
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Classification</span>
        <select className="vd-d-move-sel" value={draft.classification} disabled={saving}
          onChange={(e) => set({ classification: e.target.value })} data-testid="vault-edit-details-classification">
          {!draft.classification && <option value="">Choose a classification</option>}
          {VAULT_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{classificationLabel(c)}</option>)}
        </select>
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Reason for change</span>
        <textarea className="vd-d-filing-reason" value={draft.reason} rows={2} disabled={saving}
          placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the change.`}
          onChange={(e) => set({ reason: e.target.value })} data-testid="vault-edit-details-reason" />
      </label>
      <div className="vd-d-filing-acts">
        <button className="sp-primary" disabled={!ed.canSave} onClick={() => void ed.save()} data-testid="vault-edit-details-save">
          {saving ? 'Saving…' : 'Save details'}
        </button>
        <button className="sp-ask" disabled={saving} onClick={() => ed.setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function VaultEditDetails(props: Props) {
  const ed = useDetailsEditor(props);
  return (
    <div data-testid="vault-edit-details">
      <div className="vd-d-seclbl">Details</div>
      {ed.editing ? <DetailsForm ed={ed} /> : <DetailsView details={props.details} onEdit={ed.open} />}
      {ed.note && (
        <div className={ed.note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'}
          role={ed.note.tone === 'error' ? 'alert' : 'status'} data-testid="vault-edit-details-note">
          {ed.note.text}
        </div>
      )}
    </div>
  );
}
