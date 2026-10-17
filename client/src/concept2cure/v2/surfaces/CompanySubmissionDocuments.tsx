import React, { useEffect, useRef, useState } from 'react';
import { companyLegalDocumentRefusal, type CompanyDocumentsResponse, type CompanyLegalDocument } from '@shared/company-documents';
import { canonicalRegionOf, toAgency } from '@shared/regulatory/region-identity';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { isLocked, judgeSectionCode, matchingLeafReceipt, placementAuditWarning, placementReasonOk, PlacementReasonField, vocabularyForApplicationType, type FilingLeafReceipt } from './filingTarget';
import type { LeafWriteEffect, Notice } from './SubmissionSeqWorkspaces';
import '../styles/company-documents.css';

const PATH = '/api/client-branding/company-documents';
interface Sequence { id: number; sequenceNumber: string; status: string; region: string }
interface Submission { id: number; title?: string; applicationType: string; programId?: string | null }
interface CompanionProps {
  seq: Sequence; submission: Submission;
  onDone: (notice: Notice, effect: LeafWriteEffect) => void;
  onNav?: (id: string) => void;
}
function profileResponse(value: unknown): value is CompanyDocumentsResponse {
  const v = value as CompanyDocumentsResponse | null;
  return !!v && typeof v.canManage === 'boolean' && v.data?.version === 1 && Number.isSafeInteger(v.data.revision) && Array.isArray(v.data.legalDocuments);
}
/** Copying an approved original still creates an unapproved target version. */
function copyRefusal(document: CompanyLegalDocument): string | null {
  return companyLegalDocumentRefusal(document, { programId: document.programId, agency: document.agencies[0], country: document.countries[0], submissionType: document.submissionTypes[0] });
}

/** Keep every draft and asynchronous receipt scoped to the authenticated filing context. */
function useCompanyLibrary(owner: string) {
  const [state, setState] = useState<{ owner: string; loading: boolean; response: CompanyDocumentsResponse | null; error: string }>({ owner: '', loading: true, response: null, error: '' });
  const [epoch, setEpoch] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [section, setSection] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Notice | null>(null);
  const session = useRef({ generation: 0 });
  const active = state.owner === owner;
  const response = active ? state.response : null;
  useEffect(() => {
    const currentSession = session.current;
    const ticket = ++currentSession.generation;
    setSelectedId(''); setSection(''); setReason(''); setBusy(false); setNote(null);
    setState({ owner, loading: true, response: null, error: '' });
    void apiCall('GET', PATH).then(result => {
      if (ticket !== currentSession.generation) return;
      if (!result.ok || !profileResponse(result.body)) {
        setState({ owner, loading: false, response: null, error: apiErrorText(result, 'The company legal document library could not be read. No library entry is available to select.') }); return;
      }
      setState({ owner, loading: false, response: result.body, error: '' });
    });
    return () => { currentSession.generation++; };
  }, [owner, epoch]);
  return {
    state, active, response, selectedId, section, reason, busy, note, session,
    setSelectedId, setSection, setReason, setBusy, setNote,
    retry: () => setEpoch(x => x + 1),
    setResponse: (next: CompanyDocumentsResponse) => setState({ owner, loading: false, response: next, error: '' }),
  };
}
type CompanyLibrary = ReturnType<typeof useCompanyLibrary>;

function filingContext(seq: Sequence, submission: Submission) {
  const country = canonicalRegionOf(seq.region);
  const agency = country ? toAgency(country) : undefined;
  const contextRefusal = !submission.programId ? 'This submission needs a project before a company legal document can be filed.'
    : !country || !agency ? 'Identify the filing market before selecting company legal documents.' : null;
  const refusalFor = (document: CompanyLegalDocument) => contextRefusal ?? companyLegalDocumentRefusal(document, {
    programId: submission.programId, agency, country, submissionType: submission.applicationType,
  });
  return { country, agency, contextRefusal, refusalFor };
}
type FilingContext = ReturnType<typeof filingContext>;

