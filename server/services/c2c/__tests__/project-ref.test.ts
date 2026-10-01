/**
 * integerProjectForRef — the one resolution of a turn's project ref to an
 * integer projects row (PF-10 S6a).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ anchor: vi.fn(async (): Promise<number | null> => 42) }));
vi.mock('../program-project-anchor.js', () => ({ resolveProgramProjectAnchor: h.anchor }));

import { integerProjectForRef } from '../project-ref';

const DB = { tag: 'db' } as never;
const PROGRAM = '7ABB1C22-1234-4abc-8def-0123456789ab';
const ask = (ref: unknown, db: unknown = DB) => integerProjectForRef(db as never, { ref, orgId: 9, context: 't' });

beforeEach(() => {
  h.anchor.mockReset();
  h.anchor.mockResolvedValue(42);
});

describe('integerProjectForRef', () => {
  it('an integer is itself, with no read', async () => {
    for (const ref of [42, '42', ' 42 ', 'proj_42']) expect(await ask(ref), String(ref)).toBe(42);
    expect(h.anchor).not.toHaveBeenCalled();
  });

  it("a program UUID is its anchor row, read org-scoped, lower-cased; never the integer its digits spell", async () => {
    expect(await ask(PROGRAM)).toBe(42);
    expect(h.anchor).toHaveBeenCalledWith(DB, { programId: PROGRAM.toLowerCase(), orgId: 9, context: 't' });
  });

  it('a program with no anchor row is no project', async () => {
    h.anchor.mockResolvedValue(null);
    expect(await ask(PROGRAM)).toBeNull();
  });

  it('anything else is no project, with no read', async () => {
    for (const ref of [null, undefined, '', '7abc', '12.5', '-3', '0', {}, 'proj_']) expect(await ask(ref), String(ref)).toBeNull();
    expect(h.anchor).not.toHaveBeenCalled();
  });

  it('loads the db only when an anchor read is needed', async () => {
    const loader = vi.fn(async () => DB);
    expect(await ask('42', loader)).toBe(42);
    expect(loader).not.toHaveBeenCalled();
    expect(await ask(PROGRAM, loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
