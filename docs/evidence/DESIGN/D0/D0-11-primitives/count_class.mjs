// Count uses of a class name exactly as foundationsRetiredRatchet.test.ts counts them: every
// client/src/**/*.tsx outside __tests__, string literals + template text + JSX text, whole class token.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const ts = createRequire(join(process.cwd(), 'package.json'))('typescript');
const name = process.argv[2];
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { if (n === '__tests__' || n === 'node_modules') continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.tsx')) files.push(p); } })(join(process.cwd(), 'client/src'));
const re = new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g');
let total = 0; const per = {};
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  let n = 0;
  const v = (node) => { if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) n += node.text.match(re)?.length ?? 0; ts.forEachChild(node, v); };
  v(sf);
  if (n) { per[f.replace(process.cwd() + '/', '')] = n; total += n; }
}
console.info(`${name}: ${total} uses in ${Object.keys(per).length} files`);
for (const [f, n] of Object.entries(per).sort()) console.info(`  ${n}\t${f}`);
