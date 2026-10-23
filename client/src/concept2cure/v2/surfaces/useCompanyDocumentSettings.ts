import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, apiUpload, serverMessage } from '@/lib/queryClient';
import type { CompanyDocumentCapabilities, CompanyDocumentProfile, CompanyLegalDocument } from '@shared/company-documents';
import { normalizeTemplateSpec, type TemplateSpec } from '@shared/templates/template-spec';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { companySetter, useCompanyLease, useCompanySession } from './company-documents/companySession';
import { companyCapabilitiesOf as capabilitiesOf, copyCompanyValue as copy, editableCompanyProfile as editable, companyPresentation as presentation, emptyCompanyLegal as emptyLegal, validCompanyDocumentsResponse as validResponse, companyProtectedPresentationChanged, MUTATION_CAPABILITY, type CompanyMutationMode } from './company-documents/companyDocumentsData';
import { applyCompanyMutationReceipt, companyMutationFailure } from './company-documents/companySettingsReceipt';

export const COMPANY_DOCUMENTS_PATH = '/api/client-branding/company-documents';
const PATH = COMPANY_DOCUMENTS_PATH;
const READ_PATH = `${PATH}?includeLegal=false`;
const NO_CAPABILITIES: CompanyDocumentCapabilities = { manageBrand: false, manageLegal: false, managePermissions: false };

function useCompanyDocumentState() {
  const owner = useCompanySession();
  const lease = useCompanyLease(owner, 'company-settings');
  const identity = owner.key;
  const [viewIdentity, setViewIdentity] = useState(identity);
  const currentView = viewIdentity === identity && lease.current();
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
  const reads = useRef(0);
  const dirty = !!saved && !!draft && (legacyDecision === 'replace' || JSON.stringify(editable(saved)) !== JSON.stringify(editable(draft)));
  const designSaveBlocked = Boolean(saved?.brandingApprovalRequired && draft && companyProtectedPresentationChanged(saved, draft));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const load = useCallback(async (epoch = session.current, replaceDraft = true) => {
    if (!lease.current()) return;
    const ticket = ++reads.current;
    const isCurrent = () => lease.current() && epoch === session.current && ticket === reads.current;
    setLoading(true); setReadError('');
    const result = await apiCall('GET', READ_PATH, undefined, isCurrent);
    if (!result || !isCurrent()) return;
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
  }, [lease]);
  useEffect(() => {
    const epoch = ++session.current;
    setViewIdentity(identity);
    setSaved(null); setDraft(null); setCanManage(false); setBusy(false); setNotice(null); setLegal(emptyLegal());
    setLegalDocumentsIncluded(false);
    setCapabilities(NO_CAPABILITIES); setLegacyDecision(undefined);
    setReason(''); setLegalReason(''); setWarnings([]); setConflict(false);
    setArchiveId(null); setArchiveReason(''); setShowArchived(false); setTab('identity');
    if (lease.current()) void load(epoch);
    else { setLoading(false); setReadError('Sign in to read company document settings.'); }
    const pendingSession = session; const pendingRequest = current;
    return () => { pendingSession.current++; pendingRequest.current++; };
  }, [identity, lease, load]);

  const guardedDraft = companySetter(lease.current, setDraft);
  const patch = (values: Partial<CompanyDocumentProfile>) => guardedDraft(p => p ? { ...p, ...values } : p);
  const spec = (change: (value: TemplateSpec) => TemplateSpec) => guardedDraft(p => p ? { ...p, letterhead: change(p.letterhead) } : p);
  return { currentView, saved, setSaved: companySetter(lease.current, setSaved), draft, setDraft: guardedDraft,
    canManage, setCanManage: companySetter(lease.current, setCanManage), legalDocumentsIncluded, setLegalDocumentsIncluded: companySetter(lease.current, setLegalDocumentsIncluded),
    capabilities, setCapabilities: companySetter(lease.current, setCapabilities), legacyDecision, setLegacyDecision: companySetter(lease.current, setLegacyDecision),
    loading, setLoading: companySetter(lease.current, setLoading), busy, setBusy: companySetter(lease.current, setBusy), readError, setReadError: companySetter(lease.current, setReadError),
    notice, setNotice: companySetter(lease.current, setNotice), reason, setReason: companySetter(lease.current, setReason), conflict, setConflict: companySetter(lease.current, setConflict),
    warnings, setWarnings: companySetter(lease.current, setWarnings), legal, setLegal: companySetter(lease.current, setLegal), legalReason, setLegalReason: companySetter(lease.current, setLegalReason),
    tab, setTab: companySetter(lease.current, setTab), showArchived, setShowArchived: companySetter(lease.current, setShowArchived), archiveId, setArchiveId: companySetter(lease.current, setArchiveId),
    archiveReason, setArchiveReason: companySetter(lease.current, setArchiveReason), session, current, isCurrent: lease.current, dirty, dirtyRef, designSaveBlocked, load, patch, spec };
}
export type CompanyDocumentSettingsState = ReturnType<typeof useCompanyDocumentState>;
type SettingsState = CompanyDocumentSettingsState;

