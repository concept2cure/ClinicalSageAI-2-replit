import React, { useEffect, useRef, useState } from 'react';
import type { CompanyLegalCommunicationLink } from '@shared/company-correspondence';
import type { CompanyLegalDocument } from '@shared/company-documents';
import { apiCall, apiErrorText } from '../apiCall';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import type { CompanyLegalInventoryPage } from './useCompanySubmissionLibrary';
const EMPTY_LINKS: CompanyLegalCommunicationLink[] = [];

/** Links exact originals to the existing inbox/handoff; an outcome never changes approval. */
export function CompanyLegalCommunicationLinks({ projectId, recordId, kind, initial = EMPTY_LINKS }: {
  projectId: string; recordId: string; kind: 'agency' | 'handoff'; initial?: CompanyLegalCommunicationLink[];
}) {
  const [open, setOpen] = useState(false), [documents, setDocuments] = useState<CompanyLegalDocument[]>([]), [page, setPage] = useState<CompanyLegalInventoryPage | null>(null);
  const [searchText, setSearchText] = useState(''), [query, setQuery] = useState(''), [offset, setOffset] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [links, setLinks] = useState(initial), [selected, setSelected] = useState(''), [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<CompanyLegalCommunicationLink['outcome']>('referenced');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const session = useRef({ value: 0 }), owner = `${getJwtOrgId()}:${getAuthToken()}:${projectId}:${recordId}:${kind}`;
  useEffect(() => { session.current.value++; setOpen(false); setDocuments([]); setPage(null); setSelected(''); setReason(''); setLinks(initial); setBusy(false); setMessage(''); setError(''); setSearchText(''); setQuery(''); setOffset(0); }, [owner, initial]);
  useEffect(() => {
    if (!open) return;
    const currentSession = session.current;
    const ticket = ++currentSession.value;
    setBusy(true); setError(''); setSelected(''); setDocuments([]); setPage(null);
    const params = new URLSearchParams({ q: query, limit: '25', offset: String(offset), sort: 'title', includeArchived: 'true' });
    void apiCall('GET', `/api/concept2cure/projects/${encodeURIComponent(projectId)}/company-legal-documents?${params}`).then(result => {
      if (ticket !== session.current.value) return;
      setBusy(false);
      const body = result.body as { data?: CompanyLegalDocument[]; page?: CompanyLegalInventoryPage } | null;
      if (!result.ok || !Array.isArray(body?.data) || !body.page) { setError(apiErrorText(result, 'The company library could not be read.')); return; }
      setDocuments(body.data); setPage(body.page);
    });
    return () => { currentSession.value++; };
  }, [open, owner, projectId, query, offset, epoch]);
  const save = async () => {
    if (!selected || reason.trim().length < 8 || busy) return;
    const ticket = session.current.value; setBusy(true); setError(''); setMessage('');
    const path = kind === 'agency' ? 'agency-communications' : 'submission-center/items';
    const result = await apiCall('POST', `/api/concept2cure/projects/${encodeURIComponent(projectId)}/${path}/${encodeURIComponent(recordId)}/legal-documents`,
      { registryIds: [selected], outcome, reason: reason.trim() });
    if (ticket !== session.current.value) return;
    setBusy(false);
    const body = result.body as { data?: { id?: string; companyLegalDocuments?: CompanyLegalCommunicationLink[]; message?: string } } | null;
    if (!result.ok || body?.data?.id !== recordId || !Array.isArray(body.data.companyLegalDocuments)) { setError(apiErrorText(result, 'The legal link was not confirmed. Reload the record before retrying.')); return; }
    setLinks(body.data.companyLegalDocuments); setSelected(''); setReason(''); setMessage(body.data.message ?? 'Exact legal version linked.');
  };
  return <div className="company-register" role="group" aria-label="Legal versions linked to this record">
    {links.length > 0 && <ul>{links.map(link => <li key={`${link.registryId}:${link.contentHash}:${link.outcome}`}>
      Vault {link.vaultDocumentId} · version {link.version} · {link.outcome.replaceAll('_', ' ')}<br /><span className="mono">SHA-256 {link.contentHash}</span>
    </li>)}</ul>}
    <button type="button" className="cc-btn sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Close legal document links' : 'Link company legal document'}</button>
    {open && <fieldset disabled={busy}>
      <legend>Record the exact original and agency outcome</legend>
      <label className="company-field"><span>Search this project’s registered legal versions</span><input value={searchText} maxLength={200} onChange={event => setSearchText(event.target.value)} /></label>
      <button type="button" className="cc-btn sm" onClick={() => { setQuery(searchText.trim()); setOffset(0); }}>Search legal versions</button>
      <label className="company-field"><span>Company legal original</span><select value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Select a registered version</option>{documents.map(document => <option key={document.id} value={document.id}>{document.title} · v{document.version}{document.active ? '' : ' · archived'}</option>)}
      </select></label>
      {page && <div><span>{page.total} matching versions</span>
        <button type="button" className="cc-btn sm" disabled={page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.limit))}>Previous legal versions</button>
        <button type="button" className="cc-btn sm" disabled={!page.hasMore} onClick={() => setOffset(page.nextOffset!)}>Next legal versions</button>
      </div>}
      <label className="company-field"><span>Recorded outcome</span><select value={outcome} onChange={e => setOutcome(e.target.value as typeof outcome)}>
        {(['referenced', 'acknowledged', 'questioned', 'replacement_requested', 'rejected'] as const).map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
      </select></label>
      <label className="company-field"><span>Reason for linking this version</span><input value={reason} onChange={e => setReason(e.target.value)} minLength={8} maxLength={2000} /></label>
      <p className="company-hint">An agency rejection or replacement request is a recorded notice. It does not revoke legal authority or change Vault approval.</p>
      <button type="button" className="cc-btn sm primary" disabled={!selected || reason.trim().length < 8} onClick={() => void save()}>Link exact legal version</button>
    </fieldset>}
    {busy && <p role="status">Reading or saving legal document links…</p>}
    {error && <p role="alert">{error} <button type="button" className="cc-btn sm" onClick={() => setEpoch(value => value + 1)}>Retry legal versions</button></p>}{message && <p role="status">{message}</p>}
  </div>;
}
