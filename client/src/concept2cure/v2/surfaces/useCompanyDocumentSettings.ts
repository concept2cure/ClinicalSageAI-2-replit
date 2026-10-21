import { useEffect, useRef, useState } from 'react';
import { apiRequest, apiUpload, serverMessage } from '@/lib/queryClient';
import type { CompanyDocumentCapabilities, CompanyDocumentProfile, CompanyLegalDocument } from '@shared/company-documents';
import { normalizeTemplateSpec, type TemplateSpec } from '@shared/templates/template-spec';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import { companyCapabilitiesOf as capabilitiesOf, copyCompanyValue as copy, editableCompanyProfile as editable, companyPresentation as presentation, emptyCompanyLegal as emptyLegal, validCompanyDocumentsResponse as validResponse, companyProtectedPresentationChanged, MUTATION_CAPABILITY, type CompanyMutationMode } from './company-documents/companyDocumentsData';
import { applyCompanyMutationReceipt, companyMutationFailure } from './company-documents/companySettingsReceipt';

export const COMPANY_DOCUMENTS_PATH = '/api/client-branding/company-documents';
const PATH = COMPANY_DOCUMENTS_PATH;
const READ_PATH = `${PATH}?includeLegal=false`;
const NO_CAPABILITIES: CompanyDocumentCapabilities = { manageBrand: false, manageLegal: false, managePermissions: false };

function useCompanyDocumentState() {
  const org = getJwtOrgId();
  const authSession = getAuthToken();
  const identity = `${org}:${authSession}`;
  const [viewIdentity, setViewIdentity] = useState(identity);
  const currentView = viewIdentity === identity;
  const [saved, setSaved] = useState<CompanyDocumentProfile | null>(null);
  const [draft, setDraft] = useState<CompanyDocumentProfile | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [legalDocumentsIncluded, setLegalDocumentsIncluded] = useState(false);
  const [capabilities, setCapabilities] = useState(NO_CAPABILITIES);
  const [legacyDecision, setLegacyDecision] = useState<'replace' | undefined>();
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
  const dirty = !!saved && !!draft && (legacyDecision === 'replace' || JSON.stringify(editable(saved)) !== JSON.stringify(editable(draft)));
  const designSaveBlocked = Boolean(saved?.brandingApprovalRequired && draft && companyProtectedPresentationChanged(saved, draft));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const load = async (epoch = session.current, replaceDraft = true) => {
    setLoading(true); setReadError('');
    const result = await apiCall('GET', READ_PATH);
    if (epoch !== session.current) return;
    setLoading(false);
    if (!result.ok || !validResponse(result.body)) {
      setReadError(apiErrorText(result, 'Company document settings could not be read.'));
      return;
    }
    setSaved(copy(result.body.data)); setCanManage(result.body.canManage);
    setLegalDocumentsIncluded(result.body.legalDocumentsIncluded !== false);
    setCapabilities(capabilitiesOf(result.body));
    if (replaceDraft) setDraft(copy(result.body.data));
    setConflict(false);
  };
  useEffect(() => {
    const epoch = ++session.current;
    setViewIdentity(identity);
    setSaved(null); setDraft(null); setCanManage(false); setBusy(false); setNotice(null); setLegal(emptyLegal());
    setLegalDocumentsIncluded(false);
    setCapabilities(NO_CAPABILITIES); setLegacyDecision(undefined);
    setReason(''); setLegalReason(''); setWarnings([]); setConflict(false);
    setArchiveId(null); setArchiveReason(''); setShowArchived(false); setTab('identity');
    void load(epoch);
    const pendingSession = session; const pendingRequest = current;
    return () => { pendingSession.current++; pendingRequest.current++; };
  }, [identity]);

  const patch = (values: Partial<CompanyDocumentProfile>) => setDraft(p => p ? { ...p, ...values } : p);
  const spec = (change: (value: TemplateSpec) => TemplateSpec) => setDraft(p => p ? { ...p, letterhead: change(p.letterhead) } : p);
  return { currentView, saved, setSaved, draft, setDraft, canManage, setCanManage, legalDocumentsIncluded, setLegalDocumentsIncluded, capabilities, setCapabilities, legacyDecision, setLegacyDecision, loading, setLoading, busy, setBusy, readError, setReadError, notice, setNotice, reason, setReason, conflict, setConflict, warnings, setWarnings, legal, setLegal, legalReason, setLegalReason, tab, setTab, showArchived, setShowArchived, archiveId, setArchiveId, archiveReason, setArchiveReason, session, current, dirty, dirtyRef, designSaveBlocked, load, patch, spec };
}
export type CompanyDocumentSettingsState = ReturnType<typeof useCompanyDocumentState>;
type SettingsState = CompanyDocumentSettingsState;

