import React, { useState } from 'react';
import { apiErrorText } from '../../apiCall';
import { COMPANY_DOCUMENTS_PATH, type CompanyDocumentSettingsModel } from '../useCompanyDocumentSettings';
import { useCompanyResource } from './useCompanyResource';
import { CompanyBrandingPolicy } from './CompanyBrandingPolicy';

interface Grant { user_id: number; name: string; email: string; role: string; manage_brand: boolean; manage_legal: boolean }
function grantsOf(value: unknown): Grant[] | null {
  const data = (value as { data?: unknown } | null)?.data;
  return Array.isArray(data) && data.every(row => Number.isSafeInteger(row.user_id) && typeof row.role === 'string' && typeof row.manage_brand === 'boolean' && typeof row.manage_legal === 'boolean') ? data : null;
}
const inherited = (role: string) => role === 'owner' || role === 'admin';

function PermissionEditor({ rows, resource, onSaved }: { rows: Grant[]; resource: ReturnType<typeof useCompanyResource<Grant[]>>; onSaved: () => void }) {
  const [selected, setSelected] = useState('');
  const [brand, setBrand] = useState(false);
  const [legal, setLegal] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const choose = (id: string) => { const row = rows.find(item => String(item.user_id) === id); setSelected(id); setBrand(row?.manage_brand ?? false); setLegal(row?.manage_legal ?? false); setReason(''); setNotice(null); };
  const save = async () => {
    if (!selected || reason.trim().length < 8 || busy) return;
    setBusy(true); setNotice(null);
    const result = await resource.call('PUT', `${COMPANY_DOCUMENTS_PATH}/permissions/${encodeURIComponent(selected)}`, { manageBrand: brand, manageLegal: legal, reason: reason.trim() });
    if (!result) return;
    setBusy(false);
    const confirmed = result.ok && result.body?.success === true && result.body.userId === Number(selected) && result.body.manageBrand === brand && result.body.manageLegal === legal;
    if (!confirmed) { setNotice({ error: true, text: apiErrorText(result, 'The permission change could not be confirmed. Your choices are retained.') }); return; }
    setReason(''); onSaved(); resource.reload();
  };
  return <>
    {notice && <p className={`company-notice${notice.error ? ' company-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    <label className="company-field"><span>Member receiving company-document responsibilities</span><select value={selected} disabled={busy} onChange={e => choose(e.target.value)}><option value="">Choose an active member</option>{rows.filter(row => !inherited(row.role)).map(row => <option key={row.user_id} value={row.user_id}>{row.name || row.email} · {row.role}</option>)}</select></label>
    {selected && <fieldset className="company-editor" disabled={busy}>
      <label className="company-check"><input type="checkbox" checked={brand} onChange={e => setBrand(e.target.checked)} />Manage company identity and presentation</label>
      <label className="company-check"><input type="checkbox" checked={legal} onChange={e => setLegal(e.target.checked)} />Manage the company legal library and workflow records</label>
      <label className="company-field"><span>Reason for company permission change</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button type="button" className="btn primary small" disabled={reason.trim().length < 8} onClick={() => void save()}>Save company responsibilities</button>
    </fieldset>}
  </>;
}

export function CompanyPermissionsPanel({ model }: { model?: CompanyDocumentSettingsModel }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const resource = useCompanyResource(open ? `${COMPANY_DOCUMENTS_PATH}/permissions` : null, grantsOf);
  return <details className="company-setup-guide" onToggle={event => setOpen(event.currentTarget.open)}><summary>Company-document responsibilities</summary>
    <p className="company-hint">Owners and administrators inherit these rights. Delegating presentation or legal management does not grant organization administration, project access, source approval or signature authority.</p>
    {model?.saved && <CompanyBrandingPolicy model={model} profile={model.saved} />}
    {saved && <p className="company-notice" role="status">Company-document permissions saved. Membership and project access remain independently enforced.</p>}
    {resource.loading && <p role="status">Reading active memberships and company responsibilities…</p>}
    {resource.error && <div className="company-notice company-error" role="alert">{resource.error}<button className="btn ghost small" type="button" onClick={resource.reload}>Retry company responsibilities</button></div>}
    {resource.data && <>
      {resource.data.length === 0 ? <p>No active organization memberships were returned.</p> : <ul className="company-permission-roster">{resource.data.map(row => <li key={row.user_id}><strong>{row.name || row.email}</strong> · {inherited(row.role) ? 'Inherited organization role rights' : `Presentation ${row.manage_brand ? 'on' : 'off'} · legal management ${row.manage_legal ? 'on' : 'off'}`}</li>)}</ul>}
      <PermissionEditor rows={resource.data} resource={resource} onSaved={() => setSaved(true)} />
    </>}
  </details>;
}
