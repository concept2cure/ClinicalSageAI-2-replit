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
 * It reads the TypeScript syntax tree, not text. The first version matched
 * with regular expressions, and an adversarial review (2026-09-26) showed it
 * blind to `gw?.route`, `gw!.route`, an aliased `getGateway()`, the `chat` /
 * `complete` / `structuredOutput` helpers, an `organizationId` nested under
 * another key, a declaration in a different function, and every spelling of
 * `payloadProvenance = 'public'` but one. Each of those shapes is now a
 * must-catch case in the self-test.
 *
 * Rule 1 — every gateway dispatch under server/routes/ana-ri/,
 * server/services/ana/ and server/services/ana-ri/ binds the tenant. A dispatch is a call to `route`,
 * `chat`, `complete` or `structuredOutput` on a gateway receiver: `gw`,
 * `gateway`, `aiGateway`, `this.gateway`, `getGateway()`, `ensureGateway()`,
 * or a local bound to one of them, with or without `?.` / `!`. Its request
 * (the first argument of `route`, the last of a helper) binds the tenant when:
 *   - it is an object literal with `organizationId` as a top-level key, or
 *     spreads a local that does;
 *   - it is a local declared, in the call's own enclosing scopes and before
 *     it, from such an object literal;
 *   - otherwise the call carries a `// tenant-binding: <reason>` comment on
 *     one of the three lines above it saying where the binding comes from
 *     (a forwarded request, a parameter). A reason is required.
 *
 * Rule 2 — `payloadProvenance: 'public'` lets a payload skip the tenant's
 * floor when the tenant opted in, and leave the tenant's lane for hosted code
 * execution, so only a caller module whose inputs are provably public-source
 * may set it (PUBLIC_SOURCE_CALLERS below, each with its reason). Across all
 * server code, every write of `payloadProvenance` — an object key (quoted or
 * not), a shorthand, an assignment, an element assignment — is a violation
 * unless its value is a string literal other than 'public', or forwards an
 * existing `…payloadProvenance` (optionally `??` a non-public literal).
 *
 * Usage:
 *   node scripts/ci/check-ai-tenant-binding.mjs
 *   node scripts/ci/check-ai-tenant-binding.mjs --self-test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/**
 * Rule 1 scope: the AnA surfaces. server/services/ana-ri joined on 2026-09-26:
 * the review found three dispatches there bound only through the ambient scope.
 */
const BINDING_DIRS = ['server/routes/ana-ri', 'server/services/ana', 'server/services/ana-ri'];
/** Rule 2 scope: all server code. */
const PROVENANCE_DIRS = ['server'];

/**
 * Modules allowed to set `payloadProvenance: 'public'`, each with the reason
 * its inputs are provably public-source. Empty until the public-source
 * research lane (plan WS14) lands its first caller.
 */
export const PUBLIC_SOURCE_CALLERS = {};

const DISPATCH_METHODS = new Set(['route', 'chat', 'complete', 'structuredOutput']);
const GATEWAY_NAMES = new Set(['gw', 'gateway', 'aiGateway']);
const GATEWAY_FACTORIES = new Set(['getGateway', 'ensureGateway']);
const ANNOTATION = /\/\/\s*tenant-binding:\s*(\S.{9,})/;

function isTestFile(rel) {
  const p = rel.split(path.sep).join('/');
  return /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
}

function parse(source, rel) {
  const kind = rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, kind);
}

/** Strip parentheses, `!`, `as` and `satisfies`. */
function unwrap(node) {
  let n = node;
  for (;;) {
    if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n)) n = n.expression;
    else if (ts.isSatisfiesExpression?.(n)) n = n.expression;
    else if (ts.isTypeAssertionExpression(n)) n = n.expression;
    else return n;
  }
}

function propName(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const e = unwrap(name.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  }
  return undefined;
}

