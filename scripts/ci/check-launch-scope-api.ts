/**
 * ci:launch-scope-api — no launch or shell screen calls an API path that
 * production refuses as outside the launch scope.
 *
 * `server/services/entitlements/launch-scope-api.ts` refuses, in production, a
 * path whose every claiming surface (`UI_SURFACES[].apiPrefixes`) is outside
 * the launch scope. That rule is only as true as the registry. On 2026-09-25,
 * before the registry was corrected, 19 paths that launch and shell screens
 * call were claimed only by out-of-scope surfaces: Tasks and Vault read
 * `/api/regulatory-programs` and `/api/submission-ops`, Protocol Dev
 * `/api/study-design`, the shell's task tray `/api/approval-workflows`.
 * Enforcing then would have refused working launch screens.
 *
 * This gate walks each launch and shell surface's client import graph from its
 * registration in `client/src/concept2cure/v2/surfaceViews.ts` (plus the
 * shell chrome: main.tsx and V2App.tsx, minus the edge into surfaceViews that
 * reaches every surface), collects every `/api/...` path the code names
 * (string and template literals; `${…}` becomes `:p`), and fails on any path
 * the verdict calls `out-of-scope`. The fix is to declare the prefix on the
 * launch surface that calls it, or to stop calling it — never to widen the
 * verdict.
 *
 * Over-approximates on purpose: every file reachable from a surface counts,
 * whether or not the branch that calls it renders. A false flag costs a
 * registry line; a missed one costs a refused launch screen in production.
 *
 *   npx tsx scripts/ci/check-launch-scope-api.ts             # the gate
 *   npx tsx scripts/ci/check-launch-scope-api.ts --list      # every path and its verdict
 *   npx tsx scripts/ci/check-launch-scope-api.ts --selftest  # prove it fails on the case it exists for
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPrefixMap, NEVER_GATED } from '../../server/services/entitlements/api-prefix-map';
import { launchScopeApiVerdict, type LaunchScopeApiVerdict } from '../../server/services/entitlements/launch-scope-api';
import { LAUNCH_SURFACE_IDS } from '../../shared/constants/launch-scope';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface Layout {
  root: string;
  client: string;
  shared: string;
  surfaceViews: string;
  shellRoots: string[];
  /** The host that renders `DeviceSurfaces[...]` registrations, and which of its imports each one renders. */
  deviceHost?: { file: string; components: Record<string, string> };
}

const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

