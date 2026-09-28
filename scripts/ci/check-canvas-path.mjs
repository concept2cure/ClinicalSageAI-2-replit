#!/usr/bin/env node
/**
 * ci:canvas-path — the AnA-draft → canvas → editor → vault path is wired.
 *
 * Five document editors and canvases were built and deleted in this
 * repository between 2026-06 and 2026-08 (CLAUDE.md, "Deleting a user-facing
 * capability"; `git log --all --diff-filter=D -- 'client/**\/*Editor*'
 * 'client/**\/*Canvas*'`), each one a component nothing mounted, each removed
 * as unreachable by a session that did not know the one before. This gate
 * makes the path load-bearing: it fails the build the moment any link in it
 * is cut, whatever the commit message calls the cut.
 *
 * docs/design/ANA_DOCUMENT_CANVAS.md is the binding design. The six links:
 *
 *   thread-mounts-canvas      ConversationThread imports and renders
 *                             <DocumentCanvas>.
 *   canvas-mounts-workbench   DocumentCanvas imports and renders
 *                             <DocumentWorkbench> — the canvas expands INTO
 *                             the one editor; it does not carry a second one.
 *   surface-mounts-workbench  DocumentAuthoring imports and renders
 *                             <DocumentWorkbench> — the Authoring surface is
 *                             the same editor.
 *   tool-registered           An AnA tool named `draft_authoring_document` is
 *                             defined in server/services/ana and dispatched by
 *                             AnaToolExecutor — the way a draft becomes an
 *                             authoring document at all.
 *   workbench-reads-vault     The workbench (or a module it mounts) reads the
 *                             project-vault route the Vault surface reads.
 *   file-to-vault-route       authoring.router.ts registers
 *                             POST /docs/:docId/file-to-vault, and the
 *                             workbench's graph calls it.
 *   founder-walk              The founder-path walk test
 *                             (tests/lineage/founder-path-lineage.pglite.test.ts,
 *                             LX-00) exists, is not skipped, still starts at the
 *                             project hop and reaches the transmit hop, and its
 *                             shrink-only baseline is within its ceiling. The
 *                             six links above prove the path is WIRED; the walk
 *                             proves what it RECORDS, hop by recorded key, from
 *                             the project to the agency. Added 2026-09-25: the
 *                             walk found every section save failing while all
 *                             six links read green.
 *
 * Static and fast: string checks over a handful of files, no TypeScript
 * evaluation. Exit 1 on any finding, `--json` for machine output.
 * CANVAS_PATH_ROOT points the gate at another tree with the same relative
 * layout (the selftest builds one per broken link).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CANVAS_PATH_ROOT
  ? path.resolve(process.env.CANVAS_PATH_ROOT)
  : path.resolve(HERE, '..', '..');
const JSON_MODE = process.argv.includes('--json');

const WALK_DIR = 'tests/lineage';
const WALK_TEST = `${WALK_DIR}/founder-path-lineage.pglite.test.ts`;
const WALK_BASELINE = `${WALK_DIR}/founder-path-lineage.baseline.json`;
/** The walk's first and last hop: every chain starts at a project and ends at the agency. */
const WALK_ENDS = ['project', 'transmit'];

export const FILES = {
  thread: 'client/src/concept2cure/v2/surfaces/ConversationThread.tsx',
  canvas: 'client/src/concept2cure/v2/editor/DocumentCanvas.tsx',
  workbench: 'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
  surface: 'client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx',
  executor: 'server/services/ana/AnaToolExecutor.ts',
  toolDefsDir: 'server/services/ana',
  authoringRouter: 'server/routes/authoring.router.ts',
};

const TOOL = 'draft_authoring_document';
const VAULT_ROUTE = '/api/c2c/project-vault/';
const FILE_TO_VAULT = 'file-to-vault';

const read = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

/** Does `src` import `symbol` from a module whose path ends with `moduleTail`
 *  AND render it as JSX? Comments are stripped first so a commented-out mount
 *  cannot satisfy the gate. */
