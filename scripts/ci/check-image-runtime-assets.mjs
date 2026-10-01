#!/usr/bin/env node
/**
 * Does the production image contain the repository files the server reads at
 * run time?
 *
 * ── The defect this exists for (U7, 2026-09-24, launch row D1) ───────────────
 * server/services/ind-forms/template-locations.ts resolves the vendored
 * official FDA IND forms (1571, 1572, 3454, 356h, 3674 and their manifests)
 * under <package root>/templates/forms/acroforms — /app in the image. The
 * production stage of Dockerfile.optimized never copied templates/, so in
 * production every IND form rendered as a reconstruction or a labeled draft,
 * and the genuine FDA-secured 1571/3674 was refused as LEAF-ENCRYPTED when the
 * sequence was packaged. No error anywhere: readTemplate() returns null from
 * its catch and the renderer downgrades. The same defect had already happened
 * once for assets/estar-templates (see the comment above `COPY … /app/assets`).
 *
 * Nothing caught it because every test, every CI job and every local run reads
 * the files from a repository checkout, where they are always present. The one
 * place they can be missing is the image, and nothing compared the image's
 * COPY set with the paths the server resolves.
 *
 * ── What this checks ─────────────────────────────────────────────────────────
 *   1. WHICH CODE SHIPS. esbuild bundles server/index.ts with the production
 *      build options (scripts/build-server.mjs) and reports every source file
 *      that contributes bytes to dist/index.js. Only those files are scanned: a
 *      module the bundle does not contain cannot read anything in production.
 *
 *   2. WHAT THAT CODE READS FROM THE APP ROOT. Each shipped module is scanned
 *      (comments stripped) for a path built from string literals on one of the
 *      anchors the image resolves under /app:
 *        path.join/resolve(process.cwd(), '…')     cwd = WORKDIR /app
 *        path.join/resolve(PACKAGE_ROOT, '…')      nearest package.json = /app
 *        path.resolve('…')                         implicitly cwd-relative
 *        fs.readFileSync('…') and friends          implicitly cwd-relative
 *        path.join/resolve(__dirname | import.meta.dirname, '…')
 *            — in the image every module IS dist/index.js, so this anchor is
 *              <WORKDIR>/dist, not the source directory it names in dev.
 *      A `const NAME = '…'` in the same file is resolved when used as a segment.
 *      The literal prefix is what is checked (path.join(cwd, 'data', id) is
 *      recorded as `data`).
 *
 *   3. EVERY DISCOVERED PATH IS CLASSIFIED, in RUNTIME_PATHS below:
 *        ship        — the image must contain it: some COPY in the production
 *                      stage covers it, it exists (tracked) in the repository,
 *                      and .dockerignore does not keep it out of the context.
 *        not-shipped — the image correctly lacks it (the process creates it, it
 *                      is dev-only, or it is optional and absence is handled
 *                      honestly). The reason is written.
 *        known-gap   — the image lacks it and should not; a written decision
 *                      with its owner. Printed on every run, never silent.
 *      A discovered path with no classification FAILS: new code that reads the
 *      repository at run time must say whether the image ships what it reads.
 *      A classification that no shipped module produces any more FAILS as
 *      stale, and a known-gap the image now covers FAILS until it is removed.
 *
 * The Dockerfile is parsed, not pattern-matched: continuation lines joined,
 * stages split on FROM, WORKDIR tracked, and each COPY's destination mapped
 * back to its source — `--from=builder /app/<p>` is context path <p>, because
 * the builder stage is `COPY . .` into /app. dist/ is the builder's own output.
 *
 * Usage:
 *   node scripts/ci/check-image-runtime-assets.mjs
 *   --list                  print the full inventory with each path's status
 *   --root <dir>            repository root (the self-test uses a fixture)
 *   --dockerfile <file>     default <root>/Dockerfile.optimized
 *   --stage <name>          default production (the pipeline's --target)
 *   --classification <json> replace RUNTIME_PATHS (the self-test uses this)
 *
 * Exit 0 only when every run-time path is shipped or classified with a reason.
 * Self-test: scripts/ci/check-image-runtime-assets.selftest.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, stop as stopEsbuild } from 'esbuild';
import { stripComments } from './lib/strip-comments.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAG = '[image-runtime-assets]';

/**
 * Every repository path a shipped module resolves at run time, keyed by the
 * path relative to the app root (longest prefix wins), with its decision.
 */
