import React, { useState } from 'react';
import { COMPANY_LEGAL_KINDS, type CompanyLegalDocument } from '@shared/company-documents';
import { COMPANY_DOCUMENTS_PATH } from '../useCompanyDocumentSettings';
import { useCompanyResource } from './useCompanyResource';

type Filters = { query: string; kind: string; agency: string; language: string; validity: string; sort: string };
interface InventoryPage {
  data: CompanyLegalDocument[];
  page: { total: number; availableTotal: number; limit: number; offset: number; hasMore: boolean; nextOffset: number | null };
  facets: { agencies: string[]; languages: string[] };
}
const INITIAL: Filters = { query: '', kind: '', agency: '', language: '', validity: '', sort: 'title' };
const title = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
function inventoryOf(value: unknown): InventoryPage | null {
  const result = value as InventoryPage | null;
  if (!result || !Array.isArray(result.data) || !result.data.every(document => typeof document.id === 'string' && typeof document.title === 'string')) return null;
  const page = result.page;
  const countsValid = page && [page.total, page.availableTotal, page.offset].every(count => Number.isSafeInteger(count) && count >= 0) && Number.isSafeInteger(page.limit) && page.limit > 0;
  const pagingValid = countsValid && typeof page.hasMore === 'boolean' && (page.nextOffset === null || Number.isSafeInteger(page.nextOffset));
  const facetsValid = result.facets && [result.facets.agencies, result.facets.languages].every(facet => Array.isArray(facet) && facet.every(item => typeof item === 'string'));
  return pagingValid && facetsValid ? result : null;
}
function inventoryPath(filters: Filters, includeArchived: boolean, offset: number) {
  const query = new URLSearchParams({ limit: '10', offset: String(offset), includeArchived: String(includeArchived), sort: filters.sort });
  if (filters.query.trim()) query.set('q', filters.query.trim());
  (['kind', 'agency', 'language', 'validity'] as const).forEach(key => { if (filters[key]) query.set(key, filters[key]); });
  return `${COMPANY_DOCUMENTS_PATH}/legal-documents?${query}`;
}
function InventoryFilters({ facets, filters, change }: { facets: InventoryPage['facets']; filters: Filters; change: (key: keyof Filters, value: string) => void }) {
  const agencies = [...new Set([...facets.agencies, filters.agency].filter(Boolean))];
  const languages = [...new Set([...facets.languages, filters.language].filter(Boolean))];
  return <div className="company-inventory-filters">
    <label className="company-field company-wide"><span>Search legal inventory</span><input value={filters.query} placeholder="Title, agency, language, type or version" onChange={event => change('query', event.target.value)} /></label>
    <label className="company-field"><span>Filter by document kind</span><select value={filters.kind} onChange={event => change('kind', event.target.value)}><option value="">All kinds</option>{COMPANY_LEGAL_KINDS.map(kind => <option key={kind} value={kind}>{title(kind)}</option>)}</select></label>
    <label className="company-field"><span>Filter by agency</span><select value={filters.agency} onChange={event => change('agency', event.target.value)}><option value="">All recorded agencies</option>{agencies.map(agency => <option key={agency}>{agency}</option>)}</select></label>
    <label className="company-field"><span>Filter by language</span><select value={filters.language} onChange={event => change('language', event.target.value)}><option value="">All languages</option>{languages.map(language => <option key={language}>{language}</option>)}</select></label>
    <label className="company-field"><span>Filter by validity</span><select value={filters.validity} onChange={event => change('validity', event.target.value)}><option value="">All statuses</option><option value="approved">Current and approved</option><option value="unapproved">Current filing checks not met</option><option value="expiring">Expires within 30 days</option><option value="expired">Expired</option><option value="future">Not effective yet</option><option value="revoked">Revoked</option><option value="archived">Archived</option></select></label>
    <label className="company-field"><span>Sort legal inventory</span><select value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="title">Title A–Z</option><option value="expiry">Earliest expiry first</option><option value="recent">Most recently registered</option></select></label>
  </div>;
}
function InventoryResults({ data, setOffset, renderDocument }: { data: InventoryPage; setOffset: (offset: number) => void; renderDocument: (document: CompanyLegalDocument) => React.ReactNode }) {
  const { page } = data;
  return <>
    <p className="company-hint" role="status">{page.total} matching legal entries · {page.availableTotal} accessible inventory entries in this view. Counts and choices include only currently accessible projects.</p>
    {page.availableTotal === 0 && <p className="company-empty">No legal documents are available in this inventory view. Originals remain in their project Vaults.</p>}
    {page.availableTotal > 0 && page.total === 0 && <p className="company-empty">No legal documents match these filters. Clear the filters or include archived entries to broaden the search.</p>}
    {page.total > 0 && data.data.length === 0 && <p className="company-empty">This page no longer contains records. Return to the first page to read the current matches.</p>}
    <div className="company-legal-list">{data.data.map(document => <React.Fragment key={document.id}>{renderDocument(document)}</React.Fragment>)}</div>
    {page.total > 0 && <div className="company-pagination" role="group" aria-label="Legal inventory pages"><button className="btn ghost small" type="button" disabled={page.offset === 0} onClick={() => setOffset(0)}>First legal page</button><button className="btn ghost small" type="button" disabled={page.offset === 0} onClick={() => setOffset(Math.max(0, page.offset - page.limit))}>Previous legal page</button><span>Page {Math.floor(page.offset / page.limit) + 1} of {Math.max(1, Math.ceil(page.total / page.limit))}</span><button className="btn ghost small" type="button" disabled={!page.hasMore || page.nextOffset === null} onClick={() => setOffset(page.nextOffset!)}>Next legal page</button></div>}
  </>;
}
export function CompanyLegalInventory({ includeArchived, revision, renderDocument }: {
  includeArchived: boolean; revision: number; renderDocument: (document: CompanyLegalDocument) => React.ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [requestedPage, setPage] = useState({ includeArchived, offset: 0 });
  const offset = requestedPage.includeArchived === includeArchived ? requestedPage.offset : 0;
  const setOffset = (value: number) => setPage({ includeArchived, offset: value });
  const change = (key: keyof Filters, value: string) => { setFilters(previous => ({ ...previous, [key]: value })); setOffset(0); };
  const resource = useCompanyResource(inventoryPath(filters, includeArchived, offset), inventoryOf, revision);
  return <section className="company-legal-inventory" aria-label="Legal inventory search and results">
    <InventoryFilters facets={resource.data?.facets ?? { agencies: [], languages: [] }} filters={filters} change={change} />
    <p className="company-hint">Agency filters include unrestricted entries. Status filters check current sources, dates and recorded lifecycle; each filing’s target scope is checked separately.</p>
    {filters.validity === 'archived' && !includeArchived && <p className="company-hint">The Archived status filter explicitly searches archived entries, regardless of the general archive checkbox.</p>}
    <button className="btn ghost small" type="button" onClick={() => { setFilters(INITIAL); setOffset(0); }}>Clear legal filters</button>
    {resource.loading && <p role="status">Reading scoped legal inventory…</p>}
    {resource.error && <p className="company-notice company-error" role="alert">{resource.error} <button className="btn ghost small" type="button" onClick={resource.reload}>Retry legal inventory</button></p>}
    {resource.data && <InventoryResults data={resource.data} setOffset={setOffset} renderDocument={renderDocument} />}
  </section>;
}
