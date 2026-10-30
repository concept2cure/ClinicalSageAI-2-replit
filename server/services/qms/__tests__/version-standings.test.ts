/**
 * The version history says where each signed version stands (MR-12, CAT2-18):
 * in force, effective from a later day, superseded by which version from when,
 * or retired. In force is the one reader's (readInForceReleases); superseded is
 * read from the immutable store, never recorded.
 */
import { describe, expect, it } from 'vitest';
import type { QmsDocumentRow } from '../document-approval-signature';
import { compareQmsVersions, qmsVersionStandings, readInForceReleases } from '../in-force-release';

function row(version: string, status: string, effective: string | null, metadata: Record<string, unknown> = {}): QmsDocumentRow {
  return {
    id: 5, organization_id: 9, doc_number: 'SOP-5', title: 'Complaint handling', doc_type: 'sop', category: null, version,
    status, effective_date: effective, next_review_date: null, author_id: 3, approver_id: 7, approved_at: null,
    superseded_by_id: null, artifact_id: null, metadata,
  } as QmsDocumentRow;
}
const snapshot = (doc: QmsDocumentRow) => ({ version: doc.version, controlled_document: doc });

/** The standings the route computes: the snapshots as stored, and in force as the reader resolves it. */
async function standings(live: QmsDocumentRow, history: QmsDocumentRow[]) {
  const client = { query: async () => ({ rows: history.filter((h) => h.version !== live.version).slice(-1).map((h) => ({ document_id: 5, controlled_document: h })) }) };
  const inForce = (await readInForceReleases(client, 9, [live])).get(5) ?? null;
  return Object.fromEntries(qmsVersionStandings(live, history.map(snapshot), inForce));
}

const v1 = row('1.0', 'effective', '2026-01-10');
const v2 = row('2.0', 'effective', '2026-06-01');

describe('qmsVersionStandings', () => {
  it('names the version in force, and the one it superseded with the date it took over', async () => {
    expect(await standings(row('2.0', 'effective', '2026-06-01'), [v1, v2])).toEqual({
      '1.0': { state: 'superseded', by: '2.0', from: '2026-06-01' },
      '2.0': { state: 'in-force', effectiveFrom: '2026-06-01' },
    });
  });

  it('keeps the approved version in force while its successor is drafted', async () => {
    const draft = row('2.0', 'draft', null, { lastRevision: { from: '1.0' } });
    expect(await standings(draft, [v1])).toEqual({ '1.0': { state: 'in-force', effectiveFrom: '2026-01-10' } });
  });

  it('says a version approved for a later day is pending, and its predecessor still in force', async () => {
    const later = row('2.0', 'effective', '2999-01-01');
    expect(await standings(later, [v1, later])).toEqual({
      '1.0': { state: 'in-force', effectiveFrom: '2026-01-10' },
      '2.0': { state: 'pending-effective', effectiveFrom: '2999-01-01' },
    });
  });

  it('marks the newest signed version retired; a draft retired with it is not a successor', async () => {
    const retiredFromEffective = row('2.0', 'retired', '2026-06-01', { retired: { at: '2026-09-01T10:00:00.000Z', fromStatus: 'effective' } });
    expect(await standings(retiredFromEffective, [v1, v2])).toEqual({
      '1.0': { state: 'superseded', by: '2.0', from: '2026-06-01' },
      '2.0': { state: 'retired', at: '2026-09-01' },
    });
    const retiredFromDraft = row('2.0', 'retired', null, { lastRevision: { from: '1.0' }, retired: { at: '2026-09-01T10:00:00.000Z', fromStatus: 'draft' } });
    expect(await standings(retiredFromDraft, [v1])).toEqual({ '1.0': { state: 'retired', at: '2026-09-01' } });
  });

  it('orders versions as numbers', () => {
    expect(['1.10', '1.9', '2.0', '1.0'].sort(compareQmsVersions)).toEqual(['1.0', '1.9', '1.10', '2.0']);
  });
});