function companionSelection(library: CompanyLibrary, context: FilingContext, seq: Sequence, submission: Submission) {
  const documents = library.response?.data.legalDocuments.filter(document => document.active) ?? [];
  const selected = documents.find(document => document.id === library.selectedId);
  const locked = isLocked(seq.status);
  const selectedRefusal = selected ? context.refusalFor(selected) : null;
  const crossProgram = !!selected && !!submission.programId && selected.programId !== submission.programId;
  const copyBlock = selected ? copyRefusal(selected) : null;
  const sectionVerdict = judgeSectionCode(library.section, vocabularyForApplicationType(submission.applicationType));
  const canPlace = () => !!selected && library.active && !library.busy && !locked && !selectedRefusal && sectionVerdict.placeable && placementReasonOk(library.reason);
  const canCopy = () => !!selected && !!library.response?.canManage && crossProgram && !copyBlock && !!submission.programId && placementReasonOk(library.reason) && !library.busy && !locked;
  return { documents, selected, locked, crossProgram, copyBlock, sectionVerdict, canPlace, canCopy };
}
type CompanionSelection = ReturnType<typeof companionSelection>;

function placementReceipt(leaf: FilingLeafReceipt, title: string, sequenceNumber: string) {
  const changed = leaf.unchanged !== true;
  const sequenceChanged = Boolean((leaf as FilingLeafReceipt & { sequenceStatusChanged?: unknown }).sequenceStatusChanged);
  const warning = placementAuditWarning(leaf);
  const receipt: Notice = { tone: leaf.unchanged || warning ? 'warn' : 'ok', text: leaf.unchanged
    ? `“${title}” is already in this sequence at ${leaf.sectionCode}. No new placement was recorded.`
    : `Original “${title}” placed at ${leaf.sectionCode} in sequence ${sequenceNumber}.${sequenceChanged ? ' The sequence changed; validate it again.' : ''}${warning ? ` ${warning}` : ''}` };
  return { receipt, effect: { changed, sequenceChanged } };
}
interface CopyReceipt { document: { id: string }; library?: unknown; reviewRequired: true; message: string }
function confirmedCopy(value: unknown): value is CopyReceipt {
  const body = value as Partial<CopyReceipt> | null;
  return typeof body?.document?.id === 'string' && body.reviewRequired === true && typeof body.message === 'string';
}

