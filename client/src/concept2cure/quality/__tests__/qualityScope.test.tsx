// @vitest-environment jsdom
/**
 * C14 (QP3): Quality reads the open project. The controlled documents and changes it lists are the open project's
 * (`program_id`), unless the person widens it to the whole organisation (`?quality=organisation`); with no project
 * open it reads the whole organisation and offers no choice.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const H = vi.hoisted(() => ({ urls: [] as string[], shell: null as null | { id: string; code?: string; title?: string } }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string) => { H.urls.push(url); return { data: null, loading: true, error: null, failure: null, refresh: vi.fn() }; },
}));
vi.mock('../../v2/shellProject', () => ({
  useShellProject: () => H.shell,
  shellProgramId: (p: { id: string } | null) => (p ? p.id : null),
}));

import { useQualityScope, setQualityWide, QUALITY_SCOPE_PARAM } from '../registerContext';
import { useSopRegister } from '../hooks';
import { useChangeRegister } from '../changeHooks';

const PID = '40000000-0000-4000-8000-000000000001';
afterEach(() => { cleanup(); H.urls = []; H.shell = null; window.history.replaceState(null, '', '/concept2cure/quality'); });

describe('the scope Quality reads', () => {
  it('reads the open project, and the whole organisation when the person widens it', () => {
    H.shell = { id: PID, code: 'C11', title: 'Gasket programme' };
    const { result } = renderHook(() => ({ scope: useQualityScope(), docs: useSopRegister(), changes: useChangeRegister() }));
    expect(result.current.scope).toEqual({ programId: PID, projectName: 'C11 · Gasket programme', wide: false });
    expect(H.urls).toContain(`/api/mdx/qms/documents?program_id=${PID}`);
    expect(H.urls).toContain(`/api/mdx/qms/changes?program_id=${PID}`);

    H.urls = [];
    act(() => setQualityWide(true));
    expect(new URLSearchParams(window.location.search).get(QUALITY_SCOPE_PARAM)).toBe('organisation');
    expect(result.current.scope).toEqual({ programId: null, projectName: 'C11 · Gasket programme', wide: true });
    expect(H.urls).toContain('/api/mdx/qms/documents');
    expect(H.urls).toContain('/api/mdx/qms/changes');

    act(() => setQualityWide(false));
    expect(new URLSearchParams(window.location.search).get(QUALITY_SCOPE_PARAM)).toBeNull();
    expect(result.current.scope.programId).toBe(PID);
  });

  it('with no project open, reads the whole organisation and offers no choice, whatever the URL says', () => {
    window.history.replaceState(null, '', `/concept2cure/quality?${QUALITY_SCOPE_PARAM}=organisation`);
    const { result } = renderHook(() => ({ scope: useQualityScope(), docs: useSopRegister() }));
    expect(result.current.scope).toEqual({ programId: null, projectName: null, wide: false });
    expect(H.urls).toContain('/api/mdx/qms/documents');
  });
});
