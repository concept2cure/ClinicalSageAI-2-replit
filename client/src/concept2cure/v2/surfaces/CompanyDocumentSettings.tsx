import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, apiUpload, serverMessage } from '@/lib/queryClient';
import { COMPANY_LEGAL_KINDS, type CompanyDocumentProfile, type CompanyDocumentsResponse, type CompanyLegalDocument, type CompanyLegalKind } from '@shared/company-documents';
import { normalizeTemplateSpec, type TemplateSpec } from '@shared/templates/template-spec';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { useLiveData } from '../dataConnect';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import type { LibraryHit, LibraryShape } from './VaultLibraryResults';
import '../styles/company-documents.css';

const PATH = '/api/client-branding/company-documents';
const list = (text: string) => text.split(',').map(x => x.trim()).filter(Boolean);
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const titleOf = (kind: string) => kind.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const entryStatus = (document: CompanyLegalDocument) => {
  const today = new Date().toISOString().slice(0, 10);
  if (!document.active) return 'Archived entries cannot be selected for a new filing.';
  if (document.effectiveOn && document.effectiveOn > today) return 'Not effective yet. This document cannot be selected for filing before its effective date.';
  if (document.expiresOn && document.expiresOn < today) return 'Expired. Register a current version before filing.';
  if (document.transmitRefusal) return document.transmitRefusal;
  return document.transmitRefusal === null ? 'Current Vault approval verified. Target scope and dates are checked again before filing.' : 'Current Vault approval could not be verified.';
};
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

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`company-field${wide ? ' company-wide' : ''}`}><span>{label}</span>{children}</label>;
}

/** A visual draft of the renderer-neutral spec. Original legal files are never rendered through this preview. */
function LetterheadPreview({ profile }: { profile: CompanyDocumentProfile }) {
  const s = profile.letterhead;
  const ratio = s.page.size === 'a4' ? 210 / 297 : s.page.size === 'legal' ? 8.5 / 14 : 8.5 / 11;
  return <div className="company-preview-shell">
    <div className="company-preview-caption">Live design preview · {s.page.size.toUpperCase()} · {s.page.orientation}</div>
    <article className="company-preview" aria-label="Letterhead preview" style={{
      aspectRatio: s.page.orientation === 'landscape' ? 1 / ratio : ratio,
      fontFamily: s.typography.bodyFont, color: `#${s.colors.text}`,
      padding: `${s.page.marginsInches.top * 25}px ${s.page.marginsInches.right * 25}px ${s.page.marginsInches.bottom * 25}px ${s.page.marginsInches.left * 25}px`,
    }}>
      <header style={{ textAlign: s.header?.alignment ?? 'left', borderColor: `#${s.colors.accent}` }}>
        {s.brand.logo && (s.header?.showLogo || s.brand.logo.placement === 'cover') && <img alt="Company logo preview" src={`data:${s.brand.logo.mimeType};base64,${s.brand.logo.dataBase64}`} />}
        <strong style={{ color: `#${s.colors.accent}`, fontFamily: s.typography.headingFont }}>{profile.companyName || 'Your company name'}</strong>
        <div>{profile.address}</div><div>{profile.contact}</div><div>{profile.registrationDetails}</div>
        {s.header?.text && <div>{s.header.text}</div>}
      </header>
      <main style={{ fontSize: Math.max(9, s.typography.bodySizePt * .75), lineHeight: s.typography.lineSpacing }}>
        <h3 style={{ fontFamily: s.typography.headingFont }}>Regulatory correspondence</h3>
        <p>Recipient and submission reference</p><p>This space contains the correspondence you prepare for the selected recipient.</p>
        <p className="company-preview-placeholder">Your document content</p>
      </main>
      <footer style={{ color: `#${s.colors.muted}` }}>
        <div>{s.brand.confidentialityNotice}</div><div>{s.footer?.text}</div>
        {s.footer?.showPageNumbers && <div>{(s.footer.pageNumberFormat || 'Page {PAGE} of {PAGES}').replaceAll('{PAGE}', '1').replaceAll('{PAGES}', '1')}</div>}
      </footer>
    </article>
    <p className="company-hint">Preview uses sample correspondence. Download the saved Word letterhead to check final pagination. Agency forms and original legal files keep their original format.</p>
  </div>;
}

