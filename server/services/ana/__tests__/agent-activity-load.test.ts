/**
 * The two readers of the agent-activity summary, and why there are two.
 *
 * The live panel route must fail closed: a person looking at "background
 * investigations" has to be able to tell "none are running" from "the read
 * failed", so its loader throws. The greeting path must never block a chat
 * turn on a broken investigations table, so its reader swallows the error
 * and says nothing. One reader doing both is how an empty queue got rendered
 * over a database error.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const deep = vi.hoisted(() => ({ listRecentInvestigations: vi.fn() }));
vi.mock('../deep-investigation.js', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, listRecentInvestigations: deep.listRecentInvestigations };
});

import { getAgentActivity, loadAgentActivity } from '../agent-activity';

// Braces, not an expression body: `mockClear()` returns the mock, and a
// function returned from beforeEach is run by vitest as a teardown — which
// here would CALL the throwing mock after every test and fail it.
beforeEach(() => {
  deep.listRecentInvestigations.mockClear();
});

describe('loadAgentActivity — the route reader', () => {
  it('propagates a failed read instead of returning an empty queue', async () => {
    // mockImplementation(async () => { throw }) rather than mockRejectedValue:
    // the latter builds the rejected promise at setup time and is reported as
    // unhandled even though the code under test catches it.
    deep.listRecentInvestigations.mockImplementation(() => {
      throw new Error('relation "ana_deep_investigations" does not exist');
    });
    let caught: unknown = null;
    try {
      await loadAgentActivity(7);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/does not exist/);
  });

  it('returns the summary when the read succeeds', async () => {
    deep.listRecentInvestigations.mockResolvedValue([]);
    await expect(loadAgentActivity(7)).resolves.toEqual({
      activeCount: 0,
      stalledCount: 0,
      recentlyCompletedCount: 0,
      items: [],
    });
  });
});

describe('getAgentActivity — the greeting reader', () => {
  it('fails soft so a broken table never blocks a chat turn', async () => {
    deep.listRecentInvestigations.mockImplementation(() => {
      throw new Error('down');
    });
    await expect(getAgentActivity(7)).resolves.toEqual({
      activeCount: 0,
      stalledCount: 0,
      recentlyCompletedCount: 0,
      items: [],
    });
  });
});
