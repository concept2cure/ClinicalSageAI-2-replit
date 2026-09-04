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
  useEstarEntitlement,
  entitlementBlocksExport,
  entitlementRequiredLine,
  exportStatusLine,
  cleanRequestData,
  fieldReportClause,
  ESTAR_ENTITLEMENT_URL,
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
      fieldReport: null,
      error: 'NOT_ENTITLED',
    };
    expect(exportStatusLine(false, outcome)).toBe(
      'Requires a higher plan — device assembly readiness',
    );
  });
});

/* ─── Phase 2: governed administrative data ────────────────────────────── */

const SUCCESS: EstarExportOutcome = {
  ok: true,
  governed: true,
  filename: 'BX-204_eSTAR.pdf',
  formattingErrors: 0,
  formattingWarnings: 0,
  blockers: [],
  blockedByEntitlement: false,
  requiredTier: null,
  fieldReport: null,
  error: null,
};

describe('cleanRequestData (pure) — only typed keys travel', () => {
  it('drops empty, whitespace and non-string entries and trims the rest', () => {
    expect(
      cleanRequestData({
        deviceCommonName: '  Glucose monitor ',
        correspondentTelephone: '',
        correspondentCompanyName: '   ',
        indicationsForUseCitation: 'Section 4',
        bogus: 42 as unknown as string,
      }),
    ).toEqual({ deviceCommonName: 'Glucose monitor', indicationsForUseCitation: 'Section 4' });
    expect(cleanRequestData(undefined)).toEqual({});
  });
});

describe('useEstarExport.exportOfficialEstar — useProgramData + data', () => {
  it('sends useProgramData:true and only the non-empty trimmed keys', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        governed: true,
        officialEstarPdf: true,
        fieldReport: {
          mappedCount: 20,
          filledCount: 7,
          blankCount: 13,
          blankKeys: ['deviceCommonName', 'declarationCompanyAddress'],
          ignoredRequestKeys: ['deviceTradeName'],
        },
      }),
    );
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportOfficialEstar(PROGRAM, 'device', {
        useProgramData: true,
        data: { deviceCommonName: ' Glucose monitor ', correspondentTelephone: '   ', deviceTradeName: 'X' },
      });
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/510k/estar/official');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.useProgramData).toBe(true);
    expect(body.variant).toBe('device');
    expect(body.data).toEqual({ deviceCommonName: 'Glucose monitor', deviceTradeName: 'X' });
    // The report is parsed, not invented.
    expect(outcome?.ok).toBe(true);
    expect(outcome?.fieldReport).toEqual({
      mappedCount: 20,
      filledCount: 7,
      blankCount: 13,
      blankKeys: ['deviceCommonName', 'declarationCompanyAddress'],
      ignoredRequestKeys: ['deviceTradeName'],
    });
  });

  it('sends the pathway type from the option — de_novo and pma reach the wire', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ governed: true }));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => {
      await result.current.exportOfficialEstar(PROGRAM, 'device', { type: 'de_novo', useProgramData: true });
    });
    await act(async () => {
      await result.current.exportOfficialEstar(PROGRAM, 'ivd', { type: 'pma', useProgramData: true });
    });
    const bodyOf = (i: number) =>
      JSON.parse(String((fetchMock.mock.calls[i][1] as { body?: unknown }).body)) as Record<string, unknown>;
    const first = bodyOf(0);
    const second = bodyOf(1);
    expect(first.type).toBe('de_novo');
    expect(first.variant).toBe('device');
    expect(second.type).toBe('pma');
    expect(second.variant).toBe('ivd');
  });

  it('without a type option sends 510k — callers that predate the option keep their behaviour', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ governed: true }));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => {
      await result.current.exportOfficialEstar(PROGRAM, 'device', { useProgramData: true });
    });
    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as { body?: unknown }).body),
    ) as Record<string, unknown>;
    expect(body.type).toBe('510k');
  });

  it('without opts sends useProgramData:false and an empty data map (today\'s behaviour)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ governed: true }));
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportOfficialEstar(PROGRAM);
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.useProgramData).toBe(false);
    expect(body.type).toBe('510k');
    expect(body.data).toEqual({});
    // No report on the wire ⇒ null, never a fabricated count.
    expect(outcome?.fieldReport).toBeNull();
  });

  it('a malformed fieldReport is null rather than partially trusted', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ governed: true, fieldReport: { filledCount: 'seven' } }));
    const { result } = renderHook(() => useEstarExport());
    let outcome: EstarExportOutcome | undefined;
    await act(async () => {
      outcome = await result.current.exportOfficialEstar(PROGRAM, 'ivd', { useProgramData: true });
    });
    expect(outcome?.fieldReport).toBeNull();
  });
});