function useCompanyDocumentMutation(state: SettingsState) {
  const { saved, draft, capabilities, busy, session, current, setBusy, setNotice, reason } = state;
  const mutation = async (method: 'PUT' | 'POST' | 'DELETE', path: string, values: unknown, mode: CompanyMutationMode) => {
    const permitted = capabilities[MUTATION_CAPABILITY[mode]];
    if (!state.isCurrent() || !saved || !draft || !permitted || busy) return;
    const epoch = session.current; const ticket = ++current.current;
    setBusy(true); setNotice(null);
    const isCurrent = () => state.isCurrent() && epoch === session.current && ticket === current.current;
    const result = await apiCall(method, path, values, isCurrent);
    if (!result || !isCurrent()) return;
    if (!result.ok || !validResponse(result.body)) { companyMutationFailure(state, result); return; }
    const reread = await apiCall('GET', READ_PATH, undefined, isCurrent);
    if (!reread || !isCurrent()) return;
    applyCompanyMutationReceipt(state, result.body, reread, mode);
  };
  const save = () => draft && saved && mutation('PUT', PATH, { expectedRevision: saved.revision, reason: reason.trim(), ...editable(draft), ...(state.legacyDecision ? { legacyDecision: state.legacyDecision } : {}) }, 'design');
  const adoptLegacy = (sourceHash: string, adoptionReason: string) => saved && mutation('POST', `${PATH}/legacy-adoption`, { expectedRevision: saved.revision, sourceHash, reason: adoptionReason.trim() }, 'design');
  return { mutation, save, adoptLegacy };
}

async function extractCompanyTemplate(file: File, current: () => boolean) {
  const form = new FormData(); form.append('file', file, file.name);
  if (!current()) return null;
  const response = await apiUpload('POST', `${PATH}/letterhead/extract`, form);
  if (!current()) return null;
  const body = await response.json();
  if (!current()) return null;
  if (!response.ok || !body?.spec) throw new Error(serverMessage(body) || 'Formatting could not be extracted.');
  return { letterhead: normalizeTemplateSpec(body.spec), warnings: Array.isArray(body.warnings) ? body.warnings.filter((x: unknown) => typeof x === 'string') as string[] : [] };
}

function useCompanyDocumentFiles(state: SettingsState) {
  const { capabilities, busy, session, current, setBusy, setNotice, patch, setWarnings, spec } = state;
  const importFile = async (file?: File) => {
    if (!state.isCurrent() || !file || !capabilities.manageBrand || busy) return;
    if (!/\.(docx|pdf)$/i.test(file.name) || file.size > 15 * 1024 * 1024) {
      setNotice({ error: true, text: 'Choose a Word (.docx) or PDF file up to 15 MB.' }); return;
    }
    const epoch = session.current; const ticket = ++current.current;
    const isCurrent = () => state.isCurrent() && epoch === session.current && ticket === current.current;
    setBusy(true); setNotice(null);
    try {
      const extracted = await extractCompanyTemplate(file, isCurrent);
      if (!extracted || !isCurrent()) return;
      patch({ letterhead: extracted.letterhead, importedFrom: file.name });
      setWarnings(extracted.warnings);
      setNotice({ error: false, text: 'Formatting imported into your draft. Review the preview and extraction warnings, then save. The original document is unchanged.' });
    } catch (error) {
      if (isCurrent()) setNotice({ error: true, text: 'Import failed. Your previous design is kept. ' + (error instanceof Error ? error.message : '') });
    } finally { if (isCurrent()) setBusy(false); }
  };
  const uploadLogo = async (file?: File) => {
    if (!state.isCurrent() || !file || !capabilities.manageBrand || busy) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setNotice({ error: true, text: 'Choose a PNG, JPEG or GIF logo up to 2 MB.' }); return;
    }
    const epoch = session.current; const ticket = ++current.current;
    const isCurrent = () => state.isCurrent() && epoch === session.current && ticket === current.current;
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The logo could not be read.')); reader.readAsDataURL(file); });
      if (!isCurrent()) return;
      spec(s => ({ ...s, brand: { ...s.brand, logo: { dataBase64: data.split(',')[1], mimeType: file.type, placement: 'header' } }, header: { ...s.header, showLogo: true } }));
      setNotice({ error: false, text: 'Logo added to your draft. Save the letterhead to use it in documents.' });
    } catch { if (isCurrent()) setNotice({ error: true, text: 'The logo could not be read. Your previous design is kept.' }); }
    finally { if (isCurrent()) setBusy(false); }
  };
  return { importFile, uploadLogo };
}

