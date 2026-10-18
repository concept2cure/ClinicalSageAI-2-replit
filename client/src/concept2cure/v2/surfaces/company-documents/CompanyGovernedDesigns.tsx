import React, { useState } from 'react';
import type { CompanyDesignScope, CompanyDesignSummary } from '@shared/company-document-designs';
import { apiErrorText } from '../../apiCall';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';
import { CompanyDesignEditor, companyDesignCandidate } from './CompanyDesignEditor';
import { CompanyDesignDetail, companyDesignDetailOf } from './CompanyDesignDetail';
import { useCompanyResource } from './useCompanyResource';

interface DesignsPage { data: CompanyDesignSummary[]; nextBefore: string | null }
function designsOf(value: unknown): DesignsPage | null {
  const page = value as DesignsPage | null;
  return page && Array.isArray(page.data) && page.data.every(row => typeof row.id === 'string' && typeof row.name === 'string' && ['draft', 'reviewed', 'published'].includes(row.state)) && (page.nextBefore === null || typeof page.nextBefore === 'string') ? page : null;
}
function designsPath(state: string, before: string | null) {
  const query = new URLSearchParams({ limit: '25' });
  if (state) query.set('state', state);
  if (before) query.set('before', before);
  return `${COMPANY_DOCUMENTS_PATH}/designs?${query}`;
}
function CompanyDesignList({ resource, before, busy, setBefore, setSelected }: {
  resource: ReturnType<typeof useCompanyResource<DesignsPage>>; before: string | null; busy: boolean; setBefore: (before: string | null) => void; setSelected: (id: string) => void;
}) {
  return <>
    {resource.loading && <p role="status">Reading scoped named designs…</p>}
    {resource.error && <p className="company-error" role="alert">{resource.error} <button type="button" className="btn ghost small" onClick={resource.reload}>Retry named designs</button></p>}
    {resource.data && <>
      {resource.data.data.length === 0 && <p>No named designs were returned for this page and review state.</p>}
      <ul className="company-history-list">{resource.data.data.map(design => <li key={design.id}><div><strong>{design.name}</strong><span>{design.state} · {design.scope.market || 'any market'} · {design.scope.language || 'any language'}</span></div><button type="button" className="btn ghost small" onClick={() => setSelected(design.id)}>Inspect {design.name}</button></li>)}</ul>
      <div className="company-pagination"><button type="button" className="btn ghost small" disabled={before === null || busy} onClick={() => setBefore(null)}>Latest named designs</button><button type="button" className="btn ghost small" disabled={resource.data.nextBefore === null || busy} onClick={() => setBefore(resource.data!.nextBefore)}>Older named designs</button></div>
    </>}
  </>;
}
export function CompanyGovernedDesigns({ model }: { model: CompanyDocumentSettingsModel }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('');
  const [before, setBefore] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const resource = useCompanyResource(open ? designsPath(state, before) : null, designsOf);
  const { saved, draft, capabilities, conflict } = model;
  const stage = async (name: string, scope: CompanyDesignScope, reason: string) => {
    if (!saved || !draft || busy || !capabilities.manageBrand || conflict) return;
    setBusy(true); setNotice(null);
    const result = await resource.call('POST', `${COMPANY_DOCUMENTS_PATH}/designs`, { expectedRevision: saved.revision, reason, name, scope, candidate: companyDesignCandidate(draft) });
    if (!result) return;
    setBusy(false);
    const detail = result.ok ? companyDesignDetailOf(result.body) : null;
    if (!detail) { setNotice({ error: true, text: apiErrorText(result, 'The named design snapshot could not be confirmed. The designer draft is retained.') }); return; }
    setNotice({ error: false, text: 'Named design snapshot staged. Another authorized person must review it before publication. The organization default is unchanged.' });
    setSelected(detail.design.id); resource.reload();
  };
  return <details className="company-setup-guide" onToggle={event => setOpen(event.currentTarget.open)}><summary>Named designs, independent review and publication</summary>
    <p className="company-hint">Use a separate named design for a project, market, language or subsidiary. Publication retains an immutable variant with its own revision. Correspondence and reports must select that variant explicitly; publishing never changes the organization default.</p>
    {notice && <p className={`company-notice${notice.error ? ' company-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {open && draft && capabilities.manageBrand && <details className="company-register"><summary>Stage the current designer draft</summary><CompanyDesignEditor profile={draft} busy={busy || model.busy || conflict} onStage={(name, scope, reason) => void stage(name, scope, reason)} /></details>}
    <label className="company-field"><span>Filter named designs by review state</span><select value={state} disabled={busy} onChange={event => { setState(event.target.value); setBefore(null); }}><option value="">All review states</option><option value="draft">Staged draft</option><option value="reviewed">Independently reviewed</option><option value="published">Published variant</option></select></label>
    <CompanyDesignList resource={resource} before={before} busy={busy} setBefore={setBefore} setSelected={setSelected} />
    {selected && saved && <CompanyDesignDetail key={selected} id={selected} profile={saved} model={model} canManage={capabilities.manageBrand && !model.busy && !conflict} onChanged={resource.reload} />}
  </details>;
}
