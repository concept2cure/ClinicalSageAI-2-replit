// @vitest-environment jsdom
/** The real outline/read hooks with synthetic saved-project DTOs. */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const apiRequest = vi.hoisted(() => vi.fn());
const actor = vi.hoisted(() => ({ user: { id: 1, organizationId: 7 }, revision: 1 }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(), useAuthUser: () => actor.user,
  authService: { getUser: () => actor.user,
    captureSessionReadGuard: () => { const revision = actor.revision; return { sameRevision: () => actor.revision === revision }; },
    on: () => () => undefined },
}));
import { useFilingOutline } from '../useFilingOutline';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const HOME_PATH = `/api/c2c/documents?projectId=${PROJECT}&scope=home`;
const MARKET_PATH = `/api/c2c/documents?projectId=${PROJECT}&scope=market`;
const doc = (id: string, doc_type: string, agency = 'fda') => ({ id, project_id: PROJECT, doc_type, agency,
  title: `${doc_type} filing`, rule_pack_version: 'v1', status: 'draft', readiness: 0 });
const K510 = doc('filing-510k', 'k510'), CER = doc('filing-cer', 'cer', 'notified_body');
const IVDR = doc('filing-ivdr', 'ivdr', 'notified_body'), IND = doc('filing-ind', 'ind');
const MARKET = doc('filing-ema', 'maa', 'ema');
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const outline = (document: ReturnType<typeof doc>, scope = 'home') => ({ document: { ...document, filing_scope: scope },
  outline: [{ key: `${document.doc_type}.1`, parent_key: null, label: `${document.doc_type} requirements`, mandatory: true,
    path_order: 1, status: 'todo', draft_source: null, has_content: false, version: 1 }], gaps: [] });
function wire(homes = [K510, CER, IVDR, IND], markets = [MARKET]) {
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path === HOME_PATH) return ok({ documents: homes });
    if (path === MARKET_PATH) return ok({ documents: markets });
    const selected = [...homes, ...markets].find(row => path === `/api/c2c/documents/${row.id}/outline`);
    return ok(selected ? outline(selected, markets.includes(selected) ? 'market' : 'home') : { documents: [] });
  });
}
beforeEach(() => { actor.user = { id: 1, organizationId: 7 }; actor.revision = 1; apiRequest.mockReset(); wire(); });
afterEach(cleanup);

