/* eslint-disable complexity, max-depth, max-lines, no-control-regex --
   An evidence method, not product code: a one-off static analysis that resolves client call sites into the R1
   inventory (README.md here). Its tooling twins under scripts/** are outside the lint scope altogether
   (eslint.config.js). Its long branching readers are deliberate and are pinned by the self-test and the
   byte-for-byte rebuild of inventory.json; splitting them only to satisfy a size rule would put that at risk.
   Only these four size and style rules are off; every correctness rule still applies. */
// R1 inventory, step 2b (added 2026-11-01, see CHANGELOG-template-callers.md).
//
// The literal pass (match.py) reads each string or template literal on its own, so a URL that is
// assembled from a path constant, `${REVIEWS_PATH}/${id}/sign`, reaches it as `${…}/${…}/sign`: no
// mount root, and too few literal segments to keep. This step parses every client file with the
// TypeScript parser (no type checker, no build) and evaluates each template literal and each `+`
// string chain that holds a path piece, substituting what it can resolve:
//   constant  a `const` bound to a string, template, `+` chain or conditional of them, at module
//             level or in an enclosing block (lexical scope: a function's own `const base` is
//             never read from another function);
//   import    the same, imported from another client module: named, aliased, `* as ns`, and
//             re-exported through `export { … } from` / `export * from`; specifiers resolved with
//             the vite/tsconfig aliases `@/`, `@shared/` and repo-root `shared/…`;
//   property  a property of a `const` object literal, an enum member, or a namespace member
//             (`API.reviews`, `ns.BASE`);
//   helper    a call to a function whose returns are strings, `docUrl(projectId, id)`, with its
//             parameters bound to the call's arguments;
//   argument  a parameter used as the head of a URL inside a helper or component
//             (`function useSend(base) { … `${base}/fulfill` }`, `<PlacementForm base={…} />`),
//             bound to the arguments or JSX props of every call site that resolves to that
//             function, in any client file. A call site also counts when the function is handed
//             to a component as a prop (`<UnlinkForm write={write} />`) and the component calls
//             that prop, through any number of components (added by the second correction);
//   element   (second correction) a property of an object in a `const` array, read through a
//             parameter or prop that is fed from that array: `ARR.find(…)`, `ARR[i]`,
//             `ARR.filter(…)[0]`, `[...A, ...B]`, `useMemo(() => …)`. The URL is evaluated once
//             per element, so `${calc.base ?? BASE}${calc.path}` keeps each element's base with
//             its own path. A URL made only of substitutions, with no literal `/`, is now
//             evaluated too.
// Anything else (a runtime value, `encodeURIComponent(id)`, a parameter with no resolvable call
// site) stays a wildcard, as in the literal pass. Output: <S>/resolved-patterns.json,
// [{ s, file, line, via, how, sinks }], where `s` uses U+0000 for a wildcard, `how` lists the
// kinds above that were used, and `via` is
//   path-constant  at least one of them substituted a value;
//   concatenation  a `+` chain of literals and runtime values, nothing substituted;
//   template       a template with runtime values only (the literal pass's own case, re-read by
//                  the parser, which keeps nested `${…}` and backticks that its regex splits).
// `sinks` (second correction) says where the URL is sent and with which HTTP method. The URL's
// value is followed from where it is built, through `const`/`let` names, returns (to the helper's
// call sites), JSX props (into the component) and `new URL(…)`, to the call it is handed to:
//   [{ file, line, methods }]  file:line of that call, as the client wrote it; `methods` is the
//                              HTTP methods it can send, or null when the method is not known.
// The method of a call is read from an HTTP verb among its other arguments (`apiCall('POST', u)`,
// a `const`, a conditional of verbs, a parameter bound at the caller), from an options object's
// `method` (`fetch(u, { method })`), from `fetch` with no method (GET), from react-query's
// `queryKey: [u]` (the default query function, client/src/lib/queryClient.ts, GETs it), from
// `x.get/post/put/patch/delete(u)`, `EventSource` and `<a href>` (GET), or by following the
// argument into the called client function (`useLiveData(u)` → `liveGetOrNull` → GET) with that
// function's parameters bound to the call's arguments. A value compared, rendered as text or
// listed in a hook's dependency array is not a sink. A URL whose sinks are all unknown, or that has
// none, has an unknown method.
// Usage, from the root of the tree being measured: node <method>/resolve.cjs <S>
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ts = require(require.resolve('typescript', { paths: [process.cwd(), __dirname] }));

const S = process.argv[2];
const W = '\u0000';
const MAX = 8;
const MAX_DEPTH = 16;
// The same file set as match.py.
const files = execSync("find client/src shared -name '*.ts' -o -name '*.tsx' | grep -v __tests__ | grep -v '\\.test\\.'",
  { encoding: 'utf8', shell: '/bin/bash', maxBuffer: 1 << 26 }).split(/\s+/).filter(Boolean);
const fileSet = new Set(files);

function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith('./') || spec.startsWith('../')) base = path.join(path.dirname(from), spec);
  else if (spec.startsWith('@/')) base = path.join('client/src', spec.slice(2));
  else if (spec === '@shared' || spec.startsWith('@shared/')) base = path.join('shared', spec.slice(8));
  else if (spec.startsWith('shared/') || spec.startsWith('client/src/')) base = path.normalize(spec);
  else return null;
  const b = base.replace(/\.(js|jsx|mjs)$/, '');
  for (const c of [base, b + '.ts', b + '.tsx', b + '/index.ts', b + '/index.tsx']) if (fileSet.has(c)) return c;
  return null;
}

