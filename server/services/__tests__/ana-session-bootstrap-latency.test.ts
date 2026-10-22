import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sources = vi.hoisted(() => ({
  working: vi.fn(),
  projectProfile: vi.fn(),
  projectAtoms: vi.fn(),
  clientProfile: vi.fn(),
  clientAtoms: vi.fn(),
  lessons: vi.fn(),
  catalogEnabled: vi.fn(),
  vault: vi.fn(),
  uploads: vi.fn(),
  actor: vi.fn(),
  scope: vi.fn(),
  verifyScope: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: sources.lessons }) }) }) }),
  },
}));
vi.mock('../client-intelligence-memory.js', () => ({
  getClientProfile: sources.clientProfile,
  getMemoryEntries: sources.clientAtoms,
  getProjectIntelligence: sources.projectProfile,
  getProjectMemoryEntries: sources.projectAtoms,
}));
vi.mock('../working-memory.js', () => ({ getLatestWorkingMemoryByThread: sources.working }));
vi.mock('../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: sources.catalogEnabled,
  getCatalogBootstrapDigest: sources.vault,
  listChatUploads: sources.uploads,
}));
vi.mock('../c2c/current-program-access.js', () => ({
  readCurrentProgramActor: sources.actor,
  requireProgramScopeStillCurrent: sources.verifyScope,
}));
vi.mock('../ana/catalog-scope.js', () => ({ catalogScope: sources.scope }));

import { buildSessionBootstrapContext, sessionBootstrapBlockFor } from '../ana-session-bootstrap';

