import React from 'react';
import { COMPANY_LEGAL_KINDS, type CompanyDocumentProfile, type CompanyLegalDocument, type CompanyLegalKind } from '@shared/company-documents';
import { VaultVersionPicker } from './VaultLibraryResults';
import { COMPANY_DOCUMENTS_PATH as PATH, useCompanyDocumentSettings, type CompanyDocumentSettingsModel } from './useCompanyDocumentSettings';
import '../styles/company-documents.css';

const list = (text: string) => text.split(',').map(x => x.trim()).filter(Boolean);
const titleOf = (kind: string) => kind.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const entryStatus = (document: CompanyLegalDocument) => {
  const today = new Date().toISOString().slice(0, 10);
  if (!document.active) return 'Archived entries cannot be selected for a new filing.';
  if (document.effectiveOn && document.effectiveOn > today) return 'Not effective yet. This document cannot be selected for filing before its effective date.';
  if (document.expiresOn && document.expiresOn < today) return 'Expired. Register a current version before filing.';
  if (document.transmitRefusal) return document.transmitRefusal;
  return document.transmitRefusal === null ? 'Current Vault approval verified. Target scope and dates are checked again before filing.' : 'Current Vault approval could not be verified.';
};
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
      <LetterheadPreviewFooter profile={profile} />
    </article>
    <p className="company-hint">Preview uses sample correspondence. Download the saved Word letterhead to check final pagination. Agency forms and original legal files keep their original format.</p>
  </div>;
}

function LetterheadPreviewFooter({ profile }: { profile: CompanyDocumentProfile }) {
  const s = profile.letterhead;
  return (<footer style={{ color: `#${s.colors.muted}` }}>
        <div>{s.brand.confidentialityNotice}</div><div>{s.footer?.text}</div>
        {s.footer?.showPageNumbers && <div>{(s.footer.pageNumberFormat || 'Page {PAGE} of {PAGES}').replaceAll('{PAGE}', '1').replaceAll('{PAGES}', '1')}</div>}
      </footer>);
}

type DesignProps = { model: CompanyDocumentSettingsModel; draft: CompanyDocumentProfile };

