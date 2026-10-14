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
  getCatalogBootstrapDigestForActor: sources.vault,
  listChatUploadsForActor: sources.uploads,
}));

import { buildSessionBootstrapContext, sessionBootstrapBlockFor } from '../ana-session-bootstrap';

const input = { organizationId: 7, userId: 3, projectId: 11, projectRef: '11111111-2222-4333-8444-555555555555', threadId: 'thread-7' };
const sourceScope = { organizationId: 7, userId: 3, projectId: 11, projectRef: input.projectRef };
const delay = <T>(value: T, ms = 200) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
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
    expect(sources.vault).toHaveBeenCalledWith(sourceScope, 12);
    expect(sources.uploads).toHaveBeenCalledWith(sourceScope, { limit: 8 });
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


describe('source-file recall uses current actor admission', () => {
  it('does not read files with a missing actor, while preserving other recall and naming the gap', async () => {
    const result = buildSessionBootstrapContext({ ...input, userId: undefined });
    await vi.runAllTimersAsync();
    const text = await result;
    expect(sources.vault).not.toHaveBeenCalled();
    expect(sources.uploads).not.toHaveBeenCalled();
    expect(text).toContain('Project fact');
    expect(text).toContain('Session recall incomplete');
    expect(text).toContain('vault file recall');
    expect(text).toContain('chat upload recall');
    expect(text).not.toContain('Study report');
  });
  it('keeps an explicit refused scope unavailable and consumes safe failure without disclosing details', async () => {
    sources.vault.mockRejectedValue(new Error('private sentinel detail'));
    sources.uploads.mockRejectedValue(new Error('private upload sentinel'));
    const result = sessionBootstrapBlockFor({ ...input, priorMessageCount: 0 });
    await vi.runAllTimersAsync();
    const text = await result;
    expect(sources.vault).toHaveBeenCalledWith(sourceScope, 12);
    expect(text).toContain('Session recall incomplete');
    expect(text).not.toContain('private sentinel');
    expect(text).not.toContain('private upload');
    expect(text).not.toContain('no files');
  });
  it('org-level source recall carries the actor and no fabricated project', async () => {
    const result = buildSessionBootstrapContext({ organizationId: 7, userId: 3 });
    await vi.runAllTimersAsync();
    const text = await result;
    expect(sources.vault).toHaveBeenCalledWith({ organizationId: 7, userId: 3, projectId: undefined, projectRef: undefined }, 12);
    expect(sources.uploads).toHaveBeenCalledWith({ organizationId: 7, userId: 3, projectId: undefined, projectRef: undefined }, { limit: 8 });
    expect(text).toContain('accessible source scope');
    expect(text).not.toContain('this is all of them');
  });
});