export const RUNTIME_PATHS = {
  // ── ship: read from the image, so a production-stage COPY must cover them ──
  'templates/forms/acroforms': {
    kind: 'ship',
    reason:
      'The vendored official FDA IND forms 1571/1572/3454/356h/3674 and their manifests ' +
      '(ind-forms/template-locations.ts). Absent, every IND form downgrades to a reconstruction ' +
      'and the genuine 1571/3674 is refused as LEAF-ENCRYPTED at packaging — defect U7.',
  },
  'assets/estar-templates': {
    kind: 'ship',
    reason: 'Official FDA eSTAR PDFs, checksum-pinned (pathway-engines/estar/estar-template-registry.ts).',
  },
  'assets/ectd-dtd': { kind: 'ship', reason: 'eCTD DTDs (ectd/dtd-bundler.ts).' },
  'assets/ectd-schema': { kind: 'ship', reason: 'eCTD schemas (ectd/schema-bundler.ts).' },
  'assets/fda-recognized-standards': {
    kind: 'ship',
    reason: "FDA's recognized consensus standards list (fda-recognized-standards/recognized-standards-dataset.ts).",
  },
  'server/services/ai-gateway/prompts': {
    kind: 'ship',
    reason: 'The AI-gateway prompt library (ai-gateway/prompts-dir.ts); shipped by COPY server.',
  },
  'server/export/stylePacks': {
    kind: 'ship',
    reason: 'Print style packs for 510(k)/PMA/CER PDF renders (export/stylePacks/config.ts); shipped by COPY server.',
  },
  'server/templates/m3': {
    kind: 'ship',
    reason: 'Module 3 authoring templates (routes/authoring.router.ts templatesDir()); shipped by COPY server.',
  },
  'server/scripts/docx_pdf_pipeline.py': {
    kind: 'ship',
    reason:
      'Spawned with python3 by docx-pdf-pipeline.ts; the script ships with server/. Whether the ' +
      'image can RUN it is not a file question: see workers/artifact-compute for the Python decision.',
  },
  migrations: {
    kind: 'ship',
    reason: 'Drizzle migration folder read by db/runtime.ts, and the deploy-time migrate task.',
  },
  'dist/public': {
    kind: 'ship',
    reason: 'The built client, served by serveStatic() in server/vite.ts; builder output, copied with dist/.',
  },

  'workers/artifact-compute': {
    kind: 'ship',
    reason:
      'Python DOCX runtimes for AnA document tools (compute/workerClient.ts, compute/scriptWorker.ts). ' +
      'A known gap until 2eda0ed0f shipped them with python-docx; this gate then failed on the stale entry.',
  },
  'SECURITY.md': {
    kind: 'ship',
    reason:
      'The vulnerability-disclosure policy served at /.well-known/security-policy (routes/well-known.ts). ' +
      '.dockerignore excluded every root *.md but README.md, so production served only the short ' +
      'fallback text instead of the full policy. Re-included 2026-10-01.',
  },

  // ── known-gap: the image lacks it and should not — a decision, printed every run ──
  'ingestion/pdf_extractor.py': {
    kind: 'known-gap',
    reason:
      'unifiedDocumentIngestion.js falls back to spawning this with .venv/bin/python3 when the ' +
      'FastAPI extractor is unreachable. Same Python decision as workers/artifact-compute.',
  },
  '.venv/bin/python3': {
    kind: 'known-gap',
    reason: 'The interpreter for ingestion/pdf_extractor.py (PYTHON_PATH default). Same Python decision.',
  },
  'docs/validation': {
    kind: 'known-gap',
    reason:
      'GAMP 5 validation kit (routes/validation-kit.ts, AdminSurfaces). docs/ is excluded by ' +
      '.dockerignore and no COPY names it, so production lists an empty catalog for documents that ' +
      'exist. Fix needs a .dockerignore re-include plus a COPY; owner: launch lead (D1).',
  },
  'data/global-regulatory-authorities.json': {
    kind: 'known-gap',
    reason:
      'regulatory-pathway-intelligence.ts reads path.join(__dirname, "..", "data") — server/data in ' +
      'source, /app/data in the bundle, where nothing is. The public-API pathway engine loads an ' +
      'empty knowledge base without error. Fix is in code: anchor on process.cwd() + server/data, ' +
      'as prompts-dir.ts does; then reclassify as ship.',
  },
  'data/ich-guidelines-comprehensive.json': { kind: 'known-gap', reason: 'Same bundle-relative __dirname read as above.' },
  'data/regulatory-document-requirements-matrix.json': {
    kind: 'known-gap',
    reason: 'Same bundle-relative __dirname read as above.',
  },
  'dist/rules/manufacturingRules.yaml': {
    kind: 'known-gap',
    reason:
      'src/services/ai/manufacturingReviewer.js reads path.join(__dirname, "rules", …): the file is ' +
      'server/src/services/ai/rules/manufacturingRules.yaml, the bundle looks in dist/rules, and ' +
      'RULES stays [] with no error. CMC manufacturing review is outside the launch catalog; fix ' +
      'is in code (cwd anchor), not a COPY.',
  },

  // ── not-shipped: the image correctly lacks it ──────────────────────────────
  uploads: { kind: 'not-shipped', reason: 'Upload scratch, created on first write by the process.' },
  tmp: { kind: 'not-shipped', reason: 'Scratch output (docbuilder, ana-scripts, submissions, control plane), created on write.' },
  storage: {
    kind: 'not-shipped',
    reason: 'Local vault and compute output; /app/storage/vault is created by the Dockerfile and mounted as a volume.',
  },
  generated_documents: { kind: 'not-shipped', reason: 'Generated DOCX output, created on write.' },
  logs: { kind: 'not-shipped', reason: 'Process log directory, created on write.' },
  output: { kind: 'not-shipped', reason: 'CMC tool output, created on write.' },
  exports: { kind: 'not-shipped', reason: 'Planner/analytics export output, created on write.' },
  temp: { kind: 'not-shipped', reason: 'analytics-routes scratch, created on write.' },
  temp_documents: { kind: 'not-shipped', reason: 'Document-ingestion scratch, created on write.' },
  vault: { kind: 'not-shipped', reason: 'unifiedDocumentIngestion STORAGE_PATHS: mkdir -p at module load.' },
  attached_assets: { kind: 'not-shipped', reason: 'unifiedDocumentIngestion STORAGE_PATHS: mkdir -p at module load; not in the repository.' },
  processed_documents: { kind: 'not-shipped', reason: 'unifiedDocumentIngestion STORAGE_PATHS: mkdir -p at module load.' },
  'qualification-reports': { kind: 'not-shipped', reason: 'eCTD qualification report output, created on write.' },
  'test-results/beta-telemetry': { kind: 'not-shipped', reason: 'Beta telemetry sink, created on write.' },
  'server/.cache': { kind: 'not-shipped', reason: 'conversation-os kernel snapshot, written by the process.' },
  data: {
    kind: 'not-shipped',
    reason:
      'An allow-list root for pdf-compression-service input paths, not a read. The reads beneath it ' +
      'are classified path by path.',
  },
  'data/cer_reports': { kind: 'not-shipped', reason: 'Per-tenant CER report output, written by cer-routes before it is read.' },
  'data/cache': { kind: 'not-shipped', reason: 'cache_manager.js cache, created on write.' },
  'data/exports': { kind: 'not-shipped', reason: 'pdf-task-routes export output, created on write.' },
  'data/sap': { kind: 'not-shipped', reason: 'sap-generator-service output; mkdir -p at module load.' },
  'data/guidelines': {
    kind: 'not-shipped',
    reason: 'indCopilot.js optional fallback text; not in the repository, and a miss returns its generic message.',
  },
  'data/processed_csrs': {
    kind: 'not-shipped',
    reason: 'csr-search-service corpus; not in the repository, so not an image gap. CSR search is outside the launch catalog.',
  },
  '../data/user_preferences': {
    kind: 'not-shipped',
    reason:
      'notification_routes.ts per-user preference files, resolved from __dirname: /data/user_preferences in ' +
      'the image, outside /app. Runtime state, not a vendored asset; a missing file returns defaults.',
  },
  csrs: {
    kind: 'not-shipped',
    reason:
      'An allow-list root for caller-supplied paths (utils/document-file-roots.ts), not a read. The checked-in ' +
      'public CSR synopses are a reference corpus outside the launch catalog; a path under it is not found.',
  },
  ectd: { kind: 'not-shipped', reason: 'An allow-list root for caller-supplied paths; not in the repository.' },
  regulatory_data: {
    kind: 'not-shipped',
    reason:
      'endpoint-recommender-service loads only {indication, guidance[]} objects from here; both tracked files ' +
      'are arrays and are skipped even from a checkout, and a missing directory is logged and skipped.',
  },
  trialsage: {
    kind: 'not-shipped',
    reason:
      'Python scripts named by analytics-routes.ts and deep-csr-analyzer.ts that do not exist in the ' +
      'repository at all — not an image gap. Outside the launch catalog.',
  },
  'vite.config.ts': { kind: 'not-shipped', reason: 'setupVite() only — the dev server, never reached with NODE_ENV=production.' },
  'client/index.html': { kind: 'not-shipped', reason: 'setupVite() only — the dev server; production serves dist/public.' },
  'assets/tessdata': {
    kind: 'not-shipped',
    reason: 'One of three optional tessdata candidates probed with existsSync (ocr/tesseractOcrService.ts); none vendored.',
  },
  'server/assets/tessdata': { kind: 'not-shipped', reason: 'Optional tessdata candidate, as above.' },
  'dist/server/assets/tessdata': { kind: 'not-shipped', reason: 'Optional tessdata candidate, as above.' },
};

