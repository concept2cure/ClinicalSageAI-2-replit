import React, { useRef, useState } from 'react';
import { apiCall, apiErrorText, type ApiResult } from '../apiCall';
import { setEditorTarget } from '../editorTarget';
import { companySetter, useCompanyLease, useCompanySession, type CompanySession } from './company-documents/companySession';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface DraftReceipt { authoringDocId: string; programId: string; sequenceId: number; documentStatus: 'draft'; filedInVault: false; variantId?: string }
function receipt(value: unknown, sequenceId: number, programId?: string | null, variantId?: string): value is DraftReceipt {
  const row = value as Partial<DraftReceipt> | null;
  return typeof row?.authoringDocId === 'string' && UUID.test(row.authoringDocId) && row.sequenceId === sequenceId
    && row.programId === programId && row.documentStatus === 'draft' && row.filedInVault === false && row.variantId === variantId;
}
function recoveryIdentity(body: unknown, programId: string) {
  const recovery = (body as { recovery?: { documentId?: unknown; programId?: unknown } } | null)?.recovery;
  return recovery?.programId === programId && typeof recovery.documentId === 'string' && UUID.test(recovery.documentId)
    ? { documentId: recovery.documentId, programId } : null;
}
interface DraftProps {
  sequenceId: number; programId?: string | null; submissionTitle: string;
  onNav?: (id: string) => void; variantId?: string; current?: () => boolean;
}
interface SavedDraft { documentId: string; programId: string; variantId?: string }
interface DraftState { open: boolean; title: string; content: string; reason: string; busy: boolean;
  message: string; error: string; blocked: boolean; saved: SavedDraft | null }
function draftOutcome(result: ApiResult<unknown>, sequenceId: number, programId: string, variantId?: string) {
  if (result.ok && receipt(result.body, sequenceId, programId, variantId)) {
    return { saved: { documentId: result.body.authoringDocId, programId: result.body.programId, variantId }, blocked: true,
      message: 'Correspondence saved as an Authoring draft with its filing and company revision. Review and approve it in Authoring, then explicitly file its PDF to Vault.', error: '' };
  }
  const recovery = recoveryIdentity(result.body, programId);
  return { saved: recovery ? { ...recovery, variantId } : null,
    blocked: Boolean(recovery) || result.ok || result.status === 0 || result.status >= 500, message: '',
    error: apiErrorText(result, 'The draft creation outcome could not be confirmed. Check Authoring in this project before creating another copy.') };
}
function useDraftForm(props: DraftProps & { owner: CompanySession }) {
  const { sequenceId, programId, variantId, owner } = props;
  const [state, setState] = useState<DraftState>({ open: false, title: `${props.submissionTitle} — correspondence`, content: '', reason: '',
    busy: false, message: '', error: '', blocked: false, saved: null });
  const variant = useCompanyLease(owner, JSON.stringify(variantId ?? null));
  const latest = useRef(props), form = useRef(state), operation = useRef<{ pending: boolean } | null>(null), held = useRef(false);
  latest.current = props; form.current = state;
  const current = () => variant.current() && props.current?.() !== false && latest.current.current?.() !== false;
  const canEdit = () => current() && !operation.current?.pending && !held.current;
  const update = (patch: Partial<DraftState>) => companySetter(canEdit, setState)(previous => ({ ...previous, ...patch }));
  const create = async () => {
    const draft = form.current;
    if (!canEdit() || !programId || !draft.title.trim() || draft.reason.trim().length < 8) return;
    const request = { pending: true }; operation.current = request;
    // A sent create belongs to its captured account/filing, even when the selector changes.
    const isCurrent = () => owner.current() && operation.current === request;
    const project = companySetter(isCurrent, setState);
    project(previous => ({ ...previous, busy: true, message: '', error: '' }));
    try {
      const result = await apiCall('POST', '/api/client-branding/company-documents/correspondence/drafts',
        { sequenceId, ...(variantId ? { variantId } : {}), title: draft.title.trim(), paragraphs: draft.content.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean), reason: draft.reason.trim() }, isCurrent);
      if (!result || !isCurrent()) return;
      const outcome = draftOutcome(result, sequenceId, programId, variantId);
      held.current = outcome.blocked;
      project(previous => ({ ...previous, ...outcome, busy: false }));
    } finally {
      if (operation.current === request) { request.pending = false; project(previous => ({ ...previous, busy: false })); }
    }
  };
  const openSaved = () => {
    const saved = form.current.saved;
    if (!current() || !saved || !props.onNav) return;
    setEditorTarget({ docType: null, docId: saved.documentId, programId: saved.programId, label: form.current.title });
    if (current()) props.onNav('document-authoring');
  };
  const checkAuthoring = () => { if (current()) props.onNav?.('document-authoring'); };
  return { state, active: current(), update, create, openSaved, checkAuthoring,
    toggle: () => companySetter(current, setState)(previous => ({ ...previous, open: !previous.open })) };
}
function CorrespondenceForm(props: DraftProps & { owner: CompanySession }) {
  const { state, active, update, create, openSaved, checkAuthoring, toggle } = useDraftForm(props);
  const { open, title, content, reason, busy, blocked } = state;
  return <div className="company-register">
    <button type="button" className="btn small" aria-expanded={active && open} disabled={!active || !props.programId} onClick={toggle}>Prepare correspondence in Authoring</button>
    {active && open && <fieldset disabled={busy || blocked}>
      <legend>New correspondence draft for this sequence</legend>
      <label className="company-field"><span>Correspondence title</span><input value={title} maxLength={300} onChange={event => update({ title: event.target.value })} /></label>
      <label className="company-field"><span>Draft correspondence text</span><textarea value={content} maxLength={100000} rows={6} onChange={event => update({ content: event.target.value })} /></label>
      <label className="company-field"><span>Reason for creating correspondence</span><input value={reason} maxLength={2000} minLength={8} onChange={event => update({ reason: event.target.value })} /></label>
      <p className="company-hint">The server records this sequence’s agency, application and applicant with the company presentation revision. Saving creates a working draft; review, signature and Vault filing use the existing Authoring workflow.</p>
      <p className="company-hint">Stationery is fixed when saving. Changing the selection does not change an already created draft or clear a pending or unconfirmed save.</p>
      <button type="button" className="btn primary small" disabled={!title.trim() || reason.trim().length < 8} onClick={() => void create()}>{busy ? 'Saving draft…' : 'Save correspondence draft'}</button>
    </fieldset>}
    <CorrespondenceOutcome active={active} state={state} onNav={props.onNav} openSaved={openSaved} checkAuthoring={checkAuthoring} />
  </div>;
}
function CorrespondenceOutcome({ active, state, onNav, openSaved, checkAuthoring }: {
  active: boolean; state: DraftState; onNav?: DraftProps['onNav']; openSaved: () => void; checkAuthoring: () => void;
}) {
  const { message, error, saved, blocked } = state;
  return <>
    {active && message && <p role="status">{message}</p>}{active && error && <p role="alert">{error}</p>}
    {active && saved && onNav && <button type="button" className="btn small" onClick={openSaved}>Open identified correspondence in Authoring</button>}
    {active && blocked && !saved && onNav && <button type="button" className="btn small" onClick={checkAuthoring}>Check this project’s Authoring documents</button>}
  </>;
}

export function CompanyCorrespondenceDraft(props: DraftProps) {
  const session = useCompanySession();
  const owner = useCompanyLease(session, JSON.stringify([props.sequenceId, props.programId]));
  return <CorrespondenceForm key={owner.key} {...props} owner={owner} />;
}