const programId = '5ab1c224-735e-4e03-82bf-14f1f169a5ed';
const db = { query: vi.fn() };
const actor = { userId: 3, role: 'viewer' };
const accessibleScope = { scope: 'verified-accessible-programs', actor, programIds: [programId], reconciliationRequired: false };
const input = { db, userId: 3, organizationId: 7, projectId: 11, projectRef: programId, threadId: 'thread-7' };
const delay = <T>(value: T, ms = 200) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sources.actor.mockResolvedValue(actor);
  sources.scope.mockResolvedValue({ programId, accessibleScope });
  sources.verifyScope.mockResolvedValue(undefined);
  sources.working.mockImplementation(() => delay('Earlier endpoint discussion'));
  sources.projectProfile.mockResolvedValue({ id: 101 });
  sources.projectAtoms.mockImplementation(() => delay({ entries: [{ title: 'Project fact', content: 'Recorded project data' }] }));
  sources.clientProfile.mockResolvedValue({ id: 102 });
  sources.clientAtoms.mockImplementation(() => delay({ entries: [{ title: 'Client fact', content: 'Recorded client data' }] }));
  sources.lessons.mockImplementation(() => delay([{ capabilityKey: 'review', outcome: 'success', lessonsLearned: 'Cite the evidence.' }]));
  sources.catalogEnabled.mockResolvedValue(true);
  sources.vault.mockImplementation(() => delay({
    files: [{ fileName: 'study.pdf', documentTitle: 'Study report', placementStatus: 'confirmed', catalogStatus: 'cataloged' }],
    total: 1, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0, actorFiltered: true,
  }));
  sources.uploads.mockImplementation(() => delay({ uploads: [{ fileName: 'prior-upload.pdf', fileId: 'file-7' }], hasMore: false, actorFiltered: true, total: 1, withheld: 0 }));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('session recall latency', () => {
  it('loads independent sources together while preserving every recalled section and tenant argument', async () => {
    const start = Date.now();
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    const text = await result;
    // Six 200 ms I/O sources cost 200 ms together, not 1,200 ms in series.
    expect(Date.now() - start).toBe(200);
    for (const value of ['Earlier endpoint discussion', 'Project fact', 'Client fact', 'Cite the evidence.', 'Study report', 'prior-upload.pdf']) {
      expect(text).toContain(value);
    }
    expect(sources.working).toHaveBeenCalledWith('thread-7', 7);
    expect(sources.projectProfile).toHaveBeenCalledWith(11, 7);
    expect(sources.clientAtoms).toHaveBeenCalledWith(102, 7, { limit: 40 });
    expect(sources.actor).toHaveBeenCalledWith(db, { organizationId: 7, userId: 3 });
    expect(sources.scope).toHaveBeenCalledWith({ userId: 3, projectId: 11, projectRef: programId, sqlClient: db }, 7, null, 'read', db);
    expect(sources.scope).toHaveBeenCalledTimes(1);
    expect(sources.vault).toHaveBeenCalledWith(db, 7, { userId: 3, programId, limit: 12 }, accessibleScope);
    expect(sources.uploads).toHaveBeenCalledWith(db, 7, { userId: 3, programId, limit: 8 }, accessibleScope);
    expect(sources.verifyScope).toHaveBeenCalledWith(db, { organizationId: 7, userId: 3, programId }, accessibleScope);
    expect(text).not.toContain('Session recall incomplete');
  });

  it('bounds a stalled source and keeps the other evidence with an explicit incomplete-recall notice', async () => {
    sources.working.mockImplementation(() => new Promise(() => {}));
    let text: string | undefined;
    void buildSessionBootstrapContext(input).then(value => { text = value; });
    await vi.advanceTimersByTimeAsync(1500);
    expect(text).toBeDefined();
    expect(text).toContain('Project fact');
    expect(text).toContain('Study report');
    expect(text).toContain('Session recall incomplete');
    expect(text).toContain('working memory');
    expect(text).toContain('not evidence that no records exist');
  });

  it('bounds a stalled catalog feature lookup without reading gated records', async () => {
    let resolveEnabled!: (value: boolean) => void;
    sources.catalogEnabled.mockImplementation(() => new Promise(resolve => { resolveEnabled = resolve; }));
    let text: string | undefined;
    void buildSessionBootstrapContext(input).then(value => { text = value; });
    await vi.advanceTimersByTimeAsync(1500);
    expect(text).toContain('Session recall incomplete');
    expect(text).toContain('Project fact');
    expect(sources.catalogEnabled).toHaveBeenCalledTimes(1);
    // The feature lookup arriving after the budget must not start more I/O.
    resolveEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sources.vault).not.toHaveBeenCalled();
    expect(sources.uploads).not.toHaveBeenCalled();
  });

  it('distinguishes a failed source from an empty source and consumes late rejections', async () => {
    let rejectWorking!: (error: Error) => void;
    sources.working.mockImplementation(() => new Promise((_, reject) => { rejectWorking = reject; }));
    sources.projectAtoms.mockRejectedValue(new Error('database detail must not enter the prompt'));
    const result = buildSessionBootstrapContext(input);
    await vi.advanceTimersByTimeAsync(1500);
    const text = await result;
    rejectWorking(new Error('late failure'));
    await Promise.resolve();
    expect(text).toContain('project memory');
    expect(text).toContain('Session recall incomplete');
    expect(text).not.toContain('database detail');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps disabled recall and disabled catalog gates intact', async () => {
    vi.stubEnv('ANA_SESSION_BOOTSTRAP_AUTO', 'false');
    expect(await sessionBootstrapBlockFor({ ...input, priorMessageCount: 0 })).toBe('');
    expect(sources.working).not.toHaveBeenCalled();
    sources.catalogEnabled.mockResolvedValue(false);
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    expect(await result).not.toContain('Session recall incomplete');
    expect(sources.vault).not.toHaveBeenCalled();
    expect(sources.uploads).not.toHaveBeenCalled();
  });
});