function CompanyIdentityFields({ model, draft }: DesignProps) {
  const { patch, uploadLogo, spec } = model;
  return <>
            <h3>Company identity</h3><p className="company-hint">Document display details are separate from the organization’s account and billing name.</p>
            <div className="company-fields">
              <Field label="Company legal name" wide><input value={draft.companyName} maxLength={300} onChange={e => patch({ companyName: e.target.value })} /></Field>
              <Field label="Company address" wide><textarea rows={3} value={draft.address} maxLength={2000} onChange={e => patch({ address: e.target.value })} /></Field>
              <Field label="Company contact details" wide><textarea rows={2} value={draft.contact} maxLength={2000} placeholder="Email, telephone and website" onChange={e => patch({ contact: e.target.value })} /></Field>
              <Field label="Registration and legal details" wide><textarea rows={2} value={draft.registrationDetails} maxLength={2000} placeholder="Registered office, registration or tax number" onChange={e => patch({ registrationDetails: e.target.value })} /></Field>
              <Field label="Company logo · PNG, JPEG or GIF, up to 2 MB" wide><input type="file" accept="image/png,image/jpeg,image/gif" onChange={e => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /></Field>
              {draft.letterhead.brand.logo && <button className="btn ghost small" type="button" onClick={() => spec(s => ({ ...s, brand: { ...s.brand, logo: undefined } }))}>Remove logo</button>}
            </div>
  </>;
}

function CompanyLetterheadFields({ model, draft }: DesignProps) {
  const { importFile } = model;
  return <>
            <h3>Design your letterhead</h3><div className="company-fields">
              <Field label="Import existing Word or PDF letterhead" wide><input type="file" accept=".docx,.pdf" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></Field>
              {draft.importedFrom && <p className="company-hint company-wide">Formatting source: {draft.importedFrom}</p>}
              <LetterheadHeaderFields model={model} draft={draft} />
              <LetterheadTypographyFields model={model} draft={draft} />
              <LetterheadPageFields model={model} draft={draft} />
              <LetterheadFooterFields model={model} draft={draft} />
            </div>
  </>;
}

function LetterheadHeaderFields({ model, draft }: DesignProps) {
  const { spec } = model;
  return <>
              <Field label="Running header" wide><textarea rows={2} value={draft.letterhead.header?.text || ''} onChange={e => spec(s => ({ ...s, header: { ...s.header, text: e.target.value } }))} /></Field>
              <Field label="Header alignment"><select value={draft.letterhead.header?.alignment || 'left'} onChange={e => spec(s => ({ ...s, header: { ...s.header, alignment: e.target.value as 'left' | 'center' | 'right' } }))}>{['left', 'center', 'right'].map(v => <option key={v} value={v}>{titleOf(v)}</option>)}</select></Field>
              <Field label="Accent color"><input type="color" value={`#${draft.letterhead.colors.accent}`} onChange={e => spec(s => ({ ...s, colors: { ...s.colors, accent: e.target.value.slice(1) } }))} /></Field>
  </>;
}

function LetterheadTypographyFields({ model, draft }: DesignProps) {
  const { spec } = model;
  return <>
              <Field label="Body font"><select value={draft.letterhead.typography.bodyFont} onChange={e => spec(s => ({ ...s, typography: { ...s.typography, bodyFont: e.target.value } }))}>{Array.from(new Set([draft.letterhead.typography.bodyFont, 'Times New Roman', 'Arial', 'Calibri', 'Georgia'])).map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Heading font"><select value={draft.letterhead.typography.headingFont} onChange={e => spec(s => ({ ...s, typography: { ...s.typography, headingFont: e.target.value } }))}>{Array.from(new Set([draft.letterhead.typography.headingFont, 'Times New Roman', 'Arial', 'Calibri', 'Georgia'])).map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label="Body size (points)"><input type="number" min={6} max={72} value={draft.letterhead.typography.bodySizePt} onChange={e => spec(s => ({ ...s, typography: { ...s.typography, bodySizePt: Number(e.target.value) } }))} /></Field>
  </>;
}

function LetterheadPageFields({ model, draft }: DesignProps) {
  const { spec } = model;
  return <>
              <Field label="Page size"><select value={draft.letterhead.page.size} onChange={e => spec(s => ({ ...s, page: { ...s.page, size: e.target.value as 'letter' | 'a4' | 'legal' } }))}>{['letter', 'a4', 'legal'].map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}</select></Field>
              <Field label="Page orientation"><select value={draft.letterhead.page.orientation} onChange={e => spec(s => ({ ...s, page: { ...s.page, orientation: e.target.value as 'portrait' | 'landscape' } }))}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></Field>
              {(['top', 'bottom', 'left', 'right'] as const).map(side => <Field key={side} label={`${titleOf(side)} margin (inches)`}><input type="number" min={0} max={4} step={.05} value={draft.letterhead.page.marginsInches[side]} onChange={e => spec(s => ({ ...s, page: { ...s.page, marginsInches: { ...s.page.marginsInches, [side]: Number(e.target.value) } } }))} /></Field>)}
  </>;
}

function LetterheadFooterFields({ model, draft }: DesignProps) {
  const { spec } = model;
  return <>
              <Field label="Footer text" wide><textarea rows={2} value={draft.letterhead.footer?.text || ''} onChange={e => spec(s => ({ ...s, footer: { ...s.footer, text: e.target.value } }))} /></Field>
              <Field label="Confidentiality notice" wide><input value={draft.letterhead.brand.confidentialityNotice || ''} onChange={e => spec(s => ({ ...s, brand: { ...s.brand, confidentialityNotice: e.target.value } }))} /></Field>
              <label className="company-check company-wide"><input type="checkbox" checked={draft.letterhead.header?.showLogo ?? false} onChange={e => spec(s => ({ ...s, header: { ...s.header, showLogo: e.target.checked } }))} />Show logo in running header</label>
              <label className="company-check company-wide"><input type="checkbox" checked={draft.letterhead.footer?.showPageNumbers ?? true} onChange={e => spec(s => ({ ...s, footer: { ...s.footer, showPageNumbers: e.target.checked } }))} />Show page numbers</label>
  </>;
}

function CompanyPresentationDefaults({ model, draft }: DesignProps) {
  const { patch } = model;
  return <>
          <div className="company-defaults"><h3>Presentation defaults</h3>
            <label className="company-check"><input type="checkbox" checked={draft.applyToReports} onChange={e => patch({ applyToReports: e.target.checked })} />Use company presentation for report exports</label>
            <label className="company-check"><input type="checkbox" checked={draft.applyToSubmissionCorrespondence} onChange={e => patch({ applyToSubmissionCorrespondence: e.target.checked })} />Use letterhead for submission correspondence</label>
            <p className="company-hint">Legal attachments are selected explicitly for each submission. These defaults never alter agency forms or signed originals.</p>
            <p className="company-hint">Report exports retain their body typography, governance labels and seals. PDF layout needs at least 0.25-inch margins and enough room for the letterhead and report content.</p>
          </div>
  </>;
}

function CompanyDesigner({ model, draft }: DesignProps) {
  const { canManage, busy, loading, conflict, tab, warnings } = model;
  return <>
    <div className="company-design-layout">
      <fieldset disabled={!canManage || busy || loading || conflict} className="company-editor">
        {tab === 'identity' ? <CompanyIdentityFields model={model} draft={draft} /> : <CompanyLetterheadFields model={model} draft={draft} />}
        {warnings.length > 0 && <div className="company-notice"><strong>Extraction warnings</strong><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
        <CompanyPresentationDefaults model={model} draft={draft} />
      </fieldset>
      <LetterheadPreview profile={draft} />
    </div>
    <CompanyDesignSaveBar model={model} />
  </>;
}

function CompanyDesignSaveBar({ model }: { model: CompanyDocumentSettingsModel }) {
  const { reason, setReason, canManage, busy, dirty, loading, conflict, save, download } = model;
  return <div className="company-save-bar"><Field label="Reason for company document change"><input value={reason} disabled={!canManage || busy} onChange={e => setReason(e.target.value)} placeholder="Required for audit trail" maxLength={2000} /></Field>
        <button className="btn primary small" type="button" disabled={!canManage || !dirty || reason.trim().length < 3 || busy || loading || conflict} onClick={() => void save()}>{busy ? 'Working…' : 'Save company documents'}</button>
        <button className="btn ghost small" type="button" disabled={busy || dirty || loading} onClick={() => void download()}>Download saved Word letterhead</button>
        {dirty && <span className="company-hint">Unsaved draft</span>}</div>;
}

function CompanyLegalRegistration({ model, saved }: { model: CompanyDocumentSettingsModel; saved: CompanyDocumentProfile }) {
  const { busy, loading, conflict, setLegal, legal, legalReason, setLegalReason, mutation } = model;
  return <details className="company-register"><summary>Register a legal document from Vault</summary>
          <fieldset disabled={busy || loading || conflict} className="company-editor">
            <VaultVersionPicker disabled={busy || loading || conflict} onChoose={hit => setLegal(p => ({ ...p, title: hit.title, programId: hit.programId, vaultDocumentId: hit.id }))} />
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
        </details>;
}

function CompanyLegalArchive({ model, saved, doc }: { model: CompanyDocumentSettingsModel; saved: CompanyDocumentProfile; doc: CompanyLegalDocument }) {
  const { archiveReason, setArchiveReason, busy, mutation, setArchiveId } = model;
  return <div className="company-archive"><Field label={`Reason to archive ${doc.title}`}><input value={archiveReason} onChange={e => setArchiveReason(e.target.value)} /></Field><p className="company-hint">The library entry is archived. The original Vault file and existing submission placements are retained.</p><div className="company-actions"><button type="button" className="btn small" disabled={busy || archiveReason.trim().length < 3} onClick={() => void mutation('DELETE', `${PATH}/legal-documents/${encodeURIComponent(doc.id)}`, { expectedRevision: saved.revision, reason: archiveReason.trim() }, 'legal')}>Confirm archive</button><button type="button" className="btn ghost small" disabled={busy} onClick={() => setArchiveId(null)}>Cancel archive</button></div></div>;
}

function CompanyLegalCard({ model, saved, doc }: { model: CompanyDocumentSettingsModel; saved: CompanyDocumentProfile; doc: CompanyLegalDocument }) {
  const { busy, conflict, canManage, archiveId, setArchiveId, setArchiveReason, downloadOriginal } = model;
  return <article className="company-legal-card">
          <div className="company-section-head"><div><h4>{doc.title}</h4><p>{titleOf(doc.kind)} · {doc.language} · version {doc.version} · {doc.active ? 'Active library entry' : 'Archived'}</p></div>
            <div className="company-actions"><button className="btn ghost small" disabled={busy} type="button" onClick={() => void downloadOriginal(doc)}>Download original</button>
            {canManage && doc.active && <button className="btn ghost small" disabled={busy || conflict} type="button" onClick={() => { setArchiveId(doc.id); setArchiveReason(''); }}>Archive entry</button>}</div></div>
          <dl><div><dt>Agency</dt><dd>{doc.agencies.join(', ') || 'Unrestricted'}</dd></div><div><dt>Country / region</dt><dd>{doc.countries.join(', ') || 'Unrestricted'}</dd></div><div><dt>Submission type</dt><dd>{doc.submissionTypes.join(', ') || 'Unrestricted'}</dd></div><div><dt>Effective / expires</dt><dd>{doc.effectiveOn || 'No start date'} / {doc.expiresOn || 'No expiry date'}</dd></div></dl>
          <p className="company-hint">{entryStatus(doc)}</p>
          <details><summary>Original version and provenance</summary><p className="company-hint">Project: {doc.programId}<br />Vault version: {doc.vaultDocumentId}<br />Content hash: {doc.contentHash}<br />Registered by {doc.registeredBy} on {doc.registeredAt}</p></details>
          {archiveId === doc.id && <CompanyLegalArchive model={model} saved={saved} doc={doc} />}
  </article>;
}

function CompanyLegalLibrary({ model, saved, onNav }: { model: CompanyDocumentSettingsModel; saved: CompanyDocumentProfile; onNav?: (id: string) => void }) {
  const { canManage, showArchived, setShowArchived } = model;
  const visibleDocuments = saved.legalDocuments.filter(d => showArchived || d.active);
  return <>
    <div className="company-legal-intro"><h3>Reusable legal originals</h3><p>Register an exact PDF version from Vault once, then select applicable documents when preparing a submission. Registration does not approve or sign the source document.</p>
      {onNav && <button type="button" className="btn ghost small" onClick={() => onNav('vault')}>Upload and review documents in Vault</button>}</div>
    {canManage && <CompanyLegalRegistration model={model} saved={saved} />}
    <label className="company-check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived library entries</label>
    {visibleDocuments.length === 0 && <p className="company-empty">No {showArchived ? '' : 'active '}legal documents registered. Your original documents remain in their project Vaults.</p>}
    <div className="company-legal-list">{visibleDocuments.map(doc => <CompanyLegalCard key={doc.id} model={model} saved={saved} doc={doc} />)}</div>
  </>;
}

function CompanySettingsContent({ model, draft, saved, onNav }: DesignProps & { saved: CompanyDocumentProfile; onNav?: (id: string) => void }) {
  const { canManage, tab, setTab } = model;
  return <>
    {!canManage && <p className="company-hint">Only an organization owner or administrator can change these settings.</p>}
    <div className="company-tabs" role="group" aria-label="Company document settings">
      {(['identity', 'design', 'legal'] as const).map(id => <button key={id} className={`btn ghost small${tab === id ? ' active' : ''}`} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{id === 'identity' ? 'Company identity' : id === 'design' ? 'Letterhead designer' : 'Legal document library'}</button>)}
    </div>
    {tab === 'legal' ? <CompanyLegalLibrary model={model} saved={saved} onNav={onNav} /> : <CompanyDesigner model={model} draft={draft} />}
  </>;
}

function CompanySettingsHeading({ model }: { model: CompanyDocumentSettingsModel }) {
  const { currentView, saved } = model;
  return <div className="company-section-head"><div><div className="company-eyebrow">Organization documents</div><h2>Company identity, letterhead &amp; legal documents</h2>
      <p>Your company presentation and reusable originals for correspondence, reports and regulatory submissions.</p></div>
      {currentView && saved && <span className="company-revision">Revision {saved.revision}</span>}</div>;
}

/** One organization profile, reused by Admin → Settings and organization Setup. */
export function CompanyDocumentSettings({ onNav }: { onNav?: (id: string) => void }) {
  const model = useCompanyDocumentSettings();
  const { currentView, saved, draft, loading, readError, notice, conflict, busy, load, session, dirtyRef } = model;
  return <section className="company-documents" aria-label="Company identity, letterhead and legal documents">
    <CompanySettingsHeading model={model} />
    {(!currentView || loading) && <p role="status">Reading company document settings…</p>}
    {currentView && readError && <div className="company-notice company-error" role="alert">{readError} <button type="button" className="btn ghost small" onClick={() => void load(session.current, !dirtyRef.current)}>Retry read</button></div>}
    {currentView && notice && <div className={`company-notice${notice.error ? ' company-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</div>}
    {currentView && conflict && <button className="btn ghost small" type="button" disabled={busy} onClick={() => void load()}>Discard draft and reload saved profile</button>}
    {currentView && draft && saved && <CompanySettingsContent model={model} draft={draft} saved={saved} onNav={onNav} />}
  </section>;
}