// ── modules: imports, export aliases, star re-exports ──────────────────────────────────────────
const mods = new Map();
function mod(f) {
  if (mods.has(f)) return mods.get(f);
  const text = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const m = { f, sf, imports: new Map(), aliases: new Map(), stars: [] };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      const target = resolveSpec(f, st.moduleSpecifier.text);
      if (!c || c.isTypeOnly || !target) continue;
      if (c.name) m.imports.set(c.name.text, { target, name: 'default' });
      const nb = c.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) m.imports.set(nb.name.text, { target, ns: true });
      else if (nb) for (const el of nb.elements) if (!el.isTypeOnly) m.imports.set(el.name.text, { target, name: (el.propertyName || el.name).text });
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      const target = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? resolveSpec(f, st.moduleSpecifier.text) : null;
      if (!st.exportClause) { if (target) m.stars.push(target); continue; }
      if (ts.isNamespaceExport(st.exportClause)) { if (target) m.aliases.set(st.exportClause.name.text, { target, ns: true }); continue; }
      for (const el of st.exportClause.elements) {
        const orig = (el.propertyName || el.name).text;
        if (st.moduleSpecifier) { if (target) m.aliases.set(el.name.text, { target, name: orig }); }
        else m.aliases.set(el.name.text, { local: orig });
      }
    }
  }
  mods.set(f, m);
  return m;
}
const modOf = (node) => mod(node.getSourceFile().fileName);

// ── bindings ─────────────────────────────────────────────────────────────────────────────────────
function names(n, out = []) {
  if (ts.isIdentifier(n)) out.push(n.text);
  else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) {
    for (const e of n.elements) if (!ts.isOmittedExpression(e)) names(e.name, out);
  }
  return out;
}
function inStatements(stmts, name) {
  for (const st of stmts) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!names(d.name).includes(name)) continue;
        const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
        if (!ts.isIdentifier(d.name)) return { kind: 'unknown' };
        // A `let` is never substituted (it can be reassigned); its name is kept so that the sink
        // pass can follow the value to where it is used.
        return isConst ? { kind: 'const', decl: d } : { kind: 'let', decl: d };
      }
    } else if (ts.isFunctionDeclaration(st) && st.name && st.name.text === name) return { kind: 'function', fn: st };
    else if (ts.isEnumDeclaration(st) && st.name.text === name) return { kind: 'enum', decl: st };
    else if ((ts.isClassDeclaration(st) || ts.isModuleDeclaration(st)) && st.name && st.name.text === name) return { kind: 'unknown' };
  }
  return null;
}
// Lexical lookup of `name` as seen from `node`.
function lookup(node, name) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters) {
      for (const p of n.parameters) if (names(p.name).includes(name)) return { kind: 'param', param: p, name };
      if (ts.isFunctionExpression(n) && n.name && n.name.text === name) return { kind: 'unknown' };
    }
    if (n.statements) { const hit = inStatements(n.statements, name); if (hit) return hit; }
    if ((ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isForStatement(n)) && n.initializer && ts.isVariableDeclarationList(n.initializer)) {
      for (const d of n.initializer.declarations) if (names(d.name).includes(name)) return { kind: 'unknown' };
    }
    if (ts.isCatchClause(n) && n.variableDeclaration && names(n.variableDeclaration.name).includes(name)) return { kind: 'unknown' };
    if (ts.isSourceFile(n)) {
      const im = modOf(n).imports.get(name);
      if (!im) break;
      const r = im.ns ? { kind: 'ns', target: im.target } : exportBinding(im.target, im.name, new Set());
      return r ? { ...r, imported: true } : { kind: 'global' };
    }
  }
  return { kind: 'global' };
}
function exportBinding(target, name, seen) {
  const key = target + '#' + name;
  if (seen.has(key)) return null;
  seen.add(key);
  const m = mod(target);
  const a = m.aliases.get(name);
  if (a) {
    if (a.ns) return { kind: 'ns', target: a.target };
    if (a.target) return exportBinding(a.target, a.name, seen);
    return topBinding(m, a.local, seen);
  }
  const t = topBinding(m, name, seen);
  if (t) return t;
  for (const s of m.stars) { const r = exportBinding(s, name, seen); if (r) return r; }
  return null;
}
function topBinding(m, name, seen) {
  const hit = inStatements(m.sf.statements, name);
  if (hit) return hit;
  const im = m.imports.get(name);
  if (im) return im.ns ? { kind: 'ns', target: im.target } : exportBinding(im.target, im.name, seen);
  return null;
}

// Where a binding is read (second correction): every identifier in its scope that resolves to it,
// and, for a module-level `const`, every identifier in another client file that imports it.
const sameBinding = (a, b) => !!a && !!b && a.kind === b.kind
  && (a.kind === 'param' ? a.param === b.param && a.name === b.name : a.decl === b.decl);
function isValueRef(id) {
  const p = id.parent;
  if (!p) return false;
  if ((ts.isPropertyAccessExpression(p) && p.name === id) || (ts.isPropertyAssignment(p) && p.name === id)
    || (ts.isVariableDeclaration(p) && p.name === id) || (ts.isParameter(p) && p.name === id)
    || (ts.isBindingElement(p) && (p.name === id || p.propertyName === id))
    || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)
    || ts.isJsxAttribute(p) || ts.isQualifiedName(p) || ts.isTypeReferenceNode(p)
    || ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || ts.isClassDeclaration(p)) && p.name === id)) return false;
  return true;
}
const refsMemo = new Map();
function refsOf(b) {
  const decl = b.kind === 'param' ? b.param : b.decl;
  const name = b.kind === 'param' ? b.name : b.decl.name.text;
  const key = decl.pos + '|' + decl.getSourceFile().fileName + '|' + name;
  if (refsMemo.has(key)) return refsMemo.get(key);
  const out = [];
  const scan = (root) => {
    const walk = (n) => {
      if (ts.isIdentifier(n) && n.text === name && isValueRef(n) && sameBinding(lookup(n, name), b)) out.push(n);
      ts.forEachChild(n, walk);
    };
    walk(root);
  };
  let scope;
  if (b.kind === 'param') scope = b.param.parent;
  else { const st = b.decl.parent && b.decl.parent.parent; scope = st && st.parent; }
  if (scope) scan(scope);
  if (scope && ts.isSourceFile(scope) && b.kind === 'const') {
    for (const f of files) {
      if (f === scope.fileName) continue;
      const sf = mod(f).sf;
      if (sf.text.includes(name)) scan(sf);
    }
  }
  refsMemo.set(key, out);
  return out;
}