describe('session recall current access', () => {
  it('withholds both catalogue arms when access changes after their prose and counts were read', async () => {
    sources.verifyScope.mockRejectedValue(new Error('private scope details must not enter the prompt'));
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    const text = await result;
    expect(text).toContain('Project fact');
    expect(text).toContain('catalog access verification');
    expect(text).not.toContain('Study report');
    expect(text).not.toContain('prior-upload.pdf');
    expect(text).not.toContain('files on record');
    expect(text).not.toContain('private scope details');
  });

  it('bounds a stalled final access read within the original turn budget and discards catalogue results', async () => {
    sources.verifyScope.mockImplementation(() => new Promise(() => {}));
    const start = Date.now();
    let text: string | undefined;
    void buildSessionBootstrapContext(input).then(value => { text = value; });
    await vi.advanceTimersByTimeAsync(1499);
    expect(text).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(Date.now() - start).toBe(1500);
    expect(text).toContain('catalog access verification');
    expect(text).toContain('Project fact');
    expect(text).not.toContain('Study report');
    expect(text).not.toContain('prior-upload.pdf');
  });

  it('does not start any prose loader for an inactive or unavailable current actor', async () => {
    sources.actor.mockRejectedValue(new Error('current actor is unavailable'));
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    const text = await result;
    expect(text).toContain('Session recall incomplete');
    for (const load of [sources.working, sources.projectProfile, sources.clientProfile, sources.lessons, sources.vault, sources.uploads]) {
      expect(load).not.toHaveBeenCalled();
    }
    expect(text).not.toContain('current actor is unavailable');
    expect(text).not.toContain('Study report');
  });

  it('never turns an unresolved open project into a library recall', async () => {
    sources.scope.mockResolvedValue({ code: 'NO_PROJECT', error: 'The open project has no program.' });
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    const text = await result;
    expect(text).toContain('Project fact');
    expect(text).toContain('vault file recall');
    expect(text).toContain('chat upload recall');
    expect(sources.vault).not.toHaveBeenCalled();
    expect(sources.uploads).not.toHaveBeenCalled();
  });

  it('keeps genuine evaluated catalogue emptiness distinct from unavailable access', async () => {
    sources.vault.mockResolvedValue({ files: [], total: 0, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0 });
    sources.uploads.mockResolvedValue({ uploads: [], hasMore: false });
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    const text = await result;
    expect(sources.verifyScope).toHaveBeenCalledTimes(1);
    expect(text).not.toContain('Session recall incomplete');
    expect(text).not.toContain('Study report');
    expect(text).toContain('Project fact');
  });
});


describe('source recall admitted actor and sample projection', () => {
  it('does not inject recall for a session without an authenticated actor', async () => {
    expect(await sessionBootstrapBlockFor({ ...input, userId: null, priorMessageCount: 0 })).toBe('');
    expect(sources.actor).not.toHaveBeenCalled();
    expect(sources.vault).not.toHaveBeenCalled();
    expect(sources.uploads).not.toHaveBeenCalled();
  });
  it('names refused source reads without exposing SQL or private details', async () => {
    sources.vault.mockRejectedValue(new Error('private source sentinel detail'));
    sources.uploads.mockRejectedValue(new Error('private upload sentinel'));
    const result = sessionBootstrapBlockFor({ ...input, priorMessageCount: 0 });
    await vi.runAllTimersAsync();
    const text = await result;
    expect(sources.vault).toHaveBeenCalledWith(db, 7, { userId: 3, programId, limit: 12 }, accessibleScope);
    expect(text).toContain('Session recall incomplete');
    expect(text).toContain('vault file recall');
    expect(text).toContain('chat upload recall');
    expect(text).not.toContain('private source sentinel');
    expect(text).not.toContain('private upload');
    expect(text).not.toContain('no files');
  });

  it('keeps organization recall actor-filtered with no invented project', async () => {
    const libraryScope = { ...accessibleScope, programIds: [programId] };
    sources.scope.mockResolvedValue({ programId: null, accessibleScope: libraryScope });
    sources.uploads.mockResolvedValue({ uploads: [{ fileName: 'upload.pdf', fileId: 'upload-1' }],
      hasMore: true, actorFiltered: true, total: 4, withheld: 3,
      sourceAccessNotice: 'Source identities are limited to currently accessible programmes.' });
    const result = buildSessionBootstrapContext({ db, organizationId: 7, userId: 3 });
    await vi.runAllTimersAsync();
    const text = await result;
    expect(sources.scope).toHaveBeenCalledWith({ userId: 3, projectId: undefined, projectRef: undefined, sqlClient: db }, 7, null, 'read', db);
    expect(sources.vault).toHaveBeenCalledWith(db, 7, { userId: 3, programId: null, limit: 12 }, libraryScope);
    expect(sources.uploads).toHaveBeenCalledWith(db, 7, { userId: 3, programId: null, limit: 8 }, libraryScope);
    expect(text).toContain('accessible source scope');
    expect(text).toContain('scope total was not measured');
    expect(text).not.toContain('this is all of them');
  });

  it('derives an exact chat scope count only from a page with no next row', async () => {
    sources.uploads.mockResolvedValue({ uploads: [{ fileName: 'only.pdf', fileId: 'upload-1' }], hasMore: false, actorFiltered: true });
    const result = buildSessionBootstrapContext(input);
    await vi.runAllTimersAsync();
    const text = await result;
    expect(text).toContain('1 chat file(s) in your accessible source scope at this recall check');
    expect(text).not.toContain('scope total was not measured');
  });
});
