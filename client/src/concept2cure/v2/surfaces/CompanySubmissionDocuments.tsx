import React, { useEffect, useRef, useState } from 'react';
import { companyLegalDocumentRefusal, type CompanyDocumentsResponse, type CompanyLegalDocument } from '@shared/company-documents';
import { canonicalRegionOf, toAgency } from '@shared/regulatory/region-identity';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { isLocked, judgeSectionCode, matchingLeafReceipt, placementAuditWarning, placementReasonOk, PlacementReasonField, vocabularyForApplicationType } from './filingTarget';
import type { LeafWriteEffect, Notice } from './SubmissionSeqWorkspaces';
import '../styles/company-documents.css';

const PATH = '/api/client-branding/company-documents';
interface Sequence { id: number; sequenceNumber: string; status: string; region: string }
interface Submission { id: number; title?: string; applicationType: string; programId?: string | null }
function profileResponse(value: unknown): value is CompanyDocumentsResponse {
  const v = value as CompanyDocumentsResponse | null;
  return !!v && typeof v.canManage === 'boolean' && v.data?.version === 1 && Number.isSafeInteger(v.data.revision) && Array.isArray(v.data.legalDocuments);
}
/** Copying an approved original still creates an unapproved target version. */
function copyRefusal(document: CompanyLegalDocument): string | null {
  return companyLegalDocumentRefusal(document, { programId: document.programId, agency: document.agencies[0], country: document.countries[0], submissionType: document.submissionTypes[0] });
}

