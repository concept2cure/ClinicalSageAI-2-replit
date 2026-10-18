import React, { useEffect, useRef, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { setEditorTarget } from '../editorTarget';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';

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
function canCreateDraft(input: { busy: boolean; blocked: boolean; programId?: string | null; title: string; reason: string }) {
  return Boolean(!input.busy && !input.blocked && input.programId && input.title.trim() && input.reason.trim().length >= 8);
}

export function CompanyCorrespondenceDraft({ sequenceId, programId, submissionTitle, onNav, variantId }: {
  sequenceId: number; programId?: string | null; submissionTitle: string; onNav?: (id: string) => void; variantId?: string;
}) {
  const [open, setOpen] = useState(false), [title, setTitle] = useState(`${submissionTitle} — correspondence`);
  const [content, setContent] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState<{ documentId: string; programId: string } | null>(null);
  const generation = useRef({ value: 0 }), owner = `${getJwtOrgId()}:${getAuthToken()}:${sequenceId}:${programId}`;
  useEffect(() => {
    const currentSession = generation.current;
    currentSession.value++; setOpen(false); setTitle(`${submissionTitle} — correspondence`); setContent(''); setReason(''); setBusy(false); setMessage(''); setError(''); setBlocked(false); setSaved(null);
    return () => { currentSession.value++; };
  }, [owner, submissionTitle]);
  const canCreate = canCreateDraft({ busy, blocked, programId, title, reason });
  const create = async () => {
    if (!canCreate || !programId) return;
    const ticket = generation.current.value; setBusy(true); setMessage(''); setError('');
    const result = await apiCall('POST', '/api/client-branding/company-documents/correspondence/drafts',
      { sequenceId, ...(variantId ? { variantId } : {}), title: title.trim(), paragraphs: content.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean), reason: reason.trim() });
    if (ticket !== generation.current.value) return;
    setBusy(false);
    if (result.ok && receipt(result.body, sequenceId, programId, variantId)) {
      setSaved({ documentId: result.body.authoringDocId, programId: result.body.programId }); setBlocked(true);
      setMessage('Correspondence saved as an Authoring draft with its filing and company revision. Review and approve it in Authoring, then explicitly file its PDF to Vault.');
      return;
    }
    const recovery = recoveryIdentity(result.body, programId);
    if (recovery) {
      setSaved(recovery); setBlocked(true);
    } else if (result.ok || result.status === 0 || result.status >= 500) setBlocked(true);
    setError(apiErrorText(result, 'The draft creation outcome could not be confirmed. Check Authoring in this project before creating another copy.'));
  };
  const openSaved = () => {
    if (!saved || !onNav) return;
    setEditorTarget({ docType: null, docId: saved.documentId, programId: saved.programId, label: title });
    onNav('document-authoring');
  };
  return <div className="company-register">
    <button type="button" className="btn small" aria-expanded={open} disabled={!programId} onClick={() => setOpen(value => !value)}>Prepare correspondence in Authoring</button>
    {open && <fieldset disabled={busy || blocked}>
      <legend>New correspondence draft for this sequence</legend>
      <label className="company-field"><span>Correspondence title</span><input value={title} maxLength={300} onChange={event => setTitle(event.target.value)} /></label>
      <label className="company-field"><span>Draft correspondence text</span><textarea value={content} maxLength={100000} rows={6} onChange={event => setContent(event.target.value)} /></label>
      <label className="company-field"><span>Reason for creating correspondence</span><input value={reason} maxLength={2000} minLength={8} onChange={event => setReason(event.target.value)} /></label>
      <p className="company-hint">The server records this sequence’s agency, application and applicant with the company presentation revision. Saving creates a working draft; review, signature and Vault filing use the existing Authoring workflow.</p>
      <button type="button" className="btn primary small" disabled={!title.trim() || reason.trim().length < 8} onClick={() => void create()}>{busy ? 'Saving draft…' : 'Save correspondence draft'}</button>
    </fieldset>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {saved && onNav && <button type="button" className="btn small" onClick={openSaved}>Open identified correspondence in Authoring</button>}
    {blocked && !saved && onNav && <button type="button" className="btn small" onClick={() => onNav('document-authoring')}>Check this project’s Authoring documents</button>}
  </div>;
}