function useCompanyDocumentMutation(state: SettingsState) {
  const { saved, draft, capabilities, busy, session, current, setBusy, setNotice, reason } = state;
  const mutation = async (method: 'PUT' | 'POST' | 'DELETE', path: string, values: unknown, mode: CompanyMutationMode) => {
    const permitted = capabilities[MUTATION_CAPABILITY[mode]];
    if (!saved || !draft || !permitted || busy) return;
    const epoch = session.current; const ticket = ++current.current;
    setBusy(true); setNotice(null);
    const result = await apiCall(method, path, values);
    if (epoch !== session.current || ticket !== current.current) return;
    if (!result.ok || !validResponse(result.body)) { companyMutationFailure(state, result); return; }
    const reread = await apiCall('GET', READ_PATH);
    if (epoch !== session.current || ticket !== current.current) return;
    applyCompanyMutationReceipt(state, result.body, reread, mode);
  };
  const save = () => draft && saved && mutation('PUT', PATH, { expectedRevision: saved.revision, reason: reason.trim(), ...editable(draft), ...(state.legacyDecision ? { legacyDecision: state.legacyDecision } : {}) }, 'design');
  const adoptLegacy = (sourceHash: string, adoptionReason: string) => saved && mutation('POST', `${PATH}/legacy-adoption`, { expectedRevision: saved.revision, sourceHash, reason: adoptionReason.trim() }, 'design');
  return { mutation, save, adoptLegacy };
}

async function extractCompanyTemplate(file: File) {
  const form = new FormData(); form.append('file', file, file.name);
  const response = await apiUpload('POST', `${PATH}/letterhead/extract`, form);
  const body = await response.json();
  if (!response.ok || !body?.spec) throw new Error(serverMessage(body) || 'Formatting could not be extracted.');
  return { letterhead: normalizeTemplateSpec(body.spec), warnings: Array.isArray(body.warnings) ? body.warnings.filter((x: unknown) => typeof x === 'string') as string[] : [] };
}

function useCompanyDocumentFiles(state: SettingsState) {
  const { capabilities, busy, session, current, setBusy, setNotice, patch, setWarnings, spec } = state;
  const importFile = async (file?: File) => {
    if (!file || !capabilities.manageBrand || busy) return;
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
    if (!file || !capabilities.manageBrand || busy) return;
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

async function requestLetterheadDownload(saved: CompanyDocumentProfile, draft: CompanyDocumentProfile, preview: boolean) {
  const path = `${PATH}/letterhead/${preview ? 'preview' : 'render'}`;
  const body = { title: 'Regulatory correspondence', paragraphs: ['Recipient and submission reference', 'Prepare your correspondence here.'], ...(preview ? { profile: presentation(draft) } : {}) };
  const res = await apiRequest('POST', path, body);
  if (!res.ok) throw new Error(serverMessage(await res.json()) || 'The download was refused.');
  const name = safeFileName((preview ? draft : saved).companyName || 'Company');
  return { blob: await res.blob(), name: `${name}-letterhead${preview ? '-unsaved-proof' : ''}.docx`, message: preview ? 'Unsaved Word proof downloaded for review. The presentation has not been saved or activated.' : `Saved Word letterhead downloaded from revision ${saved.revision}.` };
}

function useCompanyDocumentDownloads(state: SettingsState) {
  const { session, setBusy, setNotice, saved, draft, capabilities } = state;
  const downloadPresentation = async (preview: boolean) => {
    if (!saved || !draft || state.busy || (preview && !capabilities.manageBrand)) return;
    const epoch = session.current; const token = getAuthToken(); setBusy(true); setNotice(null);
    try {
      const result = await requestLetterheadDownload(saved, draft, preview);
      if (epoch !== session.current || token !== getAuthToken()) return;
      if (!downloadBlob(result.name, result.blob)) throw new Error('The browser could not save the file.');
      setNotice({ error: false, text: result.message });
    } catch (e) { if (epoch === session.current) setNotice({ error: true, text: 'Letterhead download failed. ' + (e instanceof Error ? e.message : '') }); }
    finally { if (epoch === session.current) setBusy(false); }
  };
  const downloadOriginal = async (document: CompanyLegalDocument) => {
    const epoch = session.current; const token = getAuthToken(); setBusy(true); setNotice(null);
    try {
      const path = `/api/c2c/project-vault/${encodeURIComponent(document.programId)}/documents/${encodeURIComponent(document.vaultDocumentId)}/download`;
      const res = await apiRequest('GET', path);
      if (!res.ok) throw new Error(serverMessage(await res.json()) || 'The Vault refused this download.');
      const blob = await res.blob();
      if (epoch !== session.current || token !== getAuthToken()) return;
      if (!downloadBlob(`${safeFileName(document.title)}-v${safeFileName(document.version)}.pdf`, blob)) throw new Error('The browser could not save the file.');
      setNotice({ error: false, text: `Original ${document.title}, version ${document.version}, downloaded from Vault.` });
    } catch (e) { if (epoch === session.current) setNotice({ error: true, text: 'Original download failed. ' + (e instanceof Error ? e.message : '') }); }
    finally { if (epoch === session.current) setBusy(false); }
  };

  return { download: () => downloadPresentation(false), downloadProof: () => downloadPresentation(true), downloadOriginal };
}

export function useCompanyDocumentSettings() {
  const state = useCompanyDocumentState();
  const mutations = useCompanyDocumentMutation(state);
  const files = useCompanyDocumentFiles(state);
  const downloads = useCompanyDocumentDownloads(state);
  return { ...state, ...mutations, ...files, ...downloads };
}
export type CompanyDocumentSettingsModel = ReturnType<typeof useCompanyDocumentSettings>;
