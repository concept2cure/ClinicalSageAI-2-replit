/**
 * @vitest-environment jsdom
 */
/**
 * useCerGspr — the GSPR matrix contract.
 *
 * The core honesty property: a catalog clause with no mapping (or an
 * unrecognized applicability value) renders as `unmapped`, never as a
 * fabricated conform/gap status; and a null catalog stays null so the
 * surface can tell "not loaded" from "no requirements".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  groupGsprRowsByChapter,
  mergeGsprRows,
  useCerGspr,
  type GsprCatalogRequirement,
  type GsprMappingPair,
} from '../useCerGspr';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const CATALOG: GsprCatalogRequirement[] = [
  { id: 'r1', regulation: 'MDR', annex: 'I', chapter: 'I', clause: '1', title: 'Intended performance' },
  { id: 'r2', regulation: 'MDR', annex: 'I', chapter: 'I', clause: '2', title: 'Risk reduction' },
  { id: 'r3', regulation: 'MDR', annex: 'I', chapter: 'III', clause: '23.1', title: 'Label information' },
];

const MAPPINGS: GsprMappingPair[] = [
  {
    mapping: {
      requirementId: 'r1',
      applicability: 'applies',
      conformanceStatus: 'conformant',
      primaryEvidenceId: 'ev-9',
      rationale: 'CER §5',
    },
    requirement: { id: 'r1' },
  },
  {
    mapping: { requirementId: 'r3', applicability: 'garbage-value' },
    requirement: { id: 'r3' },
  },
];

describe('mergeGsprRows (pure)', () => {
  it('joins catalog and mappings; missing or invalid applicability is honestly unmapped', () => {
    const rows = mergeGsprRows(CATALOG, MAPPINGS)!;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      requirementId: 'r1',
      clause: '1',
      status: 'applies',
      conformance: 'conformant',
      hasEvidence: true,
      note: 'CER §5',
    });
    /* No mapping at all → unmapped. */
    expect(rows[1]).toMatchObject({ requirementId: 'r2', status: 'unmapped', hasEvidence: false });
    /* A mapping with a nonsense applicability is NOT trusted into a status. */
    expect(rows[2]).toMatchObject({ requirementId: 'r3', status: 'unmapped' });
  });

  it('keeps null-vs-empty distinct: null catalog → null, empty catalog → []', () => {
    expect(mergeGsprRows(null, MAPPINGS)).toBeNull();
    expect(mergeGsprRows([], MAPPINGS)).toEqual([]);
  });

  it('groups by chapter preserving catalog order', () => {
    const groups = groupGsprRowsByChapter(mergeGsprRows(CATALOG, [])!);
    expect(groups.map((g) => g.chapter)).toEqual(['I', 'III']);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows).toHaveLength(1);
  });
});

describe('useCerGspr (fetch contract)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  it('fans out to catalog + mappings + coverage and merges', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/gspr/catalog')) {
        return respond({ regulation: 'MDR', requirements: CATALOG, count: CATALOG.length });
      }
      if (url.includes('/mappings')) {
        return respond({ programId: 'p1', mappings: MAPPINGS, count: MAPPINGS.length });
      }
      if (url.includes('/coverage')) {
        return respond({ programId: 'p1', regulation: 'MDR', totalApplicable: 3, unmapped: 2, passesGate: false, coveragePercent: 33.3, findings: [] });
      }
      return respond({});
    });

    const { result } = renderHook(() => useCerGspr('p1', 'MDR'));
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    await waitFor(() => expect(result.current.coverage).not.toBeNull());

    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows![1].status).toBe('unmapped');
    expect(result.current.coverage!.passesGate).toBe(false);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u === '/api/gspr/catalog?regulation=MDR')).toBe(true);
    expect(urls.some((u) => u === '/api/gspr/programs/p1/mappings')).toBe(true);
    expect(urls.some((u) => u === '/api/gspr/programs/p1/coverage?regulation=MDR')).toBe(true);
  });

  it('with no program only the catalog loads — no per-program requests are issued', async () => {
    fetchMock.mockImplementation(async () =>
      respond({ regulation: 'IVDR', requirements: [], count: 0 }),
    );
    const { result } = renderHook(() => useCerGspr(null, 'IVDR'));
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    expect(result.current.rows).toEqual([]);
    expect(result.current.coverage).toBeNull();
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/gspr/catalog?regulation=IVDR',
    ]);
  });
});
