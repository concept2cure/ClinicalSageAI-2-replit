/**
 * 510(k) summary composer tests.
 *
 * Verifies §807.92 structure, predicate validation, deterministic output.
 */

import { describe, it, expect, vi } from 'vitest';

const pullMock = vi.fn();
vi.mock('../section-pull', () => ({
  pullEstarSections: pullMock,
}));

import { compose510kSummary } from '../k510-summary-composer';

const allPresent = () => [
  { sectionNumber: '3', sectionTitle: 'Indications', content: 'IFU body', status: 'present', completionPercentage: 100 },
  { sectionNumber: '6', sectionTitle: 'SE', content: 'SE body', status: 'present', completionPercentage: 100 },
  { sectionNumber: '11', sectionTitle: 'Performance', content: 'Perf body', status: 'present', completionPercentage: 100 },
  { sectionNumber: '12', sectionTitle: 'Labeling', content: 'Label body', status: 'present', completionPercentage: 100 },
];

const baseInput = {
  organizationId: 7,
  documentId: 42,
  submissionTrackingNumber: 'K251102',
  sponsorName: 'Concept2Cure Therapeutics',
  deviceTradeName: 'OR-801 Pedicle Screw System',
  commonName: 'Pedicle Screw System',
  productCode: 'KWP',
  regulationNumber: '888.3070',
  deviceClass: 'II' as const,
  contactName: 'JM Smith',
  contactEmail: 'jm.smith@concept2cure.pro',
  preparedDate: new Date('2026-05-01T00:00:00Z'),
  predicates: [
    { kNumber: 'K191822', deviceName: 'Predicate Pedicle Screw', holder: 'Acme Spine', primary: true },
  ],
};

describe('compose510kSummary', () => {
  it('renders the seven §807.92 blocks with verbatim section content', async () => {
    pullMock.mockResolvedValueOnce(allPresent());
    const draft = await compose510kSummary(baseInput);
    expect(draft.body).toContain('## 1. Submitter');
    expect(draft.body).toContain('## 2. Device');
    expect(draft.body).toContain('## 3. Predicate device(s)');
    expect(draft.body).toContain('## 4. Indications for Use');
    expect(draft.body).toContain('## 5. Substantial Equivalence');
    expect(draft.body).toContain('## 6. Performance Testing');
    expect(draft.body).toContain('## 7. Labeling');
    expect(draft.body).toContain('IFU body');
    expect(draft.body).toContain('SE body');
    expect(draft.body).toContain('Perf body');
    expect(draft.body).toContain('Label body');
    expect(draft.body).toContain('K251102');
    expect(draft.body).toContain('K191822');
    expect(draft.body).toContain('substantially equivalent');
    expect(draft.missingSections).toEqual([]);
  });

  it('marks gap when a section is missing', async () => {
    pullMock.mockResolvedValueOnce([
      ...allPresent().slice(0, 3),
      { sectionNumber: '12', sectionTitle: null, content: null, status: 'missing', completionPercentage: 0 },
    ]);
    const draft = await compose510kSummary(baseInput);
    expect(draft.missingSections).toEqual(['12']);
    expect(draft.body).toContain('not yet populated in the eSTAR');
  });

  it('throws when no primary predicate is supplied', async () => {
    pullMock.mockResolvedValueOnce(allPresent());
    await expect(
      compose510kSummary({
        ...baseInput,
        predicates: [
          { kNumber: 'K1', deviceName: 'd', holder: 'h', primary: false },
          { kNumber: 'K2', deviceName: 'd', holder: 'h', primary: false },
        ],
      }),
    ).rejects.toThrow(/exactly one primary predicate/);
  });

  it('throws when more than one primary predicate', async () => {
    pullMock.mockResolvedValueOnce(allPresent());
    await expect(
      compose510kSummary({
        ...baseInput,
        predicates: [
          { kNumber: 'K1', deviceName: 'd', holder: 'h', primary: true },
          { kNumber: 'K2', deviceName: 'd', holder: 'h', primary: true },
        ],
      }),
    ).rejects.toThrow(/exactly one primary predicate; got 2/);
  });

  it('throws when zero predicates supplied', async () => {
    pullMock.mockResolvedValueOnce(allPresent());
    await expect(
      compose510kSummary({ ...baseInput, predicates: [] }),
    ).rejects.toThrow(/at least one predicate/);
  });

  it('renders reference predicates in addition to primary', async () => {
    pullMock.mockResolvedValueOnce(allPresent());
    const draft = await compose510kSummary({
      ...baseInput,
      predicates: [
        { kNumber: 'K191822', deviceName: 'Primary', holder: 'A', primary: true },
        { kNumber: 'K223341', deviceName: 'Reference', holder: 'B', primary: false },
      ],
    });
    expect(draft.body).toContain('Primary predicate: **K191822**');
    expect(draft.body).toContain('Reference predicates:');
    expect(draft.body).toContain('K223341');
    expect(draft.provenance.predicateKNumbers).toEqual(['K191822', 'K223341']);
  });

  it('produces deterministic output for the same inputs', async () => {
    pullMock.mockResolvedValue(allPresent());
    const a = await compose510kSummary(baseInput);
    const b = await compose510kSummary(baseInput);
    // Body is identical (timestamps are not embedded in the body).
    expect(a.body).toBe(b.body);
  });
});
