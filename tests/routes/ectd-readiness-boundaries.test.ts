/**
 * eCTD readiness/validation: CTD section boundaries and unavailable reads.
 *
 * 2026-10-17 (DOCUMENT_STORE_CONSOLIDATION.md step 7): these cases drove a
 * legacy numeric ident whose sections came from `project_sections`. That
 * branch is gone; every ident compiles a program, and a program's documents
 * are its PLACED LEAVES. The same boundary rule (sectionMatches) and the same
 * contained failure are pinned here over the placed-leaf read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';
const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
const h = vi.hoisted(() => ({ query: vi.fn(), leaves: [] as Array<Record<string, unknown>>, failure: false }));
vi.mock('../../server/db', () => ({ pool: { query: h.query } }));
vi.mock('../../server/services/cmc/submission-spine', () => ({
  resolveSubmissionSpine: async () => ({
    submissionId: 5, match: 'program', applicationType: 'ind', primaryRegion: 'eu',
    sequence: { id: 9, sequenceNumber: '0000', region: 'eu', leafCount: Math.max(h.leaves.length, 1) },
  }),
  resolveSequenceSpine: async () => null,
}));
vi.mock('../../server/services/ectd/required-sections', () => ({ resolveRequiredSections: async () => ({ modules: [{ code: 'm3', name: 'Quality', requiredSections: ['3.2.S.3'] }], provenance: { source: 'test requirements' } }) }));
import routes from '../../server/routes/ectd-compile';
function handler(path: string, method: string) {
  const layer = (routes as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  return layer.route.stack.at(-1).handle;
}
async function call(method = 'get') {
  const req = createMockRequest({ params: { projectIdent: PROGRAM }, body: { region: 'EMA' } }) as any;
  req.tenantId = 7;
  const res = createMockResponse() as any;
  await handler(`/:projectIdent/${method === 'get' ? 'status' : 'validate'}`, method)(req, res);
  return res;
}
const leaf = (section_code: string) => ({ section_code, title: 'Placed', lifecycle_op: 'new', document_table: 'vault_documents', document_id: null, document_uuid: PROGRAM, document_type: null });
beforeEach(() => {
  h.leaves = []; h.failure = false;
  h.query.mockReset().mockImplementation(async (sql: string) => {
    if (/FROM regulatory_programs/.test(sql)) return { rows: [{ id: PROGRAM, code: 'BX-1', name: 'BX-1', program_type: 'ind' }] };
    if (/FROM submission_leaves/.test(sql)) {
      if (h.failure) throw new Error('SENTINEL private database failure');
      return { rows: h.leaves };
    }
    return { rows: [] };
  });
});
describe('eCTD section boundaries and unavailable reads', () => {
  it('does not count adjacent numeric section codes as the required node in readiness or validation', async () => {
    h.leaves = [leaf('3.2.S.30')];
    const status = await call();
    expect(status.json.mock.calls[0][0]).toMatchObject({ totalCompleted: 0, contentComplete: false });
    const validation = await call('post');
    expect(validation.json.mock.calls[0][0].results).toContainEqual(expect.objectContaining({ rule: 'REQUIRED_SECTION_UNPLACED', sectionCode: '3.2.S.3' }));
  });
  it('counts a true child using the normalized CTD boundary rule', async () => {
    h.leaves = [leaf('m3.2.s.3.1')];
    expect((await call()).json.mock.calls[0][0]).toMatchObject({ totalCompleted: 1, contentComplete: true, submissionReady: false });
  });
  it('returns a contained error when the placed-leaf read fails instead of zero-percent readiness', async () => {
    h.failure = true;
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('SENTINEL');
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('overallReadiness');
  });
  it('returns the same contained failure for an unavailable pre-compile validation read', async () => {
    h.failure = true;
    const res = await call('post');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('SENTINEL');
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('REQUIRED_SECTION_UNPLACED');
  });
  it('never reads the legacy section store', async () => {
    h.leaves = [leaf('3.2.S.3')];
    await call();
    await call('post');
    expect(h.query.mock.calls.some(([sql]) => /project_sections/.test(String(sql)))).toBe(false);
  });
});