describe('exact home and market requirements', () => {
  it('retains newest-home default only when no active document binding was supplied', async () => {
    const { result } = renderHook(() => useFilingOutline(PROJECT));
    await waitFor(() => expect(result.current.document?.id).toBe(K510.id));
    expect(apiRequest.mock.calls.some(([, path]) => path === HOME_PATH)).toBe(true);
    expect(apiRequest.mock.calls.some(([, path]) => path === MARKET_PATH)).toBe(true);
  });
  it.each([CER, IVDR, IND])('selects exact bound $doc_type among mixed home filings', async selected => {
    const { result } = renderHook(() => useFilingOutline(PROJECT, selected.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document?.id).toBe(selected.id); expect(result.current.home?.id).toBe(selected.id);
  });
  it('uses exact market requirements and retains home context', async () => {
    const { result } = renderHook(() => useFilingOutline(PROJECT, MARKET.id));
    await waitFor(() => expect(result.current.document?.id).toBe(MARKET.id));
    expect(result.current.document?.filing_scope).toBe('market'); expect(result.current.home?.id).toBe(K510.id);
  });
  it('retains verified market identity and gaps when an older outline omits filing_scope', async () => {
    const normal = apiRequest.getMockImplementation()!;
    const response = outline(MARKET, 'market');
    const { filing_scope: omitted, ...document } = response.document;
    expect(omitted).toBe('market');
    apiRequest.mockImplementation(async (method: string, path: string) => path.endsWith('/outline')
      ? ok({ ...response, document, gaps: [{ key: '3.2.R', label: 'Regional information' }] }) : normal(method, path));
    const { result } = renderHook(() => useFilingOutline(PROJECT, MARKET.id));
    await waitFor(() => expect(result.current.document?.id).toBe(MARKET.id));
    expect(result.current.document?.filing_scope).toBe('market');
    expect(result.current.gaps).toEqual([{ key: '3.2.R', label: 'Regional information' }]);
  });
  it.each(['missing', '', ' ', ' filing-cer '])('refuses missing or malformed binding %j', async binding => {
    const { result } = renderHook(() => useFilingOutline(PROJECT, binding));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.flat).toEqual([]); expect(result.current.error).toBeTruthy();
    expect(apiRequest.mock.calls.some(([, path]) => String(path).endsWith('/outline'))).toBe(false);
  });
  it('withholds requirements for an unavailable active binding', async () => {
    const { result } = renderHook(() => useFilingOutline(PROJECT, null, { bindingUnavailable: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.error).toBeTruthy();
  });
  it('keeps the explicit home-copy creation door for a known unbound document without reading default requirements', async () => {
    const { result } = renderHook(() => useFilingOutline(PROJECT, null, { unboundDocument: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.home?.id).toBe(K510.id); expect(result.current.markets[0]?.id).toBe(MARKET.id);
    expect(result.current.document).toBeNull(); expect(result.current.flat).toEqual([]);
    expect(result.current.reason).toBe('unbound-document'); expect(result.current.error).toBeUndefined();
    expect(apiRequest.mock.calls.some(([, path]) => String(path).endsWith('/outline'))).toBe(false);
  });
  it('refuses duplicate bound identity', async () => {
    wire([K510, CER, { ...CER, title: 'Duplicate' }]);
    const { result } = renderHook(() => useFilingOutline(PROJECT, CER.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.error).toBeTruthy();
  });
});

describe('source identity and failed reads', () => {
  it('retains exact bound home when the optional market read fails', async () => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) => path === MARKET_PATH
      ? ({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }) as Response : normal(method, path));
    const { result } = renderHook(() => useFilingOutline(PROJECT, CER.id));
    await waitFor(() => expect(result.current.document?.id).toBe(CER.id));
    expect(result.current.marketsError).toBe(true); expect(result.current.error).toBeUndefined();
  });
  it('does not replace a refused market with home requirements', async () => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) => path === MARKET_PATH
      ? ({ ok: false, status: 403, json: async () => ({ message: 'Refused' }) }) as Response : normal(method, path));
    const { result } = renderHook(() => useFilingOutline(PROJECT, MARKET.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.error).toBeTruthy();
  });
  it.each(['home', 'market'])('requires exact project echo on %s list', async source => {
    const normal = apiRequest.getMockImplementation()!;
    const { project_id: omitted, ...row } = source === 'home' ? K510 : MARKET;
    expect(omitted).toBe(PROJECT);
    apiRequest.mockImplementation(async (method: string, path: string) => path.endsWith(`scope=${source}`) ? ok({ documents: [row] }) : normal(method, path));
    const { result } = renderHook(() => useFilingOutline(PROJECT, row.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.error).toBeTruthy();
  });
  it.each(['home', 'market', 'outline'])('rejects wrong-project successful %s response', async source => {
    const selected = source === 'market' ? MARKET : K510, normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (source === 'outline' && path.endsWith('/outline')) return ok({ ...outline(selected), document: { ...selected, project_id: OTHER } });
      return path.endsWith(`scope=${source}`) ? ok({ documents: [{ ...selected, project_id: OTHER }] }) : normal(method, path);
    });
    const { result } = renderHook(() => useFilingOutline(PROJECT, selected.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.flat).toEqual([]); expect(result.current.error).toBeTruthy();
  });
  it.each(['identity', 'shape', 'scope', 'agency', 'type'])('rejects incorrect outline %s', async problem => {
    const normal = apiRequest.getMockImplementation()!, response = outline(CER);
    const altered = problem === 'identity' ? outline(K510) : problem === 'shape' ? { ...response, outline: {} }
      : { ...response, document: { ...response.document, ...(problem === 'scope' ? { filing_scope: 'market' }
        : problem === 'agency' ? { agency: 'fda' } : { doc_type: 'k510' }) } };
    apiRequest.mockImplementation(async (method: string, path: string) => path.endsWith('/outline') ? ok(altered) : normal(method, path));
    const { result } = renderHook(() => useFilingOutline(PROJECT, CER.id));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.document).toBeNull(); expect(result.current.error).toBeTruthy();
  });
});

