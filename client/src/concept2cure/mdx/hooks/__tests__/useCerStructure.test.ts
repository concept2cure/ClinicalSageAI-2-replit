/**
 * @vitest-environment jsdom
 */
/**
 * useCerStructure — the structure-check matcher's honesty contract.
 *
 * The matcher may under-credit (a section it cannot confidently match stays
 * a gap) but must never over-credit: unauthored rows never count, and labels
 * outside the documented keyword set never match a canonical section.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assessCerStructure,
  isAuthoredRow,
  matchPresentSectionIds,
  type CerCanonSection,
} from '../useCerStructure';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const canon = (id: string, title: string): CerCanonSection => ({
  id,
  number: '1',
  title,
  purpose: '',
  required: true,
  requiresClinicalData: false,
  reviewerQuestions: [],
});

const CANON: CerCanonSection[] = [
  canon('scope', 'Scope of the Clinical Evaluation'),
  canon('clinical_background', 'Clinical Background, Current Knowledge, State of the Art'),
  canon('clinical_data', 'Type, Generation and Sources of Clinical Data'),
  canon('conclusions', 'Conclusions'),
  canon('equivalence', 'Equivalence (where claimed)'),
];

describe('isAuthoredRow', () => {
  it('counts complete/review/draft rows, never blockers or empty/na', () => {
    expect(isAuthoredRow({ label: 'x', status: 'complete' })).toBe(true);
    expect(isAuthoredRow({ label: 'x', status: 'review' })).toBe(true);
    expect(isAuthoredRow({ label: 'x', status: 'draft' })).toBe(true);
    expect(isAuthoredRow({ label: 'x', status: 'draft', blocker: true })).toBe(false);
    expect(isAuthoredRow({ label: 'x', status: 'empty' })).toBe(false);
    expect(isAuthoredRow({ label: 'x', status: 'na' })).toBe(false);
  });
});

describe('matchPresentSectionIds (pure, deterministic)', () => {
  it('matches by keyword, exact title, and normalized id', () => {
    const present = matchPresentSectionIds(
      [
        { label: 'Scope and device description', status: 'complete' },
        { label: 'State-of-the-art analysis', status: 'review' },
        { label: 'Conclusion and recommendations', status: 'draft' },
      ],
      CANON,
    );
    expect(present.sort()).toEqual(['clinical_background', 'conclusions', 'scope']);
  });

  it('never counts unauthored rows — a blocker row is a gap even with a perfect title', () => {
    const present = matchPresentSectionIds(
      [{ label: 'Scope of the Clinical Evaluation', status: 'draft', blocker: true }],
      CANON,
    );
    expect(present).toEqual([]);
  });

  it('never over-credits: an unrelated label matches nothing', () => {
    const present = matchPresentSectionIds(
      [{ label: 'Software architecture overview', status: 'complete' }],
      CANON,
    );
    expect(present).toEqual([]);
  });

  it('returns [] for an empty section list', () => {
    expect(matchPresentSectionIds([], CANON)).toEqual([]);
  });
});

describe('assessCerStructure (server contract)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs presentSectionIds + equivalenceClaimed with auth headers', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ready: false,
        missingRequiredSections: ['conclusions'],
        sectionsNeedingClinicalData: [],
        presentCount: 4,
        totalRequired: 5,
        equivalenceAddressed: true,
      }),
    });

    const result = await assessCerStructure(['scope', 'clinical_data'], true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/submissions/device/cer/assess');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({
      presentSectionIds: ['scope', 'clinical_data'],
      equivalenceClaimed: true,
    });
    expect(result?.ready).toBe(false);
    expect(result?.missingRequiredSections).toEqual(['conclusions']);
  });

  it('returns null on failure — never a fabricated pass', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await assessCerStructure([], false)).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await assessCerStructure([], false)).toBeNull();
  });
});
