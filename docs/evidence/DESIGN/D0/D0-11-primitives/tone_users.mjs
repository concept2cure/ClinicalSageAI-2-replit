// Every element that can carry a bare tone class (tone-ok|ai|warn|idle|dim|err), with the other
// classes it carries. Run from the repository root: node tone_users.mjs
// (A) a JSX className whose expression holds a tone literal, a `tone-${…}` template, or reads a
//     name containing "tone" (a tone map or a `.tone` field);
// (B) any other string literal that holds a tone token beside another class token.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
const ts = createRequire(join(process.cwd(), 'package.json'))('typescript');

const ROOT = process.cwd();
const SRC = join(ROOT, 'client/src');
const TONE = /^tone-(ok|ai|warn|idle|dim|err)$/;

function files(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === '__tests__' || n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx|ts|jsx)$/.test(n) && !/\.test\./.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const rows = [];
for (const f of files(SRC)) {
  const text = readFileSync(f, 'utf8');
  if (!/tone/i.test(text)) continue;
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(ROOT, f);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const inClassAttr = new Set();

  const fragments = (node) => {
    const frags = [];
    let toneTemplate = false;
    let toneRef = false;
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { frags.push(n.text); if (/(^|\s)tone-$/.test(n.text)) toneTemplate = true; }
      else if (ts.isTemplateExpression(n)) {
        frags.push(n.head.text);
        if (/(^|\s)tone-$/.test(n.head.text)) toneTemplate = true;
        for (const span of n.templateSpans) {
          if (/(^|[^s])tone/i.test(span.expression.getText(sf))) toneRef = true;
          visit(span.expression);
          frags.push(span.literal.text);
          if (/(^|\s)tone-$/.test(span.literal.text)) toneTemplate = true;
        }
        return;
      } else if (ts.isIdentifier(n) && /(^|[^s])tone/i.test(n.text)) toneRef = true;
      ts.forEachChild(n, visit);
    };
    visit(node);
    const tokens = frags.join(' ').split(/\s+/).filter(Boolean);
    return { tokens, toneTemplate, toneRef };
  };

  const visit = (n) => {
    if (ts.isJsxAttribute(n) && ['className', 'class'].includes(n.name.getText(sf)) && n.initializer) {
      const { tokens, toneTemplate, toneRef } = fragments(n.initializer);
      const tones = tokens.filter((t) => TONE.test(t));
      if (tones.length || toneTemplate || toneRef) {
        const base = [...new Set(tokens.filter((t) => !TONE.test(t) && !/^tone-$/.test(t) && /^[a-z][\w-]*$/i.test(t)))];
        rows.push({ kind: 'A', file: rel, line: line(n), base, tones: [...new Set(tones)], toneTemplate, toneRef, src: n.initializer.getText(sf).replace(/\s+/g, ' ').slice(0, 160) });
      }
      // mark its literals so (B) does not count them twice
      const mark = (m) => { inClassAttr.add(m.pos); ts.forEachChild(m, mark); };
      mark(n.initializer);
      return;
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !inClassAttr.has(n.pos)) {
      const tokens = n.text.split(/\s+/).filter(Boolean);
      const tones = tokens.filter((t) => TONE.test(t));
      const others = tokens.filter((t) => !TONE.test(t));
      if (tones.length && others.length && others.every((t) => /^[a-z][\w-]*$/.test(t))) {
        rows.push({ kind: 'B', file: rel, line: line(n), base: others, tones, toneTemplate: false, toneRef: false, src: JSON.stringify(n.text) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const json = process.argv.includes('--json');
if (json) console.info(JSON.stringify(rows, null, 1));
else for (const r of rows) console.info(`${r.kind} ${r.file}:${r.line}\t[${r.base.join(' ')}]\t${r.tones.join(',')}${r.toneTemplate ? ' tone-${…}' : ''}${r.toneRef ? ' (reads a tone name)' : ''}\t${r.src}`);
