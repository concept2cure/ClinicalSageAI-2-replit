import React, { useEffect, useRef, useState } from 'react';
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import { apiCall, apiErrorText } from '../../apiCall';
import type { LibraryHit, LibraryShape } from '../VaultLibraryResults';

const PAGE_SIZE = 25;
function readLibrary(value: unknown): LibraryShape | null {
  const body = value as { data?: unknown } | null;
  const data = (body?.data ?? value) as LibraryShape | null;
  if (!data || data.scope !== 'verified-accessible-programs' || !Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.results)) return null;
  return data.results.every(hit => typeof hit.id === 'string' && typeof hit.title === 'string' && typeof hit.current === 'boolean' && typeof hit.program?.id === 'string') ? data : null;
}

function useVaultPage(request: { query: string; offset: number; attempt: number }) {
  const owner = `${getJwtOrgId()}:${getAuthToken()}`;
  const path = request.query ? `/api/c2c/project-vault/search?q=${encodeURIComponent(request.query)}&limit=${PAGE_SIZE}${request.offset ? `&offset=${request.offset}` : ''}` : null;
  const key = `${owner}:${path}:${request.attempt}`;
  const pending = useRef({ generation: 0 });
  const [state, setState] = useState<{ key: string; loading: boolean; data: LibraryShape | null; error: string }>({ key, loading: false, data: null, error: '' });
  useEffect(() => {
    const guard = pending.current; const ticket = ++guard.generation;
    setState({ key, loading: Boolean(path), data: null, error: '' });
    if (path) void apiCall('GET', path).then(result => {
      if (guard.generation !== ticket) return;
      const data = result.ok ? readLibrary(result.body) : null;
      setState({ key, loading: false, data, error: data ? '' : apiErrorText(result, 'The Vault search could not be verified. This is not an empty result.') });
    });
    return () => { guard.generation++; };
  }, [path, key]);
  return state.key === key ? state : { key, loading: Boolean(path), data: null, error: '' };
}

function VaultSearchResults({ data, disabled, onChoose }: { data: LibraryShape; disabled: boolean; onChoose: (hit: LibraryHit) => void }) {
  return <div className="company-search-results">
    {data.results.length === 0 && <p>No matching documents on this page in your accessible projects.</p>}
    {data.results.map(hit => <div className="company-search-hit" key={hit.id}><span><strong>{hit.title}</strong><small>{hit.program.name || 'Project'} · version {hit.version || 'not recorded'}{hit.current ? '' : ' · earlier version'}</small></span>
      <button type="button" className="btn ghost small" disabled={disabled || !hit.current} onClick={() => onChoose(hit)}>Select document</button></div>)}
  </div>;
}

export function CompanyVaultPicker({ onChoose, disabled }: { onChoose: (hit: LibraryHit) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const [request, setRequest] = useState({ query: '', offset: 0, attempt: 0 });
  const state = useVaultPage(request);
  const search = () => setRequest(previous => ({ query: text.trim(), offset: 0, attempt: previous.attempt + 1 }));
  const retry = () => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1 }));
  const move = (offset: number) => setRequest(previous => ({ ...previous, offset, attempt: previous.attempt + 1 }));
  const total = state.data?.total ?? 0;
  const shown = state.data?.results.length ?? 0;
  return <div className="company-vault-search">
    <div className="company-actions"><label className="company-field"><span>Search your accessible Vaults</span><input value={text} onChange={e => setText(e.target.value)} placeholder="Document title or keyword" onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { e.preventDefault(); search(); } }} /></label>
      <button className="btn ghost small" type="button" disabled={disabled || !text.trim() || state.loading} onClick={search}>Search Vault</button></div>
    <p className="company-hint">Choose a current PDF original. Its exact version and access are checked when it is registered; selecting a search result does not approve it.</p>
    {state.loading && <p role="status">Searching accessible project Vaults…</p>}
    {state.error && <div className="company-notice company-error" role="alert">{state.error}<button className="btn ghost small" type="button" disabled={disabled || state.loading} onClick={retry}>Retry Vault search</button></div>}
    {state.data && <>
      <p role="status" className="company-hint">{shown ? `Showing ${request.offset + 1}–${request.offset + shown}` : 'Showing 0'} of {total} matching documents in accessible projects.</p>
      <VaultSearchResults data={state.data} disabled={disabled} onChoose={onChoose} />
      <div className="company-pagination" role="group" aria-label="Vault search pages"><button type="button" className="btn ghost small" disabled={disabled || request.offset === 0} onClick={() => move(Math.max(0, request.offset - PAGE_SIZE))}>Previous Vault results</button><button type="button" className="btn ghost small" disabled={disabled || request.offset + PAGE_SIZE >= total} onClick={() => move(request.offset + PAGE_SIZE)}>Next Vault results</button></div>
    </>}
  </div>;
}