/**
 * What `npm run build` writes under dist/ in the builder stage — the only
 * content a `COPY --from=builder /app/dist` can carry: vite's outDir
 * (vite.config.ts build.outDir) and scripts/build-server.mjs's outfile.
 */
const BUILD_OUTPUTS = ['dist/public', 'dist/index.js'];

// ── Arguments ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argValue = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const repoRoot = path.resolve(argValue('--root') ?? path.resolve(HERE, '..', '..'));
const dockerfilePath = path.resolve(repoRoot, argValue('--dockerfile') ?? 'Dockerfile.optimized');
const stageName = argValue('--stage') ?? 'production';
const LIST = args.includes('--list');
const classificationFile = argValue('--classification');
const CLASSIFICATION = classificationFile
  ? JSON.parse(fs.readFileSync(path.resolve(classificationFile), 'utf8'))
  : RUNTIME_PATHS;

function die(lines) {
  console.error([`${TAG} FAIL`, ...lines].join('\n'));
  process.exit(1);
}

const posix = (p) => p.split(path.sep).join('/');

// ── 1. Dockerfile: the production stage's WORKDIR and COPY map ─────────────
/** Instructions of the file, continuation lines joined, comments dropped. */
function dockerInstructions(text) {
  const out = [];
  let cur = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!cur && /^\s*#/.test(line)) continue;
    if (cur && /^\s*#/.test(line)) continue; // comment inside a continuation
    if (/\\\s*$/.test(line)) {
      cur += `${line.replace(/\\\s*$/, '')} `;
      continue;
    }
    cur += line;
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map((s) => {
    const m = s.match(/^(\S+)\s*(.*)$/);
    return { op: m[1].toUpperCase(), rest: m[2] };
  });
}

function parseStage(text, name) {
  const stages = [];
  for (const ins of dockerInstructions(text)) {
    if (ins.op === 'FROM') {
      const m = ins.rest.match(/^(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
      stages.push({ base: m[1], name: m[2] ?? null, instructions: [] });
      continue;
    }
    if (stages.length) stages[stages.length - 1].instructions.push(ins);
  }
  const stage = stages.find((s) => s.name === name);
  if (!stage) die([`${posix(path.relative(repoRoot, dockerfilePath))} has no stage named "${name}".`]);
  return { stage, stages };
}

/** Context files matching a simple glob segment in one directory. */
function expandGlob(rel) {
  if (!/[*?[]/.test(rel)) return [rel];
  const dir = path.posix.dirname(rel);
  const re = new RegExp(`^${path.posix.basename(rel).replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => re.test(f)).map((f) => (dir === '.' ? f : `${dir}/${f}`));
}

/**
 * The production stage as a list of { image, source, from, line } mappings:
 * image path (relative to WORKDIR) ← context path. `source` is null when the
 * COPY's origin cannot be mapped to the build context (another image).
 */
function copyMap({ stage, stages }) {
  let workdir = '/';
  const mappings = [];
  for (const ins of stage.instructions) {
    if (ins.op === 'WORKDIR') {
      workdir = path.posix.resolve(workdir, ins.rest.trim());
      continue;
    }
    if (ins.op !== 'COPY' && ins.op !== 'ADD') continue;
    const tokens = ins.rest.trim().startsWith('[') ? JSON.parse(ins.rest) : ins.rest.trim().split(/\s+/);
    const flags = tokens.filter((t) => t.startsWith('--'));
    const operands = tokens.filter((t) => !t.startsWith('--'));
    const from = flags.find((f) => f.startsWith('--from='))?.slice('--from='.length) ?? null;
    const dest = operands.pop();
    const destAbs = path.posix.resolve(workdir, dest);
    const destIsDir = dest.endsWith('/') || dest === '.' || operands.length > 1;
    for (const src of operands) {
      let contextRel = null;
      let built = false;
      if (from === null) {
        contextRel = path.posix.normalize(src).replace(/^\.\//, '').replace(/\/$/, '') || '.';
      } else if (stages.some((s) => s.name === from)) {
        // Stages built FROM builder inherit its /app, which is `COPY . .`.
        const origin = stages.find((s) => s.name === from);
        const rootsAtContext = from === 'builder' || origin.base === 'builder';
        const m = src.match(/^\/app(?:\/(.*))?$/);
        if (rootsAtContext && m) {
          contextRel = (m[1] ?? '.').replace(/\/$/, '') || '.';
          built = contextRel === 'dist' || contextRel.startsWith('dist/');
        }
      }
      const expanded = contextRel && !built ? expandGlob(contextRel) : [contextRel];
      for (const one of expanded) {
        const isFile = one && !built && fs.existsSync(path.join(repoRoot, one)) && fs.statSync(path.join(repoRoot, one)).isFile();
        const imageAbs = destIsDir && isFile ? path.posix.join(destAbs, path.posix.basename(one)) : destAbs;
        mappings.push({ imageAbs, source: one, built, from, text: `${ins.op} ${ins.rest}` });
      }
    }
  }
  return { workdir, mappings };
}

// ── .dockerignore, with Docker's semantics ─────────────────────────────────
// Patterns match the whole context-relative path (no basename matching as in
// .gitignore: `*.md` excludes README.md at the root, not docs/x.md); a path is
// excluded when it or any parent matches; `**` spans directories; `!`
// re-includes; the last matching pattern wins.
function dockerignore() {
  const file = path.join(repoRoot, '.dockerignore');
  if (!fs.existsSync(file)) return () => false;
  const rules = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const negate = l.startsWith('!');
      const pat = path.posix.normalize((negate ? l.slice(1) : l).replace(/^\/+/, ''));
      let re = '';
      for (let i = 0; i < pat.length; i++) {
        const c = pat[i];
        if (c === '*' && pat[i + 1] === '*') {
          re += '.*';
          i += 1;
          if (pat[i + 1] === '/') i += 1;
        } else if (c === '*') re += '[^/]*';
        else if (c === '?') re += '[^/]';
        else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      }
      return { negate, re: new RegExp(`^${re}$`), pat: l };
    });
  return (rel) => {
    const parts = rel.split('/');
    const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    let hit = null;
    for (const r of rules) if (prefixes.some((p) => r.re.test(p))) hit = r.negate ? null : r.pat;
    return hit;
  };
}

/** Whether the context path is present in the repository as tracked content. */
function trackedChecker() {
  let tracked = null;
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
    if (fs.existsSync(path.join(repoRoot, '.git'))) tracked = out.split('\0').filter(Boolean);
  } catch {
    tracked = null; // not a git checkout (the self-test fixture): the filesystem is the context
  }
  return (rel) => {
    if (!fs.existsSync(path.join(repoRoot, rel))) return false;
    if (!tracked) return true;
    return tracked.some((f) => f === rel || f.startsWith(`${rel}/`));
  };
}

// ── 2. Which modules ship, and what they resolve under the app root ────────
async function shippedModules() {
  const { SERVER_BUILD_OPTIONS } = await import(path.join(HERE, '..', 'build-server.mjs'));
  const entry = path.join(repoRoot, 'server', 'index.ts');
  if (!fs.existsSync(entry)) die([`${posix(path.relative(process.cwd(), entry))} does not exist.`]);
  let result;
  try {
    result = await build({
      ...SERVER_BUILD_OPTIONS,
      logLevel: 'silent',
      entryPoints: [entry],
      outfile: path.join(repoRoot, 'dist', 'index.js'),
      absWorkingDir: repoRoot,
      write: false,
      metafile: true,
      // The production build's define: it removes the dev-only branches.
      define: { 'process.env.NODE_ENV': '"production"' },
    });
  } catch (err) {
    die([`esbuild could not bundle ${posix(path.relative(repoRoot, entry))} the way production does:`, `  ${err.message}`]);
  } finally {
    // The esbuild service shares this process's stderr; left running it holds
    // a pipe open (`… 2>&1 | grep`) after the verdict is printed.
    stopEsbuild();
  }
  const out = Object.values(result.metafile.outputs).find((o) => o.inputs);
  return Object.entries(out.inputs)
    .filter(([file, v]) => v.bytesInOutput > 0 && !file.includes('node_modules/'))
    .map(([file]) => posix(path.relative(repoRoot, path.resolve(repoRoot, file))))
    .filter((f) => /\.(c|m)?(t|j)sx?$/.test(f));
}

const STRING = /^(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/;
const CWD = /^process\.cwd\(\)/;
const MODULE_DIR = /^(?:__dirname|import\.meta\.dirname)\b/;
const PKG_ROOT = /^PACKAGE_ROOT\b/;
const IDENT = /^(?:this\.)?[A-Za-z_$][\w$]*/;

/** Parse `a, b, c)` from index i: each arg as {lit} | {ident} | {anchor} | {other}. */
function readArgs(src, i) {
  const argsOut = [];
  for (;;) {
    while (/\s/.test(src[i] ?? '')) i++;
    const rest = src.slice(i, i + 400);
    let m;
    if ((m = rest.match(STRING)) && !(m[1] === '`' && m[2].includes('${'))) {
      argsOut.push({ lit: m[2] });
      i += m[0].length;
    } else if ((m = rest.match(CWD))) {
      argsOut.push({ anchor: 'cwd' });
      i += m[0].length;
    } else if ((m = rest.match(MODULE_DIR))) {
      argsOut.push({ anchor: 'module' });
      i += m[0].length;
    } else if ((m = rest.match(PKG_ROOT))) {
      argsOut.push({ anchor: 'cwd' });
      i += m[0].length;
    } else if ((m = rest.match(IDENT)) && /^\s*[,)]/.test(rest.slice(m[0].length))) {
      argsOut.push({ ident: m[0] });
      i += m[0].length;
    } else {
      argsOut.push({ other: true });
      break;
    }
    while (/\s/.test(src[i] ?? '')) i++;
    if (src[i] === ',') {
      i++;
      continue;
    }
    break;
  }
  return argsOut;
}

/** Every app-root path a module builds from literals, as { path, anchor, line }. */
export function discoverPaths(source) {
  const src = stripComments(source);
  const consts = new Map();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(['"])([^'"\n]*)\2\s*;/g)) {
    consts.set(m[1], m[3]);
  }
  const found = [];
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const push = (anchor, segs, idx) => {
    if (!segs.length) return; // anchor alone, or a dynamic first segment: nothing literal to check
    const base = anchor === 'module' ? 'dist' : '.';
    const rel = path.posix.normalize(path.posix.join(base, ...segs)).replace(/\/$/, '');
    if (path.posix.isAbsolute(segs[0])) return; // an absolute literal is not under the app root
    if (rel === '.' || rel === '') return;
    found.push({ path: rel, anchor, line: lineOf(idx) });
  };

  // path.join / path.resolve / bare join()/resolve() with an anchor first. A
  // result assigned to a name (`const dataDir = path.join(__dirname, '..',
  // 'data')`) becomes an anchor itself, so `path.join(dataDir, 'x.json')` is
  // recorded as the file it reads. Two passes resolve a chain in either order.
  const calls = [...src.matchAll(/(?:\b[A-Za-z_$][\w$]*\.)?\b(join|resolve)\s*\(/g)].map((m) => ({
    m,
    qualified: /\bpath\w*\.$|\bposix\.$/.test(src.slice(Math.max(0, m.index - 12), m.index + m[0].length - m[1].length - 1)),
    args: readArgs(src, m.index + m[0].length),
    assignedTo: (src.slice(Math.max(0, m.index - 120), m.index).match(
      /(?:^|[^=!<>])\b((?:this\.)?[A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(?:[\w$.]+\s*(?:\|\||\?\?)\s*)?$/,
    ) ?? [])[1],
  }));
  // name -> [{ at, anchor, segs }]. A name is often reused (`outDir` in each
  // of several handlers), so a use binds to the nearest assignment above it.
  const anchoredVars = new Map();
  const boundAt = (name, at) => {
    const list = anchoredVars.get(name);
    if (!list) return null;
    const before = list.filter((b) => b.at < at);
    return before.length ? before[before.length - 1] : list[0];
  };
  const resolveCall = ({ m, qualified, args: a }) => {
    if (!a.length) return null;
    let anchor = a[0].anchor ?? null;
    let prefix = [];
    let startAt = 1;
    const bound = a[0].ident && boundAt(a[0].ident, m.index);
    if (!anchor && bound) {
      ({ anchor } = bound);
      prefix = bound.segs;
    }
    // path.resolve('x') is cwd-relative; bare resolve('x') is as likely a Promise.
    if (!anchor && m[1] === 'resolve' && qualified && (a[0].lit !== undefined || consts.has(a[0].ident))) {
      anchor = 'cwd';
      startAt = 0;
    }
    if (!anchor) return null;
    const segs = [...prefix];
    for (const arg of a.slice(startAt)) {
      if (arg.lit !== undefined) segs.push(arg.lit);
      else if (arg.ident && consts.has(arg.ident)) segs.push(consts.get(arg.ident));
      else break;
    }
    if (anchor === 'cwd' && startAt === 0 && path.posix.isAbsolute(segs[0] ?? '/')) return null;
    return { anchor, segs };
  };
  for (let pass = 0; pass < 2; pass++) {
    for (const c of calls) {
      const r = c.assignedTo && resolveCall(c);
      if (!r || !r.segs.length) continue;
      const list = (anchoredVars.get(c.assignedTo) ?? []).filter((b) => b.at !== c.m.index);
      list.push({ at: c.m.index, ...r });
      anchoredVars.set(c.assignedTo, list.sort((x, y) => x.at - y.at));
    }
  }
  for (const c of calls) {
    const r = resolveCall(c);
    if (r) push(r.anchor, r.segs, c.m.index);
  }
  // fs reads of a bare relative literal
  for (const m of src.matchAll(/\b(readFileSync|readFile|readdirSync|readdir|existsSync|createReadStream|statSync|accessSync)\s*\(\s*(['"])([^'"\n]+)\2/g)) {
    const lit = m[3];
    if (path.posix.isAbsolute(lit) || /^[a-z]+:/i.test(lit)) continue;
    push('cwd', [lit], m.index);
  }
  return found;
}

// ── 3. Classify, then check the image covers what it must ─────────────────
function classify(rel) {
  let best = null;
  for (const key of Object.keys(CLASSIFICATION)) {
    if ((rel === key || rel.startsWith(`${key}/`)) && (!best || key.length > best.length)) best = key;
  }
  return best;
}

async function main() {
  if (!fs.existsSync(dockerfilePath)) die([`${dockerfilePath} does not exist.`]);
  const parsed = parseStage(fs.readFileSync(dockerfilePath, 'utf8'), stageName);
  const { workdir, mappings } = copyMap(parsed);
  const ignored = dockerignore();
  const isTracked = trackedChecker();

  const modules = await shippedModules();
  /** path -> [{file, line, anchor}] */
  const discovered = new Map();
  for (const file of modules) {
    for (const hit of discoverPaths(fs.readFileSync(path.join(repoRoot, file), 'utf8'))) {
      const list = discovered.get(hit.path) ?? [];
      list.push({ file, line: hit.line, anchor: hit.anchor });
      discovered.set(hit.path, list);
    }
  }

  /** Where in the image the path lands, and what (if anything) puts it there. */
  const cover = (rel) => {
    const imageAbs = path.posix.join(workdir, rel);
    let best = null;
    for (const mp of mappings) {
      if (imageAbs === mp.imageAbs || imageAbs.startsWith(`${mp.imageAbs}/`)) {
        if (!best || mp.imageAbs.length > best.imageAbs.length) best = mp;
      }
    }
    if (!best) return { covered: false, why: `no COPY in stage "${stageName}" puts anything at ${imageAbs}` };
    if (best.source === null) return { covered: false, why: `${imageAbs} comes from ${best.text}, which is not the build context` };
    const rest = imageAbs === best.imageAbs ? '' : imageAbs.slice(best.imageAbs.length + 1);
    const contextRel = best.source === '.' ? rest : rest ? `${best.source}/${rest}` : best.source;
    if (best.built) {
      const made = BUILD_OUTPUTS.some((o) => contextRel === o || contextRel.startsWith(`${o}/`));
      return made
        ? { covered: true, by: best.text }
        : { covered: false, why: `${best.text} covers it, but \`npm run build\` produces only ${BUILD_OUTPUTS.join(' and ')} under dist/, not ${contextRel}` };
    }
    const ign = ignored(contextRel);
    if (ign) return { covered: false, why: `${best.text} covers it, but .dockerignore "${ign}" removes ${contextRel} from the build context` };
    if (!isTracked(contextRel)) return { covered: false, why: `${best.text} covers it, but ${contextRel} is not tracked in the repository, so a clean checkout's build has nothing to copy` };
    return { covered: true, by: best.text };
  };

  const failures = [];
  const inventory = [];
  const gaps = [];
  const used = new Set();
  for (const [rel, sites] of [...discovered].sort(([a], [b]) => a.localeCompare(b))) {
    const where = sites.map((s) => `${s.file}:${s.line}`).join(', ');
    const key = classify(rel);
    if (!key) {
      failures.push(
        `  ${rel} — read at run time by ${where}, and not classified. Add it to RUNTIME_PATHS: ` +
          '"ship" if the image must contain it (and COPY it in the production stage), "not-shipped" ' +
          'with the reason the image correctly lacks it, or "known-gap" with the decision and its owner.',
      );
      inventory.push({ rel, status: 'UNCLASSIFIED', where });
      continue;
    }
    used.add(key);
    const entry = CLASSIFICATION[key];
    if (entry.kind === 'ship') {
      const c = cover(rel);
      if (!c.covered) failures.push(`  ${rel} — read at run time by ${where}; the image must ship it, and ${c.why}.`);
      inventory.push({ rel, status: c.covered ? `ship: covered by ${c.by}` : `ship: MISSING (${c.why})`, where });
    } else if (entry.kind === 'known-gap') {
      const c = cover(rel);
      if (c.covered) failures.push(`  ${rel} — classified known-gap, but the image now covers it (${c.by}). Reclassify it as "ship".`);
      gaps.push(`  ${rel} — ${where}: ${entry.reason}`);
      inventory.push({ rel, status: `known-gap: ${entry.reason}`, where });
    } else if (entry.kind === 'not-shipped') {
      inventory.push({ rel, status: `not-shipped: ${entry.reason}`, where });
    } else {
      failures.push(`  RUNTIME_PATHS["${key}"] has kind "${entry.kind}"; use ship, not-shipped or known-gap.`);
    }
    if (!entry.reason || !String(entry.reason).trim()) failures.push(`  RUNTIME_PATHS["${key}"] has no written reason.`);
  }
  for (const key of Object.keys(CLASSIFICATION)) {
    if (!used.has(key)) {
      failures.push(`  RUNTIME_PATHS lists ${key}, which no module in the production bundle resolves any more. Remove the entry.`);
    }
  }

  if (LIST) {
    console.log(`${TAG} inventory — ${modules.length} shipped modules, ${discovered.size} app-root paths, WORKDIR ${workdir}:`);
    for (const row of inventory) console.log(`  ${row.rel}\n      ${row.status}\n      read by ${row.where}`);
  }
  const rel = posix(path.relative(repoRoot, dockerfilePath));
  if (failures.length) {
    die([`${rel} stage "${stageName}" does not contain what the server reads at run time:`, ...failures,
      ...(gaps.length ? ['Known gaps (written decisions, not failures):', ...gaps] : [])]);
  }
  const shipped = inventory.filter((r) => r.status.startsWith('ship')).length;
  console.log(
    `${TAG} ok — ${rel} stage "${stageName}": ${discovered.size} app-root paths read by ${modules.length} shipped modules; ` +
      `${shipped} shipped and covered, ${discovered.size - shipped - gaps.length} correctly not shipped, ${gaps.length} known gap(s) by written decision:`,
  );
  for (const g of gaps) console.log(g);
}

await main();
