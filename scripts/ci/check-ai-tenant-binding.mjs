#!/usr/bin/env node
/**
 * check-ai-tenant-binding.mjs — AI dispatch stays bound to its tenant.
 *
 * Launch row D6. The gateway applies a tenant's placement policy (vendor and
 * substrate allow-lists, residency, zero retention) to every dispatch — but
 * only for the tenant it is told about. Until 2026-09-25 AnA's own chat turns
 * (server/routes/ana-ri/stream.ts) never passed `organizationId`, so a tenant
 * restricted to its own models could be served by a shared frontier API. The
 * gateway now falls back to the ambient tenant scope; this gate keeps the
 * explicit binding from regressing where it matters most.
 *
 * Rule 1 — every gateway `.route(` call under server/routes/ana-ri/ and
 * server/services/ana/ binds the tenant:
 *   - an object-literal argument names `organizationId`;
 *   - an identifier argument is declared in the same file from an object
 *     literal that names `organizationId`;
 *   - otherwise (a forwarded request, a spread) the call carries a
 *     `// tenant-binding: <reason>` comment on one of the three lines above it,
 *     saying where the binding comes from. A reason is required; a bare marker
 *     is refused.
 *
 * Rule 2 — `payloadProvenance: 'public'` lets a payload reach a shared frontier
 * API when a tenant opted in, so it may be declared only by a caller module
 * whose inputs are provably public-source (see GatewayRequest.payloadProvenance).
 * Such modules are listed in PUBLIC_SOURCE_CALLERS below, each with its reason.
 * A model never declares it.
 *
 * Comments are stripped before calls are matched, so documentation that names
 * a call is not a call.
 *
 * Usage:
 *   node scripts/ci/check-ai-tenant-binding.mjs
 *   node scripts/ci/check-ai-tenant-binding.mjs --self-test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/** Rule 1 scope: the AnA surfaces. */
const BINDING_DIRS = ['server/routes/ana-ri', 'server/services/ana'];
/** Rule 2 scope: all server code. */
const PROVENANCE_DIRS = ['server'];

/**
 * Modules allowed to declare `payloadProvenance: 'public'`, each with the
 * reason its inputs are provably public-source. Empty until the public-source
 * research lane (plan WS14) lands its first caller.
 */
export const PUBLIC_SOURCE_CALLERS = {};

