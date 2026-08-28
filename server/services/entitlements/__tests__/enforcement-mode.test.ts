/**
 * The enforcement mode resolver — held to the three things that can hurt.
 *
 * This module decides whether a live product refuses requests. Three ways it
 * can be wrong, and each one is a test below rather than a comment:
 *
 *   1. IT IGNORES THE STORED DECISION. The operator flips the mode on the
 *      console, the gate keeps reading the deployment's configuration, and the
 *      console reports success for a change that never took effect. The whole
 *      point of the feature disappears silently.
 *   2. IT ESCALATES ON A READ FAILURE. The settings store hiccups and the gate
 *      starts refusing requests it would not otherwise refuse — paying
 *      customers 403ed by an infrastructure fault, which is precisely the
 *      outage `report` mode was invented to prevent.
 *   3. IT NEVER REFRESHES. The cache exists so the gate costs no query per
 *      request; a cache that never expires turns "changeable at runtime" back
 *      into "changeable at redeploy", which is where this started.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import {
  ENFORCEMENT_MODE_KEY,
  MODE_CACHE_TTL_MS,
  capAt,
  currentEnforcementMode,
  deploymentEnforcementMode,
  invalidateEnforcementModeCache,
  parseMode,
  peekEnforcementMode,
  refreshEnforcementMode,
  resolveMode,
  writeEnforcementMode,
} from '../enforcement-mode';

/** A stored row as the settings table returns it. */
function storedRow(value: string, over: Record<string, unknown> = {}) {
  return {
    setting_value: value,
    updated_at: new Date('2026-08-24T10:00:00.000Z'),
    updated_by: 7,
    reason: 'measured for a week, denials are correct',
    ...over,
  };
}

/** pool.query answers the SELECT with these rows; the INSERT always succeeds. */
function primeStore(rows: unknown[]) {
  query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('SELECT setting_value')) return { rows };
    return { rows: [] };
  });
}

/** Every read of the setting fails, the way a database outage does. */
function primeStoreFailure(err: unknown = new Error('connection terminated')) {
  query.mockImplementation(async (sql: string) => {
    if (String(sql).includes('SELECT setting_value')) throw err;
    return { rows: [] };
  });
}

const selectCalls = () =>
  query.mock.calls.filter((c: unknown[]) => String(c[0]).includes('SELECT setting_value'));

beforeEach(() => {
  query.mockReset();
  invalidateEnforcementModeCache();
  delete process.env.MODULE_ENFORCEMENT;
  // Only Date is faked: the module measures TTL with Date.now() and uses no
  // timers, and faking the microtask queue would break the background refresh
  // this suite has to observe.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  invalidateEnforcementModeCache();
  delete process.env.MODULE_ENFORCEMENT;
});

/* ── Pure helpers ───────────────────────────────────────────────────────── */

describe('parsing and the deployment fallback', () => {
  it('accepts only the three real modes, case- and space-insensitively', () => {
    expect(parseMode('off')).toBe('off');
    expect(parseMode(' Report ')).toBe('report');
    expect(parseMode('ENFORCE')).toBe('enforce');
  });

  it('returns null for anything else rather than picking a default', () => {
    // The two callers mean different things by an unrecognized value, so the
    // parser must not decide for them.
    for (const v of ['', 'nonsense', 'on', null, undefined, 3, {}]) {
      expect(parseMode(v as unknown)).toBeNull();
    }
  });

  it('defaults the deployment to off — enforcement stays opt-in', () => {
    expect(deploymentEnforcementMode({} as NodeJS.ProcessEnv)).toBe('off');
    expect(deploymentEnforcementMode({ MODULE_ENFORCEMENT: 'nonsense' } as never)).toBe('off');
    expect(deploymentEnforcementMode({ MODULE_ENFORCEMENT: 'enforce' } as never)).toBe('enforce');
  });

  it('capAt never returns the stricter of the two', () => {
    expect(capAt('enforce', 'report')).toBe('report');
    expect(capAt('report', 'report')).toBe('report');
    expect(capAt('off', 'report')).toBe('off');
  });
});

