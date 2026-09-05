/**
 * @vitest-environment jsdom
 */
/**
 * useK510EstarSections — an unreadable body is a load failure, never a crash.
 *
 * The hook did `data.sections.map(...)` inside render. A 200 whose body was
 * not `{ sections: [...] }` therefore threw during React's render pass and
 * unmounted the entire 510(k) surface — found when a host-level test fed every
 * endpoint an honest-but-different envelope. The portfolio hook closed the
 * same class of defect earlier; this pins it here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useK510EstarSections } from '../useK510';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

describe('useK510EstarSections — body shape', () => {
  it('a 200 that is not { sections: [...] } is reported, not thrown, and never an empty list', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }));
    const { result } = renderHook(() => useK510EstarSections('BX-204'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toBeNull();
    expect(result.current.blockerCount).toBe(0);
    expect(result.current.error).toBe(
      'The eSTAR section list returned a response this screen could not read.',
    );
  });

  it('the documented shape adapts to rows, blockers counted', async () => {
    fetchMock.mockResolvedValue(
      ok({
        projectId: 'BX-204',
        totalSections: 2,
        approvedCount: 1,
        draftingCount: 0,
        todoCount: 1,
        completionPercentage: 50,
        sections: [
          { id: 7, sectionNumber: 11, sectionTitle: 'Substantial Equivalence Discussion', status: 'approved', isRequired: true, contentLength: 400 },
          { id: 8, sectionNumber: 4, sectionTitle: 'Device Description', status: 'todo', isRequired: true, contentLength: 0 },
        ],
      }),
    );
    const { result } = renderHook(() => useK510EstarSections('BX-204'));
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    expect(result.current.rows!.map((r) => r.id)).toEqual([4, 11]);
    expect(result.current.blockerCount).toBe(1);
    expect(result.current.error).toBeNull();
  });
});
