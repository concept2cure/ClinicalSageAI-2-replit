/** Former compatibility-route source semantics retained on the canonical reader. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDossierArtifactReadiness } from '../../services/c2c/dossier-artifact-read';
const query = vi.hoisted(() => vi.fn());
const admitted = { programId: '11111111-1111-4111-8111-111111111111', clientWorkspaceId: 9 };

async function read() {
  const result = await readDossierArtifactReadiness({ query }, 7, 41, admitted);
  if (result.state !== 'measured' && result.state !== 'no_artifacts') throw new Error('Expected a measured source');
  return result;
}

beforeEach(() => { query.mockReset(); });

describe('recorded artifact stage, without a second dossier figure', () => {
  it('approved plus locked remains approved, and keeps all stage counts and the latest timestamp', async () => {
    query.mockResolvedValue({ rows: [
      { ctd_section: '2.5', status: 'approved', count: 2, last_updated: new Date('2026-10-20T10:00:00Z') },
      { ctd_section: '2.5', status: 'locked', count: 1, last_updated: new Date('2026-10-21T10:00:00Z') },
    ] });
    const res = await read();
    expect(res.sections).toEqual([{
      ctdSection: '2.5', status: 'approved', artifactCount: 3,
      draftCount: 0, reviewCount: 0, approvedCount: 2, lockedCount: 1, unknownCount: 0,
      lastUpdated: '2026-10-21T10:00:00.000Z',
    }]);
    expect(query.mock.calls[0][1]).toEqual([41, 7, admitted.programId, 9]);
  });

  it.each(['unknown', 'toString', '__proto__', null])('keeps unsupported status %s unassessed rather than ready', async (status) => {
    query.mockResolvedValue({ rows: [
      { ctd_section: '3.2.P.1', status, count: 1, last_updated: null },
      { ctd_section: '3.2.P.1', status: 'locked', count: 1, last_updated: null },
    ] });
    const res = await read();
    expect(res.sections[0]).toMatchObject({ status: 'not_assessed', artifactCount: 2, unknownCount: 1, lockedCount: 1 });
    expect(res.summary).toMatchObject({ totalSections: 1, readySections: 0, inProgressSections: 0, draftSections: 0, notAssessedSections: 1 });
  });

  it('orders Module 3 parts by the canonical section comparator', async () => {
    query.mockResolvedValue({ rows: ['3.2.R', '3.2.A', '3.2.P', '3.2.S'].map(ctd_section => ({ ctd_section, status: 'review', count: 1, last_updated: null })) });
    const res = await read();
    expect(res.sections.map((s: { ctdSection: string }) => s.ctdSection)).toEqual(['3.2.S', '3.2.P', '3.2.A', '3.2.R']);
  });

  it('retains arbitrary recorded section tags and does not invent sections on an empty read', async () => {
    query.mockResolvedValueOnce({ rows: [{ ctd_section: 'appendix-label', status: 'draft', count: 1, last_updated: null }] });
    expect((await read()).sections[0].ctdSection).toBe('appendix-label');
    query.mockResolvedValueOnce({ rows: [] });
    const res = await read();
    expect(res.sections).toEqual([]);
    expect(res.summary).toMatchObject({ totalSections: 0, readySections: 0, notAssessedSections: 0 });
  });

  it('keeps a missing store distinct from an empty store', async () => {
    query.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));
    const res = await readDossierArtifactReadiness({ query }, 7, 41, admitted);
    expect(res).toMatchObject({ state: 'unavailable', code: 'STORE_UNAVAILABLE', sections: null, summary: null });
  });

  it.each([{ count: '1' }, { count: 0 }, { last_updated: 'not-a-date' }])('does not measure malformed source buckets: %j', async invalid => {
    query.mockResolvedValue({ rows: [{ ctd_section: '2.5', status: 'approved', count: 1, last_updated: null, ...invalid }] });
    const res = await readDossierArtifactReadiness({ query }, 7, 41, admitted);
    expect(res).toMatchObject({ state: 'unavailable', code: 'READ_FAILED', sections: null, summary: null });
  });

  it('does not query without the admitted program and client mapping', async () => {
    expect(await readDossierArtifactReadiness({ query }, 7, 41)).toMatchObject({ state: 'unanchored', sections: null, summary: null });
    expect(query).not.toHaveBeenCalled();
  });
});
