import React from 'react';
import { companyLegalDocumentRefusal, type CompanyDocumentsResponse, type CompanyLegalDocument } from '@shared/company-documents';
import { canonicalRegionOf, toAgency } from '@shared/regulatory/region-identity';
import { getAuthToken } from '@/utils/authToken';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { isLocked, judgeSectionCode, matchingLeafReceipt, placementAuditWarning, placementReasonOk, PlacementReasonField, vocabularyForApplicationType, type FilingLeafReceipt } from './filingTarget';
import type { LeafWriteEffect, Notice } from './SubmissionSeqWorkspaces';
import '../styles/company-documents.css';
import { CompanyCorrespondenceDraft } from './CompanyCorrespondenceDraft';
import { CompanyFilingIdentityReview } from './CompanyFilingIdentityReview';
import { CompanyCorrespondenceVariants } from './CompanyCorrespondenceVariants';
import { CompanyLegalReadiness } from './company-documents/CompanyLegalReadiness';
import { useCompanySubmissionLibrary, type CompanyLibrary } from './useCompanySubmissionLibrary';
import { useCompanySession } from './company-documents/companySession';

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
  const canPlace = () => library.current() && !!selected && library.active && !library.busy && !locked && !selectedRefusal && sectionVerdict.placeable && placementReasonOk(library.reason);
  const canCopy = () => library.current() && library.active && !!selected && !!(library.response?.capabilities?.manageLegal ?? library.response?.canManage) && crossProgram && !copyBlock && !!submission.programId && placementReasonOk(library.reason) && !library.busy && !locked;
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
/** Throws the refusal of a non-ok render; returns quietly when this visit is no longer current. */
async function correspondenceRefusal(result: Response, current: () => boolean) {
  const body = await result.json().catch(() => null);
  if (current()) throw new Error(serverMessage(body) || 'The template download was refused.');
}