const ROUTE_CALL = /\b(?:gw|gateway|aiGateway|getGateway\(\))\s*\.\s*route\s*\(/g;
const PUBLIC_PROVENANCE = /\bpayloadProvenance\s*:\s*(['"`])public\1/g;
const ANNOTATION = /\/\/\s*tenant-binding:\s*(\S.{9,})/;

function isTestFile(rel) {
  const p = rel.split(path.sep).join('/');
  return /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
}

/** Remove comments, preserving offsets and line numbers. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

/** Index just past the bracket that closes the one at `open`, skipping strings. */
function matchClose(code, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [pairs[code[open]]];
  for (let i = open + 1; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i += 1; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i += 1;
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return i + 1;
    }
  }
  return code.length;
}

function lineOf(code, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (code[i] === '\n') n += 1;
  return n;
}

/** Does the object literal declared for `name` before `before` name organizationId? */
function identifierBinds(code, name, before) {
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*\\{`, 'g');
  let last = null;
  let m;
  while ((m = decl.exec(code)) && m.index < before) last = m;
  if (!last) return false;
  const open = last.index + last[0].length - 1;
  return /\borganizationId\b/.test(code.slice(open, matchClose(code, open)));
}

function annotated(originalLines, line) {
  for (let l = Math.max(1, line - 3); l < line; l++) {
    if (ANNOTATION.test(originalLines[l - 1] ?? '')) return true;
  }
  return false;
}

/** Rule 1 findings for one file's source. */
export function unboundCalls(source, rel) {
  const code = codeOnly(source);
  const original = source.split('\n');
  const out = [];
  ROUTE_CALL.lastIndex = 0;
  let m;
  while ((m = ROUTE_CALL.exec(code))) {
    const open = m.index + m[0].length - 1;
    const arg = code.slice(open + 1, matchClose(code, open) - 1).trim();
    const line = lineOf(code, m.index);
    let bound;
    if (arg.startsWith('{')) {
      bound = /\borganizationId\b/.test(arg);
    } else {
      const id = /^([A-Za-z_$][\w$]*)\s*(?:as\b[\s\S]*)?$/.exec(arg);
      bound = id ? identifierBinds(code, id[1], m.index) : false;
    }
    if (!bound && !annotated(original, line)) out.push(`${rel}:${line}`);
  }
  return out;
}

/** Rule 2 findings for one file's source. */
export function publicDeclarations(source, rel, allowlist = PUBLIC_SOURCE_CALLERS) {
  const p = rel.split(path.sep).join('/');
  if (allowlist[p]) return [];
  const code = codeOnly(source);
  const out = [];
  PUBLIC_PROVENANCE.lastIndex = 0;
  let m;
  while ((m = PUBLIC_PROVENANCE.exec(code))) out.push(`${rel}:${lineOf(code, m.index)}`);
  return out;
}

function walk(root, dirs, visit) {
  const go = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) go(full);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/.test(e.name)) continue;
      const rel = path.relative(root, full);
      if (isTestFile(rel)) continue;
      visit(fs.readFileSync(full, 'utf8'), rel);
    }
  };
  for (const d of dirs) go(path.join(root, d));
}

export function findViolations(root, allowlist = PUBLIC_SOURCE_CALLERS) {
  const unbound = [];
  const publicOutsideAllowlist = [];
  walk(root, BINDING_DIRS, (src, rel) => unbound.push(...unboundCalls(src, rel)));
  walk(root, PROVENANCE_DIRS, (src, rel) => {
    const p = rel.split(path.sep).join('/');
    // The definition and its documentation, and this gate's own fixtures.
    if (p === 'server/services/ai-gateway/types.ts' || p === 'server/services/ai-gateway/gateway.ts') return;
    publicOutsideAllowlist.push(...publicDeclarations(src, rel, allowlist));
  });
  return { unbound, publicOutsideAllowlist };
}

function checkRepo() {
  const { unbound, publicOutsideAllowlist } = findViolations(REPO_ROOT);
  let status = 0;
  if (unbound.length) {
    status = 1;
    console.error(`✗ ai-tenant-binding: ${unbound.length} AnA gateway call(s) not bound to a tenant\n`);
    for (const c of unbound) console.error(`  ${c}`);
    console.error(
      '\nPass organizationId, or — when the call forwards a request its caller bound —\n' +
        'add `// tenant-binding: <where the binding comes from>` on the line above.\n' +
        "Without it the tenant's placement policy is applied only through the ambient scope.",
    );
  }
  if (publicOutsideAllowlist.length) {
    status = 1;
    console.error(
      `\n✗ ai-tenant-binding: payloadProvenance 'public' declared outside the allowlist (${publicOutsideAllowlist.length})\n`,
    );
    for (const c of publicOutsideAllowlist) console.error(`  ${c}`);
    console.error(
      "\nA 'public' payload may reach a shared frontier API that the tenant's floor excludes.\n" +
        'Only a module whose inputs are provably public-source may declare it: add it to\n' +
        'PUBLIC_SOURCE_CALLERS in this file with the reason.',
    );
  }
  if (status === 0) {
    console.log(
      "✓ ai-tenant-binding: every AnA gateway call binds its tenant; payloadProvenance 'public' only in allowlisted modules",
    );
  }
  return status;
}

function selfTest() {
  const bindingCases = [
    ['control — literal names organizationId', 'await gw.route({ taskType: "chat", organizationId: orgId, messages });\n', 0],
    ['control — identifier declared with organizationId', 'const req: GatewayRequest = {\n  taskType: "chat",\n  organizationId: o,\n};\nawait gateway.route(req);\n', 0],
    ['control — forwarded request with a reasoned annotation', '// tenant-binding: forwards the caller request, which send-message binds\nawait gateway.route({ ...request, signal });\n', 0],
    ['control — a comment names the call', '// see gw.route({ taskType }) in stream.ts\nconst a = 1;\n', 0],
    ['literal without organizationId (the stream.ts defect)', 'const r = await gw.route({\n  taskType: "chat",\n  messages,\n  tools,\n});\n', 1],
    ['identifier declared without organizationId', 'const req = { taskType: "chat", messages };\nawait gateway.route(req);\n', 1],
    ['forwarded spread without an annotation', 'await gateway.route({ ...request, signal });\n', 1],
    ['a bare annotation with no reason', '// tenant-binding:\nawait gateway.route({ ...request, signal });\n', 1],
    ['getGateway() receiver without organizationId', 'await getGateway().route({ taskType: "chat", messages });\n', 1],
  ];
  const provenanceCases = [
    ['control — allowlisted module declares public', 'server/services/research/fetch.ts', { 'server/services/research/fetch.ts': 'fetcher output only' }, 0],
    ['control — a comment names public', 'server/services/ana/x.ts', {}, 0, "// payloadProvenance: 'public' is for fetchers\nconst a = 1;\n"],
    ['a non-allowlisted module declares public', 'server/services/ana/drafting.ts', {}, 1],
  ];

  let failures = 0;
  const report = (name, ok, expect) => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : expect ? '  — NOT CAUGHT' : '  — false positive'}`);
  };
  for (const [name, src, expect] of bindingCases) {
    const found = unboundCalls(src, 'server/routes/ana-ri/fixture.ts').length > 0 ? 1 : 0;
    report(name, found === expect, expect);
  }
  for (const [name, rel, allow, expect, src] of provenanceCases) {
    const body = src ?? "await gw.route({ organizationId: o, payloadProvenance: 'public', messages });\n";
    const found = publicDeclarations(body, rel, allow).length > 0 ? 1 : 0;
    report(name, found === expect, expect);
  }

  // End to end on a constructed tree: the gate's own walk finds both kinds.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tenant-binding-'));
  const put = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  put('server/routes/ana-ri/stream.ts', 'const r = await gw.route({ taskType: "chat", messages });\n');
  put('server/services/other/x.ts', "await gw.route({ organizationId: o, payloadProvenance: 'public' });\n");
  put('server/routes/ana-ri/__tests__/s.test.ts', 'await gw.route({ taskType: "chat" });\n');
  const tree = findViolations(root, {});
  report('end to end — the walk finds the unbound call and the public declaration, skips tests',
    tree.unbound.length === 1 && tree.publicOutsideAllowlist.length === 1, 1);
  fs.rmSync(root, { recursive: true, force: true });

  const total = bindingCases.length + provenanceCases.length + 1;
  if (failures) {
    console.error(`\n✗ self-test: ${failures} of ${total} case(s) wrong`);
    return 1;
  }
  console.log(`\n✓ self-test: ${total} cases, every violation caught and the controls clean`);
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : checkRepo());
}
