/**
 * The intelligence prefix loads the OPEN project's intelligence, or none
 * (PF-10 S6a).
 *
 * getIntelligencePrefix parsed the project with parseInt. A v2 project is a
 * regulatory_programs UUID, and parseInt('7abb1c22-…') is 7: a valid, wrong
 * row of the same organization, whose intelligence and learned wisdom were put
 * in front of AnA as if they were this project's. A UUID beginning with a
 * letter loaded none. Now an integer goes through parseIntegerProjectId, a
 * program UUID through its anchor row (resolveProgramProjectAnchor), and
 * anything else loads no project context.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  project: vi.fn(async (id: number, _org?: number) => `intelligence of project ${id}`),
  wisdom: vi.fn(async () => null),
  anchor: vi.fn(async (): Promise<number | null> => null),
}));
vi.mock('../../client-intelligence-memory.js', () => ({
  buildClientIntelligenceContext: async () => null,
  buildProjectIntelligenceContext: h.project,
}));
vi.mock('../../ana-wisdom-engine.js', () => ({ buildWisdomContext: h.wisdom }));
vi.mock('../../../db.js', () => ({ db: { tag: 'shared-db' } }));
vi.mock('../../c2c/program-project-anchor.js', () => ({ resolveProgramProjectAnchor: h.anchor }));

import { getIntelligencePrefix, invalidateIntelligencePrefix } from '../intelligence-prefix';

const DIGITS_FIRST = '7abb1c22-1234-4abc-8def-0123456789ab';
const LETTER_FIRST = 'aabb1c22-1234-4abc-8def-0123456789ab';
let org = 100;

beforeEach(() => {
  h.project.mockClear();
  h.wisdom.mockClear();
  h.anchor.mockReset();
  h.anchor.mockResolvedValue(null);
  org += 1; // a fresh cache key per case
});

describe('which project the prefix loads', () => {
  it("a program UUID beginning with digits loads its anchor row's intelligence, never the integer its digits spell", async () => {
    h.anchor.mockResolvedValue(42);
    const prefix = await getIntelligencePrefix(org, DIGITS_FIRST);
    expect(h.anchor).toHaveBeenCalledWith({ tag: 'shared-db' }, expect.objectContaining({ programId: DIGITS_FIRST, orgId: org }));
    expect(h.project.mock.calls.map((c) => c[0])).toEqual([42]);
    expect(h.project.mock.calls[0][1]).toBe(org);
    expect(prefix).not.toContain('project 7');
  });

  it('a program with no anchor row loads no project intelligence', async () => {
    await getIntelligencePrefix(org, LETTER_FIRST);
    await getIntelligencePrefix(org, DIGITS_FIRST);
    expect(h.project).not.toHaveBeenCalled();
    expect(h.wisdom).not.toHaveBeenCalled();
  });

  it('a legacy integer project loads its own intelligence', async () => {
    await getIntelligencePrefix(org, '42');
    await getIntelligencePrefix(org + 1000, 42);
    expect(h.project.mock.calls.map((c) => c[0])).toEqual([42, 42]);
    expect(h.anchor).not.toHaveBeenCalled();
  });

  it('a malformed project id loads none', async () => {
    for (const bad of ['7abc', '-3', '0', 'proj_', '12.5']) await getIntelligencePrefix(org, bad);
    expect(h.project).not.toHaveBeenCalled();
  });
});

describe('the cache', () => {
  it('a program and the integer its digits spell are different cache entries', async () => {
    h.anchor.mockResolvedValue(42);
    await getIntelligencePrefix(org, DIGITS_FIRST);
    await getIntelligencePrefix(org, '7');
    expect(h.project.mock.calls.map((c) => c[0])).toEqual([42, 7]);
  });

  it('invalidating a program by its UUID clears its entry', async () => {
    h.anchor.mockResolvedValue(42);
    await getIntelligencePrefix(org, DIGITS_FIRST);
    await getIntelligencePrefix(org, DIGITS_FIRST);
    expect(h.project).toHaveBeenCalledTimes(1);
    invalidateIntelligencePrefix(org, DIGITS_FIRST);
    await getIntelligencePrefix(org, DIGITS_FIRST);
    expect(h.project).toHaveBeenCalledTimes(2);
  });
});
