/**
 * The CMC routers retired on 2026-10-05 stay retired.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Sixteen files under server/api/cmc were mounted, authenticated and reachable,
 * and nothing in client/src or in server code called any of them. They carried
 * the patterns a launch surface must not: a model deciding a filing category
 * (change-impact-simulator), model output written to local disk and read back
 * by a caller-supplied id with no organization (blueprint-generator, change-
 * impact-simulator, manufacturing-tuner, preclinical-translator, global-
 * compliance, audit-risk-monitor), reads and writes of tables no applier
 * creates (portfolio: reg_rpi_snapshots, reg_m3_sections.up_stability), a
 * static GET /status manifest calling seven modules "available", and a third
 * CMC document store (cmc_documents) with a hard DELETE beside Vault and the
 * governed Module 3 sections. When CMC / Module 3 joins the launch catalog,
 * everything under /api/cmc is a launch surface, so they were deleted rather
 * than fixed: fixing an uncalled router is building it. server/services/
 * cmcEvents.js (reached only from POST /test-event) and three helpers reached
 * only through these routers went with them.
 *
 * Each one's replacement is named, by path, in server/bootstrap/
 * register-core-routes.ts where it used to be mounted, and in
 * docs/evidence/CMC-M3-GA/2026-10-05/15-retired-cmc-routers/README.md.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 *   1. none of the files exists — under either extension, so a rename to .ts
 *      does not bring one back;
 *   2. register-core-routes.ts imports none of them and mounts nothing on the
 *      prefixes only they answered (/api/cmc/blueprint, /workflows, /documents,
 *      /module3 — exactly; /module3-os and /module3-board are live);
 *   3. the authentication server/api/cmc/projectRoutes.ts performed for every
 *      /api/cmc mount below it is still performed. Its root
 *      `router.use(authenticateToken)` ran for EVERY /api/cmc request that
 *      reached it — specifications, batch records, module3-os — which matters
 *      wherever the /api boundary only warns (server/middleware/authBoundary.ts:
 *      development, staging, test). Deleting the router must not delete that;
 *   4. no client code calls a retired path — a client wired to one now gets a
 *      404, which is the failure this would otherwise find in production.
 *
 * STATIC on purpose, like cmc-route-uniqueness.contract.test.ts: it reads
 * source, so it names the file and line it objects to and cannot be satisfied
 * by an import that fails to load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const REGISTER = 'server/bootstrap/register-core-routes.ts';

/** Retired module stems (repo-relative, no extension). */
const RETIRED_STEMS = [
  'server/api/cmc/index',
  'server/api/cmc/blueprint-generator',
  'server/api/cmc/change-impact-simulator',
  'server/api/cmc/manufacturing-tuner',
  'server/api/cmc/preclinical-translator',
  'server/api/cmc/global-compliance',
  'server/api/cmc/audit-risk-monitor',
  'server/api/cmc/cmc-copilot',
  'server/api/cmc/types',
  'server/api/cmc/blueprintRoutes',
  'server/api/cmc/projectRoutes',
  'server/api/cmc/workflowRoutes',
  'server/api/cmc/documentRoutes',
  'server/api/cmc/module3AutoDraftRoutes',
  'server/api/cmc/portfolio',
  'server/api/cmc/playbookRoutes',
  'server/services/cmcEvents',
  // Reached only through the routers above, and deleted with them.
  'server/utils/api-security',
  'server/utils/document-generator',
  'server/services/cmc/auto-draft-composer',
];

/** Mount prefixes only the retired routers answered on (compared exactly). */
const RETIRED_PREFIXES = [
  '/api/cmc/blueprint',
  '/api/cmc/workflows',
  '/api/cmc/documents',
  '/api/cmc/module3',
];

/**
 * Client literals for retired endpoints. `/projects` is the retired CRUD root
 * only: GET /api/cmc/projects/:projectId/process-capability is served by
 * server/api/cmc/routes.ts and stays.
 */