describe('precedence', () => {
  it('a stored value wins over the deployment', () => {
    const r = resolveMode(storedRow('enforce'), 'off');
    expect(r.mode).toBe('enforce');
    expect(r.source).toBe('stored');
    expect(r.storedMode).toBe('enforce');
    expect(r.deploymentMode).toBe('off');
    expect(r.updatedBy).toBe(7);
    expect(r.reason).toContain('denials are correct');
  });

  it('nothing stored means the deployment decides, exactly as before', () => {
    // The compatibility promise: applying the migration changes the behaviour
    // of no existing deployment.
    const r = resolveMode(null, 'report');
    expect(r.mode).toBe('report');
    expect(r.source).toBe('deployment');
    expect(r.storedMode).toBeNull();
  });

  it('a stored value this build does not understand is not coerced into one', () => {
    // A rollback to an older build must not reinterpret a newer value as `off`
    // and quietly stop enforcing — or, worse, as something that refuses more.
    const r = resolveMode(storedRow('quarantine'), 'report');
    expect(r.mode).toBe('report');
    expect(r.source).toBe('deployment');
    expect(r.storedMode).toBeNull();
  });
});

/* ── Failure 1: the stored decision is ignored ──────────────────────────── */

describe('the stored decision reaches the caller', () => {
  it('serves the stored mode over a conflicting deployment value', async () => {
    process.env.MODULE_ENFORCEMENT = 'off';
    primeStore([storedRow('enforce')]);

    const r = await currentEnforcementMode();
    expect(r.mode).toBe('enforce');
    expect(r.source).toBe('stored');
    expect(r.deploymentMode).toBe('off');
    expect(r.degraded).toBe(false);
  });

  it('reports the deployment as the source when nothing is stored', async () => {
    process.env.MODULE_ENFORCEMENT = 'report';
    primeStore([]);

    const r = await currentEnforcementMode();
    expect(r.mode).toBe('report');
    expect(r.source).toBe('deployment');
    expect(r.storedMode).toBeNull();
    expect(r.degraded).toBe(false);
  });

  it('treats a database with no settings table as nothing stored, not as broken', async () => {
    // A deployment that has not applied the migration must behave EXACTLY as
    // it did before, including not being marked degraded — degraded means "I
    // could not read", and here there is nothing to read.
    process.env.MODULE_ENFORCEMENT = 'enforce';
    const undefinedTable = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    query.mockImplementation(async () => {
      throw undefinedTable;
    });

    const r = await currentEnforcementMode();
    expect(r.mode).toBe('enforce');
    expect(r.source).toBe('deployment');
    expect(r.degraded).toBe(false);
  });

  it('writes the setting and re-reads it rather than reporting what it asked for', async () => {
    let stored: unknown[] = [];
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      const s = String(sql);
      if (s.includes('SELECT setting_value')) return { rows: stored };
      if (s.includes('INSERT INTO platform_settings')) {
        stored = [storedRow(String(params[1]), { updated_by: params[2], reason: params[3] })];
        return { rows: [] };
      }
      return { rows: [] };
    });

    const r = await writeEnforcementMode({
      mode: 'enforce',
      reason: 'rollout approved',
      updatedBy: 12,
    });
    expect(r.mode).toBe('enforce');
    expect(r.source).toBe('stored');
    expect(r.updatedBy).toBe(12);
    expect(r.reason).toBe('rollout approved');
    // The value returned came from a read, not from the argument.
    expect(selectCalls().length).toBeGreaterThan(0);
    const insert = query.mock.calls.find((c: unknown[]) => String(c[0]).includes('INSERT INTO'));
    expect((insert?.[1] as unknown[])[0]).toBe(ENFORCEMENT_MODE_KEY);
  });
});

/* ── Failure 2: escalating on a read failure ────────────────────────────── */

describe('a read failure never refuses more than it already was', () => {
  it('caps a cold-start failure at observing, even when the deployment says refuse', async () => {
    // The outage this prevents: the settings read fails on a freshly started
    // process, the deployment is configured to refuse, and every unlicensed
    // request starts 403ing on the strength of a fault rather than a decision.
    process.env.MODULE_ENFORCEMENT = 'enforce';
    primeStoreFailure();

    const r = await currentEnforcementMode();
    expect(r.mode).toBe('report');
    expect(r.mode).not.toBe('enforce');
    expect(r.degraded).toBe(true);
  });

  it('does not invent enforcement when the deployment says off', async () => {
    process.env.MODULE_ENFORCEMENT = 'off';
    primeStoreFailure();

    const r = await currentEnforcementMode();
    expect(r.mode).toBe('off');
    expect(r.degraded).toBe(true);
  });

  it('keeps serving the last known good answer when a later read fails', async () => {
    process.env.MODULE_ENFORCEMENT = 'off';
    primeStore([storedRow('enforce')]);
    expect((await currentEnforcementMode()).mode).toBe('enforce');

    primeStoreFailure();
    vi.setSystemTime(new Date(Date.now() + MODE_CACHE_TTL_MS + 1_000));
    await currentEnforcementMode(); // triggers the background refresh
    await vi.waitFor(() => expect(peekEnforcementMode()?.degraded).toBe(true));

    const r = await currentEnforcementMode();
    // Continuing to do what was already being done cannot start refusing
    // anything new — and it must not silently drop back to the deployment
    // value either, which here would have SWITCHED ENFORCEMENT OFF.
    expect(r.mode).toBe('enforce');
    expect(r.source).toBe('stored');
    expect(r.degraded).toBe(true);
  });
});

