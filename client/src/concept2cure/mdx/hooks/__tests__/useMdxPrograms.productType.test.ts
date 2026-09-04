/**
 * @vitest-environment jsdom
 */
/**
 * useMdxPrograms — the product type survives adaptation.
 *
 * An IVD program that files a 510(k) has regulatoryPath '510k' and so lands on
 * the 510(k) surface (pathway k510). Which official eSTAR it is produced on —
 * the nIVD or the IVD template — is decided by product_type, which the kit's
 * Program shape used to drop. Dropping it meant every program on that surface
 * was filled on the nIVD form.
 *
 * The regulatory path survives too: the kit folds De Novo into the k510
 * pathway, so without the raw path a De Novo program on the 510(k) surface
 * would be produced as a 510(k).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMdxPrograms } from '../useMdxPrograms';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const row = (overrides: Record<string, unknown>) => ({
  id: 'a2b4c6d8-0000-0000-0000-000000000009',
  name: 'DX-102 IVD Cartridge',
  code: 'DX-102',
  description: null,
  programType: '510K',
  productType: 'ivd',
  deviceClass: 'II',
  regulatoryPath: '510k',
  primaryAgency: 'FDA',
  productName: 'DX-102 IVD Cartridge',
  status: 'active',
  phase: 'authoring',
  priority: null,
  targetSubmissionDate: null,
  progressPercent: 40,
  completedMilestones: 0,
  totalMilestones: 0,
  leadUserId: null,
  leadUserName: null,
  teamMembers: null,
  metadata: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z',
  ...overrides,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useMdxPrograms — productType', () => {
  it('carries the server product_type onto the kit Program, alongside the k510 pathway', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [row({ productType: 'ivd' }), row({ id: 'a2b4c6d8-0000-0000-0000-000000000010', productType: 'device' })] }),
    });
    const { result } = renderHook(() => useMdxPrograms());
    await waitFor(() => expect(result.current.programs).not.toBeNull());
    const [ivd, device] = result.current.programs!;
    expect(ivd.pathway).toBe('k510');
    expect(ivd.productType).toBe('ivd');
    expect(device.productType).toBe('device');
  });

  it('carries the server regulatory_path onto the kit Program — De Novo stays De Novo under the k510 pathway', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          row({ regulatoryPath: 'de_novo', programType: 'DE_NOVO' }),
          row({ id: 'a2b4c6d8-0000-0000-0000-000000000011', regulatoryPath: 'pma', programType: 'PMA', productType: 'device' }),
          row({ id: 'a2b4c6d8-0000-0000-0000-000000000012', regulatoryPath: null }),
        ],
      }),
    });
    const { result } = renderHook(() => useMdxPrograms());
    await waitFor(() => expect(result.current.programs).not.toBeNull());
    const [deNovo, pma, unset] = result.current.programs!;
    expect(deNovo.pathway).toBe('k510');
    expect(deNovo.regulatoryPath).toBe('de_novo');
    expect(pma.pathway).toBe('pma');
    expect(pma.regulatoryPath).toBe('pma');
    /* A null path is absent, never a fabricated '510k' — the type derivation
       decides what an unset path reads as, not the adapter. */
    expect(unset.regulatoryPath).toBeUndefined();
  });
});
