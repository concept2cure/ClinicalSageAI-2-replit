// @vitest-environment jsdom
/**
 * A device package is named after its project (MDX journey M21,
 * `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * The server names the ZIP, the combined PDF/DOCX and the official eSTAR PDF
 * from `meta.id` (`server/routes/510k-estar-routes.ts`). The hook sent the kit
 * program's `code`, which useMdxPrograms derives from class and type ("Class II
 * · 510k", "pma"), so the walk downloaded `pma_pma-content-package-draft.zip`
 * and `Class_II_510k_content-package-draft.zip`: no project named, and two
 * projects' packages under one name. The project's own name is `title`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEstarExport } from '../useEstarExport';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const PROGRAM = { id: 'a2b4c6d8-0000-0000-0000-000000000009', code: 'Class II · 510k', title: 'NeuroPanel-Dx' };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'stub' }) }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sentMeta = () => (JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as { meta: Record<string, unknown> }).meta;

describe('a device package is named after its project', () => {
  it('the draft package sends the project name, and the project id to resolve it by', async () => {
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportDraftPackage(PROGRAM); });
    expect(sentMeta()).toMatchObject({ id: 'NeuroPanel-Dx', ident: PROGRAM.id, title: 'NeuroPanel-Dx' });
  });

  it('the official eSTAR does the same', async () => {
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'ivd'); });
    expect(sentMeta()).toMatchObject({ id: 'NeuroPanel-Dx', ident: PROGRAM.id });
  });

  it('with no name it falls back to the code, then the id', async () => {
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportDraftPackage({ id: PROGRAM.id, code: 'CV', title: null }); });
    expect(sentMeta().id).toBe('CV');
  });
});
