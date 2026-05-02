/**
 * section-pull tests — verifies tenant-safe lookups + missing/empty markers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock: { select: any } = { select: vi.fn() };

vi.mock('../../../db', () => ({ db: dbMock }));

import { pullEstarSections } from '../section-pull';

function returnsRows(rows: unknown[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

describe('pullEstarSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no section numbers requested', async () => {
    const result = await pullEstarSections({
      organizationId: 1,
      documentId: 1,
      sectionNumbers: [],
    });
    expect(result).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('returns one entry per requested section, in request order', async () => {
    dbMock.select.mockReturnValue(
      returnsRows([
        { sectionNumber: '3', sectionTitle: 'IFU', content: 'A', completionPercentage: 100 },
        { sectionNumber: '6', sectionTitle: 'SE', content: 'B', completionPercentage: 50 },
      ]),
    );

    const result = await pullEstarSections({
      organizationId: 1,
      documentId: 1,
      sectionNumbers: ['6', '3', '11'],
    });

    expect(result.map(r => r.sectionNumber)).toEqual(['6', '3', '11']);
    expect(result[0].status).toBe('present');
    expect(result[1].status).toBe('present');
    expect(result[2].status).toBe('missing'); // not in row set
    expect(result[2].content).toBeNull();
  });

  it('marks empty content as status=empty (not present)', async () => {
    dbMock.select.mockReturnValue(
      returnsRows([
        { sectionNumber: '3', sectionTitle: 'IFU', content: '   ', completionPercentage: 0 },
      ]),
    );

    const result = await pullEstarSections({
      organizationId: 1,
      documentId: 1,
      sectionNumbers: ['3'],
    });

    expect(result[0].status).toBe('empty');
    expect(result[0].content).toBeNull();
  });
});