function companionActions(props: CompanionProps, library: CompanyLibrary, selection: CompanionSelection) {
  const { seq, submission, onDone } = props;
  const { selected } = selection;
  const place = async () => {
    if (!selected || !selection.canPlace()) return;
    const ticket = library.session.current.generation;
    library.setBusy(true); library.setNote(null);
    const code = selection.sectionVerdict.canonical ?? library.section.trim();
    const result = await apiCall('POST', `${PATH}/legal-documents/${encodeURIComponent(selected.id)}/place`, { sequenceId: seq.id, sectionCode: code, reason: library.reason.trim() });
    if (ticket !== library.session.current.generation) return;
    library.setBusy(false);
    if (!result.ok || !matchingLeafReceipt(result.body, { sequenceId: seq.id, sectionCode: code, lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: selected.vaultDocumentId })) {
      library.setNote({ tone: 'err', text: apiErrorText(result, 'Placement was not confirmed. Check this sequence’s leaves before retrying.') }); return;
    }
    const { receipt, effect } = placementReceipt(result.body, selected.title, seq.sequenceNumber);
    library.setNote(receipt); onDone(receipt, effect);
    library.setSelectedId(''); library.setSection(''); library.setReason('');
  };
  const copyToProgram = async () => {
    if (!selected || !library.response || !selection.canCopy()) return;
    const ticket = library.session.current.generation; library.setBusy(true); library.setNote(null);
    const result = await apiCall('POST', `${PATH}/legal-documents/${encodeURIComponent(selected.id)}/copy-to-program`, {
      programId: submission.programId, expectedRevision: library.response.data.revision, reason: library.reason.trim(),
    });
    if (ticket !== library.session.current.generation) return;
    library.setBusy(false);
    if (!result.ok || !confirmedCopy(result.body)) {
      library.setNote({ tone: 'err', text: apiErrorText(result, 'The copy could not be confirmed. Check the target project’s Vault before retrying.') }); return;
    }
    if (profileResponse(result.body.library)) library.setResponse(result.body.library);
    library.setNote({ tone: 'warn', text: result.body.message });
    library.setSelectedId(''); library.setReason('');
  };
  const downloadCorrespondence = async () => {
    if (!library.active || library.busy) return;
    const ticket = library.session.current.generation;
    library.setBusy(true); library.setNote(null);
    const title = `${submission.title || `Submission ${submission.id}`} — correspondence`;
    try {
      const result = await apiRequest('POST', `${PATH}/letterhead/render`, { purpose: 'submission', title });
      if (!result.ok) throw new Error(serverMessage(await result.json().catch(() => null)) || 'The template download was refused.');
      const blob = await result.blob();
      if (ticket !== library.session.current.generation) return;
      if (!downloadBlob(`${safeFileName(submission.title || `Submission ${submission.id}`)}-correspondence.docx`, blob)) throw new Error('The browser could not save the template.');
      library.setNote({ tone: 'ok', text: 'Correspondence Word template downloaded using the saved company presentation preference. Review the draft content and place its reviewed PDF explicitly from Vault before including it in a submission.' });
    } catch (error) {
      if (ticket === library.session.current.generation) library.setNote({ tone: 'err', text: 'Correspondence template download failed. ' + (error instanceof Error ? error.message : '') });
    } finally { if (ticket === library.session.current.generation) library.setBusy(false); }
  };
  return { place, copyToProgram, downloadCorrespondence };
}
type CompanionActions = ReturnType<typeof companionActions>;