/* ── Failure 3: the cache ───────────────────────────────────────────────── */

describe('the cache', () => {
  it('costs one read, not one per call, inside the staleness window', async () => {
    process.env.MODULE_ENFORCEMENT = 'off';
    primeStore([storedRow('report')]);

    for (let i = 0; i < 25; i += 1) await currentEnforcementMode();
    expect(selectCalls()).toHaveLength(1);
  });

  it('picks up a change made elsewhere once the window passes — no restart', async () => {
    // The defect this catches: a cache that never refreshes turns "changeable
    // at runtime" back into "changeable at redeploy".
    process.env.MODULE_ENFORCEMENT = 'off';
    primeStore([storedRow('report')]);
    expect((await currentEnforcementMode()).mode).toBe('report');

    primeStore([storedRow('enforce')]);
    vi.setSystemTime(new Date(Date.now() + MODE_CACHE_TTL_MS + 1_000));

    // The stale value is served immediately — no request waits on the read.
    expect((await currentEnforcementMode()).mode).toBe('report');
    await vi.waitFor(() => expect(peekEnforcementMode()?.mode).toBe('enforce'));
    expect((await currentEnforcementMode()).mode).toBe('enforce');
  });

  it('collapses a concurrent stampede into a single read', async () => {
    process.env.MODULE_ENFORCEMENT = 'off';
    primeStore([storedRow('report')]);

    const all = await Promise.all(Array.from({ length: 20 }, () => currentEnforcementMode()));
    expect(all.every((r) => r.mode === 'report')).toBe(true);
    expect(selectCalls()).toHaveLength(1);
  });

  it('does not let a read that was already in flight put back a mode a write replaced', async () => {
    // The defect this catches: a background refresh reads the old value, the
    // operator changes the mode, and then the older read lands and reverts the
    // console by itself for a whole window — with nothing on screen to explain
    // why the change they just made came undone.
    process.env.MODULE_ENFORCEMENT = 'off';
    let release: (() => void) | null = null;
    const slowRead = new Promise<void>((r) => {
      release = r;
    });
    let stored = 'report';
    let firstRead = true;
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      const s = String(sql);
      if (s.includes('SELECT setting_value')) {
        if (firstRead) {
          firstRead = false;
          await slowRead; // still in flight while the write happens
          return { rows: [storedRow('report')] };
        }
        return { rows: [storedRow(stored)] };
      }
      if (s.includes('INSERT INTO platform_settings')) {
        stored = String(params[1]);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const stale = refreshEnforcementMode();
    invalidateEnforcementModeCache();
    await writeEnforcementMode({ mode: 'enforce', reason: 'go live', updatedBy: 1 });
    expect(peekEnforcementMode()?.mode).toBe('enforce');

    (release as unknown as () => void)();
    await stale;

    expect(peekEnforcementMode()?.mode).toBe('enforce');
    expect((await currentEnforcementMode()).mode).toBe('enforce');
  });

  it('makes a write visible immediately rather than after the window', async () => {
    process.env.MODULE_ENFORCEMENT = 'off';
    let stored: unknown[] = [storedRow('report')];
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      const s = String(sql);
      if (s.includes('SELECT setting_value')) return { rows: stored };
      if (s.includes('INSERT INTO platform_settings')) {
        stored = [storedRow(String(params[1]))];
        return { rows: [] };
      }
      return { rows: [] };
    });

    expect((await currentEnforcementMode()).mode).toBe('report');
    await writeEnforcementMode({ mode: 'off', reason: 'stand down', updatedBy: 1 });
    // No clock movement: the operator must not watch a console that still
    // shows the old mode for half a minute after they changed it.
    expect((await currentEnforcementMode()).mode).toBe('off');
  });
});
