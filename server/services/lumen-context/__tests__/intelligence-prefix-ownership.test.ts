/** Native Vitest runner coverage of the shared prefix's pending-read ownership.
 * Source/database collaborators are controlled. Not a live-model or DB proof. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  client: vi.fn(), project: vi.fn(), wisdom: vi.fn(), objective: vi.fn(), resolve: vi.fn(),
}));
vi.mock('../../client-intelligence-memory.js', () => ({
  buildClientIntelligenceContext: h.client, buildProjectIntelligenceContext: h.project,
}));
vi.mock('../../c2c/project-ref.js', () => ({ integerProjectForRef: h.resolve }));
vi.mock('../../ana-wisdom-engine.js', () => ({ buildWisdomContext: h.wisdom }));
vi.mock('../../../db.js', () => ({ db: {} }));
vi.mock('../../c2c/charter-objectives.js', () => ({
  readProjectObjectives: h.objective, objectivesContextBlock: (value: string) => value,
}));

let prefix: typeof import('../intelligence-prefix');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.resetModules();
  h.client.mockReset().mockResolvedValue('ORGANIZATION_ONLY');
  h.project.mockReset().mockResolvedValue('CURRENT_PROJECT');
  h.wisdom.mockReset().mockResolvedValue(null);
  h.objective.mockReset().mockResolvedValue('CURRENT_OBJECTIVE');
  h.resolve.mockReset().mockImplementation(async (_db, { ref }: { ref: unknown }) =>
    /^[1-9][0-9]*$/.test(String(ref)) ? Number(ref) : null);
  prefix = await import('../intelligence-prefix');
});

describe('intelligence recall ownership', () => {
  it('an objective write invalidates an already-started recall before AnA receives it', async () => {
    const gate = deferred<string>(); h.objective.mockReturnValueOnce(gate.promise);
    const old = prefix.getIntelligencePrefix(7, 42);
    await vi.waitFor(() => expect(h.objective).toHaveBeenCalledTimes(1));
    prefix.invalidateIntelligencePrefix(7, 42);
    gate.resolve('RETIRED_OBJECTIVE');
    expect(await old).toContain('Intelligence recall unavailable');
    expect(await old).not.toContain('RETIRED_OBJECTIVE');
    expect(await prefix.getIntelligencePrefix(7, 42)).toContain('CURRENT_OBJECTIVE');
    expect(h.objective).toHaveBeenCalledTimes(2);
  });

  it('a late retired read cannot overwrite the newer cached project context', async () => {
    const gate = deferred<string>(); h.project.mockReturnValueOnce(gate.promise);
    const old = prefix.getIntelligencePrefix(7, 42);
    await vi.waitFor(() => expect(h.project).toHaveBeenCalledTimes(1));
    prefix.invalidateIntelligencePrefix(7, 42);
    const fresh = await prefix.getIntelligencePrefix(7, 42);
    gate.resolve('RETIRED_PROJECT');
    expect(await old).not.toContain('RETIRED_PROJECT');
    expect(await prefix.getIntelligencePrefix(7, 42)).toBe(fresh);
    expect(h.project).toHaveBeenCalledTimes(2);
  });

  it('overlapping turns share one pending read of the same project scope', async () => {
    const gate = deferred<string>(); h.project.mockReturnValue(gate.promise);
    const a = prefix.getIntelligencePrefix(7, 42);
    const b = prefix.getIntelligencePrefix(7, 42);
    await vi.waitFor(() => expect(h.project).toHaveBeenCalled());
    gate.resolve('SHARED_PROJECT');
    expect(await a).toBe(await b);
    expect(h.project).toHaveBeenCalledTimes(1);
    expect(h.objective).toHaveBeenCalledTimes(1);
  });

  it('explicit whitespace project scope never reads a warm organization snapshot', async () => {
    await prefix.getIntelligencePrefix(7);
    expect(await prefix.getIntelligencePrefix(7, '   ')).not.toContain('ORGANIZATION_ONLY');
    expect(h.client).toHaveBeenCalledTimes(1);
  });

  it('a whitespace-project result cannot suppress later organization recall', async () => {
    await prefix.getIntelligencePrefix(7, '   ');
    expect(await prefix.getIntelligencePrefix(7)).toContain('ORGANIZATION_ONLY');
    expect(h.client).toHaveBeenCalledTimes(1);
  });

  it('invalidation during resolution stops dependent source reads', async () => {
    const gate = deferred<number>(); h.resolve.mockReturnValueOnce(gate.promise);
    const old = prefix.getIntelligencePrefix(7, 42);
    await vi.waitFor(() => expect(h.resolve).toHaveBeenCalledTimes(1));
    prefix.invalidateIntelligencePrefix(7, 42);
    gate.resolve(42);
    expect(await old).toContain('Intelligence recall unavailable');
    expect(h.project).not.toHaveBeenCalled();
    expect(h.objective).not.toHaveBeenCalled();
    expect(h.wisdom).not.toHaveBeenCalled();
  });

  it('project invalidation does not clear another project or another organization', async () => {
    await prefix.getIntelligencePrefix(7, 42);
    await prefix.getIntelligencePrefix(7, 43);
    await prefix.getIntelligencePrefix(8, 42);
    prefix.invalidateIntelligencePrefix(7, 42);
    await prefix.getIntelligencePrefix(7, 43);
    await prefix.getIntelligencePrefix(8, 42);
    await prefix.getIntelligencePrefix(7, 42);
    expect(h.project.mock.calls).toEqual([[42, 7], [43, 7], [42, 8], [42, 7]]);
  });

  it('failed source recall is not retained as a successful cache entry', async () => {
    h.project.mockRejectedValueOnce(new Error('synthetic unavailable source'));
    expect(await prefix.getIntelligencePrefix(7, 42)).toContain('Intelligence recall unavailable');
    expect(await prefix.getIntelligencePrefix(7, 42)).toContain('CURRENT_PROJECT');
    expect(h.project).toHaveBeenCalledTimes(2);
  });
});