/** The nearest declaration of `name` visible at `at`, searched outward through enclosing scopes. */
function findDeclaration(name, at) {
  const pos = at.getStart();
  for (let scope = at.parent; scope; scope = scope.parent) {
    let found;
    const visit = (n) => {
      if (found) return;
      if (n !== scope && (ts.isFunctionLike(n) || ts.isClassLike(n))) {
        // A declaration inside a nested function is not visible here — but
        // the function's own name/params belong to the scope that holds it.
        return;
      }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.getStart() < pos) {
        found = n;
        return;
      }
      ts.forEachChild(n, visit);
    };
    if (ts.isFunctionLike(scope)) {
      for (const p of scope.parameters ?? []) {
        if (ts.isIdentifier(p.name) && p.name.text === name) return p;
      }
      if (scope.body) ts.forEachChild(scope.body, visit);
      if (found) return found;
      continue;
    }
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope)) {
      for (const stmt of scope.statements) {
        if (stmt.getStart() >= pos) break;
        if (ts.isVariableStatement(stmt)) visit(stmt);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** Is this expression a gateway instance? */
function isGatewayReceiver(expr, seen = new Set()) {
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) {
    if (GATEWAY_NAMES.has(e.text)) return true;
    if (seen.has(e.text)) return false;
    seen.add(e.text);
    const decl = findDeclaration(e.text, e);
    return !!(decl && ts.isVariableDeclaration(decl) && decl.initializer && isGatewayReceiver(decl.initializer, seen));
  }
  if (ts.isPropertyAccessExpression(e)) return GATEWAY_NAMES.has(e.name.text);
  if (ts.isCallExpression(e)) {
    const callee = unwrap(e.expression);
    return ts.isIdentifier(callee) && GATEWAY_FACTORIES.has(callee.text);
  }
  if (ts.isAwaitExpression(e)) return isGatewayReceiver(e.expression, seen);
  return false;
}

/** Does this request expression bind the tenant? */
function bindsTenant(expr, seen = new Set()) {
  if (!expr) return false;
  const e = unwrap(expr);
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.some((p) => {
      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && propName(p.name) === 'organizationId') {
        return true;
      }
      return ts.isSpreadAssignment(p) && bindsTenant(p.expression, seen);
    });
  }
  if (ts.isIdentifier(e)) {
    if (seen.has(e.text)) return false;
    seen.add(e.text);
    const decl = findDeclaration(e.text, e);
    return !!(decl && ts.isVariableDeclaration(decl) && decl.initializer && bindsTenant(decl.initializer, seen));
  }
  return false;
}

function annotated(lines, line) {
  for (let l = Math.max(1, line - 3); l < line; l++) {
    if (ANNOTATION.test(lines[l - 1] ?? '')) return true;
  }
  return false;
}

