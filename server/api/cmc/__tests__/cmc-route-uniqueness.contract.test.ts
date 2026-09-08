/**
 * One handler per CMC endpoint.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Four routers are mounted on `/api/cmc` in server/bootstrap/register-core-routes.ts,
 * in a fixed order. Express matches the FIRST one that declares a path, so a
 * second declaration of the same method+path anywhere below it is dead code —
 * and dead code that looks alive is worse than none: it is edited, reviewed and
 * trusted while never running.
 *
 * It has already bitten twice in this surface:
 *   - `GET /drug-products` and `GET /drug-substances` were declared in
 *     projectRoutes.ts as well as routes.ts. The shadowed pair resolved the
 *     caller's projects through `cmc_projects`, a table the product never
 *     populates, so had a mount ever been reordered every organization would
 *     have been told it has no drug substances — a failed read rendered as an
 *     empty result. They are deleted; this keeps them deleted.
 *
 * The check is deliberately STATIC (it reads the source rather than importing
 * the routers) so it cannot be defeated by an import cycle or a module that
 * wants a database at load time, and so it names the file and line a
 * duplicate lives on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The routers that declare endpoints DIRECTLY on /api/cmc, in the order
 * register-core-routes.ts mounts them. The third mount, server/api/cmc/index.js,
 * is an aggregator: it only `router.use()`s sub-routers under distinct prefixes
 * (/blueprint-generator, /manufacturing-tuner, …), so it declares no bare path
 * that could collide with these two and is deliberately not listed.
 */
const MOUNTED_IN_ORDER = [
  'server/api/cmc/routes.ts',
  'server/api/cmc/projectRoutes.ts',
];

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

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
    // A path typo would make both assertions above pass over nothing.
    for (const file of MOUNTED_IN_ORDER) {
      expect(declarationsIn(file).length, `${file} declares no routes — wrong path?`).toBeGreaterThan(5);
    }
  });
});
