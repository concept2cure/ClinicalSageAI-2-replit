/** Genuine loader-issued contexts with canonical admission over explicit SQL rows.
 * These controls do not qualify database policy or provider delivery. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), load: vi.fn(), actor: vi.fn(), program: vi.fn() }));
vi.mock('../../../db.js', () => ({
  pool: { connect: async () => ({ query: mocks.query, release: mocks.release }) },
  getPool: () => ({ query: mocks.query }),
}));
vi.mock('../../../db/tenantStore.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../db/tenantStore.js')>()),
  getTenantScope: () => ({ tenantId: '7', role: 'member', source: 'request' }),
}));
vi.mock('../../vault/document-catalog.service.js', async () => {
  const actual = await import('../../vault/document-catalog-actor-access.js');
  return { withAnaSourceReadScope: actual.withAnaSourceReadScope, loadDocumentForActor: mocks.load,
    revalidateActorSourceScope: async (...args: Parameters<typeof actual.revalidateActorSourceScope>) => {
      await mocks.actor(...args);
      await actual.revalidateActorSourceScope(...args);
    } };
});
vi.mock('../../c2c/current-program-access.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../c2c/current-program-access.js')>();
  return { ...actual,
    requireProgramScopeStillCurrent: async (...args: Parameters<typeof actual.requireProgramScopeStillCurrent>) => {
      await mocks.program(...args);
      await actual.requireProgramScopeStillCurrent(...args);
    } };
});
import {
  assertDraftSourceContextCurrent, draftSourceAudit, draftSourcePrompt, loadDraftProjectSources,
  type DraftSourceContext, type DraftSourceContextIdentity,
} from '../draft-project-sources';

const id = '10000000-0000-4000-8000-000000000001';
const programId = 'abcdefab-0000-4000-8000-000000000001';
const executor = { query: mocks.query };
const ctx = { organizationId: 7, userId: 3, projectRef: programId, sqlClient: executor };
const consumer = { organizationId: 7, userId: 3, projectId: programId };
const text = 'Study 🧬 日本語: prespecified endpoint 12 of 30 participants.';
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
function document(body = text) {
  return { id, organizationId: 7, programId, contentHash: 'a'.repeat(64), documentTitle: 'Synthetic source',
    fileName: 'source.txt', extractedText: body, extractedTextSha256: digest(body), isCurrent: true,
    originalFileAvailable: true, disposition: null, sourceAccess: { currentUseEligible: true },
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'plain-text', extractionConfidence: null } };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    const statement = sql.replace(/\s+/g, ' ').trim();
    if (['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT', 'ROLLBACK'].includes(statement)) return { rows: [] };
    if (statement.startsWith("SELECT set_config('app.current_tenant_id', $1,")) {
      expect(params).toEqual(statement.includes("set_config('app.current_user_role', $2, false)") ? ['7', 'member'] : ['7']);
      return { rows: [] };
    }
    if (statement === "SELECT set_config('app.current_user_role', $1, true)") {
      expect(params).toEqual(['member']);
      return { rows: [] };
    }
    if (statement.startsWith('SELECT ou.role FROM organization_users ou')) {
      expect(params).toEqual(statement.includes('ou.user_id = $1') ? [3, 7] : [7, 3, false]);
      return { rows: [{ role: 'member' }] };
    }
    if (statement === 'SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1') {
      expect(params).toEqual([programId, 7]);
      return { rows: [{ id: programId }] };
    }
    if (statement.startsWith('SELECT id, client_workspace_id AS "clientWorkspaceId" FROM projects')) {
      expect(params).toEqual([programId, 7]);
      return { rows: [{ id: 42, clientWorkspaceId: 9 }] };
    }
    if (statement === 'SELECT id, regulatory_program_id FROM projects WHERE id = $1 AND organization_id = $2') {
      expect(params).toEqual([42, 7]);
      return { rows: [{ id: 42, regulatory_program_id: programId }] };
    }
    if (statement.startsWith('SELECT p.id, p.owner_id, p.created_by_id, p.settings, v.visibility,')) {
      expect(params).toEqual([7, 3, 42]);
      return { rows: [{ id: 42, owner_id: 8, created_by_id: 8, settings: {}, visibility: 'private',
        members: [{ userId: 3, role: 'use', status: 'active' }], review_assigned: false }] };
    }
    throw new Error(`Unexpected authority fixture query: ${statement}`);
  });
  mocks.load.mockResolvedValue(document());
});

describe('private source-context issuer and immutable selection', () => {
  it('freezes the genuine context, array, each source and each span before returning', async () => {
    const context = await loadDraftProjectSources([id], ctx);
    const source = context.sources[0];
    for (const value of [context, context.sources, source, source.span]) expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.set(context, 'status', 'unassessed')).toBe(false);
    expect(Reflect.set(context.sources, '0', {})).toBe(false);
    expect(Reflect.set(source, 'text', 'Replacement source')).toBe(false);
    expect(Reflect.set(source.span, 'end', 1)).toBe(false);
    expect(Object.keys(context).sort()).toEqual(['sources', 'status']);
    await expect(assertDraftSourceContextCurrent(context, consumer)).resolves.toBeUndefined();
  });

  it.each(['spread', 'json', 'structured'] as const)('refuses a %s copy with identical public source fields before reads', async kind => {
    const context = await loadDraftProjectSources([id], ctx);
    const copy = kind === 'spread' ? { ...context } : kind === 'json' ? JSON.parse(JSON.stringify(context)) : globalThis.structuredClone(context);
    vi.clearAllMocks();
    await expect(assertDraftSourceContextCurrent(copy, consumer)).rejects.toThrow('SOURCE_CONTEXT_UNTRUSTED');
    expect(() => draftSourcePrompt(copy)).toThrow('SOURCE_CONTEXT_UNTRUSTED');
    expect(() => draftSourceAudit(copy)).toThrow('SOURCE_CONTEXT_UNTRUSTED');
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.program).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([null, 1, [], {}, { status: 'loaded', sources: [] }, { status: 'unknown', sources: [] },
    { status: 'unassessed', sources: [{}] }, { status: 'unassessed', sources: null }])('refuses malformed or purported source authority %j', async value => {
    await expect(assertDraftSourceContextCurrent(value, consumer)).rejects.toThrow('SOURCE_CONTEXT_UNTRUSTED');
    expect(() => draftSourcePrompt(value as DraftSourceContext)).toThrow('SOURCE_CONTEXT_UNTRUSTED');
    expect(() => draftSourceAudit(value as DraftSourceContext)).toThrow('SOURCE_CONTEXT_UNTRUSTED');
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([undefined, { status: 'unassessed', sources: [] } as DraftSourceContext])('preserves ordinary no-source drafting without requiring actor IDs: %j', async context => {
    await expect(assertDraftSourceContextCurrent(context, {})).resolves.toBeUndefined();
    expect(draftSourcePrompt(context)).toContain('UNASSESSED');
    expect(draftSourceAudit(context)).toEqual({ projectSourceStatus: 'unassessed', projectSources: [] });
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('source contexts bind the consuming actor and declared project', () => {
  it('accepts canonical string actor IDs and UUID case without changing the original actor read', async () => {
    const context = await loadDraftProjectSources([id], ctx);
    vi.clearAllMocks();
    await assertDraftSourceContextCurrent(context, { organizationId: '7', userId: '3', projectId: programId.toUpperCase() });
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, userId: 3, projectRef: programId }),
      { includeText: true, currentOnly: true });
  });

  it('preserves a numeric original project identity across its supported number/string representation', async () => {
    const context = await loadDraftProjectSources([id], { ...ctx, projectRef: undefined, projectId: 42 });
    await expect(assertDraftSourceContextCurrent(context, { ...consumer, projectId: '42' })).resolves.toBeUndefined();
  });

  it.each([
    { organizationId: 8 }, { userId: 4 }, { projectId: id }, { projectId: 42 },
    { organizationId: undefined }, { userId: undefined }, { projectId: undefined },
    { organizationId: '7e0' }, { userId: '3.0' },
  ])('refuses consumer mismatch %j before borrowing the original actor authority', async difference => {
    const context = await loadDraftProjectSources([id], { ...ctx, projectId: 42 });
    vi.clearAllMocks();
    await expect(assertDraftSourceContextCurrent(context, { ...consumer, ...difference })).rejects.toThrow('SOURCE_CONTEXT_IDENTITY_MISMATCH');
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.program).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('pins the consumer identity synchronously before a current-body await', async () => {
    const context = await loadDraftProjectSources([id], ctx);
    const pendingIdentity: DraftSourceContextIdentity = { ...consumer };
    let release!: (value: ReturnType<typeof document>) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = assertDraftSourceContextCurrent(context, pendingIdentity);
    pendingIdentity.organizationId = 8;
    pendingIdentity.userId = 4;
    pendingIdentity.projectId = id;
    release(document());
    await expect(pending).resolves.toBeUndefined();
    expect(mocks.program).toHaveBeenLastCalledWith(executor, { organizationId: 7, userId: 3, programId }, expect.any(Object));
  });
});

describe('reusable current-body and authority checkpoint', () => {
  it('rechecks the actual current extraction, actor and program every time rather than promoting prior admission', async () => {
    const context = await loadDraftProjectSources([id], ctx);
    vi.clearAllMocks();
    await assertDraftSourceContextCurrent(context, consumer);
    await assertDraftSourceContextCurrent(context, consumer);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.actor).toHaveBeenCalledTimes(2);
    expect(mocks.program).toHaveBeenCalledTimes(2);
    expect(draftSourcePrompt(context)).toContain('server-loaded, version-bound');
    const audit = JSON.stringify(draftSourceAudit(context));
    expect(audit).toContain(context.sources[0].extractedTextSha256);
    expect(audit).not.toContain(text);
  });

  it.each(['inside', 'outside'] as const)('refuses a same-length post-load extraction correction %s the selected span', async where => {
    const original = 'x'.repeat(18000);
    mocks.load.mockResolvedValue(document(original));
    const context = await loadDraftProjectSources([id], ctx);
    const at = where === 'inside' ? 5 : original.length - 1;
    mocks.load.mockResolvedValue(document(original.slice(0, at) + 'y' + original.slice(at + 1)));
    await expect(assertDraftSourceContextCurrent(context, consumer)).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(context.sources[0].text).toBe('x'.repeat(12000));
  });

  it.each(['original', 'disposition', 'method', 'confidence', 'withdrawal', 'current-version'] as const)('refuses changed source state: %s', async change => {
    const context = await loadDraftProjectSources([id], ctx);
    const changed = document();
    const updates = {
      original: { originalFileAvailable: false }, disposition: { disposition: 'keep_data' },
      method: { catalog: { ...changed.catalog, extractionMethod: 'pdf-ocr' } },
      confidence: { catalog: { ...changed.catalog, extractionConfidence: 70 } },
      withdrawal: { sourceAccess: { currentUseEligible: false } }, 'current-version': { isCurrent: false },
    };
    mocks.load.mockResolvedValue({ ...changed, ...updates[change] });
    await expect(assertDraftSourceContextCurrent(context, consumer)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });

  it.each(['actor', 'program'] as const)('refuses current %s revocation after the source was loaded', async boundary => {
    const context = await loadDraftProjectSources([id], ctx);
    mocks[boundary].mockRejectedValueOnce(new Error('Synthetic current authority revoked'));
    await expect(assertDraftSourceContextCurrent(context, consumer)).rejects.toThrow('Synthetic current authority revoked');
  });

  it('preserves an unchanged eligible retained source and its original-unavailable caveat', async () => {
    mocks.load.mockResolvedValue({ ...document(), originalFileAvailable: false, disposition: 'keep_data' });
    const context = await loadDraftProjectSources([id], ctx);
    await expect(assertDraftSourceContextCurrent(context, consumer)).resolves.toBeUndefined();
    expect(context.sources[0]).toMatchObject({ originalFileAvailable: false, disposition: 'keep_data' });
    expect(draftSourcePrompt(context)).toContain('Original file unavailable');
  });

  it('retains a non-opening Unicode selection without choosing a replacement window at a later checkpoint', async () => {
    const body = 'Front page and table of contents. '.repeat(4000) +
      'Efficacy results 日本語 🧬: primary endpoint improved by 120 mL at week 24. ' + 'Appendices. '.repeat(1500);
    mocks.load.mockResolvedValue(document(body));
    const context = await loadDraftProjectSources([id], ctx, 'efficacy primary endpoint week 24');
    const before = JSON.stringify(context.sources[0]);
    expect(context.sources[0].span.start).toBeGreaterThan(80_000);
    expect(context.sources[0].text).toContain('日本語 🧬');
    await expect(assertDraftSourceContextCurrent(context, consumer)).resolves.toBeUndefined();
    expect(JSON.stringify(context.sources[0])).toBe(before);
    expect(body.slice(context.sources[0].span.start, context.sources[0].span.end)).toBe(context.sources[0].text);
  });

  it('rechecks exact current Unicode rather than accepting a lossy UTF-8 digest alias', async () => {
    const original = 'Source \ufffd marker';
    const changed = 'Source \ud800 marker';
    expect(digest(original)).toBe(digest(changed));
    mocks.load.mockResolvedValue(document(original));
    const context = await loadDraftProjectSources([id], ctx);
    mocks.load.mockResolvedValue(document(changed));
    await expect(assertDraftSourceContextCurrent(context, consumer)).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
});
