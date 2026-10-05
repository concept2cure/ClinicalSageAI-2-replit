// For every tracked JS/TS file: which characters does the TypeScript parser say are
// code (not comment, not whitespace), and does the given stripper blank any of them?
// Usage, from the repository root:
//   node docs/evidence/D6/2026-10-05-ci-and-gates/measure-stripper-vs-typescript.mjs <path-to-strip-comments.mjs>
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = process.cwd();
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');
const lib = process.argv[2];
const { stripComments } = await import(pathToFileURL(path.resolve(lib)).href);
const files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n')
  .filter((f) => /\.(m|c)?[jt]sx?$/.test(f) && !f.includes('node_modules'));
let bad = 0, scanned = 0; const hits = [];
for (const f of files) {
  let src; try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (src.length > 2_000_000) continue;
  scanned++;
  const isComment = new Uint8Array(src.length);
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, /x$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // Mark comments: every token's leading and trailing comment trivia, from the
  // parser's full token tree (getChildren includes punctuation tokens, so a
  // comment inside an empty block is the leading trivia of its '}').
  const markAt = (pos) => {
    for (const r of [...(ts.getLeadingCommentRanges(src, pos) || []), ...(ts.getTrailingCommentRanges(src, pos) || [])])
      for (let k = r.pos; k < r.end; k++) isComment[k] = 1;
  };
  const walk = (n) => { markAt(n.pos); markAt(n.end); for (const c of n.getChildren(sf)) walk(c); };
  walk(sf);
  markAt(sf.endOfFileToken.pos);
  const out = stripComments(src);
  const lines = new Set();
  for (let k = 0; k < src.length; k++) {
    if (isComment[k] || /\s/.test(src[k])) continue;
    if (out[k] !== src[k]) lines.add(src.slice(0, k).split('\n').length);
  }
  if (lines.size) { bad += lines.size; hits.push(`${f}: ${[...lines].slice(0, 6).join(',')}${lines.size > 6 ? '…' : ''} (${lines.size})`); }
}
console.info(JSON.stringify({ scanned, linesWithCodeBlanked: bad, files: hits.length }));
for (const h of hits.slice(0, 25)) console.info('  ' + h);
