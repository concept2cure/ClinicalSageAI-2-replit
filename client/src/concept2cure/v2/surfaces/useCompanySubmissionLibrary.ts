import { useEffect, useRef, useState } from 'react';
import type { CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { apiCall, apiErrorText } from '../apiCall';
import type { Notice } from './SubmissionSeqWorkspaces';
import { companySetter, useCompanyLease, useCompanySession, type CompanySession } from './company-documents/companySession';

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
async function readLibrary(programId: string | null | undefined, query: LibraryQuery, current: () => boolean) {
  const params = new URLSearchParams({ q: query.q, limit: '25', offset: String(query.offset), sort: 'title', includeArchived: 'false' });
  if (!query.allPrograms && programId) params.set('programId', programId);
  const [profile, inventory] = await Promise.all([apiCall('GET', `${PATH}?includeLegal=false`, undefined, current), apiCall('GET', `${PATH}/legal-documents?${params}`, undefined, current)]);
  if (!profile || !inventory || !current()) return null;
  if (!profile.ok || !profileResponse(profile.body)) return { error: apiErrorText(profile, 'The company presentation could not be read.') };
  if (!inventory.ok || !inventoryResponse(inventory.body)) return { error: apiErrorText(inventory, 'The company legal document inventory could not be read. No library entry is available to select.') };
  return { response: { ...profile.body, data: { ...profile.body.data, legalDocuments: inventory.body.data } }, page: inventory.body.page };
}

/** Bounded legal inventory, with every receipt scoped to the authenticated filing. */
export function useCompanySubmissionLibrary(owner: string, programId?: string | null, admittedOwner?: CompanySession) {
  const [state, setState] = useState<{ owner: string; loading: boolean; response: CompanyDocumentsResponse | null; page: CompanyLegalInventoryPage | null; error: string }>({ owner: '', loading: true, response: null, page: null, error: '' });
  const [epoch, setEpoch] = useState(0), [query, setQuery] = useState<LibraryQuery>({ owner: '', q: '', allPrograms: false, offset: 0 });
  const [searchText, setSearchText] = useState(''), [selectedId, setSelectedId] = useState(''), [variantId, setVariantId] = useState('');
  const [section, setSection] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState<Notice | null>(null);
  const account = useCompanySession();
  const sessionOwner = admittedOwner ?? account;
  const queryOwner = JSON.stringify([sessionOwner.key, owner]);
  const current = query.owner === queryOwner ? query : { owner: queryOwner, q: '', allPrograms: false, offset: 0 };
  const lease = useCompanyLease(sessionOwner, JSON.stringify([owner, programId, epoch, current.q, current.allPrograms, current.offset]));
  const receiptOwner = lease.key;
  const session = useRef({ generation: 0 });
  const active = lease.current() && state.owner === receiptOwner, response = active ? state.response : null;
  useEffect(() => { setVariantId(''); setSearchText(''); }, [queryOwner]);
  useEffect(() => {
    const currentSession = session.current, ticket = ++currentSession.generation;
    const isCurrent = () => lease.current() && ticket === currentSession.generation;
    setSelectedId(''); setSection(''); setReason(''); setBusy(false); setNote(null);
    setState(previous => ({ owner: receiptOwner, loading: true, response: previous.owner === receiptOwner ? previous.response : null, page: null, error: '' }));
    if (isCurrent()) void readLibrary(programId, { owner, q: current.q, allPrograms: current.allPrograms, offset: current.offset }, isCurrent).then(result => {
      if (!result || !isCurrent()) return;
      if (result.error || !result.response || !result.page) { setState({ owner: receiptOwner, loading: false, response: null, page: null, error: result.error ?? 'The company library could not be verified.' }); return; }
      setState({ owner: receiptOwner, loading: false, response: result.response, page: result.page, error: '' });
    });
    return () => { currentSession.generation++; };
  }, [owner, programId, current.q, current.allPrograms, current.offset, receiptOwner, lease]);
  const changeQuery = (patch: Partial<Omit<LibraryQuery, 'owner'>>) => { if (lease.current()) setQuery({ ...current, ...patch, owner: queryOwner }); };
  const setResponse = (next: CompanyDocumentsResponse) => companySetter(lease.current, setState)(previous => ({ ...previous, owner: receiptOwner, loading: false, error: '',
    response: { ...next, data: { ...next.data, legalDocuments: (previous.response?.data.legalDocuments ?? []).map(document => next.data.legalDocuments.find(updated => updated.id === document.id) ?? document) } } }));
  const visible = active ? state : { owner: receiptOwner, loading: true, response: null, page: null, error: '' };
  return { state: visible, active, response, owner: receiptOwner, current: lease.current,
    selectedId: active ? selectedId : '', variantId: active ? variantId : '', setVariantId: companySetter(lease.current, setVariantId),
    section: active ? section : '', reason: active ? reason : '', busy: active && busy, note: active ? note : null, session,
    setSelectedId: companySetter(lease.current, setSelectedId), setSection: companySetter(lease.current, setSection), setReason: companySetter(lease.current, setReason),
    setBusy: companySetter(lease.current, setBusy), setNote: companySetter(lease.current, setNote), setResponse, retry: () => { if (lease.current()) setEpoch(value => value + 1); },
    searchText: active ? searchText : '', setSearchText: companySetter(lease.current, setSearchText), search: () => changeQuery({ q: searchText.trim(), offset: 0 }), allPrograms: active && current.allPrograms,
    setAllPrograms: (allPrograms: boolean) => changeQuery({ allPrograms, offset: 0 }),
    page: active ? state.page : null, goToOffset: (offset: number) => changeQuery({ offset }) };
}
export type CompanyLibrary = ReturnType<typeof useCompanySubmissionLibrary>;
