import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';
const h = vi.hoisted(() => ({ query: vi.fn(), sections: [] as Array<Record<string, unknown>>, failure: false }));
vi.mock('../../server/db', () => ({ pool: { query: h.query } }));
vi.mock('../../server/services/cmc/submission-spine', () => ({ resolveSubmissionSpine: async () => null, resolveSequenceSpine: async () => null }));
vi.mock('../../server/services/ectd/required-sections', () => ({ resolveRequiredSections: async () => ({ modules: [{ code: 'm3', name: 'Quality', requiredSections: ['3.2.S.3'] }], provenance: { source: 'test requirements' } }) }));
import routes from '../../server/routes/ectd-compile';
function handler(path: string, method: string) {
  const layer = (routes as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  return layer.route.stack.at(-1).handle;
}
async function call(method = 'get') {
  const req = createMockRequest({ params: { projectIdent: '42' }, body: { region: 'EMA' } }) as any;
  req.tenantId = 7;
  const res = createMockResponse() as any;
  await handler(`/:projectIdent/${method === 'get' ? 'status' : 'validate'}`, method)(req, res);
  return res;
}
beforeEach(() => {
  h.sections = []; h.failure = false;
  h.query.mockReset().mockImplementation(async (sql: string) => {
    if (/FROM projects p/.test(sql)) return { rows: [{ regulatory_program_id: null, linked_program_id: null, program_type: null, primary_agency: null }] };
    if (/FROM project_sections/.test(sql)) {
      if (h.failure) throw new Error('SENTINEL private database failure');
      return { rows: h.sections };
    }
    return { rows: [] };
  });
});
describe('eCTD section boundaries and unavailable reads', () => {
  it('does not count adjacent numeric section codes as the required node in readiness or validation', async () => {
    h.sections = [{ section_code: '3.2.S.30', module: 'm3', status: 'approved', title: 'Adjacent node', content: 'Recorded content' }];
    const status = await call();
    expect(status.json.mock.calls[0][0]).toMatchObject({ totalCompleted: 0, contentComplete: false });
    const validation = await call('post');
    expect(validation.json.mock.calls[0][0].results).toContainEqual(expect.objectContaining({ rule: 'REQUIRED_SECTION_MISSING', sectionCode: '3.2.S.3' }));
  });
  it('counts a true child using the same normalized CTD boundary rule as placed leaves', async () => {
    h.sections = [{ section_code: 'm3.2.s.3.1', module: 'm3', status: 'approved', title: 'True child', content: 'Recorded content long enough to pass the assembled section minimum length.' }];
    expect((await call()).json.mock.calls[0][0]).toMatchObject({ totalCompleted: 1, contentComplete: true, submissionReady: false });
  });
  it('returns a contained error when the section store is unreadable instead of zero-percent readiness', async () => {
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
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('REQUIRED_SECTION_MISSING');
  });
});