function companionActions(props: CompanionProps, library: CompanyLibrary, selection: CompanionSelection) {
  const { seq, submission, onDone } = props;
  const { selected } = selection;
  const place = async () => {
    if (!selected || !selection.canPlace()) return;
    const ticket = library.session.current.generation;
    const current = () => library.current() && ticket === library.session.current.generation;
    library.setBusy(true); library.setNote(null);
    const code = selection.sectionVerdict.canonical ?? library.section.trim();
    const result = await apiCall('POST', `${PATH}/legal-documents/${encodeURIComponent(selected.id)}/place`, { sequenceId: seq.id, sectionCode: code, reason: library.reason.trim() }, current);
    if (!result || !current()) return;
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
    const current = () => library.current() && ticket === library.session.current.generation;
    const result = await apiCall('POST', `${PATH}/legal-documents/${encodeURIComponent(selected.id)}/copy-to-program`, {
      programId: submission.programId, expectedRevision: library.response.data.revision, reason: library.reason.trim(),
    }, current);
    if (!result || !current()) return;
    library.setBusy(false);
    if (!result.ok || !confirmedCopy(result.body)) {
      library.setNote({ tone: 'err', text: apiErrorText(result, 'The copy could not be confirmed. Check the target project’s Vault before retrying.') }); return;
    }
    if (profileResponse(result.body.library)) library.setResponse(result.body.library);
    library.setNote({ tone: 'warn', text: result.body.message });
    library.setSelectedId(''); library.setReason('');
  };
  const downloadCorrespondence = async () => {
    if (!library.current() || !library.active || library.busy) return;
    const ticket = library.session.current.generation;
    const current = () => library.current() && ticket === library.session.current.generation;
    library.setBusy(true); library.setNote(null);
    const title = `${submission.title || `Submission ${submission.id}`} — correspondence`;
    try {
      const result = await apiRequest('POST', `${PATH}/letterhead/render`, { purpose: 'submission', sequenceId: seq.id,
        ...(library.variantId ? { variantId: library.variantId } : {}), title });
      if (!current()) return;
      if (!result.ok) { await correspondenceRefusal(result, current); return; }
      const blob = await result.blob();
      if (!current()) return;
      if (!downloadBlob(`${safeFileName(submission.title || `Submission ${submission.id}`)}-correspondence.docx`, blob)) throw new Error('The browser could not save the template.');
      library.setNote({ tone: 'ok', text: 'Correspondence Word template downloaded using the saved company presentation preference. Review the draft content and place its reviewed PDF explicitly from Vault before including it in a submission.' });
    } catch (error) {
      if (current()) library.setNote({ tone: 'err', text: 'Correspondence template download failed. ' + (error instanceof Error ? error.message : '') });
    } finally { if (current()) library.setBusy(false); }
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
function CompanionLibraryFilters({ library }: { library: CompanyLibrary }) {
  const page = library.page;
  return <div className="company-register">
    <form role="search" onSubmit={event => { event.preventDefault(); library.search(); }}>
      <label className="company-field"><span>Search company legal documents</span><input value={library.searchText} maxLength={200} onChange={event => library.setSearchText(event.target.value)} /></label>
      <button type="submit" className="btn small" disabled={library.state.loading}>Search legal inventory</button>
      <label className="company-check"><input type="checkbox" checked={library.allPrograms} onChange={event => library.setAllPrograms(event.target.checked)} />Include other accessible projects for copying</label>
    </form>
    {page && <div><p>{page.total ? `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} of ${page.total} matching documents` : 'No matching documents'}</p>
      <button type="button" className="btn ghost small" disabled={page.offset === 0 || library.state.loading} onClick={() => library.goToOffset(Math.max(0, page.offset - page.limit))}>Previous legal documents</button>
      <button type="button" className="btn ghost small" disabled={!page.hasMore || library.state.loading} onClick={() => library.goToOffset(page.nextOffset!)}>Next legal documents</button>
    </div>}
  </div>;
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
      {!(library.response?.capabilities?.manageLegal ?? library.response?.canManage) && <p className="company-hint">A company legal custodian must register this project’s copy.</p>}
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
    {selection.documents.length === 0 && <p className="company-empty">No registered company legal documents match these project and search filters. Adjust the filters or register an original PDF in Company documents settings.</p>}
    <fieldset className="company-editor" disabled={library.busy || selection.locked}>
      <div className="company-legal-list">{selection.documents.map(document => <CompanionDocumentCard key={document.id} document={document} seq={seq} submission={submission} library={library} context={context} />)}</div>
      <CompanionSelectionEditor seq={seq} library={library} selection={selection} actions={actions} />
    </fieldset>
    <p className="company-hint">The company library records applicability, not a determination that every agency requires or accepts a document. Signed originals and agency forms retain their original bytes.</p>
    {onNav && <button type="button" className="btn ghost small" onClick={() => onNav('vault')}>Open Vault to review originals or copies</button>}
  </>;
}

function CompanyCorrespondenceWorkflows({ props, library, auth }: { props: CompanionProps; library: CompanyLibrary; auth: ReturnType<typeof getAuthToken> }) {
  const { seq, submission } = props;
  return <>
    {library.response && <CompanyCorrespondenceVariants sequenceId={seq.id} value={library.variantId} onChange={library.setVariantId} current={() => library.active && Boolean(library.response) && library.current()} />}
    <CompanyCorrespondenceDraft sequenceId={seq.id} programId={submission.programId} submissionTitle={submission.title || `Submission ${submission.id}`} onNav={props.onNav} variantId={library.variantId || undefined} current={() => library.active && Boolean(library.response) && library.current()} />
    {library.response && <CompanyFilingIdentityReview sequenceId={seq.id} profileRevision={library.response.data.revision}
      canReview={library.response.capabilities?.manageLegal ?? library.response.canManage} variantId={library.variantId || undefined} current={() => library.active && Boolean(library.response) && library.current()} />}
    {library.response && auth && <CompanyLegalReadiness sequenceId={seq.id} profile={library.response.data} token={auth}
      canManage={library.response.capabilities?.manageLegal ?? library.response.canManage} onSaved={library.setResponse} />}
  </>;
}

export function CompanySubmissionDocuments(props: CompanionProps) {
  const { seq, submission } = props;
  const auth = getAuthToken(); const session = useCompanySession();
  const owner = JSON.stringify([session.key, seq.id, seq.region, seq.status, submission.id, submission.programId, submission.applicationType]);
  const library = useCompanySubmissionLibrary(owner, submission.programId, session);
  const context = filingContext(seq, submission);
  const selection = companionSelection(library, context, seq, submission);
  const actions = companionActions(props, library, selection);
  return <section className="company-documents" aria-label="Company legal documents for this submission">
    <div className="company-section-head"><div><div className="company-eyebrow">Submission companions</div><h2>Company legal documents</h2>
      <p>Select original company documents for {context.agency ?? seq.region} · {context.country ?? 'market not identified'} · {submission.applicationType.toUpperCase()}. The source’s current approval, dates and applicability are verified again when it is placed.</p></div>
      <button type="button" className="btn ghost small" disabled={!library.active || library.busy} onClick={() => void actions.downloadCorrespondence()}>Download correspondence Word template</button></div>
    <p className="company-hint">The correspondence template follows the saved company presentation preference. It is a draft: review its content, then place the reviewed PDF explicitly from Vault. Downloading never attaches it to this sequence.</p>
    <CompanyCorrespondenceWorkflows props={props} library={library} auth={auth} />
    {selection.locked && <p className="company-notice">This sequence is {seq.status}. Its leaves are immutable; company documents cannot be added.</p>}
    <CompanionLibraryFilters library={library} />
    <CompanionStatus library={library} />
    <CompanionLibraryEditor props={props} library={library} context={context} selection={selection} actions={actions} />
  </section>;
}
