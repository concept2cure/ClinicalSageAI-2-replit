import { useEffect, useRef, useState } from 'react';
import { apiRequest, apiUpload, serverMessage } from '@/lib/queryClient';
import type { CompanyDocumentProfile, CompanyDocumentsResponse, CompanyLegalDocument, CompanyLegalKind } from '@shared/company-documents';
import { normalizeTemplateSpec, type TemplateSpec } from '@shared/templates/template-spec';
import { apiCall, apiErrorText, type ApiResult } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';

export const COMPANY_DOCUMENTS_PATH = '/api/client-branding/company-documents';
const PATH = COMPANY_DOCUMENTS_PATH;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function validResponse(value: unknown): value is CompanyDocumentsResponse {
  const v = value as CompanyDocumentsResponse | null;
  return Boolean(v && typeof v.canManage === 'boolean' && v.data?.version === 1 &&
    Number.isSafeInteger(v.data.revision) && typeof v.data.companyName === 'string' &&
    v.data.letterhead?.specVersion === 1 && Array.isArray(v.data.legalDocuments));
}
const editable = (p: CompanyDocumentProfile) => ({
  companyName: p.companyName, address: p.address, contact: p.contact, registrationDetails: p.registrationDetails,
  letterhead: p.letterhead, importedFrom: p.importedFrom,
  applyToReports: p.applyToReports, applyToSubmissionCorrespondence: p.applyToSubmissionCorrespondence,
});

const emptyLegal = () => ({ title: '', kind: 'authorization' as CompanyLegalKind, programId: '', vaultDocumentId: '', agencies: '', countries: '', submissionTypes: '', language: 'en', effectiveOn: '', expiresOn: '' });


function useCompanyDocumentState() {
  const org = getJwtOrgId();
  const authSession = getAuthToken();
  const identity = `${org}:${authSession}`;
  const [viewIdentity, setViewIdentity] = useState(identity);
  const currentView = viewIdentity === identity;
  const [saved, setSaved] = useState<CompanyDocumentProfile | null>(null);
  const [draft, setDraft] = useState<CompanyDocumentProfile | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState('');
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [conflict, setConflict] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [legal, setLegal] = useState(emptyLegal);
  const [legalReason, setLegalReason] = useState('');
  const [tab, setTab] = useState<'identity' | 'design' | 'legal'>('identity');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const session = useRef(0);
  const current = useRef(0);
  const dirty = !!saved && !!draft && JSON.stringify(editable(saved)) !== JSON.stringify(editable(draft));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const load = async (epoch = session.current, replaceDraft = true) => {
    setLoading(true); setReadError('');
    const result = await apiCall('GET', PATH);
    if (epoch !== session.current) return;
    setLoading(false);
    if (!result.ok || !validResponse(result.body)) {
      setReadError(apiErrorText(result, 'Company document settings could not be read.'));
      return;
    }
    setSaved(copy(result.body.data)); setCanManage(result.body.canManage);
    if (replaceDraft) setDraft(copy(result.body.data));
    setConflict(false);
  };
  useEffect(() => {
    const epoch = ++session.current;
    setViewIdentity(identity);
    setSaved(null); setDraft(null); setCanManage(false); setBusy(false); setNotice(null); setLegal(emptyLegal());
    setReason(''); setLegalReason(''); setWarnings([]); setConflict(false);
    setArchiveId(null); setArchiveReason(''); setShowArchived(false); setTab('identity');
    void load(epoch);
    const pendingSession = session; const pendingRequest = current;
    return () => { pendingSession.current++; pendingRequest.current++; };
  }, [identity]);

  const patch = (values: Partial<CompanyDocumentProfile>) => setDraft(p => p ? { ...p, ...values } : p);
  const spec = (change: (value: TemplateSpec) => TemplateSpec) => setDraft(p => p ? { ...p, letterhead: change(p.letterhead) } : p);
  return { currentView, saved, setSaved, draft, setDraft, canManage, setCanManage, loading, setLoading, busy, setBusy, readError, setReadError, notice, setNotice, reason, setReason, conflict, setConflict, warnings, setWarnings, legal, setLegal, legalReason, setLegalReason, tab, setTab, showArchived, setShowArchived, archiveId, setArchiveId, archiveReason, setArchiveReason, session, current, dirty, dirtyRef, load, patch, spec };
}
type SettingsState = ReturnType<typeof useCompanyDocumentState>;