// ── values: a list of candidate strings, U+0000 for a wildcard ───────────────────────────────────
const strip = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)
    || ts.isTypeAssertionExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) e = e.expression;
  return e;
};
const isNullish = (e) => { e = strip(e); return !!e && (e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined')); };
function product(a, b) {
  const out = [];
  for (const x of a) for (const y of b) { if (out.length >= MAX) return out; out.push(x + y); }
  return out;
}
function union(a, b) {
  const out = [...a];
  for (const y of b) if (out.length < MAX && !out.includes(y)) out.push(y);
  return out;
}
const orWild = (v) => (v.length ? v : [W]);
const concrete = (vals) => vals.some((v) => v.replace(/\u0000/g, '') !== '');

// `A.b` or `A['b']`
const accessed = (e) => (ts.isPropertyAccessExpression(e) ? e.name.text
  : (ts.isElementAccessExpression(e) && e.argumentExpression && ts.isStringLiteralLike(e.argumentExpression) ? e.argumentExpression.text : null));
// What an object expression is: an object literal, an enum, or a namespace.
function objectOf(expr) {
  expr = strip(expr);
  let b = null;
  if (ts.isIdentifier(expr)) b = lookup(expr, expr.text);
  else if (accessed(expr) !== null) {
    const r = memberNode(expr);
    if (r && r.node) { const init = strip(r.node); if (init && ts.isObjectLiteralExpression(init)) return { obj: init }; }
    b = r && r.binding;
  }
  if (!b) return null;
  if (b.kind === 'ns') return { ns: b.target };
  if (b.kind === 'enum') return { enumDecl: b.decl };
  if (b.kind === 'const' && b.decl.initializer) {
    const init = strip(b.decl.initializer);
    if (ts.isObjectLiteralExpression(init)) return { obj: init };
  }
  return null;
}
// The node (initializer or method) or binding that `A.b` names.
function memberNode(pa) {
  const prop = accessed(pa);
  if (prop === null) return null;
  const o = objectOf(pa.expression);
  if (!o) return null;
  if (o.ns) { const b = exportBinding(o.ns, prop, new Set()); return b ? { binding: b } : null; }
  if (o.enumDecl) {
    const mem = o.enumDecl.members.find((x) => x.name && x.name.text === prop);
    return mem && mem.initializer ? { node: mem.initializer } : null;
  }
  for (const p of o.obj.properties) {
    if (!p.name || p.name.text !== prop) continue;
    if (ts.isPropertyAssignment(p)) return { node: p.initializer };
    if (ts.isShorthandPropertyAssignment(p)) return { binding: lookup(p.name, prop) };
    if (ts.isMethodDeclaration(p)) return { node: p };
  }
  return null;
}
const isFn = (n) => !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n));
// The function a binding names: a declaration, a const arrow, or a const wrapped once (memo(…)).
function fnOfBinding(b) {
  if (!b) return null;
  if (b.kind === 'function') return b.fn;
  if (b.kind === 'const' && b.decl.initializer) {
    const init = strip(b.decl.initializer);
    if (isFn(init)) return init;
    if (ts.isCallExpression(init) && init.arguments.length && isFn(strip(init.arguments[0]))) return strip(init.arguments[0]);
  }
  return null;
}
function functionOf(callee) {
  callee = strip(callee);
  if (ts.isIdentifier(callee)) return fnOfBinding(lookup(callee, callee.text));
  if (accessed(callee) !== null) {
    const r = memberNode(callee);
    if (r) {
      if (r.binding) return fnOfBinding(r.binding);
      const n = strip(r.node);
      return isFn(n) ? n : null;
    }
    // (second correction) a method of an object that a client function returns: `resource.file(…)`
    const os = objs(callee.expression);
    for (const o of os || []) {
      const node = memberOf(o, accessed(callee));
      const n = node && strip(node);
      if (n && isFn(n)) return n;
      if (n && ts.isIdentifier(n)) { const f2 = fnOfBinding(lookup(n, n.text)); if (f2) return f2; }
    }
    return null;
  }
  return null;
}
function returnsOf(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out = [];
  const walk = (n) => {
    if (n !== fn.body && ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, walk);
  };
  walk(fn.body);
  return out;
}
const stringShaped = (e) => {
  e = strip(e);
  return !!e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)
    || (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken)
    || (ts.isConditionalExpression(e) && (stringShaped(e.whenTrue) || stringShaped(e.whenFalse))));
};

