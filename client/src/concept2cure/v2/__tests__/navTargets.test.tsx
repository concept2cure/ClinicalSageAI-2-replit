// @vitest-environment jsdom
/**
 * Navigation-target validity gate — "no dead buttons on first human use".
 *
 * A first-time user clicks. Every button that navigates must land on a real
 * surface, not a blank scaffold or a no-op. This test statically extracts every
 * literal navigation target out of the v2 surface sources and asserts each one
 * resolves to something real:
 *
 *   • a SURFACE_VIEWS component (the destination renders), or
 *   • a DEEP_LINK_ALIAS (a redirect to a real view), or
 *   • the special 'home' hub (handled directly by V2App), or
 *   • a CollabLauncher modal mode ('task' / 'collab'), which opens the
 *     universal launcher rather than navigating the shell.
 *
 * A button pointing at a surface id that doesn't exist would render the
 * KitSurfaceScaffold placeholder — a soft dead-end a mount test never catches
 * but a human hits on their first click. This gate fails the build instead.
 *
 * Targets built from computed expressions (variables, props) can't be checked
 * statically and are intentionally out of scope; this covers the string
 * literals, which is where a typo'd or stale id actually lands.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SURFACE_VIEWS } from '../surfaceViews';
import { DEEP_LINK_ALIASES } from '../registryModel';

const here = path.dirname(fileURLToPath(import.meta.url));
const surfacesDir = path.resolve(here, '..', 'surfaces');
const v2Dir = path.resolve(here, '..');

/** Every id a navigation call is allowed to target. */
const allowed = new Set<string>([
  ...Object.keys(SURFACE_VIEWS), // real rendered surfaces
  ...Object.keys(DEEP_LINK_ALIASES), // redirect aliases → real surfaces
  'home', // the hub, handled directly in V2App
  'task', // CollabLauncher modal mode (window.C2C.open)
  'collab', // CollabLauncher modal mode (window.C2C.open)
]);

/**
 * Regexes for the ways a v2 surface names a navigation destination as a string
 * literal. Each captures the target id in group 1.
 *   onNav('x') / nav('x') / open('x') / C2C.open('x')  — imperative nav/bridge
 *   setSurface('x'                                       — context bridge
 *   setItem('c2c_open_surface', 'x')                     — localStorage nav bridge
 */
const PATTERNS: RegExp[] = [
  /(?<![A-Za-z])(?:onNav|nav|open)\(\s*'([a-z0-9-]+)'/g,
  /setSurface\(\s*'([a-z0-9-]+)'/g,
  /c2c_open_surface'\s*,\s*'([a-z0-9-]+)'/g,
];

function sourceFiles(): string[] {
  const surfaceFiles = fs
    .readdirSync(surfacesDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(surfacesDir, f));
  return [...surfaceFiles, path.join(v2Dir, 'V2App.tsx')];
}

/** Collect { target, file } for every literal navigation target in the sources. */
function collectTargets(): Array<{ target: string; file: string }> {
  const out: Array<{ target: string; file: string }> = [];
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.basename(file);
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        out.push({ target: m[1], file: rel });
      }
    }
  }
  return out;
}

describe('v2 navigation targets all resolve to a real destination', () => {
  const targets = collectTargets();

  it('extracts a non-trivial set of navigation targets (guards the scanner)', () => {
    // If this drops to ~0 the regexes silently stopped matching and the gate
    // would pass vacuously — assert the scanner still sees real nav calls.
    expect(new Set(targets.map((t) => t.target)).size).toBeGreaterThan(5);
  });

  it('every literal nav target is a real surface, alias, hub, or modal mode', () => {
    const dead = targets.filter((t) => !allowed.has(t.target));
    const detail = dead
      .map((d) => `${d.file} → '${d.target}'`)
      .sort()
      .join('\n  ');
    expect(dead, `dead navigation targets (no such surface):\n  ${detail}`).toEqual([]);
  });
});
