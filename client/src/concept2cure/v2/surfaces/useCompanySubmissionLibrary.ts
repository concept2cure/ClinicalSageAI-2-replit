import { useEffect, useRef, useState } from 'react';
import type { CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { apiCall, apiErrorText } from '../apiCall';
import type { Notice } from './SubmissionSeqWorkspaces';

const PATH = '/api/client-branding/company-documents';
export interface CompanyLegalInventoryPage { total: number; availableTotal: number; limit: number; offset: number; hasMore: boolean; nextOffset: number | null }
interface Inventory { data: CompanyLegalDocument[]; page: CompanyLegalInventoryPage }
interface LibraryQuery { owner: string; q: string; allPrograms: boolean; offset: number }
function profileResponse(value: unknown): value is CompanyDocumentsResponse {
  const body = value as CompanyDocumentsResponse | null;
  return Boolean(body && typeof body.canManage === 'boolean' && body.data?.version === 1 && Number.isSafeInteger(body.data.revision) && Array.isArray(body.data.legalDocuments));
}
function inventoryResponse(value: unknown): value is Inventory {
  const body = value as Inventory | null;
  return Boolean(body && Array.isArray(body.data) && Number.isSafeInteger(body.page?.total) && Number.isSafeInteger(body.page.offset) && typeof body.page.hasMore === 'boolean');
}
async function readLibrary(programId: string | null | undefined, query: LibraryQuery) {
  const params = new URLSearchParams({ q: query.q, limit: '25', offset: String(query.offset), sort: 'title', includeArchived: 'false' });
  if (!query.allPrograms && programId) params.set('programId', programId);
  const [profile, inventory] = await Promise.all([apiCall('GET', `${PATH}?includeLegal=false`), apiCall('GET', `${PATH}/legal-documents?${params}`)]);
  if (!profile.ok || !profileResponse(profile.body)) return { error: apiErrorText(profile, 'The company presentation could not be read.') };
  if (!inventory.ok || !inventoryResponse(inventory.body)) return { error: apiErrorText(inventory, 'The company legal document inventory could not be read. No library entry is available to select.') };
  return { response: { ...profile.body, data: { ...profile.body.data, legalDocuments: inventory.body.data } }, page: inventory.body.page };
}

/** Bounded legal inventory, with every receipt scoped to the authenticated filing. */
export function useCompanySubmissionLibrary(owner: string, programId?: string | null) {
  const [state, setState] = useState<{ owner: string; loading: boolean; response: CompanyDocumentsResponse | null; page: CompanyLegalInventoryPage | null; error: string }>({ owner: '', loading: true, response: null, page: null, error: '' });
  const [epoch, setEpoch] = useState(0), [query, setQuery] = useState<LibraryQuery>({ owner: '', q: '', allPrograms: false, offset: 0 });
  const [searchText, setSearchText] = useState(''), [selectedId, setSelectedId] = useState(''), [variantId, setVariantId] = useState('');
  const [section, setSection] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState<Notice | null>(null);
  const session = useRef({ generation: 0 }), active = state.owner === owner, response = active ? state.response : null;
  const current = query.owner === owner ? query : { owner, q: '', allPrograms: false, offset: 0 };
  useEffect(() => { setVariantId(''); setSearchText(''); }, [owner]);
  useEffect(() => {
    const currentSession = session.current, ticket = ++currentSession.generation;
    setSelectedId(''); setSection(''); setReason(''); setBusy(false); setNote(null);
    setState(previous => ({ owner, loading: true, response: previous.owner === owner ? previous.response : null, page: null, error: '' }));
    void readLibrary(programId, { owner, q: current.q, allPrograms: current.allPrograms, offset: current.offset }).then(result => {
      if (ticket !== currentSession.generation) return;
      if (result.error || !result.response || !result.page) { setState({ owner, loading: false, response: null, page: null, error: result.error ?? 'The company library could not be verified.' }); return; }
      setState({ owner, loading: false, response: result.response, page: result.page, error: '' });
    });
    return () => { currentSession.generation++; };
  }, [owner, programId, epoch, current.q, current.allPrograms, current.offset]);
  const changeQuery = (patch: Partial<Omit<LibraryQuery, 'owner'>>) => setQuery({ ...current, ...patch, owner });
  const setResponse = (next: CompanyDocumentsResponse) => setState(previous => ({ ...previous, owner, loading: false, error: '',
    response: { ...next, data: { ...next.data, legalDocuments: (previous.response?.data.legalDocuments ?? []).map(document => next.data.legalDocuments.find(updated => updated.id === document.id) ?? document) } } }));
  return { state, active, response, selectedId, variantId, setVariantId, section, reason, busy, note, session,
    setSelectedId, setSection, setReason, setBusy, setNote, setResponse, retry: () => setEpoch(value => value + 1),
    searchText, setSearchText, search: () => changeQuery({ q: searchText.trim(), offset: 0 }), allPrograms: current.allPrograms,
    setAllPrograms: (allPrograms: boolean) => changeQuery({ allPrograms, offset: 0 }),
    page: active ? state.page : null, goToOffset: (offset: number) => changeQuery({ offset }) };
}
export type CompanyLibrary = ReturnType<typeof useCompanySubmissionLibrary>;
