#!/usr/bin/env node
/**
 * ci:step-presentation — every in-scope AnA tool reads on screen from its own
 * register entry, in words from closed tables (ANA-SUMMARY S3,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.3, §5 S3).
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * Before S3, 519 of the 608 in-scope tools had no label: their raw names
 * reached the screen humanised ("Validate ectd package"), in the present tense
 * whether running or finished, and two label tables (server and client)
 * disagreed. Now each tool's `present` block in
 * server/services/ana/tool-authorization.register.json names a verb and a
 * source from shared/ana/step-verbs.ts, and step-presentation.ts builds every
 * label from it. A tool with no entry reads "Ran a step"; this gate makes that
 * fallback unreachable for the tools a launch tenant can call.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 *   MISSING      an in-scope tool (ana-launch-scope.inventory.json `inScope`)
 *                with no register entry, or an entry with no `present` block.
 *   VERB         a verb that is not a key of STEP_VERBS.
 *   SOURCE       a source that is not a key of STEP_SOURCES.
 *   PREVIEW      a preview field that is not in STEP_PREVIEW_FIELDS.
 *   OBJECT       an empty object, one over 60 characters, or one that reads
 *                like a tool name (an underscore, or the tool's own name).
 *   REFUSAL      a tool whose handler is the refusal (refusedBy 'handler') with
 *                a verb other than explain or check: its "finished" row would
 *                otherwise read as the act AnA cannot take ("Approved …").
 *   ENGINE       `source: 'engine'` — the claim that the tool computes its
 *                result deterministically — on a tool that writes (class
 *                confirm, refuse or command), on a tool whose handler cannot be
 *                found, or on a tool whose handler can reach a model call: a
 *                gateway generation (server/services/ai-gateway/gateway.ts) or
 *                a file on the gateway-bypass baseline, through its own code,
 *                the same-file functions it calls, or any module it imports
 *                (statically or with import()). Module reach is taken at file
 *                level, so the claim is refused whenever a model is reachable
 *                at all; a deterministic tool that fails it keeps its launch
 *                source instead. At run time the engine glyph is shown only when
 *                the step's generation capture saw no model call, whatever the
 *                register says — this gate keeps the claim honest before that.
 *
 * Usage: node scripts/ci/check-step-presentation.mjs [--json] [--root <dir>]
 * Exit 1 on any finding. The self-test is check-step-presentation.selftest.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const PATHS = {
  verbs: 'shared/ana/step-verbs.ts',
  register: 'server/services/ana/tool-authorization.register.json',
  inventory: 'server/services/ana/ana-launch-scope.inventory.json',
  handlersDir: 'server/services/ana',
  gateway: 'server/services/ai-gateway/gateway.ts',
  bypassBaseline: 'scripts/ci/gateway-bypass-baseline.json',
};
const OBJECT_MAX = 60;
const WRITE_CLASSES = new Set(['confirm', 'refuse', 'command']);
const REFUSAL_VERBS = new Set(['explain', 'check']);
const REGISTER_CALLEES = new Set(['registerToolHandler', 'register']);

// ── The closed tables, read from the TypeScript source ───────────────────────

function parseTs(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unwrap(node) {
  let n = node;
  while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression?.(n))) n = n.expression;
  return n;
}

/** Keys of `export const NAME = { … } as const`, or elements of `[ … ] as const`. */
export function readClosedTables(verbsText, file = PATHS.verbs) {
  const sf = parseTs(file, verbsText);
  const tables = {};
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = unwrap(decl.initializer);
      if (ts.isObjectLiteralExpression(init)) {
        tables[decl.name.text] = init.properties
          .filter(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
          .map(p => p.name.text);
      } else if (ts.isArrayLiteralExpression(init)) {
        tables[decl.name.text] = init.elements.filter(ts.isStringLiteral).map(e => e.text);
      }
    }
  }
  for (const name of ['STEP_VERBS', 'STEP_SOURCES', 'STEP_PREVIEW_FIELDS']) {
    if (!tables[name] || tables[name].length === 0) throw new Error(`${file}: could not read ${name} — the gate cannot check against an empty table.`);
  }
  return { verbs: new Set(tables.STEP_VERBS), sources: new Set(tables.STEP_SOURCES), previews: new Set(tables.STEP_PREVIEW_FIELDS) };
}

// ── Model reach: import graph ────────────────────────────────────────────────

