// @vitest-environment jsdom
/**
 * A reopened conversation keeps which models served each turn (SEC-A-7, door 3).
 *
 * The live stream tells a turn which models served it, and the insert gate
 * (v2/editor/anaInsertGate.ts) decides "Open as document" and the editor's
 * insert from that list. A conversation read back from history took its
 * records from GET /api/ana-ri/turn-records, which did not carry the list, so
 * every reopened answer was refused as "This page has no record of which model
 * wrote this answer". The listing now carries it; this pins that the client
 * keeps it and that the gate then decides on it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchThreadRecords } from '../anaTurnTimeline';
import { anaInsertRefusal } from '../../../v2/editor/anaInsertGate';

const SHA = 'a'.repeat(64);
const approved = { provider: 'anthropic', model: 'model-a', qualified: true, approvedForHighRisk: true, pq: 'passed' };
const unapproved = { provider: 'anthropic', model: 'model-x', qualified: false, approvedForHighRisk: null, pq: null };

function listing(records: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { records } }) })));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchThreadRecords — the models that served a reopened turn', () => {
  it('keeps the listing\'s servedBy, and the gate decides on it instead of refusing for want of it', async () => {
    listing([
      { id: 'rec-ok', assistantMessageId: 11, recordSha256: SHA, servedBy: [approved] },
      { id: 'rec-no', assistantMessageId: 12, recordSha256: SHA, servedBy: [unapproved] },
    ]);
    const byMessage = await fetchThreadRecords('th_1');
    expect(byMessage.get(11)).toEqual({ status: 'recorded', id: 'rec-ok', sha256: SHA, servedBy: [approved] });
    expect(anaInsertRefusal(byMessage.get(11), false, 'document')).toBeNull();
    const refused = anaInsertRefusal(byMessage.get(12), false, 'document');
    expect(refused).toContain('model-x');
    expect(refused).not.toContain('This page has no record');
  });

  it('a listing that does not say which models served it still fails closed', async () => {
    listing([{ id: 'rec-old', assistantMessageId: 13, recordSha256: SHA }]);
    const byMessage = await fetchThreadRecords('th_1');
    expect(byMessage.get(13)).toEqual({ status: 'recorded', id: 'rec-old', sha256: SHA });
    expect(anaInsertRefusal(byMessage.get(13), false, 'document')).toContain('This page has no record');
  });
});
