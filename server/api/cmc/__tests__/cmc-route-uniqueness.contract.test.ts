/**
 * One handler per CMC endpoint.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Routers are mounted on the bare `/api/cmc` prefix in
 * server/bootstrap/register-core-routes.ts, in a fixed order. Express matches
 * the FIRST one that declares a path, so a second declaration of the same
 * method+path anywhere below it is dead code — and dead code that looks alive is
 * worse than none: it is edited, reviewed and trusted while never running.
 *
 * It has already bitten twice in this surface:
 *   - `GET /drug-products` and `GET /drug-substances` were declared in
 *     projectRoutes.ts as well as routes.ts. The shadowed pair resolved the
 *     caller's projects through `cmc_projects`, a table the product never
 *     populates, so had a mount ever been reordered every organization would
 *     have been told it has no drug substances — a failed read rendered as an
 *     empty result. They are deleted; this keeps them deleted.
 *
 * projectRoutes.ts itself, and the aggregator server/api/cmc/index.js, were
 * retired on 2026-10-05 (cmc-retired-routers.contract.test.ts), which left
 * routes.ts the only router on the bare prefix. So the list below is READ from
 * register-core-routes.ts rather than written here: a router mounted on
 * `/api/cmc` later is checked against routes.ts without anyone remembering to
 * add it, and a hand list naming one file could never find a collision.
 *
 * The check is deliberately STATIC (it reads the source rather than importing
 * the routers) so it cannot be defeated by an import cycle or a module that
 * wants a database at load time, and so it names the file and line a
 * duplicate lives on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const REGISTER = 'server/bootstrap/register-core-routes.ts';

/**
 * The routers that declare endpoints DIRECTLY on /api/cmc, in the order
 * register-core-routes.ts mounts them: every default-imported
 * `../api/cmc/<file>` that appears in an `app.use('/api/cmc', …)`. Middleware on
 * that prefix (the write-role gate, the authenticator) is a named or external
 * import and declares no routes, so it is not a router here.
 */
function bareCmcRouters(): string[] {
  const src = fs.readFileSync(path.join(repoRoot, REGISTER), 'utf8');
  const fileOf = new Map<string, string>();
  for (const m of src.matchAll(/^import\s+(\w+)\s+from\s+['"]\.\.\/api\/cmc\/([^'"]+)['"];/gm)) {
    const stem = `server/api/cmc/${m[2].replace(/\.(?:js|ts)$/, '')}`;
    const file = [`${stem}.ts`, `${stem}.js`].find((f) => fs.existsSync(path.join(repoRoot, f)));
    if (file) fileOf.set(m[1], file);
  }
  const out: string[] = [];
  for (const m of src.matchAll(/app\.use\(\s*['"`]\/api\/cmc['"`]\s*,([^;]*)\);/g)) {
    for (const id of m[1].split(',').map((h) => h.trim())) {
      const file = fileOf.get(id);
      if (file && !out.includes(file)) out.push(file);
    }
  }
  return out;
}

const MOUNTED_IN_ORDER = bareCmcRouters();

/** Every `router.<method>('<path>'` declaration in a file, with its line. */
function declarationsIn(relPath: string): Array<{ method: string; route: string; line: number }> {
  const full = path.join(repoRoot, relPath);
  if (!fs.existsSync(full)) return [];
  const out: Array<{ method: string; route: string; line: number }> = [];
  fs.readFileSync(full, 'utf8').split('\n').forEach((text, i) => {
    const m = text.match(/^\s*router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/);
    if (m) out.push({ method: m[1].toUpperCase(), route: m[2], line: i + 1 });
  });
  return out;
}

describe('the CMC routers declare each endpoint once', () => {
  it('has no method+path declared by two routers mounted on /api/cmc', () => {
    const seen = new Map<string, { file: string; line: number }>();
    const collisions: string[] = [];
    for (const file of MOUNTED_IN_ORDER) {
      for (const { method, route, line } of declarationsIn(file)) {
        const key = `${method} ${route}`;
        const first = seen.get(key);
        if (first) {
          collisions.push(
            `${key} — served by ${first.file}:${first.line}, SHADOWED at ${file}:${line}`,
          );
          continue;
        }
        seen.set(key, { file, line });
      }
    }
    expect(collisions, `Dead CMC route declarations:\n  ${collisions.join('\n  ')}`).toEqual([]);
  });

  it('declares each endpoint once WITHIN a router too', () => {
    for (const file of MOUNTED_IN_ORDER) {
      const seen = new Map<string, number>();
      const dupes: string[] = [];
      for (const { method, route, line } of declarationsIn(file)) {
        const key = `${method} ${route}`;
        if (seen.has(key)) dupes.push(`${key} — ${file}:${seen.get(key)} then :${line}`);
        else seen.set(key, line);
      }
      expect(dupes, `Duplicate declarations inside ${file}:\n  ${dupes.join('\n  ')}`).toEqual([]);
    }
  });

  it('reads the routers it claims to read', () => {
    // A parse that finds nothing would make both assertions above pass over
    // nothing. routes.ts is the core router; it must be found, and first.
    expect(MOUNTED_IN_ORDER[0]).toBe('server/api/cmc/routes.ts');
    for (const file of MOUNTED_IN_ORDER) {
      expect(declarationsIn(file).length, `${file} declares no routes — wrong path?`).toBeGreaterThan(5);
    }
  });
});