type MutationMode = 'design' | 'legal';

function mutationFailure(state: SettingsState, result: ApiResult) {
  const code = (result.body as { error?: unknown } | null)?.error;
  const conflict = result.status === 409 && (code === 'REVISION_CONFLICT' || code === 'COMPANY_DOCUMENTS_CONFLICT');
  state.setBusy(false); state.setConflict(conflict);
  state.setNotice({ error: true, text: conflict
    ? 'Another administrator changed this profile. Your draft is kept. Reload the saved profile before applying your changes again.'
    : apiErrorText(result, 'The change could not be confirmed. Your draft is kept; reload the saved profile before retrying if the connection was interrupted.') });
}

function applyMutationReceipt(state: SettingsState, receipt: CompanyDocumentsResponse, reread: ApiResult, mode: MutationMode) {
  const verified = reread.ok && validResponse(reread.body) && reread.body.data.revision === receipt.data.revision;
  const latest = verified ? reread.body as CompanyDocumentsResponse : receipt;
  const profile = copy(latest.data);
  state.setBusy(false); state.setSaved(profile); state.setCanManage(latest.canManage);
  state.setDraft(previous => mode === 'design' ? copy(profile) : previous ? { ...previous, revision: profile.revision, legalDocuments: profile.legalDocuments } : copy(profile));
  state.setConflict(!verified);
  state.setNotice({ error: !verified, text: mutationReceiptMessage(profile.revision, verified, mode) });
  if (mode === 'design') { state.setReason(''); state.setWarnings([]); }
  else { state.setLegal(emptyLegal()); state.setLegalReason(''); state.setArchiveId(null); state.setArchiveReason(''); }
}

function mutationReceiptMessage(revision: number, verified: boolean, mode: MutationMode) {
  if (!verified) return `The server recorded revision ${revision}, but the latest saved profile could not be verified. Reload before making another change.`;
  return mode === 'design' ? `Company identity and letterhead saved · revision ${revision}.` : 'Legal document library updated. Source files and their approval records are unchanged.';
}

function useCompanyDocumentMutation(state: SettingsState) {
  const { saved, draft, canManage, busy, session, current, setBusy, setNotice, reason } = state;
  const mutation = async (method: 'PUT' | 'POST' | 'DELETE', path: string, values: unknown, mode: MutationMode) => {
    if (!saved || !draft || !canManage || busy) return;
    const epoch = session.current; const ticket = ++current.current;
    setBusy(true); setNotice(null);
    const result = await apiCall(method, path, values);
    if (epoch !== session.current || ticket !== current.current) return;
    if (!result.ok || !validResponse(result.body)) { mutationFailure(state, result); return; }
    const reread = await apiCall('GET', PATH);
    if (epoch !== session.current || ticket !== current.current) return;
    applyMutationReceipt(state, result.body, reread, mode);
  };
  const save = () => draft && saved && mutation('PUT', PATH, { expectedRevision: saved.revision, reason: reason.trim(), ...editable(draft) }, 'design');
  return { mutation, save };
}

async function extractCompanyTemplate(file: File) {
  const form = new FormData(); form.append('file', file, file.name);
  const response = await apiUpload('POST', `${PATH}/letterhead/extract`, form);
  const body = await response.json();
  if (!response.ok || !body?.spec) throw new Error(serverMessage(body) || 'Formatting could not be extracted.');
  return { letterhead: normalizeTemplateSpec(body.spec), warnings: Array.isArray(body.warnings) ? body.warnings.filter((x: unknown) => typeof x === 'string') as string[] : [] };
}