// ── call sites, for parameters used as a URL head ────────────────────────────────────────────────
let siteIndex = null; // local name -> [CallExpression | JsxOpeningElement | JsxSelfClosingElement]
let propIndex = null; // `x.name(…)` -> [CallExpression]
let attrIndex = null; // `<C a={name} />` -> [JsxAttribute]
function buildIndexes() {
  siteIndex = new Map();
  propIndex = new Map();
  attrIndex = new Map();
  const add = (ix, k, n) => { if (!ix.has(k)) ix.set(k, []); ix.get(k).push(n); };
  for (const f of files) {
    const walk = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) add(siteIndex, n.expression.text, n);
      else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) add(propIndex, n.expression.name.text, n);
      else if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName)) add(siteIndex, n.tagName.text, n);
      else if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression
        && ts.isIdentifier(n.initializer.expression)) add(attrIndex, n.initializer.expression.text, n);
      ts.forEachChild(n, walk);
    };
    walk(mod(f).sf);
  }
}
function sitesByName(name) {
  if (!siteIndex) buildIndexes();
  return siteIndex.get(name) || [];
}
// The component a JSX attribute belongs to, and how its body reads that prop: the local name of a
// destructured prop, or `props.<name>` on a `props` parameter.
function propBinding(attr) {
  const el = attr.parent && attr.parent.parent;
  if (!el || !ts.isIdentifier(el.tagName) || /^[a-z]/.test(el.tagName.text)) return null;
  const C = fnOfBinding(lookup(el.tagName, el.tagName.text));
  if (!C || !C.parameters.length) return null;
  const key = attr.name.getText();
  const p0 = C.parameters[0];
  if (ts.isObjectBindingPattern(p0.name)) {
    const el2 = p0.name.elements.find((e) => ts.isIdentifier(e.name) && ((e.propertyName && e.propertyName.text) || e.name.text) === key);
    return el2 ? { C, binding: { kind: 'param', param: p0, name: el2.name.text } } : null;
  }
  if (ts.isIdentifier(p0.name)) return { C, binding: { kind: 'param', param: p0, name: p0.name.text }, member: key };
  return null;
}
// The calls a component makes to a function prop, following the prop down through further
// components (`write={write}` handed on again).
function propCalls(attr, depth, seen) {
  if (depth > 4 || seen.has(attr)) return [];
  seen.add(attr);
  const pb = propBinding(attr);
  if (!pb) return [];
  const out = [];
  for (const r of refsOf(pb.binding)) {
    let x = r;
    if (pb.member) { if (!(ts.isPropertyAccessExpression(r.parent) && r.parent.expression === r && r.parent.name.text === pb.member)) continue; x = r.parent; }
    const p = x.parent;
    if (p && ts.isCallExpression(p) && p.expression === x) out.push(p);
    else if (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) out.push(...propCalls(p.parent, depth + 1, seen));
  }
  return out;
}
function fnName(fn) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  let p = fn.parent;
  if (p && ts.isCallExpression(p)) p = p.parent; // memo(…), forwardRef(…)
  return p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) ? p.name.text : null;
}
const siteMemo = new Map();
function callSites(fn) {
  if (siteMemo.has(fn)) return siteMemo.get(fn);
  const own = fnName(fn);
  const out = [];
  sitesByName(''); // parses every file, so the alias scan below sees all imports
  if (own) {
    const local = new Set([own]);
    for (const m of mods.values()) for (const [k, im] of m.imports) if (im.name === own) local.add(k);
    for (const k of local) {
      for (const site of sitesByName(k)) {
        const callee = ts.isCallExpression(site) ? site.expression : site.tagName;
        if (fnOfBinding(lookup(callee, k)) === fn) out.push(site);
      }
      // handed to a component as a prop, and called there (second correction)
      for (const attr of attrIndex.get(k) || []) {
        if (fnOfBinding(lookup(attr.initializer.expression, k)) === fn) out.push(...propCalls(attr, 0, new Set()));
      }
    }
  }
  // a function in an object literal, called as `api.name(…)` (second correction)
  const objMember = fn.parent && ts.isPropertyAssignment(fn.parent) && fn.parent.name && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text
    : (ts.isMethodDeclaration(fn) && fn.name && ts.isIdentifier(fn.name) && fn.parent && ts.isObjectLiteralExpression(fn.parent) ? fn.name.text : null);
  if (objMember) {
    for (const site of propIndex.get(objMember) || []) if (functionOf(site.expression) === fn) out.push(site);
  }
  siteMemo.set(fn, out);
  return out;
}
// The values a parameter takes over every call site; `prop` names a destructured or accessed prop.
function paramValues(b, prop, ctx) {
  const fn = b.param.parent;
  const i = fn.parameters.indexOf(b.param);
  let key = prop;
  let dflt = b.param.initializer || null;
  if (!ts.isIdentifier(b.param.name)) {
    const el = ts.isObjectBindingPattern(b.param.name) && b.param.name.elements.find((e) => ts.isIdentifier(e.name) && e.name.text === b.name);
    if (!el || prop) return [W];
    key = el.propertyName ? (el.propertyName.text ?? null) : b.name;
    dflt = el.initializer || null;
    if (key === null) return [W];
  }
  const memoKey = `${prop || ''}|${b.name}`;
  b.param.__pv = b.param.__pv || new Map();
  const fanned = !!(ctx.objEnv && ctx.objEnv.size); // values may depend on the bound objects: not memoised
  if (!fanned && b.param.__pv.has(memoKey)) return recall(b.param.__pv.get(memoKey), ctx);
  if (ctx.stack.has(b.param)) return [W];
  ctx.stack.add(b.param);
  const saved = ctx.used;
  ctx.used = new Set();
  let out = [];
  for (const site of callSites(fn)) {
    let v = [W];
    if (ts.isCallExpression(site)) {
      const arg = site.arguments[i];
      if (!arg) v = dflt ? ev(dflt, new Map(), ctx) : [W];
      else if (key === null || key === undefined) v = ev(arg, new Map(), ctx);
      else {
        const o = strip(arg);
        const p = o && ts.isObjectLiteralExpression(o) && o.properties.find((x) => x.name && x.name.text === key);
        v = p && ts.isPropertyAssignment(p) ? ev(p.initializer, new Map(), ctx)
          : (p && ts.isShorthandPropertyAssignment(p) ? ev(p.name, new Map(), ctx) : [W]);
      }
    } else if (i === 0 && key) {
      const attr = site.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === key);
      if (!attr) v = dflt ? ev(dflt, new Map(), ctx) : [W];
      else if (attr.initializer && ts.isStringLiteral(attr.initializer)) v = [attr.initializer.text];
      else if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) v = ev(attr.initializer.expression, new Map(), ctx);
    }
    out = union(out, v);
  }
  ctx.stack.delete(b.param);
  out = orWild(out);
  const entry = { v: out, used: ctx.used };
  if (!fanned) b.param.__pv.set(memoKey, entry);
  ctx.used = saved;
  return recall(entry, ctx);
}
// A memoised value, with the kinds of substitution it took merged into the caller's.
function recall(entry, ctx) {
  for (const u of entry.used) ctx.used.add(u);
  return entry.v;
}

