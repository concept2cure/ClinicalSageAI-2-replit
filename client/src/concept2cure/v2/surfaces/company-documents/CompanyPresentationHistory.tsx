import React, { useState } from 'react';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';
import { CompanyLetterheadPreview } from './CompanyLetterheadPreview';
import { useCompanyResource } from './useCompanyResource';
import { companyPresentation, companyProtectedPresentationChanged } from './companyDocumentsData';

interface RevisionRow { revision: number; sha256: string; created_by: string; created_at: string; reason: string }
interface RevisionPage { data: RevisionRow[]; nextBefore: number | null }
function revisionPage(value: unknown): RevisionPage | null {
  const page = value as RevisionPage | null;
  return page && Array.isArray(page.data) && page.data.every(row => Number.isSafeInteger(row.revision) && typeof row.sha256 === 'string') && (page.nextBefore === null || Number.isSafeInteger(page.nextBefore)) ? page : null;
}
function revisionProfile(value: unknown): CompanyDocumentProfile | null {
  const profile = (value as { data?: CompanyDocumentProfile } | null)?.data;
  return profile?.version === 1 && profile.letterhead?.specVersion === 1 && typeof profile.companyName === 'string' ? profile : null;
}
function flattenFields(value: unknown, prefix: string, result: Record<string, string>) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).filter(([key]) => key !== 'dataBase64').forEach(([key, field]) => flattenFields(field, `${prefix}.${key}`, result));
  } else result[prefix] = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function comparisonRows(profile: CompanyDocumentProfile): Record<string, string> {
  const result = { 'Company name': profile.companyName, Address: profile.address, Contact: profile.contact, Registration: profile.registrationDetails, 'Import source': profile.importedFrom || '' };
  flattenFields(profile.letterhead, 'Letterhead', result);
  return result;
}
function PresentationComparison({ current, previous }: { current: CompanyDocumentProfile; previous: CompanyDocumentProfile }) {
  const now = comparisonRows(current); const before = comparisonRows(previous);
  const differences = [...new Set([...Object.keys(now), ...Object.keys(before)])].filter(key => now[key] !== before[key]);
  const logoChanged = current.letterhead.brand.logo?.dataBase64 !== previous.letterhead.brand.logo?.dataBase64;
  return <div className="company-revision-comparison">
    <p>{differences.length + Number(logoChanged)} presentation differences compared with the current saved profile.</p>
    {differences.length > 0 && <table><thead><tr><th>Field</th><th>Selected revision</th><th>Current saved profile</th></tr></thead><tbody>{differences.map(key => <tr key={key}><th>{key}</th><td>{before[key] || 'Not provided'}</td><td>{now[key] || 'Not provided'}</td></tr>)}</tbody></table>}
    {logoChanged && <p>Logo image differs. Review the selected design preview; image bytes are not displayed as text.</p>}
    <details><summary>Inspect selected revision’s stationery</summary><CompanyLetterheadPreview profile={previous} /></details>
  </div>;
}

function RevisionDetail({ revision, model, profile }: { revision: number; model: CompanyDocumentSettingsModel; profile: CompanyDocumentProfile }) {
  const resource = useCompanyResource(`${COMPANY_DOCUMENTS_PATH}/revisions/${revision}`, revisionProfile);
  const [reason, setReason] = useState('');
  const reviewRequired = Boolean(profile.brandingApprovalRequired && resource.data && companyProtectedPresentationChanged(profile, resource.data));
  return <section aria-label={`Presentation revision ${revision}`} className="company-register">
    {resource.loading && <p role="status">Reading presentation revision {revision}…</p>}
    {resource.error && <p role="alert" className="company-notice company-error">{resource.error}<button type="button" className="btn ghost small" onClick={resource.reload}>Retry selected revision</button></p>}
    {resource.data && <>
      <PresentationComparison current={profile} previous={resource.data} />
      <p className="company-hint">Restore creates a new saved presentation revision. The current legal inventory and report/correspondence preferences are retained. Your unsaved presentation draft will be replaced.</p>
      {model.capabilities.manageBrand && <>
        {reviewRequired && <p className="company-hint">The independent-review policy blocks direct restoration of a different identity or style. Load this retained presentation into the designer, stage it as an organization-wide named design, obtain independent review, publish it and activate it explicitly. Loading replaces your unsaved designer draft without saving.</p>}
        {reviewRequired && <button type="button" className="btn ghost small" disabled={model.busy || model.conflict} onClick={() => { model.patch(companyPresentation(resource.data!)); model.setTab('design'); }}>Load retained presentation into designer</button>}
        <label className="company-field"><span>Reason for presentation restore</span><textarea rows={2} value={reason} disabled={model.busy} onChange={e => setReason(e.target.value)} /></label>
        <button type="button" className="btn small" disabled={reason.trim().length < 8 || model.busy || model.conflict || reviewRequired} onClick={() => void model.mutation('POST', `${COMPANY_DOCUMENTS_PATH}/revisions/${revision}/restore`, { expectedRevision: profile.revision, reason: reason.trim() }, 'design')}>Restore this presentation revision</button>
      </>}
    </>}
  </section>;
}

export function CompanyPresentationHistory({ model, profile }: { model: CompanyDocumentSettingsModel; profile: CompanyDocumentProfile }) {
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const path = open ? `${COMPANY_DOCUMENTS_PATH}/revisions?limit=25${before === null ? '' : `&before=${before}`}` : null;
  const resource = useCompanyResource(path, revisionPage, profile.revision);
  return <details className="company-setup-guide" onToggle={event => setOpen(event.currentTarget.open)}><summary>Presentation history, comparison and restore</summary>
    <p className="company-hint">Historical stationery is kept separately from the current legal inventory. Revision hashes identify retained presentation records; restoring does not replace legal originals or transfer approvals.</p>
    {resource.loading && <p role="status">Reading presentation history…</p>}
    {resource.error && <p className="company-notice company-error" role="alert">{resource.error}<button type="button" className="btn ghost small" onClick={resource.reload}>Retry presentation history</button></p>}
    {resource.data && <>
      {resource.data.data.length === 0 && <p>No retained presentation revisions were returned for this page.</p>}
      <ul className="company-history-list">{resource.data.data.map(row => <li key={row.revision}><div><strong>Revision {row.revision}</strong><span>{row.created_at} · recorded by {row.created_by}</span><p>{row.reason}</p><small>SHA-256: {row.sha256}</small></div><button type="button" className="btn ghost small" onClick={() => setSelected(row.revision)}>Compare revision {row.revision}</button></li>)}</ul>
      <div className="company-pagination"><button type="button" className="btn ghost small" disabled={before === null} onClick={() => setBefore(null)}>Latest presentation revisions</button><button type="button" className="btn ghost small" disabled={resource.data.nextBefore === null} onClick={() => setBefore(resource.data!.nextBefore)}>Older presentation revisions</button></div>
    </>}
    {selected !== null && <RevisionDetail key={selected} revision={selected} model={model} profile={profile} />}
  </details>;
}
