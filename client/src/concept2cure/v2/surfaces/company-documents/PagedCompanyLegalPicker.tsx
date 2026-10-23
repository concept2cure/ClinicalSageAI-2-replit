import React, { useRef, useState } from 'react';
import { COMPANY_LEGAL_KINDS, type CompanyLegalDocument, type CompanyLegalKind } from '@shared/company-documents';
import { COMPANY_LEGAL_PATH, useCompanyLegalResource } from './useCompanyLegalResource';
import { companySetter, useCompanyLease, useCompanySession } from './companySession';

interface LegalPickerPage { data: CompanyLegalDocument[]; page: { total: number; offset: number; limit: number; hasMore: boolean } }
export interface PagedCompanyLegalPickerProps {
  token: string; programId?: string; kind?: CompanyLegalKind; allowedKinds?: CompanyLegalKind[]; excludeIds?: string[];
  selected: string[]; onChange: (ids: string[]) => void; multiple?: boolean; disabled: boolean; label: string;
  rowRefusal?: (document: CompanyLegalDocument) => string | null; maxSelected?: number; current?: () => boolean;
}
function verifiedPage(value: unknown): value is LegalPickerPage {
  const body = value as LegalPickerPage | null;
  return Boolean(body && Array.isArray(body.data) && Number.isSafeInteger(body.page?.total) && body.page.total >= 0
    && Number.isSafeInteger(body.page.offset) && body.page.offset >= 0 && body.page.limit === 25 && typeof body.page.hasMore === 'boolean'
    && body.data.length <= 25 && body.data.every(item => item && typeof item === 'object'
      && typeof item.id === 'string' && item.id.trim() && typeof item.title === 'string'));
}
function initialLegalSearch(props: PagedCompanyLegalPickerProps) { return { query: '', offset: 0, kind: props.kind ?? props.allowedKinds?.[0] ?? '' }; }
function selectionLimit(maximum?: number) { return maximum === undefined ? Infinity : Number.isSafeInteger(maximum) && maximum >= 0 ? maximum : 0; }
function rowRefusal(props: PagedCompanyLegalPickerProps, document: CompanyLegalDocument) {
  try { return props.rowRefusal?.(document) ?? null; }
  catch { return 'This legal version could not be verified.'; }
}
function useLegalPickerModel(props: PagedCompanyLegalPickerProps) {
  const [text, setText] = useState('');
  const [request, setRequest] = useState(() => initialLegalSearch(props));
  const params = new URLSearchParams({ limit: '25', offset: String(request.offset), sort: 'title', includeArchived: 'false' });
  if (request.query) params.set('q', request.query);
  if (request.kind) params.set('kind', request.kind);
  if (props.programId) params.set('programId', props.programId);
  const resource = useCompanyLegalResource<LegalPickerPage>(`${COMPANY_LEGAL_PATH}/legal-documents?${params}`, props.token, `${props.programId ?? 'accessible'}:${props.label}`);
  const session = useCompanySession(props.token);
  const lease = useCompanyLease(session, JSON.stringify([resource.owner, params.toString(), props.kind, props.allowedKinds, props.excludeIds]));
  const visit = useRef({ key: lease.key });
  if (visit.current.key !== lease.key) visit.current = { key: lease.key };
  const captured = visit.current, latest = useRef(props), selected = useRef<string[]>([]);
  latest.current = props; selected.current = [...new Set(props.selected)];
  const current = () => lease.current() && visit.current === captured && props.current?.() !== false && latest.current.current?.() !== false;
  const canChange = () => current() && !latest.current.disabled;
  const page = current() && verifiedPage(resource.data) ? resource.data : null;
  const rows = useRef(page); rows.current = page;
  const select = (id: string, checked: boolean) => {
    if (!canChange()) return;
    const configuration = latest.current, ids = selected.current;
    if (checked) {
      const document = rows.current?.data.find(item => item.id === id);
      if (!document || configuration.excludeIds?.includes(id) || rowRefusal(configuration, document) || ids.includes(id)) return;
      if (configuration.multiple && ids.length >= selectionLimit(configuration.maxSelected)) return;
      if (!configuration.multiple && selectionLimit(configuration.maxSelected) < 1) return;
    }
    const next = checked ? configuration.multiple ? [...ids, id] : [id] : ids.filter(item => item !== id);
    selected.current = next;
    configuration.onChange(next);
  };
  const changeRequest = (change: (previous: typeof request) => typeof request) => {
    if (!canChange()) return;
    visit.current = { key: lease.key }; setRequest(change);
  };
  const retry = () => { if (canChange()) { visit.current = { key: lease.key }; resource.retry(); } };
  const ids = [...new Set(props.selected)], disabled = props.disabled || !current();
  const invalidPage = Boolean(resource.data && !verifiedPage(resource.data));
  return { props, text: current() ? text : '', request, resource, page, ids, disabled, invalidPage, active: current(),
    select, changeRequest, retry, changeText: companySetter(canChange, setText) };
}
type LegalPickerModel = ReturnType<typeof useLegalPickerModel>;
function LegalPickerSearch({ model }: { model: LegalPickerModel }) {
  const { props, text, request, resource, disabled, changeRequest, changeText } = model;
  const permittedKinds = props.allowedKinds ?? [...COMPANY_LEGAL_KINDS];
  return <>
    <div className="company-actions"><label className="company-field"><span>Search {props.label.toLowerCase()}</span><input value={text} disabled={disabled} onChange={event => changeText(event.target.value)} placeholder="Legal title or keyword" /></label>
      <button type="button" className="btn ghost small" disabled={disabled || resource.loading} onClick={() => changeRequest(previous => ({ ...previous, query: text.trim(), offset: 0 }))}>Search legal versions</button>
    </div>
    {!props.kind && <label className="company-field"><span>Document kind for {props.label.toLowerCase()}</span><select value={request.kind} disabled={disabled} onChange={event => changeRequest(previous => ({ ...previous, kind: event.target.value as CompanyLegalKind, offset: 0 }))}>
      {!props.allowedKinds && <option value="">All document kinds</option>}{permittedKinds.map(kind => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}
    </select></label>}
  </>;
}
function LegalPickerResults({ model }: { model: LegalPickerModel }) {
  const { props, page, ids, disabled, select, resource, request, changeRequest } = model;
  if (!page) return null;
  return <><p role="status">{page.page.total} accessible registered version(s) match this search.</p>
      {page.data.filter(document => !props.excludeIds?.includes(document.id)).map(document => {
        const reason = rowRefusal(props, document), checked = ids.includes(document.id);
        return <label className="company-check" key={document.id}>
          <input type="checkbox" disabled={disabled || (!checked && (Boolean(reason) || ids.length >= selectionLimit(props.maxSelected)))} checked={checked} onChange={event => select(document.id, event.target.checked)} />{document.title} · v{document.version} · {document.language}{document.transmitRefusal ? ' · review needed before filing' : ''}{reason && <span> — {reason}</span>}
        </label>;
      })}
      <div className="company-actions" role="group" aria-label={`${props.label} pages`}><button type="button" className="btn ghost small" disabled={disabled || resource.loading || request.offset === 0} onClick={() => changeRequest(previous => ({ ...previous, offset: Math.max(0, previous.offset - 25) }))}>Previous legal versions</button>
        <button type="button" className="btn ghost small" disabled={disabled || resource.loading || !page.page.hasMore} onClick={() => changeRequest(previous => ({ ...previous, offset: previous.offset + 25 }))}>Next legal versions</button></div>
  </>;
}
export function PagedCompanyLegalPicker(props: PagedCompanyLegalPickerProps) {
  const model = useLegalPickerModel(props);
  const { active, resource, invalidPage, disabled, retry, ids, page, select } = model;
  return <fieldset className="company-wide" disabled={disabled}><legend>{props.label}</legend>
    <LegalPickerSearch model={model} />
    <p className="company-hint">Selections identify exact registered versions. Current access, approval and applicability are checked again when saved and filed.</p>
    {active && resource.loading && <p role="status">Loading registered legal versions…</p>}
    {active && (resource.error || invalidPage) && <p role="alert">{resource.error || 'The legal version search could not be verified. Retry before selecting a version.'} <button type="button" disabled={disabled} onClick={retry}>Retry legal version search</button></p>}
    <LegalPickerResults model={model} />
    {active && ids.map(id => <p key={id} className="company-hint">Selected: {page?.data.find(document => document.id === id)?.title ?? id} <button type="button" className="btn ghost small" disabled={disabled} onClick={() => select(id, false)}>Remove selected legal version</button></p>)}
  </fieldset>;
}