describe('exportStatusLine — administrative fill wording', () => {
  it('names filled of mapped and the blank count', () => {
    const outcome: EstarExportOutcome = {
      ...SUCCESS,
      fieldReport: {
        mappedCount: 20,
        filledCount: 7,
        blankCount: 13,
        blankKeys: [],
        ignoredRequestKeys: [],
      },
    };
    expect(exportStatusLine(false, outcome)).toBe(
      'Downloaded BX-204_eSTAR.pdf · 7 of 20 administrative fields filled · 13 left blank',
    );
  });

  it('omits the blank clause when nothing was left blank', () => {
    const outcome: EstarExportOutcome = {
      ...SUCCESS,
      fieldReport: {
        mappedCount: 20,
        filledCount: 20,
        blankCount: 0,
        blankKeys: [],
        ignoredRequestKeys: [],
      },
    };
    expect(exportStatusLine(false, outcome)).toBe(
      'Downloaded BX-204_eSTAR.pdf · 20 of 20 administrative fields filled',
    );
    expect(fieldReportClause(null)).toBe('');
  });

  it('a success without a report keeps the existing wording', () => {
    expect(exportStatusLine(false, SUCCESS)).toBe('Downloaded BX-204_eSTAR.pdf');
  });
});

describe('useEstarExport — reset()', () => {
  it('forgets the last outcome, and is stable across renders', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ governed: true }));
    const { result, rerender } = renderHook(() => useEstarExport());
    const firstReset = result.current.reset;
    await act(async () => {
      await result.current.exportDraftPackage(PROGRAM);
    });
    await waitFor(() => expect(result.current.outcome?.ok).toBe(true));
    act(() => result.current.reset());
    expect(result.current.outcome).toBeNull();
    rerender();
    expect(result.current.reset).toBe(firstReset);
  });
});

describe('useEstarEntitlement — the lock known before the first click', () => {
  const VIEW = {
    capability: 'device_assembly_readiness',
    mode: 'on' as const,
    enforced: true,
    allowed: false,
    requiredTier: 'standard',
    tier: 'free',
    reason: null,
  };

  it('reads the documented verdict from GET /api/510k/estar/entitlement', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VIEW));
    const { result } = renderHook(() => useEstarEntitlement());
    await waitFor(() => expect(result.current.entitlement).not.toBeNull());
    expect(String(fetchMock.mock.calls[0][0])).toBe(ESTAR_ENTITLEMENT_URL);
    expect(result.current.entitlement).toEqual(VIEW);
    expect(entitlementBlocksExport(result.current.entitlement)).toBe(true);
  });

  it('a body that is not a verdict is no verdict — nothing locks on it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const { result } = renderHook(() => useEstarEntitlement());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entitlement).toBeNull();
    expect(entitlementBlocksExport(result.current.entitlement)).toBe(false);
  });

  it('entitlementBlocksExport (pure): only an ENFORCED denial locks', () => {
    expect(entitlementBlocksExport({ ...VIEW, mode: 'warn', enforced: false })).toBe(false);
    expect(entitlementBlocksExport({ ...VIEW, mode: 'off', enforced: false, allowed: null })).toBe(false);
    expect(entitlementBlocksExport({ ...VIEW, allowed: true })).toBe(false);
    expect(entitlementBlocksExport(null)).toBe(false);
    expect(entitlementBlocksExport(VIEW)).toBe(true);
  });

  it('entitlementRequiredLine is the one wording, after a 403 and before a click', () => {
    expect(entitlementRequiredLine('standard')).toBe('Requires the standard plan — device assembly readiness');
    expect(entitlementRequiredLine(null)).toBe('Requires a higher plan — device assembly readiness');
    const outcome: EstarExportOutcome = {
      ok: false, governed: false, filename: null, formattingErrors: 0, formattingWarnings: 0,
      blockers: [], blockedByEntitlement: true, requiredTier: 'standard', fieldReport: null, error: 'NOT_ENTITLED',
    };
    expect(exportStatusLine(false, outcome)).toBe(entitlementRequiredLine('standard'));
  });
});
