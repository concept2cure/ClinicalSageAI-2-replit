/**
 * Cover-letter composer tests.
 *
 * Verifies deterministic templating: same input → same output (modulo the
 * timestamp), missing sections surface explicitly, and the rendered body
 * preserves verbatim section content.
 */

import { describe, it, expect, vi } from 'vitest';

const pullMock = vi.fn();

vi.mock('../section-pull', () => ({
  pullEstarSections: pullMock,
}));

import { composeCoverLetterDraft } from '../cover-letter-composer';

describe('composeCoverLetterDraft', () => {
  it('renders verbatim section content into the body', async () => {
    pullMock.mockResolvedValueOnce([
      {
        sectionNumber: '3',
        sectionTitle: 'Indications for Use',
        content: 'The OR-801 device is indicated for…',
        status: 'present',
        completionPercentage: 100,
      },
    ]);

    const draft = await composeCoverLetterDraft({
      organizationId: 7,
      documentId: 42,
      submissionTrackingNumber: 'K251102',
      sponsorName: 'Concept2Cure Therapeutics',
      issues: [
        {
          id: 'item-1',
          category: 'indications',
          severity: 'high',
          blocker: false,
          description: 'Restrict labeled indication per FDA AI letter.',
          sectionNumbers: ['3'],
        },
      ],
    });

    expect(draft.body).toContain('K251102');
    expect(draft.body).toContain('§3 — Indications for Use');
    expect(draft.body).toContain('The OR-801 device is indicated for…');
    expect(draft.missingSections).toEqual([]);
    expect(draft.provenance.deterministic).toBe(true);
  });

  it('marks missing sections explicitly', async () => {
    pullMock.mockResolvedValueOnce([
      {
        sectionNumber: '11',
        sectionTitle: null,
        content: null,
        status: 'missing',
        completionPercentage: 0,
      },
    ]);

    const draft = await composeCoverLetterDraft({
      organizationId: 7,
      documentId: 42,
      submissionTrackingNumber: null,
      sponsorName: 'Acme Devices',
      issues: [
        {
          id: 'item-x',
          category: 'performance',
          severity: 'critical',
          blocker: true,
          description: 'Resubmit performance data.',
          sectionNumbers: ['11'],
        },
      ],
    });

    expect(draft.missingSections).toEqual(['11']);
    expect(draft.body).toContain('Section not found in the eSTAR');
  });

  it('preserves stable order of section blocks across issues', async () => {
    // Two issues reference §6 then §3 in that order. Composer should pull §6
    // then §3 in the same order — the rendered body's section blocks must
    // match the request order, not the lexical order of section numbers.
    pullMock.mockImplementation(async (req) => {
      expect(req.sectionNumbers).toEqual(['6', '3']);
      return req.sectionNumbers.map((num: string) => ({
        sectionNumber: num,
        sectionTitle: `Section ${num}`,
        content: `content of ${num}`,
        status: 'present',
        completionPercentage: 100,
      }));
    });

    const draft = await composeCoverLetterDraft({
      organizationId: 7,
      documentId: 42,
      submissionTrackingNumber: 'K001',
      sponsorName: 'X',
      issues: [
        { id: 'a', category: 'se', severity: 'low', blocker: false, description: 'd', sectionNumbers: ['6'] },
        { id: 'b', category: 'iu', severity: 'low', blocker: false, description: 'd', sectionNumbers: ['3'] },
      ],
    });

    const idx6 = draft.body.indexOf('§6');
    const idx3 = draft.body.indexOf('§3');
    expect(idx6).toBeGreaterThan(-1);
    expect(idx3).toBeGreaterThan(idx6);
    expect(draft.provenance.sectionNumbers).toEqual(['6', '3']);
  });

  it('deduplicates section numbers across issues', async () => {
    pullMock.mockResolvedValueOnce([
      { sectionNumber: '3', sectionTitle: null, content: 'x', status: 'present', completionPercentage: 100 },
    ]);

    const draft = await composeCoverLetterDraft({
      organizationId: 7,
      documentId: 42,
      submissionTrackingNumber: null,
      sponsorName: 'X',
      issues: [
        { id: 'a', category: 'iu', severity: 'low', blocker: false, description: 'd', sectionNumbers: ['3'] },
        { id: 'b', category: 'iu', severity: 'low', blocker: false, description: 'd', sectionNumbers: ['3'] },
      ],
    });

    expect(draft.provenance.sectionNumbers).toEqual(['3']);
  });
});
