/**
 * record_literature tool — persists PubMed hits to the org corpus through the
 * SAME service as POST /api/cerv2/literature/record (zero duplication).
 *
 * Contract under test: the tool is defined + wired; the organization comes
 * from ToolContext, never from model arguments; without an org it refuses;
 * a service failure is relayed as an honest recorded:false error, never a
 * fabricated success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRecord, mockPool } = vi.hoisted(() => ({
  mockRecord: vi.fn(async () => ({
    created: 2,
    updated: 1,
    entries: [
      { pmid: '1', id: 'a', outcome: 'created' },
      { pmid: '2', id: 'b', outcome: 'created' },
      { pmid: '3', id: 'c', outcome: 'updated' },
    ],
  })),
  mockPool: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../../db', () => ({ pool: mockPool, db: {} }));
vi.mock('../../literature-recording.service', () => ({
  recordLiteratureEntries: mockRecord,
  SCREENING_RECORDED_SEPARATELY: 'entries enter the corpus unscreened',
  PROGRAM_BINDING_NOTE: 'entries are recorded to the organization corpus',
}));

import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const ENTRIES = [
  { pmid: '1', title: 'A' },
  { pmid: '2', title: 'B', year: 2024, authors: ['X Y'] },
  { pmid: '3', title: 'C' },
];

describe('record_literature tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue({
      created: 2,
      updated: 1,
      entries: [
        { pmid: '1', id: 'a', outcome: 'created' },
        { pmid: '2', id: 'b', outcome: 'created' },
        { pmid: '3', id: 'c', outcome: 'updated' },
      ],
    });
  });

  it('is defined in ALL_ANA_TOOLS and has a registered handler', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'record_literature');
    expect(def).toBeTruthy();
    expect(def!.input_schema.required).toEqual(['entries']);
    // The org must NOT be a model-suppliable argument.
    expect(Object.keys(def!.input_schema.properties)).not.toContain('organization_id');
    expect(typeof getToolHandler('record_literature')).toBe('function');
  });

  it('refuses without an organization context (org never comes from input)', async () => {
    const handler = getToolHandler('record_literature')!;
    const out = JSON.parse(await handler({ entries: ENTRIES }, {} as any));
    expect(out.recorded).toBe(false);
    expect(out.error).toMatch(/organization context/i);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('records through the shared service with the ToolContext org', async () => {
    const handler = getToolHandler('record_literature')!;
    const out = JSON.parse(
      await handler({ entries: ENTRIES }, { organizationId: 42, userId: 9 } as any),
    );
    expect(out.recorded).toBe(true);
    expect(out.created).toBe(2);
    expect(out.updated).toBe(1);
    expect(out.notes.join(' ')).toMatch(/unscreened/);

    expect(mockRecord).toHaveBeenCalledTimes(1);
    const [executor, orgId, entries] = mockRecord.mock.calls[0] as unknown[];
    expect(executor).toBe(mockPool);
    expect(orgId).toBe(42);
    expect(entries).toHaveLength(3);
  });

  it('refuses an empty entries payload with guidance instead of a no-op success', async () => {
    const handler = getToolHandler('record_literature')!;
    const out = JSON.parse(await handler({}, { organizationId: 42 } as any));
    expect(out.recorded).toBe(false);
    expect(out.error).toMatch(/no entries/i);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('relays a service failure honestly — recorded:false with the reason', async () => {
    mockRecord.mockRejectedValueOnce(new Error('relation "literature_entries" does not exist'));
    const handler = getToolHandler('record_literature')!;
    const out = JSON.parse(
      await handler({ entries: ENTRIES }, { organizationId: 42 } as any),
    );
    expect(out.recorded).toBe(false);
    expect(out.error).toMatch(/literature_entries/);
  });
});