function makeResolver(root) {
  return function resolveSpec(fromFile, spec) {
    let target;
    if (spec.startsWith('@shared/')) target = path.join(root, 'shared', spec.slice('@shared/'.length));
    else if (spec.startsWith('.')) target = path.resolve(path.dirname(fromFile), spec);
    else return null; // a package: no model call of ours lives there (SDKs are caught by the baseline's files)
    const base = target.replace(/\.(m?js|cjs|ts|tsx)$/, '');
    for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}.js`, `${base}.mjs`]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  };
}

const IMPORT_RE =
  /(?:^|[\n;])\s*import\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\n;])\s*export\s+(type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g;

export function makeModelReach(root) {
  const resolveSpec = makeResolver(root);
  const sinks = new Set([path.join(root, PATHS.gateway)]);
  const baselinePath = path.join(root, PATHS.bypassBaseline);
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    for (const f of Object.keys(baseline.entries ?? {})) sinks.add(path.join(root, f));
  }
  const importsCache = new Map();
  function importsOf(file) {
    if (importsCache.has(file)) return importsCache.get(file);
    const out = new Set();
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      /* unreadable: no edges */
    }
    for (const m of text.matchAll(IMPORT_RE)) {
      if (m[1] || m[4]) continue; // type-only
      const spec = m[2] ?? m[3] ?? m[5];
      const resolved = spec ? resolveSpec(file, spec) : null;
      if (resolved) out.add(resolved);
    }
    importsCache.set(file, out);
    return out;
  }
  const reachMemo = new Map();
  /** The chain from `file` to a model sink, or null. Breadth-first, so the chain is short. */
  function fileReachesModel(file) {
    if (reachMemo.has(file)) return reachMemo.get(file);
    const prev = new Map([[file, null]]);
    const queue = [file];
    let found = null;
    while (queue.length > 0 && !found) {
      const f = queue.shift();
      if (sinks.has(f)) {
        found = f;
        break;
      }
      for (const d of importsOf(f)) {
        if (!prev.has(d)) {
          prev.set(d, f);
          queue.push(d);
        }
      }
    }
    let chain = null;
    if (found) {
      chain = [];
      for (let f = found; f; f = prev.get(f)) chain.unshift(path.relative(root, f));
    }
    reachMemo.set(file, chain);
    return chain;
  }
  return { resolveSpec, fileReachesModel };
}

// ── Model reach: handlers ────────────────────────────────────────────────────

function listTs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '__tests__' || ent.name === 'node_modules') continue;
      out.push(...listTs(p));
    } else if (/\.tsx?$/.test(ent.name) && !/\.(test|spec)\.tsx?$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

function fileIndex(file) {
  const sf = parseTs(file, fs.readFileSync(file, 'utf8'));
  const imports = new Map(); // local name -> specifier
  const topLevel = new Map(); // name -> declaration node
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause && !stmt.importClause.isTypeOnly) {
      const spec = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;
      if (clause.name) imports.set(clause.name.text, spec);
      const nb = clause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) imports.set(nb.name.text, spec);
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) imports.set(el.name.text, spec);
    } else if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      if (stmt.name) topLevel.set(stmt.name.text, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) topLevel.set(d.name.text, d);
    }
  }
  return { sf, imports, topLevel };
}

/** Every `register…('tool', handler)` and local wrapper `wrap('tool', …)` call, by tool name. */
function findHandlers(files, known) {
  const handlers = new Map(); // tool -> { file, node }
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/register\w*\(/.test(text)) continue;
    const idx = fileIndex(file);
    const wrappers = new Map();
    for (const [name, decl] of idx.topLevel) {
      if (ts.isFunctionDeclaration(decl) && decl.body && /registerToolHandler\(\s*\w+\s*,/.test(decl.body.getText(idx.sf))) {
        wrappers.set(name, decl);
      }
    }
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length >= 1) {
        const callee = node.expression.text;
        const first = node.arguments[0];
        if (ts.isStringLiteral(first) && known.has(first.text)) {
          if (REGISTER_CALLEES.has(callee) && node.arguments[1]) handlers.set(first.text, { file, idx, nodes: [node.arguments[1]] });
          else if (wrappers.has(callee)) handlers.set(first.text, { file, idx, nodes: [wrappers.get(callee), ...node.arguments.slice(1)] });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(idx.sf);
  }
  return handlers;
}

function makeHandlerReach(root, modelReach) {
  const declMemo = new Map();
  /** A chain from these nodes to a model, or null. */
  function nodesReachModel(file, idx, nodes, seen = new Set()) {
    let chain = null;
    const visit = node => {
      if (chain) return;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const target = modelReach.resolveSpec(file, arg.text);
          const c = target ? modelReach.fileReachesModel(target) : null;
          if (c) chain = [`import('${arg.text}')`, ...c];
        }
      } else if (ts.isIdentifier(node) && !(node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        const name = node.text;
        if (idx.imports.has(name)) {
          const target = modelReach.resolveSpec(file, idx.imports.get(name));
          const c = target ? modelReach.fileReachesModel(target) : null;
          if (c) chain = [`${name} from '${idx.imports.get(name)}'`, ...c];
        } else if (idx.topLevel.has(name) && !seen.has(name)) {
          const key = `${file}#${name}`;
          if (!declMemo.has(key)) {
            seen.add(name);
            declMemo.set(key, nodesReachModel(file, idx, [idx.topLevel.get(name)], seen));
          }
          const c = declMemo.get(key);
          if (c) chain = [`${name}()`, ...c];
        }
      }
      if (!chain) ts.forEachChild(node, visit);
    };
    for (const n of nodes) visit(n);
    return chain;
  }
  return nodesReachModel;
}

