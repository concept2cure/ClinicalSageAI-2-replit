// AST-accurate extraction of '/api/...' URL expressions from client code.
// Output TSV: normPath \t method \t file \t line
const ts = require('<repo>/node_modules/typescript');
const fs = require('fs');
const path = require('path');
const ROOT = '<repo>';
const BASE = path.join(ROOT, 'client/src/concept2cure');

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p);
  }
  return out;
}

// Render an expression to a URL pattern: literals verbatim, anything else ':p'.
let CONSTS = new Map();
function render(node) {
  if (ts.isIdentifier(node) && CONSTS.has(node.text)) return CONSTS.get(node.text);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) s += (ts.isIdentifier(span.expression) && CONSTS.has(span.expression.text) ? CONSTS.get(span.expression.text) : ':p') + span.literal.text;
    return s;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return render(node.left) + render(node.right);
  }
  if (ts.isParenthesizedExpression(node)) return render(node.expression);
  if (ts.isConditionalExpression(node)) {
    const a = render(node.whenTrue);
    return a.includes('/api/') ? a : render(node.whenFalse);
  }
  return ':p';
}

const rows = [];
for (const f of walk(BASE, [])) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const seen = new Set();
  CONSTS = new Map();
  (function collect(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const r = render(n.initializer);
      if (r.includes('/api/')) CONSTS.set(n.name.text, r.slice(r.indexOf('/api/')).split('?')[0]);
    }
    ts.forEachChild(n, collect);
  })(sf);
  function visit(node) {
    const isStr = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
    if (isStr) {
      const txt = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map(s => s.literal.text).join('') : node.text;
      const usesConst = ts.isTemplateExpression(node) && node.templateSpans.some(sp => ts.isIdentifier(sp.expression) && CONSTS.has(sp.expression.text));
      if (txt.includes('/api/') || usesConst) {
        // climb to the outermost '+' chain containing this literal
        let top = node;
        while (top.parent && ((ts.isBinaryExpression(top.parent) && top.parent.operatorToken.kind === ts.SyntaxKind.PlusToken) || ts.isParenthesizedExpression(top.parent))) top = top.parent;
        if (!seen.has(top.pos)) {
          seen.add(top.pos);
          let url = render(top);
          const i = url.indexOf('/api/');
          if (i < 0) { ts.forEachChild(node, visit); return; }
          url = url.slice(i).split('?')[0].split('#')[0].split(/\s/)[0];
          // method: nearest enclosing call's string-literal arg that is an HTTP verb, or {method:'X'}
          let meth = '';
          let p = top.parent;
          for (let depth = 0; p && depth < 4 && !meth; depth++, p = p.parent) {
            if (ts.isCallExpression(p)) {
              for (const a of p.arguments) {
                if (ts.isStringLiteral(a) && /^(GET|POST|PUT|PATCH|DELETE)$/.test(a.text)) meth = a.text;
                if (ts.isObjectLiteralExpression(a)) for (const pr of a.properties) {
                  if (ts.isPropertyAssignment(pr) && pr.name.getText() === 'method' && ts.isStringLiteral(pr.initializer)) meth = pr.initializer.text.toUpperCase();
                }
              }
            }
          }
          const line = sf.getLineAndCharacterOfPosition(top.getStart()).line + 1;
          rows.push([url, meth, path.relative(ROOT, f), line].join('\t'));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
fs.writeFileSync(path.join(__dirname, 'client_calls_ast.tsv'), rows.join('\n') + '\n');
console.log('client url expressions:', rows.length);
