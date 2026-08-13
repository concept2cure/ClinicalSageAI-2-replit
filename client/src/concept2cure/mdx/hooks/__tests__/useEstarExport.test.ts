/**
 * @vitest-environment jsdom
 */
/**
 * useEstarExport — the entitlement-locked outcome contract.
 *
 * A 403 { error:'NOT_ENTITLED', requiredTier } from the export routes must
 * surface as a distinct Locked outcome (blockedByEntitlement + requiredTier) so
 * the 510(k) surface can render "requires the <tier> plan" instead of a dead
 * button — and a ROLE 403 must NOT be conflated with it. Also pins the 422
 * blockers path and the pure exportStatusLine wording the surface renders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useEstarExport,
  exportStatusLine,
  type EstarExportOutcome,
} from '../useEstarExport';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const PROGRAM = { id: 'a2b4c6d8-0000-0000-0000-000000000001', code: 'BX-204', title: 'CGM' };

describe('useEstarExport — 403 NOT_ENTITLED (the entitlement gate)', () => {
  it('marks the outcome blockedByEntitlement with the server-named tier', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'NOT_ENTITLED',
          capability: 'device_assembly_readiness',
          requiredTier: 'standard',
          message: "This capability requires the 'standard' plan or above (current plan: 'free').",
        },
        false,
        403,
      ),
    );
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportDraftPackage(PROGRAM);
    });
    expect(outcome?.ok).toBe(false);
    expect(outcome?.blockedByEntitlement).toBe(true);
    expect(outcome?.requiredTier).toBe('standard');
    await waitFor(() => expect(result.current.outcome?.blockedByEntitlement).toBe(true));
    // The rendered line names the REAL tier and the capability — nothing more.
    expect(exportStatusLine(false, result.current.outcome)).toBe(
      'Requires the standard plan — device assembly readiness',
    );
  });

  it('does NOT conflate a role 403 with the entitlement lock', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Insufficient permissions' }, false, 403),
    );
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportOfficialEstar(PROGRAM);
    });
    expect(outcome?.blockedByEntitlement).toBe(false);
    expect(outcome?.requiredTier).toBeNull();
    expect(exportStatusLine(false, outcome ?? null)).toBe(
      'Export failed — Insufficient permissions',
    );
  });
});

describe('useEstarExport — existing outcomes unchanged', () => {
  it('422 surfaces the honest blockers (not an entitlement lock)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'ESTAR_NOT_PRODUCIBLE',
          blockers: ['official FDA template not vendored', 'field map not populated'],
        },
        false,
        422,
      ),
    );
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportOfficialEstar(PROGRAM);
    });
    expect(outcome?.blockedByEntitlement).toBe(false);
    expect(outcome?.blockers).toEqual([
      'official FDA template not vendored',
      'field map not populated',
    ]);
    expect(exportStatusLine(false, outcome ?? null)).toBe(
      'Export failed — official FDA template not vendored · field map not populated',
    );
  });

  it('a successful export never carries the lock flags', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ governed: true }));
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportDraftPackage(PROGRAM);
    });
    expect(outcome?.ok).toBe(true);
    expect(outcome?.blockedByEntitlement).toBe(false);
    expect(exportStatusLine(false, outcome ?? null)).toBe('Downloaded package');
  });
});

describe('exportStatusLine (pure)', () => {
  it('busy and idle states', () => {
    expect(exportStatusLine(true, null)).toBe('Exporting…');
    expect(exportStatusLine(false, null)).toBeNull();
  });

  it('falls back honestly when the server named no tier', () => {
    const outcome: EstarExportOutcome = {
      ok: false,
      governed: false,
      filename: null,
      formattingErrors: 0,
      formattingWarnings: 0,
      blockers: [],
      blockedByEntitlement: true,
      requiredTier: null,
      error: 'NOT_ENTITLED',
    };
    expect(exportStatusLine(false, outcome)).toBe(
      'Requires a higher plan — device assembly readiness',
    );
  });
});