// ── The check ────────────────────────────────────────────────────────────────

/**
 * Run the gate over `root`. `overrides` (self-test only) replaces the parsed
 * register or inventory with an edited copy.
 */
export function checkStepPresentation(root = REPO_ROOT, overrides = {}) {
  const read = p => fs.readFileSync(path.join(root, p), 'utf8');
  const tables = readClosedTables(read(PATHS.verbs));
  const register = overrides.register ?? JSON.parse(read(PATHS.register)).tools;
  const inventory = overrides.inventory ?? JSON.parse(read(PATHS.inventory));
  const inScope = inventory.tools.inScope;
  const findings = [];
  const add = (code, tool, detail) => findings.push({ code, tool, detail });

  if (!Array.isArray(inScope) || inScope.length === 0) throw new Error('inventory has no inScope tools — refusing to pass an empty set.');

  for (const tool of inScope) {
    if (!register[tool]) add('MISSING', tool, 'in scope but not in the register');
    else if (!register[tool].present) add('MISSING', tool, 'no `present` block: its steps would read "Ran a step"');
  }

  const engineClaims = [];
  for (const [tool, entry] of Object.entries(register)) {
    const p = entry.present;
    if (!p) continue;
    if (!tables.verbs.has(p.verb)) add('VERB', tool, `verb "${p.verb}" is not in STEP_VERBS`);
    if (!tables.sources.has(p.source)) add('SOURCE', tool, `source "${p.source}" is not in STEP_SOURCES`);
    for (const f of p.preview ?? []) if (!tables.previews.has(f)) add('PREVIEW', tool, `preview field "${f}" is not in STEP_PREVIEW_FIELDS`);
    if (typeof p.object !== 'string' || !p.object.trim()) add('OBJECT', tool, 'empty object');
    else if (p.object.length > OBJECT_MAX) add('OBJECT', tool, `object is ${p.object.length} characters (max ${OBJECT_MAX})`);
    else if (p.object.includes('_') || p.object.toLowerCase().includes(tool.toLowerCase())) add('OBJECT', tool, `object "${p.object}" reads like a tool name`);
    if (entry.refusedBy === 'handler' && !REFUSAL_VERBS.has(p.verb)) {
      add('REFUSAL', tool, `the handler refuses, so its finished row must not read as the act: verb "${p.verb}", expected explain or check`);
    }
    if (p.source === 'engine') {
      if (WRITE_CLASSES.has(entry.class)) add('ENGINE', tool, `class "${entry.class}" writes; an engine claim is for a computation`);
      else engineClaims.push(tool);
    }
  }

  if (engineClaims.length > 0) {
    const modelReach = makeModelReach(root);
    const files = (overrides.handlerFiles ?? listTs(path.join(root, PATHS.handlersDir))).map(f => path.resolve(root, f));
    const handlers = findHandlers(files, new Set(engineClaims));
    const nodesReachModel = makeHandlerReach(root, modelReach);
    for (const tool of engineClaims) {
      const h = handlers.get(tool);
      if (!h) {
        add('ENGINE', tool, 'no handler found to verify the claim (register it with a literal name, or give the tool its launch source)');
        continue;
      }
      const chain = nodesReachModel(h.file, h.idx, h.nodes);
      if (chain) add('ENGINE', tool, `its handler can reach a model: ${path.relative(root, h.file)} → ${chain.join(' → ')}`);
    }
  }

  const present = Object.values(register).filter(e => e.present).length;
  return { findings, stats: { inScope: inScope.length, present, engineClaims: engineClaims.length } };
}

function main() {
  const asJson = process.argv.includes('--json');
  // --root <dir>: run over another tree (the self-test's fixtures); the repository otherwise.
  const rootAt = process.argv.indexOf('--root');
  const root = rootAt > 0 && process.argv[rootAt + 1] ? path.resolve(process.argv[rootAt + 1]) : REPO_ROOT;
  const { findings, stats } = checkStepPresentation(root);
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ findings, stats }, null, 2)}\n`);
  } else if (findings.length === 0) {
    console.log(
      `ci:step-presentation OK — ${stats.inScope} in-scope tools each have a present entry (${stats.present} entries in all); ` +
        `${stats.engineClaims} engine claims, none with a reachable model call.`,
    );
  } else {
    console.error(`ci:step-presentation FAILED — ${findings.length} finding(s):`);
    for (const f of findings) console.error(`  ${f.code.padEnd(8)} ${f.tool}: ${f.detail}`);
    console.error(
      '\nEach in-scope tool needs a `present` block in server/services/ana/tool-authorization.register.json with a verb\n' +
        'and a source from shared/ana/step-verbs.ts. See the header of scripts/ci/check-step-presentation.mjs.',
    );
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