// ── objects: which `const` object literals a parameter or prop can hold (second correction) ──────
const MAX_OBJ = 256;
const isUseMemo = (c) => { c = strip(c); return (ts.isIdentifier(c) && c.text === 'useMemo') || (ts.isPropertyAccessExpression(c) && c.name.text === 'useMemo'); };
const ELEMENT_OF = new Set(['find', 'findLast', 'at']);
const SAME_ARRAY = new Set(['filter', 'slice', 'sort', 'toSorted', 'reverse', 'toReversed']);
function addObjs(out, more) { if (more) for (const o of more) if (out.length < MAX_OBJ && !out.includes(o)) out.push(o); return out; }
// The object literals `expr` can evaluate to, or null when that is not known statically.
const objsStack = new Set();
function objs(expr, d = 0) {
  const e = strip(expr);
  if (!e || d > 12 || objsStack.has(e)) return null;
  objsStack.add(e);
  try { return objs1(e, d); } finally { objsStack.delete(e); }
}
function objs1(e, d) {
  if (ts.isObjectLiteralExpression(e)) return [e];
  if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    const out = addObjs(addObjs([], objs(e.left, d + 1)), objs(e.right, d + 1));
    return out.length ? out : null;
  }
  if (ts.isConditionalExpression(e)) {
    const out = addObjs(addObjs([], objs(e.whenTrue, d + 1)), objs(e.whenFalse, d + 1));
    return out.length ? out : null;
  }
  if (ts.isIdentifier(e)) {
    const b = lookup(e, e.text);
    if (b.kind === 'const' && b.decl.initializer) return objs(b.decl.initializer, d + 1);
    if (b.kind === 'param') return objsOfParam(b, d + 1);
    return null;
  }
  if (ts.isCallExpression(e)) {
    const c = strip(e.expression);
    if (ts.isPropertyAccessExpression(c) && ELEMENT_OF.has(c.name.text)) return elems(c.expression, d + 1);
    if (isUseMemo(c) && e.arguments.length && isFn(strip(e.arguments[0]))) {
      let out = [];
      for (const r of returnsOf(strip(e.arguments[0]))) out = addObjs(out, objs(r, d + 1));
      return out.length ? out : null;
    }
    const fn = functionOf(c); // the objects a client function (a hook) returns
    if (fn) {
      let out = [];
      for (const r of returnsOf(fn)) out = addObjs(out, objs(r, d + 1));
      return out.length ? out : null;
    }
    return null;
  }
  if (ts.isElementAccessExpression(e) && !(e.argumentExpression && ts.isStringLiteralLike(e.argumentExpression))) return elems(e.expression, d + 1);
  return null;
}
// The object-literal elements of an array, through `const` names, spreads and imports.
function elems(expr, d = 0) {
  const e = strip(expr);
  if (!e || d > 12) return null;
  if (ts.isArrayLiteralExpression(e)) {
    let out = [];
    for (const el of e.elements) out = addObjs(out, ts.isSpreadElement(el) ? elems(el.expression, d + 1) : objs(el, d + 1));
    return out.length ? out : null;
  }
  if (ts.isIdentifier(e)) {
    const b = lookup(e, e.text);
    return b.kind === 'const' && b.decl.initializer ? elems(b.decl.initializer, d + 1) : null;
  }
  if (accessed(e) !== null) {
    const r = memberNode(e);
    if (r && r.node) return elems(r.node, d + 1);
    if (r && r.binding && r.binding.kind === 'const' && r.binding.decl.initializer) return elems(r.binding.decl.initializer, d + 1);
    return null;
  }
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(strip(e.expression)) && SAME_ARRAY.has(strip(e.expression).name.text)) {
    return elems(strip(e.expression).expression, d + 1);
  }
  return null;
}
const objParamMemo = new Map();
function objsOfParam(b, d) {
  const key = b.param.pos + '|' + b.param.getSourceFile().fileName + '|' + b.name;
  if (objParamMemo.has(key)) return objParamMemo.get(key);
  objParamMemo.set(key, null); // a cycle reads as unknown
  const fn = b.param.parent;
  const i = fn.parameters.indexOf(b.param);
  let prop = null;
  if (!ts.isIdentifier(b.param.name)) {
    const el = ts.isObjectBindingPattern(b.param.name) && b.param.name.elements.find((x) => ts.isIdentifier(x.name) && x.name.text === b.name);
    if (!el) return null;
    prop = el.propertyName ? el.propertyName.text : b.name;
  }
  let out = [];
  for (const site of callSites(fn)) {
    let arg = null;
    if (ts.isCallExpression(site)) {
      const a = site.arguments[i];
      if (a && !prop) arg = a;
      else if (a && ts.isObjectLiteralExpression(strip(a))) {
        const p = strip(a).properties.find((x) => x.name && x.name.text === prop);
        arg = p && ts.isPropertyAssignment(p) ? p.initializer : (p && ts.isShorthandPropertyAssignment(p) ? p.name : null);
      }
    } else if (i === 0 && prop) {
      const attr = site.attributes.properties.find((x) => ts.isJsxAttribute(x) && x.name.getText() === prop);
      arg = attr && attr.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : null;
    }
    if (arg) out = addObjs(out, objs(arg, d + 1));
  }
  const res = out.length ? out : null;
  objParamMemo.set(key, res);
  return res;
}
// `obj.prop` for an object literal: its value node, or undefined when the object has no such key.
function memberOf(obj, prop, d = 0) {
  for (const p of obj.properties) {
    if (p.name && p.name.text === prop) {
      if (ts.isPropertyAssignment(p)) return p.initializer;
      if (ts.isShorthandPropertyAssignment(p)) return p.name;
      return null; // a method or accessor: not a string
    }
  }
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p) && d < 4) {
      const o = objs(p.expression);
      if (o && o.length === 1) { const r = memberOf(o[0], prop, d + 1); if (r !== undefined) return r; }
      else if (o === null || o.length > 1) return null; // unknown spread: the key may be there
    }
  }
  return undefined;
}
// The parameter whose bound object `x.prop` reads, when the evaluation fans out over objects.
function boundObject(e, ctx) {
  if (!ctx.objEnv || !ctx.objEnv.size || accessed(e) === null) return null;
  const o = strip(e.expression);
  if (!o || !ts.isIdentifier(o)) return null;
  const b = lookup(o, o.text);
  if (b.kind !== 'param') return null;
  const m = ctx.objEnv.get(b.param);
  return m && m.has(b.name) ? m.get(b.name) : null;
}
const isMissing = (e, ctx) => { const obj = boundObject(strip(e), ctx); return !!obj && memberOf(obj, accessed(strip(e))) === undefined; };

