/**
 * Every id passed to `usePublishSurfaceContext` must be a REGISTERED surface id.
 *
 * WHY THIS IS WORTH A TEST
 * The failure is completely silent. `useActiveSurfaceContext` returns the
 * published context only when its `surfaceId` matches the surface the shell
 * currently has mounted — a deliberate guard, because serving the previous
 * screen's context makes AnA confidently wrong about what the user is looking
 * at. The consequence is that a surface publishing under a typo'd or renamed id
 * never matches, so AnA silently receives nothing: no error, no warning, no
 * behavioural difference from not having published at all. The surface looks
 * wired and is not.
 *
 * That is easy to introduce three ways: guessing the id (the component file name
 * and the route id often differ — `ReviewThreads.tsx` publishes under `review`,
 * because it is a pane inside `Review.tsx`), renaming a route without grepping
 * for publishers, and — the one that actually shipped — publishing under an id
 * the ROUTER REWRITES.
 *
 * MEMBERSHIP IS NOT REACHABILITY. `surfaceIdFromLocation` applies
 * `DEEP_LINK_ALIASES` BEFORE the shell has an `activeId` at all, so
 * `/concept2cure/task-board` makes `activeId === 'tasks'` and `'task-board'` is
 * never the active id — even though it IS a key in `SURFACE_VIEWS`. TaskBoard.tsx
 * published under `'task-board'` for the whole life of that call: the context was
 * built on every render, stored, and read past. This test asserted only
 * `registered.has(id)`, so it passed it, and so did the CI gate. Alias SOURCES
 * are now excluded from the routable set.
 *
 * So: parse all three sides out of the source and compare. No mocking, no
 * rendering — this is a static consistency check between files that must agree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const V2 = resolve(__dirname, '..');

/** Registered ids from the `SURFACE_VIEWS` map: `id: { component: X }`. */
function registeredSurfaceIds(): Set<string> {
  const src = readFileSync(join(V2, 'surfaceViews.ts'), 'utf8');
  const ids = [...src.matchAll(/^\s*'?([a-zA-Z0-9-]+)'?\s*:\s*\{\s*component:/gm)].map(m => m[1]);
  return new Set(ids);
}

/**
 * `DEEP_LINK_ALIASES` — the rewrites the router applies before the shell has an
 * active id. Parsed from the source rather than imported so this test compares
 * two FILES, the way the CI gate does, and cannot be satisfied by a re-export.
 */
function deepLinkAliases(): Record<string, string> {
  const src = readFileSync(join(V2, 'registryModel.ts'), 'utf8');
  const start = src.indexOf('export const DEEP_LINK_ALIASES');
  const body = src.slice(start, src.indexOf('};', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*'([a-z0-9-]+)'/gm)) {
    out[(m[1] ?? m[2]) as string] = m[3];
  }
  return out;
}

/** Every `usePublishSurfaceContext('<id>'` call across the v2 tree. */
function publishedIds(): Array<{ id: string; file: string }> {
  const out: Array<{ id: string; file: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'fixtures') continue;
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/usePublishSurfaceContext\(\s*'([^']+)'/g)) {
        out.push({ id: m[1], file: p.slice(V2.length + 1) });
      }
    }
  };
  walk(V2);
  return out;
}

describe('surface context publishers', () => {
  it('parses both sides — the regexes still match something', () => {
    // Guards the test itself: if either pattern stops matching (a refactor of
    // the map's shape, say), every assertion below would pass vacuously.
    expect(registeredSurfaceIds().size).toBeGreaterThan(50);
    expect(publishedIds().length).toBeGreaterThan(0);
  });

  it('parses the alias table — the reachability check is not vacuous', () => {
    // Without this the assertion below degrades to the membership check it
    // replaced, silently, the moment the alias block is renamed or reshaped.
    const aliases = deepLinkAliases();
    expect(Object.keys(aliases).length).toBeGreaterThan(0);
    expect(aliases['task-board']).toBe('tasks');
  });

  it('publishes only ids the shell can actually route to', () => {
    const registered = registeredSurfaceIds();
    const bad = publishedIds().filter(p => !registered.has(p.id));
    expect(
      bad.map(b => `${b.file} publishes '${b.id}', which is not a registered surface id`)
    ).toEqual([]);
  });

  it('never publishes under an id the router rewrites before the shell reads it', () => {
    // The failure this test was written for and did not catch. An alias SOURCE
    // is registered — so the membership assertion above passes it — and is
    // nonetheless never the active id, so the published context matches nothing
    // on every render, with no error and no behavioural difference from not
    // publishing at all.
    const aliases = deepLinkAliases();
    const bad = publishedIds().filter(p => aliases[p.id] && aliases[p.id] !== p.id);
    expect(
      bad.map(
        b =>
          `${b.file} publishes '${b.id}', which DEEP_LINK_ALIASES rewrites to ` +
          `'${aliases[b.id]}' before the shell has an active id — publish as '${aliases[b.id]}'`
      )
    ).toEqual([]);
  });

  it('has at most one publisher per surface id', () => {
    // Two live publishers share one slot and clobber each other, and either
    // one's unmount clears the other's context. Where a surface legitimately
    // has two mount sites they must be mutually exclusive branches — record the
    // exception here rather than letting it pass unnoticed.
    const MUTUALLY_EXCLUSIVE_BRANCHES = new Set<string>([
      // ReviewThreadsPane renders in Review.tsx's early-return empty state and
      // again in its main body; only one is ever mounted.
    ]);
    const seen = new Map<string, string[]>();
    for (const p of publishedIds()) {
      seen.set(p.id, [...(seen.get(p.id) ?? []), p.file]);
    }
    const dupes = [...seen.entries()]
      .filter(([id, files]) => files.length > 1 && !MUTUALLY_EXCLUSIVE_BRANCHES.has(id))
      .map(([id, files]) => `'${id}' is published from ${files.length} files: ${files.join(', ')}`);
    expect(dupes).toEqual([]);
  });
});