/** Rule 1 findings for one file's source. */
export function unboundCalls(source, rel) {
  const sf = parse(source, rel);
  const lines = source.split('\n');
  const out = [];
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression);
      if (ts.isPropertyAccessExpression(callee) && DISPATCH_METHODS.has(callee.name.text) && isGatewayReceiver(callee.expression)) {
        const request = callee.name.text === 'route' ? n.arguments[0] : n.arguments[n.arguments.length - 1];
        const helperWithoutOptions = callee.name.text !== 'route' && n.arguments.length < (callee.name.text === 'complete' ? 2 : 3);
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        const bound = !helperWithoutOptions && bindsTenant(request);
        if (!bound && !annotated(lines, line)) out.push(`${rel}:${line}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** A value that cannot make a payload public: a non-public literal, or a forward of an existing provenance. */
function safeProvenanceValue(expr) {
  if (!expr) return false;
  const e = unwrap(expr);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text !== 'public';
  if (ts.isPropertyAccessExpression(e)) return e.name.text === 'payloadProvenance';
  if (ts.isElementAccessExpression(e)) return propName(e.argumentExpression) === 'payloadProvenance';
  if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    return safeProvenanceValue(e.left) && safeProvenanceValue(e.right);
  }
  if (ts.isConditionalExpression(e)) return safeProvenanceValue(e.whenTrue) && safeProvenanceValue(e.whenFalse);
  return false;
}

/** Rule 2 findings for one file's source. */
export function publicDeclarations(source, rel, allowlist = PUBLIC_SOURCE_CALLERS) {
  const p = rel.split(path.sep).join('/');
  if (allowlist[p] || !source.includes('payloadProvenance')) return [];
  const sf = parse(source, rel);
  const out = [];
  const flag = (node) => out.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && propName(n.name) === 'payloadProvenance' && !safeProvenanceValue(n.initializer)) flag(n);
    else if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'payloadProvenance') flag(n);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrap(n.left);
      const target =
        (ts.isPropertyAccessExpression(left) && left.name.text === 'payloadProvenance') ||
        (ts.isElementAccessExpression(left) && propName(left.argumentExpression) === 'payloadProvenance');
      if (target && !safeProvenanceValue(n.right)) flag(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
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
      if (!/\.[cm]?[jt]sx?$/.test(e.name) || e.name.endsWith('.d.ts')) continue;
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
  walk(root, PROVENANCE_DIRS, (src, rel) => publicOutsideAllowlist.push(...publicDeclarations(src, rel, allowlist)));
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
      '\nPass organizationId as a top-level key of the request, or — when the call forwards a\n' +
        'request its caller bound — add `// tenant-binding: <where the binding comes from>` above it.\n' +
        "Without it the tenant's placement policy is applied only through the ambient scope.",
    );
  }
  if (publicOutsideAllowlist.length) {
    status = 1;
    console.error(
      `\n✗ ai-tenant-binding: payloadProvenance set to 'public' (or to a value not provably non-public) outside the allowlist (${publicOutsideAllowlist.length})\n`,
    );
    for (const c of publicOutsideAllowlist) console.error(`  ${c}`);
    console.error(
      "\nA 'public' payload may skip the tenant's placement floor where the tenant opted in.\n" +
        'Only a module whose inputs are provably public-source may set it: add it to\n' +
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
    ['control — a spread of a bound local', 'const base = { organizationId: o, taskType: "chat" };\nawait gw.route({ ...base, signal });\n', 0],
    ['control — a helper with bound options', 'await gw.chat(sys, user, { taskType: "chat", organizationId: o });\n', 0],
    ['control — not a gateway', 'router.route("/x");\nawait client.chat(a, b, {});\n', 0],
    ['literal without organizationId (the stream.ts defect)', 'const r = await gw.route({\n  taskType: "chat",\n  messages,\n  tools,\n});\n', 1],
    ['identifier declared without organizationId', 'const req = { taskType: "chat", messages };\nawait gateway.route(req);\n', 1],
    ['forwarded spread without an annotation', 'await gateway.route({ ...request, signal });\n', 1],
    ['a bare annotation with no reason', '// tenant-binding:\nawait gateway.route({ ...request, signal });\n', 1],
    ['getGateway() receiver without organizationId', 'await getGateway().route({ taskType: "chat", messages });\n', 1],
    ['optional-chained receiver (gw?.route)', 'const gw = ensureGateway();\nawait gw?.route({ taskType: "chat", messages });\n', 1],
    ['non-null receiver (gw!.route)', 'await gw!.route({ taskType: "chat", messages });\n', 1],
    ['ensureGateway()!.route', 'await ensureGateway()!.route({ taskType: "chat", messages });\n', 1],
    ['an alias of getGateway()', 'const ai = getGateway();\nawait ai.route({ taskType: "chat", messages });\n', 1],
    ['this.gateway receiver', 'await this.gateway.route({ taskType: "chat", messages });\n', 1],
    ['chat helper without organizationId', 'await gw.chat(sys, user, { taskType: "chat" });\n', 1],
    ['structuredOutput helper without options', 'await getGateway().structuredOutput(p, schema);\n', 1],
    ['complete helper without organizationId', 'await gateway.complete(prompt, { maxTokens: 10 });\n', 1],
    ['organizationId only nested under another key', 'await gw.route({ taskType: "chat", metadata: { organizationId } });\n', 1],
    ['a bound declaration in another function does not count', 'function a() { const req = { organizationId: o }; }\nfunction b(req) { return gw.route(req); }\n', 1],
  ];
  const provenanceCases = [
    ['control — allowlisted module sets public', 'server/services/research/fetch.ts', { 'server/services/research/fetch.ts': 'fetcher output only' }, 0],
    ['control — a comment names public', 'server/services/ana/x.ts', {}, 0, "// payloadProvenance: 'public' is for fetchers\nconst a = 1;\n"],
    ['control — a non-public literal', 'server/services/ana/x.ts', {}, 0, "await gw.route({ organizationId: o, payloadProvenance: 'tenant_derived' });\n"],
    ['control — forwarding an existing provenance', 'server/services/ai-gateway/x.ts', {}, 0, "const ctx = { payloadProvenance: request.payloadProvenance ?? 'tenant_governed' };\n"],
    ['control — reading it is not setting it', 'server/services/ai-gateway/gateway.ts', {}, 0, "if (request.payloadProvenance === 'public') return null;\n"],
    ['a non-allowlisted module sets public', 'server/services/ana/drafting.ts', {}, 1],
    ['an assignment', 'server/services/ana/x.ts', {}, 1, "req.payloadProvenance = 'public';\n"],
    ['a constant holding public', 'server/services/ana/x.ts', {}, 1, "const PUBLIC = 'public';\nawait gw.route({ organizationId: o, payloadProvenance: PUBLIC });\n"],
    ['a quoted key', 'server/services/ana/x.ts', {}, 1, "const r = { 'payloadProvenance': 'public' };\n"],
    ['an element assignment', 'server/services/ana/x.ts', {}, 1, "req['payloadProvenance'] = 'public';\n"],
    ['a shorthand', 'server/services/ana/x.ts', {}, 1, "const payloadProvenance = 'public';\nconst r = { payloadProvenance };\n"],
    ['inside gateway.ts too', 'server/services/ai-gateway/gateway.ts', {}, 1, "const r = { ...request, payloadProvenance: 'public' };\n"],
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