const RETIRED_CLIENT_PATH =
  /\/api\/cmc\/(?:blueprint|change-impact-simulator|manufacturing-tuner|preclinical-translator|global-compliance|audit-risk-monitor|cmc-copilot|test-event|status\b|workflows|documents|module3\/|portfolio|playbook|projects['"`?])/;

const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length;

/** `from '<spec>'` specifiers resolved to repo-relative stems. */
function importedStems(rel: string): Array<{ stem: string; line: number }> {
  const src = read(rel);
  const dir = path.dirname(rel);
  const out: Array<{ stem: string; line: number }> = [];
  for (const m of src.matchAll(/(?:from\s+|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const stem = path.posix.join(dir, m[1]).replace(/\.(?:js|ts|mjs|cjs)$/, '');
    out.push({ stem, line: lineOf(src, m.index ?? 0) });
  }
  return out;
}

/** Every `app.use('<path>', a, b, …)` mount, with its handler identifiers. */
function mounts(src: string): Array<{ prefix: string; handlers: string[]; index: number; line: number }> {
  const out: Array<{ prefix: string; handlers: string[]; index: number; line: number }> = [];
  for (const m of src.matchAll(/app\.use\(\s*['"`]([^'"`]+)['"`]\s*,([^;]*)\);/g)) {
    const handlers = m[2]
      .split(',')
      .map((h) => h.trim().replace(/\(.*$/, ''))
      .filter(Boolean);
    out.push({ prefix: m[1], handlers, index: m.index ?? 0, line: lineOf(src, m.index ?? 0) });
  }
  return out;
}

function clientSources(): string[] {
  const root = path.join(repoRoot, 'client', 'src');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe('the retired CMC routers stay retired', () => {
  it('none of the retired files exists, under either extension', () => {
    const present = RETIRED_STEMS.flatMap((stem) =>
      ['.ts', '.js'].map((ext) => `${stem}${ext}`),
    ).filter((rel) => fs.existsSync(path.join(repoRoot, rel)));
    expect(present, `Retired CMC modules are back:\n  ${present.join('\n  ')}`).toEqual([]);
  });

  it('register-core-routes.ts imports none of them', () => {
    const hits = importedStems(REGISTER)
      .filter(({ stem }) => RETIRED_STEMS.includes(stem))
      .map(({ stem, line }) => `${REGISTER}:${line} imports ${stem}`);
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('register-core-routes.ts mounts nothing on a prefix only they answered', () => {
    const hits = mounts(read(REGISTER))
      .filter(({ prefix }) => RETIRED_PREFIXES.includes(prefix))
      .map(({ prefix, handlers, line }) => `${REGISTER}:${line} app.use('${prefix}', ${handlers.join(', ')})`);
    expect(hits, hits.join('\n')).toEqual([]);
  });

  it('every /api/cmc sub-mount is still behind the authentication projectRoutes.ts performed', () => {
    const all = mounts(read(REGISTER));
    const bareAuth = all.find(
      (m) => m.prefix === '/api/cmc' && m.handlers.includes('authenticateToken'),
    );
    expect(bareAuth, "no app.use('/api/cmc', authenticateToken) — the sub-mounts lost their authenticator").toBeDefined();
    const ungated = all
      .filter((m) => m.prefix.startsWith('/api/cmc/') && m.index < bareAuth!.index)
      .filter((m) => !m.handlers.includes('authenticateToken'))
      .map((m) => `${REGISTER}:${m.line} app.use('${m.prefix}', …) is mounted ABOVE the authenticator`);
    expect(ungated, ungated.join('\n')).toEqual([]);
  });

  it('no client code calls a retired path', () => {
    const files = clientSources();
    // A wrong root would make the assertion below pass over nothing.
    expect(files.length).toBeGreaterThan(200);
    const hits: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('/api/cmc/')) continue;
      src.split('\n').forEach((text, i) => {
        if (RETIRED_CLIENT_PATH.test(text)) hits.push(`${path.relative(repoRoot, file)}:${i + 1}: ${text.trim()}`);
      });
    }
    expect(hits, `Client calls to retired CMC endpoints:\n  ${hits.join('\n  ')}`).toEqual([]);
  });

  it('the Module 3 operating system writes no canonical source of its own', () => {
    // POST /source-objects and /source-changed (retired 2026-10-05): canonical
    // sources come from the registers through cmc-write-through.ts alone.
    const src = read('server/api/cmc/module3OperatingSystemRoutes.ts');
    const declared = [...src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
    expect(declared.length, 'no route declarations found — wrong file or parser').toBeGreaterThan(5);
    expect(declared.filter((d) => /\/source-(objects|changed)\//.test(d))).toEqual([]);
    expect(src).not.toMatch(/INSERT INTO cmc_source_objects/);
  });

  it('reads the mounts it claims to read', () => {
    // The live CMC family is still found, so the prefix assertions above are
    // looking at the right file and the right syntax.
    const prefixes = mounts(read(REGISTER)).map((m) => m.prefix);
    for (const live of ['/api/cmc', '/api/cmc/specifications', '/api/cmc/batch-records', '/api/cmc/module3-os', '/api/cmc/module3-board', '/api/cmc/agency-questions']) {
      expect(prefixes, `${live} is not mounted — wrong file or a broken parser`).toContain(live);
    }
  });
});
