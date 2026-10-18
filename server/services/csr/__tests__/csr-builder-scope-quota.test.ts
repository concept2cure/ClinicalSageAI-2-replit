import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ rows: [] as unknown[], quota: vi.fn(), usage: vi.fn() }));
vi.mock('../../../db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => h.rows }) }) }) } }));
vi.mock('../../usage-metering.js', () => ({ checkQuota: h.quota, recordUsage: h.usage }));
vi.mock('../../../lib/unified-ai-client.js', () => ({ ai: null }));
import { launchCSRBuild, launchCSRBuildAsync, type CSRBuildRequest } from '../../csr-builder';
const req = { organizationId: 7, userId: 5, projectId: 21, studyInfo: { protocolNumber: 'ACTUAL-STUDY', indication: 'Recorded' } } as CSRBuildRequest;
beforeEach(() => { h.rows = []; h.quota.mockReset(); h.usage.mockReset(); });
describe('CSR refusal before quota and AI work', () => {
  it('does not reserve or consume quota for a foreign project in either launch path', async () => {
    await expect(launchCSRBuild(req)).rejects.toMatchObject({ code: 'CSR_PROJECT_NOT_FOUND' });
    await expect(launchCSRBuildAsync(req, { organizationId: 7, projectId: 21, requestedBy: 5 })).rejects.toMatchObject({ code: 'CSR_PROJECT_NOT_FOUND' });
    expect(h.quota).not.toHaveBeenCalled();
    expect(h.usage).not.toHaveBeenCalled();
  });
  it('refuses conflicting tenant, actor or malformed target before billing', async () => {
    await expect(launchCSRBuildAsync(req, { organizationId: 8, projectId: 21 })).rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
    await expect(launchCSRBuildAsync(req, { organizationId: 7, projectId: 21, requestedBy: 6 })).rejects.toMatchObject({ code: 'CSR_SCOPE_MISMATCH' });
    await expect(launchCSRBuild({ ...req, projectId: 0 })).rejects.toMatchObject({ code: 'CSR_SCOPE_INVALID' });
    expect(h.quota).not.toHaveBeenCalled();
    expect(h.usage).not.toHaveBeenCalled();
  });
});