function VaultDocumentPicker({ onChoose, disabled }: { onChoose: (hit: LibraryHit) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const path = query ? `/api/c2c/project-vault/search?q=${encodeURIComponent(query)}&limit=25` : null;
  const state = useLiveData<LibraryShape>(path, [path], (v): v is LibraryShape => {
    const d = v as LibraryShape | null;
    return !!d && d.scope === 'verified-accessible-programs' && Array.isArray(d.results) &&
      d.results.every(h => typeof h.id === 'string' && typeof h.title === 'string' && typeof h.program?.id === 'string');
  });
  return <div className="company-vault-search">
    <div className="company-actions"><Field label="Search your accessible Vaults"><input value={text} onChange={e => setText(e.target.value)} placeholder="Document title or keyword" /></Field>
      <button className="btn ghost small" type="button" disabled={disabled || !text.trim() || state.loading} onClick={() => setQuery(text.trim())}>Search Vault</button></div>
    {state.loading && <p role="status">Searching accessible project Vaults…</p>}
    {state.error && <p role="alert">The Vault search could not be read. Try another search or open Vault.</p>}
    {!state.loading && state.data && <div className="company-search-results">
      {state.data.results.length === 0 && <p>No matching documents in your accessible projects.</p>}
      {state.data.results.map(hit => <div className="company-search-hit" key={hit.id}><span><strong>{hit.title}</strong><small>{hit.program.name || 'Project'} · version {hit.version || 'not recorded'}{hit.current ? '' : ' · earlier version'}</small></span>
        <button type="button" className="btn ghost small" disabled={disabled || !hit.current} onClick={() => onChoose(hit)}>Select document</button></div>)}
    </div>}
  </div>;
}

const emptyLegal = () => ({ title: '', kind: 'authorization' as CompanyLegalKind, programId: '', vaultDocumentId: '', agencies: '', countries: '', submissionTypes: '', language: 'en', effectiveOn: '', expiresOn: '' });

/** One organization profile, reused by Admin → Settings and organization Setup. */
export function CompanyDocumentSettings({ onNav }: { onNav?: (id: string) => void }) {
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
    return () => { session.current++; current.current++; };
  }, [org, authSession]);

  const patch = (values: Partial<CompanyDocumentProfile>) => setDraft(p => p ? { ...p, ...values } : p);
  const spec = (change: (value: TemplateSpec) => TemplateSpec) => setDraft(p => p ? { ...p, letterhead: change(p.letterhead) } : p);
  const mutation = async (method: 'PUT' | 'POST' | 'DELETE', path: string, values: unknown, mode: 'design' | 'legal') => {
    if (!saved || !draft || !canManage || busy) return;
    const epoch = session.current; const ticket = ++current.current;
    setBusy(true); setNotice(null);
    const result = await apiCall(method, path, values);
    if (epoch !== session.current || ticket !== current.current) return;
    if (!result.ok || !validResponse(result.body)) {
      setBusy(false);
      const code = (result.body as { error?: unknown } | null)?.error;
      const conflictNow = result.status === 409 && (code === 'REVISION_CONFLICT' || code === 'COMPANY_DOCUMENTS_CONFLICT');
      setConflict(conflictNow);
      setNotice({ error: true, text: conflictNow
        ? 'Another administrator changed this profile. Your draft is kept. Reload the saved profile before applying your changes again.'
        : apiErrorText(result, 'The change could not be confirmed. Your draft is kept; reload the saved profile before retrying if the connection was interrupted.') });
      return;
    }
    const receipt = result.body;
    const reread = await apiCall('GET', PATH);
    if (epoch !== session.current || ticket !== current.current) return;
    setBusy(false);
    const verified = reread.ok && validResponse(reread.body) && reread.body.data.revision === receipt.data.revision;
    const profile = copy(verified ? (reread.body as CompanyDocumentsResponse).data : receipt.data);
    setSaved(profile); setCanManage(verified ? (reread.body as CompanyDocumentsResponse).canManage : receipt.canManage);
    setDraft(p => mode === 'design' ? copy(profile) : p ? { ...p, revision: profile.revision, legalDocuments: profile.legalDocuments } : copy(profile));
    setConflict(false);
    setNotice({ error: !verified, text: !verified
      ? `The server recorded revision ${profile.revision}, but the latest saved profile could not be verified. Reload before making another change.`
      : mode === 'design' ? `Company identity and letterhead saved · revision ${profile.revision}.` : 'Legal document library updated. Source files and their approval records are unchanged.' });
    if (!verified) setConflict(true);
    if (mode === 'design') { setReason(''); setWarnings([]); }
    else { setLegal(emptyLegal()); setLegalReason(''); setArchiveId(null); setArchiveReason(''); }
  };
  const save = () => draft && saved && mutation('PUT', PATH, { expectedRevision: saved.revision, reason: reason.trim(), ...editable(draft) }, 'design');

  const importFile = async (file?: File) => {
    if (!file || !canManage || busy) return;
    if (!/\.(docx|pdf)$/i.test(file.name) || file.size > 15 * 1024 * 1024) {
      setNotice({ error: true, text: 'Choose a Word (.docx) or PDF file up to 15 MB.' }); return;
    }
    const epoch = session.current; const ticket = ++current.current;
    setBusy(true); setNotice(null);
    try {
      const form = new FormData(); form.append('file', file, file.name);
      const response = await apiUpload('POST', '/api/c2c/templates/extract', form);
      const body = await response.json();
      if (epoch !== session.current || ticket !== current.current) return;
      if (!response.ok || !body?.spec) throw new Error(serverMessage(body) || 'Formatting could not be extracted.');
      patch({ letterhead: normalizeTemplateSpec(body.spec), importedFrom: file.name });
      setWarnings(Array.isArray(body.warnings) ? body.warnings.filter((x: unknown) => typeof x === 'string') : []);
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

  return <section className="company-documents" aria-label="Company identity, letterhead and legal documents">
    <div className="company-section-head"><div><div className="company-eyebrow">Organization documents</div><h2>Company identity, letterhead &amp; legal documents</h2>
      <p>Your company presentation and reusable originals for correspondence, reports and regulatory submissions.</p></div>
      {currentView && saved && <span className="company-revision">Revision {saved.revision}</span>}</div>
    {(!currentView || loading) && <p role="status">Reading company document settings…</p>}
    {currentView && readError && <div className="company-notice company-error" role="alert">{readError} <button type="button" className="btn ghost small" onClick={() => void load(session.current, !dirtyRef.current)}>Retry read</button></div>}
    {currentView && notice && <div className={`company-notice${notice.error ? ' company-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
    {currentView && conflict && <button className="btn ghost small" type="button" disabled={busy} onClick={() => void load()}>Discard draft and reload saved profile</button>}
    {currentView && draft && saved && <>
      {!canManage && <p className="company-hint">Only an organization owner or administrator can change these settings.</p>}
      <div className="company-tabs" role="group" aria-label="Company document settings">
        {(['identity', 'design', 'legal'] as const).map(id => <button key={id} className={`btn ghost small${tab === id ? ' active' : ''}`} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{id === 'identity' ? 'Company identity' : id === 'design' ? 'Letterhead designer' : 'Legal document library'}</button>)}
      </div>
      {tab !== 'legal' && <div className="company-design-layout">
        <fieldset disabled={!canManage || busy || loading || conflict} className="company-editor">
          {tab === 'identity' ? <>
            <h3>Company identity</h3><p className="company-hint">Document display details are separate from the organization’s account and billing name.</p>
            <div className="company-fields">
              <Field label="Company legal name" wide><input value={draft.companyName} maxLength={300} onChange={e => patch({ companyName: e.target.value })} /></Field>
              <Field label="Company address" wide><textarea rows={3} value={draft.address} maxLength={2000} onChange={e => patch({ address: e.target.value })} /></Field>
              <Field label="Company contact details" wide><textarea rows={2} value={draft.contact} maxLength={2000} placeholder="Email, telephone and website" onChange={e => patch({ contact: e.target.value })} /></Field>
              <Field label="Registration and legal details" wide><textarea rows={2} value={draft.registrationDetails} maxLength={2000} placeholder="Registered office, registration or tax number" onChange={e => patch({ registrationDetails: e.target.value })} /></Field>
              <Field label="Company logo · PNG, JPEG or GIF, up to 2 MB" wide><input type="file" accept="image/png,image/jpeg,image/gif" onChange={e => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /></Field>
              {draft.letterhead.brand.logo && <button className="btn ghost small" type="button" onClick={() => spec(s => ({ ...s, brand: { ...s.brand, logo: undefined } }))}>Remove logo</button>}
            </div>
          </> : <>
            <h3>Design your letterhead</h3><div className="company-fields">
              <Field label="Import existing Word or PDF letterhead" wide><input type="file" accept=".docx,.pdf" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></Field>
              {draft.importedFrom && <p className="company-hint company-wide">Formatting source: {draft.importedFrom}</p>}
              <Field label="Running header" wide><textarea rows={2} value={draft.letterhead.header?.text || ''} onChange={e => spec(s => ({ ...s, header: { ...s.header, text: e.target.value } }))} /></Field>
              <Field label="Header alignment"><select value={draft.letterhead.header?.alignment || 'left'} onChange={e => spec(s => ({ ...s, header: { ...s.header, alignment: e.target.value as 'left' | 'center' | 'right' } }))}>{['left', 'center', 'right'].map(v => <option key={v} value={v}>{titleOf(v)}</option>)}</select></Field>
              <Field label="Accent color"><input type="color" value={`#${draft.letterhead.colors.accent}`} onChange={e => spec(s => ({ ...s, colors: { ...s.colors, accent: e.target.value.slice(1) } }))} /></Field>
              <Field label="Body font"><select value={draft.letterhead.typography.bodyFont} onChange={e => spec(s => ({ ...s, typography: { ...s.typography, bodyFont: e.target.value } }))}>{Array.from(new Set([draft.letterhead.typography.bodyFont, 'Times New Roman', 'Arial', 'Calibri', 'Georgia'])).map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Heading font"><select value={draft.letterhead.typography.headingFont} onChange={e => spec(s => ({ ...s, typography: { ...s.typography, headingFont: e.target.value } }))}>{Array.from(new Set([draft.letterhead.typography.headingFont, 'Times New Roman', 'Arial', 'Calibri', 'Georgia'])).map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Body size (points)"><input type="number" min={6} max={72} value={draft.letterhead.typography.bodySizePt} onChange={e => spec(s => ({ ...s, typography: { ...s.typography, bodySizePt: Number(e.target.value) } }))} /></Field>
              <Field label="Page size"><select value={draft.letterhead.page.size} onChange={e => spec(s => ({ ...s, page: { ...s.page, size: e.target.value as 'letter' | 'a4' | 'legal' } }))}>{['letter', 'a4', 'legal'].map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select></Field>
              <Field label="Page orientation"><select value={draft.letterhead.page.orientation} onChange={e => spec(s => ({ ...s, page: { ...s.page, orientation: e.target.value as 'portrait' | 'landscape' } }))}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></Field>
              {(['top', 'bottom', 'left', 'right'] as const).map(side => <Field key={side} label={`${titleOf(side)} margin (inches)`}><input type="number" min={0} max={4} step={.05} value={draft.letterhead.page.marginsInches[side]} onChange={e => spec(s => ({ ...s, page: { ...s.page, marginsInches: { ...s.page.marginsInches, [side]: Number(e.target.value) } } }))} /></Field>)}
              <Field label="Footer text" wide><textarea rows={2} value={draft.letterhead.footer?.text || ''} onChange={e => spec(s => ({ ...s, footer: { ...s.footer, text: e.target.value } }))} /></Field>
              <Field label="Confidentiality notice" wide><input value={draft.letterhead.brand.confidentialityNotice || ''} onChange={e => spec(s => ({ ...s, brand: { ...s.brand, confidentialityNotice: e.target.value } }))} /></Field>
              <label className="company-check company-wide"><input type="checkbox" checked={draft.letterhead.header?.showLogo ?? false} onChange={e => spec(s => ({ ...s, header: { ...s.header, showLogo: e.target.checked } }))} />Show logo in running header</label>
              <label className="company-check company-wide"><input type="checkbox" checked={draft.letterhead.footer?.showPageNumbers ?? true} onChange={e => spec(s => ({ ...s, footer: { ...s.footer, showPageNumbers: e.target.checked } }))} />Show page numbers</label>
            </div>
          </>}
          {warnings.length > 0 && <div className="company-notice"><strong>Extraction warnings</strong><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
          <div className="company-defaults"><h3>Presentation defaults</h3>
            <label className="company-check"><input type="checkbox" checked={draft.applyToReports} onChange={e => patch({ applyToReports: e.target.checked })} />Use company presentation for report exports</label>
            <label className="company-check"><input type="checkbox" checked={draft.applyToSubmissionCorrespondence} onChange={e => patch({ applyToSubmissionCorrespondence: e.target.checked })} />Use letterhead for submission correspondence</label>
            <p className="company-hint">Legal attachments are selected explicitly for each submission. These defaults never alter agency forms or signed originals.</p>
            <p className="company-hint">Report exports retain their body typography, governance labels and seals. PDF layout needs at least 0.25-inch margins and enough room for the letterhead and report content.</p>
          </div>
        </fieldset>
        <LetterheadPreview profile={draft} />
      </div>}
      {tab !== 'legal' && <div className="company-save-bar"><Field label="Reason for company document change"><input value={reason} disabled={!canManage || busy} onChange={e => setReason(e.target.value)} placeholder="Required for audit trail" maxLength={2000} /></Field>
        <button className="btn primary small" type="button" disabled={!canManage || !dirty || reason.trim().length < 3 || busy || loading || conflict} onClick={() => void save()}>{busy ? 'Working…' : 'Save company documents'}</button>
        <button className="btn ghost small" type="button" disabled={busy || dirty || loading} onClick={() => void download()}>Download saved Word letterhead</button>
        {dirty && <span className="company-hint">Unsaved draft</span>}</div>}
      {tab === 'legal' && <>
        <div className="company-legal-intro"><h3>Reusable legal originals</h3><p>Register an exact PDF version from Vault once, then select applicable documents when preparing a submission. Registration does not approve or sign the source document.</p>
          {onNav && <button type="button" className="btn ghost small" onClick={() => onNav('vault')}>Upload and review documents in Vault</button>}</div>
        {canManage && <details className="company-register"><summary>Register a legal document from Vault</summary>
          <fieldset disabled={busy || loading || conflict} className="company-editor">
            <VaultDocumentPicker disabled={busy || loading || conflict} onChoose={hit => setLegal(p => ({ ...p, title: hit.title, programId: hit.program.id, vaultDocumentId: hit.id }))} />
            <div className="company-fields">
              <Field label="Legal document title" wide><input value={legal.title} onChange={e => setLegal(p => ({ ...p, title: e.target.value }))} /></Field>
              <Field label="Document kind"><select value={legal.kind} onChange={e => setLegal(p => ({ ...p, kind: e.target.value as CompanyLegalKind }))}>{COMPANY_LEGAL_KINDS.map(k => <option key={k} value={k}>{titleOf(k)}</option>)}</select></Field>
              <Field label="Document language"><input value={legal.language} placeholder="en, fr, ja…" onChange={e => setLegal(p => ({ ...p, language: e.target.value }))} /></Field>
              <Field label="Source project UUID"><input value={legal.programId} onChange={e => setLegal(p => ({ ...p, programId: e.target.value }))} /></Field>
              <Field label="Vault document version UUID"><input value={legal.vaultDocumentId} onChange={e => setLegal(p => ({ ...p, vaultDocumentId: e.target.value }))} /></Field>
              <Field label="Agencies · comma separated"><input value={legal.agencies} placeholder="fda, ema, pmda" onChange={e => setLegal(p => ({ ...p, agencies: e.target.value }))} /></Field>
              <Field label="Countries or regions · comma separated"><input value={legal.countries} placeholder="US, EU, JP" onChange={e => setLegal(p => ({ ...p, countries: e.target.value }))} /></Field>
              <Field label="Submission types · comma separated" wide><input value={legal.submissionTypes} placeholder="ind, nda, maa, 510k" onChange={e => setLegal(p => ({ ...p, submissionTypes: e.target.value }))} /></Field>
              <Field label="Effective date"><input type="date" value={legal.effectiveOn} onChange={e => setLegal(p => ({ ...p, effectiveOn: e.target.value }))} /></Field>
              <Field label="Expiry date"><input type="date" value={legal.expiresOn} onChange={e => setLegal(p => ({ ...p, expiresOn: e.target.value }))} /></Field>
              <Field label="Reason for legal document registration" wide><input value={legalReason} onChange={e => setLegalReason(e.target.value)} /></Field>
            </div>
            <p className="company-hint">Leave a scope empty for unrestricted applicability. This records company intent; it does not establish agency acceptance. The server verifies access and records the original version and content hash.</p>
            <button type="button" className="btn primary small" disabled={!legal.title.trim() || !legal.programId.trim() || !legal.vaultDocumentId.trim() || legalReason.trim().length < 3 || !legal.language.trim()} onClick={() => void mutation('POST', `${PATH}/legal-documents`, {
              ...legal, agencies: list(legal.agencies), countries: list(legal.countries), submissionTypes: list(legal.submissionTypes), effectiveOn: legal.effectiveOn || null, expiresOn: legal.expiresOn || null, reason: legalReason.trim(), expectedRevision: saved.revision,
            }, 'legal')}>Register Vault version</button>
          </fieldset>
        </details>}
        <label className="company-check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived library entries</label>
        {saved.legalDocuments.filter(d => showArchived || d.active).length === 0 && <p className="company-empty">No {showArchived ? '' : 'active '}legal documents registered. Your original documents remain in their project Vaults.</p>}
        <div className="company-legal-list">{saved.legalDocuments.filter(d => showArchived || d.active).map(doc => <article className="company-legal-card" key={doc.id}>
          <div className="company-section-head"><div><h4>{doc.title}</h4><p>{titleOf(doc.kind)} · {doc.language} · version {doc.version} · {doc.active ? 'Active library entry' : 'Archived'}</p></div>
            <div className="company-actions"><button className="btn ghost small" disabled={busy} type="button" onClick={() => void downloadOriginal(doc)}>Download original</button>
            {canManage && doc.active && <button className="btn ghost small" disabled={busy || conflict} type="button" onClick={() => { setArchiveId(doc.id); setArchiveReason(''); }}>Archive entry</button>}</div></div>
          <dl><div><dt>Agency</dt><dd>{doc.agencies.join(', ') || 'Unrestricted'}</dd></div><div><dt>Country / region</dt><dd>{doc.countries.join(', ') || 'Unrestricted'}</dd></div><div><dt>Submission type</dt><dd>{doc.submissionTypes.join(', ') || 'Unrestricted'}</dd></div><div><dt>Effective / expires</dt><dd>{doc.effectiveOn || 'No start date'} / {doc.expiresOn || 'No expiry date'}</dd></div></dl>
          <p className="company-hint">{entryStatus(doc)}</p>
          <details><summary>Original version and provenance</summary><p className="company-hint">Project: {doc.programId}<br />Vault version: {doc.vaultDocumentId}<br />Content hash: {doc.contentHash}<br />Registered by {doc.registeredBy} on {doc.registeredAt}</p></details>
          {archiveId === doc.id && <div className="company-archive"><Field label={`Reason to archive ${doc.title}`}><input value={archiveReason} onChange={e => setArchiveReason(e.target.value)} /></Field><p className="company-hint">The library entry is archived. The original Vault file and existing submission placements are retained.</p><div className="company-actions"><button type="button" className="btn small" disabled={busy || archiveReason.trim().length < 3} onClick={() => void mutation('DELETE', `${PATH}/legal-documents/${encodeURIComponent(doc.id)}`, { expectedRevision: saved.revision, reason: archiveReason.trim() }, 'legal')}>Confirm archive</button><button type="button" className="btn ghost small" disabled={busy} onClick={() => setArchiveId(null)}>Cancel archive</button></div></div>}
        </article>)}</div>
      </>}
    </>}
  </section>;
}