function useCompanyDocumentFiles(state: SettingsState) {
  const { canManage, busy, session, current, setBusy, setNotice, patch, setWarnings, spec } = state;
  const importFile = async (file?: File) => {
    if (!file || !canManage || busy) return;
    if (!/\.(docx|pdf)$/i.test(file.name) || file.size > 15 * 1024 * 1024) {
      setNotice({ error: true, text: 'Choose a Word (.docx) or PDF file up to 15 MB.' }); return;
    }
    const epoch = session.current; const ticket = ++current.current;
    setBusy(true); setNotice(null);
    try {
      const extracted = await extractCompanyTemplate(file);
      if (epoch !== session.current || ticket !== current.current) return;
      patch({ letterhead: extracted.letterhead, importedFrom: file.name });
      setWarnings(extracted.warnings);
      setNotice({ error: false, text: 'Formatting imported into your draft. Review the preview and extraction warnings, then save. The original document is unchanged.' });
    } catch (error) {
      if (epoch === session.current) setNotice({ error: true, text: 'Import failed. Your previous design is kept. ' + (error instanceof Error ? error.message : '') });
    } finally { if (epoch === session.current) setBusy(false); }
  };
  const uploadLogo = async (file?: File) => {
    if (!file || !canManage || busy) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setNotice({ error: true, text: 'Choose a PNG, JPEG or GIF logo up to 2 MB.' }); return;
    }
    const epoch = session.current;
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The logo could not be read.')); reader.readAsDataURL(file); });
      if (epoch !== session.current) return;
      spec(s => ({ ...s, brand: { ...s.brand, logo: { dataBase64: data.split(',')[1], mimeType: file.type, placement: 'header' } }, header: { ...s.header, showLogo: true } }));
      setNotice({ error: false, text: 'Logo added to your draft. Save the letterhead to use it in documents.' });
    } catch { if (epoch === session.current) setNotice({ error: true, text: 'The logo could not be read. Your previous design is kept.' }); }
    finally { if (epoch === session.current) setBusy(false); }
  };
  return { importFile, uploadLogo };
}

function useCompanyDocumentDownloads(state: SettingsState) {
  const { session, setBusy, setNotice, saved } = state;
  const download = async () => {
    const epoch = session.current; setBusy(true); setNotice(null);
    try {
      const res = await apiRequest('POST', `${PATH}/letterhead/render`, { title: 'Regulatory correspondence', paragraphs: ['Recipient and submission reference', 'Prepare your correspondence here.'] });
      if (!res.ok) throw new Error(serverMessage(await res.json()) || 'The download was refused.');
      const blob = await res.blob();
      if (epoch !== session.current) return;
      if (!downloadBlob(`${safeFileName(saved?.companyName || 'Company')}-letterhead.docx`, blob)) throw new Error('The browser could not save the file.');
      setNotice({ error: false, text: `Saved Word letterhead downloaded from revision ${saved?.revision}.` });
    } catch (e) { if (epoch === session.current) setNotice({ error: true, text: 'Letterhead download failed. ' + (e instanceof Error ? e.message : '') }); }
    finally { if (epoch === session.current) setBusy(false); }
  };
  const downloadOriginal = async (document: CompanyLegalDocument) => {
    const epoch = session.current; setBusy(true); setNotice(null);
    try {
      const path = `/api/c2c/project-vault/${encodeURIComponent(document.programId)}/documents/${encodeURIComponent(document.vaultDocumentId)}/download`;
      const res = await apiRequest('GET', path);
      if (!res.ok) throw new Error(serverMessage(await res.json()) || 'The Vault refused this download.');
      const blob = await res.blob();
      if (epoch !== session.current) return;
      if (!downloadBlob(`${safeFileName(document.title)}-v${safeFileName(document.version)}.pdf`, blob)) throw new Error('The browser could not save the file.');
      setNotice({ error: false, text: `Original ${document.title}, version ${document.version}, downloaded from Vault.` });
    } catch (e) { if (epoch === session.current) setNotice({ error: true, text: 'Original download failed. ' + (e instanceof Error ? e.message : '') }); }
    finally { if (epoch === session.current) setBusy(false); }
  };

  return { download, downloadOriginal };
}

export function useCompanyDocumentSettings() {
  const state = useCompanyDocumentState();
  const mutations = useCompanyDocumentMutation(state);
  const files = useCompanyDocumentFiles(state);
  const downloads = useCompanyDocumentDownloads(state);
  return { ...state, ...mutations, ...files, ...downloads };
}
export type CompanyDocumentSettingsModel = ReturnType<typeof useCompanyDocumentSettings>;