function CompanionStatus({ library }: { library: CompanyLibrary }) {
  const { active, state, note } = library;
  return <>
    {(!active || state.loading) && <p role="status">Reading the company legal document library…</p>}
    {active && state.error && <div className="company-notice company-error" role="alert">{state.error} <button className="btn ghost small" type="button" onClick={library.retry}>Retry company library</button></div>}
    {active && note && <div className={`company-notice${note.tone === 'err' ? ' company-error' : ''}`} role={note.tone === 'err' ? 'alert' : 'status'}>{note.text}</div>}
  </>;
}
function CompanionDocumentCard({ document, seq, submission, library, context }: {
  document: CompanyLegalDocument; seq: Sequence; submission: Submission; library: CompanyLibrary; context: FilingContext;
}) {
  const refusal = context.refusalFor(document);
  return <label className="company-legal-card">
    <span className="company-check"><input type="radio" name={`company-legal-${seq.id}`} aria-label={document.title} aria-describedby={`company-legal-note-${document.id}`} value={document.id} checked={library.selectedId === document.id} onChange={() => { library.setSelectedId(document.id); library.setNote(null); }} /><strong>{document.title}</strong></span>
    <p className="company-hint">{document.programId === submission.programId ? 'This project' : 'Another project'} · {document.kind.replaceAll('_', ' ')} · {document.language} · version {document.version} · {document.expiresOn ? `Expires ${document.expiresOn}` : 'No expiry date'}</p>
    <p id={`company-legal-note-${document.id}`} className="company-hint">{refusal ?? 'Eligible for this filing. Select a section and record the placement reason.'}</p>
  </label>;
}
function CompanionSelectionEditor({ seq, library, selection, actions }: {
  seq: Sequence; library: CompanyLibrary; selection: CompanionSelection; actions: CompanionActions;
}) {
  if (!selection.selected) return null;
  const { crossProgram, copyBlock, sectionVerdict, locked } = selection;
  return <div className="company-register">
    {!crossProgram && <label className="company-field"><span>Company document filing section</span><input value={library.section} placeholder="For example 1.2" onChange={e => library.setSection(e.target.value)} /></label>}
    {!crossProgram && sectionVerdict.note && <p className="company-hint">{sectionVerdict.note.text}</p>}
    <PlacementReasonField value={library.reason} onChange={library.setReason} idPrefix={`company-companion-${seq.id}`} disabled={library.busy || locked} variant="inline" />
    {crossProgram ? <>
      <p className="company-hint">The original is held by another project. Copy its unchanged bytes into this submission’s project, then review and approve that copy in Vault. Approval does not transfer to a copy.</p>
      {copyBlock && <p className="company-hint">Copy unavailable: {copyBlock}</p>}
      {!library.response?.canManage && <p className="company-hint">An organization owner or administrator must register this project’s copy.</p>}
      <button type="button" className="btn small" disabled={!selection.canCopy()} onClick={() => void actions.copyToProgram()}>Copy original to this project for review</button>
    </> : <button type="button" className="btn primary small" disabled={!selection.canPlace()} onClick={() => void actions.place()}>{library.busy ? 'Placing…' : 'Place company document in sequence'}</button>}
  </div>;
}
function CompanionLibraryEditor({ props, library, context, selection, actions }: {
  props: CompanionProps; library: CompanyLibrary; context: FilingContext; selection: CompanionSelection; actions: CompanionActions;
}) {
  if (!library.response || library.state.loading) return null;
  const { seq, submission, onNav } = props;
  return <>
    {context.contextRefusal && <p className="company-notice">{context.contextRefusal}</p>}
    {selection.documents.length === 0 && <p className="company-empty">No active company legal documents are registered. An administrator can register original PDF versions in Admin → Settings → Legal document library.</p>}
    <fieldset className="company-editor" disabled={library.busy || selection.locked}>
      <div className="company-legal-list">{selection.documents.map(document => <CompanionDocumentCard key={document.id} document={document} seq={seq} submission={submission} library={library} context={context} />)}</div>
      <CompanionSelectionEditor seq={seq} library={library} selection={selection} actions={actions} />
    </fieldset>
    <p className="company-hint">The company library records applicability, not a determination that every agency requires or accepts a document. Signed originals and agency forms retain their original bytes.</p>
    {onNav && <button type="button" className="btn ghost small" onClick={() => onNav('vault')}>Open Vault to review originals or copies</button>}
  </>;
}

export function CompanySubmissionDocuments(props: CompanionProps) {
  const { seq, submission } = props;
  const auth = getAuthToken(); const org = getJwtOrgId();
  const owner = `${org}:${auth}:${seq.id}:${seq.region}:${seq.status}:${submission.id}:${submission.programId}:${submission.applicationType}`;
  const library = useCompanyLibrary(owner);
  const context = filingContext(seq, submission);
  const selection = companionSelection(library, context, seq, submission);
  const actions = companionActions(props, library, selection);
  return <section className="company-documents" aria-label="Company legal documents for this submission">
    <div className="company-section-head"><div><div className="company-eyebrow">Submission companions</div><h2>Company legal documents</h2>
      <p>Select original company documents for {context.agency ?? seq.region} · {context.country ?? 'market not identified'} · {submission.applicationType.toUpperCase()}. The source’s current approval, dates and applicability are verified again when it is placed.</p></div>
      <button type="button" className="btn ghost small" disabled={!library.active || library.busy} onClick={() => void actions.downloadCorrespondence()}>Download correspondence Word template</button></div>
    <p className="company-hint">The correspondence template follows the saved company presentation preference. It is a draft: review its content, then place the reviewed PDF explicitly from Vault. Downloading never attaches it to this sequence.</p>
    {selection.locked && <p className="company-notice">This sequence is {seq.status}. Its leaves are immutable; company documents cannot be added.</p>}
    <CompanionStatus library={library} />
    <CompanionLibraryEditor props={props} library={library} context={context} selection={selection} actions={actions} />
  </section>;
}