function mounts(src, symbol, moduleTail) {
  const code = stripComments(src);
  const importRe = new RegExp(
    `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*['"][^'"]*${moduleTail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
  );
  const jsxRe = new RegExp(`<${symbol}\\b`);
  return importRe.test(code) && jsxRe.test(code);
}

function stripComments(src) {
  return src.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
}

/** The workbench plus every sibling module it imports with `./` — one level,
 *  which is where its rails live. */
function workbenchGraph() {
  const wb = read(FILES.workbench);
  if (wb == null) return null;
  const dir = path.dirname(FILES.workbench);
  const sources = [wb];
  for (const m of stripComments(wb).matchAll(/from\s*['"]\.\/([\w-]+)['"]/g)) {
    for (const ext of ['.tsx', '.ts']) {
      const s = read(path.join(dir, m[1] + ext));
      if (s != null) {
        sources.push(s);
        break;
      }
    }
  }
  return sources.map(stripComments).join('\n');
}

export function check() {
  const findings = [];
  const add = (rule, detail) => findings.push({ rule, detail });

  const thread = read(FILES.thread);
  if (thread == null) add('thread-mounts-canvas', `${FILES.thread} is missing`);
  else if (!mounts(thread, 'DocumentCanvas', 'editor/DocumentCanvas')) {
    add('thread-mounts-canvas', `${FILES.thread} does not import and render <DocumentCanvas> from ../editor/DocumentCanvas`);
  }

  const canvas = read(FILES.canvas);
  if (canvas == null) add('canvas-mounts-workbench', `${FILES.canvas} is missing`);
  else if (!mounts(canvas, 'DocumentWorkbench', './DocumentWorkbench')) {
    add('canvas-mounts-workbench', `${FILES.canvas} does not import and render <DocumentWorkbench> from ./DocumentWorkbench`);
  }

  const surface = read(FILES.surface);
  if (surface == null) add('surface-mounts-workbench', `${FILES.surface} is missing`);
  else if (!mounts(surface, 'DocumentWorkbench', 'editor/DocumentWorkbench')) {
    add('surface-mounts-workbench', `${FILES.surface} does not import and render <DocumentWorkbench> from ../editor/DocumentWorkbench`);
  }

  // tool-registered: a tool definition carrying the name, and the executor dispatching it.
  const defsDir = path.join(ROOT, FILES.toolDefsDir);
  let defined = false;
  if (fs.existsSync(defsDir)) {
    for (const f of fs.readdirSync(defsDir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const s = read(path.join(FILES.toolDefsDir, f));
      if (s && new RegExp(`name:\\s*['"]${TOOL}['"]`).test(stripComments(s))) {
        defined = true;
        break;
      }
    }
  }
  if (!defined) add('tool-registered', `no tool definition under ${FILES.toolDefsDir} carries name: '${TOOL}'`);
  const executor = read(FILES.executor);
  if (executor == null) add('tool-registered', `${FILES.executor} is missing`);
  else if (!new RegExp(`['"]${TOOL}['"]`).test(stripComments(executor))) {
    add('tool-registered', `${FILES.executor} does not dispatch '${TOOL}'`);
  }

  const graph = workbenchGraph();
  if (graph == null) add('workbench-reads-vault', `${FILES.workbench} is missing`);
  else if (!graph.includes(VAULT_ROUTE)) {
    add('workbench-reads-vault', `${FILES.workbench} (and the ./ modules it imports) never reads ${VAULT_ROUTE}`);
  }

  const router = read(FILES.authoringRouter);
  if (router == null) add('file-to-vault-route', `${FILES.authoringRouter} is missing`);
  else if (!/router\.post\(\s*['"]\/docs\/:(docId|id)\/file-to-vault['"]/.test(stripComments(router))) {
    add('file-to-vault-route', `${FILES.authoringRouter} does not register POST /docs/:docId/file-to-vault`);
  }
  if (graph != null && !graph.includes(FILE_TO_VAULT)) {
    add('file-to-vault-route', `${FILES.workbench} (and the ./ modules it imports) never calls the ${FILE_TO_VAULT} route`);
  }

  checkFounderWalk(add);

  return { ok: findings.length === 0, root: ROOT, findings };
}

/** founder-walk: the recorded-lineage walk is present, running, whole, and its baseline only shrinks. */
function checkFounderWalk(add) {
  const walk = read(WALK_TEST);
  if (walk == null || !/\bdescribe(\.\w+)?\s*\(/.test(stripComments(walk))) {
    add('founder-walk', `${WALK_TEST} is missing or declares no suite`);
    return;
  }
  if (/\.(skip|only|todo|skipIf|runIf)\s*\(/.test(stripComments(walk))) {
    add('founder-walk', `${WALK_TEST} skips, narrows or defers its tests (.skip / .only / .todo / .skipIf / .runIf)`);
  }
  const dir = path.join(ROOT, WALK_DIR);
  const sources = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => stripComments(read(path.join(WALK_DIR, f)) ?? ''))
    : [];
  for (const hop of WALK_ENDS) {
    if (!sources.some((src) => new RegExp(`new Hop\\(\\s*['"]${hop}['"]`).test(src))) {
      add('founder-walk', `no file under ${WALK_DIR} constructs the '${hop}' hop — the walk no longer runs from the project to the agency`);
    }
  }
  const raw = read(WALK_BASELINE);
  let baseline = null;
  try {
    baseline = raw == null ? null : JSON.parse(raw);
  } catch {
    /* reported below */
  }
  if (!baseline || typeof baseline.ceiling !== 'number' || typeof baseline.hops !== 'object') {
    add('founder-walk', `${WALK_BASELINE} is missing or unreadable`);
    return;
  }
  const entries = Object.values(baseline.hops).reduce((n, checks) => n + Object.keys(checks ?? {}).length, 0);
  if (entries > baseline.ceiling) {
    add('founder-walk', `${WALK_BASELINE} holds ${entries} entries over its ceiling of ${baseline.ceiling}; the baseline only shrinks`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const summary = check();
  if (JSON_MODE) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (summary.ok) {
    console.log('✅ ci:canvas-path — thread → canvas → workbench, surface → workbench, tool registered, vault read, file-to-vault route: all wired; the founder-path walk runs project → agency within its baseline');
  } else {
    console.error('❌ ci:canvas-path — the AnA-draft → canvas → editor → vault path is cut:');
    for (const f of summary.findings) console.error(`   [${f.rule}] ${f.detail}`);
    console.error('   docs/design/ANA_DOCUMENT_CANVAS.md is the binding design; CLAUDE.md "Deleting a user-facing capability" applies.');
  }
  process.exit(summary.ok ? 0 : 1);
}
