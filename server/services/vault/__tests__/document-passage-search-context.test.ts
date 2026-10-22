/**
 * searchDocumentPassages: each hit carries the expansion's verified context
 * (docs/evidence/D2-PASSAGE-CONTEXT/2026-10-19/CONTRACT.md). Written from the
 * contract alone, through the same seams as retrieval-actor-filter.test.ts
 * (the canonical router and the programme-access check are stubbed).
 *
 * PassageHit gains `contentHash`, `hitSpan` and `context`; a hit that was
 * never expanded says `not_expanded`; `text` stays the hit chunk's own content.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), embed: vi.fn(), uploads: vi.fn(), retrieve: vi.fn() }));
vi.mock('../../c2c/current-program-access.js', () => ({
  getCurrentAccessibleProgramScope: async (_q: unknown, identity: { userId: number }) => ({
    scope: 'verified-accessible-programs', actor: { userId: identity.userId, role: 'viewer' }, programIds: [PROGRAM], reconciliationRequired: false,
  }),
  assertVerifiedProgramScope: vi.fn(),
  requireProgramScopeStillCurrent: vi.fn(),
  ProgramReadAccessError: class extends Error {},
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.query } }));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: h.embed }) }));
vi.mock('../document-catalog.service.js', () => ({ listChatUploads: h.uploads }));
vi.mock('../../ragRouter.js', () => ({ ragRouter: { retrieve: h.retrieve } }));

import { searchDocumentPassages } from '../document-passage-search';
import { draftSourceIdentityForText } from '../../ana/draft-source-identity';

const PROGRAM = '10000000-0000-4000-8000-000000000001';
const ORG_UUID = '20000000-0000-4000-8000-000000000001';
const DOC = '30000000-0000-4000-8000-000000000001';
const HASH = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const T = 'Table 14.2.1 Primary efficacy responder analysis. Responders at week 12 were 12/40 (30%) of randomised '
  + 'participants. Analysis population N=40 (ITT) as randomised and dosed.';
const HIT_TEXT = 'Responders at week 12 were 12/40 (30%)';
const HIT_SPAN = { start: T.indexOf(HIT_TEXT), end: T.indexOf(HIT_TEXT) + HIT_TEXT.length };
const SPAN = { start: 0, end: T.length, totalChars: T.length };
const AVAILABLE = {
  status: 'available', text: T, chunkRange: [4, 6], clipped: false,
  reference: { documentId: DOC, contentHash: HASH, span: SPAN, ...draftSourceIdentityForText(T, SPAN) },
};

function doc(id: string, chunkIndex: number, extra: Record<string, unknown>) {
  return { id, chunkId: id, documentId: DOC, programId: PROGRAM, title: 'Clinical study report', atomType: 'vault_chunk',
    content: `chunk ${id} own text`, chunkIndex, initialScore: 0.8, finalScore: 0.8, ...extra };
}

const DOCUMENTS = [
  doc('expanded', 5, { contentHash: HASH, content: HIT_TEXT, expandedContent: T, passageContext: AVAILABLE, hitSpan: HIT_SPAN }),
  doc('never-expanded', 7, { contentHash: HASH_B }),
  doc('legacy', 9, { contentHash: HASH, passageContext: { status: 'unavailable', reason: 'no_offsets' }, hitSpan: null }),
  doc('oversized', 11, { contentHash: HASH, passageContext: { status: 'unavailable', reason: 'budget' }, hitSpan: { start: 0, end: 12001 } }),
  doc('no-hash', 13, {}),
];

beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockImplementation(async (sql: string) => ({
    rows: /SELECT id FROM organizations/.test(sql) ? [{ id: 7 }]
      : /COUNT|count/.test(sql) ? [{ total: 5, indexed: 5, pending: 0, failed: 0 }] : [],
  }));
  h.uploads.mockResolvedValue({ uploads: [], hasMore: false });
  h.retrieve.mockResolvedValue({ documents: DOCUMENTS });
});

const search = () => searchDocumentPassages({ query: h.query }, { organizationId: 7, userId: 12, organizationUuid: ORG_UUID, query: 'primary endpoint responders' });

describe('passage hits carry the verified context', () => {
  it('passes an available context through with its hit span and content hash', async () => {
    const { hits } = await search();
    expect(hits).toHaveLength(DOCUMENTS.length);
    expect(hits[0].context).toEqual(AVAILABLE);
    expect(hits[0].hitSpan).toEqual(HIT_SPAN);
    expect(hits[0].contentHash).toBe(HASH);
  });

  it('a hit that was never expanded says not_expanded, with no span', async () => {
    const { hits } = await search();
    expect(hits[1].context).toEqual({ status: 'unavailable', reason: 'not_expanded' });
    expect(hits[1].hitSpan).toBeNull();
    expect(hits[1].contentHash).toBe(HASH_B);
    expect(hits[4].context).toEqual({ status: 'unavailable', reason: 'not_expanded' });
    expect(hits[4].contentHash).toBeNull();
  });

  it('passes an unavailable reason through unchanged, with the hit span when the expansion had one', async () => {
    const { hits } = await search();
    expect(hits[2].context).toEqual({ status: 'unavailable', reason: 'no_offsets' });
    expect(hits[2].hitSpan).toBeNull();
    expect(hits[3].context).toEqual({ status: 'unavailable', reason: 'budget' });
    expect(hits[3].hitSpan).toEqual({ start: 0, end: 12001 });
  });
});

describe('passage hits: unchanged mapping (controls)', () => {
  it('text stays the hit chunk content, never the expanded window', async () => {
    const { hits } = await search();
    expect(hits.map(hit => hit.text)).toEqual(DOCUMENTS.map(d => d.content));
    expect(hits[0].text).toBe(HIT_TEXT);
  });

  it('keeps the existing locator fields', async () => {
    const { hits } = await search();
    expect(hits[0]).toMatchObject({ documentId: DOC, documentTitle: 'Clinical study report', chunkIndex: 5, similarity: 0.8 });
  });
});