describe('retirement of previous project and actor reads', () => {
  it('withholds old filing immediately and ignores its delayed response', async () => {
    const normal = apiRequest.getMockImplementation()!;
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => { finish = resolve; });
    apiRequest.mockImplementation(async (method: string, path: string) => path === `/api/c2c/documents/${CER.id}/outline` ? delayed : normal(method, path));
    const { result, rerender } = renderHook(({ bound }) => useFilingOutline(PROJECT, bound), { initialProps: { bound: K510.id } });
    await waitFor(() => expect(result.current.document?.id).toBe(K510.id));
    rerender({ bound: CER.id }); expect(result.current.document).toBeNull();
    await waitFor(() => expect(apiRequest.mock.calls.some(([, path]) => path === `/api/c2c/documents/${CER.id}/outline`)).toBe(true));
    rerender({ bound: IVDR.id }); await waitFor(() => expect(result.current.document?.id).toBe(IVDR.id));
    await act(async () => { finish(ok(outline(CER))); }); expect(result.current.document?.id).toBe(IVDR.id);
  });
  it.each(['actor', 'session'] as const)('retires same-project state after %s change and ignores old response', async change => {
    let finish!: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => { finish = resolve; }), normal = apiRequest.getMockImplementation()!;
    let held = false;
    apiRequest.mockImplementation(async (method: string, path: string) => held && path.endsWith('/outline') ? delayed : normal(method, path));
    const { result, rerender } = renderHook(() => useFilingOutline(PROJECT, CER.id));
    await waitFor(() => expect(result.current.document?.id).toBe(CER.id)); held = true;
    if (change === 'actor') actor.user = { id: 2, organizationId: 7 }; else actor.revision++;
    rerender(); expect(result.current.document).toBeNull();
    await waitFor(() => expect(apiRequest.mock.calls.filter(([, path]) => path === `/api/c2c/documents/${CER.id}/outline`).length).toBeGreaterThan(1));
    if (change === 'actor') actor.user = { id: 3, organizationId: 7 }; else actor.revision++;
    held = false; rerender(); await waitFor(() => expect(result.current.document?.id).toBe(CER.id));
    await act(async () => { finish(ok(outline({ ...CER, title: 'Former actor response' }))); });
    expect(result.current.document?.title).toBe(CER.title);
  });
  it('withholds prior project context while next project is unresolved', async () => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) => path.includes(OTHER) ? new Promise<Response>(() => {}) : normal(method, path));
    const { result, rerender } = renderHook(({ pid }) => useFilingOutline(pid, CER.id), { initialProps: { pid: PROJECT } });
    await waitFor(() => expect(result.current.document?.id).toBe(CER.id));
    rerender({ pid: OTHER }); expect(result.current.document).toBeNull(); expect(result.current.home).toBeNull(); expect(result.current.markets).toEqual([]);
  });
  it('keeps returned state identity across unchanged host rerenders', async () => {
    const { result, rerender } = renderHook(() => useFilingOutline(PROJECT, CER.id));
    await waitFor(() => expect(result.current.document?.id).toBe(CER.id));
    const previous = result.current; rerender(); expect(result.current).toBe(previous);
  });
});