// ── evaluation ───────────────────────────────────────────────────────────────────────────────────
const memo = new Map();
function evBinding(b, env, ctx, prop = null) {
  if (b.kind === 'param') {
    if (env.has(b.param)) return prop ? [W] : env.get(b.param);
    const v = paramValues(b, prop, ctx);
    if (concrete(v)) ctx.used.add('argument');
    return v;
  }
  if (b.kind === 'const' && b.decl.initializer) {
    const useMemo = env.size === 0 && !(ctx.objEnv && ctx.objEnv.size);
    let entry = useMemo ? memo.get(b.decl) : undefined;
    if (!entry) {
      if (ctx.stack.has(b.decl)) return [W];
      ctx.stack.add(b.decl);
      const saved = ctx.used;
      ctx.used = new Set();
      const v = ev(b.decl.initializer, env, ctx);
      entry = { v, used: ctx.used };
      ctx.used = saved;
      ctx.stack.delete(b.decl);
      if (useMemo) memo.set(b.decl, entry);
    }
    const v = recall(entry, ctx);
    if (concrete(v)) ctx.used.add(b.imported ? 'import' : 'constant');
    return v;
  }
  return [W];
}
function ev(node, env, ctx) {
  if (ctx.depth > MAX_DEPTH) return [W];
  ctx.depth++;
  try { return orWild(ev1(node, env, ctx)); } finally { ctx.depth--; }
}
function ev1(node, env, ctx) {
  const e = strip(node);
  if (!e) return [W];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isNumericLiteral(e)) return [e.text];
  if (ts.isTemplateExpression(e)) {
    let acc = [e.head.text];
    for (const sp of e.templateSpans) acc = product(product(acc, ev(sp.expression, env, ctx)), [sp.literal.text]);
    return acc;
  }
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.PlusToken) return product(ev(e.left, env, ctx), ev(e.right, env, ctx));
    if (k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.BarBarToken) {
      // a key the bound object does not have is undefined, so the right-hand side applies
      const none = (x) => isNullish(x) || isMissing(x, ctx);
      const left = none(e.left) ? [] : ev(e.left, env, ctx);
      // (second correction) a left side that is always a known string, never empty, decides alone
      if (left.length && left.every((x) => !x.includes(W) && (k === ts.SyntaxKind.QuestionQuestionToken || x !== ''))) return left;
      return union(left, none(e.right) ? [] : ev(e.right, env, ctx));
    }
    return [W];
  }
  if (ts.isConditionalExpression(e)) {
    return union(isNullish(e.whenTrue) ? [] : ev(e.whenTrue, env, ctx), isNullish(e.whenFalse) ? [] : ev(e.whenFalse, env, ctx));
  }
  if (ts.isIdentifier(e)) return evBinding(lookup(e, e.text), env, ctx);
  if (accessed(e) !== null) {
    const bound = boundObject(e, ctx);
    if (bound) { // `calc.path` on the object this evaluation is bound to (second correction)
      const node = memberOf(bound, accessed(e));
      if (!node) return [W];
      const v = ev(node, new Map(), ctx);
      if (concrete(v)) ctx.used.add('element');
      return v;
    }
    const obj = strip(e.expression);
    if (obj && ts.isIdentifier(obj)) {
      const ob = lookup(obj, obj.text);
      if (ob.kind === 'param') return evBinding(ob, env, ctx, accessed(e)); // props.base
    }
    const r = memberNode(e);
    if (!r) return [W];
    const v = r.binding ? evBinding(r.binding, env, ctx) : (isFn(strip(r.node)) ? [W] : ev(r.node, env, ctx));
    if (concrete(v)) ctx.used.add('property');
    return v;
  }
  if (ts.isCallExpression(e)) {
    const fn = functionOf(e.expression);
    if (!fn || ctx.stack.has(fn)) return [W];
    const rets = returnsOf(fn);
    if (!rets.some(stringShaped)) return [W];
    const env2 = new Map();
    fn.parameters.forEach((p, i) => {
      const arg = e.arguments[i];
      env2.set(p, arg ? ev(arg, env, ctx) : (p.initializer ? ev(p.initializer, env, ctx) : [W]));
    });
    ctx.stack.add(fn);
    let out = [];
    for (const r of rets) if (!isNullish(r)) out = union(out, stringShaped(r) ? ev(r, env2, ctx) : [W]);
    ctx.stack.delete(fn);
    if (concrete(out)) ctx.used.add('helper');
    return out;
  }
  return [W];
}

// ── sinks: where a URL is sent, and with which HTTP method (second correction) ──────────────────────
const VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const K = ts.SyntaxKind;
const isWrap = (p) => ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p)
  || ts.isTypeAssertionExpression(p) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(p));