export function CompanySubmissionDocuments({ seq, submission, onDone, onNav }: {
  seq: Sequence; submission: Submission;
  onDone: (notice: Notice, effect: LeafWriteEffect) => void;
  onNav?: (id: string) => void;
}) {
  const auth = getAuthToken(); const org = getJwtOrgId();
  const owner = `${org}:${auth}:${seq.id}:${seq.region}:${seq.status}:${submission.id}:${submission.programId}:${submission.applicationType}`;
  const [state, setState] = useState<{ owner: string; loading: boolean; response: CompanyDocumentsResponse | null; error: string }>({ owner: '', loading: true, response: null, error: '' });
  const [epoch, setEpoch] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [section, setSection] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Notice | null>(null);
  const session = useRef(0);
  const active = state.owner === owner;
  const response = active ? state.response : null;
  const documents = response?.data.legalDocuments.filter(document => document.active) ?? [];
  const selected = documents.find(document => document.id === selectedId);
  const country = canonicalRegionOf(seq.region);
  const agency = country ? toAgency(country) : undefined;
  const locked = isLocked(seq.status);
  const contextRefusal = !submission.programId ? 'This submission needs a project before a company legal document can be filed.'
    : !country || !agency ? 'Identify the filing market before selecting company legal documents.' : null;
  const refusalFor = (document: CompanyLegalDocument) => contextRefusal ?? companyLegalDocumentRefusal(document, {
    programId: submission.programId, agency, country, submissionType: submission.applicationType,
  });
  const selectedRefusal = selected ? refusalFor(selected) : null;
  const crossProgram = !!selected && !!submission.programId && selected.programId !== submission.programId;
  const copyBlock = selected ? copyRefusal(selected) : null;
  const sectionVerdict = judgeSectionCode(section, vocabularyForApplicationType(submission.applicationType));

  useEffect(() => {
    const ticket = ++session.current;
    setSelectedId(''); setSection(''); setReason(''); setBusy(false); setNote(null);
    setState({ owner, loading: true, response: null, error: '' });
    void apiCall('GET', PATH).then(result => {
      if (ticket !== session.current) return;
      if (!result.ok || !profileResponse(result.body)) {
        setState({ owner, loading: false, response: null, error: apiErrorText(result, 'The company legal document library could not be read. No library entry is available to select.') }); return;
      }
      setState({ owner, loading: false, response: result.body, error: '' });
    });
    return () => { session.current++; };
  }, [owner, epoch]);

  const place = async () => {
    if (!selected || !active || busy || locked || selectedRefusal || !sectionVerdict.placeable || !placementReasonOk(reason)) return;
    const ticket = session.current;
    setBusy(true); setNote(null);
    const code = sectionVerdict.canonical ?? section.trim();
    const result = await apiCall('POST', `${PATH}/legal-documents/${encodeURIComponent(selected.id)}/place`, { sequenceId: seq.id, sectionCode: code, reason: reason.trim() });
    if (ticket !== session.current) return;
    setBusy(false);
    if (!result.ok || !matchingLeafReceipt(result.body, { sequenceId: seq.id, sectionCode: code, lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: selected.vaultDocumentId })) {
      setNote({ tone: 'err', text: apiErrorText(result, 'Placement was not confirmed. Check this sequence’s leaves before retrying.') }); return;
    }
    const leaf = result.body;
    const changed = leaf.unchanged !== true;
    const sequenceChanged = Boolean((leaf as typeof leaf & { sequenceStatusChanged?: unknown }).sequenceStatusChanged);
    const warning = placementAuditWarning(leaf);
    const receipt: Notice = { tone: leaf.unchanged || warning ? 'warn' : 'ok', text: leaf.unchanged
      ? `“${selected.title}” is already in this sequence at ${leaf.sectionCode}. No new placement was recorded.`
      : `Original “${selected.title}” placed at ${leaf.sectionCode} in sequence ${seq.sequenceNumber}.${sequenceChanged ? ' The sequence changed; validate it again.' : ''}${warning ? ` ${warning}` : ''}` };
    setNote(receipt); onDone(receipt, { changed, sequenceChanged });
    setSelectedId(''); setSection(''); setReason('');
  };
  const copyToProgram = async () => {
    if (!selected || !response?.canManage || !crossProgram || copyBlock || !submission.programId || !placementReasonOk(reason) || busy || locked) return;
    const ticket = session.current; setBusy(true); setNote(null);
    const result = await apiCall('POST', `${PATH}/legal-documents/${encodeURIComponent(selected.id)}/copy-to-program`, {
      programId: submission.programId, expectedRevision: response.data.revision, reason: reason.trim(),
    });
    if (ticket !== session.current) return;
    setBusy(false);
    const body = result.body as { document?: { id?: unknown }; library?: unknown; registered?: boolean; reviewRequired?: boolean; message?: unknown } | null;
    if (!result.ok || typeof body?.document?.id !== 'string' || body.reviewRequired !== true || typeof body.message !== 'string') {
      setNote({ tone: 'err', text: apiErrorText(result, 'The copy could not be confirmed. Check the target project’s Vault before retrying.') }); return;
    }
    if (profileResponse(body.library)) setState({ owner, loading: false, response: body.library, error: '' });
    setNote({ tone: 'warn', text: body.message });
    setSelectedId(''); setReason('');
  };
  const downloadCorrespondence = async () => {
    if (!active || busy) return;
    const ticket = session.current;
    setBusy(true); setNote(null);
    const title = `${submission.title || `Submission ${submission.id}`} — correspondence`;
    try {
      const result = await apiRequest('POST', `${PATH}/letterhead/render`, { purpose: 'submission', title });
      if (!result.ok) throw new Error(serverMessage(await result.json().catch(() => null)) || 'The template download was refused.');
      const blob = await result.blob();
      if (ticket !== session.current) return;
      if (!downloadBlob(`${safeFileName(submission.title || `Submission ${submission.id}`)}-correspondence.docx`, blob)) throw new Error('The browser could not save the template.');
      setNote({ tone: 'ok', text: 'Correspondence Word template downloaded using the saved company presentation preference. Review the draft content and place its reviewed PDF explicitly from Vault before including it in a submission.' });
    } catch (error) {
      if (ticket === session.current) setNote({ tone: 'err', text: 'Correspondence template download failed. ' + (error instanceof Error ? error.message : '') });
    } finally { if (ticket === session.current) setBusy(false); }
  };

  return <section className="company-documents" aria-label="Company legal documents for this submission">
    <div className="company-section-head"><div><div className="company-eyebrow">Submission companions</div><h2>Company legal documents</h2>
      <p>Select original company documents for {agency ?? seq.region} · {country ?? 'market not identified'} · {submission.applicationType.toUpperCase()}. The source’s current approval, dates and applicability are verified again when it is placed.</p></div>
      <button type="button" className="btn ghost small" disabled={!active || busy} onClick={() => void downloadCorrespondence()}>Download correspondence Word template</button></div>
    <p className="company-hint">The correspondence template follows the saved company presentation preference. It is a draft: review its content, then place the reviewed PDF explicitly from Vault. Downloading never attaches it to this sequence.</p>
    {locked && <p className="company-notice">This sequence is {seq.status}. Its leaves are immutable; company documents cannot be added.</p>}
    {(!active || state.loading) && <p role="status">Reading the company legal document library…</p>}
    {active && state.error && <div className="company-notice company-error" role="alert">{state.error} <button className="btn ghost small" type="button" onClick={() => setEpoch(x => x + 1)}>Retry company library</button></div>}
    {active && note && <div className={`company-notice${note.tone === 'err' ? ' company-error' : ''}`} role={note.tone === 'err' ? 'alert' : 'status'}>{note.text}</div>}
    {response && !state.loading && <>
      {contextRefusal && <p className="company-notice">{contextRefusal}</p>}
      {documents.length === 0 && <p className="company-empty">No active company legal documents are registered. An administrator can register original PDF versions in Admin → Settings → Legal document library.</p>}
      <fieldset className="company-editor" disabled={busy || locked}>
        <div className="company-legal-list">{documents.map(document => {
          const refusal = refusalFor(document);
          return <label className="company-legal-card" key={document.id}>
            <span className="company-check"><input type="radio" name={`company-legal-${seq.id}`} aria-label={document.title} aria-describedby={`company-legal-note-${document.id}`} value={document.id} checked={selectedId === document.id} onChange={() => { setSelectedId(document.id); setNote(null); }} /><strong>{document.title}</strong></span>
            <p className="company-hint">{document.programId === submission.programId ? 'This project' : 'Another project'} · {document.kind.replaceAll('_', ' ')} · {document.language} · version {document.version} · {document.expiresOn ? `Expires ${document.expiresOn}` : 'No expiry date'}</p>
            <p id={`company-legal-note-${document.id}`} className="company-hint">{refusal ?? 'Eligible for this filing. Select a section and record the placement reason.'}</p>
          </label>;
        })}</div>
        {selected && <div className="company-register">
          {!crossProgram && <label className="company-field"><span>Company document filing section</span><input value={section} placeholder="For example 1.2" onChange={e => setSection(e.target.value)} /></label>}
          {!crossProgram && sectionVerdict.note && <p className="company-hint">{sectionVerdict.note.text}</p>}
          <PlacementReasonField value={reason} onChange={setReason} idPrefix={`company-companion-${seq.id}`} disabled={busy || locked} variant="inline" />
          {crossProgram ? <>
            <p className="company-hint">The original is held by another project. Copy its unchanged bytes into this submission’s project, then review and approve that copy in Vault. Approval does not transfer to a copy.</p>
            {copyBlock && <p className="company-hint">Copy unavailable: {copyBlock}</p>}
            {!response.canManage && <p className="company-hint">An organization owner or administrator must register this project’s copy.</p>}
            <button type="button" className="btn small" disabled={!response.canManage || !!copyBlock || !placementReasonOk(reason) || !submission.programId || busy || locked} onClick={() => void copyToProgram()}>Copy original to this project for review</button>
          </> : <button type="button" className="btn primary small" disabled={!!selectedRefusal || !sectionVerdict.placeable || !placementReasonOk(reason) || busy || locked} onClick={() => void place()}>{busy ? 'Placing…' : 'Place company document in sequence'}</button>}
        </div>}
      </fieldset>
      <p className="company-hint">The company library records applicability, not a determination that every agency requires or accepts a document. Signed originals and agency forms retain their original bytes.</p>
      {onNav && <button type="button" className="btn ghost small" onClick={() => onNav('vault')}>Open Vault to review originals or copies</button>}
    </>}
  </section>;
}
