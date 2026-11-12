// @vitest-environment jsdom
/**
 * Quality reads the organisation by default (P-122, 2026-11-10). C14 (QP3, `e39cc0d59`) made the controlled
 * documents, changes, CAPAs and nonconformances read only the open project, so a person with a project open saw empty
 * registers. The organisation's registers are the default again, with a project open or not. Narrowing to the open
 * project is one quiet control (`?quality=project`): its reads carry `program_id`, which the server admits only for
 * this organisation's project (`queryProject`, server/routes/mdx-qms-context.ts). With no project open there is
 * nothing to narrow to, whatever the URL says.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const H = vi.hoisted(() => ({ urls: [] as string[], shell: null as null | { id: string; code?: string; title?: string },
  answer: null as null | { data: unknown; loading: boolean } }));
vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string) => {
    H.urls.push(url);
    return { ...(H.answer ?? { data: null, loading: true }), error: null, failure: null, refresh: vi.fn() };
  },
}));
vi.mock('../../v2/shellProject', () => ({
  useShellProject: () => H.shell,
  shellProgramId: (p: { id: string } | null) => (p ? p.id : null),
}));

import { useQualityScope, setQualityWide, QUALITY_SCOPE_PARAM } from '../registerContext';
import { useSopRegister } from '../hooks';
import { useChangeRegister } from '../changeHooks';

const PID = '40000000-0000-4000-8000-000000000001';
afterEach(() => { cleanup(); H.urls = []; H.shell = null; H.answer = null; window.history.replaceState(null, '', '/concept2cure/quality'); });

describe('the scope Quality reads', () => {
  it("reads the whole organisation with a project open, and the project's records only when the person narrows it", () => {
    H.shell = { id: PID, code: 'C11', title: 'Gasket programme' };
    const { result } = renderHook(() => ({ scope: useQualityScope(), docs: useSopRegister(), changes: useChangeRegister() }));
    expect(result.current.scope).toEqual({ programId: null, projectName: 'C11 · Gasket programme', wide: true });
    expect(H.urls).toContain('/api/mdx/qms/documents');
    expect(H.urls).toContain('/api/mdx/qms/changes');
    expect(H.urls.some((u) => u.includes('program_id='))).toBe(false);

    H.urls = [];
    act(() => setQualityWide(false));
    expect(new URLSearchParams(window.location.search).get(QUALITY_SCOPE_PARAM)).toBe('project');
    expect(result.current.scope).toEqual({ programId: PID, projectName: 'C11 · Gasket programme', wide: false });
    expect(H.urls).toContain(`/api/mdx/qms/documents?program_id=${PID}`);
    expect(H.urls).toContain(`/api/mdx/qms/changes?program_id=${PID}`);

    act(() => setQualityWide(true));
    expect(new URLSearchParams(window.location.search).get(QUALITY_SCOPE_PARAM)).toBeNull();
    expect(result.current.scope.programId).toBeNull();
  });

  it('keeps a narrowed link: a reload of ?quality=project reads the project', () => {
    H.shell = { id: PID, code: 'C11', title: 'Gasket programme' };
    window.history.replaceState(null, '', `/concept2cure/quality?${QUALITY_SCOPE_PARAM}=project`);
    const { result } = renderHook(() => ({ scope: useQualityScope(), docs: useSopRegister() }));
    expect(result.current.scope.programId).toBe(PID);
    expect(H.urls).toContain(`/api/mdx/qms/documents?program_id=${PID}`);
  });

  it('a link from before P-122 (?quality=organisation) reads the organisation, as the default does', () => {
    H.shell = { id: PID, code: 'C11', title: 'Gasket programme' };
    window.history.replaceState(null, '', `/concept2cure/quality?${QUALITY_SCOPE_PARAM}=organisation`);
    const { result } = renderHook(() => ({ scope: useQualityScope(), docs: useSopRegister() }));
    expect(result.current.scope).toEqual({ programId: null, projectName: 'C11 · Gasket programme', wide: true });
    expect(H.urls).toContain('/api/mdx/qms/documents');
  });

  it('with no project open, reads the whole organisation and offers no choice, whatever the URL says', () => {
    window.history.replaceState(null, '', `/concept2cure/quality?${QUALITY_SCOPE_PARAM}=project`);
    const { result } = renderHook(() => ({ scope: useQualityScope(), docs: useSopRegister() }));
    expect(result.current.scope).toEqual({ programId: null, projectName: null, wide: false });
    expect(H.urls).toContain('/api/mdx/qms/documents');
  });

  /* Quality review, 2026-11-10: the read keeps its last answer while a new path loads, so after "Show the whole
     organisation" (or another project) the previous scope's rows stood as the new scope's until the new read landed. */
  it("never shows the previous scope's rows as the new scope's while the new read loads", () => {
    H.shell = { id: PID, code: 'C11', title: 'Gasket programme' };
    // Narrowed to the project first: the organisation is the default since P-122.
    window.history.replaceState(null, '', `/concept2cure/quality?${QUALITY_SCOPE_PARAM}=project`);
    const projectRows = { data: [{ id: 1, doc_number: 'SOP-001', title: 'Project SOP', doc_type: 'sop', version: '1.0', status: 'draft' }] };
    H.answer = { data: projectRows, loading: false };
    const { result, rerender } = renderHook(() => ({ docs: useSopRegister(), changes: useChangeRegister() }));
    expect(result.current.docs.docs?.map((d) => d.docNumber)).toEqual(['SOP-001']);
    act(() => setQualityWide(true));
    expect(result.current.docs.docs).toBeNull();
    expect(result.current.docs.loading).toBe(true);
    expect(result.current.changes.changes).toBeNull();
    H.answer = { data: { data: [{ ...projectRows.data[0], id: 2, doc_number: 'SOP-002', title: 'Organisation SOP' }] }, loading: false };
    rerender();
    expect(result.current.docs.docs?.map((d) => d.docNumber)).toEqual(['SOP-002']);
  });
});