function makeResolver(L: Layout) {
  return (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = path.join(L.client, spec.slice(2));
    else if (spec.startsWith('@shared/')) base = path.join(L.shared, spec.slice(8));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
    else return null;
    for (const e of EXT) {
      const f = base + e;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
    return null;
  };
}

export interface Violation {
  path: string;
  surfaces: string[];
  files: string[];
}

export function checkLaunchScopeApi(
  L: Layout,
  prefixMap: Map<string, Set<string>>,
  launchIds: ReadonlySet<string>,
): { violations: Violation[]; unresolved: string[]; all: Map<string, { verdict: LaunchScopeApiVerdict; files: Set<string>; surfaces: Set<string> }> } {
  const resolve = makeResolver(L);
  const cache = new Map<string, string>();
  const read = (f: string) => {
    if (!cache.has(f)) cache.set(f, fs.readFileSync(f, 'utf8'));
    return cache.get(f)!;
  };
  const deps = (f: string): string[] => {
    const out: string[] = [];
    const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    const s = read(f);
    while ((m = re.exec(s))) {
      const r = resolve(f, m[1] || m[2] || m[3]);
      if (r && !/\.(css|svg|png|jpe?g)$/.test(r)) out.push(r);
    }
    return out;
  };
  const reach = (roots: string[], exclude: (a: string, b: string) => boolean) => {
    const seen = new Set<string>();
    const st = [...roots];
    while (st.length) {
      const f = st.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const d of deps(f)) if (!exclude(f, d)) st.push(d);
    }
    return seen;
  };
  const apiPaths = (f: string): string[] => {
    // The registries name every prefix as data; they are not calls.
    if (/ui-surface-registry|launch-scope\.ts$|\/__tests__\/|\.test\.tsx?$/.test(f)) return [];
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const out = new Set<string>();
    const re = /['"`](\/api\/[^'"`\s?#]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const p = m[1].replace(/\$\{[^}]*\}/g, ':p').replace(/\$\{.*$/, '').replace(/\/+$/, '');
      if (p.length > 5) out.add(p);
    }
    return [...out];
  };

  const sv = read(L.surfaceViews);
  const bindings = new Map<string, string>();
  {
    const re = /const\s+(\w+)\s*=\s*lazy\w*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sv))) {
      const r = resolve(L.surfaceViews, m[2]);
      if (r) bindings.set(m[1], r);
    }
  }
  const host = L.deviceHost;
  const hostImports = host ? new Set(deps(host.file).filter((d) => /\/(surfaces|presub)\//.test(d))) : new Set<string>();

  const unresolved: string[] = [];
  const fileSurfaces = new Map<string, Set<string>>();
  const add = (f: string, id: string) => {
    if (!fileSurfaces.has(f)) fileSurfaces.set(f, new Set());
    fileSurfaces.get(f)!.add(id);
  };
  for (const id of launchIds) {
    const m = sv.match(new RegExp(`['"]?${id.replace(/-/g, '\\-')}['"]?\\s*:\\s*\\{\\s*component:\\s*([\\w\\[\\]'".-]+)`));
    if (!m) {
      unresolved.push(id);
      continue;
    }
    const dev = m[1].match(/DeviceSurfaces\[['"]([\w-]+)['"]\]/);
    let roots: string[];
    let excl: (a: string, b: string) => boolean = () => false;
    if (dev && host) {
      const name = host.components[dev[1]];
      const im = name
        ? read(host.file).match(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`))
        : null;
      const file = im ? resolve(host.file, im[1]) : null;
      if (!file) {
        unresolved.push(id);
        continue;
      }
      roots = [host.file, file];
      excl = (a, b) => a === host.file && hostImports.has(b) && b !== file;
    } else {
      const f = bindings.get(m[1]);
      if (!f) {
        unresolved.push(id);
        continue;
      }
      roots = [f];
    }
    for (const f of reach(roots, (a, b) => b === L.surfaceViews || excl(a, b))) add(f, id);
  }
  for (const f of reach(L.shellRoots, (_a, b) => b === L.surfaceViews)) add(f, '(shell chrome)');

  const all = new Map<string, { verdict: LaunchScopeApiVerdict; files: Set<string>; surfaces: Set<string> }>();
  for (const [f, ids] of fileSurfaces)
    for (const p of apiPaths(f)) {
      if (!all.has(p)) all.set(p, { verdict: launchScopeApiVerdict(p, prefixMap, NEVER_GATED, launchIds), files: new Set(), surfaces: new Set() });
      const e = all.get(p)!;
      e.files.add(path.relative(L.root, f));
      ids.forEach((i) => e.surfaces.add(i));
    }
  const violations = [...all]
    .filter(([, e]) => e.verdict === 'out-of-scope')
    .map(([p, e]) => ({ path: p, surfaces: [...e.surfaces], files: [...e.files] }));
  return { violations, unresolved, all };
}

const REAL: Layout = {
  root: ROOT,
  client: path.join(ROOT, 'client/src'),
  shared: path.join(ROOT, 'shared'),
  surfaceViews: path.join(ROOT, 'client/src/concept2cure/v2/surfaceViews.ts'),
  shellRoots: [path.join(ROOT, 'client/src/main.tsx'), path.join(ROOT, 'client/src/concept2cure/v2/V2App.tsx')],
  deviceHost: {
    file: path.join(ROOT, 'client/src/concept2cure/mdx/MdxSurfaceHost.tsx'),
    components: { 'device-vault': 'VaultSurface', 'device-tasks': 'TasksSurface' },
  },
};

function selftest(): number {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-scope-api-'));
  const w = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };
  w('client/src/main.tsx', `import './shell';`);
  w('client/src/shell.ts', `export const tray = () => fetch('/api/audit/events');`);
  w('client/src/sv.ts', `const Launch = lazySurface(() => import('./launch'));\nexport const SURFACE_VIEWS = { 'launch-app': { component: Launch } };`);
  w('client/src/launch.tsx', `import { hook } from './hook';\nexport default hook;`);
  w('client/src/hook.ts', "export const hook = (id: string) => fetch(`/api/launch-api/${id}`).then(() => fetch('/api/hidden-api/items'));");
  const L: Layout = {
    root: dir,
    client: path.join(dir, 'client/src'),
    shared: path.join(dir, 'shared'),
    surfaceViews: path.join(dir, 'client/src/sv.ts'),
    shellRoots: [path.join(dir, 'client/src/main.tsx')],
  };
  const surfaces = [
    { id: 'launch-app', apiPrefixes: ['/api/launch-api'] },
    { id: 'hidden-app', apiPrefixes: ['/api/hidden-api'] },
  ];
  const launch = new Set(['launch-app']);
  let failed = 0;
  const expect = (name: string, ok: boolean) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failed++;
  };
  // A launch screen, two imports deep, calling a prefix only a hidden surface claims.
  const red = checkLaunchScopeApi(L, buildPrefixMap(surfaces), launch);
  expect('flags a launch screen calling a prefix only an out-of-scope surface claims', red.violations.length === 1 && red.violations[0].path === '/api/hidden-api/items');
  expect('names the surface and the file', red.violations[0]?.surfaces.includes('launch-app') && red.violations[0]?.files.some((f) => f.endsWith('hook.ts')));
  expect('does not flag the launch prefix, or a never-gated shell call', red.violations.every((v) => !v.path.startsWith('/api/launch-api') && !v.path.startsWith('/api/audit')));
  // The fix: the launch surface declares what it calls.
  const green = checkLaunchScopeApi(L, buildPrefixMap([{ id: 'launch-app', apiPrefixes: ['/api/launch-api', '/api/hidden-api'] }, surfaces[1]]), launch);
  expect('passes once the launch surface declares the prefix it calls', green.violations.length === 0);
  expect('resolves every registration it was given', red.unresolved.length === 0);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failed === 0 ? '\nselftest PASSED — the gate flags a launch screen that production would refuse.' : `\nselftest FAILED (${failed})`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const { violations, unresolved, all } = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  if (args.includes('--list')) {
    for (const [p, e] of [...all].sort()) console.log(`${e.verdict.padEnd(12)} ${p}  [${[...e.surfaces].join(', ')}]`);
  }
  if (unresolved.length) {
    // A launch surface the gate cannot find is a surface it cannot check.
    console.error(`ci:launch-scope-api: could not resolve the component of ${unresolved.length} launch surface(s): ${unresolved.join(', ')}`);
    return 1;
  }
  if (violations.length) {
    console.error(`ci:launch-scope-api: ${violations.length} API path(s) that launch or shell screens call would be REFUSED in production,`);
    console.error('because every surface claiming them is outside the launch scope. Declare each prefix on the launch');
    console.error('surface that calls it (shared/constants/ui-surface-registry*.ts apiPrefixes), or stop calling it.\n');
    for (const v of violations) console.error(`  ${v.path}\n    called by ${v.surfaces.join(', ')}\n    in ${v.files.slice(0, 4).join(', ')}`);
    return 1;
  }
  const counts: Record<string, number> = {};
  for (const [, e] of all) counts[e.verdict] = (counts[e.verdict] ?? 0) + 1;
  console.log(`ci:launch-scope-api: ${all.size} API paths named by launch and shell screens; none refused. ${JSON.stringify(counts)}`);
  return 0;
}

process.exit(main());