async function requestLetterheadDownload(saved: CompanyDocumentProfile, draft: CompanyDocumentProfile, preview: boolean, current: () => boolean) {
  const path = `${PATH}/letterhead/${preview ? 'preview' : 'render'}`;
  const body = { title: 'Regulatory correspondence', paragraphs: ['Recipient and submission reference', 'Prepare your correspondence here.'], ...(preview ? { profile: presentation(draft) } : {}) };
  if (!current()) return null;
  const res = await apiRequest('POST', path, body);
  if (!current()) return null;
  if (!res.ok) { const error = await res.json(); if (!current()) return null; throw new Error(serverMessage(error) || 'The download was refused.'); }
  const blob = await res.blob();
  if (!current()) return null;
  const name = safeFileName((preview ? draft : saved).companyName || 'Company');
  return { blob, name: `${name}-letterhead${preview ? '-unsaved-proof' : ''}.docx`, message: preview ? 'Unsaved Word proof downloaded for review. The presentation has not been saved or activated.' : `Saved Word letterhead downloaded from revision ${saved.revision}.` };
}

function useCompanyDocumentDownloads(state: SettingsState) {
  const { session, current, setBusy, setNotice, saved, draft, capabilities } = state;
  const downloadPresentation = async (preview: boolean) => {
    if (!state.isCurrent() || !saved || !draft || state.busy || (preview && !capabilities.manageBrand)) return;
    const epoch = session.current; const ticket = ++current.current;
    const isCurrent = () => state.isCurrent() && epoch === session.current && ticket === current.current;
    setBusy(true); setNotice(null);
    try {
      const result = await requestLetterheadDownload(saved, draft, preview, isCurrent);
      if (!result || !isCurrent()) return;
      if (!downloadBlob(result.name, result.blob)) throw new Error('The browser could not save the file.');
      setNotice({ error: false, text: result.message });
    } catch (e) { if (isCurrent()) setNotice({ error: true, text: 'Letterhead download failed. ' + (e instanceof Error ? e.message : '') }); }
    finally { if (isCurrent()) setBusy(false); }
  };
  const downloadOriginal = async (document: CompanyLegalDocument) => {
    if (!state.isCurrent() || state.busy) return;
    const epoch = session.current; const ticket = ++current.current;
    const isCurrent = () => state.isCurrent() && epoch === session.current && ticket === current.current;
    setBusy(true); setNotice(null);
    try {
      const path = `/api/c2c/project-vault/${encodeURIComponent(document.programId)}/documents/${encodeURIComponent(document.vaultDocumentId)}/download`;
      const res = await apiRequest('GET', path);
      if (!isCurrent()) return;
      if (!res.ok) { const error = await res.json(); if (!isCurrent()) return; throw new Error(serverMessage(error) || 'The Vault refused this download.'); }
      const blob = await res.blob();
      if (!isCurrent()) return;
      if (!downloadBlob(`${safeFileName(document.title)}-v${safeFileName(document.version)}.pdf`, blob)) throw new Error('The browser could not save the file.');
      setNotice({ error: false, text: `Original ${document.title}, version ${document.version}, downloaded from Vault.` });
    } catch (e) { if (isCurrent()) setNotice({ error: true, text: 'Original download failed. ' + (e instanceof Error ? e.message : '') }); }
    finally { if (isCurrent()) setBusy(false); }
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
