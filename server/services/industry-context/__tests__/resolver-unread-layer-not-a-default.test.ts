/**
 * The effective industry context never stands a default in for a layer nobody read.
 *
 * What the code used to do (until 2026-10-15):
 *  - A failed organization-profile read was logged and the request answered 200
 *    with vertical 'biopharma', source 'license_default' and approval rigor
 *    'regulated_dual_review'; a failed project-profile read silently dropped the
 *    project layer. /api/mdx/work-packages then compiled a device plan for an
 *    IVD tenant on a database hiccup.
 *  - A failed license read reported licensedModules [] — "nothing licensed".
 *  - With no profile on file the context was 'biopharma' from a
 *    'license_default' source, a source that is never read.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { organizationIndustryProfiles, projectIndustryProfiles } from 'shared/schema';

const h = vi.hoisted(() => ({
  org: [] as unknown[] | Error,
  project: [] as unknown[] | Error,
  license: null as unknown,
}));

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            const r = table === organizationIndustryProfiles ? h.org : table === projectIndustryProfiles ? h.project : [];
            if (r instanceof Error) throw r;
            return r;
          },
        }),
      }),
    }),
  },
}));
vi.mock('../../license-manager', () => ({
  getLicenseInfo: async () => {
    if (h.license instanceof Error) throw h.license;
    return h.license;
  },
}));

import { mergeIndustryContext, resolveEffectiveProjectContext } from '../resolver';

const PROGRAM = '11111111-2222-3333-4444-555555555555';
const IVD_ORG = { primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'ivd_diagnostics', defaultPathways: [], defaultMarkets: [], defaultApprovalRigor: null };

beforeEach(() => {
  h.org = [];
  h.project = [];
  h.license = { enabledModules: ['mdx'] };
});

describe('mergeIndustryContext with no profile on file', () => {
  it('leaves the vertical, terminology and approval rigor unset and names no source', () => {
    const ctx = mergeIndustryContext({});
    expect(ctx.vertical).toBeNull();
    expect(ctx.source).toBe('none');
    expect(ctx.terminology).toBeNull();
    expect(ctx.approvalRigor).toBeNull();
    expect(ctx.specialization).toBeNull();
    expect(ctx.specializationSource).toBeNull();
  });

  it('says which profile the specialization came from, independently of the vertical', () => {
    const ctx = mergeIndustryContext({ project: { specialization: 'ivd_diagnostics' }, org: { primaryIndustry: 'medical_device_diagnostics' } });
    expect(ctx.source).toBe('organization');
    expect(ctx.specializationSource).toBe('project');
    expect(mergeIndustryContext({ org: IVD_ORG }).specializationSource).toBe('organization');
  });
});

describe('resolveEffectiveProjectContext — a failed read is an error, not a default', () => {
  it('throws when the organization profile cannot be read', async () => {
    h.org = new Error('connection terminated');
    await expect(resolveEffectiveProjectContext({ organizationId: 7 })).rejects.toMatchObject({
      code: 'INDUSTRY_CONTEXT_UNAVAILABLE',
      layer: 'organization_profile',
    });
  });

  it('throws when the project profile cannot be read', async () => {
    h.org = [IVD_ORG];
    h.project = new Error('connection terminated');
    await expect(resolveEffectiveProjectContext({ organizationId: 7, projectId: PROGRAM })).rejects.toMatchObject({
      code: 'INDUSTRY_CONTEXT_UNAVAILABLE',
      layer: 'project_profile',
    });
  });

  it('reports licensed modules as not read (null), never as none ([])', async () => {
    h.org = [IVD_ORG];
    h.license = null; // getLicenseInfo answers null when the license could not be read
    expect((await resolveEffectiveProjectContext({ organizationId: 7 })).licensedModules).toBeNull();
    h.license = new Error('connection terminated');
    expect((await resolveEffectiveProjectContext({ organizationId: 7 })).licensedModules).toBeNull();
  });

  it('resolves an absent profile to unset fields, not biopharma', async () => {
    const ctx = await resolveEffectiveProjectContext({ organizationId: 7 });
    expect(ctx.vertical).toBeNull();
    expect(ctx.source).toBe('none');
    expect(ctx.licensedModules).toEqual(['mdx']);
  });
});

describe('the routes answer 503 when the context cannot be read', () => {
  async function app(): Promise<express.Express> {
    const a = express();
    a.use((req, _res, next) => { (req as unknown as { user: unknown }).user = { id: 3, organizationId: 7 }; next(); });
    a.use('/api/mdx', (await import('../../../routes/mdx-industry-context')).default);
    a.use('/api/mdx', (await import('../../../routes/mdx-work-packages')).default);
    return a;
  }

  it('GET /api/mdx/effective-context', async () => {
    h.org = new Error('relation "organization_industry_profiles" does not exist');
    const res = await request(await app()).get('/api/mdx/effective-context');
    expect(res.status).toBe(503);
    expect(res.body.details).toMatchObject({ code: 'INDUSTRY_CONTEXT_UNAVAILABLE', layer: 'organization_profile' });
    expect(JSON.stringify(res.body)).not.toMatch(/relation|does not exist/);
  });

  it('GET /api/mdx/work-packages compiles no plan from a context it could not read', async () => {
    h.org = new Error('connection terminated');
    const res = await request(await app()).get('/api/mdx/work-packages');
    expect(res.status).toBe(503);
    expect(res.body.data).toBeUndefined();
  });
});
