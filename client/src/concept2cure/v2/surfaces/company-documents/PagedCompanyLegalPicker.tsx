import React, { useState } from 'react';
import { COMPANY_LEGAL_KINDS, type CompanyLegalDocument, type CompanyLegalKind } from '@shared/company-documents';
import { COMPANY_LEGAL_PATH, useCompanyLegalResource } from './useCompanyLegalResource';

interface LegalPickerPage { data: CompanyLegalDocument[]; page: { total: number; offset: number; limit: number; hasMore: boolean } }
export interface PagedCompanyLegalPickerProps {
  token: string; programId?: string; kind?: CompanyLegalKind; allowedKinds?: CompanyLegalKind[]; excludeIds?: string[];
  selected: string[]; onChange: (ids: string[]) => void; multiple?: boolean; disabled: boolean; label: string;
}
function verifiedPage(value: unknown): value is LegalPickerPage {
  const body = value as LegalPickerPage | null;
  return Boolean(body && Array.isArray(body.data) && Number.isSafeInteger(body.page?.total) && body.data.every(item => typeof item.id === 'string' && typeof item.title === 'string'));
}
function initialLegalSearch(props: PagedCompanyLegalPickerProps) { return { query: '', offset: 0, kind: props.kind ?? props.allowedKinds?.[0] ?? '' }; }
export function PagedCompanyLegalPicker(props: PagedCompanyLegalPickerProps) {
  const [text, setText] = useState('');
  const [request, setRequest] = useState(() => initialLegalSearch(props));
  const params = new URLSearchParams({ limit: '25', offset: String(request.offset), sort: 'title', includeArchived: 'false' });
  if (request.query) params.set('q', request.query);
  if (request.kind) params.set('kind', request.kind);
  if (props.programId) params.set('programId', props.programId);
  const resource = useCompanyLegalResource<LegalPickerPage>(`${COMPANY_LEGAL_PATH}/legal-documents?${params}`, props.token, `${props.programId ?? 'accessible'}:${props.label}`);
  const page = verifiedPage(resource.data) ? resource.data : null;
  const select = (id: string, checked: boolean) => props.onChange(checked ? props.multiple ? [...new Set([...props.selected, id])] : [id] : props.selected.filter(item => item !== id));
  const permittedKinds = props.allowedKinds ?? [...COMPANY_LEGAL_KINDS];
  return <fieldset className="company-wide"><legend>{props.label}</legend>
    <div className="company-actions"><label className="company-field"><span>Search {props.label.toLowerCase()}</span><input value={text} disabled={props.disabled} onChange={event => setText(event.target.value)} placeholder="Legal title or keyword" /></label>
      <button type="button" className="btn ghost small" disabled={props.disabled || resource.loading} onClick={() => setRequest(previous => ({ ...previous, query: text.trim(), offset: 0 }))}>Search legal versions</button>
    </div>
    {!props.kind && <label className="company-field"><span>Document kind for {props.label.toLowerCase()}</span><select value={request.kind} disabled={props.disabled} onChange={event => setRequest(previous => ({ ...previous, kind: event.target.value as CompanyLegalKind, offset: 0 }))}>
      {!props.allowedKinds && <option value="">All document kinds</option>}{permittedKinds.map(kind => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}
    </select></label>}
    <p className="company-hint">Selections identify exact registered versions. Current access, approval and applicability are checked again when saved and filed.</p>
    {resource.loading && <p role="status">Loading registered legal versions…</p>}
    {resource.error && <p role="alert">{resource.error} <button type="button" disabled={props.disabled} onClick={resource.retry}>Retry legal version search</button></p>}
    {page && <><p role="status">{page.page.total} accessible registered version(s) match this search.</p>
      {page.data.filter(document => !props.excludeIds?.includes(document.id)).map(document => <label className="company-check" key={document.id}>
        <input type="checkbox" disabled={props.disabled} checked={props.selected.includes(document.id)} onChange={event => select(document.id, event.target.checked)} />{document.title} · v{document.version} · {document.language}{document.transmitRefusal ? ' · review needed before filing' : ''}
      </label>)}
      <div className="company-actions" role="group" aria-label={`${props.label} pages`}><button type="button" className="btn ghost small" disabled={props.disabled || request.offset === 0} onClick={() => setRequest(previous => ({ ...previous, offset: Math.max(0, previous.offset - 25) }))}>Previous legal versions</button>
        <button type="button" className="btn ghost small" disabled={props.disabled || !page.page.hasMore} onClick={() => setRequest(previous => ({ ...previous, offset: previous.offset + 25 }))}>Next legal versions</button></div>
    </>}
    {props.selected.map(id => <p key={id} className="company-hint">Selected: {page?.data.find(document => document.id === id)?.title ?? id} <button type="button" className="btn ghost small" disabled={props.disabled} onClick={() => select(id, false)}>Remove selected legal version</button></p>)}
  </fieldset>;
}