function verbsOf(expr, env) {
  const e = strip(expr);
  if (!e || ts.isObjectLiteralExpression(e) || ts.isArrayLiteralExpression(e) || isFn(e)) return null;
  const v = ev(e, env, { depth: 0, stack: new Set(), used: new Set() }).map((x) => x.toUpperCase());
  return v.length && v.every((x) => VERBS.has(x)) ? [...new Set(v)] : null;
}
// An options object's `method`: verbs, null when it is not a literal, undefined when there is none.
function methodProp(o, env) {
  const mp = o.properties.find((x) => x.name && (ts.isIdentifier(x.name) || ts.isStringLiteral(x.name)) && x.name.text === 'method');
  if (!mp) return undefined;
  if (ts.isPropertyAssignment(mp)) return verbsOf(mp.initializer, env);
  if (ts.isShorthandPropertyAssignment(mp)) return verbsOf(mp.name, env);
  return null;
}
function optionsObject(expr) {
  const e = strip(expr);
  if (!e) return null;
  if (ts.isObjectLiteralExpression(e)) return e;
  if (!ts.isIdentifier(e)) return null;
  const o = objs(e);
  return o && o.length === 1 ? o[0] : null;
}
const queryTail = (e) => { e = strip(e); return !!e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e))
  && /^[?#]/.test(ts.isTemplateExpression(e) ? e.head.text : e.text); };
function enclosingFn(n) { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p; return null; }
const isGlobalObj = (e) => ts.isIdentifier(e) && ['window', 'globalThis', 'self', 'document', 'navigator', 'location'].includes(e.text);
// The HTTP methods of call `call`, whose argument `i` is the URL; null when not known.
function methodAt(call, i, env, st) {
  const args = call.arguments || [];
  for (let j = 0; j < args.length; j++) if (j !== i) { const v = verbsOf(args[j], env); if (v) return v; }
  for (let j = 0; j < args.length; j++) {
    if (j === i) continue;
    const o = optionsObject(args[j]);
    if (o) { const v = methodProp(o, env); if (v !== undefined) return v; }
  }
  const callee = strip(call.expression);
  const name = ts.isIdentifier(callee) ? callee.text : (ts.isPropertyAccessExpression(callee) ? callee.name.text : null);
  const global = ts.isIdentifier(callee) ? lookup(callee, callee.text).kind === 'global'
    : (ts.isPropertyAccessExpression(callee) && isGlobalObj(strip(callee.expression)));
  if (ts.isNewExpression(call)) return (name === 'EventSource' || name === 'WebSocket') && global ? ['GET'] : null;
  if (name === 'fetch' && global && i === 0) {
    if (!args[1]) return ['GET'];
    const o = optionsObject(args[1]);
    if (!o) return null;
    const v = methodProp(o, env);
    return v === undefined ? ['GET'] : v;
  }
  if (name === 'sendBeacon') return ['POST'];
  if (global && (name === 'open' || name === 'assign' || name === 'replace')) return ['GET'];
  const fn = functionOf(call.expression);
  if (!fn) return ts.isPropertyAccessExpression(callee) && ['get', 'post', 'put', 'patch', 'delete'].includes(name) ? [name.toUpperCase()] : null;
  // a client function: follow the argument into its body, its parameters bound to this call's arguments
  const prm = fn.parameters[i];
  if (!prm || !ts.isIdentifier(prm.name) || prm.dotDotDotToken || st.inFn.has(fn) || st.depth > 8) return null;
  const env2 = new Map();
  fn.parameters.forEach((q, k) => {
    if (k === i) return;
    const a = args[k];
    env2.set(q, a ? ev(a, env, { depth: 0, stack: new Set(), used: new Set() }) : (q.initializer ? ev(q.initializer, new Map(), { depth: 0, stack: new Set(), used: new Set() }) : [W]));
  });
  st.inFn.add(fn);
  st.depth++;
  const ms = new Set();
  for (const r of refsOf({ kind: 'param', param: prm, name: prm.name.text })) for (const s of flowUp(r, env2, st)) if (s.methods) for (const m of s.methods) ms.add(m);
  st.depth--;
  st.inFn.delete(fn);
  return ms.size ? [...ms].sort() : null;
}
// Where the value of node `n` goes: [{ at, methods }], `at` the node that marks the call.
function flowUp(n, env, st) {
  if (st.depth > 10 || st.path.has(n)) return [];
  st.path.add(n);
  try { return flow1(n, env, st); } finally { st.path.delete(n); }
}
function flow1(n0, env, st) {
  let n = n0;
  let p = n.parent;
  while (p && isWrap(p)) { n = p; p = p.parent; }
  if (!p) return [];
  const unknown = [{ at: n, methods: null }];
  if (ts.isConditionalExpression(p)) return p.condition === n ? [] : flowUp(p, env, st);
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (k === K.QuestionQuestionToken || k === K.BarBarToken) return flowUp(p, env, st);
    if (k === K.AmpersandAmpersandToken) return p.right === n ? flowUp(p, env, st) : [];
    if (k === K.PlusToken) return p.left === n && queryTail(p.right) ? flowUp(p, env, st) : [];
    if (k === K.EqualsToken && p.right === n) {
      const L = strip(p.left);
      if (ts.isIdentifier(L)) { const b = lookup(L, L.text); return b.kind === 'let' ? refsOf(b).filter((r) => r !== L).flatMap((r) => flowUp(r, env, st)) : unknown; }
      if (ts.isPropertyAccessExpression(L) && ['href', 'location', 'src'].includes(L.name.text)) return [{ at: n, methods: ['GET'] }];
      return unknown;
    }
    return []; // a comparison or arithmetic: not a request
  }
  if (ts.isTemplateSpan(p)) {
    // the URL continues as part of a longer one: the same path only when a query or hash follows
    const tpl = p.parent;
    const last = tpl.templateSpans[tpl.templateSpans.length - 1] === p;
    return /^[?#]/.test(p.literal.text) || (p.literal.text === '' && last) ? flowUp(tpl, env, st) : [];
  }
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const i = (p.arguments || []).indexOf(n);
    if (i < 0) return [];
    if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'URL' && i === 0) return flowUp(p, env, st);
    return [{ at: n, methods: methodAt(p, i, env, st) }];
  }
  if (ts.isVariableDeclaration(p) && p.initializer === n && ts.isIdentifier(p.name)) {
    const b = lookup(p.name, p.name.text);
    return b.kind === 'const' || b.kind === 'let' ? refsOf(b).flatMap((r) => flowUp(r, env, st)) : unknown;
  }
  if (ts.isParameter(p) && p.initializer === n && ts.isIdentifier(p.name)) {
    return refsOf({ kind: 'param', param: p, name: p.name.text }).flatMap((r) => flowUp(r, env, st));
  }
  if (ts.isBindingElement(p) && p.initializer === n && ts.isIdentifier(p.name) && p.parent && p.parent.parent && ts.isParameter(p.parent.parent)) {
    return refsOf({ kind: 'param', param: p.parent.parent, name: p.name.text }).flatMap((r) => flowUp(r, env, st));
  }
  if ((ts.isPropertyAssignment(p) && p.initializer === n) || (ts.isShorthandPropertyAssignment(p) && p.name === n)) {
    const o = p.parent;
    const v = o && ts.isObjectLiteralExpression(o) ? methodProp(o, env) : undefined;
    return v !== undefined ? [{ at: n, methods: v }] : unknown;
  }
  if (ts.isArrayLiteralExpression(p)) {
    const q = p.parent;
    if (q && ts.isPropertyAssignment(q) && q.name.getText() === 'queryKey' && p.elements[0] === n && ts.isObjectLiteralExpression(q.parent)
      && !q.parent.properties.some((x) => x.name && x.name.getText() === 'queryFn')) return [{ at: n, methods: ['GET'] }];
    if (q && (ts.isCallExpression(q) && q.arguments.indexOf(p) >= 1)) return []; // a hook's dependency list
    if (q && ts.isParameter(q)) return []; // a default dependency list
    return unknown;
  }
  if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) {
    const fn = ts.isReturnStatement(p) ? enclosingFn(p) : p;
    if (!fn) return [];
    const host = fn.parent;
    if (host && ts.isCallExpression(host) && host.arguments[0] === fn && isUseMemo(host.expression)) return flowUp(host, env, st);
    const sites = callSites(fn).filter((x) => ts.isCallExpression(x));
    return sites.length ? sites.flatMap((x) => flowUp(x, new Map(), st)) : unknown;
  }
  if (ts.isJsxExpression(p)) {
    const attr = p.parent;
    if (!attr || !ts.isJsxAttribute(attr)) return []; // rendered as text
    const tag = attr.parent.parent.tagName.getText();
    const an = attr.name.getText();
    if (/^[a-z]/.test(tag)) return /^(href|src)$/.test(an) ? [{ at: n, methods: ['GET'] }] : (an === 'action' ? unknown : []);
    const pb = propBinding(attr);
    if (!pb) return unknown;
    const refs = refsOf(pb.binding).map((r) => (!pb.member ? r
      : (ts.isPropertyAccessExpression(r.parent) && r.parent.expression === r && r.parent.name.text === pb.member ? r.parent : null))).filter(Boolean);
    return refs.flatMap((r) => flowUp(r, new Map(), st));
  }
  if (ts.isPropertyAccessExpression(p) && p.expression === n) {
    if (p.name.text === 'toString' && p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) return flowUp(p.parent, env, st);
    if (p.name.text === 'href') return flowUp(p, env, st);
    return [];
  }
  if (ts.isExpressionStatement(p) || ts.isIfStatement(p) || ts.isPrefixUnaryExpression(p) || ts.isTypeOfExpression(p)
    || ts.isElementAccessExpression(p) || ts.isSwitchStatement(p) || ts.isCaseClause(p) || ts.isWhileStatement(p)
    || ts.isForStatement(p) || ts.isThrowStatement(p)) return [];
  return unknown;
}
function sinksOf(root) {
  const st = { depth: 0, path: new Set(), inFn: new Set() };
  const seen = new Map();
  for (const s of flowUp(root, new Map(), st)) {
    const sf = s.at.getSourceFile();
    const o = { file: sf.fileName, line: sf.getLineAndCharacterOfPosition(s.at.getStart(sf)).line + 1, methods: s.methods ? [...s.methods].sort() : null };
    seen.set(`${o.file}:${o.line}:${o.methods}`, o);
  }
  return [...seen.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}

// ── roots: a template with substitutions, or a maximal `+` chain, holding a path piece ───────────
const isPlus = (n) => !!n && ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken;
function isRoot(n) {
  if (!(ts.isTemplateExpression(n) || isPlus(n))) return false;
  let p = n.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p))) p = p.parent;
  if (isPlus(p)) return false;
  if (ts.isTemplateExpression(n) && p && ts.isTemplateSpan(p)) return false;
  return true;
}
function hasPathPiece(n) {
  let found = false;
  const walk = (x) => {
    if (found) return;
    if ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) && x.text.includes('/')) found = true;
    else if (ts.isTemplateExpression(x) && (x.head.text.includes('/') || x.templateSpans.some((s) => s.literal.text.includes('/')))) found = true;
    else ts.forEachChild(x, walk);
  };
  walk(n);
  return found;
}
// (second correction) A URL made only of substitutions, `${calc.base ?? BASE}${calc.path}`: a
// template with no literal text, or a `+` chain of names and property reads.
function onlySubstitutions(n) {
  if (ts.isTemplateExpression(n)) return n.head.text === '' && n.templateSpans.every((s) => s.literal.text === '');
  const leaves = [];
  const walk = (x) => { x = strip(x); if (isPlus(x)) { walk(x.left); walk(x.right); } else leaves.push(x); };
  walk(n);
  return leaves.every((x) => ts.isIdentifier(x) || accessed(x) !== null);
}
// The parameters a root reads a property of (`calc.path`), not counting nested functions.
function objectParams(root) {
  const found = new Map();
  const walk = (x) => {
    if (ts.isFunctionLike(x)) return;
    if (accessed(x) !== null) {
      const o = strip(x.expression);
      if (o && ts.isIdentifier(o)) {
        const b = lookup(o, o.text);
        if (b.kind === 'param') found.set(b.param.pos + '|' + b.name, b);
      }
    }
    ts.forEachChild(x, walk);
  };
  walk(root);
  return [...found.values()];
}
// Evaluate the root once per combination of objects its parameters can hold (second correction).
function fanOut(root, vals, ctx) {
  const sets = objectParams(root).map((b) => [b, objsOfParam(b, 0)]).filter(([, o]) => o && o.length);
  if (!sets.length) return vals;
  let combos = [[]];
  for (const [b, os] of sets) {
    const next = [];
    for (const c of combos) for (const o of os) if (next.length < MAX_OBJ) next.push([...c, [b, o]]);
    combos = next;
  }
  const out = [...vals];
  for (const c of combos) {
    const objEnv = new Map();
    for (const [b, o] of c) { if (!objEnv.has(b.param)) objEnv.set(b.param, new Map()); objEnv.get(b.param).set(b.name, o); }
    const c2 = { depth: 0, stack: new Set(), used: new Set(), objEnv };
    for (const v of ev(root, new Map(), c2)) if (!out.includes(v) && out.length < 4096) out.push(v);
    for (const u of c2.used) ctx.used.add(u);
  }
  return out;
}

const out = [];
for (const f of files) {
  const m = mod(f);
  const walk = (n) => {
    if (isRoot(n) && (hasPathPiece(n) || onlySubstitutions(n))) {
      const ctx = { depth: 0, stack: new Set(), used: new Set() };
      const vals = fanOut(n, ev(n, new Map(), ctx), ctx).filter((s) => s.includes('/api/'));
      if (vals.length) {
        const via = ctx.used.size ? 'path-constant' : (isPlus(n) ? 'concatenation' : 'template');
        const line = m.sf.getLineAndCharacterOfPosition(n.getStart(m.sf)).line + 1;
        const sinks = sinksOf(n);
        for (const s of vals) out.push({ s, file: f, line, via, how: [...ctx.used].sort(), sinks });
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(m.sf);
}
fs.writeFileSync(path.join(S, 'resolved-patterns.json'), JSON.stringify(out));
const by = {};
for (const o of out) by[o.via] = (by[o.via] || 0) + 1;
const known = out.filter((o) => o.sinks.some((k) => k.methods)).length;
console.info('files', files.length, 'URL expressions naming /api/', out.length, by, 'with a known HTTP method', known);
