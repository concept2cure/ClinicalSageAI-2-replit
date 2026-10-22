/**
 * The knowledge upload's governed client track is the one the upload states,
 * else the one the organization's industry profile records, else recorded as
 * not stated. It is never a default.
 *
 * What the route used to do (until 2026-10-22): `clientTrack` was 'device' or
 * 'diagnostics' when the body said so and 'biotech' otherwise, so every upload
 * from a device or diagnostics organization (the client sends no track) was
 * governed, and recorded in the artifact's metadata.harness, as biotech.
 *
 * When no track is recorded, the governed contract (which needs a track to
 * pick a rule pack) is evaluated under every track; the upload goes ahead only
 * when the outcome is the same under each, and the harness records the track
 * as not stated.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectLimit, poolQuery, admit, resolve, inserted } = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  poolQuery: vi.fn(),
  admit: vi.fn(),
  resolve: vi.fn(),
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock('../project-access', async (original) => ({
  ...(await original<typeof import('../project-access')>()),
  requireProjectAdmission: admit,
}));
vi.mock('../../../db', () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) })) })),
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        inserted.push(v);
        return { returning: vi.fn(async () => [{ id: 501 }]) };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 1 }]) })) })),
    })),
  },
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
}));
vi.mock('../../../services/concept2cure/governedDocumentContractService', () => ({ resolveGovernedContext: resolve }));
vi.mock('../../../services/module3-convergence-service', () => ({ classifyAndMapArtifactToSource: vi.fn() }));
vi.mock('../../../services/projects/retrieval-mode.js', () => ({ refreshProjectRetrievalMode: vi.fn(async () => undefined) }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));

import router from '../knowledge-sources';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
function uploadHandler(): Handler {
  const layer = (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>)
    .find((l) => l.route?.path === '/documents/upload' && l.route.methods.post);
  if (!layer?.route) throw new Error('upload route missing');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function upload(body: Record<string, unknown> = {}) {
  const req = {
    body: { projectId: 'proj_1', ...body },
    params: {}, query: {}, headers: {}, userId: 42,
    tenantContext: { organizationId: '1', clientWorkspaceId: '1' },
    file: { originalname: 'memo.txt', mimetype: 'text/plain', size: 64, buffer: Buffer.from('Evidence memo text.') },
  };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await uploadHandler()(req, res);
  return res;
}

const contract = (clientTrack: string, gateChecks: unknown[] = []) => ({
  validation: { valid: true, errors: [], warnings: [] },
  resolved: {},
  contract: { clientTrack, exportEligibility: { gateChecks, blockingReasons: [], readinessOutcome: 'conditional' } },
});
const harness = () =>
  ((inserted.find((v) => v.type === 'source_document')?.metadata as Record<string, unknown> | undefined)?.harness ?? null) as
    | Record<string, unknown>
    | null;
const tracksAsked = () => resolve.mock.calls.map(([ctx]) => (ctx as { clientTrack?: string }).clientTrack);

let profile: { primary_industry: string; mdx_specialization: string | null } | null;

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  profile = null;
  selectLimit.mockResolvedValue([{ id: 1, organizationId: 1, settings: {}, regulatoryProgramId: null }]);
  admit.mockImplementation(async () => (await selectLimit())[0]);
  resolve.mockImplementation((ctx: { clientTrack?: string }) => contract(String(ctx.clientTrack)));
  poolQuery.mockImplementation(async (sql: string) => {
    if (/FROM organization_industry_profiles/.test(sql)) return { rows: profile ? [profile] : [] };
    return { rows: [] };
  });
});

describe('knowledge upload: the governed client track is recorded, never defaulted', () => {
  it("uses the organization's recorded track when the upload states none", async () => {
    profile = { primary_industry: 'medical_device_diagnostics', mdx_specialization: 'ivd_diagnostics' };
    const res = await upload();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(tracksAsked(), "a diagnostics organization's upload was governed as biotech").toEqual(['diagnostics']);
    expect(harness()).toMatchObject({ clientTrack: 'diagnostics', clientTrackSource: 'organization' });
  });

  it('records the track as not stated when neither the upload nor the organization records one', async () => {
    const res = await upload();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(harness()?.clientTrack, "an unstated track was recorded as 'biotech'").toBeNull();
    expect(harness()?.clientTrackSource).toBe('not_stated');
    expect(tracksAsked().sort()).toEqual(['biotech', 'device', 'diagnostics']);
  });

  it('refuses, naming the input, when the governed outcome would depend on the unstated track', async () => {
    resolve.mockImplementation((ctx: { clientTrack?: string }) =>
      contract(String(ctx.clientTrack), ctx.clientTrack === 'device' ? [{ name: 'predicate_context_present', passed: false }] : []));
    const res = await upload();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toMatch(/clientTrack/);
    expect(harness()).toBeNull();
  });

  it('control: a track the upload states is used as stated', async () => {
    profile = { primary_industry: 'biotech_pharma', mdx_specialization: null };
    await upload({ clientTrack: 'device' });
    expect(tracksAsked()).toEqual(['device']);
    expect(harness()).toMatchObject({ clientTrack: 'device', clientTrackSource: 'upload' });
  });
});
