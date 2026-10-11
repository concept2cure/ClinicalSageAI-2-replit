import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ client: vi.fn(), project: vi.fn(), wisdom: vi.fn(), anchor: vi.fn() }));
vi.mock('../../client-intelligence-memory.js', () => ({
  buildClientIntelligenceContext: h.client, buildProjectIntelligenceContext: h.project,
}));
vi.mock('../../ana-wisdom-engine.js', () => ({ buildWisdomContext: h.wisdom }));
vi.mock('../../../db.js', () => ({ db: { tag: 'shared-db' } }));
vi.mock('../../c2c/program-project-anchor.js', () => ({ resolveProgramProjectAnchor: h.anchor }));
import { getIntelligencePrefix, invalidateIntelligencePrefix } from '../intelligence-prefix';

const PROGRAM = '7abb1c22-1234-4abc-8def-0123456789ab';
const stalled = () => new Promise<never>(() => {});
let org = 5000;
// Resolve module transforms before advancing the virtual source deadlines.
beforeAll(async () => { await import('../../c2c/project-ref.js'); await import('../../ana-wisdom-engine.js'); await import('../../../db.js'); });
beforeEach(() => {
  vi.useFakeTimers(); org += 1;
  h.client.mockReset().mockResolvedValue('Client preference');
  h.project.mockReset().mockResolvedValue('Project decision');
  h.wisdom.mockReset().mockResolvedValue(null);
  h.anchor.mockReset().mockResolvedValue(42);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function observe(project: number | string = 42) {
  const settled = vi.fn();
  const pending = getIntelligencePrefix(org, project).then(settled);
  return { settled, pending };
}

describe('bounded intelligence prefix recall', () => {
  it.each(['client', 'project', 'wisdom'] as const)('retains healthy context when %s stalls', async source => {
    h[source].mockImplementation(stalled);
    const { settled, pending } = observe();
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const block = settled.mock.calls[0][0];
    expect(block).toContain('Intelligence recall unavailable');
    expect(block).toContain('Do not infer that missing intelligence or prior decisions do not exist');
    if (source !== 'client') expect(block).toContain('Client preference');
    if (source !== 'project') expect(block).toContain('Project decision');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts client recall before a stalled program resolution and never starts late project reads', async () => {
    let resolve!: (id: number) => void;
    h.anchor.mockReturnValue(new Promise<number>(r => { resolve = r; }));
    const { settled, pending } = observe(PROGRAM);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.client).toHaveBeenCalledWith(org);
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    expect(settled.mock.calls[0][0]).toContain('Client preference');
    expect(settled.mock.calls[0][0]).toContain('project resolution');
    resolve(42);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.project).not.toHaveBeenCalled();
    expect(h.wisdom).not.toHaveBeenCalled();
  });

  it('shares one deadline across program resolution and dependent recall', async () => {
    let resolve!: (id: number) => void;
    h.anchor.mockReturnValue(new Promise<number>(r => { resolve = r; }));
    h.project.mockImplementation(stalled);
    const { settled, pending } = observe(PROGRAM);
    await vi.advanceTimersByTimeAsync(2000);
    resolve(42);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.project).toHaveBeenCalledWith(42, org);
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
  });
});

describe('prefix cache after recall failure', () => {
  it('keeps healthy wisdom when another source fails', async () => {
    h.client.mockRejectedValue(new Error('query failed'));
    h.wisdom.mockResolvedValue({ projectRisks: [{ severity: 'high', description: 'Review stability gap' }], projectLesson: 'Retain the comparator', engineVersion: 2 });
    const prefix = await getIntelligencePrefix(org, 42);
    expect(prefix).toContain('Project decision');
    expect(prefix).toContain('Review stability gap');
    expect(prefix).toContain('Retain the comparator');
    expect(prefix).toContain('client intelligence');
  });

  it('does not allow a late timed-out result to fill the cache', async () => {
    let resolve!: (value: string) => void;
    h.client.mockReturnValueOnce(new Promise<string>(r => { resolve = r; }));
    const first = observe();
    await vi.advanceTimersByTimeAsync(3000);
    expect(first.settled).toHaveBeenCalledTimes(1);
    await first.pending;
    resolve('Late client preference');
    await vi.advanceTimersByTimeAsync(0);
    const recovered = await getIntelligencePrefix(org, 42);
    expect(recovered).toContain('Client preference');
    expect(recovered).not.toContain('Late client preference');
    expect(h.client).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not cache degraded recall, allowing the next turn to recover', async () => {
    h.client.mockRejectedValueOnce(new Error('unavailable'));
    const first = await getIntelligencePrefix(org, 42);
    expect(first).toContain('Intelligence recall unavailable');
    const second = await getIntelligencePrefix(org, 42);
    expect(second).toContain('Client preference');
    expect(second).not.toContain('unavailable');
    expect(h.client).toHaveBeenCalledTimes(2);
  });

  it('caches healthy empty recall and honors TTL and invalidation', async () => {
    h.client.mockResolvedValue(null); h.project.mockResolvedValue(null);
    expect(await getIntelligencePrefix(org, 42)).toBe('');
    expect(await getIntelligencePrefix(org, 42)).toBe('');
    expect(h.client).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    await getIntelligencePrefix(org, 42);
    expect(h.client).toHaveBeenCalledTimes(2);
    invalidateIntelligencePrefix(org, 42);
    await getIntelligencePrefix(org, 42);
    expect(h.client).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not query without an organization or share healthy recall between organizations', async () => {
    expect(await getIntelligencePrefix(undefined, 42)).toBe('');
    expect(h.client).not.toHaveBeenCalled();
    await getIntelligencePrefix(org, 42);
    await getIntelligencePrefix(org + 1000, 42);
    expect(h.client.mock.calls.map(c => c[0])).toEqual([org, org + 1000]);
  });
});
