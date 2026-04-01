import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const mockCreateSessionArchive = vi.fn();
const mockRegisterExportGovernanceQuick = vi.fn();
const mockReadDirSync = vi.fn();
const mockStatSync = vi.fn();
const mockCreateReadStream = vi.fn();

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../server/services/export-service', () => ({
  exportService: {
    createSessionArchive: (...args: any[]) => mockCreateSessionArchive(...args),
  },
}));

vi.mock('../../server/services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: (...args: any[]) => mockRegisterExportGovernanceQuick(...args),
}));

vi.mock('fs', () => ({
  default: {
    readdirSync: (...args: any[]) => mockReadDirSync(...args),
    statSync: (...args: any[]) => mockStatSync(...args),
    createReadStream: (...args: any[]) => mockCreateReadStream(...args),
  },
}));

import router from '../../server/routes/export-routes';

function getDownloadHandler() {
  const layer = router.stack.find((l: any) => l.route?.path === '/download/study-bundle' && l.route?.methods?.get);
  if (!layer) throw new Error('Missing GET /download/study-bundle route');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('export-routes governance fail-closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadDirSync.mockReturnValue(['study123_bundle_20260401.zip']);
    mockStatSync.mockReturnValue({ size: 1024 });
    mockCreateReadStream.mockReturnValue({ pipe: vi.fn() });
    mockRegisterExportGovernanceQuick.mockResolvedValue({ artifactId: 'a1' });
  });

  it('returns 401 when governed download has no authenticated user context', async () => {
    const req = createMockRequest({ query: { study_id: 'study123' } }) as any;
    const res = createMockResponse();

    const handler = getDownloadHandler();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Authenticated organization and user context required') }),
    );
  });

  it('returns 503 when governed export registration throws', async () => {
    mockRegisterExportGovernanceQuick.mockRejectedValue(new Error('governance unavailable'));

    const req = createMockRequest({ query: { study_id: 'study123' } }) as any;
    req.user = { id: 9, organizationId: 42, name: 'Test User' };
    const res = createMockResponse();

    const handler = getDownloadHandler();
    await handler(req, res);

    expect(mockRegisterExportGovernanceQuick).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GOVERNANCE_REGISTRATION_FAILED' }),
    );
  });
});
